import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {assessProcess} from '../offline/process-advisory/evaluator.js';
import {canonical} from '../lib/reviewed/json.js';
import {fixture as reviewedFixture} from './helpers/reviewed.mjs';

const files = new URL('./fixtures/process/', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name + '.json', files), 'utf8'));
const oracle = new Map(read('independent-oracle').cases.map(c => [c.id, c]));
const batch = () => read('batch'), flow = () => read('flow');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const assessed = async input => (await assessProcess(input)).result;
const row = (result, id) => result.schedule.timeline.find(x => x.id === id);
const occupation = (result, id) => result.schedule.occupancy.find(x => x.resource_id === id);
const occupationMinutes = (result, id) => occupation(result, id).scheduled_min;
const op = (id, duration, resources, payload = null, kind = 'task', predecessors = []) => ({
  id, kind, predecessors, duration_min: duration, resources, payload, evidence: 'synthetic-declaration',
});
const resource = (id, kind) => ({id, kind, configuration_id: id + '-configuration', revision: 'r1',
  availability: 'available', evidence: 'synthetic-declaration'});
const find = (r, code) => r.findings.some(x => x.code === code);
const decl = (command, body, ...args) => spawnSync(process.execPath, ['scripts/' + command + '.mjs', ...args], {input: body});

test('standalone measurement, sample balance and concurrency match the independent batch oracle', async () => {
  const input = batch(), entry = oracle.get(input.binding.case_id), expected = entry.expected;
  assert.deepEqual(input.process.operations.map(({id, predecessors, duration_min, resources}) =>
    ({id, predecessors, duration_min, resources})), entry.fictional_inputs.operations);
  const out = await assessProcess(input), r = out.result;
  assert.equal(r.status, 'declared_schedule');
  assert.equal(r.material_projection, 'declared_model_only');
  assert.equal(r.schedule.method, 'stable_list_schedule_no_global_optimisation');
  assert.equal(r.resources.find(resource => resource.kind === 'standalone_measurement').revision, 'r1');
  assert.equal(r.schedule.elapsed_min, expected.elapsed_min);
  assert.equal(r.schedule.operator_min, expected.operator_min);
  assert.equal(occupationMinutes(r, 'vessel'), expected.vessel_occupancy_min);
  assert.equal(occupationMinutes(r, 'standalone-meter'), expected.meter_occupancy_min);
  const states = new Map(r.material_states.map(s => [s.id, s]));
  assert.equal(states.get(r.retained_state_id).volume_mL, expected.retained_mL);
  assert.equal(states.get('collected-aliquot').volume_mL, expected.aliquot_mL);
  assert.equal(states.get('delivered-aliquot').volume_mL, expected.aliquot_mL);
  assert.equal(states.get('delivered-aliquot').derived_from, 'collected-aliquot');
  assert.equal(states.get('delivered-aliquot').consumed_by, null);
  assert.deepEqual(r.data, [{id: 'measurement-data', source_state_id: 'delivered-aliquot', produced_by: 'measure',
    mode: 'extracted_aliquot', value: null, evidence: 'synthetic-declaration'}]);
  const measure = row(r, 'measure'), release = row(r, 'release-retained');
  assert.equal(measure.start_min === release.start_min && Number(release.end_min) < Number(measure.end_min),
    expected.measure_overlaps_release_retained);
  assert.equal(r.liquid_handler_required, expected.liquid_handler_required);
  assert.equal(out.execution_allowed, false);
  assert.equal(out.scientific_outcome, 'unassessed');
});

test('in-situ observation has its own interval and the exact batch input, with no removal', async () => {
  assert(oracle.has('in-situ-reads-without-material-removal'));
  const input = batch(), p = input.process;
  p.resources.push(resource('observer', 'observer'));
  p.operations.push(op('observe', '2', ['observer'], {batch_state_id: 'original-batch',
    data_id: 'observed-data', during_id: 'hold', offset_min: '1', evidence: 'synthetic-declaration'}, 'observe', ['load']));
  const r = await assessed(input);
  const hold = row(r, 'hold'), observe = row(r, 'observe');
  assert.equal(r.schedule.elapsed_min, '13');
  assert.equal(occupationMinutes(r, 'observer'), '2');
  assert.ok(Number(hold.start_min) < Number(observe.start_min) && Number(observe.end_min) < Number(hold.end_min));
  assert.equal(r.material_states.length, 4);
  assert.equal(r.material_states.find(s => s.id === r.retained_state_id).volume_mL, '10');
  assert.equal(r.data.find(d => d.id === 'observed-data').source_state_id, 'original-batch');
  const conflicting = structuredClone(input);
  const second = structuredClone(conflicting.process.operations.at(-1));
  second.id = 'observe-second';
  second.payload.data_id = 'observed-data-second';
  conflicting.process.operations.push(second);
  const collision = await assessed(conflicting);
  assert.equal(collision.status, 'incomplete');
  assert(find(collision, 'observation_overlap_unresolved'));
  assert.equal(collision.schedule.elapsed_min, null);
  assert.equal(collision.data.filter(d => d.mode === 'in_situ').length, 1);
  for (const change of [{batch_state_id: 'other-batch'}, {offset_min: null}, {evidence: null}, {evidence: 'kinetics-role'}, {offset_min: '4'}]) {
    const candidate = structuredClone(input);
    Object.assign(candidate.process.operations.at(-1).payload, change);
    const unresolved = await assessed(candidate);
    assert.equal(unresolved.status, 'incomplete');
    assert.equal(unresolved.schedule.elapsed_min, null);
    assert(!unresolved.data.some(d => d.id === 'observed-data'));
  }
});

test('no pooled limits or stale revisions substitute for one exact eligible configuration', async () => {
  assert(oracle.has('single-configuration-must-fit-jointly'));
  const input = batch(), p = input.process, fit = p.joint_fit;
  fit.alternatives = [
    {...fit.alternatives[0], positions: '2'},
    {...fit.alternatives[0], id: 'configuration-b', capacity_mL: '10', positions: '8'},
  ];
  let r = await assessed(input);
  assert.equal(r.status, 'contradicted');
  assert.deepEqual(r.joint_fit.alternatives.map(c => c.status), ['contradicted', 'contradicted']);
  assert.equal(r.schedule.elapsed_min, null);
  assert.equal(r.schedule.timeline.length, 0);
  fit.alternatives[0].positions = null;
  r = await assessed(input);
  assert.equal(r.status, 'incomplete');
  assert.equal(r.joint_fit.alternatives[0].checks.positions, 'unknown');
  fit.alternatives[0].positions = '8';
  p.resources[1].revision = 'new-revision';
  r = await assessed(input);
  assert.equal(r.joint_fit.selected_status, 'unknown');
  assert.equal(r.schedule.elapsed_min, null);
});

test('exclusive use serializes ready operations while unrelated work can overlap', async () => {
  assert(oracle.has('resource-conflict'));
  const input = batch(), p = input.process;
  Object.assign(p, {batch: null, joint_fit: null, resources: [resource('provider', 'provider'), resource('operator', 'operator')],
    operations: [op('first', '3', ['provider']), op('second', '3', ['provider']), op('unrelated', '2', ['operator'])]});
  const r = await assessed(input);
  assert.equal(r.schedule.elapsed_min, '6');
  assert.equal(occupationMinutes(r, 'provider'), '6');
  assert.equal(row(r, 'first').end_min, row(r, 'second').start_min);
  assert.equal(row(r, 'unrelated').start_min, '0');
});

test('unknown duration or availability leaves known subtotals and incomplete cost separate', async () => {
  assert(oracle.has('missing-duration-or-availability') && oracle.has('incomplete-cost'));
  for (const missing of ['duration', 'availability']) {
    const input = batch();
    if (missing === 'duration') input.process.operations.find(op => op.id === 'handoff').duration_min = null;
    else input.process.resources.find(r => r.id === 'standalone-meter').availability = 'unknown';
    const {result: r, cost} = await assessProcess(input);
    assert.equal(r.status, 'incomplete');
    assert.equal(r.schedule.elapsed_min, null);
    assert.equal(r.schedule.known_operator_work_min, missing === 'duration' ? '5' : '7');
    assert.equal(occupation(r, 'standalone-meter').known_work_min, '3');
    assert.equal(occupationMinutes(r, 'standalone-meter'), '0');
    assert.equal(r.ranking, null);
    assert.equal(r.material_projection, 'declared_model_only');
    assert.equal(r.material_states.find(s => s.id === 'delivered-aliquot').volume_mL, '2');
    assert.deepEqual(r.data, []);
    assert.equal(cost.known_subtotal, '10');
    assert.equal(cost.total, null);
    assert.equal(cost.complete, false);
    assert.deepEqual(cost.missing, ['provider']);
  }
});

test('flow is exact ideal arithmetic with explicit feed, collection and data identity', async () => {
  const input = flow(), {expected} = oracle.get(input.binding.case_id), r = await assessed(input);
  assert.equal(r.status, 'ideal_arithmetic_only');
  assert.deepEqual(r.ideal_residence_s, {numerator: expected.ideal_residence_s_numerator, denominator: expected.ideal_residence_s_denominator});
  assert.deepEqual(r.thresholds_s.map(t => t.ideal_satisfies_lte), [expected.less_than_or_equal_17_14_s, expected.less_than_or_equal_17_15_s]);
  assert.equal(r.routing.feed_id, 'inert-feed');
  assert.equal(r.routing.collection_id, 'collection');
  assert.equal(r.routing.inline_observation.source_stream_id, 'ideal-stream');
  assert.equal(r.routing.inline_observation.value, null);
  assert.equal(r.actual_hydraulic_or_scientific_fit, expected.actual_hydraulic_or_scientific_fit);
  assert.equal(r.startup_transients, expected.startup_transients);
  assert.equal(r.actual_throughput, null);
  input.process.hold_up = {dimension: 'volume', value: '2000', unit: 'uL'};
  assert.deepEqual((await assessed(input)).ideal_residence_s, r.ideal_residence_s);
});

test('missing flow routing, rate or units and dynamic control earn no calculated completion or rank', async () => {
  assert(oracle.has('flow-missing-routing-rate-or-unit') && oracle.has('unsupported-dynamic-control'));
  for (const [change, code] of [
    [{routing: null}, 'routing_missing'],
    [{flow_rate: null}, 'missing_rate'],
    [{flow_rate: {dimension: 'mass', value: '7', unit: 'mL/min'}}, 'unsupported_rate_dimension_or_unit'],
    [{flow_rate: {dimension: 'rate', value: '7', unit: 'wrong'}}, 'unsupported_rate_dimension_or_unit'],
    [{control: 'recirculation'}, 'dynamic_control_unsupported'],
    [{control: 'data_dependent'}, 'dynamic_control_unsupported'],
  ]) {
    const input = flow();
    Object.assign(input.process, change);
    const r = await assessed(input);
    assert(find(r, code));
    assert.equal(r.ideal_residence_s, null);
    assert.equal(r.actual_throughput, null);
    assert.equal(r.elapsed_min, null);
    assert.equal(r.ranking, null);
  }
  const input = batch();
  input.process.control = 'data_dependent';
  const r = await assessed(input);
  assert.equal(r.status, 'unsupported');
  assert.equal(r.schedule.elapsed_min, null);
  assert.deepEqual(r.schedule.timeline, []);
  assert.deepEqual(r.material_transitions, []);
  assert.deepEqual(r.data, []);
});

test('standalone CLI binds exact bytes and rejects unsupported identities, evidence and arguments', async () => {
  for (const kind of ['batch', 'flow']) {
    const input = read(kind);
    const result = decl('assess-process', JSON.stringify(input));
    assert.equal(result.status, 0, result.stdout.toString());
    assert.equal(result.stdout.toString(), canonical(await assessProcess(input)) + '\n');
    assert.equal(JSON.parse(result.stdout).input_digest, 'sha256:' + digest(canonical(input)));
  }
  const check = (input, expected, ...args) => {
    const result = decl('assess-process', input, ...args);
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).error.code, expected);
    assert.equal(result.stderr.length, 0);
  };
  check('{"schema":"lab-automation-planner/process-advisory-input/2"}', 'unsupported_profile');
  check('{"x":1,"x":2}', 'json_duplicate_key');
  check(Buffer.from([0xc3, 0x28]), 'json_invalid');
  check('x'.repeat(128 * 1024 + 1), 'json_limit');
  check('', 'arguments_refused', './private.json');
  const altered = batch();
  altered.process.resources[2].evidence = 'analysis-role';
  check(JSON.stringify(altered), 'evidence_scope');
  const broken = batch();
  broken.process.operations.find(o => o.id === 'measure').predecessors = ['sample'];
  check(JSON.stringify(broken), 'material_dependency');
  const excess = batch();
  excess.process.operations.find(o => o.id === 'sample').payload.aliquot_mL = '13';
  check(JSON.stringify(excess), 'material_balance');
  const wrongLocation = batch();
  wrongLocation.process.operations.find(o => o.id === 'handoff').payload.destination_id = 'other-meter';
  check(JSON.stringify(wrongLocation), 'measurement_handoff');
  const cycle = batch();
  cycle.process.operations[0].predecessors = ['release-retained'];
  check(JSON.stringify(cycle), 'dependency_cycle');
});

test('legacy build and released reviewed stdin rollback remain byte compatible', async () => {
  assert(oracle.has('compatibility'));
  const input = canonical(await reviewedFixture()) + '\n';
  assert.equal(digest(input), '0f327a6bb2b65e0feff4bc797ff472c75a490a1a8472b654f9b4185719afb519');
  const before = decl('assess-reviewed', input);
  assert.equal(before.status, 0);
  assert.equal(digest(before.stdout), '259a84edc6ef3e86ff85b24798119413183fa8ecbf05b5a162b383b9d925fdab');
  assert.equal(decl('assess-process', JSON.stringify(batch())).status, 0);
  const restored = decl('assess-reviewed', input);
  assert.deepEqual(restored.stdout, before.stdout);
  assert.equal(JSON.parse(restored.stdout).authority.execution_allowed, false);
  assert.equal(decl('assess-reviewed', JSON.stringify(batch())).status, 2);
  assert.equal(decl('assess-process', input).status, 2);
});
