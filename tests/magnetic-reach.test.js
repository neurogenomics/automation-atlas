import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWorkflowModel, handlers, pipetteConfigs, simulate} from '../lib/work.js';

const snapshot = {schema: 'planner/text-import/1', id: 'magnetic-reach', version: {id: 1},
  steps: [{position: 1, title: 'Handling', text: [
    'Add 90 µl water.',
    'Place the plate on the magnet for 2 minutes.',
    'Remove supernatant.',
    'Wash with 70 µl buffer on the magnet.',
  ].join('\n')}]};
const workflow = {id: 'magnetic-reach', format: 'plate', labware: 'plate-96-pcr',
  parts: [{source: 'text', id: snapshot.id}]};
const handler = handlers.find(h => h.id === 'flex');
const pipettes = pipetteConfigs(handler).find(config => config.id === '2x8');
const pipette = {op: 'liquid-transfer', via: 'native'};
const onDeck = {op: 'magnetic-separation', via: 'module', module: 'Magnetic Block'};
const offDeck = {op: 'magnetic-separation', via: 'external'};
const unrecorded = {...onDeck, module: 'Synthetic unrecorded magnetic position'};
const setup = stations => ({
  handler, pipettes, route: 'connected', providers: [pipette, ...stations],
  installation: {id: 'synthetic', name: 'Synthetic installation', kind: 'existing'},
  capacity: {lo: 5, hi: 5, basis: 'test'},
});
const model = buildWorkflowModel(workflow, [snapshot]);
const action = (run, prefix) => run.timeline.find(row => !row.overhead && row.label.startsWith(prefix));

test('an external magnet permits capture but keeps on-magnet liquid handling at the station manual', () => {
  const run = simulate(model, 24, setup([offDeck]));
  assert.equal(action(run, 'Place').type, 'A');
  for (const prefix of ['Remove', 'Wash']) {
    const row = action(run, prefix);
    assert.equal(row.type, 'H');
    assert.match(row.reason, /operator handles the liquid at the magnet/i);
    assert.equal(row.physical.route, 'manual');
    assert.ok(row.physical.ops.every(op => !op.robot));
  }
  assert.ok(!run.timeline.some(row => row.move?.fromId === 'device:magnetic-separation' && row.move?.toId === 'bench'));
});

test('recorded on-deck reach admits wash pipetting, absent and unrecorded magnets do not', () => {
  for (const stations of [[onDeck], [unrecorded], []]) {
    const run = simulate(model, 24, setup(stations));
    const wash = action(run, 'Wash');
    const reachable = stations.includes(onDeck);
    assert.equal(wash.type, reachable ? 'A' : 'H');
    assert.equal(Boolean(wash.tips), reachable);
  }
});

test('reviewed liquid handling still depends on the specific magnet position', () => {
  const source = 'Wash with 70 µl buffer on the magnet.';
  const asReviewed = buildWorkflowModel(workflow, [snapshot], {
    [`text:${snapshot.id}:${snapshot.version.id}`]: {lines: {[source]: {operation: 'liquid-transfer'}}},
  });
  assert.equal(asReviewed.chunks[0].actions.at(-1).kind, 'liquid-transfer');
  const run = simulate(asReviewed, 24, setup([onDeck]));
  assert.equal(action(run, 'Wash').provider, 'liquid-transfer');
  assert.ok(action(run, 'Wash').facts.includes('provider:magnetic-separation'));
  assert.ok(run.used.has('module:Magnetic Block'));
  const external = simulate(asReviewed, 24, setup([offDeck]));
  assert.equal(action(external, 'Wash').type, 'H');
});

test('recorded reach does not override known incompatible labware', () => {
  const tubes = buildWorkflowModel({...workflow, format: 'tube', labware: 'tube-1.5'}, [snapshot]);
  const wash = action(simulate(tubes, 1, setup([onDeck])), 'Wash');
  assert.equal(wash.type, 'H');
  assert.match(wash.reason, /incompatible with this labware/);
});
