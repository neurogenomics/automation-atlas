import test from 'node:test';
import assert from 'node:assert/strict';
import {benchDevice, benchFit, benchPlanningFixture} from '../scripts/planning-fixtures.mjs';
import {buildWorkflowModel, createDecisionRequest, decide, rankCandidates} from '../lib/work.js';
import {exportPylabrobot, pylabrobotTarget} from '../lib/pylabrobot-export.js';

function planning(input = benchPlanningFixture(), overrides = {}) {
  const {protocol, decision, installations} = input;
  const model = buildWorkflowModel(protocol.workflow, protocol.snapshots);
  return decide({...createDecisionRequest(model), ...decision, ...overrides}, {model, installations});
}

test('standalone dispenser leads the opt-in nine-addition comparison with attended manual handoffs', () => {
  const d = planning();
  const c = d.recommended;
  assert.equal(c.route, 'standalone');
  assert.equal(c.standalone.id, benchDevice);
  for (const k of ['handler', 'pipettes', 'layout', 'deck']) assert.equal(c[k], null);
  const dispense = c.timeline.filter(s => s.dispensed);
  const handoffs = c.timeline.filter(s => s.move);
  assert.equal(dispense.length, 9);
  assert(dispense.every(s => s.attended && s.count === 4 && s.dispenseTime.kind === 'sourced'));
  assert.equal(handoffs.length, 18);
  assert(handoffs.every(s => s.type === 'H' && s.move.by === 'person' && s.move.count === 4 && s.minutes.lo > 0));
  assert.equal(c.metrics.moves.person, 72);
  assert.deepEqual(c.tipRuntime.tips, {lo: 0, hi: 0});
  assert.ok(c.metrics.active.lo >= handoffs.reduce((sum, s) => sum + s.minutes.lo, 0));
  assert.ok(c.metrics.attended.lo > 0);
  assert.equal(d.mechanisms.length, 9);
  assert(d.mechanisms.every(m => m.chosen.tip_free_addition && !m.alternative.tip_free_addition && m.chosen.action_minutes.lo > 0));
  assert.equal(pylabrobotTarget(c).ok, false);
  assert.throws(() => exportPylabrobot(c, d.model, 384, {simulate: true}), /person on a separate bench device/);
});

test('a genuinely evaluated paired dispenser dominates its exact tipped base on both bounds and cannot rank below it', () => {
  const input = benchPlanningFixture();
  const d = planning(input, {dispenserFor: 'purchase-plr-hamilton-prep:connected:base', facts: {
    ...input.decision.facts, ['purchase-plr-hamilton-prep:labware:plate-96-pcr:dispensing=' + benchDevice]: 'yes',
  }});
  const pair = d.dispenserPairs.pairs.find(p => p.route === 'deck' && p.device.id === benchDevice);
  assert.equal(pair.pairedBase.id, 'purchase-plr-hamilton-prep:deck:base');
  assert(pair.rank && pair.pairedBase.rank);
  assert(pair.rank < pair.pairedBase.rank);
  for (const k of ['lo', 'hi']) {
    assert(pair.tips[k] < pair.pairedBase.tips[k]);
    assert(pair.elapsed[k] < pair.pairedBase.elapsed[k]);
  }
  const [left, right] = [d.recommended, d.alternative];
  assert.deepEqual(rankCandidates([right, left], 'tips-runtime', d.baseline), [left, right]);
});

test('the standalone route is gated by exact fit, access, bounded timings and complete tip use', () => {
  const input = benchPlanningFixture();
  const unknown = planning(input, {facts: {}});
  assert(!unknown.shortlist.some(c => c.route === 'standalone'));
  assert.equal(unknown.benchRoutes.find(x => x.model_id === benchDevice).fact.status, 'unknown');
  assert(unknown.benchRoutes.some(x => x.kind === 'plate washer' && x.reason.includes('manifold')));
  assert(unknown.benchRoutes.some(x => x.kind === 'bench 96-channel pipette' && x.reason.includes('cycle-time')));
  const timed = planning(benchPlanningFixture(384, '\n2. Unknown wait\nIncubate at room temperature.'));
  assert.equal(timed.recommended, null);
  assert.equal(timed.baseline.missingWaits, 1);
  assert.match(timed.benchRoutes.find(x => x.model_id === benchDevice).reason, /incomplete elapsed/);
  const local = benchPlanningFixture(192, '\n2. Manual operation\nMix by pipetting up and down.');
  local.installations = [{id: 'local-device', modelId: benchDevice, access: 'yes'}];
  const missingTips = planning(local, {scope: 'accessible', facts: {[benchFit('local-device')]: 'yes'}});
  assert.equal(missingTips.recommended, null);
  assert.match(missingTips.benchRoutes[0].reason, /incomplete tip count/);
  const known = benchPlanningFixture(192);
  known.installations = [{id: 'local-device', modelId: benchDevice, access: 'unknown'}];
  const facts = {[benchFit('local-device')]: 'yes'};
  assert.equal(planning(known, {scope: 'accessible', facts}).recommended, null);
  const upgrade = planning(known, {scope: 'upgrade', facts});
  assert.equal(upgrade.recommended, null);
  assert.match(upgrade.benchRoutes[0].reason, /access is unconfirmed/);
  known.installations[0].access = 'yes';
  assert.equal(planning(known, {scope: 'accessible', facts}).recommended.id, 'local-device:standalone');
  assert.equal(planning(benchPlanningFixture(191)).benchRoutes.find(x => x.model_id === benchDevice).reason,
    'This model needs explicitly chosen labware and complete plates.');
});

test('legacy recommendation and assessed output stay on the existing path by default', () => {
  const d = planning(benchPlanningFixture(), {objective: 'labour', facts: {}});
  assert.equal(d.recommended.id, 'purchase-flex:connected:base');
  assert.deepEqual(d.recommended.metrics.tips.total, {lo: 72, hi: 72});
  assert.deepEqual(d.recommended.metrics.elapsed, {lo: 128, hi: 261});
  assert.equal(d.benchRoutes, undefined);
  assert.equal(d.mechanisms, undefined);
});
