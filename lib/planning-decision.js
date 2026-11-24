import {evidenceFor, explainDifference} from './work.js';

const priceIds = cost => [...new Set(cost.lines.flatMap(line => line.basis.flatMap(b => b.evidence.map(e => e.id))))].sort();
const evidence = f => f.source ? {title: f.source.title ?? null, url: f.source.url ?? null} : null;

function configuration(c) {
  if (!c) return null;
  return {id: c.id, installation_id: c.installation.id, model_id: c.config.id,
    route: c.route, head_id: c.pipettes?.chosen.id ?? null, eligibility: 'in_scope',
    metrics: c.metrics, cost: {new_gbp: c.cost.new, complete: c.cost.complete, missing: c.cost.missing},
    evidence_ids: {prices: priceIds(c.cost), facts: c.facts.map(f => f.id), literature: evidenceFor(c.config.id).map(e => e.url)},
    facts: c.facts.map(f => ({id: f.id, type: f.type, status: f.status, source: evidence(f)})),
    physical_issues: c.physicalIssues, ...(c.tipRuntime ? {tip_runtime: c.tipRuntime} : {})};
}

export function decisionQuestions(d) {
  return d.questions.map(q => ({id: q.fact.id, type: q.fact.type, question: q.fact.question, owner: q.fact.owner,
    source: evidence(q.fact), if_yes: q.ifYes.id, if_no: q.ifNo.candidate?.id ?? null, weight: q.weight,
    hands_on_delta: q.ifNo.activeDelta ?? null, visit_delta: q.ifNo.visitDelta ?? null}));
}

// The normal Decide view and the Worker serialize the same bounded view of
// the same result. There are no scoring rules or eligibility decisions here.
export function planningDecision(d) {
  return {schema: 'planner/assessment-result/1', request: d.request, model_version: d.modelVersion,
    ...(d.model.block ? {block: d.model.block} : {}),
    source_versions: d.model.sources, source_actions: d.model.chunks.flatMap(c => c.actions.map(a => ({
      id: a.id, operation: a.kind, source_id: c.source.id, version_id: c.source.versionId,
      step_guid: c.source.stepGuid, step_position: c.source.position,
      ...(a.removalUl !== undefined ? {stated_removal_uL:a.removalUl} : {}),
      ...(a.fraction ? {stated_fraction:a.fraction} : {}),
      ...(a.source?.bodyLine != null ? {body_line:a.source.bodyLine} : {}),
      ...(a.source?.contextBodyLine != null ? {body_context_line:a.source.contextBodyLine} : {}),
      ...(a.outputAllocation ? {output_allocation:a.outputAllocation} : {})}))),
    missing_readings: d.model.review, labware: d.labware, labware_warnings: d.labwareWarnings,
    baseline: d.baseline, baseline_reagent_cost: d.baselineReagents.cost, physical_issues: d.physicalIssues,
    recommended: configuration(d.recommended), alternative: configuration(d.alternative), tie: d.tie,
    configurations: d.shortlist.map(configuration), questions: decisionQuestions(d), search: d.search,
    families: d.families.map(f => ({model_id: f.config.id, evaluated: f.evaluated, in_scope: f.inScope, reason: f.excludedBecause})),
    ...(d.benchRoutes ? {bench_routes: d.benchRoutes, mechanisms: d.mechanisms} : {}),
    execution_allowed: false};
}

export function compareConfigurations(d, [leftId, rightId]) {
  const options = [d.recommended, d.alternative, ...d.shortlist, ...d.questions.map(q => q.ifNo.candidate)];
  const left = options.find(c => c?.id === leftId), right = options.find(c => c?.id === rightId);
  if (!left || !right) return null;
  const diff = explainDifference(left, right);
  return {schema: 'planner/configuration-difference/1', left: configuration(left), right: configuration(right),
    only_left_actions: diff.onlyA.map(s => s.actionId), only_right_actions: diff.onlyB.map(s => s.actionId),
    only_left_minutes: diff.onlyAMinutes, only_right_minutes: diff.onlyBMinutes,
    hands_on_delta: diff.activeDelta, visit_delta: diff.visitDelta, unchecked_fact_delta: diff.factDelta};
}

const handoffOf = row => row.move ?? row.transport;
const endpoint = (leg, side) => ({id: leg[side + 'Id'], label: leg[side]});

function registryTransportReview(rows, labware) {
  if (rows == null) return null;
  const links = new Map();
  for (const row of rows) {
    const leg = row.initialTransport ?? handoffOf(row);
    if (!leg) continue;
    const phase = row.initialTransport ? 'initial_loading' : 'handoff';
    const key = JSON.stringify([leg.fromId, leg.toId, leg.by, phase]);
    if (!links.has(key)) links.set(key, {
      from:endpoint(leg, 'from'), to:endpoint(leg, 'to'), scope:leg.scope, phase, modeled_mover:leg.by,
      occurrences:0, action_ids:[], planned_operator_minutes:phase === 'initial_loading' || leg.by !== 'person' ? null : {lo:0, hi:0},
      timing_basis:phase === 'initial_loading' ? 'included_in_setup' : 'planning_estimate',
      reach_status:'unverified', estimated_savings_minutes:null,
    });
    const link = links.get(key);
    link.occurrences += leg.count ?? 1;
    if (row.actionId && !link.action_ids.includes(row.actionId)) link.action_ids.push(row.actionId);
    if (link.planned_operator_minutes && row.minutes) {
      link.planned_operator_minutes.lo += row.minutes.lo;
      link.planned_operator_minutes.hi += row.minutes.hi;
    } else link.planned_operator_minutes = null;
  }
  return {labware:labware?.id ?? null, labware_assumed:labware?.assumed ?? null,
    modeled_endpoint_basis:'catalogue_scenario', directed_links:[...links.values()]};
}

export function registryWorkMap(decision) {
  const actions = new Map(decision.model.chunks.flatMap(chunk => chunk.actions.map(action => [action.id, action])));
  const map = rows => rows.filter(row => !row.overhead || handoffOf(row)).map(row => ({
    action_id: row.actionId ?? null, label: row.label,
    assignment: row.type === 'A' ? 'automated_candidate' : row.type === 'H' ? 'operator'
      : row.type === 'D' ? 'desk' : 'wait',
    device: row.provider ?? null, module: row.module ?? null, head: row.tips?.head ?? null,
    tip_uL: row.tips?.size ?? null, minutes: row.minutes ?? null,
    handoff: handoffOf(row) ? {from:handoffOf(row).from, to:handoffOf(row).to, by:handoffOf(row).by} : null,
    reason: row.reason ?? null, fraction: actions.get(row.actionId)?.fraction ?? null, outputs: actions.get(row.actionId)?.outputAllocation ?? null,
    balance: row.physical ? {before_uL:row.physical.before.unknown ? null : row.physical.before.ul,
      after_uL:row.physical.after.unknown || row.physical.ops.some(op => op.handReason === 'source-volume')
        ? null : row.physical.after.ul,
      removals_uL:row.physical.ops.filter(op => op.kind === 'remove').map(op => op.ulPerWell),
      output_movements:row.physical.ops.filter(op => op.kind === 'output' && op.to != null)
        .map(op => ({source_id:op.from, destination_id:op.to, volume_uL:op.ulPerWell}))} : null,
  }));
  const proposed = decision.recommended?.timeline ?? null;
  return {baseline:map(decision.baselineTimeline), proposed:proposed ? map(proposed) : null,
    transport_review:registryTransportReview(proposed, decision.model.labware)};
}
