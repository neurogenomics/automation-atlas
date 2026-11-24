import test from 'node:test';
import assert from 'node:assert/strict';
import {memoryD1} from '../../scripts/memory-d1.mjs';
import {restoreRegistry} from '../../scripts/restore-registry.mjs';
import {registryContracts} from '../../scripts/registry-contracts.mjs';
import {archiveDigest, canonical, wireDigest, wireShape} from '../../worker/registry/contract.js';
import {planningFixture} from '../../scripts/planning-fixtures.mjs';
import {snapshotFromText} from '../../lib/snapshots.js';
import {pilotVersion} from '../../worker/registry/pilot.js';

const root = '/api/registry';
const rights = {discovery: 'permitted', assessment: 'permitted', republication: 'permitted', basis: 'Synthetic fixture permission'};
const observed_at = '2026-01-01';
const src = {source: {namespace: 'example:record', native_id: 'synthetic-source', version: 'original', url: 'https://example.org/evidence'},
  observed_at, visibility: 'public', snapshot_digest: 'sha256:' + '1'.repeat(64), use_rights: rights};
const fixture = (record, visibility = 'organisation', sources = [src], expires_at = null) =>
  ({record, visibility, sources, observed_at, expires_at, use_rights: rights});
const installation = (label = 'Synthetic installation') => ({record_type: 'installation', label, model: null,
  reported_location: 'private location', external_id_claims: [{identifier: {namespace: 'example:asset', native_id: 'private identifier'}, source_pointer: null}]});
const wire = response => response.json.revision.record;
const pin = r => ({schema_version: r.schema_version, organisation_id: r.organisation_id, record_type: r.record.record_type,
  record_id: r.record_id, revision_id: r.revision_id, content_digest: r.content_digest});
const assertion = (target, outcome, extra = {}) => ({record_type: 'assertion', target: pin(target), claim_kind: 'existence',
  outcome, state: 'reported', asserted_by: null, claimed_provider: null, claimed_custodian: null,
  verified_authority: null, statement: 'Private fixture evidence', observed_at, valid_until: null, related_assertions: [], ...extra});
const old = '2026-01-02T00:00:00Z';

export function registryCases(call) {
  const request = (env, path, user = 'alice', body, headers) =>
    call(path, {env, user, body, method: body === undefined ? 'GET' : 'POST', headers});
  const status = async (promise, expected) => {
    const result = await promise;
    assert.equal(result.status, expected, result.json?.error);
    return result;
  };
  async function setUp() {
    const env = {DB: memoryD1(), OWNER_EMAIL: 'owner@example.org'};
    const run = (...args) => request(env, ...args);
    const org = async user => (await status(run(root + '/organisations', user, {
      name: 'Synthetic group', claims: [{kind: 'external_id', value: 'same-claimed-identifier', observed_at}],
    }), 201)).json.organisation;
    const a = await org('alice'), b = await org('bob'), scope = id => root + '/organisations/' + id;
    const ap = scope(a.id), bp = scope(b.id);
    for (const [who, role] of [['editor', 'editor'], ['reviewer', 'reviewer']]) {
      await status(run(ap + '/members', 'alice', {user_id: 'u-' + who, role}), 200);
    }
    const create = (body, user = 'alice', prefix = ap) => run(prefix + '/records', user, body);
    const records = ap + '/records';
    const item = r => records + '/' + r.record_id;
    const revise = (r, body, user = 'alice') => run(item(r) + '/revisions', user, {expected_head: pin(r), ...body});
    const assess = (references, visibility = 'organisation', user = 'alice') => run(ap + '/assessments', user, {visibility, references});
    return {env, run, a, b, ap, bp, create, item, revise, assess};
  }

  test('private planning binds both exact Registry heads and never promotes a hardware hypothesis', async t => {
    const {env, run, create, item, revise, ap} = await setUp();
    t.mock.timers.enable({apis: ['Date'], now: Date.parse('2026-06-01T12:00:00Z')});
    const target = wire(await status(create(fixture(installation())), 201));
    const configuration = {
      record_type: 'configuration', installation: pin(target),
      fitted_modules: {coverage: 'partial', items: [
        {module_id: 'test-head', state: 'reported_fitted', source_pointer: '/sources/0'},
        {module_id: 'test-mover', state: 'reported_absent', source_pointer: '/sources/0'},
        {module_id: 'test-magnet', state: 'unknown', source_pointer: null},
      ]}, operating_envelopes: null,
    };
    const config = wire(await status(create(fixture(configuration, 'restricted')), 201));
    const route = item(target) + '/planning-v1';
    const {protocol} = planningFixture('grouped', 'upgrade');
    const input = {expected_head: pin(target), configuration: pin(config), protocol, decision: {workload: 192},
      planner_model_id: 'plr-hamilton-star', head_hypothesis: [{id: '1000ul-channels', channels: 8}]};

    await status(run(route, 'bob', input), 404);
    await status(run(route, 'editor', input), 404);
    const result = (await status(run(route, 'reviewer', input), 200)).json;
    assert.deepEqual(result.binding, {installation:pin(target), configuration:pin(config), status:'current',
      access:'unverified', dates:{installation:{observed_at, expires_at:null}, configuration:{observed_at, expires_at:null}},
      inventory_coverage:'partial', modules:[
        {id:'test-head', status:'reported_fitted'},
        {id:'test-magnet', status:'unknown'}, {id:'test-mover', status:'reported_absent'},
      ]});
    assert.match(result.binding_sha256, /^sha256:[0-9a-f]{64}$/);
    assert.equal(result.assumptions.status, 'caller_hypothesis');
    assert.deepEqual(result.assumptions.fitted_heads, input.head_hypothesis);
    assert.equal(result.assessment.decision.recommended.head_id, 'as-installed:1000ul-channels-8');
    const facts = result.assessment.decision.recommended.facts;
    assert.ok(facts.some(f => f.type === 'access' && f.status === 'unknown'));
    assert.ok(facts.some(f => f.type === 'installed-heads' && f.status === 'unknown'));
    assert.equal(result.assessment.decision.execution_allowed, false);
    assert.ok(result.assessment.work_map.baseline.some(row => row.assignment === 'operator'));
    assert.ok(result.assessment.work_map.proposed.some(row => row.assignment === 'automated_candidate' && row.head.includes('×8')));
    assert.deepEqual((await status(run(route, 'reviewer', input), 200)).json, result);
    const replay = {...input,replay_digest:result.binding_sha256};
    assert.deepEqual((await status(run(route,'reviewer',replay),200)).json,result);
    const changed = await status(run(route,'reviewer',{...replay,decision:{workload:96}}),409);
    assert.equal(changed.json.code,'planning_replay_changed');
    assert.equal(changed.json.assessment,undefined);
    await status(run(route,'reviewer',{...replay,replay_digest:''}),400);
    await status(run(route,'editor',replay),404);
    assert.ok(!JSON.stringify(result).includes('private location') && !JSON.stringify(result).includes('private identifier'));
    assert.equal(env.DB._db.prepare('SELECT COUNT(*) AS n FROM registry_assessments').get().n, 0);
    const transportProtocol = benchWork => {
      const additions = Array(5).fill('Add 10 uL water to each well.');
      const raw = snapshotFromText('Synthetic transport', ['1. Handle', ...additions, ...benchWork, ...additions].join('\n'));
      return {...protocol, workflow:{...protocol.workflow,
        parts:[{source:'text',id:raw.id,versionId:raw.version.id}]}, snapshots:[raw]};
    };
    const mixedProtocol = transportProtocol(['Visually inspect the plate under the microscope.']);
    const mixedResult = (await status(run(route, 'reviewer', {...input, protocol:mixedProtocol}), 200)).json;
    const workMap = mixedResult.assessment.work_map;
    const legs = workMap.transport_review.directed_links;
    assert.deepEqual(legs.map(leg => [leg.from.id,leg.to.id,leg.phase,leg.modeled_mover,leg.occurrences]), [
      ['bench','deck','initial_loading','person',1], ['deck','bench','handoff','person',1], ['bench','deck','handoff','person',1],
    ]);
    assert.ok(workMap.proposed.some(row => row.assignment === 'operator' && row.handoff?.from === 'the bench'));
    assert.equal(legs[0].planned_operator_minutes,null);
    assert.equal(legs[0].timing_basis,'included_in_setup');
    assert.ok(legs.slice(1).every(leg => leg.planned_operator_minutes.lo > 0));
    assert.ok(legs.every(leg => leg.reach_status === 'unverified' && leg.estimated_savings_minutes === null));
    const moverReported = structuredClone(configuration);
    moverReported.fitted_modules.items[1].state = 'reported_fitted';
    const anotherConfig = wire(await status(create(fixture(moverReported, 'restricted')), 201));
    const sameRoute = (await status(run(route,'reviewer',{...input,protocol:mixedProtocol,configuration:pin(anotherConfig)}),200)).json;
    assert.notEqual(sameRoute.binding_sha256,mixedResult.binding_sha256);
    assert.deepEqual(sameRoute.assessment.work_map.transport_review,workMap.transport_review);
    const noBenchWork = (await status(run(route,'reviewer',{...input,protocol:transportProtocol([])}),200)).json;
    assert.deepEqual(noBenchWork.assessment.work_map.transport_review.directed_links.map(leg => leg.phase),['initial_loading']);
    const noTopology = (await status(run(route, 'alice', {...input, head_hypothesis: null}), 200)).json;
    assert.equal(noTopology.assessment.decision.recommended, null);
    assert.equal(noTopology.assessment.work_map.transport_review, null);
    await status(run(route, 'alice', {...input, decision: {...input.decision, scope: 'accessible'}}), 400);

    await status(revise(config, {action:'correct', ...fixture(configuration,'restricted')}), 200);
    await status(run(route, 'alice', input), 409);
    await status(run(ap + '/members', 'alice', {user_id:'u-reviewer', role:null}), 200);
    await status(run(route, 'reviewer', input), 404);
  });

  test('private planning refuses expired evidence and a configuration linked to a different installation', async t => {
    const {run, create, item} = await setUp();
    t.mock.timers.enable({apis: ['Date'], now: Date.parse('2026-06-01T12:00:00Z')});
    const first = wire(await status(create(fixture(installation())), 201));
    const other = wire(await status(create(fixture(installation('Different device'))), 201));
    const body = {record_type:'configuration', installation:pin(other), fitted_modules:null, operating_envelopes:null};
    const config = wire(await status(create(fixture(body)), 201));
    const {protocol} = planningFixture();
    const input = {expected_head:pin(first), configuration:pin(config), protocol, decision:{workload:24}, planner_model_id:'ot2', head_hypothesis:null};
    await status(run(item(first)+'/planning-v1', 'alice', input), 409);
    const expired = wire(await status(create(fixture(installation('Expired'), 'organisation', [src], '2026-06-02T00:00:00Z')), 201));
    const expiredInput = {...input, expected_head:pin(expired), configuration:null};
    t.mock.timers.setTime(Date.parse('2026-06-03T00:00:00Z'));
    await status(run(item(expired)+'/planning-v1', 'alice', expiredInput), 409);
  });

  test('private planning excludes a mapped absence or conflict without promoting a reported fit', async () => {
    const {run, create, item} = await setUp();
    const installationPin = pin(wire(await status(create(fixture(installation())), 201)));
    const raw = snapshotFromText('Synthetic retention station', [
      '1. Handle', ...Array(6).fill('Add 10 uL water to each well.'), 'Collect beads on magnet for 2 minutes.',
      ...Array(4).fill('Add 10 uL water to each well.'),
    ].join('\n'));
    const {protocol} = planningFixture();
    protocol.snapshots = [raw];
    protocol.workflow.parts = [{source:'text',id:raw.id,versionId:raw.version.id}];
    const input = {expected_head:installationPin, configuration:null, protocol, decision:{workload:192},
      planner_model_id:'flex', head_hypothesis:[{id:'flex-8ch-50',channels:8}]};
    const route = item(installationPin) + '/planning-v1';
    const get = async request => (await status(run(route,'alice',request),200)).json;
    const control = await get(input);
    const magneticRoute = result => result.assessment.decision.configurations.some(row => row.id.includes('module:magnetic-separation'));
    assert.ok(magneticRoute(control));
    const makeConfig = async states => pin(wire(await status(create(fixture({record_type:'configuration',installation:installationPin,
      fitted_modules:{coverage:'partial',items:states.map((state,i) => ({module_id:'fixture-magnet-'+i,state,source_pointer:state === 'unknown' ? null : '/sources/0'}))},
      operating_envelopes:null})),201)));
    const hypothesis = i => ({module_id:'fixture-magnet-'+i,option_key:'optional:Magnetic Block'});
    for (const [states,expected] of [
      [['reported_fitted'],'reported_fitted'],
      [['unknown'],'unknown'],
      [['reported_absent'],'reported_absent'],
      [['reported_fitted','reported_absent'],'conflicting'],
    ]) {
      const configuration = await makeConfig(states);
      const pinned = {...input,configuration};
      const unmapped = await get(pinned);
      assert.ok(magneticRoute(unmapped));
      const mapped = await get({...pinned,module_hypotheses:states.map((_,i)=>hypothesis(i))});
      const [mapping] = mapped.assumptions.module_mappings;
      assert.equal(mapping.status,expected);
      assert.notEqual(mapped.binding_sha256,unmapped.binding_sha256);
      const excluded = states.includes('reported_absent');
      assert.equal(mapping.effect,excluded ? 'excluded' : 'provisional');
      assert.equal(magneticRoute(mapped),!excluded);
      const independent = scenario => scenario.assessment.decision.configurations.find(row => row.id.endsWith(':connected:base'));
      assert.ok(independent(unmapped));
      assert.deepEqual(independent(mapped)?.metrics,independent(unmapped).metrics);
      const transport = mapped.assessment.work_map.transport_review;
      assert.ok(transport.directed_links.length);
      assert.ok(transport.directed_links.every(leg => leg.modeled_mover === 'person' &&
        leg.reach_status === 'unverified' && leg.estimated_savings_minutes === null));
      assert.equal(mapped.assessment.decision.execution_allowed,false);
      if (expected === 'conflicting') assert.equal(mapping.reports.length,2);
    }
    const configuration = await makeConfig(['reported_absent']);
    await status(run(route,'alice',{...input,configuration,
      module_hypotheses:[{...hypothesis(0),option_key:'other-option'}]}),400);
    await status(run(route,'alice',{...input,configuration,module_hypotheses:[hypothesis(0),hypothesis(0)]}),400);
  });

  test('private planning rechecks membership after evaluating the scenario', async () => {
    const {env, run, create, item, a} = await setUp();
    const target = wire(await status(create(fixture(installation())), 201));
    const {protocol} = planningFixture();
    const input = {expected_head:pin(target), configuration:null, protocol, decision:{workload:192},
      planner_model_id:'plr-hamilton-star', head_hypothesis:[{id:'1000ul-channels', channels:8}]};
    const prepare = env.DB.prepare.bind(env.DB);
    let reads = 0;
    env.DB.prepare = sql => {
      if (sql.includes('r.record_id IN (SELECT value FROM json_each(?))') && ++reads === 2) {
        env.DB._db.prepare('DELETE FROM registry_members WHERE org_id = ? AND user_id = ?').run(a.id, 'u-reviewer');
      }
      return prepare(sql);
    };
    try {
      const refused = await status(run(item(target)+'/planning-v1','reviewer',input), 404);
      assert.equal(reads, 2);
      assert.deepEqual(Object.keys(refused.json), ['error']);
    } finally {
      env.DB.prepare = prepare;
    }
  });

  test('assessment history pages beyond one hundred under current membership and visibility', async t => {
    const {run, create, ap, bp, assess} = await setUp();
    t.mock.timers.enable({apis: ['Date'], now: Date.parse('2026-06-01T12:00:00Z')});
    const record = wire(await status(create(fixture(installation())), 201));
    const endpoint = ap + '/assessments', ids = [], editorIds = [];
    // Every row shares the same timestamp, so a cursor must tie-break by ID.
    for (let i = 0; i < 108; i++) {
      const visible = i < 104;
      const result = await status(assess([pin(record)], visible ? 'organisation' : 'restricted'), 201);
      ids.push(result.json.assessment.id);
      if (visible) editorIds.push(result.json.assessment.id);
    }
    const list = async (user, expected) => {
      let after = null, pages = 0;
      const seen = [];
      do {
        const q = '?limit=25' + (after ? '&after=' + encodeURIComponent(after) : '');
        const result = (await status(run(endpoint + q, user), 200)).json;
        assert.ok(result.assessments.length <= 25);
        seen.push(...result.assessments.map(a => a.id));
        after = result.next_after;
        pages++;
        assert.ok(pages <= 5);
      } while (after);
      assert.deepEqual(seen, expected.sort());
    };
    await status(run(endpoint), 413); // legacy bounded list is unchanged
    await list('alice', ids);
    await list('editor', editorIds);
    const id = ids.find(id => !editorIds.includes(id));
    assert.equal((await status(run(endpoint + '/' + id), 200)).json.assessment.id, id);
    await status(run(endpoint + '/' + id, 'editor'), 404);
    await status(run(endpoint + '?limit=0'), 400);
    await status(run(endpoint + '?after=bad'), 400);
    await status(run(bp + '/assessments?limit=25', 'alice'), 404);
    const cursor = (await status(run(endpoint + '?limit=25', 'editor'), 200)).json.next_after;
    await status(run(ap + '/members', 'alice', {user_id: 'u-editor', role: null}), 200);
    await status(run(endpoint + '?after=' + encodeURIComponent(cursor), 'editor'), 404);
  });

  test('private pilot keeps exact reviews, distinct denominators, correction history and protected recovery', async t => {
    const {run, create, revise, ap, bp} = await setUp();
    const starts = Date.parse('2026-06-01T12:00:00Z');
    t.mock.timers.enable({apis: ['Date'], now: starts});
    const expiry = new Date(starts + 60_000).toISOString(), today = new Date(starts).toISOString().slice(0, 10);
    const source = key => ({reference: 'ref:fixture/' + key, observed_on: observed_at});
    const option = (state, key) => ({state, evidence: key ? source(key) : null});
    const listed = wire(await status(create(fixture(installation(), 'restricted', [src], expiry)), 201));
    const reviewed = wire(await status(revise(listed, {action: 'review'}, 'reviewer'), 200));
    const other = wire(await status(create(fixture(installation('Another synthetic report')), 'bob', bp), 201));
    const lead = {id: 'first', label: 'Synthetic private lead', identified_on: observed_at, invited_on: observed_at,
      replied_on: today, reviewed_on: today, responsible: {label: 'Synthetic operator role', role: 'operator', evidence: source('owner')},
      steward: {label: 'Synthetic steward role', consent: 'attested', evidence: source('consent')},
      overlap: option('clear', 'directory'), referral: option('suggested', 'referral'),
      access: option('inaccessible', 'access'), support: option('conditional', 'support'),
      facts: ['module', 'interface'].map(kind => ({kind, label: kind, state: 'reported_present', evidence: source(kind)})),
      review: {pin: pin(reviewed), expires_on: '2099-01-01'},
      decision: {outcome: 'no_change', decided_on: today, summary: 'Synthetic answer leaves the decision unchanged',
        before: source('assessment-before/immutable-version-1'), after: source('assessment-after/immutable-version-2')}};
    const second = {...lead, id: 'second', label: 'Unsolicited synthetic reply', replied_on: observed_at, invited_on: null,
      reviewed_on: null, review: null, responsible: null, steward: null, overlap: option('unchecked'),
      referral: option('none'), access: option('unknown'), support: option('unknown'), facts: [], decision: null};
    const required_facts = ['module', 'interface'].map(kind => ({kind, label: kind}));
    const snapshot = {name: 'Synthetic cohort', scope: 'Two fixture cases', starts_on: observed_at, ends_on: today,
      required_facts, leads: [lead, second]};
    const save = (url, expected_version, snapshot, user = 'reviewer') =>
      run(url, user, {expected_version, snapshot, reason: 'Synthetic registry change'});
    await status(save(ap + '/pilot', null, {...snapshot, leads: [{...lead, review: {...lead.review, pin: pin(other)}}]}), 400);
    await status(save(ap + '/pilot', null, {...snapshot, leads: [{...lead, review: {...lead.review, pin: pin(listed)}}]}), 409);
    await status(save(ap + '/pilot', null, {...snapshot, external_authority: 'verified'}), 400);
    const created = (await status(save(ap + '/pilot', null, snapshot), 201)).json;
    const url = ap + '/pilot/' + created.cohort_id;
    const read = async () => (await status(run(url, 'reviewer'), 200)).json.cohort;
    const original = await read();
    assert.deepEqual(original.metrics, {identified: [2, 2], invited: [1, 2], replied: [2, 2], reviewed: [1, 2],
      verified: [1, 1], inaccessible: [1, 2], stale: [0, 2], response: [1, 1]});
    assert.equal(original.external_authority, 'unverified');
    assert.equal(original.leads[0].decision.outcome, 'no_change');
    for (const actor of ['editor', 'bob']) {
      for (const route of [ap + '/pilot', url, url + '/history']) await status(run(route, actor), 404);
      await status(save(url, created.version, snapshot, actor), 404);
    }
    await status(run(bp + '/pilot/' + created.cohort_id, 'bob'), 404);
    await status(run(url, null), 401);
    t.mock.timers.setTime(starts + 60_000);
    const expired = await read();
    assert.deepEqual(expired.leads[0].review.pin, pin(reviewed));
    assert.equal(expired.leads[0].review_condition, 'installation expired');
    assert.deepEqual(expired.metrics.stale, [1, 2]);
    await status(save(url, created.version, {...snapshot, leads: [{...lead, review: {...lead.review, expires_on: '2099-02-01'}}, second]}), 409);
    const corrected = wire(await status(revise(reviewed, fixture(reviewed.record, 'restricted'), 'reviewer'), 200));
    assert.deepEqual((await read()).metrics.verified, [0, 1]);
    await status(save(url, created.version, {...snapshot, leads: [{...lead, review: {...lead.review, pin: pin(corrected)}}, second]}), 409);
    const fresh = wire(await status(revise(corrected, {action: 'review'}, 'reviewer'), 200));
    const restoredLead = {...lead, review: {...lead.review, pin: pin(fresh)}};
    const next = {...snapshot, leads: [restoredLead, second]};
    const results = await Promise.all([save(url, created.version, next), save(url, created.version, next)]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    const updated = await read();
    assert.deepEqual(updated.metrics.verified, [1, 1]);
    assert.deepEqual(updated.leads[0].review.pin, pin(fresh));
    const exact = (await status(run(url + '/history?version=' + created.version), 200)).json.revision;
    assert.deepEqual(exact.snapshot.leads[0].review.pin, pin(reviewed));
    assert.equal((await status(run(root + '/public'), 200)).json.publications.length, 0);

    await status(run(ap + '/backup', 'reviewer'), 403);
    const missingFacts = {...next, required_facts: [...required_facts, {kind: 'interface', label: 'required adapter'}]};
    await status(save(url, updated.version, missingFacts), 200);
    const missing = await read();
    assert.deepEqual(missing.metrics.verified, [0, 1]);
    assert.deepEqual(missing.leads[0].outstanding_facts, [{kind: 'interface', label: 'required adapter'}]);
    const unknown = {kind: 'interface', label: 'required adapter', state: 'unknown', evidence: null};
    await status(save(url, missing.version, {...missingFacts, leads: [{...restoredLead, facts: [...restoredLead.facts, unknown]}, second]}), 200);
    const incomplete = await read();
    assert.deepEqual(incomplete.leads[0].facts.at(-1), unknown);
    assert.deepEqual(incomplete.metrics.verified, [0, 1]);
    const archive = (await status(run(ap + '/backup'), 200)).json;
    assert.equal(archive.format, 'planner-registry-export/5');
    assert.equal(archive.pilot.length, 4);
    const restored = {DB: memoryD1()};
    await restoreRegistry(restored.DB, archive);
    const after = (await status(request(restored, url), 200)).json.cohort;
    assert.deepEqual(after.leads, incomplete.leads);
    assert.equal((await status(request(restored, ap + '/backup'), 200)).json.archive_digest, archive.archive_digest);
    const invalid = structuredClone(archive);
    invalid.pilot[1].snapshot.leads[0].review.pin = pin(corrected);
    for (let i = 1; i < invalid.pilot.length; i++) {
      const row = invalid.pilot[i];
      row.version = await pilotVersion(invalid.organisation.id, row, invalid.pilot[i - 1].version);
    }
    invalid.archive_digest = await archiveDigest(invalid);
    await assert.rejects(restoreRegistry(memoryD1(), invalid), /backup is incomplete or inconsistent/);
    const changedDecision = structuredClone(archive);
    changedDecision.pilot[1].snapshot.leads[0].decision.outcome = 'changed';
    changedDecision.archive_digest = await archiveDigest(changedDecision);
    await assert.rejects(restoreRegistry(memoryD1(), changedDecision), /backup is incomplete or inconsistent/);
  });

  test('operator draft is scoped to its author, exact equipment evidence and reviewed safe enquiry', async () => {
    const {run, create, item, revise, ap} = await setUp();
    const install = wire(await status(create(fixture(installation())), 201));
    const configuration = {record_type: 'configuration', installation: pin(install),
      fitted_modules: {coverage: 'partial', items: [{module_id: 'symbolic-head', state: 'reported_fitted', source_pointer: '/sources/0'}]},
      operating_envelopes: null};
    const config = wire(await status(create(fixture(configuration)), 201));
    const url = item(config) + '/survey', save = (draft, options = {}) =>
      run(url, 'alice', {expected_head: pin(config), expected_version: null, draft, ...options});
    const digest = 'a'.repeat(64);
    const connection = {endpoint: 'synthetic:exact-endpoint', interface: 'synthetic:interface-v2',
      status: 'present', evidence: {kind: 'sha256', value: digest, observed_at}};
    const draft = {step: 'connections', answers: {handling: {status: 'referral', detail: 'Ask an operator',
      evidence: null, connections: []}, connections: {status: 'unknown', detail: 'Private symbolic software note',
      evidence: null, connections: [connection]}}, enquiry: {status: 'ready_for_review', sections: ['connections', 'charges']}};
    await status(call(url), 401);
    await status(run(url, 'bob'), 404);
    await status(save({...draft, private_assessment: 'no'}), 400);
    await status(save({...draft, enquiry: {...draft.enquiry, status: 'reviewed'}}), 400);
    await status(save({...draft, answers: {connections: {...draft.answers.connections, evidence:
      {kind: 'reference', value: 'https://example.org/?private=secret', observed_at}}}}), 400);
    await status(save({...draft, answers: {connections: {...draft.answers.connections, connections:
      [{...connection, pins: {installation: pin(install)}}]}}}), 400);
    await status(save({...draft, answers: {connections: {...draft.answers.connections, connections:
      [{...connection, evidence: {...connection.evidence, value: [digest]}}]}}}), 400);
    const saved = (await status(save(draft), 200)).json;
    assert.equal(saved.current, true);
    assert.deepEqual(saved.draft.answers.connections.connections[0].pins, {installation: pin(install), configuration: pin(config)});
    assert.deepEqual(Object.keys(saved.draft.answers).sort(), ['connections', 'handling']);
    assert.equal(saved.draft.answers.handling.status, 'referral');
    assert.deepEqual((await status(run(url), 200)).json, saved);
    assert.equal((await status(run(url, 'editor'), 200)).json.draft, null);
    assert.equal((await status(run(url, 'reviewer'), 200)).json.draft, null);
    await status(save(draft), 409);
    await status(save({...draft, step: 'booking'}, {expected_version: saved.version, expected_policy_id: null, review: true}), 409);
    const approved = (await status(save(draft, {expected_version: saved.version, expected_policy_id: null, review: true}), 200)).json;
    assert.equal(approved.approved, true);
    assert.equal(approved.draft.enquiry.status, 'reviewed');
    assert.equal(approved.projection, saved.projection);
    assert.match(approved.projection, /Which drivers.*What charges/s);
    for (const marker of [digest, 'synthetic:exact-endpoint', 'Private symbolic software note', config.revision_id, 'Ask an operator'])
      assert(!approved.projection.includes(marker));
    const backup = (await status(run(ap + '/backup'), 200)).json;
    assert(!JSON.stringify(backup).includes('Private symbolic software note'));
    await status(run(root + '/public/' + config.record_id), 404);
    await status(run(item(config) + '/sharing', 'alice', {expected_head: pin(config), expected_policy_id: null, restricted: true}), 200);
    assert.equal((await status(run(url), 200)).json.approved, false);
    assert.equal((await status(run(url, 'editor'), 404)).status, 404);
    const next = wire(await status(revise(config, {action: 'review'}), 200));
    const staleDraft = (await status(run(url), 200)).json;
    assert.equal(staleDraft.current, false);
    assert.deepEqual(staleDraft.target, pin(config));
    const retry = {expected_head: pin(next), expected_version: approved.version, draft};
    await status(run(url, 'alice', retry), 409);
    const rebased = (await status(run(url, 'alice', {...retry, acknowledge_repin: pin(config)}), 200)).json;
    assert.equal(rebased.approved, false);
    assert.deepEqual(rebased.target, pin(next));
    assert.deepEqual(rebased.draft.answers.connections.connections[0].pins.configuration, pin(config));
  });

  test('twelve service alternatives use reported bounds, coupled unknowns and known hardware; one reviewed answer refreshes two private captures', async () => {
    const {env, run, create, item, revise, ap} = await setUp();
    const read = async p => wire(await status(p, 201));
    const install = await read(create(fixture(installation())));
    const config = await read(create(fixture({record_type: 'configuration', installation: pin(install),
      fitted_modules: {coverage: 'partial', items: [
        {module_id: 'head-a', state: 'reported_fitted', source_pointer: '/sources/0'},
        {module_id: 'head-b', state: 'reported_absent', source_pointer: '/sources/0'},
      ]},
      operating_envelopes: [{envelope_id: 'joint', source_pointer: null, conditions: ['closure-attached'],
        all_of: [{observable_id: 'point', operator: 'lte', threshold: {schema_version: '0.1.0', value: '4',
          dimension: 'dimension', unit: 'unit', basis: 'basis', reference: {kind: 'none', id: null, conditions: []},
          provenance: {kind: 'reviewer_asserted', evidence: [], explanation: 'Synthetic bound'}}}]}]})));
    const method = {namespace: 'synthetic:method', native_id: 'fixture-method'};
    const material = {namespace: 'synthetic:material', native_id: 'fixture-material'};
    const offer = {record_type: 'offer', label: 'Survey decision example', state: 'listed', provider: {namespace: 'synthetic:provider', native_id: 'operator'},
      backing_installations: [pin(install)], backing_configurations: [pin(config)], external_id_claims: [],
      access_policy: {revision: {source: {namespace: 'synthetic:policy', native_id: 'policy', version: '1'},
        content_digest: src.snapshot_digest}, facility_default: null, effective_from: observed_at, effective_until: '2099-01-01'},
      material_exclusions: [], terms: {methods: null, accepted_inputs: [material], output_deliverables: null,
        delivery_modes: null, price: null, lead_times: null, routes: null}};
    const service = await read(create(fixture(offer)));
    const request = {method, material, conditions: [], required_modules: ['head-a', 'fixture-handler', 'fixture-grip'],
      requirements: [{observable_id: 'point', value: '2', dimension: 'dimension', unit: 'unit', basis: 'basis', reference: {kind: 'none', id: null}}]};
    const match = (r, input, user = 'alice', code = 200) => status(run(item(r) + '/match', user,
      {expected_head: pin(r), ...input}), code).then(response => response.json);
    const comparison = await match(service, {...request, questions: true});
    assert.equal(comparison.match.technical_fit, 'unknown');
    assert.deepEqual(comparison.match.configurations[0].required_modules,
      {fitted: ['head-a'], missing: [], unknown: ['fixture-handler', 'fixture-grip']});
    assert.equal(comparison.questions.reduce((n, q) => n + q.alternatives.length, 0), 12);
    const keys = new Set();
    for (const q of comparison.questions) {
      assert(q.who && q.why && q.scope.startsWith('Private assessment'));
      assert.equal(q.before.route, comparison.match.route);
      assert.equal(q.before.technical_fit, 'unknown');
      for (const a of q.alternatives) keys.add(q.id + ':' + a.label);
    }
    assert.equal(keys.size, 12);
    const effects = (id, ...fields) => comparison.questions.find(q => q.id === id).alternatives.map(a => fields.map(f => a.consequence[f]));
    for (const dimension of ['training', 'eligibility', 'provider_willingness'])
      assert.deepEqual(effects(dimension, 'reported_status', 'route'),
        [['reported_affirmed', 'reported_policy_incomplete'], ['reported_denied', 'reported_access_denied']]);
    assert.deepEqual(effects('availability', 'reported_status', 'access'),
      [['reported_available', 'unverified'], ['reported_unavailable', 'unverified']]);
    assert.deepEqual(effects('method', 'method', 'route'),
      [['matches', 'technical_fit_unknown'], ['not_listed', 'outside_reported_policy']]);
    const joint = comparison.questions.find(q => q.id.startsWith('configuration:'));
    assert.match(joint.question, /fixture-handler, fixture-grip, closure-attached/);
    assert.match(joint.why, /Already reported fitted: head-a/);
    assert.deepEqual(effects(joint.id, 'technical_fit', 'configuration_fit'),
      [['reported_fit', 'reported_fit'], ['unknown', 'unknown']]);
    assert.equal(comparison.reviewed_answers.length, 0);
    const explicitMissing = await match(service, {...request, required_modules: ['head-b'], conditions: ['closure-attached'], questions: true});
    assert.equal(explicitMissing.match.technical_fit, 'no_joint_fit');
    assert(!explicitMissing.questions.some(q => q.id.startsWith('configuration:')));
    const partial = await match(service, {...request, conditions: ['closure-attached'], required_modules: ['head-a', 'fixture-grip']});
    assert.equal(partial.match.technical_fit, 'unknown', 'one unresolved module still prevents fit');
    await match(service, {...request, hypothetical: {modules: 'present'}}, 'alice', 400);

    const settled = await read(create(fixture({...offer, terms: {...offer.terms, methods: [method]}})));
    const input = {...request, required_modules: ['head-a'], conditions: ['closure-attached'], save: true};
    const one = await match(settled, input, 'alice', 201);
    const two = await match(settled, {...input, requirements: [{...input.requirements[0], value: '3'}]}, 'alice', 201);
    const other = await match(settled, input, 'editor', 201);
    const assessor = async (id, user) => (await status(run(ap + '/assessments/' + id, user), 200)).json.assessment;
    const originals = await Promise.all([one, two].map(x => assessor(x.assessment_id, 'alice')));
    const editorOriginal = await assessor(other.assessment_id, 'editor');
    const training = await read(create(fixture({record_type: 'access_claim', target: pin(settled), dimension: 'training', outcome: 'denied',
      subject: {kind: 'principal', id: 'u-alice'}, observed_at, valid_until: null, supporting_assertions: []}, 'restricted')));
    const refresh = (answer, actor = 'alice') => run(item(settled) + '/refresh-matches', actor, {expected_head: pin(settled), reviewed_answer: pin(answer)});
    await status(refresh(training), 409);
    const reviewed = wire(await status(revise(training, {action: 'review'}), 200));
    const ownerGuide = await match(settled, {...input, save: false, questions: true});
    assert.deepEqual(ownerGuide.reviewed_answers.map(x => x.reference), [pin(reviewed)]);
    const editorGuide = await match(settled, {...input, save: false, questions: true}, 'editor');
    assert.deepEqual(editorGuide.reviewed_answers, []);
    assert(editorGuide.questions.some(q => q.id === 'training'));
    assert(!JSON.stringify(editorGuide).includes(reviewed.revision_id));
    await status(refresh(reviewed, 'editor'), 409);
    const attempts = await Promise.all([refresh(reviewed), refresh(reviewed)]);
    assert.equal(attempts.filter(r => r.status === 201).length, 1, 'a concurrent retry cannot create duplicate descendants');
    assert(attempts.every(r => [200, 201, 409].includes(r.status)));
    const updated = attempts.find(r => r.status === 201).json.refreshed;
    assert.equal(updated.length, 2);
    for (const pair of updated) {
      assert.equal(pair.before.route, 'reported_fit_access_unverified');
      assert.equal(pair.after.route, 'reported_access_denied');
      assert.equal(pair.before.training, 'unknown');
      assert.equal(pair.after.training, 'reported_denied');
      const original = originals.find(x => x.id === pair.prior_id);
      const old = await assessor(pair.prior_id, 'alice'), fresh = await assessor(pair.assessment_id, 'alice');
      assert.deepEqual(old.match, original.match);
      assert.deepEqual(fresh.match.input, original.match.input);
      assert.equal(old.current, false);
      assert.equal(fresh.current, true);
      assert.deepEqual(fresh.match.refresh, {prior_id: original.id, answer: pin(reviewed)});
    }
    assert.deepEqual((await status(refresh(reviewed), 200)).json.refreshed, []);
    assert.deepEqual(await assessor(other.assessment_id, 'editor'), editorOriginal);
    const archive = (await status(run(ap + '/backup'), 200)).json;
    const restored = {DB: memoryD1()};
    await restoreRegistry(restored.DB, archive);
    assert.deepEqual((await status(requestForRestored(updated[0].assessment_id), 200)).json.assessment,
      await assessor(updated[0].assessment_id, 'alice'));
    function requestForRestored(id) { return call(ap + '/assessments/' + id, {env: restored, user: 'alice'}); }
    const forged = structuredClone(archive), record = forged.assessments.find(a => a.id === updated[0].assessment_id);
    const captured = JSON.parse(record.match_input);
    captured.refresh.prior_id = other.assessment_id;
    record.match_input = canonical(captured);
    forged.archive_digest = await archiveDigest(forged);
    await assert.rejects(restoreRegistry(memoryD1(), forged), /incomplete or inconsistent/);
    assert.equal(env.DB._db.prepare('SELECT COUNT(*) AS n FROM registry_assessments').get().n, 5);

    // Restrict an old report after the candidate read. Its corrected head no
    // longer applies to the offer, so only the predecessor guard can catch it.
    const orgClaim = {record_type: 'access_claim', target: pin(settled), dimension: 'eligibility', outcome: 'affirmed',
      subject: {kind: 'organisation', id: settled.organisation_id}, observed_at, valid_until: null, supporting_assertions: []};
    const oldReport = await read(create(fixture(orgClaim)));
    const raced = await match(settled, input, 'editor', 201);
    const movedReport = wire(await status(revise(oldReport, fixture({...orgClaim, target: pin(service)})), 200));
    const sharedTraining = await read(create(fixture({...orgClaim, dimension: 'training', outcome: 'denied'})));
    const reviewedShared = wire(await status(revise(sharedTraining, {action: 'review'}), 200));
    const prepare = env.DB.prepare;
    let injected = false;
    env.DB.prepare = sql => {
      const statement = prepare(sql);
      if (!sql.startsWith('INSERT INTO registry_assessments (org_id,id') || injected) return statement;
      return {...statement, bind(...args) {
        const bound = statement.bind(...args);
        return {...bound, async run() {
          injected = true;
          await status(run(item(movedReport) + '/sharing', 'alice',
            {expected_head: pin(movedReport), expected_policy_id: null, restricted: true}), 200);
          return bound.run();
        }};
      }};
    };
    try {
      await status(refresh(reviewedShared, 'editor'), 409);
      assert(injected);
    } finally { env.DB.prepare = prepare; }
    assert.equal(env.DB._db.prepare('SELECT COUNT(*) AS n FROM registry_assessments').get().n, 6);
    assert.equal((await assessor(raced.assessment_id, 'editor')).match, undefined);
    assert.deepEqual((await status(refresh(reviewedShared, 'editor'), 201)).json.refreshed.map(r => r.prior_id),
      [other.assessment_id]);

    const many = await Promise.all(Array.from({length: 13}, () => match(service, {...request, save: true}, 'alice', 201)));
    const moreTraining = await read(create(fixture({...orgClaim, target: pin(service), dimension: 'training', outcome: 'denied'})));
    const moreReviewed = wire(await status(revise(moreTraining, {action: 'review'}), 200));
    const nextBatch = () => run(item(service) + '/refresh-matches', 'alice',
      {expected_head: pin(service), reviewed_answer: pin(moreReviewed)});
    const batch1 = (await status(nextBatch(), 201)).json, batch2 = (await status(nextBatch(), 201)).json;
    assert.deepEqual([batch1.more, batch1.refreshed.length, batch2.more, batch2.refreshed.length], [true, 12, false, 1]);
    assert.deepEqual([...batch1.refreshed, ...batch2.refreshed].map(r => r.prior_id).sort(), many.map(r => r.assessment_id).sort());
    assert.deepEqual((await status(nextBatch(), 200)).json, {refreshed: [], more: false});
  });

  test('service policy, configuration alternatives, reported access and dated availability stay separate', async () => {
    const {env, run, create, item, revise, bp, ap} = await setUp();
    const method = {namespace: 'synthetic:method', native_id: 'method-a'};
    const otherMethod = {...method, native_id: 'method-b'};
    const material = {namespace: 'synthetic:material', native_id: 'material-a'};
    const prohibited = {...material, native_id: 'material-excluded'};
    const provider = {namespace: 'synthetic:facility', native_id: 'provider-a'};
    const policy = {source: {namespace: 'synthetic:policy', native_id: 'policy', version: '1'}, content_digest: src.snapshot_digest};
    const dates = {effective_from: observed_at, effective_until: '2099-01-01'};
    const terms = {methods: [method], accepted_inputs: [material, prohibited], output_deliverables: null, delivery_modes: ['staff_delivered'],
      price: null, lead_times: null, routes: null};
    const offer = (extra = {}) => ({record_type: 'offer', label: 'Synthetic service', state: 'listed', provider,
      backing_installations: null, backing_configurations: null, external_id_claims: [],
      access_policy: {revision: policy, facility_default: null, ...dates}, material_exclusions: [prohibited], terms, ...extra});
    const read = async p => wire(await status(p, 201));
    const i = await read(create(fixture(installation())));
    const i2 = await read(create(fixture(installation('Second alternative'))));
    const ib = await read(create(fixture(installation()), 'bob', bp));
    const limit = (observable_id, value, dimension, unit, basis) => ({
      observable_id, operator: 'lte', threshold: {schema_version: '0.1.0', value, dimension, unit, basis,
        reference: {kind: dimension === 'pressure' ? 'declared' : 'none', id: dimension === 'pressure' ? 'absolute' : null, conditions: []},
        provenance: {kind: 'source_stated', evidence: [{document_id: src.source.native_id,
          document_digest: src.snapshot_digest, pointer: '/limits/' + observable_id}], explanation: null}},
    });
    const config = (i, temp, pressure) => ({record_type: 'configuration', installation: pin(i), fitted_modules: null,
      operating_envelopes: [{envelope_id: 'bounds', source_pointer: '/sources/0', conditions: [],
        all_of: [limit('temperature', temp, 'temperature', 'Cel', 'absolute_value'), limit('pressure', pressure, 'pressure', 'bar', 'absolute')]}]});
    const c = await read(create(fixture(config(i, '80', '2'))));
    const c2 = await read(create(fixture(config(i2, '30', '8'))));
    const cb = await read(create(fixture(config(ib, '80', '2')), 'bob', bp));
    const facilityRecord = offer({label: 'Reported facility default', access_policy: {revision: {
      ...policy, source: {...policy.source, namespace: 'planner:facility_policy'}}, facility_default: null, ...dates}});
    const designation = {kind: 'facility_default', contacts: {}};
    await status(create({...fixture(offer()), service: designation}), 400);
    await status(create(fixture(facilityRecord)), 400);
    const facility = await read(create({...fixture(facilityRecord), service: designation}));
    const local = {source: {namespace: 'planner:registry_offer', native_id: facility.record_id, version: facility.revision_id},
      content_digest: facility.content_digest};
    const contacts = {kind: 'service', contacts: {provider_contact: 'Synthetic desk', custodian: 'Reported custodian',
      operator: 'Reported operator', access_approver: 'Unverified reported approver'}};
    const serviceRecord = offer({backing_installations: [pin(i), pin(i2)], backing_configurations: [pin(c), pin(c2)],
      access_policy: {revision: policy, facility_default: local, ...dates}, material_exclusions: null,
      terms: {...terms, methods: null, accepted_inputs: null, routes: [{kind: 'enquiry', url: 'https://example.org/enquire'}]}});
    await status(create(fixture({...serviceRecord, backing_installations: [pin(ib)]})), 400);
    await status(create(fixture({...serviceRecord, backing_configurations: [{...pin(c), content_digest: src.snapshot_digest}]})), 400);
    await status(create(fixture({...serviceRecord, provider: {...provider, native_id: 'other-provider'}})), 400);
    await status(create({...fixture(serviceRecord), service: designation}), 400);
    await status(create(fixture({...serviceRecord, terms: {...terms, routes: [{kind: 'enquiry', url: 'https://example.org/enquire?private=subject'}]}})), 400);
    const service = await read(create({...fixture(serviceRecord, 'public'), service: contacts}));
    const comparable = await read(create(fixture(offer({backing_configurations: [pin(cb)],
      terms: {...terms, methods: [otherMethod]}})), 'bob', bp));
    const requestFor = (target, extra = {}) => ({expected_head: pin(target), method, material, conditions: [],
      requirements: [{observable_id: 'temperature', value: '50', dimension: 'temperature', unit: 'Cel', basis: 'absolute_value', reference: {kind: 'none', id: null}},
        {observable_id: 'pressure', value: '1', dimension: 'pressure', unit: 'bar', basis: 'absolute', reference: {kind: 'declared', id: 'absolute'}}], ...extra});
    const match = (target, extra, user = 'alice', path = item(target)) => run(path + '/match', user, requestFor(target, extra));
    const assess = async (...args) => (await status(match(...args), 200)).json.match;

    const joint = await assess(service, {requirements: requestFor(service).requirements.map(r => r.observable_id === 'pressure' ? {...r, value: '5'} : r)});
    assert.equal(joint.technical_fit, 'no_joint_fit');
    assert.equal(joint.configurations.length, 2);
    assert.deepEqual(joint.configurations.map(r => r.technical_fit), ['outside_limits', 'outside_limits']);
    const fit = await assess(service);
    assert.equal(fit.technical_fit, 'reported_fit');
    assert.equal(fit.method, 'matches');
    assert.equal(fit.policy.fields.methods, 'facility_default');
    assert.equal(fit.policy.facility_default.revision_id, facility.revision_id);
    assert.equal(fit.policy.facility_default_dates.effective_from, observed_at);
    assert.equal(fit.policy.facility_default_dates.effective_until, dates.effective_until);
    assert.deepEqual(fit.enquiry_routes, serviceRecord.terms.routes);
    assert.equal((await assess(service, {material: prohibited})).route, 'outside_reported_policy');
    assert.equal((await assess(service, {requirements: requestFor(service).requirements.map(r => ({...r, basis: 'unresolved'}))})).technical_fit, 'unknown');
    const pressure = reference => requestFor(service).requirements.map(r =>
      r.observable_id === 'pressure' ? {...r, reference} : r);
    assert.equal((await assess(service, {requirements: pressure(null)})).technical_fit, 'unknown');
    assert.equal((await assess(service, {requirements: pressure({kind: 'declared', id: 'gauge'})})).technical_fit, 'unknown');
    const unknownReference = config(i, '80', '2');
    unknownReference.operating_envelopes[0].all_of[1].threshold.reference = null;
    const unknownConfiguration = await read(create(fixture(unknownReference)));
    const incomplete = await read(create(fixture(offer({backing_configurations: [pin(unknownConfiguration)]}))));
    assert.equal((await assess(incomplete)).technical_fit, 'unknown');
    const explicitOverride = await read(create(fixture({...serviceRecord, terms: {...serviceRecord.terms, methods: []}})));
    const overridden = await assess(explicitOverride);
    assert.equal(overridden.policy.fields.methods, 'offer');
    assert.equal(overridden.method, 'not_listed');
    const missingDefault = await read(create(fixture({...serviceRecord, access_policy: {...serviceRecord.access_policy, facility_default: policy}})));
    const unresolved = await assess(missingDefault);
    assert.equal(unresolved.policy.facility_default_status, 'external_rules_unavailable');
    assert.equal(unresolved.method, 'unknown');
    const differentPolicy = await assess(comparable, {}, 'bob', bp + '/records/' + comparable.record_id);
    assert.equal(differentPolicy.technical_fit, 'reported_fit');
    assert.equal(differentPolicy.method, 'not_listed');
    await status(match(service, {}, 'bob'), 404);

    const claim = (dimension, outcome, extra = {}) => ({record_type: 'access_claim', target: pin(service), dimension, outcome,
      subject: {kind: 'principal', id: 'u-alice'}, observed_at, valid_until: null, supporting_assertions: [], ...extra});
    await status(create(fixture(claim('eligibility', 'affirmed'))), 400);
    await status(create(fixture(claim('eligibility', 'affirmed', {subject: {kind: 'organisation', id: 'not-this-tenant'}}))), 400);
    await status(create(fixture({...claim('eligibility', 'affirmed'), verified_authority: {type: 'person', id: 'u-alice'}}, 'restricted')), 400);
    const shared = (await status(match(service, {save: true}), 201)).json.assessment_id;
    const sharedPath = ap + '/assessments/' + shared;
    const sharedEditorBefore = (await status(run(sharedPath, 'editor'), 200)).json.assessment;
    assert.equal(sharedEditorBefore.current, null);
    assert.equal(Object.hasOwn(sharedEditorBefore, 'match'), false);
    assert.equal((await status(run(sharedPath), 200)).json.assessment.current, true);
    const eligibility = await read(create(fixture(claim('eligibility', 'affirmed'), 'restricted')));
    assert.equal((await status(run(sharedPath), 200)).json.assessment.current, false);
    assert.deepEqual((await status(run(sharedPath, 'editor'), 200)).json.assessment, sharedEditorBefore);

    const training = await read(create(fixture(claim('training', 'affirmed', {valid_until: '2026-01-03T00:00:00Z'}),
      'restricted', [src], '2026-01-03T00:00:00Z')));
    const unrelatedSubject = await read(create(fixture(claim('eligibility', 'denied', {subject: {kind: 'principal', id: 'u-reviewer'}}), 'restricted')));
    const actual = await assess(service);
    const summary = actual.evidence[0].dimensions;
    assert.equal(summary.eligibility.reported_status, 'reported_affirmed');
    assert.equal(summary.eligibility.verified_status, 'unknown');
    assert.equal(summary.availability.reported_status, 'unknown');
    assert.equal(summary.training.reported_status, 'unknown');
    assert.equal(actual.evidence[0].reports.find(r => r.reference.record_id === training.record_id).status, 'expired');
    assert.ok(!JSON.stringify(actual).includes(unrelatedSubject.record_id));
    assert.ok(!JSON.stringify(actual).includes('u-alice'));
    assert.equal(actual.execution_authorized, false);
    assert.equal(actual.booking_created, false);
    assert.equal((await assess(service, {}, 'editor')).evidence[0].reports.length, 0);
    assert.equal((await assess(service, {}, 'reviewer')).evidence[0].dimensions.eligibility.reported_status, 'reported_denied');
    const asserted = await read(create(fixture(assertion(service, 'affirmed', {claim_kind: 'availability'}))));
    const avail = (state, extra = {}) => ({record_type: 'availability_claim', target: pin(service), state, observed_at,
      valid_until: null, window: null, supporting_assertions: [pin(asserted)], ...extra});
    await status(create(fixture(avail('available', {window: {starts_at: '2027-02-01T00:00:00Z', ends_at: '2027-01-01T00:00:00Z'}}))), 400);
    await status(create(fixture(claim('eligibility', 'affirmed', {supporting_assertions: [pin(asserted)]}), 'restricted')), 400);
    const opposite = await read(create(fixture(assertion(service, 'denied', {claim_kind: 'provider_willingness'}))));
    const unsupportedAffirmation = await read(create(fixture(claim('provider_willingness', 'affirmed', {
      supporting_assertions: [pin(opposite)]}), 'restricted')));
    const disputed = (await assess(service)).evidence[0];
    assert.equal(disputed.dimensions.provider_willingness.reported_status, 'disputed');
    const supportConflict = disputed.reports.find(r => r.reference.record_id === unsupportedAffirmation.record_id);
    assert.equal(supportConflict.status, 'contradictory_support');
    assert.equal(supportConflict.assertions[0].outcome, 'denied');
    const available = await read(create(fixture(avail('available'))));
    const unavailable = await read(create(fixture(avail('unavailable', {supporting_assertions: []}))));
    assert.equal((await assess(service)).evidence[0].dimensions.availability.reported_status, 'conflicting_reports');

    const saved = (await status(match(service, {save: true}), 201)).json;
    const captured = (await status(run(ap + '/assessments/' + saved.assessment_id), 200)).json.assessment;
    assert.equal(captured.current, true);
    assert.equal(captured.match.input.material.native_id, material.native_id);
    assert.equal(captured.match.result.policy.facility_default.revision_id, facility.revision_id);
    assert.equal(captured.match.result.execution_authorized, false);
    assert.ok(captured.dependencies.some(d => d.reference.revision_id === eligibility.revision_id));
    assert.ok(captured.dependencies.some(d => d.reference.revision_id === available.revision_id));
    assert.ok(captured.dependencies.some(d => d.reference.revision_id === unavailable.revision_id));
    await status(run(ap + '/assessments/' + saved.assessment_id, 'editor'), 404);
    await read(create(fixture(claim('training', 'denied', {subject: {kind: 'principal', id: 'u-reviewer'}}), 'restricted')));
    const savedPath = ap + '/assessments/' + saved.assessment_id;
    assert.equal((await status(run(savedPath), 200)).json.assessment.current, true);

    // Insert a newly applicable denial in the gap before the conditional save.
    // The real SQLite statement must refuse this earlier snapshot.
    let denial;
    const wrapped = {DB: {...env.DB, prepare(sql) {
      const q = env.DB.prepare(sql);
      if (!sql.includes('INSERT INTO registry_assessments (org_id,id,actor,created_at,visibility,refs,match_input)')) return q;
      return {bind: (...args) => {
        const bound = q.bind(...args);
        return {...bound, async run() {
          denial = await read(create(fixture(claim('eligibility', 'denied'), 'restricted')));
          return bound.run();
        }};
      }};
    }}};
    await status(request(wrapped, item(service) + '/match', 'alice', requestFor(service, {save: true})), 409);
    const claimStale = (await status(run(savedPath), 200)).json.assessment;
    assert.equal(claimStale.current, false);
    assert.deepEqual(claimStale.match, captured.match);
    assert.ok(!JSON.stringify(claimStale).includes(denial.record_id));
    assert.equal((await assess(service)).evidence[0].dimensions.eligibility.reported_status, 'conflicting_reports');

    const editorCapture = (await status(match(service, {save: true}, 'editor'), 201)).json.assessment_id;
    const {sharing: assertionPolicy} = (await status(run(item(asserted) + '/sharing'), 200)).json;
    await status(run(item(asserted) + '/sharing', 'alice',
      {expected_head: pin(asserted), expected_policy_id: assertionPolicy.policy_id, restricted: true}), 200);
    await status(run(item(available) + '/history', 'editor'), 404);
    const editorAfter = (await status(run(ap + '/assessments/' + editorCapture, 'editor'), 200)).json.assessment;
    assert.equal(editorAfter.current, false);
    assert.equal(Object.hasOwn(editorAfter, 'match'), false);
    assert.ok(!JSON.stringify(editorAfter).includes(available.record_id));
    assert.equal((await assess(service, {}, 'editor')).evidence[0].dimensions.availability.reported_status, 'reported_unavailable');

    const newDefault = wire(await status(revise(facility, {...fixture({...facilityRecord, terms: {...terms, methods: [otherMethod]}}),
      service: designation}), 200));
    assert.notEqual(newDefault.revision_id, facility.revision_id);
    assert.equal((await assess(service)).policy.facility_default_status, 'revised');
    const stale = (await status(run(ap + '/assessments/' + saved.assessment_id), 200)).json.assessment;
    assert.equal(stale.current, false);
    assert.deepEqual(stale.match, captured.match);
    assert.equal(stale.dependencies.find(d => d.reference.record_id === facility.record_id).status, 'revised');
    const withdrawn = wire(await status(revise(service, {action: 'withdraw'}, 'reviewer'), 200));
    assert.equal((await assess(withdrawn)).route, 'withdrawn');
    await status(match(service), 409);
    assert.equal((await run(item(service) + '/history')).json.history.length, 2);
    const {sharing} = (await status(run(item(i) + '/sharing'), 200)).json;
    await status(run(item(i) + '/sharing', 'alice', {expected_head: pin(i), expected_policy_id: sharing.policy_id, restricted: true}), 200);
    for (const route of [item(service), item(service) + '/history', item(available), item(available) + '/history']) await status(run(route, 'editor'), 404);
    await status(match(withdrawn, {}, 'editor'), 404);
    assert.ok(!(await run(ap + '/records', 'editor')).json.records.some(r => r.record.record_id === service.record_id));
    await status(run(root + '/public/' + service.record_id, ''), 404);
    assert.ok(!JSON.stringify((await run(root + '/public', '')).json).includes('Unverified reported approver'));

    const archive = (await status(run(ap + '/backup'), 200)).json;
    assert.equal(archive.format, 'planner-registry-export/3');
    const restored = {DB: memoryD1()};
    await restoreRegistry(restored.DB, archive);
    const copy = await status(request(restored, ap + '/assessments/' + saved.assessment_id), 200);
    assert.deepEqual(copy.json.assessment, (await run(ap + '/assessments/' + saved.assessment_id)).json.assessment);
    const forgedDesignation = structuredClone(archive);
    forgedDesignation.revisions.find(r => r.record.revision_id === facility.revision_id).service.kind = 'service';
    forgedDesignation.archive_digest = await archiveDigest(forgedDesignation);
    await assert.rejects(restoreRegistry(memoryD1(), forgedDesignation), /incomplete or inconsistent/);
    const forgedResult = structuredClone(archive);
    const archivedMatch = forgedResult.assessments.find(a => a.id === saved.assessment_id);
    const capture = JSON.parse(archivedMatch.match_input);
    capture.result.evidence[0].dimensions.eligibility.verified_status = 'confirmed';
    archivedMatch.match_input = canonical(capture);
    forgedResult.archive_digest = await archiveDigest(forgedResult);
    await assert.rejects(restoreRegistry(memoryD1(), forgedResult), /incomplete or inconsistent/);
    const forged = structuredClone(archive);
    const r = forged.revisions.find(r => r.record.revision_id === withdrawn.revision_id).record;
    r.record.backing_configurations[0].content_digest = src.snapshot_digest;
    r.content_digest = await wireDigest(r);
    forged.archive_digest = await archiveDigest(forged);
    await assert.rejects(restoreRegistry(memoryD1(), forged), /incomplete or inconsistent/);
  });

  test('installation reconciliation preserves distinct histories, suppresses releases and scopes both sides', async () => {
    const {env, run, create, item, revise, assess, ap, bp} = await setUp();
    const read = async p => wire(await status(p, 201));
    const sourceData = fixture(installation('Same symbolic instrument'), 'public');
    let source = await read(create(sourceData));
    const original = source;
    const canonicalReport = await read(create(fixture(installation('Same symbolic instrument'))));
    const other = await read(create(fixture(installation('Unrelated installation'))));
    const foreign = await read(create(fixture(installation('Same symbolic instrument')), 'bob', bp));
    const group = await read(create(fixture({...installation('Grouped report'), record_type: 'installation_group', reported_count: 2})));
    const date = '2026-01-11', reason = 'Synthetic report identity evidence';
    const event = (source, target, action = 'link') => ({action, expected_head: pin(source), expected_target: pin(target),
      observed_at: date, reason, source_url: 'https://example.org/symbolic-identity'});
    const reconcile = (source, target, action = 'link', actor = 'alice') =>
      run(item(source) + '/reconciliation', actor, event(source, target, action));
    const move = (source, location, extra = {}) => ({expected_head: pin(source), observed_at: date,
      reason: 'Synthetic dated location evidence', reported_location: location, source: {...src,
        source: {...src.source, version: 'dated-location', url: 'https://example.org/symbolic-location'}}, ...extra});
    const publish = async source => {
      const {sharing} = (await status(run(item(source) + '/sharing'), 200)).json;
      return run(item(source) + '/publication', 'alice', {expected_head: pin(source), expected_policy_id: sharing.policy_id, publish: true});
    };
    source = wire(await status(revise(source, {action: 'review'}, 'reviewer'), 200));
    await status(publish(source), 200);
    const anonymous = root + '/public/' + source.record_id;
    await status(run(anonymous, ''), 200);
    const dependent = (await status(assess([pin(source)]), 201)).json.assessment.id;
    const targetAssessment = (await status(assess([pin(canonicalReport)]), 201)).json.assessment.id;
    const unrelated = (await status(assess([pin(other)]), 201)).json.assessment.id;
    const currentness = async id => (await status(run(ap + '/assessments/' + id), 200)).json.assessment.current;
    const config = ref => ({record_type: 'configuration', installation: pin(ref), fitted_modules: null,
      operating_envelopes: [{envelope_id: 'symbolic-envelope', conditions: [], source_pointer: null, all_of: [{
        observable_id: 'test-quantity', operator: 'lte', threshold: {schema_version: '0.1.0', value: '2',
          dimension: 'test-dimension', unit: 'test-unit', basis: 'test-basis', reference: {kind: 'none', id: null, conditions: []},
          provenance: {kind: 'reviewer_asserted', evidence: [], explanation: 'Synthetic bound'}},
      }]}]});
    const backing = await read(create(fixture(config(source))));
    const offer = extra => ({record_type: 'offer', label: 'Synthetic installed service', state: 'listed',
      provider: null, backing_installations: null, backing_configurations: [pin(backing)], external_id_claims: [],
      access_policy: null, material_exclusions: null, terms: {methods: null, accepted_inputs: null, output_deliverables: null,
        delivery_modes: null, price: null, lead_times: null, routes: null}, ...extra});
    const service = await read(create(fixture(offer())));
    const checkService = async () => (await status(run(item(service) + '/match', 'alice', {
      expected_head: pin(service), method: null, material: null, conditions: [], requirements: [{
        observable_id: 'test-quantity', value: '1', dimension: 'test-dimension', unit: 'test-unit', basis: 'test-basis',
        reference: {kind: 'none', id: null}}]}), 200)).json.match;
    assert.equal((await checkService()).technical_fit, 'reported_fit');
    const positive = await read(create(fixture(assertion(source, 'affirmed'))));
    const negative = await read(create(fixture(assertion(source, 'denied', {related_assertions: [pin(positive)]}))));
    await status(reconcile(source, canonicalReport, 'link', 'editor'), 403);
    await status(reconcile(source, canonicalReport, 'link', 'reviewer'), 403);
    await status(reconcile(source, canonicalReport, 'link', 'bob'), 404);
    await status(reconcile(source, foreign), 400);
    await status(reconcile(source, group), 400);
    await status(reconcile(source, source), 400);
    await status(run(item(source) + '/reconciliation', 'alice', {...event(source, canonicalReport),
      expected_target: {...pin(canonicalReport), content_digest: src.snapshot_digest}}), 409);
    assert.equal((await status(run(item(canonicalReport) + '/reconciliation'), 200)).json.duplicate_sources.length, 0);
    const linkedResponse = await status(reconcile(source, canonicalReport), 200);
    const linked = wire(linkedResponse);
    assert.equal(linkedResponse.json.revision.state, 'retired');
    assert.deepEqual(linkedResponse.json.revision.installation_event.target, pin(canonicalReport));
    assert.deepEqual(linked.record, source.record);
    assert.deepEqual(linked.sources, source.sources);
    assert.match(linked.revision_id, /^event-[0-9a-f]{64}$/);
    await status(create(fixture(config(source))), 409);
    await status(create(fixture(config(linked))), 409);
    await status(create(fixture(offer())), 409);
    await status(create(fixture(offer({backing_installations: [pin(source)], backing_configurations: null}))), 409);
    assert.equal((await status(run(item(backing)), 200)).json.revision.duplicate_backing, true);
    const staleFit = await checkService();
    assert.equal(staleFit.technical_fit, 'unknown');
    assert.equal(staleFit.execution_authorized, false);
    await status(reconcile(source, canonicalReport), 409);
    await status(reconcile(canonicalReport, other), 409);
    await status(reconcile(other, linked), 409);
    await status(revise(linked, {action: 'restore'}), 409);
    await status(run(item(linked) + '/move', 'alice', move(linked, 'Wrong state')), 409);
    await status(run(anonymous, ''), 404);
    assert.ok(!(await run(root + '/public', '')).json.publications.some(p => p.record_id === source.record_id));
    assert.equal(await currentness(dependent), false);
    assert.equal(await currentness(targetAssessment), true);
    assert.equal(await currentness(unrelated), true);
    const sourceHistory = (await status(run(item(source) + '/history', 'editor'), 200)).json.history;
    assert.deepEqual(sourceHistory.map(r => r.record.revision_id), [original.revision_id, source.revision_id, linked.revision_id]);
    const reports = (await status(run(item(source) + '/claims'), 200)).json.claims;
    assert.deepEqual(new Set(reports.map(r => r.record.record_id)), new Set([positive.record_id, negative.record_id]));
    assert.deepEqual((await status(run(item(canonicalReport) + '/reconciliation', 'editor'), 200)).json.duplicate_sources.map(r => r.reference.record_id), [source.record_id]);
    assert.equal((await status(run(ap + '/records', 'editor'), 200)).json.records.find(r => r.record.record_id === canonicalReport.record_id).duplicate_count, 1);

    const restrict = async (w, restricted) => {
      const {sharing} = (await status(run(item(w) + '/sharing'), 200)).json;
      await status(run(item(w) + '/sharing', 'alice', {expected_head: pin(w), expected_policy_id: sharing.policy_id, restricted}), 200);
    };
    await restrict(linked, true);
    assert.deepEqual((await status(run(item(canonicalReport) + '/reconciliation', 'editor'), 200)).json.duplicate_sources, []);
    assert.equal(Object.hasOwn((await status(run(item(canonicalReport), 'editor'), 200)).json.revision, 'duplicate_count'), false);
    await restrict(linked, false);
    await restrict(canonicalReport, true);
    await status(run(item(linked), 'editor'), 404);
    await status(run(item(linked) + '/history', 'editor'), 404);
    await status(run(item(linked) + '/reconciliation', 'bob'), 404);
    const restrictedArchive = (await status(run(ap + '/backup'), 200)).json;
    assert.equal(restrictedArchive.format, 'planner-registry-export/4');
    const restored = {DB: memoryD1()};
    await restoreRegistry(restored.DB, restrictedArchive);
    await status(request(restored, item(linked) + '/history', 'editor'), 404);
    assert.deepEqual((await status(request(restored, item(canonicalReport) + '/reconciliation'), 200)).json.duplicate_sources.map(r => r.reference.record_id), [source.record_id]);
    const forged = structuredClone(restrictedArchive);
    forged.revisions.find(r => r.record.revision_id === linked.revision_id).installation_event.target.content_digest = src.snapshot_digest;
    forged.archive_digest = await archiveDigest(forged);
    await assert.rejects(restoreRegistry(memoryD1(), forged), /incomplete or inconsistent/);
    const retargeted = structuredClone(restrictedArchive);
    retargeted.revisions.find(r => r.record.revision_id === linked.revision_id).installation_event.target = pin(other);
    retargeted.archive_digest = await archiveDigest(retargeted);
    await assert.rejects(restoreRegistry(memoryD1(), retargeted), /incomplete or inconsistent/);
    await restrict(canonicalReport, false);

    await status(revise(canonicalReport, fixture({...canonicalReport.record, reported_location: 'Untracked location'})), 400);
    await status(run(item(canonicalReport) + '/move', 'reviewer', move(canonicalReport, 'Forbidden location')), 403);
    const movedResponse = await status(run(item(canonicalReport) + '/move', 'editor', move(canonicalReport, 'New symbolic location')), 200);
    const moved = wire(movedResponse);
    assert.deepEqual(moved.parent, pin(canonicalReport));
    assert.equal(moved.record.reported_location, 'New symbolic location');
    assert.equal(moved.sources[movedResponse.json.revision.installation_event.source_index].source.version, 'dated-location');
    assert.equal(await currentness(targetAssessment), false);
    assert.equal(await currentness(unrelated), true);
    await status(reconcile(linked, canonicalReport, 'unlink'), 409);
    await status(reconcile(linked, moved, 'unlink', 'editor'), 403);
    const unlinked = wire(await status(reconcile(linked, moved, 'unlink'), 200));
    assert.equal((await status(run(item(unlinked)), 200)).json.revision.state, 'active');
    const reboundConfig = await read(create(fixture(config(unlinked))));
    const reboundService = await read(create(fixture(offer({backing_configurations: [pin(reboundConfig)]}))));
    const reboundCapture = (await status(run(item(reboundService) + '/match', 'alice', {
      expected_head: pin(reboundService), method: null, material: null, requirements: [], conditions: [], save: true}), 201)).json.assessment_id;
    const movedAgain = wire(await status(run(item(moved) + '/move', 'editor', move(moved, 'Later canonical location')), 200));
    assert.equal(await currentness(reboundCapture), true);
    await status(run(anonymous, ''), 404);
    await status(publish(unlinked), 409);
    const reviewed = wire(await status(revise(unlinked, {action: 'review'}, 'reviewer'), 200));
    await status(publish(reviewed), 200);
    assert.equal((await status(run(anonymous, ''), 200)).json.publication.revision_id, reviewed.revision_id);
    const movedPublic = wire(await status(run(item(reviewed) + '/move', 'editor', move(reviewed, 'Unpublished new location')), 200));
    await status(run(anonymous, ''), 404);
    await status(publish(movedPublic), 409);
    const movedReview = wire(await status(revise(movedPublic, {action: 'review'}, 'reviewer'), 200));
    await status(run(anonymous, ''), 404);
    await status(publish(movedReview), 200);
    assert.equal(Object.hasOwn((await status(run(anonymous, ''), 200)).json.publication, 'reported_location'), false);

    const privateInstall = await read(create(fixture(installation('Restricted installation'), 'restricted'), 'reviewer'));
    const privateMove = wire(await status(run(item(privateInstall) + '/move', 'reviewer', move(privateInstall, null)), 200));
    await status(run(item(privateMove) + '/history', 'editor'), 404);
    const completeArchive = (await status(run(ap + '/backup'), 200)).json;
    const roundTrip = {DB: memoryD1()};
    await restoreRegistry(roundTrip.DB, completeArchive);
    const restoredHistory = (await status(request(roundTrip, item(movedReview) + '/history'), 200)).json.history;
    assert.deepEqual(restoredHistory.filter(r => r.installation_event).map(r => r.action), ['duplicate_link', 'duplicate_unlink', 'move']);
    assert.deepEqual((await status(request(roundTrip, item(canonicalReport) + '/reconciliation'), 200)).json.duplicate_sources, []);
    assert.equal((await status(request(roundTrip, anonymous, ''), 200)).json.publication.revision_id, movedReview.revision_id);

    // Race a second valid request against the last conditional SQLite write.
    function duringWrite(before) {
      return {DB: {...env.DB, prepare(sql) {
        const q = env.DB.prepare(sql);
        if (!sql.includes('wire, installation_event)') || !sql.includes('INSERT INTO registry_revisions')) return q;
        return {bind: (...args) => {
          const bound = q.bind(...args);
          return {...bound, async run() { await before(); return bound.run(); }};
        }};
      }}};
    }
    await status(request(duringWrite(() => status(run(item(other) + '/move', 'editor', move(other, 'Race target')), 200)),
      item(movedReview) + '/reconciliation', 'alice', event(movedReview, other)), 409);
    assert.equal((await status(run(item(movedReview)), 200)).json.revision.record.revision_id, movedReview.revision_id);
    const newOther = wire(await status(run(item(other)), 200));
    await status(request(duringWrite(() => status(run(ap + '/members', 'alice', {user_id: 'u-editor', role: null}), 200)),
      item(newOther) + '/move', 'editor', move(newOther, 'Late editor move')), 409);
    const reciprocal = await Promise.all([reconcile(movedAgain, newOther), reconcile(newOther, movedAgain)]);
    assert.deepEqual(reciprocal.map(r => r.status).sort(), [200, 409]);

    // Both mutations can succeed when a move starts first but the link commits
    // first. Recorded timestamps do not encode the cross-record write order.
    const raceSource = await read(create(fixture(installation('Later linked report'))));
    const raceTarget = await read(create(fixture(installation('Racing canonical report'))));
    let committedLink;
    const raceDB = duringWrite(async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      committedLink = wire(await status(reconcile(raceSource, raceTarget), 200));
    });
    const committedMove = wire(await status(request(raceDB, item(raceTarget) + '/move', 'alice',
      move(raceTarget, 'Moved after link commit')), 200));
    assert.ok(committedMove.recorded_at < committedLink.recorded_at);
    const concurrentArchive = (await status(run(ap + '/backup'), 200)).json;
    await restoreRegistry(memoryD1(), concurrentArchive);
  });

  test('registry roles, visibility and canonical account identity do not change tenancy or lab access', async () => {
    const {env, run, a, b, ap, bp, create, item, revise} = await setUp();
    assert.equal(a.name, b.name);
    assert.notEqual(a.id, b.id);
    assert.equal(a.assurance, 'unverified');
    assert.deepEqual((await run(root + '/organisations', 'bob')).json.organisations.map(o => o.id), [b.id]);
    await status(run(ap + '/records', 'bob'), 404);
    await status(run(bp + '/records', 'alice'), 404);
    await status(run(ap + '/members', 'bob', {user_id: 'u-bob', role: 'editor'}), 404);
    await status(run(ap + '/members', 'editor', {user_id: 'u-bob', role: 'reviewer'}), 403);
    await status(run(ap + '/members', 'alice', {user_id: 'u-alice', role: null}), 400);
    for (const [visibility, creator] of [['organisation', 'editor'], ['public', 'editor'], ['restricted', 'reviewer']]) {
      const report = fixture(installation(), visibility);
      const created = wire(await status(create(report, creator), 201));
      for (const who of ['alice', 'editor', 'reviewer', 'bob']) {
        const expected = who === 'bob' || visibility === 'restricted' && who === 'editor' ? 404 : 200;
        await status(run(item(created), who), expected);
        await status(run(item(created) + '/history', who), expected);
      }
      await status(revise(created, {...report, record: installation('Foreign mutation')}, 'bob'), 404);
      await status(revise(created, {action: 'review', record: installation('Smuggled mutation')}, 'reviewer'), 400);
      await status(revise(created, {action: 'review'}, 'editor'), visibility === 'restricted' ? 404 : 403);
      await status(revise(created, report, 'reviewer'), visibility === 'restricted' ? 200 : 403);
      await status(run(root + '/public/' + created.record_id, ''), 404);
      await status(run(item(created), 'alice', undefined, {cookie: '__Host-planner_session=invalid'}), 401);
    }
    await status(create(fixture(installation(), 'restricted'), 'editor'), 403);
    await status(create(fixture(installation(), 'organisation'), 'reviewer'), 403);
    for (const endpoint of ['/api/lab/equipment', '/api/lab/protocols', '/api/reviews']) {
      await status(call(endpoint, {user: 'alice', env}), 403);
    }
    await status(run(ap + '/records', 'alice', fixture(installation()), {origin: 'https://another.example'}), 403);
    await status(run(ap + '/members', 'alice', {user_id: 'u-editor', role: null}), 200);
    await status(run(ap + '/records', 'editor'), 404);
    const sqlite = env.DB._db;
    assert.equal(sqlite.prepare('SELECT count(*) FROM invites').get()['count(*)'], 0);
    assert.equal(sqlite.prepare("SELECT count(*) FROM members WHERE status='active'").get()['count(*)'], 0);
    assert.throws(() => sqlite.exec("UPDATE registry_revisions SET state='retired'"), /immutable/);
  });

  test('exact revision history, conflict review, dated claims and grouped unknowns survive lifecycle actions', async () => {
    const {run, create, item, revise} = await setUp();
    const single = wire(await status(create(fixture(installation())), 201));
    const groupRecord = {...installation('Three reported systems'), record_type: 'installation_group', reported_count: 3};
    await status(create(fixture({...groupRecord, asset_ids: ['invented-id']})), 400);
    const group = wire(await status(create(fixture(groupRecord)), 201));
    assert.equal(group.record.reported_count, 3);
    const modules = {coverage: 'partial', items: [{module_id: 'symbolic-module', state: 'unknown', source_pointer: null}]};
    const config = target => ({record_type: 'configuration', installation: pin(target), fitted_modules: modules, operating_envelopes: null});
    await status(create(fixture(config(group))), 400);
    await status(create(fixture({...config(single), installation: {...pin(single), content_digest: src.snapshot_digest}})), 400);
    const limit = (observable_id, value, dimension, unit, basis) => ({
      observable_id, operator: 'lte', threshold: {schema_version: '0.1.0', value, dimension, unit, basis, reference: null,
        provenance: {kind: 'source_stated', evidence: [{document_id: src.source.native_id,
          document_digest: src.snapshot_digest, pointer: '/limits/' + observable_id}], explanation: null}},
    });
    const envelope = (id, temp, pressure) => ({envelope_id: id, source_pointer: '/sources/0', conditions: [],
      all_of: [limit('temperature', temp, 'temperature', 'Cel', 'absolute_value'),
        limit('pressure', pressure, 'pressure', 'bar', 'absolute')]});
    const joint = [envelope('a', '80', '2'), envelope('b', '30', '8')];
    const c = wire(await status(create(fixture({...config(single), operating_envelopes: joint})), 201));
    assert.deepEqual(c.record.fitted_modules, modules);
    assert.deepEqual(c.record.operating_envelopes, joint);
    await status(create(fixture({...config(single), operating_envelopes: joint}, 'organisation', [])), 400);
    const report = wire(await status(create(fixture(assertion(single, 'affirmed', {claimed_custodian: {type: 'person', id: 'u-alice'}}))), 201));
    assert.deepEqual(report.record.reporter, {type: 'person', id: 'u-alice'});
    assert.equal(report.record.verified_authority, null);
    await status(create(fixture(assertion(single, 'affirmed', {reporter: {type: 'person', id: 'u-owner'}}))), 400);
    await status(create(fixture(assertion(single, 'affirmed', {verified_authority: {principal: 'u-alice'}}))), 400);
    const denied = wire(await status(create(fixture(assertion(single, 'denied', {related_assertions: [pin(report)]}))), 201));
    const expired = wire(await status(create(fixture(assertion(single, 'denied', {valid_until: old}), 'organisation', [src], old)), 201));
    const claims = () => run(item(single) + '/claims', 'alice');
    const result = (await status(claims(), 200)).json;
    assert.deepEqual(result.conflicts, ['existence']);
    assert.equal(result.resolved_truth, null);
    assert.equal(result.provider_authority, 'unverified');
    assert.equal(result.claims.find(r => r.record.record_id === expired.record_id).evidence_status, 'expired');
    await status(revise(expired, {action: 'review'}, 'reviewer'), 409);
    const checked = wire(await status(revise(denied, {action: 'review_disputed'}, 'reviewer'), 200));
    assert.deepEqual(checked.record, denied.record);
    const withdrawn = wire(await status(revise(checked, {action: 'withdraw'}, 'reviewer'), 200));
    assert.equal(withdrawn.record.state, 'withdrawn');
    assert.deepEqual((await claims()).json.conflicts, []);
    const fresh = wire(await status(revise(expired, fixture(assertion(single, 'denied'))), 200));
    await status(revise(fresh, {action: 'review'}, 'reviewer'), 200);
    assert.deepEqual((await claims()).json.conflicts, ['existence']);
    const retired = wire(await status(revise(c, {action: 'retire'}), 200));
    await status(revise(retired, fixture(config(single))), 409);
    const restored = wire(await status(revise(retired, {action: 'restore'}), 200));
    const history = (await status(run(item(c) + '/history'), 200)).json.history;
    assert.deepEqual(history.map(r => r.state), ['active', 'retired', 'active']);
    assert.deepEqual(history.map(r => r.record.parent), [null, pin(c), pin(retired)]);
    assert.deepEqual(restored.record, c.record);
  });

  test('public projection, concurrent revisions and exact assessment pins survive a private export and restore', async () => {
    const {run, a, ap, create, item, revise, assess} = await setUp();
    const report = wire(await status(create(fixture(installation('Published fixture'), 'public')), 201));
    const publicRoute = root + '/public/' + report.record_id;
    const publish = async (r, user = 'alice', value = true) => {
      const {sharing} = (await status(run(item(report) + '/sharing'), 200)).json;
      return run(item(report) + '/publication', user, {expected_head: pin(r), expected_policy_id: sharing.policy_id, publish: value});
    };
    await status(run(publicRoute, ''), 404);
    await status(publish(report), 409);
    const checked = wire(await status(revise(report, {action: 'review'}, 'reviewer'), 200));
    await status(publish(checked, 'reviewer'), 403);
    await status(publish(checked), 200);
    const projection = (await status(run(publicRoute, ''), 200)).json.publication;
    assert.deepEqual(projection, {record_id: checked.record_id, revision_id: checked.revision_id,
      record_type: 'installation', label: 'Published fixture', observed_at, assurance: 'reported'});
    await status(publish(checked, 'alice', false), 200);
    await status(run(publicRoute, ''), 404);
    await status(publish(checked), 200);

    const hidden = {...src, visibility: 'organisation_private'};
    await status(create(fixture(installation(), 'public', [hidden])), 400);
    const restricted = wire(await status(create(fixture(installation('Restricted fixture'), 'restricted', [hidden])), 201));
    const other = wire(await status(create(fixture(installation('Unrelated fixture'))), 201));
    const fitted = wire(await status(create(fixture({record_type: 'configuration', installation: pin(checked),
      fitted_modules: null, operating_envelopes: null})), 201));
    await status(assess([pin(restricted)]), 400);
    const dependency = (await status(assess([pin(fitted)]), 201)).json.assessment.id;
    const unrelated = (await status(assess([pin(other)]), 201)).json.assessment.id;
    const assessAt = id => ap + '/assessments/' + id;
    assert.equal((await run(assessAt(dependency))).json.assessment.current, true);

    const correction = fixture(installation('New head'), 'public');
    await status(revise(checked, {...correction, expected_head: {...pin(checked), content_digest: src.snapshot_digest}}), 409);
    const results = await Promise.all([revise(checked, correction), revise(checked, correction)]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    const changed = wire(results.find(r => r.status === 200));
    await status(run(publicRoute, ''), 404);
    await status(publish(checked), 409);
    const affected = (await run(assessAt(dependency))).json.assessment;
    assert.equal(affected.current, false);
    assert.deepEqual(affected.dependencies.find(d => d.status === 'revised'), {
      reference: pin(checked), current_head: pin(changed), status: 'revised',
    });
    assert.equal((await run(assessAt(unrelated))).json.assessment.current, true);
    await status(run(ap + '/backup', 'editor'), 403);
    await status(run(ap + '/backup', 'reviewer'), 403);
    await status(run(ap + '/backup', 'bob'), 404);
    await status(run(ap + '/members', 'alice', {user_id: 'u-editor', role: null}), 200);
    const archive = (await status(run(ap + '/backup'), 200)).json;
    assert.equal(archive.organisation.id, a.id);
    assert.equal(archive.revisions.filter(r => r.visibility === 'restricted').length, 1);
    const restored = {DB: memoryD1()};
    assert.equal(archive.archive_digest, await archiveDigest(archive));
    const corruptions = [
      copy => { copy.memberships.find(m => m.role === 'reviewer').role = 'editor'; },
      copy => { copy.revisions[0].state = 'retired'; },
      copy => { copy.publications[0].projection = null; },
    ];
    for (const corrupt of corruptions) {
      const changedArchive = structuredClone(archive);
      corrupt(changedArchive);
      assert.deepEqual(changedArchive.revisions.map(r => r.record), archive.revisions.map(r => r.record));
      // A mismatching archive must fail before restore touches the database.
      await assert.rejects(restoreRegistry({}, changedArchive), /archive digest mismatch/);
    }
    await restoreRegistry(restored.DB, archive);
    assert.deepEqual((await status(request(restored, assessAt(dependency)), 200)).json.assessment, affected);
    assert.deepEqual((await status(request(restored, ap + '/backup'), 200)).json, archive);
    await status(request(restored, item(restricted), 'editor'), 404);
    await status(request(restored, item(restricted), 'reviewer'), 200);
    await status(request(restored, publicRoute, ''), 404);
  });

  test('registry rejects a shape-valid stored authority claim with recomputed digests', async () => {
    const {env, run, ap, create, item} = await setUp();
    const target = wire(await status(create(fixture(installation())), 201));
    const claim = wire(await status(create(fixture(assertion(target, 'affirmed'))), 201));
    const archive = (await status(run(ap + '/backup'), 200)).json;
    const altered = structuredClone(archive);
    const assertionRow = altered.revisions.find(r => r.record.record_id === claim.record_id);
    const forged = assertionRow.record;
    forged.record.verified_authority = {
      principal: {type: 'person', id: 'u-alice'},
      provider: {namespace: 'example:provider', native_id: 'synthetic-provider'},
      verified_by: {type: 'person', id: 'u-reviewer'},
      applies_to: pin(target), purposes: ['custody'],
      verified_at: old, valid_until: null, verification_source_pointer: '/sources/0',
    };
    forged.content_digest = await wireDigest(forged);
    altered.archive_digest = await archiveDigest(altered);
    assert.ok(wireShape(await registryContracts(), forged));
    await assert.rejects(restoreRegistry({}, altered), /inconsistent/);

    // Seed only the in-memory database to exercise the read integrity boundary.
    const successor = {...forged, parent: pin(claim), revision_id: crypto.randomUUID()};
    successor.content_digest = await wireDigest(successor);
    env.DB._db.prepare(`INSERT INTO registry_revisions
      (org_id, record_id, seq, revision_id, visibility, state, action, actor, observed_at, expires_at, wire)
      VALUES (?, ?, 2, ?, 'organisation', 'active', 'correct', 'u-alice', ?, NULL, ?)`)
      .run(claim.organisation_id, claim.record_id, successor.revision_id, observed_at, canonical(successor));
    await status(run(item(claim)), 500);
  });

  test('sharing decisions preserve exact history and hide restricted dependent references', async () => {
    const {run, ap, create, item, revise, assess} = await setUp();
    const target = wire(await status(create(fixture(installation('Sharing fixture'), 'public')), 201));
    const checked = wire(await status(revise(target, {action: 'review'}, 'reviewer'), 200));
    const config = wire(await status(create(fixture({record_type: 'configuration', installation: pin(checked),
      fitted_modules: null, operating_envelopes: null})), 201));
    const claim = wire(await status(create(fixture(assertion(config, 'affirmed'))), 201));
    const independent = wire(await status(create(fixture(installation('Other'))), 201));
    const assessment = (await status(assess([pin(claim), pin(independent)], 'organisation', 'editor'), 201)).json.assessment;
    const getAssessment = user => run(ap + '/assessments/' + assessment.id, user);
    const getSharing = () => run(item(target) + '/sharing');
    const state = async () => (await status(getSharing(), 200)).json.sharing;
    const decision = (route, body, user = 'alice') => run(item(target) + '/' + route, user, body);
    const history = user => run(item(target) + '/history', user);
    const publicRoute = root + '/public/' + target.record_id;
    const initial = (await state()).policy_id;
    assert.equal(initial, null);
    const published = (await status(decision('publication', {
      expected_head: pin(checked), expected_policy_id: initial, publish: true,
    }), 200)).json.sharing.policy_id;
    await status(run(publicRoute, ''), 200);
    const restrict = {expected_head: pin(checked), expected_policy_id: published, restricted: true};
    await status(decision('sharing', restrict, 'reviewer'), 403);
    await status(decision('sharing', restrict, 'editor'), 403);
    await status(decision('sharing', restrict, 'bob'), 404);
    await status(run(item(target) + '/sharing', 'reviewer'), 403);
    await status(decision('sharing', {...restrict, expected_head: pin(target)}), 409);
    const before = (await status(history('editor'), 200)).json.history.map(r => r.record);
    const concurrent = await Promise.all([decision('sharing', restrict), decision('sharing', restrict)]);
    assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409]);
    const restricted = await state();
    assert.notEqual(restricted.policy_id, published);
    assert.equal(restricted.effective_visibility, 'restricted');
    assert.equal(restricted.publication, null);
    assert.equal(restricted.eligible_fields, null);
    await status(run(publicRoute, ''), 404);
    assert.deepEqual((await status(run(root + '/public', ''), 200)).json.publications, []);
    for (const r of [target, config, claim]) {
      await status(run(item(r), 'editor'), 404);
      await status(run(item(r) + '/history', 'editor'), 404);
      await status(run(item(r), 'reviewer'), 200);
    }
    assert.deepEqual((await run(ap + '/records', 'editor')).json.records.map(r => r.record.record_id), [independent.record_id]);
    assert.deepEqual((await history('reviewer')).json.history.map(r => r.record), before);
    await status(assess([pin(claim)], 'organisation', 'editor'), 400);
    const hidden = (await status(getAssessment('editor'), 200)).json.assessment;
    assert.equal(hidden.current, false);
    assert.equal(hidden.dependencies.filter(d => d.status === 'unavailable').length, 3);
    assert.ok(hidden.dependencies.every(d => d.status === 'unavailable' ?
      Object.keys(d).length === 1 : d.reference.record_id === independent.record_id));
    assert.equal((await status(getAssessment('reviewer'), 200)).json.assessment.current, true);

    const archive = (await status(run(ap + '/backup'), 200)).json;
    assert.equal(archive.format, 'planner-registry-export/2');
    const archivedPolicy = archive.publications.find(p => p.record_id === target.record_id);
    assert.equal(archivedPolicy.policy_id, restricted.policy_id);
    const tampered = structuredClone(archive);
    tampered.publications.find(p => p.record_id === target.record_id).restricted = 0;
    await assert.rejects(restoreRegistry({}, tampered), /archive digest mismatch/);
    const restored = {DB: memoryD1()};
    await restoreRegistry(restored.DB, archive);
    assert.deepEqual((await request(restored, ap + '/backup')).json, archive);
    await status(request(restored, item(target) + '/history', 'editor'), 404);
    await status(request(restored, publicRoute, ''), 404);

    await status(decision('publication', {expected_head: pin(checked), expected_policy_id: restricted.policy_id, publish: true}), 409);
    const lift = {expected_head: pin(checked), expected_policy_id: restricted.policy_id, restricted: false};
    await status(decision('sharing', lift), 200);
    const lifted = await state();
    assert.equal(lifted.effective_visibility, 'public');
    assert.deepEqual((await history('editor')).json.history.map(r => r.record), before);
    assert.equal((await getAssessment('editor')).json.assessment.current, true);
    await status(run(publicRoute, ''), 404);
    await status(decision('publication', {expected_head: pin(checked), expected_policy_id: published, publish: true}), 409);
    await status(decision('publication', {expected_head: pin(checked), expected_policy_id: lifted.policy_id, publish: true}), 200);
    await status(run(publicRoute, ''), 200);
  });

  test('public preview and paginated list use the exact selected safe fields', async () => {
    const {run, ap, create, item, revise} = await setUp();
    const group = {...installation('Public group fixture'), record_type: 'installation_group', reported_count: 3};
    const query = {...src, source: {...src.source, native_id: 'unshared-source', url: 'https://example.org/evidence?token=placeholder'}};
    const recorded = wire(await status(create(fixture(group, 'public', [src, query])), 201));
    const checked = wire(await status(revise(recorded, {action: 'review'}, 'reviewer'), 200));
    const statePath = item(checked) + '/sharing';
    const previewPath = item(checked) + '/publication-preview';
    const publishPath = item(checked) + '/publication';
    const publicPath = root + '/public/' + checked.record_id;
    const ownerState = (await status(run(statePath), 200)).json.sharing;
    assert.deepEqual(ownerState.eligible_fields, {reported_count: true, sources: [{index: 0, url: src.source.url, observed_at}]});
    const exact = {expected_head: pin(checked), expected_policy_id: ownerState.policy_id};
    await status(run(previewPath, 'reviewer', exact), 403);
    await status(run(previewPath, 'alice', {...exact, fields: {source_indices: [1]}}), 409);
    await status(run(previewPath, 'alice', {...exact, fields: {reported_count: true, source_indices: [0, 0]}}), 400);
    const basic = (await status(run(previewPath, 'alice', exact), 200)).json.publication;
    assert.equal(Object.hasOwn(basic, 'reported_count'), false);
    assert.equal(Object.hasOwn(basic, 'sources'), false);
    const selection = {...exact, fields: {reported_count: true, source_indices: [0]}};
    const preview = (await status(run(previewPath, 'alice', selection), 200)).json.publication;
    assert.deepEqual(preview, {...basic, reported_count: 3, sources: [{url: src.source.url, observed_at}]});
    await status(run(publicPath, ''), 404);
    assert.deepEqual((await status(run(statePath), 200)).json.sharing, ownerState);
    const published = (await status(run(publishPath, 'alice', {...selection, publish: true}), 200)).json;
    assert.deepEqual(published.publication, preview);
    assert.deepEqual((await status(run(publicPath, ''), 200)).json.publication, preview);
    await status(run(previewPath, 'alice', selection), 409);

    const second = wire(await status(create(fixture(installation('Second public fixture'), 'public')), 201));
    const secondHead = wire(await status(revise(second, {action: 'review'}, 'reviewer'), 200));
    await status(run(item(second) + '/publication', 'alice', {expected_head: pin(secondHead), expected_policy_id: null, publish: true}), 200);
    const firstPage = (await status(run(root + '/public?limit=1', ''), 200)).json;
    const secondPage = (await status(run(root + '/public?limit=1&after=' + firstPage.next_after, ''), 200)).json;
    assert.equal(firstPage.publications.length, 1);
    assert.equal(secondPage.publications.length, 1);
    assert.deepEqual([firstPage.publications[0].record_id, secondPage.publications[0].record_id],
      [checked.record_id, secondHead.record_id].sort());
    assert.equal(secondPage.next_after, null);
    await status(run(root + '/public?limit=51', ''), 400);

    const archive = (await status(run(ap + '/backup'), 200)).json;
    // A v1 group publication contains the count and has no selection metadata.
    const legacy = {...archive, format: 'planner-registry-export/1', publications: archive.publications.map(p => {
      const {policy_id, restricted, disclosure, ...legacyPublication} = p;
      if (p.record_id === checked.record_id) legacyPublication.projection = canonical({...basic, reported_count: 3});
      return legacyPublication;
    })};
    legacy.archive_digest = await archiveDigest(legacy);
    const restored = {DB: memoryD1()};
    await restoreRegistry(restored.DB, legacy);
    assert.deepEqual((await status(request(restored, publicPath, ''), 200)).json.publication, {...basic, reported_count: 3});
    assert.equal((await status(request(restored, statePath), 200)).json.sharing.policy_id, null);

    const update = {expected_head: pin(checked), expected_policy_id: published.sharing.policy_id};
    const competing = await Promise.all([
      run(statePath, 'alice', {...update, restricted: true}),
      run(publishPath, 'alice', {...update, publish: true}),
    ]);
    assert.deepEqual(competing.map(r => r.status).sort(), [200, 409]);
    await status(run(publicPath, ''), competing[0].status === 200 ? 404 : 200);
  });

}
