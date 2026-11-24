import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotFromText} from '../lib/snapshots.js';
import {applyVariants, buildWorkflowModel, createDecisionRequest, validateDecisionRequest, variantPlan} from '../lib/work.js';

const snapshot = snapshotFromText('Inert handling', '1. Handle\nSpin down for 2 min.\nAdd 10 µl water.\nSpin down for 6 min.');
const target = {source:'text', id:snapshot.id, versionId:snapshot.version.id, position:1, bodyLine:1};
const proposal = {id:'review', label:'Review the first spin', substitution:'spin-as-magnetic-capture', targets:[target]};
const model = buildWorkflowModel({id:'test', format:'tube', parts:[{source:'text', id:snapshot.id}], variants:[proposal]}, [snapshot]);

test('an exact target selects one operation and retains unrelated operations in the same step', () => {
  const plan = variantPlan(model, proposal);
  assert.equal(plan.reviewOnly, true);
  assert.deepEqual(plan.targetIssues, []);
  assert.deepEqual(plan.changed.map(x => x.bodyLine), [1]);
  assert.deepEqual(plan.kept.map(x => x.bodyLine), [3]);
  assert.equal(model.chunks[0].actions[1].kind, 'liquid-transfer');
});

test('stale, unavailable or duplicated targets keep the whole proposal unresolved', () => {
  for (const second of [target, {...target, versionId:0}, {...target, contentHash:'stale'}, {...target, bodyLine:2}]) {
    const plan = variantPlan(model, {...proposal, targets:[target,second]});
    assert.equal(plan.changed.length, 0);
    assert.equal(plan.kept.length, 2);
    assert.equal(plan.targetIssues[0].target, 2);
  }
});

test('several eligible actions on one line require more specific review', () => {
  const raw = snapshotFromText('Inert handling', '1. Handle\nSpin down for 2 min. Add 10 µl water. Spin down for 6 min.');
  const read = buildWorkflowModel({id:'test', format:'tube', parts:[{source:'text', id:raw.id}]}, [raw]);
  const plan = variantPlan(read, {...proposal, targets:[{...target,id:raw.id,versionId:raw.version.id}]});
  assert.equal(plan.changed.length, 0);
  assert.match(plan.targetIssues[0]?.reason, /Several eligible actions/);
});

test('a proposal cannot enter simulation before method qualification', () => {
  const request = createDecisionRequest(model);
  assert.doesNotThrow(() => validateDecisionRequest(request, model));
  assert.throws(() => validateDecisionRequest({...request,variants:[proposal.id]}, model), /evidence-qualified method/);
  assert.throws(() => applyVariants(model, [proposal.id]), /pending method qualification/);
  assert.equal(applyVariants(model, []), model);
});
