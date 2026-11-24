// The legacy Labstep export digest covers ordered GUID/text pairs only.
// Keep this file import-free: the Sites build includes it in the worker.
export async function verifyLabstepSnapshotHash(raw) {
  if (!/^sha256:[0-9a-f]{64}$/.test(raw?.content_hash || '')) throw Error('The Labstep export has no valid source hash. Export the exact version again.');
  // With the Unicode flag the range only matches unpaired surrogate code
  // units, which the Python exporter cannot encode as UTF-8.
  const utf8 = value => typeof value === 'string' && !/[\uD800-\uDFFF]/u.test(value);
  if (!Array.isArray(raw.steps) || raw.steps.some(s => !s || (s.guid !== null && !utf8(s.guid)) || !utf8(s.text))) {
    throw Error('The Labstep export must provide the GUID and text for each step.');
  }
  const rows = raw.steps.map(s => `[${JSON.stringify(s.guid)}, ${JSON.stringify(s.text)}]`);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`[${rows.join(', ')}]`));
  const hash = `sha256:${[...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
  if (raw.content_hash !== hash) throw Error('The Labstep step GUIDs or text do not match the source hash. Export the exact version again.');
}

export const isLabstepDraft = raw => raw.version?.is_draft === true ||
  typeof raw.version?.locked_at !== 'string' || !Number.isFinite(Date.parse(raw.version.locked_at));
// The legacy CLI saved the export's retrieved_at under imported_at.
export const labstepCapture = raw => raw.retrieved_at ?? raw.imported_at ?? null;
export const labstepDraftConsent = raw => `${raw.collection_id}:${raw.version.id}:${raw.content_hash}`;

const capturePattern = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
export function checkLabstepCapture(raw, now = Date.now()) {
  const captured = labstepCapture(raw);
  if (captured === null) return;
  const time = Date.parse(captured);
  if (typeof captured !== 'string' || !capturePattern.test(captured) || !Number.isFinite(time) || time > now + 300_000) {
    throw Error('The Labstep export has an invalid source capture time. Export the exact version again.');
  }
}

export function checkLabstepVersion(raw) {
  if (raw?.schema !== 'lab-mcp/protocol-export/1' || raw.source !== 'labstep' ||
      !Number.isSafeInteger(raw.collection_id) || raw.collection_id < 1 ||
      !Number.isSafeInteger(raw.version?.id) || raw.version.id < 1 ||
      !Number.isSafeInteger(raw.version?.number) || raw.version.number < 0) {
    throw Error('The Labstep export needs its collection ID, version ID and numbered version. Export the exact version again.');
  }
  checkLabstepCapture(raw);
}

// Everything outside these named capture/currentness fields is immutable for a
// version ID. In particular, the legacy hash does not cover timing, titles,
// inventory, equipment or observed runs. The Worker uses this same allowlist.
export const labstepRefreshPaths = ['retrieved_at', 'imported_at', 'collection_updated_at',
  'versions_count', 'has_unpublished_draft', 'experiment_count', 'version.updated_at',
  'version.locked_at', 'version.is_draft', 'version.is_last_version'];

export function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).filter(k => value[k] !== undefined).sort()
      .map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

export function sameLabstepPayload(a, b) {
  const stable = raw => {
    const {lab, content_hash, ...rest} = raw;
    const {number, ...version} = rest.version;
    const result = {...rest, version};
    for (const path of labstepRefreshPaths) {
      const [key, child] = path.split('.');
      if (child) delete result[key][child];
      else delete result[key];
    }
    return canonicalJson(result);
  };
  return (!a.content_hash || a.content_hash === b.content_hash) && stable(a) === stable(b);
}
