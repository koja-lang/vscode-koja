import { existsSync } from "fs";
import { dirname, join } from "path";
import { RelativePattern, Uri, workspace } from "vscode";

/** The `koja` CLI binary from the `koja.path` setting, or `koja` on `$PATH`. */
export function kojaBinary(): string {
  const config = workspace.getConfiguration("koja");
  return config.get<string>("path", "") || "koja";
}

/**
 * The nearest directory at or above `filePath` that holds a `koja.toml`,
 * or `undefined` when the file is not inside a project.
 */
export function findProjectRoot(filePath: string): string | undefined {
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

/**
 * Every project root in the open workspace folders, found by `koja.toml`.
 * Dependency checkouts under `deps/` and build output are skipped.
 */
export async function findWorkspaceProjects(): Promise<string[]> {
  const folders = workspace.workspaceFolders ?? [];
  const roots = new Set<string>();
  for (const folder of folders) {
    const manifests = await workspace.findFiles(
      new RelativePattern(folder, "**/koja.toml"),
      "**/{deps,build,node_modules,.git}/**",
    );
    for (const manifest of manifests) {
      roots.add(dirname(manifest.fsPath));
    }
  }
  return [...roots].sort();
}

/**
 * The `.koja` files `koja test` compiles for the project at `root`, which
 * are the ones under `src/` and `test/`.
 */
export async function findProjectSources(root: string): Promise<Uri[]> {
  const files = await workspace.findFiles(
    new RelativePattern(root, "{src,test}/**/*.koja"),
  );
  return files.sort((a, b) => a.fsPath.localeCompare(b.fsPath));
}
