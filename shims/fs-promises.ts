// node:fs/promises with a glob() fallback for Node < 22.
import * as fsp from 'fs/promises';
import { glob as globPkg } from 'glob';

export * from 'fs/promises';

async function* globFallback(pattern: string | string[]) {
    for (const match of await globPkg(pattern)) {
        yield match;
    }
}

export const glob = (fsp as any).glob ?? globFallback;

export default { ...fsp, glob };
