// Closed validator for the exact pinned 0.2 shape and this compact profile.
// Not a general JSON Schema implementation or a substitute for Portal authority.
import {contractBundle} from './contract-bundle.js';
import {canonical, hashText, interpretationDigest, reject, pointer, MAX_BYTES} from './json.js';
import {decimal} from './quantity.js';

export const INPUT_PROFILE = 'lab-automation-planner/reviewed-assessment-input/1';
export const OUTPUT_PROFILE = 'lab-automation-planner/reviewed-assessment/1';
export const ALGORITHM = 'explicit-volume-ledger/1';
export const RELEASE = {contracts: contractBundle.upstream_commit, validator_basis: 'protocol-portal@8c4fe82784111e8635c4404e0230bf9393fa9fb3', algorithm: ALGORITHM};
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export function fields(v, required, optional = [], path = '') {
  if (!isObject(v) || required.some(k => !Object.hasOwn(v, k)) || Object.keys(v).some(k => ![...required, ...optional].includes(k))) reject('input_shape', path);
}
function timestamp(v) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(v)) return false;
  const y = +v.slice(0, 4), m = +v.slice(5, 7), d = +v.slice(8, 10);
  return y > 0 && m > 0 && m <= 12 && d > 0 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate() && +v.slice(11, 13) < 24 && +v.slice(14, 16) < 60 && +v.slice(17, 19) < 60 && Number.isFinite(Date.parse(v));
}
export function assertPinnedKeywords(spec) {
  const supported = new Set(['$schema', '$id', '$defs', '$ref', 'title', 'description', 'type', 'enum', 'const', 'required', 'properties', 'additionalProperties', 'minItems', 'items', 'minimum', 'maximum', 'minLength', 'pattern', 'format', 'anyOf', 'allOf', 'if', 'then', 'else']);
  for (const key of Object.keys(spec)) if (!supported.has(key)) reject('contract_keyword_unsupported');
  if (spec.additionalProperties !== undefined && spec.additionalProperties !== false) reject('contract_keyword_unsupported');
  if (spec.format !== undefined && spec.format !== 'date-time') reject('contract_keyword_unsupported');
  for (const key of ['$defs', 'properties']) for (const child of Object.values(spec[key] || {})) assertPinnedKeywords(child);
  for (const key of ['items', 'if', 'then', 'else']) if (spec[key]) assertPinnedKeywords(spec[key]);
  for (const key of ['allOf', 'anyOf']) for (const child of spec[key] || []) assertPinnedKeywords(child);
}
let verified;
async function schemas() {
  if (!verified) verified = (async () => {
    const out = new Map();
    for (const file of Object.values(contractBundle.files)) {
      if (await hashText(file.text) !== file.sha256) reject('contract_checksum');
      const schema = JSON.parse(file.text); assertPinnedKeywords(schema); out.set(schema.$id, schema);
    }
    return out;
  })();
  return verified;
}
// Evaluate only keywords in the two reviewed, checksum-pinned schemas. Unknown
// profiles/versions never dispatch to a latest schema or network resolver.
function shape(value, spec, base, registry, path = '', depth = 0) {
  if (depth > 128) reject('schema_limit', path);
  if (spec.$ref) {
    const url = new URL(spec.$ref, base), key = url.href.split('#')[0];
    let target = registry.get(key); if (!target) reject('contract_reference', path);
    if (url.hash) for (const part of url.hash.slice(2).split('/')) target = target?.[part.replace(/~1/g, '/').replace(/~0/g, '~')];
    if (!target) reject('contract_reference', path);
    shape(value, target, key, registry, path, depth + 1);
  }
  const fail = () => reject('schema_invalid', path);
  if (spec.type) {
    const types = [spec.type].flat();
    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (!types.includes(type) && !(types.includes('integer') && Number.isSafeInteger(value))) fail();
  }
  if (spec.enum && !spec.enum.some(x => canonical(x) === canonical(value))) fail();
  if (Object.hasOwn(spec, 'const') && canonical(value) !== canonical(spec.const)) fail();
  if (typeof value === 'string') {
    if (spec.minLength != null && [...value].length < spec.minLength) fail();
    if (spec.pattern && !new RegExp(spec.pattern).test(value)) fail();
    if (spec.format === 'date-time' && !timestamp(value)) fail();
  }
  if (typeof value === 'number' && ((spec.minimum != null && value < spec.minimum) || (spec.maximum != null && value > spec.maximum))) fail();
  if (Array.isArray(value)) {
    if (value.length < (spec.minItems || 0)) fail();
    if (spec.items) value.forEach((item, i) => shape(item, spec.items, base, registry, `${path}/${i}`, depth + 1));
  }
  if (isObject(value)) {
    if (spec.required?.some(k => !Object.hasOwn(value, k))) fail();
    if (spec.additionalProperties === false && Object.keys(value).some(k => !Object.hasOwn(spec.properties || {}, k))) fail();
    for (const [key, child] of Object.entries(spec.properties || {})) if (Object.hasOwn(value, key)) shape(value[key], child, base, registry, path + '/' + pointer(key), depth + 1);
  }
  if (spec.allOf) for (const child of spec.allOf) shape(value, child, base, registry, path, depth + 1);
  const matches = child => { try { shape(value, child, base, registry, path, depth + 1); return true; } catch (e) { if (e.code !== 'schema_invalid') throw e; return false; } };
  if (spec.anyOf && !spec.anyOf.some(matches)) fail();
  if (spec.if) { const branch = matches(spec.if) ? spec.then : spec.else; if (branch) shape(value, branch, base, registry, path, depth + 1); }
}
export const bindingOf = record => ({protocol_id: record.protocol_id, revision_id: record.revision_id,
  interpretation_digest: record.interpretation_digest, source: record.source});
const id = (v, p) => { if (typeof v !== 'string' || !ID.test(v)) reject('identity_invalid', p); };
const amount = (v, p) => { if (v !== null && decimal(v).n < 0n) reject('quantity_invalid', p); };
export async function admit(input) {
  if (new TextEncoder().encode(canonical(input)).length > MAX_BYTES) reject('json_limit');
  fields(input, ['schema', 'record', 'binding', 'run', 'configurations', 'review_claims', 'upstream_findings']);
  if (input.schema !== INPUT_PROFILE) reject('unsupported_input_profile', '/schema');
  const record = input.record;
  if (!isObject(record) || record.schema_version !== '0.2.0') reject('unsupported_review_version', '/record/schema_version');
  const registry = await schemas(), url = 'https://github.com/neurogenomics/agentic-lab/contracts/versions/0.2.0/reviewed-protocol.schema.json';
  shape(record, registry.get(url), url, registry, '/record');
  if (await interpretationDigest(record) !== record.interpretation_digest) reject('interpretation_digest_mismatch', '/record/interpretation_digest');
  if (canonical(input.binding) !== canonical(bindingOf(record))) reject('binding_mismatch', '/binding');
  if (record.operations.length > 500 || record.states.length > 3000 || record.materials.length > 3000 || record.locations.length > 1000) reject('assessment_limit');
  fields(input.run, ['cardinalities', 'layout']);
  fields(input.run.cardinalities, [], ['per_sample', 'per_container', 'per_batch']);
  for (const [key, count] of Object.entries(input.run.cardinalities)) if (count !== null && (!Number.isSafeInteger(count) || count < 1 || count > 1000000)) reject('cardinality_invalid', '/run/cardinalities/' + key);
  if (!isObject(input.run.layout)) reject('layout_invalid', '/run/layout');
  const instanceIds = new Set();
  for (const [location, slots] of Object.entries(input.run.layout)) {
    id(location, '/run/layout');
    if (!record.locations.some(l => l.id === location)) reject('layout_unknown_location', '/run/layout/' + location);
    if (slots === null) continue;
    if (!Array.isArray(slots) || !slots.length || slots.length > 1000) reject('layout_invalid');
    for (const slot of slots) {
      fields(slot, ['id', 'units', 'capacity_uL']); id(slot.id);
      if (instanceIds.has(slot.id)) reject('layout_duplicate_instance'); instanceIds.add(slot.id);
      if (!Number.isSafeInteger(slot.units) || slot.units < 1 || slot.units > 1000000) reject('layout_invalid');
      amount(slot.capacity_uL);
    }
  }
  if (!Array.isArray(input.configurations) || input.configurations.length > 50) reject('configuration_invalid');
  const configs = new Set();
  for (const c of input.configurations) {
    fields(c, ['id', 'revision', 'head', 'evidence', 'availability']); id(c.id); id(c.revision);
    if (configs.has(c.id)) reject('configuration_duplicate'); configs.add(c.id);
    fields(c.head, ['min_uL', 'max_uL']); amount(c.head.min_uL); amount(c.head.max_uL);
    if (typeof c.evidence !== 'string' || c.evidence.length > 4000 || !['unknown', 'available', 'unavailable'].includes(c.availability)) reject('configuration_invalid');
    if (c.head.min_uL !== null && c.head.max_uL !== null && decimal(c.head.min_uL).n * decimal(c.head.max_uL).d > decimal(c.head.max_uL).n * decimal(c.head.min_uL).d) reject('configuration_range_invalid');
  }
  if (!Array.isArray(input.review_claims) || input.review_claims.length > 100 || !Array.isArray(input.upstream_findings) || input.upstream_findings.length > 2000) reject('claims_invalid');
  for (const f of input.upstream_findings) {
    fields(f, ['code', 'path', 'message']);
    if (![f.code, f.path, f.message].every(v => typeof v === 'string')) reject('findings_invalid');
  }
  return input;
}
