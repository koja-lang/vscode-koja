# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Fixed

- Nested `priv` declarations now fold correctly.

## [0.1.1] - 2026-07-10

### Fixed

- Format on save works reliably now that formatting goes through the language server only, instead of two competing formatters.
- The extension declares itself the default formatter for Koja files, so a globally configured `editor.defaultFormatter` no longer disables formatting.

## [0.1.0] - 2026-06-27

Initial release.

[unreleased]: https://github.com/koja-lang/vscode-koja/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/koja-lang/vscode-koja/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/koja-lang/vscode-koja/releases/tag/v0.1.0
