// Router and profile context for the general-purpose planner.
import {mountReviewed} from './reviewed.js';
import {mountDecide} from './decide.js';
import {mountProtocols} from './protocols.js';
import {mountEquipment} from './equipment.js';
import {mountCatalogue} from './catalogue.js';
import {mountLab} from './lab.js';
import {mountReview} from './review.js';
import {mountRegistry} from './registry.js';
import {store, validateProfile, download, account, api, esc} from './store.js';
import {mergeProtocolImports, verifyProtocolImports} from './pins.js';

const views = {reviewed: mountReviewed, decide: mountDecide, protocols: mountProtocols, equipment: mountEquipment, catalogue: mountCatalogue, registry: mountRegistry, lab: mountLab, review: mountReview};
const navOf = {review: 'lab'};
let profile = store.load();
let pushTimer = null;
// The lab's protocols and equipment (#145) are shown to every active member
// alongside their own, marked lab: true. They are never saved into a profile.
let lab = {protocols: [], equipment: [], canEdit: false};
const labKey = r => `${r.source}:${r.collection_id ?? r.id}`;
const merged = () => {
  const p = structuredClone(profile);
  const own = new Set(p.protocols.map(labKey));
  p.protocols = [...lab.protocols.filter(r => !own.has(labKey(r))).map(r => ({...structuredClone(r), lab: r.lab || {}})), ...p.protocols];
  const ownEq = new Set(p.equipment.map(e => e.id));
  p.equipment = [...p.equipment, ...lab.equipment.filter(e => !ownEq.has(e.id)).map(e => ({...structuredClone(e), lab: true}))];
  return p;
};
const strip = p => ({...p, protocols: p.protocols.filter(r => !r.lab), protocolArchive: p.protocolArchive.filter(r => !r.lab), equipment: p.equipment.filter(e => !e.lab)});
const ctx = {
  where: store.where.toLowerCase(),
  profile: merged,
  lab: () => lab,
  draftOverrides: new Map(),
  async refreshLabProtocols() {
    const r = await api('lab/protocols');
    lab = {...lab, protocols: r.protocols || [], protocolsUpdated: r.updatedAt};
  },
  // Owner only: replace the lab's equipment list.
  async saveLabEquipment(list) { const r = await account.saveLabEquipment(list.map(({lab: _, ...e}) => e)); lab = {...lab, equipment: r.equipment}; },
  update: (p, {requireLocalSave = false} = {}) => {
    const next = strip(p);
    if (!store.save(next) && requireLocalSave) throw Error('The browser could not save these protocol snapshots. Free local storage and try again.');
    profile = next;
    if (account.user) { clearTimeout(pushTimer); pushTimer = setTimeout(() => account.push(profile).then(() => status(''), e => status(`Not saved to your account: ${e.message}`)), 600); }
  },
  go: (view, params) => {
    pending = params;
    // A changed hash belongs to hashchange; an unchanged hash emits no event.
    if (location.hash.slice(1) === view) route();
    else location.hash = view;
  },
  account,
};
let pending = null;

// A view may take one argument after a slash: #review/<id>.
function route() {
  const [name, arg, ...rest] = location.hash.slice(1).split('/');
  const view = Object.hasOwn(views, name) ? name : 'decide';
  for (const a of document.querySelectorAll('#navigation a')) a.classList.toggle('active', a.dataset.view === (navOf[view] || view));
  const el = document.getElementById('view');
  el.onchange = el.onclick = el.onsubmit = el.oninput = el.ondragover = el.ondragleave = el.ondrop = null;
  try { views[view](el, ctx, view === 'registry' ? {parts: arg === undefined ? [] : [arg, ...rest]} : pending || (arg ? {id: decodeURIComponent(arg)} : {})); } catch (e) { el.innerHTML = `<p class='notice bad'>Could not show this page: ${String(e.message).replace(/[<>&]/g, '')}</p>`; console.error(e); }
  pending = null;
}

function status(msg) { const el = document.getElementById('sync'); if (el) el.textContent = msg; }

function drawAccount() {
  const el = document.getElementById('account');
  if (!account.available) { el.innerHTML = `<p>Sign-in is not available here. Everything is saved in this browser.</p>`; ctx.where = 'this browser only'; return; }
  if (account.user) {
    ctx.where = 'your account (protocols you import stay in this browser)';
    el.innerHTML = `<p>Signed in as <strong>${esc(account.user.name)}</strong>.<br>Equipment, workflows and answers are saved to your account. Protocols you import stay in this browser, except the steps of a review you send to the lab. The lab's own protocols and equipment come from the lab${lab.protocols.length || lab.equipment.length ? ` (${lab.protocols.length} protocols, ${lab.equipment.length} instruments)` : ''}.</p><p id='sync'></p>${account.login.enabled ? `<details id='logins'><summary>Login methods</summary><div></div></details>` : ''}<button id='signout'>Sign out</button>`;
    document.getElementById('signout').onclick = () => account.signOut();
    const box = document.getElementById('logins');
    if (box) box.ontoggle = () => { if (box.open) drawLogins(box.querySelector('div')); };
    return;
  }
  ctx.where = 'this browser only';
  el.innerHTML = `<p>Sign in to keep your equipment and workflows on any device.</p><button id='signin'>${account.login.enabled ? 'Sign in' : 'Sign in with ChatGPT'}</button>`;
  document.getElementById('signin').onclick = () => account.signIn();
}

// Linked logins (#132): each opens the same account. Linking needs this session
// and a fresh sign-in with the other method; nothing is merged by email.
const METHOD = {chatgpt: 'ChatGPT', google: 'Google', password: 'Email and password'};
async function drawLogins(el) {
  el.innerHTML = '<p>Loading…</p>';
  let m;
  try { m = await account.methods(); } catch (e) { el.innerHTML = `<p class='bad'>${esc(e.message)}</p>`; return; }
  const has = new Set(m.methods.map(x => x.method));
  if (m.chatgptLinked) has.add('chatgpt');
  const rows = [...has].map(k => `<li>${esc(METHOD[k] || k)}${m.methods.find(x => x.method === k && x.email) ? ` <small>(${esc(m.methods.find(x => x.method === k).email)})</small>` : ''}</li>`).join('');
  el.innerHTML = `<ul>${rows}</ul>
    ${m.google && !has.has('google') ? `<button data-link='google'>Link Google</button>` : ''}
    ${m.password && !has.has('password') ? `<button data-link='password'>Link email and password</button>` : ''}
    ${!has.has('chatgpt') ? `<button data-link='chatgpt'>Link ChatGPT</button>` : ''}
    <p>Linking asks you to sign in with that method, then brings you back to this same account.</p>`;
  el.onclick = ev => { const k = ev.target.dataset?.link; if (k === 'chatgpt') account.linkChatgpt(); else if (k) account.link(k); };
}

account.check().then(async () => {
  if (account.user && account.available) {
    try {
      const remote = await account.pull();
      if (remote) { profile = {...profile, equipment: remote.equipment, workflows: remote.workflows, setups: remote.setups || profile.setups || [], answers: remote.answers}; store.save(profile); }
      else if (profile.equipment.length || profile.workflows.length) await account.push(profile);
    } catch (e) { console.error(e); }
    lab = await account.lab();
  }
  drawAccount();
  const registry = document.getElementById('registry-workspace');
  // A registry already mounted with this account must keep its draft when
  // unrelated profile and lab hydration finishes.
  if (!registry || registry.dataset.accountState !== `${account.available}:${Boolean(account.user)}`) route();
});
document.getElementById('export').onclick = () => download('automation-atlas-profile.json', JSON.stringify(profile, null, 1));  // own data only, never the lab's
document.getElementById('import').onclick = () => document.getElementById('import-file').click();
document.getElementById('import-file').onchange = async ev => {
  const f = ev.target.files[0];
  if (!f) return;
  try {
    const backup = validateProfile(JSON.parse(await f.text()));
    const [protocols, archive] = await Promise.all([
      verifyProtocolImports(backup.protocols), verifyProtocolImports(backup.protocolArchive),
    ]);
    const next = {...backup, ...mergeProtocolImports(profile, protocols, {history: archive, hosted: lab.protocols})};
    if (!store.save(next)) throw Error('The browser could not save this profile. Free local storage and try again.');
    profile = next;
    ctx.draftOverrides.clear();
    route();
  }
  catch (e) { alert(`Not imported: ${e.message}`); }
  ev.target.value = '';
};
addEventListener('hashchange', () => {
  route();
  // A push from Labstep (#145) shows on the next page change, without a reload.
  if (account.user) account.lab().then(l => { if (JSON.stringify(l) !== JSON.stringify(lab)) { lab = l; drawAccount(); if (!document.getElementById('registry-workspace')) route(); } });
});
// A file dropped outside a drop target must not replace the page.
for (const t of ['dragover', 'drop']) addEventListener(t, ev => { if ([...(ev.dataTransfer?.types || [])].includes('Files')) ev.preventDefault(); });
