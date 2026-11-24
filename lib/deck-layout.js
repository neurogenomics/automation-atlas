// Deck layout solver (#140): one layout per setup, solved from geometry, used
// by the planner's capacity check (deckNeeds), the physical ledger (source
// wells), the PyLabRobot exporter (every carrier, rail, slot and module) and
// the Decide page. Generic: no instrument is named here. The facts come from
// content: a handler's deck record in content/pylabrobot-export.json (track
// count and width or the slot deck, carrier types, candidate reservoirs,
// module widths), resource geometry in content/pylabrobot-labware.json, slot
// rules in content/decks.json (#131) and channel fit in content/labware.json
// `physical.channelFit`.
//
// Two kinds of deck:
//  - carriers on tracks: items go to carrier sites (tips on a tip carrier,
//    sample plates and the module sites they move to on a carrier for their
//    plate type, with its insert when the plate is unskirted, reagents and
//    waste on a carrier for theirs), carriers and modules with their own
//    footprint are packed from track 1 by width, and everything must end
//    within the last track;
//  - slots: modules and fixed items (the trash) go where the slot rules allow
//    (placeModules), then the sample plate, waste, reservoir, destination plate
//    and trough take pipettable slots, tips take slots that hold tips only
//    first, and anything left goes to gripper-only staging slots with a check.
// Then as many more reservoirs as the reagents need are added while room is
// left, so each reagent gets its own cavity when the deck can hold them.
//
// The reservoir type is chosen from the handler's candidates: those whose
// cavity takes the independent channels of a head at the channel pitch
// (one column of the plate per pass), then the most distinct cavities for the
// reagents, the fewest reservoirs, the largest cavity.
import exportData from '../content/pylabrobot-export.json' with {type: 'json'};
import plrLabware from '../content/pylabrobot-labware.json' with {type: 'json'};
import labwareData from '../content/labware.json' with {type: 'json'};
import decksData from '../content/decks.json' with {type: 'json'};
import {passGroup, reagentKey} from './physical.js';
import {channelsFor, labwareModels, pipetteConfigs, placeModules} from './work.js';

const RES = plrLabware.resources;
const FIT = labwareData.physical.channelFit;
const ADDS = new Set(['free', 'contact', 'wash', 'removal+add']);

// The PyLabRobot plate the samples are pipetted in: the first definition that
// is an instance of the workflow's labware type, plain plates first. A tube
// workflow is written as one 96-well plate whose wells hold what the tube holds.
export function samplePlate(model) {
  const LW = labwareData.labware;
  const typeId = model.labware?.id || labwareData.legacy[model.format];
  const plateMode = model.format === 'plate';
  const plateTypeId = plateMode ? typeId : Object.keys(LW).filter(k => LW[k].format === 'plate' && LW[k].wells === 96).sort((x, y) => LW[x].maxUl - LW[y].maxUl).find((k, i, all) => LW[k].maxUl >= (LW[typeId]?.maxUl || 0) || i === all.length - 1);
  const matches = (labwareModels[plateTypeId] || []).filter(m => RES[m.id].type === 'Plate' || plateMode).sort((x, y) => (RES[x.id].type !== 'Plate') - (RES[y.id].type !== 'Plate'));
  const id = matches[0]?.id || null;
  return {typeId, plateTypeId, plateMode, matches, id, wells: (id && RES[id].wells) || 96, skirted: !!id && RES[id].plate_type === 'skirted'};
}

// Reagents a robot could draw from a reservoir, in order of first use: every
// addition with a stated volume. An upper bound: steps a person does leave
// their cavity unused.
export function reagentsOf(model) {
  const out = [];
  for (const a of model.chunks.flatMap(c => c.actions)) if (ADDS.has(a.contact) && a.volumeUl != null) { const k = reagentKey(a); if (!out.includes(k)) out.push(k); }
  return out;
}

// Labware the capacity check counts besides what the layout places: the
// sample plates (or tube racks), whether samples move to a second plate, and
// plates for small-volume reagents and indexes. The layout places one sample
// plate (the exporter writes one) and the second plate, and keeps room for the
// rest before adding reservoirs.
export function extraLabware(model, providers, workload) {
  const plate = model.format === 'plate';
  const acts = model.chunks.flatMap(c => c.actions);
  const small = acts.some(a => a.contact === 'contact' || a.contact === 'batch');
  const cold = providers.find(p => p.op === 'heating-cooling' && p.via === 'module');
  return {
    samples: {what: plate ? 'Sample plates' : 'Sample tube racks', positions: plate ? Math.ceil(workload / (model.unitSize || 96)) : Math.ceil(workload / decksData.labware.tubesPerRack), kind: 'labware'},
    dest: acts.some(a => a.contact === 'sample-move'),
    others: [
      ...(small ? [{what: cold ? `Small-volume reagents and mixes (on the ${cold.module})` : 'Small-volume reagents and mixes', positions: cold ? 0 : 1, kind: 'labware'}] : []),
      ...(acts.some(a => a.contact === 'contact' && (a.materials || []).some(m => m.class === 'oligo')) ? [{what: 'Index plate (one index per sample)', positions: 1, kind: 'labware'}] : []),
    ],
  };
}

// Channels at the pitch that fit one cavity, clear of its walls (#111).
export const channelsInCavity = lengthMm => lengthMm ? Math.floor((lengthMm - 2 * FIT.edgeMm) / FIT.pitchMm) + 1 : Infinity;
const rackSize = (h, size) => { const s = Object.keys(h.tipRacks).map(Number).sort((a, b) => a - b); return s.find(x => x >= size) ?? s[s.length - 1]; };
const reservoirName = i => i ? `reservoir_${i + 1}` : 'reservoir';
const troughName = i => i ? `trough_${i + 1}` : 'trough';

// The deck layout of a setup, or null when the handler has no deck record.
// cfg: the pipette configuration; without one (the capacity check before a
// configuration is chosen) every head the handler can carry is provided for.
export function deckLayout(model, handler, providers = [], cfg = null, workload = 96) {
  const h = exportData.handlers[handler?.id];
  if (!h?.reservoirs) return null;
  const plate = samplePlate(model);
  const heads = cfg ? cfg.heads : [...new Map((pipetteConfigs(handler) || []).flatMap(c => c.heads).map(x => [x.id, x])).values()];
  const modes = channelsFor(handler.id)?.heads || {};
  const trough = heads.some(x => x.channels >= plate.wells);
  const tipSizes = [...new Set(heads.flatMap(x => x.tips).map(s => rackSize(h, s)))].sort((a, b) => a - b);
  const reagents = reagentsOf(model);
  // Independent channels spread over one plate column per pass: each cavity must take that many.
  const spread = Math.max(0, ...heads.map(x => passGroup(x, modes[x.id]?.mode || null, null, plate.wells)).filter(g => g?.style === 'channels').map(g => g.group));
  const modules = [...new Set(providers.filter(p => p.via === 'module' && p.module && p.op !== 'vessel-transfer' && p.op !== 'storage').map(p => p.module))];
  // As the capacity check counts it (#131): without a configuration, only if every configuration has a multichannel head.
  const multichannel = cfg ? cfg.heads.some(x => x.channels > 1) : (pipetteConfigs(handler) || []).every(c => c.heads.some(x => x.channels > 1));
  const extra = extraLabware(model, providers, workload);
  // Room kept for labware the layout does not place: further sample plates, small-volume and index plates.
  const reserve = extra.samples.positions - 1 + extra.others.reduce((n, i) => n + i.positions, 0);
  // On a deck counted in plate positions too (content/decks.json), reservoirs never take the last room for one rack of each tip size.
  const D = decksData.handlers[handler.id];
  const others = extra.others.reduce((n, i) => n + i.positions, 0);
  const room = D?.positions != null ? D.positions - modules.reduce((n, m) => n + (D.modules?.[m]?.positions ?? 1), 0) - extra.samples.positions - (extra.dest ? 1 : 0) - 1 /* waste */ - (trough ? 1 : 0) - others - tipSizes.length : Infinity;
  const opts = {plate, trough, troughsNeed: trough ? reagents.length : 0, tipSizes, modules, multichannel, dest: extra.dest, reserve, maxReservoirs: Math.max(1, room)};
  const types = h.reservoirs.map(r => {
    const R = RES[r];
    return {resource: r, label: r, wellsPerPlate: R.wells || 1, capacityUl: R.well?.max_volume_ul ?? null, lengthMm: R.well?.size_mm?.[1] ?? null};
  });
  const fitting = types.filter(t => !spread || spread <= channelsInCavity(t.lengthMm));
  const checks = [];
  const pool = fitting.length ? fitting : [types.slice().sort((x, y) => (y.lengthMm || 0) - (x.lengthMm || 0))[0]];
  if (!fitting.length) checks.push(`No candidate reservoir has cavities that take ${spread} channels at ${FIT.pitchMm} mm; the longest is used and the ledger flags it.`);
  let best = null;
  for (const t of pool) {
    const need = Math.min(opts.maxReservoirs, Math.max(1, Math.ceil(reagents.length / t.wellsPerPlate)));
    const r = h.layout === 'carriers' ? carriers(h, {...opts, reservoir: t.resource, need}) : slots(h, handler.id, {...opts, need});
    if (!r.ok) { if (!best) best = {...r, type: t}; continue; }
    const cav = r.plates * t.wellsPerPlate;
    const key = [Math.min(cav, reagents.length || 1), -r.plates, t.capacityUl || 0];
    const i = best?.ok ? key.findIndex((x, j) => x !== best.key[j]) : -1;
    if (!best?.ok || (i >= 0 && key[i] > best.key[i])) best = {...r, type: t, key};
  }
  const t = best.type;
  const out = {
    ok: !!best.ok, why: best.why || null, kind: h.layout, plate: {id: plate.id, skirted: plate.skirted, wells: plate.wells}, dest: extra.dest, trough, tipSizes, extra, reagents: reagents.length, spread,
    reservoir: {...t, plates: best.ok ? best.plates : 0, names: best.ok ? Array.from({length: best.plates}, (_, i) => reservoirName(i)) : []},
    cavities: best.ok ? best.plates * t.wellsPerPlate : 0,
    troughs: best.ok ? best.troughs : 0, troughNames: best.ok ? Array.from({length: best.troughs}, (_, i) => troughName(i)) : [],
    positions: best.positions || {}, modules: best.modules || {}, carriers: best.carriers || null, own: best.own || null, fixed: best.fixed || null,
    checks: [...checks, ...(best.checks || [])], tracks: best.tracks || null,
  };
  out.rows = rows(out);
  return out;
}

// The reservoir and well that cavity n of the layout is: reservoirs are filled in order.
export const troughOf = (layout, i) => layout.troughNames[i] || troughName(i);
export function reservoirWell(layout, n) {
  const w = layout.reservoir.wellsPerPlate, j = Math.floor(n / w);
  return {name: layout.reservoir.names[j] || reservoirName(j), index: n % w, plate: j};
}

// Carriers on tracks.
function carriers(h, o) {
  const T = h.tracks;
  const span = mm => Math.ceil(mm / T.widthMm - 1e-6);
  const type = holds => h.carrierTypes.find(t => t.holds === holds);
  const kindOf = id => RES[id]?.plate_type === 'skirted' ? 'skirted' : 'non-skirted';
  const tipT = type('tips'), sampleT = type(o.plate.skirted ? 'skirted' : 'non-skirted'), reagentT = type(kindOf(o.reservoir));
  if (!tipT || !sampleT || !reagentT) return {ok: false, why: 'No carrier type is recorded for this deck\'s tips, plates or reservoirs.'};
  const siteMods = o.modules.filter(m => h.modules?.[m]?.site), ownMods = o.modules.filter(m => h.modules?.[m]?.widthMm);
  const build = (n, t) => {
    const pools = [
      {type: tipT, var: tipT.var, items: o.tipSizes.map(s => ({k: `tips_${s}`, tips: s}))},
      {type: sampleT, var: sampleT.var, items: [{k: 'plate'}, ...(o.dest ? [{k: 'dest'}] : []), ...siteMods.map(m => ({module: m}))]},
      {type: reagentT, var: 'reagent_carrier', items: [{k: 'waste'}, ...Array.from({length: t}, (_, i) => ({k: troughName(i)})), ...Array.from({length: n}, (_, i) => ({k: reservoirName(i), reservoir: true}))]},
    ];
    if (sampleT === reagentT) { pools[1].items.push(...pools[2].items); pools.pop(); }
    const list = [];
    let track = 1;
    for (const pool of pools) {
      const F = RES[pool.type.factory], per = F.sites?.count || 1, width = span(F.size_mm[0]);
      for (let c = 0; c * per < pool.items.length; c++) {
        list.push({var: c ? `${pool.var}_${c + 1}` : pool.var, factory: pool.type.factory, adapter: pool.type.adapter || null, holds: pool.type.holds, track, width, sites: pool.items.slice(c * per, (c + 1) * per)});
        track += width;
      }
    }
    const own = ownMods.map(m => { const w = span(h.modules[m].widthMm); const r = {module: m, track, width: w}; track += w; return r; });
    return {list, own, end: track - 1};
  };
  const t0 = o.trough ? 1 : 0;
  let n = o.need, t = t0, b = build(n, t);
  while (b.end > T.count && n > 1) b = build(--n, t);
  // With every reservoir placed, a trough per reagent for the head that works the whole plate, while room is left.
  while (n === o.need && t >= 1 && t < o.troughsNeed && n + t < o.maxReservoirs + 1) { const nb = build(n, t + 1); if (nb.end > T.count) break; b = nb; t++; }
  if (b.end > T.count) return {ok: false, why: `The carriers and modules need ${b.end} tracks; the deck has ${T.count}.`, tracks: {used: b.end, count: T.count}};
  const positions = {}, modules = {};
  for (const c of b.list) c.sites.forEach((s, i) => {
    const at = {carrier: c.var, site: i, track: c.track, adapter: c.adapter};
    if (s.module) modules[s.module] = at; else positions[s.k] = at;
  });
  for (const x of b.own) modules[x.module] = {track: x.track, width: x.width};
  const checks = n < o.need ? [`Room for ${n} of the ${o.need} reservoirs the reagents need: some reagents share a cavity.`] : [];
  return {ok: true, plates: n, troughs: t, positions, modules, carriers: b.list, own: b.own, tracks: {used: b.end, count: T.count}, checks};
}

// Slots (#131 rules).
function slots(h, handlerId, o) {
  const P = decksData.handlers[handlerId]?.placement;
  if (!P) return {ok: false, why: 'No slot rules are recorded for this deck.'};
  const pl = placeModules(P, o.modules, o.multichannel);
  if (!pl.ok) return {ok: false, why: pl.why};
  const lost = new Set(pl.lost.map(x => x.slot)), tipsOnly = pl.tips.map(x => x.slot), expLost = new Set(pl.expansionLost.map(x => x.slot));
  const general = P.slots.filter(x => !x.expansion && !pl.slots[x.id] && !lost.has(x.id) && !tipsOnly.includes(x.id)).map(x => x.id);
  const staging = P.slots.filter(x => x.expansion && !expLost.has(x.id)).map(x => x.id);
  const positions = {}, checks = [];
  const take = (k, pools) => {
    for (const pool of pools) if (pool.length) { const slot = pool.shift(); positions[k] = {slot, staging: pool === staging}; if (pool === staging && h.stagingCheck) checks.push(h.stagingCheck.replace('{k}', k).replace('{slot}', slot)); return true; }
    return false;
  };
  for (const k of ['plate', 'waste', 'reservoir', ...(o.dest ? ['dest'] : []), ...(o.trough ? ['trough'] : [])]) if (!take(k, [general, staging])) return {ok: false, why: `No slot left for the ${k}.`};
  for (const s of o.tipSizes) if (!take(`tips_${s}`, [tipsOnly, general, staging])) return {ok: false, why: `No slot left for the ${s} µl tips.`};
  let n = 1;
  while (n < o.need && general.length > o.reserve) take(reservoirName(n++), [general]);
  if (n < o.need) checks.push(`Room for ${n} of the ${o.need} reservoirs the reagents need: some reagents share a cavity.`);
  let t = o.trough ? 1 : 0;
  while (n === o.need && t >= 1 && t < o.troughsNeed && general.length > o.reserve) take(troughName(t++), [general]);
  const row = id => P.slots.find(x => x.id === id).row;
  const modules = {}, fixed = {};
  const held = name => Object.entries(pl.slots).filter(([, x]) => x === name).map(([id]) => id);
  // A module over several slots is addressed by its frontmost one.
  for (const m of o.modules) { const s = held(m); if (s.length) modules[m] = {slot: s.slice().sort((x, y) => row(x) - row(y))[0], slots: s}; }
  for (const f of P.fixed || []) {
    const s = held(f.name)[0];
    fixed[f.name] = s;
    if (f.default && s !== f.default) checks.push(`${f.name} is in ${s}, not its default ${f.default}: set it there in the robot's deck configuration.`);
  }
  return {ok: true, plates: n, troughs: t, positions, modules, fixed, checks};
}

// One line per thing on the deck, for the Decide page.
function rows(L) {
  if (!L.ok) return [];
  const where = p => p.slot ? `slot ${p.slot}${p.staging ? ' (staging, gripper only)' : ''}` : p.carrier ? `${p.carrier} site ${p.site + 1} (track ${p.track})${p.adapter ? ` in ${p.adapter}` : ''}` : `track ${p.track}`;
  const label = k => k === 'plate' ? `Sample plate (${L.plate.id})` : k === 'dest' ? 'Plate to move samples into' : k === 'waste' ? 'Liquid waste' : k.startsWith('trough') ? `Trough ${L.troughNames.indexOf(k) + 1} for the 96-channel head` : k.startsWith('reservoir') ? `Reservoir ${L.reservoir.names.indexOf(k) + 1} (${L.reservoir.resource}, ${L.reservoir.wellsPerPlate} cavit${L.reservoir.wellsPerPlate === 1 ? 'y' : 'ies'})` : k.startsWith('tips_') ? `${k.slice(5)} µl tips` : k;
  const out = Object.entries(L.positions).map(([k, p]) => ({what: label(k), where: where(p)}));
  for (const [m, p] of Object.entries(L.modules)) out.push({what: m, where: p.slots?.length > 1 ? `slots ${p.slots.join(', ')}` : p.width ? `tracks ${p.track}–${p.track + p.width - 1}` : where(p)});
  for (const [n, s] of Object.entries(L.fixed || {})) out.push({what: n, where: `slot ${s}`});
  if (L.carriers) for (const c of L.carriers) out.push({what: `Carrier ${c.var} (${c.factory})`, where: `tracks ${c.track}–${c.track + c.width - 1}`});
  return out;
}
