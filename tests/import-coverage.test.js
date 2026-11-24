import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWorkflowModel, reviewImport} from '../lib/work.js';

function review(...bodies) {
  const steps = bodies.map((text, index) => ({position: index + 1, title: 'Handling', text}));
  return reviewImport({schema: 'planner/text-import/1', id: 'coverage', name: 'Coverage',
    version: {id: 1}, content_hash: 'fixture', steps});
}

test('an empty or operation-free snapshot has a stop flag', () => {
  for (const result of [review(), review('Handling'), review('Handling\nNote: Optional reference only.')]) {
    assert.equal(result.reading.operations, 0);
    assert.ok(result.flags.some(flag => flag.level === 'stop'));
    assert.ok(result.flags.every(flag => flag.level !== 'ok'));
  }
});

test('retained optional source lines remain visible and are counted separately from work', () => {
  const result = review('Handling\nOptional: Add 15 µl saline.\nAdd 20 µl water.');
  assert.equal(result.reading.sourceLines, 2);
  assert.equal(result.reading.lines.optional, 1);
  assert.equal(result.reading.operations, 1);
  assert.deepEqual(result.reading.omitted, []);
});

test('two operations on one line keep their shared source line number', () => {
  const snapshot = {schema: 'planner/text-import/1', id: 'coverage', version: {id: 1},
    steps: [{position: 1, title: 'Handling', text: 'Handling\nAdd 20 µl water. Remove supernatant.\nAdd 23 µl water.'}]};
  const model = buildWorkflowModel({id: 'coverage', parts: [{source: 'text', id: 'coverage'}]}, [snapshot]);
  assert.deepEqual(model.lines.map(row => row.sourceLine), [1, 1, 2]);
  assert.equal(reviewImport(snapshot).reading.sourceLines, 2);
});

test('a recognized, nonempty step accounts for its body without omitting the action', () => {
  const result = review('Handling\nAdd 20 µl water.');
  assert.equal(result.reading.sourceLines, 1);
  assert.equal(result.reading.operations, 1);
  assert.deepEqual(result.reading.omitted, []);
  assert.ok(result.flags.every(flag => flag.level !== 'stop'));
});

test('import review exposes each source line and flags multiple liquid quantities in one reading', () => {
  const line = 'Add 25 µl saline and 18 µl water to each well.';
  const result = review(`Handling\n${line}\nAdd 20 µl water to a 1.5 ml tube.`, 'Handling');
  assert.deepEqual(result.reading.source.map(s => s.rows.map(row => [row.number, row.readings.length])), [[[1, 1], [2, 1]], []]);
  assert.equal(result.reading.source[0].rows[0].line, line);
  assert.deepEqual(result.reading.quantities.map(q => q.line), [line]);
  assert.ok(result.flags.some(flag => flag.text.includes('beyond the title')));
});

test('a probable instruction read as a table row is flagged for review', () => {
  const line = 'Add ___ µl of water.';
  const result = review(`${line}\nAdd 20 µl saline.`);
  assert.deepEqual(result.reading.tableInstructions.map(row => row.line), [line]);
  assert.equal(result.reading.operations, 1);
});

test('unanchored step inventory remains visible as a source question', () => {
  const result = reviewImport({schema: 'lab-mcp/protocol-export/1', collection_id: 91, version: {id: 91},
    steps: [{position: 1, title: 'Handling', text: 'Add 20 µl water.',
      inventory: [{name: 'water'}, {name: 'Example stock'}]}]});
  assert.deepEqual(result.reading.source[0].inventoryWithoutAnchor, ['Example stock']);
  assert.ok(result.flags.some(flag => flag.text.includes('inline references or aliases')));
  assert.equal(result.steps.timers, 0);
  assert.ok(result.flags.every(flag => !flag.text.includes('Labstep timer')));
});
