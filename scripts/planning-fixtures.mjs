// Inert water and container examples. No scientific procedure or private source
// was used. A grouped run and an individual-container run exercise the two
// workflow structures from #6, using exact local text-snapshot versions.
import {snapshotFromText} from '../lib/snapshots.js';

const grouped = [
  'Add 20 uL colored water to each well.',
  'Add 20 uL water to each well.',
  'Mix by pipetting up and down 3x.',
  'Incubate at room temperature for 15 min.',
  'Add 20 uL water to each well.',
  'Mix by pipetting up and down 3x.',
  'Add 20 uL colored water to each well.',
  'Mix by pipetting up and down 3x.',
];
const individual = [
  'Add 20 uL colored water to each tube.',
  'Add 10 uL water to each tube.',
  'Mix by pipetting up and down 3x.',
  'Incubate at room temperature for 8 min.',
  'Add 10 uL water to each tube.',
  'Mix by pipetting up and down 3x.',
  'Add 20 uL water to each tube.',
  'Mix by pipetting up and down 3x.',
];
export function planningFixture(structure = 'grouped', scope = 'design', missing = false) {
  const isGrouped = structure === 'grouped';
  const lines = isGrouped ? grouped : individual;
  const steps = lines.map((line, i) =>
    `${i + 1}. Vessel test stage ${i + 1}\n${missing && i === 3 ? 'Incubate at room temperature.' : line}`).join('\n');
  const name = isGrouped ? 'Grouped water test' : 'Individual vessel water test';
  const snapshot = snapshotFromText(name, steps);
  return {
    schema: 'planner/assessment-request/1',
    protocol: {
      workflow: {id: 'synthetic-' + structure, name, parts: [{source: 'text', id: snapshot.id, versionId: snapshot.version.id}],
        format: isGrouped ? 'plate' : 'tube', labware: isGrouped ? 'plate-96-pcr' : 'tube-1.5', defaultWorkload: isGrouped ? 192 : 96},
      snapshots: [snapshot],
      review: {status: 'reviewed_by_caller', evidence_id: 'synthetic-software-fixture-v1'},
    },
    installations: [
      {id: 'example-ot2', modelId: 'ot2', name: 'Example OT-2', access: missing ? 'unknown' : 'yes'},
      {id: 'example-flex', modelId: 'flex', name: 'Example Flex', access: missing ? 'unknown' : 'yes'},
    ],
    decision: {scope, objective: 'labour', workload: isGrouped ? 192 : 96, methodChanges: false},
  };
}

export const benchDevice = 'thermo-multidrop-combi';
export const benchFit = (installation = 'purchase-' + benchDevice) => installation + ':labware:plate-96-pcr:standalone';

export function benchPlanningFixture(workload = 384, extra = '') {
  const steps = ['1. Inert plate test', ...Array(9).fill('Add 10 uL water to each well.'), extra].filter(Boolean).join('\n');
  const snapshot = snapshotFromText('Inert plate test', steps);
  return {
    schema: 'planner/assessment-request/1',
    protocol: {
      workflow: {id: 'symbolic-bench-test', name: snapshot.name, format: 'plate', labware: 'plate-96-pcr', defaultWorkload: workload,
        parts: [{source: 'text', id: snapshot.id, versionId: snapshot.version.id}]},
      snapshots: [snapshot], review: {status: 'reviewed_by_caller', evidence_id: 'synthetic-software-fixture'},
    },
    installations: [],
    decision: {scope: 'design', objective: 'tips-runtime', workload, facts: {[benchFit()]: 'yes'}},
  };
}
