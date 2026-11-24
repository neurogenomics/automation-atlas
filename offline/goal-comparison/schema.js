// Restricted validator for the pinned schema closure, with no resolver outside it.
import {readFile} from 'node:fs/promises';
import {canonical, hashText, pointer, reject} from '../../lib/reviewed/json.js';
import {contractBundle} from '../../lib/reviewed/contract-bundle.js';

const root = 'https://github.com/neurogenomics/agentic-lab/contracts/';
const keywords = new Set(('$schema $id $defs $ref title description type enum const required properties additionalProperties ' +
  'minItems maxItems items uniqueItems contains minimum maximum minLength maxLength pattern format anyOf oneOf allOf if then else not').split(' '));
const maps = ['$defs', 'properties'], single = ['items', 'contains', 'if', 'then', 'else', 'not'];
const lists = ['anyOf', 'oneOf', 'allOf'];
const read = path => readFile(new URL('../../' + path, import.meta.url), 'utf8');

function resolve(registry, reference, base) {
  const url = new URL(reference, base);
  const key = url.href.split('#')[0];
  let target = registry.get(key);
  if (url.hash) {
    if (!url.hash.startsWith('#/')) reject('contract_reference');
    for (const segment of url.hash.slice(2).split('/')) {
      const k = segment.replace(/~1/g, '/').replace(/~0/g, '~');
      target = target && Object.hasOwn(target, k) ? target[k] : undefined;
    }
  }
  if (!target) reject('contract_reference');
  return [target, key];
}

function inspect(spec, base, registry) {
  if (Object.keys(spec).some(k => !keywords.has(k)) ||
      (spec.additionalProperties !== undefined && spec.additionalProperties !== false) ||
      (spec.format !== undefined && spec.format !== 'date-time')) reject('contract_keyword_unsupported');
  if (spec.$ref) resolve(registry, spec.$ref, base);
  for (const k of maps) for (const child of Object.values(spec[k] || {})) inspect(child, base, registry);
  for (const k of single) if (spec[k]) inspect(spec[k], base, registry);
  for (const k of lists) for (const child of spec[k] || []) inspect(child, base, registry);
}

function dateTime(s) {
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)(?![\s\S])/.exec(s);
  if (!m) return false;
  const [, y, month, day, h, min, sec] = m.map(Number);
  const date = new Date(0);
  date.setUTCFullYear(y, month, 0);
  return y > 0 && month >= 1 && month <= 12 && day >= 1 && day <= date.getUTCDate() && h <= 23 && min <= 59 && sec <= 59;
}

function shape(value, spec, base, registry, path, depth = 0) {
  if (depth > 128) reject('schema_limit', path);
  if (spec.$ref) {
    const [target, url] = resolve(registry, spec.$ref, base);
    shape(value, target, url, registry, path, depth + 1);
  }
  const fail = () => reject('schema_invalid', path);
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (spec.type && ![spec.type].flat().some(t => t === type || (t === 'integer' && Number.isSafeInteger(value)))) fail();
  if (spec.enum && !spec.enum.includes(value)) fail();
  if (Object.hasOwn(spec, 'const') && spec.const !== value) fail();
  if (type === 'string') {
    const length = [...value].length;
    if (length < (spec.minLength ?? 0) || length > (spec.maxLength ?? Infinity) ||
        (spec.pattern && !new RegExp(spec.pattern, 'u').test(value)) ||
        (spec.format && !dateTime(value))) fail();
  }
  if (type === 'number' && (value < (spec.minimum ?? -Infinity) || value > (spec.maximum ?? Infinity))) fail();
  const check = (v, s, p = path) => shape(v, s, base, registry, p, depth + 1);
  const matches = (v, s, p = path) => {
    try { check(v, s, p); return true; }
    catch (e) { if (e.code !== 'schema_invalid') throw e; return false; }
  };
  if (type === 'array') {
    if (value.length < (spec.minItems ?? 0) || value.length > (spec.maxItems ?? Infinity) ||
        (spec.uniqueItems && new Set(value.map(canonical)).size !== value.length)) fail();
    if (spec.items) value.forEach((v, i) => check(v, spec.items, path + '/' + i));
    if (spec.contains && !value.some((v, i) => matches(v, spec.contains, path + '/' + i))) fail();
  }
  if (type === 'object') {
    if (spec.required?.some(k => !Object.hasOwn(value, k)) ||
        (spec.additionalProperties === false && Object.keys(value).some(k => !Object.hasOwn(spec.properties || {}, k)))) fail();
    for (const [k, child] of Object.entries(spec.properties || {}))
      if (Object.hasOwn(value, k)) check(value[k], child, path + '/' + pointer(k));
  }
  for (const child of spec.allOf || []) check(value, child);
  if (spec.anyOf && !spec.anyOf.some(s => matches(value, s))) fail();
  if (spec.oneOf && spec.oneOf.filter(s => matches(value, s)).length !== 1) fail();
  if (spec.not && matches(value, spec.not)) fail();
  if (spec.if) {
    const branch = matches(value, spec.if) ? spec.then : spec.else;
    if (branch) check(value, branch);
  }
}

let loaded;
function closure() {
  return loaded ??= (async () => {
    const pin = JSON.parse(await read('offline/goal-comparison/contracts/pin.json'));
    const registry = new Map();
    let versions;
    for (const [name, file] of Object.entries(pin.files)) {
      if (!name.endsWith('.schema.json') && !name.endsWith('/manifest.json')) continue;
      const bytes = file.path ? await read(file.path) : contractBundle.files[name]?.text;
      if (bytes == null || await hashText(bytes) !== file.sha256) reject('contract_checksum');
      const parsed = JSON.parse(bytes);
      if (name.endsWith('/manifest.json')) versions = parsed;
      else {
        if (parsed.$id !== root + name.slice('contracts/'.length)) reject('contract_id');
        registry.set(parsed.$id, parsed);
      }
    }
    for (const [url, spec] of registry) inspect(spec, url, registry);
    return {versions, registry};
  })();
}

export async function validate(name, version, value, path = '', fragment = '') {
  const {versions, registry} = await closure();
  if (!Object.hasOwn(versions, name) || !Object.hasOwn(versions[name], version)) reject('contract_version', path);
  const url = root + versions[name][version];
  const [spec, base] = resolve(registry, url + fragment, url);
  shape(value, spec, base, registry, path);
}
