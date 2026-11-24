// Google and email/password sign-in (#132): the Workshop's Auth0 route, ported.
// A stand-in Auth0 (scripts/mock-oidc.mjs) signs real RS256 tokens; the worker
// runs against the in-memory D1 with every migration applied.
import test from 'node:test';
import assert from 'node:assert/strict';
import {memoryD1} from '../scripts/memory-d1.mjs';
import {mockOidc} from '../scripts/mock-oidc.mjs';
// The worker source itself (it has no imports); tests/worker.test.js covers the built bundle.
import * as built from '../worker/app.js';
const ORIGIN = 'https://atlas.example';
const AUTH = {AUTH_ISSUER: 'https://tenant.example.auth0.com/', AUTH_CLIENT_ID: 'planner-client', AUTH_CLIENT_SECRET: 'test-secret', AUTH_CALLBACK_URL: `${ORIGIN}/auth/oidc/callback`};
const idp = await mockOidc({issuer: AUTH.AUTH_ISSUER, clientId: AUTH.AUTH_CLIENT_ID, clientSecret: AUTH.AUTH_CLIENT_SECRET});
const fresh = (extra = {}) => ({DB: memoryD1(), OWNER_EMAIL: 'owner@example.org', LAB_NAME: 'Test lab', ...AUTH, ...extra});

// A browser: a cookie jar, and optionally a ChatGPT sign-in (the Sites headers).
function browser(env, chatgpt) {
  const jar = new Map();
  const self = {
    jar, chatgpt,
    async go(path, {method = 'GET', form, json, origin = ORIGIN, headers = {}} = {}) {
      const h = new Headers(headers);
      if (self.chatgpt) { h.set('oai-authenticated-user-id', `u-${self.chatgpt}`); h.set('oai-authenticated-user-email', `${self.chatgpt}@example.org`); h.set('oai-authenticated-user-full-name', self.chatgpt); }
      if (jar.size) h.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
      let body;
      if (form) { h.set('content-type', 'application/x-www-form-urlencoded'); body = new URLSearchParams(form).toString(); }
      if (json) { h.set('content-type', 'application/json'); body = JSON.stringify(json); }
      if (method !== 'GET' && origin) h.set('origin', origin);
      const url = path.startsWith('http') ? path : ORIGIN + path;
      const r = await built.handle(new Request(url, {method, headers: h, body}), env, {}, {fetcher: idp.fetcher});
      for (const c of r.headers.getSetCookie()) { const [kv, ...attrs] = c.split(';'); const [k, v] = kv.split('='); if (/Max-Age=0/.test(attrs.join(';'))) jar.delete(k); else jar.set(k, v); assert.match(c, /^__Host-.*; Path=\/; HttpOnly; Secure; SameSite=Lax/); }
      const type = r.headers.get('content-type') || '';
      return {status: r.status, location: r.headers.get('location'), json: type.includes('json') ? await r.json() : null, text: type.includes('json') ? null : await r.text(), headers: r.headers};
    },
    // Start at the planner, sign in at the provider, come back through the callback.
    async login(method, as, opts = {}) {
      const start = opts.link ? await self.go('/auth/link', {method: 'POST', form: {method, return_to: '/web/index.html#lab'}}) : await self.go(`/auth/login?method=${method}&return_to=${encodeURIComponent('/web/index.html#lab')}`);
      assert.equal(start.status, 303, start.text);
      return self.go(idp.authorize(start.location, as, opts));
    },
    me: async () => (await self.go('/api/me')).json,
  };
  return self;
}
const profile = name => ({version: 1, equipment: [{id: 'e1', name, modelId: 'flex', options: {}}], workflows: [], answers: {}});

test('without the AUTH_* settings, sign-in is ChatGPT-only and exactly as before', async () => {
  const env = {DB: memoryD1(), OWNER_EMAIL: 'owner@example.org'};
  const b = browser(env);
  const me = await b.me();
  assert.deepEqual([me.user, me.signIn, me.signOut, me.signOutPost, me.login.enabled], [null, '/signin-with-chatgpt', '/signout-with-chatgpt', false, false]);
  const page = await b.go('/auth/signin');
  assert.match(page.text, /Continue with ChatGPT/);
  assert.doesNotMatch(page.text, /Google|email and password/);
  assert.equal((await b.go('/auth/login?method=google')).status, 503);
  b.chatgpt = 'alice';
  assert.equal((await b.me()).user.name, 'alice');
  // Settings on a different address (an alias) also leave the extra methods off.
  const alias = browser(fresh({AUTH_CALLBACK_URL: 'https://other.example/auth/oidc/callback'}));
  assert.equal((await alias.me()).login.enabled, false);
  // An unsafe callback or issuer is not accepted as configuration.
  assert.equal((await browser(fresh({AUTH_ISSUER: 'http://tenant.example/'})).me()).login.enabled, false);
  assert.equal((await browser(fresh({AUTH_CALLBACK_URL: `${ORIGIN}/elsewhere`})).me()).login.enabled, false);
  assert.equal((await browser(fresh({AUTH_GOOGLE_ENABLED: 'false'})).me()).login.google, false);
});

test('configured: the sign-in page offers Google and email; the authorize request uses PKCE', async () => {
  const b = browser(fresh());
  const me = await b.me();
  assert.deepEqual([me.signIn, me.login], ['/auth/signin', {enabled: true, google: true, password: true}]);
  const page = await b.go('/auth/signin?return_to=%2Fweb%2Findex.html%23lab');
  assert.match(page.text, /Continue with ChatGPT/);
  assert.match(page.text, /href="\/auth\/login\?method=google&amp;return_to=%2Fweb%2Findex.html%23lab"/);
  assert.match(page.text, /Continue with email and password/);
  const start = await b.go('/auth/login?method=google');
  const q = new URL(start.location).searchParams;
  assert.equal(new URL(start.location).origin, 'https://tenant.example.auth0.com');
  assert.deepEqual([q.get('code_challenge_method'), q.get('connection'), q.get('redirect_uri'), q.get('prompt'), q.get('scope')], ['S256', 'google-oauth2', AUTH.AUTH_CALLBACK_URL, null, 'openid profile email'], 'ordinary sign-in reuses the Auth0 session (#160)');
  assert.ok(!start.location.includes('test-secret'), 'the client secret never reaches the browser');
  assert.ok(b.jar.has('__Host-planner_login'));
  assert.equal((await b.go('/auth/login?method=github')).status, 400);
});

test('a new Google user gets an ordinary account that joins the lab like any newcomer', async () => {
  const env = fresh();
  const b = browser(env);
  const done = await b.login('google', {email: 'Megan@Imperial.example', id: 'g-megan', name: 'Megan'});
  assert.equal(done.status, 303);
  assert.equal(done.location, '/web/index.html#lab');
  const session = b.jar.get('__Host-planner_session');
  assert.match(session, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(!JSON.stringify(env.DB._db.prepare('SELECT * FROM login_sessions').all()).includes(session), 'only the session hash is stored');
  const me = await b.me();
  assert.deepEqual([me.user.name, me.user.email, me.user.via, me.signOutPost], ['Megan', 'megan@imperial.example', 'session', true]);
  assert.equal((await b.go('/api/profile', {method: 'PUT', json: profile('Megan Flex')})).status, 200);
  assert.match(env.DB._db.prepare('SELECT user_id FROM profiles').get().user_id, /^external-/);
  const lab = (await b.go('/api/lab')).json;
  assert.equal(lab.me.status, 'pending', 'no lab access until invited or approved');
  assert.equal((await b.go('/api/reviews')).status, 403);
  // The owner's invitation by email admits her.
  const owner = browser(env, 'owner');
  assert.equal((await owner.go('/api/lab/invites', {method: 'POST', json: {email: 'megan@imperial.example'}})).status, 200);
  assert.equal((await b.go('/api/lab')).json.me.status, 'active');
  assert.equal((await b.go('/api/reviews')).status, 200);
  // Signing in again later reaches the same account.
  const again = browser(env);
  await again.login('google', {email: 'megan@imperial.example', id: 'g-megan'});
  assert.equal((await again.go('/api/profile')).json.profile.equipment[0].name, 'Megan Flex');
});

test('the OWNER_EMAIL person owns the lab whichever way they first sign in', async () => {
  const env = fresh();
  const b = browser(env);
  await b.login('password', {email: 'owner@example.org', id: 'owner-pw'});
  const me = (await b.go('/api/lab')).json.me;
  assert.deepEqual([me.role, me.status], ['owner', 'active']);
});

test('a verified email alone never claims an existing account', async () => {
  const env = fresh();
  const alice = browser(env, 'alice');
  await alice.go('/api/profile', {method: 'PUT', json: profile('Alice Flex')});
  const b = browser(env);
  const r = await b.login('google', {email: 'alice@example.org', id: 'g-alice'});
  assert.equal(r.status, 409);
  assert.match(r.text, /link this login there/);
  assert.equal(b.jar.has('__Host-planner_session'), false);
  assert.equal(env.DB._db.prepare("SELECT count(*) AS n FROM members WHERE user_id LIKE 'external-%'").get().n, 0);
});

test('a ChatGPT member links Google explicitly and keeps their account, profile and lab role', async () => {
  const env = fresh();
  const owner = browser(env, 'owner');
  await owner.go('/api/profile', {method: 'PUT', json: profile('Owner Flex')});
  const before = (await owner.go('/api/lab')).json.me;
  // Linking needs a same-origin POST from the signed-in account.
  assert.equal((await owner.go('/auth/link', {method: 'POST', form: {method: 'google'}, origin: 'https://evil.example'})).status, 403);
  assert.equal((await browser(env).go('/auth/link', {method: 'POST', form: {method: 'google'}})).status, 401);
  const linked = await owner.login('google', {email: 'nathan.alt@gmail.example', id: 'g-owner'}, {link: true});
  assert.equal(linked.status, 303);
  const methods = (await owner.go('/auth/methods')).json;
  assert.deepEqual(methods.methods.map(m => m.method).sort(), ['chatgpt', 'google']);
  // Google alone now opens the same account.
  const g = browser(env);
  await g.login('google', {email: 'nathan.alt@gmail.example', id: 'g-owner'});
  const after = (await g.go('/api/lab')).json.me;
  assert.deepEqual(after, before);
  assert.equal((await g.go('/api/profile')).json.profile.equipment[0].name, 'Owner Flex');
  assert.equal((await g.me()).user.email, 'owner@example.org', 'the linked email does not replace the account email');
  // That Google login cannot be moved to someone else.
  const bob = browser(env, 'bob');
  await bob.go('/api/lab');
  const steal = await bob.login('google', {email: 'nathan.alt@gmail.example', id: 'g-owner'}, {link: true});
  assert.equal(steal.status, 409);
  // Nor can Bob link a login whose email is the owner's account email.
  assert.equal((await bob.login('password', {email: 'owner@example.org', id: 'pw-x'}, {link: true})).status, 409);
});

test('a Google account links ChatGPT; a ChatGPT login with its own account is never merged', async () => {
  const env = fresh();
  const b = browser(env);
  await b.login('google', {email: 'maria@imperial.example', id: 'g-maria'});
  const id = (await b.go('/api/lab')).json.me.id;
  const start = await b.go('/auth/link-chatgpt', {method: 'POST', form: {return_to: '/web/index.html'}});
  assert.equal(start.status, 303);
  const ret = new URL(start.location, ORIGIN);
  assert.equal(ret.pathname, '/signin-with-chatgpt');
  const back = ret.searchParams.get('return_to');
  assert.match(back, /^\/auth\/chatgpt-linked\?state=/);
  // Sites signs her in with ChatGPT and returns her.
  b.chatgpt = 'maria-gpt';
  const done = await b.go(back);
  assert.equal(done.status, 303);
  assert.equal((await b.go(back)).status, 401, 'the flow is single-use');
  // ChatGPT alone now reaches the Google-started account.
  const viaGpt = browser(env, 'maria-gpt');
  assert.equal((await viaGpt.go('/api/lab')).json.me.id, id);
  // Someone whose ChatGPT login already has its own account cannot be folded in.
  const other = browser(env);
  await other.login('password', {email: 'sam@imperial.example', id: 'pw-sam'});
  const s2 = await other.go('/auth/link-chatgpt', {method: 'POST', form: {}});
  const owned = browser(env, 'sam-gpt');
  await owned.go('/api/profile', {method: 'PUT', json: profile('Sam Flex')});
  other.chatgpt = 'sam-gpt';
  assert.equal((await other.go(new URL(s2.location, ORIGIN).searchParams.get('return_to'))).status, 409);
});

test('tokens that fail any check are refused, and nothing is created', async () => {
  const env = fresh();
  const now = Math.floor(Date.now() / 1000);
  const cases = {
    'wrong signing key': {token: {wrongKey: true}},
    'unknown key id': {token: {header: {kid: 'other'}}},
    'wrong algorithm': {token: {header: {alg: 'HS256'}}},
    'wrong issuer': {claims: {iss: 'https://evil.example/'}},
    'wrong audience': {claims: {aud: 'someone-else'}},
    'two audiences': {claims: {aud: ['planner-client', 'other']}},
    'other authorized party': {claims: {azp: 'other'}},
    'wrong nonce': {claims: {nonce: 'replayed'}},
    'expired': {claims: {exp: now - 120}},
    'issued long ago': {claims: {iat: now - 3600}},
    'sign-in time in the future': {claims: {auth_time: now + 3600}},
    'unverified email': {claims: {email_verified: false}},
    'Google token from the password button': {claims: {sub: 'google-oauth2|x'}},
  };
  for (const [name, opts] of Object.entries(cases)) {
    const b = browser(env);
    const r = await b.login('password', {email: `${name.replace(/\W/g, '')}@example.org`}, opts);
    assert.equal(r.status, 401, name);
    assert.ok(!b.jar.has('__Host-planner_session'), name);
  }
  assert.equal(env.DB._db.prepare('SELECT count(*) AS n FROM login_identities').get().n, 0);
  assert.equal(env.DB._db.prepare('SELECT count(*) AS n FROM members').get().n, 0);
});

test('callbacks need the same browser, an unused state and a code', async () => {
  const env = fresh();
  const b = browser(env);
  const start = await b.go('/auth/login?method=google');
  const back = idp.authorize(start.location, {email: 'x@example.org'});
  const thief = browser(env);
  assert.equal((await thief.go(back)).status, 401, 'another browser cannot finish the flow');
  assert.equal((await b.go(back)).status, 303);
  assert.equal((await b.go(back)).status, 401, 'state is single-use');
  const s2 = await b.go('/auth/login?method=google');
  const cancelled = new URL(AUTH.AUTH_CALLBACK_URL); cancelled.searchParams.set('state', new URL(s2.location).searchParams.get('state')); cancelled.searchParams.set('error', 'access_denied');
  const r = await b.go(cancelled.href);
  assert.equal(r.status, 401);
  assert.doesNotMatch(r.text, /access_denied/, 'provider errors are not echoed');
});

test('sessions fail closed, sign-out revokes them, and return targets stay local', async () => {
  const env = fresh();
  const b = browser(env);
  await b.login('google', {email: 'lee@example.org', id: 'g-lee'});
  assert.equal((await b.me()).user.email, 'lee@example.org');
  // A bad or expired session does not fall back to a ChatGPT identity still signed in.
  b.chatgpt = 'someone';
  const good = b.jar.get('__Host-planner_session');
  b.jar.set('__Host-planner_session', 'A'.repeat(43));
  assert.equal((await b.me()).user, null);
  b.jar.set('__Host-planner_session', good);
  env.DB._db.prepare('UPDATE login_sessions SET expires_at = 1').run();
  assert.equal((await b.me()).user, null);
  assert.equal((await b.go('/api/profile')).status, 401);
  env.DB._db.prepare('UPDATE login_sessions SET expires_at = ?').run(Date.now() + 1e6);
  b.chatgpt = null;
  // Sign-out is a same-origin POST that deletes the session server-side.
  assert.equal((await b.go('/auth/logout', {method: 'POST', form: {}, origin: 'https://evil.example'})).status, 403);
  const out = await b.go('/auth/logout', {method: 'POST', form: {return_to: '//evil.example/x'}});
  assert.equal(out.location, '/signout-with-chatgpt?return_to=%2Fweb%2Findex.html');
  assert.equal(env.DB._db.prepare('SELECT count(*) AS n FROM login_sessions').get().n, 0);
  assert.equal((await b.me()).user, null);
  for (const bad of ['https://evil.example', '//evil.example', '/\\evil', '/auth/logout', '/signin-with-chatgpt']) assert.equal(built.safeReturn(bad), '/web/index.html', bad);
  assert.equal(built.safeReturn('/web/index.html#lab'), '/web/index.html#lab');
  // API bearer tokens are not accepted on sign-in routes.
  assert.equal((await b.go('/auth/signin', {headers: {authorization: 'Bearer x'}})).status, 401);
});

test('an account keeps at most ten sessions', async () => {
  const env = fresh();
  for (let i = 0; i < 12; i++) await browser(env).login('google', {email: 'many@example.org', id: 'g-many'});
  assert.equal(env.DB._db.prepare('SELECT count(*) AS n FROM login_sessions').get().n, 10);
});

// Single sign-on across lab tools (#160, port of lab-graph-workshop#140).
test('ordinary sign-in reuses an Auth0 session; linking still needs a fresh sign-in', async () => {
  const env = fresh(), now = Math.floor(Date.now() / 1000);
  const owner = browser(env, 'owner');
  const link = await owner.go('/auth/link', {method: 'POST', form: {method: 'password', return_to: '/web/index.html'}});
  const lq = new URL(link.location).searchParams;
  assert.deepEqual([lq.get('prompt'), lq.get('max_age')], ['login', '0']);
  assert.equal((await owner.go(idp.authorize(link.location, {email: 'owner@example.org', id: 'owner'}, {claims: {auth_time: now - 3600}}))).status, 401, 'an old Auth0 session cannot link a login');
  assert.equal((await owner.login('password', {email: 'owner@example.org', id: 'owner'}, {link: true})).status, 303);
  const later = browser(env);
  const r = await later.login('password', {email: 'owner@example.org', id: 'owner'}, {claims: {auth_time: now - 3600}});
  assert.equal(r.status, 303, r.text);
  assert.equal((await later.me()).user.email, 'owner@example.org');
});

test('auto sign-in accepts either enabled method and records it from the subject', async () => {
  const env = fresh();
  const b = browser(env);
  const start = await b.go('/auth/login?method=auto&return_to=%2Fweb%2Findex.html');
  const q = new URL(start.location).searchParams;
  assert.deepEqual([q.get('connection'), q.get('prompt')], [null, null]);
  assert.equal((await b.go(idp.authorize(start.location, {email: 'g@example.org'}, {claims: {sub: 'google-oauth2|g'}}))).status, 303);
  assert.equal(env.DB._db.prepare("SELECT method FROM login_identities WHERE subject = 'google-oauth2|g'").get().method, 'google');
  const odd = browser(env), s2 = await odd.go('/auth/login?method=auto');
  assert.equal((await odd.go(idp.authorize(s2.location, {email: 's@example.org'}, {claims: {sub: 'samlp|s'}}))).status, 401, 'unknown connections are refused');
  assert.equal((await browser(env, 'owner').go('/auth/link', {method: 'POST', form: {method: 'auto'}})).status, 400, 'linking needs an explicit method');
  const off = fresh({AUTH_GOOGLE_ENABLED: 'false'}), c = browser(off), s3 = await c.go('/auth/login?method=auto');
  assert.equal((await c.go(idp.authorize(s3.location, {email: 'g@example.org'}, {claims: {sub: 'google-oauth2|g'}}))).status, 401, 'a disabled method is refused');
});

test('continue: signed in goes straight through; otherwise one silent attempt with a loop guard', async () => {
  const env = fresh(), target = '/web/index.html#lab';
  const go = (b, to = target) => b.go('/auth/continue?return_to=' + encodeURIComponent(to));
  assert.equal((await go(browser(env, 'alice'))).location, target, 'native ChatGPT identity needs no provider round trip');
  const b = browser(env), first = await go(b), login = new URL(first.location, ORIGIN);
  assert.deepEqual([login.pathname, login.searchParams.get('method'), login.searchParams.get('return_to')], ['/auth/login', 'silent', target]);
  assert.equal(new URL((await go(b, 'https://evil.example')).location, ORIGIN).searchParams.get('return_to'), '/web/index.html');
  assert.match((await go(browser({DB: memoryD1()}))).location, /^\/auth\/signin\?return_to=/, 'unconfigured planner goes to the sign-in page');
  const start = await b.go(first.location);
  const q = new URL(start.location).searchParams;
  assert.deepEqual([q.get('prompt'), q.get('connection')], ['none', null]);
  const none = new URL(AUTH.AUTH_CALLBACK_URL); none.searchParams.set('state', q.get('state')); none.searchParams.set('error', 'login_required');
  const fallback = await b.go(none.href);
  assert.deepEqual([fallback.status, fallback.location], [303, '/auth/signin?return_to=' + encodeURIComponent(target)]);
  assert.ok(b.jar.has('__Host-planner_nosilent'));
  assert.match((await go(b)).location, /^\/auth\/signin\?/, 'no second silent attempt');
  assert.equal(env.DB._db.prepare('SELECT count(*) AS n FROM login_sessions').get().n, 0);
  const c = browser(env), s = await c.go((await go(c)).location);
  const ok = await c.go(idp.authorize(s.location, {email: 'new@example.org'}, {claims: {auth_time: Math.floor(Date.now() / 1000) - 600}}));
  assert.deepEqual([ok.status, ok.location], [303, target], ok.text);
  assert.ok(c.jar.has('__Host-planner_session'));
  assert.equal((await go(c)).location, target);
});

test('sign-out blocks immediate silent re-sign-in and can end the Auth0 session', async () => {
  const env = fresh(), b = browser(env);
  assert.equal((await b.login('auto', {email: 'new@example.org'})).status, 303);
  const plain = await b.go('/auth/logout', {method: 'POST', form: {}});
  assert.match(plain.location, /^\/signout-with-chatgpt/);
  assert.ok(b.jar.has('__Host-planner_nosilent'));
  const env2 = fresh({AUTH_PROVIDER_LOGOUT: 'true'}), c = browser(env2);
  assert.equal((await c.login('auto', {email: 'new@example.org'})).status, 303);
  const out = new URL((await c.go('/auth/logout', {method: 'POST', form: {}})).location);
  assert.deepEqual([out.origin + out.pathname, out.searchParams.get('client_id'), out.searchParams.get('returnTo')], [AUTH.AUTH_ISSUER + 'v2/logout', 'planner-client', ORIGIN + '/auth/signed-out']);
  assert.ok(!out.href.includes('test-secret'));
  assert.equal(env2.DB._db.prepare('SELECT count(*) AS n FROM login_sessions').get().n, 0);
  const back = await c.go('/auth/signed-out');
  assert.match(back.location, /^\/signout-with-chatgpt/);
});
