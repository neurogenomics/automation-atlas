import {canonical} from '../../lib/reviewed/json.js';
import {cmp, decimal, exact} from '../../lib/reviewed/quantity.js';

// Factors to a common scale within each dimension. Temperature and signal
// have no cross-unit conversion here; currencies compare only within one code.
const scales = new Map(Object.entries({
  volume: {uL: 1n, mL: 1000n, L: 1000000n},
  time: {s: 1n, min: 60n, h: 3600n},
  mass: {ug: 1n, mg: 1000n, g: 1000000n, kg: 1000000000n},
  pressure: {Pa: 1n, kPa: 1000n, bar: 100000n},
  temperature: {degC: 1n},
  rotation_speed: {rpm: 1n},
  acceleration: {g: 1n},
  amount_concentration: {'mol/L': 1n},
  mass_concentration: {'g/L': 1n},
  recovery_ratio: {'1': 1n},
  signal: {'1': 1n}
}));
const bases = new Set(['total', 'absolute', 'per_sample', 'per_container', 'per_batch']);
const currencies = new Set(['EUR', 'GBP', 'USD', 'XTS']);
const test = {lt: n => n < 0, lte: n => n <= 0, eq: n => n === 0, gte: n => n >= 0, gt: n => n > 0};
const read = v => typeof v === 'string' ? decimal(v) : {n: BigInt(v.numerator), d: BigInt(v.denominator)};
const refKey = ({kind, id, conditions}) => canonical([kind, id, conditions.map(canonical).sort()]);

function exactInUnit({n, d}, unit) {
  // Reduce in the companion's range, which permits 512 digits plus a sign.
  let a = n < 0n ? -n : n, b = d;
  while (b) [a, b] = [b, a % b];
  const reduced = {n: n / a, d: d / a};
  const numerator = String(reduced.n), denominator = String(reduced.d);
  if (numerator.replace(/^-/, '').length > 512 || denominator.length > 512) return null;
  const result = exact(reduced);
  return {unit, value: typeof result === 'string' && result.length > 128 ? {numerator, denominator} : result};
}

export function compareScalar(observed, {threshold, operator}) {
  const unsupported = reason => ['unsupported', reason, null];
  if (observed.dimension == null || threshold.dimension == null) return unsupported('unknown_dimension');
  if (observed.dimension !== threshold.dimension) {
    const pair = [observed.dimension, threshold.dimension].sort().join(':');
    return unsupported({
      'amount_concentration:mass_concentration': 'missing_molar_mass',
      'acceleration:rotation_speed': 'missing_radius'
    }[pair] ?? 'incompatible_dimensions');
  }
  if (observed.basis == null || threshold.basis == null) return unsupported('unknown_basis');
  if (observed.basis !== threshold.basis) return unsupported('incompatible_bases');
  if (!bases.has(observed.basis)) return unsupported('unsupported_basis');
  if (observed.reference == null || threshold.reference == null ||
      (observed.dimension === 'pressure' && [observed, threshold].some(x => x.reference.kind !== 'declared')))
    return unsupported('unknown_reference');
  if (refKey(observed.reference) !== refKey(threshold.reference)) {
    const pressurePair = [observed.reference.id, threshold.reference.id].sort().join(':') === 'absolute:gauge';
    return unsupported(observed.dimension === 'pressure' && pressurePair ? 'missing_ambient_pressure' : 'incompatible_references');
  }
  if (observed.dimension === 'pressure' && !['absolute', 'gauge'].includes(observed.reference.id))
    return unsupported('unsupported_reference');
  if (observed.unit == null || threshold.unit == null) return unsupported('unknown_unit');

  let from, to;
  if (observed.dimension === 'currency') {
    if (!currencies.has(observed.unit) || !currencies.has(threshold.unit)) return unsupported('unsupported_unit');
    if (observed.unit !== threshold.unit) return unsupported('incompatible_currencies');
    from = to = 1n;
  } else {
    const dimension = scales.get(observed.dimension);
    if (!dimension) return unsupported('unsupported_dimension');
    if (!Object.hasOwn(dimension, observed.unit) || !Object.hasOwn(dimension, threshold.unit)) return unsupported('unsupported_unit');
    from = dimension[observed.unit];
    to = dimension[threshold.unit];
  }
  const actual = read(observed.value), target = read(threshold.value);
  const converted = {n: actual.n * from, d: actual.d * to};
  const pass = test[operator](cmp(converted, target));
  // Comparison can use larger intermediates than the result schema can represent.
  const result = exactInUnit(converted, threshold.unit) ?? exactInUnit(actual, observed.unit);
  return [pass ? 'satisfied' : 'contradicted', pass ? 'declared_predicate_satisfied' : 'declared_predicate_contradicted', result];
}
