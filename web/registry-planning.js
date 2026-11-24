import {handlers, installedHeadOptions, labwareOptions, modelOptions} from '../lib/work.js';
import {canonicalJson} from '../lib/source-provenance.js';
import {matchesPin} from './pins.js';
import {pin, nameOf} from './registry-form.js';
import {download, esc} from './store.js';

const pick = (value, fields) => Object.fromEntries(fields.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
const replaySchema = 'planner/registry-planning-replay/1';
const scenarioFields = ['expected_head', 'configuration', 'decision', 'planner_model_id', 'head_hypothesis', 'module_hypotheses'];
function protocolInput(workflow, raws, review, block) {
  const snapshots = workflow.parts.map(part => {
    if (part.versionId == null) throw Error('Choose a workflow with exact source version pins.');
    const raw = raws.find(item => matchesPin(part, item));
    if (!raw) throw Error('The workflow’s pinned source is unavailable.');
    const {lab, ...snapshot} = raw;
    const {created_at, ...version} = snapshot.version;
    const steps = snapshot.steps.map(({section, ...step}) => step);
    return {...snapshot, version, steps};
  });
  return {workflow: {...pick(workflow, ['id', 'name', 'parts', 'format', 'labware', 'defaultWorkload', 'workloadLabel', 'branches']),
    ...(block ? {block} : {})}, snapshots, review: {status: 'reviewed_by_caller', evidence_id: review}};
}

function replayInput(saved, profile, sourcePin) {
  if (saved?.schema !== replaySchema || !saved.workflow || !saved.scenario ||
      typeof saved.review_reference !== 'string' || typeof saved.binding_sha256 !== 'string' ||
      !/^sha256:[0-9a-f]{64}$/.test(saved.binding_sha256)) throw Error('Choose a private Registry replay file.');
  if (canonicalJson(saved.scenario.expected_head) !== canonicalJson(sourcePin)) {
    throw Error('The replay belongs to a different installation revision. Open that report or assess the current revision.');
  }
  const workflow = profile.workflows.find(item => item.id === saved.workflow.id);
  if (!workflow) throw Error('The saved workflow is unavailable. Open a profile containing the pinned workflow and sources.');
  const protocol = protocolInput(workflow, profile.protocols, saved.review_reference, saved.workflow.block);
  if (canonicalJson(protocol.workflow) !== canonicalJson(saved.workflow)) {
    throw Error('The workflow source pins or choices changed. Review the workflow and run a fresh private comparison.');
  }
  return {...pick(saved.scenario,scenarioFields), protocol, replay_digest:saved.binding_sha256};
}

function blockControls(host, form, workflow, raws) {
  const choices = workflow.parts.map(part => ({part, raw: raws.find(item => matchesPin(part, item))}))
    .filter(item => item.part.versionId != null && item.raw?.steps?.length);
  host.innerHTML = `<summary>Choose a protocol block</summary><label>Source for the block
    <select name="block_source"><option value="">Whole workflow</option>
      ${choices.map(({raw}, index) => `<option value="${index}">${esc(raw.name)}</option>`).join('')}
    </select></label><div data-block-input></div>`;
  const source = form.elements.block_source, input = host.querySelector('[data-block-input]');
  const show = () => {
    const chosen = source.value === '' ? null : choices[Number(source.value)];
    if (!chosen) { input.textContent = ''; return; }
    const options = chosen.raw.steps.map(step => `<option value="${esc(step.position)}">${esc(step.position)} · ${esc(step.title)}</option>`).join('');
    input.innerHTML = `<label>First step <select name="first_step">${options}</select></label>
      <label>Last step <select name="last_step">${options}</select></label>
      <label>Starting vessel <select name="input_labware" required><option value="">Choose labware</option>
        ${labwareOptions.map(item => `<option value="${esc(item.id)}" ${item.id === workflow.labware ? 'selected' : ''}>${esc(item.label)}</option>`).join('')}
      </select></label>
      <label>Starting volume per vessel (µL) <input type="number" name="input_volume" min="0" step="any"></label>
      <label>Input evidence reference <input name="input_evidence" maxlength="256"></label>
      <p>Leave the starting volume empty if it is unknown. A numeric comparison needs its volume and evidence reference.</p>`;
  };
  source.onchange = show;
  return () => {
    const chosen = source.value === '' ? null : choices[Number(source.value)];
    if (!chosen) return null;
    const {source: type, id, versionId} = chosen.part;
    const volume = form.elements.input_volume.value;
    return {source: type, id, versionId, from: Number(form.elements.first_step.value), through: Number(form.elements.last_step.value),
      input: {labware: form.elements.input_labware.value, volumeUl: volume === '' ? null : Number(volume),
        evidence: form.elements.input_evidence.value.trim() || null}};
  };
}

function workTable(rows) {
  return `<table class="tbl"><thead><tr><th>Action</th><th>Assignment</th><th>Equipment</th><th>Modeled liquid per vessel</th></tr></thead><tbody>
    ${rows.map(row => `<tr><td>${esc(row.label)}${row.reason ? `<div class="sub">${esc(row.reason)}</div>` : ''}</td>
      <td>${esc(row.assignment.replaceAll('_', ' '))}${row.fraction ? `<div class="sub">${esc(row.fraction.kind)} · ${esc(row.fraction.disposition)}</div>` : ''}</td><td>${esc([
        row.module || row.device, row.head, row.tip_uL == null ? null : row.tip_uL + ' µL tip',
        row.handoff ? row.handoff.from + ' → ' + row.handoff.to : null,
      ].filter(Boolean).join(' · ') || '—')}</td>
      <td>${row.balance ? `${esc(row.balance.before_uL ?? 'unknown')} → ${esc(row.balance.after_uL ?? 'unknown')} µL` : '—'}
        ${row.outputs?.length ? `<div class="sub">Stated destinations</div><ul>${row.outputs.map(output => `<li>${esc(output.label)} · ${esc(output.volumeUl)} µL · ${esc(output.vessel)}</li>`).join('')}</ul>` : ''}</td></tr>`).join('')}
    </tbody></table>`;
}

function transportTable(review) {
  if (!review?.directed_links.length) return '';
  const minutes = item => item.timing_basis === 'included_in_setup' ? 'Included in setup'
    : item.planned_operator_minutes ? `${item.planned_operator_minutes.lo}–${item.planned_operator_minutes.hi} min` : 'Unknown';
  return `<details><summary>Station handoffs to review</summary>
    <p>Match the modeled endpoints to physical positions and confirm the labware and carrier count per transition.</p>
    <table class="tbl"><thead><tr><th>Directed handoff</th><th>Modeled transitions</th><th>Operator time estimate</th><th>Evidence needed</th></tr></thead><tbody>
    ${review.directed_links.map(link => `<tr><th scope="row">${esc(link.from.label)} → ${esc(link.to.label)}
      ${link.phase === 'initial_loading' ? '<div class="sub">Initial loading</div>' : ''}</th>
      <td>${esc(link.occurrences)} · ${esc(link.modeled_mover)}</td><td>${esc(minutes(link))}</td>
      <td>${link.scope === 'on_deck' ? 'Check the gripper, carrier, deck positions and clearance for this move.'
        : 'Check both stations, the transfer interface, exact labware and how an operator recovers a failed handoff.'}</td></tr>`).join('')}
    </tbody></table></details>`;
}

export function mountRegistryPlanning(host, {row, ctx, send, loadTargets, live, unavailable}) {
  const sourcePin = pin(row.record);
  const workflows = ctx.profile().workflows;
  host.innerHTML = `<summary>Compare a workflow on this installation</summary>
    <p>Use the exact Registry revision for a private comparison. The planner model and fitted channels below are scenario assumptions. Booking and transport reach remain unverified.</p>
    ${workflows.length ? `<form>
      <label>Workflow <select name="workflow">${workflows.map(w => `<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('')}</select></label>
      <label>Samples <input name="workload" type="number" min="1" max="192" required value="${Math.min(workflows[0].defaultWorkload, 192)}"></label>
      <details data-block-choice></details>
      <label>Protocol review reference <input name="review" required maxlength="256"></label>
      <label>Registry configuration <select name="configuration"><option value="">No configuration selected</option></select></label>
      <button type="button" data-more class="link">Find configurations</button>
      <label>Catalogue model for comparison <select name="model" required><option value="">Choose a model</option>
      ${handlers.map(h => `<option value="${esc(h.id)}">${esc(h.name)}</option>`).join('')}</select></label>
      <div data-heads></div>
      <div data-module-mappings></div>
      <button type="submit" class="btn">Compare privately</button>
    </form><label>Reopen a private comparison <input type="file" accept=".json,application/json" data-replay-file></label>
    <div data-result aria-live="polite"></div>` : '<p>Create a pinned workflow in Protocols to compare it here.</p>'}`;
  if (!workflows.length) return;
  const form = host.querySelector('form'), result = host.querySelector('[data-result]');
  const configurations = new Map();
  const blockChoice = form.querySelector('[data-block-choice]');
  let readBlock = blockControls(blockChoice, form, workflows[0], ctx.profile().protocols);
  let cursor = null, last = null, busy = false;
  const replay = host.querySelector('[data-replay-file]');
  const clear = () => { last = null; result.textContent = ''; };
  const problem = error => { if (live(host) && !unavailable(error)) result.textContent = error.message; };
  const showModuleMappings = () => {
    const model = handlers.find(h => h.id === form.elements.model.value);
    const items = configurations.get(form.elements.configuration.value)?.modules || [];
    const options = model ? modelOptions(model) : [];
    form.querySelector('[data-module-mappings]').innerHTML = items.length && options.length ? `<fieldset>
      <legend>Map reported modules to planner options</legend>
      <p>Map a report only when it refers to the same module. Mapped absences and conflicts exclude the option from this scenario.</p>
      ${items.map(({module_id,state}) => `<label>${esc(module_id)} · ${esc(state.replaceAll('_', ' '))}
        <select data-inventory-module="${esc(module_id)}"><option value="">Leave unmapped</option>
          ${options.map(option => `<option value="${esc(option.key)}">${esc(option.name)}</option>`).join('')}
        </select></label>`).join('')}</fieldset>` : '';
  };
  const more = form.querySelector('[data-more]');
  more.onclick = async () => {
    more.disabled = true;
    try {
      const {records, next_after} = await loadTargets(cursor);
      if (!live(host)) return;
      const select = form.elements.configuration;
      for (const target of records) {
        const w = target.record, r = w.record;
        if (r.record_type !== 'configuration' || r.installation.revision_id !== sourcePin.revision_id
            || r.installation.content_digest !== sourcePin.content_digest || target.evidence_status !== 'current') continue;
        configurations.set(w.revision_id, {pin:pin(w), modules:r.fitted_modules?.items || []});
        select.add(new Option(nameOf(w) + ' · ' + w.revision_id, w.revision_id));
      }
      cursor = next_after;
      more.hidden = !cursor;
      more.textContent = 'Find more configurations';
    } catch (error) { problem(error); }
    finally { more.disabled = false; }
  };
  form.onchange = event => {
    clear();
    if (event.target.name === 'workflow') {
      const w = workflows.find(item => item.id === form.elements.workflow.value);
      form.elements.workload.value = Math.min(w.defaultWorkload, 192);
      readBlock = blockControls(blockChoice, form, w, ctx.profile().protocols);
    }
    if (event.target.name === 'configuration' || event.target.name === 'model') showModuleMappings();
    if (event.target.name !== 'model') return;
    const handler = handlers.find(h => h.id === form.elements.model.value);
    const heads = handler ? installedHeadOptions(handler) : [];
    form.querySelector('[data-heads]').innerHTML = heads.length ? `<fieldset><legend>Reported fitted channels</legend>
      ${heads.map(head => `<label>${esc(head.label)}
        <input type="number" data-head="${esc(head.id)}" min="${head.independent ? 1 : head.channels}" max="${head.channels}" step="1">
      </label>`).join('')}<p>Leave all counts empty when the fitted heads are unknown.</p></fieldset>` : '';
  };
  const run = async (readInput, fromReplay = false) => {
    if (busy) return;
    busy = true;
    clear();
    const submit = form.querySelector('[type="submit"]');
    const controls = [...form.elements,replay].filter(control => !control.disabled);
    controls.forEach(control => { control.disabled = true; });
    submit.textContent = 'Comparing…';
    try {
      const input = await readInput();
      if (!live(host)) return;
      const output = await send(input);
      if (!live(host)) return;
      last = {output,input};
      const decision = output.assessment.decision;
      result.innerHTML = `<h4>Private comparison</h4>
        ${fromReplay ? '<p>Saved comparison verified against the current workflow, Registry evidence and evaluator.</p>' : ''}
        <p>Installation revision <code>${esc(output.binding.installation.revision_id)}</code>
        ${output.binding.configuration ? `· configuration <code>${esc(output.binding.configuration.revision_id)}</code>` : '· configuration unknown'}</p>
        <p>Registry report dated ${esc(output.binding.dates.installation.observed_at)}.</p>
        ${decision.block ? `<p>Source steps ${esc(decision.block.from)}–${esc(decision.block.through)} ·
          starting volume ${esc(decision.block.input.volumeUl)} µL per vessel in ${esc(decision.labware?.label)} ·
          input evidence ${esc(decision.block.input.evidence)}</p>` : ''}
        <p>${decision.recommended ? `Provisional route · ${esc(decision.recommended.route)} · ${esc(decision.recommended.head_id)}` :
          'No provisional route for the chosen inputs.'}</p>
        ${output.binding.modules.length ? `<h5>Reported inventory</h5><ul>${output.binding.modules.map(m => `<li>${esc(m.id)} · ${esc(m.status.replaceAll('_', ' '))}</li>`).join('')}</ul>` : ''}
        ${output.assumptions.module_mappings?.length ? `<h5>Module mappings for this scenario</h5><ul>
          ${output.assumptions.module_mappings.map(m => `<li>${esc(m.option_label)} · ${esc(m.status.replaceAll('_', ' '))} ·
            ${m.effect === 'excluded' ? 'excluded' : 'provisional'}. Reports ${esc(m.reports.map(report => report.module_id).join(', '))}</li>`).join('')}</ul>` : ''}
        ${output.assessment.work_map.proposed ? `<details><summary>Proposed work by person and device</summary>${workTable(output.assessment.work_map.proposed)}</details>` : ''}
        ${transportTable(output.assessment.work_map.transport_review)}
        <details><summary>Manual baseline</summary>${workTable(output.assessment.work_map.baseline)}</details>
        <details><summary>Assessment and exact source pins</summary><pre>${esc(JSON.stringify(output.assessment, null, 2))}</pre></details>
        <button type="button" data-download class="link">Download private result</button>
        <button type="button" data-replay-download class="link">Download replay file</button>`;
      result.querySelector('[data-download]').onclick = () => {
        if (last && live(host)) download('private-registry-comparison.json', JSON.stringify(last.output, null, 2));
      };
      result.querySelector('[data-replay-download]').onclick = () => {
        if (!last || !live(host)) return;
        const packet = {schema:replaySchema, binding_sha256:last.output.binding_sha256,
          scenario:pick(last.input,scenarioFields), workflow:last.input.protocol.workflow,
          review_reference:last.input.protocol.review.evidence_id};
        download('private-registry-replay.json',JSON.stringify(packet,null,2));
      };
    } catch (error) { problem(error); }
    finally {
      controls.forEach(control => { control.disabled = false; });
      submit.textContent = 'Compare privately';
      busy = false;
    }
  };
  form.onsubmit = event => {
    event.preventDefault();
    return run(() => {
      const profile = ctx.profile(), workflow = profile.workflows.find(item => item.id === form.elements.workflow.value);
      if (!workflow) throw Error('The selected workflow is no longer available.');
      const heads = [...form.querySelectorAll('[data-head]')].filter(input => input.value)
        .map(input => ({id: input.dataset.head, channels: Number(input.value)}));
      const mappings = [...form.querySelectorAll('[data-inventory-module]')].filter(input => input.value)
        .map(input => ({module_id:input.dataset.inventoryModule, option_key:input.value}));
      const block = readBlock();
      if (block?.input.volumeUl === null) throw Error('Starting volume is unknown. The selected block has no numeric estimate.');
      if (block && !block.input.evidence) throw Error('Enter the evidence reference for the starting volume.');
      return {expected_head:sourcePin, configuration:configurations.get(form.elements.configuration.value)?.pin ?? null,
        protocol:protocolInput(workflow, profile.protocols, form.elements.review.value.trim(), block),
        decision:{workload:Number(form.elements.workload.value)}, planner_model_id:form.elements.model.value,
        head_hypothesis:heads.length ? heads : null,
        ...(mappings.length ? {module_hypotheses:mappings} : {})};
    });
  };
  replay.onchange = () => {
    const file = replay.files[0];
    replay.value = '';
    if (!file) return;
    return run(async () => {
      if (file.size > 128 * 1024) throw Error('The replay file exceeds 128 KiB.');
      return replayInput(JSON.parse(await file.text()),ctx.profile(),sourcePin);
    }, true);
  };
}
