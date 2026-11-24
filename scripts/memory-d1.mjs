// In-memory stand-in for the Sites D1 binding, for tests and local preview
// only. A real SQLite database (node:sqlite) with every migration in drizzle/
// applied, behind the small part of the D1 API the worker uses:
// prepare(sql).bind(...args).first() / .all() / .run(), and batch([...]).
import {DatabaseSync} from 'node:sqlite';
import {readdirSync, readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../drizzle');

export function memoryD1(db = new DatabaseSync(':memory:')) {
  for (const f of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()) db.exec(readFileSync(resolve(MIGRATIONS, f), 'utf8'));
  const plain = row => row ? {...row} : null;
  return {
    prepare(sql) {
      const statement = db.prepare(sql);
      const bound = args => ({
        async first() { return plain(statement.get(...args)); },
        async all() { return {results: statement.all(...args).map(plain), success: true}; },
        async run() { const r = statement.run(...args); return {success: true, meta: {changes: Number(r.changes)}}; },
        _run() { return statement.run(...args); },
      });
      return {bind: (...args) => bound(args), ...bound([])};
    },
    // D1 runs a batch as one transaction.
    async batch(list) {
      db.exec('BEGIN');
      try { const out = list.map(s => ({success: true, meta: {changes: Number(s._run().changes)}})); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    _db: db,
  };
}
