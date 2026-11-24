import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {refOf} from '../../worker/registry/contract.js';
import {requestDraftFixture} from './request-draft-fixture.mjs';
import {restoreRegistry} from '../../scripts/restore-registry.mjs';

function limitedD1(filename) {
  const script = fileURLToPath(new URL('./d1-sqlite.py', import.meta.url));
  const execute = (mode, statements) => JSON.parse(execFileSync('python3', [script, filename], {
    input: JSON.stringify([mode, statements]), encoding: 'utf8', timeout: 10_000,
  }));
  const read = (sql, ...args) => execute('read', [[sql, args]]);
  const bound = (sql, args) => ({
    statement: [sql, args],
    async first() { return read(sql, ...args)[0] ?? null; },
    async all() { return {results: read(sql, ...args), success: true}; },
    async run() { return execute('write', [[sql, args]])[0]; },
  });
  return {
    execute, read,
    prepare: sql => ({...bound(sql, []), bind: (...args) => bound(sql, args)}),
    async batch(statements) { return execute('write', statements.map(q => q.statement)); },
  };
}
const date = '2026-01-01';
const rights = {discovery: 'permitted', assessment: 'permitted', republication: 'unknown', basis: 'Synthetic fixture'};
const source = {source: {namespace: 'example:record', native_id: 'fixture', url: 'https://example.org/fixture'},
  observed_at: date, visibility: 'public', snapshot_digest: null, use_rights: rights};
const migrations = 'dist/drizzle';
function migrate(db, start, end) {
  const sqlFiles = readdirSync(migrations).filter(f => f.endsWith('.sql')).sort();
  for (const file of sqlFiles.slice(start, end)) {
    const statements = readFileSync(join(migrations, file), 'utf8').split('--> statement-breakpoint')
      .map(sql => [sql.trim(), []]).filter(([sql]) => sql);
    db.execute('write', statements);
  }
}

export function d1UpgradeCases(call) {
  test('native prior migration prefix adds an empty replay ledger and supports exact drafts under the D1 limit', async t => {
    const dir = mkdtempSync(join(tmpdir(), 'planner-d1-request-'));
    t.after(() => rmSync(dir, {recursive: true, force: true}));
    const db = limitedD1(join(dir, 'request.sqlite'));
    migrate(db, 0, 11);
    assert.deepEqual(db.read("SELECT name FROM sqlite_schema WHERE name = 'registry_request_drafts'"), []);
    migrate(db, 11, 12);
    assert.deepEqual(db.read('SELECT COUNT(*) AS n FROM registry_request_drafts'), [{n: 0}]);
    const request = (path, method, body) => call(path, {env: {DB: db}, user: 'alice', method, body});
    const fixture = await requestDraftFixture(request, 'u-alice');
    const endpoint = fixture.path + '/assessments/' + fixture.matched.assessment_id + '/request-v1';
    const first = await request(endpoint, 'POST', fixture.body);
    assert.equal(first.status, 201, JSON.stringify(first.json));
    const replay = await request(endpoint, 'POST', fixture.body);
    assert.equal(replay.status, 200, JSON.stringify(replay.json));
    assert.deepEqual(replay.json, first.json);
  });

  test('native D1 upgrade preserves existing data, exact registry links and privacy under the compound SELECT limit', async t => {
    const dir = mkdtempSync(join(tmpdir(), 'planner-d1-upgrade-'));
    t.after(() => rmSync(dir, {recursive: true, force: true}));
    const db = limitedD1(join(dir, 'upgraded.sqlite'));
    const env = {DB: db};
    const ask = async (path, expected, user = 'legacy', body) => {
      const r = await call(path, {env, user, method: body === undefined ? 'GET' : 'POST', body});
      assert.equal(r.status, expected, path + ' ' + r.json?.error);
      return r.json;
    };
    migrate(db, 0, 4);
    const profile = {version: 1, equipment: [], workflows: [], answers: {fixture: 'legacy'}};
    db.execute('write', [
      ['INSERT INTO profiles (user_id, data, updated_at) VALUES (?,?,?)', ['u-legacy', JSON.stringify(profile), 100]],
      ['INSERT INTO members (user_id,email,name,role,status,joined_at) VALUES (?,?,?,?,?,?)',
        ['u-legacy', 'legacy@example.org', 'Legacy', 'member', 'active', 100]],
      ['INSERT INTO lab_protocols (collection_id,version_id,name,data,pushed_by,updated_at) VALUES (?,?,?,?,?,?)',
        [4, 41, 'Synthetic legacy protocol', '{"name":"Synthetic legacy protocol"}', 'u-legacy', 100]],
    ]);
    migrate(db, 4, 7);
    migrate(db, 7, 8);
    const queryEdges = 'SELECT org_id, record_id, revision_id, linked_id, linked_revision_id, edge FROM ';
    assert.deepEqual(db.read(queryEdges + 'registry_record_links'), []);
    const [{sql: serviceView}] = db.read("SELECT sql FROM sqlite_schema WHERE name = 'registry_record_links'");
    migrate(db, 8);

    assert.deepEqual((await ask('/api/profile', 200)).profile, profile);
    assert.deepEqual((await ask('/api/lab/protocols', 200)).protocols, [{name: 'Synthetic legacy protocol', lab: {pushedAt: 100}}]);
    assert.equal((await ask('/api/registry/public', 200, '')).publications.length, 0);
    await ask('/api/registry/organisations', 401, '');
    const {organisation} = await ask('/api/registry/organisations', 201, 'legacy', {name: 'Synthetic upgrade'});
    const org = '/api/registry/organisations/' + organisation.id;
    await ask(org + '/members', 200, 'legacy', {user_id: 'u-editor', role: 'editor'});
    const item = w => org + '/records/' + w.record_id;
    const create = async (record, extra) => (await ask(org + '/records', 201, 'legacy', {
      record, visibility: 'organisation', sources: [source], observed_at: date, expires_at: null, use_rights: rights, ...extra,
    })).revision.record;
    const installation = label => ({record_type: 'installation', label, model: null, reported_location: null, external_id_claims: []});
    const asset = await create(installation('Synthetic equipment'));
    const duplicate = await create(installation('Duplicate report'));
    const config = await create({record_type: 'configuration', installation: refOf(asset), fitted_modules: null, operating_envelopes: null});
    const policy = {source: {namespace: 'planner:facility_policy', native_id: 'fixture', version: '1'}, content_digest: 'sha256:' + '1'.repeat(64)};
    const offer = {record_type: 'offer', label: 'Synthetic service', state: 'listed', provider: {namespace: 'example:facility', native_id: 'fixture'},
      backing_installations: null, backing_configurations: null, external_id_claims: [], material_exclusions: null,
      access_policy: {revision: policy, facility_default: null, effective_from: date, effective_until: null},
      terms: {methods: null, accepted_inputs: null, output_deliverables: null, delivery_modes: null, price: null, lead_times: null, routes: null}};
    const facility = await create(offer, {service: {kind: 'facility_default', contacts: {}}});
    const service = await create({...offer, backing_installations: [refOf(asset)], backing_configurations: [refOf(config)],
      access_policy: {...offer.access_policy, revision: {...policy, source: {...policy.source, namespace: 'example:policy'}},
        facility_default: {source: {namespace: 'planner:registry_offer', native_id: facility.record_id, version: facility.revision_id},
          content_digest: facility.content_digest}}});
    const assertion = (claim_kind, related_assertions) => ({record_type: 'assertion', target: refOf(service), claim_kind,
      state: 'reported', outcome: 'affirmed', asserted_by: null, claimed_provider: null, claimed_custodian: null,
      verified_authority: null, statement: 'Synthetic report', observed_at: date, valid_until: null, related_assertions});
    const training = await create(assertion('training', []));
    const related = await create(assertion('training', [refOf(training)]));
    const availability = await create(assertion('availability', []));
    const claim = {target: refOf(service), observed_at: date, valid_until: null};
    const access = await create({...claim, record_type: 'access_claim', dimension: 'training', outcome: 'affirmed',
      subject: {kind: 'public', id: null}, supporting_assertions: [refOf(related)]});
    const available = await create({...claim, record_type: 'availability_claim', state: 'available',
      window: null, supporting_assertions: [refOf(availability)]});
    const reconcile = async (head, action) => (await ask(item(head) + '/reconciliation', 200, 'legacy', {
      expected_head: refOf(head), expected_target: refOf(asset), action, observed_at: date, reason: 'Synthetic reconciliation evidence',
    })).revision.record;
    const linked = await reconcile(duplicate, 'link');
    assert.equal((await ask(item(asset) + '/reconciliation', 200)).duplicate_sources[0].reference.revision_id, linked.revision_id);
    const unlinked = await reconcile(linked, 'unlink');

    const edge = (from, to, kind) => ({org_id: organisation.id, record_id: from.record_id, revision_id: from.revision_id,
      linked_id: to.record_id, linked_revision_id: to.revision_id, edge: kind});
    const edges = [edge(config, asset, 'installation'), edge(service, asset, 'installation'), edge(service, config, 'configuration'),
      edge(service, facility, 'facility_default'), edge(training, service, 'target'), edge(related, service, 'target'),
      edge(related, training, 'assertion'), edge(availability, service, 'target'), edge(access, service, 'target'),
      edge(access, related, 'assertion'), edge(available, service, 'target'), edge(available, availability, 'assertion')];
    const compareEdges = (actual, expected) => assert.deepEqual(actual.map(x => JSON.stringify(x)).sort(), expected.map(x => JSON.stringify(x)).sort());
    compareEdges(db.read(queryEdges + 'registry_record_links'), [...edges,
      edge(linked, asset, 'reconciliation'), edge(unlinked, asset, 'reconciliation')]);
    // Re-run the exact 0007 view against the populated tables as well.
    db.execute('write', [[serviceView.replace('VIEW registry_record_links', 'VIEW registry_links_0007'), []]]);
    compareEdges(db.read(queryEdges + 'registry_links_0007'), edges);
    db.execute('write', [['DROP VIEW registry_links_0007', []]]);

    const match = {expected_head: refOf(service), method: null, material: null, conditions: [], requirements: [], save: true};
    const {assessment_id} = await ask(item(service) + '/match', 201, 'editor', match);
    const saved = org + '/assessments/' + assessment_id;
    const {assessment} = await ask(saved, 200, 'editor');
    assert.equal(assessment.current, true);
    assert.deepEqual(assessment.dependencies.map(d => d.reference.revision_id).sort(),
      [service, asset, config, facility, training, related, availability, access, available].map(w => w.revision_id).sort());
    await ask(item(asset) + '/sharing', 200, 'legacy', {expected_head: refOf(asset), expected_policy_id: null, restricted: true});
    for (const w of [asset, config, service, access, available, unlinked]) await ask(item(w), 404, 'editor');
    await ask(item(service) + '/match', 404, 'editor', match);
    const {assessment: hidden} = await ask(saved, 200, 'editor');
    assert.equal(hidden.current, false);
    assert.equal(Object.hasOwn(hidden, 'match'), false);
    assert.ok(hidden.dependencies.some(d => d.status === 'unavailable' && !Object.hasOwn(d, 'reference')));
    await ask(item(service), 200);
    await ask(item(service), 404, 'stranger');
    await ask('/api/registry/public/' + service.record_id, 404, '');

    const archive = await ask(org + '/backup', 200);
    const restored = limitedD1(join(dir, 'restored.sqlite'));
    migrate(restored, 0);
    await restoreRegistry(restored, archive);
    assert.equal((await call(item(service), {env: {DB: restored}, user: 'editor'})).status, 404);
    assert.deepEqual((await call(saved, {env: {DB: restored}, user: 'editor'})).json.assessment, hidden);
  });
}
