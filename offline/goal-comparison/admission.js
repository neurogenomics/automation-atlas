import {canonical, hash, interpretationDigest, MAX_BYTES, parseReview, reject} from '../../lib/reviewed/json.js';
import {validate} from './schema.js';

export const INPUT = 'lab-automation-planner/goal-comparison-input/1';
export const VERSION = '0.1.0';
export const digest = ({content_digest, ...record}) => hash(record);
export const revision = ({schema_version, record_id, revision_id, content_digest}) =>
  ({schema_version, record_id, revision_id, content_digest});
export const same = (a, b) => canonical(a) === canonical(b);
export const identityKey = ({namespace, material_id, state_id}) => canonical([namespace, material_id, state_id]);
export const claimKey = ({kind, observable_id, disposition}) => canonical([kind, observable_id, disposition ?? null]);

export function index(items, key, path) {
  const map = new Map();
  items.forEach((item, i) => {
    const k = key(item);
    if (map.has(k)) reject('duplicate_claim', path + '/' + i);
    map.set(k, {item, index: i});
  });
  return map;
}

function originalScope(record, original) {
  const {protocol_id, revision_id, interpretation_digest, source} = record;
  const {collection_id, version_id, version_hash, export_hash} = source;
  if (!same(original.binding, {protocol_id, revision_id, interpretation_digest, collection_id, version_id, version_hash, export_hash}))
    reject('original_binding_mismatch', '/goal/original/binding');
  const ops = index(record.operations, x => x.id, '/record/operations');
  const states = index(record.states, x => x.id, '/record/states');
  const materials = index(record.materials, x => x.id, '/record/materials');
  const scope = new Set(original.operation_ids);
  const pairs = new Set();
  for (const opId of scope) {
    const op = ops.get(opId)?.item;
    if (!op) reject('original_operation_unknown', '/goal/original/operation_ids');
    for (const port of [...op.inputs, ...op.outputs]) {
      const state = states.get(port.state_id)?.item;
      if (!state || (state.material_id !== null && !materials.has(state.material_id))) reject('original_port_identity_unknown', '/record/operations/' + ops.get(opId).index);
      if (state.material_id !== null) pairs.add(identityKey({namespace: 'original', material_id: state.material_id, state_id: state.id}));
    }
  }
  return {scope, pairs};
}

export async function admit(value) {
  // Snapshot caller-owned objects before the first await; the CLI parses wire bytes first.
  const text = canonical(value);
  if (new TextEncoder().encode(text).length > MAX_BYTES) reject('json_limit');
  const input = parseReview(text);
  const keys = ['schema', 'record', 'goal', 'alternative', 'configurations'];
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== keys.length ||
      keys.some(k => !Object.hasOwn(input, k))) reject('input_shape');
  if (input.schema !== INPUT) reject('unsupported_input_profile', '/schema');
  const {record, goal, alternative, configurations} = input;
  if (!Array.isArray(configurations) || configurations.length > 32) reject('configuration_limit', '/configurations');
  await validate('reviewed-protocol', '0.2.0', record, '/record');
  await validate('protocol-goal', VERSION, goal, '/goal');
  await validate('method-alternative', VERSION, alternative, '/alternative');
  if (goal.criteria.length > 128) reject('criteria_limit', '/goal/criteria');
  if (await interpretationDigest(record) !== record.interpretation_digest)
    reject('interpretation_digest_mismatch', '/record/interpretation_digest');
  for (const [companion, path] of [[goal, '/goal'], [alternative, '/alternative']]) {
    if (await digest(companion) !== companion.content_digest) reject('content_digest_mismatch', path + '/content_digest');
    if (companion.parent && (companion.parent.record_id !== companion.record_id || companion.parent.revision_id === companion.revision_id))
      reject('parent_scope_mismatch', path + '/parent');
  }
  if (!same(alternative.goal, revision(goal))) reject('goal_binding_mismatch', '/alternative/goal');
  if (!same(alternative.original, goal.original)) reject('original_binding_mismatch', '/alternative/original');
  const {scope, pairs} = originalScope(record, goal.original);
  const checkPair = (id, path) => {
    if (id?.namespace === 'original' && !pairs.has(identityKey(id))) reject('original_identity_out_of_scope', path);
  };
  index(goal.criteria, x => x.id, '/goal/criteria');
  index(goal.targets.filter(x => x.identity !== null), x => identityKey(x.identity), '/goal/targets');
  goal.targets.forEach(({identity}, i) => checkPair(identity, '/goal/targets/' + i + '/identity'));
  goal.criteria.forEach(({predicate}, i) => predicate.identities?.forEach((id, j) =>
    checkPair(id, `/goal/criteria/${i}/predicate/identities/${j}`)));

  index(alternative.changes, x => x.id, '/alternative/changes');
  index(alternative.assumptions, x => x.id, '/alternative/assumptions');
  const changed = new Set();
  alternative.changes.forEach(({original_operation_ids}, i) => original_operation_ids.forEach(id => {
    const path = `/alternative/changes/${i}/original_operation_ids`;
    if (!scope.has(id)) reject('changed_operation_out_of_scope', path);
    if (changed.has(id)) reject('competing_operation_changes', path);
    changed.add(id);
  }));
  const observations = index(alternative.observations, claimKey, '/alternative/observations');
  const dispositions = new Map(), alternativeStates = new Map();
  alternative.observations.forEach((obs, i) => obs.identities?.forEach((id, j) => {
    const path = `/alternative/observations/${i}/identities/${j}`;
    checkPair(id, path);
    if (id.namespace === 'alternative') {
      if (alternativeStates.has(id.state_id) && alternativeStates.get(id.state_id) !== id.material_id)
        reject('competing_state_identity', path);
      alternativeStates.set(id.state_id, id.material_id);
    }
    const key = identityKey(id);
    if (dispositions.has(key) && dispositions.get(key) !== obs.disposition) reject('competing_dispositions', path);
    dispositions.set(key, obs.disposition);
  }));
  if (configurations.length && !goal.criteria.some(c => c.subject === 'configuration'))
    reject('configuration_scope_missing', '/configurations');
  const limits = [];
  for (const [i, config] of configurations.entries()) {
    const path = '/configurations/' + i;
    await validate('goal-comparison', VERSION, config, path, '#/$defs/ConfigurationInput');
    limits.push(index(config.limits, claimKey, path + '/limits'));
  }
  index(configurations, ({binding: b}) => canonical([b.record_id, b.revision_id]), '/configurations');
  return {goal, alternative, configurations, observations, limits};
}
