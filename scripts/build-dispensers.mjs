// Build content/dispensers.json (#85) from the curated engine fields in
// data/dispensers.json and the sourced research in data/dispensers-research.json.
// Each device takes its sources (URL + quote) and price evidence from the
// research; nothing is added that the research did not see.
// Usage: node scripts/build-dispensers.mjs
import {readFileSync, writeFileSync} from 'node:fs';
const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const cur = read('../data/dispensers.json'), res = read('../data/dispensers-research.json');
const byId = new Map(res.devices.map(d => [d.id, d]));
const out = {...cur, about: cur.about, researched: res.meta.generated, devices: cur.devices.map(d => {
  const r = byId.get(d.id);
  if (!r) throw Error(`No research for dispenser ${d.id}`);
  if (r.family !== d.family) throw Error(`${d.id}: family differs from research`);
  const sources = r.sources.map(s => typeof s === 'string' ? {url: s} : s).filter(s => /^https:\/\//.test(s.url || ''));
  // A quote for each source: the research's quote for that URL, wherever it appears.
  const quotes = new Map();
  JSON.stringify(r, (k, v) => { if (v && typeof v === 'object' && v.url && v.quote && !quotes.has(v.url)) quotes.set(v.url, v.quote); return v; });
  const srcs = [...(d.extraSources || []), ...sources.map(s => ({url: s.url, quote: s.quote || quotes.get(s.url) || null, ...(s.title ? {title: s.title} : {})}))].filter(s => s.quote);
  if (!srcs.length) throw Error(`${d.id}: no source with a quote`);
  // An observation covering several units (an award for three) records how many.
  const prices = (r.priceEvidence || []).map(p => ({kind: p.kind, amount: p.amount, currency: p.currency, item: p.item, url: p.url, date: p.dateSeen || p.date, ...(d.priceUnits?.[p.url] ? {units: d.priceUnits[p.url]} : {})}));
  // Dispense time per plate (#173): every figure numeric, every record with an
  // https source and a quote, or no figures at all (then assumed).
  const th = d.throughput;
  if (!th || !Array.isArray(th.points)) throw Error(`${d.id}: no throughput record`);
  for (const pt of th.points) if (![96, 384, 1536].includes(pt.wells) || !(pt.seconds > 0) || (pt.ul !== null && !(pt.ul > 0)) || (pt.ul === null && !pt.floor)) throw Error(`${d.id}: bad throughput point ${JSON.stringify(pt)}`);
  for (const s of [th.source, ...(th.extra || [])].filter(Boolean)) if (!/^https:\/\//.test(s.url) || !s.quote) throw Error(`${d.id}: throughput source needs an https URL and a quote`);
  if (th.points.length && !th.source) throw Error(`${d.id}: throughput figures without a source`);
  if (!('primeSeconds' in th)) throw Error(`${d.id}: primeSeconds must be stated (null when not found)`);
  const {extraSources, priceUnits, ...rest} = d;
  return {...rest, sources: srcs, prices};
})};
writeFileSync(new URL('../content/dispensers.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log(`Wrote ${out.devices.length} dispensers (${out.devices.reduce((n, d) => n + d.prices.length, 0)} price observations).`);
