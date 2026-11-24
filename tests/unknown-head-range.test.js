import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWorkflowModel, createDecisionRequest, decide, handlers, pipetteConfigs, portfolio, simulate} from '../lib/work.js';
import pipettes from '../content/pipettes.json' with {type: 'json'};

const snapshot = {schema: 'planner/text-import/1', id: 'range', name: 'Synthetic range test', version: {id: 1}, steps: [
  {position: 1, title: 'Work', text: 'Add 1 µl water.\nAdd 5 µl water.\nAdd 6 µl water.\nAdd 10 µl water.'},
]};
const modelFor = raw => buildWorkflowModel({id: 'range', name: raw.name, format: 'plate', labware: 'plate-96-pcr',
  parts: [{source: 'text', id: raw.id}]}, [raw]);
const model = modelFor(snapshot);
const base = handlers.find(h => h.id === 'flex');
const cfg = pipetteConfigs(base)[0];
const setup = {installation: {id: 'range', name: 'Test setup'}, handler: base,
  providers: [{op: 'liquid-transfer', via: 'native'}], capacity: {lo: 4, hi: 4, basis: 'test'}};
const transferSteps = sim => sim.timeline.filter(s => s.actionId && !s.overhead && !s.move);
const run = (bounds, configured = false) => {
  if (!configured) {
    const handler = {...base, ops: {...base.ops, 'liquid-transfer': {type: 'native', ...bounds}}};
    return simulate(model, 8, {...setup, handler});
  }
  const heads = cfg.heads.map(h => ({...h, minUl: undefined, maxUl: undefined, ...bounds}));
  return simulate(model, 8, {...setup, pipettes: {...cfg, heads}});
};

test('unverified ranges use the advisory floor without a pipette pass plan (#296)', () => {
  for (const bounds of [{}, {minUl: 0.5}, {maxUl: 30}, {minUl: '0.5', maxUl: 30}, {minUl: 10, maxUl: 1},
    {minUl: Number.NaN, maxUl: Number.POSITIVE_INFINITY}, {minUl: 0, maxUl: -1}]) {
    for (const configured of [false, true]) {
      const result = run(bounds, configured);
      const [below, at, above] = transferSteps(result);
      assert.equal(below.type, 'H');
      assert.match(below.reason, /5 µL planning floor for an unverified head range/);
      for (const step of [at, above]) {
        assert.equal(step.type, 'A');
        assert.equal(step.provider, 'liquid-transfer');
        assert.ok(step.facts.includes('head-range'));
        assert.match(step.reason, /range is unverified/);
        assert.equal(step.tips, null);
        assert.ok(step.physical.ops.every(o => !o.robot && !o.plan));
      }
      assert.equal(result.physical.violations.length, 0);
      assert.ok(Number.isFinite(result.metrics.elapsed.hi));
    }
  }
});

test('numeric bounds govern known heads and a usable bound still constrains an incomplete range', () => {
  const [below, at, above, over] = transferSteps(run({minUl: 2, maxUl: 6}, true));
  assert.equal(below.type, 'H');
  assert.match(below.reason, /2 µL minimum/);
  for (const step of [at, above]) {
    assert.equal(step.type, 'A');
    assert.ok(step.physical.ops.some(o => o.robot && o.plan));
    assert.ok(!step.facts.includes('head-range'));
  }
  assert.equal(over.type, 'H');
  assert.match(over.reason, /6 µL maximum/);
  assert.equal(transferSteps(run({minUl: 7}))[1].type, 'H');
  assert.equal(transferSteps(run({maxUl: 5}))[2].type, 'H');

  const known = {...cfg.heads[0], minUl: 0.5, maxUl: 6};
  const unverified = {...cfg.heads[0], id: 'missing-range', minUl: null, maxUl: null};
  const steps = transferSteps(simulate(model, 8, {...setup, pipettes: {...cfg, heads: [unverified, known]}}));
  assert.ok(steps.slice(0, 3).every(s => s.type === 'A' && !s.facts.includes('head-range') && s.physical.ops.some(o => o.plan)));
  assert.ok(steps[3].facts.includes('head-range'));
  assert.ok(steps[3].physical.ops.every(o => !o.plan));
});

test('viscous liquids and settling suspensions ask about liquid class', () => {
  const materialModel = structuredClone(model);
  const actions = materialModel.chunks.flatMap(c => c.actions);
  actions[1].materials = [{class: 'chaotrope'}];
  actions[2].materials = [{class: 'magnetic-beads'}];
  const steps = transferSteps(simulate(materialModel, 8, {...setup, pipettes: cfg}));
  for (const step of steps.slice(1, 3)) {
    assert.equal(step.type, 'A');
    assert.ok(step.facts.includes('pipette-liquid-class'));
  }
  assert.ok(!steps[3].facts.includes('pipette-liquid-class'));
});

test('missing or malformed catalogue ranges earn no assessed rank or savings (#296)', () => {
  const raw = {...snapshot, steps: Array.from({length: 13}, (_, i) =>
    ({position: i + 1, title: `Synthetic action ${i + 1}`, text: `Add ${i === 12 ? 30 : 10} µl water.`}))};
  const model = modelFor(raw), workload = 384;
  const installations = [{id: 'range', name: 'Synthetic Flex', modelId: 'flex', access: 'yes'}];
  const request = {...createDecisionRequest(model, 'upgrade'), workload};
  const assess = facts => decide({...request, facts}, {model, installations});
  const specs = [{id: 'range', name: 'Synthetic configured setup', handler: 'flex', route: 'deck', pipettes: cfg.id}];
  const report = () => portfolio([{id: 'range', model, workload, runsPerYear: 24}], specs).setups[0];
  const known = pipettes.handlers.flex;
  assert.ok(assess({}).recommended?.metrics.automatedInstances > 0);
  assert.ok(report().workflows[0].withSetup.automatedSteps > 0);

  try {
    for (const bounds of [{minUl: null, maxUl: null}, {minUl: 1, maxUl: '1000'}, {minUl: 100, maxUl: 1}]) {
      pipettes.handlers.flex = {...known, heads: known.heads.map(h => ({...h, ...bounds}))};
      const d = assess({'range:head-range': 'yes'});
      assert.equal(d.recommended, null);
      assert.deepEqual(d.shortlist, []);
      assert.match(d.unassessed.find(h => h.id === 'flex').reason, /head range is unverified/);
      assert.match(d.unlocks[0].reason, /head range is unverified/);
      const p = report();
      assert.match(p.unassessed, /head range is unverified/);
      assert.equal(p.hoursPerYear, null);
      assert.equal(p.workflows[0].withSetup, null);
      assert.equal(p.workflows[0].savedPerRun, null);
    }

    pipettes.handlers.flex = {...known, heads: []};
    assert.match(assess({}).unassessed.find(h => h.id === 'flex').reason, /head range is unverified/);
    assert.match(report().unassessed, /head range is unverified/);

    // Keep one complete range in the selected configuration. The steps it
    // can perform retain credit while the uncovered step stays manual.
    const qualifiedId = cfg.heads[0].id;
    pipettes.handlers.flex = {...known, heads: known.heads.map(h => h.id === qualifiedId
      ? {...h, minUl: 1, maxUl: 20} : {...h, minUl: null, maxUl: null})};
    const mixed = report().workflows[0];
    assert.equal(mixed.withSetup.automatedSteps, 48);
    assert.ok(mixed.manual.some(s => /head range is unverified/.test(s.reason)));
  } finally {
    pipettes.handlers.flex = known;
  }
});
