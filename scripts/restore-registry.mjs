// Restore a trusted owner export to a fresh local SQLite database only.
import {closeSync, openSync, readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {memoryD1} from './memory-d1.mjs';
import {registryContracts} from './registry-contracts.mjs';
import {archiveDigest, canonical, parseReview, recordLinks, refOf, refShape, sameRef, sourceRefShape, timestamp, validStoredWire} from '../worker/registry/contract.js';
import {assessService, isFacilityDefault, recordStatus, serviceClaims, validMatchInput, validRecordLink, validServiceRecord} from '../worker/registry/service.js';
import {validInstallationBinding, validInstallationTransition} from '../worker/registry/installation.js';

import {validateDraftRow} from '../worker/registry/request-draft.js';
import {pilotCohortLimit, pilotReviewFits, pilotVersion, validPilot} from '../worker/registry/pilot.js';

const tables = ['registry_organisations', 'registry_members', 'registry_revisions', 'registry_publications', 'registry_assessments', 'registry_pilot_revisions', 'registry_request_drafts'];
const must = condition => { if (!condition) throw Error('Registry backup is incomplete or inconsistent.'); };

async function validateArchive(archive) {
  must(archive && typeof archive === 'object' && typeof archive.archive_digest === 'string');
  if (await archiveDigest(archive) !== archive.archive_digest) throw Error('Registry archive digest mismatch.');
  const bundle = await registryContracts();
  const {organisation: o, memberships, revisions, publications, assessments} = archive;
  const legacy = archive.format === 'planner-registry-export/1';
  const withDrafts = archive.format === 'planner-registry-export/6';
  const withPilot = archive.format === 'planner-registry-export/5' || withDrafts && Object.hasOwn(archive, 'pilot');
  const reconciliation = withDrafts || withPilot || archive.format === 'planner-registry-export/4';
  const extended = reconciliation || archive.format === 'planner-registry-export/3';
  must((legacy || extended || archive.format === 'planner-registry-export/2') && archive.contracts === bundle.upstream &&
    o && typeof o.id === 'string' && [memberships, revisions, publications, assessments].every(Array.isArray));
  must(memberships.filter(m => m.role === 'owner').length === 1 &&
    memberships.some(m => m.role === 'owner' && m.user_id === o.created_by) &&
    memberships.every(m => ['owner', 'reviewer', 'editor'].includes(m.role)));
  const seen = new Map(), heads = new Map();
  for (const r of revisions) {
    const w = r.record;
    must(await validStoredWire(bundle, w));
    must((extended || !Object.hasOwn(r, 'service') && !['offer','access_claim','availability_claim'].includes(w.record.record_type)) &&
      validServiceRecord(w, {...r, service: r.service ?? null}));
    const old = heads.get(w.record_id);
    must((reconciliation || !Object.hasOwn(r, 'installation_event')) &&
      await validInstallationBinding(bundle, w, r, r.installation_event ?? null) && validInstallationTransition(r, old));
    must(w.organisation_id === o.id && !seen.has(w.revision_id) && r.seq === (old?.seq ?? 0) + 1 &&
      ['active', 'retired'].includes(r.state) &&
      ['organisation', 'restricted', 'public'].includes(r.visibility) &&
      w.visibility === (r.visibility === 'public' ? 'public' : 'organisation_private') &&
      (old ? r.visibility === old.visibility && w.record.record_type === old.record.record.record_type && isFacilityDefault({wire: w}) === isFacilityDefault({wire: old.record}) && sameRef(w.parent, refOf(old.record)) : w.parent === null));
    heads.set(w.record_id, r);
    seen.set(w.revision_id, r);
  }
  function resolves(ref, visibility) {
    const r = seen.get(ref.revision_id);
    return r && sameRef(ref, refOf(r.record)) && (r.visibility !== 'restricted' || visibility === 'restricted');
  }
  for (const r of revisions) must(recordLinks(r.record.record, o.id).every(ref => {
    const linked = seen.get(ref.revision_id);
    return resolves(ref, r.visibility) && validRecordLink(r.record, {...linked, wire: linked.record}, ref);
  }));
  for (const r of revisions) {
    const event = r.installation_event;
    if (!event?.target) continue;
    // An application timestamp can precede a concurrent transaction that
    // commits first. The original SQL write checked the exact current head.
    const target = seen.get(event.target.revision_id);
    must(r.actor === o.created_by && target && sameRef(event.target, refOf(target.record)) &&
      (event.action !== 'duplicate_link' || target.state === 'active'));
  }
  for (const row of heads.values()) if (row.installation_event?.action === 'duplicate_link') {
    const target = heads.get(row.installation_event.target.record_id);
    must(target && target.installation_event?.action !== 'duplicate_link');
  }
  const assessmentsById = new Map(assessments.map(a => [a.id, a])), refreshed = new Map();
  must(assessmentsById.size === assessments.length);
  for (const a of assessments) {
    const refs = parseReview(a.refs);
    must(Array.isArray(refs) && refs.every(ref => resolves(ref, a.visibility)));
    if (Object.hasOwn(a, 'match_input')) {
      must(extended && typeof a.match_input === 'string');
      const capture = parseReview(a.match_input);
      must(capture?.format === 'planner-service-match/1' && validMatchInput(capture.input, {
        sourceRef: r => sourceRefShape(bundle, r), revisionRef: r => refShape(bundle, r),
      }) && sameRef(capture.input.expected_head, capture.result?.offer) &&
        refs.some(ref => sameRef(ref, capture.input.expected_head)) &&
        capture.result.evaluated_at === a.created_at && capture.result.execution_authorized === false &&
        capture.result.booking_created === false && capture.result.authority === 'unverified' &&
        !Object.hasOwn(capture.result, 'enquiry_routes'));
      if (Object.hasOwn(capture, 'refresh')) {
        const refresh = capture.refresh;
        must(refresh && Object.keys(refresh).length === 2 && typeof refresh.prior_id === 'string' &&
          refShape(bundle, refresh.answer) && refresh.answer.record_type === 'access_claim');
        const before = assessmentsById.get(refresh.prior_id);
        const answer = seen.get(refresh.answer.revision_id);
        must(before && before.id !== a.id && before.actor === a.actor && before.created_at <= a.created_at &&
          typeof before.match_input === 'string' && !refreshed.has(before.id) &&
          answer?.action === 'review' && answer.record.sources.length > 0 &&
          sameRef(refresh.answer, refOf(answer.record)) && answer.record.record.dimension === 'training' &&
          answer.record.record.outcome !== 'unknown' && sameRef(answer.record.record.target, capture.input.expected_head) &&
          capture.result.evidence.find(e => sameRef(e.target, capture.input.expected_head))?.reports.some(report =>
            sameRef(report.reference, refresh.answer) && report.status === 'current'));
        must(sameRef(parseReview(before.match_input).input, capture.input) &&
          !parseReview(before.refs).some(ref => sameRef(ref, refresh.answer)));
        refreshed.set(before.id, a.id);
      }
      const included = new Map(refs.map(ref => [ref.revision_id, ref]));
      must(Array.isArray(capture.snapshot) && capture.snapshot.length === refs.length &&
        new Set(capture.snapshot.map(d => d.reference?.revision_id)).size === refs.length);
      const snapshot = new Map();
      for (const dep of capture.snapshot) {
        const ref = dep.reference, pinned = seen.get(ref.revision_id), latest = seen.get(dep.head_revision_id);
        must(pinned && latest && latest.record.record_id === pinned.record.record_id && latest.seq >= pinned.seq &&
          Date.parse(latest.record.recorded_at) <= Date.parse(a.created_at) && included.has(ref.revision_id) &&
          sameRef(ref, included.get(ref.revision_id)));
        const row = {...pinned, wire: pinned.record};
        const status = latest.seq !== pinned.seq ? 'revised' : recordStatus(row, a.created_at) ?? 'current';
        must(status === dep.status);
        snapshot.set(ref.revision_id, {row, status});
      }
      for (const ref of refs) must(recordLinks(seen.get(ref.revision_id).record.record, o.id).every(link =>
        included.has(link.revision_id) && sameRef(link, included.get(link.revision_id))));
      const offer = snapshot.get(capture.input.expected_head.revision_id).row;
      const reports = [...snapshot.values()].map(x => x.row).filter(row => serviceClaims.includes(row.wire.record.record_type));
      const {enquiry_routes, ...computed} = assessService(offer, capture.input, reports, ref => snapshot.get(ref.revision_id), a.created_at);
      must(!isFacilityDefault(offer) && reports.every(({wire}) => {
        const {target, subject} = wire.record;
        return computed.evidence.some(e => sameRef(e.target, target)) &&
          (!subject || subject.kind === 'public' || subject.kind === 'organisation' && subject.id === o.id ||
            subject.kind === 'principal' && subject.id === a.actor);
      }) && sameRef(computed, capture.result));
    }
  }
  for (const id of refreshed.keys()) {
    const visited = new Set();
    for (let next = id; refreshed.has(next); next = refreshed.get(next)) {
      must(!visited.has(next));
      visited.add(next);
    }
  }
  if (withPilot) {
    must(Array.isArray(archive.pilot) && archive.pilot.length > 0 && archive.pilot.length <= 100);
    const previous = new Map(), versions = new Set();
    for (const row of archive.pilot) {
      const prior = previous.get(row.cohort_id);
      must(Object.keys(row).length === 7 &&
        typeof row.cohort_id === 'string' && /^[a-f0-9-]{36}$/.test(row.cohort_id) &&
        typeof row.version === 'string' && /^[a-f0-9]{64}$/.test(row.version) &&
        !versions.has(row.version) && row.seq === (prior?.seq ?? 0) + 1 &&
        typeof row.actor === 'string' && row.actor.length > 0 &&
        typeof row.reason === 'string' && row.reason.trim() === row.reason && row.reason.length > 0 &&
        row.reason.length <= 400 && !/[\u0000-\u001f\u007f]/.test(row.reason) &&
        timestamp(row.saved_at) && (!prior || prior.saved_at <= row.saved_at) &&
        validPilot(bundle, o.id, row.snapshot, row.saved_at) &&
        row.version === await pilotVersion(o.id, row, prior?.version ?? null));
      const old = new Map(prior?.snapshot.leads.map(l => [l.id, l]) ?? []);
      for (const lead of row.snapshot.leads) {
        if (!lead.review) continue;
        const before = old.get(lead.id);
        if (before?.review && sameRef(lead.review.pin, before.review.pin)) {
          must(lead.reviewed_on === before.reviewed_on && lead.review.expires_on === before.review.expires_on);
        } else {
          const pinned = seen.get(lead.review.pin.revision_id);
          must(pinned && pilotReviewFits(lead, {...pinned, wire: pinned.record}, row.saved_at));
        }
      }
      versions.add(row.version);
      previous.set(row.cohort_id, row);
    }
    must(previous.size <= pilotCohortLimit);
  } else must(!Object.hasOwn(archive, 'pilot'));
  if (withDrafts) {
    must(Array.isArray(archive.request_drafts) && archive.request_drafts.length > 0 && archive.request_drafts.length <= 100);
    const ids = new Set(), keys = new Set();
    for (const row of archive.request_drafts) {
      const assessment = assessmentsById.get(row.assessment_id), key = canonical([row.actor, row.key_digest]);
      must(Object.keys(row).length === 8 && typeof row.id === 'string' && /^[a-f0-9-]{36}$/.test(row.id) &&
        typeof row.actor === 'string' && assessment?.actor === row.actor && typeof assessment.match_input === 'string' &&
        !ids.has(row.id) && !keys.has(key));
      const draft = await validateDraftRow(row, parseReview(assessment.match_input), o.id);
      const installation = seen.get(draft.installation.revision_id)?.record.record;
      must(installation?.record_type === 'installation' && canonical(installation.model) === canonical(draft.model));
      ids.add(row.id);
      keys.add(key);
    }
  } else must(!Object.hasOwn(archive, 'request_drafts'));
  for (const p of publications) {
    must(seen.get(p.revision_id)?.record.record_id === p.record_id);
    if (legacy) must(!['policy_id', 'restricted', 'disclosure'].some(key => Object.hasOwn(p, key)));
    else {
      must(p.policy_id === null || (typeof p.policy_id === 'string' && /^[a-f0-9-]{36}$/.test(p.policy_id)));
      must(p.restricted === 0 || p.restricted === 1);
      if (p.restricted || p.policy_id === null) must(p.disclosure === null);
      if (p.restricted) must(p.policy_id !== null && p.projection === null);
      if (p.projection !== null && p.policy_id !== null) must(typeof p.disclosure === 'string');
    }
  }
}

async function writeArchive(DB, {organisation: o, memberships, revisions, publications, assessments, pilot = [], request_drafts = []}) {
  for (const table of tables) must(!await DB.prepare(`SELECT 1 FROM ${table} LIMIT 1`).first());
  // Keep exact opaque identities, parent/digest bindings and original actors.
  const insert = (table, columns, values) => DB.prepare(
    `INSERT INTO ${table} (${columns}) VALUES (${values.map(() => '?')})`).bind(...values);
  await DB.batch([
    insert(tables[0], 'id,name,claims,created_by,created_at', [o.id, o.name, canonical(o.claims), o.created_by, o.created_at]),
    ...memberships.map(m => insert(tables[1], 'org_id,user_id,role,updated_by,updated_at',
      [o.id, m.user_id, m.role, m.updated_by, m.updated_at])),
    ...revisions.map(r => insert(tables[2], 'org_id,record_id,seq,revision_id,visibility,state,action,actor,observed_at,expires_at,wire,service,installation_event',
      [o.id, r.record.record_id, r.seq, r.record.revision_id, r.visibility, r.state, r.action, r.actor,
        r.observed_at, r.expires_at, canonical(r.record), r.service ? canonical(r.service) : null,
        r.installation_event ? canonical(r.installation_event) : null])),
    ...publications.map(p => insert(tables[3], 'org_id,record_id,revision_id,actor,decided_at,projection,policy_id,restricted,disclosure',
      [o.id, p.record_id, p.revision_id, p.actor, p.decided_at, p.projection, p.policy_id ?? null, p.restricted ?? 0, p.disclosure ?? null])),
    ...assessments.map(a => insert(tables[4], 'org_id,id,actor,created_at,visibility,refs,match_input',
      [o.id, a.id, a.actor, a.created_at, a.visibility, a.refs, a.match_input ?? null])),
    ...pilot.map(p => insert(tables[5], 'org_id,cohort_id,seq,version,actor,saved_at,reason,snapshot',
      [o.id, p.cohort_id, p.seq, p.version, p.actor, p.saved_at, p.reason, canonical(p.snapshot)])),
    ...request_drafts.map(d => insert(tables[6], 'org_id,id,actor,assessment_id,key_digest,input_digest,created_at,expires_at,draft',
      [o.id, d.id, d.actor, d.assessment_id, d.key_digest, d.input_digest, d.created_at, d.expires_at, d.draft])),
  ]);
}
export async function restoreRegistry(DB, archive) {
  await validateArchive(archive);
  await writeArchive(DB, archive);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [archivePath, sqlitePath] = process.argv.slice(2);
  if (!archivePath || !sqlitePath || process.argv.length !== 4) throw Error('Usage: node scripts/restore-registry.mjs <owner-export.json> <new-local.sqlite>');
  const archive = parseReview(new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(readFileSync(archivePath)));
  await validateArchive(archive);
  closeSync(openSync(sqlitePath, 'wx', 0o600));
  const db = new DatabaseSync(sqlitePath);
  try { await writeArchive(memoryD1(db), archive); } finally { db.close(); }
  console.log('Registry archive restored to a new local SQLite database.');
}
