// Decision view (issue #20): answer first, then the work, then the evidence.
import {mountPortfolio} from './portfolio.js';
import {decide as runDecide, createDecisionRequest, protocolDecisionBlocker, scopes, objectives, mid, workingDay, TIP_RUNTIME, labwareModels, pylabrobotSource, handlerFeatures, assayEvidence, evidenceFor, scaleModel, installationPipetteConfigs, transferLayouts, dispensers, physicalKinds, impossibleCount} from '../lib/work.js';
import {exportPylabrobot, pylabrobotTarget} from '../lib/pylabrobot-export.js';
import {channelsHtml, softwareHtml, plrHtml} from './features-view.js';
import {reviewPacket} from '../lib/review.js';
import {api, download} from './store.js';
import {planningDecision} from '../lib/planning-decision.js';
import {buildBrowserAssessment} from './pins.js';

const KEY = 'automation-decide-v3';
const LEGACY_KEY = 'automation-decide-v2';
const esc = v => String(v ?? '').replace(/[&<>'`]|\u0022/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '\u0022': '&quot;', '`': '&#96;', [String.fromCharCode(39)]: '&#39;'}[c]));
const round = n => n < 10 ? Math.round(n) : Math.round(n / 5) * 5;
export function fmtMinutes(r) {
  if (!r) return '—';
  const lo = Math.max(0, Math.min(r.lo, r.hi)), hi = Math.max(r.lo, r.hi, 0);
  if (hi >= 90) { const a = (lo / 60).toFixed(1), b = (hi / 60).toFixed(1); return a === b ? `${a} h` : `${a}–${b} h`; }
  const a = round(lo), b = round(hi);
  return a === b ? `${a || '<1'} min` : `${a}–${b} min`;
}
const fmtRange = r => r.lo === r.hi ? `${r.lo}` : `${r.lo}–${r.hi}`;
const fmtDays = r => r.hi === 1 ? 'Fits in one working day' : `${fmtRange(r)} working days`;
const saving = (base, next) => { const a = base.lo - next.lo, b = base.hi - next.hi; return {lo: Math.min(a, b), hi: Math.max(a, b)}; };
const statusText = {yes: 'Confirmed', no: 'Not available', unknown: 'Not checked', purchase: 'Would be bought', proposed: 'Proposed component', build: 'Would be built'};


let request = null;
let workModels = [];
let profile = null;
const protocolName = id => workModels.find(m => m.protocolId === id)?.name || id;
const decide = r => runDecide(r, {model: workModels.find(m => m.protocolId === r.protocolId), installations: profile.equipment});
function load(wanted) {
  let saved = null, migrate = false;
  try {
    const current = localStorage.getItem(KEY);
    const data = JSON.parse(current ?? localStorage.getItem(LEGACY_KEY) ?? 'null');
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      // The old default was true, so that value cannot evidence opt-in.
      saved = {...data, methodChanges: current !== null && data.methodChanges === true};
      migrate = current === null || typeof data.methodChanges !== 'boolean';
    }
  } catch {}
  const id = wanted || saved?.protocolId;
  const model = workModels.find(m => m.protocolId === id) || workModels[0];
  if (saved && saved.protocolId === model.protocolId) {
    try { decide(saved); return {request: saved, migrate: migrate && id === model.protocolId}; } catch {}
  }
  const defaults = createDecisionRequest(model, profile.equipment.length ? 'upgrade' : 'design');
  const preferences = saved ? {objective: saved.objective ?? defaults.objective, methodChanges: saved.methodChanges, builds: !!saved.builds, pylabrobot: saved.pylabrobot || 'any', facts: saved.facts || {}, reagentPrices: saved.reagentPrices || {}, reactionScale: saved.reactionScale || 1, dispenserFor: saved.dispenserFor, needs: saved.needs || [], labourRate: saved.labourRate, runsPerYear: saved.runsPerYear, variants: (saved.variants || []).filter(id => (model.variants || []).some(v => v.id === id && !Object.hasOwn(v, 'targets')))} : {};
  return {request: {...defaults, ...preferences}};
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(request)); } catch {} }

export function mountDecide(container, ctx, params = {}) {
  profile = ctx.profile();
  workModels = [];
  const broken = [];
  for (const w of profile.workflows) {
    try {
      const m = buildBrowserAssessment(w, profile.protocols, ctx.draftOverrides);
      m.protocolId = w.id;
      m.name = w.name;
      const blocker = protocolDecisionBlocker(m);
      if (blocker) broken.push(`${w.name}: ${blocker}`);
      else workModels.push(m);
    } catch (e) {
      broken.push(`${w.name}: ${e.message}`);
    }
  }
  const blocked = broken.length ? `<p class='notice'>${esc(broken.join('; '))} <a href='#protocols'>Review in Protocols</a>.</p>` : '';
  if (!workModels.length) {
    container.innerHTML = `<section class='pg'><h2>Decide what to automate</h2><p class='lede'>Start by importing a protocol and making a workflow from it. Then add the instruments you can access, or ask for the best complete setup from the whole catalogue.</p>${blocked}<p><a class='btn' href='#protocols'>Import a protocol</a> <a class='btn ghost' href='#equipment'>Add your equipment</a></p></section>`;
    return;
  }
  const loaded = load(params.workflow);
  request = loaded.request;
  container.innerHTML = `${blocked}<div id='dc-main'></div><div id='dc-portfolio'></div>`;
  const main = container.querySelector('#dc-main');
  let decision;
  const draw = () => {
    decision = decide(request);
    main.innerHTML = render(decision);
  };
  mountPortfolio(container.querySelector('#dc-portfolio'), ctx, workModels);
  container.onchange = ev => {
    const t = ev.target;
    if (t.id === 'dc-protocol') request = {...createDecisionRequest(workModels.find(m => m.protocolId === t.value)), scope: request.scope, objective: request.objective, methodChanges: request.methodChanges, builds: request.builds, pylabrobot: request.pylabrobot, facts: request.facts, reagentPrices: request.reagentPrices, reactionScale: request.reactionScale, needs: request.needs, labourRate: request.labourRate, runsPerYear: request.runsPerYear};
    if (t.id === 'dc-methods') request.methodChanges = t.checked;
    if (t.dataset.variant) { const s = new Set(request.variants || []); if (t.checked) s.add(t.dataset.variant); else s.delete(t.dataset.variant); request.variants = [...s]; }
    if (t.id === 'dc-builds') request.builds = t.checked;
    if (t.id === 'dc-workload') { const n = Number(t.value); if (Number.isInteger(n) && n >= 1 && n <= 100000) request.workload = n; }
    if (t.id === 'dc-objective') request.objective = t.value;
    if (t.id === 'dc-plr') request.pylabrobot = t.value;
    if (t.dataset.need) { const s = new Set(request.needs || []); if (t.checked) s.add(t.dataset.need); else s.delete(t.dataset.need); request.needs = [...s]; }
    if (t.id === 'dc-dispense-for') request.dispenserFor = t.value || undefined;
    if (t.id === 'dc-rate') { const v = Number(t.value); request.labourRate = t.value === '' || !(v >= 0 && v <= 1000) ? undefined : v; }
    if (t.id === 'dc-runs') { const v = Number(t.value); request.runsPerYear = t.value === '' || !(v >= 0 && v <= 100000) ? undefined : v; }
    if (t.id === 'dc-scale') { const k = Number(t.value); if (k >= 0.05 && k <= 1) request.reactionScale = k; }
    if (t.dataset.price) { const v = Number(t.value); request.reagentPrices = {...(request.reagentPrices || {})}; if (t.value === '' || !(v >= 0)) delete request.reagentPrices[t.dataset.price]; else request.reagentPrices[t.dataset.price] = v; }
    save(); draw();
  };
  container.onclick = ev => {
    if (ev.target.closest('button[data-review]')) { askLab(ctx, request); return; }
    if (ev.target.closest('button[data-planning-result]')) {
      download('private-planning-result.json', JSON.stringify(planningDecision(decision), null, 2));
      return;
    }
    const p = ev.target.closest('button[data-plr-export]');
    if (p) {
      const d = decide(request);
      try {
        const out = exportPylabrobot(d.recommended, scaleModel(d.model, request.reactionScale || 1), request.workload);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([out.text], {type: 'text/x-python'}));
        a.download = out.file; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } catch (e) { alert(`No PyLabRobot skeleton: ${e.message}`); }
      return;
    }
    const b = ev.target.closest('button[data-scope],button[data-fact],button[data-reset]');
    if (!b) return;
    if (b.dataset.scope) request.scope = b.dataset.scope;
    if (b.dataset.fact) { if (b.dataset.value === 'unknown') delete request.facts[b.dataset.fact]; else request.facts[b.dataset.fact] = b.dataset.value; }
    if (b.dataset.reset) request.facts = {};
    save(); draw();
    if (b.dataset.fact) container.querySelector(`[data-question='${CSS.escape(b.dataset.fact)}']`)?.scrollIntoView({block: 'nearest'});
  };
  draw();
  // A successful render can migrate its own settings or save an explicit
  // workflow selection. A missing workflow fallback leaves the stored choice alone.
  if (loaded.migrate || (params.workflow && request.protocolId === params.workflow)) save();
}

function render(d) {
  const r = d.request, model = d.model;
  return `<section class='dc' aria-labelledby='dc-title'>
  <header class='dc-head'>
    <h1 id='dc-title'>What should we automate?</h1>
    <p>Every modelled setup is run over the same step-by-step account of the protocol. You see how much hands-on work it removes, when someone still has to come back, and which unchecked facts could change the answer.</p>
  </header>
  ${controls(d)}
  ${model.draftAssessment ? "<p class='notice warn'><strong>Draft assessment:</strong> This workflow uses a draft or unlocked Labstep snapshot approved for this page session.</p>" : ''}
  ${labware(d)}
  ${alternativesSection(d)}
  ${variantSection(d)}
  ${d.model.review.length ? `<p class='notice'><strong>${d.model.review.length} line${d.model.review.length === 1 ? '' : 's'} of this protocol ${d.model.review.length === 1 ? 'was' : 'were'} not understood and ${d.model.review.length === 1 ? 'is' : 'are'} not counted</strong> in the times below. <a href='#protocols'>See which</a>.</p>` : ''}
  ${answer(d)}
  ${d.request.objective === TIP_RUNTIME ? tipRuntimeSection(d) : ''}
  ${buildSection(d)}
  ${d.recommended ? measures(d) : ''}
  ${d.recommended ? costs(d) : ''}
  ${accessSection(d)}
  ${d.recommended ? plateMoves(d) : ''}
  ${d.recommended ? tipsSection(d) : ''}
  ${d.recommended ? channelsSection(d) : ''}
  ${d.recommended ? reagentSection(d) : ''}
  ${d.recommended ? bomSection(d) : ''}
  ${d.recommended || d.physicalIssues.length ? physicalSection(d) : ''}
  ${d.recommended ? featureSection(d) : ''}
  ${d.recommended ? assaySection(d) : ''}
  ${d.recommended?.handler ? deckSection(d) : ''}
  ${d.recommended ? why(d) : ''}
  ${d.recommended ? questions(d) : ''}
  ${d.recommended ? openSection(d) : ''}
  ${d.recommended ? day(d) : ''}
  ${d.recommended ? workMap(d) : ''}
  ${options(d)}
  ${d.unassessed.length ? `<details class='dc-evidence'><summary>Equipment with insufficient data (${d.unassessed.length})</summary><ul>
    ${d.unassessed.map(h => `<li><strong>${esc(h.name)}</strong> · ${esc(h.reason)}</li>`).join('')}
  </ul></details>` : ''}
  ${evidence(d)}
  </section>`;
}

// What the samples are assumed to be in, and what does not fit it (#53).
function labware(d) {
  const l = d.labware;
  if (!l) return '';
  const w = d.labwareWarnings;
  return `<section class='notice dc-labware'><p><strong>Run in ${esc(l.label)}${l.assumed ? ' (assumed)' : ''}</strong>: ${l.format === 'plate' ? `${l.wells} samples per plate` : 'one sample per tube'}, up to ${l.maxUl >= 1000 ? `${l.maxUl / 1000} ml` : `${l.maxUl} µl`} each (${esc(l.basis)}). Fit of each deck, module and device a setup uses comes from researched sources where known and is asked otherwise. ${(labwareModels[l.id] || []).length ? `PyLabRobot defines ${labwareModels[l.id].length} matching products (e.g. ${labwareModels[l.id].slice(0, 3).map(m => esc(m.id)).join(', ')}; <a href='${esc(pylabrobotSource.url)}' target='_blank' rel='noopener'>pinned library</a>).` : ''} <a href='#protocols'>Change the labware</a>.</p>${w.filter(x => x.type !== 'assumed').map(x => `<p>${esc(x.text)}${x.examples.length ? `<small> e.g. ${x.examples.map(e => `“${esc(e)}”`).join(' · ')}</small>` : ''}</p>`).join('')}</section>`;
}

// Labelled alternatives in the protocol (#171): which one is counted and why.
function alternativesSection(d) {
  const alts = d.model.alternatives || [];
  if (!alts.length) return '';
  const open = alts.filter(a => a.basis === 'question');
  return `<section class='notice dc-alternatives'><p><strong>${alts.length} step${alts.length === 1 ? ' offers' : 's offer'} alternatives; one is counted per step.</strong>${open.length ? ` ${open.length} ${open.length === 1 ? 'is' : 'are'} unresolved. The first option is used for this provisional estimate. <a href="#protocols">Choose on the workflow card</a>.` : ''}</p>
    <ul>${alts.map(a => `<li>${esc(a.step)}: <strong>${esc(a.chosen)}</strong> counted (${esc(a.basis)}); ${a.options.filter(o => o.name !== a.chosen).map(o => esc(o.name)).join(', ')} not counted.${a.why ? ` <small>${esc(a.why)}</small>` : ''}</li>`).join('')}</ul></section>`;
}

// Workflow what-ifs (#171): what a switched-on variant changes and what it keeps.
function variantSection(d) {
  const on = (d.variants || []).filter(v => v.active);
  if (!on.length) return '';
  return on.map(v => `<section class='notice dc-variant'><p><strong>${esc(v.label)}</strong>: ${v.changed.length} ${esc(v.from.replace(/-/g, ' '))} step${v.changed.length === 1 ? '' : 's'} become ${esc(v.to.replace(/-/g, ' '))}, by hand today and on every setup. Their durations are not known and are shown as missing.${v.note ? ` <small>${esc(v.note)}</small>` : ''}</p>
    <p>Question for the ${esc(v.owner)}: ${esc(v.question)}</p>
    ${v.missingStages.length ? `<p>Stages named by the variant but not in this workflow: ${v.missingStages.map(esc).join(', ')}.</p>` : ''}
    <details><summary>Changed (${v.changed.length}) and kept as written (${v.kept.length})</summary><ul>${v.changed.map(x => `<li>${esc(x.step)}: ${esc(x.label)}</li>`).join('')}</ul><p>Kept:</p><ul>${v.kept.map(x => `<li>${esc(x.step)}: ${esc(x.label)} <small>(${esc(x.why)})</small></li>`).join('')}</ul></details></section>`).join('');
}

function controls(d) {
  const r = d.request, m = d.model;
  return `<form class='dc-controls' onsubmit='return false'>
    <label>Protocol<select id='dc-protocol'>${workModels.map(w => `<option value='${w.protocolId}' ${w.protocolId === r.protocolId ? 'selected' : ''}>${esc(protocolName(w.protocolId))}</option>`).join('')}</select></label>
    <label>Batch size (${esc(m.workloadLabel)})<input id='dc-workload' type='number' min='1' max='100000' value='${r.workload}' inputmode='numeric'></label>
    <label>Labour cost (GBP per hour)<input id='dc-rate' type='number' min='0' max='1000' step='any' value='${r.labourRate ?? ''}' placeholder='for break-even'></label>
    <label>Runs per year<input id='dc-runs' type='number' min='0' max='100000' step='1' value='${r.runsPerYear ?? ''}' placeholder='for yearly cost'></label>
    <label>Reaction volume<select id='dc-scale'>${[1, 0.5, 0.25, 0.1].map(k => `<option value='${k}' ${k === (r.reactionScale || 1) ? 'selected' : ''}>${k === 1 ? 'As written' : `${k * 100}% (miniaturised; needs validation)`}</option>`).join('')}</select></label>
    <label>Optimise for<select id='dc-objective'>${Object.entries(objectives).map(([k, o]) => `<option value='${k}' ${k === r.objective ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>
    <label>PyLabRobot<select id='dc-plr'>${[['any', 'No preference'], ['prefer', 'Prefer PyLabRobot-supported'], ['only', 'Only handlers PyLabRobot lists']].map(([k, l]) => `<option value='${k}' ${k === (r.pylabrobot || 'any') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class='dc-check'><input id='dc-methods' type='checkbox' ${r.methodChanges === true ? 'checked' : ''}> Allow method changes that need validation (e.g. shaking instead of rotation, pipette mixing instead of vortexing, plate-reader quantification)</label>
    ${(m.variants || []).filter(v => !Object.hasOwn(v, 'targets')).map(v => `<label class='dc-check'><input type='checkbox' data-variant='${esc(v.id)}' ${r.variants?.includes(v.id) ? 'checked' : ''}> ${esc(v.label || v.id)}<small> What-if defined by this workflow; every step it changes becomes a validation question. Untick to see the protocol as written.</small></label>`).join('')}
    ${(m.variants || []).some(v => Object.hasOwn(v, 'targets')) ? `<p class='dc-note'><a href='#protocols'>Review source-pinned method proposals</a>. Estimates are pending method qualification.</p>` : ''}
    <label class='dc-check'><input id='dc-builds' type='checkbox' ${r.builds ? 'checked' : ''}> Include open-source parts we would build (e.g. a printed gripper or centrifuge). Each adds questions until its builder confirms it works.</label>
    <details class='dc-needs'><summary>Must have${r.needs?.length ? ` (${r.needs.length})` : ''}</summary><p class='dc-note'>A handler the sources say lacks a feature is ruled out; one not found becomes a question.</p>${Object.entries(handlerFeatures.features).map(([k, f]) => `<label class='dc-check'><input type='checkbox' data-need='${k}' ${r.needs?.includes(k) ? 'checked' : ''}> ${esc(f.label)}<small> ${esc(f.why)}</small></label>`).join('')}</details>
    <fieldset class='dc-scope'><legend>How far are we willing to go?</legend>
      ${Object.entries(scopes).map(([k, s]) => `<button type='button' data-scope='${k}' aria-pressed='${k === r.scope}'><strong>${esc(s.label)}</strong><span>${esc(s.help)}</span></button>`).join('')}
    </fieldset>
  </form>`;
}

function tipRuntimeSection(d) {
  const best = d.recommended?.tipRuntime;
  const show = m => m ? `${esc(m.mechanism)} · ${m.tips ? fmtRange(m.tips) + ' tips' : 'tips unknown'} · ${fmtMinutes(m.action_minutes)}
    · ${m.reagent_extra_uL ? mlRange(m.reagent_extra_uL) + ' extra reagent' : 'extra reagent unknown'}
    ${m.addition_spread_upper_min == null ? '' : `<small>Spread upper estimate: ${fmtMinutes({lo: m.addition_spread_upper_min, hi: m.addition_spread_upper_min})}</small>`}
    ${m.timing_sources.map(url => `<small><a href='${esc(url)}' target='_blank' rel='noopener'>Timing source</a></small>`).join('')}` : 'No eligible paired estimate';
  return `<section class='dc-section' data-tip-runtime>
    <h2>Tips and run time</h2>
    <p>Ranks upper tip count first and upper elapsed time next. Lower bounds, estimated addition spread, extra reagent and hands-on work break ties. Design includes proposals for a person plus one bench device. Local scopes use the devices you have added under Your equipment.</p>
    ${best ? `<p>Longest addition spread upper estimate: ${best.addition_spread_upper_min == null ? 'unknown' : fmtMinutes({lo: best.addition_spread_upper_min, hi: best.addition_spread_upper_min})}. Extra reagent per run: ${best.reagent_extra_uL ? mlRange(best.reagent_extra_uL) : 'unknown'}.</p>` : ''}
    ${d.mechanisms.length ? `<div class='dc-table-wrap'><table class='dc-measures'><thead><tr><th scope='col'>Shared addition or wash step</th><th scope='col'>Chosen mechanism</th><th scope='col'>Alternative mechanism</th></tr></thead><tbody>
    ${d.mechanisms.map(m => `<tr><th scope='row'>${esc(m.label)}</th><td>${show(m.chosen)}</td><td>${show(m.alternative)}</td></tr>`).join('')}
    </tbody></table></div><p class='dc-note'>Step times include the associated handoffs. Run totals also include setup, priming and cleanup. Addition spread is an upper estimate from available timing.</p>` : ''}
    <h3>One device on the bench</h3>
    ${d.benchRoutes.length ? `<ul>${d.benchRoutes.map(row => `<li data-bench-route='${esc(row.model_id)}'><strong>${esc(row.name)}</strong> · ${esc(row.kind)} · ${esc(row.reason || 'Ranked')}
      ${row.source ? `<a href='${esc(row.source)}' target='_blank' rel='noopener'>Source</a>` : ''}
      ${row.fact ? `<p>${esc(row.fact.question)} ${factButtons(row.fact)}</p>` : ''}</li>`).join('')}</ul>`
      : '<p>Add a bench device under Your equipment or choose Design a complete setup.</p>'}
  </section>`;
}

function answer(d) {
  const base = d.baseline, rec = d.recommended;
  if (!rec && d.request.scope === 'accessible' && d.physicalIssues.some(issue => issue.severity === 'impossible')) {
    return `<section class='dc-answer dc-none' aria-live='polite'>
      <h2>Physical checks block this plan</h2>
      <p>Review the affected steps under Physical checks. Correct the workflow interpretation or the selected vessel before comparing again.</p>
    </section>`;
  }
  if (!rec && d.request.objective === TIP_RUNTIME) {
    return `<section class='dc-answer dc-none' aria-live='polite'><h2>No eligible route for tips and run time</h2>
      <p>By hand: ${fmtMinutes(base.active)} hands-on, ${fmtMinutes(base.elapsed)} of stated elapsed time${base.missingWaits ? ` plus ${base.missingWaits} untimed steps` : ''}. Manual tip use is unrecorded.</p></section>`;
  }
  if (!rec) {
    const top = d.unlocks.find(u => u.candidate);
    return `<section class='dc-answer dc-none' aria-live='polite'>
      <p class='dc-kicker'>No recommendation yet</p>
      <h2>${d.request.scope !== 'design' && !d.unlocks.length ? 'You have not added any equipment yet.' : 'Nothing is confirmed as available yet.'}</h2>
      <p>${d.request.scope !== 'design' && !d.unlocks.length ? 'Add the instruments you can use under <a href=\'#equipment\'>Your equipment</a>, or choose “Design a complete setup” to search the whole catalogue.' : d.request.scope === 'accessible' ? 'This view only uses instruments and options marked as confirmed under Your equipment.' : 'None of your instruments saves time on this protocol in this scope.'}</p>
      ${d.unlocks.filter(u => !u.candidate).map(u => `<p><strong>${esc(u.installation.name)}:</strong> ${esc(u.reason)}</p>`).join('')}
      ${top ? `<div class='dc-unlock'><h3>Fastest way to get a usable answer</h3>
        <p>Confirm ${top.toConfirm.length} fact${top.toConfirm.length > 1 ? 's' : ''} about <strong>${esc(top.installation.name)}</strong>. If all are true, it would take about <strong>${fmtMinutes(top.saving)}</strong> of hands-on work off each batch.</p>
        <ol>${top.toConfirm.map(f => `<li>${esc(f.question)} <span class='dc-who'>Ask: ${esc(f.owner)}</span> ${factButtons(f)}</li>`).join('')}</ol></div>
      <details class='dc-more'><summary>Other installations we could unlock</summary><ul>${d.unlocks.slice(1).map(u => u.candidate ? `<li><strong>${esc(u.installation.name)}</strong>: ${u.toConfirm.length} facts to confirm, saves about ${fmtMinutes(u.saving)}.</li>` : `<li><strong>${esc(u.installation.name)}</strong>: ${esc(u.reason)}</li>`).join('')}</ul></details>` : ''}
      <p><button type='button' class='dc-link' data-scope='upgrade'>See what we could do if the unchecked facts are true →</button></p>
    </section>`;
  }
  const s = saving(base.active, rec.metrics.active);
  const blocked = rec.physicalIssues.filter(i => i.severity === 'impossible').length;
  const open = rec.facts.filter(f => f.status !== 'yes');
  const altName = d.alternative ? `${d.alternative.installation.name} (${d.alternative.config.name})` : '';
  return `<section class='dc-answer' aria-live='polite'>
    <p class='dc-kicker'>${esc(scopes[d.request.scope].short)} · ${esc(objectives[d.request.objective].label.toLowerCase())}</p>
    <h2>${esc(rec.installation.name)}</h2>
    <p class='dc-setup'>${esc(rec.setupLabel)}</p>
    ${blocked ? `<p class='notice bad'><strong>${blocked} impossible protocol action${blocked === 1 ? '' : 's'} left by hand in the estimate.</strong> Review the physical checks below.</p>` : ''}
    ${rec.tipRuntime ? `<p class='dc-sentence'>${fmtRange(rec.tipRuntime.tips)} tips and ${fmtMinutes(rec.tipRuntime.elapsed)} to finish the batch. Hands-on work is ${fmtMinutes(rec.metrics.active)}. The by-hand baseline is ${fmtMinutes(base.active)} hands-on.</p>
    ${rec.standalone ? `<p>Plan includes ${rec.metrics.moves.person} manual plate handoffs and attendance while dispensing.</p>` : ''}`
    : `<p class='dc-sentence'>Takes about <strong>${fmtMinutes(s)}</strong> of hands-on work off each batch of ${d.request.workload} ${esc(d.request.workload === 1 ? d.model.workloadLabel.replace(/s$/, String()) : d.model.workloadLabel)}: from ${fmtMinutes(base.active)} today to ${fmtMinutes(rec.metrics.active)}. Returns to the bench go from ${fmtRange(base.visits)} to ${fmtRange(rec.metrics.visits)}.</p>`}
    ${d.tie ? `<p class='dc-tie'><strong>Effectively tied with ${esc(altName)}.</strong> The difference is smaller than the precision of the estimates, so choose between them on access, support and cost. This option is shown first because it relies on ${open.length <= (d.alternative.facts.filter(f => f.status !== 'yes').length) ? 'no more' : 'more'} unchecked facts.</p>` : ''}
    <ul class='dc-flags'>
      <li class='${open.length ? 'warn' : 'ok'}'>${open.length ? `${open.length} fact${open.length > 1 ? 's' : ''} to confirm before relying on this` : 'Every fact this route needs is confirmed'}</li>
      ${physicalFlag(rec)}
      <li class='warn'>Times are planning estimates, not yet observed</li>
      ${d.baseline.publishedWaits + d.baseline.estimatedWaits ? `<li class='warn'>${d.baseline.publishedWaits} durations from our Labstep protocols, ${d.baseline.estimatedWaits} typical estimates</li>` : ''}
      ${d.baseline.missingWaits ? `<li class='warn'>${d.baseline.missingWaits} programme durations still missing</li>` : ''}
    </ul>
    <p class='dc-review'><button class='btn ghost' data-review>Ask the lab to review these timings</button> <small>Sends the protocol steps, the planner’s assumptions and its time for each step (done by hand, batch of ${d.request.workload}) to the lab’s members to check.</small></p>
  </section>`;
}

// Publish a timings review of this workflow to the lab (#105). The review
// carries the step text, so it goes only to the lab's signed-in members.
async function askLab(ctx, request) {
  const acc = ctx.account;
  if (!acc?.available) { alert('Reviews need the hosted site, where people sign in.'); return; }
  if (!acc.user) { if (confirm('Sign in with ChatGPT to send a review to the lab?')) acc.signIn(); return; }
  const model = workModels.find(m => m.protocolId === request.protocolId);
  const workflow = profile.workflows.find(w => w.id === request.protocolId) || {};
  if (!model) return;
  const title = prompt('Title for the review', `${model.name}: hands-on and waiting times`);
  if (!title) return;
  try {
    const {id} = await api('reviews', 'POST', {title, packet: reviewPacket(model, request.workload, workflow)});
    location.hash = `review/${id}`;
  } catch (e) { alert(e.status === 403 ? `Only lab members can send reviews: ${e.message}` : `Not sent: ${e.message}`); }
}

function measures(d) {
  const b = d.baseline, m = d.recommended.metrics;
  const rows = [
    ['Hands-on time', fmtMinutes(b.active), fmtMinutes(m.active), `${fmtMinutes(saving(b.active, m.active))} less`, 'Includes instrument setup, reloads and cleanup.'],
    ['Returns to the bench', fmtRange(b.visits), fmtRange(m.visits), '', 'Separate trips you have to make. A range means some programme times are unknown.'],
    ['Repeated actions done by the instrument', '0', `${m.automatedInstances} of ${m.automatedInstances + m.manualInstances}`, '', 'Counted individually: three washes count as three.'],
    ['Longest timed walk-away', fmtMinutes(b.longestWalkAway), fmtMinutes(m.longestWalkAway), '', 'Long incubations were already walk-away time; they are not counted as savings.'],
    ['Overnight run', b.overnight.possible ? 'Yes' : 'No', m.overnight.possible ? 'Yes' : 'No', '', `Possible when a timed unattended window reaches ${Math.round(m.overnight.threshold / 60)} hours (assumed threshold).`],
    ['Time to finish', fmtMinutes(b.elapsed), fmtMinutes(m.elapsed), '', `${b.missingWaits ? `Excludes ${b.missingWaits} untimed steps. ` : ''}Instrument run times are indicative.`],
    [`Working days (${workingDay.hours}-hour day)`, fmtDays(b.days), fmtDays(m.days), '', 'Elapsed time for one person and one batch, divided into 8-hour bench days.'],
    ['Tips per run', '—', m.tips ? `${fmtRange(m.tips.total)} (${fmtRange({lo: Math.round(m.tips.total.lo / d.request.workload), hi: Math.round(m.tips.total.hi / d.request.workload)})} per sample)` : 'Not recorded for this instrument', m.tips && d.recommended.cost.tipsPerRun ? `${gbpRange(d.recommended.cost.tipsPerRun)} per run` : '', 'Counted per tip use: a shared reagent dispensed from above shares tips; touching the sample uses a fresh tip; removals reuse each sample’s own tip within a step.'],
    ['Plate moves', 'All by hand', moveText(m.moves), '', 'Each change of position: by the gripper or workcell arm, or by hand. Moves by hand keep someone at the instrument.'],
    ['Cost', 'Current practice', costText(d.recommended.cost), '', d.recommended.cost.note],
    ...breakEvenRows(d.recommended.breakEven),
  ];
  return `<section class='dc-section'><h2>Today and with this setup</h2>
  <div class='dc-table-wrap'><table class='dc-measures'><thead><tr><th scope='col'>Per batch</th><th scope='col'>Today</th><th scope='col'>With this setup</th></tr></thead>
  <tbody>${rows.map(([k, a, bb, c, help]) => `<tr><th scope='row'>${esc(k)}<small>${esc(help)}</small></th><td>${esc(a)}</td><td><strong>${esc(bb)}</strong>${c ? `<small class='good'>${esc(c)}</small>` : ''}</td></tr>`).join('')}</tbody></table></div></section>`;
}
// Break-even at the person's labour rate (#94).
function breakEvenRows(b) {
  if (!b) return [];
  const signedGbp = r => r.lo >= 0 ? gbpRange(r) : r.hi <= 0 ? `−${gbpRange({lo: -r.hi, hi: -r.lo})}` : `−${gbp(-r.lo)} to +${gbp(r.hi)}`;
  const runs = b.never ? 'Never at this rate: running costs exceed the labour saved' : b.runs ? (b.runs.hi == null ? `${b.runs.lo} or more (may never pay back)` : b.runs.lo === b.runs.hi ? `${b.runs.lo}` : `${b.runs.lo}–${b.runs.hi}`) : 'Purchase price not recorded';
  return [
    ['Net saving per run', '—', signedGbp(b.net), '', `Labour ${signedGbp(b.labour)}${b.refillMinutes?.hi ? ` (after ${fmtMinutes(b.refillMinutes)} refilling reservoirs and emptying waste)` : ''} minus tips ${b.tips ? gbpRange(b.tips) : 'unpriced'} minus extra reagent ${signedGbp(b.reagents)}. ${b.note}`],
    ['Runs to pay back', '—', runs, '', b.annualRuns ? `Service plan alone needs ${b.annualRuns.lo ?? '?'}–${b.annualRuns.hi ?? '?'} runs a year to cover.` : 'Priced purchase items only.'],
  ];
}
const moveText = mv => { const machine = mv.gripper + mv.arm; return `${machine} by ${mv.arm && !mv.gripper ? 'arm' : mv.arm ? 'gripper or arm' : 'gripper'}, ${mv.person} by hand`; };
const gbp = n => `£${Math.round(n / 100) * 100 >= 1000 ? Math.round(n / 100) * 100 >= 1e6 ? (n / 1e6).toFixed(2) + 'm' : Math.round(n / 1000).toLocaleString('en-GB') + 'k' : Math.round(n).toLocaleString('en-GB')}`;
const gbpRange = r => r ? (Math.round(r.lo) === Math.round(r.hi) ? gbp(r.lo) : `${gbp(r.lo)}–${gbp(r.hi)}`) : '—';
function costText(c) {
  if (!c.new) return 'Not yet priced';
  const parts = c.builds?.length ? `, plus ${c.builds.length} open-source part${c.builds.length === 1 ? '' : 's'} to build (parts costs listed below, not added)` : '';
  return `${gbpRange(c.new)} new${c.complete ? '' : ` (${c.knownItems} of ${c.items} items priced)`}${c.used ? `; ${gbpRange(c.used)} used` : ''}${parts}`;
}
// What takes each deck position, and what is left for tips (#69).
function deckSection(d) {
  const k = d.recommended.deck;
  if (!k) return `<section class='dc-section'><h2>Deck space</h2><p class='dc-note'>The deck layout of ${esc(d.recommended.config.name)} is not recorded, so tip-rack room is estimated from its position count.</p></section>`;
  return `<section class='dc-section'><h2>Deck space</h2>
  <p class='dc-note'>${k.used} of ${k.positions} deck positions are taken before tips, leaving ${Math.max(k.free, 0)} for tip racks (${k.tipKinds} tip size${k.tipKinds === 1 ? '' : 's'} in use). ${esc(k.capacity?.basis || '')} hold tip racks in all.${k.swaps ? ' Fewer positions than tip sizes: the gripper swaps tip racks in from the expansion positions or storage.' : ''}${k.fits ? '' : ' <strong>This setup does not fit.</strong>'}</p>
  <div class='dc-table-wrap'><table class='dc-measures'><thead><tr><th scope='col'>On the deck</th><th scope='col'>Positions</th></tr></thead><tbody>
  ${k.items.map(i => `<tr><th scope='row'>${esc(i.what)}${i.basis && i.basis !== 'source' ? ` <small>(${esc(i.basis)})</small>` : ''}${i.slots?.length ? ` <small>slot${i.slots.length === 1 ? '' : 's'} ${esc(i.slots.join(', '))}</small>` : ''}${i.source ? ` <small><a href='${esc(i.source.url)}' target='_blank' rel='noopener'>rule</a></small>` : ''}</th><td>${i.positions}</td></tr>`).join('')}
  <tr><th scope='row'>Tip racks</th><td>${Math.max(k.free, 0)}</td></tr>
  </tbody></table></div>${k.placement?.ok ? `<p class='dc-note'>Modules placed by the maker's slot rules${k.expansion != null ? `; ${k.expansion} staging position${k.expansion === 1 ? '' : 's'} left for the gripper` : ''}. A module without a placement record may take any free slot.</p>` : k.placement ? `<p class='dc-note'><strong>${esc(k.placement.why)}</strong></p>` : ''}${layoutTable(d.recommended.layout)}</section>`;
}
// The solved deck layout (#140): where each carrier, plate, reservoir, tip rack
// and module sits. The ledger draws from these reservoirs and the PyLabRobot
// script places the same deck.
function layoutTable(L) {
  if (!L) return '';
  if (!L.ok) return `<p class='dc-note'><strong>No deck layout could be solved: ${esc(L.why || '')}</strong></p>`;
  return `<h3>Deck layout</h3>
  <p class='dc-note'>Solved from the deck's geometry${L.tracks ? ` (${L.tracks.used} of ${L.tracks.count} tracks used)` : ''}: ${L.reservoir.plates} reservoir${L.reservoir.plates === 1 ? '' : 's'} with ${L.cavities} cavities for ${L.reagents} reagent${L.reagents === 1 ? '' : 's'}${L.cavities < L.reagents ? ', so some share a cavity' : ', one cavity each'}${L.troughs ? `; ${L.troughs} trough${L.troughs === 1 ? '' : 's'} for the 96-channel head` : ''}. The planner's ledger draws from these and the PyLabRobot script places the same deck. A starting point to check against the instrument, not a validated layout.</p>
  <div class='dc-table-wrap'><table class='dc-measures'><thead><tr><th scope='col'>Item</th><th scope='col'>Where</th></tr></thead><tbody>
  ${L.rows.map(r => `<tr><th scope='row'>${esc(r.what)}</th><td>${esc(r.where)}</td></tr>`).join('')}
  </tbody></table></div>${L.checks.length ? `<ul class='dc-physical'>${L.checks.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`;
}
// Pipettes and tips (#67): the configuration chosen, its alternatives, and
// tips per run by size and type.
function tipsSection(d) {
  const c = d.recommended, t = c.metrics.tips, p = c.pipettes;
  if (!t || !p) return '';
  const hrs = r => `${(r.lo / 60).toFixed(1)}–${(r.hi / 60).toFixed(1)} h`;
  return `<section class='dc-section'><h2>Pipettes and tips</h2>
  <p class='dc-note'>Chosen: <strong>${esc(p.chosen.label)}</strong>, the least hands-on time, then the fewest tips, then the shortest run. ${t.rackSwaps ? `The gripper swaps in ${t.rackSwaps} rack${t.rackSwaps === 1 ? '' : 's'} from expansion positions or storage (counted as run time). ` : ''}${t.reloads ? `Tips run out ${t.reloads} time${t.reloads === 1 ? '' : 's'} during the batch and are reloaded by hand.` : 'The deck and storage hold every tip rack the batch needs.'} ${t.lowRetention.hi ? `${fmtRange(t.lowRetention)} tips touch cells or beads and need low-retention tips (lab evidence).` : ''} ${t.lowRetentionPreferred.hi ? `${fmtRange(t.lowRetentionPreferred)} more touch small amounts of DNA or RNA, where low-binding plastics are preferred.` : ''} ${p.lowRetention?.available === null ? esc(p.lowRetention.note) : ''} ${p.thirdPartyTips?.allowed === false ? esc(p.thirdPartyTips.note) : ''}</p>
  <div class='dc-table-wrap'><table class='dc-measures'><thead><tr><th scope='col'>Tips</th><th scope='col'>Per run</th><th scope='col'>Racks</th></tr></thead><tbody>
  ${Object.entries(t.bySize).sort().map(([k, v]) => `<tr><th scope='row'>${esc(k)}</th><td>${esc(fmtRange(v))}</td><td>${t.racks[k]}</td></tr>`).join('')}
  </tbody></table></div>
  ${p.options.length > 1 ? `<div class='dc-table-wrap'><table class='dc-measures'><thead><tr><th scope='col'>Pipette configuration</th><th scope='col'>Hands-on</th><th scope='col'>Run length</th><th scope='col'>Tips</th></tr></thead><tbody>
  ${p.options.map(o => `<tr><th scope='row'>${esc(o.label)}${o.id === p.chosen.id ? ' <small>(chosen)</small>' : ''}</th><td>${hrs(o.active)}</td><td>${hrs(o.elapsed)}</td><td>${esc(fmtRange(o.tips))}${o.reloads ? ` <small>${o.reloads} reloads</small>` : ''}</td></tr>`).join('')}
  </tbody></table></div>` : ''}</section>`;
}
// Independent channels against a fixed-pitch block, how each setup is
// programmed, and PyLabRobot support (#82).
const passesCell = c => { const ch = c.metrics.channels; return ch && ch.steps.length ? `${ch.passes}${ch.oneTipAtATime ? `<small>${ch.oneTipAtATime} step${ch.oneTipAtATime === 1 ? '' : 's'} one tip at a time</small>` : ''}` : '—'; };
const chosenCfg = c => c.pipettes ? (installationPipetteConfigs(c.handler, c.installation) || []).find(x => x.id === c.pipettes.chosen.id) : null;
function channelsSection(d) {
  const cols = [d.recommended, d.alternative].filter(Boolean);
  const steps = d.recommended.metrics.channels?.steps || [];
  const other = d.alternative?.metrics.channels;
  const row = (title, f) => `<tr><th scope='row'>${title}</th>${cols.map(c => `<td class='small-cell'>${f(c)}</td>`).join('')}</tr>`;
  const irregular = c => { const ch = c.metrics.channels; if (!ch) return 'pipettes not recorded'; if (!ch.steps.length) return 'none in this protocol'; return `${ch.steps.length} step${ch.steps.length === 1 ? '' : 's'} in ${ch.passes} passes${ch.oneTipAtATime ? `; ${ch.oneTipAtATime} done one tip at a time` : ''}${ch.impossible ? `; ${ch.impossible} need a single-tip mode no head here has` : ''}`; };
  return `<section class='dc-section'><h2>Channels, programming and PyLabRobot</h2>
  <p class='dc-note'>Pooling into one tube, a different volume per well (normalisation), selected wells and transfers between tubes and a plate cannot be done by a fixed-pitch block in one pass: it works one tip at a time, while independent channels take one position each per pass. Positions are the wells the step names (“the first 8 wells”, “columns 2-12”), or one per sample when it names none. These steps change the run length and the number of passes, not the hands-on time.</p>
  <div class='dc-table-wrap'><table class='dc-measures'><thead><tr><th scope='col'></th>${cols.map(c => `<th scope='col'>${esc(c.installation.name)}${c === d.recommended ? ' <small>(recommended)</small>' : ''}</th>`).join('')}</tr></thead><tbody>
  ${row('Heads used', c => c.handler ? channelsHtml(c.handler, chosenCfg(c)) : 'Separate bench device')}
  ${row('Irregular transfers', irregular)}
  ${row('Run length', c => fmtMinutes(c.metrics.elapsed))}
  ${row('Programming', c => c.handler ? softwareHtml(c.handler) : 'Person operates the device')}
  ${row('PyLabRobot', c => c.handler ? plrHtml(c.handler) : 'No handler export')}
  </tbody></table></div>
  ${steps.length ? `<div class='dc-table-wrap'><table class='dc-measures'><thead><tr><th scope='col'>Step</th><th scope='col'>Kind</th><th scope='col'>Head</th><th scope='col'>Positions</th><th scope='col'>Per pass</th><th scope='col'>Passes</th>${other ? `<th scope='col'>${esc(d.alternative.installation.name)}</th>` : ''}</tr></thead><tbody>
  ${steps.map(s => { const o = other?.steps.find(x => x.actionId === s.actionId); return `<tr><th scope='row'>${esc(s.label)}</th><td>${esc(transferLayouts[s.layout] || s.layout)}</td><td>${esc(s.head)}<small>${esc(s.mode)}</small></td><td>${s.positions ? `${s.positions} <small>named in the step</small>` : '<small>one per sample</small>'}</td><td>${s.perPass}</td><td>${s.passes}</td>${other ? `<td>${o ? `${o.passes} <small>${o.perPass} per pass</small>` : '—'}</td>` : ''}</tr>`; }).join('')}
  </tbody></table></div>` : ''}
  </section>`;
}
// Monitoring, recovery and tuning on the recommended handler, and the PyLabRobot skeleton (#99).
function featureSection(d) {
  const c = d.recommended, f = c.features, plr = pylabrobotTarget(c);
  const mark = v => v === true ? 'Yes' : v === false ? 'No' : 'Not found';
  return `<section class='dc-section'><h2>Monitoring, recovery and dry runs</h2>
  ${f ? `<div class='dc-table-wrap'><table class='dc-measures'><thead><tr><th scope='col'>${esc(c.config.name)}</th><th scope='col'>Has it</th></tr></thead><tbody>
  ${Object.entries(handlerFeatures.features).map(([k, x]) => { const v = f[k]; return `<tr><th scope='row'>${esc(x.label)}<small>${esc(v?.detail || x.why)}</small></th><td>${esc(mark(v?.value))}${v?.source ? ` <small><a href='${esc(v.source.url)}' target='_blank' rel='noopener'>source</a></small>` : ''}</td></tr>`; }).join('')}
  </tbody></table></div><p class='dc-note'>“Not found” means no readable source said either way, not that it is missing.</p>` : '<p class=\'dc-note\'>No feature research recorded for this handler.</p>'}
  ${plr.ok ? `<p><button type='button' data-plr-export>Download a PyLabRobot skeleton (.py)</button></p><p class='dc-note'>One commented function per protocol step, written for the ${esc(plr.label)}, using only names from the pinned PyLabRobot commit (driver status: ${esc(plr.driverStatus)}). Not validated: it opens with the unchecked facts and every TODO; module steps, plate moves and mixes stay as pauses.</p>` : `<p class='dc-note'>No PyLabRobot skeleton: ${esc(plr.reason)}</p>`}
  </section>`;
}
// Published automation of CUT&Tag / CUT&RUN per platform (#154).
function assaySection(d) {
  const seen = [...new Map(d.shortlist.map(c => [c.config.id, c.config])).values()].slice(0, 6);
  const ASSAY = {'cut-and-tag': 'CUT&Tag', 'cut-and-run': 'CUT&RUN'};
  const cite = i => `<a href='${esc(i.url)}' target='_blank' rel='noopener'>${esc([i.journal || i.kind, i.year].filter(Boolean).join(' '))}</a>`;
  return `<section class='dc-section'><h2>Published automation of CUT&amp;Tag and CUT&amp;RUN</h2>
  <p class='dc-note'>${esc(assayEvidence.about)}</p>
  <div class='dc-table-wrap'><table class='dc-measures'><thead><tr><th scope='col'>Liquid handler</th><th scope='col'>Published reports</th></tr></thead><tbody>
  ${seen.map(h => { const ev = evidenceFor(h.id); return `<tr><th scope='row'>${esc(h.name)}${h.id === d.recommended.config.id ? ' <small>(recommended)</small>' : ''}</th><td>${ev.length ? ev.map(i => `${esc(i.assays.map(a => ASSAY[a]).join(' and ') || i.assay)} on ${esc(i.model !== 'not stated' ? i.model : i.platform)}${i.match === 'related' ? ' <small>(same maker, other model)</small>' : ''}${i.partial ? ' <small>(library preparation only)</small>' : ''}: “${esc(i.quote)}” ${cite(i)}`).join('<br>') : 'No published report found.'}</td></tr>`; }).join('')}
  </tbody></table></div></section>`;
}
// Reagent use, dead volume and what each dispenser would change (#85).
const ml = ul => ul >= 1000 ? `${(ul / 1000).toFixed(ul >= 10000 ? 0 : 1)} ml` : `${Math.round(ul)} µl`;
const mlRange = r => r ? (ml(r.lo) === ml(r.hi) ? ml(r.lo) : `${ml(r.lo)}–${ml(r.hi)}`) : '—';
const signed = (r, f) => {
  const lo = Math.min(r.lo, r.hi), hi = Math.max(r.lo, r.hi);
  if (lo === 0 && hi === 0) return 'no change';
  if (lo >= 0) return `+${f({lo, hi})}`;
  if (hi <= 0) return `−${f({lo: -hi, hi: -lo})}`;
  return `−${f({lo: -lo, hi: -lo})} to +${f({lo: hi, hi})}`;
};
// The setups the dispenser comparison can run on: the shortlist, which holds
// the default (the best setup on the named handlers, #173) whenever it is in scope.
const dispenseChoices = d => d.shortlist.filter(c => c.handler);
// Handler + dispenser setups are ranked like any other (#173).
function pairsNote(d) {
  const p = d.dispenserPairs;
  if (!p?.pairs.length) return '';
  const b = p.best, w = p.without;
  const row = x => `${esc(x.setup)}: ${esc(fmtMinutes(x.active))} hands-on, ${esc(fmtRange({lo: x.visits.lo, hi: x.visits.hi}))} visits${x.tips ? `, ${esc(fmtRange(x.tips))} tips` : ''}${x.rank ? `, ranked ${x.rank}` : x.why ? ` (${esc(x.why)})` : ''}`;
  const checks = [...new Map(p.pairs.flatMap(x => x.unresolved || [])
    .filter(f => ['labware', 'workcell', 'integration'].includes(f.type) && f.status !== 'yes' && f.status !== 'purchase')
    .map(f => [f.id, f])).values()];
  const compatibility = checks.length ? `<details><summary>Check paired device compatibility</summary><ul>
    ${checks.map(f => `<li>${esc(f.question)} ${factButtons(f)}</li>`).join('')}</ul></details>` : '';
  return `<p class='dc-note'>Ranked as setups on ${esc(p.installation)}: ${b ? `best with a dispenser, ${row(b)}` : 'no setup with a dispenser is in scope'}${w ? `; without one, ${row(w)}` : ''}. ${p.firstOverall ? 'A setup with a dispenser ranks first overall.' : 'No setup with a dispenser ranks first overall.'}${b?.questions.length ? ` Its open question: ${esc(b.questions[0])}` : ''}</p>${compatibility}`;
}
function reagentSection(d) {
  const c = d.recommended, b = d.baseline.reagents, m = c.metrics.reagents, r = d.request;
  const classes = [...new Set([...d.baselineReagents.list, ...(c.reagents || [])].flatMap(x => x.classes))].sort();
  const cost = x => x ? `${gbpRange(x.perRun)} per run (${gbpRange(x.perSample)} per sample)${x.unpriced.length ? `; unpriced: ${x.unpriced.join(', ')}` : ''}` : 'Give prices below';
  const opts = d.dispenserOptions || [];
  return `<section class='dc-section'><h2>Reagents and dispensers</h2>
  <p class='dc-note'>Every addition draws from a container that keeps a dead volume the wells never receive. Tips are not the only consumable: for enzymes, dead volume and reaction size often cost more.${r.reactionScale && r.reactionScale !== 1 ? ` Reactions are scaled to ${r.reactionScale * 100}% in the setups (not in today's practice); this is a method change to validate.` : ''}</p>
  <div class='dc-table-wrap'><table class='dc-measures'><thead><tr><th scope='col'>Per batch</th><th scope='col'>Today</th><th scope='col'>With this setup</th></tr></thead><tbody>
  <tr><th scope='row'>Reagent delivered to wells</th><td>${ml(b.deliveredUl)}</td><td>${ml(m.deliveredUl)}</td></tr>
  <tr><th scope='row'>Dead volume<small>${esc(d.model ? 'Per addition step: trough or tube by hand, reservoir on the handler, channel or source well on a dispenser.' : '')}</small></th><td>${mlRange(b.deadUl)}</td><td>${mlRange(m.deadUl)}${m.deadUnknown ? ` <small>${m.deadUnknown} steps not recorded</small>` : ''}</td></tr>
  ${m.mixSteps || b.mixSteps ? `<tr><th scope='row'>Made beyond what the wells receive<small>${esc(`${dispensers.reagentAccounting.masterMix.label}. Mixes (${m.mixSteps || b.mixSteps} additions) take the larger of overage and dead volume; other reagents their dead volume.`)}</small></th><td>${mlRange(b.extraUl)}</td><td>${mlRange(m.extraUl)}</td></tr>` : ''}
  <tr><th scope='row'>Reagent cost<small>From the prices you give, GBP per ml, by material.</small></th><td>${esc(cost(d.baselineReagents.cost))}</td><td>${esc(cost(c.cost.reagents))}</td></tr>
  <tr><th scope='row'>Refill trips<small>Aspirations of a shared reagent with tips; multi-dispense serves several columns per trip where the software allows it.</small></th><td>—</td><td>${c.metrics.tips ? c.metrics.tips.refills : '—'}</td></tr>
  </tbody></table></div>
  <details><summary>Reagent prices (GBP per ml)</summary><div class='dc-prices'>${classes.map(k => `<label>${esc(k)}<input type='number' min='0' step='any' data-price='${esc(k)}' value='${r.reagentPrices?.[k] ?? ''}'></label>`).join('')}</div></details>
  ${opts.length ? `<h3>What a non-contact dispenser would change</h3>
  <label class='dc-pick'>Compare on<select id='dc-dispense-for'>${dispenseChoices(d).map(s => `<option value='${esc(s.id)}' ${s.id === d.dispenserTarget ? 'selected' : ''}>${esc(s.config.name)}: ${esc(s.route === 'workcell' ? 'workcell' : s.route === 'deck' ? 'deck only' : 'with connected devices')}${s.id === c.id ? ' (recommended)' : ''}${s.id === d.dispenserDefault?.id && s.id !== c.id ? ' (default)' : ''}</option>`).join('')}</select></label>
  <p class='dc-note'>Each dispenser added ${opts[0].via === 'workcell' ? 'to the workcell (the arm moves the plate)' : 'on the bench beside the handler (a person carries the plate there and back and stays while it dispenses)'}. It takes shared reagents added without touching the wells, if the liquid and volume suit it. Splash onto beads or cells is a question, never assumed safe. Dispense time comes from the maker's time per plate where one is published; <em>assumed</em> marks a time extrapolated beyond the maker's figures or a planning estimate. Hands-on includes loading and priming each reagent (planning estimate).${d.dispenserDefault?.why && d.dispenserTarget === d.dispenserDefault.id ? ` ${esc(d.dispenserDefault.why)}` : ''}</p>
  ${pairsNote(d)}
  <div class='dc-table-wrap'><table class='dc-measures'><thead><tr><th scope='col'>Dispenser</th><th scope='col'>Steps taken</th><th scope='col'>Dispense time</th><th scope='col'>Hands-on</th><th scope='col'>Tips saved</th><th scope='col'>Plate moves</th><th scope='col'>Dead volume</th><th scope='col'>Price</th></tr></thead><tbody>
  ${opts.map(o => `<tr><th scope='row'>${esc(o.device.name)}<small>${esc(o.device.familyLabel)}${o.device.consumable ? `; ${esc(o.device.consumable.label)}` : ''}</small></th><td>${o.took.length}${o.splash.length ? ` <small>${o.took.filter(t => t.splash).length} land on ${esc(o.splashLabels.join(' or '))}</small>` : ''}${o.refused.length ? ` <small>refused ${o.refused.length}: ${esc([...new Set(o.refused.map(x => x.why))].join('; '))}</small>` : ''}</td><td>${o.took.length ? `${esc(fmtMinutes(o.dispenseMinutes))}${o.timeKind === 'assumed' ? ' <small>assumed</small>' : ''}<small>${esc([...new Set(o.took.map(t => t.time?.basis).filter(Boolean))].join('; '))}${o.throughput?.source ? ` <a href='${esc(o.throughput.source.url)}' target='_blank' rel='noopener'>source</a>` : ''}</small>` : '—'}</td><td>${esc(signed(o.activeDelta, fmtMinutes))}</td><td>${o.tipsSaved ? esc(fmtRange(o.tipsSaved)) : '—'}</td><td>${o.extraMoves >= 0 ? '+' : ''}${o.extraMoves}</td><td>${esc(signed(o.deadVolumeDelta, mlRange))}${o.device.prime ? ` <small>prime ${esc(mlRange({lo: o.device.prime[0], hi: o.device.prime[1]}))} per reagent to load${o.device.primeRecoverable ? ', recoverable' : ''}</small>` : ''}${o.reagentCostDelta ? ` <small>${esc(signed(o.reagentCostDelta, gbpRange))} reagent per run</small>` : ''}</td><td>${o.price?.new ? `${esc(gbpRange(o.price.new))} new` : 'no new price'}${o.price?.used ? ` <small>used asking ${esc(gbpRange(o.price.used))}</small>` : ''}</td></tr>`).join('')}
  </tbody></table></div>` : ''}
  </section>`;
}
// Buy, borrow or use a core facility (#138): the best purchase beside each
// instrument the person can access, with their own charges and travel time.
function accessSection(d) {
  const a = d.access;
  if (!a?.rows.length) return '';
  const known = x => Object.entries(x.parts).map(([k, v]) => `${k} ${gbpRange(v)}`).join(' + ') || 'nothing priced';
  const over = x => (x.buyOvertakes || []).map(o => `${o.never ? 'never' : `${o.runs} runs`} vs ${esc(o.against.toLowerCase())} (${esc(o.handler)})`).join('; ');
  return `<section class='dc-section'><h2>Buy, borrow or use a core facility</h2>
  <p class='dc-note'>The best purchase next to each instrument you have added under Your equipment, marked there as your own, another group's or a core facility, with its charges and travel time. An instrument someone else runs is taken as it is: what it may lack is a question for its owner, not a purchase. ${esc(a.note)}</p>
  <div class='dc-table-wrap'><table class='dc-measures'><thead><tr><th scope='col'>Route</th><th scope='col'>Hands-on per run</th><th scope='col'>Up front</th><th scope='col'>Per run</th>${a.runsPerYear != null ? `<th scope='col'>Per year (${a.runsPerYear} runs)</th>` : ''}<th scope='col'>Buying is cheaper after</th></tr></thead><tbody>
  <tr><th scope='row'>${esc(a.today.label)}</th><td>${fmtMinutes(a.today.active)}</td><td>—</td><td>${a.today.labour ? `labour ${gbpRange(a.today.labour)}` : '—'}</td>${a.runsPerYear != null ? `<td>${a.today.labour ? gbpRange({lo: a.today.labour.lo * a.runsPerYear, hi: a.today.labour.hi * a.runsPerYear}) : '—'}</td>` : ''}<td>—</td></tr>
  ${a.rows.map(x => `<tr><th scope='row'>${esc(x.label)}: ${esc(x.installation?.name || x.candidate.name)}<small>${esc(x.candidate.name)}${x.candidate.setup ? ` · ${esc(x.candidate.setup)}` : ''}${x.travelMinutes ? ` · ${x.travelMinutes} min travel and hand-over added` : ''}${x.unknown.length ? ` · not counted: ${esc(x.unknown.join(', '))}` : ''}${x.toConfirm.length ? ` · ${x.toConfirm.length} thing${x.toConfirm.length === 1 ? '' : 's'} to confirm with the owner` : ''}</small></th>
    <td>${fmtMinutes(x.active)}<small>saves ${fmtMinutes(x.saved)}</small></td><td>${x.capital ? `${gbpRange(x.capital)}${x.capitalComplete ? '' : ' <small>priced items only</small>'}` : 'unpriced'}</td><td>${gbpRange(x.perRun)}<small>${esc(known(x))}</small></td>${a.runsPerYear != null ? `<td>${gbpRange(x.perYear)}</td>` : ''}<td>${x.kind === 'buy' ? '—' : over(x) || '—'}</td></tr>`).join('')}
  </tbody></table></div></section>`;
}
// Bill of materials (#122): what one run uses, from the planner's ledger.
function bomSection(d) {
  const b = d.recommended.bom, base = d.baselineBom;
  if (!b) return '';
  const cont = b.containers.filter(x => x.refills || x.empties);
  const today = new Map(base.reagents.map(x => [x.key, x]));
  return `<section class='dc-section'><h2>Bill of materials per run</h2>
  <p class='dc-note'>For ${d.request.workload} ${esc(d.model.workloadLabel)}, from the planner's ledger: what each reagent delivers to the wells, the dead volume and overage on top, and the total to prepare. Volumes follow the protocol as read; check them against the Physical checks below.</p>
  <div class='dc-table-wrap'><table class='dc-measures'><thead><tr><th scope='col'>Reagent</th><th scope='col'>To the wells</th><th scope='col'>Dead volume and overage</th><th scope='col'>Prepare</th><th scope='col'>Today, by hand</th></tr></thead><tbody>
  ${b.reagents.map(x => `<tr><th scope='row'>${esc(x.key)}<small>${x.steps} addition${x.steps === 1 ? '' : 's'}; ${esc(x.routes.join(', '))}${x.primeUl ? `; prime ${esc(mlRange(x.primeUl))}` : ''}</small></th><td>${ml(x.deliveredUl)}</td><td>${x.extraUl ? mlRange(x.extraUl) : 'not recorded'}</td><td>${mlRange(x.totalUl)}</td><td>${today.has(x.key) ? mlRange(today.get(x.key).totalUl) : '—'}</td></tr>`).join('')}
  <tr><th scope='row'>All reagents</th><td>${ml(b.totals.deliveredUl)}</td><td></td><td>${mlRange(b.totals.totalUl)}</td><td>${mlRange(base.totals.totalUl)}</td></tr>
  ${b.tips ? `<tr><th scope='row'>Tips<small>${Object.entries(b.tips.bySize).sort().map(([k, v]) => `${esc(k)}: ${esc(fmtRange(v))}`).join('; ')}</small></th><td colspan='3'>${esc(fmtRange(b.tips.total))} (${Object.values(b.tips.racks).reduce((n, x) => n + x, 0)} racks of 96)</td><td>—</td></tr>` : ''}
  <tr><th scope='row'>Liquid waste<small>On the deck, then at the bench for steps done by hand.</small></th><td colspan='3'>${ml(b.waste.robotUl)} on the deck${b.waste.empties ? `, emptied ${b.waste.empties} time${b.waste.empties === 1 ? '' : 's'}` : ''}; ${ml(b.waste.benchUl)} at the bench</td><td>${ml(base.waste.benchUl)}</td></tr>
  <tr><th scope='row'>Refills during the run<small>${esc(b.labour.basis)}</small></th><td colspan='3'>${b.refills} refill${b.refills === 1 ? '' : 's'}, waste emptied ${b.waste.empties} time${b.waste.empties === 1 ? '' : 's'}: ${fmtMinutes(b.labour.minutes)} of hands-on time${cont.length ? `<small>${esc(cont.map(x => `${x.label}: ${x.refills ? `refilled ${x.refills} time${x.refills === 1 ? '' : 's'}, ${ml(x.drawnUl)} drawn` : `emptied ${x.empties} times, ${ml(x.dumpedUl)}`}`).join('; '))}</small>` : ''}</td><td>—</td></tr>
  </tbody></table></div>
  <p class='dc-note'>Refill minutes are hands-on time: they count in the ranking and the break-even labour, with the reservoirs the solved deck layout places.</p>
  </section>`;
}
// Physical checks (#121): what the plan asks of the wells, reservoirs and
// waste that they cannot do, from the planner's ledger, by step.
const physicalOpen = c => [...(c.physicalIssues || []), ...c.facts.filter(f => f.type === 'physical')].filter(i => i.status !== 'yes');
function physicalFlag(c) {
  const imp = impossibleCount(c), q = physicalOpen(c).length - imp;
  if (!imp && !q) return `<li class='ok'>The ledger finds nothing the wells, reservoirs and waste cannot hold</li>`;
  return `<li class='warn'>${imp ? `<strong>Physically impossible as planned:</strong> ${imp} step${imp === 1 ? '' : 's'} the containers cannot carry out` : ''}${imp && q ? '; ' : ''}${q ? `${q} physical question${q === 1 ? '' : 's'}` : ''} (see Physical checks)</li>`;
}
function physicalCell(c) {
  const imp = impossibleCount(c), q = physicalOpen(c).length - imp;
  return imp ? `<strong class='dc-bad'>${imp} impossible</strong>${q ? `<small>${q} to check</small>` : ''}` : q ? `${q} to check` : 'none';
}
function physicalSection(d) {
  const issues = d.physicalIssues, facts = d.recommended?.facts.filter(f => f.type === 'physical') || [];
  const sev = i => i.severity === 'impossible' ? `<strong class='dc-bad'>Cannot be done</strong>` : 'Question';
  const answered = i => i.status === 'yes' ? ' <small>(marked resolved)</small>' : '';
  const acknowledge = i => i.acknowledged
    ? `<small>Acknowledged. Still blocked.</small><button type='button' data-fact='${esc(i.id)}' data-value='unknown'>Clear acknowledgement</button>`
    : `<button type='button' data-fact='${esc(i.id)}' data-value='yes'>Acknowledge</button>`;
  return `<section class='dc-section'><h2>Physical checks</h2>
  <p class='dc-note'>The planner keeps a ledger of every well, reservoir and waste through the run: what each step adds, removes and moves, against the capacity of ${esc(d.labware?.label || 'the labware')}${d.labware?.assumed ? ' (assumed)' : ''} and of the reservoirs. Problems of the protocol as read are the same on every setup; problems of this setup's reservoirs and waste are questions for its owner. An impossible protocol step stays manual in the estimate and earns no automation credit. Update the protocol or labware and reassess to clear it.</p>
  ${issues.length ? `<div class='dc-table-wrap'><table class='dc-measures'><thead><tr><th scope='col'>Step</th><th scope='col'>Found</th><th scope='col'>Severity</th><th scope='col'>Review</th></tr></thead><tbody>
  ${issues.map(i => `<tr><th scope='row'>${esc(i.step)}</th><td>${esc(physicalKinds[i.kind] || i.kind)}<small>${esc(i.detail)}</small></td><td>${sev(i)}${answered(i)}</td><td>${i.severity === 'impossible' ? acknowledge(i) : factButtons(i)}</td></tr>`).join('')}
  </tbody></table></div>` : '<p>No step asks more of the wells than they hold.</p>'}
  ${facts.length ? `<h3>This setup's reservoirs and waste</h3><ul class='dc-physical'>${facts.map(f => `<li>${sev(f)}${answered(f)}: ${esc(f.question)}</li>`).join('')}</ul>` : d.recommended ? `<p>This setup's reservoirs and waste hold the run without refills.</p>` : ''}
  </section>`;
}
// Where the plate goes, in order, and who moves it (#63).
function plateMoves(d) {
  const moves = d.recommended.timeline.filter(s => s.move);
  if (!moves.length) return '';
  const BY = {gripper: 'Gripper', arm: 'Workcell arm', person: 'By hand'};
  return `<section class='dc-section'><h2>Where the plate goes</h2>
  <p class='dc-note'>${esc(moveText(d.recommended.metrics.moves))}. A module the plate must be placed onto is its own position; a magnet that rises under the plate needs no move.</p>
  <details><summary>Show all ${moves.length} moves in order</summary><ol class='dc-moves'>${moves.map(s => `<li><strong>${esc(BY[s.move.by])}</strong>: ${esc(s.move.from)} → ${esc(s.move.to)} <small>${esc(d.model.chunks.find(c => c.id === s.chunkId)?.name || '')}</small></li>`).join('')}</ol></details></section>`;
}
const KIND = {quote: 'quote to the lab', list: 'list price', award: 'public award', 'used-asking': 'used, asking', 'used-sold': 'used, sold'};
function evidenceSummary(l) {
  const n = {};
  for (const b of l.basis) for (const e of b.evidence) n[KIND[e.kind] || e.kind] = (n[KIND[e.kind] || e.kind] || 0) + 1;
  const range = ['new', 'used'].map(k => l[k]?.span ? `${k} middle half of ${l[k].n}, full span ${gbpRange(l[k].span)}` : null).filter(Boolean);
  return esc([Object.entries(n).map(([k, v]) => `${v} ${k}`).join(', '), ...range].join('; '));
}
// Sourced price lines for the recommended setup (#57). Nothing is estimated.
function costs(d) {
  const c = d.recommended.cost;
  return `<section class='dc-section'><h2>What it would cost</h2>
  <p class='dc-note'>${esc(costText(c))}. Each line is priced from recorded quotes, list prices, public contract awards or used listings, converted to pounds at ${esc(d.prices.fx.source.title)}. ${c.bundle ? `The instrument and its modules are priced as “${esc(c.bundle)}”, because that is cheaper than the parts or the parts are not priced separately. ` : ''}${c.missing.length ? `<strong>Unpriced:</strong> ${c.missing.map(esc).join('; ')}.` : ''}</p>
  <div class='dc-table-wrap'><table class='dc-measures'><thead><tr><th scope='col'>Item</th><th scope='col'>New</th><th scope='col'>Used</th></tr></thead><tbody>
  ${c.lines.map(l => `<tr><th scope='row'>${esc(l.label)}<small>${l.part === 'build' ? `Open-source build: ${esc(l.statedCost || 'no parts cost stated')}${l.statedCost ? ' (authors\' figure, not added to the total)' : ''}` : l.owned ? 'Already accessible' : l.unpriced ? 'No price found yet' : evidenceSummary(l)}</small>${l.basis.length ? `<details><summary>${l.basis.length} source${l.basis.length === 1 ? '' : 's'}</summary><ul>${l.basis.map(b => `<li>${esc(b.label)}: ${b.evidence.map(e => { const t = `${esc(KIND[e.kind] || e.kind)}, ${esc(e.currency)} ${Math.round(e.amount).toLocaleString('en-GB')}, ${esc(e.date.slice(0, 7))}`; return e.url ? `<a href='${esc(e.url)}' target='_blank' rel='noopener'>${t}</a>` : t; }).join(' + ')}</li>`).join('')}</ul></details>` : ''}</th><td>${esc(gbpRange(l.new))}</td><td>${esc(gbpRange(l.used))}</td></tr>`).join('')}
  </tbody></table></div></section>`;
}

function group(steps) {
  const m = new Map();
  for (const s of steps) { const k = s.label; const g = m.get(k) || {label: k, count: 0, minutes: {lo: 0, hi: 0}}; g.count += s.count || 0; g.minutes = {lo: g.minutes.lo + s.personIfManual.lo, hi: g.minutes.hi + s.personIfManual.hi}; m.set(k, g); }
  return [...m.values()].sort((a, b) => mid(b.minutes) - mid(a.minutes));
}
function why(d) {
  const rec = d.recommended, alt = d.alternative, c = d.comparison;
  if (rec.tipRuntime && alt) return `<section class='dc-section'><h2>Closest ranked alternative</h2>
    <p>${esc(alt.installation.name)} · ${esc(alt.setupLabel)} · ${fmtRange(alt.tipRuntime.tips)} tips · ${fmtMinutes(alt.tipRuntime.elapsed)} to finish.</p></section>`;
  if (!alt) return `<section class='dc-section'><h2>Why this setup</h2><p>No other instrument family has a route in this scope. Widen the scope to compare.</p></section>`;
  const recOpen = rec.facts.filter(f => f.status !== 'yes').length, altOpen = alt.facts.filter(f => f.status !== 'yes').length;
  const gains = group(c.onlyA).slice(0, 5), losses = group(c.onlyB).slice(0, 5);
  return `<section class='dc-section'><h2>Why this rather than ${esc(alt.installation.name)}</h2>
  <p class='dc-alt'>${esc(alt.config.name)} · ${esc(alt.setupLabel)} would leave ${fmtMinutes(alt.metrics.active)} of hands-on work and ${fmtRange(alt.metrics.visits)} returns.</p>
  <div class='dc-why'>
    <div><h3>Only this setup takes over</h3>${gains.length ? `<ul>${gains.map(g => `<li>${esc(g.label)} <span>×${g.count} · ${fmtMinutes(g.minutes)}</span></li>`).join('')}</ul>` : '<p>Nothing the alternative cannot also do.</p>'}</div>
    <div><h3>Only the alternative takes over</h3>${losses.length ? `<ul>${losses.map(g => `<li>${esc(g.label)} <span>×${g.count} · ${fmtMinutes(g.minutes)}</span></li>`).join('')}</ul>` : '<p>Nothing this setup cannot also do.</p>'}</div>
    <div><h3>Facts still to confirm</h3><p>This setup: <strong>${recOpen}</strong>. Alternative: <strong>${altOpen}</strong>.</p></div>
  </div></section>`;
}

function factButtons(f) {
  if (f.type === 'installed-heads') return '<a href="#equipment">Review the installed heads</a>';
  if (['purchase', 'proposed'].includes(f.status)) return '';
  const yes = f.type === 'head' ? f.head : 'yes';
  const cur = f.status;
  return `<span class='dc-answerbtns' role='group' aria-label='Record an answer'>
    <button type='button' data-fact='${esc(f.id)}' data-value='${esc(yes)}' aria-pressed='${cur === 'yes'}'>Yes</button>
    <button type='button' data-fact='${esc(f.id)}' data-value='no' aria-pressed='${cur === 'no'}'>No</button>
    <button type='button' data-fact='${esc(f.id)}' data-value='unknown' aria-pressed='${cur === 'unknown'}'>Not checked</button></span>`;
}
function questions(d) {
  if (!d.questions.length) return `<section class='dc-section'><h2>What could change this answer</h2><p>Nothing: every fact this route relies on is confirmed. Remaining risk is method performance, which needs a run on the instrument.</p></section>`;
  const hasAnswers = Object.keys(d.request.facts).length;
  return `<section class='dc-section'><h2>What could change this answer</h2>
  <p class='dc-note'>Most important first. Answers you record here are saved in this browser only and count as your assertion, not owner-verified evidence.${hasAnswers ? ` <button type='button' class='dc-link' data-reset='1'>Clear my answers</button>` : ''}</p>
  <ol class='dc-questions'>${d.questions.map(q => {
    const no = q.ifNo.candidate;
    const noText = !no ? (d.request.objective === TIP_RUNTIME ? 'No eligible route remains in this scope.' : 'No route in this scope automates anything; all work returns to the bench.')
      : no.id === d.recommended.id ? 'No change.'
      : no.tipRuntime ? `Best becomes ${esc(no.installation.name)} with ${fmtRange(no.tipRuntime.tips)} tips and ${fmtMinutes(no.tipRuntime.elapsed)} elapsed.`
      : mid(q.ifNo.activeDelta) < 10 ? `Little lost: ${esc(no.installation.name)} does about the same.`
      : `Best becomes ${esc(no.installation.name)}: about ${fmtMinutes(q.ifNo.activeDelta)} more hands-on work per batch.`;
    return `<li data-question='${esc(q.fact.id)}'><p class='q'>${esc(q.fact.question)}</p>
      <p class='dc-who'>Ask: ${esc(q.fact.owner)} · Currently: ${esc(statusText[q.fact.status] || q.fact.status)}</p>
      <dl><dt>If yes</dt><dd>This recommendation stands.</dd><dt>If no</dt><dd>${noText}</dd></dl>${factButtons(q.fact)}</li>`;
  }).join('')}</ol></section>`;
}

function dayColumn(title, metrics) {
  const items = [];
  metrics.visitList.forEach((v, i) => {
    const labels = [...new Set(v.actions.map(a => a.label))];
    items.push(`<li class='visit'><p><strong>Return ${v.n}</strong> · ${fmtMinutes(v.minutes)} hands-on</p><p class='acts'>${esc(labels.slice(0, 3).join('; '))}${labels.length > 3 ? ` and ${labels.length - 3} more` : ''}</p></li>`);
    const w = metrics.walkAway.find(x => x.after === v.n);
    if (w) items.push(`<li class='away ${w.untimed ? 'untimed' : ''}'>${w.untimed ? 'Untimed programme: you can probably leave' : `Walk away for ${fmtMinutes(w)}`}</li>`);
  });
  return `<div class='dc-daycol'><h3>${esc(title)}</h3><ol>${items.join('')}</ol></div>`;
}
function day(d) {
  return `<section class='dc-section'><h2>Your day</h2>
  <p class='dc-note'>Each return is a separate trip to the bench, in order. Gaps shorter than 15 minutes count as waiting at the bench, not walk-away time.</p>
  <div class='dc-day'>${dayColumn('Today', d.baseline)}${dayColumn('With this setup', d.recommended.metrics)}</div></section>`;
}

// Labstep evidence for one stage: prescribed timers, linked equipment and the
// observed minutes between step ticks in past runs (elapsed time, not hands-on).
function observedLine(chunk) {
  const o = chunk.observed, parts = [];
  // The middle-half range means little with few runs, so it is shown from four runs up.
  if (o) parts.push(`Observed in past runs: ${o.medianMin} min ${o.n >= 4 ? `(middle half ${o.p25Min}–${o.p75Min} min, ${o.n} runs)` : `(median of ${o.n} run${o.n === 1 ? '' : 's'})`}, between step ticks`);
  if (chunk.prescribedSeconds != null) parts.push(`protocol timers: ${Math.round(chunk.prescribedSeconds / 6) / 10} min`);
  if (chunk.devices?.length) parts.push(`equipment linked in Labstep: ${chunk.devices.join(', ')}`);
  return parts.length ? `<p class='dc-note dc-observed'>${esc(parts.join('; '))}.</p>` : '';
}

function observedEvidence(d) {
  const seen = (d.model.sources || []).filter(s => s.observed);
  if (!seen.length) return 'No observed step times are attached to these protocols yet (run <code>npm run labstep -- observed</code>).';
  return esc(`Observed step times come from Labstep step ticks in past runs of the pinned version (${seen.map(s => `${s.name}: ${s.observed.matchedRuns} of ${s.observed.runs} runs usable, read ${s.observed.retrievedAt}${whyMissing(s.observed)}`).join('; ')}). They are minutes between ticks: elapsed time per step, including waits, so they are shown beside the hands-on estimates, not used in place of them. Runs with fewer than half their steps ticked, runs ticked in a batch or out of order, and runs whose ticks span less than half the protocol's stated waits are left out; so are batch-ticked steps and the step before them, held steps, out-of-order ticks, and steps ticked in under half their stated wait. A step's time is shown only when at least ${seen[0].observed.minRuns ?? 5} plausible runs remain; otherwise it stays missing.`);
}

// Why runs or steps are missing from the observed times (lab-mcp rejection reasons, #148).
const REASONS = {low_tick_coverage: 'under half the steps ticked', batch_ticked_run: 'ticked in a batch', out_of_order_run: 'ticked out of order', tick_span_shorter_than_stated_waits: 'ticks span less than half the stated waits'};
function whyMissing(o) {
  const runs = Object.entries(o.rejectedRuns || {}).filter(([, n]) => n).map(([k, n]) => `${n} ${REASONS[k] || k.replaceAll('_', ' ')}`);
  const parts = [];
  if (runs.length) parts.push(`runs left out: ${runs.join(', ')}`);
  if (o.tooFewSteps) parts.push(`${o.tooFewSteps} step${o.tooFewSteps === 1 ? '' : 's'} with too few plausible runs`);
  return parts.length ? ` (${parts.join('; ')})` : '';
}

// Parts you could build (#78): what an open-source build would add to an
// instrument in this scope, while builds are left out of the ranking.
function buildSection(d) {
  const o = d.buildOpportunities || [];
  if (!o.length) return '';
  return `<section class='dc-section dc-builds'><h2>Parts you could build</h2>
  <p class='dc-note'>Open-source designs that fill a gap on an instrument in this scope, such as a module it lacks. Not in the ranking above. Tick “Include open-source parts” to rank them, or mark one as planned or built under <a href='#equipment'>Your equipment</a>.</p>
  <ul>${o.map(x => `<li><strong>${esc(x.installation.name)}</strong>: building ${x.builds.map(b => `<a href='${esc(b.url)}' target='_blank' rel='noopener'>${esc(b.name)}</a> <span class='pill'>${esc(b.maturity)}</span>${b.statedCost ? ` <small>${esc(b.statedCost)}</small>` : ''}`).join(', ')} would take about <strong>${fmtMinutes(x.saving)}</strong> more hands-on work off each batch than ${x.without ? 'its best setup without them' : 'doing it by hand'}, with returns to the bench going from ${fmtRange(x.visits.from)} to ${fmtRange(x.visits.to)}. ${x.toConfirm.length} fact${x.toConfirm.length === 1 ? '' : 's'} to confirm first, including that each part works and is validated.<small>${esc(x.candidate.setupLabel)}</small></li>`).join('')}</ul>
  </section>`;
}

// Open-source and DIY routes for what this setup leaves to a person or a bought workcell device (#76).
function openSection(d) {
  const built = new Set(d.recommended.providers.filter(p => p.build).map(p => p.build));
  const gaps = (d.openRoutes || []).map(g => ({...g, routes: g.routes.filter(e => !built.has(e.id))})).filter(g => g.routes.length);
  if (!gaps.length) return '';
  const rec = d.recommended;
  return `<section class='dc-section dc-open'><h2>Open-source and DIY routes for what is left</h2>
  <p class='dc-note'>Published open hardware that could take over steps ${esc(rec.installation.name)} leaves to a person or to a bought workcell device. These are leads: none is counted in the times above, each needs building and validating, and stated costs are the authors' own historical figures. <a href='#catalogue'>See every entry</a>.</p>
  ${gaps.map(g => `<details class='dc-chunk'><summary><span class='name'>${esc(g.label)}</span><span class='tag'>${g.how === 'workcell' ? 'Bought workcell device' : `By hand ×${g.count}`}</span><span class='mins'>${g.routes.length} route${g.routes.length === 1 ? '' : 's'}</span></summary>
    ${g.reason ? `<p class='dc-note'>${esc(g.reason)}</p>` : ''}
    <ul>${g.routes.map(e => `<li><a href='${esc(e.url)}' target='_blank' rel='noopener'><strong>${esc(e.name)}</strong></a> <span class='pill'>${esc(e.maturity)}</span>${e.statedCost ? ` <small>${esc(e.statedCost)}</small>` : ''}<br>${esc(e.does)}<br><small><strong>Limits:</strong> ${esc(e.limits)}${e.validate.length ? ` <strong>Validate:</strong> ${esc(e.validate.join('; '))}.` : ''}</small></li>`).join('')}</ul></details>`).join('')}
  </section>`;
}

function workMap(d) {
  const rec = d.recommended;
  const byChunk = (timeline, id) => timeline.filter(s => s.chunkId === id);
  const sumH = steps => steps.filter(s => s.type === 'H' || s.type === 'D').reduce((t, s) => ({lo: t.lo + s.minutes.lo, hi: t.hi + s.minutes.hi}), {lo: 0, hi: 0});
  return `<section class='dc-section'><h2>The work, stage by stage</h2>
  <p class='dc-note'>Open a stage to see each action, how many times it happens, and who does it. Counts marked “assumed” need confirming against the protocol.</p>
  ${d.model.chunks.map(chunk => {
    const today = byChunk(d.baselineTimeline, chunk.id), next = byChunk(rec.timeline, chunk.id);
    const auto = next.filter(s => s.type === 'A' && !s.move && !s.rackSwap).length;
    const tag = auto === 0 ? 'Stays with a person' : next.some(s => (s.type === 'H' || s.type === 'D') && !s.overhead) ? 'Partly automated' : 'Automated';
    return `<details class='dc-chunk'><summary><span class='name'>${esc(chunk.name)}</span><span class='tag ${tag === 'Automated' ? 'ok' : tag === 'Partly automated' ? 'part' : ''}'>${tag}</span><span class='mins'>${fmtMinutes(sumH(today))} → ${fmtMinutes(sumH(next))}</span></summary>
      ${observedLine(chunk)}
      <table><thead><tr><th scope='col'>Action</th><th scope='col'>How often</th><th scope='col'>Today</th><th scope='col'>With this setup</th></tr></thead><tbody>
      ${today.filter(s => s.type === 'H' || s.type === 'D').map(s => {
        const n = next.find(x => x.actionId === s.actionId && !x.overhead && x.type !== 'W');
        const extra = next.filter(x => x.actionId === s.actionId && x.overhead);
        const who = n?.type === 'A' ? `<span class='who inst'>Instrument</span>${extra.map(x => `<small>${esc(x.label)}${x.move ? ` (${esc(x.move.from)} → ${esc(x.move.to)})` : ''}: ${fmtMinutes(x.minutes)}${x.type === 'A' ? '' : ' by hand'}</small>`).join('')}` : `<span class='who'>Person</span><small>${esc(n?.reason || '')}</small>`;
        return `<tr><td>${esc(s.label)}</td><td>×${s.count}${s.countBasis === 'assumed' ? ` <abbr title='${esc(s.countNote)}' class='assumed'>assumed</abbr>` : ''}</td><td>${fmtMinutes(s.minutes)}</td><td>${who}</td></tr>`;
      }).join('')}
      ${next.filter(s => s.overhead && !s.actionId).map(s => `<tr class='overhead'><td>${esc(s.label)}</td><td>×1</td><td>—</td><td><span class='who'>Person</span><small>${fmtMinutes(s.minutes)}, created by using the instrument</small></td></tr>`).join('')}
      </tbody></table></details>`;
  }).join('')}</section>`;
}

function options(d) {
  if (!d.shortlist.length) return '';
  const b = d.baseline;
  return `<section class='dc-section'><h2>Every option considered, best first</h2>
  <p class='dc-note'>The best route on each instrument in this scope, ranked by your objective. Order in the catalogue plays no part.</p>
  <div class='dc-table-wrap'><table class='dc-options'><thead><tr><th scope='col'>Instrument and setup</th><th scope='col'>Hands-on</th><th scope='col'>Saves</th><th scope='col'>Returns</th><th scope='col'>Run passes for irregular transfers</th><th scope='col'>PyLabRobot</th><th scope='col'>Physical checks</th><th scope='col'>Unchecked facts</th></tr></thead><tbody>
  ${d.shortlist.slice(0, 12).map((c, i) => `<tr class='${i === 0 ? 'top' : ''}'><td><strong>${esc(c.installation.name)}</strong>${c.installation.kind === 'purchase' ? ` <span class='pill'>purchase</span>` : ''}${c.workcell ? ` <span class='pill'>workcell</span>` : ''}${c.providers.some(p => p.build) ? ` <span class='pill'>open-source build</span>` : ''}<small>${esc(c.setupLabel)}</small></td><td>${fmtMinutes(c.metrics.active)}</td><td>${fmtMinutes(saving(b.active, c.metrics.active))}</td><td>${fmtRange(c.metrics.visits)}</td><td>${passesCell(c)}</td><td>${c.handler ? plrHtml(c.handler) : 'No handler export'}</td><td>${physicalCell(c)}</td><td>${c.facts.filter(f => f.status !== 'yes').length}</td></tr>`).join('')}
  </tbody></table></div></section>`;
}

function evidence(d) {
  return `<details class='dc-evidence'><summary>How this was worked out</summary>
  <h3>Search coverage</h3><p>${esc(d.search.method)} ${d.search.evaluated} routes evaluated; ${d.search.inScope} in this scope.</p>
  <table><thead><tr><th scope='col'>Instrument family</th><th scope='col'>Routes</th><th scope='col'>In scope</th><th scope='col'>Best hands-on</th><th scope='col'>If excluded, why</th></tr></thead><tbody>
  ${d.families.map(f => `<tr><td>${esc(f.config.name)}</td><td>${f.evaluated}</td><td>${f.inScope}</td><td>${f.best ? fmtMinutes(f.best.metrics.active) : '—'}</td><td>${esc(f.excludedBecause || '')}</td></tr>`).join('')}
  </tbody></table>
  <p><button type='button' class='btn ghost' data-planning-result>Download private decision JSON</button></p>
  <h3>Evidence behind the numbers</h3><ul>
  <li>Work model: ${esc(d.modelVersion)}. ${esc(d.model.status)}</li>
  <li>Hands-on minutes are planning estimates given as ranges. Savings are paired: the same estimate is used on both sides.</li>
  <li>${observedEvidence(d)}</li>
  <li>Incubation and programme durations come from the protocol text where stated. ${d.baseline.missingWaits} remain missing and are never treated as zero.</li>
  <li>${d.model.review.length} protocol line${d.model.review.length === 1 ? '' : 's'} could not be classified by the general lexicon and are not counted yet; they need review.</li>
  <li>A working day is ${workingDay.hours} hours. ${esc(workingDay.note)}</li>
  <li>Using an instrument adds setup and cleanup, a reload when tips run out (from deck capacity), a plate move whenever the plate leaves for a bench step, and residual loading or review time for automated measurements. All are counted as hands-on work.</li>
  <li>Setups are generated from every liquid handler in the catalogue, its on-deck modules, devices its software is documented to drive, and devices connected through a workcell. Undocumented integrations appear only as workcell proposals.</li>
  <li>Method changes (${d.request.methodChanges ? 'allowed' : 'switched off'}) such as shaking instead of rotation, shaking or pipette mixing instead of vortexing a tube, or a plate-reader assay instead of a single-tube fluorometer always become questions for the protocol owner. No chemistry is changed, and hardware fit is not assay validation.</li>
  <li>Labware: ${d.labware ? `${esc(d.labware.label)}${d.labware.assumed ? ' (assumed, because the workflow names none)' : ''}, ${esc(d.labware.basis)}` : 'not modelled'}. The catalogue records no labware compatibility, so fit of each deck, module and device is a question, never assumed.</li>
  <li>Instrument run times are not channel-specific, so time to finish is indicative. Labour estimates do not depend on it.</li>
  </ul></details>`;
}
