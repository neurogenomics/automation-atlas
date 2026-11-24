import {div, mul, exact, cmp, rational} from '../../lib/reviewed/quantity.js';
import {reject} from '../../lib/reviewed/json.js';
import {amount, array, choice, id, identities, object, requireSource} from './contract.js';

const units = {volume: {mL: rational(1n), uL: rational(1n, 1000n)},
  rate: {'mL/min': rational(1n), 'uL/min': rational(1n, 1000n)}, time: {s: rational(1n), min: rational(60n)}};

function quantity(value, dimension, path, findings) {
  if (value === null) { findings.push({code: 'missing_' + dimension, path}); return null; }
  object(value, ['dimension', 'unit', 'value'], path);
  const scalar = amount(value.value, path, {positive: dimension !== 'time'});
  if (value.dimension !== dimension || !Object.hasOwn(units[dimension], value.unit)) {
    findings.push({code: 'unsupported_' + dimension + '_dimension_or_unit', path});
    return null;
  }
  return mul(scalar, units[dimension][value.unit]);
}

function routing(r, sources, findings) {
  if (r === null) { findings.push({code: 'routing_missing', path: '/process/routing'}); return null; }
  const path = '/process/routing';
  object(r, ['feed_id', 'stream_id', 'collection_id', 'inlet_id', 'outlet_id', 'evidence', 'inline_observation'], path);
  identities([r.feed_id, r.stream_id, r.collection_id, r.inlet_id, r.outlet_id], 5, path, 5);
  requireSource(sources, r.evidence, path);
  let observation = null;
  if (r.inline_observation !== null) {
    object(r.inline_observation, ['data_id', 'source_stream_id', 'evidence'], path + '/inline_observation');
    const o = r.inline_observation;
    id(o.data_id, path);
    if ([r.feed_id, r.stream_id, r.collection_id, r.inlet_id, r.outlet_id].includes(o.data_id)) reject('duplicate_identity', path);
    if (o.source_stream_id !== r.stream_id || sources.get(o.evidence)?.kind !== 'declared_case') {
      findings.push({code: 'inline_data_source_unresolved', path: path + '/inline_observation'});
    } else {
      observation = {data_id: o.data_id, source_stream_id: o.source_stream_id, value: null, evidence: o.evidence};
    }
  }
  return {feed_id: r.feed_id, path: [r.inlet_id, r.stream_id, r.outlet_id], collection_id: r.collection_id,
    evidence: r.evidence, inline_observation: observation};
}

export function assessFlow(p, sources) {
  object(p, ['kind', 'hold_up', 'flow_rate', 'routing', 'control', 'thresholds_s', 'evidence'], '/process');
  requireSource(sources, p.evidence, '/process/evidence');
  choice(p.control, ['once_through_steady_state', 'recirculation', 'data_dependent', null], '/process/control');
  const findings = [];
  const volume = quantity(p.hold_up, 'volume', '/process/hold_up', findings);
  const rate = quantity(p.flow_rate, 'rate', '/process/flow_rate', findings);
  const route = routing(p.routing, sources, findings);
  array(p.thresholds_s, 12, '/process/thresholds_s');
  const thresholds = p.thresholds_s.map((threshold, i) => amount(threshold, '/process/thresholds_s/' + i));
  if (p.control !== 'once_through_steady_state') findings.push({
    code: p.control === null ? 'control_unknown' : 'dynamic_control_unsupported', path: '/process/control',
  });
  const residence = findings.length ? null : mul(div(volume, rate), rational(60n));
  const unsupported = findings.some(f => f.code.includes('unsupported'));
  return {
    status: unsupported ? 'unsupported' : residence === null ? 'incomplete' : 'ideal_arithmetic_only',
    evidence: p.evidence,
    routing: route, ideal_residence_s: exact(residence),
    thresholds_s: thresholds.map((threshold, i) => ({threshold_s: p.thresholds_s[i],
      ideal_satisfies_lte: residence === null ? null : cmp(residence, threshold) <= 0})),
    actual_throughput: null, actual_hydraulic_or_scientific_fit: 'unassessed', startup_transients: 'unmodelled',
    shutdown_transients: 'unmodelled', elapsed_min: null, ranking: null, findings,
  };
}
