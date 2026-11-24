// Planner's bounded service assessment. C12 evidence remains reported.
import {canonical, LOCAL_DEFAULT, localDefaultRef, recordLinks, refOf, sameRef} from './contract.js';
import {cmp, decimal} from '../../lib/reviewed/quantity.js';

export const serviceClaims = ['access_claim', 'availability_claim'];
const contactRoles = ['provider_contact', 'custodian', 'operator', 'access_approver'];
const keysAre = (x, required, optional = []) => x && typeof x === 'object' && !Array.isArray(x) &&
  required.every(k => Object.hasOwn(x, k)) && Object.keys(x).every(k => required.includes(k) || optional.includes(k));
export const validServiceMetadata = (r, s) => s === null || r.record_type === 'offer' &&
  keysAre(s, ['kind', 'contacts']) && ['service', 'facility_default'].includes(s.kind) &&
  keysAre(s.contacts, [], contactRoles) && Object.values(s.contacts).every(v =>
    typeof v === 'string' && v.trim() === v && !!v && v.length <= 160 && !/[\u0000-\u001f\u007f]/.test(v));
const FACILITY_POLICY = 'planner:facility_policy';
const defaultMarker = r => r.record_type === 'offer' && r.access_policy?.revision.source.namespace === FACILITY_POLICY;
export const isFacilityDefault = ({wire}) => defaultMarker(wire.record);
const sourceIdentity = s => s ? [s.namespace, s.native_id, s.version ?? null] : null;
const sameSource = (a, b) => a !== null && b !== null && canonical(sourceIdentity(a)) === canonical(sourceIdentity(b));
export const assessmentAllowed = w => w.use_rights.assessment === 'permitted' &&
  w.sources.every(src => src.use_rights.assessment === 'permitted');

export function safeOfferUrl(value) {
  try {
    const url = new URL(value);
    return value.startsWith('https://') && !/[?#\\]/.test(value) && !url.username && !url.password &&
      !url.port && url.hostname.includes('.') && !url.hostname.endsWith('.local') && !url.hostname.endsWith('.localhost') &&
      !/^\d+(\.\d+)+$/.test(url.hostname) ? url.href : null;
  } catch { return null; }
}

export function validServiceRecord(w, {service, observed_at, expires_at, visibility}) {
  const r = w.record;
  if (!validServiceMetadata(r, service)) return false;
  if (r.record_type === 'offer') {
    const p = r.access_policy;
    if (p?.effective_from && p.effective_until && p.effective_from > p.effective_until ||
      p?.revision.source.namespace === LOCAL_DEFAULT ||
      p?.facility_default?.source.namespace === LOCAL_DEFAULT && p.facility_default.source.url !== undefined ||
      (r.terms.routes ?? []).some(route => !safeOfferUrl(route.url))) return false;
    if (defaultMarker(r) !== (service?.kind === 'facility_default')) return false;
    if (defaultMarker(r)) return !!r.provider && !!p && !p.facility_default &&
      !!p.effective_from && !r.backing_installations?.length && !r.backing_configurations?.length &&
      !r.terms.routes?.length && !Object.keys(service.contacts).length;
    return true;
  }
  if (!serviceClaims.includes(r.record_type)) return true;
  if (visibility === 'public' || r.record_type === 'access_claim' && r.subject.kind === 'principal' && visibility !== 'restricted' ||
    r.record_type === 'access_claim' && r.subject.kind === 'organisation' && r.subject.id !== w.organisation_id) return false;
  return r.observed_at === observed_at && r.valid_until === expires_at &&
    (r.record_type !== 'availability_claim' || !r.window || Date.parse(r.window.starts_at) < Date.parse(r.window.ends_at));
}

export function validRecordLink(w, linked, ref) {
  const r = w.record, l = linked.wire.record;
  if (ref.record_id === w.record_id) return false;
  if (ref.record_type === 'assertion') {
    const dimension = r.claim_kind ?? r.dimension ?? 'availability';
    return l.claim_kind === dimension && sameRef(l.target, r.target);
  }
  if (r.record_type === 'offer' && ref.record_type === 'offer') {
    return isFacilityDefault(linked) && sameSource(r.provider, l.provider) &&
      sameRef(ref, localDefaultRef(r, w.organisation_id));
  }
  return true;
}

const policyDate = (p, now) => p?.effective_until && now > p.effective_until ? 'expired' :
  !p?.effective_from ? 'dates_unknown' : now < p.effective_from ? 'not_yet_effective' : 'effective';
export function recordStatus(row, now) {
  const r = row.wire.record;
  if (row.state === 'retired') return 'retired';
  if (row.expires_at !== null && Date.parse(row.expires_at) <= Date.parse(now)) return 'expired';
  if (['withdrawn', 'superseded'].includes(r.state)) return r.state;
  if (r.state === 'disputed' || row.action === 'review_disputed') return 'disputed';
  if (r.record_type === 'availability_claim' && r.window &&
    (Date.parse(r.window.starts_at) > Date.parse(now) || Date.parse(r.window.ends_at) <= Date.parse(now))) return 'outside_reported_window';
  if (r.record_type === 'offer') {
    const date = policyDate(r.access_policy, now.slice(0, 10));
    if (date === 'expired' || date === 'not_yet_effective') return 'policy_' + date;
  }
  return null;
}

function selectPolicy(offer, get, now) {
  const r = offer.wire.record, p = r.access_policy, fallback = localDefaultRef(r, offer.wire.organisation_id);
  const local = fallback ? get(fallback) : null, inherited = local?.row.wire.record;
  const effective = policyDate(p, now);
  const fallbackStatus = !p?.facility_default ? 'not_stated' : !fallback ? 'external_rules_unavailable' :
    local.status !== 'current' ? local.status : inherited.state !== 'listed' ? 'listing_state_unknown' : policyDate(inherited.access_policy, now);
  const values = {methods: r.terms.methods, accepted_inputs: r.terms.accepted_inputs, material_exclusions: r.material_exclusions};
  const defaults = {methods: inherited?.terms.methods, accepted_inputs: inherited?.terms.accepted_inputs,
    material_exclusions: inherited?.material_exclusions};
  const fields = Object.fromEntries(Object.entries(values).map(([key, value]) =>
    [key, value !== null ? 'offer' : fallbackStatus === 'effective' && defaults[key] != null ? 'facility_default' : 'unknown']));
  return {policy: {offer: p, status: effective, facility_default: fallback,
    facility_default_status: fallbackStatus, facility_default_dates: inherited?.access_policy ?? null, fields,
    precedence: 'An explicit offer field replaces the facility default for that field. Null inherits only an explicit, current local default. A material exclusion takes priority over an accepted input.'},
    values: Object.fromEntries(Object.keys(values).map(key =>
      [key, fields[key] === 'facility_default' ? defaults[key] : values[key]]))};
}
function ruleMatch(rules, input) {
  if (!rules || !input) return 'unknown';
  let uncertain = false;
  for (const rule of rules) {
    if (rule.namespace !== input.namespace || rule.native_id !== input.native_id) continue;
    if (rule.version === undefined || rule.version === input.version) return 'matches';
    if (input.version === undefined) uncertain = true;
  }
  return uncertain ? 'unknown' : 'not_listed';
}

function envelopeFit(envelope, request) {
  if (envelope.conditions === null || envelope.conditions.some(c => !request.conditions.includes(c))) return 'unknown';
  const required = new Map(request.requirements.map(r => [r.observable_id, r]));
  const seen = new Set();
  let unknown = !required.size;
  for (const {observable_id, operator, threshold: t} of envelope.all_of) {
    const point = required.get(observable_id);
    if (!point || t.value === null || !t.reference || !point.reference || t.reference.conditions.length ||
      t.reference.kind !== point.reference.kind || t.reference.id !== point.reference.id ||
      t.dimension === 'pressure' && (t.reference.kind !== 'declared' || !['absolute', 'gauge'].includes(t.reference.id)) ||
      t.dimension === null || t.unit === null || t.basis === null || ['dimension', 'unit', 'basis'].some(k => t[k] !== point[k])) { unknown = true; continue; }
    seen.add(observable_id);
    const ratio = typeof t.value === 'string' ? decimal(t.value) :
      {n: BigInt(t.value.numerator), d: BigInt(t.value.denominator)};
    const diff = cmp(decimal(point.value), ratio);
    if (!({lt: diff < 0, lte: diff <= 0, eq: diff === 0, gte: diff >= 0, gt: diff > 0})[operator]) return 'outside_limits';
  }
  return unknown || seen.size !== required.size ? 'unknown' : 'reported_fit';
}

function alternatives(offer, request, get, hypothetical) {
  const r = offer.wire.record;
  const configs = (r.backing_configurations ?? []).map(configuration => {
    const c = get(configuration);
    const installation = c.row.wire.record.installation;
    const i = get(installation);
    const declared = !r.backing_installations?.length || r.backing_installations.some(ref => sameRef(ref, installation));
    const selected = hypothetical?.configuration === configuration.revision_id ? hypothetical : null;
    const required = request.required_modules ?? [];
    const inventory = c.row.wire.record.fitted_modules;
    const items = new Map(inventory?.items.map(m => [m.module_id, m.state]) ?? []);
    const fitted = required.filter(id => items.get(id) === 'reported_fitted');
    const missing = required.filter(id => items.get(id) === 'reported_absent');
    const unknown = required.filter(id => !fitted.includes(id) && !missing.includes(id));
    const active = c.status === 'current' && i.status === 'current' && declared;
    const envelopes = active ? (c.row.wire.record.operating_envelopes ?? []).map(e => ({id: e.envelope_id,
      status: envelopeFit(e, selected?.envelope === e.envelope_id ? {...request, conditions: selected.conditions} : request)})) : [];
    const envelopeStatus = envelopes.some(e => e.status === 'reported_fit') ? 'reported_fit' :
      envelopes.length && envelopes.every(e => e.status === 'outside_limits') ? 'outside_limits' : 'unknown';
    return {configuration, installation, configuration_status: c.status, installation_status: i.status,
      ...(declared ? {} : {reason: 'configuration_installation_not_pinned_in_offer'}),
      ...(required.length ? {required_modules: {fitted, missing, unknown}} : {}),
      technical_fit: !active ? 'unknown' : missing.length || unknown.length && selected?.modules === 'absent' ? 'outside_limits' :
        unknown.length && selected?.modules !== 'present' && envelopeStatus !== 'outside_limits' ? 'unknown' : envelopeStatus,
      envelopes};
  });
  const unconfigured = (r.backing_installations ?? []).filter(ref => !configs.some(c => sameRef(c.installation, ref)))
    .map(installation => ({configuration: null, installation, installation_status: get(installation).status,
      technical_fit: 'unknown', envelopes: []}));
  return [...configs, ...unconfigured];
}

const dimensions = ['provider_willingness', 'eligibility', 'training', 'availability'];
function reportedClaims(rows, target, get, hypothetical) {
  const reports = rows.filter(row => row.wire.record.target.record_id === target.record_id).map(row => {
    const r = row.wire.record, reference = refOf(row.wire);
    const pending = [...r.supporting_assertions], assertions = [], seen = new Set();
    while (pending.length) {
      const ref = pending.shift();
      if (seen.has(ref.revision_id)) continue;
      seen.add(ref.revision_id);
      const dependency = get(ref), a = dependency.row.wire.record;
      assertions.push({reference: ref, status: dependency.status, outcome: a.outcome});
      pending.push(...a.related_assertions);
    }
    const outcome = r.outcome ?? r.state;
    const expected = {available: 'affirmed', unavailable: 'denied'}[outcome] ?? outcome;
    const opposite = assertions.some(a => ['current', 'disputed'].includes(a.status) &&
      a.outcome !== 'unknown' && expected !== 'unknown' && a.outcome !== expected);
    const status = !sameRef(r.target, target) || get(r.target).status !== 'current' ? 'historical_target' :
      get(reference).status !== 'current' ? get(reference).status :
        opposite ? 'contradictory_support' : assertions.some(a => a.status !== 'current') ? 'stale_support' : 'current';
    return {reference, dimension: r.dimension ?? 'availability', scope: r.subject?.kind ?? 'target',
      outcome, observed_at: r.observed_at, valid_until: r.valid_until,
      ...(r.record_type === 'availability_claim' ? {window: r.window} : {}), status, assertions};
  });
  const summary = Object.fromEntries(dimensions.map(d => {
    const current = reports.filter(r => r.dimension === d && ['current', 'disputed'].includes(r.status) && r.outcome !== 'unknown');
    const outcomes = new Set(current.map(r => r.outcome));
    if (hypothetical?.dimension === d) outcomes.add(hypothetical.outcome);
    const conflict = reports.some(r => r.dimension === d && r.status === 'contradictory_support');
    return [d, {reported_status: outcomes.size > 1 ? 'conflicting_reports' : conflict || current.some(r => r.status === 'disputed') ? 'disputed' :
      outcomes.size ? 'reported_' + [...outcomes][0] : 'unknown', verified_status: 'unknown'}];
  }));
  return {target, dimensions: summary, reports};
}

export function assessService(offer, request, rows, get, now, hypothetical = null) {
  const r = offer.wire.record, ref = refOf(offer.wire);
  const {policy, values} = selectPolicy(offer, get, now.slice(0, 10));
  const configurations = alternatives(offer, request, get, hypothetical);
  const targets = new Map([ref, ...configurations.flatMap(c => [c.configuration, c.installation]).filter(Boolean)]
    .map(t => [t.revision_id, t]));
  const evidence = [...targets.values()].map(target => reportedClaims(rows, target, get,
    hypothetical?.target === target.revision_id ? hypothetical : null));
  const evidenceByRevision = new Map(evidence.map(e => [e.target.revision_id, e.dimensions]));
  function reportedAccess(refs) {
    const reports = refs.filter(Boolean).flatMap(ref => Object.entries(evidenceByRevision.get(ref.revision_id) ?? {})
      .filter(([dimension]) => dimension !== 'availability').map(([, value]) => value.reported_status));
    return reports.includes('reported_denied') ? 'reported_denied' :
      reports.some(s => ['conflicting_reports', 'disputed'].includes(s)) ? 'unresolved_reports' : 'unverified';
  }
  for (const candidate of configurations)
    candidate.access_status = reportedAccess([ref, candidate.installation, candidate.configuration]);
  const fitCandidates = configurations.filter(c => c.technical_fit === 'reported_fit');
  const access = reportedAccess([ref]) === 'reported_denied' || fitCandidates.length &&
    fitCandidates.every(c => c.access_status === 'reported_denied') ? 'reported_denied' :
      reportedAccess([ref]) === 'unresolved_reports' || fitCandidates.some(c => c.access_status === 'unresolved_reports') ?
        'unresolved_reports' : 'unverified';
  const method = ruleMatch(hypothetical?.method ?? values.methods, request.method);
  const accepted = ruleMatch(values.accepted_inputs, request.material), excluded = ruleMatch(values.material_exclusions, request.material);
  const material = excluded === 'matches' ? 'excluded' :
    accepted === 'not_listed' ? 'not_listed' : excluded === 'unknown' || accepted === 'unknown' ? 'unknown' : 'listed';
  const technical = configurations.some(c => c.technical_fit === 'reported_fit') ? 'reported_fit' :
    configurations.length && configurations.every(c => c.technical_fit === 'outside_limits') ? 'no_joint_fit' : 'unknown';
  const closure = [ref], seen = new Set();
  let stale = false;
  while (closure.length) {
    const pin = closure.pop();
    if (seen.has(pin.revision_id)) continue;
    seen.add(pin.revision_id);
    const dependency = get(pin);
    if (dependency.status !== 'current') stale = true;
    closure.push(...recordLinks(dependency.row.wire.record, pin.organisation_id));
  }
  const offerStatus = get(ref).status;
  const route = offerStatus === 'withdrawn' || offerStatus === 'retired' ? offerStatus :
    stale || policy.status !== 'effective' ? 'policy_or_evidence_needs_recheck' :
      material === 'excluded' || material === 'not_listed' || method === 'not_listed' ? 'outside_reported_policy' :
        access === 'reported_denied' ? 'reported_access_denied' :
          r.state !== 'listed' || method !== 'matches' || material !== 'listed' ? 'reported_policy_incomplete' :
            technical === 'no_joint_fit' ? 'no_joint_fit' : technical !== 'reported_fit' ? 'technical_fit_unknown' : 'reported_fit_access_unverified';
  return {evaluated_at: now, offer: ref, offer_status: offerStatus, technical_fit: technical, configurations,
    policy, method, material, evidence, access, route, authority: 'unverified', execution_authorized: false, booking_created: false,
    enquiry_routes: offerStatus === 'current' && r.state === 'listed' && !stale ?
      (r.terms.routes ?? []).map(({kind, url}) => ({kind, url: safeOfferUrl(url)})).filter(x => x.url) : []};
}

const matchKeys = ['expected_head', 'method', 'material', 'requirements', 'conditions'];
export function validMatchInput(input, {sourceRef, revisionRef}) {
  const symbol = (s, n) => typeof s === 'string' && s.trim() === s && s.length > 0 &&
    s.length <= n && !/[\u0000-\u001f\u007f]/.test(s);
  return keysAre(input, matchKeys, ['required_modules']) &&
    (!Object.hasOwn(input, 'required_modules') || Array.isArray(input.required_modules) && input.required_modules.length <= 12 &&
      new Set(input.required_modules).size === input.required_modules.length && input.required_modules.every(m => symbol(m, 128))) && revisionRef(input.expected_head) && input.expected_head.record_type === 'offer' &&
    [input.method, input.material].every(ref => ref === null || sourceRef(ref) &&
      ref.url === undefined && symbol(ref.native_id, 256) && (ref.version === undefined || symbol(ref.version, 128))) &&
    Array.isArray(input.requirements) && input.requirements.length <= 16 &&
    new Set(input.requirements.map(r => r?.observable_id)).size === input.requirements.length &&
    input.requirements.every(r => keysAre(r, ['observable_id', 'value', 'dimension', 'unit', 'basis', 'reference']) &&
      (r.reference === null || keysAre(r.reference, ['kind', 'id']) &&
        (r.reference.kind === 'none' && r.reference.id === null || r.reference.kind === 'declared' && symbol(r.reference.id, 128))) &&
      ['observable_id', 'dimension', 'unit', 'basis'].every(k => symbol(r[k], 128)) && typeof r.value === 'string' &&
      r.value.length <= 128 && r.value.trim() === r.value && /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(r.value)) &&
    Array.isArray(input.conditions) && input.conditions.length <= 16 &&
    new Set(input.conditions).size === input.conditions.length && input.conditions.every(c => symbol(c, 160));
}

// Alternatives are ephemeral, scoped to the same view and exact snapshot as
// the base assessment. They cannot be accepted as saved match inputs.
export function decisionQuestions(offer, input, reports, get, now, baseline) {
  if (baseline.offer_status !== 'current' || offer.wire.record.state !== 'listed' ||
    baseline.route === 'policy_or_evidence_needs_recheck') return [];
  const output = [];
  const summarize = (r, target, dimension) => ({
    route: r.route, technical_fit: r.technical_fit, method: r.method, material: r.material, access: r.access,
    ...(dimension ? {reported_status: r.evidence.find(e => e.target.revision_id === target).dimensions[dimension].reported_status} : {}),
    ...(target && target !== r.offer.revision_id ? {
      configuration_fit: r.configurations.find(c => c.configuration?.revision_id === target)?.technical_fit ?? 'unknown',
    } : {}),
  });
  const add = (id, question, who, why, options, {target, dimension} = {}) => {
    const before = summarize(baseline, target, dimension);
    const alternatives = options.map(([label, changes]) => ({label,
      consequence: summarize(assessService(offer, input, reports, get, now, changes), target, dimension)}));
    if (alternatives.some(a => canonical(a.consequence) !== canonical(before)))
      output.push({id, question, who, why, scope: 'Private assessment · visible only to the assessor',
        before, alternatives, changes_route: alternatives.some(a => a.consequence.route !== before.route)});
  };
  const target = baseline.offer.revision_id;
  const current = baseline.evidence.find(e => sameRef(e.target, baseline.offer));
  for (const [dimension, who, question, why] of [
    ['training', 'Training coordinator', 'Would training meet this offer’s requirement for the assessed scope?', 'A denial can block this option. A positive report does not grant access.'],
    ['eligibility', 'Access approver', 'Is the assessed scope eligible for this service?', 'Eligibility can block the option independently of training or availability.'],
    ['provider_willingness', 'Service operator', 'Is the provider willing to consider this request?', 'Willingness is distinct from eligibility and booking.'],
    ['availability', 'Booking coordinator', 'Is the service reported available for this request?', 'Availability can change without changing technical fit or granting a booking.'],
  ]) {
    if (current.dimensions[dimension].reported_status !== 'unknown') continue;
    const options = dimension === 'availability' ? [['Reported available', 'available'], ['Reported unavailable', 'unavailable']] :
      [['Reported yes', 'affirmed'], ['Reported no', 'denied']];
    add(dimension, question, who, why, options.map(([label, outcome]) => [label, {target, dimension, outcome}]),
      {target, dimension});
  }
  if (input.method && baseline.method === 'unknown' && baseline.policy.fields.methods === 'unknown')
    add('method', 'Does the reported policy list this exact method?', 'Service operator',
      'Listing the method can change the policy decision. Material and technical limits are evaluated separately.',
      [['Method listed', {method: [input.method]}], ['Method not listed', {method: []}]]);
  for (const candidate of baseline.configurations) {
    if (output.length >= 12) break;
    if (!candidate.configuration || candidate.configuration_status !== 'current' ||
      candidate.installation_status !== 'current' || candidate.reason) continue;
    const configuration = candidate.configuration.revision_id, modules = candidate.required_modules;
    if (modules?.missing.length) continue;
    const config = get(candidate.configuration).row.wire.record;
    for (const envelope of config.operating_envelopes ?? []) {
      if (output.length >= 12) break;
      if (envelope.conditions === null) continue;
      const missing = envelope.conditions.filter(c => !input.conditions.includes(c));
      if (!missing.length && !modules?.unknown.length) continue;
      const conditions = [...input.conditions, ...missing];
      const known = modules?.fitted.length ? ' Already reported fitted: ' + modules.fitted.join(', ') + '.' : '';
      const need = [...(modules?.unknown ?? []), ...missing].join(', ');
      add('configuration:' + configuration + ':' + envelope.envelope_id,
        'Can this configuration meet these requirements together: ' + need + '?', 'Equipment operator or integration maintainer',
        'All requested points, modules and conditions must fit on the same configuration.' + known,
        [['Confirmed together', {configuration, envelope: envelope.envelope_id, conditions, modules: 'present'}],
          ['At least one not confirmed', modules?.unknown.length && !missing.length ? {configuration, modules: 'absent'} : null]],
        {target: configuration});
    }
  }
  const priority = q => q.changes_route ? 2 :
    Number(q.alternatives.some(a => a.consequence.technical_fit !== q.before.technical_fit ||
      a.consequence.configuration_fit !== q.before.configuration_fit));
  return output.sort((a, b) => priority(b) - priority(a));
}
