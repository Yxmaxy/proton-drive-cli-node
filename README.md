# proton-drive-cli-node

Unofficial build of the [official Proton Drive CLI](https://github.com/ProtonDriveApps/sdk/tree/main/cli) that runs on plain Node.js instead of Bun. Proton only ships the CLI as a Bun single-file executable for x64 and arm64, so it cannot run on 32-bit ARM (eg. on Raspberry Pi 2/Zero, older NAS boxes) or anywhere Bun is unavailable. This repo contains no Proton code: it is a build recipe that fetches the SDK at a pinned tag, replaces the handful of Bun-only modules with Node equivalents, and bundles everything into one `proton-drive.mjs`.

Everything the CLI does (end-to-end encryption, sharing, "shared with me", `--json` output) is the upstream code, unchanged.

## Requirements

- Build machine: Node 20+, npm, git, `patch`.
- Target machine: Node 20+ and the `better-sqlite3` native module (the only non-bundled dependency).

## Build

```bash
npm install
npm run build        # -> dist/proton-drive.mjs, dist/VERSION
```

`build.mjs` clones `ProtonDriveApps/sdk` at the tag `cli/v<version>` (the `version` in `package.json`) into `.sdk/`, installs its dependencies, applies Proton's own `@protontech/crypto` patch, checks that every `Bun.*` API used upstream is covered by `shims/bun-global.ts` (the build fails otherwise), and bundles with esbuild.

## Install on the target

```bash
mkdir proton-drive && cd proton-drive
cp /path/to/dist/proton-drive.mjs .
npm init -y >/dev/null && npm install better-sqlite3
```

On 32-bit ARM there is no prebuilt `better-sqlite3`, so npm compiles it; on a Raspberry Pi 2 this takes about 20 minutes and needs `make`, `g++` and `python3`.

## Run

```bash
export PROTON_DRIVE_CREDENTIALS_STORE=pass          # or unsafe_file (plaintext session file)
export PROTON_DRIVE_CACHE_DIR=$HOME/proton-drive/state   # optional: keep all state in one dir

node proton-drive.mjs auth login                     # prints a URL to open on any device
node proton-drive.mjs filesystem list /shared-with-me --json
node proton-drive.mjs filesystem upload -t ./file.pdf "/my-files/some folder" --json
```

See `node proton-drive.mjs help` for all commands; they are the upstream CLI's.

## Differences from the official build

- Credentials: the OS keychain store (`Bun.secrets`) is not available. Use `PROTON_DRIVE_CREDENTIALS_STORE=pass` ([password-store](https://www.passwordstore.org/)) or `unsafe_file`.
- Thumbnails: `Bun.Image` has no Node equivalent, so image uploads need `--skip-thumbnails` (`-t`). Non-image uploads are unaffected.
- Telemetry: Sentry is replaced with a no-op.
- Node 20 lacks `fs.glob`, `Array.fromAsync`, `Promise.withResolvers` and iterator helpers; these are polyfilled (core-js). Node 22+ needs none of them.
- Node 20 prints a harmless `ExperimentalWarning` about Ed25519/X25519 WebCrypto.
- The app identifier sent to Proton is `external-drive-sdkclijs`, the value upstream reserves for unofficial builds.

## Versioning

`version` in `package.json` is the upstream CLI version this build tracks, and selects the upstream tag to build from. Release tags are `v<upstream>` for a new upstream version and `v<upstream>-node.N` for a rebuild of the same upstream with shim changes. The built `dist/proton-drive.mjs` is committed, so a target machine only needs `git pull`; `dist/VERSION` records the tag and commit it was built from.

## Upgrading

Bump `version` in `package.json` to the new upstream CLI version and run `npm run clean && npm run build`.

### Building another upstream ref

To build an unreleased commit or branch instead of the tag derived from `package.json`, set `SDK_REF=<tag-or-branch>` in the environment, e.g. `SDK_REF=main npm run build`.

### Unsupported Bun API

If upstream started using a Bun API the shims do not cover, the build stops and lists it. Implement it in `shims/bun-global.ts` and add its name to `SUPPORTED_BUN_APIS` in `build.mjs`.

## License

MIT, same as the upstream SDK.
