import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {compareGoal, INPUT} from '../offline/goal-comparison/evaluator.js';
import {validate} from '../offline/goal-comparison/schema.js';
import {contractBundle} from '../lib/reviewed/contract-bundle.js';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const fixture = name => JSON.parse(read('tests/fixtures/goals/' + name + '.json'));
const corpus = fixture('goal-comparison-cases');
const wire = v => Array.isArray(v) ? '[' + v.map(wire).join(',') + ']'
  : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + wire(v[k])).join(',') + '}'
    : JSON.stringify(v);
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const seal = (value, key = 'content_digest') => {
  delete value[key];
  value[key] = sha(wire(value));
  return value;
};
const pointer = ({schema_version, record_id, revision_id, content_digest}) =>
  ({schema_version, record_id, revision_id, content_digest});
function reseal(request) {
  seal(request.goal);
  request.alternative.goal = pointer(request.goal);
  seal(request.alternative);
  return request;
}
function request(case_ = {}, change = {}) {
  const goal = fixture(corpus.base_goal.split('/').at(-1).replace('.json', ''));
  if (case_.criteria) goal.criteria = structuredClone(case_.criteria);
  return reseal({schema: INPUT, record: JSON.parse(read('tests/fixtures/reviewed/base.json')), goal,
    alternative: {...fixture(corpus.base_alternative.split('/').at(-1).replace('.json', '')), ...structuredClone(change)},
    configurations: structuredClone(case_.configurations ?? [])});
}
const parseCLI = (input, args = []) => spawnSync(process.execPath,
  [fileURLToPath(new URL('scripts/compare-goal.mjs', root)), ...args],
  {input, encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, timeout: 10000});
const run = value => {
  const p = parseCLI(JSON.stringify(value));
  assert.equal(p.status, 0, p.error?.message ?? p.stdout);
  assert.equal(p.stderr, '');
  const output = JSON.parse(p.stdout);
  assert.equal(p.stdout, wire(output) + '\n');
  assert.equal(output.content_digest, seal(structuredClone(output)).content_digest);
  return output;
};
const reject = (v, code) => assert.rejects(compareGoal(v), {code});
const resultFor = (out, id) => out.method_results.find(r => r.criterion_id === id);
const provenance = kind => ({kind, evidence: [], explanation: 'Independent synthetic mutation.'});
const readPointer = (doc, p) => p.split('/').slice(1).reduce((v, k) => v[k.replace(/~1/g, '/').replace(/~0/g, '~')], doc);

test('exact contract and fixture pin, including previously released ReviewedProtocol bytes', async () => {
  const pin = JSON.parse(read('offline/goal-comparison/contracts/pin.json'));
  assert.equal(pin.upstream_commit, 'c5b057576cb5b4fd8a0557d4badb4c86239b2655');
  for (const [name, {path, sha256}] of Object.entries(pin.files)) {
    assert.equal(sha(path ? read(path) : contractBundle.files[name].text), sha256, name);
  }
  for (const [name, invalid] of Object.entries({
    'typed-measurement': 'unknown-is-not-zero', 'protocol-goal': 'unbound-original',
    'method-alternative': 'claims-approval', 'goal-comparison': 'claims-execution'
  })) {
    await validate(name, '0.1.0', fixture(name + '.synthetic'));
    await assert.rejects(validate(name, '0.1.0', fixture(name + '.' + invalid)), {code: 'schema_invalid'});
  }
});

test('released synthetic corpus through the actual CLI', async t => {
  for (const entry of corpus.cases) await t.test(entry.id, async () => {
    const expected = entry.expected;
    if (entry.stale_goal) {
      // Decision applicability belongs to Portal. Planner must refuse the old alternative for the new goal.
      const input = request(entry);
      input.goal = seal({...input.goal, ...entry.stale_goal, parent: pointer(input.goal)});
      await reject(input, 'goal_binding_mismatch');
      return;
    }
    for (const change of entry.alternatives ?? [{}]) {
      const input = request(entry, change);
      const output = run(input);
      assert.deepEqual(output, JSON.parse(JSON.stringify(await compareGoal(input))));
      assert.deepEqual(output.original, input.goal.original);
      assert.deepEqual(output.goal, pointer(input.goal));
      assert.deepEqual(output.alternative, pointer(input.alternative));
      assert.match(output.algorithm.release_digest, /^sha256:[0-9a-f]{64}$/);
      for (const key of ['declared_requirements', 'eligible_for_preference_rank', 'scientific_equivalence', 'execution_permission'])
        if (Object.hasOwn(expected, key)) assert.equal(output[key], expected[key]);
      assert.equal(output.access, 'not_established');
      assert.equal(output.physical_qualification, 'not_established');
      for (const [id, status] of Object.entries(expected.criteria ?? {})) assert.equal(resultFor(output, id)?.status, status);
      if (expected.reason) assert.ok(output.method_results.some(x => x.reason_code === expected.reason));
      for (const row of output.method_results) {
        assert.equal(readPointer(input.goal, row.criterion_pointer).id, row.criterion_id);
        assert.ok(row.input_pointers.every(p => readPointer(input.alternative, p)));
      }
      if (expected.joint_limits) {
        assert.deepEqual(Object.fromEntries(output.configurations.map(c => [c.binding.record_id, c.joint_limits])), expected.joint_limits);
        assert.deepEqual(output.configurations.filter(c => c.joint_limits === 'satisfied').map(c => c.binding.record_id),
          expected.matching_configuration_ids);
        output.configurations.forEach((c, i) => assert.equal(c.input_digest, sha(wire(input.configurations[i]))));
        assert.equal(output.declared_requirements, 'not_satisfied');
      }
      if (entry.id === 'unknown_cost_not_free') {
        assert.equal(output.estimate_results[0].input_pointer, '/estimates/0');
        assert.equal(output.estimate_results[0].total?.value ?? null, change.record_id === 'A' ? '10' : expected.B_total_cost);
        assert.equal(output.eligible_for_preference_rank, false);
        assert.ok(!/cheapest|saving|ranking/.test(Object.keys(output).join(' ')));
      }
      if (entry.id === 'exact_rational_result')
        assert.deepEqual(output.method_results[0].exact_result.value, {numerator: '120', denominator: '7'});
    }
  });
});

test('digest and original identity mutations are rejected or change the result', async () => {
  let v = request();
  v.goal.criteria[0].predicate.threshold.value = '101';
  await reject(v, 'content_digest_mismatch');
  seal(v.goal);
  await reject(v, 'goal_binding_mismatch');
  v = request();
  v.alternative.observations[0].measurement.value = '99';
  await reject(v, 'content_digest_mismatch');
  v = request();
  v.record.title += ' changed';
  await reject(v, 'interpretation_digest_mismatch');
  seal(v.record, 'interpretation_digest');
  await reject(v, 'original_binding_mismatch');
  v = request();
  v.alternative.original.operation_ids = ['wrong'];
  seal(v.alternative);
  await reject(v, 'original_binding_mismatch');
  v = request();
  v.goal.original.operation_ids = v.alternative.original.operation_ids = ['wrong'];
  await reject(reseal(v), 'original_operation_unknown');
  v = request();
  v.alternative.changes[0].original_operation_ids = ['wrong'];
  await reject(reseal(v), 'changed_operation_out_of_scope');
  for (const id of [
    {namespace: 'original', material_id: 'A', state_id: 'donor-before'},
    {namespace: 'alternative', material_id: 'A', state_id: 'donor-after'}
  ]) {
    v = request();
    v.alternative.observations[1].identities = [id];
    assert.equal(resultFor(await compareGoal(reseal(v)), 'retained').status, 'contradicted');
  }
  v = request();
  v.alternative.observations[1].identities[0].material_id = 'B';
  await reject(reseal(v), 'original_identity_out_of_scope');
});

test('duplicates and competing claims cannot be admitted', async () => {
  let v = request();
  v.goal.criteria.push(structuredClone(v.goal.criteria[0]));
  await reject(reseal(v), 'duplicate_claim');
  v = request();
  v.alternative.observations.push(structuredClone(v.alternative.observations[0]));
  v.alternative.observations.at(-1).measurement.value = '101';
  await reject(reseal(v), 'duplicate_claim');
  v = request();
  v.alternative.observations.push({...v.alternative.observations[1], observable_id: 'discarded', disposition: 'discarded'});
  await reject(reseal(v), 'competing_dispositions');
  v = request(corpus.cases.find(c => c.id === 'joint_limits'));
  v.configurations[0].limits.push(v.configurations[0].limits[0]);
  await reject(v, 'duplicate_claim');
});

test('known empty differs from null and unsupported semantics stay distinct', async () => {
  const v = request();
  const required = v.goal.criteria[1].predicate;
  required.operator = 'exactly';
  required.identities = [];
  v.alternative.observations[1].identities = [];
  assert.equal(resultFor(await compareGoal(reseal(v)), 'retained').status, 'satisfied');
  v.alternative.observations[1].identities = null;
  v.alternative.observations[1].provenance = provenance('unknown');
  assert.equal(resultFor(await compareGoal(reseal(v)), 'retained').status, 'unknown');
  const m = v.alternative.observations[0].measurement;
  for (const [field, value, code] of [
    ['basis', 'per_sample', 'incompatible_bases'], ['basis', null, 'unknown_basis'],
    ['unit', 'litre-ish', 'unsupported_unit'], ['dimension', 'pH', 'incompatible_dimensions'],
    ['reference', {kind: 'declared', id: 'different', conditions: []}, 'incompatible_references']
  ]) {
    const previous = m[field];
    m[field] = value;
    const r = resultFor(await compareGoal(reseal(v)), 'volume');
    assert.deepEqual([r.status, r.reason_code, r.exact_result], ['unsupported', code, null]);
    m[field] = previous;
  }
  m.value = null; m.provenance = provenance('unknown');
  assert.equal(resultFor(await compareGoal(reseal(v)), 'volume').status, 'unknown');
});

test('joint requirement needs one complete configuration, whose input changes the digest', async () => {
  const v = request(corpus.cases.find(c => c.id === 'joint_limits'));
  const [a, b] = v.configurations;
  const limits = a.limits;
  const start = await compareGoal(v);
  limits[1].measurement.value = '5';
  const pass = await compareGoal(v);
  assert.equal(pass.declared_requirements, 'satisfied');
  assert.deepEqual(pass.configurations.map(c => c.joint_limits), ['satisfied', 'not_satisfied']);
  assert.notEqual(pass.configurations[0].input_digest, start.configurations[0].input_digest);
  assert.equal(pass.configurations[1].input_digest, start.configurations[1].input_digest);
  a.limits.pop();
  assert.equal((await compareGoal(v)).declared_requirements, 'unresolved');
  a.limits[0].measurement.value = '0';
  assert.equal((await compareGoal(v)).declared_requirements, 'not_satisfied');
  v.configurations = [];
  assert.equal((await compareGoal(v)).declared_requirements, 'unresolved');
  assert.equal(b.binding.record_id, 'B');
});

test('estimates are individually complete and preserve exact source pointers', async () => {
  const c = corpus.cases.find(x => x.id === 'unknown_cost_not_free');
  const v = request(c, c.alternatives[0]);
  const known = structuredClone(v.alternative.estimates[0]);
  known.kind = 'time';
  Object.assign(known.subtotal, {dimension: 'time', unit: 'min', value: '12.000'});
  const missing = structuredClone(known);
  missing.completeness = 'unknown';
  missing.subtotal.value = null;
  missing.subtotal.provenance = provenance('unknown');
  v.alternative.estimates.push(known, missing);
  const output = await compareGoal(reseal(v));
  assert.deepEqual(output.estimate_results.map(x => [x.kind, x.input_pointer, x.total?.value ?? null]),
    [['cost', '/estimates/0', '10'], ['time', '/estimates/1', '12.000'], ['time', '/estimates/2', null]]);
  missing.completeness = 'complete';
  await reject(reseal(v), 'schema_invalid');
});

test('CLI refuses open wrappers, ambiguous JSON, invalid bytes, excess input and command arguments', () => {
  for (const [input, args, code] of [
    [JSON.stringify({...request(), config_path: '/tmp/x'}), [], 'input_shape'],
    ['{"schema":"x","schema":"y"}', [], 'json_duplicate_key'],
    [Buffer.from([0xff]), [], 'json_invalid'],
    [Buffer.alloc(2 * 1024 * 1024 + 1, 32), [], 'json_limit'],
    ['', ['--file'], 'arguments_refused']
  ]) {
    const p = parseCLI(input, args);
    assert.equal(p.status, 2, p.error?.message ?? p.stdout);
    assert.equal(p.stderr, '');
    const out = JSON.parse(p.stdout);
    assert.equal(out.error.code, code);
    assert.equal(out.schema, 'lab-automation-planner/goal-comparison-error/1');
  }
});

test('a conversion at the exact result size boundary still compares without rounding', async () => {
  const v = request();
  const value = {numerator: '-' + '1'.repeat(512), denominator: '3'};
  const claim = v.alternative.observations[0].measurement;
  Object.assign(claim, {value, unit: 'L'});
  const result = resultFor(await compareGoal(reseal(v)), 'volume');
  assert.equal(result.status, 'satisfied');
  assert.deepEqual(result.exact_result.value, value);
  assert.equal(result.exact_result.unit, 'L');
});

test('repeated evidence cannot amplify a bounded input into an oversized response', async () => {
  const v = request(corpus.cases.find(c => c.id === 'joint_limits'));
  v.configurations = [v.configurations[0]];
  const shared = v.configurations[0];
  shared.provenance.evidence = [{document_id: 'synthetic', document_digest: shared.binding.content_digest,
    pointer: '/' + 'a'.repeat(50000)}];
  const template = v.goal.criteria[0];
  v.goal.criteria = Array.from({length: 100}, (_, i) => ({...template, id: 'criterion-' + i}));
  await reject(reseal(v), 'output_limit');
});

test('reviewed timestamps reject trailing characters, year zero and invalid dates', async () => {
  for (const date of ['2026-01-01T00:00:00Z\n', '0000-01-01T00:00:00Z', '2026-02-29T00:00:00Z', '2026-01-01t00:00:00z']) {
    const v = request();
    v.record.created_at = date;
    await reject(v, 'schema_invalid');
  }
});
