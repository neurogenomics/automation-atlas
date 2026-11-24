import {readFileSync} from 'node:fs';
// Validate the generic data the site ships. Nothing here is lab-specific.
import assert from 'node:assert/strict';
import operations from '../content/operations.json' with {type: 'json'};
import lexicon from '../content/lexicon.json' with {type: 'json'};
import substitutions from '../content/substitutions.json' with {type: 'json'};
import map from '../content/equipment-map.json' with {type: 'json'};
import labware from '../content/labware.json' with {type: 'json'};
import fit from '../content/labware-fit.json' with {type: 'json'};
import {registry} from '../content/registry.js';
import {handlers, classes, labwareModels, pylabrobotSource} from '../lib/work.js';
import plrLabware from '../content/pylabrobot-labware.json' with {type: 'json'};
import plrExport from '../content/pylabrobot-export.json' with {type: 'json'};
import deckData from '../content/decks.json' with {type: 'json'};
const deckHandlers = deckData.handlers;
import prices from '../content/prices.json' with {type: 'json'};

const ops = operations.operations;
const deviceOps = new Set([...Object.keys(ops), 'heating-cooling', 'fluorescence-reading', 'vessel-transfer', 'storage']);
for (const [k, o] of Object.entries(ops)) {
  for (const f of ['person', 'machine', 'scale', 'label']) assert.ok(o[f] != null, `${k} lacks ${f}`);
  for (const by of [].concat(o.performedBy || [])) assert.ok(deviceOps.has(by), `${k} performedBy unknown ${by}`);
}
for (const p of [...lexicon.tableValues, ...lexicon.inputs, ...lexicon.notes, ...lexicon.headers, lexicon.programme, lexicon.continuation, lexicon.verbs, lexicon.combinedVolume]) new RegExp(p, 'i');
assert.equal(new RegExp(lexicon.combinedVolume, 'i').exec('resuspend 1 µl a in 2 ml b')?.length, 5, "lexicon combinedVolume captures X, X's unit, Y and Y's unit");
for (const r of lexicon.rules) { new RegExp(r.pattern, 'i'); assert.ok(ops[r.operation], `lexicon rule uses unknown operation ${r.operation}`); }
for (const s of substitutions.substitutions) { assert.ok(ops[s.from], s.id); assert.ok(deviceOps.has(s.to), s.id); assert.ok(s.question && s.owner, s.id); }
// Labelled alternatives and defined washes (#171): every pattern compiles; the bare label needs an explicit one beside it.
for (const p of [...lexicon.alternatives.explicit, lexicon.alternatives.bare, lexicon.alternatives.inUse, lexicon.alternatives.end, ...Object.entries(lexicon.washes).filter(([k]) => k !== 'about').map(([, v]) => v)]) new RegExp(p, 'i');
assert.ok(new RegExp(lexicon.washes.first, 'i').exec('(incubation of the first wash is 10 min)')?.[1], 'lexicon washes.first captures the duration');
// A substitution a workflow scopes to stages is never a general fallback, so it must say so.
for (const s of substitutions.substitutions.filter(x => x.when?.scoped)) assert.ok(s.scopedAbout && s.weight, `${s.id}: scoped substitutions explain their scope and carry a weight`);
for (const op of [...Object.values(map.registryCapabilities), ...map.moduleNames.map(m => m.operation), ...map.measurementByDescription.map(m => m.operation)]) assert.ok(deviceOps.has(op), `equipment map uses unknown operation ${op}`);
for (const [k, l] of Object.entries(labware.labware)) {
  assert.ok(l.label && ['plate', 'tube'].includes(l.format) && Number.isInteger(l.wells) && l.wells >= 1 && l.maxUl > 0, `labware ${k} is incomplete`);
  assert.equal(l.format === 'tube', l.wells === 1, `labware ${k}: tubes hold one sample, plates more`);
  new RegExp(l.mentions, 'i');
}
for (const id of Object.values(labware.legacy)) assert.ok(labware.labware[id], `legacy labware ${id} is not in the catalogue`);
// Researched labware fit (#55): every record covers every labware type, and
// every settled answer cites a primary source.
const fitStatuses = new Set(['yes', 'adapter', 'no', 'unknown']);
const subjects = new Set([...handlers.map(h => h.id), ...Object.keys(classes), ...map.marketOperations ? Object.keys(map.marketOperations) : []]);
let settled = 0;
for (const r of fit.records) {
  const at = `${r.subject}/${r.part}/${r.module}`;
  assert.ok(r.subject && r.part && r.module, `fit record ${at} lacks subject, part or module`);
  assert.ok(r.part === 'deck' || deviceOps.has(r.part), `fit record ${at} uses unknown part ${r.part}`);
  for (const id of Object.keys(labware.labware)) {
    const f = r.fits[id];
    assert.ok(f && fitStatuses.has(f.status), `fit record ${at} has no valid answer for ${id}`);
    // A settled answer cites a URL, or (#281) a manufacturer's written reply kept in the lab mailbox, as content/prices.json does.
    const mailbox = f.source?.sourceKind === 'manufacturer correspondence' && /^lab mailbox: .+\d{4}$/.test(f.source?.reference || '');
    if (f.status !== 'unknown') { settled++; assert.ok(/^https?:\/\//.test(f.source?.url || '') || mailbox, `fit record ${at} ${id} is ${f.status} without a source URL or mailbox reference`); }
  }
  for (const id of Object.keys(r.fits)) assert.ok(labware.labware[id], `fit record ${at} names unknown labware ${id}`);
}
const unmatched = [...new Set(fit.records.map(r => r.subject))].filter(s => !subjects.has(s));
if (unmatched.length) console.log(`Note: fit subjects not used by the engine (kept as evidence): ${unmatched.join(', ')}`);
console.log(`Verified ${fit.records.length} labware-fit records, ${settled} sourced answers.`);
// The PyLabRobot resource library is pinned to the same commit as the device
// registry, and every planner labware type still matches at least one of its
// definitions. A PyLabRobot update that breaks either fails here.
assert.equal(plrLabware.provenance.commit, registry.provenance.commit, 'PyLabRobot labware and registry imports are pinned to different commits');
assert.ok(plrLabware.count >= 100, 'PyLabRobot resource library looks truncated');
for (const [id, models] of Object.entries(labwareModels)) assert.ok(models.length, `no PyLabRobot definition matches labware ${id}`);
// PyLabRobot skeletons (#99): the API table is cited at the pinned commit and
// every resource it names is in the pinned library. Lines are re-found with
// scripts/check-pylabrobot-api.mjs (needs the network or a local checkout).
assert.equal(plrExport.commit, registry.provenance.commit, 'content/pylabrobot-export.json API lines are for another PyLabRobot commit: run node scripts/check-pylabrobot-api.mjs --commit <pinned> --write');
assert.ok(readFileSync(new URL(`../${plrExport.pin.file}`, import.meta.url), 'utf8').split('\n')[plrExport.pin.line - 1].includes(registry.provenance.commit), 'pylabrobot-export pin line does not hold the commit');
for (const [id, h] of Object.entries(plrExport.handlers)) {
  assert.ok(handlers.some(x => x.id === id), `pylabrobot-export: unknown handler ${id}`);
  assert.ok(plrExport.dialects[h.dialect], `pylabrobot-export: ${id} dialect ${h.dialect}`);
  for (const r of [...(h.reservoirs || []), h.trough, h.waste, ...Object.values(h.tipRacks), ...(h.carrierTypes || []).flatMap(c => [c.factory, c.adapter].filter(Boolean))]) assert.ok(plrLabware.resources[r], `pylabrobot-export: ${id} names ${r}, not in the pinned library`);
  // Deck layout (#140): positions are solved from geometry, never hand-placed.
  for (const k of ['carriers', 'slots', 'staging', 'trashSlot', 'reservoir']) assert.ok(!(k in h), `pylabrobot-export: ${id} has a hand-placed '${k}'; the deck layout solver places it (lib/deck-layout.js)`);
  assert.ok(h.reservoirs?.length, `pylabrobot-export: ${id} lists no candidate reservoirs`);
  if (h.layout === 'carriers') {
    assert.ok(h.tracks?.count > 0 && h.tracks.widthMm > 0 && /^https:\/\//.test(h.tracks.source?.url || '') && h.tracks.source.quote, `pylabrobot-export: ${id} needs a sourced track count and width`);
    for (const k of ['tips', 'skirted', 'non-skirted']) assert.ok(h.carrierTypes?.some(c => c.holds === k), `pylabrobot-export: ${id} has no carrier type for ${k}`);
  } else assert.ok(deckHandlers[id]?.placement, `pylabrobot-export: ${id} places by slot but content/decks.json has no slot rules for it`);
  // Module placements (#109): one per module the planner can put on this deck,
  // each sourced or a marked placeholder; drivers only from registry records.
  assert.ok(h.move, `pylabrobot-export: ${id} has no plate-move template`);
  for (const m of Object.keys(deckHandlers[id]?.modules || {})) assert.ok(h.modules?.[m], `pylabrobot-export: ${id} has no placement for ${m}`);
  for (const [m, M] of Object.entries(h.modules || {})) {
    assert.ok(['source', 'placeholder'].includes(M.basis) && M.check, `pylabrobot-export: ${id}/${m} needs a basis and a check`);
    if (M.basis === 'source') assert.ok(/^https:\/\//.test(M.source?.url || '') && M.source.quote, `pylabrobot-export: ${id}/${m} is marked sourced without a source`);
    assert.ok(!('slot' in M) && !('occupies' in M) && !/rails=\d/.test(M.assign || ''), `pylabrobot-export: ${id}/${m} is hand-placed; the deck layout solver places it`);
    if (h.layout === 'carriers') assert.ok(M.site || (M.target && M.create && M.widthMm > 0 && /\{track\}/.test(M.assign || '') && /^https:\/\//.test(M.widthSource?.url || '')), `pylabrobot-export: ${id}/${m} needs a carrier site, or its own resource with a sourced width`);
    if (M.driver) assert.ok(registry.records.some(r => r.id === M.driver), `pylabrobot-export: ${id}/${m} driver ${M.driver} is not in the pinned registry`);
    if (M.ops) assert.ok(M.driver, `pylabrobot-export: ${id}/${m} calls a driver without naming its registry record`);
  }
}
console.log(`Verified PyLabRobot resource library at ${pylabrobotSource.commit.slice(0, 7)}: ${plrLabware.count} definitions; ${Object.entries(labwareModels).map(([id, m]) => `${id} ${m.length}`).join(', ')}.`);
console.log(`Verified ${Object.keys(ops).length} operations, ${lexicon.rules.length} lexicon rules, ${substitutions.substitutions.length} method changes, ${Object.keys(labware.labware).length} labware types.`);
assert.equal(registry.records.length, registry.audit.inputCount, 'Incomplete upstream import');
assert.equal(new Set(registry.records.map(r => r.id)).size, registry.records.length);
assert.equal(registry.provenance.commit.length, 40);
assert.ok(registry.provenance.licenseText.includes('Copyright (c) 2018 dgretton'));
assert.ok(handlers.length >= 10 && Object.keys(classes).length >= 8);
console.log(`Verified ${registry.records.length} pinned registry records (MIT notice retained), ${handlers.length} liquid handlers, ${Object.keys(classes).length} device classes.`);
// Prices (#57): every amount has a kind, a currency with an HMRC rate and a
// source (a public URL, or a reference to a quotation held by the lab); every
// line points at recorded evidence; prices attach only to real instruments,
// modules and device classes.
const kinds = new Set(['quote', 'list', 'award', 'used-asking', 'used-sold']);
const ev = new Map(prices.evidence.map(e => [e.id, e]));
assert.equal(ev.size, prices.evidence.length, 'duplicate price evidence ids');
for (const e of prices.evidence) {
  assert.ok(kinds.has(e.kind), `price ${e.id} has unknown kind ${e.kind}`);
  assert.ok(Number.isFinite(e.amount) && e.amount > 0, `price ${e.id} has no amount`);
  assert.ok(prices.fx.unitsPerGBP[e.currency], `price ${e.id}: no exchange rate for ${e.currency}`);
  assert.ok(/^https?:\/\//.test(e.source?.url || '') || (e.kind === 'quote' || e.source?.reference) && e.source?.reference, `price ${e.id} has neither a source URL nor a reference`);
  assert.ok(/^\d{4}(-\d{2})?/.test(e.date), `price ${e.id} has no date`);
}
const lineEvidence = line => line.options.flatMap(o => o.evidence);
const engineModules = new Map(handlers.map(h => [h.id, new Set(Object.values(h.ops).map(o => o.module).filter(Boolean))]));
let priceRefs = 0;
for (const [hid, h] of Object.entries(prices.handlers)) {
  assert.ok(engineModules.has(hid), `prices for unknown liquid handler ${hid}`);
  for (const m of Object.keys(h.modules || {})) assert.ok(engineModules.get(hid).has(m), `prices for ${hid} name unknown module ${m}`);
  for (const line of [h.base, h.annual, h.tips, ...Object.values(h.modules || {}), ...(h.services || []), ...(h.bundles || [])].filter(Boolean))
    for (const id of lineEvidence(line)) { priceRefs++; assert.ok(ev.has(id), `${hid} cites missing price evidence ${id}`); }
}
for (const [op, line] of Object.entries(prices.classes)) {
  assert.ok(Object.keys(classes).includes(op), `prices for unknown device class ${op}`);
  for (const id of lineEvidence(line)) { priceRefs++; assert.ok(ev.has(id), `${op} cites missing price evidence ${id}`); }
}
const byKind = prices.evidence.reduce((m, e) => ({...m, [e.kind]: (m[e.kind] || 0) + 1}), {});
console.log(`Verified ${prices.evidence.length} price records (${Object.entries(byKind).map(([k, n]) => `${n} ${k}`).join(', ')}), ${priceRefs} references, rates ${prices.fx.period}.`);
// Material classes (#61): patterns compile and every property is defined.
import materials from '../content/materials.json' with {type: 'json'};
for (const [id, c] of Object.entries(materials.classes)) {
  for (const p of c.patterns) new RegExp(p, 'i');
  for (const k of Object.keys(c.properties)) assert.ok(materials.properties[k], `material ${id} uses unknown property ${k}`);
  for (const b of Object.values(c.properties)) assert.ok(['lab evidence', 'general practice'].includes(b), `material ${id}: unknown basis ${b}`);
}
for (const k of ['transfer', 'onMagnet', 'offMagnet', 'removal', 'addition', 'mixHere', 'keepCold', 'sampleSpecific', 'addedPart', 'sampleHold']) new RegExp(materials[k], 'i');
for (const p of [...Object.values(materials.agitation), ...Object.values(materials.tips)]) new RegExp(p, 'i');
console.log(`Verified ${Object.keys(materials.classes).length} material classes and ${Object.keys(materials.properties).length} handling properties.`);
// Plate positions (#63): every entry names a real handler module and a mode.
import positions from '../content/positions.json' with {type: 'json'};
for (const [hid, mods] of Object.entries(positions.handlers)) {
  const h = handlers.find(x => x.id === hid);
  assert.ok(h, `positions for unknown handler ${hid}`);
  const names = new Set([...Object.values(h.ops).map(o => o.module).filter(Boolean), ...Object.keys(JSON.parse(readFileSync(new URL('../content/module-capabilities.json', import.meta.url), 'utf8')).handlers[hid] || {})]);
  for (const [name, p] of Object.entries(mods)) {
    assert.ok(names.has(name), `positions: ${hid} has no module ${name}`);
    assert.ok(['move-on', 'in-place'].includes(p.mode), `positions: ${hid}/${name} mode`);
    assert.ok(p.basis !== 'source' || /^https:\/\//.test(p.source?.url || ''), `positions: ${hid}/${name} says source without a URL`);
  }
}
console.log(`Verified plate positions for ${Object.keys(positions.handlers).length} handlers.`);
// Module ranges (#65): every recorded module is real, and every range cites a source or says it is unverified.
import caps from '../content/module-capabilities.json' with {type: 'json'};
for (const [hid, mods] of Object.entries(caps.handlers)) for (const [name, m] of Object.entries(mods)) {
  assert.ok(/^https:\/\//.test(m.source?.url || '') || m.source?.unverified, `module range ${hid}/${name} has no source`);
  if (m.temperature) assert.ok(['absolute', 'relative', 'none'].includes(m.temperature.cooling), `${hid}/${name} cooling`);
}
for (const [op, list] of Object.entries(caps.classes)) for (const d of list) assert.ok(/^https:\/\//.test(d.source?.url || '') || d.source?.unverified, `device range ${op}/${d.name} has no source`);
console.log(`Verified module ranges for ${Object.keys(caps.handlers).length} handlers and ${Object.values(caps.classes).flat().length} connected devices.`);
// Pipettes (#67): configurations name recorded heads, and heads have ranges and tips.
import pipettes from '../content/pipettes.json' with {type: 'json'};
assert.ok(Number.isFinite(pipettes.defaults.unknownRangeManualBelowUl) && pipettes.defaults.unknownRangeManualBelowUl > 0, 'Unverified head planning floor must be positive');
for (const [hid, d] of Object.entries(pipettes.handlers)) {
  assert.ok(handlers.some(h => h.id === hid), `pipettes for unknown handler ${hid}`);
  const ids = new Set(d.heads.map(h => h.id));
  for (const h of d.heads) assert.ok(h.channels >= 1 && h.minUl > 0 && h.maxUl >= h.minUl && h.tips.length, `pipette head ${hid}/${h.id} incomplete`);
  for (const c of d.configurations) for (const id of c.heads) assert.ok(ids.has(id), `${hid} configuration ${c.id} names unknown head ${id}`);
}
// A bundle sold in several pipette versions names configurations that exist (#60).
for (const [hid, own] of Object.entries(prices.handlers)) for (const b of own.bundles || []) for (const o of b.options) for (const id of o.pipettes || [])
  assert.ok(pipettes.handlers[hid]?.configurations.some(c => c.id === id), `${hid} bundle option “${o.label}” names unknown pipette configuration ${id}`);
console.log(`Verified pipette data for ${Object.keys(pipettes.handlers).length} handlers.`);
// Deck space (#69): positions are counts and module footprints are whole positions.
import decks from '../content/decks.json' with {type: 'json'};
for (const [hid, d] of Object.entries(decks.handlers)) {
  assert.ok(handlers.some(h => h.id === hid), `deck for unknown handler ${hid}`);
  assert.ok(['grid', 'rails', 'tiers', 'clip-in'].includes(d.type), `deck ${hid} type`);
  if (d.type === 'clip-in') continue;
  assert.ok(Number.isInteger(d.positions) && d.positions > 0, `deck ${hid} positions`);
  if (d.type === 'tiers') assert.equal(d.tiers.reduce((n, t) => n + t.positions, 0), d.positions, `deck ${hid} tiers`);
  for (const [name, m] of Object.entries(d.modules)) assert.ok(Number.isInteger(m.positions) && m.positions >= 0, `deck ${hid}/${name} footprint`);
}
console.log(`Verified deck layouts for ${Object.keys(decks.handlers).length} handlers.`);
// Channels, programming route and PyLabRobot support (#82): every catalogue
// liquid handler has an entry, every recorded head has a cited channel mode,
// and PyLabRobot support comes from the registry pinned with the labware library.
import channelFeatures from '../content/handler-channels.json' with {type: 'json'};
import pipettesForFeatures from '../content/pipettes.json' with {type: 'json'};
const modes = new Set(['independent', 'fixed', 'fixed-partial']);
const cited = (s, at) => { assert.ok(/^https:\/\//.test(s?.url || ''), `${at} lacks an https source`); assert.ok((s.quote || '').length > 0, `${at} lacks a quote`); };
for (const h of handlers) {
  const f = channelFeatures.handlers[h.id];
  assert.ok(f, `handler-channels.json has no entry for ${h.id}`);
  for (const head of pipettesForFeatures.handlers[h.id]?.heads || []) {
    const e = f.heads?.[head.id];
    assert.ok(e && (modes.has(e.mode) || (e.mode === null && e.note)), `${h.id}/${head.id} has no channel mode (null needs a note saying what was not found)`);
    cited(e.source, `${h.id}/${head.id}`);
    if (e.mode === 'independent') assert.ok(head.channels > 1 ? e.independentZ !== false : true, `${h.id}/${head.id}: independent heads move each channel in Z`);
  }
  assert.ok(f.software?.vendorSoftware, `${h.id} lacks vendor software`);
  for (const k of ['noCode', 'openApi']) {
    const v = f.software[k];
    if (v?.supported === null) { assert.ok(v.note, `${h.id} ${k}: a value not found needs a note`); continue; }
    assert.equal(typeof v?.supported, 'boolean', `${h.id} ${k}.supported`); cited(v.source, `${h.id} ${k}`);
  }
  assert.ok(Object.keys(channelFeatures.pylabrobotStatuses).includes(h.pylabrobot?.status), `${h.id} PyLabRobot status ${h.pylabrobot?.status}`);
  if (h.pylabrobot.source) assert.ok(h.pylabrobot.source.includes(registry.provenance.commit), `${h.id} PyLabRobot source is not the pinned commit`);
}
for (const id of Object.keys(channelFeatures.handlers)) assert.ok(handlers.some(h => h.id === id), `handler-channels.json names unknown handler ${id}`);
console.log(`Verified channels, programming route and PyLabRobot support for ${handlers.length} liquid handlers.`);
// Dispensers (#85): each device has a known family, a primary source, and
// every figure that decides anything (range, dead volume, suspensions) is
// sourced or marked unverified; reagent dead volumes say where they come from.
import disp from '../content/dispensers.json' with {type: 'json'};
const dispIds = new Set();
for (const d of disp.devices) {
  assert.ok(!dispIds.has(d.id), `duplicate dispenser ${d.id}`); dispIds.add(d.id);
  assert.ok(disp.families[d.family], `dispenser ${d.id}: unknown family ${d.family}`);
  assert.ok(d.sources.length && d.sources.every(s => /^https:\/\//.test(s.url) && s.quote), `dispenser ${d.id}: every source needs a URL and a quote`);
  const x = d.dispense;
  assert.ok(x.minUl == null || (x.minUl > 0 && (x.maxUl == null || x.maxUl >= x.minUl)), `dispenser ${d.id}: volume range`);
  assert.ok(x.deadVolumeUl == null || (x.deadVolumeUl.length === 2 && x.deadVolumeUl[0] <= x.deadVolumeUl[1]), `dispenser ${d.id}: dead volume`);
  assert.ok([true, false, null].includes(x.suspensions) || (Array.isArray(x.suspensions) && x.suspensions.length), `dispenser ${d.id}: suspensions must be true, false, null or a list of material classes`);
  for (const f of ['minUl', 'deadVolumeUl', 'suspensions']) if (x[f] != null) assert.ok(d.basis?.[f], `dispenser ${d.id}: ${f} has no basis (source quote or 'unverified')`);
}
for (const r of [...Object.values(disp.reagentAccounting.handlerReservoir), ...Object.values(disp.reagentAccounting.manual)]) assert.ok(r.label && (r.source?.url || /assumed/i.test(r.label)), `reagent dead volume ${r.label} needs a source or to be marked assumed`);
// Master-mix overage (#119): a range of percentages, each source with a URL and quote.
{ const mm = disp.reagentAccounting.masterMix; assert.ok(mm.overagePct.length === 2 && mm.overagePct[0] <= mm.overagePct[1] && mm.sources.length && mm.sources.every(x => /^https:\/\//.test(x.url) && x.quote), 'master-mix overage needs a range and quoted sources'); }
for (const d of disp.devices) if (d.dispense.primeUl) assert.ok(d.basis?.primeUl, `${d.id}: prime volume needs its basis`);
// Dispense time (#173): figures only with a quoted https source; no figure is assumed, never zero.
for (const d of disp.devices) {
  const th = d.throughput;
  assert.ok(th && Array.isArray(th.points) && 'primeSeconds' in th, `${d.id}: throughput record`);
  for (const pt of th.points) assert.ok(pt.seconds > 0 && [96, 384, 1536].includes(pt.wells) && (pt.ul > 0 || (pt.ul === null && pt.floor)), `${d.id}: throughput figure`);
  if (th.points.length) assert.ok(/^https:\/\//.test(th.source?.url || '') && th.source.quote, `${d.id}: throughput figures need a quoted source`);
}
for (const h of disp.comparisonDefault?.handlers || []) assert.ok(JSON.parse(readFileSync(new URL('../content/pipettes.json', import.meta.url), 'utf8')).handlers[h], `comparisonDefault names unknown handler ${h}`);
// Placement rules (#131): every module's slots exist and every rule cites its source.
{ const dk = JSON.parse(readFileSync(new URL('../content/decks.json', import.meta.url), 'utf8'));
  for (const [hid, h] of Object.entries(dk.handlers)) if (h.placement) {
    const ids = new Set(h.placement.slots.map(x => x.id));
    for (const [n, m] of Object.entries(h.placement.modules)) {
      assert.ok(/^https:\/\//.test(m.source?.url || '') && m.source.quote, `${hid} ${n}: placement needs a source with a quote`);
      for (const id of [...(m.slots || []), ...(m.occupies || [])]) assert.ok(ids.has(id), `${hid} ${n}: unknown slot ${id}`);
      for (const x of m.neighbours?.sources || []) assert.ok(/^https:\/\//.test(x.url) && x.quote, `${hid} ${n}: neighbour rule source`);
    }
    assert.ok(Object.keys(h.placement.modules).every(n => h.modules[n]), `${hid}: placement names a module the deck does not list`);
  }
  console.log('Verified placement rules.'); }
// Published assay automation (#154): rebuilt from data and sourced.
{ const ae = JSON.parse(readFileSync(new URL('../content/assay-evidence.json', import.meta.url), 'utf8'));
  for (const i of ae.items) assert.ok(/^https:\/\//.test(i.url) && i.quote, `assay evidence ${i.platform}: needs a source and quote`);
  console.log(`Verified ${ae.items.length} published assay-automation reports.`); }
console.log(`Verified ${disp.devices.length} dispensers in ${Object.keys(disp.families).length} families.`);
// Features (#92): real handlers, sourced values.
import feats from '../content/handler-features.json' with {type: 'json'};
for (const [hid, fs] of Object.entries(feats.handlers)) {
  assert.ok(handlers.some(h => h.id === hid), `features for unknown handler ${hid}`);
  for (const [f, v] of Object.entries(fs)) { assert.ok(feats.features[f], `${hid}: unknown feature ${f}`); if (v.value !== null) assert.ok(/^https:\/\//.test(v.source?.url || '') && v.source.quote, `${hid}/${f} has no source`); }
}
console.log(`Verified features for ${Object.keys(feats.handlers).length} handlers.`);
