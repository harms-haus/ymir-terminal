# CLI & Distribution

## `apps/cli` — `@ymir/cli`

The `ymir` CLI is a compiled Bun binary (`bun build --compile`) that serves as the primary entry point for end users. It dispatches to three commands:

| Command   | Behavior                                                                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (default) | `launchApp()` — spawns the Tauri desktop app binary from `{getYmirHomeDir()}`, sets `YMIR_HOME`, `YMIR_STATIC_DIR`, `YMIR_SERVER_PATH` env vars, and detaches                                  |
| `web`     | `startWeb()` — spawns the server binary with `--host`, `--port`, `--staticDir`, and `YMIR_PASSWORD`; optionally opens the browser                                                              |
| `update`  | `selfUpdate()` — fetches the latest GitHub release, downloads platform-matched binaries in parallel, replaces them in `{getYmirHomeDir()}` atomically (rename on Unix, `.old` swap on Windows) |

## Binary Layout (`~/.ymir/`)

The home directory (`getYmirHomeDir()`) contains all installed artifacts:

```
~/.ymir/                          (Unix)
%LOCALAPPDATA%\ymir\             (Windows)
├── ymir              CLI binary
├── ymir-server       Server binary
├── ymir-app          Tauri desktop app
└── client-dist/      Compiled client SPA assets
```

Binary names include `.exe` suffix on Windows (e.g. `ymir.exe`, `ymir-server.exe`, `ymir-app.exe`).

## npm Package Structure

Three npm packages handle distribution:

| Package            | Contents                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `ymir`             | Main package — `bin/ymir.js` shim + `install.js` postinstall script that downloads the CLI binary to `~/.ymir/` |
| `ymir-linux-x64`   | Platform-specific `bin/ymir` binary for Linux x64                                                               |
| `ymir-windows-x64` | Platform-specific `bin/ymir.exe` binary for Windows x64                                                         |

The `ymir` package declares `ymir-linux-x64` and `ymir-windows-x64` as `optionalDependencies`. The `bin/ymir.js` shim resolves the binary in order:

1. Optional dependency package (e.g. `node_modules/ymir-linux-x64/bin/ymir`)
2. Home directory (`~/.ymir/ymir`)
3. `PATH` lookup fallback

The `install.js` postinstall script downloads the CLI binary from the latest GitHub release on first install.

## From-Source Install

`scripts/install.ts` is a self-contained installer that can be run directly via Bun:

```bash
bun run https://raw.githubusercontent.com/harms-haus/ymir-terminal/main/scripts/install.ts
```

It checks for prerequisites (Bun, Rust, cargo, Tauri system deps), clones the repo into a temp directory, runs the full build pipeline (client → server → CLI → Tauri → extract), copies all artifacts to `{getYmirHomeDir()}`, and creates a symlink or PATH entry for the `ymir` command.

## Build Scripts

| Script                            | Purpose                                                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `scripts/build-server.ts`         | Compile `apps/server` into a standalone binary via `bun build --compile`                                    |
| `scripts/build-cli.ts`            | Compile `apps/cli` into a standalone binary via `bun build --compile`                                       |
| `scripts/build-client-dist.ts`    | Build client SPA + package as `.tar.gz` (Linux/macOS) or `.zip` (Windows)                                   |
| `scripts/build-all.ts`            | Orchestrate all builds: client → server → CLI → Tauri → extract                                             |
| `scripts/extract-tauri-binary.ts` | Copy Tauri binary from `target/release/` to `dist/ymir-app`                                                 |
| `scripts/publish-npm.ts`          | Copy binaries, sync versions, publish all npm packages (`--dry-run` supported)                              |
| `scripts/sync-version.ts`         | Read/check/set version across `constants.ts`, `Cargo.toml`, `tauri.conf.json`, and all `package.json` files |
| `scripts/lib/build-utils.ts`      | Shared helpers: target map, `getPlatformTarget()`, `getTargetTriple()`, `runCommand()`, `ensureDir()`       |

## Version Synchronization

The version is defined once in `packages/shared/src/constants.ts` (`VERSION` constant). `scripts/sync-version.ts` propagates it to:

- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `packages/npm/ymir/package.json` (including `optionalDependencies`)
- `packages/npm/ymir-linux-x64/package.json`
- `packages/npm/ymir-windows-x64/package.json`

Run `bun run version:check` to verify consistency, or `bun run version:set -- --set 1.2.3` to update all files.

## Release Process

Releases are automated via [GitHub Actions](../.github/workflows/release.yml) on the `release` event:

1. **`build-linux`** job (Ubuntu): Installs Tauri system deps, builds all artifacts, uploads `ymir-linux-x64.tar.gz` and individual binaries to the GitHub release, publishes `ymir-linux-x64` to npm.
2. **`build-windows`** job (Windows): Same build pipeline, uploads `ymir-windows-x64.zip` and `.exe` binaries, publishes `ymir-windows-x64` to npm.
3. **`publish-main`** job: After both platform jobs complete, publishes the main `ymir` npm package.

All npm publishing uses `NPM_TOKEN` from GitHub Secrets. Version consistency is verified via `bun run version:check` before publishing.
