// How a liquid handler's channels move, how it is programmed and whether
// PyLabRobot drives it (#82). Shared by the catalogue and the Decide page.
import {channelsFor, pipetteConfigs, pylabrobotStatuses} from '../lib/work.js';

const esc = v => String(v ?? '').replace(/[&<>'`]|"/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '`': '&#96;', [String.fromCharCode(39)]: '&#39;'}[c]));
const link = (s, text) => s?.url ? `<a href='${esc(s.url)}' target='_blank' rel='noopener' title='${esc(s.quote || '')}'>${esc(text)}</a>` : esc(text);
export const MODE = {independent: 'independent channels', fixed: 'fixed-pitch block', 'fixed-partial': 'fixed-pitch block, partial tip pickup'};

// One line per head: mode, then what independence gives (Z, spacing, volumes, tips).
export function headLine(h, head) {
  const f = channelsFor(h.id)?.heads?.[head.id];
  if (!f) return `${esc(head.label)}: <em>not recorded</em>`;
  const bits = [];
  if (f.mode === 'independent') {
    if (f.independentZ) bits.push('own Z');
    if (f.variableSpacing?.supported) bits.push(`spacing ${f.variableSpacing.minMm ?? '?'}–${f.variableSpacing.maxMm ?? '?'} mm`);
    if (f.perChannelVolume) bits.push('a volume per channel');
    if (f.perChannelTips) bits.push('tips per channel');
  } else if (f.partialPickup?.supported) bits.push(f.partialPickup.detail || 'partial tip pickup');
  return `${esc(head.label)}: ${link(f.source, MODE[f.mode] || f.mode)}${bits.length ? ` <small>${esc(bits.join(' · '))}</small>` : ''}`;
}
export function channelsHtml(h, cfg = null) {
  const heads = cfg ? cfg.heads : [...new Map((pipetteConfigs(h) || []).flatMap(c => c.heads).map(x => [x.id, x])).values()];
  return heads.length ? heads.map(x => headLine(h, x)).join('<br>') : 'not recorded';
}
export function softwareHtml(h) {
  const s = channelsFor(h.id)?.software;
  if (!s) return 'not recorded';
  const nc = s.noCode, api = s.openApi;
  return `<strong>${esc(s.vendorSoftware)}</strong>
    <small>No-code: ${nc?.supported ? link(nc.source, `${nc.name}${nc.kind ? ` (${nc.kind})` : ''}`) : nc?.supported === false ? link(nc.source, 'none') : 'not recorded'}</small>
    <small>Open API: ${api?.supported ? link(api.source, `${api.kind}${api.open === false ? ', licence or vendor access needed' : ''}`) : api?.supported === false ? link(api.source, 'none published') : 'not recorded'}</small>`;
}
export function plrHtml(h) {
  const p = h.pylabrobot;
  if (!p) return 'not recorded';
  const label = pylabrobotStatuses[p.status] ? `${p.status}` : p.status;
  return `<span class='plr plr-${esc(p.status)}' title='${esc(pylabrobotStatuses[p.status] || '')}'>${esc(label)}</span>${p.driverStatus ? `<small>${p.source ? link({url: p.source}, `PyLabRobot “${p.driverStatus}”`) : esc(p.driverStatus)}${p.api ? ` · ${esc(p.api)}` : ''}</small>` : ''}${p.documentationUrl ? `<small>${link({url: p.documentationUrl}, 'driver guide')}</small>` : ''}${p.limitations.length ? `<small>${esc(p.limitations[0])}</small>` : ''}`;
}
