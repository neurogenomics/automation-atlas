// Regenerate content/market.js from a checkout of instrument-capability-catalogue (#167).
// The planner uses the catalogue's manufacturer- and secondary-sourced records; upstream-discovery
// records come in through content/registry.js instead.
// Usage: node scripts/import-market.mjs --from ../instrument-capability-catalogue --imported-on 2026-11-09
// The checkout must be clean so the recorded commit is exactly what was imported.
import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {admitsPlanning} from '../lib/equipment.js';

const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : null; };
const from = resolve(arg('from') || '../instrument-capability-catalogue');
const importedOn = arg('imported-on') || new Date().toISOString().slice(0, 10);
const git = (...a) => execFileSync('git', ['-C', from, ...a], {encoding: 'utf8'}).trim();

if (git('status', '--porcelain')) throw Error(`${from} has uncommitted changes; commit them or import a clean checkout.`);
const commit = git('rev-parse', 'HEAD');
const {catalogue} = await import(pathToFileURL(`${from}/lib/catalogue.js`).href);
const records = catalogue.records.filter(r => admitsPlanning(r) && ['manufacturer-sourced', 'secondary-sourced'].includes(r.evidenceLevel));
const market = {sourceVersion: catalogue.version, sourceCommit: commit, importedOn, records};
const out = new URL('../content/market.js', import.meta.url);
writeFileSync(out, `// Pinned public evidence snapshot; installation facts and private protocols are not overwritten.\nexport const market = ${JSON.stringify(market, null, 2)};\n`);
console.log(`content/market.js: ${records.length} records from ${catalogue.version} at ${commit}`);
