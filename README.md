# Koja for VS Code

[![CI](https://github.com/koja-lang/vscode-koja/actions/workflows/ci.yml/badge.svg)](https://github.com/koja-lang/vscode-koja/actions/workflows/ci.yml)
[![GitHub Release](https://img.shields.io/github/v/release/koja-lang/vscode-koja)](https://github.com/koja-lang/vscode-koja/releases)
[![Last Updated](https://img.shields.io/github/last-commit/koja-lang/vscode-koja.svg)](https://github.com/koja-lang/vscode-koja/commits/main)

A [VS Code](https://code.visualstudio.com) extension for the [Koja programming language](https://github.com/koja-lang/koja). Works in VS Code and compatible editors (Cursor, VSCodium, Windsurf).

## Getting started

**1. Install the language server.** The extension looks up `koja` and `koja-lsp` on your `$PATH`.

- Installed Koja with [asdf](https://github.com/koja-lang/asdf-koja)? You already have both — every install ships `koja-lsp` alongside the `koja` compiler (version-matched) on your `$PATH`. Nothing else to do.
- Building Koja from source instead? Follow the [Koja installation guide](https://github.com/koja-lang/koja/blob/main/INSTALLING.md).
- Or point the extension at specific binaries in your settings:

  ```json
  {
    "koja.path": "/absolute/path/to/koja",
    "koja.lsp.path": "/absolute/path/to/koja-lsp"
  }
  ```

**2. Install the extension.** It isn't on the VS Code Marketplace or Open VSX yet, so install it locally — clone this repository, build a `.vsix`, and install that:

```sh
npm install
npm run package          # produces koja-<version>.vsix via @vscode/vsce
```

Then open the command palette and run **Extensions: Install from VSIX…**, selecting the generated file. (To hack on the extension itself, press `F5` to launch an Extension Development Host instead.)

## Features

- Syntax highlighting for `.koja` and `.kojs` files, and Koja code blocks in Markdown.
- Language-server features via [`koja-lsp`](https://github.com/koja-lang/koja/tree/main/crates/koja-lsp): diagnostics, hover, completion, go-to-definition, and document symbols.
- Format on save through `koja format`.
- Commands to run and build the current file.

## Commands

| Command                         | Description                           |
| ------------------------------- | ------------------------------------- |
| `Koja: Run File`                | Run the current `.kojs` or project.   |
| `Koja: Build File`              | Build the current `.kojs` or project. |
| `Koja: Restart Language Server` | Restart `koja-lsp`.                   |

## Settings

| Setting         | Description                                            |
| --------------- | ------------------------------------------------------ |
| `koja.path`     | Path to the `koja` CLI binary. Empty searches `$PATH`. |
| `koja.lsp.path` | Path to the `koja-lsp` binary. Empty searches `$PATH`. |

## Contributing

Repository layout:

- `src/extension.ts` — extension entry point; launches the `koja-lsp` client and registers the run/build/restart commands.
- `syntaxes/` — TextMate grammars (`koja.tmLanguage.json` plus a Markdown code-block injection).
- `language-configuration.json` — brackets, comments, auto-indent, and folding rules.

Build with `npm run compile` (or `npm run watch` for incremental builds), then press `F5` to try changes in an Extension Development Host. Build outputs (`out/`, `*.vsix`) are gitignored.
