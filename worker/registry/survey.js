// Planner-local form vocabulary. These labels are also the only shareable text.
import {inventorySections} from '../../lib/registry-inventory.js';

const sections = new Set(inventorySections.map(([id]) => id));
const shape = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) &&
  Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const brief = (s, n) => typeof s === 'string' && s === s.trim() && s.length <= n &&
  !/[\u0000-\u001f\u007f]/.test(s);
const identifier = (s, n) => brief(s, n) && !!s && /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(s) &&
  !s.includes('://') && !s.includes('..') && !s.includes('@');
const reportStates = ['unknown', 'present', 'absent'];
const statuses = ['not_prepared', 'draft', 'ready_for_review', 'reviewed'];

function evidenceOK(e, date, today) {
  return e === null || shape(e, ['kind', 'value', 'observed_at']) && date(e.observed_at) && e.observed_at <= today &&
    (e.kind === 'reference' && identifier(e.value, 160) || e.kind === 'sha256' && typeof e.value === 'string' && /^[a-f0-9]{64}$/.test(e.value));
}

export function validSurveyDraft(v, {date, today}) {
  return shape(v, ['step', 'answers', 'enquiry']) && sections.has(v.step) &&
    v.answers && typeof v.answers === 'object' && !Array.isArray(v.answers) &&
    Object.entries(v.answers).every(([key, a]) => sections.has(key) && shape(a, ['status', 'detail', 'evidence', 'connections']) &&
      [...reportStates, 'referral'].includes(a.status) && brief(a.detail, 1000) && evidenceOK(a.evidence, date, today) &&
      Array.isArray(a.connections) && a.connections.length <= 12 &&
      (a.status !== 'referral' || a.evidence === null && !a.connections.length) &&
      (key === 'connections' || !a.connections.length) && a.connections.every(c =>
        shape(c, ['endpoint', 'interface', 'status', 'evidence']) && identifier(c.endpoint, 160) &&
        identifier(c.interface, 160) && reportStates.includes(c.status) && c.evidence !== null && evidenceOK(c.evidence, date, today)) &&
      new Set(a.connections.map(c => JSON.stringify([c.endpoint, c.interface]))).size === a.connections.length) &&
    shape(v.enquiry, ['status', 'sections']) && statuses.includes(v.enquiry.status) &&
    Array.isArray(v.enquiry.sections) && v.enquiry.sections.length <= sections.size &&
    new Set(v.enquiry.sections).size === v.enquiry.sections.length && v.enquiry.sections.every(s => sections.has(s)) &&
    (v.enquiry.status === 'not_prepared' ? v.enquiry.sections.length === 0 : v.enquiry.sections.length > 0);
}

export function surveyProjection(draft) {
  const selected = new Set(draft.enquiry.sections);
  return ['Hello,', '', 'Could you help confirm the following general equipment information?', '',
    ...inventorySections.filter(([id]) => selected.has(id)).map(([, , , question]) => '- ' + question), '',
    'If you are unsure, please say so or suggest the role that could answer.', '', 'Thank you.'].join('\n');
}
