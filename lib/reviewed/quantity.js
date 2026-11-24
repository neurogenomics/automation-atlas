// Exact bounded rational arithmetic. No scientific quantity crosses Number().
import {reject} from './json.js';
const gcd = (a, b) => { a = a < 0n ? -a : a; while (b) [a, b] = [b, a % b]; return a; };
export function rational(n, d = 1n) {
  if (!d) reject('numeric_unsupported');
  if (d < 0n) [n, d] = [-n, -d];
  const g = gcd(n, d); n /= g; d /= g;
  if (n.toString().length > 512 || d.toString().length > 512) reject('numeric_unsupported');
  return {n, d};
}
export function decimal(value) {
  if (typeof value !== 'string' || value.length > 128 || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) reject('quantity_invalid');
  const [whole, part = ''] = value.split('.');
  return rational(BigInt(whole + part), 10n ** BigInt(part.length));
}
export const add = (a, b) => rational(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a, b) => rational(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a, b) => rational(a.n * b.n, a.d * b.d);
export const div = (a, b) => rational(a.n * b.d, a.d * b.n);
export const cmp = (a, b) => a.n * b.d === b.n * a.d ? 0 : a.n * b.d > b.n * a.d ? 1 : -1;
export const zero = () => rational(0n);
export function exact(a) {
  if (a == null) return null;
  let d = a.d, twos = 0, fives = 0;
  while (d % 2n === 0n) { d /= 2n; twos++; }
  while (d % 5n === 0n) { d /= 5n; fives++; }
  if (d !== 1n) return {numerator: String(a.n), denominator: String(a.d)};
  const places = Math.max(twos, fives), sign = a.n < 0n ? '-' : '';
  const digits = ((a.n < 0n ? -a.n : a.n) * 10n ** BigInt(places) / a.d).toString().padStart(places + 1, '0');
  return sign + (places ? (digits.slice(0, -places) + '.' + digits.slice(-places)).replace(/\.?0+$/, '') : digits);
}
export const volume = q => q?.value == null ? null : q.dimension === 'volume' && ['uL', 'mL', 'L'].includes(q.unit)
  ? mul(decimal(q.value), decimal({uL: '1', mL: '1000', L: '1000000'}[q.unit])) : null;
export function cardinality(basis, run) {
  if (basis === 'total' || basis === 'absolute') return 1;
  const count = run.cardinalities[basis];
  return Number.isSafeInteger(count) && count > 0 ? count : null;
}
export const aggregate = (q, run) => {
  const amount = volume(q), count = cardinality(q.basis, run);
  return amount != null && count != null ? mul(amount, rational(BigInt(count))) : null;
};
