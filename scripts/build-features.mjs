// Build content/handler-features.json (#92) from the feature labels in
// data/handler-features.json and the sourced values in
// data/handler-features-research.json. A value other than null must carry a
// source URL and quote; quotes taken from search snippets keep their flag.
// Usage: node scripts/build-features.mjs
import {readFileSync, writeFileSync} from 'node:fs';
const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const cur = read('../data/handler-features.json'), res = read('../data/handler-features-research.json');
const handlers = {};
for (const [id, feats] of Object.entries(res.handlers)) {
  handlers[id] = {};
  for (const f of Object.keys(cur.features)) {
    const v = feats[f];
    if (!v || v.value == null) { handlers[id][f] = {value: null, detail: v?.detail || 'Not found in the sources that could be read.'}; continue; }
    if (!/^https:\/\//.test(v.source?.url || '') || !v.source.quote) throw Error(`${id}/${f}: a settled value needs a source URL and quote`);
    handlers[id][f] = {value: v.value === true || (v.value !== false && !!v.value), detail: v.detail || '', source: {url: v.source.url, quote: v.source.quote, ...(v.source.via ? {via: v.source.via} : {})}};
  }
}
writeFileSync(new URL('../content/handler-features.json', import.meta.url), JSON.stringify({about: cur.about, researched: res.generated, features: cur.features, handlers}, null, 1) + '\n');
console.log(`Wrote features for ${Object.keys(handlers).length} handlers.`);
