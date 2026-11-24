// Local preview of the Sites worker. DEV_USER simulates a ChatGPT sign-in
// (Sites supplies the real one); profiles use an in-memory stand-in for D1.
// Usage: npm run dev            (signed out)
//        DEV_USER=alice npm run dev   (signed in as alice)
//        OWNER_EMAIL=alice@example.org DEV_USER=alice npm run dev   (alice owns the lab, #105)
//        DEV_AUTH=1 npm run dev       (Google and email sign-in against a local stand-in for Auth0, #132)
// /signin-with-chatgpt and /signout-with-chatgpt are simulated here too (Sites provides them when hosted).
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {memoryD1} from './memory-d1.mjs';
import {readFile} from 'node:fs/promises';
import {mockOidc} from './mock-oidc.mjs';

const {handle, assets} = await import(pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), '../dist/server/index.js')).href);
const env = {DB: memoryD1(), OWNER_EMAIL: process.env.OWNER_EMAIL || '', LAB_NAME: process.env.LAB_NAME || 'Lab'};
const port = Number(process.env.PORT || 8000);
const origin = `http://localhost:${port}`;
let idp = null;
if (process.env.DEV_AUTH) {
  // A local stand-in for the Auth0 tenant: it signs real tokens; there is no real Google or password check.
  Object.assign(env, {AUTH_ISSUER: `${origin}/mock-auth0/`, AUTH_CLIENT_ID: 'dev-client', AUTH_CLIENT_SECRET: 'dev-secret', AUTH_CALLBACK_URL: `${origin}/auth/oidc/callback`});
  idp = await mockOidc({issuer: env.AUTH_ISSUER, clientId: env.AUTH_CLIENT_ID, clientSecret: env.AUTH_CLIENT_SECRET});
}
const page = (title, body) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><main style="max-width:30rem;margin:4rem auto;padding:0 16px;font:16px/1.5 system-ui"><p><small>Local preview stand-in</small></p><h1>${title}</h1>${body}</main>`;
const back = u => { const r = new URL(u, origin).searchParams.get('return_to') || '/web/index.html'; return r.startsWith('/') && !r.startsWith('//') ? r : '/web/index.html'; };
const importsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../imports');
createServer(async (req, res) => {
  // Local preview only: serve your git-ignored exports so they can be loaded into the page.
  if (req.url.startsWith('/dev-imports/')) {
    const file = resolve(importsDir, decodeURIComponent(req.url.slice('/dev-imports/'.length)));
    if (!file.startsWith(importsDir)) { res.writeHead(403); return res.end(); }
    try { res.writeHead(200, {'Content-Type': 'application/json'}); return res.end(await readFile(file)); } catch { res.writeHead(404); return res.end(); }
  }
  // Sites' own ChatGPT sign-in and sign-out, simulated with the dev_user cookie.
  if (req.url.startsWith('/signin-with-chatgpt')) {
    const name = new URL(req.url, origin).searchParams.get('as');
    if (name && /^[\w-]+$/.test(name)) { res.writeHead(303, {location: back(req.url), 'set-cookie': `dev_user=${name}; Path=/; SameSite=Lax`}); return res.end(); }
    res.writeHead(200, {'Content-Type': 'text/html'});
    return res.end(page('Sign in with ChatGPT', `<form><input type="hidden" name="return_to" value="${back(req.url).replace(/"/g, '&quot;')}"><label>ChatGPT user <input name="as" value="alice" pattern="[\w-]+"></label> <button>Sign in</button></form>`));
  }
  if (req.url.startsWith('/signout-with-chatgpt')) { res.writeHead(303, {location: back(req.url), 'set-cookie': 'dev_user=; Path=/; Max-Age=0'}); return res.end(); }
  // The stand-in Auth0 login page: choose who signs in.
  if (idp && req.url.startsWith('/mock-auth0/authorize')) {
    const u = new URL(req.url, origin), email = u.searchParams.get('login_hint_email');
    if (email) { const q = new URL(u); q.searchParams.delete('login_hint_email'); res.writeHead(303, {location: idp.authorize(q.href, {email, id: email})}); return res.end(); }
    const how = u.searchParams.get('connection') === 'google-oauth2' ? 'Google' : 'email and password';
    res.writeHead(200, {'Content-Type': 'text/html'});
    return res.end(page(`Sign in with ${how}`, `<form>${[...u.searchParams].map(([k, v]) => `<input type="hidden" name="${k}" value="${v.replace(/"/g, '&quot;')}">`).join('')}<label>Email <input name="login_hint_email" type="email" required value="megan@imperial.example"></label> <button>Continue</button></form>`));
  }
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string' && !k.startsWith('oai-authenticated-user-')) headers.set(k, v);
  }
  // Local preview only: a dev_user cookie switches the simulated person, to try the lab as someone else (#105).
  const asUser = /(?:^|;\s*)dev_user=([\w-]+)/.exec(req.headers.cookie || '')?.[1] || process.env.DEV_USER;
  if (asUser) { headers.set('oai-authenticated-user-id', `dev-${asUser}`); headers.set('oai-authenticated-user-email', `${asUser}@example.org`); headers.set('oai-authenticated-user-full-name', asUser); }
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : req;
  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  const r = await handle(new Request(`${origin}${req.url}`, {
    method: req.method, headers, body, duplex: 'half', signal: controller.signal,
  }), env, assets, {fetcher: idp ? idp.fetcher : fetch});
  const out = Object.fromEntries(r.headers);
  if (r.headers.getSetCookie().length) out['set-cookie'] = r.headers.getSetCookie();
  res.writeHead(r.status, out);
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(port, '127.0.0.1', () => console.log(`Automation Atlas worker on ${origin}${process.env.DEV_USER ? ` (signed in as ${process.env.DEV_USER})` : ' (signed out)'}${idp ? ', with Google and email sign-in against a local stand-in' : ''}`));
