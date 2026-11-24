import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync, existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {memoryD1} from '../scripts/memory-d1.mjs';
import {createHash} from 'node:crypto';
import {d1UpgradeCases} from './helpers/d1-upgrade-cases.js';
import {roarCases} from './helpers/roar-cases.js';
import {requestDraftCases} from './helpers/request-draft-cases.js';
import {registryCases} from './helpers/registry-cases.js';
import {planningCases} from './helpers/planning-cases.js';

execFileSync(process.execPath, ['scripts/build.mjs']);
const {default: worker, handle, assets} = await import(pathToFileURL(resolve('dist/server/index.js')).href + `?t=${Date.now()}`);
const env = {DB: memoryD1(), OWNER_EMAIL: 'owner@example.org', LAB_NAME: 'Test lab'};
const as = user => user ? {'oai-authenticated-user-id': `u-${user}`, 'oai-authenticated-user-email': `${user}@example.org`, 'oai-authenticated-user-full-name': user} : {};
const call = async (path, {method = 'GET', user, body, headers = {}, env: e = env} = {}) => {
  const r = await worker.fetch(new Request(`https://atlas.example${path}`, {method, headers: {...as(user), ...(body !== undefined ? {'Content-Type': 'application/json'} : {}), ...headers}, body: body !== undefined ? JSON.stringify(body) : undefined}), e);
  return {status: r.status, type: r.headers.get('content-type'), json: r.headers.get('content-type')?.includes('json') ? await r.json() : null, text: r.headers.get('content-type')?.includes('json') ? null : await r.text()};
};
const profile = name => ({version: 1, equipment: [{id: 'e1', name, modelId: 'flex', options: {}}], workflows: [], answers: {}, protocols: [{schema: 'x', secret: 'unpublished method'}], protocolArchive: [{schema: 'x', secret: 'archived private text'}]});

test('the artifact has the Workshop layout: one worker, hosting with a D1 binding, migrations', () => {
  assert.ok(existsSync('dist/server/index.js'));
  assert.equal(JSON.parse(readFileSync('dist/.openai/hosting.json', 'utf8')).d1, 'DB');
  assert.match(readFileSync('dist/drizzle/0000_profiles.sql', 'utf8'), /CREATE TABLE IF NOT EXISTS `profiles`/);
  assert.ok(!/import\s.*from/.test(readFileSync('dist/server/index.js', 'utf8').slice(0, 5000)), 'self-contained: no imports');
});

test('the worker serves the site with no sign-in needed', async () => {
  const page = await call('/web/index.html');
  assert.equal(page.status, 200);
  assert.match(page.type, /text\/html/);
  assert.match(page.text, /Automation Atlas/);
  assert.equal((await call('/content/operations.json')).status, 200);
  assert.equal((await call('/tests/fixtures/workflows.json')).status, 404, 'test fixtures are not served');
});

test('signed-out visitors see sign-in links and cannot read or write profiles', async () => {
  const me = await call('/api/me');
  assert.deepEqual([me.json.user, me.json.signIn, me.json.storage], [null, '/signin-with-chatgpt', true]);
  assert.equal((await call('/api/profile')).status, 401);
  assert.equal((await call('/api/profile', {method: 'PUT', body: profile('x')})).status, 401);
});

test('each ChatGPT user has their own profile, and protocols are never stored', async () => {
  assert.equal((await call('/api/me', {user: 'alice'})).json.user.name, 'alice');
  const put = await call('/api/profile', {method: 'PUT', user: 'alice', body: profile('Alice Flex')});
  assert.equal(put.status, 200);
  assert.equal(put.json.profile.protocols, undefined);
  assert.equal(put.json.profile.protocolArchive, undefined);
  assert.ok(!env.DB._db.prepare('SELECT data FROM profiles WHERE user_id = ?').get('u-alice').data.includes('unpublished'), 'protocol text never reaches the database');
  assert.equal((await call('/api/profile', {user: 'bob'})).json.profile, null, 'Bob cannot see Alice’s profile');
  await call('/api/profile', {method: 'PUT', user: 'bob', body: profile('Bob')});
  assert.equal((await call('/api/profile', {user: 'alice'})).json.profile.equipment[0].name, 'Alice Flex', 'Bob cannot overwrite it');
});

test('cross-site, non-JSON and malformed writes are refused', async () => {
  assert.equal((await call('/api/profile', {method: 'PUT', user: 'carol', body: profile('x'), headers: {Origin: 'https://evil.example'}})).status, 403);
  const r = await worker.fetch(new Request('https://atlas.example/api/profile', {method: 'PUT', headers: {...as('carol'), 'Content-Type': 'text/plain'}, body: '{}'}), env);
  assert.equal(r.status, 415);
  assert.equal((await call('/api/profile', {method: 'PUT', user: 'carol', body: {version: 2}})).status, 400);
});

test('without the D1 binding, profiles report unavailable instead of failing', async () => {
  assert.equal((await call('/api/me', {env: {}})).json.storage, false);
  assert.equal((await call('/api/profile', {user: 'dan', env: {}})).status, 503);
});

test('candidate setups (#89) sync to the account, keeping only catalogue fields', async () => {
  const body = {...profile('Setups'), setups: [{id: 's1', name: 'Shared workcell', handler: 'flex', route: 'workcell', pipettes: '2x8', modules: ['Gripper'], devices: ['storage'], notes: 'private quote details'}, {nope: true}]};
  const put = await call('/api/profile', {method: 'PUT', user: 'carol', body});
  assert.equal(put.status, 200);
  const got = (await call('/api/profile', {user: 'carol'})).json.profile;
  assert.deepEqual(got.setups, [{id: 's1', name: 'Shared workcell', handler: 'flex', route: 'workcell', pipettes: '2x8', modules: ['Gripper'], devices: ['storage']}]);
  assert.ok(!JSON.stringify(got).includes('private quote details'));
});

// ---------------------------------------------------------------- lab and reviews (#105)
const packet = {version: 1, workflow: {name: 'Synthetic bind'}, assumptions: [{id: 'a1', text: 'Plate format assumed'}],
  steps: [{id: 'p-1', name: 'Bind', lines: ['Add 50 µl beads to each well.'], handsOn: {lo: 5, hi: 10}, waits: []}, {id: 'p-2', name: 'Wash', lines: ['Wash twice.'], handsOn: {lo: 2, hi: 4}, waits: []}]};

test('lab: the OWNER_EMAIL person owns it; invited people are admitted, others wait for approval', async () => {
  assert.equal((await call('/api/lab')).status, 401);
  const owner = await call('/api/lab', {user: 'owner'});
  assert.deepEqual([owner.json.me.role, owner.json.me.status, owner.json.lab.name], ['owner', 'active', 'Test lab']);
  // Someone who signs in uninvited waits, and cannot see members or reviews.
  const stranger = await call('/api/lab', {user: 'stranger'});
  assert.equal(stranger.json.me.status, 'pending');
  assert.deepEqual(stranger.json.members, []);
  assert.equal((await call('/api/reviews', {user: 'stranger'})).status, 403);
  // Only the owner invites.
  assert.equal((await call('/api/lab/invites', {method: 'POST', user: 'stranger', body: {email: 'maria@example.org'}})).status, 403);
  assert.equal((await call('/api/lab/invites', {method: 'POST', user: 'owner', body: {email: 'not an email'}})).status, 400);
  assert.equal((await call('/api/lab/invites', {method: 'POST', user: 'owner', body: {email: 'Maria@Example.org'}})).status, 200);
  assert.deepEqual((await call('/api/lab', {user: 'owner'})).json.invites.map(i => i.email), ['maria@example.org']);
  const maria = await call('/api/lab', {user: 'maria'});
  assert.deepEqual([maria.json.me.role, maria.json.me.status], ['member', 'active'], 'the invitation admits her at first sign-in');
  assert.deepEqual((await call('/api/lab', {user: 'owner'})).json.invites, [], 'a used invitation is cleared');
  assert.ok(!('email' in maria.json.members[0]), 'members do not see each other’s emails');
  // The owner admits the waiting person, and can remove them again.
  const pending = (await call('/api/lab', {user: 'owner'})).json.members.find(m => m.status === 'pending');
  assert.equal(pending.name, 'stranger');
  assert.equal((await call('/api/lab/members', {method: 'POST', user: 'maria', body: {id: pending.id, status: 'active'}})).status, 403);
  assert.equal((await call('/api/lab/members', {method: 'POST', user: 'owner', body: {id: pending.id, status: 'active'}})).status, 200);
  assert.equal((await call('/api/reviews', {user: 'stranger'})).status, 200);
  assert.equal((await call('/api/lab/members', {method: 'POST', user: 'owner', body: {id: pending.id, status: 'removed'}})).status, 200);
  assert.equal((await call('/api/reviews', {user: 'stranger'})).status, 403);
  const ownerId = (await call('/api/lab', {user: 'owner'})).json.me.id;
  assert.equal((await call('/api/lab/members', {method: 'POST', user: 'owner', body: {id: ownerId, status: 'removed'}})).status, 400, 'the owner cannot be removed through the API');
});

test('reviews: lab members publish and answer; outsiders and closed reviews are refused', async () => {
  await call('/api/lab/invites', {method: 'POST', user: 'owner', body: {email: 'megan@example.org'}});
  assert.equal((await call('/api/reviews', {method: 'POST', user: 'owner', body: {title: 'x', packet: {version: 1, steps: []}}})).status, 400);
  const made = await call('/api/reviews', {method: 'POST', user: 'owner', body: {title: 'HT timings', packet}});
  assert.equal(made.status, 200);
  const id = made.json.id;
  assert.equal((await call(`/api/reviews/${id}`, {user: 'outsider'})).status, 403, 'not readable outside the lab');
  assert.equal((await call(`/api/reviews/${id}`)).status, 401);
  const seen = await call(`/api/reviews/${id}`, {user: 'megan'});
  assert.equal(seen.json.review.packet.steps[0].lines[0], 'Add 50 µl beads to each well.');
  assert.equal(seen.json.review.canManage, false);
  // Answers are per person and per step, and are cleaned.
  assert.equal((await call(`/api/reviews/${id}/responses`, {method: 'PUT', user: 'megan', body: {stepId: 'p-1', verdict: 'longer', handsOnMin: 25, comment: 'Beads take a while'}})).status, 200);
  assert.equal((await call(`/api/reviews/${id}/responses`, {method: 'PUT', user: 'megan', body: {stepId: 'p-1', verdict: 'longer', handsOnMin: 30}})).status, 200, 'answering again replaces the answer');
  assert.equal((await call(`/api/reviews/${id}/responses`, {method: 'PUT', user: 'megan', body: {stepId: 'p-9', verdict: 'right'}})).status, 400);
  assert.equal((await call(`/api/reviews/${id}/responses`, {method: 'PUT', user: 'megan', body: {stepId: 'p-1', verdict: 'maybe'}})).status, 400);
  assert.equal((await call(`/api/reviews/${id}/responses`, {method: 'PUT', user: 'megan', body: {stepId: 'p-1', handsOnMin: -3}})).status, 400);
  assert.equal((await call(`/api/reviews/${id}/responses`, {method: 'PUT', user: 'megan', body: {stepId: '_overall', asRun: 'mostly', batch: 24, comment: 'We run 24'}})).status, 200);
  assert.equal((await call(`/api/reviews/${id}/responses`, {method: 'PUT', user: 'outsider', body: {stepId: 'p-1', verdict: 'right'}})).status, 403);
  const all = await call(`/api/reviews/${id}`, {user: 'owner'});
  assert.equal(all.json.review.canManage, true);
  assert.deepEqual(all.json.responses.map(r => [r.name, r.stepId, r.verdict ?? r.asRun, r.handsOnMin ?? r.batch]).sort(), [['megan', '_overall', 'mostly', 24], ['megan', 'p-1', 'longer', 30]]);
  assert.deepEqual((await call('/api/reviews', {user: 'megan'})).json.reviews.map(r => [r.title, r.responders]), [['HT timings', 1]]);
  // Only the author or owner closes it; then no more answers.
  assert.equal((await call(`/api/reviews/${id}/status`, {method: 'POST', user: 'megan', body: {status: 'closed'}})).status, 403);
  assert.equal((await call(`/api/reviews/${id}/status`, {method: 'POST', user: 'owner', body: {status: 'closed'}})).status, 200);
  assert.equal((await call(`/api/reviews/${id}/responses`, {method: 'PUT', user: 'megan', body: {stepId: 'p-2', verdict: 'right'}})).status, 409);
  // Profiles still never hold protocol text.
  assert.ok(!JSON.stringify(env.DB._db.prepare('SELECT data FROM profiles').all()).includes('beads'));
});

test('lab writes refuse cross-site requests', async () => {
  assert.equal((await call('/api/lab/invites', {method: 'POST', user: 'owner', body: {email: 'x@example.org'}, headers: {Origin: 'https://evil.example'}})).status, 403);
  assert.equal((await call('/api/reviews', {method: 'POST', user: 'owner', body: {title: 't', packet}, headers: {Origin: 'https://evil.example'}})).status, 403);
});

// ---------------------------------------------------------------- lab protocols and equipment (#145)
// Member-only reads, owner-only writes, push keys approved by the owner, and profiles that never hold protocols.
const callIn = (e, path, o) => call(path, {...o, env: e});
const KEY = 'k'.repeat(43), HASH = createHash('sha256').update(KEY).digest('hex');
const bearer = (key = KEY) => ({Authorization: `Bearer ${key}`});
const exportOf = (id, version = 10, number = 1, text = 'Record status.') => ({
  schema: 'lab-mcp/protocol-export/1', source: 'labstep', collection_id: id, name: `Protocol ${id}`,
  version: {id: version, number, locked_at: '2026-10-01T00:00:00Z', is_draft: false},
  collection_updated_at: '2026-11-01', retrieved_at: '2026-11-01T00:00:00Z',
  content_hash: 'sha256:' + createHash('sha256').update(`[[null, ${JSON.stringify(text)}]]`).digest('hex'),
  steps: [{position: 1, title: 'Checkpoint', text, guid: null, prescribedSeconds: 17}],
});
const equipment = [{id: 'lab-i7', name: 'Hub i7', modelId: 'i7', access: 'unknown', options: {}}];

test('lab protocols and equipment (#145): push key approval, member-only reads, owner-only writes', async () => {
  const env = {DB: memoryD1(), OWNER_EMAIL: 'owner@example.org', LAB_NAME: 'Test lab'};
  const call = (path, o = {}) => callIn(env, path, o);
  await call('/api/lab', {user: 'owner'});
  await call('/api/lab/invites', {method: 'POST', user: 'owner', body: {email: 'maria@example.org'}});
  await call('/api/lab', {user: 'maria'});
  await call('/api/lab', {user: 'stranger'});

  // Push refused without a key, with an unapproved key, and approval is owner-only.
  assert.equal((await call('/api/labstep/protocols')).status, 401);
  assert.equal((await call('/api/labstep/protocols', {headers: bearer()})).status, 403);
  assert.equal((await call('/api/lab/push-keys', {method: 'POST', user: 'maria', body: {hash: HASH}})).status, 403);
  assert.equal((await call('/api/lab/push-keys', {method: 'POST', user: 'owner', body: {hash: 'nope'}})).status, 400);
  assert.equal((await call('/api/lab/push-keys', {method: 'POST', user: 'owner', body: {hash: HASH, label: 'Mac'}})).status, 200);
  assert.deepEqual((await call('/api/lab', {user: 'owner'})).json.pushKeys.map(k => k.label), ['Mac']);
  assert.deepEqual((await call('/api/lab', {user: 'maria'})).json.pushKeys, [], 'members do not see push keys');

  // Approved key pushes protocols and equipment.
  assert.equal((await call('/api/labstep/protocols/101', {method: 'PUT', headers: bearer(), body: exportOf(101)})).status, 200);
  assert.equal((await call('/api/labstep/protocols/102', {method: 'PUT', headers: bearer(), body: exportOf(102)})).status, 200);
  assert.equal((await call('/api/labstep/protocols/103', {method: 'PUT', headers: bearer(), body: exportOf(999)})).status, 400, 'collection ID must match the address');
  assert.equal((await call('/api/labstep/protocols/104', {method: 'PUT', headers: bearer(), body: {...exportOf(104), schema: 'other'}})).status, 400);
  assert.equal((await call('/api/labstep/equipment', {method: 'PUT', headers: bearer(), body: {equipment}})).status, 200);
  assert.equal((await call('/api/labstep/equipment', {method: 'PUT', headers: bearer(), body: {equipment: [{id: 'x'}]}})).status, 400, 'each instrument needs a model');

  // Members read; pending people, outsiders and signed-out visitors cannot.
  const read = await call('/api/lab/protocols', {user: 'maria'});
  assert.equal(read.status, 200);
  assert.deepEqual(read.json.protocols.map(p => p.collection_id).sort(), [101, 102]);
  assert.equal(read.json.protocols[0].lab.pushedAt > 0, true);
  assert.deepEqual((await call('/api/lab/equipment', {user: 'maria'})).json.equipment.map(e => e.id), ['lab-i7']);
  assert.equal((await call('/api/lab/equipment', {user: 'maria'})).json.canEdit, false);
  assert.equal((await call('/api/lab/protocols', {user: 'stranger'})).status, 403);
  assert.equal((await call('/api/lab/equipment', {user: 'stranger'})).status, 403);
  assert.equal((await call('/api/lab/protocols')).status, 401);

  // Only the owner edits the lab's equipment from the browser.
  assert.equal((await call('/api/lab/equipment', {method: 'PUT', user: 'maria', body: {equipment: []}})).status, 403);
  assert.equal((await call('/api/lab/equipment', {method: 'PUT', user: 'owner', body: {equipment: [...equipment, {id: 'lab-bravo', modelId: 'bravo', lab: true}]}})).status, 200);
  const eq = (await call('/api/lab/equipment', {user: 'owner'})).json;
  assert.deepEqual([eq.equipment.map(e => e.id), eq.canEdit, 'lab' in eq.equipment[1]], [['lab-i7', 'lab-bravo'], true, false]);
  assert.equal((await call('/api/lab/equipment', {method: 'PUT', user: 'owner', body: {equipment: []}, headers: {Origin: 'https://evil.example'}})).status, 403);

  // Prune keeps listed protocols and refuses an empty list.
  assert.equal((await call('/api/labstep/prune', {method: 'POST', headers: bearer(), body: {keep: []}})).status, 400);
  assert.deepEqual((await call('/api/labstep/prune', {method: 'POST', headers: bearer(), body: {keep: [101]}})).json.removed, [102]);

  // Profiles still never hold protocols.
  await call('/api/profile', {method: 'PUT', user: 'maria', body: {version: 1, equipment: [], workflows: [], protocols: [exportOf(5)]}});
  assert.equal('protocols' in (await call('/api/profile', {user: 'maria'})).json.profile, false);

  // A removed key, or a key whose member is no longer the owner, stops working.
  assert.equal((await call('/api/lab/push-keys', {method: 'POST', user: 'owner', body: {hash: HASH, remove: true}})).status, 200);
  assert.equal((await call('/api/labstep/protocols', {headers: bearer()})).status, 403);
  assert.equal((await call('/api/lab/push-keys', {method: 'POST', user: 'owner', body: {hash: HASH}})).status, 200);
  assert.equal((await call('/api/labstep/protocols', {headers: bearer()})).status, 200);
  const moved = {...env, OWNER_EMAIL: 'someone-else@example.org'};
  assert.equal((await callIn(moved, '/api/labstep/protocols', {headers: bearer()})).status, 403, 'ownership moved: the old owner key is refused');
});

test('OWNER_EMAIL may list several addresses for one owner who signs in more than one way', async () => {
  const e = {DB: memoryD1(), OWNER_EMAIL: 'work@uni.example, Second@Example.org', LAB_NAME: 'Test lab'};
  const second = await call('/api/lab', {user: 'second', env: e});
  assert.deepEqual([second.json.me.role, second.json.me.status], ['owner', 'active']);
  const other = await call('/api/lab', {user: 'other', env: e});
  assert.equal(other.json.me.status, 'pending');
});

test('a push key listed in LAB_PUSH_KEYS is trusted without a browser approval (#185)', async () => {
  const key = 'q'.repeat(43), hash = createHash('sha256').update(key).digest('hex');
  const e = {DB: memoryD1(), OWNER_EMAIL: 'owner@example.org', LAB_PUSH_KEYS: `ffff, ${hash}`};
  const auth = {Authorization: `Bearer ${key}`};
  assert.equal((await call('/api/labstep/protocols/7', {method: 'PUT', headers: auth, env: e, body: exportOf(7)})).status, 200);
  assert.equal((await call('/api/labstep/equipment', {method: 'PUT', headers: auth, env: e, body: {equipment: [{id: 'a', modelId: 'i7'}]}})).status, 200);
  assert.equal((await call('/api/labstep/protocols', {headers: {Authorization: `Bearer ${'z'.repeat(43)}`}, env: e})).status, 403, 'other keys still need approval');
  await call('/api/lab', {user: 'owner', env: e});
  assert.deepEqual((await call('/api/lab/protocols', {user: 'owner', env: e})).json.protocols.map(p => p.collection_id), [7]);
});

test('Labstep writes are monotonic and archive the exact previous version atomically', async () => {
  const key = 'j'.repeat(43);
  const headers = {Authorization: `Bearer ${key}`};
  const e = {...env, DB: memoryD1(), LAB_PUSH_KEYS: createHash('sha256').update(key).digest('hex')};
  const put = (raw, extra = {}) => call(`/api/labstep/protocols/${raw.collection_id}`, {
    env: e, method: 'PUT', headers: {...headers, ...extra}, body: raw,
  });
  const latest = async () => (await call('/api/lab/protocols', {env: e, user: 'owner'})).json.protocols.find(x => x.collection_id === 700);
  const archived = (id, user) => call(`/api/lab/protocols/700/versions/${id}`, {env: e, user});
  const one = exportOf(700, 701, 1, 'Symbol α and 𐐷.\r\nRecord status.\t');
  assert.equal((await put({...one, content_hash: 'sha256:' + 'a'.repeat(64)})).status, 400);
  assert.equal((await put({...one, version: {...one.version, number: '1'}})).status, 400);
  assert.equal((await put(one)).status, 200);
  const refreshed = {has_unpublished_draft: true, ...one, retrieved_at: '2026-11-02T00:00:00Z'};
  const changed = structuredClone(refreshed);
  changed.steps[0].prescribedSeconds = 18;
  assert.equal((await put(changed)).status, 409);
  assert.equal((await put({...refreshed, observed: {medianMin: 42}})).status, 409);
  assert.equal((await put(refreshed)).status, 200, 'same version and payload, newer source facts');
  assert.equal((await latest()).has_unpublished_draft, true);
  assert.equal((await latest()).steps[0].prescribedSeconds, 17);
  assert.equal((await put(one)).status, 409, 'older capture of the same version');
  assert.equal((await put(exportOf(700, 701, 1, 'Different text.'))).status, 409, 'same ID and a different valid hash');
  assert.equal((await put(exportOf(700, 711, 1))).status, 409, 'equal number with a different ID');

  const two = exportOf(700, 702, 2), three = exportOf(700, 703, 3);
  const [a, b] = await Promise.all([put(three), put(two)]);
  assert.equal(a.status, 200);
  assert.ok([200, 409].includes(b.status));
  assert.equal((await latest()).version.id, 703);
  assert.equal((await put(exportOf(700, 701, 4))).status, 409, 'an archived ID cannot be promoted');
  assert.equal((await archived(701)).status, 401);
  assert.equal((await archived(701, 'not-in-the-lab')).status, 403);
  const prior = await archived(701, 'owner');
  assert.equal(prior.status, 200);
  assert.deepEqual(prior.json.protocol.steps, one.steps);
  assert.equal(prior.json.protocol.retrieved_at, refreshed.retrieved_at);

  const draft = exportOf(700, 704, 4);
  draft.version = {...draft.version, is_draft: true, locked_at: null};
  assert.equal((await put(draft)).status, 409);
  assert.equal((await put(draft, {'x-planner-allow-draft': `700:704:${one.content_hash}`})).status, 409);
  assert.equal((await put(draft, {'x-planner-allow-draft': `700:704:${draft.content_hash}`})).status, 200);

  assert.equal((await put(exportOf(800))).status, 200);
  assert.equal((await call('/api/labstep/prune', {env: e, method: 'POST', headers, body: {keep: [800]}})).status, 200);
  assert.equal(await latest(), undefined);
  assert.equal((await archived(701, 'owner')).status, 404);
  assert.equal((await e.DB.prepare('SELECT count(*) AS n FROM lab_protocol_versions').first()).n, 0);
});

registryCases(call);
roarCases(handle, assets);
d1UpgradeCases(call);
planningCases(worker);

requestDraftCases(call);
