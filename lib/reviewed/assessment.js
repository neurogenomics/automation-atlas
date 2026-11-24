import {admit, bindingOf, OUTPUT_PROFILE, RELEASE} from './input.js';
import {canonical, hash, reject} from './json.js';
import {ledger} from './ledger.js';
import {decimal, cmp} from './quantity.js';

export const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
export async function assess(input) {
  await admit(input);
  const r = input.record;
  if (input.configurations.length * r.operations.length > 10000) reject('assessment_expansion_limit');
  const result = ledger(input), findings = result.findings;
  const note = (code, path, message) => findings.push({code, path, message, operation_id: null, scopes: ['completeness', 'configuration']});
  note('source_capture_not_present', '/binding/source', 'Compact source hashes are attributed bindings; native source bytes and completeness cannot be independently verified here.');
  note('review_authority_external', '/review_claims', 'Portable claims cannot establish local semantic approval. The connected Portal owns applicability.');
  note('execution_disabled', '', 'No scheduling, hardware execution, automation credit or scientific approval is granted.');
  const opIds = new Set(r.operations.map(o => o.id)), coverage = new Map();
  for (const [i, c] of r.coverage.entries()) {
    if (coverage.has(c.pointer)) reject('coverage_duplicate', `/record/coverage/${i}`);
    coverage.set(c.pointer, c);
    if (c.operation_ids.some(id => !opIds.has(id))) reject('coverage_reference', `/record/coverage/${i}`);
    if (c.status === 'unresolved') note('coverage_unresolved', `/record/coverage/${i}`, c.reason || 'Unresolved source coverage.');
  }
  for (const [i, op] of r.operations.entries()) {
    if (op.timing.start_after.some(id => !opIds.has(id)) || op.constraints.some(c => c.after_operation_id !== null && !opIds.has(c.after_operation_id))) reject('operation_reference', `/record/operations/${i}`);
    for (const span of op.source_spans) if (coverage.get(span.pointer)?.status !== 'mapped' || !coverage.get(span.pointer).operation_ids.includes(op.id)) note('operation_coverage_missing', `/record/operations/${i}/source_spans`, 'Operation evidence is not mapped by the coverage record.');
  }
  r.limitations.forEach((l, i) => { if (l.status === 'unresolved') note('source_limitation', `/record/limitations/${i}`, l.reason); });
  r.questions.forEach((q, i) => note(q.status === 'open' ? 'question_open' : 'answer_external_claim', `/record/questions/${i}`, q.question));
  if (r.profile !== 'batch_movement/0.2') note('profile_unsupported', '/record/profile', 'Continuous-flow and other process models are not implemented by this batch-volume profile.');
  if (!r.operations.length) note('no_operations', '/record/operations', 'No operations were provided.');
  for (const f of input.upstream_findings) note('upstream_' + f.code, f.path, f.message);
  const configurations = input.configurations.map(c => ({
    id: c.id, revision: c.revision, declared: c,
    scope: 'stated_quantity_basis_range_only',
    overall_feasibility: 'not_established', access: c.availability === 'unavailable' ? 'declared_unavailable' : 'unverified',
    operations: result.operations.map(op => {
      const q = typeof op.per_unit_moved_uL === 'string' ? decimal(op.per_unit_moved_uL) : null;
      const rangeKnown = c.head.min_uL !== null && c.head.max_uL !== null && c.evidence.trim();
      const within = q && rangeKnown ? cmp(q, decimal(c.head.min_uL)) >= 0 && cmp(q, decimal(c.head.max_uL)) <= 0 : null;
      return {operation_id: op.operation_id, within_declared_range: q?.n === 0n ? null : within,
        status: q?.n === 0n ? 'not_applicable_zero_movement' : within === null ? 'technical_fit_unknown' : within ? 'range_only_matches' : 'outside_declared_range',
        finding_scope: op.operation_id};
    }),
  }));
  const findingIndex = {global:[],operations:Object.fromEntries(r.operations.map(op=>[op.id,[]]))};
  findings.forEach((f,index)=>(f.operation_id === null ? findingIndex.global : findingIndex.operations[f.operation_id]).push(index));
  const out = {schema: OUTPUT_PROFILE, release: RELEASE, input_digest: await hash(input), binding: bindingOf(r),
    run_digest: await hash(input.run), configuration_digest: await hash(input.configurations),
    authority: {status: 'external_claims_only', execution_allowed: false, review_claims: input.review_claims},
    status: 'structural_preview', overall_feasibility: 'not_established', automatic_recommendation: null,
    scope: 'Declared batch volume arithmetic, per-instance capacity and stated quantity-basis head ranges; no stroke mapping; not a full equipment, method, schedule or access assessment.',
    operations: result.operations, states: result.states, configurations, findings, finding_index: findingIndex,
    record_metadata: Object.fromEntries(Object.entries(r).filter(([key]) => !['materials','locations','states','operations','coverage','limitations','questions','migration'].includes(key))),
    retained: {materials: r.materials, locations: r.locations, coverage: r.coverage, limitations: r.limitations,
      questions: r.questions, migration: r.migration},
    legacy_comparison: {status: 'unavailable', reason: 'A separately source-bound legacy diagnostic must be generated at the explicit UI comparison boundary.'}};
  if (new TextEncoder().encode(canonical(out)).length > MAX_OUTPUT_BYTES) reject('assessment_output_limit');
  return out;
}
