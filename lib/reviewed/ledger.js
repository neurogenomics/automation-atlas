// Explicit immutable state ledger. Never imports the parser or legacy physics.
import {canonical, reject} from './json.js';
import {aggregate, cardinality, volume, decimal, rational, add, sub, mul, cmp, exact, zero} from './quantity.js';

export function ledger(input) {
  const r = input.record, run = input.run, findings = [], events = [];
  const note = (code, path, message, operation_id = null, scopes = ['balance', 'configuration']) => {
    if (findings.length >= 4000) reject('assessment_limit');
    findings.push({code, path, message, operation_id, scopes});
  };
  const index = (list, path) => {
    const map = new Map();
    for (const item of list) { if (map.has(item.id)) reject('duplicate_identity', path); map.set(item.id, item); }
    return map;
  };
  const states = index(r.states, '/record/states'), ops = index(r.operations, '/record/operations');
  const materials = index(r.materials, '/record/materials'), locations = index(r.locations, '/record/locations');
  const producer = new Map(), consumers = new Set(), computed = new Map(), current = new Map(), used = new Set(), ancestors = new Map();
  for (const op of ops.values()) {
    for (const port of op.outputs) {
      if (!states.has(port.state_id)) reject('state_reference', '/record/operations');
      if (producer.has(port.state_id)) reject('duplicate_state_producer', '/record/operations');
      producer.set(port.state_id, op.id);
    }
    for (const port of op.inputs) {
      if (!states.has(port.state_id)) reject('state_reference', '/record/operations');
      if (consumers.has(port.state_id)) reject('state_double_use', '/record/operations');
      consumers.add(port.state_id);
    }
    if (new Set(op.depends_on).size !== op.depends_on.length || op.depends_on.some(id => !ops.has(id))) reject('operation_reference', '/record/operations');
  }
  const visiting = new Set(), ordered = [];
  function visit(id) {
    if (ancestors.has(id)) return;
    if (visiting.has(id)) reject('operation_cycle');
    visiting.add(id); const set = new Set();
    for (const dep of ops.get(id).depends_on) { visit(dep); set.add(dep); for (const a of ancestors.get(dep)) set.add(a); }
    visiting.delete(id); ancestors.set(id, set); ordered.push(ops.get(id));
  }
  [...ops.keys()].sort().forEach(visit);
  const statePaths = new Map(r.states.map((s, i) => [s.id, `/record/states/${i}`]));
  function total(q, path, op = null, scopes = ['balance', 'configuration']) {
    if (q.dimension !== 'volume' || !['uL', 'mL', 'L'].includes(q.unit)) { note('quantity_dimension', path, 'Only volume amounts are supported.', op, scopes); return null; }
    if (q.value !== null && decimal(q.value).n < 0n) { note('quantity_negative', path, 'Negative material amount.', op, scopes); return null; }
    if (q.value === null) { note('quantity_unknown', path, q.unknown_reason, op, scopes); return null; }
    if (q.provenance.status === 'ambiguous') { note('quantity_ambiguous', path, 'Quantity assignment remains ambiguous.', op, scopes); return null; }
    if (q.provenance.status === 'source_asserted' && !q.provenance.source_spans.length) { note('quantity_evidence_missing', path, 'A source assignment needs evidence spans.', op, scopes); return null; }
    if (cardinality(q.basis, run) === null) { note('cardinality_unknown', path, 'Explicit run cardinality is required for this basis.', op, scopes); return null; }
    return aggregate(q, run);
  }
  const materialAncestry = new Map();
  for (const state of states.values()) {
    const path = statePaths.get(state.id);
    if (state.material_id !== null && !materials.has(state.material_id)) reject('material_reference', path);
    if (state.location_id !== null && !locations.has(state.location_id)) reject('location_reference', path);
    if (state.lineage.some(l => !states.has(l.state_id))) reject('lineage_reference', path);
    if (state.material_id === null && (state.quantity.value === null || decimal(state.quantity.value).n !== 0n || state.lineage.length)) reject('empty_material_identity', path);
    if (!producer.has(state.id)) {
      if (state.lineage.length) reject('unproduced_lineage_state', path);
      if (!state.location_id || locations.get(state.location_id).kind === 'unknown') note('location_unknown', path, 'Initial vessel location is unresolved.');
      if (state.location_id && current.has(state.location_id)) reject('ambiguous_initial_location', path);
      current.set(state.location_id, state.id);
      const amount = total(state.quantity, path + '/quantity');
      const ancestry = state.material_id && (amount === null || amount.n > 0n) ? [state.material_id] : [];
      computed.set(state.id, {amount, ancestry, components: amount === null ? null : new Map(ancestry.map(id => [id, amount]))});
      if (state.material_id && ancestry.length) materialAncestry.set(state.material_id, ancestry.join('|'));
    }
  }
  for (const op of ordered) {
    const path = `/record/operations/${r.operations.indexOf(op)}`, start = findings.length;
    const event = {operation_id: op.id, record_index: r.operations.indexOf(op), declared: op, consumption_uL: null, per_unit_moved_uL: null, status: 'unsupported'};
    events.push(event);
    const taint = () => { for (const p of op.inputs) used.add(p.state_id); };
    if (op.control.mode !== 'always' || op.control.expression !== null || op.control.repeat_count !== null) {
      note('control_unsupported', path + '/control', 'No branch selection or implicit loop-state replay is supported.', op.id, ['consumption', 'balance', 'configuration']); taint(); continue;
    }
    for (const [i] of op.conditions.entries()) note('condition_unassessed', `${path}/conditions/${i}`, 'Known description is not an evaluated scientific predicate.', op.id, ['configuration', 'completeness']);
    for (const [i, c] of op.constraints.entries()) note(c.kind === 'max_delay' ? 'schedule_required' : 'constraint_unassessed', `${path}/constraints/${i}`, c.description, op.id, ['configuration', 'completeness']);
    if (op.purpose.status !== 'asserted') note('purpose_unresolved', path + '/purpose', 'Purpose is not asserted.', op.id, ['completeness']);
    if (op.unsupported_reason) note('declared_unsupported', path + '/unsupported_reason', op.unsupported_reason, op.id, ['configuration', 'completeness']);
    if (op.kind !== 'transfer') {
      note('operation_unsupported', path, 'This volume ledger supports explicit movements only; transformation/fraction/timing semantics remain retained, unassessed.', op.id, ['consumption', 'balance', 'configuration']); taint(); continue;
    }
    const m = op.movement, ids = [m.donor_before_state_id, m.donor_after_state_id, m.recipient_before_state_id, m.recipient_after_state_id];
    if (new Set(ids).size !== 4 || ids.some(id => !states.has(id))) { note('movement_reference', path, 'Four distinct existing endpoints are required.', op.id, ['consumption', 'balance', 'configuration']); continue; }
    const [db, da, rb, ra] = ids.map(id => states.get(id));
    const portsOK = (ports, expected) => ports.length === 2 && new Set(ports.map(p => p.state_id)).size === 2 && ports.every(p => expected.includes(p.state_id) && p.fraction === 'whole' && canonical(p.quantity) === canonical(states.get(p.state_id).quantity));
    if (!portsOK(op.inputs, [db.id, rb.id]) || !portsOK(op.outputs, [da.id, ra.id])) { note('movement_port_total', path, 'Ports must preserve exact whole-state snapshots and provenance.', op.id, ['consumption', 'balance', 'configuration']); continue; }
    if (!db.location_id || !rb.location_id || db.location_id === rb.location_id || db.location_id !== da.location_id || rb.location_id !== ra.location_id) { note('movement_location', path, 'Movement endpoints require distinct, unchanged locations.', op.id, ['consumption', 'balance', 'configuration']); continue; }
    if ([db, rb].some(s => used.has(s.id) || current.get(s.location_id) !== s.id || !computed.has(s.id) || (producer.has(s.id) && !ancestors.get(op.id).has(producer.get(s.id))))) {
      note('movement_order', path, 'Stale/double-used snapshot, unsupported producer or missing explicit dependency.', op.id, ['consumption', 'balance', 'configuration']); continue;
    }
    const expectedLineage = canonical([{state_id: db.id, relationship: 'pooled_from'}, {state_id: rb.id, relationship: 'pooled_from'}].sort((a, b) => a.state_id.localeCompare(b.state_id)));
    if (da.material_id !== db.material_id || canonical(da.lineage) !== canonical([{state_id: db.id, relationship: 'split_from'}]) || canonical([...ra.lineage].sort((a, b) => a.state_id.localeCompare(b.state_id))) !== expectedLineage) {
      note('movement_lineage', path, 'Donor residual and both recipient contributors must remain explicit.', op.id, ['consumption', 'balance', 'configuration']); continue;
    }
    const amount = total(m.amount, path + '/movement/amount', op.id, ['consumption', 'balance', 'configuration']);
    const before = computed.get(db.id), initial = computed.get(rb.id);
    let after = total(da.quantity, statePaths.get(da.id) + '/quantity', op.id), final = total(ra.quantity, statePaths.get(ra.id) + '/quantity', op.id);
    let valid = true;
    const bad = (code, message) => { valid = false; note(code, path, message, op.id, ['consumption', 'balance', 'configuration']); };
    const supported = m.model.kind === 'additive_nonreacting_volume' && m.model.provenance.status !== 'ambiguous' && (m.model.provenance.status !== 'source_asserted' || m.model.provenance.source_spans.length > 0);
    if (!supported) note('movement_model', path + '/movement/model', 'Unknown/unsupported model: no additive balance claim.', op.id);
    if ([db, da, rb, ra].some(s => s.quantity.value !== null && decimal(s.quantity.value).n < 0n)) bad('quantity_negative', 'Negative state totals are contradictory, not unknown inventory.');
    if (amount && before.amount && cmp(amount, before.amount) > 0) bad('movement_overdraw', 'Movement exceeds known donor inventory.');
    if (supported && amount) {
      if (before.amount && after && cmp(sub(before.amount, amount), after) !== 0) bad('movement_balance', 'Donor before minus moved amount differs from declared residual.');
      if (initial.amount && final && cmp(add(initial.amount, amount), final) !== 0) bad('movement_balance', 'Recipient before plus moved amount differs from declared total.');
    }
    if (m.intent === 'make_up_to') {
      if (!m.derivation || m.derivation.initial_state_id !== rb.id || canonical(m.derivation.initial_quantity) !== canonical(rb.quantity) || canonical(m.derivation.target_quantity) !== canonical(m.target)) bad('movement_derivation', 'Copied target operands are stale or mismatched.');
      const target = total(m.target, path + '/movement/target', op.id, ['consumption', 'balance', 'configuration']);
      if (!supported || !initial.amount || !target || !amount) bad('movement_target_unknown', 'Make-up-to needs known initial/target quantities and supported model.');
      else if (cmp(sub(target, initial.amount), amount) !== 0 || (final && cmp(final, target) !== 0)) bad('movement_target', 'Make-up-to amount must be target minus recipient-before.');
    }
    if (amount?.n === 0n && ra.material_id !== rb.material_id) bad('movement_lineage', 'A zero move cannot change recipient identity.');
    if (amount?.n > 0n && (initial.amount?.n === 0n || db.material_id === rb.material_id) && ra.material_id !== db.material_id) bad('movement_lineage', 'Unmixed recipient must retain donor identity.');
    const ancestry = [...new Set([...initial.ancestry, ...(amount?.n === 0n ? [] : before.ancestry)])].sort();
    if (ra.material_id && ancestry.length) {
      const previous = materialAncestry.get(ra.material_id);
      if (previous && previous !== ancestry.join('|')) bad('movement_lineage', 'Material ID cannot erase or change contributor identities.');
    }
    if (!valid) { taint(); continue; }
    event.consumption_uL = exact(amount);
    event.per_unit_moved_uL = amount === null ? null : exact(volume(m.amount));
    event.donor_material_id = db.material_id;
    event.stock_sufficiency = before.amount === null || amount === null ? 'unknown' : 'sufficient_for_declared_amount';
    if (!before.amount) note('movement_source_sufficiency', path, 'Known consumption does not establish available stock.', op.id);
    // Unknown/model-blocked transitions cannot seed a later physical balance.
    if (!supported || !amount) { event.status = 'consumption_only'; taint(); continue; }
    if (!before.amount) after = null;
    if (!initial.amount) final = null;
    let residualComponents = null, recipientComponents = null;
    if (before.components && before.components.size <= 1 && after !== null) residualComponents = new Map([...before.components.keys()].map(id => [id, after]));
    if (amount.n === 0n) recipientComponents = initial.components;
    else if (initial.components && before.components?.size === 1) {
      recipientComponents = new Map(initial.components);
      const material = [...before.components.keys()][0]; recipientComponents.set(material, add(recipientComponents.get(material) || zero(), amount));
    } else if (before.amount && cmp(amount, before.amount) === 0 && before.components && initial.components) {
      recipientComponents = new Map(initial.components);
      for (const [id, q] of before.components) recipientComponents.set(id, add(recipientComponents.get(id) || zero(), q));
    }
    if (before.components?.size > 1 && amount.n > 0n && before.amount && cmp(amount, before.amount) < 0) note('component_partition_unknown', path, 'A partial mixture withdrawal does not specify component partition or target retention.', op.id, ['completeness']);
    computed.set(da.id, {amount: after, ancestry: after?.n === 0n ? [] : before.ancestry, components: after?.n === 0n ? new Map() : residualComponents});
    computed.set(ra.id, {amount: final, ancestry, components: recipientComponents});
    if (ra.material_id && ancestry.length) materialAncestry.set(ra.material_id, ancestry.join('|'));
    for (const s of [db, rb]) used.add(s.id);
    for (const s of [da, ra]) current.set(s.location_id, s.id);
    event.status = findings.slice(start).some(f => f.scopes.includes('balance')) ? 'partial' : 'balanced_declared_model';
  }
  const stateRows = r.states.map(state => {
    const value = computed.get(state.id), path = statePaths.get(state.id), slots = run.layout[state.location_id], count = cardinality(state.quantity.basis, run);
    let layout = null;
    if (!slots || count === null) note('layout_unknown', path, 'Physical instances/cardinality are not completely assigned.');
    else if (slots.reduce((n, s) => n + s.units, 0) !== count) note('layout_cardinality_mismatch', path, 'Layout units must sum to this state basis cardinality.');
    else if (value?.amount != null) layout = slots.map(slot => {
      const amount = mul(value.amount, rational(BigInt(slot.units), BigInt(count)));
      const fits = slot.capacity_uL === null ? null : cmp(amount, decimal(slot.capacity_uL)) <= 0;
      if (fits === null) note('capacity_unknown', path, 'Vessel capacity is not established.');
      if (fits === false) note('capacity_exceeded', path, 'Declared physical vessel total exceeds capacity.');
      return {instance_id: slot.id, amount_uL: exact(amount), capacity_uL: slot.capacity_uL, fits};
    });
    return {declared: state, aggregate_uL: exact(value?.amount), contributor_ids: value?.ancestry || null,
      components_uL: value?.components ? Object.fromEntries([...value.components].map(([k, q]) => [k, exact(q)])) : null,
      current: current.get(state.location_id) === state.id, layout};
  });
  return {operations: events, states: stateRows, findings};
}
