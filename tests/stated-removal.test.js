import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWorkflowModel, handlers, pipetteConfigs, simulate} from '../lib/work.js';

function build(lines) {
  const snapshot = {schema:'planner/text-import/1', id:'stated-removal', version:{id:1, number:1},
    steps:[{position:1, title:'Handling', text:lines.join('\n')}]};
  return buildWorkflowModel({id:'stated-removal', format:'plate', labware:'plate-96-pcr',
    parts:[{source:'text', id:snapshot.id}]}, [snapshot]);
}

const handler = handlers.find(h => h.id === 'flex');
const setup = {handler, pipettes:pipetteConfigs(handler).find(config => config.id === '2x8'),
  route:'deck', installation:{id:'synthetic', kind:'existing'}, providers:[{op:'liquid-transfer', via:'native'}],
  capacity:{lo:6, hi:6, basis:'test'}};

test('a source removal uses the stated draw and preserves liquid for the next operation', () => {
  const model = build(['Add 135 µl water.', 'Carefully discard 13.5 µl of clear supernatant.', 'Mix by pipetting.']);
  const [, action] = model.chunks[0].actions;
  assert.equal(action.removalUl, 13.5);
  assert.deepEqual(action.fraction, {kind:'supernatant', disposition:'discarded'});
  for (const route of [null, setup]) {
    const run = simulate(model, 96, route);
    const aspirate = run.physical.steps[1];
    assert.equal(aspirate.before.ul, 135);
    assert.equal(aspirate.after.ul, 121.5);
    assert.equal(aspirate.ops[0].ulPerWell, 13.5);
    assert.equal(run.physical.steps[2].before.ul, 121.5);
    assert.equal(run.physical.waste.robotUl + run.physical.waste.benchUl, 13.5 * 96);
    if (route) {
      const step = run.timeline.find(row => row.actionId === action.id && row.physical);
      assert.equal(step.type, 'A');
      assert.ok(step.tips.size < 135);
    }
  }
});

test('an unresolved range is distinct from a stated amount, and cannot drain the sample', () => {
  for (const line of ['Remove 10–15 µl.', 'Remove 10 µl or 15 µl.', 'Remove 10 µl total across all wells.']) {
    const model = build(['Add 40 µl water.', line]);
    const run = simulate(model, 96, setup);
    assert.equal(model.chunks[0].actions[1].removalUl, null);
    assert.equal(run.physical.steps[1].ops[0].ulPerWell, null);
    assert.equal(run.physical.steps[1].after.ul, 40);
    assert.ok(run.physical.violations.some(v => v.kind === 'remove-unverified'));
    assert.ok(!run.timeline.some(row => row.label === line && row.type === 'A'));
  }
});

test('a requested draw larger than the known contents is blocked', () => {
  const model = build(['Add 30 µl water.', 'Remove 65 µl liquid.']);
  const run = simulate(model, 96, setup);
  assert.equal(run.physical.steps[1].after.ul, 30);
  assert.ok(run.physical.violations.some(v => v.kind === 'remove-short' && v.severity === 'impossible'));
  assert.equal(run.physical.waste.robotUl + run.physical.waste.benchUl, 0);
});

test('a residual phrase stays unresolved and a wash addition does not set the amount aspirated', () => {
  const model = build(['Add 30 µl water.', 'Remove the supernatant leaving 4 µl behind.', 'Discard supernatant and wash with 55 µl water.']);
  const [, removal, wash] = model.chunks[0].actions;
  assert.equal(removal.removalUl, null);
  const run = simulate(model, 96, setup);
  assert.equal(run.physical.steps[1].after.ul, 30);
  assert.ok(run.physical.violations.some(v => v.actionId === removal.id && v.kind === 'remove-unverified'));
  assert.deepEqual(removal.fraction, {kind:'supernatant', disposition:'unstated'});
  assert.equal(wash.contact, 'wash');
  assert.equal(wash.removalUl, undefined);
  assert.equal(wash.volumeUl, 55);
});

test('a decimal amount inside a fraction transfer travels to the fresh vessel', () => {
  const model = build(['Add 45 µl water.', 'Transfer supernatant (21.5 µl) to a fresh strip.']);
  const [, transfer] = model.chunks[0].actions;
  assert.equal(transfer.contact, 'sample-move');
  assert.deepEqual(transfer.fraction, {kind:'supernatant', disposition:'transferred'});
  const move = simulate(model, 1).physical.steps[1];
  assert.equal(move.ops[0].kind, 'move');
  assert.equal(move.after.ul, 21.5);
  assert.notEqual(move.before.plate, move.after.plate);
  assert.equal(move.containers.plate[move.before.plate], 23.5);
});
