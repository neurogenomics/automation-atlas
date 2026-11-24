import {mountRegistryPlanning} from './registry-planning.js';
import {mountDraftReadback, mountRequestDraft} from './registry-request-draft.js';
import {api, download, esc} from './store.js';
import {kinds, mountRecordForm, nameOf, pin, pretty} from './registry-form.js';
import {serviceClaims} from './registry-service-form.js';
import {mountServiceMatch, serviceSummary} from './registry-service-view.js';
import {mountPilot} from './registry-pilot.js';
import {mountOperatorSurvey} from './registry-survey.js';
import {installationBadge, installationSummary, mountInstallation} from './registry-reconciliation.js';

import {modelPin, mountRoarImport, parseRoarPacket, roarDiscovery, roarEvidence} from './registry-roar.js';

const root = 'registry';
const titleOf = row => {
  const packet = parseRoarPacket(row);
  return packet ? 'ROAR source evidence · ' + packet.report_label : nameOf(row.record);
};
const live = node => node.isConnected && node.closest('#registry-workspace')?.dataset.route === location.hash;
const path = (org, suffix = '') => 'registry/organisations/' + org + suffix;
const workspace = (org = '', item = '') => '#registry/workspace' + (org ? '/' + org : '') + (item ? '/' + item : '');
const publicLink = id => '#registry/public/' + id;
const token = /^[a-z0-9-]{1,128}$/;
const code = s => `<code>${esc(s)}</code>`;
const link = (href, label) => `<a href="${esc(href)}">${esc(label)}</a>`;
const btn = (text, action, primary = false) => `<button type="button" class="btn${primary ? '' : ' ghost'}" data-action="${action}">${text}</button>`;
const send = (url, body) => api(url, 'POST', body);
const getPage = (url, after) => api(url + (after === null ? '' : '?after=' + encodeURIComponent(after)));
const message = error => error.status === 401 ? 'Sign in to use the private registry workspace.'
  : error.status === 404 ? 'This record or workspace is unavailable.' : error.message;
const err = error => `<p class="notice bad" role="alert">${esc(message(error))}</p>`;
const exactData = (label, data) => `<details><summary>${label}</summary><pre>${esc(pretty(data))}</pre></details>`;
const term = s => esc(s?.replaceAll('_', ' '));
const visibility = value => value === 'public' ? 'public candidate' : term(value);
const pair = (label, value) => `<dt>${label}</dt><dd>${value}</dd>`;
const actions = (host, handler) => {
  host.onclick = event => {
    const button = event.target.closest('button[data-action]');
    if (button && host.contains(button)) handler(button.dataset.action, button);
  };
};
function scoped(host, work, {failure, again} = {}) {
  let busy = false;
  return async (...args) => {
    if (busy || !live(host)) return;
    busy = true;
    const buttons = [...host.querySelectorAll('button:not(:disabled)')];
    buttons.forEach(b => { b.disabled = true; });
    const status = host.querySelector('[data-status]');
    if (status) { status.textContent = ''; status.hidden = true; }
    try { await work(...args); }
    catch (error) {
      if (!live(host)) return;
      if (failure?.(error)) return;
      if (status) { status.textContent = message(error); status.hidden = false; }
      else host.insertAdjacentHTML('beforeend', err(error));
    } finally {
      busy = false;
      if (live(host)) { buttons.forEach(b => { b.disabled = false; }); again?.(); }
    }
  };
}
const feedback = '<p class="notice bad" data-status role="alert" hidden></p>';

function safeCitation(source) {
  // The server excludes queries, fragments and credentials; the browser renders only an explicit HTTPS link.
  try {
    const url = new URL(source.url);
    if (url.protocol === 'https:' && !url.username && !url.password && !/[?#\\]/.test(source.url)) return `<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${esc(source.url)}</a>`;
  } catch {}
  return 'Source link unavailable';
}
function projection(p, detail = false) {
  return `<article class="card reg-projection">
    <h3>${detail ? esc(p.label) : link(publicLink(p.record_id), p.label)}</h3>
    <dl>${pair('Record type', esc(kinds[p.record_type]))}${pair('Observed', esc(p.observed_at))}
      ${pair('Assurance', 'Reported')}${pair('Record ID', code(p.record_id))}${pair('Published revision', code(p.revision_id))}
      ${Object.hasOwn(p, 'reported_count') ? pair('Reported count', esc(p.reported_count ?? 'Unknown')) : ''}
      ${p.sources?.length ? pair('Selected sources', `<ul>${p.sources.map(s => `<li>${safeCitation(s)} · observed ${esc(s.observed_at)}</li>`).join('')}</ul>`) : ''}</dl></article>`;
}
async function publicView(host, id) {
  const mount = host.querySelector('[data-content]');
  if (id) {
    const {publication} = await api(root + '/public/' + id);
    if (live(mount)) mount.innerHTML = projection(publication, true);
    return;
  }
  mount.innerHTML = '<div data-list></div><div data-pages></div>' + feedback;
  const list = mount.querySelector('[data-list]'), pages = mount.querySelector('[data-pages]');
  let after = null;
  const load = scoped(mount, async () => {
    const {publications, next_after} = await getPage(root + '/public', after);
    if (!live(mount)) return;
    if (!after && !publications.length) list.innerHTML = '<p class="empty">No reviewed reports are published yet. Published reports will appear here after an owner reviews the public projection and releases it.</p>';
    else list.insertAdjacentHTML('beforeend', publications.map(p => projection(p)).join(''));
    after = next_after;
    pages.innerHTML = after ? btn('More published reports', 'more') : '';
  });
  actions(mount, load);
  await load();
}

function recordList(host, org, first, unavailable) {
  host.innerHTML = '<div data-list></div><div data-pages></div>' + feedback;
  const list = host.querySelector('[data-list]'), pages = host.querySelector('[data-pages]');
  const append = ({records, next_after}) => {
    if (!records.length) list.innerHTML = '<p class="empty">There are no equipment reports visible to your registry role.</p>';
    else list.insertAdjacentHTML('beforeend', records.map(row => `<article class="card">
      <h4>${link(workspace(org.id, row.record.record_id), titleOf(row))}</h4>
      <p class="sub">${esc(kinds[row.record.record.record_type])} · ${esc(row.observed_at)} · ${visibility(row.effective_visibility)} · ${term(row.evidence_status)}${installationBadge(row)}</p>
      <small>${code(row.record.record_id)}</small></article>`).join(''));
    after = next_after;
    pages.innerHTML = after ? btn('More workspace reports', 'more') : '';
  };
  let after;
  append(first);
  actions(host, scoped(host, async () => {
    const page = await getPage(path(org.id, '/records'), after);
    if (live(host)) append(page);
  }, {failure: unavailable}));
}
function revisionSummary(row, org) {
  const w = row.record, r = w.record, target = r.installation ?? r.target, packet = parseRoarPacket(row);
  return `<dl>${pair('Record ID', code(w.record_id))}${pair('Revision', code(w.revision_id))}
    ${pair('Observed', esc(row.observed_at))}${pair('Saved', esc(w.recorded_at))}
    ${pair('Recorded by', code(row.actor))}${pair('Action', term(row.action))}${pair('Record state', term(row.state))}
    ${pair('Evidence currentness', term(row.evidence_status))}${pair('Evidence expiry', esc(row.expires_at ?? 'Not stated'))}
    ${pair('Original visibility', visibility(row.visibility))}${pair('Effective visibility', visibility(row.effective_visibility))}
    ${Object.hasOwn(r, 'reported_location') ? pair('Reported location', esc(r.reported_location ?? 'Unknown')) : ''}
    ${Object.hasOwn(r, 'model') ? pair('Exact model', modelPin(r.model)) : ''}
    ${Object.hasOwn(r, 'reported_count') ? pair('Reported count', esc(r.reported_count ?? 'Unknown')) : ''}
    ${target ? pair('Target record and exact revision', link(workspace(org.id, target.record_id), target.record_id) + ' · ' + code(target.revision_id)) : ''}
    ${r.record_type === 'configuration' ? pair('Fitted modules', r.fitted_modules ? `${term(r.fitted_modules.coverage)} coverage · ${r.fitted_modules.items.map(m => `${esc(m.module_id)}: ${term(m.state)}`).join('; ')}` : 'Unknown') : ''}
    ${r.record_type === 'configuration' ? pair('Operating limits', r.operating_envelopes ? `${r.operating_envelopes.length} joint envelope(s); see exact revision` : 'Unknown') : ''}
    ${r.record_type === 'assertion' ? pair('Outcome and state', term(r.outcome) + ' · ' + term(r.state)) + pair('Provider authority', 'Unverified') + (packet ? '' : pair('Statement', esc(r.statement ?? 'Not stated'))) : ''}
    ${serviceSummary(row, org.id)}${installationSummary(row, org.id)}
    ${pair('Use rights declared', ['discovery', 'assessment', 'republication'].map(k => k + ': ' + term(w.use_rights[k])).join(' · '))}
    ${pair('Rights basis', esc(w.use_rights.basis ?? 'Not stated'))}</dl>
    <h4>Dated sources</h4>${w.sources.length ? `<ol>${w.sources.map(s => `<li>${esc(s.source.url)}<small>${esc(s.observed_at)} · ${term(s.visibility)} · ${esc(s.source.namespace)} / ${esc(s.source.native_id)}</small></li>`).join('')}</ol>` : '<p class="sub">No source recorded.</p>'}
    ${packet ? roarEvidence(packet) : ''}
    ${exactData('Exact revision, source rights and evidence', w)}`;
}
function historyView(host, org, url, unavailable) {
  host.innerHTML = '<div data-list></div><div data-pages>' + btn('Load exact history', 'load') + '</div>' + feedback;
  const list = host.querySelector('[data-list]'), pages = host.querySelector('[data-pages]');
  let after = null;
  actions(host, scoped(host, async () => {
    const {history, next_after} = await getPage(url + '/history', after);
    if (!live(host)) return;
    list.insertAdjacentHTML('beforeend', history.map(row => `<details class="card"><summary>${esc(row.record.recorded_at)} · ${term(row.action)} · ${code(row.record.revision_id)}</summary>
      <h4>${esc(titleOf(row))}</h4>${revisionSummary(row, org)}</details>`).join(''));
    after = next_after;
    pages.innerHTML = after ? btn('More revisions', 'load') : '';
  }, {failure: unavailable}));
}
function claimsView(host, org, url, unavailable) {
  host.innerHTML = btn('Load related assertions', 'load') + feedback + '<div data-list></div>';
  actions(host, scoped(host, async () => {
    const data = await api(url + '/claims');
    if (!live(host)) return;
    host.querySelector('[data-list]').innerHTML = `<p class="sub">Provider authority is unverified. Conflicting reports are retained without resolving which is true.</p>
      ${data.conflicts.length ? `<p class="notice">Opposing current claims: ${data.conflicts.map(term).join(', ')}</p>` : ''}
      ${data.claims.length ? `<ul>${data.claims.map(row => `<li>${link(workspace(org.id, row.record.record_id), titleOf(row))}
      · ${term(row.record.record.outcome)} · ${term(row.evidence_status)} · ${row.target_current ? 'current target revision' : 'historical target revision'}</li>`).join('')}</ul>` : '<p class="sub">No visible assertions.</p>'}`;
  }, {failure: unavailable}));
}
function assessmentsView(host, url, unavailable) {
  host.innerHTML = '<div data-pages>' + btn('Check dependent assessments', 'load') + '</div>' + feedback + '<div data-list></div><details><summary>Retrieve a private service request</summary><div data-request-readback></div></details>';
  mountDraftReadback(host.querySelector('[data-request-readback]'), url, live);
  const list = host.querySelector('[data-list]'), pages = host.querySelector('[data-pages]');
  let after = null;
  actions(host, scoped(host, async () => {
    const suffix = after === null ? '' : '&after=' + encodeURIComponent(after);
    const {assessments, next_after} = await api(url + '/assessments?limit=25' + suffix);
    if (!live(host)) return;
    if (after === null && !assessments.length) list.innerHTML = '<p class="sub">No dependent assessments are visible in this workspace.</p>';
    list.insertAdjacentHTML('beforeend', assessments.map(a => `<details class="card">
      <summary>${a.current === null ? 'Currentness private' : a.current ? 'Current' : 'Needs recheck'} · ${code(a.id)}</summary><p>Saved ${esc(a.created_at)}</p>
      ${a.match ? `<p>Saved service assessment · ${term(a.match.result.route)}</p>
        ${a.match.refresh ? '<p>Refreshed from ' + code(a.match.refresh.prior_id) + ' with reviewed training evidence ' + code(a.match.refresh.answer.revision_id) + '.</p>' : ''}
        ${exactData('Original private inputs and assessment', a.match)}
        <div data-request-assessment="${esc(a.id)}"></div>` : ''}
      <ul>${a.dependencies.map(d => d.status === 'unavailable' ? '<li>Unavailable dependency</li>' :
        `<li>${term(d.status)} · record ${code(d.reference.record_id)} · pinned ${code(d.reference.revision_id)} · head ${code(d.current_head.revision_id)}</li>`).join('')}</ul></details>`).join(''));
    for (const assessment of assessments.filter(a => a.match)) {
      const draft = list.querySelector(`[data-request-assessment="${CSS.escape(assessment.id)}"]`);
      mountRequestDraft(draft, url, assessment, live);
    }
    after = next_after;
    pages.innerHTML = after ? btn('More dependent assessments', 'load') : '';
  }, {failure: unavailable}));
}

function ownerTools(host, org, unavailable) {
  const url = path(org.id);
  host.innerHTML = `<h3>Members and private backup</h3>
    <p class="sub">Assign a role only to the exact canonical Planner user ID supplied by that person. This does not send an invitation or grant private lab access.</p>
    <form class="row"><label>Canonical Planner user ID<input name="user_id" required maxlength="200"></label>
      <label>Registry role<select name="role" aria-label="Registry role"><option value="editor">Editor</option><option value="reviewer">Reviewer</option><option value="">Revoke access</option></select></label>
      <button class="btn" type="submit">Save membership</button></form>
    ${feedback}<div data-members></div><p class="sub">The owner backup contains private and restricted evidence. Store it in protected storage.</p>
    ${btn('Download private backup', 'backup')}`;
  const members = host.querySelector('[data-members]'), form = host.querySelector('form');
  async function load() {
    const data = await api(url + '/members');
    if (live(host)) members.innerHTML = `<ul>${data.members.map(m => `<li>${code(m.user_id)} · ${term(m.role)} · updated ${esc(m.updated_at)}</li>`).join('')}</ul>`;
  }
  const execute = scoped(host, async action => {
    if (action === 'backup') {
      const archive = await api(url + '/backup');
      if (live(host)) download('planner-registry-' + org.id + '.json', pretty(archive));
    } else {
      if (action === 'save') {
        await send(url + '/members', {user_id: form.elements.user_id.value.trim(), role: form.elements.role.value || null});
        form.reset();
      }
      await load();
    }
  }, {failure: unavailable});
  actions(host, execute);
  form.onsubmit = event => { event.preventDefault(); execute('save'); };
  execute('load');
}
function sharingView(host, row, url, refresh, unavailable, canChange) {
  host.innerHTML = '<h3>Sharing and publication</h3><p class="sub">Reading current policy…</p>';
  const changed = error => {
    if (unavailable(error)) return true;
    if (error.status === 409) {
      const status = host.querySelector('[data-status]');
      status.textContent = message(error) + ' Reload the record before previewing or changing sharing.';
      status.hidden = false;
      return true;
    }
    return false;
  };
  api(url + '/sharing').then(({sharing: policy}) => {
    if (!live(host)) return;
    if (policy.head.revision_id !== row.record.revision_id || policy.head.content_digest !== row.record.content_digest) {
      host.innerHTML = '<p class="notice bad">The record changed while reading sharing. Reload this record to continue.</p>';
      return;
    }
    const eligible = policy.eligible_fields;
    host.innerHTML = `<h3>Sharing and publication</h3>
      <p class="sub">Effective visibility: ${visibility(policy.effective_visibility)} · policy ${code(policy.policy_id ?? 'not set')}.</p>
      <p>Restrictions cover all revisions and linked records and remove any current publication. Lifting a restriction cannot widen the original visibility or republish the record.</p>
      <div class="reg-actions">${btn(policy.restricted ? 'Lift owner restriction' : 'Restrict to owners and reviewers', 'restrict')}
      ${policy.publication ? btn('Withdraw publication', 'withdraw') : ''}</div>
      <p>${policy.publication ? link(publicLink(row.record.record_id), 'View current public report') : 'There is no current public projection.'}</p>
      ${eligible ? `<fieldset class="opts"><legend>Select optional public fields</legend>
        <p class="sub">Preview the exact server projection before publishing. Select up to five eligible dated source links. The required label will also be public.</p>
        ${eligible.reported_count ? '<label class="inline"><input type="checkbox" name="count"> Reported group count</label>' : ''}
        ${eligible.sources.map(s => `<label class="reg-choice"><input type="checkbox" name="source" value="${esc(s.index)}"><span>${esc(s.url)} · ${esc(s.observed_at)}</span></label>`).join('')}
        ${!eligible.reported_count && !eligible.sources.length ? '<p>No optional fields are eligible.</p>' : ''}</fieldset>
        <div class="reg-actions">${btn('Preview public fields', 'preview')} <button type="button" class="btn" data-action="publish" disabled>Publish this exact preview</button></div>` :
        '<p class="sub">Preview requires a current reviewed public candidate with dated public sources and declared discovery and republication rights. Restricted records, configurations and assertions cannot be published.</p>'}
      ${feedback}<div data-preview></div>`;
    const pins = {expected_head: policy.head, expected_policy_id: policy.policy_id};
    const preview = host.querySelector('[data-preview]'), publish = host.querySelector('[data-action=publish]');
    const selection = () => ({reported_count: Boolean(host.querySelector('[name=count]:checked')),
      source_indices: [...host.querySelectorAll('[name=source]:checked')].map(c => Number(c.value))});
    let approved = null, changedSelection = 0;
    const revoke = () => { changedSelection++; approved = null; preview.replaceChildren(); if (publish) publish.disabled = true; };
    host.onchange = revoke;
    actions(host, scoped(host, async action => {
      if (action !== 'preview' && !canChange()) return;
      if (action === 'preview') {
        revoke();
        const version = changedSelection, fields = selection();
        if (fields.source_indices.length > 5) throw Error('Select at most five source links.');
        const {publication} = await send(url + '/publication-preview', {...pins, fields});
        if (!live(host) || version !== changedSelection) return;
        approved = fields;
        preview.innerHTML = '<h4>Server preview · private until published</h4>' + projection(publication, true);
      } else if (action === 'publish') {
        if (!approved) return;
        const fields = approved;
        revoke();
        await send(url + '/publication', {...pins, fields, publish: true});
        refresh('Published the selected fields.');
      } else if (action === 'withdraw') {
        revoke();
        await send(url + '/publication', {...pins, publish: false});
        refresh('Withdrew the public report.');
      } else if (action === 'restrict') {
        revoke();
        await send(url + '/sharing', {...pins, restricted: !policy.restricted});
        refresh(policy.restricted ? 'Lifted the owner restriction.' : 'Applied the owner restriction.');
      }
    }, {failure: changed, again: () => { if (publish) publish.disabled = !approved; }}));
  }).catch(error => { if (live(host) && !unavailable(error)) host.innerHTML = err(error); });
}

async function recordView(host, org, id, refresh, unavailable, loadTargets, ctx) {
  const url = path(org.id, '/records/' + id);
  const {revision: row} = await api(url);
  if (!live(host)) return;
  const retired = row.state === 'retired', canReview = org.role !== 'editor';
  const canWrite = org.role === 'owner' || (org.role === 'reviewer' ? row.visibility === 'restricted' : row.visibility !== 'restricted');
  const kind = row.record.record.record_type, assertion = kind === 'assertion', offer = kind === 'offer';
  const installation = kind === 'installation', duplicate = row.installation_event?.action === 'duplicate_link';
  const serviceClaim = serviceClaims.includes(kind), assessable = offer && row.service?.kind !== 'facility_default';
  const reviewable = !retired && !['expired', 'withdrawn', 'superseded'].includes(row.evidence_status);
  host.innerHTML = `<section class="card"><h3>Current revision · ${esc(titleOf(row))}</h3>
    ${revisionSummary(row, org)}</section>
    <section data-lifecycle><h3>Review and corrections</h3>
      <p class="sub">${canReview ? 'Review records an evidence check; it does not verify institutional or provider authority.' : 'Only an owner or reviewer can review evidence.'}
      ${canWrite ? '' : 'Your reviewer role can correct or retire only records created as restricted.'}
      ${duplicate ? 'The owner can remove the duplicate link in the reconciliation section.' : retired ? 'Restore this record before making another change.' : !reviewable ? 'Recheck the source dates or assertion state before reviewing.' : ''}</p>
      <div class="reg-actions">
      ${canWrite && !retired ? btn('Start correction', 'correct') : ''}
      ${canReview && reviewable ? btn('Record evidence review', 'review') : ''}
      ${canReview && (assertion || serviceClaim || offer) && reviewable ? btn('Mark review disputed', 'review_disputed') : ''}
      ${canReview && offer && !retired && row.record.record.state !== 'withdrawn' ? btn('Withdraw offer', 'withdraw') : ''}
      ${canReview && assertion && !retired && !['withdrawn', 'superseded'].includes(row.record.record.state) ?
        btn('Withdraw assertion', 'withdraw') + btn('Supersede assertion', 'supersede') : ''}
      ${canWrite && !duplicate ? btn(retired ? 'Restore record' : serviceClaim ? 'Withdraw report' : 'Retire record', retired ? 'restore' : 'retire') : ''}
      ${btn('Reload current revision', 'reload')}</div>${feedback}</section><div data-editor></div>
    ${installation ? '<section class="card" data-installation></section>' : ''}
    ${installation && row.evidence_status === 'current' ? '<details class="card" data-planning></details>' : ''}
    ${installation || kind === 'configuration' ? '<section class="card" data-survey></section>' : ''}
    ${assessable ? '<section><h3>Assess this service</h3><div data-match></div></section>' : ''}
    <section><h3>Revision history</h3><div data-history></div></section>
    ${assertion ? '' : '<section><h3>Evidence assertions</h3><div data-claims></div></section>'}
    ${org.role === 'owner' ? '<section class="card" data-sharing></section>' : '<p class="sub">Only a registry owner can manage disclosure or publication.</p>'}`;
  const lifecycle = host.querySelector('[data-lifecycle]'), editor = host.querySelector('[data-editor]');
  const onConflict = async () => {
    try {
      const {revision} = await api(url);
      return live(host) ? revision : null;
    } catch (error) { if (live(host)) unavailable(error); return null; }
  };
  const save = async payload => {
    if (!live(host)) return;
    try {
      await send(url + '/revisions', {...payload, expected_head: pin(row.record)});
      refresh('Saved a new revision.');
    } catch (error) { unavailable(error); throw error; }
  };
  actions(lifecycle, scoped(lifecycle, async (action, control) => {
    if (action === 'reload') {
      if (!editor.firstChild || confirm('Reload and discard the unsaved correction?')) refresh();
      return;
    }
    if (action === 'correct') {
      if (editor.firstChild) { editor.querySelector('input,select,textarea')?.focus(); return; }
      const {records, next_after} = await loadTargets(null);
      if (!live(host)) return;
      mountRecordForm(editor, {row, role: org.role, records, nextAfter: next_after, loadTargets, save, onConflict, organisation: org.id});
      editor.querySelector('input,select,textarea')?.focus();
      return;
    }
    if (editor.firstChild && !confirm('Apply this action and discard the unsaved correction if it succeeds?')) return;
    await send(url + '/revisions', {expected_head: pin(row.record), action});
    refresh(control.textContent + ' saved.');
  }, {failure: unavailable}));
  if (installation) mountInstallation(host.querySelector('[data-installation]'), {row, org, canWrite, url, send, get: api, loadTargets, live, unavailable, refresh});
  const planning = host.querySelector('[data-planning]');
  if (planning) mountRegistryPlanning(planning, {row, ctx, send: input => send(url + '/planning-v1', input), loadTargets, live, unavailable});
  if (installation || kind === 'configuration') mountOperatorSurvey(host.querySelector('section[data-survey]'), {
    row, org, pin: pin(row.record), get: () => api(url + '/survey'), send: payload => send(url + '/survey', payload), live, unavailable,
  });
  if (assessable) mountServiceMatch(host.querySelector('[data-match]'), {
    pin: pin(row.record), org: org.id, send: payload => send(url + '/match', payload),
    refresh: payload => send(url + '/refresh-matches', payload), live, onUnavailable: unavailable,
  });
  historyView(host.querySelector('[data-history]'), org, url, unavailable);
  if (!assertion) claimsView(host.querySelector('[data-claims]'), org, url, unavailable);
  if (org.role === 'owner') sharingView(host.querySelector('[data-sharing]'), row, url, refresh, unavailable,
    () => !editor.firstChild || confirm('Apply this sharing change and discard the unsaved correction if it succeeds?'));
}

async function privateView(host, ctx, orgId, item, refresh) {
  const body = host.querySelector('[data-content]');
  if (!ctx.account.user) {
    body.innerHTML = '<p class="empty">Sign in to open or create a registry workspace.</p>' + (ctx.account.available ? btn('Sign in to Planner', 'signin', true) : '');
    actions(body, () => ctx.account.signIn());
    return;
  }
  const unavailable = error => {
    if (![401, 404].includes(error.status)) return false;
    if (live(body)) { body.onclick = null; body.innerHTML = err(error); }
    return true;
  };
  const {user_id, organisations} = await api(root + '/organisations');
  if (!live(body)) return;
  if (!orgId) {
    body.innerHTML = `<p>Your canonical Planner user ID is ${code(user_id)}. Give this ID to a workspace owner to request access.</p>
      <p class="sub">Registry affiliation is unverified. Workspaces can share a name without sharing access or records.</p>
      <h3>Your workspaces</h3>${organisations.length ? organisations.map(o => `<article class="card">
        <h4>${link(workspace(o.id), o.name)}</h4><p class="sub">${term(o.role)} · unverified affiliation</p><small>${code(o.id)}</small></article>`).join('') :
        '<p class="empty">No registry memberships yet. Create a workspace or ask its owner to grant you access.</p>'}
      <form class="card"><h3>Create a workspace</h3><label>Organisation name<input name="name" required maxlength="160"></label>
        <button type="submit" class="btn">Create workspace</button>${feedback}</form>`;
    const form = body.querySelector('form');
    const create = scoped(form, async () => {
      const {organisation} = await send(root + '/organisations', {name: form.elements.name.value.trim()});
      if (live(body)) location.hash = workspace(organisation.id);
    });
    form.onsubmit = event => { event.preventDefault(); create(); };
    return;
  }
  const org = organisations.find(o => o.id === orgId);
  if (!org) throw Object.assign(Error(), {status: 404});
  const orgRoute = workspace(org.id), url = path(org.id);
  body.innerHTML = `<header class="card"><p class="sub">${link(workspace(), 'Your workspaces')}${item ? ' / ' + link(orgRoute, 'Workspace reports') : ''}</p>
    <h3>${esc(org.name)}</h3><p class="sub">${term(org.role)} · unverified affiliation</p>
    <dl>${pair('Canonical registry organisation ID', code(org.id))}${pair('Your Planner user ID', code(user_id))}</dl></header>
    <div data-work></div>`;
  const work = body.querySelector('[data-work]');
  const loadTargets = async after => {
    try { return await getPage(url + '/records', after); }
    catch (error) { unavailable(error); throw error; }
  };
  if (item === 'roar-import') {
    if (org.role !== 'owner') throw Object.assign(Error(), {status: 404});
    mountRoarImport(work, {route: orgRoute, send: (action, data) => send(url + '/roar-import/' + action, data), live});
  } else if (item === 'pilot' || item?.startsWith('pilot-')) {
    if (org.role === 'editor') throw Object.assign(Error(), {status: 404});
    const pilotUrl = url + '/pilot';
    await mountPilot(work, {id: item === 'pilot' ? '' : item.slice(6), route: orgRoute + '/pilot',
      get: suffix => api(pilotUrl + suffix), send: (suffix, data) => send(pilotUrl + suffix, data),
      live, loadTargets, unavailable, reload: refresh});
  } else if (item === 'new') {
    const {records, next_after} = await loadTargets(null);
    if (!live(work)) return;
    mountRecordForm(work, {role: org.role, records, nextAfter: next_after, loadTargets, organisation: org.id, save: async payload => {
      if (!live(work)) return;
      try {
        const {revision} = await send(url + '/records', payload);
        if (live(work)) location.hash = workspace(org.id, revision.record.record_id);
      } catch (error) { unavailable(error); throw error; }
    }});
  } else if (item) await recordView(work, org, item, refresh, unavailable, loadTargets, ctx);
  else {
    const first = await api(url + '/records');
    if (!live(work)) return;
    work.innerHTML = `<div class="reg-actions"><a href="${orgRoute}/new" class="btn">New equipment report</a>
      ${org.role === 'owner' ? `<a href="${orgRoute}/roar-import" class="btn ghost">Import ROAR reports</a>` : ''}
      ${org.role !== 'editor' ? `<a href="${orgRoute}/pilot" class="btn ghost">Pilot cohorts</a>` : ''}</div>
      <h3>Workspace reports</h3><p class="sub">Open an installation or configuration to start or resume its operator survey.</p><div data-records></div>
      <h3>Dependent assessments</h3><p class="sub">Check whether the pinned evidence is still current. This does not approve equipment or execution.</p><div data-assessments></div>
      ${org.role === 'owner' ? '<section class="card" data-owner></section>' : '<p class="sub">Only a registry owner can manage membership or download a private backup.</p>'}`;
    recordList(work.querySelector('[data-records]'), org, first, unavailable);
    assessmentsView(work.querySelector('[data-assessments]'), url, unavailable);
    if (org.role === 'owner') ownerTools(work.querySelector('[data-owner]'), org, unavailable);
  }
}

export function mountRegistry(el, ctx, {parts = []}, notice) {
  const [mode, id, item] = parts;
  const isPrivate = mode === 'workspace';
  const valid = !parts.length || mode === 'public' && parts.length === 2 && token.test(id) ||
    isPrivate && (parts.length === 1 || parts.length <= 3 && token.test(id) && (parts.length === 2 || token.test(item)));
  const host = document.createElement('section');
  host.className = 'pg';
  host.id = 'registry-workspace';
  host.dataset.route = location.hash;
  host.dataset.accountState = `${ctx.account.available}:${Boolean(ctx.account.user)}`;
  host.innerHTML = `<h2>Equipment registry</h2>
    <p class="lede">${isPrivate ? 'Contribute installation reports and review evidence in your organisation workspace.' :
      'Browse dated reports shared by contributors. A report does not verify custody, access, availability or permission to run equipment.'}</p>
    <nav class="reg-actions" aria-label="Registry"><a href="#registry" class="btn${isPrivate ? ' ghost' : ''}">Published reports</a>
      <a href="${workspace()}" class="btn${isPrivate ? '' : ' ghost'}">Contribution workspace</a>
      <a href="${roarDiscovery}" class="btn ghost" target="_blank" rel="noopener noreferrer">Atlas ROAR discovery</a></nav>
    ${notice ? `<p class="notice" role="status">${esc(notice)}</p>` : ''}
    <div data-content><p class="sub">Loading registry…</p></div>`;
  el.replaceChildren(host);
  const refresh = text => { if (live(host)) mountRegistry(el, ctx, {parts}, text); };
  const task = !valid ? Promise.reject(Object.assign(Error(), {status: 404})) :
    isPrivate ? privateView(host, ctx, id, item, refresh) : publicView(host, id);
  task.catch(error => { if (live(host)) host.querySelector('[data-content]').innerHTML = err(error); });
}
