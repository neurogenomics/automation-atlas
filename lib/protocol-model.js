// Turn any imported protocol snapshot into a list of generic operations
// (issue #24). Nothing here knows about a particular protocol, lab or assay:
// step text is matched against the general lexicon in content/lexicon.json,
// and anything a protocol needs beyond that comes from a reviewed
// per-protocol file (content/protocols/reviews/*.json), which is data.
//
// A snapshot is any object with {source, id, version:{id, number}, name, url,
// steps:[{position, title, text, guid?}]}. Labstep exports
// (lab-mcp/protocol-export/1) and protocols.io imports both normalise to it.

const UNITS = {s: 1 / 60, sec: 1 / 60, secs: 1 / 60, second: 1 / 60, seconds: 1 / 60, min: 1, mins: 1, minute: 1, minutes: 1, h: 60, hr: 60, hrs: 60, hour: 60, hours: 60};
const DURATION = /([0-9]+(?:[.][0-9]+)?)(?: *[-–] *([0-9]+(?:[.][0-9]+)?))? *(seconds?|secs?|minutes?|mins?|min|hours?|hrs?|hr|h|s)(?![a-z])/gi;

export function statedMinutes(line) {
  let total = 0;
  for (const m of line.matchAll(DURATION)) total += Number(m[2] || m[1]) * UNITS[m[3].toLowerCase()];
  return Math.round(total * 10) / 10;
}

// A volume that names a vessel's size ("a 1.5 ml tube", "15 mL Falcon tube",
// "0.2 mL PCR tubes") is not liquid moved.
const VESSEL_SIZE = /^ *(?:[a-z-]+ ){0,2}(?:tubes?|plates?|strips?|falcons?|columns?|reservoirs?)\b/i;
const statedVolumes = (line, re) => [...line.matchAll(re)].filter(m => !VESSEL_SIZE.test(line.slice(m.index + m[0].length)));
const statedVolume = (line, re) => statedVolumes(line, re)[0];

export function quantityReview(action) {
  const {line} = action;
  const warnings = [];
  const volumeCount = statedVolumes(line, /\d+(?:\.\d+)? *(?:µl|ul|μl|ml)(?![a-z])/gi).length;
  if (action.kind === 'liquid-transfer' && volumeCount > (action.partsUl?.length ?? 1)) {
    warnings.push('Check which liquid volume applies to each operation.');
  }
  if ([...line.matchAll(DURATION)].length > 1 && action.kind !== 'thermocycling') {
    warnings.push('Check how the durations are assigned to operations.');
  }
  const temperatures = new Set([...line.matchAll(/-?\d+(?:\.\d+)? *°? *c(?![a-z])/gi)]
    .map(value => Number.parseFloat(value[0])));
  if (temperatures.size > 1 && action.kind !== 'thermocycling') {
    warnings.push('Check how the temperatures are assigned to operations.');
  }
  return warnings;
}
export function volumeUl(line) {
  const m = statedVolume(line, /([0-9]+(?:[.][0-9]+)?) *(µ|u|μ)l(?![a-z])/gi) || statedVolume(line, /([0-9]+(?:[.][0-9]+)?) *ml(?![a-z])/gi);
  if (!m) return null;
  return /ml/i.test(m[0]) && !/[µuμ]l/i.test(m[0]) ? Number(m[1]) * 1000 : Number(m[1]);
}
// A quantity after "leaving", or the addition in a compound wash, is not
// the amount aspirated. Only bind an amount named by the removal command.
function statedRemovalUl(line) {
  const command = line.match(/^(?:(?:carefully|gently|slowly|then)\s+)*(?:remove(?: and discard)?|discard|aspirate)\s+/i);
  if (!command) return undefined;
  const amount = line.slice(command[0].length);
  if (/\bleav(?:e|ing) (?:about )?\d+(?:\.\d+)?\s*(?:µl|μl|ul|ml)\b/i.test(amount)) return null;
  if (/^\d+(?:\.\d+)?\s*(?:[-–]|to\s+)\s*\d/i.test(amount)) return null;
  const match = amount.match(/^(\d+(?:\.\d+)?\s*(?:µl|μl|ul|ml))\b/i);
  if (!match) return undefined;
  const rest = amount.slice(match[0].length);
  if (/^\s*(?:[–-]|(?:to|or)\s+\d|in total\b|total\b|across\b)/i.test(rest)) return null;
  return volumeUl(match[1]);
}

// Only expose fraction names and destinations that are stated by the source.
function statedFraction(action) {
  const line = action.line.replace(/(\d)\.(?=\d)/g, '$1·');
  if (['removal', 'wash'].includes(action.contact)) {
    const m = line.match(/^(?:(?:carefully|gently|slowly|then)\s+)*(remove|aspirate|discard)\b[^.;]*?\b(supernatant|eluate|pellet)\b/i);
    if (m) return {kind: m[2].toLowerCase(), disposition: m[1].toLowerCase() === 'discard' || /\bdiscard\b/i.test(m[0]) || /^[^.;]*\b(?:to|into) (?:the )?waste\b/i.test(line.slice(m[0].length)) ? 'discarded' : 'unstated'};
  }
  if (['sample-move', 'output-split'].includes(action.contact)) {
    const m = line.match(/^(?:(?:carefully|gently|slowly|then)\s+)*(?:transfer|move|collect)\b[^.;]*?\b(supernatant|eluate|pellet)\b/i);
    if (m) return {kind: m[1].toLowerCase(), disposition: 'transferred'};
  }
  return null;
}
// "Add 2X volume SPRI beads": a volume stated as a multiple of what the well holds.
export function volumeRatio(line) {
  const m = line.match(/(?:^|[^0-9.])([0-9]+(?:[.][0-9]+)?) ?x vol(?:ume|\.)?(?![a-z])/i);
  return m ? Number(m[1]) : null;
}

// "Resuspend 10 µl beads in 190 µl buffer": both liquids end up in the vessel,
// so the volume is their sum. The pattern (content/lexicon.json
// combinedVolume) captures X, its unit, Y and its unit; null when it does not apply.
// Returns the two volumes, [X, Y] in µl; the well gains their sum.
export function combinedVolumesUl(line, re) {
  const m = re && line.match(re);
  if (!m) return null;
  const ul = (n, unit) => /^ml$/i.test(unit) ? Number(n) * 1000 : Number(n);
  return [ul(m[1], m[2]), ul(m[3], m[4])];
}
const sumUl = parts => Math.round(parts.reduce((t, v) => t + v, 0) * 1000) / 1000;

export function temperatureC(line) {
  if (/on ice|ice[- ]cold/i.test(line)) return 4;
  if (/room temperature|\brt\b/i.test(line)) return 22;
  const m = line.match(/(-?[0-9]+(?:[.][0-9]+)?) ?°? ?c(?![a-z])/i);
  return m ? Number(m[1]) : null;
}

// How many times the line is done: '2x 200 µl' = 2, 'twice' = 2,
// 'repeat ... 2 more times' = 2 more (handled by the caller).
export function repeats(line) {
  const more = line.match(/repeat[^.]*?([0-9]+) more times?/i);
  if (more) return Number(more[1]);
  // '2x vol.' / '2X volume' is a ratio, not a repeat.
  const x = line.match(/(?:^|[^0-9.])([0-9]+) ?x(?![a-z0-9])(?! ?vol(?:ume)?\b)/i);
  if (x && !/[0-9]+ ?x ?g(?![a-z])/i.test(line)) return Number(x[1]);
  if (/twice/i.test(line)) return 2;
  if (/three times|thrice/i.test(line)) return 3;
  return 1;
}

// A transfer that only adds liquid (no aspiration of sample material) can be
// made by a bulk dispenser.
export const additionOnly = line => /^add\b|\badd [0-9]|^dispense\b/i.test(line) && !/(remove|discard|aspirat|transfer|supernatant|resuspend)/i.test(line);

// ---------------------------------------------------------------- materials (#61)
// What each action moves, what it touches, the conditions it needs and how
// its tip meets liquid. Material classes and their handling come from
// content/materials.json; nothing here names a protocol or product.
export function compileMaterials(cat) {
  if (!cat) return null;
  const re = p => new RegExp(p, 'i');
  return {
    cat,
    classes: Object.entries(cat.classes).map(([id, c]) => ({id, ...c, res: c.patterns.map(re), cats: new Set(c.categories.map(x => x.toLowerCase()))})),
    transfer: re(cat.transfer), sampleSpecific: re(cat.sampleSpecific), sampleHold: re(cat.sampleHold), addedPart: re(cat.addedPart), onMagnet: re(cat.onMagnet), offMagnet: re(cat.offMagnet), removal: re(cat.removal), addition: re(cat.addition), mixHere: re(cat.mixHere), keepCold: re(cat.keepCold),
    agitation: Object.entries(cat.agitation).map(([k, p]) => [k, re(p)]),
    tips: Object.fromEntries(Object.entries(cat.tips || {}).map(([k, p]) => [k, re(p)])),
  };
}

// Material classes named in a line, plus Labstep inventory fields of the step
// whose name appears in the line (the export drops inline references, so a
// field is credited to the line only when its name or category matches).
export function materialsIn(line, ml, inventory = []) {
  // "Add 92 µl beads to 46 µl product": the liquid moved is what comes before "to".
  if (ml.addition.test(line) && !ml.removal.test(line)) { const m = line.match(ml.addedPart); if (m && m[1].trim().split(/\s+/).length > 1) line = m[1]; }
  const found = new Map();
  for (const c of ml.classes) {
    const m = c.res.map(r => line.match(r)).find(Boolean);
    if (m) found.set(c.id, {class: c.id, name: m[0], basis: 'text'});
  }
  for (const f of inventory) {
    const c = ml.classes.find(c => (f.category && c.cats.has(f.category.toLowerCase())) || c.res.some(r => r.test(f.name || '')));
    if (c && !found.has(c.id) && (c.res.some(r => r.test(line)) || (f.name && line.toLowerCase().includes(f.name.toLowerCase().slice(0, 12))))) found.set(c.id, {class: c.id, name: f.name, basis: 'labstep inventory'});
  }
  return [...found.values()];
}

// Conditions an action must hold, all at the same time.
export function conditionsOf(line, ml, temperature) {
  const agitation = ml.agitation.find(([, r]) => r.test(line))?.[0] || null;
  const onMagnet = ml.offMagnet.test(line) ? false : ml.onMagnet.test(line) ? true : null;
  const minutes = statedMinutes(line) || null;
  return {temperatureC: temperature, agitation, onMagnet, minutes, together: !!(agitation && temperature != null && temperature !== 22)};
}

// How the tip meets liquid. 'free' = shared reagent dispensed without
// touching the well (one tip set can serve many wells); 'contact' = the tip
// touches the sample (fresh tip per sample); 'removal' = liquid taken off a
// sample (that sample's own tip, reusable for its later removals in the same
// block); 'sample-move' = the sample itself moves to new labware.
export function contactOf(kind, line, volume, ml, nextKind, materials = []) {
  if (!['liquid-transfer', 'magnetic-separation', 'mixing', 'rotation', 'reagent-preparation', 'fluorescence-quantification'].includes(kind)) return null;
  if (kind === 'reagent-preparation') return 'batch';
  if (kind === 'mixing') return 'mix';
  if (ml.transfer.test(line)) return 'sample-move';
  // A measurement's standards and buffers go into its own tubes, not the
  // sample well; only the aliquot it takes (a transfer) touches the samples.
  if (kind === 'fluorescence-quantification') return ml.removal.test(line) ? 'removal' : null;
  // A column's flow-through collects in its collection tube, not the sample well.
  if (/\bflow[- ]?through\b/i.test(line) && !ml.addition.test(line)) return null;
  const persistent = materials.some(m => ml.classes.find(c => c.id === m.class)?.persists);
  const removes = ml.removal.test(line), adds = (volume != null || persistent) && ml.addition.test(line);
  // 'wash' as an instruction, not a reagent's name ("200 µl wash buffer").
  if (/\bwash(?!(?:ing)? (?:buffer|solution)\b)/i.test(line) && volume != null) return 'wash';
  if (removes && adds) return 'removal+add';
  if (removes) return 'removal';
  if (!adds) return null;
  if (ml.mixHere.test(line) || nextKind === 'mixing' || volume < ml.cat.contactBelowUl || ml.sampleSpecific.test(line)) return 'contact';
  return 'free';
}

// Split a line holding several instructions ("Remove supernatant. Take the
// sample off the magnet and add 50 µl.") into ordered instructions. A part
// that does not start with an instruction stays with the one before it.
export function splitInstructions(line, lex) {
  const parts = line.split(/(?<=[.;])\s+(?=[A-Z])/);
  const out = [];
  for (const part of parts) {
    if (out.length && !lex.startsWithVerb.test(part.trim())) out[out.length - 1] += ' ' + part;
    else out.push(part);
  }
  const sentences = out.length > 1 && lex.startsWithVerb.test(out[0].trim()) ? out.map(x => x.trim()) : [line];
  return sentences.flatMap(sentence => splitTimedSequence(sentence, lex));
}

const timedCommand = /^(?:(?:briefly|carefully|gently|quickly)\s+)*(?:(?:incubate|leave|spin|centrifuge|pellet|shake|rotate)\b|place\b[^,;]*?\bon (?:the )?magnet\b)/i;
const liquidCommand = /^(?:(?:carefully|gently|quickly)\s+)*(?:add|transfer|re-?suspend|remove|aspirate|discard|decant|dispense)\b\s+\S/i;
const conditionalSequence = /\b(?:if|unless|otherwise|optionally|depending on)\b/i;

function splitTimedSequence(line, lex) {
  if (conditionalSequence.test(line) || lex.washes?.define.test(line) || inlineWash(line, lex)) return [line];
  // A completed incubation can introduce an instruction. Its stated duration
  // describes the dependency, so it must not enter the next operation's timer.
  const context = line.match(/^after (?:the )?(?:[^,]+ )?incubation,\s*/i)?.[0] || '';
  const text = line.slice(context.length);
  const timed = clause => timedCommand.test(clause) && statedMinutes(clause) > 0;
  const command = clause => timedCommand.test(clause) || liquidCommand.test(clause);
  const separators = /[()]|,?\s+(?:and then|followed by|and|then)\s+|,\s*/gi;
  let depth = 0, start = 0, explicitlyOrdered = false;
  const clauses = [];
  for (const match of text.matchAll(separators)) {
    const separator = match[0];
    if (separator === '(') { depth++; continue; }
    if (separator === ')') { depth = Math.max(0, depth - 1); continue; }
    if (depth) continue;
    const end = match.index + separator.length;
    const before = text.slice(start, match.index).trim();
    const after = text.slice(end).trim();
    if (!command(before) || !command(after)) continue;
    // Plain conjunctions and list separators need a timed action adjacent to
    // them. An explicit "then" can also order two liquid actions.
    const ordered = /(?:then|followed by)/i.test(separator);
    if (!ordered && !timed(before) && !timed(after)) continue;
    explicitlyOrdered ||= ordered;
    clauses.push(before);
    start = end;
  }
  clauses.push(text.slice(start).trim());
  return explicitlyOrdered && clauses.some(timed) ? clauses : [line];
}

// Walk the workflow in order, tracking what is in each sample well, so each
// action knows what its tip touches and which handling rules apply.
export function trackMaterials(chunks, ml) {
  if (!ml) return {materials: [], checks: [], holds: []};
  const props = ml.cat.properties;
  const byClass = new Map(ml.classes.map(c => [c.id, c]));
  let well = new Set();
  const seen = new Map();
  const checks = [];
  const note = (id, a, extra = {}) => {
    const c = byClass.get(id);
    const s = seen.get(id) || {class: id, label: c.label, properties: Object.entries(c.properties).map(([k, basis]) => ({id: k, label: props[k].label, basis, requires: props[k].requires, why: props[k].why})), keepColdStated: [], firstAction: a.id, actions: 0};
    s.actions++; if (extra.cold) s.keepColdStated.push(a.line);
    seen.set(id, s);
  };
  const holds = [];
  for (const ch of chunks) {
  const hold = () => { for (const h of ch.holds || []) {
    // "Place tube on ice" names the sample, not a reagent.
    const ids = h.materials.length ? h.materials.map(m => m.class) : ml.sampleHold.test(h.line) ? [...well] : [];
    for (const id of ids) note(id, {id: `${ch.id}-hold`, line: h.line}, {cold: true});
    holds.push({chunkId: ch.id, line: h.line, materials: ids, subject: h.materials.length ? 'named' : ids.length ? 'sample' : 'unknown'});
    if (!ids.length) checks.push({actionId: null, chunkId: ch.id, type: 'cold-subject', line: h.line, text: 'Says to keep something cold but names no material. Which reagent or sample?'});
  } };
  for (const a of ch.actions) {
    const named = a.materials.map(m => m.class);
    const cold = ml.keepCold.test(a.line);
    for (const id of named) note(id, a, {cold});
    // What is in the well after this action.
    // Transferring cells (or beads) the well does not yet hold adds them to it.
    if (a.contact === 'sample-move' && named.some(id => byClass.get(id).persists && id !== 'nucleic-acid' && !well.has(id))) a.contact = 'contact';
    // Otherwise the moved liquid becomes the sample; beads stay behind on the magnet.
    if (a.contact === 'sample-move') well = new Set(named.filter(id => byClass.get(id).persists && id !== 'magnetic-beads').length ? named.filter(id => byClass.get(id).persists && id !== 'magnetic-beads') : ['nucleic-acid']);
    if (a.contact && a.contact !== 'batch' && a.contact !== 'sample-move') for (const id of named) if (byClass.get(id).persists) well.add(id);
    if (named.some(id => byClass.get(id).lyses) && well.has('cells')) { well.delete('cells'); well.add('nucleic-acid'); }
    a.well = [...well];
    // Tips touch the liquid moved, and the well contents when they contact the sample.
    const touches = new Set(named);
    if (['contact', 'mix', 'removal', 'removal+add', 'wash', 'sample-move'].includes(a.contact)) for (const id of well) touches.add(id);
    a.tipTouches = [...touches];
    const required = new Set();
    // A rule backed only by general practice is a preference; lab evidence makes it a requirement.
    for (const id of touches) for (const [k, basis] of Object.entries(byClass.get(id).properties)) for (const r of props[k].requires) required.add(basis === 'lab evidence' ? r : `${r} (preferred)`);
    for (const r of [...required]) if (r.endsWith(' (preferred)') && required.has(r.slice(0, -12))) required.delete(r);
    if (a.tipStated?.lowRetention) required.add('low-retention tips (stated in the protocol)');
    if (a.tipStated?.wideBore) required.add('wide-bore or cut tips (stated in the protocol)');
    if (a.contact && a.contact !== 'batch') a.handling = [...required];
    if (cold && !named.length && !a.well.length) checks.push({actionId: a.id, chunkId: ch.id, type: 'cold-subject', line: a.line, text: 'Says to keep something cold but names no material. Which reagent or sample?'});
    if (a.conditions?.together && a.conditions.temperatureC < 15) checks.push({actionId: a.id, chunkId: ch.id, type: 'combined', line: a.line, text: `Needs ${a.conditions.agitation} at ${a.conditions.temperatureC} °C at the same time: only a device that does both, or a handoff, can run it.`});
    if (['free', 'contact'].includes(a.contact) && !named.length && !(a.wash?.cycle > 1)) checks.push({actionId: a.id, chunkId: ch.id, type: 'material', line: a.line, text: 'Adds liquid but names no material, so its handling is unknown. What is added?'});
    if (a.contact === 'mix' && !a.tipStated && !ch.actions[ch.actions.indexOf(a) - 1]?.tipStated) checks.push({actionId: a.id, chunkId: ch.id, type: 'tip-reuse', line: a.line, text: 'Mix with the tip used for the addition, or a fresh tip?'});
  }
  hold();
  }
  return {materials: [...seen.values()], checks, holds};
}

export function compileLexicon(lexicon) {
  const re = p => new RegExp(p, 'i');
  return {
    tableValues: lexicon.tableValues.map(re), inputs: lexicon.inputs.map(re), notes: lexicon.notes.map(re), headers: lexicon.headers.map(re),
    programme: re(lexicon.programme), programmeNote: re(lexicon.programmeNotes), repeat: re(lexicon.repeat), continuation: re(lexicon.continuation),
    verb: new RegExp(`\\b(${lexicon.verbs})\\b`, 'i'),
    // Instructions start with an imperative ("Prepare", "Pool"), not "Pooling".
    startsWithVerb: new RegExp(`^(?:[a-z]\\.\\s*|[0-9]+\\.\\s+)?(?:gently |carefully |briefly |then |quickly |on ice, |using [^,]+, )?(${lexicon.verbs.split('|').filter(v => !/(ing|ed)$/.test(v)).join('|')})\\b`, 'i'),
    rules: lexicon.rules.map(r => ({...r, re: re(r.pattern)})),
    combinedVolume: lexicon.combinedVolume ? re(lexicon.combinedVolume) : null,
    // Case-sensitive: the capital marks the start of an instruction (#158).
    unknownInstruction: lexicon.unknownInstruction ? new RegExp(lexicon.unknownInstruction) : null,
    alternatives: lexicon.alternatives ? {explicit: lexicon.alternatives.explicit.map(re), bare: re(lexicon.alternatives.bare), inUse: re(lexicon.alternatives.inUse), end: re(lexicon.alternatives.end)} : null,
    washes: lexicon.washes ? Object.fromEntries(Object.entries(lexicon.washes).filter(([k]) => k !== 'about').map(([k, p]) => [k, re(p)])) : null,
  };
}

// The operation a phrase names, by the lexicon rules alone: specific equipment
// first, otherwise the earliest action word.
export function ruleOperation(text, lex) {
  for (const r of lex.rules) if (r.kind === 'device' && r.re.test(text)) return r.operation;
  let best = null;
  for (const r of lex.rules) {
    if (r.kind !== 'action') continue;
    const m = text.match(r.re);
    if (m && (!best || m.index < best.index)) best = {index: m.index, operation: r.operation};
  }
  return best?.operation || null;
}

// ---------------------------------------------------------------- alternatives (#171)
// A step that offers labelled alternatives runs one of them. Returns, for each
// line of the step, the alternative it belongs to (null = shared), plus the
// alternatives found; an empty list when the step has none.
const branchKey = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
export function stepAlternatives(lines, lex) {
  const alt = lex.alternatives;
  const none = {of: lines.map(() => null), options: []};
  if (!alt) return none;
  const tableLike = l => lex.tableValues.some(r => r.test(l)) || lex.inputs.some(r => r.test(l));
  const labels = lines.map(l => {
    for (const r of alt.explicit) { const m = l.match(r); if (m) return {name: m[1].trim(), rest: (m[2] || '').trim(), explicit: true, inUse: alt.inUse.test(l)}; }
    const b = l.match(alt.bare);
    return b && !tableLike(l) ? {name: b[1].trim(), explicit: false, inUse: false} : null;
  });
  if (!labels.some(x => x?.explicit) || labels.filter(Boolean).length < 2) return none;
  const options = [];
  let cur = null;
  const of = lines.map((l, k) => {
    if (labels[k]) { cur = {name: labels[k].name, key: branchKey(labels[k].name), label: l, inUse: labels[k].inUse, lines: 0}; options.push(cur); return {option: cur, label: true, rest: labels[k].rest || ''}; }
    if (cur && alt.end.test(l)) cur = null;
    if (cur) cur.lines++;
    return cur ? {option: cur, label: false} : null;
  });
  return {of, options};
}

// Which alternative a step runs: the workflow's choice for this step or for
// every step ('*'), then a block the protocol marks as in use, then the first
// (listed as a question).
function chooseAlternative(chunkId, options, branches = {}, required = false) {
  const wanted = c => (Array.isArray(c) ? c : c == null ? [] : [c]).map(branchKey);
  for (const [scope, basis] of [[chunkId, 'workflow (this step)'], ['*', 'workflow']]) {
    const names = wanted(branches[scope]);
    const matches = options.filter(o => names.includes(o.key));
    if (required && matches.length > 1) return {chosen: null, basis: 'question', why: 'Choose one arm for this step.'};
    if (matches.length) return {chosen: matches[0], basis};
    if (scope === chunkId && names.length) return {chosen: required ? null : options[0], basis: 'question', why: `The workflow chooses “${[branches[scope]].flat().join(' / ')}”, which this step does not offer.${required ? '' : ' The first alternative is counted until that is fixed.'}`};
  }
  if (required) return {chosen: null, basis: 'question', why: 'Choose the arm before estimating dependent work.'};
  const inUse = options.filter(o => o.inUse);
  if (inUse.length === 1) return {chosen: inUse[0], basis: 'marked in use in the protocol'};
  return {chosen: options[0], basis: 'question', why: 'The workflow has not chosen; the first alternative is counted so the work is not counted twice.'};
}

// ---------------------------------------------------------------- defined washes (#171)
// Components of a wash definition: the hold (rotation, shaking, incubation)
// and the separation (spin or magnet), each with any duration it states, in
// the order a wash is done.
const HOLDS = new Set(['rotation', 'shaking', 'incubation']);
const SEPARATIONS = new Set(['centrifugation', 'magnetic-separation']);
export function washDefinition(text, lex) {
  const parts = text.split(lex.washes.split).map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const op = ruleOperation(p, lex);
    if (!HOLDS.has(op) && !SEPARATIONS.has(op)) continue;
    out.push({op, text: p.replace(/^for [^:]*?\ball (?:mentioned )?\w+ (?:should be|are done|consist of)\b:?\s*/i, '').replace(/[.:]$/, ''), minutes: statedMinutes(p) || null, temperatureC: temperatureC(p)});
  }
  return out.sort((a, b) => (HOLDS.has(a.op) ? 0 : 1) - (HOLDS.has(b.op) ? 0 : 1));
}
// "(Wash = 1 min rotation + 2 min spin (1000 x g))": the definition and the line without it.
export function inlineWash(line, lex) {
  const m = lex.washes && line.match(lex.washes.inlineStart);
  if (!m) return null;
  let depth = 1, k = m.index + m[0].length;
  for (; k < line.length && depth; k++) { if (line[k] === '(') depth++; else if (line[k] === ')') depth--; }
  return {definition: line.slice(m.index + m[0].length, k - 1), rest: (line.slice(0, m.index) + line.slice(k)).replace(/\s*\.\s*\./, '.').replace(/\s+/g, ' ').trim()};
}

// Read one line in isolation. Returns {type, operation?}: type is 'table',
// 'input', 'note', 'header', 'repeat', 'operation' or 'unknown'. Lines with
// no action word come back as 'plain' so the caller can read them in context.
// Words describing the station constrain liquid handling. They must not
// select the magnetic separation device to perform the transfer itself.
const liquidAtMagnet = /^(?:(?:carefully|gently|slowly) +)*(?:wash|remove|discard|aspirate|decant|add|transfer|pipette)\b.*\bon (?:the )?magnet\b/i;
const liquidAfterMagnet = /^take (?:[^,.]+? )?off (?:the )?magnet(?:,\s*(?:then +)?| and (?:then +)?)(?:add|re-?suspend|pipette|transfer)\b/i;

export function classifyLine(line, lex) {
  const l = line.trim().replace(/^\*+\s*/, '');
  if (lex.tableValues.some(r => r.test(l))) return {type: 'table'};
  if (lex.notes.some(r => r.test(l))) return {type: 'note'};
  if (liquidAtMagnet.test(l) || liquidAfterMagnet.test(l)) return {type:'operation', operation:'liquid-transfer'};
  if (lex.repeat.test(l)) return {type: 'repeat'};
  const cont = l.match(lex.continuation);
  if (cont) return {type: 'operation', operation: 'liquid-transfer', count: Number(cont[1])};
  // An instruction may follow a label: "PseudoBC: Prepare the following mix:".
  const startsWithAction = l.split(':').some(part => lex.startsWithVerb.test(part.trim()));
  if (!startsWithAction) {
    if (lex.inputs.some(r => r.test(l))) return {type: 'input'};
    const prep = lex.rules.find(r => r.operation === 'reagent-preparation');
    if (prep?.re.test(l)) return {type: 'operation', operation: 'reagent-preparation'};
    if (lex.headers.some(r => r.test(l))) return {type: 'header'};
  }
  if (lex.programmeNote.test(l)) return {type: 'programme-note'};
  // Specific equipment or measurement words decide first; otherwise the first
  // action mentioned in the line wins ("Add GuHCl … and mix" is an addition).
  for (const r of lex.rules) if (r.kind === 'device' && r.re.test(l)) return {type: 'operation', operation: r.operation};
  let best = null;
  for (const r of lex.rules) {
    if (r.kind !== 'action') continue;
    const m = l.match(r.re);
    if (m && (!best || m.index < best.index)) best = {index: m.index, operation: r.operation};
  }
  if (best) return {type: 'operation', operation: best.operation};
  if (lex.programme.test(l)) return {type: 'programme'};
  // An imperative sentence whose verb the lexicon does not know ("Sonicate the
  // samples.") is still an instruction: list it for review, not as a heading.
  if (lex.unknownInstruction?.test(l)) return {type: 'unknown'};
  if (!lex.verb.test(l)) return {type: 'plain'};
  // A short phrase that does not start with an action ("2x NEBNext master mix",
  // "Right-sided clean-up") is read in context: an ingredient or a heading.
  if (!startsWithAction && l.split(/ +/).length <= 6) return {type: 'plain'};
  return {type: 'unknown'};
}

const REAGENT_TITLE = /\b(buffer|solution|mix|master ?mix|reagents?|reaction|stock|lysis|working core)\b/i;

// Strip a repeated title and presentation bullets before reading the body.
export function stepLines(step) {
  const lines = step.text.split('\n').map(s => s.trim().replace(/^[-•*] */, '')).filter(Boolean);
  if (lines[0] && step.title && lines[0].trim() === step.title.trim()) lines.shift();
  return lines;
}

function optionalLines(lines, lex) {
  let block = false;
  return lines.map((line, i) => {
    const prefix = line.match(/^optional\b[: –-]*\s*(.*)$/i);
    if (prefix || /\(optional\)\s*$/i.test(line)) {
      // A prefixed command or note is local to its own line. A heading
      // opens a section, including in flattened exports without indentation.
      block = !prefix || !prefix[1] || ['plain', 'header'].includes(classifyLine(prefix[1], lex).type);
      return true;
    }
    if (/^(?:mandatory|required|resume|continue)\b/i.test(line)) block = false;
    if (block && ['plain', 'header'].includes(classifyLine(line, lex).type)
      && /^[A-Z][^.!?]*$/.test(line) && lines[i + 1]
      && classifyLine(lines[i + 1], lex).type === 'operation') block = false;
    return block;
  });
}

// A named optional stage can control which downstream instruction applies.
// Match both arms and their named headings before treating them as a choice.
function optionalStageAlternatives(lines, optional, lex) {
  const start = optional.indexOf(true);
  let end = optional.lastIndexOf(true);
  const name = lines[start]?.match(/^optional:\s*(.+)$/i)?.[1];
  if (!name) return null;
  // Some named sections contain a device noun the single-line reader treats
  // as work. Recover the section only from an explicit shared boundary and
  // the two matching arms checked below.
  const namedBoundary = end === start && !lex.startsWithVerb.test(name)
    ? lines.findIndex((line, i) => i > start && /\(shared\)\s*$/i.test(line))
    : -1;
  if (namedBoundary > start) end = namedBoundary - 1;
  if (end <= start || (namedBoundary < 0 && optional.slice(start, end + 1).includes(false))) return null;
  const shared = lines[end + 1]?.replace(/\s*\([^()]*\)\s*$/, '');
  if (!shared || classifyLine(shared, lex).type !== 'plain') return null;

  const arms = lines.slice(end + 2).map((line, i) => {
    const positive = line.match(/^if (.+) was performed,\s*(.+)$/i);
    const negative = line.match(/^for (.+) only,\s*(.+)$/i);
    if (positive && branchKey(positive[1]) === branchKey(name)) return {index: i + end + 2, performed: true, rest: positive[2]};
    if (negative && branchKey(negative[1]) === branchKey(shared)) return {index: i + end + 2, performed: false, rest: negative[2]};
    return null;
  }).filter(Boolean);
  if (arms.length !== 2 || arms[0].performed === arms[1].performed
      || arms.some(arm => !lex.startsWithVerb.test(arm.rest))) return null;

  // Adjacent bare amounts can qualify the common command. Only consume the
  // common line when both alternatives supply a single amount and no reagent.
  const commandIndex = end + 2;
  const command = lines[commandIndex]?.match(/^add +([a-z][^.;!?]+? and (?:mix|re-?suspend)\b[^.;!?]*)[.]?$/i);
  const amounts = arms.map(arm => arm.rest.match(/^add +(\d+(?:[.]\d+)? *(?:µl|μl|ul|ml))( *(?:\([^()]+\))?)[.]?$/i));
  const sharedAddition = Boolean(command && volumeUl(lines[commandIndex]) == null &&
    arms.every((arm, i) => arm.index === commandIndex + i + 1 && amounts[i] && volumeUl(amounts[i][1]) > 0));
  if (sharedAddition) for (const [i, arm] of arms.entries()) {
    arm.rest = `Add ${amounts[i][1]} ${command[1]}${amounts[i][2]}.`;
    arm.contextBodyLine = commandIndex + 1;
  }

  const skip = {name: `Skip ${name}`, label: lines[start], lines: 1};
  const include = {name: `Include ${name}`, label: lines[start], lines: end - start + 1};
  for (const option of [skip, include]) option.key = branchKey(option.name);
  const of = new Map([[start, {option: include, label: true, rest: ''}]]);
  for (let i = start + 1; i <= end; i++) of.set(i, {option: include});
  for (const arm of arms) of.set(arm.index, {option: arm.performed ? include : skip, label: true, rest: arm.rest,
    contextBodyLine:arm.contextBodyLine});
  return {of, options: [skip, include], sharedAdditionLine:sharedAddition ? commandIndex + 1 : null};
}

// A definite transfer at the end of a bounded block can leave that block
// in different labware. This records the source's vessel description without
// asserting a product, working capacity or pipettor access.
function statedTerminalAllocation(action) {
  if (action.kind !== 'liquid-transfer' || action.count.n !== 1 || !(action.volumeUl > 0)) return null;
  const match = action.line.match(/^(?:(?:carefully|gently|slowly|then) +)*transfer +\d+(?:\.\d+)? *(?:µl|μl|ul|ml) +(?:of +)?(?:the +)?(supernatant|eluate|sample|liquid) +(?:into|to) +(?:a +)?(?:fresh|new|clean) +((?:\d+(?:\.\d+)? *ml +)?(?:PCR +)?tube)[.!]?$/i);
  return match ? [{label:match[1].toLowerCase(), vessel:match[2], volumeUl:action.volumeUl}] : null;
}

// Keep source endpoints for cardinality-changing work. These descriptions
// are not a well map or a declaration that two vessel labels identify the
// same physical recipient.
function materialBoundary(line) {
  const body = line.replace(/^using [^,]+,\s*/i, '');
  const conditional = /^(?:inspect|visually inspect)\b.*\bif\b/i.test(body);
  const match = conditional
    ? body.match(/\bpool (?:in)?to (.+)/i)
    : body.match(/^(pool|distribute|split)\s+(.*?)\s*(?:\binto\b|\bto\b|\bacross\b)\s+(.+)/i);
  if (!match) return null;
  const endpoint = text => text.replace(/\s*\(.*$/, '').replace(/[.;]$/, '').trim() || null;
  const donor = conditional ? null : endpoint(match[2]);
  const recipient = endpoint(conditional ? match[1] : match[3]);
  // Require an explicit vessel or well/column layout term, so that preparing
  // a bulk reagent described as a pool does not become a sample boundary.
  if (!recipient || !/\b(?:wells?|columns?|tubes?|plates?|vessels?|containers?)\b/i.test([donor, recipient].join(' '))) return null;
  return {operation:conditional ? 'pool' : match[1].toLowerCase(), donor, recipient, conditional};
}

// Some sources put the observation and the dependent transfer in one line.
// Keep the inspection as work and the consequent pending an actual outcome.
function inspectionPoolingGate(line) {
  const m = line.match(/^((?:visually )?inspect\b.+?)(?:[.,;]\s*|\s+and\s+)if\s+(.+?)(?:[,:;]\s*|\.\s+)(?:then\s+)?(.+)$/i);
  if (!m || !materialBoundary(line)?.conditional) return null;
  return {inspection: m[1], condition: m[2], whenTrue: m[3], whenFalse: null, otherwise: null};
}

// An explicit single destination or two named output vessels on one line.
function outputAlternatives(line) {
  const m = line.match(/^(transfer\b.+?)\s+\(or\s+([^()+]+)\s+\+\s+([^()+]+)\s+in separate (tubes|wells)\)\.?$/i);
  if (!m || !/\b(?:supernatant|eluate|sample|liquid)\b/i.test(m[1])) return null;
  const total = volumeUl(m[1]);
  const vessel = m[4].toLowerCase().slice(0, -1);
  if (!(total > 0) || !new RegExp(`\\b(?:in)?to (?:a |one )?(?:new|fresh) (?:[a-z]+ )?${vessel}\\b`, 'i').test(m[1])) return null;
  const split = m.slice(2, 4).map(text => {
    const portion = text.trim().match(/^(\d+(?:\.\d+)?\s*(?:µl|μl|ul|ml))\s+(.+)$/i);
    return portion ? {label:portion[2].trim(), vessel, volumeUl:volumeUl(portion[1])} : null;
  });
  if (split.some(portion => !(portion?.volumeUl > 0)) || split[0].label.toLowerCase() === split[1].label.toLowerCase()) return null;
  return [
    {name:'One output vessel', key:'oneoutputvessel', outputs:[{label:'Transferred fraction', vessel, volumeUl:total}]},
    {name:'Separate output vessels', key:'separateoutputvessels', outputs:split},
  ];
}

// Preserve both stated QC outcomes. A parsed condition has no observed value.
function qualityGates(lines) {
  const gates = new Map();
  const alternatives = new Set();
  lines.forEach((line, index) => {
    const match = line.match(/^if\s+([^,]+),\s*(?:then\s+)?(.+)$/i);
    if (!match || !/\b(?:qc|quality control|trace|peak|electropherogram|yield|purity|recovery)\b/i.test(match[1])) return;
    const otherwise = lines[index + 1]?.match(/^otherwise(?:\s*,\s*|:\s*|\s+)(.+)$/i);
    if (otherwise) alternatives.add(index + 1);
    gates.set(index, {condition: match[1], whenTrue: match[2], whenFalse: otherwise?.[1] ?? null, otherwise: otherwise ? lines[index + 1] : null});
  });
  return {gates, alternatives};
}

// The labware a workflow runs in (issue #53). A workflow that names none
// (older profiles held only 'plate' or 'tube') gets the catalogue's legacy
// default, marked as assumed so the page can say so.
export function resolveLabware(workflow, catalogue) {
  if (!catalogue) return null;
  const chosen = catalogue.labware[workflow.labware];
  const id = chosen ? workflow.labware : catalogue.legacy[workflow.format] || catalogue.legacy.plate;
  return {id, ...catalogue.labware[id], basis: catalogue.basis, assumed: !chosen};
}

// What the chosen labware cannot hold, or what the protocol text says about a
// different kind of container. These are warnings for the protocol owner;
// nothing is changed to make the protocol fit.
// Running volume in one well (#129): removals empty it, additions add to it, a
// wash replaces the liquid (it is removed before and after), a move to a new
// well starts again from the volume moved, and "X in Y" (two stated parts) is
// made up in its own vessel. Measurements run in their own vessel and lines
// without a stated contact are not counted.
export function wellVolumes(chunks, operations = {}, inputVolumeUl = 0) {
  let cur = inputVolumeUl ?? 0;
  const out = [];
  for (const a of chunks.flatMap(c => c.actions)) {
    if (!a.contact || operations[a.kind]?.reviewWhenAutomated) continue;
    const v = a.volumeUl ?? 0;
    if (a.contact === 'removal') cur = a.removalUl == null ? 0 : Math.max(0, cur - a.removalUl);
    else if (a.contact === 'wash') { out.push({action: a, peakUl: v}); cur = a.lastRemovalStated ? v : 0; continue; }
    else if (a.contact === 'removal+add' || a.contact === 'sample-move' || a.partsUl?.length > 1) cur = v;
    else if (['free', 'contact'].includes(a.contact)) cur += v;
    out.push({action: a, peakUl: cur});
  }
  return out;
}

export function labwareWarnings(labware, chunks, lines, catalogue = null, operations = {}, inputVolumeUl = 0) {
  if (!labware) return [];
  const out = [];
  if (labware.assumed) out.push({type: 'assumed', text: `No labware was chosen for this workflow, so it is assessed in ${labware.label}s. Choose the labware on the Protocols page.`, examples: []});
  const over = chunks.flatMap(c => c.actions).filter(a => a.volumeUl != null && a.volumeUl > labware.maxUl);
  if (over.length) out.push({type: 'capacity', text: `${over.length} line${over.length === 1 ? ' states' : 's state'} a volume above the ${labware.maxUl} µl one ${labware.format === 'plate' ? 'well' : 'tube'} of a ${labware.label} holds (${labware.basis}).`, examples: [...new Set(over.map(a => a.line))].slice(0, 3)});
  // Volumes that add up beyond the well even though no single line does.
  const overSet = new Set(over);
  const full = wellVolumes(chunks, operations, inputVolumeUl).filter(w => w.peakUl > labware.maxUl && !overSet.has(w.action));
  if (full.length) {
    const peak = Math.max(...full.map(w => w.peakUl));
    const bigger = catalogue ? Object.entries(catalogue.labware).filter(([, l]) => l.format === labware.format && l.wells >= (labware.wells || 1) && l.maxUl >= peak).sort((x, y) => x[1].maxUl - y[1].maxUl)[0] : null;
    out.push({type: 'cumulative', peakUl: peak, steps: full.map(w => ({actionId: w.action.id, line: w.action.line, peakUl: w.peakUl})),
      text: `${full.length} step${full.length === 1 ? ' brings' : 's bring'} the volume in one ${labware.format === 'plate' ? 'well' : 'tube'} to more than the ${labware.maxUl} µl a ${labware.label} holds (up to ${Math.round(peak)} µl, adding the volumes stated since the last removal).${bigger ? ` A ${bigger[1].label} holds it; moving samples into it and back is a reformat transfer with its own time and loss, and a method change for the protocol owner.` : ' No catalogue labware of this format holds it: split the volume or do the step by hand.'}`,
      examples: [...new Set(full.map(w => w.action.line))].slice(0, 3)});
  }
  const re = new RegExp(labware.mentions, 'i');
  const named = [...new Set(lines.filter(l => l.type !== 'table' && re.test(l.line)).map(l => l.line))];
  if (named.length) out.push({type: 'container', text: `${named.length} line${named.length === 1 ? ' names' : 's name'} a different kind of container from a ${labware.label}. Running the protocol in this labware is a method change to confirm with the protocol owner.`, examples: named.slice(0, 3)});
  return out;
}

function selectProtocolBlock(parts, declaration, labwareCatalogue) {
  if (declaration == null) return null;
  const {source, id, versionId, from, through, input} = declaration;
  const matches = parts.filter(snap => snap.source === source && snap.id === id && snap.version.id === versionId);
  if (matches.length !== 1) throw Error('The block must belong to one exact workflow source version.');
  const [snapshot] = matches;
  const positions = snapshot.steps.map(step => step.position);
  const first = positions.indexOf(from), last = positions.indexOf(through);
  if (first < 0 || last < first || new Set(positions).size !== positions.length) {
    throw Error('Choose a contiguous range from the exact source steps.');
  }
  const labware = input && Object.hasOwn(labwareCatalogue?.labware ?? {}, input.labware) ? labwareCatalogue.labware[input.labware] : null;
  if (!labware || input.volumeUl !== null && (!Number.isFinite(input.volumeUl) || input.volumeUl < 0 || input.volumeUl > labware.maxUl)) {
    throw Error('The block input needs catalogued labware and a volume within its capacity.');
  }
  if (input.volumeUl !== null && (typeof input.evidence !== 'string' || !input.evidence.trim())) {
    throw Error('Give the evidence reference for the declared block input.');
  }
  const steps = snapshot.steps.slice(first, last + 1);
  return {snapshot, steps, hasFollowingSteps: last < snapshot.steps.length - 1, provenance: {source, id, versionId, from, through,
    nativeContentHash: snapshot.content_hash ?? null,
    firstStepGuid: steps[0].guid ?? null, lastStepGuid: steps.at(-1).guid ?? null,
    input: {labware: input.labware, volumeUl: input.volumeUl, evidence: input.evidence ?? null}}};
}

// Build the operation model for a workflow: an ordered list of snapshots plus
// reviewed overrides keyed by `${source}:${id}:${versionId}`.
export function buildOperationModel(workflow, {snapshots, lexicon, operations, reviews = {}, labware: labwareCatalogue = null, materials: materialCatalogue = null, limits = null}) {
  const lex = compileLexicon(lexicon);
  const ml = compileMaterials(materialCatalogue);
  const chunks = [];
  const review = [];
  const alternatives = [], qcGates = [];
  const lines = [];
  let actionCount = 0;
  const checkRepeats = n => { if (limits && (!Number.isSafeInteger(n) || n < 1 || n > limits.repeats)) throw RangeError('Operation expansion limit'); };
  const parts = workflow.parts.map(p => {
    const snap = snapshots[`${p.source}:${p.id}`];
    if (!snap) throw Error(`Workflow ${workflow.id} needs ${p.source}:${p.id}, which is not imported`);
    if (p.versionId != null && snap.version.id !== p.versionId) throw Error(`Workflow ${workflow.id} pins ${p.source}:${p.id} version ${p.versionId}; the imported snapshot is ${snap.version.id}`);
    if (p.contentHash && p.contentHash !== snap.content_hash) throw Error(`Workflow ${workflow.id} pins a different step hash for ${p.source}:${p.id}.`);
    return snap;
  });
  const selected = selectProtocolBlock(parts, workflow.block, labwareCatalogue);
  const appliedParts = selected ? [selected.snapshot] : parts;
  for (const snap of appliedParts) {
    const key = `${snap.source}:${snap.id}:${snap.version.id}`;
    const overrides = reviews[key]?.lines || {};
    for (const step of selected?.steps ?? snap.steps) {
      const chunk = {id: `${snap.source}-${snap.id}-${step.position}`, name: step.title, source: {source: snap.source, id: snap.id, protocol: snap.name, versionId: snap.version.id, versionNumber: snap.version.number, stepGuid: step.guid || null, position: step.position, contentHash: snap.content_hash ?? null, url: snap.url}, actions: [],
        // Labstep evidence for this step (issue #59): prescribed timer seconds, linked
        // equipment and observed minutes between ticks in past runs. Shown beside the
        // estimates; never mixed into them (ticks measure elapsed, not hands-on, time).
        prescribedSeconds: step.prescribedSeconds ?? null, devices: step.devices || [],
        observed: (step.guid && snap.observed?.steps?.[step.guid]) || null};
      let context = null; // 'component' or 'programme' while reading a table run
      const titleRule = lex.rules.find(r => r.re.test(step.title || ''));
      const lastOf = kind => [...chunk.actions].reverse().find(a => a.kind === kind);
      const push = (i, line, op, extra = {}) => {
        const n = extra.count ?? (parts[i]?.choice?.contextBodyLine != null ? 1 : repeats(line));
        checkRepeats(n);
        if (limits && ++actionCount > limits.actions) throw RangeError('Operation expansion limit');
        const combined = extra.volumeUl == null ? combinedVolumesUl(line, lex.combinedVolume) : null;
        const action = {
          id: `${chunk.id}-${i + 1}${extra.idSuffix || ''}`, label: line.length > 90 ? line.slice(0, 87) + '…' : line, line, kind: op, basis: extra.basis || 'lexicon',
          count: {n, basis: 'source', note: n > 1 ? 'Repeat count stated in the protocol.' : ''},
          volumeUl: extra.volumeUl ?? (combined ? sumUl(combined) : volumeUl(line)), ...(combined ? {partsUl: combined} : {}),
          ...(extra.volumeUl == null && !combined && volumeUl(line) == null && volumeRatio(line) ? {volumeRatio: volumeRatio(line)} : {}), temperatureC: extra.temperatureC ?? temperatureC(line), additionOnly: extra.additionOnly ?? additionOnly(line),
          wait: statedMinutes(line) || null, constraints: extra.constraints || [], components: [], programme: [], source: {stepGuid: step.guid || null, line: parts[i]?.choice ? parts[i].line : line},
        };
        if (ml) {
          action.materials = materialsIn(line, ml, step.inventory || []); action.conditions = conditionsOf(line, ml, action.temperatureC);
          // Tip handling the protocol itself states overrides any default.
          const t = ml.tips, stated = {reuse: t.reuse?.test(line) || false, fresh: t.fresh?.test(line) || false, lowRetention: t.lowRetention?.test(line) || false, wideBore: t.wideBore?.test(line) || false};
          if (Object.values(stated).some(Boolean)) action.tipStated = stated;
        }
        if (parts[i]?.sourceLine != null) action.source.bodyLine = parts[i].sourceLine;
        if (parts[i]?.bodyText) action.source.bodyText = parts[i].bodyText;
        if (parts[i]?.choice?.contextBodyLine != null) action.source.contextBodyLine = parts[i].choice.contextBodyLine;
        chunk.actions.push(action);
        return action;
      };
      chunk.holds = [];
      chunk.inventory = ml ? materialsIn((step.inventory || []).map(f => `${f.name} ${f.category || ''}`).join(' ; '), ml).map(m => ({...m, basis: 'labstep inventory'})) : [];
      const record = (line, type, operation = null) => {
        lines.push({chunkId: chunk.id, step: step.title, sourceLine: parts[n - 1].sourceLine, line, type, operation});
        // "Keep RNA on ice": a standing condition on a material, not an action.
        if (ml && ['note', 'header', 'input'].includes(type) && ml.keepCold.test(line)) chunk.holds.push({line, materials: materialsIn(line, ml, step.inventory || []), temperatureC: 4});
      };
      let n = 0;
      const sourceLines = stepLines(step);
      const optional = optionalLines(sourceLines, lex);
      const optionalChoice = optionalStageAlternatives(sourceLines, optional, lex);
      const qc = qualityGates(sourceLines);
      const parts = sourceLines.flatMap((line, i) => optional[i] || optionalChoice?.of.has(i) || overrides[line] || qc.gates.has(i) || qc.alternatives.has(i)
        ? [{line, sourceLine: i + 1, optional: optional[i] && !optionalChoice?.of.has(i), choice: optionalChoice?.of.get(i),
          gate: qc.gates.get(i), gateOutcome: qc.alternatives.has(i)}]
        : splitInstructions(line, lex).map(part => ({line: part, sourceLine: i + 1, optional: false,
          ...(part === line ? {} : {bodyText: line})})));
      // A recognized dependency owns its optional stage and both arms.
      const alts = optionalChoice ? {options: optionalChoice.options, of: parts.map(part => part.choice)}
        : stepAlternatives(parts.map(p => p.optional ? '(optional)' : p.line), lex);
      let chosen = null;
      if (alts.options.length) {
        const pick = chooseAlternative(chunk.id, alts.options, workflow.branches || {}, Boolean(optionalChoice));
        chosen = pick.chosen;
        chunk.alternatives = {options: alts.options.map(o => o.name), chosen: chosen?.name ?? null, basis: pick.basis, ...(optionalChoice ? {requiresChoice: true} : {})};
        alternatives.push({chunkId: chunk.id, step: step.title, options: alts.options.map(o => ({name: o.name, label: o.label, lines: o.lines, inUse: o.inUse})), chosen: chosen?.name ?? null, basis: pick.basis, ...(optionalChoice ? {requiresChoice: true} : {}), why: pick.why || null});
      }
      // A defined wash (#171) holds until the end of the step or of the alternative it was given in.
      let washDef = null, washIn = null;
      const short = s => s.length > 70 ? s.slice(0, 67) + '…' : s;
      const expandWash = (i, text, original, def, count, nextLine) => {
        checkRepeats(count);
        const W = lex.washes;
        const first = text.match(W.first);
        const firstMin = first ? statedMinutes(first[1]) || null : null;
        const lineMin = statedMinutes(first ? text.replace(first[0], ' ') : text) || null;
        const keepLast = W.keepLast.test(text) || (!!nextLine && W.removes.test(nextLine) && !W.wash.test(nextLine) && classifyLine(nextLine, lex).type === 'operation');
        const tag = k => `Wash ${k} of ${count}`;
        const mark = (a, k, part, label) => { a.label = `${tag(k)}: ${short(label)}`; a.source.line = original; a.wash = {cycle: k, of: count, part, definition: def.line}; a.count.note = `One of ${count} washes stated in the protocol, expanded from the wash definition.`; return a; };
        for (let k = 1; k <= count; k++) {
          const add = mark(push(i, text, 'liquid-transfer', {count: 1, idSuffix: `w${k}a`, basis: 'wash definition'}), k, 'add', text);
          add.wait = null; add.contactStated = 'free';
          // A wash starts by taking off the supernatant (stated with the spin before it, or implied).
          if (k === 1) add.removeFirst = true;
          for (const comp of def.components) {
            const hold = HOLDS.has(comp.op);
            const minutes = hold ? (k === 1 && firstMin != null ? firstMin : comp.minutes ?? lineMin) : comp.minutes;
            if (hold && minutes == null) continue; // an undefined hold the line does not mention
            const a = mark(push(i, comp.text, comp.op, {count: 1, idSuffix: `w${k}${hold ? 'h' : 's'}`, basis: 'wash definition'}), k, hold ? 'hold' : 'separate', comp.text);
            a.wait = minutes;
          }
          if (k === count && keepLast) continue;
          mark(push(i, 'Remove and discard the supernatant.', 'liquid-transfer', {count: 1, idSuffix: `w${k}r`, basis: 'wash definition'}), k, 'remove', 'remove and discard the supernatant');
        }
      };
      parts.forEach((part, k) => { const i = n++;
        let {line} = part;
        if (part.optional) {
          context = null;
          washDef = null;
          return record(line, 'optional');
        }
        if (part.sourceLine === optionalChoice?.sharedAdditionLine) {
          context = null;
          return record(line, 'definition');
        }
        const at = alts.of[k];
        if (at && at.option !== chosen) { lines.push({chunkId: chunk.id, step: step.title, sourceLine: part.sourceLine, line, type: 'alternative', operation: null, branch: at.option.name}); return; }
        if ((at?.option || null) !== washIn) washDef = null;
        if (at?.label) {
          context = null;
          // "For A: Prepare the mix": the label, then an instruction.
          if (!(at.rest && lex.startsWithVerb.test(at.rest))) return record(line, 'branch');
          line = at.rest;
        }
        if (part.gate || part.gateOutcome) {
          context = null;
          washDef = null;
          if (part.gate) qcGates.push({kind: 'quality-control', chunkId: chunk.id, step: step.title,
            ...part.gate, source: {stepGuid: step.guid || null, line: part.line}});
          return record(part.line, part.gate ? 'qc-gate' : 'qc-outcome');
        }
        const reviewed = overrides[line];
        if (reviewed) {
          if (reviewed.operation === 'ignore') return record(line, 'note');
          if (!operations[reviewed.operation]) throw Error(`Unknown operation '${reviewed.operation}' for line: ${line}`);
          push(i, line, reviewed.operation, {...reviewed, basis: 'reviewed'}); context = null;
          return record(line, 'operation', reviewed.operation);
        }
        const inspectionGate = inspectionPoolingGate(line);
        if (inspectionGate) {
          const {inspection, ...outcomes} = inspectionGate;
          context = null;
          push(i, inspection, 'imaging');
          record(inspection, 'operation', 'imaging');
          qcGates.push({kind: 'quality-control', chunkId: chunk.id, step: step.title, ...outcomes,
            source: {stepGuid: step.guid || null, line, bodyLine: part.sourceLine}});
          return record(line, 'qc-gate');
        }
        const outputs = outputAlternatives(line);
        if (outputs) {
          const choiceId = `${chunk.id}:output-${part.sourceLine}`;
          const pick = chooseAlternative(choiceId, outputs, workflow.branches || {}, true);
          alternatives.push({chunkId: choiceId, step: `${step.title} · output vessels`, options: outputs.map(option => ({
            name: option.name, label: line, lines: 1, outputs: option.outputs,
          })), chosen: pick.chosen?.name ?? null, basis: pick.basis, requiresChoice: true, why: pick.why || null});
          context = null;
          if (!pick.chosen) return record(line, 'branch');
          const allocation = pick.chosen.outputs;
          const action = push(i, line, 'liquid-transfer', {volumeUl: sumUl(allocation.map(output => output.volumeUl)), count: 1});
          action.outputAllocation = allocation;
          action.contactStated = allocation.length === 1 ? 'sample-move' : 'output-split';
          return record(line, 'operation', 'liquid-transfer');
        }
        if (lex.washes) {
          if (lex.washes.define.test(line)) { washDef = {components: washDefinition(line, lex), line}; washIn = at?.option || null; context = null; return record(line, 'definition'); }
          const inline = inlineWash(line, lex);
          const def = inline ? {components: washDefinition(inline.definition, lex), line: inline.definition} : washDef;
          const text = inline ? inline.rest : line;
          const w = def && classifyLine(text, lex);
          if (w && w.type === 'operation' && w.operation === 'liquid-transfer' && (w.count || lex.washes.wash.test(text))) {
            expandWash(i, text, line, def, w.count ?? repeats(text), parts[k + 1]?.optional ? null : parts[k + 1]?.line);
            context = null;
            return record(line, 'operation', 'liquid-transfer');
          }
        }
        let c = classifyLine(line, lex);
        // Inside a table run, a plain line is the next row of that table.
        if (context && ['plain', 'unknown'].includes(c.type)) c = {type: context};
        if (c.type === 'programme-note') c = {type: lastOf('thermocycling') ? 'programme' : 'note'};
        if (c.type === 'plain') {
          if (lastOf('reagent-preparation') || REAGENT_TITLE.test(step.title || '')) c = {type: 'component'};
          else if (lastOf('thermocycling')) c = {type: 'programme'};
          else c = {type: line.split(/ +/).length <= 8 ? 'header' : 'note'};
        }
        if (c.type === 'unknown' && titleRule) c = {type: 'operation', operation: titleRule.operation, basis: 'step title'};
        if (c.type === 'component') {
          const prep = lastOf('reagent-preparation') || push(i, `Prepare ${step.title}`, 'reagent-preparation', {basis: 'step title', count: 1});
          prep.components.push(line); context = 'component';
          return record(line, 'component', 'reagent-preparation');
        }
        if (c.type === 'programme') {
          const run = lastOf('thermocycling') || push(i, `${step.title}: thermocycler programme`, 'thermocycling', {basis: 'programme rows', count: 1});
          run.programme.push(line); const m = statedMinutes(line); if (m) run.wait = (run.wait || 0) + m; context = 'programme';
          return record(line, 'programme', 'thermocycling');
        }
        if (['table', 'input', 'note', 'header'].includes(c.type)) return record(line, c.type);
        if (c.type === 'unknown') { review.push({chunkId: chunk.id, step: step.title, line}); return record(line, 'unknown'); }
        context = null;
        const prev = chunk.actions[chunk.actions.length - 1];
        const minutes = statedMinutes(line);
        if (c.type === 'repeat') {
          if (prev) {
            const n = prev.count.n + repeats(line);
            checkRepeats(n);
            prev.count = {n, basis: 'source', note: 'Repeat count stated in the protocol.'};
            prev.line += ' / ' + line;
          }
          return record(line, 'operation', prev?.kind || null);
        }
        const op = c.operation;
        if (!operations[op]) throw Error(`Unknown operation '${op}' for line: ${line}`);
        record(line, 'operation', op);
        if (op === 'wait' && prev && minutes) { prev.wait = (prev.wait || 0) + minutes; return; }
        // Consecutive lines of one batch-scale operation in a step describe a
        // single occurrence (e.g. set up, run standards, read samples).
        const separateTimedClause = parts[k - 1]?.sourceLine === part.sourceLine && timedCommand.test(line) && minutes > 0;
        if (prev && prev.kind === op && operations[op].scale === 'batch' && op !== 'reagent-preparation' && !separateTimedClause) { prev.line += ' / ' + line; if (minutes) prev.wait = (prev.wait || 0) + minutes; return; }
        push(i, line, op, {count: c.count, basis: c.basis});
      });
      chunks.push(chunk);
    }
  }
  if (ml) {
    const all = chunks.flatMap(c => c.actions);
    all.forEach((a, k) => {
      a.contact = a.contactStated ?? contactOf(a.kind, a.line, a.partsUl ? Math.min(...a.partsUl) : a.volumeUl, ml, all[k + 1]?.kind, a.materials);
      const removed = a.contact === 'removal' ? statedRemovalUl(a.line) : undefined;
      if (removed !== undefined) a.removalUl = removed;
      const fraction = statedFraction(a);
      if (fraction) a.fraction = fraction;
    });
    // A wash whose last removal the protocol states as its own next line
    // ("Wash 2x with 200 µl … / Remove all supernatant") leaves its last
    // addition in the well for that line to remove.
    all.forEach((a, k) => {
      if (a.contact !== 'wash') return;
      const next = all.slice(k + 1).find(b => b.contact && b.contact !== 'mix' && b.contact !== 'batch');
      if (next?.contact === 'removal') a.lastRemovalStated = true;
    });
    // An addition whose text names no material takes the step's Labstep
    // inventory fields that no line of the step mentions (the export drops
    // inline references, which is usually why the text is silent).
    for (const ch of chunks) {
      const named = new Set(ch.actions.flatMap(a => a.materials.map(m => m.class)));
      const rest = ch.inventory.filter(m => !named.has(m.class));
      for (const a of ch.actions) if (['free', 'contact'].includes(a.contact) && !a.materials.length && rest.length) a.materials = rest.map(m => ({...m, basis: 'labstep inventory (step)'}));
    }
  }
  if (selected?.hasFollowingSteps) {
    const finalLiquid = chunks.flatMap(chunk => chunk.actions).findLast(action => action.contact && !['mix', 'batch'].includes(action.contact));
    // A next removal may belong to the wash even when it is written as its
    // own step. Without that next source step the planner cannot place it.
    if (finalLiquid?.contact === 'wash' || finalLiquid?.wash) selected.provenance.washBoundaryOpen = true;
  }
  const everyAction = chunks.flatMap(chunk => chunk.actions);
  const materialBoundaries = lines.flatMap(row => {
    if (!['operation', 'unknown', 'qc-gate'].includes(row.type)) return [];
    const boundary = materialBoundary(row.line);
    return boundary ? [{...boundary, chunkId:row.chunkId, step:row.step, bodyLine:row.sourceLine}] : [];
  });
  const unresolvedOutput = everyAction.find((action, i) => action.outputAllocation?.length > 1
    && everyAction.slice(i + 1).some(next => !operations[next.kind]?.desk));
  const {materials, checks, holds} = trackMaterials(chunks, ml);
  if (selected) {
    const terminal = everyAction.findLast(action => !operations[action.kind]?.desk);
    if (terminal) {
      const allocation = terminal.outputAllocation ?? statedTerminalAllocation(terminal);
      if (allocation) {
        terminal.outputAllocation = allocation;
        terminal.contact = 'output-split';
        const fraction = statedFraction(terminal);
        if (fraction) terminal.fraction = fraction;
      }
    }
  }
  const labware = resolveLabware(selected ? {...workflow, labware: selected.provenance.input.labware} : workflow, labwareCatalogue);
  const format = labware ? labware.format : workflow.format;
  return {
    protocolId: workflow.id, name: workflow.name, format, unitSize: format === 'plate' ? (labware?.wells || workflow.plateSize || 96) : 1,
    labware, labwareWarnings: labwareWarnings(labware, chunks, lines, labwareCatalogue, operations, selected?.provenance.input.volumeUl),
    ...(selected ? {block: selected.provenance} : {}),
    ...(unresolvedOutput ? {unresolvedOutput:unresolvedOutput.id} : {}),
    ...(materialBoundaries.length ? {materialBoundaries} : {}),
    workloadLabel: workflow.workloadLabel || 'samples', defaultWorkload: workflow.defaultWorkload || 96,
    chunks, review, lines, materials, checks, holds, alternatives, qcGates,
    // What-if variants the workflow defines (#171); applied only when a request switches one on.
    variants: Array.isArray(workflow.variants) ? workflow.variants : [],
    sources: appliedParts.map(s => ({source: s.source, id: s.id, name: s.name, versionId: s.version.id, versionNumber: s.version.number, updatedAt: s.version.updated_at, url: s.url, hasDraft: s.has_unpublished_draft,
      observed: s.observed ? {runs: s.observed.runs, runsWithTicks: s.observed.runsWithTicks, usableRuns: s.observed.usableRuns, matchedRuns: s.observed.matchedRuns, retrievedAt: s.observed.retrievedAt,
        minRuns: s.observed.minRuns ?? null, tooFewSteps: Object.keys(s.observed.tooFew || {}).length, rejectedRuns: s.observed.rejectedRuns || {}, rejectedSteps: s.observed.rejectedSteps || {}} : null})),
    status: `Generated from ${appliedParts.map(s => `${s.source} ${s.id} v${s.version.number}`).join(' + ')} with the general lexicon${Object.keys(reviews).length ? ' and reviewed overrides' : ''}. ${review.length} line${review.length === 1 ? '' : 's'} not yet classified. Hands-on minutes are planning estimates until observed timings replace them.`,
  };
}
