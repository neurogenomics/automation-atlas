// Portfolio (#89): several groups' workflows against candidate setups chosen
// from the catalogue. Each workflow carries its group, batch size and runs per
// year; setups are stored in the profile. Figures come from portfolio() in
// lib/work.js; exports from lib/portfolio.js.
import {portfolio, setupOptions, handlers, routes} from '../lib/work.js';
import {portfolioCsv, portfolioWorkflowCsv, portfolioMarkdown, priceText, hoursText, manualSummary} from '../lib/portfolio.js';
import {download, uid, esc} from './store.js';

const METHODS_KEY = 'automation-portfolio-method-changes-v1';
const draft = {handler: handlers[0].id, route: 'connected'};
let last = null;

export function mountPortfolio(el, ctx, models) {
  let methodChanges = false;
  try { methodChanges = localStorage.getItem(METHODS_KEY) === 'true'; } catch {}
  const draw = () => { el.innerHTML = render(ctx.profile(), models, methodChanges); };
  const save = fn => { const p = ctx.profile(); fn(p); ctx.update(p); draw(); };
  el.onchange = ev => {
    ev.stopPropagation();
    const t = ev.target, wf = t.closest('[data-pf-workflow]')?.dataset.pfWorkflow;
    if (t.id === 'pf-methods') {
      methodChanges = t.checked;
      try { localStorage.setItem(METHODS_KEY, JSON.stringify(methodChanges)); } catch {}
      return draw();
    }
    if (wf) return save(p => {
      const w = p.workflows.find(x => x.id === wf); if (!w) return;
      const pf = w.portfolio ||= {};
      if (t.name === 'include') pf.include = t.checked;
      if (t.name === 'group') pf.group = t.value.trim().slice(0, 80);
      if (t.name === 'workload') { const n = Number(t.value); if (Number.isInteger(n) && n >= 1 && n <= 100000) pf.workload = n; else delete pf.workload; }
      if (t.name === 'runs') { const n = t.value === '' ? null : Number(t.value); if (n == null || !(Number.isFinite(n) && n >= 0 && n <= 100000)) delete pf.runsPerYear; else pf.runsPerYear = n; }
    });
    // The form stays open while its options are redrawn for the new handler or route.
    if (t.id === 'pf-handler') { draft.handler = t.value; draft.open = true; draw(); }
    if (t.id === 'pf-route') { draft.route = t.value; draft.open = true; draw(); }
  };
  el.onclick = ev => {
    ev.stopPropagation();
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.id === 'pf-add') {
      const name = el.querySelector('#pf-name').value.trim();
      const h = handlers.find(x => x.id === draft.handler);
      const setup = {id: uid('setup'), name: name || h.name, handler: draft.handler, route: draft.route,
        pipettes: el.querySelector('#pf-pipettes')?.value || undefined,
        modules: [...el.querySelectorAll('input[name=pf-module]:checked')].map(i => i.value),
        devices: [...el.querySelectorAll('input[name=pf-device]:checked')].map(i => i.value)};
      draft.open = false;
      return save(p => { (p.setups ||= []).push(setup); });
    }
    if (b.dataset.pfRemove) return save(p => { p.setups = (p.setups || []).filter(s => s.id !== b.dataset.pfRemove); });
    if (!last) return;
    if (b.id === 'pf-csv') download('portfolio-setups.csv', portfolioCsv(last), 'text/csv');
    if (b.id === 'pf-csv-workflows') download('portfolio-workflows.csv', portfolioWorkflowCsv(last), 'text/csv');
    if (b.id === 'pf-md') download('portfolio.md', portfolioMarkdown(last), 'text/markdown');
    if (b.id === 'pf-copy') navigator.clipboard?.writeText(portfolioMarkdown(last)).then(() => { b.textContent = 'Copied'; }, () => { b.textContent = 'Copy failed: use Download'; });
  };
  draw();
}

function render(profile, models, methodChanges) {
  const setups = profile.setups || [];
  const rows = profile.workflows.filter(w => models.some(m => m.protocolId === w.id));
  const chosen = rows.filter(w => w.portfolio?.include);
  last = null;
  let result = '';
  if (chosen.length && setups.length) {
    try {
      last = portfolio(chosen.map(w => ({id: w.id, name: w.name, group: w.portfolio.group, workload: w.portfolio.workload ?? w.defaultWorkload, runsPerYear: w.portfolio.runsPerYear ?? null, model: models.find(m => m.protocolId === w.id)})), setups, {methodChanges});
      result = results(last);
    } catch (e) { result = `<p class='notice bad'>${esc(e.message)}</p>`; }
  }
  return `<section class='pf' aria-labelledby='pf-title'>
  <h2 id='pf-title'>Portfolio: which setup serves the most groups?</h2>
  <p class='dc-note'>Tag each workflow with the group that runs it, its batch size and how many runs a year, then add the setups you are weighing up. Each setup is run over every chosen workflow with exactly the modules and devices you give it. Minutes are planning estimates; hours a year are left out for any workflow without runs per year.</p>
  <label class='pf-check'><input id='pf-methods' type='checkbox' ${methodChanges === true ? 'checked' : ''}> Allow method changes that need validation in this portfolio</label>
  <h3>Workflows</h3>
  <table class='pf-table'><thead><tr><th>Include</th><th>Workflow</th><th>Group or lab</th><th>Batch size</th><th>Runs per year</th></tr></thead><tbody>
  ${rows.map(w => `<tr data-pf-workflow='${esc(w.id)}'><td><input type='checkbox' name='include' aria-label='Include ${esc(w.name)}' ${w.portfolio?.include ? 'checked' : ''}></td><th scope='row'>${esc(w.name)}</th>
    <td><input name='group' value='${esc(w.portfolio?.group || '')}' placeholder='e.g. Plant biology' aria-label='Group for ${esc(w.name)}'></td>
    <td><input name='workload' type='number' min='1' max='100000' step='1' value='${esc(w.portfolio?.workload ?? w.defaultWorkload)}' aria-label='Batch size for ${esc(w.name)}'></td>
    <td><input name='runs' type='number' min='0' max='100000' value='${esc(w.portfolio?.runsPerYear ?? '')}' placeholder='not given' aria-label='Runs per year for ${esc(w.name)}'></td></tr>`).join('')}
  </tbody></table>
  <h3>Candidate setups (${setups.length})</h3>
  ${setups.length ? `<ul class='pf-setups'>${setups.map(s => `<li><strong>${esc(s.name)}</strong> <small>${esc(handlers.find(h => h.id === s.handler)?.name || s.handler)} · ${esc(routes[s.route] || s.route)}${s.modules?.length ? ` · ${esc(s.modules.join(', '))}` : ''}${s.devices?.length ? ` · devices: ${esc(s.devices.join(', '))}` : ''}</small> <button class='link' data-pf-remove='${esc(s.id)}'>Remove</button></li>`).join('')}</ul>` : `<p class='empty'>No setups yet.</p>`}
  ${addForm()}
  ${result || (chosen.length ? '' : `<p class='dc-note'>Tick at least one workflow to see results.</p>`)}
  </section>`;
}

function addForm() {
  const o = setupOptions(draft.handler, draft.route);
  return `<details class='pf-add' ${draft.open ? 'open' : ''}><summary>Add a setup</summary>
  <div class='pf-form'>
    <label>Liquid handler<select id='pf-handler'>${handlers.map(h => `<option value='${esc(h.id)}' ${h.id === draft.handler ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select></label>
    <label>Route<select id='pf-route'>${Object.entries(routes).map(([k, v]) => `<option value='${k}' ${k === draft.route ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
    ${o.pipettes.length ? `<label>Pipettes<select id='pf-pipettes'>${o.pipettes.map(p => `<option value='${esc(p.id)}'>${esc(p.label)}</option>`).join('')}</select></label>` : ''}
    <label>Name<input id='pf-name' placeholder='${esc(o.handler.name)}'></label>
  </div>
  <fieldset><legend>On-deck modules</legend>${o.modules.map(m => `<label class='pf-check'><input type='checkbox' name='pf-module' value='${esc(m.name)}' checked> ${esc(m.name)} <small>${esc(m.ops.join(', '))}</small></label>`).join('') || '<p class=empty>None recorded.</p>'}</fieldset>
  ${draft.route === 'deck' ? '' : `<fieldset><legend>${draft.route === 'workcell' ? 'Workcell devices' : 'Devices its own software drives'}</legend>${o.devices.map(d => `<label class='pf-check'><input type='checkbox' name='pf-device' value='${esc(d.op)}'> ${esc(d.label)} <small>e.g. ${esc(d.examples.slice(0, 2).join(', '))}</small></label>`).join('') || '<p class=empty>No documented integrations.</p>'}</fieldset>`}
  <button class='btn' id='pf-add'>Add setup</button></details>`;
}

function results(p) {
  const assessed = p.setups.filter(s => !s.unassessed);
  const unassessed = p.setups.filter(s => s.unassessed);
  const pending = p.workflows.filter(w => w.blocked);
  const blocked = p.workflows.flatMap(w => w.physicalIssues.filter(i => i.severity === 'impossible').map(i => ({workflow: w.name, ...i})));
  return `<h3>Results</h3>
  <p class='notice'><strong>Planning estimates.</strong> ${esc(p.caveat)}</p>
  ${pending.length ? `<h4>Workflows pending protocol review</h4><ul>
  ${pending.map(w => `<li><strong>${esc(w.name)}</strong> · ${esc(w.blocked)}</li>`).join('')}</ul>` : ''}
  ${blocked.length ? `<h4>Impossible protocol actions</h4><p class='dc-note'>These actions remain manual in the estimates until the protocol or labware is updated and reassessed.</p><ul>
  ${blocked.map(i => `<li><strong>${esc(i.workflow)}</strong> · ${esc(i.step)} <small>${esc(i.detail)}</small></li>`).join('')}</ul>` : ''}
  ${assessed.length ? `<table class='pf-table'><thead><tr><th>Setup</th><th>Groups served</th><th>Workflows run</th><th>Hands-on hours removed a year</th><th>Purchase price (new)</th><th>Open questions</th></tr></thead><tbody>
  ${assessed.map(s => `<tr><th scope='row'>${esc(s.setup.name)}</th><td>${s.groupsRun.length}/${s.groupsTotal}</td><td>${s.workflowsRun}/${s.workflowsTotal}</td><td>${esc(hoursText(s))}</td><td>${esc(priceText(s.cost))}${s.cost.missing.length ? `<small>Unpriced: ${esc(s.cost.missing.join('; '))}</small>` : ''}</td><td>${s.questions.length}</td></tr>`).join('')}
  </tbody></table>` : ''}
  ${unassessed.length ? `<h4>Setups with insufficient data</h4><ul>${unassessed.map(s => `<li><strong>${esc(s.setup.name)}</strong> · ${esc(s.unassessed)}</li>`).join('')}</ul>` : ''}
  ${assessed.map(s => `<details class='dc-chunk'><summary><span class='name'>${esc(s.setup.name)}</span><span class='mins'>${s.groupsRun.length}/${s.groupsTotal} groups</span></summary>
    <ul>${s.byGroup.map(g => `<li><strong>${esc(g.group)}</strong>: ${g.workflowsRun}/${g.workflowsTotal} workflows. ${g.workflowsRun ? `Left by hand: ${esc(manualSummary(g).map(m => `${m.label}${m.count > 1 ? ` ×${m.count}` : ''}`).join('; ') || 'nothing')}.` : ''} ${g.notRun.map(n => `${esc(n.workflow)} not run: ${esc(n.why)}`).join(' ')}</li>`).join('')}</ul>
    ${s.questions.length ? `<p><strong>Open questions</strong></p><ul>${s.questions.map(q => `<li>${esc(q.question)} <small>${esc(q.owner)}</small></li>`).join('')}</ul>` : ''}</details>`).join('')}
  <p><button class='btn' id='pf-csv'>Download CSV (one row per setup)</button> <button class='btn ghost' id='pf-csv-workflows'>CSV per workflow</button> <button class='btn ghost' id='pf-md'>Download Markdown</button> <button class='btn ghost' id='pf-copy'>Copy Markdown</button></p>`;
}
