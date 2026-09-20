import { commands, window, workspace, ExtensionContext } from "vscode";
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

export function activate(context: ExtensionContext) {
  client = createClient();
  client.start();

  new KojaTests(context);

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
  );
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
