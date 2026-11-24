// Fixed inert route summaries. There are four feasible routes. The operator
// cutoff for simplest, cost and walk-away is 52 minutes (100 − 0.8 × 60).
import test from 'node:test';
import assert from 'node:assert/strict';
import {rankCandidates} from '../lib/work.js';
import fixture from './fixtures/decision-ranking-oracle.json' with {type: 'json'};

const exact = n => ({lo:n, hi:n});
const makeRoute = r => ({
  id:r.id,
  installation:{kind:'existing'},
  metrics:{active:exact(r.active), visits:exact(r.visits), longestWalkAway:exact(r.walkaway)},
  cost:{instrumentPriced:true, missing:[], new:exact(r.cost)},
  facts:[],
  physicalIssues:r.feasible ? [] : [{kind:'overflow', severity:'impossible'}],
  providers:Array.from({length:r.modules}, () => ({via:'module'})),
  tipRuntime:{tips:exact(r.tips), elapsed:exact(r.elapsed)},
});
const baseline = {active:exact(fixture.baselineOperatorMinutes)};
const routes = fixture.candidates.map(makeRoute);
const feasible = routes.filter(c => !c.physicalIssues.length);

for (const [objective, expected] of Object.entries(fixture.handCalculated)) {
  test(`independent ranking oracle for ${objective}`, () => {
    assert.equal(rankCandidates(feasible, objective, baseline)[0]?.id, expected.id, 'feasible comparison');
    const withBlocked = rankCandidates(routes, objective, baseline);
    assert.equal(withBlocked[0]?.id, expected.id, 'including an impossible distractor');
    assert.ok(withBlocked.every(c => !c.physicalIssues.length), 'every ranked route is physically feasible');
  });
}
