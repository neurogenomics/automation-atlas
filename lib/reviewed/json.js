// agentic-lab/review-json/1. Original lexical admission precedes JSON.parse.
export const MAX_BYTES = 2 * 1024 * 1024;
export class AssessmentError extends Error {
  constructor(code, path = '', message = 'Reviewed input rejected.') {
    super(message); this.code = code; this.path = path;
  }
}
export const reject = (code, path, message) => { throw new AssessmentError(code, path, message); };
const unicode = s => {
  for (let i = 0; i < s.length; i++) {
    const n = s.charCodeAt(i);
    if (n >= 0xd800 && n <= 0xdbff) {
      const next = s.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) reject('json_invalid');
    } else if (n >= 0xdc00 && n <= 0xdfff) reject('json_invalid');
  }
};
// Normalize a JSON number token in decimal notation without first rounding
// it. Equivalent spellings, such as 0.50 and 5e-1, compare the same.
function decimalIdentity(token) {
  const [, sign, whole, fraction = '', exponent = '0'] = /^(-?)([0-9]+)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(token);
  const digits = whole + fraction;
  let first = 0, last = digits.length;
  while (first < last && digits[first] === '0') first++;
  if (first === last) return '0';
  while (digits[last - 1] === '0') last--;
  return sign + digits.slice(first, last) + 'e' + (Number(exponent) - fraction.length + digits.length - last);
}
export function parseReview(text, {decimalNumbers = false} = {}) {
  if (typeof text !== 'string') reject('json_invalid');
  unicode(text);
  if (new TextEncoder().encode(text).length > MAX_BYTES) reject('json_limit');
  let i = 0, nodes = 0;
  const space = () => { while (/[\x20\t\n\r]/.test(text[i] || '\0')) i++; };
  function value(depth) {
    if (depth > 64 || ++nodes > 100000) reject('json_limit');
    space();
    if (text[i] === '"') {
      const start = i++;
      while (i < text.length) {
        if (text[i] === '\\') { i += 2; continue; }
        if (text[i++] === '"') {
          let s; try { s = JSON.parse(text.slice(start, i)); } catch { reject('json_invalid'); }
          unicode(s); return s;
        }
      }
      reject('json_invalid');
    }
    if (text[i] === '{') {
      i++; space(); const out = Object.create(null);
      if (text[i] === '}') { i++; return out; }
      while (i < text.length) {
        space(); if (text[i] !== '"') reject('json_invalid');
        const key = value(depth + 1);
        if (!/^[\x00-\x7f]*$/.test(key)) reject('json_invalid');
        if (Object.hasOwn(out, key)) reject('json_duplicate_key');
        space(); if (text[i++] !== ':') reject('json_invalid');
        out[key] = value(depth + 1); space();
        const c = text[i++]; if (c === '}') return out;
        if (c !== ',') reject('json_invalid');
      }
      reject('json_invalid');
    }
    if (text[i] === '[') {
      i++; space(); const out = [];
      if (text[i] === ']') { i++; return out; }
      while (i < text.length) {
        out.push(value(depth + 1)); space();
        const c = text[i++]; if (c === ']') return out;
        if (c !== ',') reject('json_invalid');
      }
      reject('json_invalid');
    }
    for (const [token, result] of [['true', true], ['false', false], ['null', null]])
      if (text.startsWith(token, i)) { i += token.length; return result; }
    const token = text.slice(i).match(decimalNumbers ? /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/ : /^-?(?:0|[1-9][0-9]*)/);
    if (!token) reject('json_invalid');
    i += token[0].length;
    if (/[.eE0-9]/.test(text[i] || '\0')) reject('json_invalid');
    const n = Number(token[0]);
    if (!Number.isFinite(n) || (Number.isInteger(n) && !Number.isSafeInteger(n))) reject('json_invalid');
    if (decimalNumbers && decimalIdentity(token[0]) !== decimalIdentity(String(n))) reject('json_number_precision');
    return n;
  }
  const result = value(0); space(); if (i !== text.length) reject('json_invalid');
  return result;
}
export function canonical(value) {
  let nodes = 0;
  function visit(v, depth) {
    if (depth > 64 || ++nodes > 100000) reject('json_limit');
    if (typeof v === 'string') { unicode(v); return JSON.stringify(v); }
    if (v === null || typeof v === 'boolean') return JSON.stringify(v);
    if (typeof v === 'number' && Number.isSafeInteger(v)) return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + Array.from(v, x => visit(x, depth + 1)).join(',') + ']';
    if (v && typeof v === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(v))) {
      return '{' + Object.keys(v).sort().map(k => {
        if (!/^[\x00-\x7f]*$/.test(k)) reject('json_invalid');
        return visit(k, depth + 1) + ':' + visit(v[k], depth + 1);
      }).join(',') + '}';
    }
    reject('json_invalid');
  }
  return visit(value, 0);
}
export async function hashText(text) {
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return 'sha256:' + Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
export const hash = value => hashText(canonical(value));
export const interpretationDigest = record => hash(Object.fromEntries(
  Object.entries(record).filter(([k]) => k !== 'interpretation_digest')));
export const pointer = key => String(key).replace(/~/g, '~0').replace(/\//g, '~1');
