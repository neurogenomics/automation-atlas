// The lab (#105): who is in it, invitations and the reviews sent to it.
// Same arrangement as the Graph Workshop: ChatGPT sign-in, an owner set by
// the site's OWNER_EMAIL setting, members admitted by invitation or approval.
import {api, account, esc} from './store.js';

const when = t => new Date(t).toLocaleDateString(undefined, {day: 'numeric', month: 'short', year: 'numeric'});

export function signInPanel(what) {
  if (!account.available) return `<p class='empty'>The lab needs the hosted site: sign-in is not available here.</p>`;
  return `<div class='card'><p>Sign in to ${esc(what)}.</p><button class='btn' data-signin>Sign in with ChatGPT</button></div>`;
}

export async function labState() {
  if (!account.available || !account.user) return null;
  return api('lab');
}

export function mountLab(el, ctx, params = {}) {
  // #lab/approve-<hash>: the link printed by `npm run labstep -- push` (#145).
  const approving = /^approve-([0-9a-f]{64})$/.exec(params.id || '')?.[1] || null;
  el.innerHTML = `<section class='pg'><h2>Lab</h2><p class='lede'>Lab members can read and answer the reviews sent to the lab. The lab owner invites people by email; anyone else who signs in waits for the owner to admit them.</p><div id='lab-body'><p class='sub'>Loading…</p></div></section>`;
  const body = el.querySelector('#lab-body');
  const draw = async () => {
    let s;
    try { s = await labState(); } catch (e) { body.innerHTML = `<p class='notice bad'>${esc(e.message)}</p>`; return; }
    if (!s) { body.innerHTML = signInPanel('join the lab and see its reviews'); return; }
    const me = s.me, owner = me.role === 'owner';
    if (me.status !== 'active') {
      body.innerHTML = `<div class='card'><h3>${me.status === 'pending' ? 'Waiting to be admitted' : 'Not a member'}</h3><p>You are signed in as <strong>${esc(me.name)}</strong>${me.email ? ` (${esc(me.email)})` : ''}. ${me.status === 'pending' ? 'The lab owner has been shown your request. Ask them to admit you, or to invite this email address.' : 'Ask the lab owner to invite you again.'}</p>${s.lab.ownerConfigured ? `<p class='sub'>If you are the lab owner, the site's OWNER_EMAIL setting must be exactly the email shown here. Change the setting (or sign in with that email) and reload.</p>` : `<p class='notice bad'>No lab owner is set on this site yet (the OWNER_EMAIL setting).</p>`}</div>`;
      return;
    }
    let reviews = [];
    try { reviews = (await api('reviews')).reviews; } catch (e) { console.error(e); }
    const active = s.members.filter(m => m.status === 'active'), waiting = s.members.filter(m => m.status === 'pending');
    body.innerHTML = `
      <h3>Reviews (${reviews.length})</h3>
      ${reviews.length ? `<div class='tbl-wrap'><table class='tbl'><thead><tr><th>Review</th><th>Sent by</th><th>Answered by</th><th>Status</th></tr></thead><tbody>
        ${reviews.map(r => `<tr><td><a href='#review/${esc(r.id)}'><strong>${esc(r.title)}</strong></a><small>${esc(when(r.createdAt))}</small></td><td>${esc(r.author)}</td><td>${r.responders} ${r.responders === 1 ? 'person' : 'people'}</td><td>${r.status === 'open' ? 'Open' : 'Closed'}</td></tr>`).join('')}
      </tbody></table></div>` : `<p class='empty'>No reviews yet. To ask the lab to check a protocol’s timings, open <a href='#decide'>Decide what to automate</a>, choose the protocol and use “Ask the lab to review these timings”.</p>`}
      <h3>${esc(s.lab.name)}: members (${active.length})</h3>
      <ul>${active.map(m => `<li>${esc(m.name)}${m.role === 'owner' ? ' <small style="display:inline">(owner)</small>' : ''}${owner && m.email ? ` <small style="display:inline">${esc(m.email)}</small>` : ''}${owner && m.role !== 'owner' ? ` <button class='link' data-member='${esc(m.id)}' data-status='removed'>Remove</button>` : ''}</li>`).join('')}</ul>
      ${owner ? `
        ${waiting.length ? `<h3>Waiting to be admitted (${waiting.length})</h3><ul>${waiting.map(m => `<li>${esc(m.name)} <small style="display:inline">${esc(m.email || '')}</small> <button class='link' data-member='${esc(m.id)}' data-status='active'>Admit</button></li>`).join('')}</ul>` : ''}
        <h3>Lab protocols from Labstep</h3>
        ${approving ? `<div class='card'><p>A computer asks to push the lab's Labstep protocols and equipment. Check that this code matches the one it printed: <strong>${esc(approving.slice(0, 4).toUpperCase())}-${esc(approving.slice(4, 8).toUpperCase())}</strong>.</p>${s.pushKeys.some(k => k.hash === approving) ? `<p class='ok'>Approved. The computer will push now.</p>` : `<form id='approve' class='row'><label>Name this computer<input name='label' value='Labstep push' maxlength='80'></label><button class='btn'>Approve</button></form>`}</div>` : ''}
        <p class='sub'>On the computer that has the Labstep key (lab-mcp), run <code>npm run labstep -- push</code>. The first time it prints a link to approve it here; after that it pushes straight away. The Labstep key never leaves that computer.</p>
        ${s.pushKeys.length ? `<ul>${s.pushKeys.map(k => `<li>${esc(k.label)} <small style="display:inline">${esc(k.code)} · approved ${esc(when(k.createdAt))}${k.lastUsedAt ? ` · last push ${esc(when(k.lastUsedAt))}` : ''}</small> <button class='link' data-unpush='${esc(k.hash)}'>Remove</button></li>`).join('')}</ul>` : `<p class='empty'>No computer is approved to push yet.</p>`}
        <h3>Invite people</h3>
        <p class='sub'>Enter the email address they sign in to ChatGPT with. They are admitted as soon as they sign in. Then send them the link to the site.</p>
        <form id='invite' class='row'><label>Email<input type='email' name='email' required autocomplete='off'></label><button class='btn'>Invite</button></form>
        ${s.invites.length ? `<p class='sub'>Invited, not signed in yet:</p><ul>${s.invites.map(i => `<li>${esc(i.email)} <button class='link' data-uninvite='${esc(i.email)}'>Withdraw</button></li>`).join('')}</ul>` : ''}` : ''}`;
  };
  el.onclick = async ev => {
    const t = ev.target;
    if (t.closest('[data-signin]')) return account.signIn();
    const m = t.closest('[data-member]'), u = t.closest('[data-uninvite]'), k = t.closest('[data-unpush]');
    try {
      if (k) { await api('lab/push-keys', 'POST', {hash: k.dataset.unpush, remove: true}); draw(); }
      if (m) { await api('lab/members', 'POST', {id: m.dataset.member, status: m.dataset.status}); draw(); }
      if (u) { await api('lab/invites', 'POST', {email: u.dataset.uninvite, remove: true}); draw(); }
    } catch (e) { alert(e.message); }
  };
  el.onsubmit = async ev => {
    if (ev.target.id === 'approve') {
      ev.preventDefault();
      try { await api('lab/push-keys', 'POST', {hash: approving, label: ev.target.label.value}); draw(); } catch (e) { alert(e.message); }
      return;
    }
    if (ev.target.id !== 'invite') return;
    ev.preventDefault();
    try { await api('lab/invites', 'POST', {email: ev.target.email.value}); draw(); } catch (e) { alert(e.message); }
  };
  draw();
}
