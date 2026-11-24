#!/usr/bin/env node
// Labstep protocol snapshots (issue #23).
//
//   npm run labstep -- import <collectionId> [--version <versionId>]
//   npm run labstep -- check
//   npm run labstep -- push    (the lab's protocols and equipment to the hosted planner, #145)
//
// Labstep is the authority for lab protocols. `import` stores one exact
// protocol version as imports/labstep/<collectionId>.json, read through
// lab-mcp (which holds the credentials; nothing secret is written here).
// `check` compares every snapshot with the latest version in Labstep and
// reports what changed, step by step. Set LAB_MCP_DIR if lab-mcp is not in
// ~/Projects/lab-mcp.
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {createHash, randomBytes} from 'node:crypto';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

import {checkLabstepVersion, isLabstepDraft, labstepDraftConsent, verifyLabstepSnapshotHash} from '../lib/source-provenance.js';
import {diffLabstepSteps, keepLatestLabstepVersion} from '../lib/snapshots.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Exports land outside the site (imports/ is git-ignored); upload them on the
// Protocols page. Set LABSTEP_IMPORT_DIR to write elsewhere.
const dir = process.env.LABSTEP_IMPORT_DIR || join(root, 'imports', 'labstep');
const labMcp = process.env.LAB_MCP_DIR || join(homedir(), 'Projects', 'lab-mcp');

export function fetchExport(id, version) {
  const args = ['run', '--directory', labMcp, 'labstep', 'protocol-export', String(id)];
  if (version) args.push('--version', String(version));
  return JSON.parse(execFileSync('uv', args, {encoding: 'utf8', maxBuffer: 50e6}));
}

// Labstep's inventory fields for the same version (issue #61): the reagents
// and samples each step names, with the resource category Labstep files them
// under. The export's step text drops these inline references, so they are
// joined back onto each step by position.
export function fetchInventory(id, version) {
  const args = ['run', '--directory', labMcp, 'labstep', 'protocol-requirements', String(id)];
  if (version) args.push('--version', String(version));
  return JSON.parse(execFileSync('uv', args, {encoding: 'utf8', maxBuffer: 50e6}));
}
export function attachInventory(exp, req) {
  if (req.version?.id !== exp.version.id) throw Error(`Inventory is for version ${req.version?.id}, export is ${exp.version.id}`);
  const byPosition = new Map(req.steps.map(s => [s.position, s]));
  for (const step of exp.steps) {
    step.inventory = (byPosition.get(step.position)?.inventory_fields || []).map(f => ({
      name: (f.name || '').trim(), amount: f.amount ?? null, unit: f.unit ?? null,
      resource: f.resource?.name?.trim() || null, category: f.resource_template?.name?.trim() || null,
      input: !!f.is_input, output: !!f.is_output,
    }));
    // Prescribed time (sum of the timers Labstep places in the step) and linked
    // equipment, from the same protocol-requirements read (issue #59).
    const r = byPosition.get(step.position) || {};
    step.prescribedSeconds = r.prescribed_seconds ?? null;
    step.timers = (r.timers || []).map(t => ({name: (t.name || '').trim(), seconds: t.duration_seconds ?? null}));
    step.devices = (r.devices || []).map(d => (d.name || '').trim()).filter(Boolean);
  }
  return exp;
}

// Observed step times for one protocol version from lab-mcp protocol-executions
// (agentic-lab ProtocolExecution records, issue #59). Only runs lab-mcp marks
// usable whose steps matched the version are used: at least half the steps
// ticked, and ticks that look plausible (not batch-ticked or out of order, and a
// tick span of at least half the stated waits; lab-mcp #82). Batch-ticked, held,
// out-of-order and implausibly short steps (notes.rejected_steps) are left out,
// and so is the step just before a batch, whose gap holds the whole batch's work.
// A step's median needs MIN_RUNS runs (#148); fewer are listed in tooFew. Values
// are minutes between step ticks: elapsed time per step, not hands-on time.
export const MIN_RUNS = 5;
const quantile = (xs, q) => { const i = (xs.length - 1) * q, lo = Math.floor(i); return xs[lo] + (xs[Math.ceil(i)] - xs[lo]) * (i - lo); };
const round1 = x => Math.round(x * 10) / 10;
export function summariseExecutions(execs, versionId, versionSteps) {
  // versionSteps: the version's steps in order ({position, guid}). Tick-derived
  // entries name the version step GUID when a run's steps matched the version.
  const positionOf = new Map(versionSteps.map(s => [s.guid, s.position]));
  const minutes = new Map();
  let runs = 0, runsWithTicks = 0, usableRuns = 0, matchedRuns = 0;
  const rejectedRuns = {}, rejectedSteps = {};
  const add = (o, k) => { o[k] = (o[k] || 0) + 1; };
  for (const {execution: ex, notes = {}} of execs.executions || []) {
    const vid = ex ? Number(ex.protocol_version.native_id) : Number(notes.version_id);
    if (vid !== versionId) continue;
    runs++;
    for (const r of notes.run_rejection_reasons || []) add(rejectedRuns, r);
    if (!ex) continue;
    if (ex.timings.some(t => t.kind === 'tick_derived')) runsWithTicks++;
    if (!notes.usable_for_step_times) continue;
    usableRuns++;
    if (!notes.steps_matched_version) continue;
    matchedRuns++;
    // A batch-ticked or out-of-order step's work lands in the gap of the step before
    // it, so that step is left out too.
    const batch = new Set(notes.batch_ticked_steps || []);
    const outOfOrder = new Set(notes.out_of_order_steps || []);
    const before = p => [...p].map(x => x - 1);
    const implausible = (notes.rejected_steps || []).map(r => { add(rejectedSteps, r.reason); return r.position; });
    const skip = new Set([...batch, ...outOfOrder, ...before(batch), ...before(outOfOrder),
      ...(notes.held_steps || []), ...implausible]);
    for (const t of ex.timings) {
      if (t.kind !== 'tick_derived' || !positionOf.has(t.step) || skip.has(positionOf.get(t.step))) continue;
      if (!minutes.has(t.step)) minutes.set(t.step, []);
      minutes.get(t.step).push(t.duration_s / 60);
    }
  }
  const steps = {}, tooFew = {};
  for (const [guid, xs] of minutes) {
    if (xs.length < MIN_RUNS) { tooFew[guid] = xs.length; continue; }  // too few plausible runs
    xs.sort((a, b) => a - b);
    steps[guid] = {n: xs.length, medianMin: round1(quantile(xs, 0.5)), p25Min: round1(quantile(xs, 0.25)), p75Min: round1(quantile(xs, 0.75))};
  }
  return {versionId, runs, runsWithTicks, usableRuns, matchedRuns, minRuns: MIN_RUNS, steps, tooFew, rejectedRuns, rejectedSteps};
}

// Step-level differences between two exports. Labstep gives steps new guids
// in each new version, so steps are matched by guid first, then by title,
// in order. Matched steps whose text differs are reported as changed.
export function diffExports(pinned, latest) {
  const pairs = diffLabstepSteps(pinned, latest);
  const brief = s => ({position: s.position, title: s.title});
  const added = pairs.filter(x => !x.before).map(x => brief(x.after));
  const removed = pairs.filter(x => !x.after).map(x => brief(x.before));
  const changed = pairs.filter(x => x.after && x.before && (x.before.text !== x.after.text || x.before.title !== x.after.title)).map(x => brief(x.after));
  const moved = pairs.filter(x => x.after && x.before && x.before.position !== x.after.position).length;
  return {versionChanged: pinned.version.id !== latest.version.id, from: pinned.version, to: latest.version, added, removed, changed, moved, contentChanged: added.length + removed.length + changed.length > 0, draftInProgress: latest.has_unpublished_draft};
}

// content/labstep/snapshots.js lets the browser and tests load snapshots
// as an ordinary module.
export function writeIndex() {
  const files = readdirSync(dir).filter(f => /^[0-9]+[.]json$/.test(f)).sort();
  const body = files.map(f => `  ${f.replace('.json', '')}: ${readFileSync(join(dir, f), 'utf8').trim()},`).join('\n');
  writeFileSync(join(dir, 'snapshots.js'), `// Generated by scripts/labstep.mjs from content/labstep/*.json. Do not edit.\nexport const snapshots = {\n${body}\n};\n`);
}

function write(exp) {
  mkdirSync(dir, {recursive: true});
  const {retrieved_at, ...stable} = exp;
  const file = join(dir, `${exp.collection_id}.json`);
  writeFileSync(file, JSON.stringify({...stable, imported_at: retrieved_at}, null, 2) + '\n');
  return file;
}

// Push the lab's protocols and equipment to the hosted planner (#145), for
// active lab members to see. The Labstep key stays in lab-mcp on this computer.
// This computer has its own push key (~/.config/lab-automation-planner/push-key,
// mode 600); only its SHA-256 hash is sent, once, via a link the lab owner opens
// on the Lab page to approve it. Equipment comes from imports/lab-equipment.json
// ({"equipment": [...]}, the same records as the Equipment page) when present.
export const SITE = process.env.PLANNER_URL || 'https://lab-automation-planner-skene.nathan-skene.chatgpt.site';
const keyFile = join(homedir(), '.config', 'lab-automation-planner', 'push-key');
export const hashKey = key => createHash('sha256').update(key).digest('hex');
function pushKey() {
  if (process.env.PLANNER_PUSH_KEY) return process.env.PLANNER_PUSH_KEY;
  if (existsSync(keyFile)) return readFileSync(keyFile, 'utf8').trim();
  const key = randomBytes(32).toString('base64url');
  mkdirSync(dirname(keyFile), {recursive: true, mode: 0o700});
  writeFileSync(keyFile, key + '\n', {mode: 0o600});
  return key;
}
const pushHeaders = key => ({Authorization: `Bearer ${key}`, 'Content-Type': 'application/json'});
async function push(rest) {
  if (rest.includes('--hash')) { console.log(hashKey(pushKey())); return 0; }
  const allowed = new Set();
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--no-wait') continue;
    if (rest[i] !== '--allow-draft' || !/^[1-9][0-9]*:[1-9][0-9]*:sha256:[0-9a-f]{64}$/.test(rest[i + 1] || '')) {
      throw Error('Usage: labstep push [--no-wait] [--allow-draft <collectionId>:<versionId>:sha256:<stepHash>]…');
    }
    allowed.add(rest[++i]);
  }
  const files = readdirSync(dir).filter(f => /^[0-9]+[.]json$/.test(f)).sort();
  if (!files.length) throw Error(`No protocol exports in ${dir}; run "labstep import <id>" first`);
  const exports = await Promise.all(files.map(async file => {
    const exp = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    try {
      checkLabstepVersion(exp);
      if (file !== `${exp.collection_id}.json`) throw Error('The filename does not match the collection ID.');
      await verifyLabstepSnapshotHash(exp);
    } catch (err) { throw Error(`${file}: ${err.message}`); }
    return exp;
  }));
  for (const exp of exports.filter(isLabstepDraft)) {
    const pin = labstepDraftConsent(exp);
    if (!allowed.delete(pin)) throw Error(`Labstep ${pin} is a draft or has no confirmed lock. Push a locked version or explicitly use --allow-draft ${pin}.`);
  }
  if (allowed.size) throw Error(`Draft override did not match an export that needs it: ${[...allowed].join(', ')}.`);
  const key = pushKey(), hash = hashKey(key);
  if (!/^[A-Za-z0-9_-]{43}$/.test(key)) throw Error(`The push key in ${process.env.PLANNER_PUSH_KEY ? 'PLANNER_PUSH_KEY' : keyFile} is malformed; delete it and run push again.`);
  const wait = !rest.includes('--no-wait');
  let r = await fetch(`${SITE}/api/labstep/protocols`, {headers: pushHeaders(key)});
  if (r.status === 401 || r.status === 403) {
    console.log(`This computer is not approved to push yet. Either add its key hash ${hash} to the Site's LAB_PUSH_KEYS runtime setting, or, as the lab owner, open:\n\n  ${SITE}/web/index.html#lab/approve-${hash}\n\nand check the code is ${hash.slice(0, 4).toUpperCase()}-${hash.slice(4, 8).toUpperCase()}.`);
    if (!wait) return 2;
    console.log('Waiting for approval (10 minutes)…');
    for (let i = 0; i < 120 && (r.status === 401 || r.status === 403); i++) {
      await new Promise(ok => setTimeout(ok, 5000));
      r = await fetch(`${SITE}/api/labstep/protocols`, {headers: pushHeaders(key)});
    }
  }
  if (!r.ok) throw Error(`The planner refused the push (${r.status}): ${(await r.json().catch(() => ({}))).error || ''}`);
  // A version already stored is never rewritten (the server refuses it, #145
  // follow-ups), so skip it; keep going past a refused protocol and list them all.
  const stored = new Map(((await r.json()).protocols || []).map(p => [p.collectionId, p.versionId]));
  const ids = [], failed = [];
  let unchanged = 0;
  for (const exp of exports) {
    if (stored.get(exp.collection_id) === exp.version.id) { ids.push(exp.collection_id); unchanged++; continue; }
    const headers = pushHeaders(key);
    if (isLabstepDraft(exp)) headers['X-Planner-Allow-Draft'] = labstepDraftConsent(exp);
    const res = await fetch(`${SITE}/api/labstep/protocols/${exp.collection_id}`, {method: 'PUT', headers, body: JSON.stringify(exp)});
    if (!res.ok) {
      failed.push(`Labstep ${exp.collection_id} (${exp.name}): refused (${res.status}) ${(await res.json().catch(() => ({}))).error || ''}`);
      if (stored.has(exp.collection_id)) ids.push(exp.collection_id);  // keep the copy already there
      continue;
    }
    ids.push(exp.collection_id);
    console.log(`Pushed ${exp.name} (Labstep ${exp.collection_id}, version ${exp.version.id})`);
  }
  if (unchanged) console.log(`${unchanged} already up to date`);
  // Prune only after a clean run, so a partial failure never removes protocols.
  if (!failed.length) {
    const pruned = await fetch(`${SITE}/api/labstep/prune`, {method: 'POST', headers: pushHeaders(key), body: JSON.stringify({keep: ids})});
    if (pruned.ok) { const {removed} = await pruned.json(); if (removed.length) console.log(`Removed from the lab list: Labstep ${removed.join(', ')}`); }
  }
  const eqFile = process.env.LAB_EQUIPMENT_FILE || join(root, 'imports', 'lab-equipment.json');
  if (existsSync(eqFile)) {
    const res = await fetch(`${SITE}/api/labstep/equipment`, {method: 'PUT', headers: pushHeaders(key), body: readFileSync(eqFile, 'utf8')});
    if (!res.ok) throw Error(`Equipment refused (${res.status}) ${(await res.json().catch(() => ({}))).error || ''}`);
    console.log(`Pushed ${(await res.json()).equipment.length} lab instruments from ${eqFile}`);
  }
  console.log(`Done: ${ids.length} protocols on ${SITE}`);
  if (failed.length) { console.error(`${failed.length} not pushed:\n  ${failed.join('\n  ')}`); return 1; }
  return 0;
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === 'push') return push(rest);
  if (cmd === 'import') {
    const id = Number(rest[0]);
    const vi = rest.indexOf('--version');
    const version = vi >= 0 ? Number(rest[vi + 1]) : undefined;
    if (!Number.isSafeInteger(id) || id < 1 || (vi >= 0 && (!Number.isSafeInteger(version) || version < 1))) {
      throw Error('Usage: labstep import <collectionId> [--version <versionId>]');
    }
    const exp = fetchExport(id, version);
    checkLabstepVersion(exp);
    if (exp.collection_id !== id || (version != null && exp.version.id !== version)) {
      throw Error('Labstep did not return the requested collection and version.');
    }
    await verifyLabstepSnapshotHash(exp);
    attachInventory(exp, fetchInventory(id, exp.version.id));
    // Keep observed step times when the pinned version is unchanged.
    const previous = join(dir, `${id}.json`);
    if (existsSync(previous)) {
      const old = JSON.parse(readFileSync(previous, 'utf8'));
      if (old.version?.id === exp.version.id && Object.hasOwn(old, 'observed')) exp.observed = old.observed;
      keepLatestLabstepVersion(old, exp);
    }
    const file = write(exp);
    writeIndex();
    console.log(`Imported ${exp.name} (Labstep ${id}, version ${exp.version.id}, ${exp.steps.length} steps) to ${file}`);
    return 0;
  }
  if (cmd === 'observed') {
    // Real-run step times from lab-mcp protocol-executions (Labstep step ticks),
    // for every version of each imported protocol (issue #59). The pinned
    // version's summary is also written into the snapshot, so it travels with
    // the protocol when uploaded. Optional protocol IDs limit the refresh.
    const file = join(dir, 'observed.json');
    const out = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    const all = readdirSync(dir).filter(f => /^[0-9]+[.]json$/.test(f)).map(f => Number(f.replace('.json', ''))).sort((a, b) => a - b);
    const ids = rest.length ? rest.map(Number) : all;
    const missing = ids.filter(id => !all.includes(id));
    if (missing.length) throw Error(`Labstep ${missing.join(', ')} not imported; run "labstep import <id>" first`);
    const failed = [];
    for (const id of ids) {
      let execs;
      try {
        // A slow Labstep read fails this protocol (its previous summary is kept), not the run.
        execs = JSON.parse(execFileSync('uv', ['run', '--directory', labMcp, 'labstep', '--deadline', '600', 'protocol-executions', String(id)], {encoding: 'utf8', maxBuffer: 200e6, stdio: ['ignore', 'pipe', 'pipe']}));
      } catch (e) {
        failed.push(id);
        console.error(`Labstep ${id}: not refreshed (${String(e.stderr || e.message).trim().split('\n').pop()}); previous summary kept`);
        continue;
      }
      const snapFile = join(dir, `${id}.json`);
      const snap = JSON.parse(readFileSync(snapFile, 'utf8'));
      const versionIds = [...new Set((execs.executions || []).map(r => Number(r.execution?.protocol_version.native_id ?? r.notes?.version_id)))].filter(Number.isInteger).sort((a, b) => a - b);
      const versions = versionIds.map(vid => vid === snap.version.id
        ? summariseExecutions(execs, vid, snap.steps)
        : {...summariseExecutions(execs, vid, []), steps: null});  // other versions: run counts only (step times not computed)
      const pinned = versions.find(v => v.versionId === snap.version.id) || summariseExecutions(execs, snap.version.id, snap.steps);
      const observed = {source: 'lab-mcp protocol-executions', retrievedAt: new Date().toISOString().slice(0, 10), executionsStatus: execs.executions_status, method: execs.method, ...pinned};
      out[id] = {pinnedVersionId: snap.version.id, retrievedAt: observed.retrievedAt, executionsStatus: execs.executions_status, method: execs.method, versions};
      writeFileSync(snapFile, JSON.stringify({...snap, observed}, null, 2) + '\n');
      console.log(`Labstep ${id}: ${pinned.runs} runs of the pinned version, ${pinned.matchedRuns} usable with matching steps; ${Object.keys(pinned.steps).length} steps timed, ${Object.keys(pinned.tooFew).length} with too few plausible runs`);
    }
    writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
    writeFileSync(join(dir, 'observed.js'), `// Generated by scripts/labstep.mjs observed (lab-mcp protocol-executions). Do not edit.\nexport const observed = ${JSON.stringify(out, null, 1)};\n`);
    writeIndex();
    if (failed.length) { console.error(`Not refreshed: ${failed.join(', ')}. Re-run: npm run labstep -- observed ${failed.join(' ')}`); return 1; }
    return 0;
  }
  if (cmd === 'index') { writeIndex(); console.log('Wrote snapshots.js'); return 0; }
  if (cmd === 'check') {
    let stale = 0;
    for (const f of readdirSync(dir).filter(f => /^[0-9]+[.]json$/.test(f)).sort()) {
      const pinned = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      const latest = fetchExport(pinned.collection_id);
      checkLabstepVersion(latest);
      if (latest.collection_id !== pinned.collection_id) throw Error('Labstep did not return the requested collection.');
      await Promise.all([verifyLabstepSnapshotHash(pinned), verifyLabstepSnapshotHash(latest)]);
      const d = diffExports(pinned, latest);
      const parts = [];
      if (d.versionChanged) parts.push(`newer version ${d.to.id} (updated ${String(d.to.updated_at).slice(0, 10)}); pinned ${d.from.id}`);
      if (d.added.length) parts.push(`${d.added.length} step(s) added: ${d.added.map(s => s.title).join('; ')}`);
      if (d.removed.length) parts.push(`${d.removed.length} step(s) removed: ${d.removed.map(s => s.title).join('; ')}`);
      if (d.changed.length) parts.push(`${d.changed.length} step(s) changed: ${d.changed.map(s => s.title).join('; ')}`);
      if (d.draftInProgress) parts.push('an unpublished draft is in progress');
      if (d.versionChanged && !d.contentChanged) parts.push('step text unchanged');
      if (d.versionChanged || d.contentChanged) stale++;
      console.log(`${pinned.name} (Labstep ${pinned.collection_id}): ${parts.length ? parts.join(' | ') : 'up to date'}`);
    }
    console.log(stale ? `${stale} protocol(s) changed since import. Re-import to update.` : 'All imported protocols match Labstep.');
    return 0;
  }
  throw Error('Usage: labstep import <collectionId> [--version <versionId>] | labstep check | labstep push');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).then(code => { process.exitCode = code; }, e => { console.error(e.message); process.exitCode = 1; });
