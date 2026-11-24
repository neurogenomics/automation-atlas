import {verifyWashComparison} from './wash-comparison.js';

const schema = 'planner/wash-observations/1';
const labourCategories = ['setup', 'replenishment', 'active_processing', 'attended_waits',
  'manual_transfers', 'quality_control', 'exception_recovery', 'cleanup'];
const runFields = ['evidence_ref', 'outputs_attempted', 'outputs_passing', 'failed',
  'operator_minutes', 'elapsed_minutes', 'cost_gbp'];
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fields = (value, keys) => isRecord(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key));
const reference = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && value === value.trim();
const count = value => Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000;
const measurement = value => value === null || (Number.isFinite(value) && value >= 0 && value <= 10_000_000);
const oneRun = () => ({evidence_ref:'', outputs_attempted:null, outputs_passing:null, failed:null,
  operator_minutes:Object.fromEntries(labourCategories.map(key => [key,null])), elapsed_minutes:null, cost_gbp:null});
const sum = values => values.reduce((a,b) => a+b,0);
const complete = (values, aggregate) => values.every(value => value !== null) ? aggregate(values) : null;
function median(values) {
  const sorted = values.slice().sort((a,b) => a-b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function washObservationTemplate(comparison) {
  return {schema, comparison, basis:'observed', output_unit:'', qc_ref:'',
    candidate:{method:'',execution:''}, pairs:[{id:'pair-1',matching_ref:'',inputs_per_run:null,manual:oneRun(),candidate:oneRun()}]};
}

function checkRun(run, pairIndex, arm) {
  if (!fields(run, runFields) || !reference(run.evidence_ref) || !count(run.outputs_attempted) ||
      !count(run.outputs_passing) || run.outputs_passing > run.outputs_attempted || typeof run.failed !== 'boolean' ||
      !fields(run.operator_minutes, labourCategories) || !Object.values(run.operator_minutes).every(measurement) ||
      !measurement(run.elapsed_minutes) || !measurement(run.cost_gbp)) {
    throw Error(`Complete the ${arm} run counts, evidence and measurements for pair ${pairIndex + 1}.`);
  }
}

const minutesOf = run => complete(Object.values(run.operator_minutes),sum);
const minutesPerPass = (minutes, passing) => minutes !== null && passing > 0 ? minutes / passing : null;

function summarizeArm(runs) {
  const operator = runs.map(minutesOf);
  const passing = sum(runs.map(run => run.outputs_passing));
  const attempted = sum(runs.map(run => run.outputs_attempted));
  const minutes = complete(operator,sum);
  const cost = complete(runs.map(run => run.cost_gbp),sum);
  return {runs:runs.length, failed_runs:runs.filter(run => run.failed).length,
    outputs_attempted:attempted, outputs_passing:passing, operator_minutes:minutes,
    runs_with_operator_minutes:operator.filter(value => value !== null).length,
    operator_minutes_per_passing_output:minutesPerPass(minutes,passing),
    elapsed_minutes_median:complete(runs.map(run => run.elapsed_minutes),median),
    cost_gbp:cost, cost_gbp_per_passing_output:minutesPerPass(cost,passing)};
}

export function summarizeWashObservations(current, input) {
  if (!current?.scopeReady) throw Error('Resolve the source-pinned scope and retained material first.');
  if (!fields(input,['schema','comparison','basis','output_unit','qc_ref','candidate','pairs']) ||
      input.schema !== schema || input.basis !== 'observed' || !Array.isArray(input.pairs) ||
      !input.pairs.length || input.pairs.length > 200 ||
      !reference(input.output_unit) || !reference(input.qc_ref) || !fields(input.candidate,['method','execution'])) {
    throw Error('Supply observed pairs, a shared output unit and a quality-control reference.');
  }
  const replay = verifyWashComparison(input.comparison,current);
  if (!replay.matches) throw Error(replay.reason);
  const route = current.routes.find(row => row.method === input.candidate.method && row.execution === input.candidate.execution);
  if (!route || (route.method === 'as-written' && route.execution === 'manual')) {
    throw Error('Choose a candidate route distinct from the as-written manual comparator.');
  }
  const pairIds = new Set(), runRefs = new Set();
  const inputsPerRun = input.pairs[0]?.inputs_per_run;
  for (const [index,pair] of input.pairs.entries()) {
    if (!fields(pair,['id','matching_ref','inputs_per_run','manual','candidate']) ||
        !reference(pair.id) || pairIds.has(pair.id) || !reference(pair.matching_ref) ||
        !count(pair.inputs_per_run) || pair.inputs_per_run === 0) {
      throw Error(`Supply a unique ID, matching evidence and input count for pair ${index + 1}.`);
    }
    if (pair.inputs_per_run !== inputsPerRun) throw Error('Use the same input count for every pair in this summary.');
    pairIds.add(pair.id);
    for (const arm of ['manual','candidate']) {
      const run = pair[arm];
      checkRun(run,index,arm);
      if (runRefs.has(run.evidence_ref)) throw Error(`A run evidence reference repeats in pair ${index + 1}.`);
      runRefs.add(run.evidence_ref);
    }
  }
  const manual = summarizeArm(input.pairs.map(pair => pair.manual));
  const candidate = summarizeArm(input.pairs.map(pair => pair.candidate));
  const delta = (left,right) => left === null || right === null ? null : right-left;
  const paired = input.pairs.map(pair => delta(minutesPerPass(minutesOf(pair.manual),pair.manual.outputs_passing),
    minutesPerPass(minutesOf(pair.candidate),pair.candidate.outputs_passing))).filter(value => value !== null);
  return {basis:'observed', output_unit:input.output_unit, qc_ref:input.qc_ref,
    candidate_label:`${route.methodLabel} · ${route.executionLabel}`, matched_pairs:input.pairs.length, inputs_per_run:inputsPerRun,
    manual, candidate,
    delta_minutes_per_passing_output:delta(manual.operator_minutes_per_passing_output,candidate.operator_minutes_per_passing_output),
    paired_delta:paired.length ? {count:paired.length, median:median(paired), min:Math.min(...paired), max:Math.max(...paired)} : null};
}
