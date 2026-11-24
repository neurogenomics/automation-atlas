// Build content/decks.json from data/decks-research.json (issue #69).
// Research module names differ from the planner's module names, so each
// planner module is matched to a researched footprint by shared keywords.
// Fractional footprints (an ODTC is 2.5 SLAS sites) round up. A module with
// no footprint found takes one position, marked as assumed. A handler whose
// position count was not found gets no record and keeps the earlier estimate.
// Usage: node scripts/build-decks.mjs
import {readFileSync, writeFileSync} from 'node:fs';
import {handlers} from '../lib/work.js';

const research = JSON.parse(readFileSync(new URL('../data/decks-research.json', import.meta.url), 'utf8'));
const out = JSON.parse(readFileSync(new URL('../content/decks.json', import.meta.url), 'utf8'));
const KEYS = [/thermocycler|thermal cycler|odtc|\batc\b/i, /heater[- ]shaker|\bhhs\b/i, /heater cooler|\bhhc\b/i, /temperature module/i, /magnetic (block|module|stand)|magnet\b|te-mags/i, /thermoshake/i, /shaking peltier/i, /static peltier/i, /orbital shak/i, /\bcpac\b|peltier thermal/i, /stacker/i, /bioshake/i, /heating shaking station/i, /magnetic bead accessory/i, /cooler\/heater block|thermal (and shaker )?(station|module)/i, /microplate shaker|shaker module/i];
const key = name => KEYS.findIndex(r => r.test(name));
out.handlers = {};
// How each platform's deck is organised (#72). 'grid': fixed SBS positions.
// 'rails': tracks that take carriers, counted here in the SBS positions the
// carriers give. 'tiers': stacked decks with height limits. 'clip-in':
// accessories clipped into a frame; not counted until a source gives it.
const TYPES = {ot2: 'grid', flex: 'grid', bravo: 'grid', i7: 'grid', 'plr-hamilton-prep': 'grid', 'plr-hamilton-star': 'rails', starlet: 'rails', 'plr-hamilton-vantage': 'rails', 'plr-hamilton-nimbus': 'rails', fluent: 'rails', 'plr-tecan-evo': 'rails', firefly: 'tiers', 'firefly-plus': 'tiers', andrew: 'clip-in'};
// firefly decks from SPT Labtech's firefly user guide, section 1.3.
const FIREFLY_GUIDE = 'https://www.sptlabtech.com/product-help-center/firefly-user-guide-specifications-1.3-firefly-technology';
const fireflyTiers = {
  tiers: [{name: 'Top deck', positions: 8, maxHeightMm: 49.7}, {name: 'Bottom deck', positions: 8, maxHeightMm: 93, tips: true}],
  dispenserPositions: [6, 7],
  sources: [{url: FIREFLY_GUIDE, quote: 'firefly has two movable decks, each with space for 8 plates.', covers: 'positions (1.3.4)'},
    {url: FIREFLY_GUIDE, quote: 'The bottom deck has a maximum height limit of 93mm', covers: 'tier heights; deep items such as tip sets go on the bottom deck (1.3.4)'},
    {url: FIREFLY_GUIDE, quote: 'The syringe dispensing heads can dispense to plates located in deck positions 6 and 7', covers: 'dispenser reach (1.3.2)'}],
};
const TIERED = {
  firefly: {...fireflyTiers, storage: null},
  'firefly-plus': {...fireflyTiers, storage: {name: 'firefly+ medium shelves', tipRacks: 15, source: {url: FIREFLY_GUIDE, quote: '15 medium shelves (max. labware height 66 mm), suited to tip boxes (1.3.12)'}}},
};
for (const [hid, r0] of Object.entries(research)) {
  const r = TIERED[hid] ? {...r0, ...TIERED[hid], positions: TIERED[hid].tiers.reduce((n, t) => n + t.positions, 0)} : r0;
  if (TYPES[hid] === 'clip-in') { out.handlers[hid] = {type: 'clip-in', positions: null, note: 'Andrew+ works with clip-in accessories rather than SBS positions; no count was found, so fit is not checked.', sources: r.sources || []}; continue; }
  if (r.positions == null) continue;
  const h = handlers.find(x => x.id === hid);
  if (!h) continue;
  const modules = {};
  // Grippers and arms move plates; they do not take a deck position.
  for (const name of new Set([...Object.entries(h.ops).filter(([op]) => op !== 'vessel-transfer' && op !== 'storage').map(([, o]) => o.module), ...(h.alt || []).map(a => a.module)].filter(Boolean))) {
    const k = key(name);
    const match = k >= 0 && Object.entries(r.modules || {}).find(([n]) => key(n) === k);
    if (/stacker/i.test(name)) { modules[name] = {positions: 0, offDeck: true, note: 'mounts beside the deck; its rack shuttle uses an expansion position'}; continue; }
    modules[name] = match && match[1].positions != null ? {positions: Math.ceil(match[1].positions), from: match[0], basis: 'source'} : {positions: 1, basis: 'assumed: one position (footprint not found)', ...(match ? {from: match[0]} : {})};
  }
  // Placement rules (#131): slots each module may use and its neighbour rules,
  // matched to the planner's module names like the footprints above.
  let placement = null;
  if (r.placement) {
    const mods = {};
    for (const name of Object.keys(modules)) {
      const k = key(name), hit = k >= 0 && Object.entries(r.placement.modules).find(([n]) => key(n) === k);
      if (hit) mods[name] = {...hit[1], from: hit[0]};
    }
    placement = {...r.placement, modules: mods};
  }
  // Alternatives listed as fixed (trash bin or waste chute) take one position, not both.
  const fixed = (r.fixed || []).filter(f => f.positions).slice(0, 1).map(f => ({name: f.name, positions: Math.ceil(f.positions)}));
  out.handlers[hid] = {type: TYPES[hid] || 'grid', ...(r.tiers ? {tiers: r.tiers, dispenserPositions: r.dispenserPositions} : {}), positions: r.positions, positionsBasis: r.positionsBasis, expansion: r.expansion, fixed, modules, storage: r.storage?.tipRacks ? {name: r.storage.name, tipRacks: r.storage.tipRacks, ...(r.storage.source ? {source: r.storage.source} : {})} : null, limits: r.limits || [], ...(placement ? {placement} : {}), variants: r.variants || null, sources: r.sources || []};
  console.log(hid, r.positions, JSON.stringify(Object.fromEntries(Object.entries(modules).map(([n, m]) => [n, m.positions + (m.basis === 'source' ? '' : '?')]))));
}
writeFileSync(new URL('../content/decks.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
