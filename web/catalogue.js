// Instrument catalogue: every liquid handler and device class the planner
// considers, built from the public catalogue records.
import {handlers, classes, modelOptions, openHardware} from '../lib/work.js';
import {esc} from './store.js';
import {channelsHtml, softwareHtml, plrHtml} from './features-view.js';

export function mountCatalogue(el) {
  const rows = handlers.slice().sort((a, b) => `${a.vendor} ${a.name}`.localeCompare(`${b.vendor} ${b.name}`));
  el.innerHTML = `<section class='pg'>
    <h2>Instrument catalogue</h2>
    <p class='lede'>Every liquid handler and connectable device class the planner considers. Capabilities come from manufacturer pages and the PyLabRobot registry; a listed capability is not proof of an installed configuration or an assay result. <strong>Channels</strong> says whether each head's channels move independently (own Z, variable spacing, a different volume per channel), which matters for pooling, normalisation, cherry-picking and moving between tubes and plates. <strong>PyLabRobot</strong> is the open-source driver's own support level at the pinned commit. Hover a link for the quoted source.</p>
    <h3>Liquid handlers (${rows.length})</h3>
    <div class='tbl-wrap'><table class='tbl'><thead><tr><th>Model</th><th>Pipetting range</th><th>Channels</th><th>Programming</th><th>PyLabRobot</th><th>Built in</th><th>Options</th><th>Deck</th><th>Sources</th></tr></thead><tbody>
    ${rows.map(h => {
      const lt = h.ops['liquid-transfer'];
      const native = Object.entries(h.ops).filter(([, v]) => v.type === 'native').map(([op]) => op.replace(/-/g, ' '));
      return `<tr><td><strong>${esc(h.name)}</strong><small>${esc(h.vendor || '')}</small></td><td>${lt?.minUl != null ? `${lt.minUl}–${lt.maxUl} µL` : 'not recorded'}</td><td class='small-cell'>${channelsHtml(h)}</td><td class='small-cell'>${softwareHtml(h)}</td><td>${plrHtml(h)}</td><td>${esc(native.join(', '))}</td>
      <td>${modelOptions(h).map(o => `${esc(o.name)} <small>(${o.kind === 'module' ? 'module' : 'connected'})</small>`).join('<br>') || '—'}</td>
      <td>${h.capacity.deckPositions ? `${h.capacity.deckPositions} positions` : 'not recorded'}</td>
      <td>${(h.sources || []).filter(s => /^https?:/.test(s.url || '')).slice(0, 3).map(s => `<a href='${esc(s.url)}' target='_blank' rel='noopener'>${esc(s.title || 'source')}</a>`).join('<br>') || '—'}</td></tr>`;
    }).join('')}
    </tbody></table></div>
    <h3>Connectable device classes (${Object.keys(classes).length})</h3>
    <div class='tbl-wrap'><table class='tbl'><thead><tr><th>Operation</th><th>Cooling available</th><th>Example devices</th></tr></thead><tbody>
    ${Object.values(classes).sort((a, b) => a.operation.localeCompare(b.operation)).map(c => `<tr><td>${esc(c.operation.replace(/-/g, ' '))}</td><td>${c.cooling ? 'Yes' : '—'}</td><td>${esc(c.examples.join(', '))}</td></tr>`).join('')}
    </tbody></table></div>
    <h3>Open-source and DIY hardware (${openHardware.entries.length})</h3>
    <p class='lede'>Published open designs, add-ons and drivers. They are leads, not capabilities: the planner never counts them, and each needs building and validating. Stated costs are the authors' historical figures, not quotes.</p>
    <div class='tbl-wrap'><table class='tbl'><thead><tr><th>Project</th><th>Fits</th><th>Covers</th><th>Maturity</th><th>Activity</th><th>What it is</th><th>Limits</th></tr></thead><tbody>
    ${openHardware.entries.slice().sort((a, b) => fitsLabel(a).localeCompare(fitsLabel(b)) || a.name.localeCompare(b.name)).map(e => `<tr><td><a href='${esc(e.url)}' target='_blank' rel='noopener'><strong>${esc(e.name)}</strong></a>${(e.sources || []).map(s => `<small><a href='${esc(s.url)}' target='_blank' rel='noopener'>${esc(s.title)}</a></small>`).join('')}</td>
      <td>${esc(fitsLabel(e))}</td><td>${esc(e.operations.map(op => op.replace(/-/g, ' ')).join(', ') || e.kind)}</td>
      <td><span title='${esc(openHardware.maturity[e.maturity] || '')}'>${esc(e.maturity)}</span>${e.statedCost ? `<small>${esc(e.statedCost)}</small>` : ''}</td>
      <td>${activity(e.activity)}</td>
      <td>${esc(e.does)}</td><td>${esc(e.limits)}</td></tr>`).join('')}
    </tbody></table></div>
  </section>`;
}

// Freshness from the weekly check (#79). A finished design may have no recent
// changes; that is shown, not judged.
const ACTIVITY = {active: 'Changed in the last 2 years', dormant: 'No changes in 2+ years', archived: 'Archived by its authors', missing: 'Source not found', reachable: 'Source reachable', 'not checked': 'Could not be checked'};
function activity(a) {
  if (!a) return '—';
  return `${esc(ACTIVITY[a.status] || a.status)}${a.lastPush ? `<small>last push ${esc(a.lastPush)}</small>` : ''}${a.licence ? `<small>${esc(a.licence)} licence</small>` : a.lastPush ? '<small>no licence stated</small>' : ''}${a.movedTo ? `<small>moved to ${esc(a.movedTo)}</small>` : ''}<small>checked ${esc(a.checked)}</small>`;
}
const fitsLabel = e => e.platforms.map(p => p === 'any' ? 'Beside any setup' : p === 'standalone' ? 'Own machine' : handlers.find(h => h.id === p)?.name || p).join(', ');
