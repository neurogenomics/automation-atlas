import {esc} from './store.js';
import {contactRoles, readNativeRef} from './registry-service-form.js';

const words = s => esc(s?.replaceAll('_', ' ') ?? 'unknown');
const pair = (label, value) => `<dt>${label}</dt><dd>${value}</dd>`;
const code = s => `<code>${esc(s)}</code>`;
const token = /^[a-z0-9-]{1,128}$/;
const refLink = (ref, org) => ref && token.test(ref.record_id) && token.test(org) ?
  `<a href="#registry/workspace/${org}/${ref.record_id}">${code(ref.record_id)}</a> · ${code(ref.revision_id)}` : 'Unknown';
const native = ref => ref ? esc(ref.namespace + ' / ' + ref.native_id + (ref.version ? ' · ' + ref.version : '')) : 'Unknown';
const list = refs => refs === null ? 'Unknown' : refs.length ? refs.map(native).join('; ') : 'None listed';

export function serviceSummary(row, org) {
  const r = row.record.record;
  if (r.record_type === 'offer') {
    const p = r.access_policy, contacts = row.service?.contacts ?? {};
    return `${pair('Report purpose', words(row.service?.kind ?? 'service'))}${pair('Listing state', words(r.state))}
      ${pair('Reported provider', native(r.provider))}${pair('Reported methods', list(r.terms.methods))}
      ${pair('Accepted inputs', list(r.terms.accepted_inputs))}${pair('Excluded materials', list(r.material_exclusions))}
      ${pair('Output deliverables', list(r.terms.output_deliverables))}
      ${pair('Delivery modes', r.terms.delivery_modes?.map(words).join('; ') ?? 'Unknown')}
      ${pair('Reported price', r.terms.price ? [words(r.terms.price.basis), esc(r.terms.price.amount),
        esc(r.terms.price.currency), esc(r.terms.price.details)].filter(Boolean).join(' · ') : 'Unknown')}
      ${pair('Reported lead time', r.terms.lead_times?.map(l => words(l.bound) + ': ' +
        (typeof l.duration.value === 'string' ? esc(l.duration.value) : l.duration.value === null ? 'Unknown' :
          esc(l.duration.value.numerator + '/' + l.duration.value.denominator)) + ' ' + esc(l.duration.unit)).join('; ') ?? 'Unknown')}
      ${pair('Backing installations', r.backing_installations?.map(ref => refLink(ref, org)).join('<br>') || 'None pinned')}
      ${pair('Backing configurations', r.backing_configurations?.map(ref => refLink(ref, org)).join('<br>') || 'None pinned')}
      ${pair('Policy revision', p ? native(p.revision.source) + ' · ' + code(p.revision.content_digest) : 'Unknown')}
      ${pair('Facility default reference', p?.facility_default ? native(p.facility_default.source) + ' · ' + code(p.facility_default.content_digest) : 'None stated')}
      ${pair('Policy effective dates', p ? esc(p.effective_from ?? 'Start unknown') + ' through ' + esc(p.effective_until ?? 'No stated end') : 'Unknown')}
      ${Object.entries(contactRoles).map(([role, label]) => pair(label + ' (reported)', esc(contacts[role] ?? 'Unknown'))).join('')}
      ${pair('Provider authority', 'Unverified')}`;
  }
  if (r.record_type === 'access_claim') return pair('Subject scope', words(r.subject.kind)) +
    (r.subject.kind === 'principal' ? pair('Exact principal', code(r.subject.id)) : '') +
    pair('Reported access', words(r.dimension) + ': ' + words(r.outcome)) + pair('Provider authority', 'Unverified');
  if (r.record_type === 'availability_claim') return pair('Reported availability', words(r.state)) +
    pair('Reported window', r.window ? esc(r.window.starts_at) + ' to ' + esc(r.window.ends_at) : 'Unknown') +
    pair('Provider authority', 'Unverified');
  return '';
}

const routes = {
  withdrawn: 'This offer was withdrawn',
  retired: 'This offer was retired',
  outside_reported_policy: 'The requested method or material is outside the reported policy',
  policy_or_evidence_needs_recheck: 'Policy or backing evidence needs recheck',
  reported_access_denied: 'A report indicates access is denied',
  reported_policy_incomplete: 'Reported policy is incomplete for this request',
  no_joint_fit: 'No single configuration meets the requested limits',
  technical_fit_unknown: 'Technical fit remains unknown',
  reported_fit_access_unverified: 'Technical fit is reported; access is unverified',
};
function providerLink({kind, url}) {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' && !u.username && !u.password && !/[?#\\]/.test(url)) return `<li><a href="${esc(u.href)}"
      target="_blank" rel="noopener noreferrer">Open provider ${words(kind)} page</a></li>`;
  } catch {}
  return '';
}
const proof = r => `${words(r.dimension)}: ${words(r.outcome)} · ${words(r.scope)} · ${words(r.status)} · observed ${esc(r.observed_at)}
  ${r.valid_until ? ' · expires ' + esc(r.valid_until) : ''}${r.window ? ' · window ' + esc(r.window.starts_at) + ' to ' + esc(r.window.ends_at) : ''}`;
function explanation(result, org) {
  return `<article class="card"><h4>${esc(routes[result.route] ?? result.route)}</h4>
    <p class="sub">This compares the requested points within one reported envelope using evidence visible to your role. It does not verify fitted modules. Access, training and availability are separate. Provider authority is unverified; no execution or booking has been authorized.</p>
    <dl>${pair('Technical fit', words(result.technical_fit))}${pair('Requested method', words(result.method))}
      ${pair('Requested material', words(result.material))}${pair('Access reports', words(result.access))}
      ${pair('Offer policy date status', words(result.policy.status))}
      ${pair('Offer policy revision', native(result.policy.offer?.revision.source))}
      ${pair('Facility default status', words(result.policy.facility_default_status))}
      ${result.policy.facility_default ? pair('Local default and exact revision', refLink(result.policy.facility_default, org)) : ''}
      ${pair('Policy rule sources', Object.entries(result.policy.fields).map(([k, v]) => words(k) + ': ' + words(v)).join(' · '))}</dl>
    <p class="sub">${esc(result.policy.precedence)}</p>
    <h5>Backing alternatives</h5>
    ${result.configurations.length ? `<ul>${result.configurations.map(c => `<li>${c.configuration ? refLink(c.configuration, org) : 'No exact configuration'}
      · installation ${refLink(c.installation, org)} · ${words(c.technical_fit)} · access ${words(c.access_status)}${c.reason ? ' · ' + words(c.reason) : ''}
      ${c.envelopes.length ? `<ul>${c.envelopes.map(e => `<li>${code(e.id)}: ${words(e.status)}</li>`).join('')}</ul>` : ''}</li>`).join('')}</ul>` :
      '<p class="sub">No exact backing resources were reported.</p>'}
    <h5>Reported access and availability by target</h5>
    ${result.evidence.map(e => `<details${e.target.record_id === result.offer.record_id ? ' open' : ''}><summary>${e.target.record_id === result.offer.record_id ? 'Offer evidence' : 'Backing evidence'} · ${code(e.target.record_id)}</summary>
      <dl>${Object.entries(e.dimensions).map(([k, v]) => pair(words(k), words(v.reported_status))).join('')}</dl>
      ${e.reports.length ? `<ul>${e.reports.map(r => `<li>${refLink(r.reference, org)} · ${proof(r)}${r.assertions.length ?
        `<ul>${r.assertions.map(a => `<li>Supporting assertion ${refLink(a.reference, org)} · ${words(a.outcome)} · ${words(a.status)}</li>`).join('')}</ul>` : ''}</li>`).join('')}</ul>` : '<p class="sub">No applicable visible reports.</p>'}</details>`).join('')}
    ${result.enquiry_routes?.length ? `<h5>Reported provider pages</h5><ul>${result.enquiry_routes.map(providerLink).join('')}</ul>` : ''}
    <button type="button" class="btn ghost" data-draft>Prepare a local enquiry draft</button>
    <div data-enquiry></div></article>`;
}

function effect(x) {
  return [
    'Decision: ' + esc(routes[x.route] ?? x.route),
    'Technical fit: ' + words(x.technical_fit),
    x.method !== undefined ? 'Method: ' + words(x.method) : '',
    x.material !== undefined ? 'Material: ' + words(x.material) : '',
    'Access: ' + words(x.access),
    x.configuration_fit ? 'Configuration: ' + words(x.configuration_fit) : '',
    x.reported_status ? 'Reported status: ' + words(x.reported_status) : '',
    x.training ? 'Training: ' + words(x.training) : '',
  ].filter(Boolean).join(' · ');
}
function impactView(questions, answers, org) {
  return `<section class="card"><h4>Questions that could change this assessment</h4>
    <p class="sub">These are hypothetical comparisons on the exact visible evidence. They do not add an answer or appear in an operator’s general inventory survey.</p>
    ${questions.length ? questions.map(q => `<details><summary>${esc(q.question)}${q.changes_route ? ' · may change the decision' : ''}</summary>
      <p>Who can answer: ${esc(q.who)}. ${esc(q.scope)}.</p><p>${esc(q.why)}</p>
      <p>Current: ${effect(q.before)}</p>
      <ul>${q.alternatives.map(a => '<li>' + esc(a.label) + ': ' + effect(a.consequence) + '</li>').join('')}</ul></details>`).join('') :
      '<p>No supported follow-up was found on the current evidence. Unanswered inputs remain unknown.</p>'}
    <h4>Apply a reviewed training answer</h4>
    <p>Use a dated access report about training for this exact offer. Record its evidence review on the report page, then rerun this fit check.
      Refreshing saves new results for your own affected captures and retains their original inputs and results.</p>
    ${answers.length ? `<label>Reviewed training answer<select data-training-answer>${answers.map((a, i) =>
      `<option value="${i}">${words(a.outcome)} · ${esc(a.observed_at)} · ${esc(a.reference.revision_id)}</option>`).join('')}</select></label>
      <ul>${answers.map(a => '<li>Reviewed evidence: ' + refLink(a.reference, org) + '</li>').join('')}</ul>
      <button type="button" class="btn ghost" data-refresh>Refresh my affected assessments</button><div aria-live="polite" data-refresh-outcome></div>` :
      '<p>No eligible reviewed training answer is visible to you.</p>'}</section>`;
}

export function mountServiceMatch(host, {pin, org, send, refresh, live, onUnavailable}) {
  host.innerHTML = `<form class="card">
    <p class="sub">Enter only the identifiers and quantities needed for a reported fit check. Leave a field blank when unknown. The check stays in this workspace and does not send a request.</p>
    <div class="row"><label>Requested method reference<input name="method" placeholder="namespace native-id version"></label>
    <label>Requested material reference<input name="material" placeholder="namespace native-id"></label></div>
    <p class="sub">For private request preparation, enter <code>planner:reviewed_protocol</code>, the protocol ID and interpretation digest from the reviewed assessment binding, separated by spaces.</p>
    <label>Required points (one per line: observable value dimension unit basis reference)<textarea name="requirements" rows="3"></textarea></label>
    <p class="sub">Use none for an explicit absence of a measurement reference, an ID such as absolute or gauge for a declared reference, or ? if unknown.</p>
    <label>Required fitted modules (exact identifiers, one per line)<textarea name="required_modules" rows="2"></textarea></label>
    <label>Declared conditions (one per line)<textarea name="conditions" rows="2"></textarea></label>
    <label><input name="save" type="checkbox"> Save this private assessment and its exact inputs</label>
    <div class="reg-actions"><button type="submit" class="btn">Check reported service fit</button></div>
    <p class="notice bad" role="alert" hidden></p><div aria-live="polite" data-result></div>
    </form>`;
  const form = host.querySelector('form'), notice = host.querySelector('[role=alert]'), output = host.querySelector('[data-result]');
  const values = name => form.elements[name].value.trim();
  const lines = name => values(name).split(/\r?\n/).map(v => v.trim()).filter(Boolean);
  const button = form.querySelector('button');
  let generation = 0;
  form.oninput = event => {
    if (output.contains(event.target)) return;
    generation++;
    output.replaceChildren();
  };
  form.onsubmit = async event => {
    event.preventDefault();
    if (button.disabled) return;
    const epoch = ++generation;
    button.disabled = true;
    notice.hidden = true;
    output.replaceChildren();
    try {
      const requirements = lines('requirements').map(line => {
        const [observable_id, value, dimension, unit, basis, ref, ...rest] = line.split(/\s+/);
        if (!ref || rest.length) throw Error('Each required point needs an observable, value, dimension, unit, basis and reference.');
        const reference = ref === '?' ? null : ref === 'none' ? {kind: 'none', id: null} : {kind: 'declared', id: ref};
        return {observable_id, value, dimension, unit, basis, reference};
      });
      const {match, assessment_id, questions, reviewed_answers} = await send({expected_head: pin, method: readNativeRef(values('method')),
        material: readNativeRef(values('material')), requirements, conditions: lines('conditions'),
        ...(lines('required_modules').length ? {required_modules: lines('required_modules')} : {}),
        save: form.elements.save.checked, questions: true});
      if (!live(host) || generation !== epoch) return;
      output.innerHTML = (assessment_id ? `<p class="notice">Saved private assessment ${code(assessment_id)}.</p>` : '') + explanation(match, org) + impactView(questions, reviewed_answers, org);
      const apply = output.querySelector('[data-refresh]'), progress = new Map();
      if (apply) apply.onclick = async () => {
        const selection = output.querySelector('[data-training-answer]');
        const chosen = reviewed_answers[Number(selection.value)];
        if (!chosen || !live(host)) return;
        apply.disabled = true;
        selection.disabled = true;
        notice.hidden = true;
        const outcome = output.querySelector('[data-refresh-outcome]');
        const key = chosen.reference.revision_id;
        const pairs = progress.get(key) ?? [];
        progress.set(key, pairs);
        const writeProgress = (more, paused = false) => {
          outcome.innerHTML = pairs.length ? '<p>Saved ' + pairs.length +
            ' refreshed assessment(s). Original captures remain in Dependent assessments.</p><ul>' +
            pairs.map(r => `<li>${code(r.prior_id)} → ${code(r.assessment_id)}<br>
              Before: ${effect(r.before)}<br>After: ${effect(r.after)}</li>`).join('') + '</ul>' :
            '<p>No additional assessments of this exact offer need this answer.</p>';
          if (more) outcome.insertAdjacentHTML('beforeend', '<p>' + (paused ?
            'More assessments remain. Choose Refresh my affected assessments to continue.' :
            'Checking the next group of assessments…') + '</p>');
        };
        try {
          // Keep each write bounded; a retry skips already saved descendants.
          for (let batch = 0; batch < 10; batch++) {
            const {refreshed, more} = await refresh({expected_head: pin, reviewed_answer: chosen.reference});
            if (!live(host) || generation !== epoch) return;
            pairs.push(...refreshed);
            writeProgress(more, batch === 9);
            if (!more) break;
          }
        } catch (error) {
          if (live(host) && generation === epoch && !onUnavailable(error)) {
            if (pairs.length) writeProgress(true, true);
            notice.textContent = error.message;
            notice.hidden = false;
          }
        } finally {
          if (live(host) && generation === epoch) { apply.disabled = false; selection.disabled = false; }
        }
      };
      output.querySelector('[data-draft]').onclick = () => {
        const draft = output.querySelector('[data-enquiry]');
        if (draft.firstChild) { draft.querySelector('textarea').focus(); return; }
        draft.innerHTML = '<label>Local enquiry draft<textarea rows="6"></textarea></label><p class="sub">Review and edit before copying. No assessed material, account identifier or private evidence was inserted.</p>';
        const textarea = draft.querySelector('textarea');
        textarea.value = 'Hello,\n\nCould you confirm which methods and materials your service accepts, and how you handle eligibility, training and availability? Please let me know what information you need for an enquiry.\n\nThank you.';
        textarea.focus();
      };
    } catch (error) {
      if (live(host) && generation === epoch && !onUnavailable(error)) {
        notice.textContent = error.message;
        notice.hidden = false;
      }
    } finally {
      if (live(host)) button.disabled = false;
    }
  };
}
