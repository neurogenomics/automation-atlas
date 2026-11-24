import {esc} from './store.js';
import {pin, readSource, sourceForm} from './registry-form.js';

const code = value => `<code>${esc(value)}</code>`;
const refLink = (org, ref, label = ref.record_id) => `<a href="#registry/workspace/${esc(org)}/${esc(ref.record_id)}">${esc(label)}</a>`;
const linkPin = (org, ref) => `${refLink(org, ref)} · ${code(ref.revision_id)}`;
const btn = (name, action) => `<button type="button" class="btn ghost" data-installation="${action}">${name}</button>`;
const pair = (label, html) => `<dt>${label}</dt><dd>${html}</dd>`;

export function installationSummary(row, org) {
  const e = row.installation_event;
  if (!e) return '';
  const label = e.action === 'move' ? 'Location change' : e.action === 'duplicate_link' ? 'Duplicate resolution' : 'Duplicate link removed';
  const source = e.action === 'move' ? row.record.sources[e.source_index]?.source.url : e.source_url;
  return pair(label, esc(e.observed_at) + ' · ' + esc(e.reason)) +
    pair('Previous exact revision', code(row.record.parent.revision_id)) +
    (e.target ? pair('Pinned canonical report', linkPin(org, e.target)) : '') +
    (source ? pair('Evidence locator', esc(source)) : '');
}
export function installationBadge(row) {
  if (row.installation_event?.action === 'duplicate_link') return ' · Linked duplicate';
  if (row.duplicate_backing) return ' · Backing installation is a linked duplicate';
  if (row.duplicate_count) return ' · Canonical report with ' + row.duplicate_count + ' visible duplicate' + (row.duplicate_count === 1 ? '' : 's');
  return '';
}

export function mountInstallation(host, {row, org, canWrite, url, send, get, loadTargets, live, unavailable, refresh}) {
  const linked = row.installation_event?.action === 'duplicate_link';
  const owner = org.role === 'owner', active = row.state === 'active';
  host.innerHTML = `<h3>Installation history and reconciliation</h3>
    ${linked ? `<p>Linked duplicate of ${linkPin(org.id, row.installation_event.target)}. Both reports retain their own evidence.</p>` :
      row.duplicate_count ? '<p>Canonical installation for the visible linked reports.</p>' : ''}
    <div class="reg-actions">
      ${row.duplicate_count ? btn('Show visible duplicate reports', 'list') : ''}
      ${canWrite && active ? btn('Record dated location change', 'move') : ''}
      ${owner && active && !row.duplicate_count ? btn('Link as duplicate', 'link') : ''}
      ${owner && linked ? btn('Unlink duplicate', 'unlink') : ''}
    </div>
    <div data-related></div><div data-installation-form></div><p data-installation-status class="notice bad" role="alert" hidden></p>`;
  const box = host.querySelector('[data-installation-form]'), status = host.querySelector('[data-installation-status]');
  const error = e => {
    if (!live(host) || unavailable(e)) return;
    status.textContent = e.message;
    status.hidden = false;
  };
  const expected_head = pin(row.record);
  let preparing = false, saving = false;
  const report = `<label>Change date<input type="date" name="observed_at" required></label>
    <label>Reason<textarea name="reason" required maxlength="500" rows="3"></textarea></label>`;
  const evidence = '<label>Evidence locator (optional HTTPS URL)<input type="url" name="source_url"></label>';
  async function open(action) {
    const form = document.createElement('form');
    form.className = 'card reg-form';
    let target, nextAfter, append;
    if (action === 'move') {
      form.innerHTML = `<h4>Record dated location change</h4>
        <p>Current reported location: ${esc(row.record.record.reported_location ?? 'Unknown')}</p>
        <label>New reported location (blank if unknown)<input name="reported_location" maxlength="500"></label>
        ${report}${sourceForm(null, 0, false)}<button type="submit" class="btn">Save location change</button>`;
    } else if (action === 'link') {
      const page = await loadTargets(null);
      if (!live(host)) return;
      form.innerHTML = `<h4>Link as duplicate</h4>
        <p>Select the current revision of the canonical installation. This report will remain readable in the workspace and be withdrawn from public results.</p>
        <label>Canonical installation revision<select name="target" aria-label="Canonical installation revision" required>
          <option value="">Choose a current installation</option></select></label>
        <div data-more></div>${report}${evidence}<button type="submit" class="btn">Save duplicate resolution</button>`;
      append = ({records, next_after}) => {
        const picker = form.elements.target;
        for (const r of records.filter(r => r.state === 'active' && r.record.record.record_type === 'installation' && r.record.record_id !== expected_head.record_id)) {
          const option = new Option(r.record.record.label + ' · ' + r.record.revision_id, JSON.stringify(pin(r.record)));
          picker.add(option);
        }
        nextAfter = next_after;
        form.querySelector('[data-more]').innerHTML = nextAfter ? btn('Load more canonical candidates', 'more') : '';
      };
      append(page);
    } else {
      const {revision} = await get(url.slice(0, url.lastIndexOf('/') + 1) + row.installation_event.target.record_id);
      if (!live(host)) return;
      target = pin(revision.record);
      form.innerHTML = `<h4>Unlink duplicate</h4>
        <p>Remove the link to ${refLink(org.id, target, revision.record.record.label)} at its current revision ${code(target.revision_id)}.</p>
        ${report}${evidence}<button type="submit" class="btn">Save unlink</button>`;
    }
    box.replaceChildren(form);
    form.querySelector('select,input,textarea')?.focus();
    form.onsubmit = async e => {
      e.preventDefault();
      if (saving || !live(host)) return;
      const submit = form.querySelector('[type=submit]');
      saving = submit.disabled = true;
      status.hidden = true;
      const value = name => form.elements[name].value.trim();
      try {
        const common = {expected_head, observed_at: value('observed_at'), reason: value('reason')};
        if (action === 'move') {
          await send(url + '/move', {...common, reported_location: value('reported_location') || null, source: readSource(form.querySelector('.reg-source'))});
        } else {
          await send(url + '/reconciliation', {...common, action, source_url: value('source_url') || null,
            expected_target: target ?? JSON.parse(value('target'))});
        }
        if (live(host)) refresh(action === 'move' ? 'Saved the dated location change.' :
          action === 'link' ? 'Saved the duplicate resolution.' : 'Removed the duplicate link.');
      } catch (e) { error(e); }
      finally { saving = submit.disabled = false; }
    };
    if (append) form.onclick = async e => {
      if (e.target.dataset.installation !== 'more' || e.target.disabled) return;
      e.target.disabled = true;
      try {
        const page = await loadTargets(nextAfter);
        if (live(host) && form.isConnected) append(page);
      } catch (err) { error(err); }
      finally { e.target.disabled = false; }
    };
  }
  host.onclick = async event => {
    const control = event.target.closest('[data-installation]');
    const action = control?.dataset.installation;
    if (!action || action === 'more' || preparing || saving || !live(host)) return;
    status.hidden = true;
    preparing = control.disabled = true;
    try {
      if (action === 'list') {
        const {duplicate_sources} = await get(url + '/reconciliation');
        if (live(host)) host.querySelector('[data-related]').innerHTML = duplicate_sources.length ?
          `<ul>${duplicate_sources.map(r => `<li>${refLink(org.id, r.reference, r.label)} · ${code(r.reference.revision_id)}</li>`).join('')}</ul>` :
          '<p>No visible duplicate reports.</p>';
      } else if (!box.firstChild) await open(action);
      else box.querySelector('select,input,textarea')?.focus();
    } catch (e) { error(e); }
    finally { preparing = control.disabled = false; }
  };
}
