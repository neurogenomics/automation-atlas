import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWorkflowModel, createDecisionRequest, decide, portfolio, setupOptions} from '../lib/work.js';
import {portfolioCsv, portfolioMarkdown, portfolioWorkflowCsv} from '../lib/portfolio.js';
import {snapshotFromText} from '../lib/snapshots.js';
import pipettes from '../content/pipettes.json' with {type: 'json'};
import decks from '../content/decks.json' with {type: 'json'};

const raw = snapshotFromText('Synthetic setup comparison', '1. Generic additions\n' +
  Array(12).fill('Add 10 µl buffer to each well.').join('\n'));
const workflow = {id: 'synthetic-config', name: 'Synthetic setup comparison',
  parts: [{source: 'text', id: raw.id, versionId: raw.version.id}], format: 'plate',
  labware: 'plate-96-pcr', defaultWorkload: 384};
const model = buildWorkflowModel(workflow, [raw]);
const installations = [{id: 'installed-flex', name: 'Synthetic installed Flex', modelId: 'flex'}];
const specs = [
  {id: 'saved', name: 'Saved configuration', handler: 'flex', route: 'deck', pipettes: setupOptions('flex', 'deck').pipettes[0].id},
  {id: 'automatic', name: 'Automatic configuration', handler: 'flex', route: 'deck'},
  {id: 'other', name: 'Other setup', handler: 'starlet', route: 'deck', pipettes: setupOptions('starlet', 'deck').pipettes[0].id},
];
const inputs = [{name: workflow.name, model, runsPerYear: 24}];
const options = {model, installations};

test('missing pipette or deck records exclude real Decide and Portfolio assessments (#295)', () => {
  const design = createDecisionRequest(model);
  const upgrade = createDecisionRequest(model, 'upgrade');
  assert.ok(decide(design, options).shortlist.some(c => c.config.id === 'flex'));
  const before = decide(upgrade, options);
  assert.equal(before.recommended.config.id, 'flex');
  assert.ok(before.unlocks[0].candidate);
  assert.ok(before.access.rows.some(r => r.installation?.id === installations[0].id));
  assert.ok(decide({...upgrade, dispenserFor: before.recommended.id}, options).dispenserTarget);
  const original = portfolio(inputs, specs);
  assert.ok(original.setups.every(s => s.workflows[0].withSetup?.automatedSteps > 0 && s.workflowsRun === 1));

  for (const [catalogue, reason] of [[pipettes, /missing pipette configuration/], [decks, /missing deck capacity/]]) {
    const record = catalogue.handlers.flex;
    try {
      delete catalogue.handlers.flex;
      const afterDesign = decide(design, options);
      assert.ok(!afterDesign.shortlist.some(c => c.config.id === 'flex'));
      const family = afterDesign.families.find(f => f.config.id === 'flex');
      assert.equal(family.best, null);
      assert.equal(family.evaluated, 0);
      assert.match(afterDesign.unassessed.find(h => h.id === 'flex').reason, reason);

      const after = decide({...upgrade, dispenserFor: before.recommended.id}, options);
      assert.equal(after.recommended, null);
      assert.equal(after.unlocks[0].candidate, null);
      assert.equal(after.unlocks[0].tried, null);
      assert.match(after.unlocks[0].reason, reason);
      assert.deepEqual(after.access.rows, []);
      assert.equal(after.dispenserTarget, null);
      assert.deepEqual(after.dispenserOptions, []);

      const p = portfolio(inputs, specs);
      assert.deepEqual(p.setups[0], original.setups.find(s => s.setup.id === 'other'));
      for (const s of p.setups.slice(1)) {
        assert.match(s.unassessed, reason);
        assert.equal(s.workflowsRun, null);
        assert.equal(s.hoursPerYear, null);
        assert.equal(s.cost, null);
        assert.deepEqual(s.questions, []);
        for (const w of s.workflows) {
          assert.equal(w.runs, false);
          assert.match(w.why, reason);
          assert.equal(w.withSetup, null);
          assert.equal(w.savedPerRun, null);
          assert.equal(w.savedHoursPerYear, null);
        }
      }
      assert.equal(p.setups.find(s => s.setup.id === 'saved').setup.pipettes.id, specs[0].pipettes);
      const setupRow = portfolioCsv(p).split('\r\n').find(row => row.startsWith('Saved configuration,')).split(',');
      assert.match(setupRow[6], reason);
      assert.deepEqual(setupRow.slice(11, 13), ['', '']);
      const workflowRow = portfolioWorkflowCsv(p).split('\r\n').find(row => row.startsWith('Saved configuration,')).split(',');
      assert.equal(workflowRow[5], 'not assessed');
      assert.match(workflowRow[6], reason);
      assert.deepEqual(workflowRow.slice(8, 11), ['', '', '']);
      assert.match(portfolioMarkdown(p), /\| Saved configuration \| — \| Not assessed \| — \| — \| — \|/);
      assert.match(portfolioMarkdown(portfolio(inputs, [specs[0]])), /1 candidate setup\. 0 setups assessed\./);
    } finally {
      catalogue.handlers.flex = record;
    }
  }
  assert.throws(() => portfolio(inputs, [{...specs[0], pipettes: 'not-a-known-option'}]), /unknown pipette configuration/);
  assert.deepEqual(portfolio(inputs, specs), original);
});
