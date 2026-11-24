import {canonical, hash, reject} from '../../lib/reviewed/json.js';
import {add, exact, zero} from '../../lib/reviewed/quantity.js';
import {amount, costs, id, object, requireSource, sourceRecords, INPUT, OUTPUT, RELEASE, MAX_BYTES} from './contract.js';
import {assessBatch} from './batch.js';
import {assessFlow} from './flow.js';

export async function assessProcess(input) {
  if (input?.schema !== INPUT) reject('unsupported_profile', '/schema');
  object(input, ['schema', 'binding', 'sources', 'costs', 'process'], '');
  if (new TextEncoder().encode(canonical(input)).length > MAX_BYTES) reject('json_limit');
  const sources = sourceRecords(input.sources);
  object(input.binding, ['case_id', 'revision', 'evidence'], '/binding');
  id(input.binding.case_id, '/binding/case_id');
  id(input.binding.revision, '/binding/revision');
  requireSource(sources, input.binding.evidence, '/binding/evidence');
  if (sources.get(input.binding.evidence).version !== input.binding.revision) reject('source_revision', '/binding/revision');
  const declaredCosts = costs(input.costs, sources);
  const missing = declaredCosts.items.filter(i => i.value === null).map(i => i.id);
  const subtotal = declaredCosts.items.reduce((sum, i) => add(sum, amount(i.value, '/costs', {optional: true}) ?? zero()), zero());
  const compute = {batch: assessBatch, flow: assessFlow};
  if (!Object.hasOwn(compute, input.process?.kind)) reject('unsupported_process', '/process/kind');
  const result = compute[input.process.kind](input.process, sources);
  return {
    schema: OUTPUT, release: RELEASE, input_digest: await hash(input), binding: input.binding, sources: input.sources,
    profile: input.process.kind, result,
    cost: {currency: declaredCosts.currency, items: declaredCosts.items, known_subtotal: exact(subtotal),
      complete: missing.length === 0, total: missing.length === 0 ? exact(subtotal) : null, missing},
    authority: 'caller_declared_advisory', scientific_outcome: 'unassessed', execution_allowed: false,
  };
}
