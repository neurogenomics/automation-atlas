import {reject} from '../../lib/reviewed/json.js';
import {decimal} from '../../lib/reviewed/quantity.js';

export const INPUT = 'lab-automation-planner/process-advisory-input/1';
export const OUTPUT = 'lab-automation-planner/process-advisory/1';
export const RELEASE = 'declared-resource-and-ideal-flow/1';
export const MAX_BYTES = 128 * 1024;

export function object(value, keys, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) reject('shape', path);
}

export function array(value, max, path, min = 0) {
  if (!Array.isArray(value) || value.length > max || value.length < min) reject('array_limit', path);
}

export function id(value, path) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(value)) reject('identity', path);
}
export function choice(value, allowed, path) {
  if (!allowed.includes(value)) reject('value', path);
}
export function amount(value, path, {optional = false, positive = false} = {}) {
  if (value === null && optional) return null;
  if (typeof value !== 'string' || value.length > 48) reject('quantity', path);
  let q;
  try { q = decimal(value); } catch { reject('quantity', path); }
  if (q.n < 0n || positive && !q.n) reject('quantity', path);
  return q;
}
export function identities(values, max, path, min = 0) {
  array(values, max, path, min);
  for (const value of values) id(value, path);
  if (new Set(values).size !== values.length) reject('duplicate_identity', path);
}
export function sourceRecords(sources) {
  array(sources, 12, '/sources', 1);
  for (const [i, source] of sources.entries()) {
    const path = '/sources/' + i;
    object(source, ['id', 'kind', 'version', 'url'], path);
    id(source.id, path);
    id(source.version, path);
    choice(source.kind, ['declared_case', 'public_role'], path);
    if (source.kind === 'declared_case') choice(source.url, [null], path);
    else {
      if (typeof source.url !== 'string' || source.url.length > 500) reject('source_url', path);
      let url;
      try { url = new URL(source.url); } catch { reject('source_url', path); }
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
        reject('source_url', path);
    }
  }
  identities(sources.map(s => s.id), 12, '/sources', 1);
  return new Map(sources.map(s => [s.id, s]));
}

export function requireSource(sources, source, path, kind = 'declared_case') {
  if (sources.get(source)?.kind !== kind) reject('evidence_scope', path);
}

export function costs(input, sources) {
  object(input, ['currency', 'items'], '/costs');
  choice(input.currency, ['GBP', 'USD', 'EUR'], '/costs/currency');
  array(input.items, 32, '/costs/items', 1);
  identities(input.items.map(i => i?.id), 32, '/costs/items', 1);
  for (const [i, item] of input.items.entries()) {
    const path = '/costs/items/' + i;
    object(item, ['id', 'value', 'evidence'], path);
    amount(item.value, path, {optional: true});
    requireSource(sources, item.evidence, path);
  }
  return input;
}
