import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {registryContracts} from '../../scripts/registry-contracts.mjs';
import {restoreRegistry} from '../../scripts/restore-registry.mjs';
import {memoryD1} from '../../scripts/memory-d1.mjs';
import {hashText} from '../../lib/reviewed/json.js';
import {refOf, wireDigest} from '../../worker/registry/contract.js';

const json = v => JSON.stringify(v, null, 2) + '\n';
const observed = '2025-01-12';
const url = 'https://example.org/device';
const rights = {discovery: 'permitted', assessment: 'unknown', republication: 'unknown', basis: 'Synthetic discovery fixture'};
const source = {id: 'fixture-page', title: 'Fixture page', url, section: 'Reports', checked: observed, kind: 'facility'};
export async function roarFixture(contracts, revision) {
  const version = '2025-01-' + (revision + 11), catalogueVersion = version + '.fixture';
  const sourceRelease = {commit: 'a'.repeat(40), discoveryVersion: version, catalogueVersion, catalogueSchemaVersion: 5};
  const contract = {name: 'instrument-model', schemaVersion: '0.1.0', digestProfile: 'agentic-lab/review-json/1',
    commit: contracts.upstream, schemaPath: 'contracts/versions/0.1.0/instrument-model.schema.json'};
  const record = {schema_version: '0.1.0', record_id: 'atlas:fixture', revision_id: 'r1', parent: null,
    digest_profile: contract.digestProfile, recorded_at: observed + 'T12:00:00Z', visibility: 'public',
    use_rights: rights, manufacturer: 'Example', model_identifier: 'Fixture', variant: null, reference_facts: [],
    sources: [{source: {namespace: 'manufacturer:document', native_id: url, url}, observed_at: observed,
      snapshot_digest: null, visibility: 'public', use_rights: rights}]};
  record.content_digest = await wireDigest(record);
  const {schema_version, record_id, revision_id, content_digest} = record;
  const manifest = {manifestVersion: 1, contract, sourceRelease, models: [{
    atlasId: 'fixture', atlasQuery: '?instrument=fixture', recordRef: {schema_version, record_id, revision_id, content_digest},
    sourceAttribution: [{sourceIndex: 0, atlasSourceId: 'maker', attribution: 'manufacturer_reported', title: 'Maker page', section: 'Identity'}],
    fieldLoss: {referenceFactsReason: 'No rights', sourceMetadataReason: 'No extra fields'},
  }]};
  const conflict = {id: 'fixture-conflict', title: 'Competing statements', resolution: 'Unresolved',
    observations: [{sourceId: source.id, evidence: 'facility', statement: 'Reported only'}], relatedSourceIds: []};
  const lead = {id: revision === 4 ? 'replacement-role' : 'fixture-role', status: revision === 3 ? 'grouped' : 'matched',
    ...(revision === 3 ? {reportedGroup: 'new-group'} : {}), assurance: 'facility-reported', planningEligibility: 'unassessed',
    controlSupport: 'unknown', modelIds: ['fixture'], reportedName: 'Fixture report', reportedRole: 'Fixture role',
    identityGap: 'Configuration is unverified (' + revision + ')', sourceIds: [source.id], conflictIds: [conflict.id]};
  const crosswalk = json({schemaVersion: 1, version, checked: version, catalogueVersion, catalogueSchemaVersion: 5, retrievalNote: 'Synthetic.',
    leads: [lead], sources: [source], sourceCoverage: [{sourceId: source.id, use: 'Discovery'}], conflicts: [conflict]});
  const bundle = json({manifest, records: [record]});
  const pin = {crosswalk: await hashText(crosswalk), bundle: await hashText(bundle), manifest: await hashText(json(manifest)),
    sourceCommit: sourceRelease.commit, releaseCommit: 'b'.repeat(40), discoveryVersion: version, catalogueVersion, catalogueSchemaVersion: 5,
    counts: {roles: 1, sources: 1, facilitySources: 1, conflicts: 1, models: 1}};
  return {input: {crosswalk, bundle}, pin};
}
export function roarCases(handle, assets) {
  const registry = '/api/registry';
  const base = registry + '/organisations';
  const makeCall = (db, contracts) => async (path, user, body, options = {}) => {
    const response = await handle(new Request('https://planner.example' + path, {method: body === undefined ? 'GET' : 'POST',
      headers: {...(user ? {'oai-authenticated-user-id': user} : {}), ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
        ...options.headers}, body: body === undefined ? undefined : JSON.stringify(body)}), {DB: db}, assets,
      {registryContracts: contracts, fetcher: () => assert.fail('Registry import must not dispatch an external request')});
    return {status: response.status, data: await response.json()};
  };
  test('ROAR import reviews pinned changes atomically and preserves tenant scope and immutable evidence', async () => {
    const db = memoryD1(), contracts = await registryContracts(), owner = 'fixture-owner', editor = 'fixture-editor', stranger = 'fixture-stranger';
    const first = await roarFixture(contracts, 1), next = await roarFixture(contracts, 2);
    const call = makeCall(db, {...contracts, roarRelease: first.pin});
    const updated = makeCall(db, {...contracts, roarRelease: next.pin});
    const a = (await call(base, owner, {name: 'Same fixture name'})).data.organisation.id;
    const b = (await call(base, stranger, {name: 'Same fixture name'})).data.organisation.id;
    const org = base + '/' + a, other = base + '/' + b;
    const path = org + '/roar-import/';
    const records = async () => (await call(org + '/records', owner)).data.records;
    assert.equal((await call(path + 'preview', undefined, first.input)).status, 401);
    assert.equal((await call(path + 'preview', stranger, first.input)).status, 404);
    await call(org + '/members', owner, {user_id: editor, role: 'editor'});
    assert.equal((await call(path + 'preview', editor, first.input)).status, 403);
    assert.equal((await call(path + 'preview', owner, first.input, {headers: {Origin: 'https://elsewhere.example'}})).status, 403);
    assert.equal((await call(path + 'preview', owner, {...first.input, bundle: first.input.bundle + ' '})).status, 400);
    const corrupted = {...first.input, bundle: first.input.bundle.replace('"manufacturer": "Example"', '"manufacturer": "Other"')};
    const repinned = makeCall(db, {...contracts, roarRelease: {...first.pin, bundle: await hashText(corrupted.bundle)}});
    assert.equal((await repinned(path + 'preview', owner, corrupted)).status, 400, 'outer release pin cannot substitute for C11 content digest');
    assert.equal((await call(path + 'apply', owner, {...first.input, review_digest: 'sha256:' + '0'.repeat(64)})).status, 409);
    const preview = (await call(path + 'preview', owner, first.input)).data;
    assert.equal((await records()).length, 0);
    const [{report_id, packet_id}] = preview.reports;
    const otherPreview = (await call(other + '/roar-import/preview', stranger, first.input)).data;
    assert.notEqual(otherPreview.reports[0].report_id, report_id);
    assert.notEqual(otherPreview.review_digest, preview.review_digest);
    const commit = {...first.input, review_digest: preview.review_digest};
    assert.deepEqual((await call(path + 'apply', owner, commit)).data, {created: 1, revised: 0, unchanged: 0});
    assert.deepEqual((await call(path + 'apply', owner, commit)).data, {created: 0, revised: 0, unchanged: 1});
    const old = await records();
    assert.ok(old.every(r => r.effective_visibility === 'organisation'));
    const w = old.find(r => r.record.record_id === report_id).record;
    assert.equal((await call(org + '/records/' + report_id + '/publication-preview', owner,
      {expected_head: refOf(w), expected_policy_id: null})).status, 409);
    assert.equal((await call(org + '/records/' + report_id, stranger)).status, 404);
    assert.equal((await call(registry + '/public/' + report_id)).status, 404);
    assert.equal((await call(path + 'preview', owner, next.input)).status, 400);
    const path2 = path + 'preview', p2 = (await updated(path2, owner, next.input)).data;
    assert.equal(p2.reports[0].status, 'revise');
    assert.match(p2.reports[0].previous.roles[0].identityGap, /\(1\)$/);
    assert.match(p2.reports[0].evidence.roles[0].identityGap, /\(2\)$/);
    const commit2 = {...next.input, review_digest: p2.review_digest};
    // A sharing policy change on one row invalidates the entire preview.
    const sharing = org + '/records/' + report_id + '/sharing';
    const setPolicy = (restricted, policy) => call(sharing, owner, {expected_head: refOf(w), expected_policy_id: policy, restricted});
    const changed = await setPolicy(true, null);
    assert.equal((await updated(path + 'apply', owner, commit2)).status, 409);
    assert.equal((await updated(path2, owner, next.input)).data.reports[0].status, 'needs_manual_review');
    assert.equal((await records()).find(r => r.record.record_id === packet_id).record.parent, null);
    assert.equal((await setPolicy(false, changed.data.sharing.policy_id)).status, 200);
    const p3 = (await updated(path2, owner, next.input)).data;
    const approved = {...next.input, review_digest: p3.review_digest};
    // Deliberately abort a packet write after the report reaches the SQL statement.
    db._db.exec(`CREATE TEMP TRIGGER test_abort_packet BEFORE INSERT ON registry_revisions
      WHEN NEW.record_id = '${packet_id}' AND NEW.seq = 2 BEGIN SELECT RAISE(ABORT, 'fixture rollback'); END`);
    assert.equal((await updated(path + 'apply', owner, approved)).status, 500);
    assert.ok((await records()).every(r => r.record.parent === null));
    db._db.exec('DROP TRIGGER test_abort_packet');
    assert.deepEqual((await updated(path + 'apply', owner, approved)).data,
      {created: 0, revised: 1, unchanged: 0});
    const history = await call(org + '/records/' + packet_id + '/history', owner);
    assert.equal(history.data.history.length, 2);
    assert.deepEqual(history.data.history[1].record.parent, refOf(history.data.history[0].record));
    for (const [revision, reason] of [[3, 'group_changed'], [4, 'role_absent']]) {
      const different = await roarFixture(contracts, revision);
      const incompatible = makeCall(db, {...contracts, roarRelease: different.pin});
      const planned = (await incompatible(path2, owner, different.input)).data;
      assert.deepEqual(planned.manual_reconciliation.map(r => [r.role_id, r.report_id, r.reason]),
        [['fixture-role', report_id, reason]]);
      assert.equal((await incompatible(path + 'apply', owner, {...different.input, review_digest: planned.review_digest})).status, 409);
      assert.equal((await records()).length, 2);
    }
    const backup = (await call(org + '/backup', owner)).data;
    const restored = memoryD1();
    await restoreRegistry(restored, backup);
    assert.deepEqual((await makeCall(restored, contracts)(org + '/records', owner)).data.records, await records());
  });

  test('reviewed public ROAR artifacts import against the unmodified built Worker', {skip: !process.env.ROAR_ATLAS_DIST}, async () => {
    const dir = process.env.ROAR_ATLAS_DIST;
    const input = {crosswalk: readFileSync(join(dir, 'roar-discovery.json'), 'utf8'),
      bundle: readFileSync(join(dir, 'instrument-model/0.1.0/2026-11-12.public.1/bundle.json'), 'utf8')};
    const call = makeCall(memoryD1()), owner = 'fixture-operator';
    const org = base + '/' + (await call(base, owner, {name: 'Synthetic workspace'})).data.organisation.id;
    const path = org + '/roar-import/';
    const preview = await call(path + 'preview', owner, input);
    assert.equal(preview.status, 200, JSON.stringify(preview.data));
    const {reports, counts, review_digest} = preview.data;
    assert.deepEqual(counts, {roles: 26, sources: 18, facilitySources: 7, conflicts: 4, models: 11});
    assert.equal(new Set(reports.flatMap(r => r.evidence.roles.map(l => l.id))).size, 26);
    assert.equal(new Set(reports.flatMap(r => r.evidence.conflicts.map(c => c.id))).size, 4);
    assert.equal(new Set(reports.flatMap(r => r.evidence.source_coverage.map(s => s.sourceId))).size, 7);
    const junior = reports.find(r => r.evidence.roles.some(l => l.id === 'junior-dispensing'));
    assert.equal(junior.report.reported_count, null);
    assert.equal(junior.evidence.roles.length, 3);
    assert.equal(junior.report.model.record_id, 'atlas:unchained-labs-freeslate-junior');
    for (const id of ['h-cube-pro', 'phoenix', 'agilent-1260-6250', 'agilent-1290-6530']) {
      const r = reports.find(r => r.evidence.roles.some(l => l.id === id));
      assert.equal(r.report.model, null);
      assert.ok(r.evidence.candidate_models.length);
    }
    assert.deepEqual((await call(path + 'apply', owner, {...input, review_digest})).data, {created: 13, revised: 0, unchanged: 0});
    assert.deepEqual((await call(path + 'apply', owner, {...input, review_digest})).data, {created: 0, revised: 0, unchanged: 13});
    const records = (await call(org + '/records', owner)).data.records;
    assert.equal(records.length, 26);
    assert.ok(records.every(r => r.visibility === 'organisation' && r.record.use_rights.republication === 'unknown'));
    assert.equal(records.filter(r => r.record.record.model).length, 7);
    assert.deepEqual((await call(registry + '/public')).data.publications, []);
    const backup = (await call(org + '/backup', owner)).data;
    await restoreRegistry(memoryD1(), backup);
  });
}
