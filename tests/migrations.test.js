// Sites applies hosted D1 migrations from drizzle/ and needs the Drizzle journal
// and snapshots committed with the SQL (#127). Keep them in step.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';

const dir = new URL('../drizzle/', import.meta.url);
const sql = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', dir), 'utf8'));

test('every migration has a journal entry and a snapshot, in order', () => {
  assert.deepEqual(journal.entries.map(e => `${e.tag}.sql`), sql);
  journal.entries.forEach((e, i) => {
    assert.equal(e.idx, i);
    readFileSync(new URL(`meta/${String(i).padStart(4, '0')}_snapshot.json`, dir));
  });
});

test('the latest snapshot has exactly the tables the SQL creates', () => {
  const created = new Set(sql.flatMap(f => [...readFileSync(new URL(f, dir), 'utf8').matchAll(/CREATE TABLE (?:IF NOT EXISTS )?`(\w+)`/g)].map(m => m[1])));
  const last = JSON.parse(readFileSync(new URL(`meta/${String(sql.length - 1).padStart(4, '0')}_snapshot.json`, dir), 'utf8'));
  assert.deepEqual(Object.keys(last.tables).sort(), [...created].sort());
});
