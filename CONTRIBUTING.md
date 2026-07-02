# Contributing

Thanks for your interest in OneTone!

## Local dev

```powershell
cd src-tauri
cargo tauri dev
```

Requirements: Windows 10/11, [Rust](https://rustup.rs/), [Tauri CLI](https://v2.tauri.app/) (`cargo install tauri-cli`).

See [README.md](README.md) for build and release instructions.

## PR flow

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run locally:
   ```powershell
   cd src-tauri
   cargo fmt
   cargo clippy
   cargo build
   ```
4. Open a pull request against `main` with a clear description and test notes

## Bug reports

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml). Include:

- Windows version (e.g. Windows 11 23H2)
- OneTone version (Settings → Recovery & Maintenance → About)
- Steps to reproduce
- Expected vs actual behavior
- Diagnostic logs if possible (Settings → Runtime Status → Developer → Export logs)

## Feature requests

Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.yml). Describe the problem, alternatives you tried, and why the feature would help.

## Code style

- **Rust:** `cargo fmt` + `cargo clippy`; follow existing module patterns in `src-tauri/src/`
- **Frontend:** vanilla JS in `src/index.html` (no build step); match surrounding style and i18n keys in both `zh` and `en`

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
