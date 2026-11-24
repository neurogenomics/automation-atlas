import {canonicalJson, checkLabstepVersion, isLabstepDraft, verifyLabstepSnapshotHash} from '../../lib/source-provenance.js';
import {normaliseSnapshot} from '../../lib/snapshots.js';
import {stepLines} from '../../lib/protocol-model.js';
import {benchProviders, TIP_RUNTIME, buildWorkflowModel, createDecisionRequest, decide, requiresProtocolChoice, handlers, labwareModels, modelOptions, statedPositions, validateDecisionRequest, validateInstalledHeads} from '../../lib/work.js';
import {compareConfigurations, decisionQuestions, planningDecision, registryWorkMap} from '../../lib/planning-decision.js';
import {assess as assessReviewed} from '../../lib/reviewed/assessment.js';
import {admit as admitReviewed, INPUT_PROFILE, RELEASE as REVIEWED_RELEASE} from '../../lib/reviewed/input.js';
import {AssessmentError, hashText, parseReview, reject} from '../../lib/reviewed/json.js';
import {contract, LIMITS, matches, definitions, PORTABLE, PREFIX, REQUEST, requireSchema} from './contract.js';

class PlanningProblem extends Error {
  constructor(status, code) { super(code); this.status = status; }
}
const stop = (status, code) => { throw new PlanningProblem(status, code); };
const checkSignal = req => { if (req.signal.aborted) stop(408, 'request_cancelled'); };
const digest = value => hashText(canonicalJson(value));
const sourceKey = s => `${s.source}:${s.id}`;
const distinct = values => new Set(values).size === values.length;
const https = (value, cleanLocator = false) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      (!cleanLocator || (!url.search && !url.hash));
  } catch { return false; }
};
const byteLength = text => new TextEncoder().encode(text).length;
function respond(status, body, limit = LIMITS.response_bytes) {
  const text = JSON.stringify(body);
  if (byteLength(text) > limit) stop(413, 'response_limit');
  return new Response(text, {status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
  }});
}
async function payload(req, decimalNumbers = true) {
  const origin = req.headers.get('origin');
  if (origin !== null && origin !== new URL(req.url).origin) stop(403, 'cross_origin');
  if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') stop(415, 'json_required');
  if (Number(req.headers.get('content-length')) > LIMITS.request_bytes) stop(413, 'request_limit');
  const reader = req.body?.getReader();
  if (!reader) reject('json_invalid');
  const decoder = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
  let size = 0, text = '';
  try {
    for (;;) {
      checkSignal(req);
      const {done, value} = await reader.read();
      if (done) break;
      if ((size += value.length) > LIMITS.request_bytes) stop(413, 'request_limit');
      text += decoder.decode(value, {stream: true});
    }
    return parseReview(text + decoder.decode(), {decimalNumbers});
  } catch (e) {
    void reader.cancel().catch(() => {});
    if (e instanceof PlanningProblem || e instanceof AssessmentError) throw e;
    checkSignal(req);
    reject('json_invalid');
  }
}

async function protocolModel(protocol) {
  const {workflow, snapshots, overrides = []} = protocol;
  const sources = new Map(), sourceVersions = [];
  let steps = 0;
  for (const raw of snapshots) {
    const snap = normaliseSnapshot(raw);
    const key = sourceKey(snap);
    if (sources.has(key) || (raw.source && raw.source !== snap.source) || !distinct(snap.steps.map(s => s.position)) ||
        (snap.url && !https(snap.url, true)) || (snap.source === 'labstep' ? raw.id !== undefined : raw.id === undefined || raw.collection_id !== undefined)) {
      reject('source_identity', '/protocol/snapshots');
    }
    const nativeVersion = workflow.parts.find(p => p.source === snap.source && p.id === snap.id);
    if (!nativeVersion || nativeVersion.versionId !== snap.version.id ||
        (nativeVersion.contentHash !== undefined && nativeVersion.contentHash !== snap.content_hash)) reject('source_pin', '/protocol/workflow/parts');
    if ((steps += snap.steps.length) > LIMITS.steps || snap.steps.some(s =>
      s.text.split(/\r?\n/).some(line => line.length > 1024))) stop(413, 'source_limit');
    if (snap.source === 'labstep') {
      if (isLabstepDraft(raw)) reject('source_draft', '/protocol/snapshots');
      if (!nativeVersion.contentHash) reject('source_pin', '/protocol/workflow/parts');
      try { checkLabstepVersion(raw); await verifyLabstepSnapshotHash(raw); }
      catch { reject('source_integrity', '/protocol/snapshots'); }
    }
    if (raw.observed && (snap.source !== 'labstep' || raw.observed.versionId !== snap.version.id))
      reject('observation_pin', '/protocol/snapshots');
    sources.set(key, snap);
    sourceVersions.push({source: snap.source, id: snap.id, version_id: snap.version.id,
      native_content_hash: snap.content_hash ?? null, snapshot_sha256: await digest(raw)});
  }
  if (workflow.parts.length !== sources.size || !distinct(workflow.parts.map(sourceKey))) reject('source_pin', '/protocol/workflow/parts');
  if (workflow.labware && !Object.hasOwn(labwareModels, workflow.labware)) reject('labware_unknown', '/protocol/workflow/labware');
  const reviews = Object.create(null);
  for (const {source, id, versionId, line, ...override} of overrides) {
    const snap = sources.get(sourceKey({source, id}));
    if (snap?.version.id !== versionId || !snap.steps.some(s => stepLines(s).includes(line)))
      reject('override_pin', '/protocol/overrides');
    const key = `${sourceKey(snap)}:${versionId}`;
    const entries = (reviews[key] ??= {lines: Object.create(null)}).lines;
    if (Object.hasOwn(entries, line)) reject('override_duplicate', '/protocol/overrides');
    entries[line] = override;
  }
  let model;
  try {
    model = buildWorkflowModel(workflow, snapshots, reviews, {actions: LIMITS.actions, repeats: LIMITS.repeats_per_action});
  } catch (e) {
    if (e instanceof RangeError) stop(413, 'operation_limit');
    reject('protocol_model_invalid', '/protocol');
  }
  if (!model.block && model.format !== workflow.format) reject('labware_format', '/protocol/workflow/labware');
  const actions = model.chunks.flatMap(chunk => chunk.actions);
  if (!actions.length) reject('protocol_empty', '/protocol');
  if (actions.reduce((sum, action) => sum + action.count.n, 0) > LIMITS.total_repeats ||
      actions.some(a => (a.volumeUl ?? 0) > 25000 || (a.wait ?? 0) > 525600 ||
        Math.abs(a.temperatureC ?? 0) > 500 || (a.volumeRatio ?? 0) > 100 ||
        (statedPositions(a.line, model.unitSize) ?? 0) > LIMITS.samples)) stop(413, 'operation_limit');
  return {model, sourceVersions};
}

function validateInstallations(installations, objective) {
  if (!distinct(installations.map(i => i.id)) || installations.some(i =>
    i.id.startsWith('purchase-') || !(handlers.some(h => h.id === i.modelId) || objective === TIP_RUNTIME && benchProviders.some(d => d.id === i.modelId)))) reject('installation_identity', '/installations');
  for (const installation of installations) {
    if (installation.installedHeads === undefined) continue;
    const handler = handlers.find(h => h.id === installation.modelId);
    if (!handler || !validateInstalledHeads(handler, installation.installedHeads)) reject('installed_heads_invalid', '/installations');
  }
}

async function admit(value, requireWorkspace = false) {
  let input = value;
  const workspace = value?.schema === PORTABLE ? value : null;
  if (requireWorkspace && !workspace) stop(422, 'unsupported_workspace_version');
  if (workspace) {
    if (workspace.request?.schema !== REQUEST) stop(422, 'unsupported_request_version');
    requireSchema(workspace, 'workspace');
    input = workspace.request;
    if (await digest(input) !== workspace.request_sha256) reject('workspace_integrity', '/request_sha256');
  }
  if (input?.schema !== REQUEST) stop(422, 'unsupported_request_version');
  if (Array.isArray(input?.protocol?.snapshots) && input.protocol.snapshots.some(raw =>
    !matches(raw?.schema, definitions.snapshot.properties.schema))) stop(422, 'unsupported_snapshot_version');
  requireSchema(input, 'assessment_request');
  validateInstallations(input.installations, input.decision.objective);
  const {model, sourceVersions} = await protocolModel(input.protocol);
  if (model.materialBoundaries?.length) reject('protocol_material_flow_unresolved', '/protocol/workflow');
  if (model.unresolvedOutput) reject('protocol_output_input_unresolved', '/protocol/workflow/block');
  if (model.block?.washBoundaryOpen) reject('protocol_block_wash_boundary', '/protocol/workflow/block/through');
  if (model.block?.input.volumeUl === null) reject('protocol_block_input_required', '/protocol/workflow/block/input/volumeUl');
  if (model.qcGates?.length) reject('protocol_qc_outcome_required', '/protocol/workflow');
  if (requiresProtocolChoice(model)) reject('protocol_branch_required', '/protocol/workflow/branches');
  let request;
  try { request = validateDecisionRequest({...createDecisionRequest(model), ...input.decision}, model); }
  catch { reject('decision_invalid', '/decision'); }
  const requestSha = workspace?.request_sha256 ?? await digest(input);
  return {input, workspace, model, request, sourceVersions, requestSha};
}

function capabilities(modelId) {
  const model = handlers.find(h => h.id === modelId);
  if (!model) stop(404, 'reference_not_found');
  // Only hand-curated public catalogue locators. No evidence quotations,
  // contact fields, operational details, prices, Registry reads or lab records.
  const evidence = (model.sources || []).filter(s => https(s.url)).slice(0, 30)
    .map(s => ({id: s.url, url: s.url, version: null}));
  const claims = Object.entries(model.ops).map(([operation, op]) => ({
    id: `${model.id}:${operation}`, model_id: model.id, operation, origin: op.type, evidence,
    assurance: 'catalogue_reference',
  })).filter(claim => matches(claim, definitions.capability_claim));
  return claims;
}

export async function evaluateReviewedPlanningInput(input) {
  return assessReviewed(input);
}

export function planningOptions(modelId) {
  const model = handlers.find(item => item.id === modelId);
  return model ? modelOptions(model) : null;
}

export async function planningApi(path, req, who, release, {withWorkMap = false} = {}) {
  try {
    const route = path.slice(PREFIX.length);
    if (route === 'contract') {
      if (req.method !== 'GET') stop(405, 'method_not_allowed');
      return respond(200, {...contract, evaluator: release});
    }
    if (route === 'capabilities') {
      if (req.method !== 'GET') stop(405, 'method_not_allowed');
      return respond(200, {schema: 'planner/capability-claims/1', evaluator: release,
        claims: capabilities(new URL(req.url).searchParams.get('model'))});
    }
    if (!who) stop(401, 'sign_in_required');
    if (route === 'reviewed/validate' || route === 'reviewed/assess') {
      if (req.method !== 'POST') stop(405, 'method_not_allowed');
      const value = await payload(req, false);
      if (value?.schema !== INPUT_PROFILE) stop(422, 'unsupported_reviewed_input_version');
      checkSignal(req);
      if (route === 'reviewed/validate') {
        await admitReviewed(value);
        checkSignal(req);
        return respond(200, {schema: 'planner/reviewed-validation/1', binding: value.binding, release: REVIEWED_RELEASE});
      }
      const assessment = await evaluateReviewedPlanningInput(value);
      checkSignal(req);
      return respond(200, assessment);
    }
    if (!['validate', 'assess', 'compare', 'questions', 'export', 'import'].includes(route)) stop(404, 'route_not_found');
    if (req.method !== 'POST') stop(405, 'method_not_allowed');
    const value = await payload(req);
    if (route === 'compare') {
      if (typeof value?.input?.schema === 'string' && ![REQUEST, PORTABLE].includes(value.input.schema))
        stop(422, 'unsupported_request_version');
      requireSchema(value, 'compare');
      if (!distinct(value.configurations)) reject('configuration_duplicate', '/configurations');
    }
    const {input, workspace, request, model, sourceVersions, requestSha} =
      await admit(route === 'compare' ? value.input : value, route === 'import');
    checkSignal(req);
    const binding = {evaluator: release, request_sha256: requestSha, source_versions: sourceVersions};
    if (route === 'import') return respond(200, {workspace, current_evaluator: release, reproducible_here: workspace.evaluator === release});
    if (workspace && workspace.evaluator !== release) stop(409, 'evaluator_version_unavailable');
    if (route === 'validate') return respond(200, {schema: 'planner/protocol-validation/1', ...binding,
      reviewed_by: 'caller', review: input.protocol.review, operation_count: model.chunks.flatMap(c => c.actions).length,
      unresolved: model.review, labware_warnings: model.labwareWarnings});
    // A versioned export pins the exact inputs and evaluator, never identity
    // cookies or a claim of scientific approval. No body is saved by this API.
    if (route === 'export') return respond(200, {schema: PORTABLE, request: input, request_sha256: requestSha, evaluator: release}, LIMITS.request_bytes);
    let decision;
    try {
      decision = decide(request, {model, installations: input.installations, budget: {remaining: LIMITS.simulation_work}});
    } catch (e) {
      if (e instanceof RangeError) stop(413, 'evaluation_limit');
      reject('decision_invalid', '/decision');
    }
    checkSignal(req);
    if (route === 'questions') return respond(200, {schema: 'planner/decision-questions/1', ...binding, questions: decisionQuestions(decision)});
    if (route === 'compare') {
      const comparison = compareConfigurations(decision, value.configurations);
      if (!comparison) stop(404, 'configuration_not_in_result');
      return respond(200, {...binding, comparison});
    }
    return respond(200, {...binding, decision: planningDecision(decision), ...(withWorkMap ? {work_map: registryWorkMap(decision)} : {})});
  } catch (e) {
    if (e instanceof AssessmentError) return respond(e.code === 'json_limit' ? 413 : 400, {
      schema: 'planner/planning-error/1',
      error: {code: e.code, path: e.code === 'layout_unknown_location' ? '/run/layout' : e.path},
    });
    if (e instanceof PlanningProblem) return respond(e.status, {schema: 'planner/planning-error/1', error: {code: e.message}});
    // Do not place submitted prose, reference names, or credentials into logs.
    return respond(500, {schema: 'planner/planning-error/1', error: {code: 'internal_error'}});
  }
}
