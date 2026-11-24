// Independent synthetic protocol and Portal outlines for tests/outline.test.js
// and tests/coverage.test.js (#373). Inert phrasing only; ids are made up.
import {createHash} from 'node:crypto';

export const CANARY = 'Add 40 uL zebra lantern water to each well.';
const BODIES = [CANARY, 'Mix 3x by pipetting.', 'Pool columns 2-3 into column 1.',
  'Add 20 uL buffer to each well.', 'Distribute column 1 across columns 2-5.', 'Add 10 uL water to each well.'];
const WHEN = '2026-11-21T12:00:00Z';

export function synthetic(replace = {}, extra = {}) {
  const steps = BODIES.map((body, i) => replace[i + 1] ?? body).map((body, i) => ({position: i + 1, guid: `g${i + 1}`, section: '', title: `Part ${i + 1}`, text: `Part ${i + 1}\n${body}`, inventory: []}));
  const rows = steps.map(s => `[${JSON.stringify(s.guid)}, ${JSON.stringify(s.text)}]`);
  const raw = {schema: 'lab-mcp/protocol-export/1', source: 'labstep', collection_id: 910001, name: 'Synthetic routing', url: 'https://example.org/synthetic',
    version: {id: 910002, number: 1, locked_at: WHEN, is_draft: false}, has_unpublished_draft: false,
    content_hash: `sha256:${createHash('sha256').update(`[${rows.join(', ')}]`).digest('hex')}`, steps, ...extra};
  const workflow = {id: 'synthetic-outline', name: 'Synthetic outline', format: 'plate', labware: 'plate-96-pcr', defaultWorkload: 24,
    parts: [{source: 'labstep', id: 910001, versionId: 910002}]};
  return {raw, workflow};
}

const pointer = position => `/state/content/${position}`;
export function fact(id, kind, value, position, status = 'agent-drafted') {
  return {id, kind, value, status: {status, who: status === 'machine-read' ? 'lab-mcp/protocol-review-source' : 'synthetic-agent', when: WHEN},
    evidence: [{kind: 'native-span', span: {pointer: pointer(position), step_guid: `g${position}`, quote: 'Synthetic quote'}}]};
}

// opts: layout [[blockId, [positions]]], volumes {blockId: string|null},
// pool/split {inputs, outputs}, repeat (count on step 2), drop [fact ids],
// move {factId: position}, kinds {factId: kind}, collectionId/versionId/exportHash/
// versionHash (null omits it) overrides, unresolved [{pointer, reason}], confirmation 'same'|'other-digest'|'other-binding'.
export function outline(raw, opts = {}) {
  const layout = opts.layout || [['b1', [1, 2, 3]], ['b2', [4, 5]], ['b3', [6]]];
  const volumes = {b1: '20', b2: '30', b3: '40', b4: '40', ...opts.volumes};
  const special = [
    fact('equip-1', 'equipment', {operation_id: 'liquid-transfer', free_text: null}, 1),
    fact('repeat-2', 'repeat-count', {count: opts.repeat ?? 3, description: 'Synthetic repeat'}, 2),
    fact('pool-1', 'pooling', {inputs: 2, outputs: 1, description: 'Synthetic pool', ...opts.pool}, 3),
    fact('split-2', 'redistribution', {inputs: 1, outputs: 4, description: 'Synthetic split', ...opts.split}, 5),
  ].filter(f => !(opts.drop || []).includes(f.id)).map(f => {
    const at = opts.move?.[f.id];
    const moved = at ? {...f, evidence: [{kind: 'native-span', span: {pointer: pointer(at), step_guid: `g${at}`, quote: 'Synthetic quote'}}]} : f;
    return opts.kinds?.[f.id] ? {...moved, kind: opts.kinds[f.id]} : moved;
  });
  const blocks = layout.map(([id, positions], i) => ({
    id, operation_ids: [], source_steps: positions.map(pointer),
    label: {text: `Synthetic block ${i + 1}`, status: {status: 'agent-drafted', who: 'synthetic-agent', when: WHEN}, evidence: positions.map(p => ({kind: 'native-span', span: {pointer: pointer(p), step_guid: `g${p}`, quote: 'Synthetic quote'}}))},
    facts: [
      fact(`vessel-${i + 1}`, 'vessel', {labware_id: 'plate-96-pcr', description: 'Synthetic plate'}, positions[0]),
      fact(`vol-${i + 1}`, 'working-volume', {value: volumes[id], unit: 'uL', basis: volumes[id] == null ? 'unknown' : 'stated', per: 'per well'}, positions[0]),
      ...special.filter(f => positions.includes(Number(f.evidence[0].span.pointer.split('/').at(-1)))),
    ]}));
  const binding = {protocol_id: 'synthetic-protocol', revision_id: 'synthetic-revision', interpretation_digest: `sha256:${'a'.repeat(64)}`,
    source: {system: 'labstep', collection_id: opts.collectionId ?? String(raw.collection_id), version_id: opts.versionId ?? String(raw.version.id),
      ...(opts.versionHash === null ? {} : {version_hash: opts.versionHash ?? `sha256:${'b'.repeat(64)}`}), export_hash: opts.exportHash ?? raw.content_hash}};
  const digest = `sha256:${'c'.repeat(64)}`;
  const confirmation = !opts.confirmation ? null : {decision_id: 'decision-1', when: '2026-11-22T10:00:00Z',
    content_digest: opts.confirmation === 'other-digest' ? `sha256:${'d'.repeat(64)}` : digest,
    binding: opts.confirmation === 'other-binding' ? {...binding, revision_id: 'another-revision'} : binding,
    principal: {id: 'synthetic-person', issuer: 'protocol-portal/local-workstation', assurance: 'local_operator'}};
  return {schema: 'protocol-portal/outline/1', record_id: 'outline-synthetic', revision_id: 'outline-revision-1', parent_revision_id: null,
    content_digest: digest, binding, blocks, unresolved_steps: opts.unresolved || [], confirmation};
}

export const flex = {id: 'flex-ngs', handler: 'flex', route: 'connected', pipettes: '2x8',
  modules: ['Magnetic Block', 'Temperature Module', 'Heater-Shaker', 'Thermocycler', 'Gripper', 'Stacker']};
