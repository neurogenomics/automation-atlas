import assert from 'node:assert/strict';
import test from 'node:test';
import {buildWorkflowModel, createDecisionRequest, decide, handlers, installationPipetteConfigs, validateInstalledHeads} from '../lib/work.js';
import {planningFixture} from '../scripts/planning-fixtures.mjs';

const {protocol} = planningFixture();
const model = buildWorkflowModel(protocol.workflow, protocol.snapshots);
const handler = handlers.find(x => x.id === 'plr-hamilton-star');
const heads = [{id: '1000ul-channels', channels: 8}];
const assess = (status, scope) => decide({
  ...createDecisionRequest(model, scope), facts: {'example:installed-heads': 'yes'},
}, {model, installations: [{id: 'example', modelId: handler.id, access: 'yes',
  options: {'vessel-transfer': 'yes'}, installedHeads: {status, heads: ['confirmed', 'reported'].includes(status) ? heads : []}}]});

test('only the recorded heads and fitted channel count take work in an installed scenario', () => {
  const result = assess('confirmed', 'accessible');
  const best = result.recommended;
  assert.ok(best, 'a confirmed installation provides a useful route');
  assert.equal(best.pipettes.chosen.id, 'as-installed:1000ul-channels-8');
  assert.match(best.pipettes.chosen.label, /×8/);
  assert.equal(best.pipettes.options.length, 1);
  const plans = best.timeline.flatMap(row => row.physical?.ops.map(op => op.plan).filter(Boolean) || []);
  assert.ok(plans.length > 0);
  assert.ok(plans.some(plan => plan.group === 8));
  assert.ok(plans.every(plan => plan.group <= 8));
  assert.ok(!best.providers.some(p => p.op === 'vessel-transfer'));
  assert.ok(!best.timeline.some(row => ['gripper', 'arm'].includes(row.move?.by)));
});

test('head reports are provisional and unknown or conflicting evidence earns no equipment assessment', () => {
  assert.equal(assess('reported', 'accessible').recommended, null);
  const provisional = assess('reported', 'upgrade').recommended;
  assert.equal(provisional.pipettes.chosen.id, 'as-installed:1000ul-channels-8');
  assert.ok(provisional.facts.some(fact => fact.type === 'installed-heads' && fact.status === 'unknown'));
  const moves = provisional.timeline.filter(row => row.move);
  assert.ok(moves.length > 0, 'a module comparison includes a physical handoff');
  assert.ok(moves.every(row => row.move.by === 'person'));
  for (const status of ['unknown', 'conflicting']) {
    const decision = assess(status, 'upgrade');
    assert.equal(decision.recommended, null);
    assert.match(decision.unlocks[0].reason, new RegExp(status));
  }
});

test('head records cannot shrink a fixed head or combine non-overlapping catalogue layouts', () => {
  for (const invalid of [
    [{id: '1000ul-channels', channels: 17}],
    [{id: 'core-96', channels: 8}],
    [{id: 'core-96', channels: 96}, {id: 'core-384', channels: 384}],
    [{id: '1000ul-channels', channels: 8}, {id: '1000ul-channels', channels: 8}],
  ]) {
    const installedHeads = {status: 'confirmed', heads: invalid};
    assert.equal(validateInstalledHeads(handler, installedHeads), false);
    assert.deepEqual(installationPipetteConfigs(handler, {installedHeads}), []);
  }
});
