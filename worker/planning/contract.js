import {reject} from '../../lib/reviewed/json.js';

export const PREFIX = '/api/planning/v1/';
export const REQUEST = 'planner/assessment-request/1';
export const PORTABLE = 'planner/assessment-workspace/1';
export const LIMITS = {request_bytes: 256 * 1024, response_bytes: 1024 * 1024, snapshots: 6,
  steps: 80, actions: 100, repeats_per_action: 32, total_repeats: 192, samples: 192, installations: 8, simulation_work: 3000000};
const schema = 'https://json-schema.org/draft/2020-12/schema';
const txt = (maxLength, minLength = 1) => ({type: 'string', minLength, maxLength});
const num = (maximum, minimum = 0, type = 'number') => ({type, minimum, maximum});
const count = (max, min = 1) => num(max, min, 'integer');
const token = {type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'};
const candidateId = txt(1200);
const digest = {type: 'string', pattern: '^sha256:[0-9a-f]{64}$'};
const ref = name => ({$ref: '#/$defs/' + name});
const list = (items, maxItems, minItems = 0) => ({type: 'array', items, maxItems, minItems});
const one = (...values) => ({enum: values});
const nullable = value => ({anyOf: [value, {type: 'null'}]});
const obj = (properties, required = Object.keys(properties)) => ({type: 'object', additionalProperties: false, properties, required});
const map = (value, maxProperties) => ({type: 'object', additionalProperties: value, maxProperties});
const id = {anyOf: [token, count(Number.MAX_SAFE_INTEGER, 0)]};
const url = {type: 'string', maxLength: 2048, pattern: '^(?:$|https://[^\\s]+$)'};
const when = nullable(txt(50));
const yesno = one('yes', 'no', 'unknown');
const bool = {type: 'boolean'};
const record = {type: 'object'};
const range = obj({lo: {type: 'number'}, hi: {type: 'number'}});
const pin = {source: one('text', 'protocolsio', 'labstep'), id, versionId: id};
const source = obj({title: nullable(txt(4000)), url: nullable(url)});
const providerLinks = [
  {provider: 'Jisc Equipment Data', url: 'https://equipment.data.ac.uk/', purpose: 'equipment discovery'},
  {provider: 'OpenIRIS', url: 'https://openiris.io/landing/', purpose: 'institutional facility access'},
  {provider: 'Agilent iLab', url: 'https://help.ilab.agilent.com/99540-getting-started-with-ilab/300394-list-all-cores.html', purpose: 'find a core'},
  {provider: 'Imperial ROAR', url: 'https://www.imperial.ac.uk/rapid-online-analysis-of-reactions/access-roar/', purpose: 'facility access and PPMS guidance'},
];
export const definitions = {
  capability_claim: obj({id: token, model_id: token, operation: token, origin: one('native', 'optional', 'external'),
    evidence: list(obj({id: txt(400), url, version: nullable(txt(128))}), 30), assurance: one('catalogue_reference')}),
  installation_profile: obj({id: token, modelId: token, name: txt(160), owner: txt(160, 0), access: yesno,
    arrangement: one('own', 'borrow', 'core'), chargePerRun: nullable(num(1000000)), chargePerHour: nullable(num(1000000)),
    travelMinutes: nullable(num(1440)), installedHeads: obj({
      status: one('confirmed', 'reported', 'unknown', 'conflicting'),
      heads: list(obj({id: token, channels: count(384)}), 16),
    }), options: map(yesno, 50), builds: map(one('planned', 'built', 'validated'), 30)}, ['id', 'modelId', 'access']),
  operation_route: obj({id: candidateId, installation_id: token, model_id: token, route: one('deck', 'connected', 'workcell', 'standalone'),
    head_id: nullable(txt(200)), eligibility: one('in_scope'), metrics: record,
    cost: obj({new_gbp: nullable(range), complete: bool, missing: list(txt(800), 500)}),
    evidence_ids: obj({prices: list(txt(500), 1500), facts: list(txt(1000), 500), literature: list(url, 500)}),
    facts: list(obj({id: txt(1000), type: token, status: txt(60), source: nullable(source)}), 500),
    physical_issues: list(record, 500), tip_runtime: ref('tip_runtime')},
  ['id', 'installation_id', 'model_id', 'route', 'head_id', 'eligibility', 'metrics', 'cost', 'evidence_ids', 'facts', 'physical_issues']),
  tip_runtime: obj({tips: nullable(range), elapsed: nullable(range), addition_spread_upper_min: nullable(num(10000000)),
    reagent_extra_uL: nullable(range), unresolved: bool}),
  action_mechanism: obj({configuration_id: candidateId, mechanism: txt(80), tip_free_addition: bool, tips: nullable(range),
    action_minutes: nullable(range), reagent_extra_uL: nullable(range), timing_sources: list(url, 30),
    addition_spread_upper_min: nullable(num(10000000))}),
  protocol_model: obj({
    workflow: obj({id: token, name: txt(160), parts: list(obj({...pin, contentHash: digest}, Object.keys(pin)), LIMITS.snapshots, 1),
      format: one('plate', 'tube'), labware: token, defaultWorkload: count(LIMITS.samples), workloadLabel: txt(80),
      branches: map({anyOf: [txt(80), list(txt(80), 12, 1)]}, LIMITS.steps),
      block: obj({...pin, from: count(1000000), through: count(1000000),
        input: obj({labware: token, volumeUl: nullable(num(25000)), evidence: nullable(txt(256))})})},
    ['id', 'name', 'parts', 'format', 'defaultWorkload']),
    snapshots: list(ref('snapshot'), LIMITS.snapshots, 1),
    review: obj({status: one('reviewed_by_caller'), evidence_id: txt(256)}),
    overrides: list(obj({...pin, line: txt(1024), operation: token, count: count(LIMITS.repeats_per_action),
      volumeUl: num(25000), temperatureC: num(500, -200), constraints: list(txt(120), 12), additionOnly: bool},
    [...Object.keys(pin), 'line', 'operation']), 64),
  }, ['workflow', 'snapshots', 'review']),
  snapshot: obj({
    schema: one('planner/text-import/1', 'planner/protocolsio-import/1', 'lab-mcp/protocol-export/1'),
    id, collection_id: id, source: one('text', 'protocolsio', 'labstep'), name: txt(240), url,
    content_hash: nullable({anyOf: [digest, count(4294967295, 0)]}), retrieved_at: when, imported_at: when,
    collection_updated_at: when, versions_count: count(1000000, 0), experiment_count: count(1000000, 0),
    has_unpublished_draft: bool, observed: nullable(obj({
      source: one('lab-mcp protocol-executions'),
      executionsStatus: one('complete_visible', 'complete_visible_unlinked_protocols_skipped'),
      method: obj({prescribed: txt(1024), tick_derived: txt(1024), observed: txt(1024), step: txt(1024), operator: txt(1024),
        plausibility: obj({run: txt(1024), step: txt(1024), stated_waits: txt(1024), minimum: txt(1024), use: txt(1024)})}),
      versionId: id, runs: count(1000000, 0), runsWithTicks: count(1000000, 0), usableRuns: count(1000000, 0),
      matchedRuns: count(1000000, 0), minRuns: count(1000000), retrievedAt: when,
      steps: map(obj({n: count(1000000), medianMin: num(525600), p25Min: num(525600), p75Min: num(525600)}), LIMITS.steps),
      tooFew: map(count(1000000, 0), LIMITS.steps), rejectedRuns: map(count(1000000, 0), 50),
      rejectedSteps: map(count(1000000, 0), 50),
    }, ['versionId', 'steps'])),
    version: obj({id, number: count(1000000, 0), updated_at: when, locked_at: when,
      is_draft: nullable(bool), is_last_version: nullable(bool)}, ['id', 'number']),
    steps: list(obj({position: count(1000000), guid: nullable(txt(128)), title: txt(240, 0), text: txt(16000),
      prescribedSeconds: nullable(num(31536000)), devices: list(txt(400), 60),
      timers: list(obj({name: txt(400, 0), seconds: nullable(num(31536000))}), 40),
      inventory: list(obj({name: txt(400, 0), category: nullable(txt(400)), resource: nullable(txt(400)),
        input: bool, output: bool, amount: nullable({anyOf: [num(1000000), txt(100)]}), unit: nullable(txt(100, 0))}, ['name']), 60)}, ['position', 'title', 'text']), LIMITS.steps, 1),
  }, ['schema', 'name', 'version', 'steps']),
  assessment_request: obj({schema: one(REQUEST), protocol: ref('protocol_model'),
    installations: list(ref('installation_profile'), LIMITS.installations),
    decision: obj({scope: one('accessible', 'upgrade', 'design'), objective: one('labour', 'visits', 'simplest', 'cost', 'walkaway', 'tips-runtime'),
      workload: count(LIMITS.samples), facts: map(yesno, 300), methodChanges: bool, builds: bool, pylabrobot: one('any', 'prefer', 'only'),
      reagentPrices: map(num(1000000), 100), reactionScale: num(1, 0.05), needs: list(token, 30), labourRate: num(1000),
      runsPerYear: num(100000), dispenserFor: candidateId}, ['scope', 'objective', 'workload'])}),
  decision_question: obj({id: txt(1000), type: token, question: txt(8000), owner: txt(400), source: nullable(source),
    if_yes: candidateId, if_no: nullable(candidateId), weight: {type: 'number'}, hands_on_delta: nullable(range), visit_delta: nullable(range)}),
  assessment_result: obj({schema: one('planner/assessment-result/1'), request: record, model_version: txt(2000),
    block: record, source_versions: list(record, LIMITS.snapshots), source_actions: list(record, LIMITS.actions), missing_readings: list(record, 10000),
    labware: nullable(record), labware_warnings: list(record, 10000), baseline: record, baseline_reagent_cost: nullable(record),
    physical_issues: list(record, 500), recommended: nullable(ref('operation_route')), alternative: nullable(ref('operation_route')), tie: bool,
    configurations: list(ref('operation_route'), 1000), questions: list(ref('decision_question'), 500),
    search: obj({evaluated: count(1000000, 0), inScope: count(1000000, 0), method: txt(2000)}),
    families: list(obj({model_id: token, evaluated: count(1000000, 0), in_scope: count(1000000, 0), reason: nullable(txt(4000))}), 1000),
    execution_allowed: one(false), bench_routes: list(obj({id: candidateId, name: txt(240), kind: txt(80),
      model_id: token, source: nullable(url), fact: nullable(record), reason: nullable(txt(400))}), 50),
    mechanisms: list(obj({action_id: txt(500), label: txt(500), chosen: nullable(ref('action_mechanism')),
      alternative: nullable(ref('action_mechanism'))}), LIMITS.actions)},
  ['schema', 'request', 'model_version', 'source_versions', 'source_actions', 'missing_readings', 'labware', 'labware_warnings',
    'baseline', 'baseline_reagent_cost', 'physical_issues', 'recommended', 'alternative', 'tie', 'configurations',
    'questions', 'search', 'families', 'execution_allowed']),
  configuration_difference: obj({schema: one('planner/configuration-difference/1'), left: ref('operation_route'), right: ref('operation_route'),
    only_left_actions: list(txt(500), LIMITS.actions), only_right_actions: list(txt(500), LIMITS.actions),
    only_left_minutes: range, only_right_minutes: range, hands_on_delta: range, visit_delta: range, unchecked_fact_delta: {type: 'integer'}}),
  workspace: obj({schema: one(PORTABLE), request: ref('assessment_request'), request_sha256: digest, evaluator: digest}),
  compare: obj({input: {anyOf: [ref('assessment_request'), ref('workspace')]}, configurations: list(candidateId, 2, 2)}),
};
export const contract = {$schema: schema, $id: 'urn:lab-automation-planner:planning-api:1', $defs: definitions,
  limits: LIMITS, public_fields: {
    contract: {schema: 'public', limits: 'public', evaluator: 'public', provider_links: 'public',
      public_fields: 'public', reviewed_profiles: 'public'},
    capabilities_response: {schema: 'public', evaluator: 'public', claims: 'capability_claim'},
    capability_claim: {id: 'public', model_id: 'public', operation: 'public', origin: 'public',
      evidence: {id: 'public', url: 'public', version: 'public'}, assurance: 'public'},
    installation_profile: 'none', operation_route: 'none', protocol_model: 'none',
    assessment_request: 'none', assessment_result: 'none', configuration_difference: 'none', workspace: 'none',
  },
  provider_links: providerLinks,
  reviewed_profiles: {
    'reviewed/validate': 'lab-automation-planner/reviewed-assessment-input/1',
    'reviewed/assess': 'lab-automation-planner/reviewed-assessment-input/1',
  }};

// Evaluate the subset used by these closed schemas. Errors report only
// authored schema properties and array positions, never keys from payloads.
export function matches(v, s) {
  if (s.$ref) return matches(v, definitions[s.$ref.slice('#/$defs/'.length)]);
  if (s.anyOf) return s.anyOf.some(branch => matches(v, branch));
  if (s.enum) return s.enum.includes(v);
  switch (s.type) {
    case 'object': {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
      const keys = Object.keys(v);
      if (keys.length > (s.maxProperties ?? Infinity) || s.required?.some(k => !Object.hasOwn(v, k))) return false;
      return keys.every(k => {
        if (['__proto__', 'constructor', 'prototype'].includes(k)) return false;
        const property = s.properties && Object.hasOwn(s.properties, k) ? s.properties[k] : s.additionalProperties;
        return property === undefined || (property !== false && matches(v[k], property));
      });
    }
    case 'array':
      return Array.isArray(v) && v.length >= s.minItems && v.length <= s.maxItems && v.every(x => matches(x, s.items));
    case 'number':
    case 'integer':
      return Number.isFinite(v) && (s.type !== 'integer' || Number.isSafeInteger(v)) &&
        v >= (s.minimum ?? -Infinity) && v <= (s.maximum ?? Infinity);
    case 'string':
      return typeof v === 'string' && v.length >= (s.minLength ?? 0) && v.length <= (s.maxLength ?? Infinity) &&
        (!s.pattern || new RegExp(s.pattern).test(v));
    case 'boolean':
      return typeof v === 'boolean';
    case 'null':
      return v === null;
    default:
      throw Error('Unsupported planning schema type');
  }
}

export function requireSchema(value, name) {
  if (!matches(value, definitions[name])) reject('invalid_' + name, '/' + name);
}
