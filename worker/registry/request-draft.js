import {canonical, hash, parseReview, sameRef, timestamp} from './contract.js';

export const requestSchema = 'planner/registry-service-request-input/1';
export const draftSchema = 'planner/registry-service-request/1';
const SHA = /^sha256:[0-9a-f]{64}$/;
const namespace = 'planner:reviewed_protocol';
const DAY = 86_400_000;

export function sameReviewedMethod(method, binding) {
  return method?.namespace === namespace && method.native_id === binding.protocol_id &&
    method.version === binding.interpretation_digest;
}

export function reviewedDraftBlocker(reviewed) {
  if (reviewed.record_metadata.profile !== 'batch_movement/0.2' || !reviewed.operations.length)
    return ['reviewed_profile_unresolved', 'Use a supported reviewed input with declared batch movements.'];
  if (reviewed.retained.coverage.some(entry => entry.status === 'unresolved') ||
      reviewed.findings.some(finding => finding.code === 'operation_coverage_missing'))
    return ['reviewed_coverage_unresolved', 'Resolve source coverage and operation evidence in the reviewed input.'];
  if (reviewed.operations.some(op => op.status !== 'balanced_declared_model' ||
      op.stock_sufficiency !== 'sufficient_for_declared_amount' || op.declared.unsupported_reason))
    return ['reviewed_ledger_unresolved', 'Resolve unsupported, unknown or contradictory batch movements in the reviewed input.'];
  if (reviewed.states.some(state => !state.layout?.length || state.layout.some(slot => slot.fits !== true)))
    return ['reviewed_layout_unresolved', 'Resolve unknown or exceeded physical capacity in the reviewed input.'];
  return null;
}

export function requestIdentity(assessmentId, configuration, reviewed) {
  return {assessment_id: assessmentId, configuration, reviewed_input_digest: reviewed.input_digest};
}

export async function makeDraft({org, id, now, expiry, capture, assessmentId, configuration, model, installation, reviewed, dependencies}) {
  return {
    schema: draftSchema, id, organisation_id: org, created_at: now,
    expires_at: new Date(Math.min(Date.parse(now) + DAY, expiry)).toISOString(),
    disposition: 'prepared_for_local_review', provider_outcome: null, provider_authority: 'unverified',
    sent: false, reservation_created: false, charge_created: false, execution_authorized: false,
    offer: capture.result.offer, configuration, installation, model, dependencies,
    assessment: {id: assessmentId, capture_digest: await hash(capture)},
    reviewed: {schema: reviewed.schema, release: reviewed.release, input_digest: reviewed.input_digest,
      result_digest: await hash(reviewed), binding: reviewed.binding},
  };
}

export function recordedExpiry(now, checked) {
  const candidates = [Date.parse(now) + DAY];
  for (const row of checked) {
    const {record} = row.wire;
    for (const date of [row.expires_at, record.valid_until, record.window?.ends_at]) {
      if (date) candidates.push(Date.parse(date));
    }
    const until = record.access_policy?.effective_until;
    if (until) candidates.push(Date.parse(until) + DAY);
  }
  return Math.min(...candidates);
}

export async function validateDraftRow(row, capture, org) {
  const draft = parseReview(row.draft);
  const fields = ['schema','id','organisation_id','created_at','expires_at','disposition','provider_outcome',
    'provider_authority','sent','reservation_created','charge_created','execution_authorized','offer','configuration',
    'installation','model','dependencies','assessment','reviewed'];
  const closed = (value, names) => value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === names.length && names.every(k => Object.hasOwn(value, k));
  const binding = draft.reviewed?.binding;
  if (!closed(draft, fields) || !closed(draft.assessment, ['id','capture_digest']) ||
      !closed(draft.reviewed, ['schema','release','input_digest','result_digest','binding']) ||
      !closed(draft.reviewed.release, ['contracts','validator_basis','algorithm']) ||
      !closed(binding, ['protocol_id','revision_id','interpretation_digest','source']) ||
      !closed(binding.source, ['system','collection_id','version_id','version_hash','export_hash','collection_hash','retrieved_at',
        'native_hash_profile','export_hash_profile','completeness']) || !sameReviewedMethod(capture.input.method, binding) ||
      ![binding.interpretation_digest, binding.source?.collection_hash, binding.source?.version_hash,
        binding.source?.export_hash, draft.reviewed.input_digest, draft.reviewed.result_digest, row.key_digest].every(value => SHA.test(value)) ||
      draft.reviewed.schema !== 'lab-automation-planner/reviewed-assessment/1' ||
      !timestamp(row.created_at) || !timestamp(row.expires_at) ||
      Date.parse(row.created_at) >= Date.parse(row.expires_at) || Date.parse(row.expires_at) > Date.parse(row.created_at) + DAY ||
      draft.schema !== draftSchema || draft.id !== row.id || draft.organisation_id !== org ||
      draft.created_at !== row.created_at || draft.expires_at !== row.expires_at ||
      draft.assessment?.id !== row.assessment_id || draft.assessment?.capture_digest !== await hash(capture) ||
      !sameRef(draft.offer, capture.result.offer) ||
      canonical(draft.dependencies) !== canonical(capture.snapshot.map(d => d.reference).sort((a, b) => a.revision_id.localeCompare(b.revision_id))) ||
      !capture.result.configurations.some(c => sameRef(c.configuration, draft.configuration) && sameRef(c.installation, draft.installation)) ||
      draft.disposition !== 'prepared_for_local_review' || draft.provider_outcome !== null || draft.provider_authority !== 'unverified' ||
      ['sent', 'reservation_created', 'charge_created', 'execution_authorized'].some(key => draft[key] !== false) ||
      await hash(requestIdentity(row.assessment_id, draft.configuration, draft.reviewed)) !== row.input_digest)
    throw Error('Registry request draft integrity failed');
  return draft;
}
