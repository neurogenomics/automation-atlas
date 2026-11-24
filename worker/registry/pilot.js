import {date, hash, refOf, refShape, sameRef} from './contract.js';
import {recordStatus} from './service.js';

export const pilotLeadLimit = 24;
export const pilotCohortLimit = 8;
const id = /^[a-z0-9-]{1,128}$/;
const shape = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max &&
  value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
// Store opaque evidence identifiers or digests, never source documents or credentials.
const evidence = (value, today) => shape(value, ['reference', 'observed_on']) &&
  typeof value.reference === 'string' && /^(?:ref:[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,239}|sha256:[0-9a-f]{64})$/.test(value.reference) &&
  date(value.observed_on) && value.observed_on <= today;
const option = (value, options, today) => shape(value, ['state', 'evidence']) && options.includes(value.state) &&
  (value.evidence === null ? value.state === options[0] : evidence(value.evidence, today));
const dated = (value, from, today) => value === null || date(value) && value >= from && value <= today;
const factName = ({kind, label}) => kind + ':' + label;
const validFactName = fact => ['module', 'interface'].includes(fact.kind) && text(fact.label, 120);
const uniqueFacts = facts => new Set(facts.map(factName)).size === facts.length;

export async function pilotVersion(org, {cohort_id, seq, actor, saved_at, reason, snapshot}, previous_version) {
  const digest = await hash({format: 'planner-registry-pilot-version/1', org, cohort_id, seq, actor, saved_at,
    reason, snapshot, previous_version});
  return digest.replace('sha256:', '');
}

export function validPilot(bundle, org, value, now) {
  const today = now.slice(0, 10);
  if (!shape(value, ['name', 'scope', 'starts_on', 'ends_on', 'required_facts', 'leads']) || !text(value.name, 120) || !text(value.scope, 400) ||
    !date(value.starts_on) || !date(value.ends_on) || value.ends_on < value.starts_on ||
    !Array.isArray(value.required_facts) || value.required_facts.length > 12 ||
    !value.required_facts.every(fact => shape(fact, ['kind', 'label']) && validFactName(fact)) ||
    !uniqueFacts(value.required_facts) || !Array.isArray(value.leads) || value.leads.length > pilotLeadLimit) return false;
  const ids = new Set(), installations = new Set();
  return value.leads.every(lead => {
    if (!shape(lead, ['id', 'label', 'identified_on', 'invited_on', 'replied_on', 'reviewed_on', 'responsible', 'steward',
      'overlap', 'referral', 'access', 'support', 'facts', 'review', 'decision']) || typeof lead.id !== 'string' ||
      !id.test(lead.id) || ids.has(lead.id) || !text(lead.label, 120) ||
      !date(lead.identified_on) || lead.identified_on < value.starts_on || lead.identified_on > value.ends_on ||
      lead.identified_on > today || !dated(lead.invited_on, lead.identified_on, today) ||
      !dated(lead.replied_on, lead.identified_on, today) ||
      !dated(lead.reviewed_on, lead.identified_on, today)) return false;
    ids.add(lead.id);
    const {responsible, steward, review, decision, facts} = lead;
    if (responsible !== null && !(shape(responsible, ['label', 'role', 'evidence']) && text(responsible.label, 120) &&
      ['owner', 'operator'].includes(responsible.role) && evidence(responsible.evidence, today))) return false;
    if (steward !== null && !(shape(steward, ['label', 'consent', 'evidence']) && text(steward.label, 120) &&
      ['unknown', 'declined', 'attested'].includes(steward.consent) &&
      (steward.evidence === null ? steward.consent === 'unknown' : evidence(steward.evidence, today)))) return false;
    if (!option(lead.overlap, ['unchecked', 'clear', 'possible', 'duplicate'], today) ||
      !option(lead.referral, ['none', 'suggested', 'followed_up', 'closed'], today) ||
      !option(lead.access, ['unknown', 'reported_available', 'conditional', 'inaccessible'], today) ||
      !option(lead.support, ['unknown', 'reported_available', 'conditional', 'unavailable'], today)) return false;
    if (!Array.isArray(facts) || facts.length > 12 ||
      !facts.every(fact => shape(fact, ['kind', 'label', 'state', 'evidence']) && validFactName(fact) && ['unknown', 'reported_present', 'reported_absent'].includes(fact.state) &&
        (fact.evidence === null ? fact.state === 'unknown' : evidence(fact.evidence, today))) ||
      !uniqueFacts(facts)) return false;
    if (review !== null) {
      if (!shape(review, ['pin', 'expires_on']) || !lead.reviewed_on || !date(review.expires_on) ||
        review.expires_on <= lead.reviewed_on || !refShape(bundle, review.pin) ||
        review.pin.organisation_id !== org || review.pin.record_type !== 'installation' ||
        installations.has(review.pin.record_id)) return false;
      installations.add(review.pin.record_id);
    }
    return decision === null || shape(decision, ['outcome', 'decided_on', 'summary', 'before', 'after']) &&
      ['changed', 'uncertainty_resolved', 'no_change'].includes(decision.outcome) && text(decision.summary, 400) &&
      decision.decided_on !== null && dated(decision.decided_on, lead.identified_on, today) &&
      evidence(decision.before, decision.decided_on) && evidence(decision.after, decision.decided_on) &&
      decision.before.observed_on <= decision.after.observed_on;
  });
}

export function pilotReviewFits(lead, row, now) {
  return row && sameRef(lead.review.pin, refOf(row.wire)) && row.action === 'review' && row.wire.sources.length > 0 && !recordStatus(row, now) &&
    row.wire.recorded_at <= now && row.wire.recorded_at.slice(0, 10) <= lead.reviewed_on &&
    lead.review.expires_on > now.slice(0, 10);
}

export function pilotReport(cohort, currentRows, now) {
  const leads = cohort.leads.map(lead => {
    const row = currentRows.get(lead.review?.pin.record_id);
    const known = new Set(lead.facts.filter(fact => fact.state !== 'unknown').map(factName));
    const outstanding_facts = cohort.required_facts.filter(fact => !known.has(factName(fact)));
    const complete = lead.responsible && lead.steward?.consent === 'attested' && lead.overlap.state === 'clear' &&
      lead.access.state !== 'unknown' && lead.support.state !== 'unknown' && cohort.required_facts.length > 0 &&
      outstanding_facts.length === 0;
    const review_condition = !lead.review ? null : row && recordStatus(row, now) === 'expired' ? 'installation expired' :
      lead.review.expires_on <= now.slice(0, 10) ? 'reconfirmation due' :
      !pilotReviewFits(lead, row, now) ? 'installation revision changed' : null;
    const review_status = !lead.review ? 'unverified' : review_condition ? 'stale' : complete ? 'verified' : 'reviewed';
    return {...lead, review_status, review_condition, outstanding_facts};
  });
  const count = predicate => leads.filter(predicate).length;
  const total = leads.length, invited = count(l => l.invited_on), reviewed = count(l => l.reviewed_on);
  const metrics = {
    identified: [total, total],
    invited: [invited, total],
    replied: [count(l => l.replied_on), total],
    reviewed: [reviewed, total],
    verified: [count(l => l.review_status === 'verified'), reviewed],
    inaccessible: [count(l => l.access.state === 'inaccessible'), total],
    stale: [count(l => l.review_status === 'stale'), total],
    response: [count(l => l.invited_on && l.replied_on && l.replied_on >= l.invited_on), invited],
  };
  return {as_of: now, external_authority: 'unverified', leads, metrics};
}
