import { join } from "path";
import { commands, window, workspace, ExtensionContext, Uri } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from "vscode-languageclient/node";
import { findProjectRoot, findWorkspaceProjects, kojaBinary } from "./project";
import { KojaTests } from "./tests";

let client: LanguageClient | undefined;

function createClient(): LanguageClient {
  const config = workspace.getConfiguration("koja.lsp");
  const configPath = config.get<string>("path", "");
  const command = configPath || "koja-lsp";

  const serverOptions: ServerOptions = {
    command,
    args: [],
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "koja" }],
  };

  return new LanguageClient(
    "koja-lsp",
    "Koja Language Server",
    serverOptions,
    clientOptions,
  );
}

function kojaTerminal() {
  const terminal =
    window.terminals.find((t) => t.name === "Koja") ||
    window.createTerminal("Koja");
  terminal.show();
  return terminal;
}

function runKojaCommand(subcommand: string) {
  const editor = window.activeTextEditor;
  if (!editor) {
    window.showErrorMessage("No active file to run.");
    return;
  }

  const doc = editor.document;
  if (doc.languageId !== "koja") {
    window.showErrorMessage("Active file is not a Koja file.");
    return;
  }

  if (doc.isUntitled) {
    window.showErrorMessage("Save the file before running.");
    return;
  }

  doc.save().then(() => {
    const binary = kojaBinary();
    const filePath = doc.uri.fsPath;
    const terminal = kojaTerminal();

    // `.kojs` scripts run directly. `.koja` files are compilation units
    // of a project, so run the project (nearest `koja.toml`) instead.
    if (filePath.endsWith(".kojs")) {
      terminal.sendText(`${binary} ${subcommand} "${filePath}"`);
      return;
    }

    const projectDir = findProjectRoot(filePath);
    if (projectDir) {
      terminal.sendText(`${binary} ${subcommand} -S "${projectDir}"`);
    } else {
      window.showErrorMessage(
        "No koja.toml found. `.koja` files run as part of a project; use a `.kojs` script for standalone files.",
      );
    }
  });
}

/**
 * `koja test` for the project of the active file, or for the only
 * project in the workspace when no file points at one.
 */
async function testProject() {
  const active = window.activeTextEditor?.document;
  let projectDir =
    active && !active.isUntitled
      ? findProjectRoot(active.uri.fsPath)
      : undefined;

  if (!projectDir) {
    const projects = await findWorkspaceProjects();
    if (projects.length === 1) {
      projectDir = projects[0];
    } else if (projects.length === 0) {
      window.showErrorMessage("No koja.toml found in the workspace.");
      return;
    } else {
      window.showErrorMessage(
        "Open a file inside the project to test, or run tests from the Testing view.",
      );
      return;
    }
  }

  await workspace.saveAll();
  kojaTerminal().sendText(`${kojaBinary()} test -S "${projectDir}"`);
}

/**
 * The run-test code lens from `koja-lsp`. `id` is the `file:line` spec
 * id relative to `root`. `koja test` reads the file from disk, so a
 * dirty buffer is saved first or the line would point at the wrong
 * test.
 */
async function runTest(tests: KojaTests, root: string, id: string) {
  const path = id.slice(0, id.lastIndexOf(":"));
  const uri = Uri.file(join(root, path));
  const document = workspace.textDocuments.find(
    (d) => d.uri.toString() === uri.toString(),
  );
  if (document?.isDirty) {
    await document.save();
  }
  tests.runTest(root, id);
}

export function activate(context: ExtensionContext) {
  client = createClient();
  client.start();

  const tests = new KojaTests(context);

  context.subscriptions.push(
    commands.registerCommand("koja.restartServer", async () => {
      if (client) {
        try {
          await client.stop();
        } catch {
          // Client may be in startFailed state, safe to ignore
        }
        client.dispose();
      }
      client = createClient();
      await client.start();
    }),

    commands.registerCommand("koja.runFile", () => {
      runKojaCommand("run");
    }),

    commands.registerCommand("koja.buildFile", () => {
      runKojaCommand("build");
    }),

    commands.registerCommand("koja.testProject", () => testProject()),

    commands.registerCommand("koja.runTest", (root: string, id: string) =>
      runTest(tests, root, id),
    ),
  );
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
