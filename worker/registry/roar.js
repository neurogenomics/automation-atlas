import {canonical, hash, hashText, parseReview} from '../../lib/reviewed/json.js';
import {date, instrumentModelShape, refOf, sameRef, wireDigest, wireShape} from './contract.js';

// Admit reviewed release bytes, not a checksum supplied by the requester.
export const roarRelease = {
  crosswalk: 'sha256:4d5ab6ecb1ace9c279d324f5ed1a3a61ac4559eabc1b72d155cde6417177a531',
  bundle: 'sha256:8b400df1518f5694527c1e213cf884e5cdef31701bbd90331b417e8cb6b91be4',
  manifest: 'sha256:6522581527ccb5e49cd0cca979505ecf4be4416007859ac09b21cdb9beec6a3c',
  sourceCommit: '3088f5c63063a6ddf7f7056ddb4e2ff5e2d55611',
  releaseCommit: 'a07f1060f26f03bfaacad5ab19b4a94c3342dbf7',
  discoveryVersion: '2026-11-12',
  catalogueVersion: '2026-11-12.public.1',
  catalogueSchemaVersion: 5,
  counts: {roles: 26, sources: 18, facilitySources: 7, conflicts: 4, models: 11},
};
const atlas = 'https://instrument-capability-catalogue.nathan-skene.chatgpt.site/';
const profile = 'agentic-lab/review-json/1';
const schemaVersion = '0.1.0';
const namespace = 'atlas:roar-role';
const packetFormat = 'planner-roar-source/1';
const kinds = new Set(['matched', 'grouped', 'partial', 'unresolved']);
const token = s => typeof s === 'string' && /^[a-z0-9-]+$/.test(s);
const words = s => typeof s === 'string' && Boolean(s.trim());
const safe = s => {
  try { const u = new URL(s); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
};
const unique = xs => Array.isArray(xs) && new Set(xs).size === xs.length;
const all = (xs, fn) => Array.isArray(xs) && xs.every(fn);
const dated = (value, end) => date(value) && value <= end;
const must = ok => { if (!ok) throw Error('The ROAR crosswalk or C11 bundle does not match the reviewed release.'); };
const index = (xs, key) => {
  must(Array.isArray(xs) && unique(xs.map(key)) && xs.every(x => token(key(x))));
  return new Map(xs.map(x => [key(x), x]));
};
const unknownRights = basis => ({discovery: 'permitted', assessment: 'unknown', republication: 'unknown', basis});
const reportRights = unknownRights('Dated facility reporting and source links for discovery. Assessment and republication rights are not established.');
const discoveryOnly = r => r.discovery === 'permitted' && r.assessment === 'unknown' && r.republication === 'unknown';

export async function readRoar(contracts, input, today, release = roarRelease) {
  const {crosswalk, bundle} = input;
  must(typeof crosswalk === 'string' && typeof bundle === 'string');
  const hashes = await Promise.all([hashText(crosswalk), hashText(bundle)]);
  must(hashes[0] === release.crosswalk && hashes[1] === release.bundle);
  const x = parseReview(crosswalk), b = parseReview(bundle), m = b.manifest;
  must(x.schemaVersion === 1 && x.version === release.discoveryVersion && x.checked === x.version && dated(x.checked, today) &&
    x.catalogueSchemaVersion === release.catalogueSchemaVersion && x.catalogueVersion === release.catalogueVersion &&
    words(x.retrievalNote) && m.manifestVersion === 1 && m.contract.name === 'instrument-model' &&
    m.contract.schemaVersion === schemaVersion && m.contract.digestProfile === profile && m.contract.commit === contracts.upstream &&
    m.contract.schemaPath === 'contracts/versions/0.1.0/instrument-model.schema.json' &&
    m.sourceRelease.commit === release.sourceCommit && m.sourceRelease.discoveryVersion === x.version &&
    m.sourceRelease.catalogueVersion === x.catalogueVersion && m.sourceRelease.catalogueSchemaVersion === x.catalogueSchemaVersion &&
    await hashText(JSON.stringify(m, null, 2) + '\n') === release.manifest);
  const sources = index(x.sources, s => s.id), leads = index(x.leads, l => l.id), conflicts = index(x.conflicts, c => c.id);
  const manifestModels = index(m.models, r => r.atlasId);
  must(sources.size === release.counts.sources && leads.size === release.counts.roles &&
    conflicts.size === release.counts.conflicts && manifestModels.size === release.counts.models &&
    b.records.length === manifestModels.size);
  const facility = [...sources.values()].filter(s => s.kind === 'facility');
  const covered = index(x.sourceCoverage, s => s.sourceId);
  must(facility.length === release.counts.facilitySources && facility.length === covered.size &&
    facility.every(s => covered.has(s.id) && words(covered.get(s.id).use)));
  for (const s of sources.values()) must(safe(s.url) && dated(s.checked, x.checked) && words(s.section) && words(s.title));
  const models = new Map();
  for (const w of b.records) {
    must(instrumentModelShape(contracts, w) && w.parent === null && w.visibility === 'public' && discoveryOnly(w.use_rights) &&
      w.reference_facts.length === 0 && dated(w.recorded_at.slice(0, 10), today) && await wireDigest(w) === w.content_digest);
    const id = w.record_id.slice('atlas:'.length), p = manifestModels.get(id);
    const {schema_version, record_id, revision_id, content_digest} = w;
    const ref = {schema_version, record_id, revision_id, content_digest};
    must(w.record_id === 'atlas:' + id && p && !models.has(id) && p.atlasQuery === '?instrument=' + id &&
      sameRef(p.recordRef, ref) && all(w.sources, s => s.visibility === 'public' && discoveryOnly(s.use_rights) &&
        safe(s.source.url) && dated(s.observed_at, today)) &&
      p.sourceAttribution.length === w.sources.length && unique(p.sourceAttribution.map(s => s.sourceIndex)) &&
      all(p.sourceAttribution, a => w.sources[a.sourceIndex] && token(a.atlasSourceId) &&
        a.attribution === 'manufacturer_reported' && words(a.title) && words(a.section)) &&
      words(p.fieldLoss.referenceFactsReason) && words(p.fieldLoss.sourceMetadataReason));
    models.set(id, {...p, recordRef: ref, manufacturer: w.manufacturer, modelIdentifier: w.model_identifier, use_rights: w.use_rights, sources: w.sources});
  }
  const refs = (xs, map, fn = () => true) => unique(xs) && xs.every(id => map.has(id) && fn(map.get(id)));
  for (const c of conflicts.values()) must(words(c.title) && words(c.resolution) && c.observations.length &&
    all(c.observations, o => sources.get(o.sourceId)?.kind === 'facility' && o.evidence === 'facility' && words(o.statement)) &&
    refs(c.relatedSourceIds, sources));
  const usedConflicts = new Set();
  for (const l of leads.values()) {
    must(kinds.has(l.status) && words(l.reportedName) && words(l.reportedRole) && words(l.identityGap) &&
      l.assurance === 'facility-reported' && ['unassessed', 'unsupported'].includes(l.planningEligibility) &&
      l.controlSupport === 'unknown' && (l.reportedGroup === undefined || token(l.reportedGroup)) &&
      l.sourceIds.length && refs(l.sourceIds, sources, s => s.kind === 'facility') &&
      refs(l.additionalSourceIds ?? [], sources, s => s.kind === 'facility') &&
      refs(l.relatedSourceIds ?? [], sources) && refs(l.conflictIds ?? [], conflicts) && refs(l.modelIds, models) &&
      (l.status !== 'matched' || l.modelIds.length === 1) && (l.status !== 'unresolved' || l.modelIds.length === 0));
    for (const id of l.conflictIds ?? []) usedConflicts.add(id);
  }
  must(usedConflicts.size === conflicts.size);
  return {x, sources, leads, conflicts, models, release};
}

const groupLabels = {'freeslate-junior': 'Freeslate Junior reported roles',
  'h-cube-phoenix': 'H-Cube Pro and Phoenix reported configuration',
  'kinetics-suite': 'Unresolved roles in the reported kinetics suite',
  'paradox-lumidox': 'Paradox and Lumidox reported photochemistry roles'};
const locators = (lead, version) => ({namespace, native_id: lead.id, version, url: atlas + '#roar-' + lead.id});
const sourceEntry = (s, version) => ({
  source: {namespace: 'atlas:roar-source', native_id: s.id, version, url: s.url},
  observed_at: s.checked, snapshot_digest: null, visibility: 'public',
  use_rights: unknownRights('Dated public source link. Rights to use the source for assessment or republication are unknown.'),
});
export async function roarProposals(org, {x, leads, sources, conflicts, models, release}) {
  const groups = new Map();
  for (const l of leads.values()) {
    const key = l.status === 'matched' ? 'matched-' + l.id : l.reportedGroup ? 'group-' + l.reportedGroup :
      l.status === 'unresolved' ? 'unresolved' : 'compound-' + l.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }
  // Preserve source coverage even when a facility page supplied context only.
  const contextKey = groups.has('unresolved') ? 'unresolved' : groups.keys().next().value;
  return Promise.all([...groups].map(async ([key, roles]) => {
    const [first] = roles;
    const single = first.status === 'matched';
    const related = [...new Set(roles.flatMap(l => l.conflictIds ?? []))].map(id => conflicts.get(id));
    const sourceIds = new Set(roles.flatMap(l => [...l.sourceIds, ...(l.additionalSourceIds ?? []), ...(l.relatedSourceIds ?? [])]));
    for (const c of related) for (const id of [...c.relatedSourceIds, ...c.observations.map(o => o.sourceId)]) sourceIds.add(id);
    if (key === contextKey) for (const s of x.sourceCoverage) sourceIds.add(s.sourceId);
    const sourceRows = [...sourceIds].map(id => sources.get(id));
    const identities = [...new Set(roles.flatMap(l => l.modelIds))].map(id => models.get(id));
    // These three roles name the same model family, but say nothing about how many units exist.
    const junior = key === 'group-freeslate-junior' && identities.length === 1 && roles.every(l =>
      l.status === 'grouped' && l.modelIds.length === 1 && l.modelIds[0] === 'unchained-labs-freeslate-junior');
    const label = single ? first.reportedName : key === 'unresolved' ? 'Unresolved ROAR equipment reports' :
      (groupLabels[first.reportedGroup] ?? first.reportedName + ' (reported stack)');
    const statement = {format: packetFormat, report_label: label, release, retrieval_note: x.retrievalNote,
      source_coverage: x.sourceCoverage.filter(s => sourceIds.has(s.sourceId)), roles, conflicts: related, sources: sourceRows,
      candidate_models: identities, assurance: 'facility-reported',
      custody: 'unverified', configuration_fit: 'unknown', provider_willingness: 'unknown', availability: 'unknown'};
    const record = {record_type: single ? 'installation' : 'installation_group', label, reported_location: null,
      model: single || junior ? identities[0].recordRef : null,
      ...(!single ? {reported_count: null} : {}),
      external_id_claims: roles.map(l => ({identifier: locators(l, x.version), source_pointer: '/sources/' + sourceRows.findIndex(s => s.id === l.sourceIds[0])}))};
    const ids = await Promise.all(['report', 'packet'].map(kind => hash({org, key, kind})));
    return {key, ids: ids.map(id => 'roar-' + id.slice(7)), record, statement, use_rights: reportRights, observed_at: x.checked,
      sources: sourceRows.map(s => sourceEntry(s, x.version))};
  }));
}

export async function roarRevision(contracts, {org, actor, now, proposal, index, before, target}) {
  const {sources, observed_at} = proposal;
  const record = index === 0 ? proposal.record : {
    record_type: 'assertion', target, claim_kind: 'existence', outcome: 'unknown', state: 'unknown',
    reporter: {type: 'person', id: actor}, asserted_by: null, claimed_provider: null, claimed_custodian: null,
    verified_authority: null, statement: canonical(proposal.statement), observed_at, valid_until: null, related_assertions: [],
  };
  const w = {schema_version: schemaVersion, digest_profile: profile, organisation_id: org, record_id: proposal.ids[index],
    revision_id: crypto.randomUUID(), parent: before ? refOf(before.wire) : null, recorded_at: now,
    visibility: 'organisation_private', use_rights: proposal.use_rights, sources, record};
  w.content_digest = await wireDigest(w);
  must(wireShape(contracts, w));
  return w;
}

export function roarPacket(statement) {
  if (typeof statement !== 'string') return null;
  try {
    const p = parseReview(statement);
    return p?.format === packetFormat ? p : null;
  } catch { return null; }
}
