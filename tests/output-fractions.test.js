import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWorkflowModel, createDecisionRequest, simulate, validateDecisionRequest} from '../lib/work.js';

const snapshot = {schema:'planner/text-import/1', id:'water-output', name:'Water output', version:{id:1, number:1},
  steps:[{position:1, title:'Allocation', text:'Add 45 µl water.\nTransfer 35 µl sample to a fresh tube (or 29 µl main sample + 6 µl control in separate tubes)'}]};
const workflow = {id:'water-output', format:'tube', labware:'tube-1.5', parts:[{source:'text', id:snapshot.id, versionId:1}]};
const choiceId = 'text-water-output-1:output-2';
const model = (name, source = snapshot) => buildWorkflowModel({...workflow, branches:name ? {[choiceId]:name} : {}}, [source]);

test('the destination decision does not select a default even when the input is sufficient', () => {
  const pending = model();
  assert.equal(pending.alternatives[0].chunkId, choiceId);
  assert.equal(pending.alternatives[0].chosen, null);
  assert.equal(pending.chunks[0].actions.length, 1);
  assert.throws(() => validateDecisionRequest(createDecisionRequest(pending), pending), /Choose the dependent/);
});

test('one output and two outputs conserve liquid with their different vessel identities', () => {
  const one = model('One output vessel');
  const oneRun = simulate(one, 1);
  const [oneMove] = oneRun.physical.steps[1].ops;
  assert.equal(oneMove.ulPerWell, 35);
  const two = model('Separate output vessels');
  const outputs = simulate(two, 1).physical.outputs;
  assert.deepEqual(outputs.map(output => [output.label, output.volumeUl]), [['main sample',29], ['control',6]]);
  assert.equal(new Set(outputs.map(output => output.id)).size, 2);
  assert.ok(outputs.every(output => output.from === oneMove.from));
  const twoRun = simulate(two, 1);
  const physical = twoRun.physical.steps[1];
  assert.equal(physical.after.ul, 10);
  const operatorMinutes = run => run.timeline.find(row => row.actionId === physical.actionId).minutes;
  assert.equal(operatorMinutes(twoRun).lo, 2 * operatorMinutes(oneRun).lo);
  assert.equal(operatorMinutes(twoRun).hi, 2 * operatorMinutes(oneRun).hi);
  assert.ok(physical.ops.every(op => !op.robot));
});

test('a split outcome cannot silently feed later work', () => {
  const followOn = {...snapshot, steps:[...snapshot.steps, {position:2, title:'Later', text:'Mix by pipetting.'}]};
  const split = model('Separate output vessels', followOn);
  assert.ok(split.unresolvedOutput);
  assert.throws(() => validateDecisionRequest(createDecisionRequest(split), split), /which vessel enters later work/);
  assert.equal(model('One output vessel', followOn).unresolvedOutput, undefined);
});

test('an insufficient measured input cannot create either output', () => {
  const short = {...snapshot, steps:[{...snapshot.steps[0], text:snapshot.steps[0].text.replace('45 µl', '34 µl')}]};
  for (const alternative of ['One output vessel', 'Separate output vessels']) {
    const ledger = simulate(model(alternative, short), 1).physical;
    assert.equal(ledger.outputs, undefined);
    assert.equal(ledger.steps[1].after.ul, 34);
    assert.equal(ledger.steps[1].ops[0].ulPerWell, null);
    assert.ok(ledger.violations.some(issue => issue.kind === 'remove-short' && issue.severity === 'impossible'));
  }
});

test('a definite terminal transfer has a distinct named vessel and preserves source residual', () => {
  const raw = {...snapshot, steps:[{position:1,title:'Water handoff',text:'Transfer 35 µl liquid into a fresh PCR tube.'}]};
  const pin = workflow.parts[0];
  const spec = {...workflow, block:{...pin, from:1, through:1, input:{labware:'tube-1.5', volumeUl:45, evidence:'Inert input'}}};
  const m = buildWorkflowModel(spec,[raw]);
  const [action] = m.chunks[0].actions;
  assert.deepEqual(action.outputAllocation,[{label:'liquid',vessel:'PCR tube',volumeUl:35}]);
  const result = simulate(m,1);
  const [flow] = result.physical.steps;
  assert.equal(flow.before.ul,45);
  assert.equal(flow.after.ul,10);
  const [output] = result.physical.outputs;
  assert.equal(output.vessel,'PCR tube');
  assert.equal(output.volumeUl,35);
  assert.notEqual(output.id,output.from);
  assert.equal(flow.ops[0].robot,false);
  assert.equal(flow.ops[0].to,output.id);
  const short = buildWorkflowModel({...spec, block:{...spec.block,input:{...spec.block.input,volumeUl:33}}},[raw]);
  assert.equal(simulate(short,1).physical.outputs,undefined);
  const longer = {...raw,steps:[...raw.steps,{position:2,title:'Later manipulation',text:'Mix by pipetting.'}]};
  const joined = buildWorkflowModel({...spec,block:{...spec.block,through:2}},[longer]);
  assert.equal(joined.chunks[0].actions[0].outputAllocation,undefined);
});

test('a destination written as into a fresh vessel still requires a choice', () => {
  const raw = {...snapshot, steps:[{...snapshot.steps[0], text:snapshot.steps[0].text.replace('to a fresh tube','into a fresh tube')}]};
  assert.equal(model(null,raw).alternatives[0].chosen,null);
  assert.throws(() => validateDecisionRequest(createDecisionRequest(model(null,raw)),model(null,raw)), /Choose the dependent/);
});
