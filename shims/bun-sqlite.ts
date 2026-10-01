// bun:sqlite API subset used by SQLiteCache, backed by better-sqlite3.
import BetterSqlite3 from 'better-sqlite3';

function stripDollar(params?: Record<string, unknown>) {
    if (!params) return {};
    return Object.fromEntries(Object.entries(params).map(([k, v]) => [k.replace(/^\$/, ''), v]));
}

class Statement {
    constructor(private stmt: any) {}
    run(params?: Record<string, unknown>) { return this.stmt.run(stripDollar(params)); }
    get(params?: Record<string, unknown>) { return this.stmt.get(stripDollar(params)); }
    all(params?: Record<string, unknown>) { return this.stmt.all(stripDollar(params)); }
}

export class Database {
    private db: any;
    constructor(path: string, _options?: { create?: boolean }) {
        this.db = new BetterSqlite3(path);
    }
    run(sql: string) {
        if (/^\s*PRAGMA/i.test(sql)) return this.db.pragma(sql.replace(/^\s*PRAGMA\s+/i, ''));
        return this.db.exec(sql);
    }
    query(sql: string) { return new Statement(this.db.prepare(sql)); }
    prepare(sql: string) { return this.query(sql); }
    close() { this.db.close(); }
}
