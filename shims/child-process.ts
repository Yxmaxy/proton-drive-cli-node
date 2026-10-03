// node:child_process with the CLI's browser launch made optional for headless hosts.
import * as cp from 'child_process';
import { EventEmitter } from 'events';

export * from 'child_process';

const BROWSER_OPENERS = new Set(['open', 'xdg-open', 'start']);

export function spawn(command: string, ...rest: any[]): cp.ChildProcess {
    if (process.env.PROTON_DRIVE_NO_BROWSER && BROWSER_OPENERS.has(command)) {
        const dummy = new EventEmitter() as cp.ChildProcess;
        (dummy as any).unref = () => {};
        return dummy;
    }
    return (cp.spawn as any)(command, ...rest);
}

export default { ...cp, spawn };
