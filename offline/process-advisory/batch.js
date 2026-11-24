import {reject} from '../../lib/reviewed/json.js';
import {add, cmp, exact, sub, zero} from '../../lib/reviewed/quantity.js';
import {amount, array, choice, id, identities, object, requireSource} from './contract.js';

const kinds = {
  load: ['operator', 'vessel'], hold: ['vessel'], sample: ['operator', 'vessel'],
  handoff: ['operator'], measure: ['standalone_measurement'], release: ['operator', 'vessel'],
  observe: ['observer'], task: [],
};
const exclusiveKinds = ['operator', 'vessel', 'standalone_measurement', 'observer', 'provider'];
const lookup = (map, key, path) => { if (!map.has(key)) reject('unknown_reference', path); return map.get(key); };
const max = (a, b) => cmp(a, b) >= 0 ? a : b;

function resources(values, sources) {
  array(values, 16, '/process/resources', 1);
  identities(values.map(r => r?.id), 16, '/process/resources', 1);
  for (const [i, r] of values.entries()) {
    const path = '/process/resources/' + i;
    object(r, ['id', 'kind', 'configuration_id', 'revision', 'availability', 'evidence'], path);
    choice(r.kind, exclusiveKinds, path);
    id(r.configuration_id, path);
    id(r.revision, path);
    choice(r.availability, ['available', 'unavailable', 'unknown'], path);
    requireSource(sources, r.evidence, path);
  }
  return new Map(values.map(r => [r.id, r]));
}

function configurations(input, sources, resourceMap) {
  if (input === null) return null;
  const path = '/process/joint_fit';
  object(input, ['resource_id', 'required_mL', 'required_positions', 'alternatives', 'evidence'], path);
  const resource = lookup(resourceMap, input.resource_id, path);
  if (resource.kind !== 'vessel') reject('configuration_resource_kind', path);
  const required = {
    capacity_mL: amount(input.required_mL, path, {positive: true}),
    positions: amount(input.required_positions, path, {positive: true}),
  };
  if (required.positions.d !== 1n) reject('position_count', path);
  requireSource(sources, input.evidence, path);
  array(input.alternatives, 16, path, 1);
  identities(input.alternatives.map(c => c?.id), 16, path, 1);
  const alternatives = input.alternatives.map((c, i) => {
    const ptr = path + '/alternatives/' + i;
    object(c, ['id', 'revision', 'capacity_mL', 'positions', 'evidence'], ptr);
    id(c.revision, ptr);
    requireSource(sources, c.evidence, ptr);
    const limits = {capacity_mL: amount(c.capacity_mL, ptr, {optional: true}), positions: amount(c.positions, ptr, {optional: true})};
    if (limits.positions && limits.positions.d !== 1n) reject('position_count', ptr);
    const checks = Object.fromEntries(Object.keys(required).map(key => [key,
      limits[key] === null ? 'unknown' : cmp(limits[key], required[key]) < 0 ? 'contradicted' : 'satisfied']));
    const outcomes = Object.values(checks);
    return {...c, checks, status: outcomes.includes('contradicted') ? 'contradicted' : outcomes.includes('unknown') ? 'unknown' : 'satisfied'};
  });
  return {resource_id: input.resource_id, required_mL: input.required_mL, required_positions: input.required_positions,
    selected: {id: resource.configuration_id, revision: resource.revision},
    selected_status: alternatives.find(c => c.id === resource.configuration_id && c.revision === resource.revision)?.status ?? 'unknown',
    evidence: input.evidence, alternatives};
}

function operations(values, sources, resourceMap) {
  array(values, 40, '/process/operations', 1);
  identities(values.map(op => op?.id), 40, '/process/operations', 1);
  const byId = new Map();
  for (const [i, op] of values.entries()) {
    const path = '/process/operations/' + i;
    object(op, ['id', 'kind', 'predecessors', 'duration_min', 'resources', 'payload', 'evidence'], path);
    choice(op.kind, Object.keys(kinds), path);
    identities(op.predecessors, 16, path);
    identities(op.resources, 4, path, 1);
    const roles = op.resources.map(id => lookup(resourceMap, id, path).kind);
    if (op.kind === 'task' ? roles.some(role => !['operator', 'provider'].includes(role))
      : roles.length !== kinds[op.kind].length || kinds[op.kind].some(role => !roles.includes(role))) reject('resource_roles', path);
    const duration = amount(op.duration_min, path, {optional: true, positive: true});
    requireSource(sources, op.evidence, path);
    byId.set(op.id, {...op, path, duration});
  }
  const ordered = [], ancestors = new Map(), visiting = new Set();
  function visit(op) {
    if (ancestors.has(op.id)) return;
    if (visiting.has(op.id)) reject('dependency_cycle', op.path);
    visiting.add(op.id);
    const upstream = new Set();
    for (const pred of op.predecessors) {
      visit(lookup(byId, pred, op.path));
      upstream.add(pred);
      for (const id of ancestors.get(pred)) upstream.add(id);
    }
    ancestors.set(op.id, upstream);
    ordered.push(op);
    visiting.delete(op.id);
  }
  for (const op of byId.values()) visit(op);
  return {ordered, byId, ancestors};
}

function materialGraph(batch, graph, resourceMap, sources, findings) {
  const {ordered, byId, ancestors} = graph;
  const states = new Map(), transitions = [], observations = [], data = [], used = new Set([...byId.keys(), ...resourceMap.keys()]);
  if (used.size !== byId.size + resourceMap.size) reject('duplicate_identity', '/process');
  let current = null, batchTail = null;
  const fresh = (value, path) => { id(value, path); if (used.has(value)) reject('duplicate_identity', path); used.add(value); };
  const state = (identity, material, volume, location, createdBy, derivedFrom, evidence) => {
    const s = {id: identity, material_id: material, volume_mL: exact(volume), location_id: location, created_by: createdBy,
      derived_from: derivedFrom, consumed_by: null, evidence};
    states.set(identity, s);
    return s;
  };
  if (batch !== null) {
    object(batch, ['state_id', 'material_id', 'volume_mL', 'location_id', 'evidence'], '/process/batch');
    fresh(batch.material_id, '/process/batch');
    fresh(batch.state_id, '/process/batch');
    id(batch.location_id, '/process/batch');
    requireSource(sources, batch.evidence, '/process/batch');
    current = state(batch.state_id, batch.material_id, amount(batch.volume_mL, '/process/batch', {positive: true}),
      batch.location_id, null, null, batch.evidence);
  }

  const read = (identity, op, anchor = op.id) => {
    const s = lookup(states, identity, op.path);
    if (s.created_by !== null && !ancestors.get(anchor).has(s.created_by)) reject('material_dependency', op.path);
    if (s.consumed_by !== null && !ancestors.get(s.consumed_by).has(anchor)) reject('material_state_unavailable', op.path);
    return s;
  };
  const retain = (identity, op) => {
    const s = read(identity, op);
    if (s !== current || s.released_by) reject('wrong_batch_state', op.path);
    return s;
  };
  const vesselLocation = (op, s) => {
    if (!op.resources.some(id => id === s.location_id && resourceMap.get(id).kind === 'vessel'))
      reject('batch_vessel_location', op.path);
  };
  const finishRead = (op, s, id, mode, evidence) => {
    fresh(id, op.path);
    data.push({id, source_state_id: s.id, produced_by: op.id, mode, value: null, evidence});
  };
  for (const op of ordered) {
    const x = op.payload, path = op.path + '/payload';
    if (op.kind === 'task') { choice(x, [null], path); continue; }
    if (['load', 'hold', 'release'].includes(op.kind)) {
      object(x, ['batch_state_id'], path);
      const s = retain(x.batch_state_id, op);
      vesselLocation(op, s);
      if (op.kind === 'load' && (s.created_by !== null || batchTail)) reject('load_order', path);
      const prior = batchTail;
      if (op.kind === 'hold' && (!prior || !['load', 'sample'].includes(prior.kind))) reject('hold_dependency', path);
      if (op.kind === 'release' && (!prior || !['hold', 'sample'].includes(prior.kind))) reject('release_dependency', path);
      if (prior && !ancestors.get(op.id).has(prior.operation_id)) reject('batch_dependency', path);
      if (op.kind === 'release') s.released_by = op.id;
      batchTail = {operation_id: op.id, kind: op.kind, evidence: op.evidence, input: s.id, output: s.id};
      transitions.push(batchTail);
      continue;
    }
    if (op.kind === 'sample') {
      object(x, ['batch_state_id', 'retained_state_id', 'aliquot_state_id', 'aliquot_mL', 'aliquot_location_id'], path);
      const s = retain(x.batch_state_id, op);
      vesselLocation(op, s);
      const last = batchTail;
      if (last?.kind !== 'hold' || !ancestors.get(op.id).has(last.operation_id)) reject('sample_dependency', path);
      fresh(x.retained_state_id, path);
      fresh(x.aliquot_state_id, path);
      id(x.aliquot_location_id, path);
      if (x.aliquot_location_id === s.location_id) reject('sample_location', path);
      const volume = amount(x.aliquot_mL, path, {positive: true});
      const retained = sub(amount(s.volume_mL, path), volume);
      if (retained.n < 0n) reject('material_balance', path);
      s.consumed_by = op.id;
      current = state(x.retained_state_id, s.material_id, retained, s.location_id, op.id, s.id, op.evidence);
      state(x.aliquot_state_id, s.material_id, volume, x.aliquot_location_id, op.id, s.id, op.evidence);
      batchTail = {operation_id: op.id, kind: op.kind, evidence: op.evidence, input: s.id, output: [x.retained_state_id, x.aliquot_state_id]};
      transitions.push(batchTail);
      continue;
    }
    if (op.kind === 'handoff') {
      object(x, ['aliquot_state_id', 'delivered_state_id', 'destination_id'], path);
      const s = read(x.aliquot_state_id, op);
      if (s === current || s.consumed_by !== null || byId.get(s.created_by)?.kind !== 'sample') reject('wrong_aliquot_state', path);
      fresh(x.delivered_state_id, path);
      id(x.destination_id, path);
      if (x.destination_id === s.location_id) reject('handoff_location', path);
      s.consumed_by = op.id;
      state(x.delivered_state_id, s.material_id, amount(s.volume_mL, path), x.destination_id, op.id, s.id, op.evidence);
      transitions.push({operation_id: op.id, kind: op.kind, evidence: op.evidence, input: s.id, output: x.delivered_state_id});
      continue;
    }
    if (op.kind === 'measure') {
      object(x, ['delivered_state_id', 'data_id'], path);
      const s = read(x.delivered_state_id, op);
      if (byId.get(s.created_by)?.kind !== 'handoff' || s.location_id !== op.resources[0]) reject('measurement_handoff', path);
      finishRead(op, s, x.data_id, 'extracted_aliquot', op.evidence);
      continue;
    }
    object(x, ['batch_state_id', 'data_id', 'during_id', 'offset_min', 'evidence'], path);
    fresh(x.data_id, path);
    const hold = byId.get(x.during_id);
    const offset = amount(x.offset_min, path, {optional: true});
    const supported = x.evidence !== null && sources.get(x.evidence)?.kind === 'declared_case';
    if (hold?.kind !== 'hold' || hold.payload?.batch_state_id !== x.batch_state_id || !offset || !supported) {
      findings.push({code: 'observation_binding_unresolved', path});
      observations.push({op, hold: null, offset: null});
      continue;
    }
    const s = read(x.batch_state_id, op, hold.id);
    if (ancestors.get(hold.id).has(op.id) || ancestors.get(op.id).has(hold.id)) reject('observation_dependency', path);
    observations.push({op, hold, offset, state: s, evidence: x.evidence, dataId: x.data_id});
  }
  // A later transition or release must follow the hold; timing independently
  // verifies each declared observation is inside its hold interval.
  for (const planned of observations) {
    const consumer = planned.state?.consumed_by || planned.state?.released_by;
    if (consumer && !ancestors.get(consumer).has(planned.hold.id))
      reject('observation_material_overlap', planned.op.path);
  }
  return {states: [...states.values()], retained_state_id: current?.id ?? null, transitions, observations, data};
}

function schedule(graph, resourceMap, observations, findings, blockedResources, control) {
  const calendar = new Map([...resourceMap.keys()].map(id => [id, []]));
  const events = new Map(), observationById = new Map(observations.map(o => [o.op.id, o]));
  const pending = new Map(graph.ordered.map(op => [op.id, op]));
  const occupied = (op, start, end) => op.resources.flatMap(id => calendar.get(id))
    .filter(e => cmp(start, e.end) < 0 && cmp(end, e.start) > 0);
  const subtotal = new Map([...resourceMap.keys()].map(id => [id, zero()]));
  const finding = (code, op) => findings.push({code, path: op.path});
  for (const op of pending.values()) {
    if (op.duration === null) finding('duration_missing', op);
    else for (const id of op.resources) subtotal.set(id, add(subtotal.get(id), op.duration));
  }
  function place(op, during) {
    if (!op.duration) return null;
    if (op.resources.some(id => blockedResources.has(id))) { finding('configuration_unresolved', op); return null; }
    const unavailable = op.resources.map(id => resourceMap.get(id).availability).find(state => state !== 'available');
    if (unavailable) { finding('required_resource_unresolved', op); return null; }
    const preds = op.predecessors.map(id => events.get(id));
    if (preds.some(e => !e)) { finding('predecessor_unresolved', op); return null; }
    let start = preds.reduce((time, e) => max(time, e.end), zero());
    if (during) {
      const hold = events.get(during.hold?.id);
      if (!hold) { finding('observation_hold_unresolved', op); return null; }
      const at = add(hold.start, during.offset), end = add(at, op.duration);
      if (cmp(start, at) > 0 || cmp(end, hold.end) > 0 || occupied(op, at, end).length) {
        finding('observation_overlap_unresolved', op);
        return null;
      }
      start = at;
    } else {
      for (let clashes; (clashes = occupied(op, start, add(start, op.duration))).length;)
        start = clashes.reduce((time, e) => max(time, e.end), start);
    }
    const end = add(start, op.duration), event = {id: op.id, kind: op.kind, start, end, resources: op.resources, evidence: op.evidence};
    for (const id of op.resources) calendar.get(id).push(event);
    return event;
  }
  // Stable topological list scheduling. The explicit input order resolves ties.
  // Observation starts are constrained relative to their hold, not guessed.
  while (control === 'declared_sequence' && pending.size) {
    const ready = [...pending.values()].filter(op => op.predecessors.every(id => events.has(id)) &&
      (!observationById.get(op.id)?.hold || events.has(observationById.get(op.id).hold.id)));
    // Reserve a ready observation's exact in-hold interval before placing
    // ordinary work that could use the same observer resource.
    ready.sort((a, b) => Number(observationById.has(b.id)) - Number(observationById.has(a.id)));
    if (!ready.length) {
      for (const op of pending.values()) { finding('dependency_or_overlap_unresolved', op); events.set(op.id, null); }
      break;
    }
    const op = ready[0];
    pending.delete(op.id);
    events.set(op.id, place(op, observationById.get(op.id)));
  }
  const complete = pending.size === 0 && [...events.values()].every(Boolean);
  const scheduled = [...events.values()].filter(Boolean);
  const occupation = [...resourceMap.values()].map(r => ({
    resource_id: r.id, known_work_min: exact(subtotal.get(r.id)),
    scheduled_min: exact(calendar.get(r.id).reduce((sum, e) => add(sum, sub(e.end, e.start)), zero())),
  }));
  return {
    complete, elapsed_min: complete ? exact(scheduled.reduce((t, e) => max(t, e.end), zero())) : null,
    operator_min: complete ? exact([...resourceMap.values()].filter(r => r.kind === 'operator')
      .reduce((sum, r) => add(sum, subtotal.get(r.id)), zero())) : null,
    known_operator_work_min: exact([...resourceMap.values()].filter(r => r.kind === 'operator')
      .reduce((sum, r) => add(sum, subtotal.get(r.id)), zero())),
    occupancy: occupation,
    timeline: scheduled.map(e => ({id: e.id, kind: e.kind, start_min: exact(e.start), end_min: exact(e.end), resources: e.resources, evidence: e.evidence})),
    events,
  };
}

export function assessBatch(p, sources) {
  object(p, ['kind', 'batch', 'resources', 'operations', 'joint_fit', 'control'], '/process');
  choice(p.control, ['declared_sequence', 'data_dependent', null], '/process/control');
  const byResource = resources(p.resources, sources);
  const graph = operations(p.operations, sources, byResource);
  const fit = configurations(p.joint_fit, sources, byResource);
  const findings = [];
  const material = materialGraph(p.batch, graph, byResource, sources, findings);
  if (p.control !== 'declared_sequence') {
    findings.push({code: p.control === null ? 'control_unknown' : 'dynamic_control_unsupported', path: '/process/control'});
  }
  if (p.batch !== null) {
    if (!fit || fit.selected_status !== 'satisfied') findings.push({
      code: fit?.selected_status === 'contradicted' ? 'joint_fit_contradicted' : 'joint_fit_unresolved', path: '/process/joint_fit',
    });
    if (fit) {
      const capacity = amount(fit.required_mL, '/process/joint_fit');
      if (cmp(capacity, amount(p.batch.volume_mL, '/process/batch')) < 0) reject('required_capacity_below_batch', '/process/joint_fit');
      if (graph.ordered.some(op => op.resources.some(id => byResource.get(id).kind === 'vessel' && id !== fit.resource_id)))
        reject('unbound_vessel_configuration', '/process/joint_fit');
    }
  }
  for (const r of byResource.values()) if (r.availability !== 'available' &&
      graph.ordered.some(op => op.resources.includes(r.id))) {
    findings.push({code: 'resource_' + r.availability, path: '/process/resources/' + p.resources.indexOf(r)});
  }
  const blockedResources = new Set(p.batch !== null && fit?.selected_status !== 'satisfied'
    ? [...byResource.values()].filter(r => r.kind === 'vessel').map(r => r.id) : []);
  const {events, ...timing} = schedule(graph, byResource, material.observations, findings, blockedResources, p.control);
  const complete = findings.length === 0 && timing.complete;
  const observations = material.observations.flatMap(o => o.state && events.get(o.op.id) ? [{
    id: o.dataId, source_state_id: o.state.id, produced_by: o.op.id, mode: 'in_situ', value: null, evidence: o.evidence,
  }] : []);
  const status = p.control === 'data_dependent' ? 'unsupported' : fit?.selected_status === 'contradicted' || findings.some(f => f.code === 'resource_unavailable')
    ? 'contradicted' : complete ? 'declared_schedule' : 'incomplete';
  return {
    status, joint_fit: fit, resources: p.resources, material_projection: 'declared_model_only',
    material_states: p.control === 'declared_sequence' ? material.states : [],
    retained_state_id: p.control === 'declared_sequence' ? material.retained_state_id : null,
    material_transitions: p.control === 'declared_sequence' ? material.transitions : [],
    data: p.control !== 'declared_sequence' ? [] : [...material.data.filter(d => events.get(d.produced_by)), ...observations],
    schedule: {...timing, method: 'stable_list_schedule_no_global_optimisation', complete,
      elapsed_min: complete ? timing.elapsed_min : null,
      operator_min: complete ? timing.operator_min : null},
    liquid_handler_required: false, ranking: null, findings,
  };
}
