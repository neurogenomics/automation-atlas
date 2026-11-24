import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotFromText} from '../lib/snapshots.js';
import {buildWorkflowModel, variantPlan} from '../lib/work.js';
import {verifyWashComparison, washComparison} from '../lib/wash-comparison.js';

const raw = snapshotFromText('Inert wash', '1. Wash\nSpin down for 2 min.\nAdd 10 µl water.\nSpin down for 4 min.\n2. Pool\nPool water from the wells into a collection tube.');
const pin = {source:'text', id:raw.id, versionId:raw.version.id};
const variant = {id:'wash', substitution:'spin-as-magnetic-capture', targets:[{...pin, position:1, bodyLine:1}],
  washComparison:{retainedMaterial:'Inert particles'}};
const model = buildWorkflowModel({id:'inert-wash', format:'tube', parts:[pin]}, [raw]);
const compare = proposal => washComparison(model, variantPlan(model, proposal), proposal);

test('compares all methods in both execution modes on one exact scope', () => {
  const report = compare(variant);
  assert.equal(report.retainedMaterial, 'Inert particles');
  assert.equal(report.scopeReady, true);
  assert.deepEqual(report.routes.map(r => [r.method, r.execution]), [
    ['as-written','manual'], ['as-written','machine-assisted'], ['magnetic','manual'], ['magnetic','machine-assisted'],
    ['filter','manual'], ['filter','machine-assisted'],
  ]);
  assert.deepEqual(report.sourceTargets, variant.targets);
  assert.deepEqual(report.sourceActions.map(a => [a.position,a.bodyLine,a.statedMinutes]), [[1,1,2]]);
  assert.deepEqual(report.keptActionIds, [model.chunks[0].actions[2].id]);
  assert.equal(report.poolBoundaries[0].recipient, 'a collection tube');
  assert.ok(report.routes.every(r => r.metrics === null && !r.executionAllowed && r.status === 'evidence-pending'));
  assert.ok(report.routes.find(r => r.method === 'filter' && r.execution === 'machine-assisted').missingEvidence
    .includes('Exact filter vessel, drive and collection station fit'));
  assert.ok(report.routes.every(r => r.missingEvidence.includes('Verify the existing pooling and redistribution map')));
});

test('incomplete or changed inputs cannot qualify a partial scope', () => {
  const report = compare({...variant, washComparison:{}, targets:[{...variant.targets[0], versionId:0}]});
  assert.equal(report.scopeReady, false);
  assert.equal(report.retainedMaterial, null);
  assert.equal(report.sourceActions.length, 0);
  assert.equal(report.targetIssues.length, 1);
  assert.ok(report.routes.every(r => r.metrics === null && r.status === 'scope-pending' && !r.executionAllowed));
  assert.equal(compare({...variant, washComparison:null}), null);
});

test('a saved comparison replays only against the same workflow context and evidence', () => {
  const result = compare(variant);
  const saved = JSON.parse(JSON.stringify(result));
  assert.deepEqual(saved.context.sources, [{...pin,contentHash:null}]);
  assert.match(saved.context.assessmentBlocker, /pooling and redistribution/);
  assert.deepEqual(verifyWashComparison(saved, compare(variant)), {matches:true});
  const branchChanged = {...result, context:{...result.context, branches:[{chunkId:'variant-step', chosen:'B', basis:'workflow (this step)'}]}};
  assert.match(verifyWashComparison(saved, branchChanged).reason, /chosen branch/);
  const workloadChanged = {...result, context:{...result.context, planningWorkload:12}};
  assert.match(verifyWashComparison(saved, workloadChanged).reason, /planning workload/);
  const fabricated = structuredClone(saved);
  fabricated.routes[0].metrics = {operatorMinutes:0};
  assert.match(verifyWashComparison(fabricated, result).reason, /route evidence changed/);
  assert.match(verifyWashComparison({...saved, workflowId:'other-workflow'}, result).reason, /different workflow/);
});
