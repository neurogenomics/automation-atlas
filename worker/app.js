import {registryApi} from './registry/api.js';
import {planningApi, evaluateReviewedPlanningInput, planningOptions} from './planning/api.js';
import {checkLabstepVersion, isLabstepDraft, labstepDraftConsent, labstepRefreshPaths, verifyLabstepSnapshotHash} from '../lib/source-provenance.js';

// Sites worker for the Automation Atlas (#47). Same arrangement as the Graph
// Workshop: ChatGPT Sites signs people in and passes their identity in
// oai-authenticated-user-* headers; profiles live in the Sites D1 binding
// (env.DB). Google and email/password sign-in go through Auth0 (#132, below),
// once the AUTH_* runtime settings exist. The planner never sees or stores a password.
//
// Profiles hold equipment, workflows, candidate setups (#89) and answers only. Imported protocols are
// never sent by the client and are dropped here if they are.
//
// Lab and reviews (#105), as on the Workshop: the person whose email is the
// OWNER_EMAIL runtime setting owns the lab; others join by the owner's
// invitation (by email) or approval. A review holds the protocol steps the
// wet lab is asked to check, so only active lab members can read or answer it.
//
// The build inlines the shared provenance module and the site assets
// into one self-contained worker (dist/server/index.js).

export const MAX_PROFILE_BYTES = 512 * 1024;
const SIGN_IN = '/signin-with-chatgpt';
const SIGN_OUT = '/signout-with-chatgpt';

export function identityOf(req) {
  const id = req.headers.get('oai-authenticated-user-id');
  if (!id) return null;
  const email = (req.headers.get('oai-authenticated-user-email') || '').toLowerCase();
  let name = req.headers.get('oai-authenticated-user-full-name') || email || 'Signed in';
  try { name = decodeURIComponent(name); } catch {}
  return {id, email, name: name.slice(0, 120)};
}

export function cleanProfile(p) {
  if (!p || typeof p !== 'object' || p.version !== 1) throw new Problem(400, 'Not a planner profile.');
  const arr = v => Array.isArray(v) ? v : [];
  // A candidate setup is a catalogue handler, route and option names: nothing else is kept.
  const str = (v, n = 160) => typeof v === 'string' ? v.slice(0, n) : undefined;
  const setups = arr(p.setups).filter(s => s && typeof s === 'object' && str(s.id) && str(s.handler)).slice(0, 50)
    .map(s => ({id: str(s.id), name: str(s.name) || str(s.id), handler: str(s.handler), route: str(s.route, 20), pipettes: str(s.pipettes, 40), modules: arr(s.modules).map(m => str(m)).filter(Boolean), devices: arr(s.devices).map(m => str(m, 60)).filter(Boolean)}));
  return {version: 1, updated: new Date().toISOString(), equipment: arr(p.equipment), workflows: arr(p.workflows), setups, answers: p.answers && typeof p.answers === 'object' && !Array.isArray(p.answers) ? p.answers : {}};
}

class Problem extends Error { constructor(status, message) { super(message); this.status = status; } }

const json = (status, body) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}});

function guardWrite(req) {
  if (!String(req.headers.get('content-type') || '').includes('application/json')) throw new Problem(415, 'Send JSON.');
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(req.url).host) throw new Problem(403, 'Cross-site request refused.');
}

// ---------------------------------------------------------------- Google and email/password sign-in (#132)
// Ported from the Graph Workshop (docs/login-methods.md there; docs/login-methods.md
// here). Auth0 Universal Login does the Google and password sign-in; the planner
// never sees a password. Authorization code flow with S256 PKCE, the ID token is
// verified here (RS256 by WebCrypto, since this file has no imports), and the
// browser gets an opaque, revocable __Host- session whose hash alone is stored.
//
// members.user_id stays the canonical identity, so profiles, lab membership,
// invitations and review attribution are untouched. For people who started with
// ChatGPT it is their ChatGPT id; people who start with Google or email get
// 'external-<uuid>'. Logins are linked to an account only explicitly, from a
// signed-in session: a verified email alone never claims an existing account.
const CHATGPT_ISSUER = 'urn:planner:chatgpt';
const SESSION = '__Host-planner_session', FLOW = '__Host-planner_login', NO_SILENT = '__Host-planner_nosilent';
// Silent sign-in outcomes that mean "show the sign-in page", not a failure (OIDC Core 3.1.2.6).
const SILENT_FALLBACK = new Set(['login_required', 'consent_required', 'interaction_required', 'account_selection_required']);
export const subjectMethod = sub => typeof sub !== 'string' ? null : sub.startsWith('google-oauth2|') ? 'google' : sub.startsWith('auth0|') ? 'password' : null;
const SESSION_SECONDS = 8 * 3600, FLOW_SECONDS = 600, MAX_FLOWS = 10000, MAX_SESSIONS = 10;
const HOME = '/web/index.html';
const encoder = new TextEncoder();
const whoCache = new WeakMap(), metadataCache = new Map();
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const fromB64url = s => Uint8Array.from(atob(s.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
const random = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
const HANDLE = /^[A-Za-z0-9_-]{43}$/;
export async function authHash(text) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)))].map(n => n.toString(16).padStart(2, '0')).join(''); }
function cookie(req, name) {
  const hits = (req.headers.get('cookie') || '').split(';').map(p => p.trim()).filter(p => p.startsWith(name + '='));
  return hits.length === 1 ? hits[0].slice(name.length + 1) : hits.length ? 'invalid' : null;
}
const setCookie = (name, value, seconds) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
function redirect(location, cookies = []) {
  const headers = new Headers({location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'});
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(null, {status: 303, headers});
}
export function safeReturn(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\x00-\x20\x7f]/.test(value) || /^\/(auth\/|signin-with-chatgpt|signout-with-chatgpt|callback)/.test(value)) return HOME;
  const u = new URL(value, 'https://return.invalid');
  return u.origin === 'https://return.invalid' ? u.pathname + u.search + u.hash : HOME;
}

// Who is asking, as the canonical member. A supplied planner session decides
// alone: an invalid or expired one fails closed rather than falling back to a
// ChatGPT identity that happens to still be signed in. A ChatGPT identity linked
// to an account that started elsewhere resolves to that account.
export async function whoIs(req, env) {
  if (!whoCache.has(req)) whoCache.set(req, (async () => {
    const token = cookie(req, SESSION);
    if (token !== null) {
      if (!HANDLE.test(token) || !env.DB) return null;
      const row = await env.DB.prepare('SELECT m.user_id, m.email, m.name FROM login_sessions s JOIN login_identities i ON i.id = s.identity_id AND i.member_id = s.member_id JOIN members m ON m.user_id = s.member_id WHERE s.hash = ? AND s.expires_at > ?').bind(await authHash(token), Date.now()).first();
      return row ? {id: row.user_id, email: row.email, name: row.name, via: 'session'} : null;
    }
    const platform = identityOf(req);
    if (!platform || !env.DB) return platform && {...platform, via: 'chatgpt'};
    const mapping = await env.DB.prepare('SELECT member_id FROM login_identities WHERE issuer = ? AND subject = ?').bind(CHATGPT_ISSUER, platform.id).first();
    if (!mapping) return {...platform, via: 'chatgpt'};
    const m = await env.DB.prepare('SELECT user_id, email, name FROM members WHERE user_id = ?').bind(mapping.member_id).first();
    return m ? {id: m.user_id, email: m.email, name: m.name, via: 'chatgpt'} : null;
  })());
  return whoCache.get(req);
}

export function loginConfig(env) {
  if (!env.AUTH_ISSUER || !env.AUTH_CLIENT_ID || !env.AUTH_CLIENT_SECRET || !env.AUTH_CALLBACK_URL) return null;
  try {
    const issuer = new URL(env.AUTH_ISSUER), callback = new URL(env.AUTH_CALLBACK_URL);
    if (!secureUrl(issuer) || issuer.search || !secureUrl(callback) || callback.pathname !== '/auth/oidc/callback' || callback.search) return null;
    return {issuer: issuer.href.endsWith('/') ? issuer.href : issuer.href + '/', clientId: env.AUTH_CLIENT_ID, clientSecret: env.AUTH_CLIENT_SECRET, callback: callback.href, origin: callback.origin,
      connections: {google: env.AUTH_GOOGLE_CONNECTION || 'google-oauth2', password: env.AUTH_PASSWORD_CONNECTION || 'Username-Password-Authentication'}};
  } catch { return null; }
}
// https only; plain http only on this machine (local preview with a stand-in provider).
const secureUrl = u => (u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))) && !u.username && !u.password && !u.hash;
export function loginOptions(req, env) {
  const c = loginConfig(env), on = Boolean(c) && new URL(req.url).origin === c.origin && Boolean(env.DB);
  return {enabled: on, google: on && env.AUTH_GOOGLE_ENABLED !== 'false', password: on && env.AUTH_PASSWORD_ENABLED !== 'false'};
}

async function remoteJSON(fetcher, url, options) {
  // Redirects are refused (not followed), including on the credential-bearing token POST.
  const r = await fetcher(url, {...options, redirect: 'manual', signal: AbortSignal.timeout(10000)});
  const bad = () => new Problem(503, 'The sign-in provider returned an invalid response.');
  if (!r.ok) throw new Problem(503, 'The sign-in provider could not complete this request. Try again.');
  if (Number(r.headers.get('content-length')) > 128 * 1024) throw bad();
  const reader = r.body.getReader(), parts = []; let size = 0;
  try {
    for (;;) { const {done, value} = await reader.read(); if (done) break; size += value.length; if (size > 128 * 1024) { await reader.cancel(); throw bad(); } parts.push(value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let at = 0;
  for (const p of parts) { bytes.set(p, at); at += p.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw bad(); }
}

async function providerOf(config, fetcher) {
  // Only public discovery and verification keys are cached (five minutes); never tokens or permissions.
  const hit = metadataCache.get(config.issuer);
  if (hit && hit.until > Date.now()) return hit.value;
  const d = await remoteJSON(fetcher, config.issuer + '.well-known/openid-configuration');
  if (d.issuer !== config.issuer) throw new Problem(503, 'The configured sign-in provider does not match its issuer.');
  for (const field of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) {
    let u; try { u = new URL(d[field]); } catch { throw new Problem(503, 'The sign-in provider has an unsupported endpoint.'); }
    if (u.origin !== new URL(config.issuer).origin || !secureUrl(u)) throw new Problem(503, 'The sign-in provider has an unsupported endpoint.');
  }
  const jwks = await remoteJSON(fetcher, d.jwks_uri);
  if (!Array.isArray(jwks.keys) || !jwks.keys.length || jwks.keys.length > 20) throw new Problem(503, 'The sign-in provider returned invalid verification keys.');
  const value = {authorization_endpoint: d.authorization_endpoint, token_endpoint: d.token_endpoint, keys: jwks.keys.filter(k => k && k.kty === 'RSA' && k.use !== 'enc' && (!k.alg || k.alg === 'RS256'))};
  if (metadataCache.size >= 8) metadataCache.delete(metadataCache.keys().next().value);
  metadataCache.set(config.issuer, {until: Date.now() + 300000, value});
  return value;
}

// Verify an Auth0 ID token: RS256 signature against the provider's published key,
// issuer, one audience (this client), authorized party, issued/expiry times,
// nonce, a verified email and the expected connection. Linking (flow.member_id) also
// needs a sign-in made during this flow; ordinary sign-in reuses the Auth0 session (#160).
export async function verifyLoginToken(token, config, flow, keys, now = Date.now()) {
  const fail = () => new Problem(401, 'Sign-in could not be verified. Verify your email with the provider and try again.');
  const parts = typeof token === 'string' && token.length < 16384 ? token.split('.') : [];
  if (parts.length !== 3) throw fail();
  let header, p;
  try { header = JSON.parse(new TextDecoder().decode(fromB64url(parts[0]))); p = JSON.parse(new TextDecoder().decode(fromB64url(parts[1]))); } catch { throw fail(); }
  if (header.alg !== 'RS256' || header.crit) throw fail();
  const jwk = header.kid ? keys.find(k => k.kid === header.kid) : keys.length === 1 ? keys[0] : null;
  if (!jwk) throw fail();
  let ok = false;
  try {
    const key = await crypto.subtle.importKey('jwk', {kty: 'RSA', n: jwk.n, e: jwk.e}, {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify']);
    ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromB64url(parts[2]), encoder.encode(parts[0] + '.' + parts[1]));
  } catch { ok = false; }
  if (!ok) throw fail();
  const t = now / 1000, skew = 30;
  const aud = Array.isArray(p.aud) ? p.aud : [p.aud];
  if (p.iss !== config.issuer || aud.length !== 1 || aud[0] !== config.clientId || (p.azp !== undefined && p.azp !== config.clientId)) throw fail();
  if (![p.exp, p.iat, p.auth_time].every(Number.isFinite) || p.exp <= t - skew || p.iat > t + skew || p.iat < t - 600 - skew) throw fail();
  if (p.nonce !== flow.nonce || typeof p.sub !== 'string' || !p.sub || p.sub.length > 255) throw fail();
  if (p.email_verified !== true || typeof p.email !== 'string' || p.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) throw fail();
  if (p.auth_time > t + skew || (flow.member_id && p.auth_time < Math.floor(flow.created_at / 1000) - 60)) throw fail();
  const method = subjectMethod(p.sub);
  if (!method || (['google', 'password'].includes(flow.method) && method !== flow.method)) throw new Problem(401, 'The provider returned a different login method. Start again using the intended button.');
  return {subject: p.sub, method, email: p.email.toLowerCase(), name: (typeof p.name === 'string' && p.name ? p.name : p.email).slice(0, 120)};
}

function sameOriginPost(req) {
  if (req.method !== 'POST' || req.headers.get('origin') !== new URL(req.url).origin) throw new Problem(403, 'Open the account settings in this planner tab and try again.');
}
async function formInput(req) {
  const text = await req.text();
  if (text.length > 4096) throw new Problem(400, 'Invalid sign-in request.');
  return new URLSearchParams(text);
}
// Someone else's account (a lab member or a saved profile) already uses this email.
const emailTaken = (db, email, except = '') => db.prepare('SELECT user_id FROM members WHERE lower(email) = ? AND user_id <> ? UNION SELECT user_id FROM profiles WHERE lower(email) = ? AND user_id <> ? LIMIT 1').bind(email, except, email, except).first();
async function startFlow(env, {method, memberId, returnTo, verifier = random(), nonce = random()}) {
  const state = random(), browser = random(), now = Date.now();
  await env.DB.prepare('DELETE FROM login_flows WHERE expires_at <= ?').bind(now).run();
  const r = await env.DB.prepare('INSERT INTO login_flows (state_hash, browser_hash, verifier, nonce, method, member_id, return_to, created_at, expires_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT count(*) FROM login_flows) < ?')
    .bind(await authHash(state), await authHash(browser), verifier, nonce, method, memberId || null, returnTo, now, now + FLOW_SECONDS * 1000, MAX_FLOWS).run();
  if (!r.meta?.changes) throw new Problem(429, 'Sign-in is busy. Try again shortly.');
  return {state, browser, verifier, nonce};
}
async function takeFlow(req, env, state, methods) {
  const browser = cookie(req, FLOW);
  if (!HANDLE.test(state || '') || !HANDLE.test(browser || '')) throw new Problem(401, 'Sign-in expired or belongs to another browser. Start again.');
  const flow = await env.DB.prepare(`DELETE FROM login_flows WHERE state_hash = ? AND browser_hash = ? AND expires_at > ? AND method IN (${methods.map(() => '?').join(', ')}) RETURNING *`).bind(await authHash(state), await authHash(browser), Date.now(), ...methods).first();
  if (!flow) throw new Problem(401, 'Sign-in expired or was already used. Start again.');
  return flow;
}
const linkIdentity = (db, issuer, subject, memberId, email, method) => db.prepare('INSERT INTO login_identities (id, issuer, subject, member_id, email, method, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(issuer, subject) DO NOTHING').bind(crypto.randomUUID(), issuer, subject, memberId, email, method, Date.now()).run();

async function resolveAccount(env, profile, config, flow, req) {
  const db = env.DB;
  const linked = await db.prepare('SELECT * FROM login_identities WHERE issuer = ? AND subject = ?').bind(config.issuer, profile.subject).first();
  if (flow.member_id) {
    // Linking: the account that started the flow must still be the one signed in.
    const current = await whoIs(req, env);
    if (!current || current.id !== flow.member_id) throw new Problem(403, 'Your planner account changed during linking. Start again from your account settings.');
    if (linked && linked.member_id !== current.id) throw new Problem(409, 'That login already belongs to another planner account. No accounts or permissions were merged.');
    if (!linked && await emailTaken(db, profile.email, current.id)) throw new Problem(409, 'That email already belongs to another planner account. No accounts or permissions were merged.');
    if (!linked) await linkIdentity(db, config.issuer, profile.subject, current.id, profile.email, profile.method);
    // A ChatGPT account linking its first other login records its own ChatGPT mapping too.
    const platform = identityOf(req);
    if (platform?.id === flow.member_id) await linkIdentity(db, CHATGPT_ISSUER, platform.id, flow.member_id, platform.email, 'chatgpt');
  } else if (!linked) {
    if (await emailTaken(db, profile.email)) throw new Problem(409, 'An existing planner account uses this email. Sign in the way you already do (ChatGPT, Google or email and password), open Account → Login methods, and link this login there. Your profile and lab membership are unchanged.');
    // A new, ordinary account: it joins the lab like any newcomer (owner setting, invitation or approval).
    const id = 'external-' + crypto.randomUUID();
    await db.batch([
      db.prepare("INSERT INTO members (user_id, email, name, role, status, joined_at) SELECT ?, ?, ?, 'member', 'pending', ? WHERE NOT EXISTS (SELECT 1 FROM login_identities WHERE issuer = ? AND subject = ?) AND NOT EXISTS (SELECT 1 FROM members WHERE lower(email) = ?)").bind(id, profile.email, profile.name, Date.now(), config.issuer, profile.subject, profile.email),
      db.prepare('INSERT INTO login_identities (id, issuer, subject, member_id, email, method, created_at) SELECT ?, ?, ?, ?, ?, ?, ? FROM members WHERE user_id = ? ON CONFLICT(issuer, subject) DO NOTHING').bind(crypto.randomUUID(), config.issuer, profile.subject, id, profile.email, profile.method, Date.now(), id),
    ]);
  }
  const identity = await db.prepare('SELECT i.id, i.member_id FROM login_identities i JOIN members m ON m.user_id = i.member_id WHERE i.issuer = ? AND i.subject = ?').bind(config.issuer, profile.subject).first();
  if (!identity || (flow.member_id && identity.member_id !== flow.member_id)) throw new Problem(409, 'The account could not be linked safely. Sign in again and retry.');
  return identity;
}

export async function authRoute(path, req, env, {fetcher = fetch} = {}) {
  const url = new URL(req.url);
  try {
    if (req.headers.has('authorization')) throw new Problem(401, 'Sign-in pages do not accept API tokens.');
    const back = () => safeReturn(url.searchParams.get('return_to'));
    if (path === '/auth/signin' && ['GET', 'HEAD'].includes(req.method)) return signInPage(back(), req.method, loginOptions(req, env));
    if (path === '/auth/options' && req.method === 'GET') return json(200, loginOptions(req, env));
    if (path === '/auth/chatgpt' && ['GET', 'HEAD'].includes(req.method)) return redirect(SIGN_IN + '?return_to=' + encodeURIComponent(back()), [setCookie(SESSION, '', 0)]);
    if (path === '/auth/logout') {
      sameOriginPost(req);
      const token = cookie(req, SESSION), params = await formInput(req);
      if (token && HANDLE.test(token) && env.DB) await env.DB.prepare('DELETE FROM login_sessions WHERE hash = ?').bind(await authHash(token)).run();
      const cleared = [setCookie(SESSION, '', 0), setCookie(FLOW, '', 0), setCookie(NO_SILENT, '1', FLOW_SECONDS)], config = loginConfig(env);
      // Ending only the local session would let silent sign-in restore it at once. With
      // AUTH_PROVIDER_LOGOUT=true the shared Auth0 session ends too (Auth0 /v2/logout);
      // <origin>/auth/signed-out must then be an Allowed Logout URL. Other lab tools keep
      // their own sessions until they expire: there is no single sign-out.
      if (config && url.origin === config.origin && env.AUTH_PROVIDER_LOGOUT === 'true') {
        const logout = new URL('v2/logout', config.issuer);
        logout.searchParams.set('client_id', config.clientId);
        logout.searchParams.set('returnTo', config.origin + '/auth/signed-out');
        return redirect(logout.href, cleared);
      }
      return redirect(SIGN_OUT + '?return_to=' + encodeURIComponent(safeReturn(params.get('return_to'))), cleared);
    }
    if (path === '/auth/signed-out' && ['GET', 'HEAD'].includes(req.method)) return redirect(SIGN_OUT + '?return_to=' + encodeURIComponent(HOME), [setCookie(NO_SILENT, '1', FLOW_SECONDS)]);
    if (path === '/auth/continue' && ['GET', 'HEAD'].includes(req.method)) {
      // Entry point for links from other lab tools: already signed in goes straight through;
      // otherwise one silent attempt against the shared Auth0 session, then the sign-in page.
      const target = back(), options = loginOptions(req, env);
      if (await whoIs(req, env).catch(() => null)) return redirect(target);
      if (!options.enabled || !(options.google || options.password) || cookie(req, NO_SILENT) !== null || !env.DB) return redirect('/auth/signin?return_to=' + encodeURIComponent(target));
      return redirect('/auth/login?' + new URLSearchParams({method: 'silent', return_to: target}));
    }
    if (!env.DB) throw new Problem(503, 'Account storage is not available. Continue with ChatGPT or try later.');
    if (path === '/auth/methods' && req.method === 'GET') {
      const current = await whoIs(req, env);
      if (!current) throw new Problem(401, 'Sign in first.');
      const rows = (await env.DB.prepare('SELECT method, email, created_at FROM login_identities WHERE member_id = ? ORDER BY created_at').bind(current.id).all()).results;
      return json(200, {...loginOptions(req, env), chatgptLinked: identityOf(req)?.id === current.id || rows.some(r => r.method === 'chatgpt'), methods: rows.map(r => ({method: r.method, email: r.email, createdAt: r.created_at}))});
    }
    if (path === '/auth/link-chatgpt') {
      // A Google or email account adds ChatGPT: a browser-bound, single-use flow
      // needs both this session and, on return, the native Sites ChatGPT identity.
      sameOriginPost(req);
      const current = await whoIs(req, env), params = await formInput(req);
      if (!current) throw new Problem(401, 'Sign in first.');
      const f = await startFlow(env, {method: 'chatgpt', memberId: current.id, returnTo: safeReturn(params.get('return_to'))});
      return redirect(SIGN_IN + '?return_to=' + encodeURIComponent('/auth/chatgpt-linked?state=' + f.state), [setCookie(FLOW, f.browser, FLOW_SECONDS)]);
    }
    if (path === '/auth/chatgpt-linked' && req.method === 'GET') {
      const flow = await takeFlow(req, env, url.searchParams.get('state'), ['chatgpt']);
      const current = await whoIs(req, env), platform = identityOf(req);
      if (!current || !platform || current.id !== flow.member_id) throw new Problem(403, 'Your planner account changed during linking. Start again.');
      const other = await env.DB.prepare('SELECT member_id FROM login_identities WHERE issuer = ? AND subject = ?').bind(CHATGPT_ISSUER, platform.id).first();
      // A ChatGPT login that already has its own planner account (member or saved profile) is never merged.
      const own = await env.DB.prepare('SELECT user_id FROM members WHERE user_id = ? UNION SELECT user_id FROM profiles WHERE user_id = ? LIMIT 1').bind(platform.id, platform.id).first();
      if ((other && other.member_id !== current.id) || (own && platform.id !== current.id)) throw new Problem(409, 'That ChatGPT login already belongs to another planner account. No accounts or permissions were merged.');
      await linkIdentity(env.DB, CHATGPT_ISSUER, platform.id, current.id, platform.email || current.email, 'chatgpt');
      const saved = await env.DB.prepare('SELECT member_id FROM login_identities WHERE issuer = ? AND subject = ?').bind(CHATGPT_ISSUER, platform.id).first();
      if (saved?.member_id !== current.id) throw new Problem(409, 'The login could not be linked safely. Start again.');
      return redirect(flow.return_to, [setCookie(FLOW, '', 0)]);
    }
    const config = loginConfig(env);
    if (!config || url.origin !== config.origin) throw new Problem(503, 'Google and email sign-in are not set up on this address yet. Continue with ChatGPT.');
    if (path === '/auth/login' || path === '/auth/link') {
      const linking = path === '/auth/link';
      let params = url.searchParams, current = null;
      if (linking) {
        sameOriginPost(req); params = await formInput(req); current = await whoIs(req, env);
        if (!current) throw new Problem(401, 'Sign in first.');
        // Make sure the canonical account has its member row, so the link has something to join.
        await memberOf(current, env);
      } else if (req.method !== 'GET') throw new Problem(405, 'Use the sign-in buttons to start.');
      const method = params.get('method'), options = loginOptions(req, env), any = options.google || options.password;
      if (!((['google', 'password'].includes(method) && options[method]) || (!linking && ['auto', 'silent'].includes(method) && any))) throw new Problem(400, 'Choose an enabled sign-in method.');
      const p = await providerOf(config, fetcher);
      const f = await startFlow(env, {method, memberId: current?.id, returnTo: safeReturn(params.get('return_to'))});
      const authorize = new URL(p.authorization_endpoint);
      const challenge = b64url(await crypto.subtle.digest('SHA-256', encoder.encode(f.verifier)));
      for (const [k, v] of Object.entries({client_id: config.clientId, response_type: 'code', redirect_uri: config.callback, scope: 'openid profile email', state: f.state, nonce: f.nonce, code_challenge: challenge, code_challenge_method: 'S256'})) authorize.searchParams.set(k, v);
      if (config.connections[method]) authorize.searchParams.set('connection', config.connections[method]);
      if (linking) { authorize.searchParams.set('prompt', 'login'); authorize.searchParams.set('max_age', '0'); }
      else if (method === 'silent') authorize.searchParams.set('prompt', 'none');
      return redirect(authorize.href, [setCookie(FLOW, f.browser, FLOW_SECONDS)]);
    }
    if (path === '/auth/oidc/callback' && req.method === 'GET') {
      const flow = await takeFlow(req, env, url.searchParams.get('state'), ['google', 'password', 'auto', 'silent']);
      if (flow.method === 'silent' && (url.searchParams.has('error') || !url.searchParams.get('code'))) {
        // No usable provider session: fall back to the sign-in page and do not retry silently for a while.
        if (!SILENT_FALLBACK.has(url.searchParams.get('error') || 'login_required')) console.warn('silent sign-in fallback', url.searchParams.get('error')?.slice(0, 64));
        return redirect('/auth/signin?return_to=' + encodeURIComponent(flow.return_to), [setCookie(FLOW, '', 0), setCookie(NO_SILENT, '1', FLOW_SECONDS)]);
      }
      const code = url.searchParams.get('code');
      if (url.searchParams.has('error') || !code || code.length > 4096) throw new Problem(401, 'Sign-in was cancelled or could not finish. Start again.');
      const p = await providerOf(config, fetcher);
      const tokens = await remoteJSON(fetcher, p.token_endpoint, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({grant_type: 'authorization_code', client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.callback, code, code_verifier: flow.verifier})});
      const profile = await verifyLoginToken(tokens.id_token, config, flow, p.keys);
      if (!loginOptions(req, env)[profile.method]) throw new Problem(401, 'That sign-in method is not enabled on the planner. Choose another option.');
      const identity = await resolveAccount(env, profile, config, flow, req);
      const session = random(), now = Date.now();
      await env.DB.batch([
        env.DB.prepare('DELETE FROM login_sessions WHERE expires_at <= ? OR hash IN (SELECT hash FROM login_sessions WHERE member_id = ? ORDER BY created_at DESC LIMIT -1 OFFSET ?)').bind(now, identity.member_id, MAX_SESSIONS - 1),
        env.DB.prepare('INSERT INTO login_sessions (hash, member_id, identity_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').bind(await authHash(session), identity.member_id, identity.id, now, now + SESSION_SECONDS * 1000),
      ]);
      return redirect(flow.return_to, [setCookie(SESSION, session, SESSION_SECONDS), setCookie(FLOW, '', 0), setCookie(NO_SILENT, '', 0)]);
    }
    throw new Problem(404, 'This sign-in route is unavailable.');
  } catch (e) {
    // Provider errors can carry codes or tokens: never show or log them.
    const status = e instanceof Problem ? e.status : 503;
    const message = e instanceof Problem ? e.message : 'Sign-in could not finish. Start again or continue with ChatGPT.';
    return authPage('Sign-in needs attention', `<p role="alert">${escHtml(message)}</p><a class="primary" href="/auth/chatgpt?return_to=${encodeURIComponent(HOME)}">Continue with ChatGPT</a><p><a href="${HOME}">Back to the planner</a></p>`, 'GET', {status, cookies: [setCookie(FLOW, '', 0)]});
  }
}

const escHtml = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
function authPage(title, inner, method, {status = 200, cookies = []} = {}) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(title)} · Automation Atlas</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:16px;background:#f2f5f4;color:#1d3338;font:16px/1.55 system-ui,sans-serif}
main{max-width:480px;width:100%;padding:36px;background:#fff;border:1px solid #d3dfdc;border-top:5px solid #2f6f73;border-radius:14px}
.brand{color:#2f6f73}h1{font-size:26px;line-height:1.2;margin:18px 0 12px}p{margin:14px 0;color:#4a5f63}
a.primary,a.alt{display:block;margin:14px 0;padding:12px 18px;text-align:center;text-decoration:none;font-weight:600;border-radius:8px}
a.primary{background:#2f6f73;color:#fff}a.primary:hover{background:#255a5d}a.alt{background:#fff;color:#2f6f73;border:1px solid #2f6f73}a.alt:hover{background:#edf5f4}
a:focus-visible{outline:3px solid #d98a2b;outline-offset:3px}.detail{font-size:14px}@media(max-width:420px){main{padding:24px}}</style></head>
<body><main><div class="brand">Automation <strong>Atlas</strong></div><h1>${escHtml(title)}</h1>${inner}</main></body></html>`;
  const headers = new Headers({'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self' https://*.chatgpt.com https://chatgpt.com https://*.openai.com"});
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(method === 'HEAD' ? null : html, {status, headers});
}
function signInPage(returnTo, method, options) {
  const target = encodeURIComponent(returnTo);
  const more = options.enabled ? `${options.google ? `<a class="alt" href="/auth/login?method=google&amp;return_to=${target}" target="_top">Continue with Google</a>` : ''}${options.password ? `<a class="alt" href="/auth/login?method=password&amp;return_to=${target}" target="_top">Continue with email and password</a>` : ''}
<p class="detail">Already use the planner? Sign in the way you already do, then open Account → Login methods to link another login to the same account.</p>` : '';
  // Switching to ChatGPT discards any Google or email session on this browser.
  return authPage('Sign in', `<p>Keep your equipment, workflows and answers on any device, and join your lab's reviews.</p><a class="primary" href="${SIGN_IN}?return_to=${target}" target="_top">Continue with ChatGPT</a>${more}`, method, {cookies: [setCookie(SESSION, '', 0)]});
}

const planningRelease = null; // embedded by scripts/build.mjs
const defaultRegistryContracts = null; // embedded by scripts/build.mjs

async function api(path, req, env, registryContracts) {
  if (path === '/api/registry/public' || path.startsWith('/api/registry/public/')) return registryApi(path, req, env, null, registryContracts, json);
  if (path === '/api/planning/v1/contract' || path === '/api/planning/v1/capabilities') return planningApi(path, req, null, planningRelease);
  const who = await whoIs(req, env);
  if (path.startsWith('/api/planning/v1/')) return planningApi(path, req, who, planningRelease);
  if (path.startsWith('/api/registry/')) {
    const evaluatePlanning = (input, signal) => planningApi('/api/planning/v1/assess', new Request(req.url, {
      method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(input), signal,
    }), who, planningRelease, {withWorkMap: true});
    return registryApi(path, req, env, who, registryContracts, json, evaluateReviewedPlanningInput, evaluatePlanning, planningOptions);
  }
  if (path === '/api/me') {
    if (req.method !== 'GET') throw new Problem(405, 'Method not allowed.');
    // Without the AUTH_* settings this is exactly the ChatGPT-only answer it always was.
    const login = loginOptions(req, env), viaSession = who?.via === 'session' || cookie(req, SESSION) !== null;
    return json(200, {user: who ? {name: who.name, email: who.email, via: who.via} : null, signIn: login.enabled ? '/auth/signin' : SIGN_IN,
      signOut: login.enabled || viaSession ? '/auth/logout' : SIGN_OUT, signOutPost: login.enabled || viaSession, login, storage: Boolean(env.DB)});
  }
  if (path === '/api/profile') {
    if (!who) throw new Problem(401, 'Sign in first.');
    if (!env.DB) throw new Problem(503, 'Profile storage is not available on this server.');
    if (req.method === 'GET') {
      const row = await env.DB.prepare('SELECT data FROM profiles WHERE user_id = ?').bind(who.id).first();
      return json(200, {profile: row ? JSON.parse(row.data) : null});
    }
    if (req.method === 'PUT') {
      guardWrite(req);
      const text = await req.text();
      if (text.length > MAX_PROFILE_BYTES * 2) throw new Problem(413, 'Profile is too large to save.');
      let body; try { body = JSON.parse(text); } catch { throw new Problem(400, 'Invalid JSON.'); }
      const clean = cleanProfile(body);
      const data = JSON.stringify(clean);
      if (new TextEncoder().encode(data).length > MAX_PROFILE_BYTES) throw new Problem(413, 'Profile is too large to save.');
      await env.DB.prepare('INSERT INTO profiles (user_id, email, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, data = excluded.data, updated_at = excluded.updated_at').bind(who.id, who.email, data, Date.now()).run();
      return json(200, {profile: clean});
    }
    throw new Problem(405, 'Method not allowed.');
  }
  if (path.startsWith('/api/labstep/')) return labstepPush(path, req, env);
  if (path === '/api/lab' || path.startsWith('/api/lab/') || path === '/api/reviews' || path.startsWith('/api/reviews/')) {
    if (!who) throw new Problem(401, 'Sign in first.');
    if (!env.DB) throw new Problem(503, 'Lab storage is not available on this server.');
    return lab(path, req, env, await memberOf(who, env));
  }
  throw new Problem(404, 'Not found.');
}

// ---------------------------------------------------------------- lab and reviews (#105)
export const MAX_REVIEW_BYTES = 400 * 1024;
const VERDICTS = ['right', 'longer', 'shorter', 'different', 'unsure'];
const AS_RUN = ['yes', 'mostly', 'no'];

// OWNER_EMAIL may list several addresses, comma-separated: one person who signs
// in with more than one email (ChatGPT on a personal address, Google at work).
export const ownerEmails = env => String(env.OWNER_EMAIL || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

async function memberOf(who, env) {
  const db = env.DB, now = Date.now();
  const owner = Boolean(who.email && ownerEmails(env).includes(String(who.email).toLowerCase()));
  const invite = who.email ? await db.prepare('SELECT role FROM invites WHERE email = ?').bind(who.email).first() : null;
  let m = await db.prepare('SELECT * FROM members WHERE user_id = ?').bind(who.id).first();
  if (!m) {
    m = {user_id: who.id, email: who.email, name: who.name, role: owner ? 'owner' : invite?.role || 'member', status: owner || invite ? 'active' : 'pending', joined_at: now};
    await db.prepare('INSERT INTO members (user_id, email, name, role, status, joined_at) VALUES (?, ?, ?, ?, ?, ?)').bind(m.user_id, m.email, m.name, m.role, m.status, m.joined_at).run();
  } else {
    // An invitation (or the owner setting) admits someone who signed in before it existed.
    const next = {...m, email: who.email, name: who.name};
    if (owner) Object.assign(next, {role: 'owner', status: 'active'});
    else if (invite && m.status !== 'active') Object.assign(next, {role: invite.role, status: 'active'});
    if (['role', 'status', 'email', 'name'].some(k => next[k] !== m[k])) {
      await db.prepare('UPDATE members SET email = ?, name = ?, role = ?, status = ? WHERE user_id = ?').bind(next.email, next.name, next.role, next.status, m.user_id).run();
      m = next;
    }
  }
  if (invite && m.status === 'active') await db.prepare('DELETE FROM invites WHERE email = ?').bind(who.email).run();
  return m;
}

const publicMember = (m, asOwner) => ({id: m.user_id, name: m.name, role: m.role, status: m.status, ...(asOwner ? {email: m.email} : {})});
const num = (v, max = 100000) => v === '' || v == null ? null : Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= max ? Math.round(Number(v) * 10) / 10 : undefined;

export function cleanResponse(stepId, b) {
  if (!b || typeof b !== 'object') throw new Problem(400, 'Send an answer.');
  const comment = typeof b.comment === 'string' ? b.comment.slice(0, 4000) : '';
  if (stepId === '_overall') {
    if (b.asRun && !AS_RUN.includes(b.asRun)) throw new Problem(400, 'Choose yes, mostly or no.');
    const batch = num(b.batch);
    if (batch === undefined) throw new Problem(400, 'Batch size must be a number.');
    return {asRun: b.asRun || '', batch, comment};
  }
  if (b.verdict && !VERDICTS.includes(b.verdict)) throw new Problem(400, 'Choose one of the listed answers.');
  const handsOnMin = num(b.handsOnMin), waitMin = num(b.waitMin);
  if (handsOnMin === undefined || waitMin === undefined) throw new Problem(400, 'Minutes must be a number from 0 to 100000.');
  return {verdict: b.verdict || '', handsOnMin, waitMin, comment};
}

async function lab(path, req, env, me) {
  const db = env.DB, owner = me.role === 'owner' && me.status === 'active', active = me.status === 'active';
  const labName = String(env.LAB_NAME || 'Lab').slice(0, 80);
  if (path === '/api/lab' && req.method === 'GET') {
    const all = (await db.prepare('SELECT * FROM members ORDER BY name').bind().all()).results;
    const invites = owner ? (await db.prepare('SELECT email, role, created_at FROM invites ORDER BY email').bind().all()).results : [];
    const pushKeys = owner ? (await db.prepare('SELECT hash, label, created_at, last_used_at FROM lab_push_keys WHERE member_id = ? ORDER BY created_at').bind(me.user_id).all()).results
      .map(k => ({hash: k.hash, code: pairCode(k.hash), label: k.label, createdAt: k.created_at, lastUsedAt: k.last_used_at})) : [];
    return json(200, {lab: {name: labName, ownerConfigured: ownerEmails(env).length > 0}, me: publicMember(me, true),
      members: active ? all.filter(m => owner || m.status === 'active').map(m => publicMember(m, owner)) : [], invites, pushKeys});
  }
  if (path === '/api/lab/push-keys' && req.method === 'POST') {
    // The owner approves a computer to push the lab's Labstep protocols. The
    // computer made the key and sends only its SHA-256 hash here, via the link it printed.
    if (!owner) throw new Problem(403, 'Only the lab owner can approve a computer to push protocols.');
    guardWrite(req);
    const b = await body(req), hash = String(b.hash || '');
    if (!/^[0-9a-f]{64}$/.test(hash)) throw new Problem(400, 'Not a push key: open the link printed by npm run labstep -- push.');
    if (b.remove) { await db.prepare('DELETE FROM lab_push_keys WHERE hash = ? AND member_id = ?').bind(hash, me.user_id).run(); return json(200, {ok: true}); }
    const label = String(b.label || '').trim().slice(0, 80) || 'Labstep push';
    const r = await db.prepare('INSERT INTO lab_push_keys (hash, member_id, label, created_at) SELECT ?, ?, ?, ? WHERE (SELECT count(*) FROM lab_push_keys WHERE member_id = ?) < ? ON CONFLICT(hash) DO NOTHING')
      .bind(hash, me.user_id, label, Date.now(), me.user_id, MAX_PUSH_KEYS).run();
    if (!r.meta?.changes && !(await db.prepare('SELECT 1 FROM lab_push_keys WHERE hash = ? AND member_id = ?').bind(hash, me.user_id).first())) throw new Problem(409, `At most ${MAX_PUSH_KEYS} computers can push protocols; remove one first.`);
    return json(200, {ok: true, code: pairCode(hash)});
  }
  if (path === '/api/lab/invites' && req.method === 'POST') {
    if (!owner) throw new Problem(403, 'Only the lab owner can invite people.');
    guardWrite(req);
    const b = await body(req), email = String(b.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) throw new Problem(400, 'Enter an email address.');
    if (b.remove) await db.prepare('DELETE FROM invites WHERE email = ?').bind(email).run();
    else {
      await db.prepare('INSERT INTO invites (email, role, invited_by, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET role = excluded.role').bind(email, 'member', me.user_id, Date.now()).run();
      // Someone already waiting with that email is admitted now.
      await db.prepare("UPDATE members SET status = 'active' WHERE lower(email) = ? AND status = 'pending'").bind(email).run();
    }
    return json(200, {ok: true});
  }
  if (path === '/api/lab/members' && req.method === 'POST') {
    if (!owner) throw new Problem(403, 'Only the lab owner can admit or remove people.');
    guardWrite(req);
    const b = await body(req);
    if (!['active', 'removed'].includes(b.status)) throw new Problem(400, 'Choose admit or remove.');
    const m = await db.prepare('SELECT * FROM members WHERE user_id = ?').bind(String(b.id || '')).first();
    if (!m) throw new Problem(404, 'No such person.');
    if (m.role === 'owner') throw new Problem(400, 'The owner is set by the OWNER_EMAIL setting.');
    await db.prepare('UPDATE members SET status = ? WHERE user_id = ?').bind(b.status, m.user_id).run();
    return json(200, {ok: true});
  }
  if (!active) throw new Problem(403, me.status === 'pending' ? 'Waiting for the lab owner to admit you.' : 'You are not a member of this lab.');
  if (path === '/api/lab/protocols' && req.method === 'GET') {
    const rows = (await db.prepare('SELECT collection_id, version_id, data, updated_at FROM lab_protocols ORDER BY name').bind().all()).results;
    return json(200, {protocols: rows.map(r => ({...JSON.parse(r.data), lab: {pushedAt: r.updated_at}})), updatedAt: rows.reduce((t, r) => Math.max(t, r.updated_at), 0) || null});
  }
  const archived = path.match(/^\/api\/lab\/protocols\/([1-9][0-9]{0,12})\/versions\/([1-9][0-9]{0,15})$/);
  if (archived && req.method === 'GET') {
    const row = await db.prepare('SELECT data, updated_at FROM lab_protocol_versions WHERE collection_id = ? AND version_id = ?').bind(Number(archived[1]), Number(archived[2])).first();
    if (!row) throw new Problem(404, 'The pinned snapshot is not in the lab archive.');
    return json(200, {protocol: {...JSON.parse(row.data), lab: {pushedAt: row.updated_at}}});
  }
  if (path === '/api/lab/equipment' && req.method === 'GET') {
    const row = await db.prepare('SELECT data, updated_at FROM lab_equipment WHERE id = ?').bind('lab').first();
    return json(200, {equipment: row ? JSON.parse(row.data) : [], updatedAt: row?.updated_at || null, canEdit: owner});
  }
  if (path === '/api/lab/equipment' && req.method === 'PUT') {
    if (!owner) throw new Problem(403, 'Only the lab owner can change the lab equipment.');
    guardWrite(req);
    return json(200, {equipment: await saveLabEquipment(db, await req.text(), me.user_id)});
  }
  if (path === '/api/reviews' && req.method === 'GET') {
    const rows = (await db.prepare('SELECT r.id, r.title, r.status, r.created_at, r.author_id, m.name AS author FROM reviews r LEFT JOIN members m ON m.user_id = r.author_id ORDER BY r.created_at DESC').bind().all()).results;
    const counts = (await db.prepare('SELECT review_id, COUNT(DISTINCT user_id) AS n FROM review_responses GROUP BY review_id').bind().all()).results;
    return json(200, {reviews: rows.map(r => ({id: r.id, title: r.title, status: r.status, createdAt: r.created_at, author: r.author || 'Unknown', responders: counts.find(c => c.review_id === r.id)?.n || 0}))});
  }
  if (path === '/api/reviews' && req.method === 'POST') {
    guardWrite(req);
    const text = await req.text();
    if (text.length > MAX_REVIEW_BYTES) throw new Problem(413, 'This review is too large to publish.');
    let b; try { b = JSON.parse(text); } catch { throw new Problem(400, 'Invalid JSON.'); }
    const title = typeof b.title === 'string' ? b.title.trim().slice(0, 200) : '';
    const p = b.packet;
    if (!title || !p || p.version !== 1 || !Array.isArray(p.steps) || !p.steps.length || p.steps.length > 500) throw new Problem(400, 'Not a review: it needs a title and the protocol steps.');
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO reviews (id, title, author_id, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, title, me.user_id, 'open', JSON.stringify(p), Date.now()).run();
    return json(200, {id});
  }
  const hit = path.match(/^\/api\/reviews\/([0-9a-f-]{36})(\/responses|\/status)?$/);
  if (!hit) throw new Problem(404, 'Not found.');
  const r = await db.prepare('SELECT r.*, m.name AS author FROM reviews r LEFT JOIN members m ON m.user_id = r.author_id WHERE r.id = ?').bind(hit[1]).first();
  if (!r) throw new Problem(404, 'No such review.');
  if (!hit[2] && req.method === 'GET') {
    const rows = (await db.prepare('SELECT x.step_id, x.user_id, x.data, x.updated_at, m.name FROM review_responses x LEFT JOIN members m ON m.user_id = x.user_id WHERE x.review_id = ? ORDER BY x.updated_at').bind(r.id).all()).results;
    return json(200, {review: {id: r.id, title: r.title, status: r.status, createdAt: r.created_at, author: r.author || 'Unknown', authorId: r.author_id, canManage: owner || r.author_id === me.user_id, packet: JSON.parse(r.data)},
      me: me.user_id, responses: rows.map(x => ({stepId: x.step_id, userId: x.user_id, name: x.name || 'Unknown', updatedAt: x.updated_at, ...JSON.parse(x.data)}))});
  }
  if (hit[2] === '/responses' && req.method === 'PUT') {
    guardWrite(req);
    if (r.status !== 'open') throw new Problem(409, 'This review is closed.');
    const b = await body(req), stepId = String(b.stepId || '');
    const steps = JSON.parse(r.data).steps.map(s => s.id);
    if (stepId !== '_overall' && !steps.includes(stepId)) throw new Problem(400, 'No such step in this review.');
    const data = cleanResponse(stepId, b);
    await db.prepare('INSERT INTO review_responses (review_id, step_id, user_id, data, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(review_id, step_id, user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at').bind(r.id, stepId, me.user_id, JSON.stringify(data), Date.now()).run();
    return json(200, {response: data});
  }
  if (hit[2] === '/status' && req.method === 'POST') {
    guardWrite(req);
    if (!(owner || r.author_id === me.user_id)) throw new Problem(403, 'Only the author or the lab owner can open or close a review.');
    const b = await body(req);
    if (!['open', 'closed'].includes(b.status)) throw new Problem(400, 'Choose open or closed.');
    await db.prepare('UPDATE reviews SET status = ? WHERE id = ?').bind(b.status, r.id).run();
    return json(200, {ok: true});
  }
  throw new Problem(405, 'Method not allowed.');
}

// ---------------------------------------------------------------- lab protocols from Labstep (#145)
export const MAX_LAB_PROTOCOL_BYTES = 1536 * 1024;
const MAX_PUSH_KEYS = 5;
const pairCode = hash => hash.slice(0, 4).toUpperCase() + '-' + hash.slice(4, 8).toUpperCase();

// The computer pushing protocols, by its push key. The key must belong to the
// person who is the lab owner now (OWNER_EMAIL), still active: a key stops
// working when ownership moves or the owner removes it.
async function pusher(req, env) {
  const m = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.get('authorization') || '');
  if (!m) throw new Problem(401, 'Send the push key approved on the Lab page.');
  if (!env.DB) throw new Problem(503, 'Lab storage is not available on this server.');
  const hash = await authHash(m[1]), owners = ownerEmails(env);
  // A key whose SHA-256 is in the LAB_PUSH_KEYS runtime setting (comma-separated)
  // is trusted without a browser approval: only the Site's owner can change
  // runtime settings, so setting it is the owner's approval (#185).
  const trusted = String(env.LAB_PUSH_KEYS || '').split(',').map(x => x.trim().toLowerCase()).filter(x => /^[0-9a-f]{64}$/.test(x));
  if (trusted.includes(hash)) return {hash, user_id: 'owner-push-key', email: owners[0] || '', role: 'owner', status: 'active'};
  const row = await env.DB.prepare('SELECT k.hash, m.user_id, m.email, m.role, m.status FROM lab_push_keys k JOIN members m ON m.user_id = k.member_id WHERE k.hash = ?').bind(hash).first();
  if (!row || row.role !== 'owner' || row.status !== 'active' || !owners.includes(String(row.email || '').toLowerCase())) throw new Problem(403, 'This push key is not approved by the lab owner.');
  await env.DB.prepare('UPDATE lab_push_keys SET last_used_at = ? WHERE hash = ?').bind(Date.now(), hash).run();
  return row;
}

export function cleanLabProtocol(raw, id) {
  const bad = why => new Problem(400, `Not a Labstep protocol export: ${why}.`);
  if (!raw || typeof raw !== 'object' || raw.schema !== 'lab-mcp/protocol-export/1') throw bad('expected lab-mcp/protocol-export/1');
  if (raw.collection_id !== id) throw bad('the collection ID does not match the address');
  try { checkLabstepVersion(raw); } catch (e) { throw new Problem(400, e.message); }
  if (typeof raw.name !== 'string' || !raw.name.trim()) throw bad('it has no name');
  if (!Array.isArray(raw.steps) || raw.steps.length > 2000 || raw.steps.some(s => !s || typeof s !== 'object')) throw bad('steps must be a list');
  const {lab, ...clean} = raw;
  return clean;
}

// The instruments the lab can use (#145): the same records as a person's
// equipment, kept once for the lab. Members read them; the owner edits them.
export const MAX_LAB_EQUIPMENT_BYTES = 256 * 1024;
export function cleanLabEquipment(list) {
  if (!Array.isArray(list) || list.length > 200) throw new Problem(400, 'Send a list of at most 200 instruments.');
  const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
  const ids = new Set();
  return list.map(e => {
    if (!e || typeof e !== 'object' || !str(e.id, 80) || !str(e.modelId, 80)) throw new Problem(400, 'Each instrument needs an id and a catalogue model.');
    if (ids.has(e.id)) throw new Problem(400, `Instrument ${e.id} is listed twice.`);
    ids.add(e.id);
    const {lab, isNew, ...rec} = e;
    return {...rec, id: str(e.id, 80), modelId: str(e.modelId, 80), name: str(e.name, 160) || str(e.modelId, 80)};
  });
}
async function saveLabEquipment(db, text, by) {
  if (new TextEncoder().encode(text).length > MAX_LAB_EQUIPMENT_BYTES) throw new Problem(413, 'The equipment list is too large to store.');
  let b; try { b = JSON.parse(text); } catch { throw new Problem(400, 'Invalid JSON.'); }
  const list = cleanLabEquipment(b?.equipment);
  await db.prepare('INSERT INTO lab_equipment (id, data, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_by = excluded.updated_by, updated_at = excluded.updated_at').bind('lab', JSON.stringify(list), by, Date.now()).run();
  return list;
}

async function labstepPush(path, req, env) {
  const who = await pusher(req, env), db = env.DB;
  if (path === '/api/labstep/equipment' && req.method === 'PUT') {
    guardWrite(req);
    return json(200, {equipment: await saveLabEquipment(db, await req.text(), who.user_id)});
  }
  if (path === '/api/labstep/protocols' && req.method === 'GET') {
    const rows = (await db.prepare('SELECT collection_id, version_id, labstep_updated_at, content_hash FROM lab_protocols ORDER BY collection_id').bind().all()).results;
    return json(200, {protocols: rows.map(r => ({collectionId: r.collection_id, versionId: r.version_id, labstepUpdatedAt: r.labstep_updated_at, contentHash: r.content_hash}))});
  }
  const hit = path.match(/^\/api\/labstep\/protocols\/([1-9][0-9]{0,12})$/);
  if (hit && req.method === 'PUT') {
    guardWrite(req);
    const text = await req.text();
    if (new TextEncoder().encode(text).length > MAX_LAB_PROTOCOL_BYTES) throw new Problem(413, 'This protocol is too large to store.');
    let raw; try { raw = JSON.parse(text); } catch { throw new Problem(400, 'Invalid JSON.'); }
    const p = cleanLabProtocol(raw, Number(hit[1]));
    try { await verifyLabstepSnapshotHash(p); } catch (e) { throw new Problem(400, e.message); }
    if (isLabstepDraft(p) && req.headers.get('x-planner-allow-draft') !== labstepDraftConsent(p)) {
      throw new Problem(409, 'This export is a draft or has no confirmed lock. An explicit override for this exact snapshot is required.');
    }
    // Compare against the row at write time. The migration's trigger archives
    // the old row in this same statement, and only on a real version advance.
    const sqlPaths = paths => paths.map(p => `'$.${p}'`).join(', ');
    const metadata = sqlPaths(labstepRefreshPaths.filter(p => p !== 'retrieved_at' && p !== 'imported_at'));
    const removed = sqlPaths([...labstepRefreshPaths, 'content_hash', 'version.number']);
    // Compare complete JSON values by path, independent of object key order.
    const tree = data => `SELECT fullkey, type, atom FROM json_tree(json_remove(${data}, ${removed}))`;
    const priorPayload = tree('lab_protocols.data'), nextPayload = tree('excluded.data');
    const sameMetadata = `json_extract(lab_protocols.data, ${metadata}) = json_extract(excluded.data, ${metadata})`;
    const result = await db.prepare(`
      INSERT INTO lab_protocols (collection_id, version_id, version_number, name, labstep_updated_at, content_hash, data, pushed_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(collection_id) DO UPDATE SET version_id = excluded.version_id, version_number = excluded.version_number,
        name = excluded.name, labstep_updated_at = excluded.labstep_updated_at, content_hash = excluded.content_hash,
        data = excluded.data, pushed_by = excluded.pushed_by, updated_at = excluded.updated_at
      WHERE (excluded.version_id <> lab_protocols.version_id AND excluded.version_number > lab_protocols.version_number
          AND NOT EXISTS (SELECT 1 FROM lab_protocol_versions
            WHERE collection_id = excluded.collection_id AND version_id = excluded.version_id))
        OR (excluded.version_id = lab_protocols.version_id
          AND (lab_protocols.version_number IS NULL OR excluded.version_number = lab_protocols.version_number)
          AND (excluded.content_hash = lab_protocols.content_hash OR COALESCE(lab_protocols.content_hash, '') = '')
          AND NOT EXISTS (${priorPayload} EXCEPT ${nextPayload})
          AND NOT EXISTS (${nextPayload} EXCEPT ${priorPayload})
          AND COALESCE((
            SELECT next > prior OR (next = prior AND (${sameMetadata}))
              OR (prior IS NULL AND (next IS NOT NULL OR (${sameMetadata})))
            FROM (SELECT julianday(COALESCE(json_extract(lab_protocols.data, '$.retrieved_at'), json_extract(lab_protocols.data, '$.imported_at'))) AS prior,
              julianday(COALESCE(json_extract(excluded.data, '$.retrieved_at'), json_extract(excluded.data, '$.imported_at'))) AS next)
          ), FALSE))
      `).bind(p.collection_id, p.version.id, p.version.number, p.name.trim().slice(0, 300), String(p.collection_updated_at || ''), p.content_hash, JSON.stringify(p), who.user_id, Date.now()).run();
    if (!result.meta?.changes) throw new Problem(409, 'This snapshot is older than or conflicts with the stored version. The lab protocol was not changed.');
    return json(200, {ok: true, collectionId: p.collection_id, versionId: p.version.id});
  }
  if (path === '/api/labstep/prune' && req.method === 'POST') {
    // Protocols no longer in Labstep leave the lab list. An empty list is refused,
    // so a failed Labstep read can never empty the lab.
    guardWrite(req);
    const b = await body(req), keep = Array.isArray(b.keep) ? b.keep.filter(Number.isSafeInteger) : [];
    if (!keep.length) throw new Problem(400, 'Send the Labstep protocol IDs to keep.');
    const have = (await db.prepare('SELECT collection_id FROM lab_protocols').bind().all()).results.map(r => r.collection_id);
    const gone = have.filter(id => !keep.includes(id));
    if (gone.length) await db.batch(gone.map(id => db.prepare('DELETE FROM lab_protocols WHERE collection_id = ?').bind(id)));
    return json(200, {removed: gone});
  }
  throw new Problem(hit || path === '/api/labstep/protocols' ? 405 : 404, hit || path === '/api/labstep/protocols' ? 'Method not allowed.' : 'Not found.');
}

async function body(req) {
  const text = await req.text();
  if (text.length > 64 * 1024) throw new Problem(413, 'Too large.');
  try { return JSON.parse(text); } catch { throw new Problem(400, 'Invalid JSON.'); }
}

function asset(path, assets) {
  const name = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
  const a = assets[name] || (name.endsWith('/') ? assets[name + 'index.html'] : null);
  if (!a) return new Response('Not found', {status: 404, headers: {'Content-Type': 'text/plain'}});
  // Always revalidate, so a new deploy is picked up immediately.
  return new Response(a.body, {headers: {'Content-Type': a.type, 'Cache-Control': 'no-cache'}});
}

export async function handle(req, env, assets, {fetcher = fetch, registryContracts = defaultRegistryContracts} = {}) {
  const path = new URL(req.url).pathname;
  try {
    if (path.startsWith('/api/')) return await api(path, req, env, registryContracts);
    if (path.startsWith('/auth/')) return await authRoute(path, req, env, {fetcher});
    if (!['GET', 'HEAD'].includes(req.method)) throw new Problem(405, 'Method not allowed.');
    return asset(path, assets);
  } catch (e) {
    if (e instanceof Problem) return json(e.status, {error: e.message});
    console.error('request failed', path, e?.message);
    return json(500, {error: 'Server error.'});
  }
}
