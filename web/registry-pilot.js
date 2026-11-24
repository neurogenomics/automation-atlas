import {esc} from './store.js';
import {nameOf, pin, pretty} from './registry-form.js';

const input = (name, label, value = '', attrs = '') =>
  `<label>${label}<input name="${name}" value="${esc(value ?? '')}" ${attrs}></label>`;
const dateField = (name, label, value, required = false) => input(name, label, value, 'type="date"' + (required ? ' required' : ''));
const title = value => value.replaceAll('_', ' ');
const choice = (name, label, options, selected) => `<label>${label}<select name="${name}" aria-label="${label}">
  ${options.map(option => `<option value="${option}" ${selected === option ? 'selected' : ''}>${option ? title(option) : 'Choose an outcome'}</option>`).join('')}</select></label>`;
const controls = '<button type="submit" class="btn">Save</button> <button type="button" class="btn ghost" data-cancel>Cancel</button>';
const reason = input('reason', 'Reason for this change', '', 'maxlength="400" required');
const feedback = '<p class="notice bad" role="alert" hidden></p>';
const evidenceFields = (name, label, value) => input(name, label + ' evidence reference', value?.reference, 'maxlength="247"') +
  dateField(name + 'Date', label + ' evidence date', value?.observed_on);
const sections = {
  overlap: ['unchecked', 'clear', 'possible', 'duplicate'],
  referral: ['none', 'suggested', 'followed_up', 'closed'],
  access: ['unknown', 'reported_available', 'conditional', 'inaccessible'],
  support: ['unknown', 'reported_available', 'conditional', 'unavailable'],
};
const capitalize = value => value[0].toUpperCase() + value.slice(1);
const labels = {
  identified: 'Identified / registered leads', invited: 'Invited / identified',
  replied: 'Replies received / identified', reviewed: 'Operator reviewed / identified',
  verified: 'Platform evidence verified / reviewed', inaccessible: 'Reported inaccessible / identified',
  stale: 'Stale exact reviews / identified', response: 'Replies following invitation / invited',
};
const reviewLabels = {
  unverified: 'No exact Registry review',
  reviewed: 'Registry review current · pilot evidence incomplete',
  verified: 'Platform evidence verified',
  stale: 'Stale exact Registry review',
};
const decisionOutcomes = ['', 'changed', 'uncertainty_resolved', 'no_change'];
const factsLimit = 12;

function cohortForm(cohort = {}) {
  return `<form class="card"><h4>${cohort.cohort_id ? 'Edit cohort scope' : 'Create a bounded cohort'}</h4><fieldset>
    ${input('name', 'Cohort name', cohort.name, 'required maxlength="120"')}
    ${input('scope', 'Sampling frame', cohort.scope, 'required maxlength="400"')}
    ${dateField('starts_on', 'Identification window starts', cohort.starts_on, true)}
    ${dateField('ends_on', 'Identification window ends', cohort.ends_on, true)}
    <label>Required evidence checklist<textarea name="checklist" rows="4" maxlength="1600" aria-describedby="pilot-checklist-help">${esc(
      (cohort.required_facts ?? []).map(({kind, label}) => kind + ': ' + label).join('\n'))}</textarea></label>
    <p class="sub" id="pilot-checklist-help">One module: name or interface: name per line, up to 12. Use the same fact names on each lead.</p>
    ${reason}${controls}</fieldset>${feedback}</form>`;
}
function factRow(fact = {}) {
  return `<fieldset data-fact><legend>Required fact</legend>
    ${choice('kind', 'Fact kind', ['module', 'interface'], fact.kind)}
    ${input('label', 'Fact name', fact.label, 'maxlength="120" required')}
    ${choice('state', 'Fact evidence state', ['unknown', 'reported_present', 'reported_absent'], fact.state)}
    ${evidenceFields('fact', 'Fact', fact.evidence)}
    <button type="button" class="btn ghost" data-remove>Remove fact</button></fieldset>`;
}
function leadForm(lead, previous) {
  return `<form class="card"><h4>${previous ? 'Edit pilot lead' : 'Register a private lead'}</h4><fieldset data-fields>
    ${input('label', 'Private lead label', lead.label, 'required maxlength="120"')}
    ${dateField('identified_on', 'Identified date', lead.identified_on, true)}
    ${dateField('invited_on', 'Invited date', lead.invited_on)}
    ${dateField('replied_on', 'Reply received date', lead.replied_on)}
    ${dateField('reviewed_on', 'Operator review date', lead.reviewed_on)}
    <p class="sub">Record evidence using a protected ref: identifier or a sha256: digest and its observation date.</p>
    <details ${lead.responsible || lead.steward ? 'open' : ''}><summary>Responsible person and steward consent</summary>
      ${input('responsible', 'Responsible person label', lead.responsible?.label, 'maxlength="120"')}
      ${choice('responsibleRole', 'Responsible role', ['owner', 'operator'], lead.responsible?.role)}
      ${evidenceFields('responsibleEvidence', 'Responsible role', lead.responsible?.evidence)}
      ${input('steward', 'Steward label', lead.steward?.label, 'maxlength="120"')}
      ${choice('consent', 'Reported steward consent', ['unknown', 'declined', 'attested'], lead.steward?.consent)}
      ${evidenceFields('stewardEvidence', 'Steward consent', lead.steward?.evidence)}
    </details>
    <details><summary>Overlap, referral, access and support</summary>
      ${Object.entries(sections).map(([key, options]) => choice(key, capitalize(key), options, lead[key]?.state) +
        evidenceFields(key + 'Evidence', capitalize(key), lead[key]?.evidence)).join('')}
    </details>
    <details><summary>Required module and interface facts</summary>
      <div data-facts>${(lead.facts ?? []).map(factRow).join('')}</div>
      <button type="button" class="btn ghost" data-add-fact>Add required fact</button>
    </details>
    <details><summary>Exact installation review and reconfirmation</summary>
      <p class="sub">Choose a current installation revision that has a dated evidence review. Keep the saved pin until a fresh review is available.</p>
      ${lead.review ? `<p>Saved revision <code>${esc(lead.review.pin.revision_id)}</code></p>` : ''}
      <label>Reviewed installation revision<select name="reviewPin" aria-label="Reviewed installation revision"><option value="">${lead.review ? 'Keep saved revision' : 'No pinned revision'}</option>${lead.review ? '<option value="clear">Remove incorrect pin</option>' : ''}</select></label>
      <button type="button" class="btn ghost" data-more>Load reviewed installations</button>
      <p class="sub" data-pins-status role="status"></p>
      ${dateField('expires_on', 'Reconfirm by date', lead.review?.expires_on)}
    </details>
    <details><summary>Before and after decision</summary>
      ${choice('outcome', 'Decision outcome', decisionOutcomes, lead.decision?.outcome)}
      ${dateField('decided_on', 'Decision date', lead.decision?.decided_on)}
      ${input('summary', 'Decision explanation', lead.decision?.summary, 'maxlength="400"')}
      ${evidenceFields('before', 'Before decision', lead.decision?.before)}
      ${evidenceFields('after', 'After decision', lead.decision?.after)}
    </details>
    ${reason}${controls}</fieldset>${feedback}</form>`;
}

const value = (node, name) => node.querySelector(`[name="${name}"]`).value.trim() || null;
const readEvidence = (node, name) => {
  const reference = value(node, name), observed_on = value(node, name + 'Date');
  return reference || observed_on ? {reference, observed_on} : null;
};
function readLead(form, lead, selected) {
  const dates = Object.fromEntries(['identified_on', 'invited_on', 'replied_on', 'reviewed_on'].map(key => [key, value(form, key)]));
  const read = key => value(form, key);
  const evidence = key => readEvidence(form, key);
  const option = key => ({state: read(key), evidence: evidence(key + 'Evidence')});
  const responsible = read('responsible'), steward = read('steward'), outcome = read('outcome');
  const pinChoice = read('reviewPin');
  const target = pinChoice === 'clear' ? null : selected.get(pinChoice) ?? lead.review?.pin;
  return {id: lead.id, label: read('label'), ...dates,
    responsible: responsible || evidence('responsibleEvidence') ? {label: responsible, role: read('responsibleRole'), evidence: evidence('responsibleEvidence')} : null,
    steward: steward || evidence('stewardEvidence') || read('consent') !== 'unknown' ?
      {label: steward, consent: read('consent'), evidence: evidence('stewardEvidence')} : null,
    ...Object.fromEntries(Object.keys(sections).map(key => [key, option(key)])),
    facts: [...form.querySelectorAll('[data-fact]')].map(row =>
      ({kind: value(row, 'kind'), label: value(row, 'label'), state: value(row, 'state'), evidence: readEvidence(row, 'fact')})),
    review: pinChoice !== 'clear' && (target || read('expires_on')) ? {pin: target ?? null, expires_on: read('expires_on')} : null,
    decision: outcome || read('decided_on') || read('summary') || evidence('before') || evidence('after') ?
      {outcome, decided_on: read('decided_on'), summary: read('summary'), before: evidence('before'), after: evidence('after')} : null};
}

export async function mountPilot(host, {id, route, get, send, live, loadTargets, unavailable, reload}) {
  const url = id ? '/' + id : '';
  const data = await get(url);
  if (!live(host)) return;
  const cohort = data.cohort;
  const parent = `<a href="${esc(route)}">Pilot cohorts</a>`;
  host.innerHTML = `<section><h3>${cohort ? esc(cohort.name) : 'Private pilot cohorts'}</h3>
    <p class="sub">Visible to this workspace’s registry owners and reviewers. Consent and access are reported. Institutional and provider authority are unverified.</p>
    ${cohort ? `${parent}<p>${esc(cohort.scope)} · ${esc(cohort.starts_on)} to ${esc(cohort.ends_on)}</p>
    <p class="sub">As of ${esc(cohort.as_of.slice(0, 19).replace('T', ' '))} UTC. A reply received before an invitation counts as received. Only replies following an invitation count toward the response rate.</p>
    <p class="sub">${cohort.required_facts.length ? 'Required evidence: ' + cohort.required_facts.map(({kind, label}) =>
      esc(kind + ' · ' + label)).join(', ') : 'No required evidence checklist is declared. Leads need a checklist to reach platform verification.'}</p>
    <dl>${Object.entries(labels).map(([key, label]) => {
      const [numerator, denominator] = cohort.metrics[key];
      const rate = ['verified', 'response'].includes(key) && denominator ? ` (${Math.round(numerator * 100 / denominator)}%)` : '';
      return `<dt>${label}</dt><dd><span data-metric="${key}">${numerator} / ${denominator}</span>${rate}</dd>`;
    }).join('')}</dl>
    <div class="reg-actions"><button type="button" class="btn ghost" data-scope>Edit cohort scope</button>
    <button type="button" class="btn" data-lead="" ${cohort.leads.length >= 24 ? 'disabled' : ''}>Register lead</button>
    <button type="button" class="btn ghost" data-history>Correction history</button></div>
    <div data-history-list></div>
    <div data-leads>${cohort.leads.map(lead => `<article class="card">
      <h4>${esc(lead.label)}</h4><p>${lead.reviewed_on ? 'Operator reviewed' : lead.replied_on ? 'Reply received' : lead.invited_on ? 'Invited' : 'Identified'} ·
      <strong>${reviewLabels[lead.review_status]}</strong>${lead.review_condition ? ` · ${esc(lead.review_condition)}` : ''} · access ${title(lead.access.state)} · support ${title(lead.support.state)}</p>
      ${lead.outstanding_facts.length ? `<p>Required evidence outstanding: ${lead.outstanding_facts.map(({kind, label}) =>
        esc(kind + ' · ' + label)).join(', ')}</p>` : ''}
      ${lead.decision ? `<p>Decision ${title(lead.decision.outcome)} · ${esc(lead.decision.summary)}</p>` : ''}
      <button type="button" class="btn ghost" data-lead="${esc(lead.id)}">Edit lead</button>
    </article>`).join('')}</div>` :
    `${data.cohorts.map(item => `<article class="card"><h4><a href="${esc(route + '-' + item.cohort_id)}">${esc(item.name)}</a></h4>
      <p>${esc(item.starts_on)} to ${esc(item.ends_on)}</p></article>`).join('')}
      <button type="button" class="btn" data-scope ${data.cohorts.length >= 8 ? 'disabled' : ''}>New pilot cohort</button>`}
    <div data-editor></div>${feedback}</section>`;
  const editor = host.querySelector('[data-editor]');
  const snapshot = cohort && {name: cohort.name, scope: cohort.scope, starts_on: cohort.starts_on, ends_on: cohort.ends_on,
    required_facts: cohort.required_facts, leads: cohort.leads.map(({review_status, review_condition, outstanding_facts, ...lead}) => lead)};
  const reportError = (container, error) => {
    if (!live(container) || unavailable(error)) return;
    const alert = container.querySelector('[role="alert"]');
    alert.textContent = error.message;
    alert.hidden = false;
  };
  const open = (html, assemble, setup) => {
    if (editor.firstChild && !window.confirm('Discard the unsaved pilot edit?')) return;
    editor.innerHTML = html;
    const form = editor.querySelector('form'), fieldset = form.querySelector('fieldset');
    form.querySelector('input').focus();
    form.querySelector('[data-cancel]').onclick = () => editor.replaceChildren();
    setup?.(form);
    form.onsubmit = async event => {
      event.preventDefault();
      if (fieldset.disabled || !live(form)) return;
      const next = assemble(form);
      fieldset.disabled = true;
      try {
        const result = await send(url, {expected_version: cohort?.version ?? null, reason: value(form, 'reason'), snapshot: next});
        if (!live(form)) return;
        if (cohort) reload('Saved a private pilot revision.');
        else location.hash = route + '-' + result.cohort_id;
      } catch (error) { reportError(form, error); }
      finally { fieldset.disabled = false; }
    };
  };
  host.querySelector('[data-scope]').onclick = () => open(cohortForm(cohort), form => ({
    ...Object.fromEntries(['name', 'scope', 'starts_on', 'ends_on'].map(key => [key, value(form, key)])),
    required_facts: (value(form, 'checklist') ?? '').split('\n').map(line => line.trim()).filter(Boolean).map(line => {
      const separator = line.indexOf(':');
      return separator < 0 ? {kind: '', label: line} : {kind: line.slice(0, separator).trim(), label: line.slice(separator + 1).trim()};
    }),
    leads: snapshot?.leads ?? [],
  }));
  for (const button of host.querySelectorAll('[data-lead]')) button.onclick = () => {
    const previous = snapshot.leads.find(lead => lead.id === button.dataset.lead), lead = previous ?? {id: crypto.randomUUID()};
    const selected = new Map();
    open(leadForm(lead, previous), form => {
      const updated = readLead(form, lead, selected);
      return {...snapshot, leads: previous ? snapshot.leads.map(l => l.id === lead.id ? updated : l) : [...snapshot.leads, updated]};
    }, form => {
      const facts = form.querySelector('[data-facts]');
      form.querySelector('[data-add-fact]').onclick = () => {
        if (facts.children.length < factsLimit) facts.insertAdjacentHTML('beforeend', factRow());
      };
      facts.onclick = event => { if (event.target.matches('[data-remove]')) event.target.closest('[data-fact]').remove(); };
      const more = form.querySelector('[data-more]'), picker = form.querySelector('[name="reviewPin"]');
      let after = null;
      more.onclick = async () => {
        more.disabled = true;
        try {
          const {records, next_after} = await loadTargets(after);
          if (!live(form)) return;
          for (const row of records) if (row.record.record.record_type === 'installation' && row.action === 'review' &&
            row.evidence_status === 'current' && row.record.sources.length) {
            const ref = pin(row.record);
            selected.set(ref.revision_id, ref);
            picker.add(new Option(nameOf(row.record) + ' · ' + ref.revision_id, ref.revision_id));
          }
          after = next_after;
          form.querySelector('[data-pins-status]').textContent = selected.size ?
            selected.size + ' eligible installation revisions loaded.' : after ?
              'This page has no eligible installation reviews.' : 'No current, source-backed installation reviews are available.';
          more.hidden = !after;
          more.textContent = 'Load more reviewed installations';
        } catch (error) { reportError(form, error); }
        finally { more.disabled = false; }
      };
    });
  };
  if (cohort) {
    const panel = host.querySelector('[data-history-list]');
    const history = async (before = null) => {
      const {history, next_before} = await get(url + '/history' + (before ? '?before=' + before : ''));
      if (!live(panel)) return;
      panel.querySelector('[data-more-history]')?.remove();
      panel.insertAdjacentHTML('beforeend', history.map(r =>
        `<details data-version="${esc(r.version)}"><summary>Revision ${r.seq} · ${esc(r.saved_at.slice(0, 10))} · ${esc(r.reason)}</summary><pre></pre></details>`).join('') +
        (next_before ? '<button type="button" class="btn ghost" data-more-history>More history</button>' : ''));
      for (const detail of panel.querySelectorAll('details')) detail.ontoggle = async () => {
        const content = detail.querySelector('pre');
        if (!detail.open || content.textContent) return;
        try {
          const {revision} = await get(url + '/history?version=' + detail.dataset.version);
          if (live(detail)) content.textContent = pretty(revision.snapshot);
        } catch (error) { reportError(host, error); }
      };
      const more = panel.querySelector('[data-more-history]');
      if (more) more.onclick = async () => {
        more.disabled = true;
        try { await history(next_before); } catch (error) { reportError(host, error); more.disabled = false; }
      };
    };
    const button = host.querySelector('[data-history]');
    button.onclick = async () => {
      button.disabled = true;
      try { await history(); } catch (error) { reportError(host, error); button.disabled = false; }
    };
  }
}
