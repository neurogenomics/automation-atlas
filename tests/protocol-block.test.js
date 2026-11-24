import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWorkflowModel, createDecisionRequest, simulate, validateDecisionRequest} from '../lib/work.js';

const snapshot = {schema: 'planner/text-import/1', id: 'water-block', name: 'Water block', version: {id: 91, number: 1},
  steps: [
    {position: 1, title: 'Before', guid: 'before', text: 'Add 90 µl water.'},
    {position: 2, title: 'Selected block', guid: 'one', text: 'Remove the supernatant.'},
    {position: 3, title: 'Finish block', guid: 'two', text: 'Add 13 µl buffer.'},
    {position: 4, title: 'After', guid: 'after', text: 'If the trace shows a low peak, add 20 µl water.'},
  ]};
const source = {source: 'text', id: snapshot.id, versionId: snapshot.version.id};
const workflow = {id: 'block', name: 'Pinned stage', format: 'plate', labware: 'plate-96-pcr', parts: [source]};
const block = {...source, from: 2, through: 3, input: {labware: 'tube-1.5', volumeUl: 35, evidence: 'Synthetic input measurement'}};
const build = changes => buildWorkflowModel({...workflow, block: {...block, ...changes}}, [snapshot]);

test('a selected block keeps its exact step pins and starts from its declared vessel and volume', () => {
  const full = buildWorkflowModel(workflow, [snapshot]);
  const scoped = build();
  assert.deepEqual(scoped.chunks.map(chunk => chunk.id), full.chunks.slice(1,3).map(chunk => chunk.id));
  assert.deepEqual(scoped.chunks.map(chunk => chunk.source.stepGuid), ['one', 'two']);
  assert.equal(full.qcGates.length, 1);
  assert.equal(scoped.qcGates.length, 0);
  assert.equal(scoped.format, 'tube');
  assert.equal(scoped.labware.id, 'tube-1.5');
  assert.equal(scoped.block.input.evidence, 'Synthetic input measurement');
  assert.equal(scoped.block.firstStepGuid, 'one');
  assert.equal(scoped.block.lastStepGuid, 'two');
  const [remove, add] = simulate(scoped, 1).physical.steps;
  assert.equal(remove.before.ul, 35);
  assert.equal(remove.ops[0].ulPerWell, 35);
  assert.equal(add.after.ul, 13);
});

test('undefined input volume cannot become an empty-vessel estimate', () => {
  const unknown = build({input: {...block.input, volumeUl: null, evidence: null}});
  assert.throws(() => validateDecisionRequest(createDecisionRequest(unknown), unknown), /Record the starting volume/);
  assert.equal(simulate(unknown, 1).physical.steps[0].before.unknown, true);
});

test('stale pins, unordered positions and unsupported inputs fail explicitly', () => {
  assert.throws(() => build({versionId: 90}), /exact workflow source version/);
  assert.throws(() => build({from: 3, through: 2}), /contiguous range/);
  assert.throws(() => build({input: {...block.input, evidence:''}}), /evidence reference/);
  assert.throws(() => build({input: {...block.input, volumeUl: 1600}}), /within its capacity/);
  const selected = build();
  assert.throws(() => validateDecisionRequest({...createDecisionRequest(selected), reactionScale: 0.5}, selected), /new input declaration/);
});

test('a scoped wash retains its stated following removal instead of inferring a second discard', () => {
  const raw = {...snapshot, steps: [
    {position:1, title:'Exchange', text:'Wash with 70 µl buffer.'},
    {position:2, title:'Remove', text:'Remove all supernatant.'},
  ]};
  const chosen = {...block, from:1, through:1};
  const scoped = buildWorkflowModel({...workflow, block:chosen}, [raw]);
  assert.equal(scoped.block.washBoundaryOpen, true);
  assert.throws(() => validateDecisionRequest(createDecisionRequest(scoped), scoped), /following liquid-handling step/);
  const joined = buildWorkflowModel({...workflow, block:{...chosen, through:2}}, [raw]);
  assert.equal(joined.block.washBoundaryOpen, undefined);
  const [wash, removal] = simulate(joined, 1).physical.steps;
  assert.equal(wash.after.ul, 70);
  assert.equal(removal.ops[0].ulPerWell, 70);
});
