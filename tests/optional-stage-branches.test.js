import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWorkflowModel, createDecisionRequest, validateDecisionRequest} from '../lib/work.js';

const snapshot = {schema: 'planner/text-import/1', id: 'conditional', version: {id: 1}, steps: [{
  position: 1, title: 'Handling', text: [
    'Handling',
    'Optional: Preliminary rinse',
    'Add 13 µl of water.',
    'Incubate for 4 minutes.',
    'Fluid exchange (shared)',
    'If preliminary rinse was performed, add 17 µl of buffer.',
    'For fluid exchange only, add 29 µl of buffer.',
    'Transfer 12 µl to a new tube.',
  ].join('\n'),
}]};
const workflow = {id: 'conditional', parts: [{source: 'text', id: snapshot.id}]};
const step = 'text-conditional-1';

for (const [choice, volumes] of [
  ['Skip Preliminary rinse', [29, 12]],
  ['Include Preliminary rinse', [13, 17, 12]],
]) test(choice + ' applies exactly one downstream arm', () => {
  const model = buildWorkflowModel({...workflow, branches: {[step]: choice}}, [snapshot]);
  assert.equal(model.alternatives[0]?.chosen, choice);
  assert.deepEqual(model.chunks[0].actions.map(a => a.volumeUl).filter(v => v != null), volumes);
  assert.equal(model.lines.filter(line => line.type === 'alternative').some(line => /fluid exchange only|was performed/.test(line.line)), true);
});

test('a missing branch choice is reported as provisional', () => {
  const model = buildWorkflowModel(workflow, [snapshot]);
  assert.equal(model.alternatives[0]?.basis, 'question');
  assert.equal(model.alternatives[0].chosen, null);
  assert.deepEqual(model.chunks[0].actions.map(a => a.volumeUl), [12]);
  assert.throws(() => validateDecisionRequest(createDecisionRequest(model), model), /Choose the dependent/);
});

test('a QC gate preserves source and both outcomes without counting either as unconditional work', () => {
  const source = 'If the trace shows a low peak, add 17 µl of water. Mix by pipetting.';
  const otherwise = 'Otherwise, transfer 20 µl to a fresh tube.';
  const sample = {...snapshot, steps: [{position: 1, title: 'Inspect', guid: 'synthetic-gate',
    text: ['Check the trace.', source, otherwise, 'Record status.'].join('\n')}]};
  const model = buildWorkflowModel(workflow, [sample]);
  assert.equal(model.qcGates.length, 1);
  const [gate] = model.qcGates;
  assert.equal(gate.kind, 'quality-control');
  assert.equal(gate.condition, 'the trace shows a low peak');
  assert.equal(gate.whenTrue, 'add 17 µl of water. Mix by pipetting.');
  assert.equal(gate.whenFalse, 'transfer 20 µl to a fresh tube.');
  assert.deepEqual(gate.source, {stepGuid: 'synthetic-gate', line: source});
  assert.deepEqual(model.lines.filter(row => row.type.startsWith('qc')).map(row => row.line), [source, otherwise]);
  assert.ok(model.chunks[0].actions.every(action => action.volumeUl == null));
  assert.throws(() => validateDecisionRequest(createDecisionRequest(model), model), /quality-control gates/);
});

test('a gate with no alternate instruction keeps the false outcome unresolved', () => {
  const sample = {...snapshot, steps: [{position: 1, title: 'Inspect', text: 'If the QC result is below target, repeat the measurement.'}]};
  const model = buildWorkflowModel(workflow, [sample]);
  assert.equal(model.qcGates[0].whenFalse, null);
  assert.equal(model.chunks[0].actions.length, 0);
});

test('selecting both dependent arms stays unresolved', () => {
  const branches = {[step]: ['Skip Preliminary rinse', 'Include Preliminary rinse']};
  const model = buildWorkflowModel({...workflow, branches}, [snapshot]);
  assert.equal(model.alternatives[0].chosen, null);
  assert.deepEqual(model.chunks[0].actions.map(a => a.volumeUl), [12]);
  assert.throws(() => validateDecisionRequest(createDecisionRequest(model), model), /Choose the dependent/);
});

for (const stage of ['Preliminary rinse','Initial wash']) test(stage + ' uses each bare conditional amount once', () => {
  const original = snapshot.steps[0];
  const text = original.text.replace('Preliminary rinse',stage).replace('preliminary rinse',stage.toLowerCase()).replace('Fluid exchange (shared)', 'Fluid exchange (shared)\nAdd colored water and mix twice.')
    .replace('17 µl of buffer.', '17 µl (small volume).').replace('29 µl of buffer.', '29 µl (large volume).');
  const raw = {...snapshot, steps:[{...original,text}]};
  for (const [choice,amount,line] of [[`Skip ${stage}`,29,7],[`Include ${stage}`,17,6]]) {
    const model = buildWorkflowModel({...workflow, branches:{[step]:choice}}, [raw]);
    const adds = model.chunks[0].actions.filter(action => /colored water/.test(action.line));
    assert.equal(adds.length,1);
    assert.equal(adds[0].volumeUl,amount);
    assert.match(adds[0].line,/and mix twice/);
    assert.equal(adds[0].count.n,1);
    assert.equal(adds[0].source.bodyLine,line);
    assert.equal(adds[0].source.contextBodyLine,5);
    assert.equal(model.lines.find(row => row.sourceLine === 5).type,'definition');
  }
  const unset = buildWorkflowModel(workflow,[raw]);
  assert.ok(unset.chunks[0].actions.every(action => !/colored water/.test(action.line)));
  const independent = {...raw,steps:[{...original,text:text.replace('17 µl (small volume).','17 µl of buffer.')}]};
  const different = buildWorkflowModel({...workflow,branches:{[step]:`Include ${stage}`}},[independent]);
  assert.ok(different.chunks[0].actions.some(action => /colored water/.test(action.line) && action.volumeUl == null));
});
