import {acceptsRecordAuthority, archiveDigest, canonical, date, hash, parseReview, recordLinks, refOf, refShape, sameRef, sourceRefShape, timestamp, validStoredWire, wireDigest, wireShape} from './contract.js';
import {assessService, assessmentAllowed, decisionQuestions, isFacilityDefault, recordStatus, serviceClaims, validRecordLink, validServiceRecord, validMatchInput} from './service.js';
import {surveyProjection, validSurveyDraft} from './survey.js';
import {installationLocator, installationRevisionId, installationText, validInstallationBinding} from './installation.js';

import {pilotCohortLimit, pilotReport, pilotReviewFits, pilotVersion, validPilot} from './pilot.js';

import {makeDraft, recordedExpiry, requestIdentity, requestSchema, reviewedDraftBlocker, sameReviewedMethod, validateDraftRow} from './request-draft.js';
import {readRoar, roarPacket, roarProposals, roarRevision} from './roar.js';

const ROOT = '/api/registry';
const TYPES = ['installation', 'installation_group', 'configuration', 'assertion', 'offer', ...serviceClaims];
const VISIBILITY = ['public', 'organisation', 'restricted'];
const ALL = "('owner','editor','reviewer')";
const REVIEW = "('owner','reviewer')";
const EDIT = "('owner','editor')";
const OWNER = "('owner')";
const assessmentRead = "(m.role IN ('owner','reviewer') OR (m.role = 'editor' AND r.visibility != 'restricted'))";
// Any revision can carry a private pointer. Keep the whole immutable chain
// together, including records which link indirectly to a restricted record.
const editorMayRead = (org, record, includeSelf = true) => `NOT EXISTS (
  WITH RECURSIVE referenced(id) AS (
    SELECT ${record}
    UNION
    SELECT links.linked_id FROM registry_record_links links JOIN referenced ON referenced.id = links.record_id
      WHERE links.org_id = ${org}
  )
  SELECT 1 FROM referenced
  JOIN registry_revisions initial ON initial.org_id = ${org} AND initial.record_id = referenced.id AND initial.seq = 1
  LEFT JOIN registry_publications sharing ON sharing.org_id = initial.org_id AND sharing.record_id = initial.record_id
  WHERE (initial.visibility = 'restricted' OR sharing.restricted = 1)
    ${includeSelf ? '' : `AND referenced.id <> ${record}`}
)`;
const readRecordAs = r => `(m.role IN ${REVIEW} OR (m.role = 'editor' AND ${editorMayRead(r + '.org_id', r + '.record_id')}))`;
const recordRead = readRecordAs('r');
const editorWriteGuard = `NOT EXISTS (SELECT 1 FROM registry_members e, json_each(?) j
  WHERE e.org_id = ? AND e.user_id = ? AND e.role = 'editor' AND NOT (${editorMayRead('e.org_id', 'j.value')}))`;
const current = 'NOT EXISTS (SELECT 1 FROM registry_revisions n WHERE n.org_id = r.org_id AND n.record_id = r.record_id AND n.seq > r.seq)';
const member = roles => `EXISTS (SELECT 1 FROM registry_members WHERE org_id = ? AND user_id = ? AND role IN ${roles})`;
const idPattern = /^[a-z0-9-]{1,128}$/;
const recordFields = ['visibility', 'observed_at', 'expires_at', 'use_rights', 'sources', 'record'];
const words = (s, n) => typeof s === 'string' && Boolean(s.trim()) && s.length <= n && !/[\u0000-\u001f\u007f]/.test(s);
const maxRows = 100;
const backupBudget = 600_000;
const utc = () => new Date().toISOString();

class RegistryProblem extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
const fail = (status, message) => { throw new RegistryProblem(status, message); };
const invalid = () => fail(400, 'Invalid registry input.');
const absent = () => fail(404, 'Registry resource not found.');
const stale = () => fail(409, 'The registry head or sharing policy changed; reload the current record.');
const same = (a, b) => canonical(a) === canonical(b);
const badMethod = () => fail(405, 'Method not allowed.');
function fields(x, required, optional = []) {
  if (!x || typeof x !== 'object' || Array.isArray(x) || required.some(k => !Object.hasOwn(x, k)) ||
    Object.keys(x).some(k => !required.includes(k) && !optional.includes(k))) invalid();
}
async function payload(req, maxBytes = 64 * 1024) {
  if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') fail(415, 'Send JSON.');
  const origin = req.headers.get('origin');
  if (origin !== null && origin !== new URL(req.url).origin) fail(403, 'Cross-site request refused.');
  const reader = req.body?.getReader();
  if (!reader) invalid();
  const decoder = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
  let size = 0, text = '';
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        fail(413, 'Registry request is too large.');
      }
      text += decoder.decode(value, {stream: true});
    }
    return parseReview(text + decoder.decode());
  } catch (e) {
    if (e instanceof RegistryProblem) throw e;
    invalid();
  }
}

function storage(db) {
  const q = (sql, ...args) => db.prepare(sql).bind(...args);
  return {q, one: (sql, ...args) => q(sql, ...args).first(),
    all: async (sql, ...args) => (await q(sql, ...args).all()).results,
    write: async (sql, ...args) => (await q(sql, ...args).run()).meta.changes,
    batch: statements => db.batch(statements)};
}
const orgData = r => ({id: r.id, name: r.name, claims: parseReview(r.claims), created_by: r.created_by, created_at: r.created_at, assurance: 'unverified'});
const effectiveVisibility = r => r.restricted === 1 || r.restricted_link === 1 ? 'restricted' : r.visibility;
const recordData = r => ({visibility: r.visibility, effective_visibility: effectiveVisibility(r),
  state: r.state, action: r.action, actor: r.actor, ...(r.service ? {service: r.service} : {}),
  ...(r.installation_event ? {installation_event: r.installation_event} : {}),
  ...(r.duplicate_count ? {duplicate_count: r.duplicate_count} : {}),
  ...(r.duplicate_backing ? {duplicate_backing: true} : {}),
  observed_at: r.observed_at, expires_at: r.expires_at, evidence_status: recordStatus(r, utc()) ?? 'current', record: r.wire});
function bounded(rows) {
  if (rows.length > maxRows) fail(413, 'Registry result exceeds the bounded list.');
  return rows;
}
function readRows(s, org, actor, filter, args = [], order = '', withDuplicates = false) {
  return s.all(`SELECT r.*, p.policy_id, p.restricted, p.disclosure, p.projection,
      p.revision_id AS publication_revision,
      (SELECT t.wire FROM registry_revisions t WHERE t.org_id = r.org_id AND
        t.revision_id = json_extract(r.installation_event,'$.target.revision_id')) AS installation_target_wire,
      ${withDuplicates ? `(SELECT COUNT(*) FROM registry_active_duplicates d JOIN registry_revisions dr ON dr.revision_id = d.revision_id
        WHERE d.org_id = r.org_id AND d.target_id = r.record_id AND ${readRecordAs('dr')}) AS duplicate_count,
        EXISTS (SELECT 1 FROM registry_active_duplicates d WHERE d.org_id = r.org_id AND
          d.source_id = json_extract(r.wire, '$.record.installation.record_id')) AS duplicate_backing,` : ''}
      CASE WHEN m.role = 'editor' OR ${editorMayRead('r.org_id', 'r.record_id', false)} THEN 0 ELSE 1 END AS restricted_link
    FROM registry_revisions r JOIN registry_members m ON m.org_id = r.org_id
    LEFT JOIN registry_publications p ON p.org_id = r.org_id AND p.record_id = r.record_id
    WHERE r.org_id = ? AND m.user_id = ? AND ${recordRead} AND (${filter}) ${order} LIMIT ${maxRows + 1}`, org, actor, ...args);
}
async function verifyRow(bundle, r) {
  const wire = parseReview(r.wire);
  if (!await validStoredWire(bundle, wire) ||
    wire.organisation_id !== r.org_id || wire.record_id !== r.record_id || wire.revision_id !== r.revision_id ||
    wire.visibility !== (r.visibility === 'public' ? 'public' : 'organisation_private')) throw Error('Registry revision integrity failed');
  const service = r.service == null ? null : parseReview(r.service);
  if (!validServiceRecord(wire, {...r, service})) throw Error('Registry service integrity failed');
  const installation_event = r.installation_event == null ? null : parseReview(r.installation_event);
  if (!await validInstallationBinding(bundle, wire, r, installation_event)) throw Error('Registry installation event integrity failed');
  if (installation_event?.target && Object.hasOwn(r, 'installation_target_wire')) {
    const target = r.installation_target_wire && parseReview(r.installation_target_wire);
    if (!target || !await validStoredWire(bundle, target) || !sameRef(installation_event.target, refOf(target)))
      throw Error('Registry duplicate target integrity failed');
  }
  return {...r, wire, service, installation_event};
}
async function head(ctx, id) {
  const [row] = await readRows(ctx.s, ctx.org, ctx.actor, `r.record_id = ? AND ${current}`, [id], '', true);
  if (!row) absent();
  return verifyRow(ctx.bundle, row);
}
async function resolve(ctx, ref, visibility = 'restricted') {
  if (!refShape(ctx.bundle, ref) || ref.organisation_id !== ctx.org) invalid();
  const [row] = await readRows(ctx.s, ctx.org, ctx.actor, 'r.record_id = ? AND r.revision_id = ?', [ref.record_id, ref.revision_id]);
  if (!row || row.visibility === 'restricted' && visibility !== 'restricted') invalid();
  const r = await verifyRow(ctx.bundle, row);
  if (!sameRef(refOf(r.wire), ref)) invalid();
  return r;
}
const reviewed = action => ['review', 'withdraw', 'supersede', 'review_disputed'].includes(action);
function distinct(ids) { if (new Set(ids).size !== ids.length) invalid(); }

function validateEvidence(wire, observed, expires) {
  const {record, sources, recorded_at: now} = wire;
  if (!date(observed) || observed > now.slice(0, 10) || expires !== null && (!timestamp(expires) ||
    Date.parse(expires) < Date.parse(observed))) invalid();
  for (const entry of sources) {
    const u = new URL(entry.source.url);
    if (u.username || u.password || entry.observed_at > now.slice(0, 10)) invalid();
  }
  function visit(obj) {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'source_pointer' && v !== null && !sources[Number(v.slice('/sources/'.length))]) invalid();
      visit(v);
    }
  }
  visit(record);
  if (record.record_type === 'configuration') {
    distinct((record.fitted_modules?.items || []).map(x => x.module_id));
    distinct((record.operating_envelopes || []).map(x => x.envelope_id));
    for (const envelope of record.operating_envelopes || []) for (const {threshold} of envelope.all_of) {
      for (const e of threshold.provenance.evidence) {
        if (!sources.some(s => s.source.native_id === e.document_id && s.snapshot_digest === e.document_digest)) invalid();
      }
    }
  }
  if (record.record_type === 'assertion' && (record.observed_at !== observed || record.valid_until !== expires)) invalid();
}

async function revisions(ctx, id, req, method) {
  const {s, org, actor, role, bundle} = ctx;
  const data = await payload(req), now = utc();
  const action = id ? data?.action ?? 'correct' : 'create';
  if (!['create', 'correct', 'review', 'review_disputed', 'withdraw', 'supersede', 'retire', 'restore'].includes(action) ||
    id && action === 'create') invalid();
  const copy = !['create', 'correct'].includes(action);
  if (!id) fields(data, recordFields, ['service']);
  else if (copy) fields(data, ['expected_head', 'action']);
  else fields(data, ['expected_head', ...recordFields], ['action', 'service']);
  const before = id ? await head(ctx, id) : null;
  if (before && (!refShape(bundle, data.expected_head) || !sameRef(refOf(before.wire), data.expected_head))) stale();
  if (before?.installation_event?.action === 'duplicate_link')
    fail(409, 'The owner must unlink this duplicate before changing its installation record.');
  if (before && (before.state === 'retired') !== (action === 'restore')) fail(409, 'A retired record needs an explicit restore.');
  const visibility = before?.visibility ?? data.visibility;
  if (!VISIBILITY.includes(visibility) || !copy && data.visibility !== visibility) invalid();
  const allowed = reviewed(action) ? REVIEW : visibility === 'restricted' ? REVIEW : EDIT;
  if (!allowed.includes("'" + role + "'")) fail(403, 'Your registry role cannot make this change.');
  // Organisation reviewers can review evidence but only owners/editors can change its source data.
  const record = copy ? {...before.wire.record} : {...data.record};
  if (!TYPES.includes(record.record_type) || before && record.record_type !== before.wire.record.record_type) invalid();
  if (!acceptsRecordAuthority(record)) invalid();
  if (before && !copy && record.record_type === 'installation' &&
    record.reported_location !== before.wire.record.reported_location)
    fail(400, 'Record the location with the dated installation move form.');
  if (record.record_type === 'assertion') {
    if (copy && ['withdraw', 'supersede'].includes(action)) record.state = action === 'withdraw' ? 'withdrawn' : 'superseded';
    if (!copy) {
      if (!['reported', 'disputed', 'unknown'].includes(record.state)) invalid();
      if (Object.hasOwn(record, 'reporter') && !same(record.reporter, {type: 'person', id: actor})) invalid();
      record.reporter = {type: 'person', id: actor};
    }
  } else if (record.record_type === 'offer') {
    if (action === 'withdraw') record.state = 'withdrawn';
    if (action === 'supersede') invalid();
    if (!copy && record.state === 'withdrawn' && before?.wire.record.state !== 'withdrawn') invalid();
  } else if (['withdraw', 'supersede'].includes(action) ||
    action === 'review_disputed' && !serviceClaims.includes(record.record_type)) invalid();
  const service = copy ? before.service : Object.hasOwn(data, 'service') ? data.service : before?.service ?? null;
  const observed = copy ? before.observed_at : data.observed_at;
  const expiryInput = copy ? before.expires_at : data.expires_at;
  const expires = timestamp(expiryInput) ? new Date(expiryInput).toISOString() : expiryInput;
  if (!copy && ['assertion', ...serviceClaims].includes(record.record_type) && record.valid_until === expiryInput) record.valid_until = expires;
  const wire = {
    schema_version: '0.1.0', digest_profile: 'agentic-lab/review-json/1', organisation_id: org,
    record_id: id || crypto.randomUUID(), revision_id: crypto.randomUUID(), parent: before ? refOf(before.wire) : null,
    recorded_at: now, visibility: visibility === 'public' ? 'public' : 'organisation_private',
    use_rights: copy ? before.wire.use_rights : data.use_rights,
    sources: copy ? before.wire.sources : data.sources, record,
  };
  wire.content_digest = await wireDigest(wire);
  if (!wireShape(bundle, wire) || before && isFacilityDefault(before) !== isFacilityDefault({wire})) invalid();
  const refs = recordLinks(record, org);
  if (wire.sources.length > 32 || refs.length > 24 ||
    !validServiceRecord(wire, {service, observed_at: observed, expires_at: expires, visibility})) invalid();
  distinct(refs.map(ref => ref.revision_id));
  validateEvidence(wire, observed, expires);
  if (reviewed(action) && !['withdraw', 'supersede'].includes(action) &&
    (expires !== null && expires <= now || ['withdrawn', 'superseded'].includes(record.state)))
    fail(409, 'Recheck the source dates before reviewing this evidence.');
  let restrictedLink = before?.restricted_link ?? 0;
  for (const ref of refs) {
    if (ref.record_id === wire.record_id) invalid();
    const linked = await resolve(ctx, ref, visibility);
    if (effectiveVisibility(linked) === 'restricted') restrictedLink = 1;
    if (!validRecordLink(wire, linked, ref)) invalid();
  }
  const previousRefs = before ? recordLinks(before.wire.record, org) : [];
  const newBacking = !copy && ['offer', 'configuration'].includes(record.record_type) ? refs
    .filter(ref => ['configuration', 'installation'].includes(ref.record_type) && !previousRefs.some(old => sameRef(old, ref)))
    .map(ref => ref.revision_id) : [];
  const state = action === 'retire' ? 'retired' : 'active', seq = (before?.seq ?? 0) + 1;
  const changed = await s.write(`INSERT INTO registry_revisions
    (org_id, record_id, seq, revision_id, visibility, state, action, actor, observed_at, expires_at, wire, service)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${member(allowed)} AND ${editorWriteGuard}
    ${before ? `AND EXISTS (SELECT 1 FROM registry_revisions r WHERE r.org_id = ? AND r.record_id = ?
      AND r.revision_id = ? AND ${current})` : ''}
    ${newBacking.length ? `AND NOT EXISTS (
      WITH RECURSIVE backing(id) AS (
        SELECT value FROM json_each(?)
        UNION SELECT l.linked_revision_id FROM registry_record_links l JOIN backing b ON l.revision_id = b.id
          WHERE l.org_id = ? AND l.edge = 'installation'
      )
      SELECT 1 FROM backing b JOIN registry_revisions dependency ON dependency.revision_id = b.id
      JOIN registry_active_duplicates d ON d.org_id = dependency.org_id AND d.source_id = dependency.record_id
      WHERE dependency.org_id = ?)` : ''}`,
  org, wire.record_id, seq, wire.revision_id, visibility, state, action, actor, observed, expires,
  canonical(wire), service ? canonical(service) : null, org, actor, canonical([wire.record_id, ...refs.map(ref => ref.record_id)]), org, actor,
  ...(before ? [org, id, before.revision_id] : []), ...(newBacking.length ? [canonical(newBacking), org, org] : []));
  if (!changed) stale();
  return [method === 'create' ? 201 : 200,
    {revision: recordData({visibility, restricted: before?.restricted, restricted_link: restrictedLink,
      state, action, actor, observed_at: observed, expires_at: expires, wire, service})}];
}

const canRepublish = rights => rights.discovery === 'permitted' && rights.republication === 'permitted';
function eligiblePublication(row) {
  const {wire} = row, r = wire.record;
  return effectiveVisibility(row) === 'public' && row.action === 'review' &&
    ['installation', 'installation_group'].includes(r.record_type) && words(r.label, 160) &&
    wire.sources.length > 0 && canRepublish(wire.use_rights) &&
    wire.sources.every(e => e.visibility === 'public' && canRepublish(e.use_rights));
}
function safeCitation(entry) {
  const {url} = entry.source;
  const u = new URL(url);
  return entry.visibility === 'public' && canRepublish(entry.use_rights) && u.protocol === 'https:' &&
    !u.username && !u.password && !/[?#\\]/.test(url);
}
function eligibleFields(row) {
  if (!eligiblePublication(row) || recordStatus(row, utc())) return null;
  const r = row.wire.record;
  return {reported_count: r.record_type === 'installation_group' && r.reported_count !== null,
    sources: row.wire.sources.flatMap((entry, index) => safeCitation(entry) ?
      [{index, url: entry.source.url, observed_at: entry.observed_at}] : [])};
}
function disclosureFields(data) {
  fields(data, [], ['reported_count', 'source_indices']);
  if (Object.hasOwn(data, 'reported_count') && typeof data.reported_count !== 'boolean') invalid();
  const indices = Object.hasOwn(data, 'source_indices') ? data.source_indices : [];
  if (!Array.isArray(indices) || indices.length > 5 || !indices.every(i => Number.isInteger(i) && i >= 0 && i < 32)) invalid();
  distinct(indices);
  return {reported_count: data.reported_count === true, source_indices: indices};
}
function publicProjection(row, selection) {
  if (!eligiblePublication(row)) return null;
  const {wire} = row, r = wire.record;
  const legacyCount = selection === null && r.record_type === 'installation_group';
  if (selection?.reported_count && (r.record_type !== 'installation_group' || r.reported_count === null)) return null;
  const citations = [];
  for (const index of selection?.source_indices ?? []) {
    const source = wire.sources[index];
    if (!source || !safeCitation(source)) return null;
    citations.push({url: source.source.url, observed_at: source.observed_at});
  }
  return {record_id: wire.record_id, revision_id: wire.revision_id, record_type: r.record_type,
    label: r.label, observed_at: row.observed_at, assurance: 'reported',
    ...(legacyCount || selection?.reported_count ? {reported_count: r.reported_count} : {}),
    ...(citations.length ? {sources: citations} : {})};
}
function storedProjection(row) {
  if (row.projection === null || row.publication_revision !== row.revision_id ||
    row.restricted === 1 || recordStatus(row, utc())) return null;
  const published = parseReview(row.projection);
  const selection = row.disclosure === null ? null : disclosureFields(parseReview(row.disclosure));
  const expected = publicProjection(row, selection);
  if (!expected || !same(expected, published)) throw Error('Registry publication integrity failed');
  return expected;
}
function sharingData(row) {
  return {policy_id: row.policy_id, restricted: row.restricted === 1, effective_visibility: effectiveVisibility(row),
    head: refOf(row.wire), publication: storedProjection(row), eligible_fields: eligibleFields(row)};
}

async function sharing(ctx, id, req, action) {
  if (ctx.role !== 'owner') fail(403, 'Only a registry owner can manage sharing.');
  const row = await head(ctx, id);
  if (req.method === 'GET' && action === 'sharing') return [200, {sharing: sharingData(row)}];
  if (req.method !== 'POST') return badMethod();
  const data = await payload(req);
  const pins = ['expected_head', 'expected_policy_id'];
  if (action === 'sharing') fields(data, [...pins, 'restricted']);
  else if (action === 'publication') fields(data, [...pins, 'publish'], ['fields']);
  else fields(data, pins, ['fields']);
  if (!refShape(ctx.bundle, data.expected_head) || !sameRef(refOf(row.wire), data.expected_head) ||
    data.expected_policy_id !== row.policy_id) stale();
  if (action === 'sharing' && typeof data.restricted !== 'boolean' ||
    action === 'publication' && typeof data.publish !== 'boolean') invalid();
  if (action === 'sharing' && data.restricted === (row.restricted === 1))
    fail(409, 'The requested sharing restriction is already set.');
  const releasing = action === 'publication-preview' || data.publish === true;
  if (!releasing && Object.hasOwn(data, 'fields')) invalid();
  const selection = releasing ? disclosureFields(Object.hasOwn(data, 'fields') ? data.fields : {}) : null;
  const projection = releasing ? publicProjection(row, selection) : null;
  const now = utc();
  if (releasing && (!projection || recordStatus(row, now)))
    fail(409, 'Publication needs a current reviewed public report and eligible fields.');
  if (action === 'publication-preview') return [200, {publication: projection}];
  const restricted = action === 'sharing' ? Number(data.restricted) : row.restricted ?? 0;
  const policy_id = crypto.randomUUID();
  const changed = await ctx.s.write(`INSERT INTO registry_publications
    (org_id, record_id, revision_id, actor, decided_at, projection, policy_id, restricted, disclosure)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${member(OWNER)} AND EXISTS (
      SELECT 1 FROM registry_revisions r
      LEFT JOIN registry_publications p ON p.org_id = r.org_id AND p.record_id = r.record_id
      WHERE r.org_id = ? AND r.record_id = ? AND r.revision_id = ? AND p.policy_id IS ? AND ${current}
      ${releasing ? `AND COALESCE(p.restricted, 0) = 0 AND r.visibility = 'public' AND r.state = 'active' AND ${editorMayRead('r.org_id', 'r.record_id')} AND r.action = 'review' AND (r.expires_at IS NULL OR r.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))` : ''})
    ON CONFLICT (org_id, record_id) DO UPDATE SET revision_id = excluded.revision_id, actor = excluded.actor,
      decided_at = excluded.decided_at, projection = excluded.projection, policy_id = excluded.policy_id,
      restricted = excluded.restricted, disclosure = excluded.disclosure`,
  ctx.org, id, row.revision_id, ctx.actor, now, projection && canonical(projection), policy_id, restricted,
  selection && canonical(selection), ctx.org, ctx.actor, ctx.org, id, row.revision_id, row.policy_id);
  if (!changed) stale();
  return [200, {publication: projection, sharing: {policy_id, restricted: restricted === 1,
    effective_visibility: effectiveVisibility({...row, restricted}), head: refOf(row.wire)}}];
}

async function publicRead(s, bundle, id, req) {
  const params = new URL(req.url).searchParams;
  const after = params.get('after') ?? '', limit = params.get('limit') ?? '25';
  if (id !== undefined && !idPattern.test(id)) absent();
  if ((after && !idPattern.test(after)) || !/^(?:[1-9]|[1-4][0-9]|50)$/.test(limit)) invalid();
  const rows = await s.all(`SELECT r.*, p.projection, p.disclosure, p.restricted, p.revision_id AS publication_revision
    FROM registry_publications p JOIN registry_revisions r
    ON r.org_id = p.org_id AND r.record_id = p.record_id AND r.revision_id = p.revision_id
    WHERE p.projection IS NOT NULL AND p.restricted = 0 AND r.visibility = 'public' AND r.state = 'active'
      AND ${editorMayRead('r.org_id', 'r.record_id')} AND r.action = 'review' AND (r.expires_at IS NULL OR r.expires_at > ?) AND ${current}
      AND p.record_id ${id === undefined ? '>': '='} ? ORDER BY p.record_id LIMIT ?`, utc(), id ?? after,
    id === undefined ? Number(limit) + 1 : 1);
  const publications = [];
  for (const row of rows.slice(0, Number(limit))) {
    const safe = storedProjection(await verifyRow(bundle, row));
    if (safe) publications.push(safe);
  }
  if (id !== undefined) {
    if (!publications.length) absent();
    return [200, {publication: publications[0]}];
  }
  return [200, {publications, next_after: rows.length > Number(limit) ? rows[Number(limit) - 1].record_id : null}];
}

// Use the same report scope for evaluation, compare-and-save and currentness.
const reportHeadFilter = (org, actor, targets) => `r.org_id = ${org} AND m.user_id = ${actor} AND ${recordRead} AND ${current}
  AND json_extract(r.wire,'$.record.target.revision_id') IN (${targets})
  AND (json_extract(r.wire,'$.record.record_type') = 'availability_claim' OR
    json_extract(r.wire,'$.record.record_type') = 'access_claim' AND (
      json_extract(r.wire,'$.record.subject.kind') = 'public' OR
      json_extract(r.wire,'$.record.subject.kind') = 'organisation' AND json_extract(r.wire,'$.record.subject.id') = r.org_id OR
      json_extract(r.wire,'$.record.subject.kind') = 'principal' AND json_extract(r.wire,'$.record.subject.id') = m.user_id))`;

async function serviceSnapshot(ctx, id, expected) {
  const {s, org, actor, bundle} = ctx;
  // One SQLite snapshot for the offer, applicable claim heads, exact historical
  // dependencies and their current heads. All reads use current visibility.
  const rows = await s.all(`WITH RECURSIVE
    offer_head(revision_id) AS (
      SELECT r.revision_id FROM registry_revisions r JOIN registry_members m ON m.org_id = r.org_id
      WHERE r.org_id = ?1 AND m.user_id = ?2 AND r.record_id = ?3 AND ${recordRead} AND ${current}
        AND json_extract(r.wire,'$.record.record_type') = 'offer'
    ),
    backing(revision_id) AS (
      SELECT revision_id FROM offer_head
      UNION
      SELECT l.linked_revision_id FROM registry_record_links l JOIN backing b ON l.revision_id = b.revision_id
        WHERE l.org_id = ?1 AND l.edge IN ('configuration','installation') AND l.linked_revision_id IS NOT NULL
    ),
    reports(revision_id) AS (
      SELECT r.revision_id FROM registry_revisions r JOIN registry_members m ON m.org_id = r.org_id
      WHERE ${reportHeadFilter('?1', '?2', 'SELECT revision_id FROM backing')}
    ),
    pins(revision_id) AS (
      SELECT revision_id FROM offer_head
      UNION SELECT revision_id FROM reports
      UNION SELECT l.linked_revision_id FROM registry_record_links l JOIN pins p ON l.revision_id = p.revision_id
        WHERE l.org_id = ?1 AND l.linked_revision_id IS NOT NULL AND l.edge != 'reconciliation'
    )
    SELECT r.*, h.revision_id AS head_id,
      CASE WHEN p.restricted = 1 OR NOT (${editorMayRead('r.org_id', 'r.record_id')}) THEN 1 ELSE 0 END AS restricted_link,
      r.revision_id IN (SELECT revision_id FROM offer_head) AS is_offer,
      r.revision_id IN (SELECT revision_id FROM reports) AS is_report
    FROM pins JOIN registry_revisions r ON r.revision_id = pins.revision_id
    JOIN registry_members m ON m.org_id = r.org_id
    JOIN registry_revisions h ON h.org_id = r.org_id AND h.record_id = r.record_id
      AND h.seq = (SELECT MAX(seq) FROM registry_revisions WHERE org_id = r.org_id AND record_id = r.record_id)
    LEFT JOIN registry_publications p ON p.org_id = r.org_id AND p.record_id = r.record_id
    WHERE r.org_id = ?1 AND m.user_id = ?2 AND ${recordRead} LIMIT 49`, org, actor, id);
  const rawOffer = rows.find(row => row.is_offer);
  if (!rawOffer) absent();
  if (rows.length > 48) fail(413, 'This service has too many related records for a bounded assessment.');
  const now = utc(), checked = await Promise.all(rows.map(row => verifyRow(bundle, row)));
  const byPin = new Map(checked.map(row => [row.revision_id, row]));
  const offer = byPin.get(rawOffer.revision_id);
  if (!sameRef(expected, refOf(offer.wire))) stale();
  if (isFacilityDefault(offer)) fail(409, 'A facility default supplies policy rules; choose a service offer to assess.');
  const get = ref => {
    const row = byPin.get(ref.revision_id);
    if (!row || !sameRef(ref, refOf(row.wire))) fail(409, 'An exact service dependency is unavailable; no match was calculated.');
    return {row, status: row.head_id !== row.revision_id ? 'revised' : recordStatus(row, now) ?? 'current'};
  };
  for (const row of checked) {
    if (!assessmentAllowed(row.wire)) fail(409, 'Visible evidence does not declare assessment use. Review use rights before matching.');
    for (const ref of recordLinks(row.wire.record, org)) get(ref);
  }
  return {offer, now, checked, get, reports: checked.filter(row => row.is_report)};
}

function capturedMatch(scope, input, result, refresh) {
  const {enquiry_routes, ...historical} = result;
  const snapshot = scope.checked.map(row => {
    const reference = refOf(row.wire);
    return {reference, status: scope.get(reference).status, head_revision_id: row.head_id};
  });
  return {format: 'planner-service-match/1', input, result: historical, snapshot, ...(refresh ? {refresh} : {})};
}

async function saveMatches(ctx, scope, captures) {
  const {s, org, actor} = ctx, {checked, reports, now} = scope;
  const references = checked.map(row => refOf(row.wire));
  const visibility = checked.some(row => effectiveVisibility(row) === 'restricted') ? 'restricted' : 'organisation';
  const pins = Object.fromEntries(checked.map(row => [row.record_id, row.head_id]));
  const targets = [...new Set(captures[0].result.evidence.map(e => e.target.revision_id))];
  const entries = captures.map(capture => ({id: crypto.randomUUID(), capture: canonical(capture)}));
  const predecessors = captures.flatMap(c => c.refresh ? [c.refresh.prior_id] : []);
  const changed = await s.write(`INSERT INTO registry_assessments (org_id,id,actor,created_at,visibility,refs,match_input)
    SELECT ?,json_extract(x.value,'$.id'),?,?,?,?,json_extract(x.value,'$.capture') FROM json_each(?) x
    WHERE ${member(visibility === 'restricted' ? REVIEW : ALL)} AND ${editorWriteGuard}
      AND NOT EXISTS (SELECT 1 FROM json_each(?) pin WHERE NOT EXISTS (
        SELECT 1 FROM registry_revisions r WHERE r.org_id = ? AND r.record_id = pin.key AND r.revision_id = pin.value AND ${current}))
      AND NOT EXISTS (
        SELECT 1 FROM registry_revisions r JOIN registry_members m ON m.org_id = r.org_id
        WHERE ${reportHeadFilter('?', '?', 'SELECT value FROM json_each(?)')}
        AND r.revision_id NOT IN (SELECT value FROM json_each(?)))
      AND NOT EXISTS (
        SELECT 1 FROM registry_assessments a WHERE a.org_id = ? AND a.actor = ?
        AND json_extract(a.match_input,'$.refresh.prior_id') IN (SELECT value FROM json_each(?)))
      AND NOT EXISTS (SELECT 1 FROM json_each(?) prior WHERE NOT EXISTS (
        SELECT 1 FROM registry_assessments a JOIN registry_members m ON m.org_id = a.org_id
        WHERE a.org_id = ? AND a.actor = ? AND m.user_id = a.actor AND a.id = prior.value
          AND (m.role IN ${REVIEW} OR m.role = 'editor' AND a.visibility != 'restricted')
          AND NOT EXISTS (SELECT 1 FROM json_each(a.refs) pin WHERE NOT EXISTS (
            SELECT 1 FROM registry_revisions r WHERE r.org_id = a.org_id
              AND r.revision_id = json_extract(pin.value,'$.revision_id') AND ${recordRead}))))`,
  org, actor, now, visibility, canonical(references), canonical(entries), org, actor,
  canonical(Object.keys(pins)), org, actor, canonical(pins), org,
  org, actor, canonical(targets), canonical(reports.map(row => row.revision_id)), org, actor, canonical(predecessors),
  canonical(predecessors), org, actor);
  if (changed !== captures.length) stale();
  return entries.map(e => e.id);
}

const reviewAnswers = (scope, result) => scope.reports
  .filter(row => row.action === 'review' && row.wire.sources.length && row.wire.record.record_type === 'access_claim' &&
    row.wire.record.dimension === 'training' && row.wire.record.outcome !== 'unknown' &&
    sameRef(row.wire.record.target, result.offer) &&
    result.evidence.find(e => sameRef(e.target, result.offer))?.reports.some(r =>
      r.reference.revision_id === row.revision_id && r.status === 'current'))
  .map(row => ({reference: refOf(row.wire), outcome: row.wire.record.outcome, observed_at: row.observed_at}));

async function matchService(ctx, id, req) {
  const {org, bundle} = ctx, data = await payload(req);
  fields(data, ['expected_head', 'method', 'material', 'requirements', 'conditions'], ['save', 'questions', 'required_modules']);
  const {save = false, questions = false, ...input} = data;
  if (typeof save !== 'boolean' || typeof questions !== 'boolean' || !validMatchInput(input, {
    sourceRef: ref => sourceRefShape(bundle, ref), revisionRef: ref => refShape(bundle, ref),
  }) || input.expected_head.record_id !== id || input.expected_head.organisation_id !== org) invalid();
  const scope = await serviceSnapshot(ctx, id, input.expected_head);
  const {offer, reports, get, now} = scope, result = assessService(offer, input, reports, get, now);
  const guidance = questions ? {questions: decisionQuestions(offer, input, reports, get, now, result),
    reviewed_answers: reviewAnswers(scope, result)} : {};
  if (!save) return [200, {match: result, ...guidance}];
  const [assessment_id] = await saveMatches(ctx, scope, [capturedMatch(scope, input, result)]);
  return [201, {match: result, assessment_id, ...guidance}];
}

async function refreshMatches(ctx, id, req) {
  const {s, org, actor, bundle} = ctx, data = await payload(req);
  fields(data, ['expected_head', 'reviewed_answer']);
  if (!refShape(bundle, data.expected_head) || data.expected_head.record_id !== id || data.expected_head.organisation_id !== org ||
    !refShape(bundle, data.reviewed_answer) || data.reviewed_answer.organisation_id !== org) invalid();
  const scope = await serviceSnapshot(ctx, id, data.expected_head);
  const {offer, reports, get, now} = scope;
  const assess = input => assessService(offer, input, reports, get, now);
  const authority = assess({method: null, material: null, requirements: [], conditions: []});
  if (authority.offer_status !== 'current' || authority.route === 'policy_or_evidence_needs_recheck' ||
    !reviewAnswers(scope, authority).some(a => sameRef(a.reference, data.reviewed_answer)))
    fail(409, 'A current, dated and reviewed training report on this exact offer is required.');
  const pending = await s.all(`SELECT a.* FROM registry_assessments a JOIN registry_members m ON m.org_id = a.org_id
    WHERE a.org_id = ? AND a.actor = ? AND m.user_id = a.actor
      AND (m.role IN ${REVIEW} OR m.role = 'editor' AND a.visibility != 'restricted')
      AND json_extract(a.match_input,'$.input.expected_head.revision_id') = ?
      AND NOT EXISTS (SELECT 1 FROM json_each(a.refs) pin WHERE json_extract(pin.value,'$.revision_id') = ?)
      AND NOT EXISTS (SELECT 1 FROM registry_assessments c WHERE c.org_id = a.org_id AND c.actor = a.actor
        AND json_extract(c.match_input,'$.refresh.prior_id') = a.id)
      AND NOT EXISTS (SELECT 1 FROM json_each(a.refs) pin WHERE NOT EXISTS (
        SELECT 1 FROM registry_revisions r WHERE r.org_id = a.org_id
          AND r.revision_id = json_extract(pin.value,'$.revision_id') AND ${recordRead}))
    ORDER BY a.id LIMIT 13`, org, actor, data.expected_head.revision_id, data.reviewed_answer.revision_id);
  const more = pending.length > 12, candidates = pending.slice(0, 12);
  if (!candidates.length) return [200, {refreshed: [], more: false}];
  const captures = candidates.map(row => {
    const old = parseReview(row.match_input);
    if (!sameRef(old.input.expected_head, data.expected_head)) throw Error('Registry assessment binding failed');
    return capturedMatch(scope, old.input, assess(old.input), {prior_id: row.id, answer: data.reviewed_answer});
  });
  const ids = await saveMatches(ctx, scope, captures);
  const summarize = result => ({
    route: result.route, technical_fit: result.technical_fit, access: result.access,
    training: result.evidence.find(e => sameRef(e.target, result.offer)).dimensions.training.reported_status,
  });
  return [201, {more, refreshed: captures.map((capture, i) => ({
    prior_id: candidates[i].id, assessment_id: ids[i], before: summarize(parseReview(candidates[i].match_input).result),
    after: summarize(capture.result),
  }))}];
}

async function assessments(ctx, id, req) {
  const {s, org, actor, role, bundle} = ctx;
  if (req.method === 'POST' && !id) {
    const data = await payload(req);
    fields(data, ['visibility', 'references']);
    if (!['organisation', 'restricted'].includes(data.visibility) || !Array.isArray(data.references) ||
      !data.references.length || data.references.length > 24) invalid();
    if (data.visibility === 'restricted' && role === 'editor') fail(403, 'Your registry role cannot write restricted assessments.');
    if (!data.references.every(ref => refShape(bundle, ref))) invalid();
    distinct(data.references.map(ref => ref.revision_id));
    const pending = [...data.references], closure = new Map();
    while (pending.length) {
      const ref = pending.pop();
      if (closure.has(ref.revision_id)) {
        if (!sameRef(closure.get(ref.revision_id), ref)) invalid();
        continue;
      }
      if (closure.size >= 48) invalid();
      const r = await resolve(ctx, ref, data.visibility);
      if (!assessmentAllowed(r.wire))
        fail(409, 'The evidence does not declare assessment use.');
      closure.set(ref.revision_id, ref);
      pending.push(...recordLinks(r.wire.record, org));
    }
    const id = crypto.randomUUID(), created_at = utc();
    const changed = await s.write(`INSERT INTO registry_assessments (org_id, id, actor, created_at, visibility, refs)
      SELECT ?, ?, ?, ?, ?, ? WHERE ${member(data.visibility === 'restricted' ? REVIEW : ALL)} AND ${editorWriteGuard}`,
    org, id, actor, created_at, data.visibility, canonical([...closure.values()]), org, actor,
    canonical([...closure.values()].map(ref => ref.record_id)), org, actor);
    if (!changed) absent();
    return [201, {assessment: {id, created_at, references: [...closure.values()]}}];
  }
  if (req.method !== 'GET') return badMethod();
  const params = new URL(req.url).searchParams;
  const paged = !id && (params.has('limit') || params.has('after'));
  const limitText = params.get('limit') ?? '25', after = params.get('after');
  if (paged && (!/^(?:[1-9]|[1-4][0-9]|50)$/.test(limitText) ||
      params.getAll('limit').length > 1 || params.getAll('after').length > 1)) invalid();
  const limit = paged ? Number(limitText) : maxRows;
  let cursor = [];
  if (paged && after !== null) {
    cursor = after.split('~');
    if (cursor.length !== 2 || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(cursor[0]) ||
        !timestamp(cursor[0]) || !idPattern.test(cursor[1])) invalid();
  }
  const rows = await s.all(`SELECT r.* FROM registry_assessments r JOIN registry_members m ON m.org_id = r.org_id
    WHERE r.org_id = ? AND m.user_id = ? AND ${assessmentRead}
    ${id ? 'AND r.id = ?' : cursor.length ? 'AND (r.created_at, r.id) > (?, ?)' : ''}
    ORDER BY r.created_at, r.id LIMIT ?`, org, actor, ...(id ? [id] : cursor), id ? 1 : limit + 1);
  if (id && !rows.length) absent();
  if (!paged) bounded(rows);
  const last = rows[limit - 1];
  const listResult = assessments => ({assessments, ...(paged ? {
    next_after: rows.length > limit ? last.created_at + '~' + last.id : null,
  } : {})});
  const pins = rows.slice(0, limit).map(row => ({...row, references: parseReview(row.refs)}));
  const revisions = new Map(pins.flatMap(row => row.references.map(ref => [ref.revision_id, ref])));
  if (!revisions.size) return [200, listResult([])];
  // Resolve every pinned revision and its current head in one SQLite snapshot.
  const joined = await s.all(`SELECT r.*, h.seq AS head_seq, h.revision_id AS head_id,
    h.wire AS head_wire, h.state AS head_state, h.action AS head_action, h.actor AS head_actor, h.observed_at AS head_observed, h.expires_at AS head_expiry, h.service AS head_service, h.installation_event AS head_installation_event
    FROM json_each(?) j JOIN registry_revisions r ON r.revision_id = j.value
    JOIN registry_members m ON m.org_id = r.org_id
    JOIN registry_revisions h ON h.org_id = r.org_id AND h.record_id = r.record_id
      AND h.seq = (SELECT MAX(seq) FROM registry_revisions WHERE org_id = r.org_id AND record_id = r.record_id)
    WHERE r.org_id = ? AND m.user_id = ? AND ${recordRead}`, JSON.stringify([...revisions.keys()]), org, actor);
  const now = utc(), statuses = new Map();
  for (const row of joined) {
    const pinned = await verifyRow(bundle, row);
    const latest = row.head_id === row.revision_id ? pinned : await verifyRow(bundle, {
      ...row, seq: row.head_seq, revision_id: row.head_id, wire: row.head_wire, state: row.head_state,
      action: row.head_action, actor: row.head_actor, observed_at: row.head_observed, expires_at: row.head_expiry, service: row.head_service,
      installation_event: row.head_installation_event,
    });
    const exact = refOf(pinned.wire);
    statuses.set(row.revision_id, {reference: exact, current_head: refOf(latest.wire),
      status: row.head_id === row.revision_id ? recordStatus(latest, now) ?? 'current' : 'revised'});
  }
  const matchIds = pins.filter(row => row.actor === actor && row.match_input !== null).map(row => row.id);
  const currentReportScope = reportHeadFilter('a.org_id', 'a.actor',
    "SELECT json_extract(value,'$.target.revision_id') FROM json_each(a.match_input,'$.result.evidence')");
  const changedReportSets = new Set((matchIds.length ? await s.all(`
    SELECT a.id FROM registry_assessments a
    JOIN registry_members viewer ON viewer.org_id = a.org_id AND viewer.user_id = ?
    WHERE a.org_id = ? AND a.actor = viewer.user_id AND a.id IN (SELECT value FROM json_each(?))
      AND (viewer.role IN ${REVIEW} OR viewer.role = 'editor' AND a.visibility != 'restricted')
      AND (EXISTS (
        SELECT 1 FROM registry_revisions r JOIN registry_members m ON m.org_id = r.org_id
        WHERE ${currentReportScope}
          AND r.revision_id NOT IN (SELECT json_extract(value,'$.revision_id') FROM json_each(a.refs))
      ) OR EXISTS (
        SELECT 1 FROM json_each(a.refs) pin WHERE json_extract(pin.value,'$.record_type') IN ('access_claim','availability_claim')
          AND NOT EXISTS (
            SELECT 1 FROM registry_revisions r JOIN registry_members m ON m.org_id = r.org_id
            WHERE ${currentReportScope} AND r.revision_id = json_extract(pin.value,'$.revision_id')
          )
      ))`, actor, org, canonical(matchIds)) : []).map(row => row.id));
  const assessed = pins.map(row => {
    const dependencies = row.references.map(ref => {
      const dependency = statuses.get(ref.revision_id);
      if (!dependency) return {status: 'unavailable'};
      if (!sameRef(ref, dependency.reference)) throw Error('Registry assessment binding failed');
      return dependency;
    });
    const privateMatch = row.match_input !== null;
    const capture = privateMatch && row.actor === actor ? parseReview(row.match_input) : null;
    const snapshot = new Map(capture?.snapshot.map(dep => [dep.reference.revision_id, dep]) ?? []);
    const readable = dependencies.every(d => d.status !== 'unavailable');
    const current = privateMatch && !capture ? null : readable && !changedReportSets.has(row.id) && dependencies.every(d => {
      if (!capture) return d.status === 'current';
      const previous = snapshot.get(d.reference.revision_id);
      return previous?.status === d.status && previous.head_revision_id === d.current_head.revision_id;
    });
    return {id: row.id, created_at: row.created_at, visibility: row.visibility, dependencies, current,
      ...(capture && readable ? {match: capture} : {})};
  });
  return [200, id ? {assessment: assessed[0]} : listResult(assessed)];
}

const requestFail = (status, code, message) => { throw new RegistryProblem(status, message, code); };
const requestConflict = (code, message) => requestFail(409, code, message);

async function requestCapture(ctx, id) {
  const {s, org, actor} = ctx;
  const row = await s.one(`SELECT r.* FROM registry_assessments r JOIN registry_members m ON m.org_id = r.org_id
    WHERE r.org_id = ? AND r.id = ? AND r.actor = ? AND m.user_id = r.actor AND ${assessmentRead}
      AND r.match_input IS NOT NULL`, org, id, actor);
  if (!row) absent();
  return {row, capture: parseReview(row.match_input)};
}

const currentRefs = capture => capture.snapshot.map(d => d.reference)
  .sort((a, b) => a.revision_id.localeCompare(b.revision_id));
function applicableRequestEvidence(result, selected, scope, org, actor) {
  const chosen = [result.offer, selected.configuration, selected.installation];
  const evidence = result.evidence.filter(e => chosen.some(ref => sameRef(ref, e.target)));
  for (const [dimension, state] of [
    ['provider_willingness', 'affirmed'], ['eligibility', 'affirmed'], ['training', 'affirmed'], ['availability', 'available'],
  ]) {
    const relevant = evidence.flatMap(e => e.reports.filter(r => r.dimension === dimension));
    const accepted = relevant.some(r => {
      const row = scope.get(r.reference).row, subject = row.wire.record.subject;
      return row.action === 'review' && r.status === 'current' && r.outcome === state && row.wire.sources.length &&
        (dimension === 'availability' || subject?.kind === 'organisation' && subject.id === org ||
          subject?.kind === 'principal' && subject.id === actor);
    });
    const conflict = evidence.some(e => ['reported_denied', 'reported_unavailable', 'conflicting_reports', 'disputed']
      .includes(e.dimensions[dimension].reported_status));
    if (!accepted || conflict) requestConflict(dimension + '_unresolved',
      'Current reviewed evidence does not support ' + dimension.replaceAll('_', ' ') + ' for this request.');
  }
}

async function currentRequestScope(ctx, capture, configuration) {
  const offer = capture.result.offer;
  let scope;
  try { scope = await serviceSnapshot(ctx, offer.record_id, offer); }
  catch (e) {
    if (e instanceof RegistryProblem && e.status === 409) requestConflict('assessment_stale', 'Recheck the saved assessment and evidence rights.');
    throw e;
  }
  if (!same(currentRefs(capture), scope.checked.map(row => refOf(row.wire)).sort((a, b) => a.revision_id.localeCompare(b.revision_id))))
    requestConflict('assessment_stale', 'The visible evidence changed. Reassess this exact offer.');
  for (const dep of capture.snapshot) {
    const status = scope.get(dep.reference);
    if (status.status !== dep.status || status.row.head_id !== dep.head_revision_id)
      requestConflict('assessment_stale', 'A saved dependency changed or expired. Reassess this exact offer.');
  }
  const live = assessService(scope.offer, capture.input, scope.reports, scope.get, scope.now);
  const selected = live.configurations.find(c => c.configuration && sameRef(c.configuration, configuration));
  if (!selected || selected.installation.record_type !== 'installation')
    requestConflict('installation_unidentified', 'Choose an exact configuration of one identifiable installation.');
  const installation = scope.get(selected.installation).row;
  const record = installation.wire.record;
  const sourceFor = pointer => {
    const index = /^\/sources\/(0|[1-9][0-9]*)$/.exec(pointer || '')?.[1];
    return index !== undefined && installation.wire.sources[Number(index)];
  };
  if (!record.model || !record.external_id_claims?.some(c => sourceFor(c.source_pointer)))
    requestConflict('installation_unidentified', 'The installation needs a sourced individual identity and exact model.');
  const config = scope.get(configuration).row;
  if (live.route !== 'reported_fit_access_unverified' || selected.technical_fit !== 'reported_fit' || selected.access_status !== 'unverified')
    requestConflict('service_unresolved', 'The exact service, material, method or configuration needs reassessment.');
  if (![scope.offer, installation, config].every(row => row.action === 'review' && row.wire.sources.length))
    requestConflict('review_required', 'Review the offer, installation and configuration with their evidence before preparing.');
  applicableRequestEvidence(live, selected, scope, ctx.org, ctx.actor);
  return {scope, installation: selected.installation, model: record.model,
    facility_routes: live.enquiry_routes, expiry: recordedExpiry(scope.now, scope.checked.filter(row => scope.get(refOf(row.wire)).status === 'current'))};
}

function requestScopeGuard(ctx, scope, capture) {
  const {org, actor} = ctx;
  const heads = Object.fromEntries(scope.checked.map(row => [row.record_id, row.head_id]));
  const targets = capture.result.evidence.map(e => e.target.revision_id);
  return {
    sql: `${editorWriteGuard}
      AND NOT EXISTS (SELECT 1 FROM json_each(?) pin WHERE NOT EXISTS (
        SELECT 1 FROM registry_revisions r WHERE r.org_id = ? AND r.revision_id = pin.value AND ${current}))
      AND NOT EXISTS (SELECT 1 FROM registry_revisions r JOIN registry_members m ON m.org_id = r.org_id
        WHERE ${reportHeadFilter('?', '?', 'SELECT value FROM json_each(?)')}
        AND r.revision_id NOT IN (SELECT value FROM json_each(?)))
      AND NOT EXISTS (SELECT 1 FROM json_each(?) prior WHERE NOT EXISTS (
        SELECT 1 FROM registry_revisions r JOIN registry_members m ON m.org_id = r.org_id
        WHERE ${reportHeadFilter('?', '?', 'SELECT value FROM json_each(?)')} AND r.revision_id = prior.value))`,
    args: [canonical(Object.keys(heads)), org, actor, canonical(heads), org,
      org, actor, canonical(targets), canonical(scope.reports.map(row => row.revision_id)),
      canonical(scope.reports.map(row => row.revision_id)), org, actor, canonical(targets)],
  };
}

async function draftResponse(ctx, row, read) {
  const {capture} = await requestCapture(ctx, row.assessment_id);
  if (Date.parse(row.expires_at) <= Date.now()) requestFail(410, 'draft_expired', 'This local draft has expired. Reassess before preparing a new one.');
  const draft = await validateDraftRow(row, capture, ctx.org);
  const {scope, facility_routes, model} = await currentRequestScope(ctx, capture, draft.configuration);
  if (!same(model, draft.model)) throw Error('Registry request draft model integrity failed');
  const guard = requestScopeGuard(ctx, scope, capture);
  const {s, org, actor} = ctx;
  const safe = await s.one(`SELECT 1 AS ok FROM registry_assessments r JOIN registry_members m ON m.org_id = r.org_id
    WHERE r.org_id = ? AND r.id = ? AND r.actor = ? AND m.user_id = r.actor AND ${assessmentRead}
      AND ${guard.sql}`, org, row.assessment_id, actor, ...guard.args);
  if (!safe) requestConflict('assessment_stale', 'The assessment or its access changed during readback.');
  if (Date.parse(row.expires_at) <= Date.now()) requestFail(410, 'draft_expired', 'This local draft has expired.');
  return [read ? 200 : 201, {draft, facility_routes}];
}

async function prepareServiceRequest(ctx, id, req) {
  if (req.method !== 'POST') return badMethod();
  const {s, org, actor, bundle, evaluateReviewed} = ctx;
  const {row: assessment, capture} = await requestCapture(ctx, id);
  const data = await payload(req, 256 * 1024);
  fields(data, ['schema', 'idempotency_key', 'configuration', 'reviewed_input']);
  if (data.schema !== requestSchema) requestFail(422, 'unsupported_request_version', 'Use request input version 1.');
  if (typeof data.idempotency_key !== 'string' || !/^[A-Za-z0-9_-]{16,96}$/.test(data.idempotency_key) ||
      !refShape(bundle, data.configuration) || data.configuration.organisation_id !== org ||
      data.configuration.record_type !== 'configuration') invalid();
  if (!evaluateReviewed) fail(503, 'Reviewed assessment is unavailable.');
  const keyDigest = await hash(data.idempotency_key);
  const inputDigest = await hash(requestIdentity(id, data.configuration, {input_digest: await hash(data.reviewed_input)}));
  const existing = () => s.one(`SELECT d.* FROM registry_request_drafts d JOIN registry_members m ON m.org_id = d.org_id
    WHERE d.org_id = ? AND d.actor = ? AND m.user_id = d.actor AND m.role IN ${ALL} AND d.key_digest = ?`, org, actor, keyDigest);
  async function replay(row) {
    if (row.input_digest !== inputDigest) requestConflict('idempotency_conflict', 'This request key was used for different inputs.');
    return draftResponse(ctx, row, true);
  }
  const prior = await existing();
  if (prior) return replay(prior);
  let reviewed;
  try { reviewed = await evaluateReviewed(data.reviewed_input); }
  catch { requestFail(400, 'reviewed_input_invalid', 'Provide the exact supported reviewed assessment input.'); }
  const blocker = reviewedDraftBlocker(reviewed);
  if (blocker) requestConflict(...blocker);
  if (!sameReviewedMethod(capture.input.method, reviewed.binding))
    requestConflict('reviewed_binding_mismatch', 'The saved match must use this exact reviewed protocol and interpretation digest as its method.');
  const {scope, installation, model, expiry} = await currentRequestScope(ctx, capture, data.configuration);
  if (expiry <= Date.now()) requestConflict('assessment_stale', 'Evidence expired during preparation. Reassess the offer.');
  const draft = await makeDraft({org, id: crypto.randomUUID(), now: scope.now, expiry, capture, assessmentId: id,
    configuration: data.configuration, model, installation, reviewed, dependencies: currentRefs(capture)});
  const guard = requestScopeGuard(ctx, scope, capture);
  const changed = await s.write(`INSERT INTO registry_request_drafts
    (org_id,id,actor,assessment_id,key_digest,input_digest,created_at,expires_at,draft)
    SELECT ?,?,?,?,?,?,?,?,?
    WHERE ${member(assessment.visibility === 'restricted' ? REVIEW : ALL)}
      AND julianday(?) > julianday(?)
      AND (SELECT COUNT(*) FROM registry_request_drafts WHERE org_id = ?) < 100
      AND ${guard.sql}
    ON CONFLICT(org_id,actor,key_digest) DO NOTHING`,
  org, draft.id, actor, id, keyDigest, inputDigest, draft.created_at, draft.expires_at, canonical(draft),
  org, actor, draft.expires_at, utc(), org, ...guard.args);
  if (!changed) {
    const raced = await existing();
    if (raced) return replay(raced);
    await requestCapture(ctx, id);
    const count = await s.one(`SELECT COUNT(*) AS total FROM registry_request_drafts WHERE org_id = ? AND ${member(ALL)}`, org, org, actor);
    if (count?.total >= 100) requestConflict('request_capacity_reached', 'This workspace has reached its local draft history limit. Ask the owner to preserve a protected backup before using a new workspace.');
    requestConflict('preparation_conflict', 'The assessment or role changed during preparation.');
  }
  return draftResponse(ctx, {id: draft.id, assessment_id: id, key_digest: keyDigest, input_digest: inputDigest,
    created_at: draft.created_at, expires_at: draft.expires_at, draft: canonical(draft)}, false);
}

async function requestDraftRead(ctx, id, req) {
  if (req.method !== 'GET') return badMethod();
  const {s, org, actor} = ctx;
  const row = await s.one(`SELECT d.* FROM registry_request_drafts d JOIN registry_members m ON m.org_id = d.org_id
    WHERE d.org_id = ? AND d.id = ? AND d.actor = ? AND m.user_id = d.actor AND m.role IN ${ALL}`, org, id, actor);
  if (!row) absent();
  return draftResponse(ctx, row, true);
}

async function operatorSurvey(ctx, id, req) {
  const {s, org, actor, role} = ctx;
  const target = await head(ctx, id), expected_head = refOf(target.wire);
  if (!['installation', 'configuration'].includes(expected_head.record_type)) absent();
  const currentDraft = await s.one(`SELECT d.*, p.policy_id AS current_policy_id FROM registry_survey_drafts d
    LEFT JOIN registry_publications p ON p.org_id = d.org_id AND p.record_id = d.record_id
    WHERE d.org_id = ? AND d.actor = ? AND d.record_id = ?
    AND EXISTS (SELECT 1 FROM registry_revisions r JOIN registry_members m ON m.org_id = r.org_id
      WHERE r.org_id = d.org_id AND m.user_id = d.actor AND r.record_id = d.record_id
      AND r.revision_id = ? AND ${current} AND ${recordRead})`, org, actor, id, target.revision_id);
  const policy = currentDraft ? currentDraft.current_policy_id : target.policy_id ?? null;
  const draft = currentDraft && parseReview(currentDraft.payload);
  const pinned = currentDraft && parseReview(currentDraft.target);
  const pinnedNow = sameRef(pinned, expected_head);
  const editable = target.state === 'active' && target.installation_event?.action !== 'duplicate_link';
  const policyMatches = currentDraft?.reviewed_policy_id === policy;
  const response = (draft, version, pinned, isCurrent, isReviewed) => ({
    draft, version, target: pinned, expected_head, policy_id: policy, editable,
    current: isCurrent, approved: isReviewed,
    projection: draft?.enquiry.sections.length ? surveyProjection(draft) : null,
  });
  if (req.method === 'GET') {
    return [200, response(draft, currentDraft?.version ?? null, pinned, pinnedNow,
      pinnedNow && policyMatches && draft?.enquiry.status === 'reviewed')];
  }
  if (req.method !== 'POST') return badMethod();
  const data = await payload(req);
  if (!editable) fail(409, 'This equipment report is no longer open for survey edits.');
  fields(data, ['expected_head', 'expected_version', 'draft'], ['acknowledge_repin', 'expected_policy_id', 'review']);
  if (!sameRef(data.expected_head, expected_head) || data.expected_version !== (currentDraft?.version ?? null)) stale();
  if (pinned && !pinnedNow && !sameRef(data.acknowledge_repin ?? null, pinned))
    fail(409, 'The equipment revision changed. Review the new revision before re-pinning this survey.');
  if (Object.hasOwn(data, 'review') && typeof data.review !== 'boolean') invalid();
  const review = data.review === true, next = data.draft;
  if (!validSurveyDraft(next, {date, today: utc().slice(0, 10)})) invalid();
  const connections = next.answers.connections?.connections ?? [];
  const previousConnections = draft?.answers.connections?.connections ?? [];
  const pins = {installation: target.wire.record.installation ?? expected_head,
    configuration: expected_head.record_type === 'configuration' ? expected_head : null};
  for (const connection of connections) {
    const previous = previousConnections.find(({pins, ...prior}) => same(prior, connection));
    connection.pins = previous?.pins ?? pins;
  }
  if (review) {
    if (role !== 'owner') fail(403, 'Only the registry owner can review an enquiry draft for sharing.');
    if (!pinnedNow || !same(draft, next) || next.enquiry.status !== 'ready_for_review' || data.expected_policy_id !== policy) stale();
    next.enquiry.status = 'reviewed';
  } else if (next.enquiry.status === 'reviewed') invalid();

  const version = crypto.randomUUID(), changed = await s.write(`INSERT INTO registry_survey_drafts
    (org_id,actor,record_id,version,target,payload,reviewed_policy_id)
    SELECT ?,?,?,?,?,?,? WHERE EXISTS (
      SELECT 1 FROM registry_revisions r JOIN registry_members m ON m.org_id = r.org_id
      LEFT JOIN registry_publications p ON p.org_id = r.org_id AND p.record_id = r.record_id
      WHERE r.org_id = ? AND m.user_id = ? AND r.record_id = ? AND r.revision_id = ? AND ${current} AND ${recordRead}
      AND (NOT ? OR m.role = 'owner' AND p.policy_id IS ?))
    AND (? IS NOT NULL OR NOT EXISTS (SELECT 1 FROM registry_survey_drafts WHERE org_id = ? AND actor = ? AND record_id = ?))
    ON CONFLICT (org_id,actor,record_id) DO UPDATE SET version=excluded.version,target=excluded.target,
      payload=excluded.payload,reviewed_policy_id=excluded.reviewed_policy_id WHERE registry_survey_drafts.version = ?`,
  org, actor, id, version, canonical(expected_head), canonical(next), review ? policy : null,
  org, actor, id, target.revision_id, Number(review), policy,
  data.expected_version, org, actor, id, data.expected_version);
  if (!changed) stale();
  return [200, response(next, version, expected_head, true, review)];
}

async function claims(ctx, id) {
  const target = await head(ctx, id), ref = refOf(target.wire), now = utc();
  const rows = bounded(await readRows(ctx.s, ctx.org, ctx.actor,
    `json_extract(r.wire, '$.record.record_type') = 'assertion' AND json_extract(r.wire, '$.record.target.record_id') = ? AND ${current}`, [id]));
  const reports = [], active = new Map();
  for (const row of rows) {
    const checked = await verifyRow(ctx.bundle, row), report = checked.wire.record, problem = recordStatus(checked, now);
    const exactHead = sameRef(ref, report.target);
    if (exactHead && (!problem || problem === 'disputed') && report.outcome !== 'unknown') {
      if (!active.has(report.claim_kind)) active.set(report.claim_kind, new Set());
      active.get(report.claim_kind).add(report.outcome);
    }
    reports.push({...recordData(checked), target_current: exactHead, evidence_status: problem ?? 'current'});
  }
  return [200, {claims: reports, conflicts: [...active].filter(([, outcomes]) => outcomes.size > 1).map(([kind]) => kind),
    resolved_truth: null, provider_authority: 'unverified'}];
}

async function installationDetails(ctx, id) {
  const installation = await head(ctx, id);
  if (installation.wire.record.record_type !== 'installation') absent();
  const rows = bounded(await readRows(ctx.s, ctx.org, ctx.actor,
    `r.action = 'duplicate_link' AND ${current} AND json_extract(r.installation_event,'$.target.record_id') = ?`,
    [id], 'ORDER BY r.record_id'));
  return [200, {canonical: installation.installation_event?.action === 'duplicate_link' ? installation.installation_event.target : null,
    duplicate_sources: await Promise.all(rows.map(async r => {
      const source = await verifyRow(ctx.bundle, r);
      return {reference: refOf(source.wire), label: source.wire.record.label};
    }))}];
}

async function changeInstallation(ctx, id, req, mode) {
  const {s, org, actor, role, bundle} = ctx;
  if (mode === 'reconciliation' && role !== 'owner') fail(403, 'Only the registry owner can resolve duplicate installations.');
  const data = await payload(req);
  if (mode === 'move') fields(data, ['expected_head', 'observed_at', 'reason', 'reported_location', 'source']);
  else fields(data, ['expected_head', 'expected_target', 'observed_at', 'reason', 'action'], ['source_url']);
  const before = await head(ctx, id);
  if (before.wire.record.record_type !== 'installation') invalid();
  if (!refShape(bundle, data.expected_head) || !sameRef(data.expected_head, refOf(before.wire))) stale();
  const now = utc();
  if (!date(data.observed_at) || data.observed_at > now.slice(0, 10) || !installationText(data.reason, 500)) invalid();
  const allowed = mode === 'move' ? before.visibility === 'restricted' ? REVIEW : EDIT : OWNER;
  if (!allowed.includes("'" + role + "'")) fail(403, 'Your registry role cannot change this installation.');
  const record = {...before.wire.record}, sources = [...before.wire.sources];
  let event, state, target;
  if (mode === 'move') {
    if (before.state !== 'active') fail(409, 'Restore the installation before recording a location change.');
    if (data.reported_location !== null && !installationText(data.reported_location, 500)) invalid();
    if (data.reported_location === record.reported_location) fail(409, 'Enter a different reported location.');
    record.reported_location = data.reported_location;
    let source_index = sources.findIndex(source => same(source, data.source));
    if (source_index < 0) { source_index = sources.length; sources.push(data.source); }
    event = {action: 'move', observed_at: data.observed_at, reason: data.reason, source_index};
    state = 'active';
  } else {
    if (!['link', 'unlink'].includes(data.action) || !refShape(bundle, data.expected_target) ||
      data.expected_target.organisation_id !== org || data.expected_target.record_type !== 'installation' ||
      data.expected_target.record_id === id || !installationLocator(data.source_url ?? null)) invalid();
    target = await head(ctx, data.expected_target.record_id);
    if (!sameRef(data.expected_target, refOf(target.wire))) stale();
    const linking = data.action === 'link';
    if (linking && (before.state !== 'active' || target.state !== 'active')) fail(409, 'Choose two active individual installations.');
    if (!linking && (before.installation_event?.action !== 'duplicate_link' ||
      before.installation_event.target.record_id !== target.record_id)) fail(409, 'This installation has no matching duplicate link to remove.');
    event = {action: 'duplicate_' + data.action, observed_at: data.observed_at, reason: data.reason,
      target: refOf(target.wire), source_url: data.source_url ?? null};
    state = linking ? 'retired' : 'active';
  }
  const wire = {...before.wire, parent: refOf(before.wire), recorded_at: now, record, sources};
  const next = {...before, wire, state, action: event.action, actor, installation_event: event};
  wire.revision_id = await installationRevisionId(wire, next, event);
  wire.content_digest = await wireDigest(wire);
  if (sources.length > 32 || !wireShape(bundle, wire) || !await validInstallationBinding(bundle, wire, next, event)) invalid();
  validateEvidence(wire, before.observed_at, before.expires_at);
  const linking = event.action === 'duplicate_link';
  const changed = await s.write(`INSERT INTO registry_revisions
    (org_id, record_id, seq, revision_id, visibility, state, action, actor, observed_at, expires_at, wire, installation_event)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${member(allowed)} AND ${editorWriteGuard}
      AND EXISTS (SELECT 1 FROM registry_revisions r WHERE r.org_id = ? AND r.record_id = ?
        AND r.revision_id = ? AND r.state = ? AND ${current})
      ${target ? `AND EXISTS (SELECT 1 FROM registry_revisions r WHERE r.org_id = ? AND r.record_id = ?
        AND r.revision_id = ? AND r.state = ? AND ${current})` : ''}
      ${linking ? `AND NOT EXISTS (SELECT 1 FROM registry_active_duplicates d WHERE d.org_id = ? AND
        (d.target_id = ? OR d.source_id = ?))` : ''}`,
  org, id, before.seq + 1, wire.revision_id, before.visibility, state, event.action, actor, before.observed_at, before.expires_at,
  canonical(wire), canonical(event), org, actor, canonical([id]), org, actor,
  org, id, before.revision_id, before.state,
  ...(target ? [org, target.record_id, target.revision_id, target.state] : []),
  ...(linking ? [org, id, target.record_id] : []));
  if (!changed) fail(409, 'An installation head, permission or duplicate link changed. Reload both installations before trying again.');
  if (target && effectiveVisibility(target) === 'restricted') next.restricted_link = 1;
  return [200, {revision: recordData(next)}];
}

async function checkedPilot(ctx, row) {
  const snapshot = parseReview(row.snapshot);
  if ((row.seq === 1 ? row.previous_version !== null : typeof row.previous_version !== 'string') ||
    !validPilot(ctx.bundle, ctx.org, snapshot, row.saved_at) ||
    row.version !== await pilotVersion(ctx.org, {...row, snapshot}, row.previous_version))
    throw Error('Registry pilot revision integrity failed');
  return {...row, snapshot};
}

async function pilot(ctx, id, req, action) {
  if (!['owner', 'reviewer'].includes(ctx.role)) absent();
  const {s, org, actor, bundle} = ctx, now = utc();
  const columns = 'p.cohort_id, p.seq, p.version, p.actor, p.saved_at, p.reason';
  const exactColumns = `${columns}, p.snapshot, (SELECT v.version FROM registry_pilot_revisions v
    WHERE v.org_id = p.org_id AND v.cohort_id = p.cohort_id AND v.seq = p.seq - 1) AS previous_version`;
  const scoped = `p.org_id = ? AND ${member(REVIEW)}`, scope = [org, org, actor];
  const latest = `NOT EXISTS (SELECT 1 FROM registry_pilot_revisions n
    WHERE n.org_id = p.org_id AND n.cohort_id = p.cohort_id AND n.seq > p.seq)`;
  if (action !== undefined && action !== 'history') absent();
  if (req.method === 'GET') {
    if (!id) {
      const rows = await s.all(`SELECT ${exactColumns} FROM registry_pilot_revisions p
        WHERE ${scoped} AND ${latest} ORDER BY p.saved_at DESC`, ...scope);
      const cohorts = await Promise.all(rows.map(async row => {
        const {snapshot: {name, starts_on, ends_on}, ...metadata} = await checkedPilot(ctx, row);
        return {...metadata, name, starts_on, ends_on};
      }));
      return [200, {cohorts}];
    }
    if (action === 'history') {
      const version = new URL(req.url).searchParams.get('version');
      if (version !== null && !idPattern.test(version)) invalid();
      const before = new URL(req.url).searchParams.get('before') ?? '9007199254740991';
      if (!/^\d{1,16}$/.test(before) || !Number.isSafeInteger(Number(before))) invalid();
      const rows = await s.all(`SELECT ${version ? exactColumns : columns}
        FROM registry_pilot_revisions p WHERE ${scoped} AND p.cohort_id = ? AND p.seq < ?
        ${version ? 'AND p.version = ?' : ''} ORDER BY p.seq DESC LIMIT ${maxRows + 1}`,
      ...scope, id, Number(before), ...(version ? [version] : []));
      if (!rows.length && (version || !new URL(req.url).searchParams.has('before'))) absent();
      if (version) return [200, {revision: await checkedPilot(ctx, rows[0])}];
      return [200, {history: rows.slice(0, maxRows), next_before: rows.length > maxRows ? rows[maxRows - 1].seq : null}];
    }
  } else if (req.method !== 'POST' || action !== undefined) return badMethod();

  const row = id ? await s.one(`SELECT ${exactColumns} FROM registry_pilot_revisions p
    WHERE ${scoped} AND p.cohort_id = ? AND ${latest}`, ...scope, id) : null;
  if (id && !row) absent();
  const prior = row && await checkedPilot(ctx, row);
  if (req.method === 'GET') {
    const {snapshot, ...metadata} = prior;
    const ids = snapshot.leads.flatMap(l => l.review ? [l.review.pin.record_id] : []);
    const rows = ids.length ? await readRows(s, org, actor, `${current} AND r.record_id IN (SELECT value FROM json_each(?))`, [canonical(ids)]) : [];
    const checked = await Promise.all(rows.map(r => verifyRow(bundle, r)));
    if (!await s.one(`SELECT 1 FROM registry_members WHERE org_id = ? AND user_id = ? AND role IN ${REVIEW}`, org, actor)) absent();
    return [200, {cohort: {...metadata, ...snapshot, ...pilotReport(snapshot, new Map(checked.map(r => [r.record_id, r])), now)}}];
  }

  const data = await payload(req);
  fields(data, ['expected_version', 'reason', 'snapshot']);
  if (data.expected_version !== (prior?.version ?? null)) fail(409, 'The pilot cohort changed. Reload to reconcile your draft.');
  if (!words(data.reason, 400) || !validPilot(bundle, org, data.snapshot, now)) invalid();
  const old = new Map(prior?.snapshot.leads.map(l => [l.id, l]) ?? []);
  const guards = [];
  for (const lead of data.snapshot.leads) {
    if (!lead.review) continue;
    const previous = old.get(lead.id);
    if (same(lead.review, previous?.review ?? null) && lead.reviewed_on === previous.reviewed_on) continue;
    if (previous?.review && sameRef(lead.review.pin, previous.review.pin))
      fail(409, 'Reconfirmation requires a fresh exact installation review.');
    const record = await head(ctx, lead.review.pin.record_id);
    if (!pilotReviewFits(lead, record, now)) fail(409, 'Select the current installation revision after a fresh evidence review.');
    guards.push(record.revision_id);
  }
  const cohort_id = id ?? crypto.randomUUID(), seq = (prior?.seq ?? 0) + 1, reason = data.reason.trim();
  const version = await pilotVersion(org, {cohort_id, seq, actor, saved_at: now, reason, snapshot: data.snapshot}, prior?.version ?? null);
  const changed = await s.write(`INSERT INTO registry_pilot_revisions
    (org_id,cohort_id,seq,version,actor,saved_at,reason,snapshot)
    SELECT ?,?,?,?,?,?,?,? WHERE ${member(REVIEW)} AND
    ${prior ? `EXISTS (SELECT 1 FROM registry_pilot_revisions p
      WHERE p.org_id = ? AND p.cohort_id = ? AND p.version = ? AND ${latest})`
    : `(SELECT COUNT(DISTINCT cohort_id) FROM registry_pilot_revisions WHERE org_id = ?) < ${pilotCohortLimit}`}
    AND NOT EXISTS (SELECT 1 FROM json_each(?) j WHERE NOT EXISTS (
      SELECT 1 FROM registry_revisions r WHERE r.org_id = ? AND r.revision_id = j.value AND ${current}))`,
  org, cohort_id, seq, version, actor, now, reason, canonical(data.snapshot), org, actor,
  ...(prior ? [org, cohort_id, prior.version] : [org]), canonical(guards), org);
  if (!changed) fail(409, 'The cohort or installation changed, or the workspace has reached its pilot cohort limit.');
  return [id ? 200 : 201, {cohort_id, version}];
}

async function backup(ctx) {
  if (ctx.role !== 'owner') fail(403, 'Only a registry owner can export a private backup.');
  const {s, org, actor, bundle} = ctx;
  // One statement, scoped to one owner and one snapshot. No private lab tables.
  const data = await s.one(`SELECT o.*, (
      SELECT json_group_array(json_object('user_id',user_id,'role',role,'updated_by',updated_by,'updated_at',updated_at))
      FROM (SELECT * FROM registry_members WHERE org_id = o.id ORDER BY user_id LIMIT ${maxRows + 1})
    ) AS memberships, CASE WHEN (
      SELECT COALESCE(SUM(length(CAST(wire AS BLOB)) + COALESCE(length(CAST(service AS BLOB)),0) + COALESCE(length(CAST(installation_event AS BLOB)),0)), 0) FROM registry_revisions WHERE org_id = o.id
    ) <= ${backupBudget} THEN (
      SELECT json_group_array(json_object('visibility',visibility,'state',state,'action',action,'actor',actor,
        'observed_at',observed_at,'expires_at',expires_at,'org_id',org_id,'record_id',record_id,
        'revision_id',revision_id,'seq',seq,'wire',wire,'service',service,'installation_event',installation_event))
      FROM (SELECT * FROM registry_revisions WHERE org_id = o.id ORDER BY record_id,seq LIMIT ${maxRows + 1})
    ) END AS revisions, (
      SELECT json_group_array(json_object('record_id',record_id,'revision_id',revision_id,'actor',actor,'decided_at',decided_at,'projection',projection,
        'policy_id',policy_id,'restricted',restricted,'disclosure',disclosure))
      FROM (SELECT * FROM registry_publications WHERE org_id = o.id ORDER BY record_id LIMIT ${maxRows + 1})
    ) AS publications, CASE WHEN (
      SELECT COALESCE(SUM(length(CAST(refs AS BLOB)) + COALESCE(length(CAST(match_input AS BLOB)),0)), 0) FROM registry_assessments WHERE org_id = o.id
    ) <= ${backupBudget} THEN (
      SELECT json_group_array(json_object('id',id,'actor',actor,'created_at',created_at,'visibility',visibility,'refs',refs,'match_input',match_input))
      FROM (SELECT * FROM registry_assessments WHERE org_id = o.id ORDER BY id LIMIT ${maxRows + 1})
    ) END AS assessments, CASE WHEN (
      SELECT COALESCE(SUM(length(CAST(snapshot AS BLOB))), 0) FROM registry_pilot_revisions WHERE org_id = o.id
    ) <= ${backupBudget} THEN (
      SELECT json_group_array(json_object('cohort_id',cohort_id,'seq',seq,'version',version,'actor',actor,
        'saved_at',saved_at,'reason',reason,'snapshot',snapshot))
      FROM (SELECT * FROM registry_pilot_revisions WHERE org_id = o.id ORDER BY cohort_id,seq LIMIT ${maxRows + 1})
    ) END AS pilot, CASE WHEN (
      SELECT COALESCE(SUM(length(CAST(draft AS BLOB))), 0) FROM registry_request_drafts WHERE org_id = o.id
    ) <= ${backupBudget} THEN (
      SELECT json_group_array(json_object('id',id,'actor',actor,'assessment_id',assessment_id,'key_digest',key_digest,
        'input_digest',input_digest,'created_at',created_at,'expires_at',expires_at,'draft',draft))
      FROM (SELECT * FROM registry_request_drafts WHERE org_id = o.id ORDER BY id LIMIT ${maxRows + 1})
    ) END AS request_drafts FROM registry_organisations o WHERE o.id = ? AND ${member(OWNER)}`, org, org, actor);
  if (!data) absent();
  if (data.revisions === null || data.assessments === null || data.pilot === null || data.request_drafts === null) fail(413, 'Registry exceeds the owner export size limit.');
  const rows = key => bounded(JSON.parse(data[key]));
  const rawRevisions = rows('revisions'), rawAssessments = rows('assessments'), pilot = [];
  for (const row of rows('pilot')) {
    const previous = pilot.at(-1);
    const {previous_version, ...checked} = await checkedPilot(ctx, {...row,
      previous_version: previous?.cohort_id === row.cohort_id ? previous.version : null});
    if (row.seq !== (previous_version ? previous.seq : 0) + 1) throw Error('Registry pilot history integrity failed');
    pilot.push(checked);
  }
  const requestDrafts = rows('request_drafts');
  for (const row of requestDrafts) {
    const capture = rawAssessments.find(a => a.id === row.assessment_id && a.actor === row.actor)?.match_input;
    if (!capture) throw Error('Registry request draft assessment missing');
    await validateDraftRow(row, parseReview(capture), org);
  }
  const extended = rawRevisions.some(r => r.service !== null || serviceClaims.includes(JSON.parse(r.wire).record.record_type) ||
    JSON.parse(r.wire).record.record_type === 'offer') || rawAssessments.some(a => a.match_input !== null);
  const reconciliation = rawRevisions.some(r => r.installation_event !== null);
  const revisionWires = new Map(rawRevisions.map(r => [r.revision_id, r.wire]));
  const archive = {format: 'planner-registry-export/' + (requestDrafts.length ? '6' : pilot.length ? '5' : reconciliation ? '4' : extended ? '3' : '2'), contracts: bundle.upstream, organisation: orgData(data),
    memberships: rows('memberships'), revisions: await Promise.all(rawRevisions.map(async r => {
      const target = r.installation_event && parseReview(r.installation_event).target;
      const checked = await verifyRow(bundle, {...r, installation_target_wire: target ? revisionWires.get(target.revision_id) : null});
      const {evidence_status, effective_visibility, ...revision} = recordData(checked);
      return {seq: r.seq, ...revision};
    })), publications: rows('publications'), assessments: rawAssessments.map(({match_input, ...a}) =>
      match_input === null ? a : {...a, match_input}), ...(pilot.length ? {pilot} : {}), ...(requestDrafts.length ? {request_drafts: requestDrafts} : {})};
  return [200, {...archive, archive_digest: await archiveDigest(archive)}];
}

function organisationClaims(value) {
  if (!Array.isArray(value) || value.length > 12) invalid();
  for (const claim of value) {
    fields(claim, ['kind', 'value', 'observed_at'], ['source_url']);
    if (!['domain', 'external_id'].includes(claim.kind) || !words(claim.value, 256) || !date(claim.observed_at) ||
      claim.observed_at > utc().slice(0, 10)) invalid();
    if (Object.hasOwn(claim, 'source_url')) {
      if (!words(claim.source_url, 2048)) invalid();
      let u; try { u = new URL(claim.source_url); } catch { invalid(); }
      if (u.protocol !== 'https:' || u.username || u.password) invalid();
    }
  }
  return canonical(value);
}

async function importRoar(ctx, req, mode) {
  if (ctx.role !== 'owner') fail(403, 'Only a registry owner can import this source release.');
  if (req.method !== 'POST') badMethod();
  const data = await payload(req, 128 * 1024);
  fields(data, ['crosswalk', 'bundle', ...(mode === 'apply' ? ['review_digest'] : [])]);
  const {s, org, actor, bundle} = ctx, now = utc();
  let release;
  try { release = await readRoar(bundle, data, now.slice(0, 10), bundle.roarRelease); }
  catch { fail(400, 'The ROAR files do not match the reviewed crosswalk and exact C11 release.'); }
  const proposals = await roarProposals(org, release);
  const ids = canonical(proposals.flatMap(p => p.ids));
  const rows = await readRows(s, org, actor, `r.record_id IN (SELECT value FROM json_each(?)) AND ${current}`, [ids]);
  const heads = new Map(await Promise.all(rows.map(async r => [r.record_id, await verifyRow(bundle, r)])));
  const previousRows = bounded(await s.all(`SELECT r.* FROM registry_revisions r
    WHERE r.org_id = ? AND r.action = 'roar_import'
    AND ${member(OWNER)} AND NOT EXISTS (SELECT 1 FROM registry_revisions n WHERE n.org_id = r.org_id
      AND n.record_id = r.record_id AND n.action = 'roar_import' AND n.seq > r.seq) LIMIT ${maxRows + 1}`, org, org, actor));
  const originals = new Map(await Promise.all(previousRows.map(async r => [r.record_id, (await verifyRow(bundle, r)).wire])));
  const locations = new Map(proposals.flatMap(p => p.statement.roles.map(l => [l.id, p.ids[0]])));
  const manual_reconciliation = [...originals.values()].flatMap(w => {
    const packet = roarPacket(w.record.statement);
    return (packet?.roles ?? []).flatMap(l => {
      const report = w.record.target.record_id, proposed = locations.get(l.id);
      return proposed === report ? [] : [{role_id: l.id, report_id: report, report_label: packet.report_label,
        reason: proposed ? 'group_changed' : 'role_absent'}];
    });
  });
  const plans = proposals.map(p => {
    const before = p.ids.map(id => heads.get(id));
    const original = p.ids.map(id => originals.get(id));
    const previous = roarPacket(original[1]?.record.statement);
    if (before.some(Boolean) && (!before.every(Boolean) || !original.every(Boolean) || !previous)) stale();
    const unchanged = previous && ['crosswalk', 'bundle', 'manifest'].every(key =>
      previous.release[key] === p.statement.release[key]);
    const blocked = !unchanged && before.some((r, i) => r && (r.state !== 'active' || r.restricted === 1 ||
      r.wire.revision_id !== original[i]?.revision_id));
    return {p, before, previous, status: unchanged ? 'unchanged' : blocked ? 'needs_manual_review' : previous ? 'revise' : 'create'};
  });
  const bindings = plans.flatMap(({p, before}) => p.ids.map((id, i) => ({
    id, head: before[i] ? refOf(before[i].wire) : null, policy: before[i]?.policy_id ?? null,
  })));
  const review_digest = await hash({org, actor, release: release.release, bindings, manual_reconciliation,
    proposals: plans.map(({p, status}) => ({...p, status}))});
  const reports = plans.map(({p, previous, before, status}) => ({
    report_id: p.ids[0], packet_id: p.ids[1], status, current_heads: before.map(r => r ? refOf(r.wire) : null),
    report: status === 'unchanged' ? before[0].wire.record : p.record,
    evidence: status === 'unchanged' ? previous : p.statement,
    use_rights: status === 'unchanged' ? before[0].wire.use_rights : p.use_rights,
    ...(status === 'revise' || status === 'needs_manual_review' ? {previous} : {}),
  }));
  const preview = {review_digest, reports, manual_reconciliation, counts: release.release.counts};
  if (mode === 'preview') return [200, preview];
  if (typeof data.review_digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(data.review_digest)) invalid();
  if (manual_reconciliation.length) fail(409, 'Previously imported roles need manual reconciliation before this release can be saved.');
  const pending = plans.filter(plan => plan.status !== 'unchanged');
  if (!pending.length) return [200, {created: 0, revised: 0, unchanged: reports.length}];
  if (data.review_digest !== review_digest || pending.some(plan => plan.status === 'needs_manual_review')) stale();
  const changes = [];
  for (const {p, before} of pending) {
    let target;
    for (const [index, old] of before.entries()) {
      const wire = await roarRevision(bundle, {org, actor, now, proposal: p, index, before: old, target});
      validateEvidence(wire, p.observed_at, null);
      changes.push([wire.record_id, (old?.seq ?? 0) + 1, wire.revision_id, p.observed_at, canonical(wire)]);
      if (index === 0) target = refOf(wire);
    }
  }
  // One statement: require the exact heads and sharing policies for the whole
  // review, including no-op reports, and recheck the actor at the write.
  const inserted = await s.write(`WITH allowed AS MATERIALIZED (
    SELECT 1 WHERE ${member(OWNER)} AND NOT EXISTS (
      SELECT 1 FROM json_each(?) j WHERE
        json_extract(j.value, '$.head.revision_id') IS NOT (
          SELECT r.revision_id FROM registry_revisions r WHERE r.org_id = ?
          AND r.record_id = json_extract(j.value, '$.id') ORDER BY r.seq DESC LIMIT 1)
        OR json_extract(j.value, '$.policy') IS NOT (
          SELECT policy_id FROM registry_publications p WHERE p.org_id = ?
          AND p.record_id = json_extract(j.value, '$.id'))
    ) AND NOT EXISTS (SELECT 1 FROM registry_revisions r WHERE r.org_id = ? AND r.action = 'roar_import'
      AND r.record_id NOT IN (SELECT json_extract(value, '$.id') FROM json_each(?))))
    INSERT INTO registry_revisions (org_id, record_id, seq, revision_id, visibility, state, action, actor, observed_at, expires_at, wire)
    SELECT ?, json_extract(j.value, '$[0]'), json_extract(j.value, '$[1]'), json_extract(j.value, '$[2]'),
      'organisation', 'active', 'roar_import', ?, json_extract(j.value, '$[3]'), NULL, json_extract(j.value, '$[4]')
    FROM allowed, json_each(?) j`, org, actor, canonical(bindings), org, org, org, canonical(bindings), org, actor, canonical(changes));
  if (inserted !== changes.length) stale();
  return [200, {created: pending.filter(x => x.status === 'create').length,
    revised: pending.filter(x => x.status === 'revise').length, unchanged: reports.length - pending.length}];
}

async function planningBinding(ctx, id, expected, configuration) {
  if (!refShape(ctx.bundle, expected) || expected.organisation_id !== ctx.org
      || expected.record_id !== id || expected.record_type !== 'installation') invalid();
  if (configuration !== null && (!refShape(ctx.bundle, configuration)
    || configuration.organisation_id !== ctx.org || configuration.record_type !== 'configuration')) invalid();
  const pins = configuration === null ? [expected] : [expected, configuration];
  // Read both current, visible heads in one snapshot. A changed head must
  // never be substituted for the exact pin the caller chose.
  const rows = await readRows(ctx.s, ctx.org, ctx.actor,
    `r.record_id IN (SELECT value FROM json_each(?)) AND ${current}`,
    [canonical(pins.map(ref => ref.record_id))], '', true);
  if (rows.length !== pins.length) absent();
  const checked = await Promise.all(rows.map(row => verifyRow(ctx.bundle, row)));
  const now = utc();
  for (const ref of pins) {
    const row = checked.find(item => item.record_id === ref.record_id);
    if (!sameRef(refOf(row.wire), ref) || recordStatus(row, now) || row.duplicate_backing || row.installation_event?.action === 'duplicate_link') stale();
    if (!assessmentAllowed(row.wire)) fail(409, 'The Registry evidence does not declare assessment use.');
  }
  const installation = checked.find(row => row.record_id === expected.record_id);
  const selected = checked.find(row => row.record_id === configuration?.record_id);
  const dates = row => ({observed_at: row.observed_at, expires_at: row.expires_at});
  if (selected && !sameRef(selected.wire.record.installation, expected)) stale();
  const inventory = selected?.wire.record.fitted_modules;
  return {installation: expected, configuration, status: 'current', access: 'unverified',
    dates: {installation: dates(installation), configuration: selected ? dates(selected) : null},
    inventory_coverage: inventory?.coverage ?? 'unknown',
    modules: (inventory?.items ?? []).map(item => ({id: item.module_id, status: item.state})).sort((a, b) => a.id.localeCompare(b.id))};
}

function planningModuleExclusions(binding, modelId, planningOptions, hypotheses = []) {
  if (!Array.isArray(hypotheses) || hypotheses.length > 40) invalid();
  if (!hypotheses.length) return {mappings:[], options:{}};
  const available = planningOptions?.(modelId);
  if (!available || !binding.configuration) invalid();
  const choices = new Map(available.map(option => [option.key, option]));
  const inventory = new Map(binding.modules.map(item => [item.id, item.status]));
  const groups = new Map(), seen = new Set();
  for (const item of hypotheses) {
    fields(item, ['module_id','option_key']);
    if (!inventory.has(item.module_id) || !choices.has(item.option_key) || seen.has(item.module_id)) invalid();
    seen.add(item.module_id);
    if (!groups.has(item.option_key)) groups.set(item.option_key, []);
    groups.get(item.option_key).push({module_id:item.module_id, status:inventory.get(item.module_id)});
  }
  const options = {};
  const mappings = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([key, reports]) => {
    const choice = choices.get(key);
    const states = new Set(reports.map(report => report.status));
    const absent = states.has('reported_absent'), fitted = states.has('reported_fitted');
    const status = absent && fitted ? 'conflicting' : absent ? 'reported_absent' : fitted ? 'reported_fitted' : 'unknown';
    if (absent) for (const op of choice.ops) options[op] = 'no';
    return {option_key:key, option_label:choice.name, status, effect:absent ? 'excluded' : 'provisional',
      reports:reports.sort((a,b) => a.module_id.localeCompare(b.module_id) || a.status.localeCompare(b.status))};
  });
  return {mappings, options};
}

async function planInstallation(ctx, id, req) {
  if (req.method !== 'POST') return badMethod();
  if (!ctx.evaluatePlanning) fail(503, 'Private planning is unavailable on this server.');
  const input = await payload(req, 256 * 1024);
  fields(input, ['expected_head', 'configuration', 'protocol', 'decision', 'planner_model_id', 'head_hypothesis'], ['module_hypotheses', 'replay_digest']);
  if (Object.hasOwn(input,'replay_digest') && (typeof input.replay_digest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(input.replay_digest))) invalid();
  fields(input.decision, ['workload'], ['objective']);
  const binding = await planningBinding(ctx, id, input.expected_head, input.configuration);
  // Registry evidence governs currentness and inventory provenance. A
  // caller-supplied catalogue mapping or topology stays an explicit hypothesis.
  const topology = input.head_hypothesis;
  const moduleReview = planningModuleExclusions(binding, input.planner_model_id, ctx.planningOptions, input.module_hypotheses);
  const moduleAssumptions = moduleReview.mappings.length ? {module_mappings:moduleReview.mappings} : {};
  const request = {
    schema: 'planner/assessment-request/1',
    protocol: input.protocol,
    decision: {objective: 'labour', ...input.decision, scope: 'upgrade', methodChanges: false},
    installations: [{
      id, modelId: input.planner_model_id, name: 'Selected Registry installation', access: 'unknown',
      installedHeads: {status: topology === null ? 'unknown' : 'reported', heads: topology ?? []},
      ...(Object.keys(moduleReview.options).length ? {options:moduleReview.options} : {}),
    }],
  };
  const evaluated = await ctx.evaluatePlanning(request, req.signal);
  const result = await evaluated.json();
  const binding_sha256 = evaluated.ok ? await hash({binding, request_sha256: result.request_sha256, evaluator: result.evaluator, ...moduleAssumptions}) : null;
  // The upstream evaluator is asynchronous. Recheck access, expiry and the
  // exact head pins before returning any interpretation or restricted inventory.
  const currentBinding = await planningBinding(ctx, id, input.expected_head, input.configuration);
  if (!same(binding, currentBinding)) stale();
  if (!evaluated.ok) {
    const code = result.error?.code;
    const message = code === 'protocol_block_wash_boundary'
      ? 'Include the following liquid-handling step to resolve where the wash ends.'
      : code === 'protocol_material_flow_unresolved'
        ? 'The source pools or redistributes material. Review its vessel identities and quantities, or choose a block outside those boundaries.'
        : 'The private planning inputs could not be assessed.';
    throw new RegistryProblem(evaluated.status, message, code);
  }
  if (input.replay_digest && input.replay_digest !== binding_sha256) {
    throw new RegistryProblem(409, 'The assessment inputs, Registry evidence or evaluator changed. Run a fresh private comparison.', 'planning_replay_changed');
  }
  return [200, {schema: 'planner/registry-planning-result/1', binding, binding_sha256,
    assumptions: {planner_model_id: input.planner_model_id, fitted_heads: topology,
      status: topology === null ? 'unknown' : 'caller_hypothesis', ...moduleAssumptions},
    assessment: result}];
}

async function dispatch(path, req, env, who, bundle, evaluateReviewed, evaluatePlanning, planningOptions) {
  const method = req.method, parts = path.slice(ROOT.length + 1).split('/');
  if (!env.DB || !bundle) fail(503, 'Registry storage is not available on this server.');
  const s = storage(env.DB);
  if (parts[0] === 'public') {
    if (parts.length > 2) absent();
    return method === 'GET' ? publicRead(s, bundle, parts[1], req) : badMethod();
  }
  if (!who) fail(401, 'Sign in first.');
  if (parts[0] !== 'organisations') absent();
  const actor = who.id;
  if (parts.length === 1) {
    if (method === 'GET') {
      const rows = bounded(await s.all(`SELECT o.*, m.role FROM registry_organisations o
        JOIN registry_members m ON m.org_id = o.id WHERE m.user_id = ? AND m.role IN ${ALL} ORDER BY o.id LIMIT ${maxRows + 1}`, actor));
      return [200, {user_id: actor, organisations: rows.map(r => ({...orgData(r), role: r.role}))}];
    }
    if (method !== 'POST') return badMethod();
    const data = await payload(req);
    fields(data, ['name'], ['claims']);
    if (!words(data.name, 160)) invalid();
    const id = crypto.randomUUID(), created_at = utc(), claims = organisationClaims(data.claims ?? []);
    await s.batch([
      s.q('INSERT INTO registry_organisations (id,name,claims,created_by,created_at) VALUES (?,?,?,?,?)', id, data.name.trim(), claims, actor, created_at),
      s.q('INSERT INTO registry_members (org_id,user_id,role,updated_by,updated_at) VALUES (?,?,?,?,?)', id, actor, 'owner', actor, created_at),
    ]);
    return [201, {organisation: {...orgData({id, name: data.name.trim(), claims, created_by: actor, created_at}), role: 'owner'}}];
  }
  const [_, org, resource, id, action] = parts;
  if (parts.length > 5 || !idPattern.test(org) || (parts.length >= 4 && !idPattern.test(id))) absent();
  const membership = await s.one(`SELECT role FROM registry_members WHERE org_id = ? AND user_id = ? AND role IN ${ALL}`, org, actor);
  if (!membership) absent();
  const ctx = {s, org, actor, role: membership.role, bundle, evaluateReviewed, evaluatePlanning, planningOptions};
  if (resource === 'members' && parts.length === 3) {
    if (ctx.role !== 'owner') fail(403, 'Only a registry owner can manage members.');
    if (method === 'GET') {
      const members = bounded(await s.all(`SELECT user_id,role,updated_by,updated_at FROM registry_members
        WHERE org_id = ? AND ${member(OWNER)} ORDER BY user_id LIMIT ${maxRows + 1}`, org, org, actor));
      return [200, {members}];
    }
    if (method !== 'POST') return badMethod();
    const data = await payload(req);
    fields(data, ['user_id', 'role']);
    if (!words(data.user_id, 200) || !['editor', 'reviewer', null].includes(data.role) || data.user_id === actor) invalid();
    const now = utc();
    if (data.role === null) await s.write(`DELETE FROM registry_members WHERE org_id = ? AND user_id = ?
      AND role != 'owner' AND ${member(OWNER)}`, org, data.user_id, org, actor);
    else await s.write(`INSERT INTO registry_members (org_id,user_id,role,updated_by,updated_at)
      SELECT ?,?,?,?,? WHERE ${member(OWNER)} ON CONFLICT (org_id,user_id) DO UPDATE SET role = excluded.role,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at WHERE registry_members.role != 'owner'`,
    org, data.user_id, data.role, actor, now, org, actor);
    return [200, {member: {user_id: data.user_id, role: data.role}}];
  }
  if (resource === 'roar-import' && parts.length === 4 && ['preview', 'apply'].includes(id)) return importRoar(ctx, req, id);
  if (resource === 'pilot') return pilot(ctx, id, req, action);
  if (resource === 'backup' && parts.length === 3) return method === 'GET' ? backup(ctx) : badMethod();
  if (resource === 'assessments' && id && action === 'request-v1' && parts.length === 5) return prepareServiceRequest(ctx, id, req);
  if (resource === 'request-drafts-v1' && id && parts.length === 4) return requestDraftRead(ctx, id, req);
  if (resource === 'assessments' && parts.length <= 4) return assessments(ctx, id, req);
  if (resource !== 'records') absent();
  const params = new URL(req.url).searchParams;
  if (!id) {
    if (method === 'POST') return revisions(ctx, null, req, 'create');
    if (method !== 'GET') return badMethod();
    const after = params.get('after') ?? '';
    if (after && !idPattern.test(after)) invalid();
    const rows = await readRows(s, org, actor, `r.record_id > ? AND ${current}`, [after], 'ORDER BY r.record_id', true);
    return [200, {records: await Promise.all(rows.slice(0, maxRows).map(async r => recordData(await verifyRow(bundle, r)))),
      next_after: rows.length > maxRows ? rows[maxRows - 1].record_id : null}];
  }
  if (['sharing', 'publication', 'publication-preview'].includes(action)) return sharing(ctx, id, req, action);
  if (action === 'revisions') return method === 'POST' ? revisions(ctx, id, req, 'revise') : badMethod();
  if (action === 'reconciliation') return method === 'GET' ? installationDetails(ctx, id) :
    method === 'POST' ? changeInstallation(ctx, id, req, action) : badMethod();
  if (action === 'move') return method === 'POST' ? changeInstallation(ctx, id, req, action) : badMethod();
  if (action === 'planning-v1') return planInstallation(ctx, id, req);
  if (action === 'match') return method === 'POST' ? matchService(ctx, id, req) : badMethod();
  if (action === 'refresh-matches') return method === 'POST' ? refreshMatches(ctx, id, req) : badMethod();
  if (action === 'survey') return operatorSurvey(ctx, id, req);
  if (action === 'claims') return method === 'GET' ? claims(ctx, id) : badMethod();
  if (action === 'history') {
    if (method !== 'GET') return badMethod();
    const after = params.get('after') ?? '0';
    if (!/^\d{1,12}$/.test(after)) invalid();
    const rows = await readRows(s, org, actor, 'r.record_id = ? AND r.seq >= ?', [id, Number(after)], 'ORDER BY r.seq');
    if (!rows.length || Number(after) && rows[0].seq !== Number(after)) absent();
    const previous = Number(after) ? await verifyRow(bundle, rows.shift()) : null;
    const history = [];
    let parent = previous ? refOf(previous.wire) : null;
    for (const row of rows.slice(0, maxRows - Number(Boolean(previous)))) {
      const checked = await verifyRow(bundle, row);
      if (!same(checked.wire.parent, parent)) throw Error('Registry history integrity failed');
      history.push(recordData(checked));
      parent = refOf(checked.wire);
    }
    return [200, {history, next_after: rows.length > history.length ? Number(after) + history.length : null}];
  }
  if (action !== undefined) absent();
  return method === 'GET' ? [200, {revision: recordData(await head(ctx, id))}] : badMethod();
}

export async function registryApi(path, req, env, who, bundle, json, evaluateReviewed, evaluatePlanning, planningOptions) {
  try {
    const [status, data] = await dispatch(path, req, env, who, bundle, evaluateReviewed, evaluatePlanning, planningOptions);
    return json(status, data);
  } catch (e) {
    if (e instanceof RegistryProblem) return json(e.status, {error: e.message, ...(e.code ? {code: e.code} : {})});
    throw e;
  }
}
