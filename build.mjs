// Builds the official Proton Drive CLI for Node.js: clones the SDK at the upstream tag matching
// package.json's version, applies Proton's own crypto patch, swaps the Bun-only modules for the
// shims in ./shims and bundles with esbuild. SDK_REF=<ref> in the environment overrides the tag.
import * as esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const SDK_REPO = 'https://github.com/ProtonDriveApps/sdk.git';
const CLI_VERSION = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const SDK_REF = process.env.SDK_REF || `cli/v${CLI_VERSION}`;
const SDK_DIR = path.join(ROOT, '.sdk');
const CLI_DIR = path.join(SDK_DIR, 'cli');
const OUT_DIR = path.join(ROOT, 'dist');

// Every Bun API the shim implements. The build fails if upstream starts using one that is not listed.
const SUPPORTED_BUN_APIS = new Set(['file', 'write', 'argv', 'spawn', 'Image', 'secrets', 'env', 'FileSink', 'BunFile']);

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });
const out = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8' }).trim();

function fetchSdk() {
    if (existsSync(SDK_DIR) && out('git', ['describe', '--tags', '--exact-match', '--match', 'cli/*'], SDK_DIR) === SDK_REF) {
        console.log(`Using cached SDK checkout at ${SDK_REF}`);
        return;
    }
    rmSync(SDK_DIR, { recursive: true, force: true });
    console.log(`Cloning ${SDK_REPO} at ${SDK_REF}`);
    run('git', ['-c', 'advice.detachedHead=false', 'clone', '--quiet', '--depth', '1', '--branch', SDK_REF, SDK_REPO, SDK_DIR]);
    for (const pkg of ['client/js', 'incubating/account/js', 'cli']) {
        run('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', '--silent'], path.join(SDK_DIR, pkg));
    }
    const patchesDir = path.join(SDK_DIR, 'config/js/patches');
    for (const patchFile of readdirSync(patchesDir)) {
        const pkgName = decodeURIComponent(patchFile.replace(/@[\d.]+\.patch$/, ''));
        console.log(`Applying ${patchFile} to ${pkgName}`);
        run('patch', ['-p1', '--silent', '-i', path.join(patchesDir, patchFile)], path.join(CLI_DIR, 'node_modules', pkgName));
    }
}

function* sourceFiles(dir) {
    for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) yield* sourceFiles(full);
        else if (full.endsWith('.ts') && !full.endsWith('.test.ts')) yield full;
    }
}

function checkBunApis() {
    const unsupported = new Map();
    for (const file of sourceFiles(path.join(CLI_DIR, 'src'))) {
        for (const match of readFileSync(file, 'utf8').matchAll(/\bBun\.(\w+)/g)) {
            if (!SUPPORTED_BUN_APIS.has(match[1])) {
                unsupported.set(match[1], path.relative(SDK_DIR, file));
            }
        }
    }
    if (unsupported.size) {
        for (const [api, file] of unsupported) console.error(`Unsupported Bun API Bun.${api} used in ${file}`);
        process.exit(1);
    }
}

function versions() {
    const hash = out('git', ['rev-parse', '--short', 'HEAD'], SDK_DIR);
    return { hash, cliVersion: CLI_VERSION };
}

async function bundle() {
    const { hash, cliVersion } = versions();
    mkdirSync(OUT_DIR, { recursive: true });
    await esbuild.build({
        entryPoints: [path.join(CLI_DIR, 'src/proton-drive.ts')],
        outfile: path.join(OUT_DIR, 'proton-drive.mjs'),
        absWorkingDir: CLI_DIR,
        tsconfig: path.join(CLI_DIR, 'tsconfig.json'),
        bundle: true,
        platform: 'node',
        target: 'node20',
        format: 'esm',
        sourcemap: false,
        inject: [path.join(ROOT, 'shims/bun-global.ts')],
        alias: {
            'node:fs/promises': path.join(ROOT, 'shims/fs-promises.ts'),
            'node:child_process': path.join(ROOT, 'shims/child-process.ts'),
            'bun:sqlite': path.join(ROOT, 'shims/bun-sqlite.ts'),
            '@sentry/bun': path.join(ROOT, 'shims/sentry-bun.ts'),
        },
        external: ['better-sqlite3'],
        define: {
            APP_VERSION: JSON.stringify(`external-drive-sdkclijs@${cliVersion}+node.${hash}`),
            SDK_VERSION: JSON.stringify(`js@${hash}`),
            SENTRY_DSN: 'undefined',
        },
        banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
        logLevel: 'warning',
    });
    writeFileSync(path.join(OUT_DIR, 'VERSION'), `${SDK_REF} ${hash}\n`);
    console.log(`Built dist/proton-drive.mjs from ${SDK_REF} (${hash})`);
}

fetchSdk();
checkBunApis();
await bundle();
