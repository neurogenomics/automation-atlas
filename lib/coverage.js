// Coverage report for one workflow on one or more setups (#373), offline: no
// sign-in, no network. Built on lib/outline-assessment.js; generic, names no
// protocol, lab or instrument. By default the report carries no protocol
// text: operation identifiers, counts, ids and pointers only. showSteps adds
// step labels, option names, block labels and question text and sets
// contains_protocol_text.

import {handlers, optionKey, protocolDecisionBlocker, setupOptions} from './work.js';
import {workflowBlocks, assessBlocks} from './outline-assessment.js';
import {normaliseSnapshot} from './snapshots.js';
import {redact} from './outline.js';

const sum = o => Object.values(o || {}).reduce((a, n) => a + n, 0);
const addRange = (t, r) => r ? {lo: t.lo + r.lo, hi: t.hi + r.hi} : t;
const branchFlag = (chunkId, n) => `--branch '${chunkId}=#${n}'`;

// A Planner installation record ({id, modelId, options: {<optionKey>: yes | no | unsure}})
// becomes a setup with the modules and devices answered yes. Unanswered and
// unsure options are questions for the equipment owner.
export function setupFromInstallation(inst, route = 'connected', pipettes = null) {
  const handler = handlers.find(h => h.id === inst?.modelId);
  if (!handler) throw redact(Error(`Installation ${inst?.id}: unknown liquid handler model ${inst?.modelId}`), `The installation names a liquid handler model that is not one of the ${handlers.length} catalogued models.`);
  const opts = setupOptions(handler.id, route), answers = inst.options || {};
  const moduleKey = m => optionKey(handler, m.name, m.ops[0]);
  const answer = key => answers[key] ?? 'unanswered';
  return {spec: {id: inst.id, name: inst.name || inst.id, handler: handler.id, route, ...(pipettes ? {pipettes} : {}),
      modules: opts.modules.filter(m => answer(moduleKey(m)) === 'yes').map(m => m.name),
      devices: opts.devices.filter(d => answer(d.op) === 'yes').map(d => d.op)},
    unsure: [...opts.modules.filter(m => ['unsure', 'unanswered'].includes(answer(moduleKey(m)))).map(m => ({kind: 'module', name: m.name, key: moduleKey(m), answer: answer(moduleKey(m))})),
      ...opts.devices.filter(d => ['unsure', 'unanswered'].includes(answer(d.op))).map(d => ({kind: 'device', name: d.op, key: d.op, answer: answer(d.op)}))]};
}

const norm = v => String(v).toLowerCase().replace(/[^a-z0-9]/g, '');
function validChoices(alternatives, show) {
  if (!alternatives.length) return 'none';
  return alternatives.map(a => `${a.chunkId}=#1..#${a.options.length}${show ? ` (${a.options.map((o, i) => `#${i + 1} ${o.name}`).join('; ')})` : ''}`).join(', ');
}
// Every branch key must name a choice the parser lists and every value one of
// its options, by number or name; '*' applies a name to every choice offering it.
// A rejected key or value may itself be protocol text, so it is echoed only
// with showSteps; by default the error names the entry and the valid choices.
function checkBranches(branches, alternatives, show) {
  const entries = Object.entries(branches);
  const fail = (k, why) => {
    const [key, value] = entries[k];
    throw Error(`--branch entry ${k + 1}: ${why}${show ? ` (given ${key}=${value})` : ''}. Valid choices: ${validChoices(alternatives, show)}.`);
  };
  const out = {};
  entries.forEach(([key, value], k) => {
    if (typeof value !== 'string' || !value) fail(k, 'the option must be a number (#n) or an option name');
    const m = value.match(/^#(\d+)$/);
    if (key === '*') {
      if (m) fail(k, "'*' takes an option name, not a number");
      if (!alternatives.some(a => a.options.some(o => norm(o.name) === norm(value)))) fail(k, "option not recognised for any choice under '*'");
      out[key] = value; return;
    }
    const alt = alternatives.find(a => a.chunkId === key);
    if (!alt) fail(k, 'choice id not recognised');
    const option = m ? alt.options[Number(m[1]) - 1] : alt.options.find(o => norm(o.name) === norm(value));
    if (!option) fail(k, m ? `option #${Number(m[1])} not available for choice ${alt.chunkId} (it has ${alt.options.length})` : `option not recognised for choice ${alt.chunkId}`);
    out[key] = option.name;
  });
  return out;
}

const alternativesOf = entries => {
  const seen = new Map();
  for (const e of entries) for (const a of e.model?.alternatives || []) if (!seen.has(a.chunkId)) seen.set(a.chunkId, a);
  return [...seen.values()];
};

// Build the assessed units, applying branch choices; never choose silently.
// Choices can reveal further choices, so branches are checked against the
// alternatives of the model built with the choices already resolved.
export function prepare({workflow, snapshots, outlines = [], workload, branches = {}, assumeInUse = false, showSteps = false}) {
  const build = b => workflowBlocks({...workflow, branches: b}, snapshots, outlines, workload);
  let chosen = {}, entries = build(chosen);
  for (let pass = 0; pass < 5; pass++) {
    const alts = alternativesOf(entries);
    const known = Object.fromEntries(Object.entries(branches).filter(([k]) => k === '*' || alts.some(a => a.chunkId === k)));
    const next = checkBranches(known, alts, showSteps);
    if (JSON.stringify(next) === JSON.stringify(chosen)) break;
    chosen = next; entries = build(chosen);
  }
  chosen = checkBranches(branches, alternativesOf(entries), showSteps);
  const assumed = [];
  if (assumeInUse) {
    for (const a of alternativesOf(entries)) {
      if (!a.requiresChoice || a.chosen) continue;
      const inUse = a.options.map((o, i) => ({o, i})).filter(x => x.o.inUse);
      if (inUse.length === 1) assumed.push({chunkId: a.chunkId, option: inUse[0].i + 1, name: inUse[0].o.name, basis: 'marked in use in the protocol', flag: branchFlag(a.chunkId, inUse[0].i + 1)});
    }
    if (assumed.length) { chosen = {...chosen, ...Object.fromEntries(assumed.map(a => [a.chunkId, a.name]))}; entries = build(chosen); }
  }
  return {entries, branches: chosen, assumed};
}

function choices(entries, branches, assumed, show) {
  const name = o => show ? {name: o.name} : {};
  const index = (a, nm) => a.options.findIndex(o => o.name === nm) + 1 || null;
  const alts = alternativesOf(entries);
  return {
    open: alts.filter(a => a.requiresChoice && !a.chosen).map(a => ({chunkId: a.chunkId, choiceMade: false,
      markedInUse: a.options.findIndex(o => o.inUse) + 1 || null,
      options: a.options.map((o, i) => ({option: i + 1, flag: branchFlag(a.chunkId, i + 1), ...name(o)}))})),
    made: alts.filter(a => a.chosen && String(a.basis).startsWith('workflow') && !assumed.some(x => x.chunkId === a.chunkId))
      .map(a => ({chunkId: a.chunkId, option: index(a, a.chosen), flag: branchFlag(a.chunkId, index(a, a.chosen)), ...(show ? {name: a.chosen} : {})})),
    assumed: assumed.map(({name: nm, ...a}) => ({...a, ...(show ? {name: nm} : {})})),
    // The parser counted one alternative without a workflow choice (first listed, or marked in use).
    defaulted: alts.filter(a => !a.requiresChoice && a.chosen && !String(a.basis).startsWith('workflow'))
      .map(a => ({chunkId: a.chunkId, counted: index(a, a.chosen), basis: a.basis, flags: a.options.map((o, i) => branchFlag(a.chunkId, i + 1))})),
  };
}

const strip = (row, show) => {
  if (show) return row;
  const {steps, facts, ...rest} = row;
  return rest;
};

// Which blocks a variation of a setup newly runs and how many more steps it
// automates, counting assessed blocks only. A variation the assessment
// refuses (it does not fit on the deck, or cannot be assessed) gains nothing
// and is reported with the refusal instead.
const REFUSED = /^(?:Does not fit on the deck|Not assessed)/;
function gains(base, other, assessed) {
  const refused = other.unassessed ? other.unassessed : other.blocks.find(o => assessed.has(o.block) && !o.runs && REFUSED.test(o.why || ''))?.why;
  if (refused) return {refused};
  const blocks = [];
  let newlyRun = 0, steps = 0;
  for (const b of base.blocks) {
    if (!assessed.has(b.block)) continue;
    const o = other.blocks.find(x => x.block === b.block);
    const d = sum(o.automated) - sum(b.automated);
    if (!b.runs && o.runs) newlyRun++;
    if (d > 0 || (!b.runs && o.runs)) { blocks.push(b.block); steps += Math.max(d, 0); }
  }
  return {blocks, blocksNewlyRun: newlyRun, stepsGained: steps};
}

export function coverage({workflow, snapshots, outlines = [], setups, workload, branches = {}, assumeInUse = false, showSteps = false, methodChanges = false, unsure = {}}) {
  const show = showSteps === true;
  const prep = prepare({workflow, snapshots, outlines, workload, branches, assumeInUse, showSteps: show});
  const {entries} = prep;
  // Every reason a block has no totals: missing or conflicting outline facts,
  // and the protocol's own review (choices, QC gates, washes, boundaries).
  const reasons = e => {
    const blocker = e.model ? protocolDecisionBlocker(e.model) : null;
    return [...e.missing, ...(blocker ? [{fact: null, need: 'protocol review', detail: blocker}] : []),
      ...(!e.model && !e.missing.length ? [{fact: null, need: 'a model of this block'}] : [])];
  };
  const why = new Map(entries.map(e => [e.id, reasons(e)]));
  const assessedIds = new Set(entries.filter(e => !why.get(e.id).length).map(e => e.id));
  const withheld = entries.filter(e => !assessedIds.has(e.id));
  const brief = m => ({fact: m.fact, need: m.need, ...(m.need === 'protocol review' ? {detail: m.detail} : {})});
  const cannotSay = withheld.map(e => ({block: e.id, until: why.get(e.id).map(brief)}));
  const missingFacts = [...new Map(withheld.flatMap(e => why.get(e.id).map(brief)).map(m => [JSON.stringify(m), m])).values()];
  const provisional = new Map(entries.map(e => [e.id, {provisional: e.provisional === true, provisionalBecause: e.provisionalBecause || []}]));
  const anyProvisional = [...assessedIds].some(id => provisional.get(id).provisional);
  const drafted = [...new Set(entries.flatMap(e => (e.rests?.facts || []).filter(f => f.status === 'agent-drafted').map(f => f.fact)))];
  const rows = assessBlocks(entries, setups, {methodChanges});
  const out = setups.map((spec, k) => {
    const row = rows[k];
    // Hands-on by hand and with the setup over the blocks it was assessed on.
    const tot = {byHand: {lo: 0, hi: 0}, withSetup: {lo: 0, hi: 0}, saved: {lo: 0, hi: 0}};
    for (const b of row.blocks) if (b.handsOn) {
      tot.byHand = addRange(tot.byHand, b.handsOn.byHand);
      if (b.runs) { tot.withSetup = addRange(tot.withSetup, b.handsOn.withSetup); tot.saved = addRange(tot.saved, b.handsOn.saved); }
      else tot.withSetup = addRange(tot.withSetup, b.handsOn.byHand);
    }
    const opts = setupOptions(spec.handler, spec.route);
    const variants = [
      ...opts.modules.filter(m => !(spec.modules || []).includes(m.name)).map(m => ({kind: 'module', name: m.name, spec: {...spec, modules: [...(spec.modules || []), m.name]}})),
      ...opts.devices.filter(d => !(spec.devices || []).includes(d.op)).map(d => ({kind: 'device', name: d.op, spec: {...spec, devices: [...(spec.devices || []), d.op]}})),
    ];
    const tried = row.unassessed || !assessedIds.size ? [] : variants.map(v => {
      const [other] = assessBlocks(entries, [v.spec], {methodChanges});
      return {kind: v.kind, name: v.name, ...gains(row, other, assessedIds)};
    });
    const doesNotFit = tried.filter(t => t.refused).map(t => ({kind: t.kind, name: t.name, reason: t.refused}));
    const unlocks = tried.filter(t => !t.refused).map(t => ({...t, cannotSay})).sort((a, b) => b.blocksNewlyRun - a.blocksNewlyRun || b.stepsGained - a.stepsGained || a.name.localeCompare(b.name));
    // Questions for the equipment owner, ranked by the assessed blocks and steps each answer bears on.
    const qs = new Map();
    for (const b of row.blocks) {
      if (!assessedIds.has(b.block)) continue;
      for (const f of b.facts || []) {
        if (!qs.has(f.id)) qs.set(f.id, {id: f.id, type: f.type, owner: f.owner, status: f.status, blocks: 0, steps: 0, ...(show ? {question: f.question} : {})});
        const q = qs.get(f.id); q.blocks++; q.steps += sum(b.automated);
      }
    }
    for (const u of unsure[spec.id] || []) {
      const g = unlocks.find(x => x.kind === u.kind && x.name === u.name);  // nothing when it does not fit
      qs.set(`have:${u.key}`, {id: `have:${u.key}`, type: `installed-${u.kind}`, owner: 'equipment owner', status: u.answer, blocks: g?.blocksNewlyRun ?? 0, steps: g?.stepsGained ?? 0,
        ...(show ? {question: `Is the ${u.name} ${u.kind === 'module' ? 'fitted' : 'connected'}?`} : {})});
    }
    const ownerQuestions = [...qs.values()].sort((a, b) => b.blocks - a.blocks || b.steps - a.steps || a.id.localeCompare(b.id));
    return {setup: spec.id, handler: spec.handler, route: spec.route, modules: spec.modules || [], devices: spec.devices || [], unassessed: row.unassessed,
      totals: {blocks: row.blocks.length, blocksAssessed: assessedIds.size, blocksRun: row.blocks.filter(b => b.runs).length,
        handsOn: assessedIds.size ? tot : null, complete: withheld.length === 0, provisional: anyProvisional,
        automatedSteps: row.blocks.reduce((a, b) => a + sum(b.automated), 0), manualSteps: row.blocks.reduce((a, b) => a + sum(b.manual), 0)},
      blocks: row.blocks.map(b => ({...strip(b, show), ...provisional.get(b.block)})),
      unlocks, doesNotFit, cannotSay, ownerQuestions};
  });
  const sources = snapshots.map(normaliseSnapshot).filter(s => workflow.parts.some(p => String(p.id) === String(s.id)))
    .map(s => ({collection: s.id, versionId: s.version.id, versionNumber: s.version.number, exportHash: s.content_hash}));
  return {
    schema: 'planner/coverage/1', contains_protocol_text: show,
    workflow: {collections: workflow.parts.map(p => p.id), sources, workload, format: workflow.format, labware: workflow.labware ?? null, outlines: [...new Map(entries.filter(e => e.outline).map(e => [e.outline.record, e.rests.binding])).values()]},
    choices: choices(entries, prep.branches, prep.assumed, show),
    summary: {blocks: entries.length, blocksAssessed: assessedIds.size, blocksWithheld: withheld.length, blocksProvisional: [...assessedIds].filter(id => provisional.get(id).provisional).length, missingFacts,
      agentDrafted: {count: drafted.length, ...(show ? {facts: drafted} : {})}},
    // Steps no outline block covers; outline reasons are free text, shown with showSteps.
    uncovered_steps: (entries.uncoveredSteps || []).map(({reason, ...u}) => ({...u, reasonGiven: reason != null, ...(show ? {reason} : {})})),
    unplaced_unresolved: entries.unplacedUnresolved || [],
    // Outline blocks are taken in source order; true when an outline listed them otherwise.
    blocks_reordered: entries.blocksReordered === true,
    blocks: entries.map(e => ({id: e.id, outline: e.outline, source: e.source ?? null, workload: e.workload, withheld: why.get(e.id).length ? why.get(e.id) : null,
      boundaries: e.boundaries || [], ...provisional.get(e.id), conflicts: e.conflicts, rests: e.rests, ...(show && e.label ? {label: e.label} : {})})),
    setups: out,
    caveat: 'Hands-on minutes are planning estimates per operation (content/operations.json). Withheld blocks have no totals; totals cover assessed blocks only. Outline statuses and confirmations are attributed claims, not verified here.',
  };
}
