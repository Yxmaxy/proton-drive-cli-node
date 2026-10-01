// Node implementation of the Bun globals the CLI uses, plus polyfills for Node 20.
import 'core-js/actual/iterator';
import 'core-js/actual/array/from-async';
import 'core-js/actual/promise/with-resolvers';
import 'core-js/actual/typed-array/to-base64';
import 'core-js/actual/typed-array/from-base64';
import 'core-js/actual/typed-array/to-hex';
import 'core-js/actual/typed-array/from-hex';

import { createReadStream, createWriteStream, existsSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname } from 'node:path';
import { Readable } from 'node:stream';
import { spawn as nodeSpawn } from 'node:child_process';

const MIME: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.csv': 'text/csv',
    '.zip': 'application/zip',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

class FileSink {
    private stream;
    constructor(target: string | number) {
        this.stream = typeof target === 'number' ? createWriteStream('', { fd: target }) : createWriteStream(target);
    }
    write(chunk: Uint8Array | string) {
        return new Promise<number>((resolve, reject) => {
            const buf = Buffer.from(chunk as any);
            this.stream.write(buf, (err) => (err ? reject(err) : resolve(buf.length)));
        });
    }
    flush() {
        return Promise.resolve();
    }
    end() {
        return new Promise<void>((resolve) => this.stream.end(() => resolve()));
    }
    abort() {
        this.stream.destroy();
        return Promise.resolve();
    }
}

class BunFile {
    constructor(private target: string | number) {}
    private get path() {
        return typeof this.target === 'string' ? this.target : undefined;
    }
    get size() {
        try { return this.path ? statSync(this.path).size : 0; } catch { return 0; }
    }
    get lastModified() {
        try { return this.path ? statSync(this.path).mtimeMs : 0; } catch { return 0; }
    }
    get type() {
        return (this.path && MIME[extname(this.path).toLowerCase()]) || 'application/octet-stream';
    }
    get name() {
        return this.path;
    }
    async exists() {
        return !!this.path && existsSync(this.path);
    }
    async text() {
        return readFile(this.path!, 'utf8');
    }
    async json() {
        return JSON.parse(await this.text());
    }
    async bytes() {
        return new Uint8Array(await readFile(this.path!));
    }
    async arrayBuffer() {
        const b = await readFile(this.path!);
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    }
    stream() {
        return Readable.toWeb(createReadStream(this.path!)) as unknown as ReadableStream<Uint8Array>;
    }
    writer() {
        return new FileSink(this.target);
    }
}

async function write(path: string, data: string | Uint8Array, options?: { mode?: number }) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data, { mode: options?.mode });
    return typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength;
}

function spawn(cmd: string[], options: { env?: NodeJS.ProcessEnv } = {}) {
    const child = nodeSpawn(cmd[0], cmd.slice(1), { env: options.env, stdio: ['pipe', 'pipe', 'pipe'] });
    return {
        stdin: { write: (d: string) => child.stdin.write(d), end: () => child.stdin.end() },
        stdout: Readable.toWeb(child.stdout),
        stderr: Readable.toWeb(child.stderr),
        exited: new Promise<number>((resolve) => child.on('close', (code) => resolve(code ?? 1))),
        kill: () => child.kill(),
    };
}

class Image {
    constructor(_path: string, _options?: unknown) {
        throw new Error('Thumbnails are not supported in the Node build; use --skip-thumbnails');
    }
}

const keychainUnsupported = () => {
    throw new Error('OS keychain is not supported in the Node build; set PROTON_DRIVE_CREDENTIALS_STORE=pass or unsafe_file');
};
const secrets = { get: keychainUnsupported, set: keychainUnsupported, delete: keychainUnsupported };

(globalThis as any).Bun = {
    file: (target: string | number) => new BunFile(target),
    write,
    argv: process.argv,
    spawn,
    Image,
    secrets,
    env: process.env,
};

// Debug aid: `kill -USR2 <pid>` prints what keeps the event loop alive.
if (process.env.PROTON_DRIVE_NODE_DEBUG) {
    process.on('SIGUSR2', () => {
        const handles = (process as any)._getActiveHandles().map((h: any) => h?.constructor?.name);
        const requests = (process as any)._getActiveRequests().map((r: any) => r?.constructor?.name);
        console.error('active handles:', handles, 'active requests:', requests);
    });
}
