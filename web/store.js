import {normaliseSnapshot} from '../lib/snapshots.js';

// A person's planner profile: the protocols they imported, the workflows they
// built from them, the instruments they can access (with the options each
// one has) and their answers to open questions.
//
// Storage is behind this module so it can move to signed-in accounts (#25)
// without touching the views. Today it is kept in this browser only.

const KEY = 'atlas-profile-v1';
export const empty = () => ({version: 1, protocols: [], protocolArchive: [], workflows: [], equipment: [], setups: [], answers: {}});

const snapshots = rows => Array.isArray(rows) ? rows.filter(raw => {
  try { normaliseSnapshot(raw); return !raw.lab; } catch { return false; }
}) : [];
const validEquipment = e => Boolean(e?.id && e?.modelId);
const validWorkflow = w => Boolean(w?.id && Array.isArray(w.parts) && w.parts.length &&
  w.parts.every(p => p && typeof p.source === 'string' && p.id != null));
const normaliseProfile = p => ({...empty(), ...p,
  protocols: snapshots(p.protocols), protocolArchive: snapshots(p.protocolArchive),
  workflows: Array.isArray(p.workflows) ? p.workflows.filter(validWorkflow) : [],
  equipment: Array.isArray(p.equipment) ? p.equipment.filter(validEquipment) : [],
  setups: Array.isArray(p.setups) ? p.setups : [],
  answers: p.answers && typeof p.answers === 'object' && !Array.isArray(p.answers) ? p.answers : {},
});
export const store = {
  where: 'This browser only',
  load() {
    try {
      const p = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (p && p.version === 1) return normaliseProfile(p);
    } catch {}
    return empty();
  },
  save(profile) {
    try { localStorage.setItem(KEY, JSON.stringify(profile)); return true; } catch { return false; }
  },
};

export function validateProfile(p) {
  if (!p || p.version !== 1) throw Error('Not a planner profile (version 1).');
  for (const k of ['protocols', 'workflows', 'equipment']) if (!Array.isArray(p[k])) throw Error(`Profile is missing ${k}.`);
  if (p.protocolArchive != null && !Array.isArray(p.protocolArchive)) throw Error('The protocol archive must be a list.');
  for (const e of p.equipment) if (!validEquipment(e)) throw Error('Each instrument needs an id and a catalogue model.');
  for (const w of p.workflows) if (!validWorkflow(w)) throw Error('Each workflow needs parts.');
  const clean = normaliseProfile(p);
  if (clean.protocols.length !== p.protocols.length || clean.protocolArchive.length !== (p.protocolArchive?.length ?? 0)) {
    throw Error('The profile contains an invalid protocol snapshot.');
  }
  return clean;
}

export function download(name, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type}));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const uid = prefix => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const esc = v => String(v ?? '').replace(/[&<>'"`]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;', '`': '&#96;'}[c]));

// Signed-in accounts (#47). ChatGPT Sites signs people in, as for the Graph
// Workshop; once the server has the AUTH_* settings, Google and email/password
// sign-in go through Auth0 (#132). The planner never handles passwords.
// Equipment, workflows and answers sync to the account; imported protocols are never sent.
export const api = async (path, method = 'GET', body) => {
  const r = await fetch(`/api/${path}`, {method, credentials: 'same-origin', headers: body ? {'Content-Type': 'application/json'} : {}, body: body ? JSON.stringify(body) : undefined});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(Error(j.error || `Request failed (${r.status})`), {status: r.status});
  return j;
};
export const syncable = p => ({version: 1, equipment: p.equipment, workflows: p.workflows, setups: p.setups || [], answers: p.answers || {}});
const here = () => location.pathname + location.search + location.hash;
function postForm(action, fields) {
  const f = Object.assign(document.createElement('form'), {method: 'POST', action, target: '_top'});
  for (const [name, value] of Object.entries(fields)) f.append(Object.assign(document.createElement('input'), {type: 'hidden', name, value}));
  document.body.append(f);
  f.submit();
}
export const account = {
  available: false,
  user: null,
  links: {},
  login: {},
  async check() {
    try { const me = await api('me'); this.available = Boolean(me.storage); this.user = me.user; this.links = {signIn: me.signIn, signOut: me.signOut, signOutPost: me.signOutPost}; this.login = me.login || {}; }
    catch { this.available = false; this.user = null; }
    return this.user;
  },
  signIn() { location.href = `${this.links.signIn}?return_to=${encodeURIComponent(here())}`; },
  // A Google or email session is revoked on the server, so sign-out is a same-origin POST.
  signOut() { if (this.links.signOutPost) postForm(this.links.signOut, {return_to: here()}); else location.href = `${this.links.signOut}?return_to=${encodeURIComponent(here())}`; },
  // The lab's own protocols and equipment (#145), for active lab members only.
  async lab() {
    try {
      const [p, e] = await Promise.all([api('lab/protocols'), api('lab/equipment')]);
      return {protocols: p.protocols || [], equipment: e.equipment || [], canEdit: Boolean(e.canEdit), protocolsUpdated: p.updatedAt};
    } catch (e) { return {protocols: [], equipment: [], canEdit: false, error: e.status === 403 ? e.message : null}; }
  },
  saveLabEquipment(list) { return api('lab/equipment', 'PUT', {equipment: list}); },
  async methods() { const r = await fetch('/auth/methods', {credentials: 'same-origin'}); if (!r.ok) throw Error(`Could not read login methods (${r.status})`); return r.json(); },
  link(method) { postForm('/auth/link', {method, return_to: here()}); },
  linkChatgpt() { postForm('/auth/link-chatgpt', {return_to: here()}); },
  async pull() { return (await api('profile')).profile; },
  async push(profile) { return api('profile', 'PUT', syncable(profile)); },
};
