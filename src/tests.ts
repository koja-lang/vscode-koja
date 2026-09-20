import { ChildProcess, spawn } from "child_process";
import { basename, join, relative, sep } from "path";
import {
  CancellationToken,
  ExtensionContext,
  Location,
  Position,
  Range,
  TestController,
  TestItem,
  TestMessage,
  TestRun,
  TestRunProfileKind,
  TestRunRequest,
  TextDocument,
  Uri,
  tests,
  workspace,
} from "vscode";
import {
  findProjectRoot,
  findProjectSources,
  findWorkspaceProjects,
  kojaBinary,
} from "./project";

/**
 * A `test "description"` line. The description is a plain string
 * literal, so the only escape to respect is a backslash pair.
 */
const TEST_LINE = /^\s*test\s+"((?:[^"\\]|\\.)*)"/;

/** Milliseconds to wait after the last keystroke before reparsing. */
const REPARSE_DELAY = 300;

/** One JSON line from `koja test --reporter json`. */
interface Event {
  event: "started" | "spec_started" | "spec_finished" | "finished";
  id?: string;
  group?: string;
  description?: string;
  outcome?: "passed" | "failed" | "skipped" | "crashed" | "timed_out";
  microseconds?: number;
  reason?: string;
  failure?: Failure;
  total?: number;
  passed?: number;
  failed?: number;
  skipped?: number;
  crashed?: number;
  timed_out?: number;
}

interface Failure {
  kind: "assertion" | "error" | "skipped";
  message: string | null;
  expression?: string;
  file?: string;
  line?: number;
  column?: number;
  source_line?: string;
  left?: string | null;
  right?: string | null;
}

/**
 * Test Explorer for Koja projects.
 *
 * The tree is project, then file, then test. Tests are found by scanning
 * source text for `test "..."` lines, so the tree does not depend on the
 * language server. A run executes `koja test --reporter json` for the
 * whole project, since the CLI has no per-test filter yet, and maps each
 * `file:line` spec id back to its item.
 */
export class KojaTests {
  private readonly controller: TestController;
  private readonly reparseTimers = new Map<string, NodeJS.Timeout>();

  constructor(context: ExtensionContext) {
    this.controller = tests.createTestController("koja", "Koja");
    context.subscriptions.push(this.controller);

    this.controller.resolveHandler = async (item) => {
      if (!item) {
        await this.discoverAll();
      }
    };
    this.controller.refreshHandler = () => this.discoverAll();
    this.controller.createRunProfile(
      "Run",
      TestRunProfileKind.Run,
      (request, token) => this.run(request, token),
      true,
    );

    context.subscriptions.push(
      workspace.onDidChangeTextDocument((event) => {
        if (event.document.languageId === "koja") {
          this.scheduleReparse(event.document);
        }
      }),
      workspace.onDidSaveTextDocument((document) => {
        if (document.languageId === "koja") {
          this.parseDocument(document);
        }
      }),
      workspace.onDidChangeWorkspaceFolders(() => this.discoverAll()),
    );

    const sources = workspace.createFileSystemWatcher("**/*.koja");
    context.subscriptions.push(
      sources,
      sources.onDidCreate((uri) => this.parseFile(uri)),
      sources.onDidChange((uri) => {
        // Open documents are reparsed from the buffer on change.
        if (!this.openDocument(uri)) {
          this.parseFile(uri);
        }
      }),
      sources.onDidDelete((uri) => this.removeFile(uri)),
    );

    const manifests = workspace.createFileSystemWatcher("**/koja.toml");
    context.subscriptions.push(
      manifests,
      manifests.onDidCreate(() => this.discoverAll()),
      manifests.onDidDelete(() => this.discoverAll()),
    );

    void this.discoverAll();
  }

  // Discovery.

  private async discoverAll(): Promise<void> {
    const roots = await findWorkspaceProjects();
    const keep = new Set(roots);
    for (const [id] of this.controller.items) {
      if (!keep.has(id)) {
        this.controller.items.delete(id);
      }
    }

    for (const root of roots) {
      const project = this.projectItem(root);
      const files = await findProjectSources(root);
      const seen = new Set<string>();
      for (const uri of files) {
        const document = this.openDocument(uri);
        const text = document
          ? document.getText()
          : new TextDecoder().decode(await workspace.fs.readFile(uri));
        const file = this.parseText(project, uri, text);
        if (file) {
          seen.add(file.id);
        }
      }
      for (const [id] of project.children) {
        if (!seen.has(id)) {
          project.children.delete(id);
        }
      }
    }
  }

  private scheduleReparse(document: TextDocument): void {
    const key = document.uri.toString();
    const pending = this.reparseTimers.get(key);
    if (pending) {
      clearTimeout(pending);
    }
    this.reparseTimers.set(
      key,
      setTimeout(() => {
        this.reparseTimers.delete(key);
        this.parseDocument(document);
      }, REPARSE_DELAY),
    );
  }

  private parseDocument(document: TextDocument): void {
    const project = this.projectFor(document.uri);
    if (project) {
      this.parseText(project, document.uri, document.getText());
    }
  }

  private async parseFile(uri: Uri): Promise<void> {
    const project = this.projectFor(uri);
    if (!project) {
      return;
    }
    let text: string;
    try {
      text = new TextDecoder().decode(await workspace.fs.readFile(uri));
    } catch {
      this.removeFile(uri);
      return;
    }
    this.parseText(project, uri, text);
  }

  /**
   * Rebuilds the file item for `uri` from `text`. Returns the file item,
   * or `undefined` when the file has no tests and was removed.
   */
  private parseText(
    project: TestItem,
    uri: Uri,
    text: string,
  ): TestItem | undefined {
    const path = relativePath(project.id, uri.fsPath);
    const found: TestItem[] = [];

    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      const match = TEST_LINE.exec(lines[index]);
      if (!match) {
        continue;
      }
      const line = index + 1;
      const item = this.controller.createTestItem(
        `${path}:${line}`,
        match[1],
        uri,
      );
      item.range = new Range(
        new Position(index, 0),
        new Position(index, lines[index].length),
      );
      found.push(item);
    }

    if (found.length === 0) {
      project.children.delete(path);
      return undefined;
    }

    let file = project.children.get(path);
    if (!file) {
      file = this.controller.createTestItem(path, path, uri);
      project.children.add(file);
    }
    file.children.replace(found);
    return file;
  }

  private removeFile(uri: Uri): void {
    const project = this.projectFor(uri);
    if (project) {
      project.children.delete(relativePath(project.id, uri.fsPath));
    }
  }

  private projectItem(root: string): TestItem {
    let item = this.controller.items.get(root);
    if (!item) {
      item = this.controller.createTestItem(
        root,
        basename(root),
        Uri.file(join(root, "koja.toml")),
      );
      item.canResolveChildren = false;
      this.controller.items.add(item);
    }
    return item;
  }

  /**
   * The project item that compiles `uri`, which means a `koja.toml` above
   * it and the file under that project's `src/` or `test/`.
   */
  private projectFor(uri: Uri): TestItem | undefined {
    const root = findProjectRoot(uri.fsPath);
    if (!root) {
      return undefined;
    }
    const head = relativePath(root, uri.fsPath).split("/")[0];
    if (head !== "src" && head !== "test") {
      return undefined;
    }
    return this.projectItem(root);
  }

  private openDocument(uri: Uri): TextDocument | undefined {
    const key = uri.toString();
    return workspace.textDocuments.find((d) => d.uri.toString() === key);
  }

  // Running.

  private async run(
    request: TestRunRequest,
    token: CancellationToken,
  ): Promise<void> {
    const projects = this.projectsToRun(request);
    const run = this.controller.createTestRun(request);
    try {
      for (const project of projects) {
        if (token.isCancellationRequested) {
          break;
        }
        await this.runProject(project, run, token);
      }
    } finally {
      run.end();
    }
  }

  /**
   * The CLI runs a whole project, so any selection widens to the
   * projects that own the selected items.
   */
  private projectsToRun(request: TestRunRequest): TestItem[] {
    if (!request.include) {
      const all: TestItem[] = [];
      this.controller.items.forEach((item) => all.push(item));
      return all;
    }
    const roots = new Map<string, TestItem>();
    for (const item of request.include) {
      let top = item;
      while (top.parent) {
        top = top.parent;
      }
      roots.set(top.id, top);
    }
    return [...roots.values()];
  }

  private runProject(
    project: TestItem,
    run: TestRun,
    token: CancellationToken,
  ): Promise<void> {
    const root = project.id;
    const relativeRoot = this.relativeRoot(root);
    forEachTest(project, (item) => run.enqueued(item));
    run.appendOutput(`$ koja test -S ${relativeRoot} --reporter json\r\n`);

    return new Promise((resolve) => {
      let child: ChildProcess;
      try {
        child = spawn(
          kojaBinary(),
          ["test", "-S", root, "--reporter", "json"],
          {
            cwd: root,
            env: { ...process.env, NO_COLOR: "1" },
          },
        );
      } catch (error) {
        this.failProject(project, run, String(error));
        resolve();
        return;
      }

      const cancel = token.onCancellationRequested(() => child.kill());
      const started = new Set<TestItem>();
      const noise: string[] = [];
      let finished = false;
      let pending = "";

      child.stdout?.on("data", (chunk: Buffer) => {
        run.appendOutput(chunk.toString().replace(/\r?\n/g, "\r\n"));
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        pending += chunk.toString();
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const line of lines) {
          const event = parseEvent(line);
          if (!event) {
            noise.push(line);
            run.appendOutput(`${line}\r\n`);
            continue;
          }
          if (event.event === "finished") {
            finished = true;
          }
          this.handleEvent(project, run, event, started);
        }
      });

      child.on("error", (error) => {
        this.failProject(
          project,
          run,
          `could not start ${kojaBinary()}: ${error.message}`,
        );
      });

      child.on("close", (code) => {
        cancel.dispose();
        if (pending.trim().length > 0) {
          const event = parseEvent(pending);
          if (event) {
            this.handleEvent(project, run, event, started);
          } else {
            noise.push(pending);
            run.appendOutput(`${pending}\r\n`);
          }
        }
        if (!finished && !token.isCancellationRequested) {
          // The run never reached the reporter, so the project did not
          // compile. Show the compiler output on every test.
          const message =
            noise.join("\n").trim() || `koja test exited with ${code}`;
          this.failProject(project, run, message);
        }
        resolve();
      });
    });
  }

  private handleEvent(
    project: TestItem,
    run: TestRun,
    event: Event,
    started: Set<TestItem>,
  ): void {
    switch (event.event) {
      case "started":
        run.appendOutput(`Running ${event.total} tests\r\n`);
        return;

      case "spec_started": {
        const item = this.itemFor(project, event.id ?? "", event.description);
        if (item) {
          started.add(item);
          run.started(item);
        }
        return;
      }

      case "spec_finished": {
        const item = this.itemFor(project, event.id ?? "");
        if (!item) {
          return;
        }
        started.delete(item);
        const duration =
          event.microseconds === undefined
            ? undefined
            : event.microseconds / 1000;
        switch (event.outcome) {
          case "passed":
            run.passed(item, duration);
            return;
          case "skipped":
            run.appendOutput(`${event.id}: skipped: ${event.reason ?? ""}\r\n`);
            run.skipped(item);
            return;
          case "failed":
            run.failed(
              item,
              failureMessage(project.id, event.failure),
              duration,
            );
            return;
          case "crashed":
            run.errored(
              item,
              new TestMessage(`crashed: ${event.reason ?? "unknown reason"}`),
              duration,
            );
            return;
          case "timed_out":
            run.errored(
              item,
              new TestMessage(
                `timed out after ${Math.round((event.microseconds ?? 0) / 1000)} ms`,
              ),
              duration,
            );
            return;
        }
        return;
      }

      case "finished":
        run.appendOutput(
          `${event.passed} passed, ${event.failed} failed, ` +
            `${event.crashed} crashed, ${event.timed_out} timed out, ` +
            `${event.skipped} skipped\r\n`,
        );
        return;
    }
  }

  /**
   * The item for a `file:line` spec id, created under its file when the
   * tree has not caught up with the source yet.
   */
  private itemFor(
    project: TestItem,
    id: string,
    description?: string,
  ): TestItem | undefined {
    const separator = id.lastIndexOf(":");
    if (separator < 0) {
      return undefined;
    }
    const path = id.slice(0, separator);
    const line = Number(id.slice(separator + 1));

    let file = project.children.get(path);
    if (!file) {
      if (description === undefined) {
        return undefined;
      }
      const uri = Uri.file(join(project.id, path));
      file = this.controller.createTestItem(path, path, uri);
      project.children.add(file);
    }

    let item = file.children.get(id);
    if (!item && description !== undefined) {
      item = this.controller.createTestItem(id, description, file.uri);
      item.range = new Range(
        new Position(line - 1, 0),
        new Position(line - 1, 0),
      );
      file.children.add(item);
    }
    return item;
  }

  private failProject(project: TestItem, run: TestRun, message: string): void {
    const text = new TestMessage(message);
    forEachTest(project, (item) => run.errored(item, text));
  }

  private relativeRoot(root: string): string {
    const folder = workspace.getWorkspaceFolder(Uri.file(root));
    if (!folder) {
      return root;
    }
    return relative(folder.uri.fsPath, root) || ".";
  }
}

/** Calls `visit` on every leaf test under `item`. */
function forEachTest(item: TestItem, visit: (test: TestItem) => void): void {
  if (item.children.size === 0 && item.parent?.parent) {
    visit(item);
    return;
  }
  item.children.forEach((child) => forEachTest(child, visit));
}

function parseEvent(line: string): Event | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{"event"')) {
    return undefined;
  }
  try {
    const value = JSON.parse(trimmed);
    return typeof value.event === "string" ? (value as Event) : undefined;
  } catch {
    return undefined;
  }
}

function failureMessage(
  root: string,
  failure: Failure | undefined,
): TestMessage {
  if (!failure) {
    return new TestMessage("failed");
  }
  if (failure.kind !== "assertion") {
    return new TestMessage(failure.message ?? "failed");
  }

  const lines = [`assert ${failure.expression ?? ""}`];
  if (failure.message) {
    lines.push(failure.message);
  }

  let message: TestMessage;
  if (failure.left != null && failure.right != null) {
    // `assert left == right` reads as actual on the left and expected
    // on the right, which is the order the diff view wants.
    message = TestMessage.diff(lines.join("\n"), failure.right, failure.left);
  } else {
    if (failure.left != null) {
      lines.push(`left: ${failure.left}`);
    }
    if (failure.right != null) {
      lines.push(`right: ${failure.right}`);
    }
    message = new TestMessage(lines.join("\n"));
  }

  if (failure.file && failure.line) {
    message.location = new Location(
      Uri.file(join(root, failure.file)),
      new Position(failure.line - 1, Math.max(0, (failure.column ?? 1) - 1)),
    );
  }
  return message;
}

/** `fsPath` relative to `root` with forward slashes, the spec id form. */
function relativePath(root: string, fsPath: string): string {
  return relative(root, fsPath).split(sep).join("/");
}
