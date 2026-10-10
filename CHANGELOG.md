# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-10-10

Supports features for Koja 0.20.

### Added

- A `Run test` code lens above each `test` block, from `koja-lsp` 0.20. The lens runs the `koja.runTest` command, which saves the file and runs that one test through the Testing view.
- Running one or more tests from the Testing view passes `--only <file>:<line>` for each one instead of running the whole project and filtering the results.
- Quick fixes. A diagnostic that carries a compiler fix offers it in the lightbulb menu.

## [0.5.0] - 2026-09-21

Supports features for Koja 0.19.

### Added

- Syntax highlighting, auto-indent, and folding for `test "description"` blocks, and highlighting for the `assert` statement.
- Syntax highlighting for function and constant aliases (`alias JSON.decode`). The package head is a namespace, not a type.
- A Testing view. `test` blocks under a project's `src/` and `test/` appear in the tree, a run executes `koja test --reporter json` for the project, and each result shows inline. A failed `assert` shows a diff of both sides at the assertion line.
- `Koja: Test Project` command, which runs `koja test` for the current project in the shared terminal.
- The extension activates when the workspace contains a `koja.toml`, so tests appear before a `.koja` file is opened.

### Changed

- README lists the language-server features that `koja-lsp` 0.19 answers, which now include signature help, find references, rename, document highlight, inlay hints, workspace symbols, and folding.

### Removed

- Syntax highlighting and auto-indent for `unless`, removed from the language in Koja 0.19. Write `if not cond` instead.

## [0.4.0] - 2026-08-25

### Added

- Syntax highlighting for named function references (`&name/arity`).

### Changed

- Run and build commands select the nearest Koja project without changing the shared terminal working directory.

## [0.3.0] - 2026-08-09

### Added

- Syntax highlighting, indentation, and folding for `builtin` declarations.

## [0.2.0] - 2026-08-03

### Added

- Syntax highlighting for the error channel: the `try`, `fail`, and `rescue` keywords and the `!` separator in `-> T ! E` signatures.

### Fixed

- Nested `priv` declarations now fold correctly.

## [0.1.1] - 2026-07-10

### Fixed

- Format on save works reliably now that formatting goes through the language server only, instead of two competing formatters.
- The extension declares itself the default formatter for Koja files, so a globally configured `editor.defaultFormatter` no longer disables formatting.

## [0.1.0] - 2026-06-27

Initial release.

[unreleased]: https://github.com/koja-lang/vscode-koja/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/koja-lang/vscode-koja/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/koja-lang/vscode-koja/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/koja-lang/vscode-koja/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/koja-lang/vscode-koja/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/koja-lang/vscode-koja/releases/tag/v0.1.0
