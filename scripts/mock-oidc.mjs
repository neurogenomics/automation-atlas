// A stand-in for an Auth0 tenant, for tests and local preview only (#132). It
// signs real RS256 ID tokens with a key made at start-up, checks the client
// secret, redirect URI and S256 PKCE verifier at the token endpoint, and answers
// discovery and JWKS like Auth0. It proves the planner's side of the protocol;
// it is not a substitute for signing in through the real tenant.
const b64url = bytes => Buffer.from(bytes).toString('base64url');

export async function mockOidc({issuer, clientId, clientSecret}) {
  const pair = () => crypto.subtle.generateKey({name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'}, true, ['sign', 'verify']);
  const key = await pair(), stranger = await pair();
  const {n, e} = await crypto.subtle.exportKey('jwk', key.publicKey);
  const jwks = {keys: [{kty: 'RSA', n, e, kid: 'k1', use: 'sig', alg: 'RS256'}]};
  const codes = new Map();
  const base = new URL(issuer);
  const at = path => new URL(path, base).href;
  const discovery = {issuer, authorization_endpoint: at('authorize'), token_endpoint: at('oauth/token'), jwks_uri: at('.well-known/jwks.json')};

  async function sign(claims, {header = {}, wrongKey = false} = {}) {
    const h = b64url(JSON.stringify({alg: 'RS256', typ: 'JWT', kid: 'k1', ...header}));
    const p = b64url(JSON.stringify(claims));
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', (wrongKey ? stranger : key).privateKey, new TextEncoder().encode(`${h}.${p}`));
    return `${h}.${p}.${b64url(new Uint8Array(sig))}`;
  }

  // The person signs in at the provider: returns the callback URL with a code.
  // `as` is {email, id, name, verified}; `claims` overrides ID-token claims and
  // `token` passes {header, wrongKey} to the signer, for refusal tests.
  function authorize(authorizeUrl, as, {claims = {}, token = {}} = {}) {
    const u = new URL(authorizeUrl);
    const q = Object.fromEntries(u.searchParams);
    if (q.client_id !== clientId || q.code_challenge_method !== 'S256' || !q.code_challenge || !q.state || !q.nonce) throw new Error('bad authorize request');
    const code = b64url(crypto.getRandomValues(new Uint8Array(24)));
    const now = Math.floor(Date.now() / 1000);
    const prefix = q.connection === 'google-oauth2' ? 'google-oauth2|' : 'auth0|';
    codes.set(code, {q, token, claims: {iss: issuer, aud: clientId, sub: prefix + (as.id || as.email), email: as.email, email_verified: as.verified ?? true, name: as.name || as.email, nonce: q.nonce, iat: now, exp: now + 600, auth_time: now, ...claims}});
    const back = new URL(q.redirect_uri);
    back.searchParams.set('code', code);
    back.searchParams.set('state', q.state);
    return back.href;
  }

  async function token(body) {
    const f = Object.fromEntries(new URLSearchParams(body));
    const c = codes.get(f.code);
    codes.delete(f.code);
    if (!c || f.client_id !== clientId || f.client_secret !== clientSecret || f.redirect_uri !== c.q.redirect_uri || f.grant_type !== 'authorization_code') return null;
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(f.code_verifier || ''))));
    if (challenge !== c.q.code_challenge) return null;
    return {id_token: await sign(c.claims, c.token), access_token: 'unused', token_type: 'Bearer'};
  }

  const reply = (status, body) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
  async function fetcher(url, opts = {}) {
    const href = String(url);
    if (href === at('.well-known/openid-configuration')) return reply(200, discovery);
    if (href === discovery.jwks_uri) return reply(200, jwks);
    if (href === discovery.token_endpoint && opts.method === 'POST') { const t = await token(String(opts.body)); return t ? reply(200, t) : reply(403, {error: 'invalid_grant'}); }
    return reply(404, {error: 'not found'});
  }
  return {fetcher, authorize, sign, discovery};
}
