import {inventorySections} from '../lib/registry-inventory.js';
import {esc} from './store.js';

const states = [['unknown', 'Unknown'], ['present', 'Reported present'], ['absent', 'Reported absent']];
const referrals = [...states, ['referral', 'Refer to operator']];
const action = (text, key) => `<button type="button" class="btn ghost" data-survey="${key}">${text}</button>`;
const select = (label, name, options, value) => `<label>${label}<select name="${name}" aria-label="${label}">
  ${options.map(([v, title]) => `<option value="${v}"${v === value ? ' selected' : ''}>${title}</option>`).join('')}</select></label>`;
const field = (label, name, value, attrs = '') => `<label>${label}<input name="${name}" value="${esc(value ?? '')}" ${attrs}></label>`;
const find = (root, name) => root.querySelector(`[name="${name}"]`);
const val = (root, name) => find(root, name).value.trim();

function evidenceForm(e) {
  return `<fieldset class="opts" data-evidence><legend>Evidence (optional for general answers)</legend>
    <div class="row">${select('Evidence type', 'kind', [['', 'None cited'], ['reference', 'Private reference'],
      ['sha256', 'File SHA-256']], e?.kind ?? '')}
    ${field('Evidence reference or digest', 'value', e?.value, 'maxlength="160"')}
    ${field('Evidence observation date', 'observed_at', e?.observed_at, 'type="date"')}</div>
    <label>Calculate a digest from a local file<input type="file" data-digest></label>
    <p class="sub">Use an opaque reference you can retrieve, or a digest. File contents and names stay on this device.</p>
  </fieldset>`;
}
function readEvidence(root) {
  const form = root.querySelector('[data-evidence]');
  const kind = val(form, 'kind'), value = val(form, 'value'), observed_at = val(form, 'observed_at');
  if (!kind && !value && !observed_at) return null;
  if (!kind || !value || !observed_at) throw Error('Choose an evidence type, enter its reference or digest, and give the observation date.');
  return {kind, value, observed_at};
}
function connection(c = {}) {
  return `<fieldset class="opts" data-connection><legend>Reported connection</legend><div class="row">
    ${field('Exact endpoint', 'endpoint', c.endpoint, 'maxlength="160"')}
    ${field('Exact interface', 'interface', c.interface, 'maxlength="160"')}
    ${select('Connection status', 'connection_status', states, c.status ?? 'unknown')}</div>
    ${c.pins ? `<p class="sub">Saved with installation revision <code>${esc(c.pins.installation.revision_id)}</code>
      ${c.pins.configuration ? ' · configuration <code>' + esc(c.pins.configuration.revision_id) + '</code>' : ''}</p>` : ''}
    ${evidenceForm(c.evidence)}${action('Remove connection', 'remove')}</fieldset>`;
}

export function mountOperatorSurvey(host, {row, org, pin, get, send, live, unavailable}) {
  host.innerHTML = '<h3>Operator inventory survey</h3>' + action('Open operator survey', 'open') +
    '<p class="sub">Answer in stages using the existing report above. Each signed-in operator has their own draft.</p>' +
    '<p class="notice" role="status" data-survey-status hidden></p><div data-survey-body></div>';
  const body = host.querySelector('[data-survey-body]'), notice = host.querySelector('[data-survey-status]');
  const report = row.record.record, installation = report.installation ?? pin;
  const blank = () => ({step: 'heads', answers: {}, enquiry: {status: 'not_prepared', sections: []}});
  let state, busy = false, pending = 0, index = 0, draft;
  const flash = text => { notice.textContent = text; notice.hidden = !text; };
  const sameHead = (a, b) => a?.revision_id === b.revision_id && a.content_digest === b.content_digest;
  const accept = result => {
    if (!sameHead(result.expected_head, pin)) throw Error('Reload the equipment report before opening this survey.');
    state = result;
    draft = state.draft ?? blank();
    index = inventorySections.findIndex(([id]) => id === draft.step);
  };
  const render = () => {
    const [key, label, who, question] = inventorySections[index], answer = draft.answers[key];
    const known = key === 'heads' && report.fitted_modules?.items.length ?
      '<p>Already reported: ' + report.fitted_modules.items.map(m => esc(m.module_id + ': ' + m.state.replaceAll('_', ' '))).join('; ') + '</p>' :
      '<p class="sub">Check the dated sources and exact report above. Blank survey answers stay unknown.</p>';
    body.innerHTML = `<fieldset class="opts" data-answer><legend>Step ${index + 1} of ${inventorySections.length}: ${label}</legend>
      <p>${question} <span class="sub">Who can answer: ${who}.</span></p>${known}
      <div class="row">${select('Answer status', 'status', referrals, answer?.status ?? 'unknown')}
      ${field('Private equipment details or referral role', 'detail', answer?.detail, 'maxlength="1000"')}</div>
      ${evidenceForm(answer?.evidence)}
      ${key === 'connections' ? `<p class="sub">A reported connection does not establish unattended interoperability. Each endpoint and interface is bound
        to installation revision <code>${esc(installation.revision_id)}</code>${report.installation ? ' and configuration revision <code>' + esc(pin.revision_id) + '</code>' : ''}.
        Provide a dated evidence reference or digest for each connection.</p><div data-connections>
        ${(answer?.connections ?? []).map(connection).join('')}</div>${action('Add reported connection', 'add')}` : ''}
      </fieldset>
      <p class="sub">Blank entries remain unknown. Survey answers stay in your private draft; updating registry evidence requires its own report and review.</p>
      <div class="reg-actions">${index ? action('Save and go back', 'back') : ''}${action('Save survey draft', 'save')}
      ${index + 1 < inventorySections.length ? action('Save and continue', 'next') : ''}</div>
      <fieldset class="opts" data-enquiry><legend>General enquiry draft</legend>
      <p class="sub">Select questions for the draft. This preview contains only the selected standard questions; it includes no inventory answers, account details, evidence or private assessment context.</p>
      ${inventorySections.map(([id, name]) => `<label class="reg-choice"><input type="checkbox" name="section" value="${id}"
        ${draft.enquiry.sections.includes(id) ? 'checked' : ''}><span>${name}</span></label>`).join('')}
      <label>Enquiry status<select name="enquiry_status" aria-label="Enquiry status">
        <option value="not_prepared">Not prepared</option><option value="draft">Draft</option>
        <option value="ready_for_review">Ready for review</option>${draft.enquiry.status === 'reviewed' ? '<option value="reviewed">Reviewed</option>' : ''}
      </select></label>
      ${action('Save enquiry draft', 'save')}
      ${state.projection ? '<label data-survey-preview>' + (state.approved ? 'Reviewed enquiry text' : 'Saved enquiry preview') +
        '<textarea rows="7" readonly>' + esc(state.projection) + '</textarea></label>' : ''}
      ${org.role === 'owner' && state.current && draft.enquiry.status === 'ready_for_review' ? action('Approve this exact enquiry text', 'review') : ''}
      <p class="sub">${org.role === 'owner' ? 'Review and copy the exact text for use outside Planner.' :
        'Copy the neutral preview manually if you want to ask the registry owner to review it. Your equipment answers stay private.'}
        No message is sent.</p></fieldset>`;
    find(body, 'enquiry_status').value = draft.enquiry.status;
    if (!state.editable) {
      body.querySelectorAll('input,select,button').forEach(el => { el.disabled = true; });
      flash('This report is closed for survey edits.');
    } else if (state.target && !state.current) {
      flash('This saved draft is pinned to an earlier equipment revision. Review the current report above before saving against it.');
    } else if (draft.enquiry.status === 'reviewed' && !state.approved) {
      flash('The previous enquiry review is no longer current. Save it as ready for review and check the new preview.');
    }
  };
  const read = step => {
    const [key] = inventorySections[index], root = body.querySelector('[data-answer]');
    const status = val(root, 'status'), detail = val(root, 'detail'), evidence = readEvidence(root);
    const connections = [...root.querySelectorAll('[data-connection]')].map(c => ({
      endpoint: val(c, 'endpoint'), interface: val(c, 'interface'), status: val(c, 'connection_status'), evidence: readEvidence(c),
    }));
    if (connections.some(c => !c.endpoint || !c.interface || !c.evidence))
      throw Error('Each reported connection needs an exact endpoint, interface and dated evidence.');
    if (status === 'referral' && (evidence || connections.length)) throw Error('Keep referrals separate from equipment evidence.');
    const answers = Object.fromEntries(Object.entries(draft.answers).map(([id, a]) => [id,
      {...a, connections: a.connections.map(({pins, ...c}) => c)}]));
    if (status !== 'unknown' || detail || evidence || connections.length) answers[key] = {status, detail, evidence, connections};
    else delete answers[key];
    const sections = [...body.querySelectorAll('[name=section]:checked')].map(e => e.value);
    let enquiryStatus = val(body, 'enquiry_status');
    if (enquiryStatus === 'reviewed') enquiryStatus = 'ready_for_review';
    if (!sections.length) enquiryStatus = 'not_prepared';
    else if (enquiryStatus === 'not_prepared') enquiryStatus = 'draft';
    return {step: inventorySections[step][0], answers, enquiry: {status: enquiryStatus, sections}};
  };
  const invalidatePreview = () => {
    for (const el of body.querySelectorAll('[data-survey-preview], button[data-survey="review"]')) el.hidden = true;
  };
  host.oninput = event => {
    if (event.target.matches('input,select') && body.contains(event.target)) invalidatePreview();
  };
  host.onchange = async event => {
    const input = event.target;
    if (!input.matches('[data-digest]') || !input.files[0] || !live(host)) return;
    const parent = input.closest('fieldset');
    const file = input.files[0];
    if (file.size > 25 * 1024 * 1024) { flash('Use a file of 25 MB or smaller, or enter an existing digest.'); input.value = ''; return; }
    pending++;
    try {
      const bytes = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      if (!live(host) || !parent.isConnected || input.files[0] !== file) return;
      find(parent, 'kind').value = 'sha256';
      find(parent, 'value').value = [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, '0')).join('');
      input.value = '';
    } catch { if (live(host) && parent.isConnected) flash('Could not calculate a local digest.'); }
    finally { pending--; }
  };
  host.onclick = async event => {
    const button = event.target.closest('button[data-survey]');
    if (!button || busy || !live(host)) return;
    const command = button.dataset.survey;
    if (pending) { flash('Wait for the local file digest before saving.'); return; }
    if (command === 'add') {
      invalidatePreview();
      if (body.querySelectorAll('[data-connection]').length < 12)
        body.querySelector('[data-connections]').insertAdjacentHTML('beforeend', connection());
      else flash('Save up to twelve exact connections.');
      return;
    }
    if (command === 'remove') { invalidatePreview(); button.closest('[data-connection]').remove(); return; }
    if (command === 'open' && state) { body.querySelector('select')?.focus(); return; }
    busy = true;
    const controls = [...host.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')];
    controls.forEach(e => { e.disabled = true; });
    try {
      let result;
      if (command === 'open') result = await get();
      else {
        const step = index + (command === 'next' ? 1 : command === 'back' ? -1 : 0);
        const stale = state.target && !state.current;
        if (stale && !confirm('Continue this survey against the current equipment revision? Unchanged connections keep their original pins.')) return;
        const next = read(step), review = command === 'review';
        result = await send({expected_head: pin, expected_version: state.version, draft: next,
          ...(stale ? {acknowledge_repin: state.target} : {}),
          ...(review ? {review: true, expected_policy_id: state.policy_id} : {})});
      }
      if (!live(host)) return;
      accept(result);
      flash(command === 'open' ? '' : result.approved ? 'Reviewed the exact enquiry. No message was sent.' : 'Saved to your account.');
      render();
    } catch (error) {
      if (live(host) && !unavailable(error)) flash(error.message);
    } finally {
      busy = false;
      if (live(host)) controls.forEach(e => { if (e.isConnected) e.disabled = false; });
    }
  };
}
