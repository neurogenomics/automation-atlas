// PyLabRobot script skeletons from a planned setup (#99). Generic: the Python
// call shapes, deck layouts, labware names and head objects are data in
// content/pylabrobot-export.json; resource definitions come from
// content/pylabrobot-labware.json at the same pinned commit. This file walks
// the simulated timeline and chooses a call shape from each step's head and
// its channel mode (independent, fixed, fixed-partial). The output parses as
// Python and says at the top that it is not validated.
//
// {simulate: true} writes the same script against the handler's PyLabRobot
// simulation backend (the handler's 'simulator' entry) with tip and volume
// tracking on, operator pauses and waits logged instead of blocking, and each
// step reported as it runs (#103). The default script is unchanged by it.
//
// The exporter keeps no physical state of its own (#123): every volume, pass,
// tip size, reagent well, refill, waste emptying and plate position comes from
// the planner's ledger (lib/physical.js) on each timeline step. Steps a person
// does are pauses; a person's plate moves update PyLabRobot's deck model, and
// in a simulation build the volume trackers are set to the ledger's volumes
// after them, since PyLabRobot cannot see what a person pipettes.
import exportData from '../content/pylabrobot-export.json' with {type: 'json'};
import plrLabware from '../content/pylabrobot-labware.json' with {type: 'json'};
import labwareData from '../content/labware.json' with {type: 'json'};
import {registry} from '../content/registry.js';
import {channelsFor, labwareModels, installationPipetteConfigs, transferLayouts} from './work.js';
import {physicalRules} from './physical.js';
import {samplePlate, reservoirWell, troughOf} from './deck-layout.js';

export const pylabrobotExport = exportData;
const RES = plrLabware.resources;
const blob = (file, line) => `https://github.com/PyLabRobot/pylabrobot/blob/${exportData.commit}/${file}#L${line}`;

// The skeleton this candidate's handler can have, or null with the reason.
export function pylabrobotTarget(c) {
  if (c?.standalone) return {ok: false, reason: 'This route is operated by a person on a separate bench device.'};
  const p = c?.handler?.pylabrobot, h = exportData.handlers[c?.config?.id];
  if (!p || p.status === 'none') return {ok: false, reason: 'No PyLabRobot driver is listed for this handler in the pinned registry.'};
  if (!p.api) return {ok: false, reason: `The pinned registry lists a PyLabRobot driver (${p.driverStatus}) but no Python API path for it.`};
  if (!h) return {ok: false, reason: 'No PyLabRobot deck is recorded for this handler yet.'};
  if (!c.layout?.ok) return {ok: false, reason: `No deck layout could be solved for this setup${c.layout?.why ? `: ${c.layout.why}` : '.'}`};
  const backend = backendOf(p.api, h.dialect);
  if (!backend) return {ok: false, reason: `The registry's API (${p.api}) is not one this exporter knows.`};
  return {ok: true, dialect: h.dialect, label: exportData.dialects[h.dialect].label, api: p.api, status: p.status, driverStatus: p.driverStatus};
}

function backendOf(api, dialect) {
  const name = api.split('.').pop();
  const e = exportData.api.find(x => x.name === name && x.kind === 'class' && x.dialects.includes(dialect));
  return e ? {name, module: api.split('.').slice(0, -1).join('.'), entry: e} : null;
}

const fill = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (m, k) => (v[k] ?? m));
const num = x => +Number(x).toPrecision(4);
// Ledger volumes written for a simulation's trackers: to 0.1 nl (#124).
const exact = x => String(Math.round(x * 1e4) / 1e4);
const py = s => JSON.stringify(String(s));
const one = s => String(s || '').replace(/\s+/g, ' ').trim();
const slug = s => one(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40).replace(/_+$/, '') || 'step';
const ind = (lines, n) => lines.map(l => ' '.repeat(n) + l);

export function exportPylabrobot(c, model, workload, {simulate = false} = {}) {
  const target = pylabrobotTarget(c);
  if (!target.ok) throw Error(target.reason);
  const h = exportData.handlers[c.config.id], D = exportData.dialects[h.dialect];
  const sim = simulate ? h.simulator : null;
  if (simulate && !sim) throw Error(`No PyLabRobot simulator is recorded for ${c.config.id}.`);
  const backend = backendOf(c.handler.pylabrobot.api, h.dialect);
  const cfg = c.pipettes ? (installationPipetteConfigs(c.handler, c.installation) || []).find(x => x.id === c.pipettes.chosen.id) : null;
  const heads = cfg?.heads || [];
  const modes = channelsFor(c.config.id)?.heads || {};
  const todos = [];
  const todo = t => { if (!todos.includes(t)) todos.push(t); return `# TODO: ${t}`; };

  // Labware: the sample plate the deck layout chose (#140), the first PyLabRobot definition
  // that is an instance of the workflow's labware type, plain plate definitions first.
  const L = c.layout;
  const SP = samplePlate(model);
  const typeId = SP.typeId, plateTypeId = SP.plateTypeId, plateMode = SP.plateMode, matches = SP.matches;
  if (!model.labware?.id || model.labware.assumed) todo(`Labware assumed (${labwareData.labware[typeId]?.label || typeId}); choose it on the Protocols page.`);
  const LW = labwareData.labware;
  if (!matches.length) throw Error(`No PyLabRobot definition matches ${plateTypeId}.`);
  const plate = L.plate.id;
  const wellMax = RES[plate].well?.max_volume_ul ?? Infinity;
  todo(`${plate} is the first PyLabRobot definition that fits ${LW[plateTypeId]?.label || plateTypeId}; replace it with the plate you use.`);
  const samples = plateMode ? Math.min(workload, model.unitSize || 96) : Math.min(workload, 96);
  if (!plateMode) todo(`The workflow is in tubes (${LW[typeId]?.label || typeId}); this skeleton pipettes the wells of one ${LW[plateTypeId]?.label || plateTypeId} instead. Choose tube racks before a dry run.`);
  if (plateMode && workload > (model.unitSize || 96)) todo(`The batch needs ${Math.ceil(workload / (model.unitSize || 96))} plates; this skeleton covers one.`);

  const tipSizes = new Set();
  const rackFor = size => {
    const sizes = Object.keys(h.tipRacks).map(Number).sort((a, b) => a - b);
    const s = sizes.find(x => x >= size) ?? sizes[sizes.length - 1];
    if (s !== size) todo(`No ${size} µl tip rack recorded for PyLabRobot here; using ${s} µl racks.`);
    if (!L.positions[`tips_${s}`]) throw Error(`The deck layout has no place for ${s} µl tips.`);
    tipSizes.add(s);
    return s;
  };

  // Where each module this setup uses sits (#109), from the solved deck layout
  // (#140): a site on a carrier (in its insert when the plate is unskirted), a
  // track of its own, or a deck slot. Moves go to these; anything not placed stays a pause.
  const moduleOf = op => c.providers.find(p => p.op === op)?.module || null;
  const usedModules = [...new Set(c.providers.map(p => p.module).filter(m => m && h.modules?.[m] && L.modules[m]))];
  const siteRef = at => at.adapter ? `lw[${py(`${at.carrier}_adapter_${at.site}`)}]` : `lw[${py(at.carrier)}][${at.site}]`;
  const at = k => L.positions[k];
  const refOf = k => !at(k) ? null : at(k).slot ? py(at(k).slot) : at(k).adapter ? `lw[${py(k + '_adapter')}]` : `lw[${py(at(k).carrier)}][${at(k).site}]`;
  const place = new Map();
  for (const m of usedModules) {
    const M = h.modules[m], pos = L.modules[m];
    place.set(m, {M, pos, target: pos.slot ? py(pos.slot) : pos.carrier ? siteRef(pos) : M.target});
  }
  const home = refOf('plate'), homeDest = refOf('dest');
  for (const x of L.checks) todo(x);
  for (const {M, pos} of place.values()) if (M.check) todo(fill(M.check, {slot: pos.slot || '', track: pos.track || ''}));
  // Leaving a module whose driver runs something (a shaker) stops it first.
  const leave = from => { const pl = place.get(from); return pl && driverFor(pl.M) ? Object.values(pl.M.ops || {}).flatMap(o => o.leave || []) : []; };
  // Ledger positions to deck targets: a plate's home (its own carrier site or
  // slot), a module this setup places, or off the deck (null). undefined: a
  // module with no recorded placement.
  const homeOf = k => k === 'b' ? homeDest : home;
  const targetOf = (id, k) => id == null || id === physicalRules.homeId ? homeOf(k) : id.startsWith('module:') ? (place.get(id.slice(7))?.target ?? undefined) : null;
  // The script names the samples' plate lw["plate"]; the ledger calls the two plates a and b.
  let named = 'a';
  const other = () => named === 'a' ? 'b' : 'a';
  const driverFor = M => { const r = M.driver && registry.records.find(x => x.id === M.driver); return r?.api ? r : null; };
  const constants = [];

  // Steps: consecutive timeline entries for one protocol action become one function.
  const groups = [];
  for (const s of c.timeline) {
    const last = groups[groups.length - 1];
    if (s.actionId && last?.actionId === s.actionId) last.steps.push(s);
    else groups.push({actionId: s.actionId || null, steps: [s]});
  }
  const actions = new Map(model.chunks.flatMap(ch => ch.actions).map(a => [a.id, a]));
  let uses96 = false;
  const headClasses = new Set();
  // After a step a person does, a simulation build sets PyLabRobot's trackers to the ledger's volumes.
  const sync = (rec, vessels = false) => { if (!sim || !rec) return []; const pl = rec.containers.plate; return [`sync_volumes(lw, ${exact(pl[named])}, ${exact(pl[other()])}${vessels && wholeBatch ? `, ${vesselList(rec)}` : ''})  # the plan's ledger after this step`]; };
  // What PyLabRobot's trackers must show after a step (#124): the samples' plate, the other plate, and every
  // reservoir, trough and waste the ledger has used so far. Containers are checked only when the script
  // covers the whole batch the ledger counts.
  const wholeBatch = samples === workload;
  const vesselOf = id => { if (id === 'trough' || id === 'waste') return [id, 0]; if (id.startsWith('trough:')) return [troughOf(L, +id.slice(7)), 0]; const w = reservoirWell(L, +id.slice(10)); return [w.name, w.index]; };
  const vesselList = rec => `[${Object.entries(rec.containers.vessels).map(([id, ul]) => { const [k, i] = vesselOf(id); return `(${py(k)}, ${i}, ${exact(ul)})`; }).join(', ')}]`;
  const expectOf = rec => `(${exact(rec.containers.plate[named])}, ${exact(rec.containers.plate[other()])}, ${wholeBatch ? vesselList(rec) : '[]'})`;
  let lastRecord = null;
  const byHand = (what, a) => `pause(${py(`${what}: ` + one(a.label))})`;

  // One pipetting step, compiled from the ledger's operations for it: each
  // operation's volume per well, pass plan (wells per pass, passes, µl per
  // pass, tip), reagent well and the [group, pass] points where a source is
  // refilled or the waste emptied. Anything the head cannot do is a pause.
  function pipette(s, a) {
    const out = [];
    const rec = s.physical;
    if (!rec) return [todo(`${one(a.label).slice(0, 80)}: the plan's ledger has no record of this step.`), byHand('Do by hand', a)];
    const head = heads.find(x => x.label === s.tips?.head);
    if (!head) return [todo(`${one(a.label).slice(0, 80)}: no pipetting head recorded for this step.`), byHand('Do by hand', a), ...sync(rec)];
    const mode = modes[head.id]?.mode || null;
    const layout = s.channels?.layout || null;
    if (!mode) out.push(todo(`Channel mode of ${head.label} is not recorded; assumed ${head.channels > 1 ? 'fixed' : 'independent'}.`));
    const hm = h.heads[head.id];
    if (hm?.check) out.push(todo(hm.check));
    let hand = false, robotByHand = false;
    // The well's volume as the ledger runs through this step's operations.
    let inWell = rec.before.ul;
    const kinds = {add: 'Add', remove: 'Remove', mix: 'Mix', move: 'Move', aliquot: 'Take'};
    for (const [i, op] of rec.ops.entries()) {
      if (rec.ops.length > 1) out.push(`# ${kinds[op.kind]} ${i + 1} of ${rec.ops.length}`);
      const st = op.plan && D.styles[op.plan.style];
      const why = hand ? 'an earlier part of this step is done by hand, so the rest is too.'
        : op.ulPerWell == null ? 'volume not stated.'
        : op.kind === 'aliquot' ? `take ${num(op.ulPerWell)} µl for the measurement off the deck.`
        : op.handReason === 'part-plate' ? (op.kind === 'add' ? `${head.label} also adds to the wells no sample fills, which would overflow` : `${head.label} also draws from the wells no sample fills, which hold less than the samples (only its own additions reach them)`) + `: a person does it for the ${samples} samples.`
        : op.handReason === 'overflow' ? `${num(inWell + op.ulPerWell)} µl does not fit the ${num(model.labware?.maxUl ?? LW[typeId]?.maxUl)} µl well of ${LW[typeId]?.label || typeId} (${one(a.label).slice(0, 80)}).`
        : !op.robot ? 'the plan has a person do this.'
        : op.kind === 'remove' && !(op.ulPerWell > 0) ? `the plan has no volume in the well here (${op.unknown ? 'an earlier step states none' : 'no earlier step adds any'}).`
        : op.kind === 'mix' && !(op.ulPerWell > 0) ? 'the plan has no volume in the well to mix.'
        // A move from a well whose volume no earlier step states (#171): the plan cannot say there is liquid to take.
        : op.kind === 'move' && op.ulPerWell > inWell + 1e-6 ? `the plan has ${num(inWell)} µl in the well here, less than the ${num(op.ulPerWell)} µl to move (an earlier step states no volume).`
        : !op.plan ? `${head.label} cannot make this ${transferLayouts[layout] || layout} transfer natively (${mode}).`
        : !st || !hm ? `No PyLabRobot call shape recorded for ${head.label} (${op.plan.style}).`
        : op.kind === 'add' && inWell + op.ulPerWell > wellMax + 1e-6 ? `${num(inWell + op.ulPerWell)} µl does not fit a ${num(wellMax)} µl well of ${plate}: ${one(a.label).slice(0, 80)}`
        : null;
      // The ledger counted this as a robot step but the skeleton cannot write it: its reservoir and waste are synced too.
      if (why && op.robot && op.plan) robotByHand = true;
      if (why) { out.push(todo(why), byHand(`${kinds[op.kind]} by hand`, a)); hand = true; }
      else {
        headClasses.add(hm.class);
        if (st.check) out.push(todo(st.check));
        if (op.plan.style === 'plate') { uses96 = true; if (samples < 96) out.push(todo(`${head.label} works the whole plate; ${samples} samples fill only part of it.`)); }
        if (op.kind === 'remove' && op.unknown) out.push(todo(`the well also holds a volume no step states; this removal takes the ${num(op.ulPerWell)} µl the plan accounts for.`));
        const src = op.kind === 'add' ? 'reagent' : 'plate', dst = op.kind === 'add' ? 'plate' : op.kind === 'remove' ? 'waste' : op.kind === 'move' ? 'dest' : 'plate';
        if (op.kind === 'remove') {
          out.push(todo('Set and verify the aspiration height, offset and flow rate for this removal before using hardware.'));
          out.push(`# Remove ${num(op.ulPerWell)} µl: what the plan's ledger has in the well.`);
        }
        out.push(...block(s, a, head, st, op, src, dst, layout));
        if (op.kind === 'move') { out.push('lw["plate"], lw["dest"] = lw["dest"], lw["plate"]  # the samples are now in the other plate'); }
      }
      // The script's names follow the samples, whoever moves them.
      if (op.kind === 'move' && op.ulPerWell != null) { if (why) out.push('lw["plate"], lw["dest"] = lw["dest"], lw["plate"]  # the samples are now in the other plate'); named = other(); }
      inWell = op.kind === 'add' ? inWell + (op.ulPerWell || 0) : op.kind === 'remove' ? Math.max(0, inWell - op.ulPerWell) : op.kind === 'move' ? op.ulPerWell ?? inWell : op.kind === 'aliquot' ? Math.max(0, inWell - op.ulPerWell) : inWell;
    }
    if (robotByHand) out.push(todo(`${one(a.label).slice(0, 80)}: the planner counts this as a robot step, but the skeleton leaves it to a person.`));
    return [...out, ...(hand ? sync(rec, robotByHand) : [])];
  }

  // One transfer in the head's call shape: groups of wells, passes per group,
  // and the ledger's refill and emptying points as [group, pass] pairs.
  function block(s, a, head, st, op, src, dst, layout) {
    const lines = [], pl = op.plan;
    if (pl.eachUl < head.minUl) lines.push(todo(`${num(pl.eachUl)} µl is below the ${head.minUl} µl minimum of ${head.label}.`));
    if (pl.style === 'channels' && head.channels > pl.group) lines.push(todo(`${head.label} has ${head.channels} channels; a ${RES[plate].wells || 96}-well column has ${pl.group} wells, so each pass uses ${pl.group}.`));
    if (pl.tipUl !== s.tips.size) lines.push(todo(`the plan sized ${s.tips.size} µl tips for this step; ${num(pl.eachUl)} µl per pass needs ${pl.tipUl} µl tips.`));
    const size = rackFor(pl.tipUl);
    const irregular = layout && st.irregular;
    if (irregular) lines.push(`per_well = [${pl.eachUl}] * SAMPLES  ${todo(`set the volume for each well (${(transferLayouts[layout] || layout).toLowerCase()}).`)}`);
    const rw = reservoirWell(L, op.from?.startsWith('reservoir:') ? +op.from.slice(10) : 0);
    const v = {head: h.heads[head.id].expr, n: pl.group, size, volume: irregular?.volume || pl.eachUl, k: rw.index, reservoir: py(rw.name), trough: py(op.from?.startsWith('trough:') ? troughOf(L, +op.from.slice(7)) : 'trough')};
    v.vols = irregular?.vols || fill(st.vols || '', v);
    const T = key => fill(st.targets[key], v);
    const via = (key, o) => (st.containerTargets || []).includes(key) ? st[`${o}Container`] : st[o];
    const groups = Math.ceil(samples / pl.group);
    const at = (points, call) => {
      const pts = (points || []).filter(([g]) => g < groups);
      return pts.length ? [`if (${fill(st.group, v)}, ${pl.passes > 1 ? '_pass' : '0'}) in {${pts.map(([g, q]) => `(${g}, ${q})`).join(', ')}}:  # the plan's ledger: this source runs dry or the waste is full here`, `    ${call}`] : [];
    };
    const refill = src === 'reagent' ? at(op.refills, `refill(${fill(st.draw.source, v)})`) : [];
    const empty = dst === 'waste' ? at(op.empties, `empty(${fill(st.dump.target, v)})`) : [];
    const pair = op.kind === 'mix' && st.mix ? [fill(st.mix, v)] : [...refill, fill(via(src, 'aspirate'), {...v, src: T(src)}), ...empty, fill(via(dst, 'dispense'), {...v, dst: T(dst)})];
    const body = [fill(st.pickup, v)];
    if (pl.passes > 1) body.push(`for _pass in range(${pl.passes}):  # ${num(pl.eachUl * pl.passes)} µl in ${pl.passes} passes of ${pl.eachUl} µl`, ...ind(pair, 4)); else body.push(...pair);
    body.push(fill(st.discard, v));
    lines.push(...st.loop.map(l => fill(l, v)), ...ind(body, st.loop.length ? 4 : 0));
    // A script for part of the batch (#177): the ledger refills a source or
    // empties the waste while working the rest of the batch; do it after this
    // step so later steps do not start from a source the ledger has refilled.
    const later = pts => (pts || []).some(([g]) => g >= groups);
    if (src === 'reagent' && later(op.refills)) lines.push(`refill(${fill(st.draw.source, v)})  # the plan's ledger refills it while working the rest of the batch`);
    if (dst === 'waste' && later(op.empties)) lines.push(`empty(${fill(st.dump.target, v)})  # the plan's ledger empties it while working the rest of the batch`);
    return lines;
  }

  // A plate move from the ledger: the samples' plate goes to a module, its
  // own place or off the deck, from where it really is; an emptied plate in
  // the way goes back to its place first. A person's move updates the deck
  // model with put().
  function moveLines(s) {
    const ev = s.move?.physical || s.placed, by = s.move?.by || 'person';
    const msg = s.move ? `Move the plate from ${s.move.from} to ${s.move.to}` : `Put the plate on ${ev.toLabel}`;
    const out = s.move ? [...leave(s.move.from)] : [];
    if (ev.already) return [...out, `# The plate is already at ${ev.toLabel}.`];
    const to = targetOf(ev.to, ev.plate);
    if (to === undefined) return [...out, todo(`${by === 'gripper' ? 'Gripper' : by === 'arm' ? 'Workcell arm' : 'A person'}: ${msg}. No placement is recorded for it.`), `pause(${py(msg)})`];
    const robot = by === 'gripper' && h.move && to !== null;
    if (ev.returned) {
      const back = homeOf(ev.returned);
      out.push('# The emptied plate is still there: return it to its place first.', robot ? fill(h.move, {to: back}).replace('lw["plate"]', 'lw["dest"]') : putLine('lw["dest"]', back));
    }
    if (robot) { if (h.moveCheck) todo(h.moveCheck); return [...out, `# ${msg}`, fill(h.move, {to})]; }
    return [...out, `pause(${py(msg)})`, putLine('lw["plate"]', to)];
  }
  const putLine = (res, to) => { if (D.putCheck) todo(D.putCheck); return `await put(robot, lw, ${res}, ${to === null ? 'None' : to})`; };
  // After a step a person does: the script's names follow the samples, and a simulation build syncs the trackers.
  function handDone(s) {
    const rec = s.physical;
    if (!rec) return [];
    const out = [];
    for (const op of rec.ops) if (op.kind === 'move' && op.ulPerWell != null) { out.push('lw["plate"], lw["dest"] = lw["dest"], lw["plate"]  # a person moved the samples to the other plate'); named = other(); }
    return [...out, ...sync(rec)];
  }

  function stepLines(s, a) {
    const label = one(s.label);
    if (s.rackSwap) return [todo(`${label}: in this skeleton next_tips() pauses for a reload instead.`)];
    if (s.move) return moveLines(s);
    if (s.type === 'W') return s.minutes ? [`${sim ? 'skip_wait' : 'await asyncio.sleep'}(${num(s.minutes.hi * 60)})  # ${num(s.minutes.hi)} min`] : [`pause(${py('Wait until: ' + label)})`];
    if (s.type === 'H') return [...(s.placed ? moveLines(s) : [`pause(${py(label)})`]), ...handDone(s)];
    if (s.type === 'D') return [`# After the run: ${label}`];
    if (s.type !== 'A' || !a) return [`# ${label}`];
    const pre = s.placed ? moveLines(s) : [];
    return [...pre, ...actionLines(s, a, label)];
  }
  function actionLines(s, a, label) {
    if (s.dispensed) return [todo(`a non-contact dispenser (${(s.devices || []).join(', ') || 'device'}) adds this; no PyLabRobot call in this skeleton.`), `pause(${py('Dispense: ' + label)})`, ...handDone(s)];
    const pipettes = s.provider === 'liquid-transfer' || (s.provider === 'magnetic-separation' && a.contact && a.contact !== 'mix' && s.tips);
    if (!pipettes) {
      const pl = place.get(moduleOf(s.provider));
      if (pl?.M.passive === s.provider) return [`# On ${moduleOf(s.provider)}: ${pl.M.passiveNote}.`, ...handDone(s)];
      const op = pl && driverFor(pl.M) && pl.M.ops?.[s.provider];
      if (op) {
        if (pl.M.constants && !constants.length) { constants.push(...pl.M.constants, ...(sim ? pl.M.simulateConstants || [] : [])); if (pl.M.constantsCheck) todo(pl.M.constantsCheck); }
        const t = a.conditions?.temperatureC;
        return [...(t != null && op.temperature ? [fill(op.temperature, {t: num(t)})] : []), ...op.start, ...handDone(s)];
      }
      const cond = [a.conditions?.temperatureC != null ? `${a.conditions.temperatureC} °C` : '', a.conditions?.agitation || '', a.conditions?.onMagnet ? 'on the magnet' : ''].filter(Boolean).join(', ');
      return [todo(`${s.provider.replace(/-/g, ' ')}${cond ? ` (${cond})` : ''} by ${s.via === 'native' ? 'the handler' : moduleOf(s.provider) || 'a module or device'}; the pinned PyLabRobot registry lists no driver API for it.`), `pause(${py(`${s.provider.replace(/-/g, ' ')}: ${label}`)})`, ...handDone(s)];
    }
    return pipette(s, a);
  }

  const fns = [], calls = [], steps = [];
  let n = 0;
  for (const g of groups) {
    const a = g.actionId ? actions.get(g.actionId) : null;
    if (!a) { for (const s of g.steps) calls.push(...stepLines(s, null).map(l => l.startsWith('pause(') || l.startsWith('#') ? l : `# ${l}`)); continue; }
    const name = `step_${String(++n).padStart(2, '0')}_${slug(a.label)}`;
    const body = g.steps.flatMap(s => stepLines(s, a));
    for (const s of g.steps) if (s.physical) lastRecord = s.physical;
    const code = body.filter(l => !/^\s*#/.test(l));
    steps.push({fn: name, label: one(a.label), todos: body.filter(l => /# TODO: /.test(l)).map(l => l.replace(/^.*# TODO: /, '')),
      pauses: code.filter(l => /^\s*pause\(/.test(l)).length, calls: code.filter(l => /\bawait (?!asyncio\.)\w[\w.]*\.\w+\(/.test(l)).length});
    const facts = [...new Set(g.steps.flatMap(s => s.facts || []))].filter(f => !f.startsWith('provider:'));
    fns.push(`async def ${name}(robot, lw):`, `    ${py(one(a.label))}`,
      `    # ${g.steps.filter(s => s.type === 'A').map(s => s.provider + (s.tips?.head ? ` on ${s.tips.head}` : '') + (s.channels ? `, ${transferLayouts[s.channels.layout] || s.channels.layout}: ${s.channels.mode}, ${s.channels.perPass} per pass` : '')).join('; ') || 'by hand'}`,
      ...(facts.length ? [`    # Facts this step depends on: ${facts.join(', ')}`] : []),
      ...ind(body.length ? body : ['pass'], 4), '', '');
    calls.push(sim ? `await run_step(${py(name)}, ${name}, robot, lw${lastRecord ? `, expect=${expectOf(lastRecord)}` : ''})` : `await ${name}(robot, lw)`);
  }

  // Deck and labware.
  const sizes = [...tipSizes].sort((a, b) => a - b);
  const used = new Map();
  const res = name => { if (!RES[name]) throw Error(`${name} is not in content/pylabrobot-labware.json`); used.set(name, RES[name].module); return name; };
  const deck = [fill(D.deck.create, {deck: h.deck}), 'lw = {"tips": {}, "deck": deck}'];
  res(plate);
  // What each layout position holds: the sample plates, reservoirs, trough, waste and tip racks in use.
  const resourceOf = k => k === 'plate' || k === 'dest' ? plate : k.startsWith('reservoir') ? L.reservoir.resource : k.startsWith('trough') ? h.trough : k === 'waste' ? h.waste : null;
  const wanted = k => k.startsWith('tips_') ? tipSizes.has(+k.slice(5)) : true;
  const labware = (k, put) => {
    if (k.startsWith('tips_')) { const s = +k.slice(5); return [`lw["tips"][${s}] = [${res(h.tipRacks[s])}(name="tips_${s}")]`, put(`lw["tips"][${s}][0]`)]; }
    return [`lw[${py(k)}] = ${res(resourceOf(k))}(name=${py(k)})`, put(`lw[${py(k)}]`)];
  };
  if (L.kind === 'carriers') {
    // Carriers on their solved tracks, each site holding what the layout put there.
    const siteOf = new Map(usedModules.filter(m => L.modules[m].carrier).map(m => [`${L.modules[m].carrier}:${L.modules[m].site}`, m]));
    for (const car of L.carriers) {
      res(car.factory);
      deck.push(fill(D.deck.carrier, {var: car.var, factory: car.factory}), `lw[${py(car.var)}] = ${car.var}`);
      car.sites.forEach((it, i) => {
        const onSite = r => fill(D.deck.place, {carrier: car.var, site: i, res: r});
        if (it.module) {
          // A module stands in as a site; an unskirted plate moves into its insert.
          if (!siteOf.has(`${car.var}:${i}`) || !car.adapter) return;
          const v = `lw[${py(`${car.var}_adapter_${i}`)}]`;
          deck.push(`${v} = ${res(car.adapter)}(name=${py(`${car.var}_adapter_${i}`)})`, onSite(v));
          return;
        }
        if (!wanted(it.k)) return;
        if (car.adapter && !it.tips) { const ad = `lw[${py(it.k + '_adapter')}]`; deck.push(`${ad} = ${res(car.adapter)}(name=${py(it.k + '_adapter')})`, onSite(ad), ...labware(it.k, r => fill(D.deck.adapt, {adapter: ad, res: r}))); }
        else deck.push(...labware(it.k, onSite));
      });
      deck.push(fill(D.deck.assign, {carrier: car.var, rails: car.track}));
    }
  } else {
    for (const [k, p] of Object.entries(L.positions)) if (wanted(k)) deck.push(...labware(k, r => fill(D.deck.slot, {res: r, slot: p.slot})));
  }
  const devSetup = [], devStop = [];
  for (const [m, {M, pos}] of place) {
    if (!M.create) continue;
    deck.push(`# ${m}`, ...M.create, ...(sim && M.simulate ? M.simulate : []), ...(M.assign ? [fill(M.assign, {track: pos.track})] : []));
    if (driverFor(M)) { devSetup.push(...(M.setup || [])); devStop.push(...(M.stop || [])); }
  }
  // Trash comes from the robot's own deck configuration (the Flex reports it on connect), so after setup.
  const trash = [...D.trash, ...(uses96 ? D.trash96 : [])];
  // Simulation: every source the ledger draws from starts full.
  if (sim) deck.push(...exportData.simulation.deck.map(l => fill(l, {sources: [...L.reservoir.names, ...L.troughNames].map(py).join(', ')})));
  todo(h.layoutCheck);

  // Imports: the backend from the registry's API path, other classes from
  // the api table, resource factories by module.
  const guard = ['import sys', '', 'if __name__ != "__main__" or sys.argv[1:] != ["--allow-hardware-after-dry-run"]:',
    '    raise SystemExit("Hardware is disabled. Use a simulation build for a dry run. Review every TODO before opting in.")', ''];
  const code = [...(sim ? [] : guard), 'import asyncio', ''];
  const imports = new Map();
  const addImport = (mod, name) => { if (!imports.has(mod)) imports.set(mod, new Set()); imports.get(mod).add(name); };
  if (!sim) addImport(backend.module, backend.name);
  const robotLines = sim ? sim.robot : D.robot;
  const extra = sim ? exportData.simulation.imports : [];
  for (const r of [robotLines, extra].flat().join('\n').matchAll(/\b(\w+)\(/g)) { const e = exportData.api.find(x => x.name === r[1] && x.import && x.dialects.includes(h.dialect)); if (e) addImport(e.import, e.name); }
  const deckEntry = exportData.api.find(x => x.name === h.deck && x.import);
  addImport(deckEntry.import, h.deck);
  for (const [name, mod] of used) addImport(`pylabrobot.resources.${mod}`, name);
  for (const r of deck.join('\n').matchAll(/\b([A-Za-z_]\w*)\(/g)) { const e = exportData.api.find(x => x.name === r[1] && x.import && x.dialects.includes(h.dialect)); if (e) addImport(e.import, e.name); }
  for (const [mod, names] of [...imports].sort((a, b) => a[0].localeCompare(b[0]))) code.push(`from ${mod} import ${[...names].sort().join(', ')}`);
  // The pipettes a simulated robot reports as mounted: the chosen configuration's heads.
  const mounted = sim && sim.pipettes ? [...new Set(heads.filter(x => h.heads[x.id]?.pipette).map(x => { const [name, mount] = h.heads[x.id].pipette; return JSON.stringify([name, x.channels, x.minUl, x.maxUl, mount]); }))] : [];
  if (sim?.pipettes && !mounted.length) throw Error(`No simulated pipette is recorded for ${heads.map(x => x.id).join(', ')}.`);
  code.push('', `SAMPLES = ${samples}`, `COLUMNS = ${Math.ceil(samples / 8)}`, ...(D.constants || []), ...(constants.length ? ['', '', ...constants] : []),
    ...(sim?.pipettes ? [`PIPETTES = [${mounted.map(x => `(${JSON.parse(x).map(v => typeof v === 'string' ? py(v) : v).join(', ')})`).join(', ')}]  # ${sim.pipettes}`] : []), '', '',
    ...(sim ? exportData.simulation.helpers : ['def pause(message):', '    """A person does this, or it is not automated yet."""', '    input(f"[operator] {message} - press Enter to continue ")']), '', '',
    'def refill(well):', '    """The plan\'s ledger says this source runs dry here: a person refills it."""', '    pause(f"Refill {well.name}")', ...(sim ? [`    ${exportData.simulation.refill}`] : []), '', '',
    'def empty(well):', '    """The plan\'s ledger says this waste is full here: a person empties it."""', '    pause(f"Empty {well.name}")', ...(sim ? [`    ${exportData.simulation.empty}`] : []), '', '',
    ...D.put, '', '',
    ...(sim ? ['def sync_volumes(lw, plate_ul, dest_ul, vessels=()):', '    """Simulation: a person did this step; set the trackers to the plan\'s ledger."""', '    for name, ul in (("plate", plate_ul), ("dest", dest_ul)):', '        if name not in lw:', '            continue', '        for well in lw[name].get_all_items()[:SAMPLES]:', '            well.tracker.set_volume(ul)', '    for name, i, ul in vessels:', '        lw[name].get_item(i).tracker.set_volume(ul)', '', ''] : []),
    '_used = {}', '', '',
    'def _racks(lw, size):', '    racks = lw["tips"].get(size)', '    if not racks:', '        raise RuntimeError(f"No {size} ul tip rack on the deck")', '    return racks', '', '',
    'def _take(lw, size, n, step):', '    """Reserve n tips of this size, starting on a multiple of step. Tips are numbered down each column, then across."""',
    '    racks = _racks(lw, size)', '    start = -(-_used.get(size, 0) // step) * step', '    if start + n > 96 * len(racks):',
    '        pause(f"Replace the {size} ul tip racks")', ...(sim ? ['        for rack in racks:', '            rack.fill()'] : []), '        start = 0', '    _used[size] = start + n', '    return racks, start', '', '',
    'def next_tips(lw, size, n):', '    racks, start = _take(lw, size, n, 1)', '    spots = [spot for rack in racks for spot in rack.get_all_items()]', '    return spots[start:start + n]', '', '',
    'def next_column(lw, size):', '    racks, start = _take(lw, size, 8, 8)', '    return racks[start // 96], (start % 96) // 8', '', '',
    'def next_rack(lw, size):', '    racks, start = _take(lw, size, 96, 96)', '    return racks[start // 96]', '', '',
    'def build_deck():', ...ind(deck, 4), '    return deck, lw', '', '',
    ...fns,
    'async def main():', '    deck, lw = build_deck()', ...ind(robotLines.map(l => fill(l, {backend: backend.name, channels: Math.max(...heads.filter(x => x.channels < 96).map(x => x.channels), 8)})), 4), `    ${D.setup}`, ...ind(trash, 4), ...ind(devSetup, 4), '    try:', ...ind(calls, 8), '    finally:', ...ind(devStop, 8), `        ${D.stop}`, '', '',
    'if __name__ == "__main__":', '    asyncio.run(main())', '');

  // Which PyLabRobot names the code calls, each with where it is defined.
  const body = code.filter(l => !/^\s*#/.test(l)).map(l => l.replace(/\s+#.*$/, '')).join('\n');
  const allHeadClasses = new Set(Object.values(h.heads).map(x => x.class));
  const apiUsed = exportData.api.filter(e => e.dialects.includes(h.dialect) && !(allHeadClasses.has(e.owner) && !headClasses.has(e.owner)) && (!e.with || new RegExp(e.with).test(body)) && (e.name === '__setitem__' ? h.layout === 'carriers' : e.with ? true : new RegExp(`(^|[^\\w])${e.name}\\b${e.kind === 'attr' ? '' : '\\('}`, 'm').test(body)));
  const p = c.handler.pylabrobot;
  const unchecked = (c.facts || []).filter(f => f.status !== 'yes');
  const nullModes = heads.filter(x => !modes[x.id]?.mode).map(x => x.label);
  const title = model.name || model.protocolId;
  const header = [
    `# PyLabRobot script skeleton: ${one(title)}`,
    `# Setup: ${one(c.config.name)}: ${one(c.setupLabel)}`,
    `# Protocol version: ${(model.sources || []).map(s => `${s.source} ${s.id} v${s.versionNumber}`).join(', ') || 'the imported protocol'}`,
    '#',
    '# NOT VALIDATED. Written by the Automation Atlas planner from its plan of this setup.',
    ...(sim ? [
      `# SIMULATION BUILD: runs against ${sim.label} instead of the hardware`,
      '# backend, with tip and volume tracking on; operator pauses and waits are logged, not',
      '# waited for. A clean run shows the deck, labware, tips and volumes fit PyLabRobot\'s',
      '# model. It says nothing about whether the wet-lab method works. Every TODO marks',
      '# something the planner could not settle.',
    ] : [
      '# It parses as Python; it has not been run on hardware, in a simulator or with a',
      '# PyLabRobot test backend. Labware, deck positions, volumes and heads are starting',
      '# points to check line by line. Every TODO marks something the planner could not settle.',
      '# Hardware starts only with --allow-hardware-after-dry-run.',
    ]),
    '#',
    `# PyLabRobot: commit ${exportData.commit} (pinned in ${exportData.pin.file}:${exportData.pin.line}).`,
    `# Driver: ${p.api} (${p.apiVersion || 'API version not stated'}), registry status "${p.driverStatus}" = ${p.status}.`,
    ...(p.limitations || []).map(l => `#   Limitation: ${one(l)}`),
    `# Call shapes: ${D.label}.`,
    '#',
    `# UNCHECKED FACTS (${unchecked.length}): the plan depends on these and nobody has confirmed them.`,
    ...(unchecked.length ? unchecked.map(f => `#  - [${f.status}${f.type ? ` ${f.type}` : ''}] ${one(f.question || f.label || f.id)}`) : ['#  (none)']),
    ...nullModes.map(l => `#  - [unknown channel mode] ${l}`),
    '#',
    `# TODO (${todos.length}): what this skeleton assumed or left out.`,
    ...todos.map(t => `#  - ${one(t)}`),
    '#',
    '# PyLabRobot names used, where each is defined at the pinned commit:',
    ...apiUsed.map(e => `#   ${e.owner ? e.owner + '.' : ''}${e.name}${e.syntax ? ` (${e.syntax})` : ''}: ${e.file}:${e.line}  ${blob(e.file, e.line)}`),
    `# Resources (content/pylabrobot-labware.json at the same commit): ${[...used.keys()].join(', ')}.`,
    `# Other definitions matching ${labwareData.labware[typeId]?.label || typeId}: ${matches.slice(1, 7).map(m => m.id).join(', ') || 'none'}.`,
    '',
  ];
  const text = header.concat(code).join('\n');
  const base = slug(title).replace(/_/g, '-');
  return {file: `${base}-${c.config.id}-pylabrobot${sim ? '-sim' : ''}.py`, text, todos, unchecked, api: apiUsed, resources: [...used.keys()], dialect: h.dialect, steps, simulate: !!sim,
    checked: sim ? {steps: calls.filter(l => /expect=/.test(l)).length, containers: wholeBatch} : null};
}
