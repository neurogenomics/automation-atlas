// Protocols: import from any source, then combine into workflows.
import {labwareOptions, labwareLegacy, reviewImport, lintModel, protocolDecisionBlocker, variantPlan} from '../lib/work.js';
import {normaliseSnapshot, snapshotFromText, diffLabstepSteps} from '../lib/snapshots.js';
import {canonicalJson, checkLabstepVersion, verifyLabstepSnapshotHash} from '../lib/source-provenance.js';
import {verifyWashComparison, washComparison} from '../lib/wash-comparison.js';
import {summarizeWashObservations, washObservationTemplate} from '../lib/wash-observations.js';
import {buildBrowserAssessment, draftSelection, labstepAsOf, matchesPin, mergeProtocolImports, partKey, protocolKey, verifyProtocolImports, workflowDrafts, workflowPin} from './pins.js';
import {api, download, esc, uid} from './store.js';

const keyOf = s => `${s.source}:${s.id}`;
// The labware a workflow runs in; older workflows held only 'plate' or 'tube' (#53).
const labwareSelect = (attrs, current = '') => `<select ${attrs}>${current ? '' : `<option value='' selected>Choose labware…</option>`}${labwareOptions.map(l => `<option value='${esc(l.id)}' ${l.id === current ? 'selected' : ''}>${esc(l.label)} (${l.maxUl >= 1000 ? `${l.maxUl / 1000} ml` : `${l.maxUl} µl`} nominal)</option>`).join('')}</select>`;

export function mountProtocols(el, ctx) {
  let note = '';
  let picked = [];
  let reviewing = null;
  let comparison = null;
  const pendingWashReplay = new WeakMap();
  // Why the lab's protocols are missing, when they are (#145).
  const labNote = () => {
    if (!ctx.account.user) return `<p class='notice'>Sign in to see the lab's own protocols.</p>`;
    const lab = ctx.lab();
    if (lab.error) return `<p class='notice'>The lab's protocols are shown to lab members. ${esc(lab.error)} See the Lab page.</p>`;
    if (!lab.protocols.length) return `<p class='notice'>No lab protocols have been pushed from Labstep yet. The lab owner runs <code>npm run labstep -- push</code> (see the Lab page).</p>`;
    return '';
  };
  const draw = () => {
    const p = ctx.profile();
    const snaps = p.protocols.map(raw => ({raw, s: normaliseSnapshot(raw)}));
    el.innerHTML = `
    <section class='pg'>
      <h2>Protocols</h2>
      <p class='lede'>The lab's own protocols, from Labstep, are listed for every lab member (marked Lab). Import any other protocol, then combine one or more into a workflow to assess. Protocols you import are never uploaded: they stay in this browser, even when you are signed in.</p>
      ${labNote()}
      ${note ? `<p class='notice'>${esc(note)}</p>` : ''}
      <div class='cards two'>
        <form class='card' id='pr-upload'>
          <h3>Upload an export</h3>
          <p class='sub'>Drag Labstep export files anywhere onto this page, or choose them below. Exports come from lab-mcp (<code>npm run labstep -- import &lt;id&gt;</code>); a bundle of several protocols works too.</p>
          <div class='drop'>Drop files here</div>
          <input type='file' id='pr-files' accept='.json,application/json' multiple>
        </form>
        <form class='card' id='pr-paste'>
          <h3>Paste protocol text</h3>
          <p class='sub'>From protocols.io, a paper, a document. Start each step with a number (“1.”) or leave a blank line between steps.</p>
          <label>Name<input id='pr-name' required placeholder='e.g. Bead clean-up v2'></label>
          <label>Source link (optional)<input id='pr-url' type='url' placeholder='https://'></label>
          <label>Steps<textarea id='pr-text' rows='8' required></textarea></label>
          <button class='btn'>Add protocol</button>
        </form>
      </div>
      <h3>Protocols (${snaps.length})</h3>
      ${snaps.length ? `<table class='tbl'><thead><tr><th>Protocol</th><th>Source</th><th>Version</th><th>Steps</th><th></th></tr></thead><tbody>
      ${snaps.map(({raw, s}) => `<tr><td><label class='inline'><input type='checkbox' data-pick='${esc(keyOf(s))}' ${picked.includes(keyOf(s)) ? 'checked' : ''}> ${s.url ? `<a href='${esc(s.url)}' target='_blank' rel='noopener'>${esc(s.name)}</a>` : esc(s.name)}</label></td><td>${raw.lab ? `<span class='tag'>Lab</span> ` : ''}${esc(s.source)}</td><td>${esc(s.version?.number ?? '')}</td><td>${s.steps.length}</td><td><button class='link' data-review='${esc(keyOf(s))}'>${reviewing === keyOf(s) ? 'Hide review' : 'Review'}</button>${raw.lab ? '' : ` <button class='link' data-del-protocol='${esc(keyOf(s))}'>Remove</button>`}</td></tr>${reviewing === keyOf(s) ? `<tr class='review'><td colspan='5'>${reviewView(raw)}</td></tr>` : ''}`).join('')}
      </tbody></table>` : `<p class='empty'>No protocols yet.</p>`}
      ${snaps.length ? `<form class='card' id='wf-new'>
        <h3>Make a workflow</h3>
        <p class='sub'>Tick protocols above in the order they are run${picked.length ? `: ${picked.map((k, i) => `${i + 1}. ${esc(snaps.find(x => keyOf(x.s) === k)?.s.name || k)}`).join(' → ')}` : '.'}</p>
        <div class='row'>
          <label>Name<input id='wf-name' required value='${esc(picked.map(k => snaps.find(x => keyOf(x.s) === k)?.s.name).filter(Boolean).join(' + '))}'></label>
          <label>Samples are run in${labwareSelect("id='wf-labware' required")}</label>
          <label>Usual batch size<input id='wf-batch' type='number' min='1' max='100000' value='96'></label>
          <label>Batch unit<input id='wf-unit' value='samples'></label>
        </div>
        <button class='btn' ${picked.length ? '' : 'disabled'}>Create workflow</button>
      </form>` : ''}
      <h3>Workflows (${p.workflows.length})</h3>
      ${comparison ? repinView(comparison) : ''}
      ${p.workflows.length ? p.workflows.map(w => workflowCard(w, p)).join('') : `<p class='empty'>No workflows yet. Import a protocol, tick it, and create a workflow.</p>`}
    </section>`;
  };

  // Read-only review of one imported protocol before it is used (#152).
  const LEVEL = {stop: 'Settle first', check: 'Check', ok: 'No import flags'};
  function qualityGatesView(gates) {
    if (!gates?.length) return '';
    return `<section class='notice'><h4>Quality-control decisions</h4>
      <p>Full-run estimates depend on these outcomes.</p>
      <ul>${gates.map(g => `<li><strong>${esc(g.step)}</strong>
        <dl><dt>Condition</dt><dd>${esc(g.condition)}</dd>
          <dt>Work if met</dt><dd>${esc(g.whenTrue)}</dd>
          <dt>Work otherwise</dt><dd>${esc(g.otherwise || g.whenFalse || 'Unspecified')}</dd></dl>
        <div class='sub'>${g.source.bodyLine ? `Body line ${esc(g.source.bodyLine)} · ` : ''}${esc(g.source.line)}</div></li>`).join('')}</ul>
    </section>`;
  }

  function sourcePinnedVariants(model) {
    const variants = (model?.variants || []).filter(v => v && Object.hasOwn(v, 'targets'));
    if (!variants.length) return '';
    const operations = rows => rows.length ? `<ul>${rows.map(row => `
      <li>${esc(row.step)} · version ${esc(row.versionId)}, step ${esc(row.position)}, line ${esc(row.bodyLine ?? 'unspecified')}<br>${esc(row.label)}</li>`).join('')}</ul>` : '<p>None selected.</p>';
    return `<section class='notice'><h4>Source-pinned method proposals</h4>
      <p>Estimates are pending method qualification.</p>
      ${variants.map(variant => {
        let plan;
        try { plan = variantPlan(model, variant); }
        catch (error) { return `<p class='bad'>${esc(error.message)}</p>`; }
        const comparison = washComparison(model, plan, variant);
        return `<details><summary>${esc(plan.label)} · ${plan.changed.length} proposed, ${plan.kept.length} kept</summary>
          ${plan.targetIssues.length ? `<ul>${plan.targetIssues.map(issue => `<li>${issue.target ? `Target ${esc(issue.target)} · ` : ''}${esc(issue.reason)}</li>`).join('')}</ul>` : ''}
          <h5>Proposed replacement</h5><p>${esc(plan.from.replace(/-/g, ' '))} → ${esc(plan.to.replace(/-/g, ' '))}</p>
          ${operations(plan.changed)}<h5>Kept as written</h5>${operations(plan.kept)}
          <p>${esc(plan.question)}</p>${comparison ? washComparisonView(comparison) : ''}</details>`;
      }).join('')}</section>`;
  }

  function washComparisonView(comparison) {
    return `<h5>Wash route comparison</h5>
      <p>Retained material · ${esc(comparison.retainedMaterial || 'Unspecified')}. Source actions · ${comparison.sourceActions.length}.
        Pooling and redistribution boundaries to preserve · ${comparison.poolBoundaries.length}.</p>
      <table class='tbl'><thead><tr><th>Method</th><th>Execution</th><th>Evidence needed</th></tr></thead><tbody>
      ${comparison.routes.map(route => `<tr><th scope='row'>${esc(route.methodLabel)}<small>${esc(route.operation)}</small></th><td>${esc(route.executionLabel)}</td>
        <td><strong>${route.status === 'scope-pending' ? 'Scope review pending' : 'Evidence pending'}</strong>
          <ul>${route.missingEvidence.map(item => `<li>${esc(item)}</li>`).join('')}</ul></td></tr>`).join('')}
      </tbody></table>
      <div class='wash-comparison-files'>
        <p><button class='btn ghost' data-wash-comparison='${esc(comparison.proposalId)}'>Download private comparison</button></p>
        <label>Verify a saved comparison <input type='file' accept='.json,application/json' data-wash-replay='${esc(comparison.proposalId)}'></label>
        <output aria-live='polite'></output>
      </div>
      ${comparison.scopeReady ? `<details class='wash-observations'><summary>Matched run observations</summary>
        <p><button class='btn ghost' data-wash-observation-template='${esc(comparison.proposalId)}'>Download observation template</button></p>
        <label>Summarize observed runs <input type='file' accept='.json,application/json' data-wash-observations='${esc(comparison.proposalId)}'></label>
        <div data-wash-observation-summary aria-live='polite'></div></details>` : ''}`;
  }

  function washObservationView(summary) {
    const fmt = value => value === null ? 'Unavailable' : Number(value.toFixed(3)).toString();
    const rows = [
      ['Failed runs', 'failed_runs'], ['Outputs attempted', 'outputs_attempted'], ['QC-passing outputs', 'outputs_passing'],
      ['Runs with complete operator time', 'runs_with_operator_minutes'], ['Total operator minutes', 'operator_minutes'],
      ['Operator minutes per QC-passing output', 'operator_minutes_per_passing_output'],
      ['Median elapsed minutes', 'elapsed_minutes_median'], ['Total operating cost (GBP)', 'cost_gbp'],
      ['Cost per QC-passing output (GBP)', 'cost_gbp_per_passing_output'],
    ];
    return `<h5>Observed results</h5>
      <p>${esc(summary.matched_pairs)} matched pairs · ${esc(summary.inputs_per_run)} inputs per run · output unit ${esc(summary.output_unit)} · QC reference ${esc(summary.qc_ref)}. Qualification is a separate review.</p>
      <table class='tbl'><thead><tr><th>Measure</th><th>As written · manual</th><th>${esc(summary.candidate_label)}</th></tr></thead><tbody>
      ${rows.map(([label, key]) => `<tr><th scope='row'>${esc(label)}</th><td>${fmt(summary.manual[key])}</td><td>${fmt(summary.candidate[key])}</td></tr>`).join('')}
      </tbody></table>
      <p>Candidate minus manual operator minutes per passing output · ${fmt(summary.delta_minutes_per_passing_output)}.</p>
      ${summary.paired_delta ? `<p>Within-pair differences, median ${fmt(summary.paired_delta.median)}, range ${fmt(summary.paired_delta.min)} to ${fmt(summary.paired_delta.max)}
        (${esc(summary.paired_delta.count)} of ${esc(summary.matched_pairs)} matched pairs had a calculable difference).</p>` : ''}`;
  }

  function currentWashComparison(element, proposalId) {
    const id = element.closest('[data-workflow-card]')?.dataset.workflowCard;
    const p = ctx.profile();
    const workflow = p.workflows.find(w => w.id === id);
    const variant = workflow?.variants?.find(v => v.id === proposalId);
    if (!variant) return null;
    const model = buildBrowserAssessment(workflow, p.protocols, ctx.draftOverrides);
    return washComparison(model, variantPlan(model, variant), variant);
  }

  function reviewView(raw) {
    let r;
    try { r = reviewImport(raw); } catch (e) { return `<p class='bad'>${esc(e.message)}</p>`; }
    const p = r.provenance, st = r.steps, rd = r.reading;
    const yesNo = v => v === true ? 'yes' : v === false ? 'no' : 'not stated';
    return `<div class='review-card'>
      <ul class='flags'>${r.flags.map(f => `<li class='${f.level === 'stop' ? 'bad' : f.level === 'ok' ? 'ok' : 'warn'}'><strong>${esc(LEVEL[f.level])}:</strong> ${esc(f.text)}</li>`).join('')}</ul>
      <table class='tbl'><tbody>
        <tr><th scope='row'>Source</th><td>${esc(p.source)} ${esc(p.id)}${p.url ? ` · <a href='${esc(p.url)}' target='_blank' rel='noopener'>open</a>` : ''}</td></tr>
        <tr><th scope='row'>Version</th><td>${esc(p.version ?? '—')}${p.versionId != null ? ` (id ${esc(p.versionId)})` : ''}${p.versions != null ? ` of ${esc(p.versions)}` : ''} · locked: ${yesNo(p.locked)} · latest: ${yesNo(p.lastVersion)} · unpublished draft: ${yesNo(p.unpublishedDraft)}</td></tr>
        ${p.source === 'labstep' ? `<tr><th scope='row'>Source facts</th><td>${esc(labstepAsOf(p.capturedAt))}. Version and draft status are frozen at export; no live Labstep check was made.</td></tr>` : ''}
        <tr><th scope='row'>${p.source === 'labstep' ? 'Exported step hash' : 'Content hash'}</th><td><code>${esc(p.contentHash || 'none')}</code>${p.source === 'labstep' ? ' · ordered step GUIDs and text only' : ''}</td></tr>
        <tr><th scope='row'>Dates</th><td>version updated ${esc(p.versionUpdated || '—')} · imported ${esc(p.importedAt || '—')}</td></tr>
        <tr><th scope='row'>Steps</th><td>${st.count} · with a timer ${st.timers} · with inventory ${st.inventory} · with devices ${st.devices}${st.observed ? ' · observed step times attached' : ''}</td></tr>
        <tr><th scope='row'>Lines</th><td>${Object.entries(rd.lines).map(([k, n]) => `${n} ${esc(k)}`).join(' · ')} · ${rd.operations} operations</td></tr>
        <tr><th scope='row'>Timed steps</th><td>${rd.timed}, of which ${rd.noDuration.length} without a duration</td></tr>
        <tr><th scope='row'>Materials found</th><td>${esc(r.materials.join(', ') || 'none')}</td></tr>
      </tbody></table>
      ${qualityGatesView(rd.qcGates)}
      ${rd.omitted.length ? `<h4>Source lines without a reading (${rd.omitted.length} of ${rd.sourceLines} body lines)</h4><ul>${rd.omitted.map(x => `<li>${esc(x.line)} <small class='sub'>Step ${esc(x.position)} · ${esc(x.step)}</small></li>`).join('')}</ul>` : ''}
      ${rd.tableInstructions.length ? `<h4>Instructions read as table rows</h4><ul>${rd.tableInstructions.map(x => `<li>${esc(x.line)} <small class='sub'>Step ${esc(x.position)} · ${esc(x.step)}</small></li>`).join('')}</ul>` : ''}
      ${rd.quantities.length ? `<h4>Quantities to check</h4><ul>${rd.quantities.map(x => `<li>${esc(x.line)} <small class='sub'>${esc(x.step)} · ${esc(x.warnings.join(' '))}</small></li>`).join('')}</ul>` : ''}
      ${rd.source.length ? `<details><summary>Source readings (${rd.sourceLines} body lines)</summary>
        ${rd.source.map(s => `<h5>Step ${esc(s.position)} · ${esc(s.step)}</h5>
          ${s.inventoryWithoutAnchor.length ? `<p class='sub'>Inventory names absent from body text: ${esc(s.inventoryWithoutAnchor.join(', '))}</p>` : ''}
          ${s.rows.length ? `<table class='tbl'><thead><tr><th>Source line</th><th>Reading</th></tr></thead><tbody>
            ${s.rows.map(x => `<tr><td>${x.number}. ${esc(x.line)}</td><td>${x.readings.length
              ? x.readings.map(v => `<div>${esc(v.operation || v.type)}${v.branch ? ` · ${esc(v.branch)}` : ''}${v.line !== x.line ? ` · ${esc(v.line)}` : ''}</div>`).join('')
              : 'Unresolved'}</td></tr>`).join('')}
          </tbody></table>` : '<p class="sub">No body lines in this export.</p>'}`).join('')}
      </details>` : ''}
      ${rd.notUnderstood.length ? `<h4>Not understood (${rd.notUnderstood.length})</h4><ul>${rd.notUnderstood.map(x => `<li>${esc(x.line)} <small class='sub'>${esc(x.step)}</small></li>`).join('')}</ul>` : ''}
      ${rd.noDuration.length ? `<h4>Timed steps without a duration</h4><ul>${rd.noDuration.map(x => `<li>${esc(x.line)}</li>`).join('')}</ul>` : ''}
      ${r.physical ? lintView(r.physical, `Run by hand, robot-free, in ${r.physical.labware}${r.physical.labwareChosen ? ' (the labware its stated volumes fit best; the protocol does not say)' : ''}; a workflow card lints the labware you choose.`) : ''}
      <p class='sub'>Read-only. To change the reading, fix the protocol in its source and import the new version; per-protocol reviewed overrides apply when a workflow is built.</p>
    </div>`;
  }

  // Physical lint (#169): per step, what the wells could not do as the text
  // was read, the likely cause and a suggested reading. Read-only.
  function lintView(l, where) {
    const head = `<h4>Physical lint (${l.workloads.join(' and ')} samples)</h4>`;
    if (l.reagentsOnly) return `${head}<p class='sub'>No step touches a sample: this protocol prepares reagents in bulk, so there is no sample well to follow.</p>`;
    if (!l.items.length) return `${head}<p class='sub'>Every stated volume can be followed in the wells. ${esc(where)} This is not validation of the method.</p>`;
    return `${head}<p class='sub'>${l.impossible} impossible, ${l.questions} question${l.questions === 1 ? '' : 's'}. ${esc(where)} Each is about how the text reads, for the protocol owner to settle in the source; a clean lint is not validation of the method.</p>
      <table class='tbl lint'><thead><tr><th>Step</th><th>Line</th><th>What's wrong</th><th>Suggested reading</th></tr></thead><tbody>
      ${l.items.map(i => `<tr><td>${esc(i.step)}</td><td>${esc(i.line)}</td><td><span class='${i.severity === 'impossible' ? 'bad' : 'warn'}'>${esc(i.label)}</span>: ${esc(i.detail)}${i.at.length < l.workloads.length ? ` <small class='sub'>(at ${i.at.join(', ')})</small>` : ''}</td><td>${esc(i.reading)}</td></tr>`).join('')}
      </tbody></table>`;
  }

  const stale = (w, p) => w.parts.flatMap((part, index) => {
    const after = p.protocols.find(r => protocolKey(r) === partKey(part));
    return after && !matchesPin(part, after) ? [{part, index, after}] : [];
  });

  function repinView(state) {
    const version = raw => `${raw.version.number ?? 'unknown'} (ID ${raw.version.id})`;
    const step = (s, counterpart) => {
      if (!s) return '—';
      const {position, title, text, guid, ...inputs} = s;
      const extras = counterpart ? Object.keys(inputs).filter(k => canonicalJson(inputs[k]) !== canonicalJson(counterpart[k])) : [];
      const shown = Object.fromEntries(extras.map(k => [k, inputs[k]]));
      return `<strong>Step ${esc(position)}: ${esc(title)}</strong><pre>${esc(text)}</pre>
        ${extras.length ? `<details><summary>Changed step evidence</summary><pre>${esc(JSON.stringify(shown, null, 2))}</pre></details>` : ''}`;
    };
    const ready = !state.confirming && state.targets.every(t => t.before && !t.loading);
    return `<section class='card' aria-labelledby='repin-title'>
      <h4 id='repin-title'>Review changes for ${esc(state.name)}</h4>
      <p class='sub'>Review the exact snapshots before changing the workflow. Steps match first by GUID, then by title in order; a renamed step may appear as a removal and an addition.</p>
      ${state.targets.map((t, i) => `<div class='repin-source'>
        <h5>${esc(t.after.name)}: ${t.before ? `version ${esc(version(t.before))}` : `version ID ${esc(t.part.versionId)}`} → version ${esc(version(t.after))}</h5>
        ${t.loading ? '<p>Looking for the pinned snapshot…</p>' : t.before ? (() => {
          const rows = diffLabstepSteps(t.before, t.after);
          const observationsChanged = canonicalJson(t.before.observed) !== canonicalJson(t.after.observed);
          return `${observationsChanged ? '<p class="sub">The attached observed run summaries differ between these snapshots.</p>' : ''}${t.historical ? '<p class="warn">The saved historical snapshot does not have a verifiable step hash. Its stored text is shown as the baseline.</p>' : ''}
            ${!t.part.contentHash ? '<p class="sub">This older pin recorded only a version ID. The original hash was not recorded.</p>' : ''}
            ${rows.length ? `<table class='tbl repin-steps'><thead><tr><th>Before</th><th>After</th></tr></thead><tbody>
              ${rows.map(row => `<tr><td>${step(row.before, row.after)}</td><td>${step(row.after, row.before)}</td></tr>`).join('')}</tbody></table>` : '<p>No changes to step text, order or attached evidence.</p>'}`;
        })() : `<p class='warn'>The pinned snapshot is unavailable. Provide the original export to compare before re-pinning.</p><label>Original export<input type='file' data-repin-original='${i}' accept='.json,application/json'></label>`}
        ${t.error ? `<p class='bad'>${esc(t.error)}</p>` : ''}
      </div>`).join('')}
      <p><button class='btn' data-repin-confirm ${ready ? '' : 'disabled'}>Pin the compared version${state.targets.length > 1 ? 's' : ''}</button> <button class='link' data-repin-cancel>Cancel</button></p>
    </section>`;
  }
  async function compareWorkflow(w, p) {
    const targets = stale(w, p).map(t => ({...t, loading: true}));
    if (!targets.length) return;
    const state = comparison = {id: w.id, name: w.name, parts: JSON.stringify(w.parts), targets};
    draw();
    await Promise.all(targets.map(async t => {
      try {
        const local = p.protocolArchive.find(raw => matchesPin(t.part, raw));
        const fromLab = !local && t.after.lab && t.part.source === 'labstep' && t.part.versionId != null;
        const before = local || (fromLab ? (await api(`lab/protocols/${t.part.id}/versions/${t.part.versionId}`)).protocol : null);
        if (before && matchesPin(t.part, before)) {
          if (t.part.source === 'labstep') {
            if (before.content_hash) await verifyLabstepSnapshotHash(before);
            else t.historical = true;
          }
          t.before = before;
        }
      } catch (e) { if (e.status !== 404) t.error = e.message; }
      finally { t.loading = false; }
    }));
    if (comparison === state && el.onchange === change) draw();
  }
  function workflowCard(w, p) {
    let m = null, err = '';
    try { m = buildBrowserAssessment(w, p.protocols, ctx.draftOverrides); } catch (e) { err = e.message; }
    const needsDraft = workflowDrafts(w, p.protocols).length > 0;
    const repins = stale(w, p);
    const ops = m ? m.chunks.flatMap(c => c.actions).length : 0;
    return `<details class='card' data-workflow-card='${esc(w.id)}'><summary><strong>${esc(w.name)}</strong> · ${w.parts.length} protocol${w.parts.length > 1 ? 's' : ''} · ${m?.labware ? `${esc(m.labware.label)}${m.labware.assumed ? ' <span class=\'bad\'>(assumed)</span>' : ''}` : esc(w.format)} · ${err ? `<span class='bad'>${esc(err)}</span>` : `${ops} operations, ${m.review.length} line${m.review.length === 1 ? '' : 's'} not understood`}
      ${repins.length ? ` <button class='link' data-repin='${esc(w.id)}'>Review changes to the current version${repins.length > 1 ? 's' : ''}</button>` : ''}
      <button class='link' data-assess='${esc(w.id)}' ${repins.length ? 'disabled' : ''}>${needsDraft ? 'Assess with draft' : 'Assess'}</button> <button class='link' data-del-workflow='${esc(w.id)}'>Remove</button></summary>
      <p><label class='inline'>Samples are run in ${labwareSelect(`data-labware='${esc(w.id)}'`, w.labware && labwareOptions.some(l => l.id === w.labware) ? w.labware : '')}</label>${w.labware ? '' : ` <span class='sub'>Not chosen yet: assessed as ${esc(labwareOptions.find(l => l.id === labwareLegacy[w.format])?.label || w.format)}.</span>`}</p>
      ${m?.alternatives.length ? `<fieldset><legend>Protocol alternatives</legend>
        ${m.alternatives.map(alt => `<label>${esc(alt.step)}
          <select data-branch-workflow='${esc(w.id)}' data-branch-step='${esc(alt.chunkId)}' ${repins.length ? 'disabled' : ''}>
            <option value=''>${esc(alt.basis === 'workflow (this step)' ? 'Use the workflow or source default' : alt.basis === 'question' ? 'Unresolved. Choose an alternative.' : `Default: ${alt.chosen} (${alt.basis})`)}</option>
            ${alt.options.map(option => `<option value='${esc(option.name)}'${alt.basis === 'workflow (this step)' && option.name === alt.chosen ? ' selected' : ''}>${esc(option.name)}</option>`).join('')}
          </select>
        </label>`).join('')}
      </fieldset>` : ''}
      ${qualityGatesView(m?.qcGates)}
      ${sourcePinnedVariants(m)}
      ${m ? materialsView(m) : ''}
      ${m?.materialBoundaries?.length ? `<details><summary>Pooling and redistribution to review</summary>
        <p>Confirm the vessel identities, quantities and plate layout before estimating work across these steps.</p><ul>
        ${m.materialBoundaries.map(b => `<li>${esc(b.step)} · line ${b.bodyLine} ·
          ${esc(b.donor || 'Source unspecified')} → ${esc(b.recipient)}${b.conditional ? ' · conditional' : ''}</li>`).join('')}</ul></details>` : ''}
      ${m ? readingTable(m) : ''}
      ${m && !m.materialBoundaries?.length ? (() => { try { return lintView(lintModel(m), `Run by hand in ${m.labware?.label || m.format}.`); } catch (e) { return `<p class='bad'>${esc(e.message)}</p>`; } })() : ''}
    </details>`;
  }

  async function importFiles(files) {
    let added = 0;
    const failed = [];
    for (const f of files) {
      try {
        const raw = JSON.parse(await f.text());
        const list = Array.isArray(raw) ? raw : raw.protocols && raw.version === 1 ? raw.protocols : [raw];
        const snapshots = await verifyProtocolImports(list);
        // Read after verification so two uploads finishing out of order cannot
        // both compare against the same stale in-memory profile.
        const p = ctx.profile();
        ctx.update({...p, ...mergeProtocolImports(p, snapshots, {hosted: ctx.lab().protocols})}, {requireLocalSave: true});
        added += snapshots.length;
      } catch (e) { failed.push(`${f.name}: ${e.message}`); }
    }
    note = `${added} protocol${added === 1 ? '' : 's'} imported.${failed.length ? ` Not imported: ${failed.join('; ')}` : ''}`;
    if (el.onchange === change) draw();
  }
  // Drop files anywhere on the page.
  el.ondragover = ev => { if ([...(ev.dataTransfer?.types || [])].includes('Files')) { ev.preventDefault(); el.classList.add('dropping'); } };
  el.ondragleave = ev => { if (ev.target === el || !el.contains(ev.relatedTarget)) el.classList.remove('dropping'); };
  el.ondrop = ev => { ev.preventDefault(); el.classList.remove('dropping'); if (ev.dataTransfer?.files?.length) importFiles([...ev.dataTransfer.files]); };

  // What the protocol moves and how each action was read (#61): check this
  // before relying on the assessment.
  const CONTACT = {free: 'Dispensed without touching the well (tips can be shared)', contact: 'Touches the sample (fresh tip per sample)', removal: 'Takes liquid off the sample (its own tip)', 'removal+add': 'Removes, then adds', wash: 'Wash: removes what is in the well, then adds and removes (the last removal left to the next line when it states one)', 'sample-move': 'Moves the sample itself (fresh tip)', mix: 'Mixes in the well', batch: 'Made once per batch'};
  const CHECK = {material: 'What is added?', 'cold-subject': 'What must be kept cold?', combined: 'Needs two conditions at once', 'tip-reuse': 'Same tip or fresh?'};
  function materialsView(m) {
    if (!m.materials?.length) return '';
    const cond = c => [c.temperatureC != null ? `${c.temperatureC} °C` : '', c.agitation || '', c.onMagnet === true ? 'on magnet' : c.onMagnet === false ? 'off magnet' : '', c.minutes ? `${c.minutes} min` : ''].filter(Boolean).join(', ');
    const label = id => m.materials.find(x => x.class === id)?.label || id;
    const byType = {};
    for (const c of m.checks) (byType[c.type] = byType[c.type] || []).push(c);
    const actions = m.chunks.flatMap(ch => ch.actions.map(a => ({ch, a}))).filter(({a}) => a.contact || a.materials?.length || a.conditions?.together);
    return `<h4>Materials and how they must be handled</h4>
      <table class='tbl'><thead><tr><th>Material</th><th>Properties</th><th>Needs</th><th>Kept cold in the protocol</th></tr></thead><tbody>
      ${m.materials.map(x => `<tr><td>${esc(x.label)}</td><td>${x.properties.map(p => `${esc(p.label)} <small class='sub'>(${esc(p.basis)})</small>`).join('<br>') || '—'}</td><td>${[...new Set(x.properties.flatMap(p => p.requires))].map(esc).join('<br>') || '—'}</td><td>${x.keepColdStated.length ? `${x.keepColdStated.length} line${x.keepColdStated.length === 1 ? '' : 's'}` : '—'}</td></tr>`).join('')}
      </tbody></table>
      ${m.checks.length ? `<h4>Check how these were read (${m.checks.length})</h4><ul>${Object.entries(byType).map(([t, list]) => `<li><strong>${esc(CHECK[t] || t)}</strong> (${list.length}): ${esc(list[0].text)}<ul>${list.map(c => `<li>${esc(c.line)}</li>`).join('')}</ul></li>`).join('')}</ul>` : `<p class='sub'>Nothing in the reading needs checking.</p>`}
      <details><summary>Show each action: what it moves, what is in the well, conditions and tip contact</summary><table class='tbl reading'><thead><tr><th>Action</th><th>Moves</th><th>In the well</th><th>Conditions</th><th>Tip</th></tr></thead><tbody>
      ${actions.map(({ch, a}, i) => `${i === 0 || actions[i - 1].ch !== ch ? `<tr class='step'><td colspan='5'>${esc(ch.name)}</td></tr>` : ''}<tr><td>${esc(a.line)}</td><td>${a.materials.map(x => `${esc(label(x.class))}${x.basis !== 'text' ? ` <small class='sub'>(${esc(x.basis)})</small>` : ''}`).join(', ') || '—'}</td><td>${a.well.map(id => esc(label(id))).join(', ') || '—'}</td><td>${esc(cond(a.conditions))}${a.conditions.together && a.conditions.temperatureC < 15 ? ' <strong>(at the same time)</strong>' : ''}</td><td>${esc(CONTACT[a.contact] || '—')}${a.tipStated ? `<small class='sub'> Protocol says: ${esc(Object.entries(a.tipStated).filter(([, v]) => v).map(([k]) => ({reuse: 'same tips', fresh: 'fresh tips', lowRetention: 'low-retention tips', wideBore: 'cut or wide-bore tips'}[k])).join(', '))}</small>` : ''}${a.handling?.length ? `<small class='sub'> Needs: ${esc(a.handling.join('; '))}</small>` : ''}</td></tr>`).join('')}
      </tbody></table></details>`;
  }

  const TYPE = {operation: 'Work', component: 'Ingredient of a mix', programme: 'Thermocycler programme', note: 'Note', header: 'Heading', input: 'Value to fill in', table: 'Table cell', optional: 'Optional (set aside)', unknown: 'Not understood', branch: 'Alternative (counted)', alternative: 'Alternative not counted', definition: 'Defines later steps (e.g. what a wash is)'};
  function readingTable(m) {
    const counts = {};
    for (const l of m.lines) counts[l.type] = (counts[l.type] || 0) + 1;
    const summary = Object.entries(TYPE).filter(([k]) => counts[k]).map(([k, label]) => `${counts[k]} ${label.toLowerCase()}`).join(' · ');
    let step = '';
    return `<p class='sub'>How each line was read: ${esc(summary)}.${m.review.length ? ` <strong>${m.review.length} not understood</strong> and not counted.` : ''}</p>
      <details><summary>Show every line</summary><table class='tbl reading'><thead><tr><th>Line</th><th>Read as</th></tr></thead><tbody>
      ${m.lines.filter(l => l.type !== 'table').map(l => { const head = l.step !== step ? `<tr class='step'><td colspan='2'>${esc(step = l.step)}</td></tr>` : ''; return `${head}<tr class='${l.type}'><td>${esc(l.line)}</td><td>${esc(TYPE[l.type] || l.type)}${l.operation ? `<small>${esc(l.operation.replace(/-/g, ' '))}</small>` : ''}</td></tr>`; }).join('')}
      </tbody></table></details>`;
  }

  const change = el.onchange = async ev => {
    const t = ev.target;
    if (t.dataset.washObservations && t.files.length) {
      const file = t.files[0];
      const output = t.closest('.wash-observations').querySelector('[data-wash-observation-summary]');
      const token = {};
      pendingWashReplay.set(t, token);
      t.value = '';
      output.replaceChildren();
      try {
        if (file.size > 2 * 1024 * 1024) throw Error('The observation file exceeds 2 MiB.');
        const observations = JSON.parse(await file.text());
        if (pendingWashReplay.get(t) !== token || !output.isConnected || el.onchange !== change) return;
        const comparison = currentWashComparison(t,t.dataset.washObservations);
        output.innerHTML = washObservationView(summarizeWashObservations(comparison,observations));
      } catch (error) {
        if (pendingWashReplay.get(t) === token && output.isConnected && el.onchange === change) output.textContent = error.message;
      }
      return;
    }
    if (t.dataset.washReplay && t.files.length) {
      const file = t.files[0];
      const output = t.closest('.wash-comparison-files').querySelector('output');
      const token = {};
      pendingWashReplay.set(t, token);
      t.value = '';
      let verdict;
      try {
        if (file.size > 2 * 1024 * 1024) throw Error();
        const saved = JSON.parse(await file.text());
        if (!output.isConnected || el.onchange !== change) return;
        verdict = verifyWashComparison(saved, currentWashComparison(t, t.dataset.washReplay));
      } catch { verdict = {matches:false, reason:'Could not read the saved comparison against the current workflow.'}; }
      if (pendingWashReplay.get(t) === token && output.isConnected && el.onchange === change) {
        output.textContent = verdict.matches ? 'Saved comparison matches this workflow and its current assessment.' : verdict.reason;
      }
      return;
    }
    if (t.id === 'pr-files') { await importFiles([...t.files]); return; }
    if (t.dataset.repinOriginal != null && comparison && t.files[0]) {
      const state = comparison, target = state.targets[Number(t.dataset.repinOriginal)];
      if (!target) return;
      try {
        const raw = JSON.parse(await t.files[0].text());
        if (target.part.source === 'labstep') {
          checkLabstepVersion(raw);
          await verifyLabstepSnapshotHash(raw);
        }
        if (!matchesPin(target.part, raw)) throw Error('This file is not the workflow’s pinned snapshot.');
        target.before = raw;
        target.error = null;
      } catch (e) { target.error = e.message; }
      if (comparison === state && el.onchange === change) draw();
      return;
    }
    if (t.dataset.branchWorkflow) {
      const p = ctx.profile();
      const w = p.workflows.find(candidate => candidate.id === t.dataset.branchWorkflow);
      if (!w || stale(w, p).length) return draw();
      try {
        const model = buildBrowserAssessment(w, p.protocols, ctx.draftOverrides);
        const alternative = model.alternatives.find(alt => alt.chunkId === t.dataset.branchStep);
        if (!alternative || (t.value && !alternative.options.some(option => option.name === t.value))) return draw();
        const branches = {...w.branches};
        if (t.value) branches[alternative.chunkId] = t.value;
        else delete branches[alternative.chunkId];
        const workflows = p.workflows.map(candidate => candidate.id === w.id ? {...candidate, branches} : candidate);
        ctx.update({...p, workflows}, {requireLocalSave: true});
        note = t.value ? `Selected “${t.value}” for ${alternative.step}.` : `Restored default selection for ${alternative.step}.`;
      } catch (e) { note = e.message; }
      draw();
      const card = el.querySelector(`[data-workflow-card="${CSS.escape(w.id)}"]`);
      if (card) card.open = true;
      return;
    }
    if (t.dataset.labware && t.value) { const p = ctx.profile(); const w = p.workflows.find(x => x.id === t.dataset.labware); const l = labwareOptions.find(x => x.id === t.value); if (w && l) { w.labware = l.id; w.format = l.format; delete w.plateSize; ctx.update(p); note = `“${w.name}” now runs in ${l.label}s.`; draw(); } return; }
    if (t.dataset.pick) { picked = t.checked ? [...picked.filter(k => k !== t.dataset.pick), t.dataset.pick] : picked.filter(k => k !== t.dataset.pick); draw(); }
  };
  el.onsubmit = ev => {
    ev.preventDefault();
    const p = ctx.profile();
    if (ev.target.id === 'pr-paste') {
      const s = snapshotFromText(el.querySelector('#pr-name').value.trim(), el.querySelector('#pr-text').value, el.querySelector('#pr-url').value.trim());
      if (!s.steps.length) { note = 'No steps found in the pasted text.'; return draw(); }
      p.protocols = p.protocols.filter(x => keyOf(normaliseSnapshot(x)) !== keyOf(normaliseSnapshot(s)));
      p.protocols.push(s);
      ctx.update(p); note = `Added “${s.name}” with ${s.steps.length} steps.`; draw();
    }
    if (ev.target.id === 'wf-new' && picked.length) {
      const selected = picked.map(k => p.protocols.find(raw => protocolKey(raw) === k));
      if (selected.some(raw => !raw)) { note = 'A selected protocol is no longer available. Select the protocols again.'; return draw(); }
      const parts = selected.map(workflowPin);
      if (parts.some(part => part.source === 'labstep' && part.versionId == null)) {
        note = 'This older Labstep export has no version ID. Import an exact export to create a pinned workflow.';
        return draw();
      }
      const labware = labwareOptions.find(l => l.id === el.querySelector('#wf-labware').value);
      if (!labware) { note = 'Choose the labware the samples are run in.'; return draw(); }
      p.workflows.push({id: uid('wf'), name: el.querySelector('#wf-name').value.trim() || 'Workflow', parts, labware: labware.id, format: labware.format, defaultWorkload: Number(el.querySelector('#wf-batch').value) || 96, workloadLabel: el.querySelector('#wf-unit').value.trim() || 'samples'});
      ctx.update(p); picked = []; note = 'Workflow created. Open “Decide what to automate” to assess it.'; draw();
    }
  };
  el.onclick = async ev => {
    const b = ev.target.closest('button[data-del-protocol],button[data-del-workflow],button[data-assess],button[data-review],button[data-repin],button[data-repin-confirm],button[data-repin-cancel],button[data-wash-comparison],button[data-wash-observation-template]');
    if (!b) return;
    ev.preventDefault();
    let p = ctx.profile();
    if (b.dataset.washComparison || b.dataset.washObservationTemplate) {
      try {
        const isTemplate = !!b.dataset.washObservationTemplate;
        const comparison = currentWashComparison(b, b.dataset.washObservationTemplate ?? b.dataset.washComparison);
        if (comparison) download(isTemplate ? 'private-wash-observations.json' : 'private-wash-comparison.json',
          JSON.stringify(isTemplate ? washObservationTemplate(comparison) : comparison, null, 2));
      } catch (e) { note = e.message; draw(); }
      return;
    }
    if (b.dataset.assess) {
      const workflow = p.workflows.find(w => w.id === b.dataset.assess);
      if (!workflow || stale(workflow, p).length) return;
      const drafts = workflowDrafts(workflow, p.protocols);
      if (drafts.length) {
        const signature = draftSelection(drafts);
        if (ctx.draftOverrides.get(workflow.id) !== signature) {
          const versions = drafts.map(raw => `${raw.name} (version ID ${raw.version.id})`).join(', ');
          if (!confirm(`Assess with these draft or unlocked snapshots for this page session? ${versions}.`)) return;
          ctx.draftOverrides.set(workflow.id, signature);
        }
      }
      let model;
      try { model = buildBrowserAssessment(workflow, p.protocols, ctx.draftOverrides); }
      catch (e) { note = e.message; return draw(); }
      const blocker = protocolDecisionBlocker(model);
      if (blocker) {
        note = blocker;
        draw();
        const card = el.querySelector(`[data-workflow-card="${CSS.escape(workflow.id)}"]`);
        if (card) card.open = true;
        return;
      }
      ctx.go('decide', {workflow: workflow.id});
      return;
    }
    if (b.dataset.repinCancel != null) { comparison = null; return draw(); }
    if (b.dataset.repinConfirm != null && comparison) {
      const state = comparison, {id, parts, targets} = state;
      if (state.confirming) return;
      // A colleague's upload may have moved the hosted target without a
      // navigation event. Check it again before changing the workflow pin.
      if (targets.some(t => t.after.lab)) {
        state.confirming = true;
        draw();
        try { await ctx.refreshLabProtocols(); }
        catch (e) {
          if (comparison !== state || el.onchange !== change) return;
          state.confirming = false;
          note = 'Could not check the current lab version. Re-pinning was not saved. ' + e.message;
          return draw();
        }
        if (comparison !== state || el.onchange !== change) return;
        state.confirming = false;
        p = ctx.profile();
      }
      const workflow = p.workflows.find(w => w.id === id);
      const now = workflow ? stale(workflow, p) : [];
      if (!targets.every(t => t.before && !t.loading) || !workflow || JSON.stringify(workflow.parts) !== parts ||
          now.length !== targets.length || targets.some((t, i) => t.index !== now[i].index ||
            canonicalJson(t.after) !== canonicalJson(now[i].after))) {
        comparison = null;
        note = 'A snapshot or pin changed after the comparison. Review the changes again before re-pinning.';
        return draw();
      }
      const replacements = new Map(targets.map(t => [t.index, workflowPin(t.after)]));
      workflow.parts = workflow.parts.map((part, i) => replacements.get(i) || part);
      const branches = {...workflow.branches};
      let cleared = false;
      for (const target of targets) {
        const old = normaliseSnapshot(target.before);
        for (const step of old.steps) {
          const id = `${old.source}-${old.id}-${step.position}`;
          for (const key of Object.keys(branches)) if (key === id || key.startsWith(id + ':')) {
            delete branches[key];
            cleared = true;
          }
        }
      }
      if (cleared) workflow.branches = branches;
      try { ctx.update(p, {requireLocalSave: true}); }
      catch (e) { note = e.message; return draw(); }
      ctx.draftOverrides.delete(id);
      comparison = null;
      note = cleared ? 'Workflow pinned. Choose alternatives again for the updated steps.' : 'Workflow pinned to the compared versions. Assess it again.';
      return draw();
    }
    if (b.dataset.review) { reviewing = reviewing === b.dataset.review ? null : b.dataset.review; draw(); return; }
    if (b.dataset.delProtocol) {
      const k = b.dataset.delProtocol;
      const raw = p.protocols.find(x => !x.lab && protocolKey(x) === k);
      if (!raw) return;
      const used = p.workflows.filter(w => w.parts.some(x => partKey(x) === k));
      const copies = p.protocolArchive.filter(x => protocolKey(x) === k).length;
      const extras = [
        copies ? `${copies} archived cop${copies === 1 ? 'y' : 'ies'}` : '',
        used.length ? `${used.length} dependent workflow${used.length === 1 ? '' : 's'}` : '',
      ].filter(Boolean);
      if (extras.length && !confirm(`Remove “${raw.name}” from this browser along with ${extras.join(' and ')}?`)) return;
      p.protocols = p.protocols.filter(x => x !== raw);
      p.protocolArchive = p.protocolArchive.filter(x => protocolKey(x) !== k);
      p.workflows = p.workflows.filter(w => !used.includes(w));
      try { ctx.update(p, {requireLocalSave: true}); }
      catch (e) { note = e.message; return draw(); }
      for (const w of used) ctx.draftOverrides.delete(w.id);
      if (used.some(w => w.id === comparison?.id)) comparison = null;
      note = `Removed “${raw.name}” from this browser${copies ? ' and deleted its archived copies' : ''}.`;
      return draw();
    }
    if (b.dataset.delWorkflow) {
      p.workflows = p.workflows.filter(w => w.id !== b.dataset.delWorkflow);
      ctx.draftOverrides.delete(b.dataset.delWorkflow);
    }
    if (b.dataset.repin) {
      const workflow = p.workflows.find(w => w.id === b.dataset.repin);
      if (workflow) void compareWorkflow(workflow, p);
      return;
    }
    ctx.update(p); draw();
  };
  draw();
}
