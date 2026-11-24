// Build equipment capability records from the catalogue (issue #24).
// Every liquid handler, module and peripheral device class comes from
// content/market.js and content/registry.js through the generic mapping in
// content/equipment-map.json. No product is named in this file.

// Legacy snapshots predate this field. A record with explicit eligibility
// must be assessed before it can supply a handler, peripheral or workcell.
export const admitsPlanning = r => !Object.hasOwn(r, 'planningEligibility') || r.planningEligibility === 'assessed';

const range = (r, basis, source = null) => ({lo: r[0], hi: r[1], basis, source});

function opsFromModuleName(name, map) {
  return map.moduleNames.filter(m => new RegExp(m.pattern, 'i').test(name)).map(m => m.operation);
}

function measurementOp(record, map) {
  const text = `${record.name} ${record.summary || ''} ${record.category || ''}`;
  return map.measurementByDescription.find(m => new RegExp(m.pattern, 'i').test(text))?.operation || null;
}

// One record per liquid handler: {id, name, vendor, category, ops:{op:{type, module, minUl, maxUl}}, capacity}
export function liquidHandlers({market, registry, map}) {
  const out = [];
  const covered = new Set();
  for (const r of market.records.filter(admitsPlanning).filter(r => map.liquidHandlerCategories.includes(r.category))) {
    // A registry entry is the same product only when its driver is linked
    // and its model name appears as a whole word in the catalogue name.
    for (const d of r.integration?.drivers || []) {
      const reg = registry.records.find(x => admitsPlanning(x) && x.id === d.registryId);
      if (reg && new RegExp(`\\b${reg.name.replace(/[^a-z0-9 -]/gi, '').replace(/^\S+ /, '')}\\b`, 'i').test(r.name.replace(/^\S+ /, '') + ' ' + r.name)) covered.add(d.registryId);
    }
    const ops = {};
    for (const c of r.capabilities) {
      const op = map.marketOperations[c.operation] || (c.operation === 'qc' ? measurementOp(r, map) : c.operation);
      if (!op) continue;
      const entry = {type: c.type, module: c.module || null, minUl: c.minUl ?? null, maxUl: c.maxUl ?? null, basis: 'catalogue', detail: c.detail || ''};
      if (!ops[op] || rank(entry.type) < rank(ops[op].type)) ops[op] = entry;
    }
    // Modules named in the record but not linked to an operation in it.
    for (const m of r.modules || []) for (const op of opsFromModuleName(m, map)) if (!ops[op]) ops[op] = {type: 'optional', module: m, minUl: null, maxUl: null, basis: 'module-name', detail: `Inferred from the listed module “${m}”; confirm the module provides this operation.`};
    if (!ops['liquid-transfer']) ops['liquid-transfer'] = {type: 'native', module: null, minUl: null, maxUl: null, basis: 'category', detail: 'Liquid handler category; head and volume range not recorded.'};
    const linked = (r.integration?.drivers || []).map(d => registry.records.find(x => admitsPlanning(x) && x.id === d.registryId)).filter(Boolean);
    out.push({id: r.id, name: r.name, vendor: r.vendor, category: r.category, ops, capacity: capacity(r.id, ops, map), sources: r.sources || [], pylabrobot: pylabrobotSupport(linked, map, r.integration?.drivers || [])});
  }
  for (const r of registry.records.filter(admitsPlanning).filter(r => r.capabilities.includes('liquid handling') && !covered.has(r.id))) {
    const ops = {};
    for (const c of r.capabilities) { const op = map.registryCapabilities[c]; if (op) ops[op] = {type: 'native', module: null, minUl: null, maxUl: null, basis: 'registry', detail: `Registry capability “${c}”.`}; }
    out.push({id: r.id, name: `${r.vendor} ${r.name}`, vendor: r.vendor, category: 'liquid handler', ops, capacity: capacity(r.id, ops, map), sources: [{title: r.name, url: r.documentationUrl || r.manufacturerUrl}], pylabrobot: pylabrobotSupport([r], map)});
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

const rank = t => ({native: 0, optional: 1, external: 2}[t] ?? 3);

// PyLabRobot support (#82) from the pinned registry: the best linked driver's
// own status, mapped to supported / partial / community; none when no driver
// is linked. Limitations recorded in the catalogue travel with it.
function pylabrobotSupport(records, map, drivers = []) {
  const order = Object.keys(map.pylabrobotSupport.map);
  const best = records.slice().sort((a, b) => order.indexOf(a.driverStatus) - order.indexOf(b.driverStatus))[0];
  if (!best) return {status: 'none', driverStatus: null, api: null, documentationUrl: null, limitations: [], source: null};
  const d = drivers.find(x => x.registryId === best.id) || {};
  return {status: map.pylabrobotSupport.map[best.driverStatus] || 'none', driverStatus: best.driverStatus, registryId: best.id, name: `${best.vendor} ${best.name}`,
    api: best.api || null, apiVersion: best.upstreamMetadata?.api_version || null, models: best.upstreamMetadata?.models || null,
    documentationUrl: best.documentationUrl || null, limitations: [...(d.limitations || []), ...(best.notes ? [best.notes] : [])].filter((x, i, a) => a.indexOf(x) === i),
    source: best.source?.pinnedUrl || null};
}

function capacity(id, ops, map) {
  const deck = map.deckPositions[id];
  const racks = deck ? range([Math.max(1, Math.floor(deck.positions * map.tipRackShareOfDeck[0])), Math.floor(deck.positions * map.tipRackShareOfDeck[1])], 'estimate-from-deck-positions', deck.source) : range(map.defaultTipRacks, 'default-estimate');
  return {tipRacks: racks, deckPositions: deck?.positions ?? null};
}

// Peripheral device classes, one per operation, with the catalogue devices
// that provide it as evidence. A class is 'cooling' if any member cools.
export function deviceClasses({market, registry, map}) {
  const classes = {};
  const add = (op, name, cooling) => { (classes[op] ||= {operation: op, examples: [], cooling: false}); classes[op].examples.push(name); if (cooling) classes[op].cooling = true; };
  for (const r of registry.records.filter(admitsPlanning).filter(r => !r.capabilities.includes('liquid handling'))) {
    const cooling = r.capabilities.includes(map.coolingCapability);
    for (const c of r.capabilities) { const op = map.registryCapabilities[c]; if (op && op !== 'liquid-transfer') add(op, `${r.vendor} ${r.name}`, cooling); }
  }
  for (const r of market.records.filter(admitsPlanning).filter(r => !map.liquidHandlerCategories.includes(r.category) && !map.workcellCategories.includes(r.category))) {
    for (const c of r.capabilities.filter(c => c.type === 'native')) {
      const op = map.marketOperations[c.operation] || (c.operation === 'qc' ? measurementOp(r, map) : c.operation);
      if (op && op !== 'vessel-transfer') add(op, `${r.vendor} ${r.name}`, /cold|refrigerat/i.test(`${c.operation} ${(r.modules || []).join(' ')}`));
    }
  }
  for (const c of Object.values(classes)) c.examples = [...new Set(c.examples)].sort();
  return classes;
}

export function workcells({market, map}) {
  return market.records.filter(admitsPlanning).filter(r => map.workcellCategories.includes(r.category)).map(r => ({id: r.id, name: r.name, vendor: r.vendor, sources: r.sources || []}));
}
