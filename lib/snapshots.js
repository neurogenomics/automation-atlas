// Normalise imported protocol snapshots from any source to one shape:
// {source, id, name, url, version:{id, number, updated_at}, has_unpublished_draft,
//  content_hash, steps:[{position, title, text, guid, inventory, prescribedSeconds, devices}],
//  observed} (observed: Labstep step times for the pinned version, or null).

import {canonicalJson, labstepCapture, labstepRefreshPaths, sameLabstepPayload} from './source-provenance.js';

export function keepLatestLabstepVersion(current, incoming) {
  if (current?.schema !== 'lab-mcp/protocol-export/1' || incoming.schema !== current.schema) return;
  const from = current.version, to = incoming.version;
  if (from.id === to.id) {
    const date = Date.parse(labstepCapture(current)), nextDate = Date.parse(labstepCapture(incoming));
    const read = (raw, path) => path.split('.').reduce((value, key) => value?.[key], raw) ?? null;
    const sameMetadata = labstepRefreshPaths.filter(path => path !== 'retrieved_at' && path !== 'imported_at')
      .every(path => read(current, path) === read(incoming, path));
    if ((Number.isSafeInteger(from.number) && from.number !== to.number) ||
        !sameLabstepPayload(current, incoming) ||
        (Number.isFinite(date) ? !(nextDate > date || (nextDate === date && sameMetadata)) :
          !Number.isFinite(nextDate) && !sameMetadata)) {
      throw Error('This Labstep export conflicts with the stored version or is older than its snapshot.');
    }
  } else if (!Number.isSafeInteger(from.number) || to.number <= from.number) {
    throw Error(`Labstep version ${to.number} cannot replace version ${from.number ?? from.id}.`);
  }
}

// Across versions, Labstep often issues new GUIDs. Match remaining steps in
// title order; if a title also changes, report a removal and an addition.
export function diffLabstepSteps(before, after) {
  const unused = new Set(before.steps);
  const pairs = after.steps.map(step => ({after: step}));
  for (const key of ['guid', 'title']) {
    for (const pair of pairs) {
      if (pair.before || (key === 'guid' && !pair.after.guid)) continue;
      const prior = before.steps.find(s => unused.has(s) && s[key] === pair.after[key]);
      if (prior) { unused.delete(prior); pair.before = prior; }
    }
  }
  const changed = ({before, after}) => {
    if (!before || !after) return true;
    const {guid: beforeGuid, ...oldStep} = before, {guid: afterGuid, ...newStep} = after;
    return canonicalJson(oldStep) !== canonicalJson(newStep);
  };
  return [...pairs, ...[...unused].map(step => ({before: step, after: null}))].filter(changed);
}

export function normaliseSnapshot(raw) {
  if (!raw || !raw.version || typeof raw.version !== 'object' || !Array.isArray(raw.steps) ||
      raw.steps.some(s => !s || typeof s !== 'object' || typeof s.text !== 'string')) {
    throw Error('The protocol snapshot is missing its version or steps.');
  }
  if (raw.schema === 'lab-mcp/protocol-export/1') {
    return {source: 'labstep', id: raw.collection_id, name: raw.name, url: raw.url, version: raw.version, has_unpublished_draft: raw.has_unpublished_draft, content_hash: raw.content_hash, steps: raw.steps.map(s => ({position: s.position, title: s.title, text: s.text, guid: s.guid, inventory: s.inventory || [], prescribedSeconds: s.prescribedSeconds ?? null, devices: s.devices || []})), observed: raw.observed || null};
  }
  if (raw.schema === 'planner/protocolsio-import/1') {
    return {source: 'protocolsio', id: raw.id, name: raw.name, url: raw.url, version: raw.version, has_unpublished_draft: false, content_hash: raw.content_hash, steps: raw.steps};
  }
  if (raw.schema === 'planner/text-import/1') {
    return {source: 'text', id: raw.id, name: raw.name, url: raw.url || '', version: raw.version, has_unpublished_draft: false, content_hash: raw.content_hash || null, steps: raw.steps};
  }
  throw Error(`Unknown snapshot schema: ${raw.schema}`);
}

// Turn pasted protocol text (from any source) into a snapshot. Steps start at
// a numbered line ("1.", "2)", "Step 3") or after a blank line; the first line
// of each step is its title.
export function snapshotFromText(name, text, url = '') {
  const blocks = [];
  let cur = null;
  for (const raw of String(text).replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    const numbered = line.match(/^(?:step\s*)?([0-9]+)[.):]\s+(.*)$/i);
    if (!line) { cur = null; continue; }
    if (numbered || !cur) { cur = {lines: []}; blocks.push(cur); cur.lines.push(numbered ? numbered[2] : line); continue; }
    cur.lines.push(line);
  }
  const steps = blocks.filter(b => b.lines.length).map((b, i) => ({position: i + 1, title: b.lines[0].slice(0, 120), text: b.lines.join('\n'), guid: null}));
  const hash = [...JSON.stringify(steps)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
  return {schema: 'planner/text-import/1', id: `t${hash.toString(36)}`, name: name || steps[0]?.title || 'Pasted protocol', url, version: {id: hash, number: 1, updated_at: null}, steps};
}

export function indexSnapshots(raws) {
  const out = {};
  for (const raw of raws) { const s = normaliseSnapshot(raw); out[`${s.source}:${s.id}`] = s; }
  return out;
}
