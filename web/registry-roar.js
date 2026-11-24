import {esc} from './store.js';

export const roarDiscovery = 'https://instrument-capability-catalogue.nathan-skene.chatgpt.site/#roar';
const label = value => esc(value.replaceAll('_', ' '));
const code = value => '<code>' + esc(value) + '</code>';
const roleLine = role => `<li><strong>${esc(role.reportedName)}</strong> (${code(role.id)}) · ${label(role.status)}
  <br>${esc(role.reportedRole)}<br>${esc(role.identityGap)}
  ${role.reportedGroup ? '<br>Reported group: ' + code(role.reportedGroup) : ''}
  ${role.modelIds.length ? '<br>Candidate model IDs: ' + role.modelIds.map(code).join(', ') : ''}</li>`;
const sourceLink = source => {
  try {
    const u = new URL(source.url);
    if (u.protocol === 'https:' && !u.username && !u.password)
      return `<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${esc(source.title)}</a>`;
  } catch {}
  return esc(source.title);
};
const exact = (title, data) => `<details><summary>${title}</summary><pre>${esc(JSON.stringify(data, null, 2))}</pre></details>`;
export const modelPin = m => m ? `${code(m.record_id)} · ${code(m.revision_id)} · ${code(m.content_digest)}` : 'No exact model assigned';
export function parseRoarPacket({record: w, action}) {
  if (action !== 'roar_import' || !w.record_id.startsWith('roar-') || w.record.record_type !== 'assertion') return null;
  try {
    const p = JSON.parse(w.record.statement);
    return p?.format === 'planner-roar-source/1' && Array.isArray(p.roles) && Array.isArray(p.conflicts) &&
      Array.isArray(p.candidate_models) && Array.isArray(p.sources) ? p : null;
  } catch { return null; }
}
export function roarEvidence(e) {
  return `<h4>Reported roles</h4><ul>${e.roles.map(roleLine).join('')}</ul>
    ${e.conflicts.length ? '<h4>Conflicting reports</h4><ul>' + e.conflicts.map(c =>
      `<li><strong>${esc(c.title)}</strong> (${code(c.id)})<ul>${c.observations.map(o =>
        `<li>${code(o.sourceId)} · ${esc(o.statement)}</li>`).join('')}</ul>${esc(c.resolution)}</li>`).join('') + '</ul>' : ''}
    <h4>Model identity candidates</h4>${e.candidate_models.length ? '<ul>' + e.candidate_models.map(m =>
      `<li>${esc(m.manufacturer)} ${esc(m.modelIdentifier)} · ${modelPin(m.recordRef)}
      ${m.identityNote ? '<br>' + esc(m.identityNote) : ''}</li>`).join('') + '</ul>' : '<p>No exact model candidates.</p>'}
    <h4>Source references</h4><ul>${e.sources.map(s =>
      `<li>${sourceLink(s)} · ${code(s.id)} · checked ${esc(s.checked)}<br>${esc(s.section)}</li>`).join('')}</ul>
    <p class="sub">${esc(e.retrieval_note)}</p>
    ${exact('Exact source packet, release pins and field omissions', e)}`;
}

export function mountRoarImport(host, {route, send, live}) {
  host.innerHTML = `<section class="card"><h3>Import ROAR reports</h3>
    <p>Preview the reviewed Atlas files before saving them to this workspace. The facility website reports roles; it does not establish asset counts, custody, configuration fit, provider willingness, availability or rights to republish.</p>
    <p><a href="${roarDiscovery}" target="_blank" rel="noopener noreferrer">Open Atlas ROAR discovery</a></p>
    <form><label>ROAR discovery crosswalk<input name="crosswalk" type="file" accept=".json,application/json" required></label>
      <label>C11 instrument model bundle<input name="bundle" type="file" accept=".json,application/json" required></label>
      <div class="reg-actions"><button class="btn" type="submit">Preview import</button>
        <button class="btn" data-apply type="button" disabled>Save private reports</button></div></form>
    <p role="status" data-progress></p><p class="notice bad" role="alert" data-error hidden></p>
    <div data-preview></div></section>`;
  const form = host.querySelector('form'), apply = host.querySelector('[data-apply]'), preview = host.querySelector('[data-preview]');
  const progress = host.querySelector('[data-progress]'), error = host.querySelector('[data-error]');
  let approved = null, running = false, selection = 0;
  const clear = () => { approved = null; apply.disabled = true; preview.replaceChildren(); };
  form.onchange = () => { selection++; clear(); progress.textContent = ''; error.hidden = true; };
  const work = async fn => {
    if (running || !live(host)) return;
    running = true;
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true; apply.disabled = true; error.hidden = true;
    try { await fn(selection); }
    catch (e) {
      if (live(host)) {
        approved = null;
        error.textContent = e.message; error.hidden = false;
      }
    } finally {
      running = false;
      if (live(host)) { submit.disabled = false; apply.disabled = !approved; }
    }
  };
  form.onsubmit = event => {
    event.preventDefault();
    work(async selected => {
      clear(); progress.textContent = '';
      const read = async name => {
        const file = form.elements[name].files[0];
        if (!file || file.size > 96 * 1024) throw Error('Select the reviewed JSON files (up to 96 KiB each).');
        return new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(await file.arrayBuffer());
      };
      const [crosswalk, bundle] = await Promise.all(['crosswalk', 'bundle'].map(read));
      const payload = {crosswalk, bundle}, result = await send('preview', payload);
      if (!live(host) || selected !== selection) return;
      const {roles, conflicts, models} = result.counts;
      const pending = result.reports.filter(r => r.status === 'create' || r.status === 'revise');
      const blocked = result.reports.some(r => r.status === 'needs_manual_review');
      const reconciliation = result.manual_reconciliation;
      if (pending.length && !blocked && !reconciliation.length) approved = {...payload, review_digest: result.review_digest};
      progress.textContent = `${roles} reported roles · ${conflicts} conflicting reports · ${models} verified model references. ${pending.length} reports to save.`;
      preview.innerHTML = `<h4>Review proposed changes</h4>${blocked ? '<p class="notice">A workspace report changed after import. Review it in the workspace before replacing the source evidence.</p>' : ''}
        ${reconciliation.length ? '<p class="notice">Previously imported roles moved or are absent. Review the existing reports before importing a release with a different grouping.</p><ul>' +
          reconciliation.map(r => `<li>${code(r.role_id)} · ${label(r.reason)} · <a href="${route}/${esc(r.report_id)}">${esc(r.report_label)}</a></li>`).join('') + '</ul>' : ''}
        ${result.reports.map(r => `<details class="card"><summary>${esc(r.report.label)} · ${label(r.status)}</summary>
          <p>Exact model: ${modelPin(r.report.model)}</p>
          <p>Use rights: ${['discovery', 'assessment', 'republication'].map(k => k + ' ' + label(r.use_rights[k])).join(' · ')}</p>${r.report.record_type === 'installation_group' ? '<p>Reported asset count: unknown.</p>' : ''}
          ${r.current_heads[0] ? `<p><a href="${route}/${esc(r.report_id)}">Open current report</a> · <a href="${route}/${esc(r.packet_id)}">Open saved evidence</a></p>` : ''}
          ${roarEvidence(r.evidence)}${r.previous ? exact('Previous imported source packet', r.previous) : ''}</details>`).join('')}`;
    });
  };
  apply.onclick = () => work(async selected => {
    if (!approved) return;
    const result = await send('apply', approved);
    if (!live(host) || selected !== selection) return;
    clear();
    progress.textContent = `Saved privately: ${result.created} new, ${result.revised} revised, ${result.unchanged} unchanged.`;
    preview.innerHTML = `<a href="${route}">Open workspace reports</a>`;
  });
}
