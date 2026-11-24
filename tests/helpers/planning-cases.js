import assert from 'node:assert/strict';
import test from 'node:test';
import {benchDevice, benchFit, benchPlanningFixture, planningFixture} from '../../scripts/planning-fixtures.mjs';
import {definitions, matches} from '../../worker/planning/contract.js';
import {fixture as reviewedFixture} from './reviewed.mjs';
import {assess as assessReviewed} from '../../lib/reviewed/assessment.js';
import {canonicalJson} from '../../lib/source-provenance.js';
import {hashText} from '../../lib/reviewed/json.js';
import {snapshotFromText} from '../../lib/snapshots.js';
import {memoryD1} from '../../scripts/memory-d1.mjs';

const base = 'https://planner.example/api/planning/v1/';
const sensitive = 'Synthetic-secret-different-account';
export function planningCases(worker) {
  const db = memoryD1();
  const request = async (path, body, {user = 'caller', headers = {}, method = 'POST', raw, signal} = {}) => {
    const response = await worker.fetch(new Request(base + path, {
      method, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)), signal,
      headers: {...(user ? {'oai-authenticated-user-id': user} : {}), 'Content-Type': 'application/json', ...headers},
    }), {DB: db});
    const result = await response.json();
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return {status: response.status, body: result};
  };
  test('planning contracts expose allowlisted capability references with no private data or third-party request', async () => {
    const res = await request('contract', undefined, {method: 'GET', user: null});
    assert.equal(res.status, 200);
    assert.match(res.body.evaluator, /^sha256:[0-9a-f]{64}$/);
    assert.deepEqual(res.body.$defs, definitions);
    const capabilities = await request('capabilities?model=ot2', undefined, {method: 'GET', user: null});
    assert.equal(capabilities.status, 200);
    assert.ok(capabilities.body.claims.length > 0);
    for (const claim of capabilities.body.claims) {
      assert.ok(matches(claim, definitions.capability_claim));
      assert.deepEqual(Object.keys(claim).sort(), ['assurance', 'evidence', 'id', 'model_id', 'operation', 'origin']);
    }
    assert.equal((await request('capabilities?model=not-a-model', undefined, {method: 'GET', user: null})).status, 404);
  });
  test('the planning API blocks a dependent stage until the workflow chooses an arm', async () => {
    const input = planningFixture('grouped', 'accessible');
    const snapshot = snapshotFromText('Dependent stage', [
      '1. Handling',
      'Optional: Preliminary rinse',
      'Add 13 µl water.',
      'Mix by pipetting.',
      'Fluid exchange (shared)',
      'If preliminary rinse was performed, add 17 µl buffer.',
      'For fluid exchange only, add 29 µl buffer.',
      'Transfer 12 µl to a new tube.',
    ].join('\n'));
    input.protocol.snapshots = [snapshot];
    input.protocol.workflow.parts = [{source: 'text', id: snapshot.id, versionId: snapshot.version.id}];
    const blocked = await request('assess', input);
    assert.equal(blocked.status, 400, JSON.stringify(blocked.body));
    assert.equal(blocked.body.error.code, 'protocol_branch_required');
    input.protocol.workflow.branches = {[`text-${snapshot.id}-1`]: 'Skip Preliminary rinse'};
    const assessed = await request('assess', input);
    assert.equal(assessed.status, 200, JSON.stringify(assessed.body));
    assert.equal(assessed.body.decision.source_actions.length, 2);
  });
  test('planning blocks an unresolved QC outcome without echoing source text', async () => {
    const input = planningFixture('grouped', 'accessible');
    const line = 'If the QC trace is below target, add 17 µl of water.';
    const snapshot = snapshotFromText('Conditional measurement', [
      '1. Inspect', 'Check the trace.', line, 'Otherwise, record status.',
    ].join('\n'));
    input.protocol.snapshots = [snapshot];
    input.protocol.workflow.parts = [{source: 'text', id: snapshot.id, versionId: snapshot.version.id}];
    const blocked = await request('assess', input);
    assert.equal(blocked.status, 400);
    assert.equal(blocked.body.error.code, 'protocol_qc_outcome_required');
    assert.ok(!JSON.stringify(blocked.body).includes(line));
  });
  test('the API rejects numeric planning across a pool and admits the preceding block', async () => {
    const input = planningFixture('grouped', 'upgrade');
    const snapshot = snapshotFromText('Inert pooling', '1. Prepare\nAdd 40 µl water to each well.\n2. Collect\nPool from column 1 into the shared tube.');
    const pin = {source:'text', id:snapshot.id, versionId:snapshot.version.id};
    input.protocol.snapshots = [snapshot];
    input.protocol.workflow.parts = [pin];
    const blocked = await request('assess', input);
    assert.equal(blocked.status, 400);
    assert.equal(blocked.body.error.code, 'protocol_material_flow_unresolved');
    assert.ok(!('decision' in blocked.body));
    assert.doesNotMatch(JSON.stringify(blocked.body), /shared tube/);
    input.protocol.workflow.block = {...pin, from:1, through:1,
      input:{labware:'plate-96-pcr', volumeUl:20, evidence:'Synthetic volume record'}};
    const valid = await request('assess', input);
    assert.equal(valid.status, 200, JSON.stringify(valid.body));
    assert.deepEqual(valid.body.decision.source_actions.map(action => action.step_position), [1]);
  });
  test('planning retains the fitted head count through assessment and private replay', async () => {
    const input = planningFixture('grouped', 'accessible');
    const installedHeads = {status: 'confirmed', heads: [{id: '1000ul-channels', channels: 8}]};
    input.installations = [{id: 'synthetic-installation', modelId: 'plr-hamilton-star', access: 'yes', installedHeads}];
    const accepted = await request('assess', input);
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body.error));
    assert.equal(accepted.body.decision.recommended.head_id, 'as-installed:1000ul-channels-8');
    const archived = await request('export', input);
    assert.equal(archived.status, 200);
    assert.deepEqual(archived.body.request.installations[0].installedHeads, installedHeads);
    assert.deepEqual((await request('assess', archived.body)).body.decision, accepted.body.decision);
    installedHeads.status = 'reported';
    assert.equal((await request('assess', input)).body.decision.recommended, null);
    installedHeads.heads[0].channels = 160;
    const invalid = await request('validate', input);
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error.code, 'installed_heads_invalid');
  });
  test('the API compares only the pinned block and withholds estimates for unknown inputs', async () => {
    const input = planningFixture('grouped', 'upgrade');
    const pin = input.protocol.workflow.parts[0];
    input.protocol.workflow.block = {...pin, from:2, through:3,
      input:{labware:'tube-1.5', volumeUl:40, evidence:'Synthetic volume record'}};
    const packed = await request('export', input);
    assert.equal(packed.status, 200, JSON.stringify(packed.body));
    const replay = await request('assess', packed.body);
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    const result = replay.body.decision;
    assert.ok(matches(result, definitions.assessment_result));
    assert.deepEqual(result.source_actions.map(action => action.step_position), [2,3]);
    assert.deepEqual(result.block.input, input.protocol.workflow.block.input);
    assert.equal(result.labware.id, 'tube-1.5');
    assert.equal(result.block.versionId, pin.versionId);
    input.protocol.workflow.block.input = {labware:'tube-1.5', volumeUl:null, evidence:null};
    const blocked = await request('assess', input);
    assert.equal(blocked.status, 400);
    assert.equal(blocked.body.error.code, 'protocol_block_input_required');
    assert.ok(!('decision' in blocked.body));
  });
  test('planning roundtrips exact constraints, pins and assumptions in all 12 fixtures', async () => {
    for (const seed of ['grouped', 'individual']) {
      for (const scope of ['accessible', 'upgrade', 'design']) {
        for (const missing of [false, true]) {
          const input = planningFixture(seed, scope, missing);
          const [pin] = input.protocol.workflow.parts;
          input.protocol.overrides = [{...pin, line: input.protocol.snapshots[0].steps[0].text.split('\n').at(-1),
            operation: 'liquid-transfer', constraints: ['Synthetic vessel handling limit'], volumeUl: 20.25}];
          input.decision = {...input.decision, reagentPrices: {water: 0.25}, labourRate: 20.5, reactionScale: 0.9};
          const validated = await request('validate', input);
          assert.equal(validated.status, 200, JSON.stringify(validated.body));
          const packed = await request('export', input);
          assert.equal(packed.status, 200);
          assert.ok(matches(packed.body, definitions.workspace));
          assert.deepEqual(packed.body.request, input);
          const restored = await request('import', packed.body);
          assert.equal(restored.status, 200);
          assert.equal(restored.body.reproducible_here, true);
          assert.deepEqual(restored.body.workspace, packed.body);
          const assessed = await request('assess', restored.body.workspace);
          assert.equal(assessed.status, 200, JSON.stringify(assessed.body.error));
          assert.ok(matches(assessed.body.decision, definitions.assessment_result));
          assert.deepEqual(assessed.body.source_versions, validated.body.source_versions);
          assert.equal(assessed.body.request_sha256, packed.body.request_sha256);
          assert.equal(assessed.body.decision.baseline.missingWaits, Number(missing));
          assert.equal(assessed.body.decision.execution_allowed, false);
          if (scope === 'accessible' && missing) assert.equal(assessed.body.decision.recommended, null);
        }
      }
    }
    for (const table of ['profiles', 'reviews', 'lab_protocols', 'registry_assessments']) {
      assert.equal(db._db.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n, 0);
    }
  });
  test('the exact Worker contract admits the opt-in bench route only inside hosted limits', async () => {
    const input = benchPlanningFixture(192);
    input.installations = [{id: 'local-device', modelId: benchDevice, access: 'yes'}];
    input.decision = {...input.decision, scope: 'accessible', facts: {[benchFit('local-device')]: 'yes'}};
    const assessed = await request('assess', input);
    assert.equal(assessed.status, 200, JSON.stringify(assessed.body));
    assert.ok(matches(assessed.body.decision, definitions.assessment_result));
    assert.equal(assessed.body.decision.recommended.route, 'standalone');
    assert.equal(assessed.body.decision.recommended.head_id, null);
    assert.equal(assessed.body.decision.recommended.metrics.moves.person, 36);
    assert.equal(assessed.body.decision.mechanisms.length, 9);
    assert.equal((await request('assess', benchPlanningFixture(384))).status, 400);
  });
  test('the comparison can resolve a decision question alternative outside the shortlist', async () => {
    const input = planningFixture('grouped', 'upgrade');
    const {body: {decision}} = await request('assess', input);
    const ids = new Set(decision.configurations.map(c => c.id));
    const question = decision.questions.find(q => q.if_no && !ids.has(q.if_no));
    assert.ok(question, 'exercise an evaluated alternative outside the deduplicated shortlist');
    const response = await request('compare', {input, configurations: [question.if_yes, question.if_no]});
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const {comparison} = response.body;
    assert.ok(matches(comparison, definitions.configuration_difference));
    assert.deepEqual([comparison.left.id, comparison.right.id], [question.if_yes, question.if_no]);
    assert.deepEqual(comparison.hands_on_delta, question.hands_on_delta);
    assert.deepEqual(comparison.visit_delta, question.visit_delta);
  });
  test('planning errors refuse unauthorized access, invalid bytes, invalid bounds, and stale pins without echo', async () => {
    const input = planningFixture();
    const valid = await request('export', input);
    const invalid = mutation => { const copy = structuredClone(input); mutation(copy); return copy; };
    const bigRepeat = invalid(v => { v.protocol.snapshots[0].steps[0].text = 'Wash stage\nWash 999999999x with 10 uL water (Wash = 2 min rotation).'; });
    const cases = [
      ['assess', input, {user: null}, 401],
      ['assess', input, {headers: {Cookie: '__Host-planner_session=invalid'}}, 401],
      ['assess', input, {headers: {Origin: 'https://other.example'}}, 403],
      ['assess', input, {headers: {'Content-Type': 'text/plain'}}, 415],
      ['assess', undefined, {raw: '{"id":1,"id":2}'}, 400],
      ['assess', undefined, {raw: Buffer.from([0xc3, 0x28])}, 400],
      ['assess', undefined, {raw: Buffer.from([0xef, 0xbb, 0xbf, 123, 125])}, 400],
      ['assess', undefined, {raw: JSON.stringify({padding: 'x'.repeat(262144)})}, 413],
      ['assess', input, {signal: AbortSignal.abort()}, 408],
      ['assess', invalid(v => { v.protocol_id = sensitive; }), {}, 400],
      ['assess', invalid(v => { v.installations[0].credentials = sensitive; }), {}, 400],
      ['assess', invalid(v => { v.protocol.workflow.parts[0].versionId++; }), {}, 400],
      ['assess', invalid(v => { v.schema = 'planner/assessment-request/2'; }), {}, 422],
      ['assess', invalid(v => { v.protocol.snapshots[0].schema += '-next'; }), {}, 422],
      ['assess', invalid(v => { v.decision.workload = 193; }), {}, 400],
      ['validate', bigRepeat, {}, 413],
      ['import', {...valid.body, schema: 'planner/assessment-workspace/2'}, {}, 422],
      ['import', {...valid.body, request: invalid(v => { v.protocol.review.evidence_id = sensitive; })}, {}, 400],
      ['assess', {...valid.body, evaluator: 'sha256:' + '1'.repeat(64)}, {}, 409],
      ['compare', {input, configurations: ['bogus', sensitive]}, {}, 404],
      ['execute', input, {}, 404],
      ['publish', input, {}, 404],
    ];
    for (const [path, body, options, status] of cases) {
      const rejected = await request(path, body, options);
      assert.equal(rejected.status, status, path + ': ' + JSON.stringify(rejected.body));
      assert.equal(rejected.body.schema, 'planner/planning-error/1');
      assert.doesNotMatch(JSON.stringify(rejected.body), /Synthetic-secret|colored water|example-flex|credentials/);
    }
    const numberInput = JSON.stringify({...input, decision: {...input.decision, labourRate: 123.456}});
    for (const token of ['0.1234567890123456789', '1e-999']) {
      const rejected = await request('export', undefined, {raw: numberInput.replace('123.456', token)});
      assert.equal(rejected.status, 400);
      assert.equal(rejected.body.error.code, 'json_number_precision');
    }
    for (const token of ['1.0', '1e0', '1.0000E+00']) {
      const exported = await request('export', undefined, {raw: numberInput.replace('123.456', token)});
      assert.equal(exported.status, 200);
      assert.equal(exported.body.request.decision.labourRate, 1);
    }
    const ordinaryIdentifier = invalid(v => { v.protocol.snapshots[0].steps[0].text += '\nLot 123456789.'; });
    assert.equal((await request('validate', ordinaryIdentifier)).status, 200);
    const stale = {...valid.body, evaluator: 'sha256:' + '1'.repeat(64)};
    assert.equal((await request('import', stale)).body.reproducible_here, false);
  });
  test('planning preserves exact locked Labstep snapshots, observations and decimal claims', async () => {
    const input = planningFixture();
    const original = input.protocol.snapshots[0];
    const step = {...original.steps[0], guid: 'synthetic-step', prescribedSeconds: 2.5,
      timers: [{name: 'A synthetic timer', seconds: 2.5}],
      inventory: [{name: 'water', amount: 0.25, unit: 'mL', resource: 'water', category: null, input: true, output: false}]};
    const snapshot = {schema: 'lab-mcp/protocol-export/1', source: 'labstep', collection_id: 900001, name: original.name,
      version: {id: 900002, number: 1, locked_at: '2026-01-01T00:00:00Z'}, steps: [step],
      observed: {source:'lab-mcp protocol-executions', executionsStatus:'complete_visible_unlinked_protocols_skipped',
        method:{prescribed:'Timer declared in the fixture', tick_derived:'Synthetic elapsed tick interval',
          observed:'Synthetic record markers', step:'Synthetic step identity', operator:'Unrecorded',
          plausibility:{run:'Only matched runs', step:'Reject incomplete ticks', stated_waits:'Separate stated waits',
            minimum:'Five matching observations', use:'Elapsed evidence kept separate'}},
        versionId:900002, steps:{'synthetic-step':{n:5, medianMin:2.1, p25Min:2, p75Min:2.25}}}};
    snapshot.content_hash = await hashText(`[[${JSON.stringify(step.guid)}, ${JSON.stringify(step.text)}]]`);
    input.protocol.snapshots = [snapshot];
    input.protocol.workflow.parts = [{source: 'labstep', id: 900001, versionId: 900002, contentHash: snapshot.content_hash}];
    const workspace = await request('export', input);
    assert.equal(workspace.status, 200, JSON.stringify(workspace.body));
    assert.deepEqual((await request('import', workspace.body)).body.workspace.request, input);
    assert.equal(workspace.body.request_sha256, await hashText(canonicalJson(input)));
    const unrelated = structuredClone(input);
    unrelated.protocol.snapshots[0].observed.versionId++;
    assert.equal((await request('validate', unrelated)).body.error.code, 'observation_pin');
    const extra = structuredClone(input);
    extra.protocol.snapshots[0].observed.method.unrecognised = 'This field is outside the closed contract';
    assert.equal((await request('validate', extra)).body.error.code, 'invalid_assessment_request');
    input.protocol.snapshots[0].steps[0].text += ' changed';
    assert.equal((await request('validate', input)).body.error.code, 'source_integrity');
  });
  test('the actual Worker accepts the exact Portal reviewed-assessment input with original strict bytes', async () => {
    const input = await reviewedFixture();
    const validation = await request('reviewed/validate', input);
    assert.equal(validation.status, 200);
    assert.deepEqual(validation.body.binding, input.binding);
    const result = await request('reviewed/assess', input);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, await assessReviewed(input));
    assert.equal((await request('reviewed/assess', input, {user: null})).status, 401);
    assert.equal((await request('reviewed/validate', undefined, {raw: '{"schema":"lab-automation-planner/reviewed-assessment-input/1","n":1.0}'})).status, 400);
    const unknownLocation = structuredClone(input);
    unknownLocation.run.layout[sensitive] = null;
    const refused = await request('reviewed/validate', unknownLocation);
    assert.equal(refused.status, 400);
    assert.deepEqual(refused.body.error, {code: 'layout_unknown_location', path: '/run/layout'});
    assert.doesNotMatch(JSON.stringify(refused.body), /Synthetic-secret/);
    input.record.schema_version = '0.3.0';
    assert.equal((await request('reviewed/validate', input)).body.error.code, 'unsupported_review_version');
  });
}
