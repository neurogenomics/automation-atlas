import assert from 'node:assert/strict';
import test from 'node:test';
import {memoryD1} from '../../scripts/memory-d1.mjs';
import {restoreRegistry} from '../../scripts/restore-registry.mjs';
import {archiveDigest} from '../../worker/registry/contract.js';
import {hash, interpretationDigest} from '../../lib/reviewed/json.js';
import {bindingOf} from '../../lib/reviewed/input.js';
import {fixture as reviewedFixture} from './reviewed.mjs';
import {requestDraftFixture, pinRequestRecord} from './request-draft-fixture.mjs';

export function requestDraftCases(call) {
  const fresh = () => ({DB: memoryD1()});
  const setup = async (options = {}) => {
    const env = fresh();
    const use = (path, method = 'GET', body, user = 'alice', e = env) => call(path, {env: e, method, body, user});
    const f = await requestDraftFixture(use, 'u-alice', options);
    return {...f, env, use, create: f.path + '/assessments/' + f.matched.assessment_id + '/request-v1',
      read: id => f.path + '/request-drafts-v1/' + id};
  };
  const expect = async (promise, status, code) => {
    const response = await promise;
    assert.equal(response.status, status, JSON.stringify(response.json));
    if (code) assert.equal(response.json.code, code, JSON.stringify(response.json));
    return response.json;
  };

  test('private request preparation uses grouped discovery, exact reviewed assessment, immutable replay and owner backup', async () => {
    const f = await setup();
    const {use, path, create, body, read, env, grouped} = f;
    const projection = await expect(use('/api/registry/public/' + grouped.record_id, 'GET', undefined, null), 200);
    assert.equal(projection.publication.record_type, 'installation_group');
    assert(!JSON.stringify(projection).includes(f.offer.record_id));
    const planning = await expect(use('/api/planning/v1/reviewed/assess', 'POST', f.reviewed), 200);
    const [first, parallel] = await Promise.all([use(create, 'POST', body), use(create, 'POST', body)]);
    assert.deepEqual([first.status, parallel.status].sort(), [200, 201], JSON.stringify([first.json, parallel.json]));
    const {draft, facility_routes} = first.json;
    assert.deepEqual(first.json, parallel.json);
    assert.equal(draft.schema, 'planner/registry-service-request/1');
    assert.deepEqual(draft.reviewed.binding, planning.binding);
    assert.equal(draft.reviewed.input_digest, planning.input_digest);
    assert.deepEqual(draft.configuration, pinRequestRecord(f.configuration));
    assert.deepEqual(draft.installation, pinRequestRecord(f.installation));
    assert.deepEqual(draft.model, f.installation.record.model);
    assert.equal(draft.provider_outcome, null);
    for (const key of ['sent', 'reservation_created', 'charge_created', 'execution_authorized']) assert.equal(draft[key], false);
    assert.deepEqual(facility_routes, [{kind: 'enquiry', url: 'https://example.org/fixture'}]);
    assert.deepEqual(await expect(use(read(draft.id)), 200), first.json);
    assert(!JSON.stringify(first.json).includes(f.reviewed.record.operations[0].source_spans[0].quote));
    await expect(use(create, 'POST', {...body, configuration: pinRequestRecord(grouped), idempotency_key: 'synthetic-group-input-001'}), 400);
    const changed = structuredClone(body);
    changed.reviewed_input.run.cardinalities.per_sample = 2;
    await expect(use(create, 'POST', changed), 409, 'idempotency_conflict');
    await expect(use(read(draft.id), 'GET', undefined, null), 401);
    await expect(use(read(draft.id), 'GET', undefined, 'foreign'), 404);
    await expect(use(path + '/members', 'POST', {user_id: 'u-bob', role: 'reviewer'}), 200);
    await expect(use(read(draft.id), 'GET', undefined, 'bob'), 404);
    await expect(use(create, 'POST', body, 'bob'), 404);
    assert.equal(env.DB._db.prepare('SELECT COUNT(*) AS n FROM registry_request_drafts').get().n, 1);
    for (const sql of ['UPDATE registry_request_drafts SET draft = draft', 'DELETE FROM registry_request_drafts'])
      assert.throws(() => env.DB._db.prepare(sql).run(), /immutable/);
    const archive = await expect(use(path + '/backup'), 200);
    assert.equal(archive.format, 'planner-registry-export/6');
    assert(!JSON.stringify(archive).includes(body.idempotency_key));
    const restored = fresh();
    await restoreRegistry(restored.DB, archive);
    assert.deepEqual(await expect(use(read(draft.id), 'GET', undefined, 'alice', restored), 200), first.json);
    const tampered = structuredClone(archive), row = tampered.request_drafts[0];
    row.actor = 'u-bob';
    tampered.archive_digest = await archiveDigest(tampered);
    await assert.rejects(restoreRegistry(fresh().DB, tampered));
    await expect(use('/api/registry/public/' + draft.id, 'GET', undefined, null), 404);
  });

  test('unknown rights, access, availability, or unidentified backing cannot prepare a draft', async () => {
    for (const [options, code] of [
      [{missing: 'eligibility'}, 'eligibility_unresolved'],
      [{missing: 'availability'}, 'availability_unresolved'],
      [{missing: 'training'}, 'training_unresolved'],
      [{identified: false}, 'installation_unidentified'],
    ]) {
      const f = await setup(options);
      await expect(f.use(f.create, 'POST', f.body), 409, code);
      assert.equal(f.env.DB._db.prepare('SELECT COUNT(*) AS n FROM registry_request_drafts').get().n, 0);
    }
    const exact = await setup();
    await expect(exact.use(exact.create, 'POST', {...exact.body, reviewed_input: await reviewedFixture({moved: '11', residual: '19', final: '18'})}), 409, 'reviewed_binding_mismatch');
    const f = await setup({badRights: true});
    assert.match(f.matched.error, /does not declare assessment use/);
  });

  test('an optimistic service fit cannot override reviewed movement, capacity or source coverage blockers', async () => {
    const overdraw = await reviewedFixture({moved: '31', residual: '0', final: '38'});
    const capacity = await reviewedFixture();
    capacity.run.layout['tube-2'][0].capacity_uL = '8';
    const coverage = await reviewedFixture();
    coverage.record.coverage[0] = {pointer: '/state/content/0', status: 'unresolved', operation_ids: [], reason: 'Synthetic unresolved coverage'};
    coverage.record.interpretation_digest = await interpretationDigest(coverage.record);
    coverage.binding = bindingOf(coverage.record);
    for (const [reviewed, finding, code] of [
      [overdraw, 'movement_overdraw', 'reviewed_ledger_unresolved'],
      [capacity, 'capacity_exceeded', 'reviewed_layout_unresolved'],
      [coverage, 'coverage_unresolved', 'reviewed_coverage_unresolved'],
    ]) {
      const f = await setup({reviewed});
      assert.equal(f.matched.match.route, 'reported_fit_access_unverified');
      const preview = await expect(f.use('/api/planning/v1/reviewed/assess', 'POST', reviewed), 200);
      assert.equal(preview.input_digest, await hash(reviewed));
      assert(preview.findings.some(value => value.code === finding));
      const result = await expect(f.use(f.create, 'POST', f.body), 409, code);
      assert(!JSON.stringify(result).includes(reviewed.record.operations[0].source_spans[0].quote));
      assert.equal(f.env.DB._db.prepare('SELECT COUNT(*) AS n FROM registry_request_drafts').get().n, 0);
    }
  });

  test('selected dependency visibility and role are rechecked at the atomic persist and read boundaries', async () => {
    const f = await setup();
    const org = f.organisation.id, db = f.env.DB, dependency = f.configuration;
    // Emulate a role demotion and a concurrent narrowing immediately before
    // the guarded SQL. The real actor remains a member, but cannot use pins.
    const original = db.prepare.bind(db);
    let phase = 'persist', fired = false;
    db.prepare = sql => {
      const isTarget = phase === 'persist' ? sql.startsWith('INSERT INTO registry_request_drafts')
        : sql.startsWith('SELECT 1 AS ok FROM registry_assessments');
      if (!fired && isTarget) {
        fired = true;
        db._db.prepare("UPDATE registry_members SET role = 'editor' WHERE org_id = ? AND user_id = ?").run(org, 'u-alice');
        db._db.prepare(`INSERT INTO registry_publications
          (org_id,record_id,revision_id,actor,decided_at,projection,policy_id,restricted,disclosure)
          VALUES (?,?,?,?,?,NULL,?,1,NULL)`).run(org, dependency.record_id, dependency.revision_id, 'u-alice',
          new Date().toISOString(), 'synthetic-restriction');
      }
      return original(sql);
    };
    await expect(f.use(f.create, 'POST', f.body), 404);
    assert(fired);
    assert.equal(db._db.prepare('SELECT COUNT(*) AS n FROM registry_request_drafts').get().n, 0);
    db._db.prepare("UPDATE registry_members SET role = 'owner' WHERE org_id = ? AND user_id = ?").run(org, 'u-alice');
    db._db.prepare('DELETE FROM registry_publications WHERE org_id = ? AND record_id = ?').run(org, dependency.record_id);
    const {draft} = await expect(f.use(f.create, 'POST', f.body), 201);
    phase = 'read';
    fired = false;
    await expect(f.use(f.read(draft.id)), 409, 'assessment_stale');
    assert(fired);
    await expect(f.use(f.read(draft.id)), 404);
    await expect(f.use(f.create, 'POST', f.body), 404);
    assert.equal(db._db.prepare('SELECT COUNT(*) AS n FROM registry_request_drafts').get().n, 1);
  });

  test('workspace capacity retains expired replay receipts and keeps exact replay available', async t => {
    t.mock.timers.enable({apis: ['Date'], now: Date.parse('2026-11-12T10:00:00Z')});
    const f = await setup();
    const prepare = key => f.use(f.create, 'POST', {...f.body, idempotency_key: 'synthetic-capacity-' + key});
    for (let start = 0; start < 100; start += 10) {
      await Promise.all(Array.from({length: 10}, (_, i) => expect(prepare(start + i), 201)));
    }
    t.mock.timers.setTime(Date.parse('2026-11-13T10:00:00Z'));
    await expect(prepare('new'), 409, 'request_capacity_reached');
    await expect(prepare(1), 410, 'draft_expired');
    assert.equal(f.env.DB._db.prepare('SELECT COUNT(*) AS n FROM registry_request_drafts').get().n, 100);
  });

  test('prepared drafts expire and stale or withdrawn heads block retrieval and identical replay', async t => {
    t.mock.timers.enable({apis: ['Date'], now: Date.parse('2026-11-12T10:00:00Z')});
    const f = await setup(), {use, path, offer, create, body, read} = f;
    const {draft} = await expect(use(create, 'POST', body), 201);
    const exactPath = read(draft.id);
    const withdrawal = {expected_head: pinRequestRecord(offer), action: 'retire'};
    await expect(use(path + '/records/' + offer.record_id + '/revisions', 'POST', withdrawal), 200);
    await expect(use(exactPath), 409, 'assessment_stale');
    await expect(use(create, 'POST', body), 409, 'assessment_stale');
    t.mock.timers.setTime(Date.parse(draft.expires_at));
    await expect(use(exactPath), 410, 'draft_expired');
    await expect(use(create, 'POST', body), 410, 'draft_expired');
  });
}
