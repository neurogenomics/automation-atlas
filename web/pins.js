import {canonicalJson, checkLabstepVersion, isLabstepDraft, sameLabstepPayload, verifyLabstepSnapshotHash} from '../lib/source-provenance.js';
import {keepLatestLabstepVersion, normaliseSnapshot} from '../lib/snapshots.js';
import {buildWorkflowModel} from '../lib/work.js';

export const protocolKey = raw => {
  const s = normaliseSnapshot(raw);
  return `${s.source}:${s.id}`;
};
export const partKey = part => `${part.source}:${part.id}`;
export function workflowPin(raw) {
  const s = normaliseSnapshot(raw);
  return {source: s.source, id: s.id, versionId: s.version.id,
    ...(s.source === 'labstep' && s.content_hash ? {contentHash: s.content_hash} : {})};
}
export function matchesPin(part, raw) {
  const pin = workflowPin(raw);
  return partKey(part) === partKey(pin) && (part.versionId == null || part.versionId === pin.versionId) &&
    (!part.contentHash || part.contentHash === pin.contentHash);
}
export function workflowDrafts(workflow, raws) {
  return workflow.parts.map(part => raws.find(raw => matchesPin(part, raw)))
    .filter(raw => raw?.schema === 'lab-mcp/protocol-export/1' && isLabstepDraft(raw));
}

// Consent is per workflow and per exact snapshot, held in memory for this
// page session. Stored workflows and synced profiles cannot grant it.
export const draftSelection = drafts => canonicalJson(drafts.map(({lab, ...raw}) => raw));
export function buildBrowserAssessment(workflow, raws, approvals) {
  if (workflow.parts.some(part => part.source === 'labstep' && part.versionId == null)) {
    throw Error('The workflow has no exact Labstep version pin. Create a workflow from the exact export.');
  }
  const drafts = workflowDrafts(workflow, raws);
  if (drafts.length && approvals?.get(workflow.id) !== draftSelection(drafts)) {
    throw Error('A pinned Labstep export is a draft or has no confirmed lock. On Protocols, choose “Assess with draft” to proceed.');
  }
  return {...buildWorkflowModel(workflow, raws), draftAssessment: drafts.length > 0};
}

export function labstepAsOf(value, now = Date.now()) {
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(time)) return 'Source capture time unknown';
  const days = Math.floor((now - time) / 86_400_000);
  return `Captured at export: ${new Date(time).toISOString()}${days === 0 ? ' (today)' : days > 0 ? ` (${days} day${days === 1 ? '' : 's'} ago)` : ''}`;
}

// All browser imports, including a profile backup, go through verification.
export async function verifyProtocolImports(raws) {
  return Promise.all(raws.map(async ({lab, ...raw}) => {
    const s = normaliseSnapshot(raw);
    if (s.source === 'labstep') {
      checkLabstepVersion(raw);
      await verifyLabstepSnapshotHash(raw);
    }
    return raw;
  }));
}

export function mergeProtocolImports(profile, imports, {history = [], hosted = []} = {}) {
  // A private copy can hide the lab's row in the list, but cannot bypass its
  // version guard when importing another copy.
  const hostedCurrent = new Map(hosted.map(raw => [protocolKey(raw), raw]));
  const current = new Map(profile.protocols.map(raw => [protocolKey(raw), raw]));
  const archive = [...profile.protocolArchive];
  for (const raw of imports) {
    const key = protocolKey(raw), prior = current.get(key), pin = workflowPin(raw);
    keepLatestLabstepVersion(prior, raw);
    keepLatestLabstepVersion(hostedCurrent.get(key), raw);
    if (pin.source === 'labstep' && archive.some(old => matchesPin({...pin, contentHash: undefined}, old))) {
      throw Error('This export reuses a version ID already in the protocol archive.');
    }
    if (prior && !prior.lab && prior.version.id !== raw.version.id) archive.push(prior);
    current.set(key, raw);
  }
  for (const raw of history) {
    const pin = workflowPin(raw);
    const prior = archive.find(old => matchesPin({...pin, contentHash: undefined}, old));
    if (prior) {
      if (pin.source === 'labstep' ? !sameLabstepPayload(prior, raw) : canonicalJson(prior) !== canonicalJson(raw)) {
        throw Error('This backup conflicts with a stored archived snapshot.');
      }
      continue;
    }
    const latest = current.get(protocolKey(raw));
    if (latest && (pin.source === 'labstep' ? raw.version.id === latest.version.id ||
        !Number.isSafeInteger(latest.version.number) || raw.version.number >= latest.version.number : matchesPin(pin, latest))) {
      throw Error('A backup archive contains a version that is not older than the stored current version.');
    }
    archive.push(raw);
  }
  return {protocols: [...current.values()], protocolArchive: archive};
}
