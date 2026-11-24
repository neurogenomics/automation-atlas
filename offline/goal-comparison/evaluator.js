import {readFile} from 'node:fs/promises';
import {canonical, hash, hashText, reject} from '../../lib/reviewed/json.js';
import {admit, claimKey, digest, identityKey, revision, VERSION} from './admission.js';
import {compareScalar} from './scalar.js';
import {validate} from './schema.js';

export {INPUT} from './admission.js';
export const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const releasePaths = [
  'package.json', 'scripts/compare-goal.mjs',
  'lib/reviewed/json.js', 'lib/reviewed/quantity.js', 'lib/reviewed/contract-bundle.js',
  ...['admission.js', 'evaluator.js', 'scalar.js', 'schema.js', 'contracts/pin.json', 'contracts/manifest.json',
    ...['typed-measurement', 'protocol-goal', 'method-alternative', 'goal-comparison'].map(n => 'contracts/' + n + '.schema.json')
  ].map(n => 'offline/goal-comparison/' + n)
];
let release;
function algorithm() {
  return release ??= (async () => {
    const files = await Promise.all(releasePaths.map(async path =>
      [path, await hashText(await readFile(new URL('../../' + path, import.meta.url), 'utf8'))]));
    return {id: 'bounded-goal-comparison', version: '1', release_digest: await hash(Object.fromEntries(files))};
  })();
}

const explanations = {
  declared_predicate_satisfied: 'The supplied claim meets the declared predicate.',
  declared_predicate_contradicted: 'The supplied claim does not meet the declared predicate.',
  missing_observation: 'No matching observation was supplied.',
  unknown_observation: 'The matching observation has no known value.',
  unknown_threshold: 'The declared threshold is unknown.',
  unknown_identity_requirement: 'The required identity set is unknown.',
  unknown_identity_observation: 'The supplied identity set is incomplete or unknown.',
  configuration_predicate_unsupported: 'Configuration inputs support scalar limits only.',
  missing_molar_mass: 'Mass and amount concentration cannot be compared without a conversion specific to the material.',
  missing_radius: 'Rotational speed and acceleration cannot be compared without geometry.',
  missing_ambient_pressure: 'Absolute and gauge pressure require a reference conversion that is not supplied.',
  unknown_dimension: 'A supplied quantity lacks a declared dimension.',
  unknown_unit: 'A supplied quantity lacks a declared unit.',
  unknown_basis: 'A supplied quantity lacks a declared quantity basis.',
  unknown_reference: 'A supplied quantity lacks the required reference semantics.',
  incompatible_dimensions: 'The supplied dimensions do not match.',
  incompatible_bases: 'The supplied quantity bases do not match.',
  incompatible_references: 'The supplied reference conditions do not match.',
  incompatible_currencies: 'The supplied currencies do not match.',
  unsupported_dimension: 'This dimension is not supported by the evaluator.',
  unsupported_unit: 'The evaluator has no exact unit conversion for this comparison.',
  unsupported_basis: 'The evaluator does not support the declared quantity basis.',
  unsupported_reference: 'The evaluator does not support the declared pressure reference.'
};
const ev = (document_id, document_digest, pointer) => ({document_id, document_digest, pointer});
const unique = items => [...new Map(items.map(x => [canonical(x), x])).values()];

function compareIdentity(observation, predicate) {
  if (observation.identities == null) return ['unknown', 'unknown_identity_observation', null];
  const supplied = new Set(observation.identities.map(identityKey));
  const wanted = predicate.identities.map(identityKey);
  const pass = predicate.operator === 'excludes_all' ? wanted.every(id => !supplied.has(id))
    : wanted.every(id => supplied.has(id)) && (predicate.operator !== 'exactly' || supplied.size === wanted.length);
  return [pass ? 'satisfied' : 'contradicted', pass ? 'declared_predicate_satisfied' : 'declared_predicate_contradicted', null];
}

function evaluate({criterion, index}, observations, goal, source) {
  const {predicate, observable_id} = criterion;
  const {kind, disposition, threshold} = predicate;
  const match = observations.get(claimKey({kind, disposition, observable_id}));
  const observation = match?.item;
  const criterion_pointer = '/criteria/' + index;
  const input_pointers = match ? [source.path + '/' + match.index] : [];
  const claim = observation?.measurement?.provenance ?? observation?.provenance;
  const evidence = unique([
    ev(goal.record_id, goal.content_digest, criterion_pointer),
    ...input_pointers.map(p => ev(source.id, source.digest, p)),
    ...criterion.provenance.evidence, ...(threshold?.provenance.evidence ?? []),
    ...(threshold?.reference?.conditions ?? []), ...(source.provenance?.evidence ?? []),
    ...(claim?.evidence ?? []), ...(observation?.measurement?.reference?.conditions ?? [])
  ]);
  let result;
  if (source.path === '/limits' && kind !== 'scalar') result = ['unsupported', 'configuration_predicate_unsupported'];
  else if (kind === 'scalar' && threshold.value === null) result = ['unknown', 'unknown_threshold'];
  else if (kind === 'identity_set' && predicate.identities === null) result = ['unknown', 'unknown_identity_requirement'];
  else if (!observation) result = ['unknown', 'missing_observation'];
  else if (kind === 'identity_set') result = compareIdentity(observation, predicate);
  else if (observation.measurement.value === null) result = ['unknown', 'unknown_observation'];
  else result = compareScalar(observation.measurement, predicate);
  const [status, reason_code, normalized] = result;
  return {criterion_id: criterion.id, criterion_pointer, status, reason_code, explanation: explanations[reason_code],
    input_pointers, evidence, exact_result: normalized ? {
      ...observation.measurement, ...normalized,
      provenance: {kind: 'inferred', evidence: input_pointers.map(p => ev(source.id, source.digest, p)),
        explanation: 'Exact value from the supplied claim, expressed in a compatible unit.'}
    } : null};
}

function conjunction(statuses) {
  return statuses.includes('contradicted') || statuses.includes('not_satisfied') ? 'not_satisfied'
    : statuses.every(s => s === 'satisfied') ? 'satisfied' : 'unresolved';
}
const necessary = (criteria, results) => results.filter((_, i) => criteria[i].criterion.priority === 'necessary').map(r => r.status);

export async function compareGoal(input) {
  const {goal, alternative, configurations, observations, limits} = await admit(input);
  const criteria = goal.criteria.map((criterion, index) => ({criterion, index}));
  const method = criteria.filter(({criterion: c}) => c.subject === 'method');
  const equipment = criteria.filter(({criterion: c}) => c.subject === 'configuration');
  let outcomeBytes = 0;
  const measure = (list, claims, source) => list.map(entry => {
    const result = evaluate(entry, claims, goal, source);
    outcomeBytes += Buffer.byteLength(canonical(result));
    if (outcomeBytes > MAX_OUTPUT_BYTES) reject('output_limit');
    return result;
  });
  const method_results = measure(method, observations,
    {id: alternative.record_id, digest: alternative.content_digest, path: '/observations'});
  const configResults = [];
  for (const [i, config] of configurations.entries()) {
    const input_digest = await hash(config);
    const criterion_results = measure(equipment, limits[i],
      {id: config.binding.record_id, digest: input_digest, path: '/limits', provenance: config.provenance});
    configResults.push({binding: config.binding, input_digest, criterion_results,
      joint_limits: conjunction(necessary(equipment, criterion_results))});
  }
  const constraints = necessary(method, method_results);
  if (equipment.some(({criterion: c}) => c.priority === 'necessary')) {
    const statuses = configResults.map(c => c.joint_limits);
    constraints.push(statuses.includes('satisfied') ? 'satisfied'
      : !statuses.length || statuses.includes('unresolved') ? 'unresolved' : 'not_satisfied');
  }
  const result = {
    schema_version: VERSION, digest_profile: goal.digest_profile, original: goal.original, goal: revision(goal),
    alternative: revision(alternative), algorithm: await algorithm(), declared_requirements: conjunction(constraints),
    eligible_for_preference_rank: false, method_results, configurations: configResults,
    estimate_results: alternative.estimates.map((estimate, i) => ({
      kind: estimate.kind, input_pointer: '/estimates/' + i, completeness: estimate.completeness,
      total: estimate.completeness === 'complete' ? estimate.subtotal : null
    })),
    scientific_equivalence: 'not_established', access: 'not_established', physical_qualification: 'not_established',
    execution_permission: false
  };
  if (Buffer.byteLength(canonical(result)) > MAX_OUTPUT_BYTES) reject('output_limit');
  result.content_digest = await digest(result);
  await validate('goal-comparison', VERSION, result);
  if (Buffer.byteLength(canonical(result)) > MAX_OUTPUT_BYTES) reject('output_limit');
  return result;
}
