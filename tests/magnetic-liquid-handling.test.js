import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWorkflowModel, simulate} from '../lib/work.js';

const id = 'synthetic-water-magnet';
const source = {source:'text', id, versionId:1};
const workflow = {id, format:'tube', parts:[source], block:{...source, from:1, through:1,
  input:{labware:'tube-1.5', volumeUl:30, evidence:'Synthetic starting water volume'}}};
const build = text => buildWorkflowModel(workflow, [{schema:'planner/text-import/1', id, version:{id:1},
  steps:[{position:1, title:'Water handling', text}]}]);

test('station separation, repeated wash, final removal and off-station liquid work are distinct', () => {
  const model = build([
    'Place the tube on the magnet for 2 minutes.',
    'Discard liquid and wash twice with 50 µl water on the magnet.',
    'Remove all liquid and air dry for 3 minutes.',
    'Take the tube off the magnet and resuspend the sample in 24 µl water.',
  ].join('\n'));
  const [separate, wash, removal, resuspend] = model.chunks[0].actions;
  assert.deepEqual([separate.kind, separate.wait, separate.source.bodyLine], ['magnetic-separation', 2, 1]);
  assert.deepEqual([wash.kind, wash.contact, wash.conditions.onMagnet, wash.count.n, wash.source.bodyLine],
    ['liquid-transfer', 'wash', true, 2, 2]);
  assert.deepEqual([removal.kind, removal.contact, removal.wait], ['liquid-transfer', 'removal', 3]);
  assert.deepEqual([resuspend.kind, resuspend.contact, resuspend.conditions.onMagnet, resuspend.volumeUl],
    ['liquid-transfer', 'contact', false, 24]);

  const run = simulate(model, 1);
  const washStep = run.physical.steps.find(step => step.actionId === wash.id);
  assert.deepEqual(washStep.ops.map(op => [op.kind, op.ulPerWell]), [['remove',30],['add',50],['remove',50],['add',50]]);
  assert.equal(run.physical.steps.find(step => step.actionId === removal.id).after.ul, 0);
  assert.equal(run.physical.steps.find(step => step.actionId === resuspend.id).after.ul, 24);
  assert.deepEqual(run.timeline.filter(row => row.type === 'W').map(row => [row.actionId, row.minutes.lo]),
    [[separate.id,2],[removal.id,3]]);
});
