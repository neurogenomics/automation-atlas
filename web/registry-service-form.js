import {esc} from './store.js';

export const serviceClaims = ['access_claim', 'availability_claim'];
export const contactRoles = {provider_contact: 'Provider contact', custodian: 'Custodian', operator: 'Operator', access_approver: 'Access approver'};
const refKeys = ['schema_version', 'organisation_id', 'record_type', 'record_id', 'revision_id', 'content_digest'];
const pinText = ref => JSON.stringify(Object.fromEntries(refKeys.map(k => [k, k === 'record_type' ? ref.record?.record_type ?? ref.record_type : ref[k]])));
const text = (name, label, value, attrs = '') => `<label>${label}<input name="${name}" value="${esc(value)}" ${attrs}></label>`;
const choice = (name, label, items, value) => `<label>${label}<select name="${name}" aria-label="${label}">${items.map(item =>
  `<option value="${item}"${item === value ? ' selected' : ''}>${item.replaceAll('_', ' ')}</option>`).join('')}</select></label>`;
const area = (name, label, value) => `<label>${label}<textarea name="${name}" rows="2">${esc(value)}</textarea></label>`;
const nativeRef = ref => ref ? [ref.namespace, ref.native_id, ref.version].filter(Boolean).join(' ') : '';
const lines = s => s.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
export function readNativeRef(value, prior) {
  if (!value) return null;
  if (prior && value === nativeRef(prior)) return prior;
  const [namespace, native_id, version, ...rest] = value.split(/\s+/);
  if (!native_id || rest.length || !/^[a-z][a-z0-9-]*:[a-z][a-z0-9_-]*$/.test(namespace))
    throw Error('Enter a source reference as namespace native-id and an optional version.');
  return {namespace, native_id, ...(version ? {version} : {})};
}
const refsText = list => list?.length ? list.map(nativeRef).join('\n') : Array.isArray(list) ? '-' : '';
function readRefs(value, prior) {
  if (!value) return null;
  if (value === '-') return [];
  return lines(value).map(line => readNativeRef(line, prior?.find(ref => nativeRef(ref) === line)));
}

function picker(slot, label, records, accepts, saved, multiple = false) {
  const values = new Map(saved.map(ref => [ref.revision_id, [ref, 'Previously pinned revision']]));
  for (const row of records.filter(r => r.state === 'active' && accepts(r))) {
    const w = row.record;
    values.set(w.revision_id, [w, w.record.label ?? w.record.record_type.replaceAll('_', ' ')]);
  }
  return `<div data-pins="${slot}"><label>${label}<select name="${slot}" aria-label="${label}" ${multiple ? 'multiple size="4"' : ''}>
    ${multiple ? '' : '<option value="">No local policy selected</option>'}
    ${[...values.values()].map(([ref, name]) => `<option value="${esc(pinText(ref))}"${saved.some(v => v.revision_id === ref.revision_id) ? ' selected' : ''}>${esc(name)} · ${esc(ref.revision_id)}</option>`).join('')}
    </select></label></div>`;
}
const policyRef = (p, org) => ({schema_version: '0.1.0', organisation_id: org, record_type: 'offer', record_id: p.source.native_id,
  revision_id: p.source.version, content_digest: p.content_digest});
const localPolicy = p => p?.source.namespace === 'planner:registry_offer';
const savedPolicy = (r, org) => localPolicy(r) ? [policyRef(r, org)] : [];
export function offerPins(base, records, org) {
  const installations = picker('backing_installations', 'Backing installations (select all reported alternatives)', records,
    r => ['installation', 'installation_group'].includes(r.record.record.record_type), base?.backing_installations ?? [], true);
  const configurations = picker('backing_configurations', 'Backing configurations (select all reported alternatives)', records,
    r => r.record.record.record_type === 'configuration' && !r.duplicate_backing, base?.backing_configurations ?? [], true);
  const policy = picker('local_default', 'Local facility default revision', records,
    r => r.service?.kind === 'facility_default', savedPolicy(base?.access_policy?.facility_default, org));
  return installations + configurations + policy;
}
const routesText = routes => routes?.length ? routes.map(r => r.kind + ' ' + r.url).join('\n') : routes ? '-' : '';
function readRoutes(value) {
  if (!value) return null;
  if (value === '-') return [];
  return lines(value).map(line => {
    const [kind, url, ...rest] = line.split(/\s+/);
    if (rest.length || !['enquiry','quote','booking'].includes(kind) || !url) throw Error('Enter each route as enquiry, quote or booking followed by its HTTPS URL.');
    return {kind, url};
  });
}
const modes = ['operator_assisted', 'self_service', 'staff_delivered'];
const bases = ['unknown', 'per_sample', 'per_run', 'per_hour', 'per_request', 'quote_required', 'other'];
export function offerFields(r, service) {
  const p = r?.access_policy, external = localPolicy(p?.facility_default) ? null : p?.facility_default, terms = r?.terms;
  return `${text('label', 'Service or policy label', r?.label, 'required')}
    ${r ? `<input type="hidden" name="service_kind" value="${service?.kind ?? 'service'}">` :
      choice('service_kind', 'Report purpose', ['service', 'facility_default'], service?.kind ?? 'service')}
    <p class="sub">A facility default records rules for one reported provider. Its policy source must use the planner:facility_policy namespace. Leave its backing resources, provider routes and contacts empty. It will not appear as an assessable service.</p>
    ${choice('offer_state', 'Listing state', r?.state === 'withdrawn' ? ['withdrawn', 'listed', 'unknown'] : ['unknown', 'listed'], r?.state)}
    ${text('provider', 'Provider source reference', nativeRef(r?.provider), 'placeholder="source:facility provider-id"')}
    <p class="sub">Use a namespace, native identifier and optional version. Leave a list blank to mark it unknown or inherit a recorded facility default; enter a single dash to state an empty list.</p>
    ${area('methods', 'Reported methods (one reference per line)', refsText(terms?.methods))}
    ${area('inputs', 'Accepted inputs (one reference per line)', refsText(terms?.accepted_inputs))}
    ${area('exclusions', 'Excluded materials (one reference per line)', refsText(r?.material_exclusions))}
    ${area('outputs', 'Output deliverables (one reference per line)', refsText(terms?.output_deliverables))}
    <fieldset class="opts"><legend>Delivery modes (leave clear if unknown)</legend><div class="row">
      ${modes.map(mode => `<label><input type="checkbox" name="delivery_mode" value="${mode}"${terms?.delivery_modes?.includes(mode) ? ' checked' : ''}> ${mode.replaceAll('_', ' ')}</label>`).join('')}</div></fieldset>
    <div class="row">${choice('price_basis', 'Reported price basis', bases, terms?.price?.basis)}
      ${text('price_amount', 'Reported price amount (optional decimal)', terms?.price?.amount)}
      ${text('price_currency', 'Currency code (optional)', terms?.price?.currency)}</div>
    ${text('price_details', 'Price details (optional)', terms?.price?.details)}
    ${area('routes', 'Provider links (enquiry, quote or booking, followed by a plain HTTPS URL)', routesText(terms?.routes))}
    <p class="sub">Use exact JSON for reported lead times and linked source evidence. The workspace never contacts a provider.</p>
    <fieldset class="opts"><legend>Reported policy version</legend>
      ${text('policy_source', 'Offer policy source and version', nativeRef(p?.revision.source))}
      ${text('policy_digest', 'Offer policy SHA-256', p?.revision.content_digest, 'placeholder="sha256:…"')}
      <div class="row">${text('effective_from', 'Policy effective from', p?.effective_from, 'type="date"')}${text('effective_until', 'Policy effective until (inclusive)', p?.effective_until, 'type="date"')}</div>
      ${text('external_policy_source', 'External facility default source and version (optional)', nativeRef(external?.source))}
      ${text('external_policy_digest', 'External facility default SHA-256 (optional)', external?.content_digest)}
    </fieldset>
    <fieldset class="opts"><legend>Reported contact roles (private, unverified)</legend>${Object.entries(contactRoles).map(([role, label]) =>
      text(role, label + ' (optional)', service?.contacts[role], 'maxlength="160"')).join('')}</fieldset>`;
}

const nullable = s => s || null;
function policyInput(get, prefix, prior) {
  const source = readNativeRef(get(prefix + 'source'), prior?.source), digest = get(prefix + 'digest');
  if (!source && !digest) return null;
  if (!source?.version || !/^sha256:[0-9a-f]{64}$/.test(digest)) throw Error('Provide the policy source version and its SHA-256 digest.');
  return {source, content_digest: digest};
}
export function readOffer(base, node, get) {
  const p = base?.access_policy, revision = policyInput(get, 'policy_', p?.revision);
  const selected = get('local_default'), external = policyInput(get, 'external_policy_', p?.facility_default);
  if (selected && external) throw Error('Choose either a local facility default or an external facility default reference.');
  if (!revision && (selected || external || get('effective_from') || get('effective_until'))) throw Error('Record the offer policy version and digest before setting a policy date or facility default.');
  const local = selected ? JSON.parse(selected) : null;
  const facility_default = local ? {source: {namespace: 'planner:registry_offer', native_id: local.record_id, version: local.revision_id},
    content_digest: local.content_digest} : external;
  const selectedRefs = name => {
    const pins = [...node.querySelector(`[name="${name}"]`).selectedOptions].map(option => JSON.parse(option.value));
    return pins.length ? pins : base?.[name]?.length === 0 ? [] : null;
  };
  const previous = base?.terms;
  const delivery = [...node.querySelectorAll('[name=delivery_mode]:checked')].map(c => c.value);
  const priceBasis = get('price_basis');
  return {record_type: 'offer', label: get('label'), state: get('offer_state'), provider: readNativeRef(get('provider'), base?.provider),
    backing_installations: selectedRefs('backing_installations'), backing_configurations: selectedRefs('backing_configurations'),
    external_id_claims: base?.external_id_claims ?? [],
    access_policy: revision ? {revision, facility_default, effective_from: nullable(get('effective_from')), effective_until: nullable(get('effective_until'))} : null,
    material_exclusions: readRefs(get('exclusions'), base?.material_exclusions),
    terms: {methods: readRefs(get('methods'), previous?.methods), accepted_inputs: readRefs(get('inputs'), previous?.accepted_inputs),
      output_deliverables: readRefs(get('outputs'), previous?.output_deliverables), delivery_modes: delivery.length ? delivery : null,
      price: priceBasis === 'unknown' ? null : {basis: priceBasis, amount: nullable(get('price_amount')),
        currency: nullable(get('price_currency')), details: nullable(get('price_details'))}, lead_times: previous?.lead_times ?? null,
      routes: readRoutes(get('routes'))}};
}
export const readServiceMetadata = get => ({kind: get('service_kind'), contacts: Object.fromEntries(
  Object.keys(contactRoles).map(k => [k, get(k)]).filter(([, value]) => value))});

export function claimFields(kind, r) {
  return kind === 'access_claim' ?
    `<div class="row">${choice('dimension', 'Access dimension', ['provider_willingness', 'eligibility', 'training'], r?.dimension)}
    ${choice('access_outcome', 'Reported access outcome', ['unknown', 'affirmed', 'denied'], r?.outcome)}</div>
    ${choice('subject_kind', 'Subject scope', ['public', 'organisation', 'principal'], r?.subject.kind)}
    ${text('subject_id', 'Exact subject ID (principal only; choose restricted visibility)', r?.subject.kind === 'principal' ? r.subject.id : '')}
    <p class="sub">The organisation scope uses this workspace’s exact ID. A reported outcome and a review do not verify access or training.</p>` :
    `<div class="row">${choice('availability_state', 'Reported availability', ['unknown', 'available', 'unavailable'], r?.state)}
    ${text('window_start', 'Reported window starts (optional UTC timestamp)', r?.window?.starts_at)}
    ${text('window_end', 'Reported window ends (optional UTC timestamp)', r?.window?.ends_at)}</div>
    <p class="sub">Reported availability describes the dated observation; it is not a live schedule.</p>`;
}
export function readServiceClaim(kind, r, target, get, observed_at, valid_until, organisation) {
  const common = {record_type: kind, target, observed_at, valid_until, supporting_assertions: r?.supporting_assertions ?? []};
  if (kind === 'availability_claim') {
    const starts_at = get('window_start'), ends_at = get('window_end');
    if (Boolean(starts_at) !== Boolean(ends_at)) throw Error('Enter both timestamps for a reported window, or leave both blank.');
    return {...common, state: get('availability_state'), window: starts_at ? {starts_at, ends_at} : null};
  }
  const subject = get('subject_kind');
  return {...common, dimension: get('dimension'), outcome: get('access_outcome'),
    subject: {kind: subject, id: subject === 'principal' ? get('subject_id') : subject === 'organisation' ? organisation : null}};
}
