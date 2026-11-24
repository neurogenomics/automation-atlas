import {parseReview} from '../lib/reviewed/json.js';
import {esc} from './store.js';
import {claimFields, offerFields, offerPins, readOffer, readServiceClaim, readServiceMetadata, serviceClaims} from './registry-service-form.js';

export const kinds = {installation: 'Installation', installation_group: 'Installation group', configuration: 'Configuration', assertion: 'Evidence assertion', offer: 'Service offer or facility policy', access_claim: 'Access claim', availability_claim: 'Availability claim'};
const claimKinds = ['existence', 'custody', 'module_fit', 'operating_limits', 'provider_willingness', 'eligibility', 'training', 'availability'];
const keys = ['schema_version', 'organisation_id', 'record_id', 'revision_id', 'content_digest'];
export const pin = wire => ({...Object.fromEntries(keys.map(k => [k, wire[k]])), record_type: wire.record.record_type});
export const pretty = value => JSON.stringify(value, null, 2);
export const nameOf = r => r.record.label ?? (r.record.claim_kind ? r.record.claim_kind.replaceAll('_', ' ') + ' assertion' : kinds[r.record.record_type]);
const options = (items, current) => items.map(item => {
  const [value, label] = Array.isArray(item) ? item : [item, item.replaceAll('_', ' ')];
  return `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(label)}</option>`;
}).join('');
const select = (name, label, items, value) => `<label>${label}<select name="${name}" aria-label="${label}">${options(items, value)}</select></label>`;
const input = (name, label, value, attrs = '') => `<label>${label}<input name="${name}" value="${esc(value)}" ${attrs}></label>`;
const button = (text, action) => `<button class="btn ghost" type="button" data-form="${action}">${text}</button>`;
const values = node => name => node.querySelector(`[name="${name}"]`).value.trim();
const nullable = value => value || null;

function rightsForm(rights = {}) {
  const permissions = ['unknown', 'permitted', 'prohibited'];
  return `<div class="row">${['discovery', 'assessment', 'republication'].map(k => select(k, k[0].toUpperCase() + k.slice(1), permissions, rights[k])).join('')}</div>
    ${input('basis', 'Permission basis (required for any permitted use)', rights.basis)}`;
}
function readRights(node) {
  const get = values(node);
  return {...Object.fromEntries(['discovery', 'assessment', 'republication'].map(k => [k, get(k)])), basis: nullable(get('basis'))};
}
export function sourceForm(entry, index, removable = true) {
  const ref = entry?.source;
  return `<fieldset class="opts reg-source"><legend>Dated source ${index + 1}</legend>
    ${input('url', 'Source HTTPS URL', ref?.url, 'type="url" required')}
    <div class="row">${input('namespace', 'Source namespace', ref?.namespace, 'required')}${input('native_id', 'Source identifier', ref?.native_id, 'required')}${input('version', 'Source version (optional)', ref?.version)}</div>
    <div class="row">${input('source_date', 'Source observation date', entry?.observed_at, 'type="date" required')}
    ${select('source_visibility', 'Source visibility', [['organisation_private', 'Organisation private'], ['public', 'Public']], entry?.visibility)}</div>
    ${input('snapshot_digest', 'Source snapshot SHA-256 (optional)', entry?.snapshot_digest, 'placeholder="sha256:…"')}
    ${rightsForm(entry?.use_rights)}
    ${removable ? button('Remove source', 'remove') : ''}</fieldset>`;
}
export function readSource(node) {
  const get = values(node), version = get('version');
  return {source: {namespace: get('namespace'), native_id: get('native_id'), url: get('url'), ...(version ? {version} : {})},
    observed_at: get('source_date'), visibility: get('source_visibility'), snapshot_digest: nullable(get('snapshot_digest')), use_rights: readRights(node)};
}
function moduleForm(item = {}) {
  return `<fieldset class="opts reg-module"><legend>Module report</legend>
    <div class="row">${input('module_id', 'Module identifier', item.module_id, 'required')}
    ${select('module_state', 'Fitting status', [['unknown', 'Unknown'], ['reported_fitted', 'Reported fitted'], ['reported_absent', 'Reported absent']], item.state)}
    ${input('module_source', 'Source number (optional, starts at 1)', item.source_pointer == null ? '' : Number(item.source_pointer.split('/').at(-1)) + 1, 'type="number" min="1" max="32" step="1"')}</div>
    ${button('Remove module', 'remove')}</fieldset>`;
}
function targetOptions(kind, base, records) {
  const eligible = kind === 'configuration' ? ['installation'] : serviceClaims.includes(kind) ?
    ['installation', 'configuration', 'offer'] : Object.keys(kinds).filter(k => k !== 'assertion');
  const refs = records.filter(r => r.state === 'active' && eligible.includes(r.record.record.record_type))
    .map(r => [JSON.stringify(pin(r.record)), `${nameOf(r.record)} · ${r.record.revision_id}`]);
  const existing = base?.installation ?? base?.target;
  if (existing && !refs.some(([v]) => JSON.parse(v).revision_id === existing.revision_id))
    refs.unshift([JSON.stringify(existing), 'Previously pinned revision · ' + existing.revision_id]);
  return select('target', 'Target revision', [['', 'Choose an exact revision'], ...refs],
    existing ? refs.find(([v]) => JSON.parse(v).revision_id === existing.revision_id)?.[0] : '');
}
function recordForm(kind, base, records, hasMore, service, organisation) {
  if (kind === 'installation' || kind === 'installation_group') {
    return `${input('label', 'Report label', base?.label, 'required')}${input('reported_location', 'Reported location (private; blank if unknown)', base?.reported_location,
      base && kind === 'installation' ? 'readonly' : '')}
      ${base && kind === 'installation' ? '<p class="sub">Use Record dated location change to update this location and preserve the evidence.</p>' : ''}
      ${kind === 'installation_group' ? input('reported_count', 'Reported group count (blank if unknown)', base?.reported_count, 'type="number" min="2" step="1"') : ''}
      <p class="sub">Atlas model pins and external identifiers can be entered in the exact JSON editor.</p>`;
  }
  const more = hasMore ? button('Load more target revisions', 'targets') : '';
  if (kind === 'offer') return offerFields(base, service) + offerPins(base, records, organisation) + more;
  const target = `<div data-pins="target">${targetOptions(kind, base, records)}</div>${more}`;
  if (serviceClaims.includes(kind)) return target + claimFields(kind, base);
  if (kind === 'configuration') return `${target}
    ${select('coverage', 'Module inventory coverage', [['unknown', 'Unknown'], ['partial', 'Partial'], ['complete', 'Complete']], base?.fitted_modules?.coverage)}
    <div data-modules>${(base?.fitted_modules?.items ?? []).map(moduleForm).join('')}</div>${button('Add module', 'module')}
    <p class="sub">${base?.operating_envelopes ? 'Existing operating envelopes are retained.' : 'Operating limits are unknown.'} Use the exact JSON editor to record joint limits and their evidence.</p>`;
  return `${target}<div class="row">${select('claim_kind', 'Claim', claimKinds, base?.claim_kind)}
    ${select('outcome', 'Outcome', ['unknown', 'affirmed', 'denied'], base?.outcome)}
    ${select('claim_state', 'Evidence state', ['reported', 'disputed', 'unknown'], base?.state)}</div>
    <label>Statement (optional)<textarea name="statement" rows="3">${esc(base?.statement)}</textarea></label>
    <p class="sub">The Planner records your account as reporter. Provider and custodian claims remain unverified.</p>`;
}
function readRecord(kind, base, node, observed_at, expires_at, organisation) {
  const get = values(node);
  if (kind === 'installation' || kind === 'installation_group') {
    const count = kind === 'installation_group' ? nullable(get('reported_count')) : null;
    return {record_type: kind, label: get('label'), reported_location: base && kind === 'installation' ? base.reported_location : nullable(get('reported_location')),
      model: base?.model ?? null, external_id_claims: base?.external_id_claims ?? [],
      ...(kind === 'installation_group' ? {reported_count: count === null ? null : Number(count)} : {})};
  }
  if (kind === 'offer') return readOffer(base, node, get);
  const target = get('target') ? JSON.parse(get('target')) : null;
  if (serviceClaims.includes(kind)) return readServiceClaim(kind, base, target, get, observed_at, expires_at, organisation);
  if (kind === 'configuration') {
    const coverage = get('coverage');
    const items = [...node.querySelectorAll('.reg-module')].map(row => {
      const field = values(row), source = field('module_source');
      return {module_id: field('module_id'), state: field('module_state'), source_pointer: source ? '/sources/' + (Number(source) - 1) : null};
    });
    if (items.length && coverage === 'unknown') throw Error('Select partial or complete inventory coverage for the modules you entered.');
    return {record_type: kind, installation: target, fitted_modules: coverage === 'unknown' ? null : {coverage, items},
      operating_envelopes: base?.operating_envelopes ?? null};
  }
  return {record_type: kind, target, claim_kind: get('claim_kind'), outcome: get('outcome'), state: get('claim_state'),
    statement: nullable(get('statement')), observed_at, valid_until: expires_at, verified_authority: null,
    asserted_by: base?.asserted_by ?? null, claimed_provider: base?.claimed_provider ?? null,
    claimed_custodian: base?.claimed_custodian ?? null, related_assertions: base?.related_assertions ?? []};
}

export function mountRecordForm(host, {row, role, records, nextAfter, loadTargets, save, onConflict, organisation}) {
  const wire = row?.record, base = wire?.record;
  const visibility = [['organisation', 'Organisation'], ['public', 'Public candidate'], ['restricted', 'Restricted to owners and reviewers']]
    .filter(([v]) => row ? v === row.visibility : role === 'owner' || (v === 'restricted') === (role === 'reviewer'));
  const form = document.createElement('form');
  form.className = 'card reg-form';
  host.replaceChildren(form);
  form.innerHTML = `<h3>${row ? 'Correct this revision' : 'New equipment report'}</h3>
    ${row ? `<p class="sub">Editing revision <code>${esc(wire.revision_id)}</code>. A correction makes a new revision and requires fresh review before publication.</p>` : ''}
    <div data-normal>
      ${base ? '' : select('record_type', 'Record type', Object.entries(kinds))}
      <div data-record></div>
      <fieldset class="opts"><legend>Observation and disclosure</legend>
        <div class="row">${input('observed_at', 'Observation date', row?.observed_at, 'type="date" required')}
          ${input('expires_at', 'Evidence expiry (optional UTC timestamp)', row?.expires_at, 'placeholder="YYYY-MM-DDTHH:MM:SSZ"')}</div>
        ${select('visibility', 'Record visibility', visibility, row?.visibility)}
        <p class="sub">Public candidates remain in the workspace until an owner publishes a reviewed projection. Use rights are declarations; leave them unknown without a basis.</p>
        <div data-rights>${rightsForm(wire?.use_rights)}</div>
      </fieldset>
      <div data-sources>${(wire?.sources ?? []).map((source, index) => sourceForm(source, index)).join('')}</div>
      ${button('Add dated source', 'source')}
      <p class="sub">Enter source locators and rights without uploading source contents. Module pointers use the numbered sources above.</p>
    </div>
    <div data-exact hidden>
      <p class="sub">Edit the exact creation or correction payload. Preserve each joint envelope with its conditions, limits and evidence references. Use decimal strings for measured values. The server supplies revision identity and reporter.</p>
      <label>Exact registry JSON<textarea name="exact" rows="18" spellcheck="false"></textarea></label>
      ${button('Return to form (keeps earlier form values)', 'normal')}
    </div>
    <div class="reg-actions"><button class="btn" type="submit">${row ? 'Save correction' : 'Save report'}</button>
    ${button('Edit exact JSON', 'exact')}</div>
    <p class="notice bad" role="alert" hidden></p><div data-current></div>`;
  const normal = form.querySelector('[data-normal]'), record = form.querySelector('[data-record]'), exact = form.elements.exact;
  const get = values(normal), notice = form.querySelector('[role=alert]');
  const kind = () => base?.record_type ?? get('record_type');
  const markup = () => recordForm(kind(), base, records, nextAfter !== null, row?.service, organisation);
  const drawRecord = () => { record.innerHTML = markup(); };
  const normalPayload = () => {
    const observed_at = get('observed_at'), expires_at = nullable(get('expires_at'));
    return {visibility: get('visibility'), observed_at, expires_at, use_rights: readRights(normal.querySelector('[data-rights]')),
      sources: [...normal.querySelectorAll('.reg-source')].map(readSource),
      record: readRecord(kind(), base, record, observed_at, expires_at, organisation),
      ...(kind() === 'offer' ? {service: readServiceMetadata(values(record))} : {})};
  };
  const showError = msg => { notice.textContent = msg; notice.hidden = !msg; };
  drawRecord();
  if (!base) form.elements.record_type.onchange = drawRecord;
  const exactButton = form.querySelector('[data-form=exact]');
  // Disable hidden form controls so native constraint validation stays in the active editor.
  const mode = advanced => {
    normal.hidden = advanced;
    normal.querySelectorAll('input,select,textarea').forEach(el => { el.disabled = advanced; });
    exact.disabled = !advanced;
    exact.closest('[data-exact]').hidden = !advanced;
    exactButton.hidden = advanced;
  };
  let exactChanged = false, busy = false, loadingTargets = false;
  exact.oninput = () => { exactChanged = true; };
  mode(false);
  form.onclick = async event => {
    const command = event.target.dataset.form;
    if (busy || !command) return;
    try {
      if (command === 'targets' && !loadingTargets && nextAfter !== null) {
        loadingTargets = event.target.disabled = true;
        showError('');
        try {
          const page = await loadTargets(nextAfter);
          if (!form.isConnected || form.closest('#registry-workspace').dataset.route !== location.hash) return;
          records.push(...page.records);
          nextAfter = page.next_after;
          const updated = document.createElement('template');
          updated.innerHTML = markup();
          for (const picker of record.querySelectorAll('[data-pins]')) {
            const prior = [...picker.querySelector('select').selectedOptions].map(option => option.value);
            const replacement = [...updated.content.querySelectorAll('[data-pins]')].find(p => p.dataset.pins === picker.dataset.pins);
            if (!replacement) continue;
            const select = replacement.querySelector('select');
            for (const option of select.options) option.selected = prior.includes(option.value);
            picker.replaceWith(replacement);
          }
          if (nextAfter === null) record.querySelector('[data-form=targets]')?.remove();
        } finally { loadingTargets = event.target.disabled = false; }
      }
      if (command === 'source') {
        const sources = normal.querySelector('[data-sources]');
        if (sources.children.length === 32) throw Error('A report can include up to 32 sources.');
        sources.insertAdjacentHTML('beforeend', sourceForm(null, sources.children.length));
      }
      if (command === 'module') {
        record.querySelector('[data-modules]').insertAdjacentHTML('beforeend', moduleForm());
        if (form.elements.coverage.value === 'unknown') form.elements.coverage.value = 'partial';
      }
      if (command === 'remove') {
        const row = event.target.closest('fieldset');
        if (row.classList.contains('reg-source')) {
          const index = row.parentElement.children.length - 1;
          if (row.nextElementSibling) throw Error('Remove sources from the end so existing source numbers stay fixed. For other changes, use the exact JSON editor and check every reference.');
          const pointer = '/sources/' + index;
          const pinned = [...(base?.external_id_claims ?? []), ...(base?.operating_envelopes ?? [])].some(e => e.source_pointer === pointer);
          const moduleLink = [...record.querySelectorAll('[name=module_source]')].some(field => Number(field.value) === index + 1);
          if (pinned || moduleLink || base?.operating_envelopes?.length)
            throw Error('This source may support a module, identifier or operating limit. Unlink the module first or update the evidence and pointers in the exact JSON editor.');
        }
        row.remove();
      }
      if (command === 'exact') {
        exact.value = pretty(normalPayload());
        exactChanged = false;
        mode(true); exact.focus();
      }
      if (command === 'normal' && (!exactChanged || confirm('Discard changes in the exact JSON editor and return to the earlier form values?'))) mode(false);
    } catch (error) { showError(error.message); }
  };
  form.onsubmit = async event => {
    event.preventDefault();
    if (busy) return;
    const submit = form.querySelector('[type=submit]');
    busy = submit.disabled = true;
    showError('');
    try {
      let payload;
      if (normal.hidden) {
        try { payload = parseReview(exact.value); }
        catch { throw Error('Enter valid registry JSON with unique keys and whole numbers. Quote decimal measurements.'); }
        if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.hasOwn(payload, 'expected_head') || Object.hasOwn(payload, 'action'))
          throw Error('Enter a registry payload object without expected_head or action. This editor pins the revision it opened.');
      } else {
        payload = normalPayload();
        if (['configuration', 'assertion', ...serviceClaims].includes(payload.record.record_type) && !(payload.record.target ?? payload.record.installation))
          throw Error('Choose a target revision, or enter an exact revision pin in the JSON editor.');
      }
      if (!normal.hidden) {
        if (payload.record.record_type === 'assertion' && payload.record.state !== 'unknown' && !payload.sources.length)
          throw Error('Add a dated source for this assertion.');
        if (serviceClaims.includes(payload.record.record_type) && payload.visibility === 'public')
          throw Error('Choose organisation or restricted visibility for access and availability reports.');
        if (payload.record.subject?.kind === 'principal' && payload.visibility !== 'restricted')
          throw Error('Choose restricted visibility for an exact principal access claim.');
        if (payload.visibility === 'public' && payload.sources.some(s => s.visibility !== 'public' || s.use_rights.discovery !== 'permitted'))
          throw Error('Every source on a public candidate must be public and permit discovery. Choose organisation visibility for private or uncertain sources.');
      }
      await save(payload);
    } catch (error) {
      showError(error.status === 409 ? 'The record changed. Your draft is still here and remains pinned to the revision you opened.' : error.message);
      if (error.status === 409 && onConflict) {
        const latest = await onConflict();
        if (latest) form.querySelector('[data-current]').innerHTML = `<details class="card" open>
          <summary>Current server revision · ${esc(latest.record.revision_id)}</summary>
          <p>${esc(nameOf(latest.record))} · ${esc(latest.action)} · saved ${esc(latest.record.recorded_at)}</p>
          <p>Compare this revision with your draft before starting a new correction.</p>
          <details><summary>Exact current record and evidence</summary><pre>${esc(pretty(latest.record))}</pre></details></details>`;
      }
    } finally { busy = submit.disabled = false; }
  };
}
