import {parseReview} from '../lib/reviewed/json.js';
import {api, download, esc} from './store.js';

const maximum = 250 * 1024;
const printable = value => esc(JSON.stringify(value, null, 2));

export function mountRequestDraft(host, orgUrl, assessment, live) {
  const alternatives = assessment.match.result.configurations.filter(c => c.configuration && c.technical_fit === 'reported_fit');
  const expected = assessment.match.input.method;
  if (expected?.namespace !== 'planner:reviewed_protocol' || !alternatives.length) {
    host.innerHTML = '<p>To prepare a request, save a service assessment for an exact reviewed protocol and an identifiable configuration with reported fit.</p>';
    return;
  }
  host.innerHTML = `<form data-request-form>
    <label>Exact configuration <select name="configuration">${alternatives.map((c, i) =>
      `<option value="${i}">${esc(c.configuration.record_id)} · ${esc(c.configuration.revision_id)}</option>`).join('')}</select></label>
    <label>Reviewed assessment input JSON <input type="file" name="reviewed" accept=".json,application/json" required></label>
    <p>Preparation uses current Registry evidence and keeps a private local draft. The file is processed for exact binding. No request is sent.</p>
    <button type="submit" class="btn">Prepare private request</button>
    <p data-request-status role="status"></p></form><div data-request-result></div>`;
  const form = host.querySelector('form'), status = host.querySelector('[data-request-status]');
  const result = host.querySelector('[data-request-result]');
  let key = null, currentDraft = null, pending = false;
  form.onchange = () => { key = null; currentDraft = null; result.replaceChildren(); status.textContent = ''; };
  const show = ({draft, facility_routes}) => {
    currentDraft = draft.id;
    status.textContent = 'Prepared for local review. No provider outcome has been supplied.';
    result.innerHTML = `<p>Draft ${esc(draft.id)} · expires ${esc(draft.expires_at)}</p>
      <details><summary>Inspect exact private request</summary><pre>${printable(draft)}</pre></details>
      <button type="button" class="btn ghost" data-request-export>Download private request JSON</button>
      <ul>${facility_routes.map(route => `<li><a href="${esc(route.url)}" target="_blank" rel="noopener noreferrer">Open facility ${esc(route.kind)} route</a></li>`).join('')}</ul>`;
  };
  async function operate(button, work) {
    if (!live(host) || pending) return;
    pending = true;
    for (const control of form.elements) control.disabled = true;
    if (button) button.disabled = true;
    status.textContent = 'Checking current evidence…';
    try { await work(); }
    catch (error) {
      if (live(host)) { status.textContent = error.message; result.replaceChildren(); }
    } finally {
      pending = false;
      if (live(host)) { for (const control of form.elements) control.disabled = false; if (button) button.disabled = false; }
    }
  }
  form.onsubmit = event => {
    event.preventDefault();
    const file = form.elements.reviewed.files[0], configuration = alternatives[Number(form.elements.configuration.value)]?.configuration;
    if (!file || !configuration) return;
    key ??= crypto.randomUUID();
    void operate(null, async () => {
      let input;
      try {
        if (file.size > maximum) throw Error();
        input = parseReview(new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(await file.arrayBuffer()));
      } catch { throw Error('Choose a supported reviewed assessment input JSON file within the size limit.'); }
      if (!live(host)) return;
      const data = await api(orgUrl + '/assessments/' + assessment.id + '/request-v1', 'POST',
        {schema: 'planner/registry-service-request-input/1', idempotency_key: key, configuration, reviewed_input: input});
      if (live(host)) show(data);
    });
  };
  result.onclick = event => {
    const button = event.target.closest('[data-request-export]'), id = currentDraft;
    if (!button || !id) return;
    void operate(button, async () => {
      const data = await api(orgUrl + '/request-drafts-v1/' + id);
      if (!live(host)) return;
      show(data);
      download('private-service-request.json', JSON.stringify(data.draft, null, 2));
    });
  };
}

export function mountDraftReadback(host, orgUrl, live) {
  host.innerHTML = `<form><label>Private request ID <input name="id" required pattern="(?:[a-z0-9]|-){1,128}"></label>
    <button type="submit" class="btn ghost">Retrieve private request</button></form><p role="status"></p><div></div>`;
  const form = host.querySelector('form'), status = host.querySelector('[role=status]'), result = host.querySelector('div');
  form.onsubmit = async event => {
    event.preventDefault();
    result.replaceChildren();
    const input = form.elements.id, button = form.querySelector('button'), id = input.value;
    if (!live(host) || !form.reportValidity() || button.disabled) return;
    button.disabled = true;
    try {
      const data = await api(orgUrl + '/request-drafts-v1/' + id);
      if (!live(host) || input.value !== id) return;
      status.textContent = 'Prepared for local review. No provider outcome has been supplied.';
      result.innerHTML = `<details open><summary>Exact private request</summary><pre>${printable(data.draft)}</pre></details>`;
    } catch (error) {
      if (live(host) && input.value === id) status.textContent = error.message;
    } finally { if (live(host)) button.disabled = false; }
  };
}
