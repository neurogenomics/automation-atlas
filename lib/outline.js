// Reads a Protocol Portal outline (profile protocol-portal/outline/1, #373).
// Every field name of that profile is read in this file and nowhere else, so
// a rename in the Portal is a change here only. The rest of the Planner sees
// the normalised shape returned by readOutline() and bindOutline().
// Unknowns stay null (never zero). A person's confirmation is an attributed
// claim the Planner cannot verify; it is reported, never treated as authority.

import labwareData from '../content/labware.json' with {type: 'json'};
import operationsData from '../content/operations.json' with {type: 'json'};
import {normaliseSnapshot} from './snapshots.js';

export const OUTLINE_PROFILE = 'protocol-portal/outline/1';
const STATUSES = new Set(['machine-read', 'agent-drafted']);
const KINDS = new Set(['vessel', 'working-volume', 'equipment', 'repeat-count', 'pooling', 'redistribution', 'pause', 'hard-step']);
const BASES = new Set(['stated', 'estimated', 'unknown']);
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const DECIMAL = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/;

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && v.length > 0;
const count = v => v === null || (Number.isSafeInteger(v) && v >= 1);

function fail(where, what, redacted) { throw redact(Error(`Outline ${where}: ${what}`), redacted); }
// Errors that quote values read from an input file also carry a redacted
// message, which says what kind of value was wrong without the value. The
// coverage command shows it unless --show-steps.
export function redact(error, redacted) { if (redacted) error.redacted = redacted; return error; }

function readStatus(raw, where) {
  if (!isObject(raw) || !STATUSES.has(raw.status) || !text(raw.who) || !text(raw.when)) fail(where, 'status needs status (machine-read or agent-drafted), who and when.');
  return {status: raw.status, who: raw.who, when: raw.when};
}

// Native spans tie a source-step pointer to its step GUID; links are never fetched.
function readEvidence(list, where, guids) {
  if (!Array.isArray(list) || !list.length) fail(where, 'evidence must be a non-empty list.');
  return list.map(e => {
    if (e?.kind === 'native-span' && isObject(e.span) && text(e.span.pointer)) {
      const guid = text(e.span.step_guid) ? e.span.step_guid : null;
      if (guid) {
        if (guids.has(e.span.pointer) && guids.get(e.span.pointer) !== guid) fail(where, `pointer ${e.span.pointer} is given two step GUIDs.`);
        guids.set(e.span.pointer, guid);
      }
      return {kind: 'native-span', pointer: e.span.pointer, stepGuid: guid};
    }
    if (e?.kind === 'attributed-link' && text(e.url)) return {kind: 'attributed-link', url: e.url, verified: false};
    return fail(where, 'evidence must be a native span with a pointer or an attributed link.');
  });
}

function readValue(kind, v, where) {
  if (!isObject(v)) fail(where, 'value must be an object.');
  switch (kind) {
    case 'vessel':
      if (v.labware_id !== null && !Object.hasOwn(labwareData.labware, v.labware_id)) fail(where, `unknown labware ${v.labware_id}.`, `The outline names a labware id that is not one of the ${Object.keys(labwareData.labware).length} catalogued labware ids.`);
      return {labwareId: v.labware_id, description: v.description ?? null};
    case 'working-volume': {
      if (v.unit !== 'uL' || !BASES.has(v.basis)) fail(where, 'working volume needs unit uL and basis stated, estimated or unknown.');
      if (v.value !== null && (typeof v.value !== 'string' || !DECIMAL.test(v.value) || !(Number(v.value) > 0))) fail(where, 'working volume must be a positive decimal string or null.');
      return {volumeUl: v.value === null ? null : Number(v.value), basis: v.basis, per: v.per ?? null};
    }
    case 'equipment':
      if (v.operation_id !== null && !Object.hasOwn(operationsData.operations, v.operation_id)) fail(where, `unknown operation ${v.operation_id}.`, `The outline names an operation id that is not one of the ${Object.keys(operationsData.operations).length} catalogued operation ids.`);
      return {operation: v.operation_id, freeText: v.free_text ?? null};
    case 'repeat-count':
      if (!count(v.count)) fail(where, 'repeat count must be a positive integer or null.');
      return {count: v.count, description: v.description ?? null};
    case 'pooling': case 'redistribution':
      if (!count(v.inputs) || !count(v.outputs)) fail(where, 'inputs and outputs must be positive integers or null.');
      return {inputs: v.inputs, outputs: v.outputs, description: v.description ?? null};
    default:
      return {description: v.description ?? null};
  }
}

const sameBinding = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  return isObject(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v;
}

// Validate an exported outline and return its normalised form.
export function readOutline(raw) {
  if (!isObject(raw) || raw.schema !== OUTLINE_PROFILE) fail('(unnamed)', `the profile must be ${OUTLINE_PROFILE}.`);
  const name = text(raw.record_id) ? raw.record_id : fail('(unnamed)', 'record_id is missing.');
  if (!text(raw.revision_id) || !DIGEST.test(raw.content_digest || '')) fail(name, 'revision_id and content_digest are required.');
  const b = raw.binding, s = b?.source;
  if (!isObject(b) || !text(b.protocol_id) || !text(b.revision_id) || !isObject(s) || s.system !== 'labstep' ||
      !text(String(s.collection_id ?? '')) || !text(String(s.version_id ?? '')) || !DIGEST.test(s.export_hash || '')) {
    fail(name, 'binding needs protocol_id, revision_id and a Labstep source with collection_id, version_id and export_hash.');
  }
  const guids = new Map();
  const ids = new Set();
  if (!Array.isArray(raw.blocks)) fail(name, 'blocks must be a list.');
  const blocks = raw.blocks.map((bl, i) => {
    const where = `${name} block ${bl?.id ?? i}`;
    if (!isObject(bl) || !text(bl.id) || ids.has(bl.id)) fail(where, 'each block needs a unique id.');
    ids.add(bl.id);
    if (!Array.isArray(bl.source_steps) || !bl.source_steps.length || !bl.source_steps.every(text)) fail(where, 'source_steps must list source-step pointers.');
    if (!Array.isArray(bl.facts)) fail(where, 'facts must be a list.');
    const label = isObject(bl.label) ? {text: bl.label.text ?? null, status: readStatus(bl.label.status, `${where} label`)} : fail(where, 'label is missing.');
    readEvidence(bl.label.evidence, `${where} label`, guids);
    const facts = bl.facts.map(f => {
      const at = `${where} fact ${f?.id}`;
      if (!isObject(f) || !text(f.id) || ids.has(f.id) || !KINDS.has(f.kind)) fail(at, 'each fact needs a unique id and a known kind.');
      ids.add(f.id);
      return {id: f.id, kind: f.kind, ...readStatus(f.status, at), evidence: readEvidence(f.evidence, at, guids), ...readValue(f.kind, f.value, at)};
    });
    return {id: bl.id, label, operationIds: Array.isArray(bl.operation_ids) ? [...bl.operation_ids] : [], sourceSteps: [...bl.source_steps], facts};
  });
  const binding = {protocolId: b.protocol_id, revisionId: b.revision_id, interpretationDigest: b.interpretation_digest ?? null,
    source: {system: s.system, collectionId: String(s.collection_id), versionId: String(s.version_id), versionHash: s.version_hash ?? null, exportHash: s.export_hash}};
  // One top-level confirmation: an attributed claim, kept only when it names
  // this exact content and binding.
  let claim = null, claimIgnored = null;
  const c = raw.confirmation;
  if (c != null) {
    if (!isObject(c) || !text(c.decision_id) || !text(c.when)) fail(name, 'confirmation needs decision_id and when.');
    if (c.content_digest !== raw.content_digest) claimIgnored = 'The confirmation names a different content digest from this outline, so it is ignored.';
    else if (!sameBinding(c.binding, raw.binding)) claimIgnored = 'The confirmation names a different binding from this outline, so it is ignored.';
    else claim = {decisionId: c.decision_id, who: c.principal?.id ?? null, issuer: c.principal?.issuer ?? null, when: c.when, verified: false};
  }
  const unresolvedSteps = Array.isArray(raw.unresolved_steps) ? raw.unresolved_steps.map(u => ({pointer: u?.pointer ?? null, reason: u?.reason ?? null})) : fail(name, 'unresolved_steps must be a list.');
  return {recordId: name, revisionId: raw.revision_id, contentDigest: raw.content_digest, binding, claim, claimIgnored, blocks, unresolvedSteps, stepGuids: guids};
}

// Bind an outline to the exact snapshot being assessed, refusing any other
// collection, version or hash, and place each block on that snapshot's steps.
// A pointer is placed through the step GUID its evidence gives (the export
// carries no pointers), or a pointer the snapshot step itself records.
export function bindOutline(outline, rawSnapshot) {
  const o = outline.schema ? readOutline(outline) : outline;
  const snap = normaliseSnapshot(rawSnapshot);
  const src = o.binding.source, name = `Outline ${o.recordId}`;
  if (snap.source !== 'labstep') throw redact(Error(`${name} is bound to a Labstep source; the snapshot being assessed is ${snap.source}.`), 'The outline is bound to a Labstep source; the snapshot being assessed is not one.');
  if (src.collectionId !== String(snap.id)) throw redact(Error(`${name} is bound to collection ${src.collectionId}; the snapshot being assessed is collection ${snap.id}.`), 'The outline is bound to a different collection from the snapshot being assessed.');
  if (src.versionId !== String(snap.version.id)) throw redact(Error(`${name} is bound to version ${src.versionId}; the snapshot being assessed is version ${snap.version.id}.`), 'The outline is bound to a different version from the snapshot being assessed.');
  if (src.exportHash !== snap.content_hash) throw redact(Error(`${name} is bound to export hash ${src.exportHash}; the snapshot being assessed has ${snap.content_hash}.`), 'The outline is bound to a different export hash from the snapshot being assessed.');
  const nativeHash = rawSnapshot.version_hash ?? null;
  // When the snapshot carries the native version hash, the outline must name the same one.
  if (nativeHash && !src.versionHash) throw redact(Error(`${name} has no version hash; the snapshot being assessed has ${nativeHash}.`), 'The outline has no version hash; the snapshot being assessed has one.');
  if (nativeHash && nativeHash !== src.versionHash) throw redact(Error(`${name} is bound to version hash ${src.versionHash}; the snapshot being assessed has ${nativeHash}.`), 'The outline is bound to a different version hash from the snapshot being assessed.');
  const byGuid = new Map(snap.steps.filter(st => st.guid).map(st => [st.guid, st.position]));
  const byPointer = new Map((rawSnapshot.steps || []).filter(st => st.pointer).map(st => [st.pointer, st.position]));
  const place = p => byPointer.get(p) ?? byGuid.get(o.stepGuids.get(p)) ?? null;
  const order = snap.steps.map(st => st.position);
  const blocks = o.blocks.map(bl => {
    const placed = bl.sourceSteps.map(p => ({pointer: p, position: place(p)}));
    const positions = placed.map(p => p.position).filter(p => p != null).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const idx = positions.map(p => order.indexOf(p));
    const contiguous = idx.every((v, k) => k === 0 || v === idx[k - 1] + 1);
    const withPositions = bl.facts.map(f => ({...f, positions: [...new Set(f.evidence.filter(e => e.pointer).map(e => place(e.pointer)).filter(p => p != null))]}));
    return {...bl, facts: withPositions, unlocated: placed.filter(p => p.position == null).map(p => p.pointer),
      from: positions[0] ?? null, through: positions.at(-1) ?? null, contiguous, pointerAt: Object.fromEntries(placed.filter(p => p.position != null).map(p => [p.position, p.pointer]))};
  });
  // A source step or operation belongs to one block at most, so no boundary
  // can be used twice, whatever the Portal's own validator did.
  const owner = new Map(), ops = new Map();
  for (const bl of blocks) {
    for (const p of [...bl.sourceSteps, ...Object.keys(bl.pointerAt).map(k => `position:${k}`)]) {
      if (owner.has(p) && owner.get(p) !== bl.id) throw Error(`${name} puts source step ${p.replace(/^position:/, 'at position ')} in blocks ${owner.get(p)} and ${bl.id}.`);
      owner.set(p, bl.id);
    }
    for (const op of bl.operationIds) {
      if (ops.has(op)) throw Error(`${name} puts operation ${op} in blocks ${ops.get(op)} and ${bl.id}.`);
      ops.set(op, bl.id);
    }
  }
  // Block order is presentation in the Portal. Blocks no longer overlap, so
  // they are taken in source order; say when that differs from the listing.
  const placedBlocks = blocks.filter(bl => bl.from != null);
  const reordered = placedBlocks.some((bl, k) => k > 0 && order.indexOf(bl.from) < order.indexOf(placedBlocks[k - 1].from));
  blocks.sort((a, b) => (a.from == null) - (b.from == null) || order.indexOf(a.from) - order.indexOf(b.from));
  // Steps no block covers, with the outline's reason where its unresolved
  // pointer can be placed through a known step GUID.
  const covered = new Set(blocks.flatMap(bl => Object.keys(bl.pointerAt).map(Number)));
  const reasons = new Map(o.unresolvedSteps.filter(u => place(u.pointer) != null).map(u => [place(u.pointer), u]));
  const uncovered = snap.steps.filter(st => !covered.has(st.position)).map(st => ({collection: snap.id, position: st.position, guid: st.guid ?? null,
    pointer: reasons.get(st.position)?.pointer ?? null, reason: reasons.get(st.position)?.reason ?? null, hasContent: Boolean(st.text?.trim())}));
  const unplacedUnresolved = o.unresolvedSteps.filter(u => place(u.pointer) == null).map(u => u.pointer);
  return {...o, snapshot: {source: snap.source, id: snap.id, versionId: snap.version.id, contentHash: snap.content_hash, nativeVersionHashChecked: Boolean(nativeHash), steps: order},
    blocks, uncovered, unplacedUnresolved, reordered};
}

// What a row rests on: the source binding and each fact's status.
export function factBasis(o, fact) {
  return {fact: fact.id, kind: fact.kind, status: fact.status, claim: o.claim ? 'person-confirmed claim (unverified)' : null};
}
export function bindingBasis(o) {
  return {outline: o.recordId, revision: o.revisionId, contentDigest: o.contentDigest, protocol: o.binding.protocolId,
    collection: o.binding.source.collectionId, version: o.binding.source.versionId, exportHash: o.binding.source.exportHash,
    claim: o.claim ? {decision: o.claim.decisionId, who: o.claim.who, when: o.claim.when, verified: false} : null,
    ...(o.claimIgnored ? {claimIgnored: o.claimIgnored} : {})};
}
