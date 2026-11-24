import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotFromText} from '../lib/snapshots.js';
import {buildWorkflowModel, createDecisionRequest, validateDecisionRequest, protocolDecisionBlocker} from '../lib/work.js';

const raw = snapshotFromText('Inert material routing', [
  '1. Prepare', 'Add 40 uL water to each well.',
  '2. Pool', 'Pool water from columns 2–3 into column 1.',
  '3. Collect', 'Using an operator-held pipette, pool from column 1 into the collection tube.',
  '4. After collection', 'Inspect the plate. If any water remains, wash and pool into the collection tube.',
  '5. Redistribute', 'Distribute the pooled water across wells A1 to A4.',
].join('\n'));
const source = {source:'text', id:raw.id, versionId:raw.version.id};
const model = block => buildWorkflowModel({id:'synthetic-routing', format:'plate', labware:'plate-96-pcr', parts:[source], ...(block ? {
  block:{...source, ...block, input:{labware:'plate-96-pcr', volumeUl:20, evidence:'Synthetic starting volume'}}
} : {})}, [raw]);

test('a selected pooling boundary retains both source endpoints and conditional work', () => {
  const full = model();
  assert.deepEqual(full.materialBoundaries?.map(({bodyLine, donor, recipient, conditional}) => [bodyLine, donor, recipient, conditional]), [
    [1,'water from columns 2–3','column 1',false],
    [1,'from column 1','the collection tube',false],
    [1,null,'the collection tube',true],
    [1,'the pooled water','wells A1 to A4',false],
  ]);
  assert.throws(() => validateDecisionRequest(createDecisionRequest(full), full), /pooling and redistribution/);
});

test('the inspection is counted and a conditional wash with pooling stays pending', () => {
  const full = model();
  const chunk = full.chunks.find(c => c.source.position === 4);
  assert.deepEqual(chunk.actions.map(a => [a.kind, a.line]), [['imaging', 'Inspect the plate']]);
  assert.equal(full.qcGates.length, 1);
  const [gate] = full.qcGates;
  assert.deepEqual([gate.chunkId, gate.condition, gate.whenTrue, gate.whenFalse, gate.source.bodyLine], [
    chunk.id, 'any water remains', 'wash and pool into the collection tube.', null, 1,
  ]);
  assert.match(gate.source.line, /^Inspect the plate\. If /);
  assert.deepEqual(full.lines.filter(line => line.chunkId === chunk.id).map(line => [line.sourceLine, line.type]), [
    [1, 'operation'], [1, 'qc-gate'],
  ]);
  assert.match(protocolDecisionBlocker(model({from:4, through:4})), /pooling and redistribution/);
});

test('inspection followed by a sentence-delimited condition retains the whole consequent', () => {
  const snap = snapshotFromText('Inspection', '1. Inspect\nVisually inspect the plate, if liquid remains on the side. Repeat the wash and pool into a collection tube.');
  const result = buildWorkflowModel({id:'inspect', format:'tube', parts:[{source:'text', id:snap.id}]}, [snap]);
  assert.deepEqual(result.qcGates.map(g => [g.condition,g.whenTrue]), [
    ['liquid remains on the side','Repeat the wash and pool into a collection tube.'],
  ]);
  assert.equal(result.materialBoundaries.length, 1);
});

test('a block before pooling still admits numeric comparison with a declared input', () => {
  const before = model({from:1, through:1});
  assert.equal(protocolDecisionBlocker(before), null);
  assert.doesNotThrow(() => validateDecisionRequest(createDecisionRequest(before), before));
  assert.match(protocolDecisionBlocker(model({from:1, through:2})), /pooling and redistribution/);
});
