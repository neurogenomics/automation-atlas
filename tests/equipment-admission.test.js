import test from 'node:test';
import assert from 'node:assert/strict';
import {cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {deviceClasses, liquidHandlers, workcells} from '../lib/equipment.js';
import map from '../content/equipment-map.json' with {type: 'json'};

const model = (id, category, planningEligibility) => ({
  id, name: id, vendor: 'Fixture', category, evidenceLevel: 'manufacturer-sourced',
  capabilities: [{operation: 'fixture-capability', type: 'native'}],
  ...(planningEligibility ? {planningEligibility} : {}),
});
const rows = [
  model('discovery-handler', 'liquid handler', 'unassessed'),
  model('unsupported-handler', 'liquid handler', 'unsupported'),
  model('legacy-handler', 'liquid handler'),
  model('assessed-handler', 'liquid handler', 'assessed'),
  model('discovery-peripheral', 'device', 'unassessed'),
  model('assessed-peripheral', 'device', 'assessed'),
  model('unrecognised-cell', 'workcell', 'unknown'),
  model('unsupported-cell', 'workcell', 'unsupported'),
  model('legacy-cell', 'workcell'),
];
test('a raw market file cannot turn unassessed and unsupported Atlas records into runtime capabilities', () => {
  const input = {market: {records: rows}, registry: {records: []}, map};
  assert.deepEqual(liquidHandlers(input).map(h => h.id), ['assessed-handler', 'legacy-handler']);
  assert.deepEqual(deviceClasses(input)['fixture-capability'].examples, ['Fixture assessed-peripheral']);
  assert.deepEqual(workcells(input).map(r => r.id), ['legacy-cell']);
});

test('fresh CLI market import excludes explicit planning ineligibility without rewriting historical fixtures', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'planner-market-'));
  try {
    for (const d of ['scripts', 'lib', 'content', 'source', 'source/lib']) mkdirSync(join(dir, d));
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
    cpSync(new URL('../scripts/import-market.mjs', import.meta.url), join(dir, 'scripts/import-market.mjs'));
    cpSync(new URL('../lib/equipment.js', import.meta.url), join(dir, 'lib/equipment.js'));
    writeFileSync(join(dir, 'source/lib/catalogue.js'), 'export const catalogue = ' +
      JSON.stringify({version: 'fixture', records: [...rows, {...rows[2], id: 'discovery-source', evidenceLevel: 'upstream-discovery'}]}));
    const git = (...args) => execFileSync('git', ['-C', join(dir, 'source'), ...args], {stdio: 'ignore'});
    git('init', '-q'); git('add', 'lib/catalogue.js');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.org', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Fixture');
    execFileSync(process.execPath, ['scripts/import-market.mjs', '--from', 'source', '--imported-on', '2025-01-12'], {cwd: dir});
    const {market} = await import(pathToFileURL(join(dir, 'content/market.js')).href);
    assert.deepEqual(market.records.map(r => r.id), ['legacy-handler', 'assessed-handler', 'assessed-peripheral', 'legacy-cell']);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
