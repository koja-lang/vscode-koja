import { commands, window, workspace, ExtensionContext } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from "vscode-languageclient/node";
import { existsSync } from "fs";
import { dirname, join } from "path";

let client: LanguageClient | undefined;

function getKojaBinary(): string {
  const config = workspace.getConfiguration("koja");
  return config.get<string>("path", "") || "koja";
}

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

function runKojaCommand(subcommand: string) {
  const editor = window.activeTextEditor;
  if (!editor) {
    window.showErrorMessage("No active file to run.");
    return;
  }

  const doc = editor.document;
  if (doc.languageId !== "koja") {
    window.showErrorMessage("Active file is not an Koja file.");
    return;
  }

  if (doc.isUntitled) {
    window.showErrorMessage("Save the file before running.");
    return;
  }

  doc.save().then(() => {
    const binary = getKojaBinary();
    const filePath = doc.uri.fsPath;
    const terminal =
      window.terminals.find((t) => t.name === "Koja") ||
      window.createTerminal("Koja");
    terminal.show();

    // `.kojs` scripts run directly. `.koja` files are compilation units
    // of a project, so run the project (nearest `koja.toml`) instead.
    if (filePath.endsWith(".kojs")) {
      terminal.sendText(`${binary} ${subcommand} "${filePath}"`);
      return;
    }

    const projectDir = findProjectRoot(filePath);
    if (projectDir) {
      terminal.sendText(`cd "${projectDir}" && ${binary} ${subcommand}`);
    } else {
      window.showErrorMessage(
        "No koja.toml found. `.koja` files run as part of a project; use a `.kojs` script for standalone files.",
      );
    }
  });
}

function findProjectRoot(filePath: string): string | undefined {
  let dir = dirname(filePath);
  for (;;) {
    if (existsSync(join(dir, "koja.toml"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

export function activate(context: ExtensionContext) {
  client = createClient();
  client.start();

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
  );
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
