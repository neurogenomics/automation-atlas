// Block-by-block assessment from Protocol Portal outlines (#373). Generic: no
// protocol, lab or instrument names. The outline format is read only through
// lib/outline.js. Without outlines a workflow goes through portfolio()
// exactly as before, as one row.
//
// Each outline block becomes the existing protocol block declaration (#331):
// its contiguous source steps, the outline vessel as labware and the outline
// working volume as the starting volume. Parsed pooling and redistribution
// boundaries (#339) inside the block are resolved only by an outline fact of
// the same kind on the same step with known cardinality. Anything unknown
// withholds totals for the blocks it affects, naming the missing fact.

import {buildWorkflowModel, labwareLegacy, portfolio, setupReach, simulate} from './work.js';
import {bindOutline, bindingBasis, factBasis} from './outline.js';
import {normaliseSnapshot} from './snapshots.js';
import labwareData from '../content/labware.json' with {type: 'json'};
import operationsData from '../content/operations.json' with {type: 'json'};

const OPS = operationsData.operations;
const BOUNDARY = {pool: 'pooling', distribute: 'redistribution', split: 'redistribution'};
const byKind = (bl, kind) => bl.facts.filter(f => f.kind === kind);

// Split a workflow into the units it is assessed in. Without outlines: one
// unit, the whole workflow (the unchanged path). With outlines: the blocks of
// each outlined part, and each part without an outline as a whole.
export function workflowBlocks(workflow, rawSnapshots, outlines = [], workload = workflow.defaultWorkload ?? 96) {
  if (!outlines.length) {
    const model = buildWorkflowModel(workflow, rawSnapshots);
    return [{id: workflow.id, part: null, outline: null, workload, model, missing: [], conflicts: [], rests: {binding: sourcePins(model), facts: []}}];
  }
  const raws = new Map(rawSnapshots.map(r => { const s = normaliseSnapshot(r); return [`${s.source}:${s.id}`, r]; }));
  const bound = new Map();
  for (const o of outlines) {
    const part = workflow.parts.find(p => p.source === 'labstep' && String(p.id) === String(o.binding?.source?.collection_id ?? o.binding?.source?.collectionId));
    const raw = part && raws.get(`labstep:${part.id}`);
    if (!raw) throw Error(`Outline ${o.record_id ?? o.recordId} names a collection that is not part of workflow ${workflow.id}.`);
    const b = bindOutline(o, raw);
    if (bound.has(String(part.id))) throw Error(`Workflow ${workflow.id} has two outlines for collection ${part.id}.`);
    bound.set(String(part.id), b);
  }
  const out = [];
  let count = workload, cause = null, provisional = [];
  for (const part of workflow.parts) {
    const o = bound.get(String(part.id));
    const single = {...workflow, parts: [part]};
    const entries = o ? withGaps(o, single, part, rawSnapshots) : [partEntry(single, part, rawSnapshots)];
    for (const entry of entries) {
      // A stretch of source steps no block covers: a boundary in it, or one
      // the Planner cannot rule out, leaves every later count unknown.
      if (entry.gap) {
        if (count != null && entry.gap.unknown) { count = null; cause = entry.gap.unknown; }
        continue;
      }
      if (count == null) entry.missing.push({fact: cause.fact, need: 'unit count entering this block', cause});
      // A block whose count rests on an unchecked boundary, its own or an
      // earlier one, is provisional: totals stand on the outline's cardinality.
      const facts = entry.rests?.facts || [];
      const because = [...provisional, ...(entry.boundaries || []).filter(b => b.basis === UNCHECKED)
        .map(b => ({fact: b.fact, status: facts.find(f => f.fact === b.fact)?.status ?? null, claim: facts.find(f => f.fact === b.fact)?.claim ?? null}))];
      provisional = because;
      out.push({...entry, workload: count, provisional: because.length > 0, provisionalBecause: because});
      // Only boundaries matched one-to-one move the count; anything else makes it unknown.
      if (count == null) continue;
      if (entry.countChange.unknown) { count = null; cause = entry.countChange.unknown; continue; }
      for (const [outputs, inputs, fact] of entry.countChange.factors) {
        const next = count * outputs / inputs;
        const limit = entry.layouts.some(l => l.fact === fact) && entry.destination?.wells ? entry.destination.wells : 100000;
        const need = !Number.isInteger(next) ? `whole-number unit count after this boundary (${count} × ${outputs} ÷ ${inputs})`
          : next > limit ? `unit count within ${limit === 100000 ? 'the 100000 the Planner assesses' : `the ${limit} wells of ${entry.destination.labware}`} (${next})` : null;
        // The boundary block itself is withheld too, not only what follows.
        if (need) { entry.missing.push({fact, need}); count = null; cause = {fact, need, block: entry.id}; break; }
        count = next;
      }
    }
  }
  volumeConflicts(out);
  // Steps the outlines leave to no block, with the outline's reason where known.
  Object.defineProperty(out, 'uncoveredSteps', {value: [...bound.values()].flatMap(o => o.uncovered)});
  Object.defineProperty(out, 'blocksReordered', {value: [...bound.values()].some(o => o.reordered)});
  Object.defineProperty(out, 'unplacedUnresolved', {value: [...bound.values()].flatMap(o => o.unplacedUnresolved.map(pointer => ({collection: o.snapshot.id, pointer})))});
  return out;
}

// Positions a boundary endpoint names, read all-or-nothing: the whole
// endpoint must be one supported construct (a column or column range, a well
// or well range, "N wells/tubes/columns", or one vessel). Anything else, such
// as a union, rows with columns or an unlisted vessel, is unread (null),
// never a partial count. Counted in wells (a column is 8 rows).
export function endpointPositions(text) {
  if (!text) return null;
  const t = String(text).trim().toLowerCase().replace(/\s+/g, ' ');
  let m = t.match(/^(?:the )?columns? (\d+)(?: ?(?:-|–|to) ?(\d+))?$/);
  if (m) { const a = Number(m[1]), b = Number(m[2] ?? m[1]); return {count: (Math.abs(b - a) + 1) * 8, columns: [a, b], layout: true}; }
  m = t.match(/^(?:the )?(?:wells? )?([a-z])(\d+)(?: ?(?:-|–|to) ?([a-z])(\d+))?$/);
  if (m) {
    const [r1, r2] = [m[1], m[3] ?? m[1]].map(c => c.charCodeAt(0) - 96), [c1, c2] = [Number(m[2]), Number(m[4] ?? m[2])];
    return {count: (Math.abs(r2 - r1) + 1) * (Math.abs(c2 - c1) + 1), wells: [[r1, c1], [r2, c2]], layout: true};
  }
  m = t.match(/^(\d+) (wells?|tubes?|columns?|vessels?|containers?)$/);
  if (m) return {count: Number(m[1]) * (m[2].startsWith('column') ? 8 : 1), layout: false};
  if (/^(?:a|an|one|the)(?: [a-z]+)? (?:tube|well|vessel|container)$/.test(t)) return {count: 1, layout: false};
  return null;
}

const squash = t => String(t ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
function wholeLine(line, pb) {
  if (line == null || pb.donor == null || pb.recipient == null) return false;
  const body = squash(line).replace(/\.$/, '');
  return ['into', 'to', 'across'].some(w => body === `${pb.operation} ${squash(pb.donor)} ${w} ${squash(pb.recipient)}`);
}

export const CHECKED = 'checked: agrees with the instruction';
export const UNCHECKED = 'unchecked: instruction positions not readable';
// A matched boundary's cardinality against its kind and the instruction. Both
// endpoints fully read: checked when the ratio agrees, a conflict when it
// does not. Otherwise the outline's cardinality stands, unchecked; one read
// side alone is not compared, since the outline may count other units.
function boundaryProblem(f, pb, line) {
  if (f.kind === 'pooling' && f.outputs > f.inputs) return {need: 'pooling with no more outputs than inputs'};
  if (f.kind === 'redistribution' && f.outputs < f.inputs) return {need: 'redistribution with no fewer outputs than inputs'};
  const d = endpointPositions(pb.donor), r = endpointPositions(pb.recipient);
  // Checked only when the two endpoints account for the whole original line:
  // anything the parser dropped (a parenthetical, a prefix, trailing text)
  // could change the positions.
  if (!d || !r || !wholeLine(line, pb)) return {basis: UNCHECKED, recipient: r};
  if (d.count * f.outputs !== r.count * f.inputs) return {conflict: {operation: pb.operation, donorPositions: d.count, recipientPositions: r.count}};
  return {basis: CHECKED, recipient: r};
}

// Explicit recipient positions must exist on the labware the next block
// declares (or this block's, when none follows).
function layoutProblem(layout, labwareId) {
  const lw = labwareData.labware[labwareId];
  if (!lw) return {need: 'labware for the boundary destination'};
  if (lw.format !== 'plate') return {need: `well or column positions on ${labwareId}, which has none`};
  const rows = lw.wells >= 384 ? 16 : 8, cols = lw.wells / rows;
  const outside = (layout.wells || []).some(([r, c]) => r < 1 || r > rows || c < 1 || c > cols) || (layout.columns || []).some(c => c < 1 || c > cols);
  return outside ? {need: `positions within ${labwareId} (${rows} rows × ${cols} columns)`} : null;
}

// The outline's blocks in source order, with the uncovered stretches between,
// before and after them. The Planner does not try to tell which uncovered
// steps change the unit count: any uncovered step with content leaves every
// later count unknown.
function withGaps(o, workflow, part, rawSnapshots) {
  const covered = new Set(o.blocks.flatMap(bl => Object.keys(bl.pointerAt).map(Number)));
  const gap = steps => {
    if (!steps.length) return [];
    const first = o.uncovered.find(u => steps.includes(u.position) && u.hasContent);
    return [{gap: {steps, unknown: first ? {fact: null, need: 'outline block covering this step', position: first.position, pointer: first.pointer, block: null} : null}}];
  };
  const out = [];
  let run = [];
  for (const position of o.snapshot.steps) {
    const bl = o.blocks.find(b => b.from === position);
    if (bl) { out.push(...gap(run)); run = []; out.push(outlineBlock(workflow, part, o, bl, rawSnapshots)); continue; }
    if (!covered.has(position)) run.push(position);
  }
  out.push(...gap(run));
  // Blocks that could not be placed still get a row, after the placed ones.
  for (const bl of o.blocks.filter(b => b.from == null)) out.push(outlineBlock(workflow, part, o, bl, rawSnapshots));
  const blocks = out.filter(e => !e.gap);
  blocks.forEach((e, k) => {
    const destination = blocks[k + 1]?.vesselId ?? e.vesselId;
    e.destination = destination && labwareData.labware[destination] ? {labware: destination, wells: labwareData.labware[destination].wells} : null;
    for (const l of e.layouts) {
      const problem = layoutProblem(l.recipient, destination);
      if (!problem) continue;
      e.missing.push({fact: l.fact, need: problem.need, at: l.at});
      if (!e.countChange.unknown) e.countChange.unknown = {fact: l.fact, need: problem.need, block: e.id};
    }
  });
  return out;
}

const sourcePins = model => ({outline: null, sources: model.sources.map(s => ({source: s.source, id: s.id, versionId: s.versionId, versionNumber: s.versionNumber}))});

// A part without an outline is the existing whole-protocol model; any parsed
// boundary in it leaves the count after it unknown.
function partEntry(workflow, part, rawSnapshots) {
  const model = buildWorkflowModel(workflow, rawSnapshots);
  const pb = model.materialBoundaries?.[0];
  return {id: `part:${part.id}`, part, outline: null, model, missing: [], conflicts: [], rests: {binding: sourcePins(model), facts: []},
    countChange: {factors: [], unknown: pb ? {fact: null, need: `${BOUNDARY[pb.operation]} cardinality`, block: `part:${part.id}`, chunkId: pb.chunkId, bodyLine: pb.bodyLine} : null}};
}

// Disagreements on a quantity that feeds totals withhold them: a total from
// one of two readings would be a silent choice.
const WITHHOLDING = new Set(['working-volume', 'repeat-count', 'vessel', 'boundary']);
function conflict(entry, c) {
  entry.conflicts.push(c);
  if (WITHHOLDING.has(c.kind)) entry.missing.push({fact: c.fact, need: 'outline and parsed reading agree', conflict: c.kind});
}

function outlineBlock(workflow, part, o, bl, rawSnapshots) {
  const missing = [], conflicts = [], used = new Set();
  const id = `${part.id}:${bl.id}`;
  const entry = {id, part, outline: {record: o.recordId, revision: o.revisionId, block: bl.id}, source: {collection: part.id, version: o.snapshot.versionId, from: bl.from, through: bl.through, pointers: bl.sourceSteps},
    label: bl.label.text, model: null, missing, conflicts, countChange: {factors: [], unknown: null}, layouts: [], vesselId: null, boundaries: []};
  const finish = () => {
    entry.rests = {binding: bindingBasis(o), label: {status: bl.label.status.status}, facts: bl.facts.map(f => ({...factBasis(o, f), used: used.has(f.id)}))};
    if (!entry.countChange.unknown && entry.missing.some(m => m.need === 'source step placement' || m.need === 'contiguous source steps')) {
      entry.countChange.unknown = {fact: null, need: 'outline block placed on the source', block: id};
    }
    return entry;
  };
  const boundaryFacts = [...byKind(bl, 'pooling'), ...byKind(bl, 'redistribution')];
  if (bl.unlocated.length) missing.push({fact: null, need: 'source step placement', detail: `No step GUID locates ${bl.unlocated.join(', ')} in the snapshot.`});
  if (bl.from == null) return finish();
  if (!bl.contiguous) missing.push({fact: null, need: 'contiguous source steps', detail: 'The block\'s steps are not one contiguous range.'});
  const vessels = byKind(bl, 'vessel'), volumes = byKind(bl, 'working-volume');
  const vessel = vessels.length === 1 ? vessels[0] : null, volume = volumes.length === 1 ? volumes[0] : null;
  if (vessels.length !== 1) missing.push({fact: null, need: 'vessel', detail: vessels.length ? 'More than one vessel fact.' : 'No vessel fact.'});
  else if (vessel.labwareId == null) missing.push({fact: vessel.id, need: 'vessel labware_id'});
  else { used.add(vessel.id); entry.vesselId = vessel.labwareId; }
  if (volumes.length !== 1) missing.push({fact: null, need: 'working-volume', detail: volumes.length ? 'More than one working-volume fact.' : 'No working-volume fact.'});
  else if (volume.volumeUl == null) missing.push({fact: volume.id, need: 'working-volume value'});
  else used.add(volume.id);
  if (!bl.contiguous) return finish();
  // The outline vessel is the block's labware. An unknown vessel still gets a
  // model, read in the workflow's labware, but only to list its operations.
  const labware = vessel?.labwareId ?? workflow.labware ?? labwareLegacy[workflow.format] ?? labwareLegacy.plate;
  const declare = ul => ({...workflow, block: {source: 'labstep', id: part.id, versionId: part.versionId ?? o.snapshot.versionId, from: bl.from, through: bl.through,
    input: {labware, volumeUl: ul, evidence: ul == null ? null : `outline ${o.recordId} revision ${o.revisionId} fact ${volume.id}`}}});
  let model;
  try { model = buildWorkflowModel(declare(volume?.volumeUl ?? null), rawSnapshots); }
  catch (e) {
    if (!/within its capacity/.test(e.message)) throw e;
    conflict(entry, {kind: 'working-volume', fact: volume.id, outline: volume.volumeUl, parsed: null, catalogue: labwareData.labware[labware].maxUl,
      detail: 'The outline volume is more than the outline vessel holds.', at: bl.sourceSteps[0]});
    model = buildWorkflowModel(declare(null), rawSnapshots);
  }
  const positionOf = chunkId => model.chunks.find(c => c.id === chunkId)?.source.position;
  // Parsed boundaries and outline facts are paired one-to-one per kind and
  // step: exactly one parsed instruction and exactly one fact, and that fact
  // a candidate for no other step. Anything else is ambiguous.
  const groups = new Map();
  for (const pb of model.materialBoundaries || []) {
    const key = `${BOUNDARY[pb.operation]}@${positionOf(pb.chunkId)}`;
    if (!groups.has(key)) groups.set(key, {kind: BOUNDARY[pb.operation], at: positionOf(pb.chunkId), parsed: []});
    groups.get(key).parsed.push(pb);
  }
  const candidates = g => boundaryFacts.filter(f => f.kind === g.kind && f.positions.includes(g.at));
  const claims = new Map();
  for (const g of groups.values()) for (const f of candidates(g)) claims.set(f.id, (claims.get(f.id) || 0) + 1);
  const remaining = [], resolved = [], matched = new Set();
  const unknown = r => { if (!entry.countChange.unknown) entry.countChange.unknown = {...r, block: id}; };
  for (const g of groups.values()) {
    const facts = candidates(g);
    const [pb] = g.parsed, [f] = facts;
    if (g.parsed.length === 1 && facts.length === 1 && claims.get(f.id) === 1 && !pb.conditional) {
      resolved.push({...pb, fact: f.id}); matched.add(f.id); used.add(f.id);
      for (const side of ['inputs', 'outputs']) if (f[side] == null) { missing.push({fact: f.id, need: `${f.kind} ${side}`}); unknown({fact: f.id, need: `${f.kind} ${side}`}); }
      if (f.inputs != null && f.outputs != null) {
        const check = boundaryProblem(f, pb, model.lines.find(l => l.chunkId === pb.chunkId && l.sourceLine === pb.bodyLine)?.line);
        if (check.conflict) {
          conflict(entry, {kind: 'boundary', fact: f.id, outline: {kind: f.kind, inputs: f.inputs, outputs: f.outputs}, parsed: check.conflict, at: bl.pointerAt[g.at] ?? null});
          entry.boundaries.push({fact: f.id, kind: f.kind, basis: 'conflict'});
          unknown({fact: f.id, need: 'outline and parsed reading agree'});
        } else if (check.need) {
          missing.push({fact: f.id, need: check.need});
          unknown({fact: f.id, need: check.need});
        } else {
          entry.boundaries.push({fact: f.id, kind: f.kind, basis: check.basis});
          resolved.at(-1).basis = check.basis;
          entry.countChange.factors.push([f.outputs, f.inputs, f.id]);
          if (check.recipient?.layout) entry.layouts.push({fact: f.id, recipient: check.recipient, at: bl.pointerAt[g.at] ?? null});
        }
      }
      if (g.at < bl.through) missing.push({fact: f.id, need: 'block ending at the boundary', detail: `Steps after the ${f.kind} run at another unit count; the outline block continues past it.`});
      continue;
    }
    for (const p of g.parsed) {
      remaining.push(p);
      const need = p.conditional ? 'outcome of the inspection that controls this boundary'
        : facts.length ? `one ${g.kind} fact for each ${g.kind} instruction on this step` : `${g.kind} fact on this step`;
      const record = {fact: facts.length === 1 ? facts[0].id : null, need, chunkId: p.chunkId, bodyLine: p.bodyLine, at: bl.pointerAt[g.at] ?? null,
        ...(facts.length > 1 || g.parsed.length > 1 || (f && claims.get(f.id) > 1) ? {candidates: facts.map(x => x.id)} : {})};
      missing.push(record); unknown(record);
    }
  }
  // An outline boundary the parser does not read on that step is a disagreement.
  for (const f of boundaryFacts) {
    if (matched.has(f.id) || (claims.get(f.id) || 0) > 0) continue;
    conflict(entry, {kind: 'boundary', fact: f.id, outline: {kind: f.kind, inputs: f.inputs, outputs: f.outputs}, parsed: null,
      detail: `No parsed ${f.kind} instruction on the fact's evidence step.`, at: f.evidence.map(e => e.pointer).filter(Boolean)});
    unknown({fact: f.id, need: `parsed ${f.kind} instruction matching this fact`});
  }
  model = {...model, outlineBoundaries: resolved};
  if (remaining.length) model.materialBoundaries = remaining; else delete model.materialBoundaries;
  // Conflicts with the parser's own reading of the same steps.
  const chunksAt = positions => model.chunks.filter(c => positions.includes(c.source.position));
  if (vessel?.labwareId && model.labware?.mentions) {
    const re = new RegExp(model.labware.mentions, 'i');
    for (const l of model.lines.filter(l => l.type !== 'table' && re.test(l.line))) {
      conflict(entry, {kind: 'vessel', fact: vessel.id, outline: vessel.labwareId, parsed: l.line.match(re)[0].toLowerCase(),
        at: {chunkId: l.chunkId, bodyLine: l.sourceLine, pointer: bl.pointerAt[positionOf(l.chunkId)] ?? null}});
    }
  }
  for (const f of byKind(bl, 'repeat-count')) {
    if (f.count == null || !f.positions.length) continue;
    const counts = chunksAt(f.positions).flatMap(c => c.actions.map(a => a.count?.n ?? 1));
    const parsed = counts.length ? Math.max(...counts) : null;
    if (parsed !== f.count) conflict(entry, {kind: 'repeat-count', fact: f.id, outline: f.count, parsed, at: f.positions.map(p => bl.pointerAt[p] ?? null)});
  }
  for (const f of byKind(bl, 'equipment')) {
    if (!f.operation || !f.positions.length) continue;
    const kinds = new Set(chunksAt(f.positions).flatMap(c => c.actions.flatMap(a => [a.kind, ...[OPS[a.kind]?.performedBy ?? []].flat(), ...(a.conditions?.onMagnet ? ['magnetic-separation'] : [])])));
    if (!kinds.has(f.operation)) conflict(entry, {kind: 'equipment', fact: f.id, outline: f.operation, parsed: [...kinds].sort(), at: f.positions.map(p => bl.pointerAt[p] ?? null)});
  }
  entry.model = model;
  entry.volumeFact = volume?.volumeUl != null ? volume : null;
  return finish();
}

// The parser's running volume at the end of the previous block of the same
// protocol, against the outline's starting volume for the next one.
function volumeConflicts(entries) {
  entries.forEach((e, i) => {
    const prev = entries[i - 1];
    if (!e.volumeFact || !prev?.model || prev.part !== e.part || !prev.outline || prev.countChange.factors.length || prev.countChange.unknown || prev.workload == null) return;
    if (prev.source.through == null || e.source.from !== prev.source.through + 1 || prev.model.chunks.at(-1)?.source.position !== prev.source.through) return;
    const last = simulate(prev.model, prev.workload, null).physical.steps.at(-1)?.after;
    if (!last || last.unknown || !Number.isFinite(last.ul)) return;
    if (Math.abs(last.ul - e.volumeFact.volumeUl) > 0.01) conflict(e, {kind: 'working-volume', fact: e.volumeFact.id, outline: e.volumeFact.volumeUl, parsed: Math.round(last.ul * 1000) / 1000,
      detail: 'Running volume the parser reads at the end of the previous block.', at: e.source.pointers[0]});
  });
}

const tally = list => Object.fromEntries([...list.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map())].sort(([a], [b]) => a.localeCompare(b)));

// Assess every unit on every setup. Units with missing facts get no totals,
// only which of their operations each setup has a provider for.
export function assessBlocks(entries, setups, {methodChanges = false, facts = {}} = {}) {
  const ready = entries.filter(e => e.model && !e.missing.length);
  const p = ready.length ? portfolio(ready.map(e => ({id: e.id, name: e.id, group: 'coverage', workload: e.workload, runsPerYear: null, model: e.model})), setups, {methodChanges, facts, steps: true}) : null;
  return setups.map(spec => {
    const row = p?.setups.find(s => s.setup.id === spec.id);
    const blocks = entries.map(e => {
      const w = row?.workflows.find(x => x.workflow === e.id);
      if (w && !w.blocked) {
        const steps = w.steps || [];
        return {block: e.id, runs: w.runs, why: w.why, withheld: null, conflicts: e.conflicts, rests: e.rests,
          handsOn: {byHand: w.baseline?.active ?? null, withSetup: w.withSetup?.active ?? null, saved: w.savedPerRun},
          // Counts are what this setup's simulation assigns, also when it does not run the block.
          automated: tally(steps.filter(s => s.auto).map(s => s.kind)), manual: tally(steps.filter(s => !s.auto).map(s => s.kind)),
          questions: w.facts.map(f => f.id), steps, facts: w.facts};
      }
      const why = w?.blocked ?? null;
      const reach = e.model ? setupReach(spec, e.model) : [];
      return {block: e.id, runs: false, why: why ?? (e.missing.length ? 'Totals withheld: an outline fact is missing or disagrees with the parsed reading.' : 'No model.'),
        withheld: e.missing.length ? e.missing : [{fact: null, need: 'protocol review', detail: why}], conflicts: e.conflicts, rests: e.rests,
        handsOn: null, couldAutomate: tally(reach.filter(r => r.reachable).map(r => r.kind)), stayManual: tally(reach.filter(r => !r.reachable).map(r => r.kind)), steps: reach, questions: [], facts: []};
    });
    return {setup: spec.id, unassessed: row?.unassessed ?? null, blocks};
  });
}
