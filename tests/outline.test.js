// Outline-based block assessment (#373). Synthetic protocol and outlines only
// (tests/helpers/outline-fixture.js); expected values are written by hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildWorkflowModel, portfolio, simulate} from '../lib/work.js';
import {readOutline, bindOutline} from '../lib/outline.js';
import {workflowBlocks, assessBlocks, CHECKED, UNCHECKED} from '../lib/outline-assessment.js';
import {synthetic, outline, fact, flex} from './helpers/outline-fixture.js';

const {raw, workflow} = synthetic();
const blocksOf = (o, workload = 24, snap = raw) => workflowBlocks(workflow, [snap], [o], workload);
const totals = entries => assessBlocks(entries, [flex])[0].blocks.map(b => b.handsOn !== null);
const P3 = '/state/content/3';
const B1 = {binding: {outline: 'outline-synthetic', revision: 'outline-revision-1', contentDigest: `sha256:${'c'.repeat(64)}`, protocol: 'synthetic-protocol',
  collection: '910001', version: '910002', exportHash: raw.content_hash, claim: null}};

test('an outline with every fact known is assessed block by block with no declared input', () => {
  const entries = blocksOf(outline(raw));
  assert.deepEqual(entries.map(e => [e.id, e.source.from, e.source.through, e.workload, e.missing.length]), [
    ['910001:b1', 1, 3, 24, 0],   // 24 units enter
    ['910001:b2', 4, 5, 12, 0],   // pooling 2 -> 1 halves them
    ['910001:b3', 6, 6, 48, 0],   // redistribution 1 -> 4 quadruples them
  ]);
  const [b1, b2] = entries;
  assert.equal(b1.model.labware.id, 'plate-96-pcr');
  assert.equal(b1.model.block.input.volumeUl, 20);
  assert.equal(b1.model.materialBoundaries, undefined);
  assert.deepEqual(b1.model.outlineBoundaries.map(b => [b.operation, b.fact]), [['pool', 'pool-1']]);
  assert.deepEqual(b2.model.outlineBoundaries.map(b => [b.operation, b.fact]), [['distribute', 'split-2']]);
  assert.equal(simulate(b1.model, 24, null).physical.steps[0].before.ul, 20);
  // Both endpoints read in full and consistent: 'columns 2-3' (16) into 'column 1' (8) is 2 to 1; 'column 1' (8) across 'columns 2-5' (32) is 1 to 4.
  assert.deepEqual(entries.map(e => [e.boundaries, e.provisional, e.provisionalBecause]), [
    [[{fact: 'pool-1', kind: 'pooling', basis: CHECKED}], false, []],
    [[{fact: 'split-2', kind: 'redistribution', basis: CHECKED}], false, []],
    [[], false, []]]);
  const [row] = assessBlocks(entries, [flex]);
  const r1 = row.blocks[0];
  assert.deepEqual(r1.conflicts, []);
  assert.deepEqual(r1.rests, {...B1, label: {status: 'agent-drafted'}, facts: [
    {fact: 'vessel-1', kind: 'vessel', status: 'agent-drafted', claim: null, used: true},
    {fact: 'vol-1', kind: 'working-volume', status: 'agent-drafted', claim: null, used: true},
    {fact: 'equip-1', kind: 'equipment', status: 'agent-drafted', claim: null, used: false},
    {fact: 'repeat-2', kind: 'repeat-count', status: 'agent-drafted', claim: null, used: false},
    {fact: 'pool-1', kind: 'pooling', status: 'agent-drafted', claim: null, used: true},
  ]});
  for (const b of row.blocks) {
    assert.equal(b.withheld, null);
    assert.ok(b.handsOn.byHand.lo > 0);
  }
  // Steps 1-3 are an addition, a pipette mix and the pool transfer.
  assert.equal([...Object.values(r1.automated), ...Object.values(r1.manual)].reduce((a, n) => a + n, 0), 3);
});

test('an unknown working volume withholds that block only and names the fact', () => {
  const entries = blocksOf(outline(raw, {volumes: {b2: null}}));
  assert.deepEqual(entries.map(e => e.missing), [[], [{fact: 'vol-2', need: 'working-volume value'}], []]);
  assert.deepEqual(entries.map(e => e.workload), [24, 12, 48]);
  const [, b2] = assessBlocks(entries, [flex])[0].blocks;
  assert.deepEqual(totals(entries), [true, false, true]);
  assert.deepEqual(b2.withheld, [{fact: 'vol-2', need: 'working-volume value'}]);
  // Steps 4 and 5 are both liquid transfers, which the setup's pipettes can do.
  assert.deepEqual(b2.couldAutomate, {'liquid-transfer': 2});
  assert.deepEqual(b2.stayManual, {});
});

test('an unknown boundary cardinality withholds its block and the blocks whose unit count depends on it', () => {
  const entries = blocksOf(outline(raw, {split: {inputs: 1, outputs: null}}));
  assert.deepEqual(entries.map(e => [e.workload, e.missing]), [
    [24, []],
    [12, [{fact: 'split-2', need: 'redistribution outputs'}]],
    [null, [{fact: 'split-2', need: 'unit count entering this block', cause: {fact: 'split-2', need: 'redistribution outputs', block: '910001:b2'}}]],
  ]);
  assert.deepEqual(totals(entries), [true, false, false]);
});

const parsedPool = {fact: null, need: 'pooling fact on this step', chunkId: 'labstep-910001-3', bodyLine: 1, at: P3};
const downstream = cause => [{fact: cause.fact, need: 'unit count entering this block', cause: {...cause, block: '910001:b1'}}];

test('a parsed boundary without an outline fact leaves every later unit count unknown', () => {
  const entries = blocksOf(outline(raw, {drop: ['pool-1']}));
  assert.deepEqual(entries.map(e => e.missing), [[parsedPool], downstream(parsedPool), downstream(parsedPool)]);
  assert.deepEqual(entries.map(e => e.workload), [24, null, null]);
  assert.equal(entries[0].model.materialBoundaries.length, 1);
  assert.deepEqual(totals(entries), [false, false, false]);
});

test('a boundary fact on the wrong step or of the wrong kind resolves nothing and moves no count', () => {
  for (const o of [outline(raw, {move: {'pool-1': 2}}), outline(raw, {kinds: {'pool-1': 'redistribution'}})]) {
    const entries = blocksOf(o);
    const pool = o.blocks[0].facts.find(f => f.id === 'pool-1');
    assert.deepEqual(entries[0].missing, [parsedPool, {fact: 'pool-1', need: 'outline and parsed reading agree', conflict: 'boundary'}]);
    assert.deepEqual(entries[0].conflicts, [{kind: 'boundary', fact: 'pool-1', outline: {kind: pool.kind, inputs: 2, outputs: 1}, parsed: null,
      detail: `No parsed ${pool.kind} instruction on the fact's evidence step.`, at: [pool.evidence[0].span.pointer]}]);
    assert.deepEqual(entries.slice(1).map(e => e.missing), [downstream(parsedPool), downstream(parsedPool)]);
    assert.deepEqual(totals(entries), [false, false, false]);
  }
});

test('one fact cannot resolve two pooling instructions on the same step', () => {
  const twice = synthetic({3: 'Pool water from columns 2-3 into column 1.\nPool water from columns 5-6 into column 4.'}).raw;
  const entries = blocksOf(outline(twice), 24, twice);
  const each = bodyLine => ({fact: 'pool-1', need: 'one pooling fact for each pooling instruction on this step', chunkId: 'labstep-910001-3', bodyLine, at: P3, candidates: ['pool-1']});
  assert.deepEqual(entries[0].missing, [each(1), each(2)]);
  assert.equal(entries[0].model.outlineBoundaries.length, 0);
  assert.deepEqual(entries.slice(1).map(e => e.missing), [downstream(each(1)), downstream(each(1))]);
  assert.deepEqual(totals(entries), [false, false, false]);
});

test('an outline bound to another collection, version or hash is refused with an exact error', () => {
  assert.throws(() => blocksOf(outline(raw, {versionId: '910099'})), {message: 'Outline outline-synthetic is bound to version 910099; the snapshot being assessed is version 910002.'});
  assert.throws(() => blocksOf(outline(raw, {exportHash: `sha256:${'1'.repeat(64)}`})),
    {message: `Outline outline-synthetic is bound to export hash sha256:${'1'.repeat(64)}; the snapshot being assessed has ${raw.content_hash}.`});
  assert.throws(() => bindOutline(outline(raw, {collectionId: '910003'}), raw), {message: 'Outline outline-synthetic is bound to collection 910003; the snapshot being assessed is collection 910001.'});
  const native = synthetic({}, {version_hash: `sha256:${'b'.repeat(64)}`}).raw;
  assert.throws(() => bindOutline(outline(native, {versionHash: null}), native), {message: `Outline outline-synthetic has no version hash; the snapshot being assessed has sha256:${'b'.repeat(64)}.`});
  assert.throws(() => bindOutline(outline(native, {versionHash: `sha256:${'e'.repeat(64)}`}), native),
    {message: `Outline outline-synthetic is bound to version hash sha256:${'e'.repeat(64)}; the snapshot being assessed has sha256:${'b'.repeat(64)}.`});
  assert.equal(bindOutline(outline(native), native).snapshot.nativeVersionHashChecked, true);
  assert.equal(bindOutline(outline(raw), raw).snapshot.nativeVersionHashChecked, false);
});

test('disagreeing volume and repeat count are returned with both values and withhold that block', () => {
  const o = outline(raw, {layout: [['b1', [1]], ['b2', [2, 3]], ['b3', [4, 5]], ['b4', [6]]], volumes: {b2: '75'}, repeat: 2});
  const entries = blocksOf(o);
  const [, b2] = assessBlocks(entries, [flex])[0].blocks;
  assert.deepEqual(b2.conflicts, [
    {kind: 'repeat-count', fact: 'repeat-2', outline: 2, parsed: 3, at: ['/state/content/2']},
    // Step 1 adds 40 uL to the outline's 20 uL: the parser reads 60 uL entering step 2.
    {kind: 'working-volume', fact: 'vol-2', outline: 75, parsed: 60, detail: 'Running volume the parser reads at the end of the previous block.', at: '/state/content/2'},
  ]);
  assert.deepEqual(b2.withheld, [
    {fact: 'repeat-2', need: 'outline and parsed reading agree', conflict: 'repeat-count'},
    {fact: 'vol-2', need: 'outline and parsed reading agree', conflict: 'working-volume'},
  ]);
  assert.equal(b2.handsOn, null);
  // The pooling in b2 is matched, so b3 enters with half the units and is assessed.
  assert.deepEqual(entries.map(e => e.workload), [24, 24, 12, 48]);
  assert.deepEqual(totals(entries), [true, false, true, true]);
});

test('a vessel conflict names the parsed container, the outline labware and the pointer', () => {
  const tube = synthetic({6: 'Transfer 10 uL into a fresh 1.5 ml tube.'}).raw;
  const entries = blocksOf(outline(tube), 24, tube);
  assert.deepEqual(entries[2].conflicts, [{kind: 'vessel', fact: 'vessel-3', outline: 'plate-96-pcr', parsed: 'tube',
    at: {chunkId: 'labstep-910001-6', bodyLine: 1, pointer: '/state/content/6'}}]);
  assert.deepEqual(entries[2].missing, [{fact: 'vessel-3', need: 'outline and parsed reading agree', conflict: 'vessel'}]);
});

test('a confirmation is an attributed claim and is ignored when it names other content or binding', () => {
  const claimed = readOutline(outline(raw, {confirmation: 'same'}));
  assert.deepEqual(claimed.claim, {decisionId: 'decision-1', who: 'synthetic-person', issuer: 'protocol-portal/local-workstation', when: '2026-11-22T10:00:00Z', verified: false});
  const digest = readOutline(outline(raw, {confirmation: 'other-digest'}));
  assert.equal(digest.claim, null);
  assert.equal(digest.claimIgnored, 'The confirmation names a different content digest from this outline, so it is ignored.');
  const binding = readOutline(outline(raw, {confirmation: 'other-binding'}));
  assert.equal(binding.claim, null);
  assert.equal(binding.claimIgnored, 'The confirmation names a different binding from this outline, so it is ignored.');
  assert.equal(blocksOf(outline(raw, {confirmation: 'same'}))[0].rests.facts[0].claim, 'person-confirmed claim (unverified)');
  const zero = outline(raw);
  zero.blocks[0].facts = [fact('vol-x', 'working-volume', {value: '0', unit: 'uL', basis: 'stated', per: 'per well'}, 1)];
  assert.throws(() => readOutline(zero), {message: 'Outline outline-synthetic block b1 fact vol-x: working volume must be a positive decimal string or null.'});
});

test('the Portal synthetic example is read with its unknowns kept unknown', () => {
  const portal = JSON.parse(readFileSync(new URL('./fixtures/outline/portal-valid.json', import.meta.url), 'utf8'));
  const o = readOutline(portal);
  const facts = Object.fromEntries(o.blocks[0].facts.map(f => [f.kind, f]));
  assert.equal(facts['working-volume'].volumeUl, null);
  assert.equal(facts.vessel.labwareId, null);
  assert.deepEqual([facts.pooling.inputs, facts.pooling.outputs, facts.redistribution.inputs, facts.redistribution.outputs], [null, 1, 1, null]);
  assert.equal(facts['repeat-count'].count, 2);
  assert.equal(o.claim, null);
});

test('without outlines a workflow takes the unchanged path', () => {
  const [entry] = workflowBlocks(workflow, [raw], [], 24);
  assert.deepEqual(entry.model, buildWorkflowModel(workflow, [raw]));
  const [blocked] = assessBlocks([entry], [flex])[0].blocks;
  assert.deepEqual(blocked.withheld, [{fact: null, need: 'protocol review',
    detail: 'Review pooling and redistribution boundaries to identify their vessels and quantities, or assess a block that excludes them.'}]);
  // Without boundaries, totals equal the default portfolio's.
  const plain = synthetic({3: 'Add 5 uL water to each well.', 5: 'Add 5 uL buffer to each well.'}).raw;
  const [whole] = workflowBlocks(workflow, [plain], [], 24);
  const [row] = assessBlocks([whole], [flex])[0].blocks;
  const direct = portfolio([{id: 'w', group: 'g', workload: 24, model: buildWorkflowModel(workflow, [plain])}], [flex]).setups[0].workflows[0];
  assert.deepEqual([row.runs, row.handsOn.byHand, row.handsOn.saved], [direct.runs, direct.baseline.active, direct.savedPerRun]);
  // The step detail is opt-in: the default portfolio rows keep their shape.
  assert.equal('steps' in direct, false);
});

const uncoveredCause = position => ({fact: null, need: 'outline block covering this step', position, pointer: null, block: null});
const after = position => [{fact: null, need: 'unit count entering this block', cause: uncoveredCause(position)}];

test('a step no block covers leaves every later count unknown', () => {
  const o = outline(raw, {layout: [['b1', [1, 2]], ['b2', [4, 5]], ['b3', [6]]], unresolved: [{pointer: P3, reason: 'Synthetic: not drafted'}]});
  const entries = blocksOf(o);
  assert.deepEqual(entries.map(e => [e.id, e.workload, e.missing]), [['910001:b1', 24, []], ['910001:b2', null, after(3)], ['910001:b3', null, after(3)]]);
  assert.deepEqual(totals(entries), [true, false, false]);
  // No evidence carries step 3's GUID, so its unresolved pointer cannot be placed; both are reported.
  assert.deepEqual(entries.uncoveredSteps, [{collection: 910001, position: 3, guid: 'g3', pointer: null, reason: null, hasContent: true}]);
  assert.deepEqual(entries.unplacedUnresolved, [{collection: 910001, pointer: P3}]);
});

test('uncovered count-changing sentences the parser does not read as boundaries still withhold later blocks', () => {
  for (const sentence of ['Pool the samples.', 'Combine all samples into a single well.']) {
    const snap = synthetic({4: sentence}).raw;
    const entries = blocksOf(outline(snap, {layout: [['b1', [1, 2, 3]], ['b3', [5]]]}), 24, snap);
    assert.deepEqual(entries.map(e => [e.id, e.workload, e.missing]), [['910001:b1', 24, []], ['910001:b3', null, after(4)]]);
    assert.deepEqual(totals(entries), [true, false]);
  }
});

test('an outline that puts a source step or an operation in two blocks is refused', () => {
  const o = outline(raw, {layout: [['b1', [1, 2, 3]], ['b2', [3]], ['b3', [4, 5]], ['b4', [6]]]});
  o.blocks[1].facts = o.blocks[1].facts.map(f => ({...f, id: `${f.id}-again`}));
  assert.throws(() => blocksOf(o), {message: 'Outline outline-synthetic puts source step /state/content/3 in blocks b1 and b2.'});
  const ops = outline(raw);
  ops.blocks[0].operation_ids = ['op-1'];
  ops.blocks[2].operation_ids = ['op-1'];
  assert.throws(() => blocksOf(ops), {message: 'Outline outline-synthetic puts operation op-1 in blocks b1 and b3.'});
});

test('blocks listed out of source order are taken in source order and flagged', () => {
  const listed = blocksOf(outline(raw, {layout: [['b2', [4, 5]], ['b1', [1, 2, 3]], ['b3', [6]]]}));
  const ordered = blocksOf(outline(raw));
  const view = entries => entries.map(e => [e.id, e.source.from, e.workload, e.missing, e.conflicts]);
  assert.deepEqual(view(listed), view(ordered));
  assert.deepEqual(view(listed).map(([id, , workload]) => [id, workload]), [['910001:b1', 24], ['910001:b2', 12], ['910001:b3', 48]]);
  assert.equal(listed.blocksReordered, true);
  assert.equal(ordered.blocksReordered, false);
  assert.deepEqual(totals(listed), [true, true, true]);
});

test('a pooling fact whose direction runs against its kind moves no count', () => {
  const entries = blocksOf(outline(raw, {pool: {inputs: 1, outputs: 2}}));
  const need = 'pooling with no more outputs than inputs';
  assert.deepEqual(entries[0].missing, [{fact: 'pool-1', need}]);
  assert.deepEqual(entries.slice(1).map(e => e.missing), [downstream({fact: 'pool-1', need}), downstream({fact: 'pool-1', need})]);
  assert.deepEqual(entries.map(e => e.workload), [24, null, null]);
  assert.deepEqual(totals(entries), [false, false, false]);
});

test('a pooling fact whose counts disagree with the parsed positions is a conflict', () => {
  // Columns 2-3 (16 wells) into column 1 (8 wells) is 2 to 1, not 3 to 1.
  const entries = blocksOf(outline(raw, {pool: {inputs: 3, outputs: 1}}));
  assert.deepEqual(entries[0].conflicts, [{kind: 'boundary', fact: 'pool-1', outline: {kind: 'pooling', inputs: 3, outputs: 1},
    parsed: {operation: 'pool', donorPositions: 16, recipientPositions: 8}, at: P3}]);
  assert.deepEqual(entries[0].missing, [{fact: 'pool-1', need: 'outline and parsed reading agree', conflict: 'boundary'}]);
  assert.deepEqual(entries.slice(1).map(e => e.workload), [null, null]);
  assert.deepEqual(totals(entries), [false, false, false]);
});

const provisionalPool = [{fact: 'pool-1', status: 'agent-drafted', claim: null}];

test('positions on one side only leave the boundary unchecked and later blocks provisional', () => {
  const single = synthetic({3: 'Pool the water into a single well.'}).raw;
  const entries = blocksOf(outline(single), 24, single);
  assert.deepEqual(entries.map(e => [e.workload, e.missing, e.conflicts]), [[24, [], []], [12, [], []], [48, [], []]]);
  assert.deepEqual(entries[0].boundaries, [{fact: 'pool-1', kind: 'pooling', basis: UNCHECKED}]);
  assert.deepEqual(entries.map(e => [e.provisional, e.provisionalBecause]), [[true, provisionalPool], [true, provisionalPool], [true, provisionalPool]]);
  assert.deepEqual(totals(entries), [true, true, true]);
});

test('endpoints read only in part are unchecked, never checked, and make later blocks provisional', () => {
  for (const sentence of ['Pool column 2 into an 8-well strip.', 'Pool row A and column 2 into column 1.', 'Pool columns 2-3 and 5-6 into column 1.']) {
    const snap = synthetic({3: sentence}).raw;
    const entries = blocksOf(outline(snap), 24, snap);
    assert.deepEqual(entries[0].boundaries, [{fact: 'pool-1', kind: 'pooling', basis: UNCHECKED}], sentence);
    assert.deepEqual(entries.map(e => [e.workload, e.missing, e.provisional, e.provisionalBecause]),
      [[24, [], true, provisionalPool], [12, [], true, provisionalPool], [48, [], true, provisionalPool]], sentence);
  }
});

test('a redistribution to wells the destination plate does not have withholds it and what follows', () => {
  const wide = synthetic({5: 'Distribute the pooled water across wells A1 to A100.'}).raw;
  const entries = blocksOf(outline(wide, {split: {inputs: 1, outputs: 100}}), 24, wide);
  const need = 'positions within plate-96-pcr (8 rows × 12 columns)';
  assert.deepEqual(entries[1].missing, [{fact: 'split-2', need, at: '/state/content/5'}]);
  assert.deepEqual(entries[2].missing, [{fact: 'split-2', need: 'unit count entering this block', cause: {fact: 'split-2', need, block: '910001:b2'}}]);
  assert.deepEqual(totals(entries), [true, false, false]);
});

test('a fractional unit count withholds the boundary block itself and what follows', () => {
  const single = synthetic({3: 'Pool the water into a single well.'}).raw;
  const entries = blocksOf(outline(single, {pool: {inputs: 5, outputs: 1}}), 24, single);
  const need = 'whole-number unit count after this boundary (24 × 1 ÷ 5)';
  assert.deepEqual(entries[0].missing, [{fact: 'pool-1', need}]);
  assert.deepEqual(entries.slice(1).map(e => e.missing), [downstream({fact: 'pool-1', need}), downstream({fact: 'pool-1', need})]);
  assert.deepEqual(totals(entries), [false, false, false]);
});

test('an outline covering part of a protocol withholds blocks after an uncovered step and lists it', () => {
  const plain = synthetic({5: 'Add 5 uL buffer to each well.'}).raw;
  const gapped = blocksOf(outline(plain, {layout: [['b1', [1, 2, 3]], ['b3', [6]]], drop: ['split-2']}), 24, plain);
  assert.deepEqual(gapped.map(e => [e.id, e.workload, e.missing]), [['910001:b1', 24, []], ['910001:b3', null, after(4)]]);
  assert.deepEqual(gapped.uncoveredSteps.map(u => u.position), [4, 5]);
  // An uncovered step after the last block affects no block.
  const o = outline(raw, {layout: [['b1', [1, 2, 3]], ['b2', [4, 5]]], unresolved: [{pointer: '/state/content/6', reason: 'Synthetic: not drafted'}]});
  const entries = blocksOf(o);
  assert.deepEqual(entries.map(e => [e.id, e.workload, e.missing]), [['910001:b1', 24, []], ['910001:b2', 12, []]]);
  assert.deepEqual(totals(entries), [true, true]);
  assert.deepEqual(entries.uncoveredSteps, [{collection: 910001, position: 6, guid: 'g6', pointer: null, reason: null, hasContent: true}]);
  assert.deepEqual(entries.unplacedUnresolved, [{collection: 910001, pointer: '/state/content/6'}]);
});

test('a boundary is checked only when its endpoints account for the whole original line', () => {
  for (const sentence of ['Pool columns 2-3 (and columns 5-6) into column 1.', 'Pool columns 2-3 into column 1 (and column 4).',
    'Using a multichannel pipette, pool columns 2-3 into column 1.', 'Pool columns 2-3 into column 1 twice.']) {
    const snap = synthetic({3: sentence}).raw;
    const entries = blocksOf(outline(snap), 24, snap);
    assert.deepEqual(entries[0].boundaries, [{fact: 'pool-1', kind: 'pooling', basis: UNCHECKED}], sentence);
    assert.deepEqual(entries.map(e => [e.provisional, e.provisionalBecause]), [[true, provisionalPool], [true, provisionalPool], [true, provisionalPool]], sentence);
  }
});
