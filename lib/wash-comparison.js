// Structural comparison for a reviewed source scope. Qualification and
// scheduling are separate from recording which routes merit assessment.
import {canonicalJson} from './source-provenance.js';
import {protocolDecisionBlocker} from './work.js';

const methods = [
  {id:'as-written', label:'As written', operation:'Source separation',
    evidence:['Retained material and liquid fractions at each transfer', 'Vessel identities at each pool and redistribution']},
  {id:'magnetic', label:'Magnetic retention', operation:'Magnetic capture and liquid exchange',
    evidence:['Fraction eligible for capture', 'Per-exchange and cumulative retention', 'Washout and recovery into the next stage',
      'Exact vessel, magnetic station and liquid-handling fit', 'Source actions replaced or still required']},
  {id:'filter', label:'Filter retention', operation:'Filter retention and liquid passage',
    evidence:['Retained and passing fractions for the declared material', 'Per-exchange and cumulative retention',
      'Washout and recovery into the next stage', 'Exact filter vessel, drive and collection station fit',
      'Source actions replaced or still required']},
];
const execution = [
  {id:'manual', label:'Manual', evidence:['Matched operator time and interventions']},
  {id:'machine-assisted', label:'Machine-assisted', evidence:['Confirmed device access and station handoffs', 'Matched timing and exception recovery']},
];

export function washComparison(model, plan, variant) {
  if (!plan?.reviewOnly || plan.from !== 'centrifugation' || !variant.washComparison) return null;
  const name = variant.washComparison.retainedMaterial;
  const material = typeof name === 'string' ? name.trim() : '';
  const retainedMaterial = material.length && material.length <= 160 ? material : null;
  const scopeReady = !!retainedMaterial && plan.changed.length > 0 && plan.targetIssues.length === 0;
  const actions = new Map(model.chunks.flatMap(chunk => chunk.actions.map(action => [action.id, action])));
  const sourceActions = plan.changed.map(({actionId, label, ...source}) => ({
    ...source, actionId, operation: plan.from, statedMinutes: actions.get(actionId)?.wait ?? null,
  }));
  const poolBoundaries = (model.materialBoundaries || []).map(({chunkId, bodyLine, operation, donor, recipient, conditional}) => ({
    chunkId, bodyLine, operation, donor, recipient, conditional,
  }));
  const sourceKey = ({source, id, versionId}) => JSON.stringify([source, id, versionId]);
  const hashes = new Map(model.chunks.map(({source}) => [sourceKey(source), source.contentHash]));
  const context = {
    sources:model.sources.map(({source, id, versionId}) => ({
      source, id, versionId, contentHash:hashes.get(sourceKey({source, id, versionId})) ?? null,
    })),
    branches:model.alternatives.map(({chunkId, chosen, basis}) => ({chunkId, chosen, basis})),
    labware:model.labware ? {id:model.labware.id, assumed:model.labware.assumed} : null,
    planningWorkload:model.defaultWorkload,
    block:model.block ?? null,
    assessmentBlocker:protocolDecisionBlocker(model),
  };
  const required = [
    ...(!retainedMaterial ? ['Declare the retained material'] : []),
    ...(plan.targetIssues.length || !sourceActions.length ? ['Resolve the exact source action targets'] : []),
    ...(poolBoundaries.length ? ['Verify the existing pooling and redistribution map'] : []),
  ];
  const routes = methods.flatMap(method => execution.map(mode => ({
    method:method.id, methodLabel:method.label, execution:mode.id, executionLabel:mode.label,
    operation:method.operation, status:scopeReady ? 'evidence-pending' : 'scope-pending',
    missingEvidence:[...required, ...method.evidence, ...mode.evidence],
    metrics:null, executionAllowed:false,
  })));
  return {schema:'planner/wash-comparison/1', workflowId:model.protocolId, proposalId:plan.id, retainedMaterial, scopeReady, context,
    sourceTargets:variant.targets, sourceActions, keptActionIds:plan.kept.map(action => action.actionId),
    targetIssues:plan.targetIssues, poolBoundaries, routes};
}

export function verifyWashComparison(saved, current) {
  if (!current || saved?.schema !== current.schema || !saved.context) return {matches:false, reason:'Choose a saved wash comparison with source and workflow context.'};
  if (saved.workflowId !== current.workflowId || saved.proposalId !== current.proposalId) return {matches:false, reason:'The file belongs to a different workflow or proposal.'};
  if (canonicalJson(saved.context) !== canonicalJson(current.context)) {
    const labels = {sources:'protocol sources', branches:'chosen branches', labware:'labware', planningWorkload:'planning workload',
      block:'input block', assessmentBlocker:'assessment blocker'};
    const changed = Object.entries(labels).filter(([key]) => canonicalJson(saved.context[key]) !== canonicalJson(current.context[key]))
      .map(([, label]) => label);
    return {matches:false, reason:`Workflow context changed · ${changed.join(', ') || 'saved context'}. Review this comparison again.`};
  }
  if (canonicalJson(saved) !== canonicalJson(current)) return {matches:false, reason:'The proposed work, material mapping or route evidence changed. Review this comparison again.'};
  return {matches:true};
}
