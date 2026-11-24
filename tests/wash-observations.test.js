import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotFromText} from '../lib/snapshots.js';
import {buildWorkflowModel, variantPlan} from '../lib/work.js';
import {washComparison} from '../lib/wash-comparison.js';
import {summarizeWashObservations, washObservationTemplate} from '../lib/wash-observations.js';

const raw = snapshotFromText('Inert wash','1. Wash\nSpin down for 2 min.\nAdd 10 uL water.');
const pin = {source:'text',id:raw.id,versionId:raw.version.id};
const proposal = {id:'review',substitution:'spin-as-magnetic-capture',targets:[{...pin,position:1,bodyLine:1}],
  washComparison:{retainedMaterial:'Inert particles'}};
const model = buildWorkflowModel({id:'wash',format:'tube',parts:[pin]},[raw]);
const comparison = washComparison(model,variantPlan(model,proposal),proposal);

function observed() {
  const template = washObservationTemplate(comparison);
  const run = (ref, minutes, passed, failed, cost) => ({...template.pairs[0].manual, evidence_ref:ref,
    outputs_attempted:10, outputs_passing:passed, failed,
    operator_minutes:Object.fromEntries(Object.keys(template.pairs[0].manual.operator_minutes).map(key=>[key,key==='active_processing' ? minutes : 0])),
    elapsed_minutes:minutes+5, cost_gbp:cost});
  return {...template,output_unit:'test output',qc_ref:'shared fixture QC',candidate:{method:'filter',execution:'machine-assisted'},
    pairs:[
      {id:'a',matching_ref:'first matched set',inputs_per_run:10,manual:run('am',30,10,false,3),candidate:run('ac',20,8,false,2)},
      {id:'b',matching_ref:'second matched set',inputs_per_run:10,manual:run('bm',20,5,false,4),candidate:run('bc',5,0,true,null)},
    ]};
}

test('operator effort includes a failed run and normalizes by all QC-passing outputs', () => {
  const result = summarizeWashObservations(comparison,observed());
  assert.equal(result.basis,'observed');
  assert.equal(result.matched_pairs,2);
  assert.equal(result.inputs_per_run,10);
  assert.equal(result.manual.outputs_attempted,20);
  assert.equal(result.manual.outputs_passing,15);
  assert.equal(result.candidate.outputs_attempted,20);
  assert.equal(result.candidate.outputs_passing,8);
  assert.equal(result.candidate.failed_runs,1);
  assert.equal(result.candidate.operator_minutes,25);
  assert.equal(result.candidate.operator_minutes_per_passing_output,25/8);
  assert.equal(result.delta_minutes_per_passing_output,25/8-50/15);
  assert.deepEqual(result.paired_delta,{count:1,median:-0.5,min:-0.5,max:-0.5});
  assert.equal(result.candidate.cost_gbp,null);
  assert.equal(result.manual.cost_gbp_per_passing_output,7/15);
  assert.ok(comparison.routes.every(route=>route.metrics===null && !route.executionAllowed));
});

test('missing labour and zero passing outputs remain explicit', () => {
  const input = observed();
  input.pairs[0].candidate.operator_minutes.setup=null;
  input.pairs[0].candidate.outputs_passing=0;
  const result = summarizeWashObservations(comparison,input);
  assert.equal(result.candidate.runs_with_operator_minutes,1);
  assert.equal(result.candidate.outputs_passing,0);
  assert.equal(result.candidate.operator_minutes,null);
  assert.equal(result.candidate.operator_minutes_per_passing_output,null);
  assert.equal(result.delta_minutes_per_passing_output,null);
  assert.equal(result.paired_delta,null);
});

test('unmatched source context, duplicate runs and contradictory counts are refused', () => {
  const changed = structuredClone(observed());
  changed.comparison.context.planningWorkload++;
  assert.throws(() => summarizeWashObservations(comparison,changed),/planning workload/);
  const duplicate = observed();
  duplicate.pairs[0].candidate.evidence_ref=duplicate.pairs[0].manual.evidence_ref;
  assert.throws(() => summarizeWashObservations(comparison,duplicate),/reference repeats/);
  const impossible = observed();
  impossible.pairs[0].candidate.outputs_passing=11;
  assert.throws(() => summarizeWashObservations(comparison,impossible),/candidate run counts/);
  const differentWorkload = observed();
  differentWorkload.pairs[1].inputs_per_run++;
  assert.throws(() => summarizeWashObservations(comparison,differentWorkload),/same input count/);
  const assumed = observed();
  assumed.basis='modeled';
  assert.throws(() => summarizeWashObservations(comparison,assumed),/observed pairs/);
});
