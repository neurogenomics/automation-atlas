// Generic automation decision engine (issues #18, #19, #24, #41).
//
// Inputs are supplied by the caller: a workflow model built from imported
// protocol snapshots (buildWorkflowModel) and the instruments the user can
// access. The engine itself knows only the generic operation vocabulary and
// the public instrument catalogue. Output: the same paired before/after
// account for each candidate setup, ranked by the chosen objective.

import {isLabstepDraft, labstepCapture} from './source-provenance.js';
import operationsData from '../content/operations.json' with {type: 'json'};
import lexicon from '../content/lexicon.json' with {type: 'json'};
import substitutionsData from '../content/substitutions.json' with {type: 'json'};
import equipmentMap from '../content/equipment-map.json' with {type: 'json'};
import labwareData from '../content/labware.json' with {type: 'json'};
import materialsData from '../content/materials.json' with {type: 'json'};
import positionsData from '../content/positions.json' with {type: 'json'};
import capsData from '../content/module-capabilities.json' with {type: 'json'};
import pipettesData from '../content/pipettes.json' with {type: 'json'};
import decksData from '../content/decks.json' with {type: 'json'};
import fitData from '../content/labware-fit.json' with {type: 'json'};
import plrLabware from '../content/pylabrobot-labware.json' with {type: 'json'};
import pricesData from '../content/prices.json' with {type: 'json'};
import openHardwareData from '../content/open-hardware.json' with {type: 'json'};
import channelsData from '../content/handler-channels.json' with {type: 'json'};
import dispensersData from '../content/dispensers.json' with {type: 'json'};
import benchData from '../content/bench-providers.json' with {type: 'json'};
import featuresData from '../content/handler-features.json' with {type: 'json'};
import assayEvidenceData from '../content/assay-evidence.json' with {type: 'json'};
import {market} from '../content/market.js';
import {registry} from '../content/registry.js';
import {buildOperationModel, compileLexicon, quantityReview, stepLines} from './protocol-model.js';
import {indexSnapshots, normaliseSnapshot} from './snapshots.js';
import {liquidHandlers, deviceClasses, workcells} from './equipment.js';
import {createLedger, containersFor, spendSimulationBudget} from './physical.js';
import {deckLayout, extraLabware} from './deck-layout.js';

const OPS = operationsData.operations;
const OVER = operationsData.overheads;
export const walkAwayThresholdMinutes = operationsData.walkAwayThresholdMinutes;
export const workingDay = {hours: 8, note: 'An 8-hour bench day. Elapsed time is summed sequentially for one person and one batch.'};
export const timingEvidence = {wait: {}, conflicts: []};

// Build the operation model for a workflow from raw imported snapshots.
export function buildWorkflowModel(workflow, rawSnapshots, reviews = {}, limits) {
  return buildOperationModel(workflow, {snapshots: indexSnapshots(rawSnapshots), lexicon, operations: OPS, reviews, labware: labwareData, materials: materialsData, limits});
}
// Review of one imported protocol before it is used (#152), read-only:
// where it came from and which version, what came with it, how its lines were
// read, what needs checking and which waits have no duration. Flags say what
// to settle before relying on an assessment; nothing is changed.
export function reviewImport(raw) {
  const s = normaliseSnapshot(raw);
  const v = s.version || {};
  const model = buildOperationModel({id: `review:${s.source}:${s.id}`, name: s.name, parts: [{source: s.source, id: s.id, versionId: v.id}], format: 'plate', labware: labwareData.legacy.plate, defaultWorkload: 1},
    {snapshots: {[`${s.source}:${s.id}`]: s}, lexicon, operations: OPS, labware: labwareData, materials: materialsData});
  const steps = s.steps || [];
  const lines = {};
  for (const l of model.lines) lines[l.type] = (lines[l.type] || 0) + 1;
  const actions = model.chunks.flatMap(c => c.actions);
  const timed = actions.filter(a => a.kind === 'wait' || ['thermocycling', 'incubation', 'centrifugation', 'shaking', 'rotation'].includes(a.kind));
  const noDuration = timed.filter(a => a.wait == null);
  const readingsByChunk = new Map();
  for (const line of model.lines) {
    if (!readingsByChunk.has(line.chunkId)) readingsByChunk.set(line.chunkId, new Map());
    const byLine = readingsByChunk.get(line.chunkId);
    if (!byLine.has(line.sourceLine)) byLine.set(line.sourceLine, []);
    byLine.get(line.sourceLine).push({type: line.type, line: line.line, operation: line.operation, branch: line.branch});
  }
  const source = steps.map(step => {
    const byLine = readingsByChunk.get(`${s.source}-${s.id}-${step.position}`);
    const body = stepLines(step);
    const text = body.join(' ').toLowerCase();
    const inventoryWithoutAnchor = (step.inventory || []).map(item => item.name?.trim()).filter(name => name && !text.includes(name.toLowerCase()));
    return {step: step.title, position: step.position, guid: step.guid ?? null, inventoryWithoutAnchor,
      rows: body.map((line, i) => ({number: i + 1, line, readings: byLine?.get(i + 1) ?? []}))};
  });
  const sourceLines = source.reduce((n, step) => n + step.rows.length, 0);
  const omitted = source.flatMap(({step, position, rows}) => rows.filter(row => !row.readings.length)
    .map(({number, line}) => ({step, position, number, line})));
  const bodyless = source.filter((step, i) => !step.rows.length && steps[i].text.trim());
  const {startsWithVerb} = compileLexicon(lexicon);
  const tableInstructions = source.flatMap(({step, position, rows}) => rows.flatMap(row => row.readings
    .filter(reading => reading.type === 'table' && startsWithVerb.test(reading.line))
    .map(reading => ({step, position, line: reading.line}))));
  const quantities = model.chunks.flatMap(chunk => chunk.actions.flatMap(action => {
    const warnings = quantityReview(action);
    return warnings.length ? [{step: chunk.name, line: action.line, warnings}] : [];
  }));
  const checks = {};
  for (const c of model.checks || []) checks[c.type] = (checks[c.type] || 0) + 1;
  const flags = [];
  const flag = (level, text) => flags.push({level, text});
  if (v.is_draft === true || (s.source === 'labstep' && isLabstepDraft(raw))) flag('stop', 'This is a draft version, not a locked one: the assessment could change when it is edited. Import a locked version.');
  if (v.is_last_version === false) flag('check', 'A newer version of this protocol exists; check this is the version you mean to assess.');
  if (s.has_unpublished_draft) flag('check', 'The protocol has an unpublished draft with changes not in this version.');
  if (!s.content_hash) flag('check', 'No content hash: a later import cannot be checked against this one.');
  if (model.qcGates.length) flag('stop', 'The protocol contains quality-control decisions whose outcomes affect the work. Review the gates before using an estimate.');
  if (model.materialBoundaries?.length) flag('stop', 'Review the vessel identities and quantities at pooling or redistribution boundaries before estimating work.');
  if (requiresProtocolChoice(model)) flag('check', 'Choose the dependent protocol alternatives on the workflow card before assessing.');
  if (!steps.length) flag('stop', 'This snapshot has no protocol steps.');
  else if (!actions.length) flag('stop', 'No operations were read from this snapshot.');
  if (bodyless.length) flag('check', `${bodyless.length} step(s) contain no body text beyond the title. Check whether those steps supply an instruction.`);
  if (tableInstructions.length) flag('check', `${tableInstructions.length} table line(s) start with an instruction and may contain work.`);
  if (source.some(step => step.inventoryWithoutAnchor.length)) flag('check', 'Some step inventory names are absent from the exported body text. Check the original for inline references or aliases.');
  if (quantities.length) flag('check', `${quantities.length} reading(s) state multiple quantities that may need separate assignments.`);
  if (omitted.length) flag('stop', `${omitted.length} protocol body lines have no reading. Review the skipped lines before relying on this reading.`);
  if (model.review.length) flag('stop', `${model.review.length} line${model.review.length === 1 ? ' was' : 's were'} not understood and are not counted in any time or step.`);
  if (noDuration.length) flag('check', `${noDuration.length} timed step${noDuration.length === 1 ? ' has' : 's have'} no duration in the text, so waits stay missing.`);
  if ((model.checks || []).length) flag('check', `${model.checks.length} reading${model.checks.length === 1 ? '' : 's'} to check (what is added, what is kept cold, tip reuse, conditions needed together).`);
  // Physical lint (#169): what the wells could not do as the text was read, run by hand.
  let physical = null;
  try { physical = physicalLint(raw); } catch { physical = null; }
  if (physical?.items.length) flag('check', `Physical lint: ${physical.impossible ? `${physical.impossible} step${physical.impossible === 1 ? '' : 's'} the wells cannot carry out as read` : ''}${physical.impossible && physical.questions ? ' and ' : ''}${physical.questions ? `${physical.questions} question${physical.questions === 1 ? '' : 's'} about volumes` : ''} (run by hand in ${physical.labware}).`);
  if (!flags.length) flag('ok', 'No issues found by the import checks. Review the source and its readings before relying on the plan.');
  return {
    provenance: {source: s.source, id: s.id, name: s.name, url: s.url || null, version: v.number ?? null, versionId: v.id ?? null, locked: s.source === 'labstep' ? v.is_draft === true ? false : isLabstepDraft(raw) ? null : true : null, lastVersion: v.is_last_version ?? null, unpublishedDraft: s.has_unpublished_draft ?? null, contentHash: s.content_hash || null, versionUpdated: v.updated_at || null, importedAt: raw.imported_at || null, capturedAt: s.source === 'labstep' ? labstepCapture(raw) : null, versions: raw.versions_count ?? null},
    steps: {count: steps.length, timers: steps.filter(x => x.prescribedSeconds != null).length, inventory: steps.filter(x => x.inventory?.length).length, devices: steps.filter(x => x.devices?.length).length, observed: !!s.observed},
    reading: {lines, qcGates: model.qcGates, operations: actions.length, sourceLines, source, omitted, tableInstructions, quantities, notUnderstood: model.review.map(x => ({step: x.step, line: x.line})), checks, timed: timed.length, noDuration: noDuration.map(a => ({actionId: a.id, line: a.line}))},
    materials: (model.materials || []).map(m => m.label),
    physical,
    flags,
  };
}
// Physical lint (#162): run one imported protocol (or a workflow model) by
// hand, robot-free, through the physical ledger at a few batch sizes and list
// what its containers could not do as read: per step, the kind, the detail, a
// suspected cause in how the text was read, and a suggested reading for the
// protocol owner. Read-only; a clean lint is never validation of the method.
const LINT_CAUSES = [
  {id: 'preparation-line', when: v => ['overflow', 'volume-unstated'].includes(v.kind) && /\b(to prepare|prepare (?:the |a |fresh )?\w+ (?:buffer|stock|solution)|first time only|before (?:first )?use|stock solution)\b/i.test(v.line),
    reading: 'This line looks like preparing a stock or buffer once per run, not a per-sample step. If so, it should not be counted in the sample well.'},
  {id: 'side-dilution', when: v => v.kind === 'overflow' && /\bdilute\b.*\bin\b/i.test(v.line) && !/\b(sample|beads?|pellet|cells)\b.*\bin\b/i.test(v.line.split(/\bdilute\b/i)[0] || ''),
    reading: 'This dilution is made in a separate tube (for a measurement), not in the sample well. Say where it is made.'},
  {id: 'vessel-change', when: v => v.kind === 'overflow' && /\b(transfer|move)\b[^.]*\bto (?:a |an |new |fresh |clean )*[\d.]+ ?m?l\b[^.]*\btubes?\b/i.test(v.line),
    reading: 'The step moves the samples to larger tubes; the volume no longer belongs in the original well. Model the change of vessel, or state the volume per well.'},
  // Not when the stated addition alone is larger than the well (#171): that is the volume, not a missing discard.
  {id: 'wash-without-discard', when: v => v.kind === 'overflow' && /\bwash/i.test(v.line) && !(v.addedUl > v.capacityUl),
    reading: 'A wash adds and removes liquid; the well overflows if the liquid before it is not removed first. State the discard before the wash (or read the wash as remove, add, remove).'},
  {id: 'no-stated-add', when: v => v.kind === 'remove-empty',
    reading: 'Nothing earlier puts liquid in the well, so the volume removed is unknown. State the volume the well holds at this point, or the step that adds it.'},
  {id: 'unstated-volume', when: v => ['volume-unstated', 'remove-unknown', 'mix-unknown'].includes(v.kind),
    reading: 'State the volume (µl per sample) this step moves, so the well can be followed.'},
  {id: 'pool-or-new-vessel', when: v => ['move-short', 'dest-not-empty'].includes(v.kind),
    reading: 'The step moves the samples (pooling, or to a fresh strip or plate). State where they go and the volume moved, and whether the destination is new.'},
  {id: 'beyond-labware', when: v => v.kind === 'overflow' && Number((v.detail.match(/would hold ([0-9.]+) µl/) || [])[1]) > Math.max(...Object.values(labwareData.labware).map(l => l.maxUl)),
    reading: 'More than any labware in the catalogue holds (flasks or large tubes, as in cell culture): this part is outside a per-well run. Run it by hand, or choose labware that holds it.'},
  {id: 'overflow', when: v => v.kind === 'overflow',
    reading: 'The stated volumes exceed the well. Check the volumes, or use larger labware for this part.'},
];
const lintCause = v => LINT_CAUSES.find(c => c.when(v)) || {id: 'other', reading: 'Check this step against the protocol text.'};
export const lintCauses = Object.fromEntries(LINT_CAUSES.map(c => [c.id, c.reading]));
export function lintModel(model, workloads = [24, 96]) {
  // A protocol in which no step but a reagent preparation touches a sample
  // (cells, nucleic acid, capsules) prepares reagents in bulk: its lines are
  // not per-sample steps, so there is no sample well to follow.
  const samples = new Set(dispensersData.reagentAccounting.sampleClasses);
  const acts = model.chunks.flatMap(c => c.actions);
  if (!acts.some(a => a.contact && a.contact !== 'batch' && (['sample-move', 'output-split'].includes(a.contact) || (a.materials || []).some(m => samples.has(m.class)) || (a.well || []).some(c => samples.has(c)))))
    return {workloads, format: model.format, labware: model.labware?.label || null, items: [], impossible: 0, questions: 0, reagentsOnly: true};
  const where = new Map();
  for (const c of model.chunks) for (const a of c.actions) where.set(a.id, {step: c.name, line: a.line || a.label, addedUl: a.volumeUl ?? null});
  const seen = new Map();
  for (const n of workloads) {
    for (const v of simulate(model, n, null).physical.violations) {
      if (!v.actionId) continue;
      const k = `${v.kind}:${v.actionId}`;
      if (seen.has(k)) { seen.get(k).at.push(n); continue; }
      const w = where.get(v.actionId) || {step: '', line: v.label};
      const item = {kind: v.kind, label: physicalKinds[v.kind] || v.kind, severity: v.severity, actionId: v.actionId, step: w.step, line: w.line, detail: v.detail, at: [n]};
      const cause = lintCause({...item, addedUl: w.addedUl, capacityUl: model.labware?.maxUl ?? null});
      seen.set(k, {...item, cause: cause.id, reading: cause.reading});
    }
  }
  const items = [...seen.values()];
  const count = sev => items.filter(i => i.severity === sev).length;
  return {workloads, format: model.format, labware: model.labware?.label || null, items, impossible: count('impossible'), questions: count('question')};
}
// One imported snapshot on its own, with no workflow to say what it runs in
// (#188): read in a 96-well PCR plate first; when its stated volumes overflow
// that, in each labware of the catalogue, keeping the one with the fewest
// impossible steps (then questions, then the smallest). The labware is named
// in the result as the lint's choice, not the protocol's.
export function physicalLint(raw, workloads = [24, 96]) {
  const s = normaliseSnapshot(raw);
  const v = s.version || {};
  const lint = id => {
    const lw = labwareData.labware[id];
    const model = buildOperationModel({id: `lint:${s.source}:${s.id}`, name: s.name, parts: [{source: s.source, id: s.id, versionId: v.id}], format: lw.format, labware: id, defaultWorkload: 1},
      {snapshots: {[`${s.source}:${s.id}`]: s}, lexicon, operations: OPS, labware: labwareData, materials: materialsData});
    return {...lintModel(model, workloads), labwareId: id};
  };
  let best = lint(labwareData.legacy.plate);
  if (best.impossible) for (const id of Object.keys(labwareData.labware).sort((a, b) => labwareData.labware[a].maxUl - labwareData.labware[b].maxUl)) {
    if (id === best.labwareId) continue;
    const l = lint(id);
    if (l.impossible < best.impossible || (l.impossible === best.impossible && l.questions < best.questions)) best = l;
  }
  return {source: s.source, id: s.id, name: s.name, version: v.number ?? null, versionId: v.id ?? null, ...best, labwareChosen: best.labwareId !== labwareData.legacy.plate};
}
export const labwareOptions = Object.entries(labwareData.labware).map(([id, l]) => ({id, label: l.label, format: l.format, wells: l.wells, maxUl: l.maxUl}));
export const labwareLegacy = labwareData.legacy;

// PyLabRobot's resource library (content/pylabrobot-labware.json, pinned
// import): every definition that is an instance of each planner labware type,
// matched by the geometry rules in content/labware.json.
const PLR = plrLabware.resources;
function matchesType(rule, name, r) {
  if (!rule || !rule.types.includes(r.type)) return false;
  const wells = r.wells ?? r.sites?.count ?? null, h = r.size_mm?.[2], v = r.well?.max_volume_ul;
  if (rule.wells != null && wells !== rule.wells) return false;
  if (rule.bottoms && !rule.bottoms.includes(r.well?.bottom_type)) return false;
  if (rule.maxHeightMm != null && !(h <= rule.maxHeightMm)) return false;
  if (rule.minHeightMm != null && !(h >= rule.minHeightMm)) return false;
  if (rule.maxWellUl != null && !(v <= rule.maxWellUl)) return false;
  if (rule.minWellUl != null && !(v >= rule.minWellUl)) return false;
  if (rule.name && !new RegExp(rule.name, 'i').test(name)) return false;
  // Deprecated aliases (capitalised duplicates) are skipped.
  return !/^Deprecated alias/.test(r.doc || '');
}
export const labwareModels = Object.fromEntries(Object.entries(labwareData.labware).map(([id, l]) => [id,
  Object.entries(PLR).filter(([name, r]) => matchesType(l.pylabrobot, name, r)).map(([name, r]) => ({id: name, model: r.model || null, skirt: r.plate_type || null, heightMm: r.size_mm[2], wellBrimUl: r.well?.max_volume_ul ?? null}))]));
export const pylabrobotSource = {commit: plrLabware.provenance.commit, url: plrLabware.provenance.sourceUrl};

// Researched labware fit (issue #55): which labware each deck, module and
// device class accepts, with its source. Records are keyed by catalogue
// handler id (its own deck and modules) or by device class (connected
// devices). Several models of one class: any 'yes' or 'adapter' means the
// class can be satisfied; only when every model says 'no' is it excluded.
const FIT = new Map();
for (const r of fitData.records) { const k = `${r.subject}|${r.part}`; if (!FIT.has(k)) FIT.set(k, []); FIT.get(k).push(r); }
export function labwareFit(subject, part, labwareId) {
  const hits = (FIT.get(`${subject}|${part}`) || []).map(r => ({module: r.module, ...(r.fits[labwareId] || {status: 'unknown'})}));
  const first = s => hits.find(h => h.status === s);
  const best = first('yes') || first('adapter') || (hits.length && hits.every(h => h.status === 'no') ? hits[0] : null) || first('unknown');
  return best ? {...best, models: hits} : {status: 'unknown', models: []};
}
const fitSubject = (handler, p) => (p.via === 'external' || p.via === 'workcell' || p.via === 'bench') ? p.op : handler.id;
const versionOf = model => model.sources.map(s => `${s.source} ${s.id} v${s.versionNumber}`).join(' · ');

const catalogue = {market, registry, map: equipmentMap};
export const handlers = liquidHandlers(catalogue).map(withRecordedModules);
// On-deck modules recorded with sourced ranges (#65) become optional modules
// of their handler. A recorded module replaces a vaguer catalogue entry for the
// same operation only when the record says so.
function withRecordedModules(h) {
  const mods = capsData.handlers[h.id];
  if (!mods) return h;
  const ops = {...h.ops};
  const alt = [];
  for (const [name, m] of Object.entries(mods)) {
    // A second module for an operation sits beside the one recorded for it
    // (#74, #144): a whole record marked alt, or the operations in altOps.
    for (const op of m.alt ? m.ops || [] : m.altOps || []) alt.push({op, module: name, basis: 'module record'});
  }
  for (const [name, m] of Object.entries(mods)) for (const op of m.ops || []) {
    if (m.alt) continue;
    if (ops[op]?.type === 'native') continue;
    if (ops[op] && !m.replaces?.includes(op)) continue;
    ops[op] = {type: 'optional', module: name, minUl: null, maxUl: null, basis: 'module record', detail: m.source?.quote || '', source: m.source?.url || null};
  }
  return {...h, ops, alt};
}
// Open-source builds (#78): an open-hardware entry with a build record can be
// modelled as a module the lab would build. Its ranges are the authors'
// reports; every fact it adds is a question until the builder confirms it.
// Kept out of handler.ops so a build is never mistaken for a sold option.
export const builds = openHardwareData.entries.filter(e => e.build).map(e => ({...e.build, id: e.id, name: e.name, url: e.url, maturity: e.maturity, validate: e.validate || [], statedCost: e.statedCost || null}));
const buildById = new Map(builds.map(b => [b.id, b]));
export const buildsFor = h => builds.filter(b => b.handler === h.id);
export const buildStates = {planned: 'Planned', built: 'Built', validated: 'Validated'};
const caps = structuredClone(capsData);
// Off-deck dispensers (#85): each catalogued device with its own volume range,
// dead volume and the liquids it takes. A connected or workcell dispenser can
// be any of them that suits the liquid.
export const dispensers = dispensersData;
const DISPENSERS = dispensersData.devices;
caps.classes.dispensing = DISPENSERS.map(d => ({name: d.name, id: d.id, temperature: null, agitation: null, dispense: d.dispense, source: d.sources[0]}));
const dispenserById = new Map(DISPENSERS.map(d => [d.id, d]));
export const benchProviders = [
  ...DISPENSERS.map(d => ({id: d.id, name: d.name, vendor: d.maker, kind: 'dispenser', source: d.sources[0]?.url ?? null})),
  ...benchData.referenceOnly,
];
export const TIP_RUNTIME = 'tips-runtime';
// Dispense time per plate (#173) from the device's throughput figures
// (seconds per plate at a volume and plate density). Interpolated between
// figures, or a figure at a larger volume or denser plate (an upper bound):
// sourced. Extrapolated past the largest figure, a 'starting from' best case,
// or no figure at all (the dispensing planning estimate): assumed.
export function dispenseTime(dev, volumeUl, wells = 96) {
  const th = dev?.throughput;
  const plan = est(OPS.dispensing.machine), planSec = {lo: plan.lo * 60, hi: plan.hi * 60};
  const out = (sec, kind, basis) => ({seconds: {lo: sec.lo, hi: Math.max(sec.lo, sec.hi)}, kind, basis, source: th?.source || null, note: th?.note || null});
  if (!th?.points?.length) return out(planSec, 'assumed', 'no time per plate from the maker: planning estimate');
  const counts = [...new Set(th.points.map(p => p.wells))].sort((a, b) => a - b);
  const at = counts.includes(wells) ? wells : counts.find(n => n > wells) ?? null;
  if (at == null) return out(planSec, 'assumed', `no figure for ${wells} wells or denser: planning estimate`);
  const stand = at !== wells ? ` (a ${at}-well figure, an upper bound for ${wells} wells)` : '';
  const pts = th.points.filter(p => p.wells === at);
  const floor = pts.find(p => p.ul == null);
  if (floor) return out({lo: floor.seconds, hi: Math.max(floor.seconds, planSec.hi)}, 'assumed', `the maker's best case, ${floor.seconds} s per ${at}-well plate (volume not stated); the upper end is the planning estimate`);
  const v = volumeUl ?? 0;
  const s = pts.slice().sort((a, b) => a.ul - b.ul);
  const fmt = x => `${x.ul} µl in ${x.seconds} s`;
  if (v <= s[0].ul) return out({lo: s[0].seconds, hi: s[0].seconds}, 'sourced', `${fmt(s[0])} per ${at}-well plate${stand}`);
  for (let i = 1; i < s.length; i++) if (v <= s[i].ul) {
    const a = s[i - 1], b = s[i], t = a.seconds + (b.seconds - a.seconds) * (v - a.ul) / (b.ul - a.ul);
    return out({lo: t, hi: t}, 'sourced', `between ${fmt(a)} and ${fmt(b)} per ${at}-well plate${stand}`);
  }
  const last = s[s.length - 1], prev = s[s.length - 2];
  const slope = prev ? Math.max(0, (last.seconds - prev.seconds) / (last.ul - prev.ul)) : null;
  const hi = slope != null ? last.seconds + slope * (v - last.ul) : Math.max(last.seconds, planSec.hi);
  return out({lo: last.seconds, hi}, 'assumed', slope != null ? `${v} µl is beyond the largest figure (${fmt(last)} per ${at}-well plate${stand}): extrapolated` : `${v} µl is beyond the only figure (${fmt(last)} per ${at}-well plate${stand}); the upper end is the planning estimate`);
}
// Several devices can stand behind one generic provider: the envelope of their times.
function dispenseStep(devs, action, wells) {
  const ts = devs.map(d => ({d, t: dispenseTime(d, mostUl(action), wells)}));
  return {seconds: {lo: Math.min(...ts.map(x => x.t.seconds.lo)), hi: Math.max(...ts.map(x => x.t.seconds.hi))}, kind: ts.every(x => x.t.kind === 'sourced') ? 'sourced' : 'assumed',
    basis: ts.map(x => `${x.d.name}: ${x.t.basis}`).join('; '), sources: ts.map(x => x.t.source).filter(Boolean)};
}
for (const b of builds) (caps.handlers[b.handler] ??= {})[b.module] = {ops: b.ops, temperature: b.temperature ?? null, agitation: b.agitation ?? null, source: {url: b.url, quote: b.basis}, build: b.id};
function buildFit(p, labwareId) {
  const b = buildById.get(p.build), f = b.labware?.[labwareId];
  return f ? {status: f.status, module: b.module, detail: f.detail || '', source: {url: f.url || b.url, title: b.name}} : {status: 'unknown', module: b.module, toSettle: `test-fit it with the build (${b.url})`};
}

export const classes = deviceClasses(catalogue);
export const workcellOptions = workcells(catalogue);

export const scopes = {
  accessible: {label: 'Use equipment we can access', short: 'Accessible now', help: 'Only instruments you have added under “Your equipment”, with every fitting confirmed. Nothing unknown is assumed.'},
  upgrade: {label: 'Improve what we can access', short: 'Existing + upgrades', help: 'Instruments you have added, including fittings and connected devices that are unconfirmed or would need adding. Each assumption becomes a question.'},
  design: {label: 'Design a complete setup', short: 'Any setup', help: 'Every liquid handler in the catalogue, with any on-deck modules and connected devices, including workcells. Budget is not a ceiling; physical limits still apply.'},
};
export const objectives = {
  labour: {label: 'Least hands-on time'},
  visits: {label: 'Fewest returns to the bench'},
  simplest: {label: 'Least new equipment for most of the benefit'},
  cost: {label: 'Lowest priced cost for most of the benefit'},
  walkaway: {label: 'Longest walk-away for most of the benefit'},
  [TIP_RUNTIME]: {label: 'Fewer tips and shorter run time'},
};
// A timed unattended window at least this long can run overnight (#92).
export const overnightMinutes = operationsData.overnightMinutes || 480;

const est = r => ({lo: r[0], hi: r[1]});
const add = (a, b) => ({lo: a.lo + b.lo, hi: a.hi + b.hi});
const times = (r, m) => ({lo: r.lo * m, hi: r.hi * m});
const zero = () => ({lo: 0, hi: 0});
export const mid = r => (r.lo + r.hi) / 2;

export function createDecisionRequest(model, scope = 'design') {
  return {protocolId: model.protocolId, workload: model.defaultWorkload, scope, objective: 'labour', methodChanges: false, builds: false, pylabrobot: 'any', facts: {}};
}

export function requiresProtocolChoice(model) {
  return model.alternatives?.some(alt => alt.requiresChoice && !alt.chosen) === true;
}

export function protocolDecisionBlocker(model) {
  if (model.materialBoundaries?.length) return 'Review pooling and redistribution boundaries to identify their vessels and quantities, or assess a block that excludes them.';
  if (model.unresolvedOutput) return 'Select a block ending at the split output and declare which vessel enters later work.';
  if (model.block?.washBoundaryOpen) return 'Include the following liquid-handling step to resolve how the selected block ends after the wash.';
  if (model.block?.input.volumeUl === null) return 'Record the starting volume for the selected block before estimating its work.';
  if (model.qcGates?.length) return 'Review the quality-control gates on the workflow card before assessing.';
  if (requiresProtocolChoice(model)) return 'Choose the dependent protocol alternatives before assessing.';
  return null;
}

export function validateDecisionRequest(input, model) {
  const r = structuredClone(input);
  if (!model || model.protocolId !== r.protocolId) throw Error(`No operation model for ${r.protocolId}`);
  const blocker = protocolDecisionBlocker(model);
  if (blocker) throw Error(blocker);
  if (!Object.hasOwn(scopes, r.scope) || !Object.hasOwn(objectives, r.objective)) throw Error('Unknown scope or objective');
  if (!Number.isInteger(r.workload) || r.workload < 1 || r.workload > 100000) throw Error('Workload must be a whole number from 1 to 100000');
  if (!r.facts || typeof r.facts !== 'object') r.facts = {};
  for (const [k, v] of Object.entries(r.facts)) if (typeof v !== 'string' || k.length > 160 || v.length > 40) throw Error('Invalid fact');
  r.methodChanges = r.methodChanges === true;
  if (r.pylabrobot === undefined) r.pylabrobot = 'any';
  // Workflow variants (#171): ids from the workflow's own `variants`.
  if (r.variants == null) r.variants = [];
  if (!Array.isArray(r.variants) || r.variants.some(id => !(model.variants || []).some(v => v.id === id))) throw Error('Unknown workflow variant');
  if ((model.variants || []).some(v => r.variants.includes(v.id) && Object.hasOwn(v, 'targets'))) {
    throw Error('Review the source-pinned proposal in Protocols. An evidence-qualified method is needed before estimating it.');
  }
  if (!['any', 'prefer', 'only'].includes(r.pylabrobot)) throw Error('Unknown PyLabRobot preference');
  // Reagent prices (#85): GBP per ml for each material class, given by the person.
  if (r.reagentPrices != null) {
    if (typeof r.reagentPrices !== 'object') throw Error('Invalid reagent prices');
    for (const [k, v] of Object.entries(r.reagentPrices)) if (k.length > 60 || !Number.isFinite(v) || v < 0) throw Error('Invalid reagent price');
  }
  // Miniaturised reactions (#85): every volume scaled by this factor; a method change, never chosen by the engine.
  if (r.reactionScale == null) r.reactionScale = 1;
  if (model.block && r.reactionScale !== 1) throw Error('Reaction scaling needs a new input declaration for the selected block.');
  // Labour rate (#94): GBP per hour of hands-on time, the person's own figure.
  if (r.labourRate != null && (!Number.isFinite(r.labourRate) || r.labourRate < 0 || r.labourRate > 1000)) throw Error('Labour rate must be 0 to 1000 GBP per hour');
  // Runs per year (#138): the person's own figure, for yearly costs only.
  if (r.runsPerYear != null && (!Number.isFinite(r.runsPerYear) || r.runsPerYear < 0 || r.runsPerYear > 100000)) throw Error('Runs per year must be 0 to 100000');
  // Features the person must have (#92): each becomes a fact on every setup.
  if (r.needs == null) r.needs = [];
  if (!Array.isArray(r.needs) || r.needs.some(f => !Object.hasOwn(featuresData.features, f))) throw Error('Unknown feature in needs');
  if (r.dispenserFor != null && (typeof r.dispenserFor !== 'string' || r.dispenserFor.length > 400)) throw Error('Invalid dispenser target');
  if (!Number.isFinite(r.reactionScale) || r.reactionScale < 0.05 || r.reactionScale > 1) throw Error('Reaction scale must be from 0.05 to 1');
  return r;
}

// How many times an action happens for this batch.
function occurrences(model, action, workload) {
  const op = OPS[action.kind];
  const units = model.format === 'plate' ? Math.ceil(workload / model.unitSize) : workload;
  const per = op.scale === 'batch' ? 1 : op.scale === 'sample' ? workload : units;
  return action.count.n * per;
}

function manualMinutes(model, action, workload, m) {
  const op = OPS[action.kind];
  let t = times(est(op.person[model.format] || op.person.plate), m);
  if (op.personPerSample) t = add(t, times(est(op.personPerSample), workload * action.count.n));
  // Each ingredient in a reagent table is another pipetting step.
  if (op.personPerComponent && action.components?.length) t = add(t, times(est(op.personPerComponent), action.components.length * action.count.n));
  return t;
}

// ---------------------------------------------------------------- setups
// A setup is a liquid handler plus a set of capability providers:
//   {op, via: 'native' | 'module' | 'external' | 'scheduler' | 'workcell', module?}
// 'external' = the handler's record lists the operation as an external
// integration; 'scheduler' = the handler can move plates but no integration
// is recorded (unverified); 'workcell' = connected through a workcell.

function providersFor(setup, op) {
  return setup.providers.filter(p => p.op === op);
}

const performers = op => {
  const by = OPS[op]?.performedBy;
  return [op, ...(Array.isArray(by) ? by : by ? [by] : [])];
};

// A substitution scoped by the workflow (`when.scoped`, #171) is never a
// fallback route: it applies only where a workflow variant puts it.
const subsFrom = op => substitutionsData.substitutions.filter(s => s.from === op && !s.when?.scoped);
const SUBS = new Map(substitutionsData.substitutions.map(s => [s.id, s]));

function variantAnchor(source, bodyLine) {
  if (!source || !['labstep', 'text', 'protocolsio'].includes(source.source) ||
      source.id == null || source.versionId == null || !Number.isSafeInteger(source.position) || source.position < 1 ||
      !Number.isSafeInteger(bodyLine) || bodyLine < 1 || (source.source === 'labstep' && !source.contentHash)) return null;
  return JSON.stringify([source.source, source.id, source.versionId, source.contentHash ?? null, source.stepGuid ?? null, source.position, bodyLine]);
}

function resolveVariantTargets(targets, rows) {
  if (!Array.isArray(targets) || targets.length === 0 || targets.length > 500) {
    return {selected: new Set(), targetIssues: [{target: null, reason: 'Declare between 1 and 500 source actions.'}]};
  }
  const candidates = new Map();
  for (const {chunk, action} of rows) {
    const key = variantAnchor(chunk.source, action.source?.bodyLine);
    if (!key) continue;
    if (!candidates.has(key)) candidates.set(key, []);
    candidates.get(key).push(action.id);
  }
  const seen = new Set(), selected = new Set(), targetIssues = [];
  for (const [index, target] of targets.entries()) {
    const key = variantAnchor(target, target?.bodyLine);
    const matches = candidates.get(key) || [];
    let reason;
    if (!key) reason = 'Incomplete source anchor.';
    else if (seen.has(key)) reason = 'Duplicate source anchor.';
    else if (!matches.length) reason = 'No eligible action at this source and revision in the selected branch and block.';
    else if (matches.length !== 1) reason = 'Several eligible actions share this source line. Review their scope.';
    if (reason) targetIssues.push({target: index + 1, reason});
    else selected.add(matches[0]);
    if (key) seen.add(key);
  }
  return {selected: targetIssues.length ? new Set() : selected, targetIssues};
}

// ---------------------------------------------------------------- workflow variants (#171)
// A variant is workflow data: a what-if that replaces an operation by a
// substitution in named stages (chunk ids), except lines matching `except`.
// Switched on in the request (`variants`), it changes the protocol itself, so
// today's practice by hand changes too; every replaced step keeps its
// validation question. Durations of the replaced steps are not known: they
// are left missing, never copied from the step they replace.
export function variantPlan(model, v) {
  const s = SUBS.get(v.substitution);
  if (!s) throw Error(`Variant ${v.id} names an unknown substitution ${v.substitution}`);
  if (!s.when?.scoped) throw Error(`Substitution ${s.id} is not a scoped substitution; variants use only those`);
  if (Object.hasOwn(v, 'targets')) {
    const rows = model.chunks.flatMap(chunk => chunk.actions.filter(a => a.kind === s.from).map(action => ({chunk, action})));
    const {selected, targetIssues} = resolveVariantTargets(v.targets, rows);
    const changed = [], kept = [];
    for (const {chunk, action} of rows) {
      const row = {chunkId: chunk.id, step: chunk.name, actionId: action.id, label: action.label,
        source: chunk.source.source, versionId: chunk.source.versionId, position: chunk.source.position, bodyLine: action.source?.bodyLine ?? null};
      if (selected.has(action.id)) changed.push(row);
      else kept.push({...row, why: targetIssues.length ? 'Target review pending' : 'Outside the proposed replacement scope'});
    }
    return {id: v.id, label: v.label || v.id, note: v.note || null, substitution: s.id, from: s.from, to: s.to, question: s.question,
      owner: s.owner, missingStages: [], changed, kept, targetIssues, reviewOnly: true};
  }
  const stages = new Set(v.stages || []);
  const except = v.except ? new RegExp(v.except, 'i') : null;
  const ids = new Set(model.chunks.map(c => c.id));
  const changed = [], kept = [];
  for (const c of model.chunks) for (const a of c.actions) {
    if (a.kind !== s.from) continue;
    const row = {chunkId: c.id, step: c.name, actionId: a.id, label: a.label};
    if (!stages.has(c.id)) kept.push({...row, why: 'outside the variant’s stages'});
    else if (except?.test(a.line)) kept.push({...row, why: v.exceptWhy || 'excepted by the variant'});
    else changed.push(row);
  }
  return {id: v.id, label: v.label || v.id, note: v.note || null, substitution: s.id, from: s.from, to: s.to, question: s.question, owner: s.owner,
    missingStages: [...stages].filter(id => !ids.has(id)), changed, kept};
}
export function applyVariants(model, ids = []) {
  const chosen = (model.variants || []).filter(v => ids.includes(v.id));
  if (!chosen.length) return model;
  const m = {...model, chunks: model.chunks.map(c => ({...c, actions: c.actions.map(a => ({...a}))})), activeVariants: chosen.map(v => v.id)};
  for (const v of chosen) {
    const plan = variantPlan(m, v);
    if (plan.reviewOnly) throw Error('The source-pinned variant is pending method qualification.');
    const hit = new Set(plan.changed.map(x => x.actionId));
    for (const a of m.chunks.flatMap(c => c.actions)) if (hit.has(a.id)) Object.assign(a, {kind: plan.to, substitutedFrom: a.kind, substitution: plan.substitution, variant: v.id, wait: null, label: `${a.label} → ${OPS[plan.to]?.label?.toLowerCase() || plan.to} (${v.label || v.id})`});
  }
  return m;
}

// ---------------------------------------------------------------- module ranges (#65)
// A step uses a module or device only if its recorded range covers every
// condition the step needs at the same time. Unknown is asked, never assumed.
const AMBIENT = caps.ambientC;
const NEEDS_TEMP = new Set(['shaking', 'rotation', 'incubation', 'heating-cooling', 'agitation']);
function need(action, op) {
  const c = action.conditions || {};
  const t = c.temperatureC != null && Math.abs(c.temperatureC - AMBIENT) > 3 && NEEDS_TEMP.has(op) ? c.temperatureC : null;
  const agitate = op === 'shaking' || op === 'rotation';
  return t == null && !agitate ? null : {temperatureC: t, agitate};
}
function minC(t) {
  if (t.cooling === 'relative') return Math.max(t.min ?? -Infinity, AMBIENT - t.belowAmbientK);
  if (t.cooling === 'none') return t.min ?? AMBIENT + (t.aboveAmbientK || 0);
  return t.min;
}
// true = covers, false = cannot, null = not known.
export function covers(dev, n) {
  if (n.temperatureC != null) {
    const t = dev.temperature;
    if (!t) return false;
    if (minC(t) == null || t.max == null) return null;
    if (n.temperatureC < minC(t) || n.temperatureC > t.max) return false;
  }
  if (n.agitate) {
    if (!dev.agitation) return false;
    if (n.temperatureC != null && dev.agitation.duringTemperature !== true) return dev.agitation.duringTemperature === false ? false : null;
  }
  return true;
}
function rangeCheck(setup, p, action) {
  const n = need(action, p.op);
  if (!n || p.via === 'native') return {ok: true};
  const devices = p.via === 'module' ? (caps.handlers[setup.handler.id]?.[p.module] ? [{name: p.module, ...caps.handlers[setup.handler.id][p.module]}] : null) : caps.classes[p.op] || null;
  const what = [n.agitate && 'agitation', n.temperatureC != null && `${n.temperatureC} °C`].filter(Boolean).join(' at ');
  if (!devices) return {ok: true, fact: `range:${p.op}:${n.temperatureC ?? ''}:${n.agitate ? 'agitate' : ''}`};
  const res = devices.map(d => ({d, v: covers(d, n)}));
  const yes = res.filter(r => r.v === true), maybe = res.filter(r => r.v === null);
  if (yes.length) return {ok: true, device: yes[0].d.name, fact: p.via === 'module' ? null : `device:${p.op}:${yes.map(r => r.d.name).join(' / ')}`};
  if (maybe.length) return {ok: true, fact: `range:${p.op}:${n.temperatureC ?? ''}:${n.agitate ? 'agitate' : ''}:${maybe.map(r => r.d.name).join(' / ')}`};
  return {ok: false, reason: `${devices.map(d => d.name).join(', ')} cannot provide ${what}${devices[0]?.temperature ? ` (${devices.map(d => d.temperature ? `${d.name}: ${minC(d.temperature) ?? '?'}–${d.temperature.max} °C${d.agitation ? (d.agitation.duringTemperature ? ', shakes while holding temperature' : '') : ', no agitation'}` : `${d.name}: no temperature control`).join('; ')})` : ''}.`};
}

// Which dispensers can take this liquid (#74, #85). An on-deck dispenser
// without a record of handling suspensions is kept to clear liquids; an
// off-deck device takes suspensions only if its record says so, and only
// volumes inside its range.
const settlesClass = id => !!materialsData.classes[id]?.properties?.settles;
// suspensions: true = any settling material; a list = only those classes.
const takesSuspension = (rec, classes) => rec?.suspensions === true || (Array.isArray(rec?.suspensions) && classes.every(c => rec.suspensions.includes(c)));
// The liquids an action pipettes one by one: an 'X in Y' line (#112) puts
// X + Y in the well (volumeUl) but each aspiration is X or Y alone, so ranges,
// tip sizes and minimums are checked against the parts.
const leastUl = a => a.partsUl ? Math.min(...a.partsUl) : a.volumeUl;
const mostUl = a => a.partsUl ? Math.max(...a.partsUl) : a.volumeUl;
function dispenseOk(rec, action, settles) {
  if (settles && !takesSuspension(rec, (action.materials || []).map(m => m.class).filter(settlesClass))) return false;
  const lo = leastUl(action), hi = mostUl(action);
  return !(lo != null && rec && ((rec.minUl != null && lo < rec.minUl) || (rec.maxUl != null && hi > rec.maxUl)));
}
function dispensersFor(setup, p, action, settles) {
  if (p.via === 'module' || p.via === 'native') {
    const rec = Object.values(caps.handlers[setup.handler.id] || {}).find(m => m.ops?.includes('dispensing'))?.dispense;
    return dispenseOk(rec, action, settles) ? [{id: null, name: p.module || 'on-deck dispenser', dispense: rec || null}] : [];
  }
  return DISPENSERS.filter(d => (!p.device || d.id === p.device) && dispenseOk(d.dispense, action, settles));
}
// Settling or fragile material already in the well that a dispense from above
// lands on (#85): beads and cells. Never assumed safe.
function landsOn(action) {
  const adding = new Set((action.materials || []).map(m => m.class));
  return (action.well || []).filter(id => !adding.has(id) && (settlesClass(id) || materialsData.classes[id]?.properties?.shearSensitive));
}

// Reagents the protocol keeps cold (#65): their material class must be kept
// cold, or the protocol says so for that reagent.
const coldClasses = new Set(Object.entries(materialsData.classes).filter(([, c]) => c.properties.keepCold).map(([id]) => id));
function coldReagent(model, action) {
  if (!['contact', 'free'].includes(action.contact)) return false;
  return (action.materials || []).some(m => coldClasses.has(m.class) || model.materials?.find(x => x.class === m.class)?.keepColdStated?.length);
}
function coldPosition(setup) {
  return setup.providers.find(p => p.op === 'heating-cooling' && p.via === 'module' && (() => { const t = caps.handlers[setup.handler.id]?.[p.module]?.temperature; return t && minC(t) != null && minC(t) <= 8; })());
}

// Numeric bounds are evidence only when they are finite and positive.
// A reversed pair does not supply a usable lower or upper limit.
const positiveBound = value => Number.isFinite(value) && value > 0 ? value : null;
function headBounds(head) {
  const min = positiveBound(head?.minUl), max = positiveBound(head?.maxUl);
  return min != null && max != null && min > max ? {min: null, max: null} : {min, max};
}
const completeBounds = ({min, max}) => min != null && max != null;
const hasHeadRange = head => completeBounds(headBounds(head));
function pipetteRange(setup, action) {
  const heads = setup.pipettes
    ? (setup.pipettes.heads?.length ? setup.pipettes.heads : [null])
    : [setup.handler.ops['liquid-transfer']];
  const ranges = heads.map(headBounds);
  const lo = leastUl(action), hi = mostUl(action);
  const coversParts = ({min, max}) => (lo == null || min == null || lo >= min) && (hi == null || max == null || hi <= max);
  const known = ranges.filter(completeBounds);
  const verified = known.some(coversParts);
  const unverified = !verified && ranges.some(range => !completeBounds(range) && coversParts(range));
  return {fits: verified || unverified, unverified, hasKnownRange: known.length > 0,
    min: ranges.every(h => h.min != null) ? Math.min(...ranges.map(h => h.min)) : null,
    max: ranges.every(h => h.max != null) ? Math.max(...ranges.map(h => h.max)) : null,
    knownMax: known.length ? Math.max(...known.map(h => h.max)) : null};
}

// Decide who does one action in a setup. Returns {auto, provider, location, facts[], reason, passes}
function assign(setup, action, allowSubs, model = null, here = null) {
  const contactOnMagnet = ['wash', 'removal', 'removal+add', 'sample-move'].includes(action.contact);
  const onMagnet = action.conditions?.onMagnet;
  const liquidHandling = action.kind === 'liquid-transfer' || (action.kind === 'magnetic-separation' && contactOnMagnet);
  const magneticStations = liquidHandling && onMagnet !== false && (contactOnMagnet || onMagnet === true)
    ? providersFor(setup, 'magnetic-separation') : [];
  const currentMagnet = here && magneticStations.find(p => p.via !== 'native' && positionOf(setup, p).id === here.id);
  const needsMagnet = liquidHandling && (onMagnet === true || (contactOnMagnet && currentMagnet));
  const magnets = currentMagnet ? [currentMagnet] : magneticStations;
  const accessible = needsMagnet ? magnets.filter(p => {
    const position = positionsData.handlers[setup.handler.id]?.[p.module];
    return ['native', 'module'].includes(p.via) && position?.pipetting === true;
  }) : [];
  const fit = model?.labware && needsMagnet ? labwareFit(setup.handler.id, 'magnetic-separation', model.labware.id) : null;
  const magnet = fit?.status === 'no' ? null : accessible[0] ?? null;
  const manualAt = needsMagnet && currentMagnet && fit?.status !== 'no' ? here : null;
  if (needsMagnet && !magnet) {
    const reason = !magnets.length ? 'This liquid-handling step requires a pipette-accessible magnet. No magnetic position is included in this setup.'
      : accessible.length ? 'The recorded magnetic position is incompatible with this labware. An operator must use a compatible stand.'
      : 'No recorded magnetic position for this step can be reached by the pipetting head. An operator handles the liquid at the magnet.';
    return {auto: false, manualAt, reason};
  }
  const head = pipetteRange(setup, action);
  const rejected = [];
  const tryOp = (op, extraFacts = [], split = false) => {
    for (const p of providersFor(setup, op)) {
      if (magnet && (op === 'magnetic-separation' ? p !== magnet : op !== 'liquid-transfer' || p.via !== 'native')) continue;
      const facts = [...extraFacts];
      const pipettesLiquid = op === 'liquid-transfer' || (op === 'magnetic-separation' && ['wash', 'removal', 'removal+add'].includes(action.contact));
      if (op === 'liquid-transfer' && leastUl(action) != null && head.min != null && leastUl(action) < head.min) return {blocked: `${leastUl(action)} µL is below the ${head.min} µL minimum of this pipetting head; kept manual rather than changing the volume.`, belowMin: {ul: leastUl(action), min: head.min}};
      if (pipettesLiquid && !head.fits && !split && (op === 'liquid-transfer' || !head.hasKnownRange)) {
        return {blocked: 'The transfer falls outside the available bounds of every configured pipetting head.'};
      }
      const rangeUnverified = pipettesLiquid && head.unverified;
      if (rangeUnverified) {
        const floor = pipettesData.defaults.unknownRangeManualBelowUl;
        if (leastUl(action) != null && leastUl(action) < floor) {
          return {blocked: `${leastUl(action)} µL is below the ${floor} µL planning floor for an unverified head range. Confirm the head before automating.`};
        }
        facts.push('head-range');
      }
      if (pipettesLiquid && (action.materials || []).some(m => settlesClass(m.class) || materialsData.classes[m.class]?.properties?.viscous)) facts.push('pipette-liquid-class');
      const range = rangeCheck(setup, p, action);
      if (!range.ok) { rejected.push(range.reason); continue; }
      if (range.fact) facts.push(range.fact);
      for (const n of OPS[action.kind]?.needsAlso || []) if (!providersFor(setup, n).length) return null;
      let also = null;
      if (['liquid-transfer', 'dispensing'].includes(op) && model && coldReagent(model, action)) {
        also = coldPosition(setup);
        if (!also) { if (!allowSubs) return {blocked: 'The reagent is kept cold and this setup has no cold position on the deck, so it stays by hand (keeping it at room temperature is a method change, switched off).'}; facts.push('method:cold-reagent-at-room-temperature'); }
      }
      for (const c of action.constraints || []) facts.push(`constraint:${c}`);
      return {auto: true, provider: p, facts, also, magnet, manualAt, rangeUnverified};
    }
    return null;
  };
  // 0. A shared reagent dispensed without touching the wells goes to an
  // on-deck dispenser when the setup has one and the liquid suits it: no tips (#72).
  if (!magnet && action.contact === 'free' && action.kind === 'liquid-transfer') {
    const settles = (action.materials || []).some(m => settlesClass(m.class));
    for (const disp of setup.providers.filter(p => p.op === 'dispensing')) {
      if (setup.reportMechanisms && ['bench', 'workcell'].includes(disp.via)) {
        if (!disp.device || !setup.completePlates) continue;
        const assessed = assignBenchDispenser(disp, action, model);
        if (assessed.auto) return assessed;
        continue;
      }
      if (setup.reportMechanisms && (action.removeFirst || action.partsUl || transferLayout(action) ||
          action.conditions?.onMagnet === true || coldReagent(model, action) ||
          !(leastUl(action) > 0) || !(mostUl(action) > 0))) continue;
      const devs = dispensersFor(setup, disp, action, settles);
      if (!devs.length) continue;
      const viscous = (action.materials || []).some(m => materialsData.classes[m.class]?.properties?.viscous);
      const facts = setup.reportMechanisms ? (action.constraints || []).map(c => `constraint:${c}`) : [];
      if (viscous && !devs.every(d => d.dispense?.viscous === true)) facts.push('dispense-viscous');
      const onto = landsOn(action);
      if (onto.length) facts.push(`dispense-onto:${onto.join('/')}`);
      return {auto: true, provider: disp, facts, also: null, dispensed: true, devices: devs};
    }
  }
  // 1. Direct, or by a device that performs this operation.
  for (const op of performers(action.kind)) {
    if (op === 'liquid-transfer' && mostUl(action) != null && head.max != null && mostUl(action) > head.max) continue;
    const got = tryOp(op);
    if (got?.blocked) return {auto: false, manualAt, reason: got.blocked, belowMin: got.belowMin || null};
    if (got) return got;
  }
  // 2. Method changes: each adds a validation question.
  if (allowSubs) {
    for (const op of performers(action.kind)) for (const s of subsFrom(op)) {
      if (s.when?.coldReagent) continue; // applied inside tryOp, not as a route of its own
      if (s.when?.additionOnly && !action.additionOnly) continue;
      if (s.when?.cold && !(action.conditions?.temperatureC != null && action.conditions.temperatureC <= 10)) continue;
      const split = s.when?.aboveHeadMax === true;
      if (split && !(mostUl(action) != null && head.max != null && head.knownMax != null && mostUl(action) > head.max)) continue;
      const got = tryOp(s.to, [`method:${s.id}`], split);
      if (got && !got.blocked) return {...got, substitution: s, passes: split ? Math.ceil(mostUl(action) / head.knownMax) : 1};
    }
  }
  const op = OPS[action.kind];
  if (action.kind === 'liquid-transfer' && mostUl(action) != null && head.max != null && mostUl(action) > head.max) return {auto: false, manualAt, reason: `${mostUl(action)} µL is above the ${head.max} µL maximum of this pipetting head${allowSubs ? '' : ' (splitting into passes is a method change that is switched off)'}.`};
  if (rejected.length) return {auto: false, manualAt, reason: [...new Set(rejected)].join(' ')};
  return {auto: false, manualAt, reason: `No device in this setup performs “${op.label.toLowerCase()}”${allowSubs ? '' : ' without a method change'}.`};
}

// ---------------------------------------------------------------- plate positions (#63)
// Each module and connected device is its own position. A module either
// needs the plate moved onto it ('move-on') or acts on the plate where it
// sits ('in-place'). Every change of position is a move: by the gripper on
// deck, by the workcell arm, or by a person.
const DECK = {id: 'deck', label: 'a deck position', mode: 'move-on', pipetting: true, onDeck: true, basis: 'deck'};
function positionOf(setup, p) {
  if (p.via === 'native') return DECK;
  if (p.via === 'module') return {id: `module:${p.module}`, label: p.module, ...(positionsData.handlers[setup.handler.id]?.[p.module] || positionsData.default), onDeck: true};
  // A standalone device on the bench beside the handler (#85): a person carries the plate.
  if (p.via === 'bench') return {id: `bench:${p.op}`, label: `${DISPENSERS.find(d => d.id === p.device)?.name || OPS[p.op]?.label?.toLowerCase() || p.op} on the bench`, ...positionsData.devices, onDeck: false};
  return {id: `device:${p.op}`, label: `${OPS[p.op]?.label?.toLowerCase() || p.op.replace(/-/g, ' ')} device`, ...positionsData.devices, onDeck: false};
}
// Where the plate has to be for this action, given where it is now.
function placeFor(setup, a, provider, here) {
  const magnet = setup.providers.find(p => p.op === 'magnetic-separation');
  const magPos = magnet ? positionOf(setup, magnet) : null;
  const on = a.conditions?.onMagnet;
  const offMagnet = () => magPos?.mode === 'in-place' ? magPos : here && here.pipetting && here.id !== magPos?.id ? here : DECK;
  if (provider.op === 'magnetic-separation') return on === false ? offMagnet() : magPos || positionOf(setup, provider);
  if (provider.via === 'native') {
    if (on === true && magPos) return magPos;
    if (on === false) return offMagnet();
    return here && here.pipetting ? here : DECK;
  }
  return positionOf(setup, provider);
}
function mover(setup, from, to) {
  const arm = setup.providers.find(p => p.op === 'vessel-transfer');
  if (from.onDeck && to.onDeck) return arm && ['native', 'module'].includes(arm.via) ? 'gripper' : 'person';
  if (arm && (arm.via === 'workcell' || setup.route === 'workcell')) return 'arm';
  return arm && arm.via !== 'workcell' && setup.providers.some(p => p.via === 'external' && (p.op === to.id.slice(7) || p.op === from.id.slice(7))) ? 'gripper' : 'person';
}

// ---------------------------------------------------------------- pipettes and tips (#67)
// A configuration is the set of heads fitted together. Each transfer uses a
// head whose range covers its volume and the smallest tip that holds it.
// Tips are counted per tip event from the contact class read from the
// protocol (#61): a shared reagent dispensed without touching the well uses
// one set of tips; touching the sample uses one tip per sample; removals reuse
// each sample's parked tip within a step where the software supports it.
export function pipetteConfigs(handler) {
  const d = pipettesData.handlers[handler.id];
  if (!Array.isArray(d?.configurations)) return null;
  const heads = Array.isArray(d.heads) ? d.heads : [];
  return d.configurations.map(c => ({...c, heads: c.heads.map(id => heads.find(h => h.id === id)).filter(Boolean), data: d}));
}
export const installedHeadStatuses = ['confirmed', 'reported', 'unknown', 'conflicting'];

export function installedHeadOptions(handler) {
  return (pipettesData.handlers[handler.id]?.heads || []).map(head => ({
    id: head.id, label: head.label, channels: head.channels,
    independent: headMode(handler.id, head) === 'independent',
  }));
}

export function validateInstalledHeads(handler, record) {
  if (!record || !installedHeadStatuses.includes(record.status) || !Array.isArray(record.heads)) return false;
  if (record.status === 'unknown' || record.status === 'conflicting') return record.heads.length === 0;
  const options = installedHeadOptions(handler);
  if (!record.heads.length || record.heads.length > options.length) return false;
  const ids = new Set();
  for (const entry of record.heads) {
    const head = options.find(x => x.id === entry?.id);
    if (!head || ids.has(entry.id) || !Number.isInteger(entry.channels) || entry.channels < 1
      || entry.channels > head.channels || (!head.independent && entry.channels !== head.channels)) return false;
    ids.add(entry.id);
  }
  const configurations = pipettesData.handlers[handler.id]?.configurations || [];
  return configurations.some(config => [...ids].every(id => config.heads.includes(id)));
}

export function installationPipetteConfigs(handler, installation) {
  const record = installation?.installedHeads;
  if (record === undefined) return pipetteConfigs(handler);
  if (!validateInstalledHeads(handler, record) || !record.heads.length) return [];
  const data = pipettesData.handlers[handler.id];
  const heads = data.heads.flatMap(head => {
    const fitted = record.heads.find(x => x.id === head.id);
    if (!fitted) return [];
    const label = headMode(handler.id, head) === 'independent' ? `${head.label} (×${fitted.channels})` : head.label;
    return [{...head, label, channels: fitted.channels}];
  });
  const id = 'as-installed:' + heads.map(head => `${head.id}-${head.channels}`).join('+');
  return [{id, label: heads.map(head => head.label).join(' + '), heads, data, evidence: []}];
}

// Channel independence, programming route and PyLabRobot support per
// handler (#82), each with its source. A head is 'independent' (own Z drive,
// variable spacing, a volume per channel), 'fixed' (moves as one block at a
// fixed pitch) or 'fixed-partial' (a block that can pick up fewer tips).
export const handlerChannels = channelsData;
export const channelsFor = id => channelsData.handlers[id] || null;
// PyLabRobot support comes from the pinned registry (lib/equipment.js).
export const pylabrobotStatuses = channelsData.pylabrobotStatuses;
const plrRank = c => Object.keys(channelsData.pylabrobotStatuses).indexOf(c.handler?.pylabrobot?.status ?? 'none');
const headMode = (handlerId, head) => channelsData.handlers[handlerId]?.heads?.[head.id]?.mode || null;
// Transfers a fixed block cannot make in one pass: a different volume per
// well, many wells into one vessel, selected wells, or between tubes and a
// plate (content/lexicon.json transferLayouts). Tube workflows are the same:
// tubes do not sit at a plate's pitch.
const LAYOUTS = lexicon.transferLayouts.layouts.map(l => ({...l, re: new RegExp(l.pattern, 'i')}));
export const transferLayouts = {...Object.fromEntries(LAYOUTS.map(l => [l.id, l.label])), tubes: lexicon.transferLayouts.tubes};
export function transferLayout(a) {
  if (a.kind !== 'liquid-transfer' || !a.line) return null;
  return LAYOUTS.find(l => l.re.test(a.line))?.id || null;
}
// Positions the line names for an irregular transfer (#98): "the first 8
// wells", "the 88 remaining wells", "columns 2-12" (times the plate's rows).
// The largest count stated wins; null when the line names none.
const POSITIONS = {count: new RegExp(lexicon.transferLayouts.positions.count, 'gi'), columns: new RegExp(lexicon.transferLayouts.positions.columns, 'gi')};
export function statedPositions(line, unitSize = 96) {
  if (!line) return null;
  const rows = Math.max(1, Math.round(Math.sqrt(unitSize * 2 / 3)));
  const counts = [...line.matchAll(POSITIONS.count)].map(m => Number(m[1]))
    .concat([...line.matchAll(POSITIONS.columns)].map(m => (Math.abs(Number(m[2]) - Number(m[1])) + 1) * rows));
  const n = Math.max(0, ...counts.filter(x => x > 0));
  return n || null;
}
// How many positions one pass of this head serves for an irregular transfer:
// independent channels each go where needed; a fixed block works one tip at a
// time if it has one channel or can pick up a single tip, and not at all otherwise.
function perPass(handlerId, head) {
  const mode = headMode(handlerId, head);
  if (mode === 'independent') return head.channels;
  return head.channels === 1 || mode === 'fixed-partial' ? 1 : 0;
}
// For a shared reagent dispensed without touching the wells, the head with the
// fewest channels (at least 8 on a plate) uses the fewest tips; for anything
// that needs a tip per sample, the widest head makes the fewest passes.
function headFor(heads, volume, plate, shared = false) {
  const fits = heads.filter(h => volume == null || (volume >= h.minUl && volume <= h.maxUl));
  const order = shared && plate ? (a, b) => (Math.abs(a.channels - 8) - Math.abs(b.channels - 8)) || a.maxUl - b.maxUl
    : (a, b) => (plate ? b.channels - a.channels : a.channels - b.channels) || a.maxUl - b.maxUl;
  return fits.sort(order)[0] || null;
}
const tipFor = (head, volume) => [...head.tips].sort((a, b) => a - b).find(t => t >= (volume ?? 0)) || Math.max(...head.tips);
const passTime = (head, cfg) => est((cfg.data.timePerPass || pipettesData.defaults.timePerPass)[head.channels >= 96 ? 'head96' : head.channels > 1 ? 'multi' : 'single']);
function tipEvent(a, cfg, ctx) {
  const plate = ctx.format === 'plate', N = ctx.samples, reps = a.count.n;
  // A removal takes what the ledger holds in the well (#120); with nothing
  // stated there, the most the well can hold.
  const inWell = ctx.ledger.sampleWell();
  const removalVol = inWell.ul > 0 ? inWell.ul : (inWell.capacityUl ?? 200);
  const vol = ['removal', 'removal+add'].includes(a.contact) ? a.removalUl ?? removalVol : mostUl(a);
  const layout = transferLayout(a) || (plate ? null : 'tubes');
  const known = cfg.heads.filter(hasHeadRange);
  if (!known.length) return null;
  const enough = known.filter(h => leastUl(a) == null || leastUl(a) >= h.minUl);
  const heads = enough.length ? enough : known;
  let head = headFor(heads, vol, plate, a.contact === 'free' && !a.tipStated?.fresh) || heads[0];
  // Irregular transfers go to the head that serves most positions per pass,
  // then the narrowest (a single channel rather than a 96-head picking one tip).
  if (layout) {
    const fits = heads.filter(h => vol == null || (vol >= h.minUl && vol <= h.maxUl));
    head = (fits.length ? fits : heads).slice().sort((x, y) => perPass(ctx.handlerId, y) - perPass(ctx.handlerId, x) || x.channels - y.channels)[0];
  }
  const each = layout ? Math.max(1, perPass(ctx.handlerId, head)) : head.channels;
  const set = plate ? Math.min(each, ctx.unitSize) : 1;
  const stated = a.tipStated || {};
  const reuse = cfg.data.tipReuse?.supported;
  // A removal tip is parked per sample. Low estimate: it carries on across
  // consecutive steps while the sample stays in the same well; high: a fresh
  // one in each step.
  const parked = () => {
    const step = ctx.parked.has(`step:${ctx.chunkId}`) ? 0 : N, block = ctx.parked.has(`block:${ctx.block}`) ? 0 : N;
    ctx.parked.add(`step:${ctx.chunkId}`); ctx.parked.add(`block:${ctx.block}`);
    return {lo: block, hi: step};
  };
  let lo = 0, hi = 0;
  const removal = () => { const t = reuse ? parked() : {lo: N * reps, hi: N * reps}; lo += t.lo; hi += t.hi; };
  // A shared reagent added without touching the wells costs no tips when an on-deck dispenser adds it.
  let dispensedAdd = false;
  const freeAdd = k => { if (ctx.dispenser && !ctx.settles(a)) { dispensedAdd = true; return; } lo += set * k; hi += set * k; };
  if (stated.reuse) { lo = hi = 0; }
  else if (a.contact === 'free') { if (stated.fresh) { lo += N * reps; hi += N * reps; } else freeAdd(reps); }
  else if (a.contact === 'contact' || a.contact === 'sample-move') { lo += N * reps; hi += N * reps; }
  else if (a.contact === 'removal') removal();
  else if (a.contact === 'wash' || a.contact === 'removal+add') { freeAdd(reps); removal(); }
  else if (a.contact === 'mix') { hi += stated.fresh ? N * reps : N * reps; lo += stated.fresh ? N * reps : 0; }
  else if (a.contact === 'batch') { lo += 2 * reps; hi += (2 + (a.components?.length || 4)) * reps; }
  const size = tipFor(head, vol);
  const lowRetention = !!(a.handling?.includes('low-retention tips') || stated.lowRetention);
  const lowRetentionPreferred = !lowRetention && !!a.handling?.includes('low-retention tips (preferred)');
  if (a.contact === 'sample-move') ctx.block++;
  // Irregular by its wording (not just because the workflow is in tubes):
  // the positions the line names, per plate (or per sample in tubes);
  // otherwise one position per sample. A tube-workflow line that names wells
  // or columns without irregular wording is a block move on a plate.
  const named = transferLayout(a) ? statedPositions(a.line, ctx.unitSize) : null;
  const passes = layout ? (named ? Math.ceil(named / each) * Math.ceil(N / (plate ? ctx.unitSize : 1)) : Math.ceil(N / each)) * reps
    : Math.ceil((plate ? Math.min(N, ctx.unitSize) : 1) / (plate ? head.channels : 1)) * Math.ceil(N / (plate ? ctx.unitSize : 1)) * reps;
  const channels = layout ? {layout, head: head.label, mode: headMode(ctx.handlerId, head) || 'not recorded', perPass: each, positions: named, positionsBasis: named ? 'stated' : 'per sample', passes, possible: perPass(ctx.handlerId, head) > 0} : null;
  // Refill trips (#85): a shared reagent added with tips. With multi-dispense
  // one aspiration serves as many columns as the largest tip on the head
  // holds; without it, every dispense is its own trip to the reservoir.
  let refills = 0;
  if (['free', 'wash', 'removal+add'].includes(a.contact) && !dispensedAdd && !stated.fresh && a.volumeUl > 0) {
    const dispenses = plate ? Math.ceil(Math.min(N, ctx.unitSize) / head.channels) : N;
    const cap = Math.min(head.maxUl, Math.max(...head.tips));
    const perLoad = cfg.data.multiDispense?.supported ? Math.max(1, Math.floor(cap / a.volumeUl)) : 1;
    refills = Math.ceil(dispenses / perLoad) * (plate ? Math.ceil(N / ctx.unitSize) : 1) * reps;
  }
  return {head, size, lowRetention, lowRetentionPreferred, tips: {lo, hi}, passes, refills, dispensedAdd, channels};
}

// ---------------------------------------------------------------- reagent use (#85)
// Each addition of a reagent draws from its own container, which keeps a dead
// volume the wells never receive: a trough or tube by hand, a reservoir on a
// liquid handler, a channel or source well on a dispenser. Counted per
// addition step (a reagent used in two steps is counted twice, as two
// containers would be). The sample itself is not a reagent.
const RA = dispensersData.reagentAccounting;
const sampleClasses = new Set(RA.sampleClasses);
// Reagents prepared as a mix earlier in the workflow (#119): the names of the
// non-buffer materials of each batch preparation, and any material of a mix
// class. An addition of one of them is made up with an overage.
const mixKey = m => `${m.class}:${(m.name || '').toLowerCase()}`;
export function mixMaterials(model) {
  const out = new Set();
  for (const a of model.chunks.flatMap(c => c.actions)) if (a.contact === 'batch') for (const m of a.materials || []) if (m.class !== 'buffer') out.add(mixKey(m));
  return out;
}
const isMix = (a, mixes) => (a.materials || []).some(m => m.class === 'reagent-mix' || mixes?.has(mixKey(m)));
// The reservoir a liquid handler draws from depends on the head: a column or
// trough for up to 16 channels, a single-well reservoir for a 96-channel head.
const reservoirFor = channels => channels != null && channels >= RA.handlerReservoir.head.minChannels ? RA.handlerReservoir.head : RA.handlerReservoir.column;
function reagentUse(a, workload, format, route, devs = null, {channels = null, mixes = null} = {}) {
  if (!['free', 'contact', 'wash', 'removal+add'].includes(a.contact) || !(a.volumeUl > 0)) return null;
  const classes = (a.materials || []).map(m => m.class).filter(c => !sampleClasses.has(c));
  if (!classes.length) return null;
  let dead = null, basis = '', prime = null;
  if (route === 'dispenser') {
    const recs = (devs || []).map(d => d.dispense?.deadVolumeUl).filter(Boolean);
    if (recs.length) { dead = {lo: Math.min(...recs.map(r => r[0])), hi: Math.max(...recs.map(r => r[1]))}; basis = `dispenser channel or source (${(devs || []).map(d => d.name).join(', ')})`; }
    else basis = 'dispenser dead volume not recorded';
    // Volume to load to prime the fluid path: reported, not counted as used.
    const primes = (devs || []).map(d => d.dispense?.primeUl).filter(Boolean);
    if (primes.length) prime = {lo: Math.min(...primes.map(r => r[0])), hi: Math.max(...primes.map(r => r[1])), recoverable: (devs || []).every(d => d.dispense?.primeRecoverable === true) ? true : null};
  } else {
    const rec = route === 'handler' ? reservoirFor(channels) : RA.manual[format] || RA.manual.plate;
    dead = est(rec.deadUl); basis = rec.label;
    // A wide head can also draw from a source plate, one well per channel: the smaller loss is used.
    if (rec === RA.handlerReservoir.head && RA.handlerReservoir.sourcePlate) {
      const sp = RA.handlerReservoir.sourcePlate, wells = Math.min(channels, workload);
      const plate = {lo: sp.perWellUl[0] * wells, hi: sp.perWellUl[1] * wells};
      if (plate.hi < dead.hi) { dead = {lo: Math.min(dead.lo, plate.lo), hi: plate.hi}; basis = sp.label; }
    }
  }
  const delivered = a.volumeUl * workload * a.count.n;
  // A mix is made up with an overage; the extra beyond the wells is the larger
  // of the container's dead volume and that overage.
  const mix = isMix(a, mixes);
  const pct = RA.masterMix.overagePct;
  const overage = mix ? {lo: delivered * pct[0] / 100, hi: delivered * pct[1] / 100} : null;
  const extra = dead && overage ? {lo: Math.max(dead.lo, overage.lo), hi: Math.max(dead.hi, overage.hi)} : dead;
  return {actionId: a.id, label: a.label, classes, route, deliveredUl: delivered, deadUl: dead, mix, overageUl: overage, extraUl: extra, primeUl: prime, basis};
}
export function reagentTotals(list) {
  const known = list.filter(x => x.deadUl);
  const sum = k => list.filter(x => x[k]).reduce((s, x) => add(s, x[k]), zero());
  return {deliveredUl: list.reduce((n, x) => n + x.deliveredUl, 0), deadUl: known.reduce((s, x) => add(s, x.deadUl), zero()), extraUl: sum('extraUl'), overageUl: sum('overageUl'), mixSteps: list.filter(x => x.mix).length, primeUl: sum('primeUl'), steps: list.length, deadUnknown: list.length - known.length};
}
// Cost of reagents per run from prices the person gives per material class
// (GBP per ml). A step holding several priced classes is costed at the dearest.
export function reagentCost(list, prices, workload) {
  if (!prices || !Object.keys(prices).length) return null;
  let total = zero(), deadCost = zero();
  const unpriced = new Set();
  for (const x of list) {
    const p = Math.max(...x.classes.map(c => prices[c] ?? -1));
    if (p < 0) { x.classes.forEach(c => unpriced.add(c)); continue; }
    const perUl = p / 1000, dead = x.extraUl || x.deadUl || zero();
    total = add(total, {lo: (x.deliveredUl + dead.lo) * perUl, hi: (x.deliveredUl + dead.hi) * perUl});
    deadCost = add(deadCost, times(dead, perUl));
  }
  return {currency: 'GBP', perRun: total, perSample: {lo: total.lo / workload, hi: total.hi / workload}, deadVolume: deadCost, unpriced: [...unpriced]};
}

// ---------------------------------------------------------------- simulation
export function simulate(model, workload, setup = null, methodChanges = false) {
  const baseline = simulateRun(model, workload, null, false, null);
  return setup ? assessedSimulation(model, workload, setup, methodChanges, physicalActionBlocks(baseline.physical), true) : baseline;
}

function assessedSimulation(model, workload, setup, methodChanges, blocks, tentative = false) {
  let blocked = blocks;
  for (;;) {
    const run = simulateRun(model, workload, setup, methodChanges, blocked, tentative);
    const extra = [...physicalActionBlocks(run.physical)].filter(([id]) => !blocked.has(id));
    if (!extra.length) return {...run, protocolBlocks: blocked};
    // Replay with newly blocked actions kept manual so no machine time, tips
    // or savings from those actions survive the ledger's refusal.
    blocked = new Map([...blocked, ...extra]);
  }
}

function simulateRun(model, workload, setup, methodChanges, blockedActions, tentative = false) {
  spendSimulationBudget(model.evaluationBudget, 100);
  const allowSubs = methodChanges === true;
  const steps = [];
  const used = new Set();
  let where = 'bench';
  let racks = 0;
  const capacity = setup?.capacity;
  let reloads = 0;
  let loading = zero();
  const reviews = new Map();
  const cfg = setup?.pipettes || null;
  // The physical ledger (#120): every container's volume, where each plate is, consumption and violations.
  const lw = model.labware || {...labwareData.labware[labwareData.legacy[model.format]], assumed: true};
  // The deck layout (#140): where every carrier, reservoir and module sits, and so which reservoir cavity each reagent is drawn from.
  const layout = setup?.handler ? deckLayout(model, setup.handler, setup.providers, cfg, workload) : null;
  const ledger = createLedger({inputVolumeUl: model.block ? model.block.input.volumeUl : 0, budget: model.evaluationBudget, samples: workload, unitSize: model.unitSize || 96, format: model.format,
    wells: model.format === 'plate' ? lw?.wells || 96 : labwareData.physical.tubeRackWells,
    containers: containersFor(setup?.handler?.id, lw, layout), sampleClasses: dispensersData.reagentAccounting.sampleClasses,
    isAliquot: a => !!OPS[a.kind]?.reviewWhenAutomated});
  const BENCH = {id: 'bench', label: 'the bench'};
  const tipCtx = {handlerId: setup?.handler?.id, format: model.format, samples: workload, unitSize: model.unitSize || 96, parked: new Set(), ledger, chunkId: null, block: 0,
    dispenser: !!setup?.providers.some(p => p.op === 'dispensing' && (p.via === 'native' || p.via === 'module')),
    settles: a => (a.materials || []).some(m => materialsData.classes[m.class]?.properties?.settles)};
  const tips = {total: zero(), bySize: {}, lowRetention: zero(), lowRetentionPreferred: zero(), events: 0, refills: 0};
  const reagents = [];
  const mixes = mixMaterials(model);
  const onDeckDispenser = setup && setup.providers.find(p => p.op === 'dispensing' && (p.via === 'native' || p.via === 'module'));
  const racksBySize = {};
  const loadedReagents = new Set();
  const irregular = [];
  let swaps = 0, rackSwaps = 0;
  const moveStep = (base, why) => ({...base, type: 'H', overhead: true, label: OVER.vesselMove.label, minutes: est(OVER.vesselMove.person), reason: why});
  const transport = (from, to, by, physical, count) => ({
    from: from.label, to: to.label, by, ...(count == null ? {} : {count}), fromId: from.id, toId: to.id, physical,
    scope: from.id === BENCH.id || to.id === BENCH.id ? 'bench' : from.onDeck && to.onDeck ? 'on_deck' : 'off_deck',
  });
  for (const chunk of model.chunks) for (const a of chunk.actions) {
    const m = occurrences(model, a, workload);
    const base = {chunkId: chunk.id, actionId: a.id, label: a.label, kind: a.kind, count: m, countBasis: a.count.basis, countNote: a.count.note || ''};
    const person = times(manualMinutes(model, a, workload, m), a.outputAllocation?.length ?? 1);
    if (a.kind === 'wait') { steps.push({...base, type: 'W', label: `${a.label} (waiting)`, minutes: a.wait != null ? {lo: a.wait, hi: a.wait} : null, waitBasis: a.wait != null ? 'source' : 'missing'}); continue; }
    // Record-keeping needs neither the plate nor a trip to the bench.
    if (OPS[a.kind].desk) { steps.push({...base, type: 'D', minutes: person, reason: 'Desk work: can be done at any time and does not touch the plate.'}); continue; }
    const block = blockedActions?.get(a.id);
    const here = where === 'bench' ? null : where;
    const planned = setup && a.outputAllocation && !block
      ? {auto:false, reason:'A person transfers the named outputs until the destination labware and device reach are verified.'}
      : setup && !block ? (setup.standalone
      ? assignBenchDispenser(setup.providers[0], a, model) : assign(setup, a, allowSubs, model, here))
      : {auto: false, reason: block ? `Physical check unresolved: ${block.detail}` : 'Done by hand today.'};
    const got = planned.rangeUnverified && !tentative
      ? {auto: false, manualAt: planned.manualAt, reason: 'Pipette head range is unverified. This transfer stays manual in the assessed estimate.'}
      : planned;
    // A step a workflow variant replaced (#171) keeps its validation question wherever it runs.
    if (got.auto && a.substitution && SUBS.has(a.substitution)) { got.facts = [...new Set([...got.facts, `method:${a.substitution}`])]; got.substitution ??= SUBS.get(a.substitution); }
    if (got.auto) {
      const loc = got.magnet ? positionOf(setup, got.magnet) : placeFor(setup, a, got.provider, here);
      // A person puts the plate where the step needs it: back from the bench, or onto the deck before the first step.
      let placedBefore = null, initialTransport = null;
      const carry = (from, to) => {
        const by = setup.standalone ? 'person' : mover(setup, from, to);
        if (by !== 'person') used.add('provider:vessel-transfer');
        const motion = positionsData.moves[by];
        const move = transport(from, to, by, ledger.move(from, to, by), m);
        return {...base, type: by === 'person' ? 'H' : 'A', overhead: true, label: motion.label,
          reason: `Transfer ${m} plate${m === 1 ? '' : 's'} from ${from.label} to ${to.label}.`,
          minutes: times(est(by === 'person' ? motion.person : motion.machine), m), count: 0, move};
      };
      const sourcePosition = here || BENCH;
      const separateDevice = setup.reportMechanisms && got.dispensed && got.provider.device &&
        ['bench', 'workcell'].includes(got.provider.via) && sourcePosition.id !== loc.id;
      if (separateDevice) steps.push(carry(sourcePosition, loc));
      else if (where === 'bench') {
        const first = !steps.some(s => s.type === 'A');
        const back = ledger.move(first ? null : BENCH, loc, 'person');
        const handoff = transport(BENCH, loc, 'person', back);
        if (first) { placedBefore = back; initialTransport = handoff; }
        else steps.push({...moveStep(base, 'Plate returns from the bench to the instrument.'), placed: back, transport: handoff});
      }
      else if (where.id !== loc.id) {
        const by = mover(setup, where, loc);
        const mv = positionsData.moves[by];
        const move = transport(where, loc, by, ledger.move(where, loc, by));
        if (by === 'person') steps.push({...base, type: 'H', overhead: true, label: mv.label, minutes: est(mv.person), reason: setup.installation?.installedHeads !== undefined
            ? `A person carries the plate from ${where.label} to ${loc.label}. Automated reach has not been assessed for this move.`
            : `From ${where.label} to ${loc.label}: no ${where.onDeck && loc.onDeck ? 'gripper' : 'arm'} in this setup.`, move});
        else { used.add('provider:vessel-transfer'); steps.push({...base, type: 'A', overhead: true, label: mv.label, minutes: est(mv.machine), reason: `From ${where.label} to ${loc.label}.`, move, provider: 'vessel-transfer'}); }
      }
      if (!separateDevice) where = loc;
      used.add(`provider:${got.provider.op}`);
      if (got.provider.module) used.add(`module:${got.provider.module}`);
      for (const dependency of [got.also, got.magnet]) if (dependency) {
        used.add(`provider:${dependency.op}`);
        if (dependency.module) used.add(`module:${dependency.module}`);
      }
      got.facts.forEach(f => used.add(f));
      const op = OPS[got.provider.op] || OPS[a.kind];
      tipCtx.chunkId = chunk.id;
      const te = cfg && !got.rangeUnverified && (a.contact || transferLayout(a)) && got.provider.op !== 'dispensing' ? tipEvent(a, cfg, tipCtx) : null;
      // The head moves the liquid itself on a pipetting step (a magnet step that adds or removes); other modules leave it to the ledger as unassigned.
      const pipetted = te && !got.dispensed && (got.provider.op === 'liquid-transfer' || (got.provider.op === 'magnetic-separation' && a.contact && a.contact !== 'mix'));
      const phys = a.contact ? ledger.apply(a, pipetted ? {head: te.head, mode: headMode(setup.handler.id, te.head), layout: te.channels?.layout || null, tipUl: te.size, dispensedAdd: te.dispensedAdd} : null, {route: got.dispensed || te?.dispensedAdd ? 'dispenser' : pipetted ? 'handler' : 'unassigned'}) : null;
      if (te) ledger.tips(te.size, te.tips);
      if (te?.channels) irregular.push({actionId: a.id, label: a.label, ...te.channels});
      // An off-deck dispenser takes its own time per plate (#173), sourced or assumed.
      const timingWells = model.format === 'plate' ? model.unitSize || 96 : 96;
      const offDeck = got.dispensed && got.devices.length && got.devices.every(d => d.id) ? dispenseStep(got.devices, a, timingWells) : null;
      if (offDeck && setup.reportMechanisms && !got.devices.every(d => hasMatchedDispenseTime(d, a, timingWells))) offDeck.kind = 'assumed';
      const machine = offDeck ? times({lo: offDeck.seconds.lo / 60, hi: offDeck.seconds.hi / 60}, m)
        : te && a.contact !== 'batch' ? times(passTime(te.head, cfg), te.passes * (got.passes || 1)) : times(est(op.machine), m * (got.passes || 1));
      // Each reagent is loaded into an off-deck dispenser, primed and flushed after: a person's time at set-up.
      if (offDeck) { const k = `${got.devices.map(d => d.id).join('/')}|${(a.materials || []).map(x => mixKey(x)).sort().join('+') || a.id}`; if (!loadedReagents.has(k)) { loadedReagents.add(k); loading = add(loading, est(OVER.dispenserLoad.person)); } }
      // The add half of a wash given by an on-deck dispenser lands on the pellet too.
      const stepFacts = [...got.facts];
      if (got.magnet && got.provider !== got.magnet) stepFacts.push('provider:magnetic-separation');
      if (te?.dispensedAdd && landsOn(a).length) { const f = `dispense-onto:${landsOn(a).join('/')}`; stepFacts.push(f); used.add(f); }
      steps.push({...base, type: 'A', ...(got.rangeUnverified ? {reason: 'Pipette head range is unverified. Confirm the recorded range before assigning a head.'} : {}), ...(phys ? {physical: phys} : {}), ...(placedBefore ? {placed: placedBefore} : {}), minutes: machine, tips: te ? {...te.tips, size: te.size, lowRetention: te.lowRetention, head: te.head.label, refills: te.refills} : null, passes: te ? te.passes : null, channels: te?.channels || null, personIfManual: person, facts: [...stepFacts, `provider:${got.provider.op}`], via: got.provider.via, provider: got.provider.op, module: got.provider.module || null, substitution: got.substitution?.id || null, ...(got.dispensed ? {dispensed: true, devices: got.devices.map(d => d.id || d.name)} : {}), ...(offDeck ? {dispenseTime: {kind: offDeck.kind, basis: offDeck.basis, secondsPerPlate: offDeck.seconds, sources: offDeck.sources}} : {}), ...(offDeck && got.provider.via === 'bench' ? {attended: true} : {}), ...(stepFacts.some(f => f.startsWith('dispense-onto:')) ? {splash: landsOn(a)} : {})});
      if (initialTransport) steps.at(-1).initialTransport = initialTransport;
      if (setup.reportMechanisms && te?.dispensedAdd) steps.at(-1).tiplessAddition = true;
      if (separateDevice) steps.push(carry(loc, sourcePosition));
      const use = reagentUse(a, workload, model.format, got.dispensed || te?.dispensedAdd ? 'dispenser' : 'handler', got.dispensed ? got.devices : te?.dispensedAdd ? dispensersFor(setup, onDeckDispenser, a, false) : null, {channels: te?.head?.channels ?? null, mixes});
      if (use) reagents.push(use);
      if (OPS[a.kind].loadWhenAutomated) loading = add(loading, times(est(OPS[a.kind].loadWhenAutomated), m));
      if (OPS[a.kind].reviewWhenAutomated && !reviews.has(a.kind)) reviews.set(a.kind, {...base, type: 'D', overhead: true, label: `Review ${OPS[a.kind].label.toLowerCase()} results`, minutes: est(OPS[a.kind].reviewWhenAutomated), reason: 'Once per measurement type, after the run, at the desk.'});
      if (te) {
        tips.total = add(tips.total, te.tips); tips.events++; tips.refills += te.refills;
        const k = `${te.size} µl${te.lowRetention ? ' low-retention' : ''}`;
        tips.bySize[k] = add(tips.bySize[k] || zero(), te.tips);
        if (te.lowRetention) tips.lowRetention = add(tips.lowRetention, te.tips);
        if (te.lowRetentionPreferred) tips.lowRetentionPreferred = add(tips.lowRetentionPreferred, te.tips);
        // Racks used up so far; each time they exceed what the deck and storage
        // hold, someone reloads them all.
        racksBySize[te.size] = (racksBySize[te.size] || 0) + mid(te.tips) / (cfg.data.tipsPerRack || 96);
        const usedRacks = Object.values(racksBySize).reduce((n, r) => n + r, 0);
        const hold = (capacity.lo + capacity.hi) / 2;
        // Racks beyond the free deck positions are swapped in by the gripper (#96).
        if (capacity.onDeck != null && hold > capacity.onDeck) {
          const due = Math.min(Math.max(0, Math.ceil(usedRacks - hold * reloads) - capacity.onDeck), hold - capacity.onDeck);
          while (swaps < due) { swaps++; rackSwaps++; steps.push({...base, count: 0, type: 'A', overhead: true, label: positionsData.moves.rackSwap.label, minutes: est(positionsData.moves.rackSwap.machine), reason: positionsData.moves.rackSwap.basis, provider: 'vessel-transfer', rackSwap: true}); }
        }
        if (usedRacks > hold * (reloads + 1)) { reloads++; swaps = 0; steps.push({...base, type: 'H', overhead: true, label: OVER.reload.label, minutes: est(OVER.reload.person), reason: `Tip racks used exceed the ${capacity.lo}–${capacity.hi} the deck and storage hold (${capacity.basis}).`}); }
      } else if ((OPS[a.kind].consumesTips || OPS[got.provider.op]?.consumesTips) && got.provider.op !== 'dispensing') {
        racks += model.format === 'plate' ? m : m / 96;
        if (racks > (capacity.lo + capacity.hi) / 2) { reloads++; racks = 0; steps.push({...base, type: 'H', overhead: true, label: OVER.reload.label, minutes: est(OVER.reload.person), reason: `Tip racks used exceed the ${capacity.lo}–${capacity.hi} the deck holds (${capacity.basis}).`}); }
      }
    } else {
      if (!got.manualAt) {
        if (setup && here) steps.push({...moveStep(base, 'Plate leaves the instrument for a bench step.'),
          move: transport(here, BENCH, 'person', ledger.move(here, BENCH, 'person'))});
        where = 'bench';
      }
      const phys = a.contact ? ledger.apply(a, null, {route: 'manual'}) : null;
      steps.push({...base, type: 'H', ...(phys ? {physical: phys} : {}), minutes: person, reason: got.reason, ...(got.belowMin ? {belowMin: got.belowMin} : {})});
      const use = reagentUse(a, workload, model.format, 'manual', null, {mixes});
      if (use) reagents.push(use);
    }
    if (a.wait != null || a.substitutedFrom || ['thermocycling', 'incubation', 'centrifugation', 'shaking', 'rotation'].includes(a.kind)) {
      steps.push({...base, type: 'W', label: `${a.label} (running)`, minutes: a.wait != null ? {lo: a.wait, hi: a.wait} : null, waitBasis: a.wait != null ? 'source' : 'missing'});
    }
  }
  const timeline = [];
  let seenAuto = false, lastAutoIndex = -1;
  for (const s of steps) {
    if (s.type === 'A' && !seenAuto) timeline.push({type: 'H', overhead: true, chunkId: s.chunkId, label: OVER.firstSetup.label + (loading.hi ? ', including measurement consumables' : ''), minutes: add(est(OVER.firstSetup.person), loading), reason: 'Created by using an instrument.'});
    if (s.type === 'A') seenAuto = true;
    timeline.push(s);
    if (s.type === 'A') lastAutoIndex = timeline.length - 1;
  }
  if (seenAuto) {
    let at = lastAutoIndex + 1;
    while (timeline[at]?.type === 'W') at++;
    timeline.splice(at, 0, {type: 'H', overhead: true, chunkId: timeline[lastAutoIndex].chunkId, label: OVER.cleanup.label, minutes: est(OVER.cleanup.person), reason: 'Created by using an instrument.'});
  }
  timeline.push(...reviews.values());
  // Passes for transfers a fixed block cannot make in one go (#82).
  const channels = cfg ? {steps: irregular, passes: irregular.reduce((n, s) => n + s.passes, 0), oneTipAtATime: irregular.filter(s => s.perPass === 1).length, impossible: irregular.filter(s => !s.possible).length} : null;
  // Refilling sources and emptying the waste during the run is hands-on time (#122). It counts
  // in the ranking where the reservoirs follow a solved deck layout (#140); with the generic,
  // assumed containers of a handler that has none, it stays out (break-even still counts it).
  const physical = ledger.summary();
  const events = physical.containers.reduce((n, c) => n + c.refills + c.empties, 0);
  const refill = {events, minutes: times(est(OVER.refill.person), events), basis: OVER.refill.basis, ranked: !!layout?.ok};
  const measured = measure(timeline);
  return {timeline, used, reloads, tips: cfg ? tips : null, reagents, physical, layout, metrics: {reagents: reagentTotals(reagents), ...measured, active: refill.ranked ? add(measured.active, refill.minutes) : measured.active, refill, channels, tips: cfg ? {...tips, reloads, rackSwaps, kinds: Object.keys(racksBySize).length, deckRacks: capacity, racks: Object.fromEntries(Object.entries(tips.bySize).map(([k, v]) => [k, Math.ceil(mid(v) / (cfg.data.tipsPerRack || 96))]))} : null}};
}

function walk(timeline, untimedLeaves) {
  let visits = 0, inVisit = false, gap = zero(), untimed = false, benchWait = zero();
  const windows = [], visitList = [];
  let current = null;
  for (const s of timeline) {
    if (s.type === 'W' && s.minutes == null) { untimed = true; continue; }
    if (s.type === 'D') continue;
    if (s.type !== 'H') { gap = add(gap, s.minutes); continue; }
    const longEnough = gap.lo >= walkAwayThresholdMinutes || (untimed && untimedLeaves);
    if (!inVisit || longEnough) {
      if (inVisit) windows.push({...gap, untimed, after: visits});
      visits++;
      current = {n: visits, actions: [], minutes: zero()};
      visitList.push(current);
      inVisit = true;
    } else benchWait = add(benchWait, gap);
    current.actions.push(s);
    current.minutes = add(current.minutes, s.minutes);
    gap = zero(); untimed = false;
  }
  return {visits, windows, visitList, benchWait};
}

export function measure(timeline) {
  let attended = zero(), active = zero(), elapsed = zero(), desk = zero(), missingWaits = 0, automatedInstances = 0, manualInstances = 0;
  for (const s of timeline) {
    if (s.type === 'W' && s.minutes == null) { missingWaits++; continue; }
    if (s.type === 'D') { active = add(active, s.minutes); desk = add(desk, s.minutes); continue; }
    elapsed = add(elapsed, s.minutes);
    if (s.type === 'H') { active = add(active, s.minutes); if (!s.overhead) manualInstances += s.count || 0; }
    if (s.type === 'A') automatedInstances += s.count || 0;
    // A person stands at a bench dispenser while it runs (#173).
    if (s.type === 'A' && s.attended) { active = add(active, s.minutes); attended = add(attended, s.minutes); }
  }
  const short = walk(timeline, false), long = walk(timeline, true);
  const known = long.windows.filter(w => !w.untimed);
  const longest = known.reduce((b, w) => w.lo > b.lo ? w : b, zero());
  const dayMinutes = workingDay.hours * 60;
  const days = {lo: Math.max(1, Math.ceil(elapsed.lo / dayMinutes)), hi: Math.max(1, Math.ceil(elapsed.hi / dayMinutes))};
  const moves = {gripper: 0, arm: 0, person: 0};
  for (const s of timeline) if (s.move) moves[s.move.by] += s.move.count ?? 1;
  // Overnight (#92): a timed window long enough to leave the run unattended overnight.
  const overnight = {possible: longest.lo >= overnightMinutes, windowMinutes: longest, threshold: overnightMinutes};
  return {overnight, moves, active, attended, desk, visits: {lo: short.visits, hi: long.visits}, walkAway: long.windows, longestWalkAway: longest, benchWait: short.benchWait, elapsed, days, missingWaits, publishedWaits: 0, estimatedWaits: 0, automatedInstances, manualInstances, visitList: long.visitList};
}

// ---------------------------------------------------------------- candidates
// Operations this workflow could ever hand to a device (directly, by a
// performer, or through a method change).
function relevantOps(model) {
  const out = new Set();
  for (const a of model.chunks.flatMap(c => c.actions)) {
    if (a.conditions?.onMagnet === true) out.add('magnetic-separation');
    for (const op of performers(a.kind)) {
      out.add(op);
      for (const s of subsFrom(op)) out.add(s.to);
    }
  }
  out.add('vessel-transfer'); out.add('storage');
  return out;
}

const viaRank = {native: 0, module: 1, external: 2, bench: 2, scheduler: 3, workcell: 4};

// The fullest setup for a handler and route; providers are later removed one
// at a time (least useful first) to give the best setup at every size.
// The options a catalogue model can have, for a person to mark as present,
// absent or unknown on an instrument they can access.
// One entry per physical module or device; a module that provides several
// operations (e.g. heating and shaking) is one question covering all of them.
export function modelOptions(handler) {
  const out = new Map();
  for (const [op, v] of Object.entries(handler.ops)) {
    if (v.type === 'native') continue;
    const name = v.module || `${OPS[op]?.label || op.replace(/-/g, ' ')} (connected device)`;
    const key = `${v.type}:${name}`;
    if (!out.has(key)) out.set(key, {key, op, ops: [], kind: v.type === 'optional' ? 'module' : 'external', name, detail: v.detail || ''});
    out.get(key).ops.push(op);
  }
  // A module that is only a second module for an operation is its own question.
  for (const a of handler.alt || []) {
    const k = optionKey(handler, a.module, a.op);
    if (!k.startsWith('module:') || out.has(`alt:${a.module}`)) continue;
    out.set(`alt:${a.module}`, {key: `alt:${a.module}`, op: k, ops: [k], kind: 'module', name: a.module, detail: `A second module for ${handler.alt.filter(x => x.module === a.module).map(x => OPS[x.op]?.label?.toLowerCase() || x.op).join(', ')}`});
  }
  return [...out.values()];
}

function fullSetup(handler, route, rel, inst = null, lw = null, useBuilds = []) {
  // Movement and tip-storage transfers need station-specific reach evidence.
  const eligible = inst?.installedHeads === undefined ? rel
    : new Set([...rel].filter(op => op !== 'vessel-transfer' && op !== 'storage'));
  const out = fullSetupAll(handler, route, eligible, inst);
  // A build is offered even where the owner has no commercial module for the
  // operation: filling that gap is what it is for (#78).
  for (const b of useBuilds) for (const op of b.ops) if (eligible.has(op)) out.push({op, via: 'module', module: b.module, build: b.id, basis: 'open-source build'});
  if (!lw) return out;
  // A module or device that the sources say cannot take this labware is never used.
  return withWorkcellArm(route, out.filter(p => p.op === 'liquid-transfer' || (p.build ? buildFit(p, lw.id) : labwareFit(fitSubject(handler, p), p.op, lw.id)).status !== 'no'));
}

// Where the owner's Have / Don't have answer for a module is kept: under the
// operation it is the main module for, or under its own name for a module
// that is only a second module for an operation (#144).
export function optionKey(handler, module, op) {
  if (!module) return op;
  if (handler.ops[op]?.module === module) return op;
  const main = Object.entries(handler.ops).find(([, v]) => v.module === module);
  return main ? main[0] : `module:${module}`;
}
// Providers of an operation the run actually used: with several modules for
// one operation, only those a step went to.
// A second module for an operation keeps its own fact ids.
const second = (setup, p) => p.module && setup.providers.filter(x => x.op === p.op).length > 1 && setup.handler.ops[p.op]?.module !== p.module ? `:${p.module}` : '';
function usedProviders(setup, used, op) {
  const all = setup.providers.filter(p => p.op === op);
  return all.length > 1 ? all.filter(p => !p.module || used.has(`module:${p.module}`)) : all;
}

function fullSetupAll(handler, route, rel, inst = null) {
  const providers = [];
  for (const [op, v] of Object.entries(handler.ops)) {
    if (!rel.has(op)) continue;
    // An option the owner says this instrument does not have is never assumed.
    if (inst?.options?.[op] === 'no' && v.type !== 'native') continue;
    providers.push({op, via: v.type === 'native' ? 'native' : v.type === 'optional' ? 'module' : 'external', module: v.module, basis: v.basis});
  }
  for (const a of handler.alt || []) if (rel.has(a.op) && inst?.options?.[optionKey(handler, a.module, a.op)] !== 'no') providers.push({op: a.op, via: 'module', module: a.module, basis: a.basis});
  if (route === 'deck') return providers.filter(p => p.via !== 'external');
  const have = new Set(providers.filter(p => p.via !== 'external').map(p => p.op));
  const out = providers.filter(p => p.via !== 'external');
  for (const op of rel) {
    if (have.has(op) || !classes[op]) continue;
    // Outside a workcell, a device is connected only where the catalogue
    // documents that this handler integrates it.
    const listed = providers.find(p => p.op === op && p.via === 'external');
    // A workcell dispenser is a named device, paired with the setup like a bench one (#173).
    if (route === 'workcell') { if (op !== 'dispensing') out.push({op, via: 'workcell', class: classes[op]}); }
    else if (listed) out.push({op, via: 'external', class: classes[op]});
  }
  return withWorkcellArm(route, out);
}

// A workcell always has its arm (#283). Without one, a person carries every
// vessel to the bought devices, which is the bench route, not a workcell. The
// arm is added whenever nothing else on the setup moves vessels: when the
// handler has no gripper, when the sources say its gripper cannot take the
// labware, or when the search drops the gripper.
function withWorkcellArm(route, providers) {
  if (route !== 'workcell' || providers.some(p => p.op === 'vessel-transfer')) return providers;
  return [...providers, {op: 'vessel-transfer', via: 'workcell', class: {examples: workcellOptions.map(w => w.name)}}];
}
const isWorkcellArm = p => p.op === 'vessel-transfer' && p.via === 'workcell';

// ---------------------------------------------------------------- deck space (#69)
// What a run puts on the deck besides tips: modules, sample plates, a plate to
// move samples into, reagent containers and fixed items such as waste. The
// positions left over hold tip racks.
// ---------------------------------------------------------------- placement rules (#131)
// Where each module may sit, from the deck's placement record: allowed slots
// or a fixed footprint, neighbour rules (no module beside it; with a
// multichannel head, side slots unusable and front/back slots for tip racks
// only) and powered modules in the last pipetting column removing the staging
// slot in the same row. Every legal arrangement is tried; the one leaving the
// most room for labware and tips is kept. A module without a placement record
// may take any free slot (one position, as before).
const placementCache = new Map();
export function placeModules(placement, names, multichannel = true) {
  const k = JSON.stringify([placement.about, placement.slots.length, names.slice().sort(), multichannel]);
  if (placementCache.has(k)) return placementCache.get(k);
  const deckSlots = placement.slots.filter(x => !x.expansion), exp = placement.slots.filter(x => x.expansion);
  const at = new Map(placement.slots.map(x => [`${x.row},${x.col}`, x]));
  const lastCol = Math.max(...deckSlots.map(x => x.col));
  const items = [
    ...(placement.fixed || []).map(f => ({name: f.name, kind: 'fixed', default: f.default || null, options: f.slots.map(x => [x])})),
    ...names.map(n => { const m = placement.modules[n]; return {name: n, kind: 'module', rule: m || null, options: m?.occupies ? [m.occupies] : (m?.slots || deckSlots.map(x => x.id)).map(x => [x])}; }),
  ];
  const near = id => { const x = placement.slots.find(y => y.id === id); return {sides: [at.get(`${x.row},${x.col - 1}`), at.get(`${x.row},${x.col + 1}`)].filter(y => y && !y.expansion).map(y => y.id), frontBack: [at.get(`${x.row - 1},${x.col}`), at.get(`${x.row + 1},${x.col}`)].filter(y => y && !y.expansion).map(y => y.id)}; };
  let best = null;
  const evaluate = chosen => {
    const taken = new Map();
    for (const [it, slots] of chosen) for (const id of slots) { if (taken.has(id)) return; taken.set(id, it); }
    const lost = new Map(), tips = new Map(), expLost = new Map();
    for (const [it, slots] of chosen) {
      const nb = it.rule?.neighbours;
      if (nb) for (const id of slots) {
        const {sides, frontBack} = near(id);
        if (nb.modules === false && [...sides, ...frontBack].some(y => taken.get(y)?.kind === 'module' && taken.get(y) !== it)) return;
        if (multichannel && nb.multichannel) {
          for (const y of sides) if (!taken.has(y) && nb.multichannel.sides === 'none') lost.set(y, it.name);
          for (const y of frontBack) if (!taken.has(y) && !lost.has(y) && nb.multichannel.frontBack === 'tips') tips.set(y, it.name);
        }
      }
      if (it.rule?.powered && placement.poweredBlocksExpansion) for (const id of slots) {
        const x = placement.slots.find(y => y.id === id);
        const e = x.col === lastCol && exp.find(y => y.row === x.row);
        if (e) expLost.set(e.id, it.name);
      }
    }
    for (const y of lost.keys()) tips.delete(y);
    const general = deckSlots.filter(x => !taken.has(x.id) && !lost.has(x.id) && !tips.has(x.id)).length;
    // Fixed items in their maker's default slot (#140): the robot's own deck configuration has them there.
    const defaults = chosen.filter(([it, sl]) => it.kind === 'fixed' && it.default && sl.includes(it.default)).length;
    const r = {general, tipsOnly: tips.size, expansion: exp.length - expLost.size, defaults, slots: Object.fromEntries([...taken].map(([id, it]) => [id, it.name])), lost: [...lost].map(([slot, by]) => ({slot, by})), tips: [...tips].map(([slot, by]) => ({slot, by})), expansionLost: [...expLost].map(([slot, by]) => ({slot, by}))};
    const score = x => [x.general + x.tipsOnly + x.expansion, x.general, x.defaults];
    const better = (x, y) => { for (let i = 0; i < 3; i++) if (score(x)[i] !== score(y)[i]) return score(x)[i] > score(y)[i]; return false; };
    if (!best || better(r, best)) best = r;
  };
  const walk = (i, chosen) => {
    if (i === items.length) return evaluate(chosen);
    for (const o of items[i].options) { if (chosen.some(([, sl]) => sl.some(x => o.includes(x)))) continue; walk(i + 1, [...chosen, [items[i], o]]); }
  };
  walk(0, []);
  const out = best ? {ok: true, ...best} : {ok: false, why: `${names.join(', ')} cannot all be placed on this deck under its placement rules.`};
  placementCache.set(k, out);
  return out;
}

export function deckNeeds(model, handler, providers, workload, cfg = null) {
  const deck = decksData.handlers[handler.id];
  if (!deck) return null;
  // A deck the layout solver knows (#140): its reservoirs, and whether everything fits at all, come from the solved layout.
  const layout = deckLayout(model, handler, providers, cfg, workload);
  const r = countDeck(model, handler, providers, workload, deck, layout);
  if (!layout) return r;
  return {...r, layout, ...(layout.ok ? {} : {free: -Infinity, layoutWhy: layout.why})};
}
function countDeck(model, handler, providers, workload, deck, layout) {
  if (deck.type === 'clip-in') return {type: 'clip-in', unchecked: true, note: deck.note, items: [], positions: null, used: 0, free: Infinity, expansion: 0, storage: null};
  const items = [];
  for (const f of deck.fixed || []) items.push({what: f.name, positions: f.positions, kind: 'fixed'});
  // Grippers move plates and storage sits beside the deck: neither takes a position.
  for (const p of providers.filter(p => p.via === 'module' && p.op !== 'vessel-transfer' && p.op !== 'storage')) {
    const m = deck.modules?.[p.module];
    if (m?.offDeck) continue;
    items.push({what: p.module, positions: m?.positions ?? 1, kind: 'module', basis: m ? 'source' : 'assumed: one position'});
  }
  // Labware besides tips: from the solved layout where the deck has one (#140), else counted.
  const ex = extraLabware(model, providers, workload);
  items.push(ex.samples);
  if (ex.dest) items.push({what: 'Plate to move samples into', positions: 1, kind: 'labware'});
  if (layout?.ok) {
    items.push({what: 'Liquid waste', positions: 1, kind: 'labware', basis: 'solved deck layout'});
    if (layout.trough) items.push({what: 'Trough for the 96-channel head', positions: 1, kind: 'labware', basis: 'solved deck layout'});
    items.push({what: `${layout.reservoir.plates} reservoir${layout.reservoir.plates === 1 ? '' : 's'} (${layout.reservoir.resource}) for ${layout.reagents} reagent${layout.reagents === 1 ? '' : 's'}: ${layout.cavities} cavities`, positions: layout.reservoir.plates, kind: 'labware', basis: 'solved deck layout'});
  } else {
    const acts = model.chunks.flatMap(c => c.actions);
    const shared = new Set(acts.filter(a => a.contact === 'free' || a.contact === 'wash').map(a => (a.materials || []).map(m => m.name.toLowerCase()).sort().join('+') || a.line.slice(0, 20)));
    if (shared.size) items.push({what: `Reservoir for ${shared.size} shared reagent${shared.size === 1 ? '' : 's'}`, positions: Math.ceil(shared.size / decksData.labware.reagentsPerReservoir), kind: 'labware'});
  }
  items.push(...ex.others);
  if (deck.placement) {
    // Slot-level placement (#131): modules and fixed items go where the rules allow.
    const names = [...new Set(items.filter(i => i.kind === 'module').map(i => i.what))];
    const multichannel = (pipetteConfigs(handler) || []).every(c => c.heads.some(h => h.channels > 1));
    const pl = placeModules(deck.placement, names, multichannel);
    const labware = items.filter(i => i.kind === 'labware');
    const placed = items.filter(i => i.kind !== 'labware').map(i => ({...i, slots: pl.ok ? Object.entries(pl.slots).filter(([, n]) => n === i.what).map(([id]) => id) : null}));
    const rules = [];
    if (pl.ok) {
      for (const by of new Set(pl.lost.map(x => x.by))) rules.push({what: `Beside the ${by}: no pipetting with a multichannel head`, positions: pl.lost.filter(x => x.by === by).length, kind: 'placement', slots: pl.lost.filter(x => x.by === by).map(x => x.slot), source: deck.placement.modules[by]?.neighbours?.sources?.[1] || null});
      for (const by of new Set(pl.tips.map(x => x.by))) rules.push({what: `In front of or behind the ${by}: tip racks only`, positions: 0, kind: 'placement', slots: pl.tips.filter(x => x.by === by).map(x => x.slot), source: deck.placement.modules[by]?.neighbours?.sources?.[2] || null});
      for (const by of new Set(pl.expansionLost.map(x => x.by))) rules.push({what: `Staging slot beside the ${by} (powered, column ${Math.max(...deck.placement.slots.filter(x => !x.expansion).map(x => x.col)) + 1}) cannot be used`, positions: 0, kind: 'placement', slots: pl.expansionLost.filter(x => x.by === by).map(x => x.slot), source: deck.placement.poweredBlocksExpansion?.source || null});
    }
    const need = labware.reduce((n, i) => n + i.positions, 0);
    const left = pl.ok ? pl.general - need : -Infinity;
    const free = left >= 0 ? left + pl.tipsOnly : left;
    return {type: deck.type || 'grid', positions: deck.positions, expansion: pl.ok ? pl.expansion : 0, items: [...placed, ...rules, ...labware], used: pl.ok ? deck.positions - free : deck.positions, free, placement: pl, storage: deck.storage || null, source: deck.sources?.[0] || null};
  }
  const used = items.reduce((n, i) => n + i.positions, 0);
  if (deck.type === 'tiers') {
    // Tips go on the tier that takes them (the taller one); everything else
    // fills the other tiers first and overflows onto it.
    const tipTier = deck.tiers.find(t => t.tips) || deck.tiers[deck.tiers.length - 1];
    const otherRoom = deck.tiers.filter(t => t !== tipTier).reduce((n, t) => n + t.positions, 0);
    const spill = Math.max(0, used - otherRoom);
    return {type: 'tiers', tiers: deck.tiers, positions: deck.positions, expansion: 0, items, used, free: tipTier.positions - spill, tipTier: tipTier.name, storage: deck.storage || null, source: deck.sources?.[0] || null};
  }
  return {type: deck.type || 'grid', positions: deck.positions, expansion: deck.expansion?.positions || 0, items, used, free: deck.positions - used, storage: deck.storage || null, source: deck.sources?.[0] || null};
}

// Every tip size in use needs a rack on the deck at once, unless a gripper can
// swap racks in from expansion positions or storage, in which case one free
// position is enough.
function deckFit(needs, sim, setup) {
  if (needs.unchecked) return {...needs, tipKinds: sim.metrics.tips?.kinds || 0, fits: true, capacity: setup.capacity};
  const kinds = sim.metrics.tips?.kinds || 1;
  const gripper = setup.providers.some(p => p.op === 'vessel-transfer' && p.via !== 'workcell');
  const swapFrom = gripper && (needs.expansion > 0 || (setup.providers.some(p => p.op === 'storage') && needs.storage));
  const fits = needs.free >= kinds || (swapFrom && needs.free >= 1);
  return {...needs, tipKinds: kinds, fits, swaps: fits && needs.free < kinds, capacity: setup.capacity};
}

function withCapacity(handler, providers, needs = null) {
  const storageOn = providers.some(p => p.op === 'storage');
  if (needs && !needs.unchecked) {
    // Tip racks go in the positions left after everything else; the gripper
    // can also bring racks in from expansion positions and storage.
    const gripper = providers.some(p => p.op === 'vessel-transfer' && p.via !== 'workcell');
    const extra = (gripper ? needs.expansion : 0) + (storageOn && needs.storage ? needs.storage.tipRacks : 0);
    const room = Math.max(needs.free, 0);
    return {lo: room + extra, hi: room + extra, onDeck: room, basis: `${room} free deck position${room === 1 ? '' : 's'}${gripper && needs.expansion ? ` + ${needs.expansion} expansion` : ''}${storageOn && needs.storage ? ` + ${needs.storage.name} (${needs.storage.tipRacks} racks)` : ''}`};
  }
  const c = handler.capacity.tipRacks;
  const storage = providers.some(p => p.op === 'storage');
  // A recorded storage module (e.g. a tip stacker) adds its own stated capacity.
  const rec = pipettesData.handlers[handler.id]?.storage;
  const extra = storage ? (rec ? [rec.racks, rec.racks] : equipmentMap.storageAddsTipRacks) : [0, 0];
  return {lo: c.lo + extra[0], hi: c.hi + extra[1], basis: storage ? `${c.basis} plus ${rec ? `${rec.module} (${rec.racks} racks)` : 'storage'}` : c.basis};
}

// Whether each deck, module or device a setup uses takes the workflow's
// labware. A researched answer (content/labware-fit.json) is used with its
// source; only what no source settles is asked (issues #53, #55).
function fitFact(base, fit, what, owner, purchase) {
  const src = fit.source?.url ? {url: fit.source.url, title: fit.source.title || '', section: fit.source.section || ''}
    : fit.source?.reference ? {url: null, title: fit.source.title || '', section: fit.source.section || '', reference: fit.source.reference} : null;
  if (fit.status === 'yes') return {...base, owner, known: 'yes', source: src, question: `${base.subject} takes ${what}${fit.module ? ` (${fit.module})` : ''}.${fit.detail ? ` ${fit.detail}` : ''}`};
  const lower = base.subject.replace(/^The /, 'the ');
  if (fit.status === 'adapter') return {...base, owner, known: purchase ? 'yes' : null, source: src, question: `Is the adapter or rack that lets ${lower} take ${what} available?${fit.module ? ` (${fit.module})` : ''} ${fit.detail || ''}`.trim()};
  return {...base, owner, source: null, question: `Does ${lower} take ${what}?${fit.toSettle ? ` (Not found in the sources checked; to settle: ${fit.toSettle})` : ' (No source found yet.)'}`};
}

function labwareFacts(setup, used, lw) {
  if (!lw) return [];
  const inst = setup.installation, where = inst.name, what = `${lw.label}${lw.assumed ? ' (assumed: no labware chosen)' : ''}`;
  const purchase = inst.kind === 'purchase';
  const out = [];
  if (lw.format === 'tube') out.push(fitFact({id: `${inst.id}:labware:${lw.id}:deck`, type: 'labware', subject: `The ${setup.handler.name} deck on ${where}`}, labwareFit(setup.handler.id, 'deck', lw.id), what, inst.owner, purchase));
  for (const f of used) {
    if (!f.startsWith('provider:') || f === 'provider:liquid-transfer') continue;
    for (const p of usedProviders(setup, used, f.slice(9))) {
    const name = p.device ? dispenserById.get(p.device)?.name || p.device : p.module || (p.class ? `${OPS[p.op]?.label?.toLowerCase() || p.op.replace(/-/g, ' ')} device (e.g. ${p.class.examples.slice(0, 2).join(', ')})` : p.op === 'vessel-transfer' ? 'plate gripper or transport' : (OPS[p.op]?.label?.toLowerCase() || p.op.replace(/-/g, ' ')));
    const exactDevice = setup.reportMechanisms && p.device;
    const fit = p.build ? buildFit(p, lw.id) : labwareFit(exactDevice || fitSubject(setup.handler, p), p.op, lw.id);
    const fitId = `${inst.id}:labware:${lw.id}:${p.op}${exactDevice ? '=' + exactDevice : second(setup, p)}`;
    out.push(fitFact({id: fitId, type: 'labware', subject: `The ${name} on ${where}`}, fit, what,
      p.via === 'workcell' ? 'Workcell vendor / integrator' : inst.owner, purchase && !p.build && !exactDevice));
    }
  }
  return out;
}

function factsFor(setup, used, r, reloads, lw = null) {
  const inst = setup.installation;
  const where = inst.name;
  const facts = [{id: `${inst.id}:access`, type: 'access', owner: inst.owner, question: `Can we book ${where}, with operator support, for this protocol?`}, ...labwareFacts(setup, used, lw)];
  if (setup.providers.some(p => p.op === 'storage')) facts.push({id: `${inst.id}:storage-capacity`, type: 'method', owner: inst.owner, question: `How many tip racks can the connected storage hold for ${where}? (${equipmentMap.storageBasis})`});
  if (reloads > 0 && /default/.test(setup.capacity.basis)) facts.push({id: `${setup.handler.id}:capacity`, type: 'method', owner: inst.owner, question: `How many tip racks and labware positions does the ${setup.handler.name} deck hold? (Not recorded; a default range was used.)`});
  for (const f of used) {
    if (f.startsWith('method:')) { const s = substitutionsData.substitutions.find(x => x.id === f.slice(7)); facts.push({id: `${setup.handler.id}:${f}`, type: 'method', owner: s.owner, question: s.question}); }
    else if (f.startsWith('constraint:')) facts.push({id: `${inst.id}:${f}`, type: 'method', owner: inst.owner, question: `Can ${where} handle material that needs “${f.slice(11)}” handling without loss (reviewed protocol constraint)?`});
    else if (f === 'pipette-liquid-class') facts.push({id: `${inst.id}:pipette-liquid-class`, type: 'method', owner: 'Protocol owner / instrument owner', question: `Which liquid class and transfer settings have been verified for the viscous liquids or settling suspensions pipetted on ${where}?`});
    else if (f === 'dispense-viscous') facts.push({id: `${inst.id}:dispense-viscous`, type: 'method', owner: 'Protocol owner (wet-lab validation)', question: `Can ${where}'s dispenser deliver the viscous reagents in this protocol (e.g. guanidine, enzyme mixes in glycerol) accurately, or should they be pipetted?`});
    else if (f.startsWith('dispense-onto:')) { const what = f.slice(14).split('/').map(id => materialsData.classes[id]?.label?.toLowerCase() || id).join(' and '); facts.push({id: `${inst.id}:${f}`, type: 'method', owner: 'Protocol owner (wet-lab validation)', question: `${where}'s dispenser adds liquid from above onto ${what} already in the well. Does it splash between wells, or disturb the bead pellet or the cells, at its dispense height and speed? Not assumed safe: check with a test plate (${dispensersData.splash.summary})`}); }
    else if (f.startsWith('range:')) { const [, op, t, ag, names] = f.split(':'); facts.push({id: `${inst.id}:${f}`, type: 'method', owner: inst.owner, question: `Can the ${OPS[op]?.label?.toLowerCase() || op.replace(/-/g, ' ')} ${names ? `device (${names})` : 'module'} on ${where} ${ag ? 'agitate the plate' : 'hold the plate'}${t ? ` at ${t} °C` : ''}${ag && t ? ' at the same time' : ''}? (Its range is not recorded.)`}); }
    else if (f.startsWith('device:')) { const [, op, names] = f.split(':'); facts.push({id: `${inst.id}:${f}`, type: 'workcell', owner: 'Workcell vendor / integrator', question: `The ${OPS[op]?.label?.toLowerCase() || op.replace(/-/g, ' ')} step needs a device that can do it at the stated conditions: ${names} can (recorded ranges). Is one of these part of the workcell?`}); }
    else if (f.startsWith('provider:')) for (const p of usedProviders(setup, used, f.slice(9))) {
      if (p.via === 'native') continue;
      if (p.build) {
        const b = buildById.get(p.build);
        facts.push({id: `${inst.id}:build:${b.id}`, type: 'build', build: b.id, op: p.op, owner: 'Builder', source: {url: b.url, title: b.name}, question: `Is the ${b.name} built and working on ${where}? It is an open-source design (${b.maturity}); it needs ${b.requires.replace(/\.$/, '')}.`});
        b.validate.forEach((v, i) => facts.push({id: `${inst.id}:build:${b.id}:validate:${i}`, type: 'build-check', build: b.id, owner: 'Builder / protocol owner', question: `${b.name}: has this been checked for this protocol? ${v}.`}));
        continue;
      }
      const name = p.device ? dispenserById.get(p.device)?.name || p.device : p.module || (p.class ? `${p.op.replace(/-/g, ' ')} device (e.g. ${p.class.examples.slice(0, 2).join(', ')})` : p.op);
      const type = p.via === 'module' ? 'module' : p.via === 'workcell' ? 'workcell' : p.via === 'bench' ? 'device' : 'integration';
      const q = p.via === 'module' ? `Is the ${name} fitted and working on ${where}?`
        : p.via === 'bench' ? `Is a ${name} available on the bench beside ${where}? A person carries the plate to it and back and stays while it dispenses.`
        : p.via === 'external' ? `Is a ${name} connected to ${where} through its own scheduling software?`
        : p.via === 'scheduler' ? `Can ${where}'s software and plate handler drive a ${name}? (No integration is recorded in the catalogue.)`
        : `Can a workcell connect ${setup.handler.name} and a ${name} (drivers, plate access, scheduling)?`;
      facts.push({id: `${inst.id}:${p.via}:${p.op}${p.device ? `=${p.device}` : ''}${second(setup, p)}`, type, op: p.op, optionKey: optionKey(setup.handler, p.module, p.op), owner: p.via === 'workcell' ? 'Workcell vendor / integrator' : inst.owner, question: q});
    }
  }
  const resolved = facts.map(f => ({...f, status: factStatus(r, inst, f)}));
  if (inst.installedHeads?.status === 'reported') resolved.push({id: `${inst.id}:installed-heads`, type: 'installed-heads',
    owner: inst.owner, status: 'unknown', question: 'Confirm the reported head and channel configuration in the equipment record.'});
  return resolved;
}

function factStatus(r, inst, fact) {
  // A researched answer stands unless the person has answered otherwise.
  if (fact.known) return r.facts[fact.id] || fact.known;
  // A build is confirmed by its builder: built answers whether it works,
  // validated also settles its checks (#78).
  if (fact.type === 'build' || fact.type === 'build-check') {
    if (r.facts[fact.id]) return r.facts[fact.id];
    const s = inst.kind === 'existing' ? inst.builds?.[fact.build] : null;
    if (fact.type === 'build') return s === 'built' || s === 'validated' ? 'yes' : 'build';
    return s === 'validated' ? 'yes' : 'unknown';
  }
  if (inst.kind === 'purchase' && (fact.type === 'access' || fact.type === 'module')) return 'purchase';
  // A bench device bought with the setup (#173); beside an existing instrument it is asked.
  if (fact.type === 'device') return r.facts[fact.id] || (inst.kind === 'purchase' ? 'purchase' : 'unknown');
  if (r.facts[fact.id]) return r.facts[fact.id];
  if (fact.type === 'access' && inst.access) return inst.access;
  if ((fact.type === 'module' || fact.type === 'integration') && inst.options?.[fact.optionKey || fact.op]) return inst.options[fact.optionKey || fact.op];
  if (fact.type === 'workcell' || (inst.kind === 'purchase' && fact.type === 'integration')) return r.facts[fact.id] || 'proposed';
  return r.facts[fact.id] || 'unknown';
}
const verified = s => s === 'yes';

// ---------------------------------------------------------------- cost (issue #57)
// Every amount comes from content/prices.json, where each observation carries
// its kind (quote, list, award, used), date, terms and source. A line is priced
// from its options: each option sums its evidence, and the line's range runs
// over the options. New and used prices are kept apart. Nothing is estimated:
// an item with no evidence is listed as unpriced and the total is incomplete.
const NEW_KINDS = new Set(['quote', 'list', 'award']);
const USED_KINDS = new Set(['used-asking', 'used-sold']);
const evidenceById = new Map(pricesData.evidence.map(e => [e.id, e]));
export const priceSource = {version: pricesData.version, fx: pricesData.fx};

function toGBP(e) {
  const rate = pricesData.fx.unitsPerGBP[e.currency];
  if (!rate) throw Error(`No exchange rate for ${e.currency} (evidence ${e.id})`);
  return e.amount / rate;
}
// A catalogued dispenser (#173) is priced from its own observations in
// content/dispensers.json, each one an option; an observation covering several
// units is divided by them.
function priceDevice(d) {
  const out = {label: d.name, part: 'device', new: null, used: null, basis: [], unpriced: true};
  for (const p of d.prices || []) {
    const slot = NEW_KINDS.has(p.kind) ? 'new' : USED_KINDS.has(p.kind) ? 'used' : null;
    if (!slot) continue;
    const gbp = toGBP({...p, id: d.id}) / (p.units || 1);
    out[slot] = out[slot] ? {lo: Math.min(out[slot].lo, gbp), hi: Math.max(out[slot].hi, gbp)} : {lo: gbp, hi: gbp};
    out.basis.push({label: p.item, slot, gbp, evidence: [{id: `${d.id}:${p.url}`, kind: p.kind, item: p.item, amount: p.amount, currency: p.currency, date: p.date, units: p.units || 1, url: p.url}]});
  }
  out.unpriced = !out.new && !out.used;
  return out;
}
function priceLine(label, part, line) {
  const out = {label, part, new: null, used: null, basis: [], unpriced: !line};
  if (!line) return out;
  for (const o of line.options) {
    const ev = o.evidence.map(id => { const e = evidenceById.get(id); if (!e) throw Error(`Unknown price evidence ${id}`); return e; });
    const kinds = new Set(ev.map(e => e.kind));
    const total = ev.reduce((s, e) => s + toGBP(e), 0) * (o.quantity || 1);
    const slot = [...kinds].every(k => USED_KINDS.has(k)) ? 'used' : [...kinds].every(k => NEW_KINDS.has(k)) ? 'new' : null;
    if (!slot) throw Error(`Option “${o.label}” mixes new and used evidence`);
    out[slot] = out[slot] ? {lo: Math.min(out[slot].lo, total), hi: Math.max(out[slot].hi, total)} : {lo: total, hi: total};
    out.basis.push({label: o.label, slot, gbp: total, evidence: ev.map(e => ({id: e.id, kind: e.kind, item: e.item, amount: e.amount, currency: e.currency, date: e.date, condition: e.condition, vat: e.vat, url: e.source.url}))});
  }
  // With four or more observations, the range is the middle half (25th–75th
  // percentile) so one unusual award or listing does not set it; the full
  // span stays in the basis.
  for (const slot of ['new', 'used']) {
    const v = out.basis.filter(b => b.slot === slot).map(b => b.gbp).sort((a, b) => a - b);
    if (v.length >= 4) out[slot] = {lo: quantile(v, 0.25), hi: quantile(v, 0.75), n: v.length, span: {lo: v[0], hi: v[v.length - 1]}};
    else if (out[slot]) out[slot].n = v.length;
  }
  out.unpriced = !out.new && !out.used;
  return out;
}
const quantile = (v, q) => { const i = (v.length - 1) * q, lo = Math.floor(i); return v[lo] + (v[Math.ceil(i)] - v[lo]) * (i - lo); };
const sumRange = (lines, slot) => lines.reduce((s, l) => l[slot] ? add(s, l[slot]) : s, zero());

// A bundle sold in several pipette versions is priced only in the version
// with the pipettes the setup chose (#60). Options without a stated version,
// and setups without a pipette choice, keep every option.
export function bundleFor(bundle, pipetteId) {
  if (!pipetteId || !bundle.options.some(o => o.pipettes)) return bundle;
  return {...bundle, options: bundle.options.filter(o => !o.pipettes || o.pipettes.includes(pipetteId))};
}

export function costBasis(setup, tipUse = null) {
  const inst = setup.installation, h = setup.handler;
  const own = h ? pricesData.handlers[h.id] || {} : {};
  const lines = [];
  if (setup.standalone && inst.kind !== 'existing') lines.push({...priceDevice(setup.standalone), part: 'base'});
  else if (inst.kind === 'existing') lines.push({label: `${h?.name ?? setup.standalone.name} (already accessible)`, part: 'base', new: zero(), used: null, basis: [], unpriced: false, owned: true});
  else if (setup.pipettes?.evidence && own.robot) {
    // The base instrument is priced with the pipettes this setup chose (#72).
    const used = own.base?.options.filter(o => o.evidence.every(id => /used/.test(evidenceById.get(id)?.kind || ''))) || [];
    lines.push(priceLine(`${h.name} with ${setup.pipettes.label.toLowerCase()}`, 'base', {options: [{label: `${h.name} + ${setup.pipettes.label} (list)`, evidence: [...own.robot, ...setup.pipettes.evidence]}, ...used]}));
  } else lines.push(priceLine(own.base?.label || `${h.name} base instrument`, 'base', own.base));
  // A module serving several operations (a heater-shaker that mixes and
  // shakes) is bought once.
  const seenModules = new Set();
  for (const p of setup.standalone ? [] : setup.providers.filter(p => p.via !== 'native')) {
    if (p.via === 'module' && !p.build) { if (seenModules.has(p.module)) continue; seenModules.add(p.module); }
    // A build is listed with its authors' stated parts cost, never summed (#78).
    if (p.build) { const b = buildById.get(p.build); lines.push({label: b.module, part: 'build', new: null, used: null, basis: [], unpriced: true, statedCost: b.statedCost, url: b.url}); continue; }
    if (inst.kind === 'existing' && inst.options?.[optionKey(h, p.module, p.op)] === 'yes') { lines.push({label: `${p.module || p.op} (fitted)`, part: 'module', new: zero(), used: null, basis: [], unpriced: false, owned: true}); continue; }
    if (p.via === 'module') lines.push(priceLine(p.module, 'module', own.modules?.[p.module]));
    else if (p.device) lines.push(priceDevice(dispenserById.get(p.device)));
    else lines.push(priceLine(`${p.op.replace(/-/g, ' ')} device`, 'device', pricesData.classes[p.op]));
  }
  if (setup.route === 'workcell') lines.push(priceLine('Workcell integration (scheduler, arm, enclosure)', 'integration', pricesData.integration?.workcell));
  if (inst.kind !== 'existing') for (const s of own.services || []) lines.push(priceLine(s.label, 'service', s));
  // A configured-system price (vendor bundle or public award for a whole
  // system) replaces the base and the modules it covers when those are
  // unpriced or cost more separately.
  // A configured-system price (vendor bundle, or a public award for a whole
  // system) replaces the base and the modules it covers; modules it does not
  // cover are added at their own price. It is used when it is cheaper than
  // buying the parts or when the parts are unpriced.
  const covered = l => l.part === 'base' || l.part === 'module';
  const alaCarte = lines.filter(covered);
  const options = inst.kind === 'existing' ? [] : (own.bundles || []).map(b => bundleFor(b, setup.pipettes?.id)).filter(b => b.options.length).map(b => {
    const line = {...priceLine(b.label, 'bundle', b), covers: b.covers};
    const extra = lines.filter(l => l.part === 'module' && !b.covers.includes(l.label));
    return {line, extra, total: line.new ? add(line.new, sumRange(extra, 'new')) : null};
  }).filter(o => o.total && o.extra.every(l => l.new || l.owned));
  const best = options.sort((x, y) => x.total.lo - y.total.lo)[0];
  const useBundle = !!best && (alaCarte.some(l => !l.new && !l.owned) || best.total.lo < sumRange(alaCarte, 'new').lo);
  const bestBundle = best?.line;
  const final = useBundle ? [bestBundle, ...best.extra, ...lines.filter(l => !covered(l))] : lines;
  const missing = final.filter(l => !l.new && !l.owned && l.part !== 'build').map(l => l.label);
  const priced = final.filter(l => l.new);
  const base = lines.find(l => l.part === 'base');
  const annual = inst.kind === 'existing' || !own.annual ? null : priceLine(own.annual.label, 'annual', own.annual);
  const tips = own.tips ? priceLine(own.tips.label, 'consumable', own.tips) : null;
  return {
    currency: 'GBP', complete: missing.length === 0, instrumentPriced: final.some(l => (l.part === 'base' || l.part === 'bundle') && (l.new || l.owned)), knownItems: priced.length, items: final.length,
    new: priced.length ? sumRange(priced, 'new') : null,
    // Used asking prices for the base instrument alone: a floor, not a configured system.
    usedBase: base?.used || null,
    annual: annual?.new || null, annualLine: annual,
    perTip: tips?.new || null, tipsLine: tips,
    // Tips per run at the recorded price per tip; low-retention tips are priced as standard unless a price is recorded.
    tipsPerRun: tipUse && tips?.new ? {lo: tipUse.total.lo * tips.new.lo, hi: tipUse.total.hi * tips.new.hi, tips: tipUse.total, lowRetentionUnpriced: tipUse.lowRetention.hi > 0} : null,
    builds: final.filter(l => l.part === 'build'),
    lines: final, bundle: useBundle ? bestBundle.label : null, missing,
    byCurrency: priced.length ? {GBP: mid(sumRange(priced, 'new'))} : {},
    note: missing.length ? `Unpriced: ${missing.join('; ')}. Totals cover priced items only.` : 'Every line is priced from recorded evidence.',
  };
}

function label(setup) {
  const parts = setup.providers.filter(p => p.via !== 'native').map(p => p.device ? `${dispenserById.get(p.device)?.name || p.device} (${p.via === 'bench' ? 'on the bench' : 'workcell'})`
    : p.module || `${p.op.replace(/-/g, ' ')}${p.via === 'workcell' ? ' (workcell)' : p.via === 'scheduler' ? ' (connected, unverified)' : ' (connected)'}`);
  return [...new Set(parts)].join(' · ') || 'Base configuration';
}

// Low-retention tips are needed where touched material sticks to plastic,
// but the platform offers none and forbids other makers' tips (#74).
function tipFacts(inst, handler, setup, sim, r) {
  const lr = setup.pipettes?.data.lowRetention;
  if (!(sim.tips?.lowRetention.hi > 0) || lr?.available !== false) return [];
  const id = `${inst.id}:method:standard-tips-for-sticky-material`;
  const n = sim.tips.lowRetention;
  return [{id, type: 'method', owner: `${handler.vendor || 'Vendor'} / protocol owner`, status: r.facts[id] || 'unknown',
    question: `${n.lo === n.hi ? n.lo : `${n.lo}–${n.hi}`} tips touch cells or beads, which stick to plastic (lab evidence), but no low-retention tips are available for ${handler.name}${setup.pipettes.data.thirdPartyTips?.allowed === false ? ", and other makers' tips void the warranty" : ''}. Can standard tips be used without unacceptable sample loss, or will the vendor supply or approve low-retention tips?`}];
}

// Monitoring, recovery and tuning features per handler (#92), each sourced or
// not found. A needed feature the sources say is absent rules the setup out
// (the person can answer otherwise); one not found becomes a question.
export const handlerFeatures = featuresData;
// Published reports that bead-based chromatin profiling (CUT&Tag, CUT&RUN)
// was automated on a platform (#154): evidence only, never a ranking input.
export const assayEvidence = assayEvidenceData;
export const evidenceFor = handlerId => assayEvidenceData.items.filter(i => i.handler === handlerId);
function featureFacts(inst, handler, r) {
  return (r.needs || []).map(f => {
    const v = featuresData.handlers[handler.id]?.[f], label = featuresData.features[f].label;
    const id = `${handler.id}:feature:${f}`;
    const fact = {id, type: 'feature', owner: `${handler.vendor || 'Vendor'}`, source: v?.source ? {url: v.source.url, title: v.source.quote} : null,
      known: v?.value === true ? 'yes' : v?.value === false ? 'no' : null,
      question: v?.value === true ? `${handler.name} has ${label.toLowerCase()}: ${v.detail}` : v?.value === false ? `${handler.name} lacks ${label.toLowerCase()} (${v.detail})` : `Does ${handler.name} have ${label.toLowerCase()}? (Not found in the sources read.)`};
    return {...fact, status: factStatus(r, inst, fact)};
  });
}

// Volumes below the smallest head's minimum stay by hand (#129). One question
// per setup names them: pre-diluting to the minimum is a method change for the
// protocol owner; a lower-volume head is a question for the owner.
function volumeFacts(inst, setup, sim, r) {
  const low = sim.timeline.filter(s => s.belowMin);
  if (!low.length) return [];
  const min = low[0].belowMin.min, id = `${inst.id}:volume-below-minimum`;
  const vols = [...new Set(low.map(s => s.belowMin.ul))].sort((a, b) => a - b);
  return [{id, type: 'volume', owner: 'Protocol owner / instrument owner', status: r.facts[id] || 'unknown', steps: low.map(s => ({actionId: s.actionId, label: s.label, ul: s.belowMin.ul})),
    question: `${low.length} step${low.length === 1 ? ' adds' : 's add'} less than the ${min} µL minimum of the pipetting heads on ${inst.name} (${vols.join(', ')} µL, e.g. “${low[0].label}”), so ${low.length === 1 ? 'it stays' : 'they stay'} by hand. Can ${low.length === 1 ? 'it' : 'they'} be pre-diluted to at least ${min} µL (a method change to validate), or is a lower-volume head available?`}];
}

// Bill of materials (#122): per run, from the ledger and the reagent
// accounting. Each reagent's volume delivered to the wells (the ledger's
// draws, pass by pass), its dead volume and overage (per addition step,
// #85/#119) and the total to prepare; tips by size; liquid waste; and the
// refills and waste emptying a person does during the run, with their
// minutes (planning estimate). Refill minutes count in the break-even labour
// figure and, as hands-on time, in the ranking (#140: reservoirs follow the solved deck layout).
export function billOfMaterials(sim, workload) {
  const ph = sim.physical, extra = new Map(), prime = new Map();
  for (const x of sim.reagents) {
    const k = [...x.classes].sort().join('+');
    if (x.extraUl || x.deadUl) extra.set(k, add(extra.get(k) || zero(), x.extraUl || x.deadUl));
    if (x.primeUl) prime.set(k, add(prime.get(k) || zero(), x.primeUl));
  }
  const reagents = ph.reagents.map(g => {
    const e = extra.get(g.key) || null;
    return {key: g.key, classes: g.classes, deliveredUl: g.deliveredUl, extraUl: e, primeUl: prime.get(g.key) || null,
      totalUl: e ? {lo: g.deliveredUl + e.lo, hi: g.deliveredUl + e.hi} : {lo: g.deliveredUl, hi: g.deliveredUl}, routes: g.routes, containers: g.containers, steps: g.steps};
  }).sort((a, b) => b.totalUl.hi - a.totalUl.hi);
  const refills = ph.containers.reduce((n, c) => n + c.refills, 0), empties = ph.containers.reduce((n, c) => n + c.empties, 0);
  const per = est(OVER.refill.person);
  return {
    samples: workload, reagents,
    totals: {deliveredUl: reagents.reduce((n, x) => n + x.deliveredUl, 0), totalUl: reagents.reduce((s, x) => add(s, x.totalUl), zero())},
    containers: ph.containers, tips: sim.metrics.tips ? {bySize: sim.metrics.tips.bySize, racks: sim.metrics.tips.racks, total: sim.metrics.tips.total} : null,
    waste: {...ph.waste, empties}, refills,
    labour: {events: refills + empties, minutes: times(per, refills + empties), basis: OVER.refill.basis},
  };
}

// A protocol contradiction is recalculated from the modeled steps and labware.
// Setup questions about reservoirs, channels and waste can still be answered
// by the equipment owner through their existing fact controls.
const SETUP_KINDS = new Set(['source-too-small', 'channels-fit', 'shared-source', 'refills', 'waste-full']);
export const physicalKinds = {
  overflow: 'Overflows the well', 'remove-empty': 'Removes from an empty well', 'remove-unknown': 'Removes an unstated volume',
  'remove-short': 'Removes more than the vessel holds', 'remove-unverified': 'Available liquid for removal is unresolved',
  'volume-unstated': 'Volume not stated', 'move-short': 'Moves more than the well holds', 'dest-not-empty': 'Needs a fresh plate',
  'mix-empty': 'Mixes an empty well', 'mix-unknown': 'Mixes an unstated volume', 'source-too-small': 'Source smaller than one pass',
  'channels-fit': 'Channels do not fit the reservoir', 'shared-source': 'Reagents share a reservoir well', refills: 'Refilled during the run', 'waste-full': 'Waste emptied during the run',
};
const protocolViolation = v => !SETUP_KINDS.has(v.kind);
function physicalActionBlocks(physical) {
  return new Map(physical.violations.filter(v => protocolViolation(v) && (v.severity === 'impossible' || v.kind === 'remove-unverified') && v.actionId)
    .map(v => [v.actionId, v]));
}
function protocolIssues(physical, answers, extra = []) {
  const issues = new Map();
  for (const v of [...physical.violations, ...extra]) {
    if (!protocolViolation(v)) continue;
    const id = `physical:${v.kind}:${v.actionId}`;
    const answer = answers[id] || 'unknown';
    const impossible = v.severity === 'impossible';
    issues.set(id, {id, kind: v.kind, severity: v.severity, actionId: v.actionId, step: v.label,
      detail: v.detail, scope: 'protocol', status: impossible ? 'unknown' : answer, acknowledged: impossible && answer === 'yes'});
  }
  return [...issues.values()];
}
function physicalFacts(inst, handler, ph, r, blocks) {
  const where = inst.name;
  const issues = protocolIssues(r.protocolPhysical, r.facts, blocks.values());
  const facts = [];
  const byKind = k => ph.violations.filter(v => v.kind === k);
  const fact = (kind, severity, question) => { const id = `${handler.id}:physical:${kind}`; facts.push({id, type: 'physical', kind, severity, owner: inst.owner, question, status: r.facts[id] || 'unknown'}); };
  const list = vs => vs.map(v => v.detail.replace(/\.$/, '')).join('; ');
  if (byKind('source-too-small').length) fact('source-too-small', 'impossible', `One pass draws more than a reservoir on ${where} holds: ${list(byKind('source-too-small'))}. Is a larger reservoir used?`);
  if (byKind('channels-fit').length) fact('channels-fit', 'impossible', `On ${where}: ${list(byKind('channels-fit'))}. Is a wider reservoir used, or fewer channels per pass?`);
  if (byKind('shared-source').length) fact('shared-source', 'question', `The planned deck has fewer reservoir wells than reagents: ${list(byKind('shared-source'))}. Is there room on ${where} for more reservoirs, or are they swapped during the run?`);
  const refills = ph.containers.filter(c => c.refills), empties = ph.containers.filter(c => c.empties);
  if (refills.length) fact('refills', 'question', `Reagent sources run dry ${refills.reduce((n, c) => n + c.refills, 0)} times during the run (${refills.map(c => `${c.label}: ${c.refills}`).join(', ')}); each refill waits for a person. Will someone be there to refill them, or can larger reservoirs be used on ${where}?`);
  if (empties.length) fact('waste-full', 'question', `The liquid waste fills ${empties.reduce((n, c) => n + c.empties, 0)} times during the run (${empties.map(c => `${c.label}: ${Math.round(c.dumpedUl / 1000)} ml in all`).join(', ')}); each time someone empties it. Is a larger waste or a drain available on ${where}?`);
  return {facts, issues};
}
// Unresolved issues that make the plan physically impossible on this setup.
export const impossibleCount = c => (c.physicalIssues || []).filter(i => i.severity === 'impossible').length +
  c.facts.filter(f => f.type === 'physical' && f.severity === 'impossible' && f.status !== 'yes').length;

// Miniaturised reactions are a method change the protocol owner validates.
function scaleFacts(inst, model, r) {
  if (!model.reactionScale || model.reactionScale === 1) return [];
  const id = `${inst.id}:method:miniaturised-reactions`;
  return [{id, type: 'method', owner: 'Protocol owner (wet-lab validation)', status: r.facts[id] || 'unknown',
    question: `Every reaction volume is scaled to ${Math.round(model.reactionScale * 100)}% (${dispensersData.miniaturisation.summary}). Does the chemistry give the same yield and quality at this volume? Validate on a test plate before relying on the reagent saving.`}];
}
export function scaleModel(model, k) {
  if (k === 1) return model;
  const m = structuredClone(model);
  for (const a of m.chunks.flatMap(c => c.actions)) {
    if (a.volumeUl != null) a.volumeUl = +(a.volumeUl * k).toPrecision(4);
    if (a.removalUl != null) a.removalUl = +(a.removalUl * k).toPrecision(4);
    if (a.outputAllocation) a.outputAllocation = a.outputAllocation.map(output => ({...output, volumeUl:+(output.volumeUl * k).toPrecision(4)}));
    if (a.partsUl) a.partsUl = a.partsUl.map(v => +(v * k).toPrecision(4));
  }
  m.reactionScale = k;
  return m;
}

function candidate(r, model, inst, handler, route, providers, pipetteId = null) {
  if (installationEquipmentProblem(handler, inst)) return null;
  // Each recorded pipette configuration is simulated; the one with the least
  // hands-on time, then the fewest tip racks, then the shortest run is used, and
  // the others are kept for comparison (#67).
  // Deck room is counted for each pipette configuration's own solved layout (#140): a trough
  // only for a head that works the whole plate, tip racks only for the sizes its heads take.
  const base = {installation: inst, handler, route, providers, reportMechanisms: r.objective === TIP_RUNTIME,
    completePlates: completePlates(model, r.workload)};
  const options = [], runs = [];
  for (const cfg of installationPipetteConfigs(handler, inst).filter(c => !pipetteId || c.id === pipetteId)) {
    if (!cfg.heads.some(hasHeadRange)) continue;
    const needs = deckNeeds(model, handler, providers, r.workload, cfg);
    const st = {...base, capacity: withCapacity(handler, providers, needs), pipettes: cfg};
    const sm = assessedSimulation(model, r.workload, st, r.methodChanges, r.protocolBlocks);
    if (!sm.metrics.automatedInstances) continue;
    runs.push({st, sm, needs, ...(r.objective === TIP_RUNTIME ? {tipRuntime: tipRuntimeMetrics(sm, model)} : {})});
    if (cfg) options.push({id: cfg.id, label: cfg.label, active: sm.metrics.active, elapsed: sm.metrics.elapsed, tips: sm.tips?.total || null, reloads: sm.reloads, fits: !needs || deckFit(needs, sm, st).fits});
  }
  // Hands-on time within 15 minutes of the best counts as equal; among those,
  // fewer tips (a running cost every batch) wins, then the shorter run.
  // Only configurations whose deck fits compete, while any does.
  const fitting = runs.filter(x => !x.needs || deckFit(x.needs, x.sm, x.st).fits);
  const pool = fitting.length ? fitting : runs;
  const least = Math.min(...pool.map(x => mid(x.sm.metrics.active)));
  const known = r.objective === TIP_RUNTIME ? pool.filter(x => validRange(x.tipRuntime.tips) && validRange(x.tipRuntime.elapsed)) : [];
  const pick = known.sort((a, b) => cmp(tipRuntimeBounds(a.tipRuntime), tipRuntimeBounds(b.tipRuntime)))[0] ??
    pool.filter(x => mid(x.sm.metrics.active) <= least + 15).sort((x, y) => (x.sm.tips ? mid(x.sm.tips.total) : 0) - (y.sm.tips ? mid(y.sm.tips.total) : 0) || mid(x.sm.metrics.elapsed) - mid(y.sm.metrics.elapsed))[0];
  const setup = pick?.st, sim = pick?.sm, needs = pick?.needs;
  if (!sim) return null;
  const usedOps = new Set([...sim.used].filter(f => f.startsWith('provider:')).map(f => f.slice(9)));
  // Storage is used through deck capacity, not by any step; trimming removes it if it does not help.
  // With several modules for one operation, only those a step went to are kept (#144).
  const several = op => providers.filter(p => p.op === op).length > 1;
  const kept = providers.filter(p => p.via === 'native' || p.op === 'storage' || (usedOps.has(p.op) && (!several(p.op) || !p.module || sim.used.has(`module:${p.module}`))));
  const s = {...setup, providers: kept};
  const phys = physicalFacts(inst, handler, sim.physical, r, sim.protocolBlocks);
  return {
    id: [inst.id, route, kept.filter(p => p.via !== 'native').map(p => `${p.via}:${p.op}${p.device ? `=${p.device}` : ''}`).sort().join('+') || 'base'].join(':'),
    installation: inst, config: {id: handler.id, name: handler.name}, handler, route, workcell: route === 'workcell',
    modules: kept.filter(p => p.via !== 'native').map(p => p.op).sort(),
    name: inst.name, setupLabel: label(s), providers: kept,
    timeline: sim.timeline, metrics: sim.metrics, reloads: sim.reloads,
    savesNothing: r.baselineActive != null && mid(sim.metrics.active) >= r.baselineActive,
    facts: [...factsFor(s, sim.used, r, sim.reloads, model.labware), ...tipFacts(inst, handler, setup, sim, r), ...volumeFacts(inst, setup, sim, r), ...scaleFacts(inst, model, r), ...featureFacts(inst, handler, r), ...phys.facts],
    physicalIssues: phys.issues,
    ...(r.objective === TIP_RUNTIME ? {tipRuntime: pick.tipRuntime} : {}),
    bom: billOfMaterials(sim, r.workload),
    features: featuresData.handlers[handler.id] || null, cost: {...costBasis(s, sim.tips), reagents: reagentCost(sim.reagents, r.reagentPrices, r.workload)},
    reagents: sim.reagents,
    physical: sim.physical,
    // The solved deck layout of the chosen pipette configuration (#140): the ledger's source wells, the exporter's deck and Decide's deck table.
    layout: sim.layout || null,
    deck: needs ? deckFit(needs, sim, setup) : null,
    channels: channelsFor(handler.id),
    pipettes: setup.pipettes ? {chosen: {id: setup.pipettes.id, label: setup.pipettes.label}, options, lowRetention: setup.pipettes.data.lowRetention, thirdPartyTips: setup.pipettes.data.thirdPartyTips} : null,
  };
}

// Each trip back to the bench is weighed as well as hands-on minutes. A
// method change the protocol owner must validate is weighed like a trip back
// to the bench, so a module that avoids one (a cooler for cold reagents) is
// kept unless dropping it saves more than that.
const frontierScore = c => mid(c.metrics.active) + walkAwayThresholdMinutes * mid(c.metrics.visits) + (c.deck && !c.deck.fits ? 1e6 : 0) + walkAwayThresholdMinutes * methodChanges(c) + (c.metrics.tips ? mid(c.metrics.tips.total) / 96 : 0);
// Backward elimination: start from the fullest setup and repeatedly drop the
// provider whose removal costs least hands-on time, keeping every step.
function frontier(r, model, inst, handler, route, rel) {
  const out = [];
  // Builds the owner has planned, built or validated are always considered;
  // the rest only when the request includes open-source builds (#78).
  // An upgrade modifies a module, so it cannot stand in for one the owner lacks.
  const useBuilds = buildsFor(handler).filter(b => r.builds || (inst.kind === 'existing' && buildStates[inst.builds?.[b.id]]))
    .filter(b => !b.upgrades || (inst.kind !== 'existing' || b.ops.every(op => inst.options?.[op] !== 'no')));
  let providers = fullSetup(handler, route, rel, inst.kind === "existing" ? inst : null, model.labware, useBuilds);
  let current = candidate(r, model, inst, handler, route, providers);
  if (!current) return out;
  // Modules no step used take no deck space: re-assess on what is kept (#144).
  if (current.providers.length < providers.length) current = candidate(r, model, inst, handler, route, current.providers) || current;
  providers = current.providers;
  out.push(current);
  for (;;) {
    // The workcell arm stays: dropping it would leave a workcell no vessel can reach (#283).
    const removable = providers.filter(p => p.via !== 'native' && !isWorkcellArm(p));
    if (!removable.length) break;
    let best = null;
    const score = frontierScore;
    // Each provider can go on its own; a module serving several operations can
    // also go as a whole, which is what frees its deck slot (#131).
    const groups = [...removable.map(p => [p]), ...[...new Set(removable.filter(p => p.module).map(p => p.module))].map(m => removable.filter(p => p.module === m)).filter(g => g.length > 1)];
    for (const g of groups) {
      const c = candidate(r, model, inst, handler, route, withWorkcellArm(route, providers.filter(x => !g.includes(x))));
      if (c && (!best || score(c) < score(best))) best = c;
    }
    if (!best) break;
    out.push(best);
    providers = best.providers;
  }
  return out;
}

// The sources say this deck cannot hold the workflow's tubes.
const deckRefuses = (handler, lw) => lw?.format === 'tube' && labwareFit(handler.id, 'deck', lw.id).status === 'no';

// Dispensers worth pairing with a setup (#173): catalogued devices that could
// take at least one shared reagent of this workflow (liquid, volume, labware).
// Devices that take no step are never paired.
export function dispensersForModel(model) {
  if (model.labware && labwareFit('dispensing', 'dispensing', model.labware.id).status === 'no') return [];
  const shared = model.chunks.flatMap(c => c.actions).filter(a => a.contact === 'free' && a.kind === 'liquid-transfer');
  return DISPENSERS.filter(d => shared.some(a => dispenseOk(d.dispense, a, (a.materials || []).some(m => settlesClass(m.class)))));
}
// Handler + one dispenser (#173): the best setup of each frontier with each
// dispenser beside it, on the bench (a person
// carries the plate) or, on a workcell, reached by the arm. Kept only when a
// step used the dispenser; ranked like every other setup.
function withDispensers(r, model, inst, handler, route, front, pool, seen) {
  if (!front.length || !pool.length) return [];
  // The member the labour ranking would put first, so the pair and the setup
  // without a dispenser differ only by the dispenser.
  const base = front.slice().sort((a, b) => cmp(sortKey(a, 'labour'), sortKey(b, 'labour')))[0];
  const onHandler = base.providers.filter(p => !(p.op === 'dispensing' && p.device));
  // A deck-only and a connected setup with the same providers get one pairing.
  const sig = `${inst.id}|${route === 'workcell' ? 'workcell' : 'bench'}|${onHandler.map(p => `${p.via}:${p.op}:${p.module || ''}`).sort().join('+')}`;
  if (seen.has(sig)) return [];
  seen.add(sig);
  const via = route === 'workcell' ? 'workcell' : 'bench';
  const out = [];
  for (const d of pool) {
    const c = candidate(r, model, inst, handler, route, [...onHandler, {op: 'dispensing', via, device: d.id}], base.pipettes?.chosen.id || null);
    if (c && c.providers.some(p => p.device === d.id)) {
      if (r.objective === TIP_RUNTIME) c.dispenserBaseId = base.id;
      out.push(c);
    }
  }
  return out;
}

function sharedAddition(a) {
  return a.kind === 'liquid-transfer' && a.contact === 'free';
}

function hasMatchedDispenseTime(device, action, wells) {
  const points = device.throughput?.points.filter(p => p.wells === wells && Number.isFinite(p.ul)) || [];
  const volume = mostUl(action);
  return points.length > 0 && volume != null &&
    volume >= Math.min(...points.map(p => p.ul)) && volume <= Math.max(...points.map(p => p.ul));
}

function assignBenchDispenser(provider, a, model) {
  const device = dispenserById.get(provider.device), range = device.dispense;
  const otherwise = reason => ({auto: false, reason});
  if (!sharedAddition(a) || a.removeFirst || a.partsUl || transferLayout(a) || a.conditions?.onMagnet === true) {
    return otherwise('This bench device only takes a simple, non-contact addition to a complete plate.');
  }
  if (coldReagent(model, a) || landsOn(a).length ||
      (a.materials || []).some(m => settlesClass(m.class) || materialsData.classes[m.class]?.properties?.viscous)) {
    return otherwise('The stated liquid or receiving well requires compatibility evidence for this device.');
  }
  if (!(leastUl(a) > 0 && range.minUl > 0 && range.maxUl >= range.minUl) || !dispenseOk(range, a, false)) {
    return otherwise('The addition needs a stated volume within the recorded dispenser range.');
  }
  const timing = dispenseTime(device, mostUl(a), model.unitSize);
  if (timing.kind !== 'sourced' || !timing.source || !hasMatchedDispenseTime(device, a, model.unitSize)) {
    return otherwise('No bounded manufacturer cycle time matches this addition.');
  }
  const facts = (a.constraints || []).map(c => `constraint:${c}`);
  return {auto: true, provider, facts, also: null, dispensed: true, devices: [device]};
}

const actionUsesTips = a => OPS[a.kind]?.consumesTips || ['contact', 'free', 'mix', 'removal', 'wash', 'removal+add', 'sample-move', 'batch'].includes(a.contact);
const validRange = x => x && Number.isFinite(x.lo) && Number.isFinite(x.hi) && x.lo >= 0 && x.hi >= x.lo;

function tipRuntimeMetrics(sim, model) {
  const actions = new Map(model.chunks.flatMap(c => c.actions.map(a => [a.id, a])));
  const performed = sim.timeline.filter(s => !s.overhead && s.type !== 'W');
  const tipsKnown = performed.every(s => {
    const action = actions.get(s.actionId);
    return !action || !actionUsesTips(action) || s.dispensed || (s.type === 'A' && s.tips);
  });
  const elapsedKnown = !sim.metrics.missingWaits && validRange(sim.metrics.elapsed) &&
    performed.every(s => !s.dispenseTime || s.dispenseTime.kind === 'sourced');
  const additions = performed.filter(s => {
    const a = actions.get(s.actionId);
    return a && (sharedAddition(a) || a.contact === 'wash' || a.wash?.part === 'add');
  });
  const spread = additions.length && elapsedKnown ? Math.max(...additions.map(s =>
    s.dispenseTime ? s.dispenseTime.secondsPerPlate.hi / 60 : s.minutes.hi)) : null;
  const recordedReagent = new Map(sim.reagents.map(a => [a.actionId, a.extraUl]));
  const reagent = additions.length && !sim.metrics.reagents.deadUnknown &&
    additions.every(s => validRange(recordedReagent.get(s.actionId)))
    ? sim.metrics.reagents.extraUl : null;
  return {tips: tipsKnown ? sim.metrics.tips?.total || zero() : null,
    elapsed: elapsedKnown ? sim.metrics.elapsed : null, addition_spread_upper_min: spread,
    reagent_extra_uL: reagent, unresolved: Boolean(model.review.length)};
}

function tipRuntimeRefusal(c) {
  if (impossibleCount(c) || c.physicalIssues.some(i => ['volume-unstated', 'remove-unknown', 'mix-unknown'].includes(i.kind)))
    return 'Unassessed for this objective: unresolved physical check.';
  if (c.tipRuntime?.unresolved) return 'Unassessed for this objective: unresolved protocol readings.';
  if (!validRange(c.tipRuntime?.tips)) return 'Unassessed for this objective: incomplete tip count, including work by hand.';
  if (!validRange(c.tipRuntime?.elapsed)) return 'Unassessed for this objective: incomplete elapsed bounds.';
  if (c.installation.kind === 'existing' && c.facts.some(f => ['access', 'device'].includes(f.type) && f.status !== 'yes'))
    return 'Unassessed for this objective: installation or separate device access is unconfirmed.';
  if (c.facts.some(f => f.status !== 'yes' &&
    (['labware', 'feature', 'workcell', 'integration'].includes(f.type) ||
      f.id.includes(':dispense-') || f.id.includes(':constraint:') || f.id.endsWith(':pipette-liquid-class')))) {
    return 'Unassessed for this objective: a required compatibility or constraint answer is missing.';
  }
  return null;
}

function tipRuntimeBounds(t) {
  return [t.tips.hi, t.elapsed.hi, t.tips.lo, t.elapsed.lo, t.addition_spread_upper_min ?? Infinity,
    t.reagent_extra_uL?.hi ?? Infinity, t.reagent_extra_uL?.lo ?? Infinity];
}
function tipRuntimeKey(c) {
  return [...tipRuntimeBounds(c.tipRuntime), mid(c.metrics.active), mid(c.metrics.visits), unconfirmed(c).length, c.id];
}

const completePlates = (model, workload) => model.format === 'plate' && model.labware && !model.labware.assumed &&
  Number.isInteger(model.unitSize) && model.unitSize > 0 && workload % model.unitSize === 0;

function benchRoutes(r, model, installations) {
  const installed = installations.flatMap(inst => {
    const provider = benchProviders.find(d => d.id === inst.modelId);
    return provider ? [{inst, provider}] : [];
  });
  const proposed = r.scope === 'design' ? benchProviders.map(provider => ({
    inst: {id: `purchase-${provider.id}`, name: provider.name, owner: provider.vendor || 'Facility operator', kind: 'purchase'}, provider,
  })) : [];
  const candidates = [];
  const rows = [...installed, ...proposed].map(({inst, provider}) => {
    const row = {id: inst.id + ':standalone', name: inst.name, kind: provider.kind, model_id: provider.id, source: provider.source, fact: null, candidate: null};
    const out = reason => ({...row, reason});
    if (provider.missing) return out(provider.missing);
    if (!completePlates(model, r.workload))
      return out('This model needs explicitly chosen labware and complete plates.');
    const device = dispenserById.get(provider.id);
    const setup = {installation: inst, handler: null, route: 'standalone', standalone: device,
      providers: [{op: 'dispensing', via: 'bench', device: device.id}], reportMechanisms: true};
    if (!model.chunks.some(c => c.actions.some(a => assignBenchDispenser(setup.providers[0], a, model).auto)))
      return out('No compatible shared addition with bounded cycle evidence.');
    const access = {id: inst.id + ':access', type: 'access', owner: inst.owner,
      question: `Can you use ${inst.name} for this batch?`};
    access.status = r.facts[access.id] || inst.access || (inst.kind === 'purchase' ? 'purchase' : 'unknown');
    const fit = {id: `${inst.id}:labware:${model.labware.id}:standalone`, type: 'labware', owner: inst.owner,
      question: `Does this configuration of ${inst.name} fit the exact plate and dispensing cassette?`,
      source: provider.source ? {url: provider.source, title: inst.name} : null};
    fit.status = r.facts[fit.id] || 'unknown';
    if (fit.status !== 'yes') return {...row, fact: fit, reason: 'Exact plate and cassette compatibility needs confirmation.'};
    const sim = assessedSimulation(model, r.workload, setup, false, r.protocolBlocks);
    if (!sim.metrics.automatedInstances) return out('The physical check leaves every addition by hand.');
    const physical = physicalFacts(inst, {id: device.id}, sim.physical, r, sim.protocolBlocks);
    const constraints = [...sim.used].filter(f => f.startsWith('constraint:')).map(key => {
      const id = `${inst.id}:${key}`;
      return {id, type: 'method', status: r.facts[id] || 'unknown', owner: inst.owner,
        question: `Can ${inst.name} meet the stated handling constraint “${key.slice(11)}”?`};
    });
    const tipRuntime = tipRuntimeMetrics(sim, model);
    const tips = tipRuntime.tips ? {total: tipRuntime.tips, bySize: {}, lowRetention: zero(),
      lowRetentionPreferred: zero(), events: 0, refills: 0, reloads: 0, rackSwaps: 0, racks: {}} : null;
    const candidate = {...setup, id: row.id, config: {id: device.id, name: device.name}, name: inst.name,
      setupLabel: 'Dispenser alone, plate carried by hand', workcell: false, pipettes: null, deck: null,
      layout: null, channels: null, features: null, timeline: sim.timeline, metrics: {...sim.metrics, tips}, tipRuntime,
      facts: [access, fit, ...constraints, ...scaleFacts(inst, model, r), ...physical.facts,
        ...r.needs.map(key => ({id: `${inst.id}:feature:${key}`, type: 'feature', status: 'unknown',
          owner: inst.owner, question: `Is ${featuresData.features[key].label} available on this configuration?`}))],
      physicalIssues: physical.issues, physical: sim.physical, reagents: sim.reagents,
      bom: billOfMaterials(sim, r.workload), reloads: 0,
      cost: {...costBasis(setup), tipsPerRun: tips ? {...zero(), tips: tips.total, lowRetentionUnpriced: false} : null,
        reagents: reagentCost(sim.reagents, r.reagentPrices, r.workload)}};
    candidates.push(candidate);
    return {...row, candidate, reason: null};
  });
  return {candidates, rows};
}

function mechanismsFor(recommended, ranked, model) {
  const steps = new Map(ranked.map(c => {
    const actions = new Map(), handoffs = new Map();
    for (const s of c.timeline) {
      if (s.move) handoffs.set(s.actionId, add(handoffs.get(s.actionId) || zero(), s.minutes));
      if (!s.overhead && s.type !== 'W') actions.set(s.actionId, s);
    }
    return [c, {actions, handoffs, reagents: new Map(c.reagents.map(r => [r.actionId, r]))}];
  }));
  const mechanism = (c, id) => {
    const data = steps.get(c), s = data?.actions.get(id);
    if (!s) return null;
    const name = s.type === 'H' ? 'By hand' : s.tiplessAddition ? 'Tip-free addition, tipped remainder'
      : s.dispensed ? 'Tip-free dispense' : s.tips ? 'Pipette with tips' : 'Device operation';
    return {configuration_id: c.id, mechanism: name, tip_free_addition: Boolean(s.dispensed || s.tiplessAddition),
      tips: s.dispensed ? zero() : s.tips ? {lo: s.tips.lo, hi: s.tips.hi} : null,
      action_minutes: validRange(s.minutes) ? add(s.minutes, data.handoffs.get(id) || zero()) : null,
      reagent_extra_uL: data.reagents.get(id)?.extraUl ?? null,
      timing_sources: (s.dispenseTime?.sources || []).map(ref => ref.url).filter(Boolean),
      addition_spread_upper_min: s.dispenseTime ? s.dispenseTime.secondsPerPlate.hi / 60 : s.minutes?.hi ?? null};
  };
  return model.chunks.flatMap(c => c.actions)
    .filter(a => sharedAddition(a) || a.contact === 'wash' || a.wash?.part === 'add' || a.wash?.part === 'remove')
    .map(a => {
      const chosen = mechanism(recommended, a.id);
      let alternative = null;
      if (chosen) for (const candidate of ranked) {
        if (candidate === recommended) continue;
        const next = mechanism(candidate, a.id);
        if (next && next.tip_free_addition !== chosen.tip_free_addition) { alternative = next; break; }
      }
      return {action_id: a.id, label: a.label, chosen, alternative};
    });
}

function buildCandidates(r, model, installations, onlyHandlers = null) {
  const rel = relevantOps(model);
  const out = new Map();
  const pool = dispensersForModel(model), seen = new Set();
  const targets = [
    ...installations.map(inst => ({inst, handler: handlers.find(h => h.id === inst.modelId)})).filter(t => t.handler),
    ...(r.scope === 'design' ? handlers.map(h => ({inst: {id: `purchase-${h.id}`, name: `${h.name} (purchase)`, modelId: h.id, owner: `${h.vendor || 'Vendor'} / automation operator`, kind: 'purchase'}, handler: h})) : []),
  ];
  for (const {inst, handler} of targets) {
    if (onlyHandlers && !onlyHandlers.has(handler.id)) continue;
    if (installationEquipmentProblem(handler, inst) || deckRefuses(handler, model.labware)) continue;
    for (const route of ['deck', 'connected', 'workcell']) {
      if (route === 'workcell' && (inst.installedHeads !== undefined || r.scope !== 'design' || !workcellOptions.length)) continue;
      const front = frontier(r, model, inst, handler, route, rel);
      for (const c of [...front, ...withDispensers(r, model, inst, handler, route, front, pool, seen)]) if (!out.has(c.id)) out.set(c.id, c);
    }
  }
  return [...out.values()];
}

// A route needs enough equipment data to model tips, reloads and deck space.
function missingEquipmentData(handler, pipetteId = null) {
  const record = pipettesData.handlers[handler.id];
  const missing = [];
  if (!record?.configurations?.length) missing.push('pipette configuration');
  if (!Number.isFinite(decksData.handlers[handler.id]?.positions)) missing.push('deck capacity');
  if (missing.length) return `Not assessed: missing ${missing.join(' and ')}.`;
  const configs = record.configurations.filter(c => !pipetteId || c.id === pipetteId);
  const heads = Array.isArray(record.heads) ? record.heads : [];
  const known = configs.some(c => c.heads.some(id => hasHeadRange(heads.find(h => h.id === id))));
  return known ? null : 'Not assessed: pipette head range is unverified.';
}

function installationEquipmentProblem(handler, inst) {
  const record = inst?.installedHeads;
  if (record === undefined) return missingEquipmentData(handler);
  if (!validateInstalledHeads(handler, record)) return 'Not assessed: the installed head record is invalid for this model.';
  if (!record.heads.length) return `Not assessed: fitted head evidence is ${record.status}.`;
  if (!Number.isFinite(decksData.handlers[handler.id]?.positions)) return 'Not assessed: missing deck capacity.';
  const configs = installationPipetteConfigs(handler, inst);
  return configs.some(c => c.heads.some(hasHeadRange)) ? null : 'Not assessed: the fitted head range is unverified.';
}

export function inScope(c, scope, objective) {
  const missing = c.standalone ? null : installationEquipmentProblem(c.handler, c.installation);
  if (missing) return {ok: false, why: missing};
  if (c.deck && !c.deck.fits && c.deck.placement && !c.deck.placement.ok) return {ok: false, why: `Does not fit on the deck: ${c.deck.placement.why}`};
  if (c.deck && !c.deck.fits && c.deck.layoutWhy) return {ok: false, why: `Does not fit on the deck: ${c.deck.layoutWhy}`};
  if (c.deck && !c.deck.fits) return {ok: false, why: `Does not fit on the deck: ${c.deck.used} of ${c.deck.positions} positions are taken before tips, leaving ${Math.max(c.deck.free, 0)} for ${c.deck.tipKinds} tip size${c.deck.tipKinds === 1 ? '' : 's'}.`};
  if (objective === TIP_RUNTIME) {
    const issue = tipRuntimeRefusal(c);
    if (issue) return {ok: false, why: issue};
  }
  if (scope === 'accessible' && impossibleCount(c)) {
    const ledger = c.physicalIssues?.find(issue => issue.severity === 'impossible');
    if (ledger) return {ok: false, why: `Physical check blocks this route: ${physicalKinds[ledger.kind] || ledger.detail}.`};
    const setup = c.facts.find(fact => fact.type === 'physical' && fact.severity === 'impossible' && !verified(fact.status));
    return {ok: false, why: setup.question};
  }
  if (c.savesNothing && objective !== TIP_RUNTIME) return {ok: false, why: 'Saves no hands-on time at this batch size: instrument setup, cleanup and plate moves outweigh the steps it takes over.'};
  if (c.facts.some(f => f.status === 'no')) return {ok: false, why: 'A required fact was answered “no”.'};
  if (scope === 'accessible') {
    if (c.installation.kind !== 'existing') return {ok: false, why: 'Purchase, not an installation we can use.'};
    const open = c.facts.filter(f => !verified(f.status));
    if (open.length) return {ok: false, why: `${open.length} fact${open.length > 1 ? 's' : ''} not confirmed.`};
    return {ok: true};
  }
  if (scope === 'upgrade') {
    if (c.installation.kind !== 'existing') return {ok: false, why: 'Purchase, outside this scope.'};
    if (c.workcell) return {ok: false, why: 'Needs a new workcell, outside this scope.'};
  }
  return {ok: true};
}

const unconfirmed = c => c.facts.filter(f => !verified(f.status));

// Parts you could build (#78): for each instrument in this scope that has
// open-source builds, the best setup using them, against the best without.
// Shown only while builds are left out of the ranking.
function buildOpportunities(r, model, installations, all, baseline) {
  const scope = r.scope === 'accessible' ? 'upgrade' : r.scope;
  const withBuilds = buildCandidates({...r, builds: true, baselineActive: mid(baseline.active)}, model, installations, new Set(builds.map(b => b.handler)))
    .filter(c => c.providers.some(p => p.build) && inScope(c, scope).ok);
  const out = [];
  for (const id of new Set(withBuilds.map(c => c.installation.id))) {
    const best = rank(withBuilds.filter(c => c.installation.id === id), 'labour', baseline)[0];
    const without = rank(all.filter(c => c.installation.id === id && inScope(c, scope).ok), 'labour', baseline)[0] || null;
    const from = without ? without.metrics : baseline;
    const saving = {lo: from.active.lo - best.metrics.active.lo, hi: from.active.hi - best.metrics.active.hi};
    if (mid(saving) < 5) continue;
    // An upgrade improves a module rather than filling a gap, so it is not the reason to build.
    const used = [...new Set(best.providers.filter(p => p.build).map(p => p.build))].map(b => buildById.get(b)).filter(b => !b.upgrades);
    if (!used.length) continue;
    out.push({installation: best.installation, candidate: best, without, builds: used, saving, visits: {from: from.visits, to: best.metrics.visits}, toConfirm: unconfirmed(best)});
  }
  return out.sort((a, b) => mid(b.saving) - mid(a.saving));
}
const size = c => c.providers.filter(p => p.via !== 'native').length + (c.workcell ? 2 : 0);
// Method changes weighted by how far they depart from the protocol (default 1).
const subWeight = id => substitutionsData.substitutions.find(x => x.id === id)?.weight || 1;
const methodChanges = c => c.facts.filter(f => f.type === 'method' && /:method:/.test(f.id)).reduce((n, f) => n + subWeight(f.id.split(':method:')[1]), 0);
function sortKey(c, objective) {
  const base = [Math.round(mid(c.metrics.active)), mid(c.metrics.visits)];
  // At equal time, fewer method changes to validate win before fewer modules.
  // At equal time: fewer method changes, fewer open questions, fewer tip racks, fewer modules.
  const tail = [methodChanges(c), unconfirmed(c).length, c.metrics.tips ? Math.round(mid(c.metrics.tips.total) / 96) : 0, size(c), c.id];
  // Cost ranks complete prices first, then by the low end of the new-price range.
  // Cost ranks setups whose instrument is priced first, then by how many
  // items are unpriced, then by the low end of the new-price range.
  const price = [c.cost.instrumentPriced ? 0 : 1, c.cost.missing.length, c.cost.new ? Math.round(c.cost.new.lo) : Infinity];
  // A plan the containers cannot carry out ranks below every plan they can (#121).
  const imp = impossibleCount(c);
  if (objective === 'walkaway') return [imp, -Math.round(c.metrics.longestWalkAway.lo), ...base, ...tail];
  return [imp, ...(objective === 'visits' ? [base[1], base[0], ...tail] : objective === 'simplest' ? [tail[1], tail[3], ...base, tail[0], tail[2], tail[4]] : objective === 'cost' ? [...price, ...base, ...tail] : [...base, ...tail])];
}
const cmp = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; };

// Exported for tests of the ranking rules (#124).
export const rankCandidates = (cands, objective, baseline) => rank(cands, objective, baseline);
function rank(cands, objective, baseline) {
  if (objective === TIP_RUNTIME) {
    return cands.filter(c => !tipRuntimeRefusal(c)).sort((a, b) => cmp(tipRuntimeKey(a), tipRuntimeKey(b)));
  }
  // A blocked route must not set the savings bar for a route that can run.
  // Keep the diagnostic comparison when every candidate is blocked.
  const feasible = cands.filter(c => !impossibleCount(c));
  let pool = feasible.length ? feasible : cands;
  if (['simplest', 'cost', 'walkaway'].includes(objective) && pool.length) {
    const best = Math.min(...pool.map(c => mid(c.metrics.active)));
    const target = mid(baseline.active) - 0.8 * (mid(baseline.active) - best);
    pool = pool.filter(c => mid(c.metrics.active) <= target + 1e-9);
  }
  const sorted = pool.slice().sort((a, b) => cmp(sortKey(a, objective), sortKey(b, objective)));
  if (!sorted.length || ['simplest', 'cost', 'walkaway'].includes(objective)) return sorted;
  const tied = sorted.filter(c => isTie(sorted[0], c, baseline));
  const lead = tied.slice().sort((a, b) => cmp([impossibleCount(a), methodChanges(a), unconfirmed(a).length, size(a), ...sortKey(a, objective)], [impossibleCount(b), methodChanges(b), unconfirmed(b).length, size(b), ...sortKey(b, objective)]))[0];
  return [lead, ...sorted.filter(c => c !== lead)];
}

function isTie(a, b, baseline) {
  if (!a || !b) return false;
  const tol = Math.max(10, 0.03 * mid(baseline.active));
  return Math.abs(mid(a.metrics.active) - mid(b.metrics.active)) < tol && Math.abs(mid(a.metrics.visits) - mid(b.metrics.visits)) < 1;
}

function automatedSet(c) { return new Map(c.timeline.filter(s => s.type === 'A' && !s.move && !s.rackSwap).map(s => [s.actionId, s])); }

export function explainDifference(a, b) {
  const A = automatedSet(a), B = automatedSet(b);
  const onlyA = [...A.values()].filter(s => !B.has(s.actionId));
  const onlyB = [...B.values()].filter(s => !A.has(s.actionId));
  const sum = list => list.reduce((t, s) => add(t, s.personIfManual), zero());
  return {
    onlyA, onlyB, onlyAMinutes: sum(onlyA), onlyBMinutes: sum(onlyB),
    activeDelta: {lo: b.metrics.active.lo - a.metrics.active.lo, hi: b.metrics.active.hi - a.metrics.active.hi},
    visitDelta: {lo: b.metrics.visits.lo - a.metrics.visits.lo, hi: b.metrics.visits.hi - a.metrics.visits.hi},
    factDelta: unconfirmed(b).length - unconfirmed(a).length,
  };
}

// ---------------------------------------------------------------- break-even (#94)
// Per run against today's practice, at the person's labour rate: labour saved,
// tips, and the change in reagent cost; then the runs that pay back the priced
// purchase. Ranges stay ranges; anything unpriced is listed, never estimated.
const span = (a, b) => ({lo: Math.min(a, b), hi: Math.max(a, b)});
export function breakEven(c, baseline, baseReagents, r) {
  if (r.labourRate == null || !c) return null;
  const rate = r.labourRate / 60;
  // Refilling reservoirs and emptying the waste during the run is hands-on time (#122): already in
  // the active minutes on a solved deck layout (#140), taken off the labour saved otherwise.
  const refill = c.metrics.refill?.minutes || zero(), extra = c.metrics.refill?.ranked ? zero() : refill;
  const labour = span((baseline.active.lo - c.metrics.active.lo - extra.hi) * rate, (baseline.active.hi - c.metrics.active.hi - extra.lo) * rate);
  const unpriced = [];
  const tips = c.cost.tipsPerRun || (c.metrics.tips ? (unpriced.push('tips'), null) : zero());
  const reagents = c.cost.reagents && baseReagents ? span(c.cost.reagents.perRun.lo - baseReagents.perRun.lo, c.cost.reagents.perRun.hi - baseReagents.perRun.hi) : (unpriced.push('reagents (give prices to include them)'), zero());
  const t = tips || zero();
  const net = {lo: labour.lo - t.hi - reagents.hi, hi: labour.hi - t.lo - reagents.lo};
  const capital = c.installation.kind === 'existing' ? (c.cost.new || zero()) : c.cost.new;
  if (!c.cost.complete) unpriced.push(...c.cost.missing);
  let runs = null, never = false;
  if (capital && net.hi <= 0) never = true;
  else if (capital && capital.hi === 0) runs = {lo: 0, hi: 0};
  else if (capital) runs = {lo: Math.ceil(capital.lo / net.hi), hi: net.lo > 0 ? Math.ceil(capital.hi / net.lo) : null};
  const annual = c.cost.annual ? {lo: net.hi > 0 ? Math.ceil(c.cost.annual.lo / net.hi) : null, hi: net.lo > 0 ? Math.ceil(c.cost.annual.hi / net.lo) : null} : null;
  return {currency: 'GBP', rate: r.labourRate, labour, refillMinutes: refill, tips, reagents, net, capital, runs, never, annualRuns: annual, unpriced: [...new Set(unpriced)],
    note: `Per run of ${r.workload} at £${r.labourRate}/h of hands-on time. Purchase price covers priced items only${unpriced.length ? `; unpriced: ${[...new Set(unpriced)].join(', ')}` : ''}.`};
}

// ---------------------------------------------------------------- buy, borrow or core facility (#138)
// The best purchase beside each instrument the person can access, marked as
// their own, borrowed from another group, or a core facility. Charges (per run
// or per hour of the run) and travel and hand-over minutes are the person's
// own figures on the installation; what is not given is named, never assumed.
// Per run: charges, tips, the change in reagent cost against today and, at a
// labour rate, the hands-on time (plus travel). Capital is the priced purchase
// (for an installation, the options it would still need). Buying overtakes
// another route after (capital difference) / (running cost difference) runs.
export const arrangements = {own: 'Our own instrument', borrow: "Another group's instrument", core: 'Core facility'};
const num = v => Number.isFinite(v) && v >= 0 ? v : null;
export function accessComparison(r, baseline, all, baseReagents) {
  const rate = r.labourRate != null ? r.labourRate / 60 : null;
  const sumR = list => list.reduce((t, x) => add(t, x), zero());
  const row = (kind, c, inst = null) => {
    const unknown = [];
    const travel = inst ? num(inst.travelMinutes) : 0;
    if (inst && travel == null && kind !== 'own') unknown.push('travel and hand-over time');
    const active = add(c.metrics.active, {lo: travel || 0, hi: travel || 0});
    const parts = {};
    if (c.metrics.tips) { if (c.cost.tipsPerRun) parts.tips = {lo: c.cost.tipsPerRun.lo, hi: c.cost.tipsPerRun.hi}; else unknown.push('tips'); }
    if (c.cost.reagents && baseReagents) parts.reagents = span(c.cost.reagents.perRun.lo - baseReagents.perRun.lo, c.cost.reagents.perRun.hi - baseReagents.perRun.hi);
    else unknown.push('reagent change (give reagent prices)');
    if (inst) {
      const perRun = num(inst.chargePerRun), perHour = num(inst.chargePerHour);
      if (perRun != null || perHour != null) parts.charges = add({lo: perRun || 0, hi: perRun || 0}, perHour != null ? {lo: perHour * c.metrics.elapsed.lo / 60, hi: perHour * c.metrics.elapsed.hi / 60} : zero());
      else if (kind !== 'own') unknown.push('charges');
    }
    if (rate != null) parts.labour = {lo: active.lo * rate, hi: active.hi * rate};
    else unknown.push('labour (give a labour rate)');
    // An instrument someone else runs is used as it is: modules it may lack are
    // questions for its owner (toConfirm), not purchases.
    const capital = inst ? zero() : c.cost.new || (c.cost.complete ? zero() : null);
    if (!inst && !c.cost.complete) unknown.push(...c.cost.missing.map(m => `${m} (unpriced)`));
    const toConfirm = inst ? unconfirmed(c).map(f => f.question) : [];
    const perRun = sumR(Object.values(parts));
    return {kind, label: kind === 'buy' ? 'Buy' : arrangements[kind], installation: inst ? {id: inst.id, name: inst.name, owner: inst.owner} : null, candidate: {id: c.id, name: c.config.name, setup: c.setupLabel, route: c.route},
      active, elapsed: c.metrics.elapsed, onInstrument: c.metrics.active, saved: {lo: baseline.active.lo - active.lo, hi: baseline.active.hi - active.hi}, travelMinutes: travel, capital, capitalComplete: inst ? true : c.cost.complete, toConfirm, perRun, parts, unknown: [...new Set(unknown)],
      perYear: r.runsPerYear != null ? times(perRun, r.runsPerYear) : null};
  };
  const rows = [];
  // The best purchase for the objective, and the lowest-priced one giving most of the benefit.
  const purchases = all.filter(c => c.installation.kind === 'purchase' && inScope(c, 'design', r.objective).ok);
  const buy = rank(purchases, r.objective, baseline)[0];
  const cheap = r.objective === TIP_RUNTIME ? null : rank(purchases, 'cost', baseline)[0];
  if (buy) rows.push(row('buy', buy));
  if (cheap && cheap !== buy) rows.push({...row('buy', cheap), label: 'Buy (lowest priced for most of the benefit)'});
  const insts = [...new Map(all.filter(c => c.installation.kind === 'existing').map(c => [c.installation.id, c.installation])).values()];
  for (const inst of insts) {
    const best = rank(all.filter(c => c.installation.id === inst.id && inScope(c, 'upgrade', r.objective).ok), r.objective, baseline)[0];
    if (best) rows.push(row(arrangements[inst.arrangement] ? inst.arrangement : 'borrow', best, inst));
  }
  // Runs after which buying costs less than each other route (midpoints).
  for (const x of rows.filter(x => x.kind !== 'buy' && x.capital)) x.buyOvertakes = rows.filter(b => b.kind === 'buy' && b.capital).map(b => {
    const dCap = mid(b.capital) - mid(x.capital), dRun = mid(x.perRun) - mid(b.perRun);
    return {against: b.label, handler: b.candidate.name, ...(dCap <= 0 ? {runs: 0} : dRun > 0 ? {runs: Math.ceil(dCap / dRun)} : {never: true}), basis: 'midpoints of the priced capital and the known per-run costs'};
  });
  const today = {kind: 'today', label: 'By hand today', active: baseline.active, labour: rate != null ? {lo: baseline.active.lo * rate, hi: baseline.active.hi * rate} : null, reagents: baseReagents?.perRun || null};
  return {today, rows, runsPerYear: r.runsPerYear ?? null, note: 'Charges, travel and runs per year are your figures; prices sum recorded evidence only; hands-on minutes are planning estimates.'};
}

// ---------------------------------------------------------------- dispenser options (#85)
// What each catalogued dispenser would change if added to a setup: on the
// bench beside the handler (a person carries the plate and stays while it
// runs) or in its workcell (the arm does). Steps it takes, steps it refuses
// and why, dispense time (sourced or assumed, #173), tips saved, plate moves,
// hands-on change, dead volume, price and splash questions. The same setups
// are ranked as candidates (handler + one dispenser); this table compares
// every device on one chosen setup.
export function dispenserOptions(r, model, c) {
  if (!c?.handler) return [];
  const cfg = c.pipettes ? installationPipetteConfigs(c.handler, c.installation).find(x => x.id === c.pipettes.chosen.id) : null;
  const setupFor = providers => ({installation: c.installation, handler: c.handler, route: c.route, providers, capacity: withCapacity(c.handler, providers, deckNeeds(model, c.handler, providers, r.workload, cfg)), pipettes: cfg,
    reportMechanisms: r.objective === TIP_RUNTIME, completePlates: completePlates(model, r.workload)});
  // Compared with the setup without any off-deck dispenser.
  const onHandler = c.providers.filter(p => !(p.op === 'dispensing' && p.via !== 'native' && p.via !== 'module'));
  const blocks = physicalActionBlocks(simulate(model, r.workload).physical);
  const before = assessedSimulation(model, r.workload, setupFor(onHandler), r.methodChanges, blocks);
  const shared = model.chunks.flatMap(ch => ch.actions).filter(a => a.contact === 'free' && a.kind === 'liquid-transfer');
  const via = c.route === 'workcell' ? 'workcell' : 'bench';
  return DISPENSERS.map(d => {
    const providers = [...onHandler, {op: 'dispensing', via, device: d.id}];
    const after = assessedSimulation(model, r.workload, setupFor(providers), r.methodChanges, blocks);
    const took = after.timeline.filter(s => s.dispensed && s.devices?.includes(d.id));
    const refused = shared.filter(a => !took.some(s => s.actionId === a.id)).map(a => {
      const settles = (a.materials || []).some(m => settlesClass(m.class));
      const susp = (a.materials || []).map(m => m.class).filter(settlesClass);
      const blocked = after.protocolBlocks.get(a.id);
      const why = blocked ? `Physical check unresolved: ${blocked.detail}`
        : settles && !takesSuspension(d.dispense, susp) ? `${d.dispense.suspensions === false ? 'does not take' : 'no record of taking'} ${susp.map(c => materialsData.classes[c]?.label?.toLowerCase() || c).join(' and ')} suspensions`
        : leastUl(a) != null && d.dispense.minUl != null && leastUl(a) < d.dispense.minUl ? `${leastUl(a)} µl is below its ${d.dispense.minUl} µl minimum`
        : mostUl(a) != null && d.dispense.maxUl != null && mostUl(a) > d.dispense.maxUl ? `${mostUl(a)} µl is above its ${d.dispense.maxUl} µl maximum`
        : 'taken by another provider in this setup';
      return {actionId: a.id, label: a.label, why};
    });
    const mv = x => x.metrics.moves.person + x.metrics.moves.arm;
    return {
      device: {id: d.id, name: d.name, maker: d.maker, family: d.family, familyLabel: dispensersData.families[d.family]?.label || d.family, consumable: d.consumable || null, beside: d.beside || null, prime: d.dispense.primeUl || null, primeRecoverable: d.dispense.primeRecoverable ?? null, prices: d.prices || [], sources: d.sources},
      via, took: took.map(s => ({actionId: s.actionId, label: s.label, splash: s.splash || null, minutes: s.minutes, time: s.dispenseTime || null})), refused,
      // Machine minutes dispensing, and whether every figure behind them is sourced (#173).
      dispenseMinutes: took.reduce((t, s) => add(t, s.minutes), zero()), timeKind: !took.length ? null : took.every(s => s.dispenseTime?.kind === 'sourced') ? 'sourced' : 'assumed',
      throughput: d.throughput || null,
      elapsedDelta: {lo: after.metrics.elapsed.lo - before.metrics.elapsed.lo, hi: after.metrics.elapsed.hi - before.metrics.elapsed.hi},
      attended: after.metrics.attended,
      price: priceDevice(d),
      tipsSaved: before.tips && after.tips ? {lo: before.tips.total.lo - after.tips.total.lo, hi: before.tips.total.hi - after.tips.total.hi} : null,
      extraMoves: mv(after) - mv(before), activeDelta: {lo: after.metrics.active.lo - before.metrics.active.lo, hi: after.metrics.active.hi - before.metrics.active.hi},
      visitsDelta: after.metrics.visits.hi - before.metrics.visits.hi,
      deadVolumeDelta: {lo: after.metrics.reagents.deadUl.lo - before.metrics.reagents.deadUl.lo, hi: after.metrics.reagents.deadUl.hi - before.metrics.reagents.deadUl.hi},
      reagentCostDelta: (() => { const a = reagentCost(after.reagents, r.reagentPrices, r.workload), b = reagentCost(before.reagents, r.reagentPrices, r.workload); return a && b ? {lo: a.perRun.lo - b.perRun.lo, hi: a.perRun.hi - b.perRun.hi} : null; })(),
      splash: [...new Set(took.flatMap(s => s.splash || []))],
      splashLabels: [...new Set(took.flatMap(s => s.splash || []))].map(id => materialsData.classes[id]?.label?.toLowerCase() || id),
    };
  });
}

// ---------------------------------------------------------------- decide
// input: a request from createDecisionRequest; model: from buildWorkflowModel;
// installations: [{id, name, modelId, owner}] the user can access.
// Open-source and DIY routes (#76): leads for operations a setup leaves to a
// person or hands to a bought workcell device. Never counted as capability.
export const openHardware = {about: openHardwareData.about, maturity: openHardwareData.maturity, entries: openHardwareData.entries};
export function openRoutes(c) {
  if (!c) return [];
  const gaps = new Map();
  for (const s of c.timeline) if (s.type === 'H' && !s.overhead && s.kind && !gaps.has(s.kind)) gaps.set(s.kind, {how: 'person', count: 0, reason: s.reason || ''});
  for (const s of c.timeline) if (s.type === 'H' && !s.overhead && s.kind) gaps.get(s.kind).count += s.count || 1;
  const byHand = c.timeline.filter(s => s.type === 'H' && s.move).length;
  if (byHand && !gaps.has('vessel-transfer')) gaps.set('vessel-transfer', {how: 'person', count: byHand, reason: 'Plates are moved by hand between positions.'});
  for (const p of c.providers) if (p.via === 'workcell' && !gaps.has(p.op)) gaps.set(p.op, {how: 'workcell', count: 0, reason: ''});
  const fits = e => e.platforms.includes('any') || e.platforms.includes(c.config.id);
  return [...gaps].map(([op, g]) => ({op, label: OPS[op]?.label || openHardwareData.operationLabels[op] || op.replace(/-/g, ' '), ...g, routes: openHardware.entries.filter(e => e.operations.includes(op) && fits(e))}))
    .filter(g => g.routes.length);
}

// The ranked handler + dispenser setups on the compared instrument (#173),
// with their place in the overall ranking (null when out of scope) and the
// instrument's best setup without an off-deck dispenser.
function dispenserPairs(target, all, ranked, scope, objective) {
  if (!target?.handler) return null;
  const mine = all.filter(c => c.installation.id === target.installation.id);
  const pos = c => { const i = ranked.indexOf(c); return i < 0 ? null : i + 1; };
  const without = ranked.find(c => mine.includes(c) && !c.providers.some(p => p.device)) || null;
  const row = c => { const p = c.providers.find(x => x.device), d = p && dispenserById.get(p.device);
    const base = c.dispenserBaseId ? all.find(x => x.id === c.dispenserBaseId) : null;
    return {id: c.id, route: c.route, setup: c.setupLabel, device: d ? {id: d.id, name: d.name} : null, via: p?.via || null, rank: pos(c), why: inScope(c, scope, objective).why ?? null, active: c.metrics.active, visits: c.metrics.visits, elapsed: c.metrics.elapsed, tips: c.metrics.tips?.total || null, cost: c.cost.new, costComplete: c.cost.complete,
      questions: unconfirmed(c).filter(f => /dispense-/.test(f.id)).map(f => f.question),
      ...(base ? {pairedBase: {id: base.id, rank: pos(base), elapsed: base.tipRuntime.elapsed, tips: base.tipRuntime.tips},
        unresolved: unconfirmed(c).map(f => ({id: f.id, type: f.type, status: f.status, question: f.question}))} : {})}; };
  const pairs = mine.filter(c => c.providers.some(p => p.device)).sort((a, b) => (pos(a) ?? Infinity) - (pos(b) ?? Infinity) || mid(a.metrics.active) - mid(b.metrics.active));
  return {installation: target.installation.name, without: without ? row(without) : null, pairs: pairs.map(row), best: pairs.find(c => pos(c) != null) ? row(pairs.find(c => pos(c) != null)) : null, firstOverall: !!ranked[0]?.providers.some(p => p.device)};
}

export function decide(input, {model: asWritten, installations: given = [], budget} = {}) {
  const r = validateDecisionRequest(input, asWritten);
  // Workflow variants switched on (#171) change the protocol for every setup and for today's practice.
  const model = applyVariants(asWritten, r.variants);
  const variants = (asWritten.variants || []).map(v => ({...variantPlan(asWritten, v), active: r.variants.includes(v.id)}));
  const installations = given.filter(i => i && i.id && i.modelId).map(i => ({...i, name: i.name || i.id, owner: i.owner || 'Owner / operator', kind: 'existing'}));
  const bounded = m => budget ? {...m, evaluationBudget: budget} : m;
  const baseSim = simulate(bounded(model), r.workload, null);
  const baseline = baseSim.metrics;
  // Today's practice runs at full scale; miniaturised reactions apply to the setups.
  const runModel = scaleModel(model, r.reactionScale);
  const protocolPhysical = runModel === model ? baseSim.physical : simulate(bounded(runModel), r.workload, null).physical;
  const candidateRequest = {...r, protocolPhysical, protocolBlocks: physicalActionBlocks(protocolPhysical)};
  const all = buildCandidates({...candidateRequest, baselineActive: mid(baseline.active)}, bounded(runModel), installations);
  const bench = r.objective === TIP_RUNTIME ? benchRoutes(candidateRequest, bounded(runModel), installations) : null;
  if (bench) all.push(...bench.candidates);
  const baseReagentCost = reagentCost(baseSim.reagents, r.reagentPrices, r.workload);
  for (const c of all) c.breakEven = breakEven(c, baseline, baseReagentCost, r);
  // PyLabRobot preference (#82): 'prefer' ranks by backend status first
  // (keeping the objective's order within a status); 'only' leaves out
  // handlers PyLabRobot does not list.
  const scoped = all.filter(c => inScope(c, r.scope, r.objective).ok && (r.pylabrobot !== 'only' ||
    (bench ? !!c.handler?.pylabrobot && c.handler.pylabrobot.status !== 'none' : c.handler.pylabrobot?.status !== 'none')));
  const objectiveOrder = rank(scoped, r.objective, baseline);
  const ranked = r.pylabrobot === 'prefer' && !bench ? objectiveOrder.slice().sort((a, b) => plrRank(a) - plrRank(b)) : objectiveOrder;
  const recommended = ranked[0] || null;
  const alternative = recommended ? ranked.find(c => c.config.id !== recommended.config.id) || null : null;
  const tie = bench
    ? Boolean(alternative && cmp(tipRuntimeKey(recommended).slice(0, 7), tipRuntimeKey(alternative).slice(0, 7)) === 0)
    : isTie(recommended, alternative, baseline);

  const questions = !recommended ? [] : unconfirmed(recommended).map(f => {
    const without = rank(scoped.filter(c => !c.facts.some(x => x.id === f.id)), r.objective, baseline)[0] || null;
    const ifNo = without ? {candidate: without, activeDelta: {lo: without.metrics.active.lo - recommended.metrics.active.lo, hi: without.metrics.active.hi - recommended.metrics.active.hi}, visitDelta: {lo: without.metrics.visits.lo - recommended.metrics.visits.lo, hi: without.metrics.visits.hi - recommended.metrics.visits.hi}} : {candidate: null};
    return {fact: f, ifYes: recommended, ifNo, weight: without ? mid(without.metrics.active) - mid(recommended.metrics.active) : mid(baseline.active) - mid(recommended.metrics.active)};
  }).sort((a, b) => b.weight - a.weight || a.fact.id.localeCompare(b.fact.id));

  const unlocks = installations.map(inst => {
    const handler = handlers.find(h => h.id === inst.modelId);
    const missing = handler && installationEquipmentProblem(handler, inst);
    if (missing) return {installation: inst, candidate: null, toConfirm: [], reason: missing, tried: null};
    const best = rank(all.filter(c => c.installation.id === inst.id && inScope(c, 'upgrade', r.objective).ok), r.objective === TIP_RUNTIME ? TIP_RUNTIME : 'labour', baseline)[0];
    if (best) return {installation: inst, candidate: best, toConfirm: unconfirmed(best), saving: {lo: baseline.active.lo - best.metrics.active.lo, hi: baseline.active.hi - best.metrics.active.hi}};
    const tried = rank(all.filter(c => c.installation.id === inst.id && !c.workcell), 'labour', baseline)[0];
    const reason = r.facts[`${inst.id}:access`] === 'no' ? 'Access answered “no”.'
      : tried?.savesNothing ? `It can take over ${tried.metrics.automatedInstances} steps, but at this batch size instrument setup, cleanup and plate moves cost more than they save (${(mid(tried.metrics.active) / 60).toFixed(1)} h with it against ${(mid(baseline.active) / 60).toFixed(1)} h by hand). Try a larger batch.`
      : 'None of its confirmed or possible options can perform any step of this protocol.';
    return {installation: inst, candidate: null, toConfirm: [], reason, tried: tried || null};
  }).sort((a, b) => (a.candidate ? 0 : 1) - (b.candidate ? 0 : 1) || (b.saving ? mid(b.saving) : 0) - (a.saving ? mid(a.saving) : 0) || a.installation.id.localeCompare(b.installation.id));

  const families = handlers.map(h => {
    const own = all.filter(c => c.config.id === h.id);
    const inside = own.filter(c => inScope(c, r.scope, r.objective).ok);
    const best = rank(inside, r.objective, baseline)[0] || null;
    const reasons = [...new Set(own.map(c => inScope(c, r.scope, r.objective).why).filter(Boolean))];
    return {config: {id: h.id, name: h.name}, evaluated: own.length, inScope: inside.length, best, excludedBecause: inside.length ? null : missingEquipmentData(h) || (deckRefuses(h, model.labware) ? `Its deck cannot hold ${model.labware.label} (${labwareFit(h.id, 'deck', model.labware.id).source?.title || 'researched source'}).` : reasons[0] || (own.length ? 'Outside this scope.' : 'Not an installation we can use in this scope.'))};
  });

  const preferred = new Set(dispensersData.comparisonDefault?.handlers || []);
  const dispenserDefault = ranked.find(c => preferred.has(c.config.id)) || recommended;
  const dispenserTarget = all.find(c => c.handler && c.id === r.dispenserFor) || dispenserDefault;

  const seen = new Set();
  const shortlist = ranked.filter(c => { const k = `${c.config.id}:${c.route}`; if (seen.has(k)) return false; seen.add(k); return true; });

  return {
    variants,
    openRoutes: openRoutes(recommended),
    buildOpportunities: r.builds ? [] : buildOpportunities(candidateRequest, bounded(runModel), installations, all, baseline),
    request: r, model, modelVersion: versionOf(model), prices: priceSource, positions: {about: positionsData.about}, labware: model.labware || null, labwareWarnings: model.labwareWarnings || [], units: model.format === 'plate' ? Math.ceil(r.workload / model.unitSize) : r.workload,
    baseline, baselineTimeline: baseSim.timeline, baselineReagents: {list: baseSim.reagents, cost: baseReagentCost}, baselineBom: billOfMaterials(baseSim, r.workload),
    access: accessComparison(r, baseline, all, baseReagentCost),
    // The dispenser comparison runs on the setup the person picks; by default
    // the best in-scope setup on the handlers content/dispensers.json names
    // (comparisonDefault), else the recommendation (#173).
    dispenserTarget: dispenserTarget?.id || null,
    dispenserDefault: {id: dispenserDefault?.id || null, why: dispensersData.comparisonDefault?.why || null},
    dispenserOptions: dispenserOptions(r, bounded(runModel), dispenserTarget),
    dispenserPairs: dispenserPairs(dispenserTarget, all, ranked, r.scope, r.objective),
    recommended, alternative, tie, shortlist, questions, unlocks, families,
    ...(bench ? {
      benchRoutes: bench.rows.map(({candidate, ...row}) => ({...row,
        reason: row.reason || (ranked.includes(candidate) ? null
          : inScope(candidate, r.scope, r.objective).why || 'The current driver filter excludes this route.')})),
      mechanisms: mechanismsFor(recommended, ranked, bounded(runModel)),
    } : {}),
    physicalIssues: recommended?.physicalIssues || protocolIssues(protocolPhysical, r.facts),
    unassessed: families.filter(f => (r.scope === 'design' || installations.some(i => i.modelId === f.config.id))
      && f.excludedBecause?.startsWith('Not assessed:')).map(f => ({...f.config, reason: f.excludedBecause})),
    comparison: recommended && alternative ? explainDifference(recommended, alternative) : null,
    search: {evaluated: all.length, inScope: scoped.length, method: `Every catalogue liquid handler (${handlers.length}) with its on-deck modules, devices connected through its own software, and workcell-connected devices (${Object.keys(classes).length} device classes). For each, providers are removed one at a time, least useful first, to find the best setup at every size.${bench ? ' One standalone bench device per route is also considered.' : ''}`},
  };
}

// ---------------------------------------------------------------- portfolio (#89)
// Several workflows from several groups, each with a batch size and runs per
// year, assessed against a fixed list of candidate setups. A setup is data:
//   {id, name, handler: <catalogue id>, route: 'deck' | 'connected' | 'workcell',
//    pipettes?: <configuration id>, modules: [<module name>], devices: [<operation>]}
// Modules are the handler's on-deck options by name; devices are connected
// (documented integrations) or workcell devices by operation. Nothing is
// trimmed: each workflow uses what the setup has. Hours per year come only
// from the planning estimates and the stated runs per year; a workflow
// without runs per year is reported without hours, never given a default.
export const routes = {deck: 'On the deck only', connected: 'Deck plus devices its own software drives', workcell: 'Workcell (arm, scheduler and devices)'};

// What a person can choose for a setup on this handler and route.
// Which of a model's actions a catalogue setup has a provider for (#373).
// Capability only: no simulation, volumes, labware fit or deck room, so it
// can be reported for work whose totals are withheld.
export function setupReach(spec, model) {
  const have = new Set(setupProviders(spec, checkSetup(spec)).map(p => p.op));
  return model.chunks.flatMap(c => c.actions.map(a => ({chunkId: c.id, kind: a.kind, label: a.label, reachable: performers(a.kind).some(op => have.has(op))})));
}

export function setupOptions(handlerId, route = 'connected') {
  const h = handlers.find(x => x.id === handlerId);
  if (!h) throw Error(`Unknown liquid handler ${handlerId}`);
  const modules = new Map();
  for (const [op, v] of Object.entries(h.ops)) if (v.type === 'optional') { if (!modules.has(v.module)) modules.set(v.module, []); modules.get(v.module).push(op); }
  for (const a of h.alt || []) { if (!modules.has(a.module)) modules.set(a.module, []); modules.get(a.module).push(a.op); }
  const onDeck = new Set([...Object.entries(h.ops)].filter(([, v]) => v.type !== 'external').map(([op]) => op));
  const devices = route === 'deck' ? [] : Object.keys(classes).filter(op => route === 'workcell' ? true : h.ops[op]?.type === 'external')
    .map(op => ({op, label: OPS[op]?.label || op.replace(/-/g, ' '), examples: classes[op].examples || [], alsoOnDeck: onDeck.has(op)}));
  return {handler: {id: h.id, name: h.name}, route, modules: [...modules].map(([name, ops]) => ({name, ops})), devices, pipettes: (pipetteConfigs(h) || []).map(c => ({id: c.id, label: c.label}))};
}

function checkSetup(spec) {
  if (!spec || !spec.id) throw Error('Each setup needs an id');
  if (!routes[spec.route]) throw Error(`Setup ${spec.id}: unknown route ${spec.route}`);
  const handler = handlers.find(h => h.id === spec.handler);
  if (!handler) throw Error(`Setup ${spec.id}: unknown liquid handler ${spec.handler}`);
  const opts = setupOptions(handler.id, spec.route);
  const names = new Set(opts.modules.map(m => m.name)), ops = new Set(opts.devices.map(d => d.op));
  for (const m of spec.modules || []) if (!names.has(m)) throw Error(`Setup ${spec.id}: ${handler.name} has no module “${m}” (options: ${[...names].join('; ')})`);
  for (const d of spec.devices || []) if (!ops.has(d)) throw Error(`Setup ${spec.id}: ${spec.route === 'deck' ? 'a deck-only setup has no connected devices' : `${handler.name} has no documented integration for a ${d} device outside a workcell`}`);
  // Keep a saved choice visible when the entire catalogue record is missing.
  if (spec.pipettes && opts.pipettes.length && !opts.pipettes.some(p => p.id === spec.pipettes)) throw Error(`Setup ${spec.id}: unknown pipette configuration ${spec.pipettes}`);
  return handler;
}

// The setup's own providers: native operations, chosen modules and chosen devices.
function setupProviders(spec, handler) {
  const mods = new Set(spec.modules || []), devs = new Set(spec.devices || []);
  const out = [];
  for (const [op, v] of Object.entries(handler.ops)) {
    if (v.type === 'native') out.push({op, via: 'native', basis: v.basis});
    else if (v.type === 'optional' && mods.has(v.module)) out.push({op, via: 'module', module: v.module, basis: v.basis});
  }
  for (const a of handler.alt || []) if (mods.has(a.module)) out.push({op: a.op, via: 'module', module: a.module, basis: a.basis});
  const have = new Set(out.map(p => p.op));
  for (const op of devs) if (!have.has(op) || spec.route === 'workcell') out.push({op, via: spec.route === 'workcell' ? 'workcell' : 'external', class: classes[op]});
  if (spec.route === 'workcell' && !out.some(p => p.op === 'vessel-transfer')) out.push({op: 'vessel-transfer', via: 'workcell', class: {examples: workcellOptions.map(w => w.name)}});
  return out;
}

const keepFor = (all, rel, lw, handler) => all.filter(p => (rel.has(p.op) || p.op === 'vessel-transfer') && (!lw || p.op === 'liquid-transfer' || labwareFit(fitSubject(handler, p), p.op, lw.id).status !== 'no'));
const savingOf = (base, next) => { const a = base.lo - next.lo, b = base.hi - next.hi; return {lo: Math.min(a, b), hi: Math.max(a, b)}; };
const openFact = f => !verified(f.status) && f.status !== 'purchase';

// workflows: [{id, name, group, model, workload, runsPerYear}] where model is
// from buildWorkflowModel. options: {methodChanges, facts}.
export function portfolio(workflows, setups, {methodChanges = false, facts = {}, steps = false} = {}) {
  if (!Array.isArray(workflows) || !workflows.length) throw Error('Add at least one workflow');
  if (!Array.isArray(setups) || !setups.length) throw Error('Add at least one setup');
  const items = workflows.map(w => {
    if (!w.model) throw Error(`Workflow ${w.id || w.name}: no operation model`);
    const workload = w.workload ?? w.model.defaultWorkload;
    const runs = w.runsPerYear == null || w.runsPerYear === '' ? null : Number(w.runsPerYear);
    if (runs != null && !(Number.isFinite(runs) && runs >= 0 && runs <= 100000)) throw Error(`Workflow ${w.name}: runs per year must be a number from 0 to 100000`);
    const row = {id: w.id || w.model.protocolId, name: w.name || w.model.name || w.model.protocolId,
      group: (w.group || '').trim() || 'No group given', model: w.model, runsPerYear: runs};
    const blocked = protocolDecisionBlocker(w.model);
    if (blocked) {
      if (!Number.isInteger(workload) || workload < 1 || workload > 100000) throw Error('Workload must be a whole number from 1 to 100000');
      return {...row, blocked, r:{workload}, physicalIssues:[], baseline:null, manualSteps:null};
    }
    const r = validateDecisionRequest({...createDecisionRequest(w.model), workload, methodChanges, facts}, w.model);
    const base = simulate(w.model, r.workload, null);
    return {...row, r: {...r, protocolPhysical: base.physical, protocolBlocks: physicalActionBlocks(base.physical)},
      physicalIssues: protocolIssues(base.physical, r.facts), baseline: base.metrics,
      manualSteps: base.timeline.filter(s => s.type === 'H' && !s.overhead).length};
  });
  const groups = [...new Set(items.map(i => i.group))];
  const blockedWorkflows = items.filter(i => i.blocked).map(i => i.name);
  const results = setups.map(spec => {
    const handler = checkSetup(spec);
    const unassessed = missingEquipmentData(handler, spec.pipettes);
    const own = unassessed ? [] : setupProviders(spec, handler);
    const inst = {id: `setup-${spec.id}`, name: spec.name || spec.id, modelId: handler.id, owner: `${handler.vendor || 'Vendor'} / automation operator`, kind: 'purchase'};
    const cfg = spec.pipettes ? pipetteConfigs(handler)?.find(c => c.id === spec.pipettes) : null;
    const priced = unassessed ? null : costBasis({installation: inst, handler, route: spec.route, providers: own, pipettes: cfg});
    // A generic base label is named after its instrument, so the unpriced list reads on its own.
    const named = l => l === 'Base instrument' ? `${handler.name} base instrument` : l;
    const cost = priced ? {...priced, missing: priced.missing.map(named), lines: priced.lines.map(l => ({...l, label: named(l.label)}))} : null;
    const perWorkflow = items.map(it => {
      if (it.blocked) return {workflow:it.id, name:it.name, group:it.group, workload:it.r.workload, runsPerYear:it.runsPerYear,
        runs:false, blocked:it.blocked, why:it.blocked, baseline:null, withSetup:null, savedPerRun:null, savedHoursPerYear:null,
        manual:[], facts:[]};
      const providers = unassessed ? [] : keepFor(own, relevantOps(it.model), it.model.labware, handler);
      const c = unassessed ? null : candidate({...it.r, baselineActive: mid(it.baseline.active)}, it.model, inst, handler, spec.route, providers, spec.pipettes || null);
      const ok = c ? inScope(c, 'design') : {ok: false, why: unassessed || 'No step of this workflow can be done by this setup.'};
      const manual = ok.ok ? c.timeline.filter(s => s.type === 'H' && !s.overhead)
        .map(s => ({label: s.label, kind: s.kind, operation: OPS[s.kind]?.label || s.kind || 'Other', reason: s.reason || ''})) : [];
      const perRun = c && ok.ok ? savingOf(it.baseline.active, c.metrics.active) : null;
      return {workflow: it.id, name: it.name, group: it.group, workload: it.r.workload, runsPerYear: it.runsPerYear, runs: ok.ok, why: ok.ok ? null : ok.why,
        baseline: {active: it.baseline.active, visits: it.baseline.visits}, withSetup: c ? {active: c.metrics.active, visits: c.metrics.visits, elapsed: c.metrics.elapsed, automatedSteps: c.metrics.automatedInstances} : null,
        savedPerRun: perRun, savedHoursPerYear: perRun && it.runsPerYear != null ? {lo: perRun.lo * it.runsPerYear / 60, hi: perRun.hi * it.runsPerYear / 60} : null,
        manual, facts: c && ok.ok ? c.facts.filter(openFact) : [],
        // Per-step detail for the coverage command (#373), only on request.
        ...(steps === true ? {steps: c ? c.timeline.filter(s => (s.type === 'A' || s.type === 'H') && !s.overhead)
          .map(s => ({chunkId: s.chunkId, kind: s.kind, auto: s.type === 'A', label: s.label})) : null} : {})};
    });
    const running = perWorkflow.filter(w => w.runs);
    const questions = new Map();
    for (const w of running) for (const f of w.facts) {
      if (!questions.has(f.id)) questions.set(f.id, {id: f.id, type: f.type, owner: f.owner, question: f.question, status: f.status, workflows: []});
      questions.get(f.id).workflows.push(w.name);
    }
    const hours = running.filter(w => w.savedHoursPerYear).reduce((t, w) => add(t, w.savedHoursPerYear), zero());
    return {
      setup: {id: spec.id, name: spec.name || spec.id, handler: {id: handler.id, name: handler.name}, route: spec.route,
        pipettes: spec.pipettes ? {id: spec.pipettes, label: cfg?.label || spec.pipettes} : null, modules: spec.modules || [], devices: spec.devices || []},
      unassessed, workflowsRun: unassessed ? null : running.length, workflowsTotal: items.length,
      groupsRun: [...new Set(running.map(w => w.group))], groupsTotal: groups.length,
      hoursPerYear: unassessed || blockedWorkflows.length === items.length ? null : hours, blockedWorkflows, hoursComplete: !unassessed && !blockedWorkflows.length && running.every(w => w.runsPerYear != null), withoutRuns: running.filter(w => w.runsPerYear == null).map(w => w.name),
      byGroup: groups.map(g => {
        const ws = perWorkflow.filter(w => w.group === g);
        return {group: g, workflowsRun: unassessed ? null : ws.filter(w => w.runs).length, workflowsTotal: ws.length, blockedWorkflows:ws.filter(w => w.blocked).map(w => w.name), withoutRuns:ws.filter(w => w.runs && w.runsPerYear == null).map(w => w.name), hoursComplete: !unassessed && !ws.some(w => w.blocked) && ws.filter(w => w.runs).every(w => w.runsPerYear != null),
          hoursPerYear: unassessed || ws.every(w => w.blocked) ? null : ws.filter(w => w.savedHoursPerYear).reduce((t, w) => add(t, w.savedHoursPerYear), zero()),
          manual: ws.filter(w => w.runs).flatMap(w => w.manual.map(m => ({...m, workflow: w.name}))),
          notRun: ws.filter(w => !w.runs).map(w => ({workflow: w.name, why: w.why}))};
      }),
      workflows: perWorkflow, cost, questions: [...questions.values()],
    };
  });
  results.sort((a, b) => {
    const byId = a.setup.id.localeCompare(b.setup.id);
    if (a.unassessed || b.unassessed) return Number(Boolean(a.unassessed)) - Number(Boolean(b.unassessed)) || byId;
    return b.groupsRun.length - a.groupsRun.length || b.workflowsRun - a.workflowsRun || mid(b.hoursPerYear ?? zero()) - mid(a.hoursPerYear ?? zero()) || byId;
  });
  return {groups, workflows: items.map(({model, r, ...i}) => ({...i, workload: r.workload, format: model.format, version: versionOf(model)})), setups: results, prices: priceSource,
    caveat: `Hands-on minutes are planning estimates per operation (content/operations.json). Hours per year multiply them by the stated runs per year. Prices sum recorded evidence only. Missing prices are listed for each setup. ${methodChanges === true ? 'Method changes are included as what-ifs and carry validation questions.' : 'Setups assess the protocol as written.'}`};
}
