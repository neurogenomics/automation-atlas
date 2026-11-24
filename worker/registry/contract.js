// The exact build-pinned closure, with no runtime resolution outside it.
import {canonical, hash, parseReview} from '../../lib/reviewed/json.js';

const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const datePattern = /^\d{4}-\d\d-\d\d$/;
export const date = s => typeof s === 'string' && datePattern.test(s) &&
  Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
export const timestamp = s => typeof s === 'string' &&
  /^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(s) &&
  date(s.slice(0, 10)) && Number.isFinite(Date.parse(s));

const keywords = new Set('$schema $id $ref $defs title description type required additionalProperties properties enum const minLength maxLength pattern format minimum maximum minItems maxItems uniqueItems items if then else not allOf anyOf oneOf'.split(' '));
function check(s, schemas, base) {
  for (const k of Object.keys(s)) if (!keywords.has(k)) throw Error('Unsupported registry schema keyword: ' + k);
  if (s.format && !['date', 'date-time', 'uri'].includes(s.format)) throw Error('Unsupported registry schema format');
  if (s.additionalProperties !== undefined && s.additionalProperties !== false) throw Error('Unsupported registry schema properties');
  if (s.$ref) resolve(s.$ref, schemas, base);
  for (const key of ['$defs', 'properties']) for (const child of Object.values(s[key] || {})) check(child, schemas, base);
  for (const key of ['items', 'if', 'then', 'else', 'not']) if (s[key]) check(s[key], schemas, base);
  for (const key of ['anyOf', 'oneOf', 'allOf']) for (const child of s[key] || []) check(child, schemas, base);
}
function resolve(ref, schemas, base) {
  const u = new URL(ref, base), key = u.href.split('#')[0];
  let target = schemas[key];
  if (u.hash) for (const p of u.hash.slice(2).split('/')) target = target?.[p.replaceAll('~1', '/').replaceAll('~0', '~')];
  if (!target) throw Error('Registry schema reference outside pinned closure');
  return [target, key];
}
function matches(v, s, schemas, base, depth = 0) {
  if (depth > 128) throw Error('Registry schema nesting limit');
  const test = (child, value = v, key = base) => matches(value, child, schemas, key, depth + 1);
  if (s.$ref) {
    const [target, key] = resolve(s.$ref, schemas, base);
    if (!test(target, v, key)) return false;
  }
  if (s.type) {
    const type = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
    const types = [s.type].flat();
    if (!types.includes(type) && !(types.includes('integer') && Number.isSafeInteger(v))) return false;
  }
  if (Object.hasOwn(s, 'const') && canonical(s.const) !== canonical(v)) return false;
  if (s.enum && !s.enum.some(x => canonical(x) === canonical(v))) return false;
  if (typeof v === 'number' && ((s.minimum != null && v < s.minimum) || (s.maximum != null && v > s.maximum))) return false;
  if (typeof v === 'string') {
    if ((s.minLength != null && [...v].length < s.minLength) || (s.maxLength != null && [...v].length > s.maxLength) ||
      (s.pattern && !new RegExp(s.pattern, 'u').test(v))) return false;
    if (s.format === 'date' && !date(v) || s.format === 'date-time' && !timestamp(v)) return false;
    if (s.format === 'uri') {
      if (/[\s\u0000-\u001f\u007f]/u.test(v) || /%(?![a-f\d]{2})/i.test(v)) return false;
      try { new URL(v); } catch { return false; }
    }
  }
  if (Array.isArray(v) && (v.length < (s.minItems ?? 0) || v.length > (s.maxItems ?? Infinity) ||
    s.uniqueItems && new Set(v.map(canonical)).size !== v.length || s.items && !v.every(item => test(s.items, item)))) return false;
  if (object(v) && (s.required?.some(k => !Object.hasOwn(v, k)) ||
    s.additionalProperties === false && Object.keys(v).some(k => !Object.hasOwn(s.properties || {}, k)) ||
    Object.entries(s.properties || {}).some(([k, child]) => Object.hasOwn(v, k) && !test(child, v[k])))) return false;
  if (s.allOf && !s.allOf.every(child => test(child)) || s.anyOf && !s.anyOf.some(child => test(child)) ||
    s.oneOf && s.oneOf.filter(child => test(child)).length !== 1) return false;
  const branch = s.if && (test(s.if) ? s.then : s.else);
  return (!s.not || !test(s.not)) && (!branch || test(branch));
}

const validated = new WeakSet();
export function checkContract(bundle) {
  if (!validated.has(bundle)) {
    for (const [id, spec] of Object.entries(bundle.schemas)) check(spec, bundle.schemas, id);
    validated.add(bundle);
  }
}
function schema(bundle, value, ref = '') {
  checkContract(bundle);
  const [spec, key] = resolve(ref || bundle.root, bundle.schemas, bundle.root);
  return matches(value, spec, bundle.schemas, key);
}
export const instrumentModelShape = (bundle, value) => schema(bundle, value, 'instrument-model.schema.json');
export const wireShape = (bundle, value) => schema(bundle, value);
export const refShape = (bundle, value) => schema(bundle, value, '#/$defs/Revision');
export const sourceRefShape = (bundle, value) => schema(bundle, value, '../../common.schema.json#/$defs/SourceRef');
export const wireDigest = ({content_digest, ...body}) => hash(body);
export const archiveDigest = ({archive_digest, ...body}) => hash(body);
export const acceptsRecordAuthority = record => record.record_type !== 'assertion' || record.verified_authority === null;
export async function validStoredWire(bundle, wire) {
  return wireShape(bundle, wire) && acceptsRecordAuthority(wire.record) && await wireDigest(wire) === wire.content_digest;
}
export const refOf = ({schema_version, organisation_id, record_id, revision_id, content_digest, record}) =>
  ({schema_version, organisation_id, record_type: record.record_type, record_id, revision_id, content_digest});
export const sameRef = (a, b) => canonical(a) === canonical(b);
export const LOCAL_DEFAULT = 'planner:registry_offer';
export function localDefaultRef(r, organisation_id) {
  const p = r.access_policy?.facility_default;
  return p?.source.namespace === LOCAL_DEFAULT ? {schema_version: '0.1.0', organisation_id, record_type: 'offer',
    record_id: p.source.native_id, revision_id: p.source.version, content_digest: p.content_digest} : null;
}
export function recordLinks(r, org) {
  if (r.record_type === 'configuration') return [r.installation];
  if (r.record_type === 'assertion') return [r.target, ...r.related_assertions];
  if (['access_claim', 'availability_claim'].includes(r.record_type)) return [r.target, ...r.supporting_assertions];
  if (r.record_type === 'offer') return [...(r.backing_installations ?? []), ...(r.backing_configurations ?? []),
    ...[localDefaultRef(r, org)].filter(Boolean)];
  return [];
}
export {canonical, hash, parseReview};
