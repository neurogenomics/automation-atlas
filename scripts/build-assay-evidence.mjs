// Build content/assay-evidence.json (#154) from data/assay-evidence.json:
// published reports of automated CUT&Tag / CUT&RUN per platform. Each entry
// must cite an https source with a verbatim quote under 25 words and map to a
// catalogue handler or none. Usage: node scripts/build-assay-evidence.mjs
import {readFileSync, writeFileSync} from 'node:fs';
import {handlers} from '../lib/work.js';
const d = JSON.parse(readFileSync(new URL('../data/assay-evidence.json', import.meta.url), 'utf8'));
const ids = new Set(handlers.map(h => h.id));
for (const i of d.items) {
  if (!/^https:\/\//.test(i.url)) throw Error(`${i.title || i.platform}: no https source`);
  if (!i.quote || i.quote.split(/\s+/).length > 25) throw Error(`${i.title || i.platform}: quote missing or over 25 words`);
  if (i.handler != null && !ids.has(i.handler)) throw Error(`${i.platform}: unknown handler ${i.handler}`);
  if (!['same', 'related', 'device', 'other'].includes(i.match)) throw Error(`${i.platform}: unknown match ${i.match}`);
}
const {searched, ...out} = d;
writeFileSync(new URL('../content/assay-evidence.json', import.meta.url), JSON.stringify({...out, searchedQueries: searched.length}, null, 1) + '\n');
console.log(`Wrote ${d.items.length} reports; ${d.noEvidence.length} platforms with none found.`);
