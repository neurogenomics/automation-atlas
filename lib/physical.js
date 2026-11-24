// Physical-state ledger (#120): one account of the liquid, labware and
// consumables a planned run moves, shared by the planner, the Decide page and
// the script exporters. Generic: containers, capacities and pass rules come
// from content (content/labware.json 'physical', content/pylabrobot-export.json
// and content/pylabrobot-labware.json); nothing here names an instrument.
//
// simulate() in lib/work.js calls apply() once per protocol action that
// touches the wells, in timeline order, and move() for every change of plate
// position. The ledger keeps, per step:
//   - the volume in each sample well (all samples alike) and whether part of
//     it is unstated, against the labware's capacity;
//   - which plate holds the samples and where each plate is;
//   - for robot steps, the pass plan (wells per pass, passes, µl per pass),
//     the source and waste containers, every draw and dump, and the points
//     where a source is refilled or the waste emptied before it runs dry or
//     overflows;
//   - every container's volume after the step;
//   - tips by size, reagent drawn per reagent, waste;
//   - violations: what the plan asks that the containers cannot do.
import labwareData from '../content/labware.json' with {type: 'json'};
import exportData from '../content/pylabrobot-export.json' with {type: 'json'};
import plrLabware from '../content/pylabrobot-labware.json' with {type: 'json'};

const P = labwareData.physical;
const RES = plrLabware.resources;
export const physicalRules = P;

// µl per pass, rounded down at 0.1 nl so passes never move more than the well holds.
export const perPassUl = (volume, passes) => Math.floor(volume / passes * 1e4) / 1e4;
const r4 = x => +Number(x).toPrecision(6);
// Container volumes in step records: to 0.1 nl, so a script can be checked against them (#124).
const exact = x => Math.round(x * 1e4) / 1e4;

// The containers a handler's run uses: sample wells of the workflow's labware,
// the reservoir cavities the deck layout holds (#140: as many reservoirs as
// the reagents need and the deck has room for), a single-cavity trough for
// heads that work the whole plate, and a waste container. A handler with a
// solved deck layout uses its PyLabRobot resources' capacities; any other uses
// the generic classes in content/labware.json, marked assumed.
export function containersFor(handlerId, labware, layout = null) {
  const h = handlerId ? exportData.handlers[handlerId] : null;
  const plr = name => {
    const r = RES[name];
    return r ? {label: name, wells: r.wells || 1, capacityUl: r.well?.max_volume_ul ?? null, lengthMm: r.well?.size_mm?.[1] ?? null, basis: `PyLabRobot resource ${name}`} : null;
  };
  const gen = k => ({...P.containers[k], basis: P.containers[k].basis || 'assumed'});
  const R = layout?.ok ? layout.reservoir : null;
  return {
    sample: {label: labware?.label || 'sample well', capacityUl: labware?.maxUl ?? null, basis: labware?.basis || 'labware class'},
    reservoir: R ? {label: R.resource, wells: layout.cavities, perPlate: R.wellsPerPlate, plates: R.plates, capacityUl: R.capacityUl, lengthMm: R.lengthMm, basis: `PyLabRobot resource ${R.resource}, ${R.plates} on the solved deck layout`} : gen('reservoir'),
    trough: {...((h && plr(h.trough)) || gen('trough')), count: layout?.ok ? Math.max(1, layout.troughs) : 1},
    waste: (h && plr(h.waste)) || gen('waste'),
  };
}

// Columns of a plate with this many wells (8 rows for 96, 16 for 384).
const rowsOf = wells => Math.round(Math.sqrt((wells || 96) * 2 / 3));

// How a head works through the samples: how many wells each pass serves, and
// whether a fixed block aspirates on every channel even where the last group
// is short. A head as wide as the plate works it in one block; independent
// channels share one X position, so a pass reaches one column; a fixed block
// that can pick up fewer tips makes an irregular transfer one tip at a time.
export function passGroup(head, mode, layout, wells) {
  const rows = rowsOf(wells);
  if (head.channels >= (wells || 96)) return {group: head.channels, fixed: true, style: 'plate'};
  if (head.channels === 1) return {group: 1, fixed: false, style: 'single'};
  if (mode === 'independent') return {group: Math.min(head.channels, rows), fixed: false, style: 'channels'};
  if (layout) return mode === 'fixed-partial' ? {group: 1, fixed: false, style: 'nozzle'} : null;
  return {group: Math.min(head.channels, rows), fixed: true, style: 'columns'};
}

// Passes for one transfer: each moves at most what the head and its largest
// tip hold; the tip is the smallest that holds one pass, never smaller than
// the planner's.
export function passPlan(head, volume, plannedTip) {
  const perPass = Math.min(head.maxUl, Math.max(...head.tips));
  const passes = Math.max(1, Math.ceil(volume / perPass - 1e-9));
  const each = perPassUl(volume, passes);
  const tipUl = Math.max(plannedTip || 0, [...head.tips].sort((x, y) => x - y).find(t => t >= each) ?? Math.max(...head.tips));
  return {passes, eachUl: each, tipUl, perPassMax: perPass};
}

// The reagent a step adds, as the key its source container is filled under.
export const reagentKey = a => (a.materials || []).map(m => m.class).sort().join('+') || 'unnamed';

// Measurements take an aliquot: the samples stay where they are.
export function spendSimulationBudget(budget, count) {
  if (!budget) return;
  budget.remaining -= count;
  if (!(budget.remaining >= 0)) throw RangeError('Evaluation work limit');
}
export function createLedger({samples, unitSize = 96, wells = 96, format = 'plate', containers, isAliquot = () => false, sampleClasses = [], budget, inputVolumeUl = 0}) {
  const C = containers;
  const sampleSet = new Set(sampleClasses);
  // Containers the robot draws from and dumps into, by id.
  const vessels = new Map();
  const vessel = (id, spec, start) => {
    if (!vessels.has(id)) vessels.set(id, {id, label: spec.label, capacityUl: spec.capacityUl, ul: start, drawnUl: 0, dumpedUl: 0, refills: 0, empties: 0, lengthMm: spec.lengthMm ?? null, reagents: new Set(), basis: spec.basis});
    return vessels.get(id);
  };
  // ul: each sample well. spareUl: wells a fixed head works but no sample
  // fills (a 96-head on a part-filled plate, the rest of a column): only the
  // head's own additions reach them (#175).
  const plates = {a: {id: 'a', ul: inputVolumeUl ?? 0, spareUl: 0, unknown: inputVolumeUl === null, at: null, used: true}, b: {id: 'b', ul: 0, spareUl: 0, unknown: false, at: null, used: false}};
  let cur = 'a';
  const sourceIndex = new Map(), troughIndex = new Map();
  const violations = [];
  const steps = [], modeledOutputs = [];
  const tips = {};
  const reagents = new Map();
  let benchWasteUl = 0;
  const plateCount = format === 'plate' ? Math.ceil(samples / unitSize) : 1;
  const perPlate = format === 'plate' ? Math.min(samples, unitSize) : samples;
  const flag = (kind, severity, a, detail, extra = {}) => {
    const key = `${kind}:${a?.id || ''}:${extra.container || ''}`;
    if (violations.some(v => v.key === key)) return;
    violations.push({key, kind, severity, actionId: a?.id || null, label: a?.label || '', detail, ...extra});
  };
  const well = () => plates[cur];
  // A fixed head on a plate where samples leave some of its wells empty.
  const spareWells = pl => format === 'plate' && pl?.fixed && pl.group > 1 && Array.from({length: plateCount}, (_, p) => Math.min(unitSize, samples - p * unitSize)).some(n => n % pl.group);
  const cap = C.sample.capacityUl;
  const snapshot = () => ({
    plate: {a: exact(plates.a.ul), b: exact(plates.b.ul)}, samplesIn: cur,
    vessels: Object.fromEntries([...vessels.values()].map(v => [v.id, exact(v.ul)])),
  });
  // Source for a reagent on a robot step: the trough for a head that works the
  // whole plate, otherwise a reservoir cavity per reagent in order of first use,
  // shared only when the deck layout holds fewer cavities than reagents.
  const sourceFor = (a, style) => {
    if (style === 'plate') {
      // A trough per reagent while the layout has them (#140), in order of first use.
      const k = reagentKey(a);
      if (!troughIndex.has(k)) troughIndex.set(k, troughIndex.size);
      const i = troughIndex.get(k) % C.trough.count;
      const v = vessel(i ? `trough:${i}` : 'trough', {...C.trough, label: C.trough.count > 1 ? `${C.trough.label} ${i + 1}` : C.trough.label}, C.trough.capacityUl);
      v.reagents.add(k);
      return v;
    }
    const k = reagentKey(a);
    if (!sourceIndex.has(k)) sourceIndex.set(k, sourceIndex.size);
    const i = sourceIndex.get(k) % (C.reservoir.wells || 1);
    const per = C.reservoir.perPlate || C.reservoir.wells || 1, j = Math.floor(i / per);
    const v = vessel(`reservoir:${i}`, {...C.reservoir, label: `${C.reservoir.label}${C.reservoir.plates > 1 ? ` ${j + 1}` : ''} well ${i % per + 1}`}, C.reservoir.capacityUl);
    v.reagents.add(k);
    v.index = i;
    return v;
  };
  // Draws (or dumps) pass by pass, in the order a script makes them: group by
  // group, pass by pass. A source is refilled when the next draw is more than
  // it holds; a waste is emptied when the next dump would overflow it.
  // Returns the [group, pass] points where that happens.
  function passes(v, plan, mode, a) {
    spendSimulationBudget(budget, (Math.ceil(samples / plan.group) + plateCount) * plan.passes);
    const points = [];
    if (v.capacityUl == null) { // unknown capacity: count only
      const total = groupsTotal(plan);
      if (mode === 'draw') { v.drawnUl += total; v.ul -= total; } else { v.dumpedUl += total; v.ul += total; }
      return points;
    }
    let g = 0;
    for (let p = 0; p < plateCount; p++) {
      const n = format === 'plate' ? Math.min(unitSize, samples - p * unitSize) : perPlate;
      const groups = Math.ceil(n / plan.group);
      for (let i = 0; i < groups; i++, g++) {
        const wellsIn = plan.fixed ? plan.group : Math.min(plan.group, n - i * plan.group);
        const amount = plan.eachUl * wellsIn;
        for (let q = 0; q < plan.passes; q++) {
          if (mode === 'draw') {
            if (amount > v.capacityUl + 1e-9) { flag('source-too-small', 'impossible', a, `One pass draws ${r4(amount)} µl; ${v.label} holds ${r4(v.capacityUl)} µl.`, {container: v.id}); }
            if (amount > v.ul + 1e-9) { v.ul = v.capacityUl; v.refills++; points.push([g, q]); }
            v.ul -= amount; v.drawnUl += amount;
          } else {
            if (v.ul + amount > v.capacityUl + 1e-9) { v.ul = 0; v.empties++; points.push([g, q]); }
            v.ul += amount; v.dumpedUl += amount;
          }
        }
      }
    }
    return points;
  }
  const groupsTotal = plan => {
    let t = 0;
    for (let p = 0; p < plateCount; p++) {
      const n = format === 'plate' ? Math.min(unitSize, samples - p * unitSize) : perPlate;
      const groups = Math.ceil(n / plan.group);
      for (let i = 0; i < groups; i++) t += plan.eachUl * plan.passes * (plan.fixed ? plan.group : Math.min(plan.group, n - i * plan.group));
    }
    return t;
  };
  const useReagent = (a, ul, route, container) => {
    const classes = (a.materials || []).map(m => m.class).filter(c => !sampleSet.has(c));
    if (!classes.length) return;
    const k = classes.sort().join('+');
    const r = reagents.get(k) || {key: k, classes, deliveredUl: 0, routes: new Set(), containers: new Set(), steps: 0};
    r.deliveredUl += ul; r.routes.add(route); if (container) r.containers.add(container); r.steps++;
    reagents.set(k, r);
  };
  // Channels that fit one cavity of a container at the head's pitch, keeping
  // clear of its walls: only independent channels are spread by software.
  const fits = (v, plan, a) => {
    if (plan.style !== 'channels' || !v.lengthMm) return;
    const n = Math.floor((v.lengthMm - 2 * P.channelFit.edgeMm) / P.channelFit.pitchMm) + 1;
    if (plan.group > n) flag('channels-fit', 'impossible', a, `${plan.group} channels at ${P.channelFit.pitchMm} mm do not fit one ${r4(v.lengthMm)} mm cavity of ${v.label} (${n} fit).`, {container: v.id});
  };

  return {
    // Volume in each sample well now, for sizing a removal.
    sampleWell: () => ({ul: well().ul, unknown: well().unknown, capacityUl: cap}),
    // Where the samples' plate is.
    location: () => well().at,
    move(from, to, by) {
      const p = well(), other = plates[cur === 'a' ? 'b' : 'a'];
      const home = id => id == null || id === P.homeId ? P.homeId : id;
      // From where the samples' plate really is: after a sample move it is the other plate, at its own place.
      const event = {plate: cur, from: p.at ?? null, to: to?.id ?? null, toLabel: to?.label ?? null, by, returned: null, already: home(p.at) === home(to?.id)};
      // The emptied plate still sits where the samples are going: it goes back to its own place first.
      if (other.used && other.at && to && other.at === to.id && to.id !== P.homeId) { event.returned = other.id; other.at = null; }
      p.at = to?.id ?? null;
      return event;
    },
    // One protocol action. robot: the pass plan for each transfer on the
    // robot ({head, mode, layout, tipUl}), or null when a person does it.
    apply(a, robot = null, {route = robot ? 'handler' : 'manual'} = {}) {
      const reps = Math.max(1, a.count?.n || 1);
      spendSimulationBudget(budget, reps);
      const before = {ul: r4(well().ul), unknown: well().unknown, plate: cur};
      const ops = [];
      // Once part of a step is left to a person, the rest of that step is too.
      let handed = false;
      const plan = vol => {
        if (!robot || handed) return null;
        const g = passGroup(robot.head, robot.mode, robot.layout, wells);
        if (!g) return null;
        return {...g, ...passPlan(robot.head, vol, robot.tipUl)};
      };
      const add = () => {
        const p = well();
        // The add half of a wash given by an on-deck dispenser draws from the dispenser, not a reservoir.
        const pipettes = robot && !robot.dispensedAdd;
        // A volume stated as a multiple of the well's ("2X volume beads").
        if (a.volumeUl == null && a.volumeRatio && !p.unknown && p.ul > 0) a = {...a, volumeUl: r4(p.ul * a.volumeRatio)};
        if (a.volumeUl == null) { p.unknown = true; flag('volume-unstated', 'question', a, 'The step adds liquid but states no volume.'); ops.push({kind: 'add', ulPerWell: null, robot: !!robot && !handed}); return; }
        // A head cannot put more in a well than it holds: that addition is left to a person (#124).
        const overflows = cap != null && p.ul + a.volumeUl > cap + 1e-9;
        let pl = pipettes && !overflows ? plan(a.volumeUl) : null;
        // The head's spare wells must hold the addition too.
        const spareOver = pl && spareWells(pl) && cap != null && p.spareUl + a.volumeUl > cap + 1e-9;
        if (spareOver) pl = null;
        const op = {kind: 'add', ulPerWell: a.volumeUl, robot: !!pl, reagent: reagentKey(a), ...(pipettes && overflows ? {handReason: 'overflow'} : spareOver ? {handReason: 'part-plate'} : {})};
        if (pipettes && (overflows || spareOver)) handed = true;
        if (pl) {
          const v = sourceFor(a, pl.style);
          fits(v, pl, a);
          op.plan = pl; op.from = v.id; op.refills = passes(v, pl, 'draw', a);
          op.ulPerWell = r4(pl.eachUl * pl.passes);
          useReagent(a, groupsTotal(pl), 'handler', v.id);
        } else useReagent(a, a.volumeUl * samples, route === 'handler' ? 'dispenser' : route, null);
        if (pl && spareWells(pl)) p.spareUl += op.ulPerWell;
        p.ul += op.ulPerWell;
        if (cap != null && p.ul > cap + 1e-9) flag('overflow', 'impossible', a, `The well would hold ${r4(p.ul)} µl${p.unknown ? ' plus an unstated volume' : ''}; ${C.sample.label} holds ${r4(cap)} µl.`);
        ops.push(op);
      };
      const remove = () => {
        const p = well();
        if (a.contact === 'removal' && a.removalUl === null) {
          flag('remove-unverified', 'question', a, 'The stated removal does not identify one per-vessel amount.');
          ops.push({kind:'remove', ulPerWell:null, robot:false, handReason:'source-volume'});
          handed = true;
          return;
        }
        const stated = a.contact === 'removal' ? a.removalUl ?? null : null;
        if (stated !== null && stated > p.ul + 1e-9) {
          flag(p.unknown ? 'remove-unverified' : 'remove-short', p.unknown ? 'question' : 'impossible', a,
            p.unknown ? `The step calls for ${r4(stated)} µl but available liquid is unresolved.`
              : `The step calls for ${r4(stated)} µl but only ${r4(p.ul)} µl are modeled in the vessel.`);
          ops.push({kind:'remove', ulPerWell:null, requestedUl:stated, robot:false, handReason:'source-volume'});
          handed = true;
          return;
        }
        if (stated === 0) { ops.push({kind:'remove', ulPerWell:0, requestedUl:0, robot:false}); return; }
        if (!(p.ul > 0)) {
          flag(p.unknown ? 'remove-unknown' : 'remove-empty', 'question', a, p.unknown ? 'The step removes liquid whose volume no earlier step states.' : 'The step removes liquid, but no earlier step put any in the well.');
          ops.push({kind: 'remove', ulPerWell: 0, robot: !!robot && !handed, unknown: p.unknown}); p.unknown = false; return;
        }
        const amount = stated ?? p.ul;
        let pl = plan(amount);
        // Spare wells of a fixed head must also contain the aspirated amount.
        const short = pl && spareWells(pl) && p.spareUl + 1e-9 < amount;
        if (short) { pl = null; handed = true; }
        const op = {kind: 'remove', ulPerWell: r4(amount), robot: !!robot && !handed,
          unknown: stated === null && p.unknown, ...(stated === null ? {} : {requestedUl:stated}),
          ...(short ? {handReason: 'part-plate'} : {})};
        if (pl) {
          const v = vessel('waste', C.waste, 0);
          fits(v, pl, a);
          op.plan = pl; op.to = v.id; op.empties = passes(v, pl, 'dump', a);
          op.ulPerWell = r4(pl.eachUl * pl.passes);
        } else benchWasteUl += op.ulPerWell * samples;
        if (pl && spareWells(pl)) p.spareUl = Math.max(0, p.spareUl - op.ulPerWell);
        p.ul = Math.max(0, p.ul - op.ulPerWell); if (p.ul < 1e-6) p.ul = 0;
        if (stated === null) p.unknown = false;
        ops.push(op);
      };
      const mix = () => {
        const p = well();
        if (!(p.ul > 0)) { flag(p.unknown ? 'mix-unknown' : 'mix-empty', 'question', a, 'The step mixes the well, but the plan has no stated volume in it.'); ops.push({kind: 'mix', ulPerWell: 0, robot: !!robot && !handed}); return; }
        let g = robot && !handed && passGroup(robot.head, robot.mode, robot.layout, wells);
        const perPass = robot ? Math.min(robot.head.maxUl, Math.max(...robot.head.tips)) : null;
        const vol = robot ? Math.min(p.ul * P.mixFraction, perPass) : p.ul * P.mixFraction;
        const short = g && spareWells(g) && p.spareUl + 1e-9 < vol;
        if (short) { g = null; handed = true; }
        ops.push({kind: 'mix', ulPerWell: r4(vol), robot: !!robot && !handed, plan: g ? {...g, ...passPlan(robot.head, vol, robot.tipUl)} : null, ...(short ? {handReason: 'part-plate'} : {})});
      };
      const moveSamples = () => {
        const p = well();
        if (a.volumeUl == null) { flag('volume-unstated', 'question', a, 'The step moves the samples but states no volume.'); ops.push({kind: 'move', ulPerWell: null, robot: !!robot && !handed}); return; }
        if (a.outputAllocation && a.volumeUl > p.ul + 1e-9) {
          flag(p.unknown ? 'remove-unverified' : 'remove-short', p.unknown ? 'question' : 'impossible', a,
            `The output requires ${r4(a.volumeUl)} µl per vessel. Available liquid is ${p.unknown ? 'unresolved' : r4(p.ul) + ' µl'}.`);
          ops.push({kind:'output', ulPerWell:null, robot:false, handReason:'source-volume'});
          return;
        }
        if (a.volumeUl > p.ul + 1e-9 && !p.unknown) flag('move-short', 'question', a, `The step moves ${r4(a.volumeUl)} µl, but the plan has ${r4(p.ul)} µl in the well.`);
        const take = p.unknown ? a.volumeUl : Math.min(a.volumeUl, p.ul);
        let pl = take > 0 ? plan(take) : null;
        const short = pl && spareWells(pl) && p.spareUl + 1e-9 < take;
        if (short) { pl = null; handed = true; }
        const spare = pl && spareWells(pl);
        const moved = pl ? r4(pl.eachUl * pl.passes) : take;
        const why = short ? {handReason: 'part-plate'} : {};
        if (isAliquot(a)) {
          p.ul = Math.max(0, p.ul - moved);
          if (spare) p.spareUl = Math.max(0, p.spareUl - moved);
          ops.push({kind: 'aliquot', ulPerWell: moved, robot: !!robot && !handed, plan: pl, ...why});
          return;
        }
        const next = cur === 'a' ? 'b' : 'a', q = plates[next];
        if (q.used && q.ul > 1e-6) flag('dest-not-empty', 'question', a, `The samples go to a plate that still holds ${r4(q.ul)} µl per well from an earlier step: a fresh plate is needed.`);
        q.ul += moved; q.unknown = p.unknown; q.used = true;
        if (spare) { q.spareUl += moved; p.spareUl = Math.max(0, p.spareUl - moved); }
        p.ul = Math.max(0, p.ul - moved); if (p.ul < 1e-6) p.ul = 0;
        ops.push({kind: 'move', ulPerWell: moved, robot: !!robot && !handed, plan: pl, from: cur, to: next, ...why});
        cur = next;
        if (cap != null && q.ul > cap + 1e-9) flag('overflow', 'impossible', a, `The new well would hold ${r4(q.ul)} µl; ${C.sample.label} holds ${r4(cap)} µl.`);
      };
      const allocateOutputs = () => {
        const p = well();
        const outputs = a.outputAllocation;
        const total = outputs.reduce((volume, output) => volume + output.volumeUl, 0);
        if (total > p.ul + 1e-9) {
          flag(p.unknown ? 'remove-unverified' : 'remove-short', p.unknown ? 'question' : 'impossible', a,
            `The stated outputs require ${r4(total)} µl per vessel. Available liquid is ${p.unknown ? 'unresolved' : r4(p.ul) + ' µl'}.`);
          ops.push({kind:'output', ulPerWell:null, robot:false, handReason:'source-volume'});
          return;
        }
        for (const [index, output] of outputs.entries()) {
          const id = `${a.id}:output-${index + 1}`;
          modeledOutputs.push({id, actionId:a.id, from:cur, ...output});
          ops.push({kind:'output', ulPerWell:output.volumeUl, robot:false, from:cur, to:id});
        }
        p.ul = Math.max(0, p.ul - total);
      };
      for (let i = 0; i < reps; i++) {
        // The first addition of an expanded wash (#171) replaces the supernatant, as a wash does.
        if (a.contact === 'free' || a.contact === 'contact') { if (i === 0 && a.removeFirst && well().ul > 0) remove(); add(); }
        else if (a.contact === 'removal') remove();
        // A wash first removes what is in the well (the supernatant), then adds
        // and removes; its last removal is left to the next line when the
        // protocol states it there.
        else if (a.contact === 'wash') { if (i === 0 && well().ul > 0) remove(); add(); if (!(a.lastRemovalStated && i === reps - 1)) remove(); }
        else if (a.contact === 'removal+add') { remove(); add(); }
        else if (a.contact === 'mix') mix();
        else if (a.contact === 'output-split') allocateOutputs();
        else if (a.contact === 'sample-move') moveSamples();
      }
      const rec = {actionId: a.id, robot: !!robot && !handed, before, after: {ul: r4(well().ul), unknown: well().unknown, plate: cur}, ops, containers: snapshot(), route};
      steps.push(rec);
      return rec;
    },
    tips(size, n) { tips[size] = tips[size] ? {lo: tips[size].lo + n.lo, hi: tips[size].hi + n.hi} : {...n}; },
    // The run's account: containers, reagents drawn, waste, tips, violations.
    summary() {
      const vs = [...vessels.values()];
      // A reservoir well filled with more than one reagent mixes them.
      for (const v of vs) if (v.reagents.size > 1) flag('shared-source', 'question', null, `${v.reagents.size} reagents (${[...v.reagents].join(', ')}) are drawn from ${v.label}: the deck holds ${v.id.startsWith('trough') ? `${C.trough.count === 1 ? 'one trough' : `${C.trough.count} troughs`}` : `${C.reservoir.wells} reservoir wells${C.reservoir.plates ? ` (${C.reservoir.plates} reservoir${C.reservoir.plates > 1 ? 's' : ''}, all the solved layout has room for)` : ''}`} for ${(v.id.startsWith('trough') ? troughIndex.size : sourceIndex.size) || v.reagents.size} reagents.`, {container: v.id});
      for (const v of vs) if (v.refills) flag('refills', 'question', null, `${v.label} runs dry ${v.refills} time${v.refills > 1 ? 's' : ''} and is refilled during the run (${r4(v.drawnUl / 1000)} ml drawn; it holds ${r4(v.capacityUl / 1000)} ml).`, {container: v.id});
      for (const v of vs) if (v.empties) flag('waste-full', 'question', null, `${v.label} fills ${v.empties} time${v.empties > 1 ? 's' : ''} and is emptied during the run (${r4(v.dumpedUl / 1000)} ml of waste; it holds ${r4(v.capacityUl / 1000)} ml).`, {container: v.id});
      return {
        containers: vs.map(v => ({id: v.id, label: v.label, capacityUl: v.capacityUl, drawnUl: r4(v.drawnUl), dumpedUl: r4(v.dumpedUl), refills: v.refills, empties: v.empties, reagents: [...v.reagents], basis: v.basis})),
        reagents: [...reagents.values()].map(r => ({...r, deliveredUl: r4(r.deliveredUl), routes: [...r.routes], containers: [...r.containers]})),
        waste: {robotUl: r4(vs.filter(v => v.id === 'waste').reduce((n, v) => n + v.dumpedUl, 0)), benchUl: r4(benchWasteUl)},
        ...(modeledOutputs.length ? {outputs:modeledOutputs} : {}),
        tips, violations: violations.map(({key, ...v}) => v), steps,
        plates: {used: Object.values(plates).filter(p => p.used).length},
      };
    },
  };
}
