// Your equipment: instruments you can access, and which of the catalogue's
// known options each one actually has.
import {handlers, benchProviders, modelOptions, buildsFor, buildStates, arrangements, installedHeadOptions, validateInstalledHeads} from '../lib/work.js';
import {esc, uid} from './store.js';

const STATES = [['yes', 'Have'], ['no', 'Don’t have'], ['unknown', 'Not sure']];
const HEAD_STATES = [['unknown', 'Unknown'], ['reported', 'Reported'], ['confirmed', 'Confirmed'], ['conflicting', 'Conflicting reports'], ['catalogue', 'Use catalogue scenarios']];
const concreteHeadStatus = status => status === 'reported' || status === 'confirmed';
const BUILD_STATES = [['', 'Not using'], ...Object.entries(buildStates)];
const sorted = handlers.slice().sort((a, b) => `${a.vendor} ${a.name}`.localeCompare(`${b.vendor} ${b.name}`));

export function mountEquipment(el, ctx) {
  let editing = null; // instrument being edited (copy)
  let note = '';
  const draw = () => {
    const p = ctx.profile();
    el.innerHTML = `
    <section class='pg'>
      <h2>Your equipment</h2>
      <p class='lede'>The instruments the lab can use are listed for every lab member (marked Lab); the lab owner keeps that list. Add any others you can use yourself. For each, say which of its known options are fitted. “Have” is treated as confirmed, “Don’t have” is never assumed, and “Not sure” becomes a question for the owner. Your own are saved in ${esc(ctx.where)}.</p>
      ${note ? `<p class='notice'>${esc(note)}</p>` : ''}
      ${editing ? form(editing) : `<button class='btn' data-add='1'>Add an instrument</button>`}
      <h3>Instruments (${p.equipment.length})</h3>
      ${p.equipment.length ? `<div class='cards'>${p.equipment.map(card).join('')}</div>` : `<p class='empty'>None yet. Without any, only “Design a complete setup” can give an answer.</p>`}
    </section>`;
  };

  function form(e) {
    const h = handlers.find(x => x.id === e.modelId), bench = benchProviders.find(x => x.id === e.modelId);
    const opts = h ? modelOptions(h) : [];
    const range = h?.ops['liquid-transfer'];
    const headState = e.installedHeads?.status ?? (e.isNew ? 'unknown' : 'catalogue');
    const heads = h ? installedHeadOptions(h) : [];
    const fitted = Array.isArray(e.installedHeads?.heads) ? e.installedHeads.heads : [];
    const statuses = HEAD_STATES.filter(([value]) => value !== 'catalogue' || headState === 'catalogue');

    return `<form class='card' id='eq-form'>
      <h3>${e.isNew ? 'Add an instrument' : 'Edit instrument'}</h3>
      <div class='row'>
        <label>Model<select id='eq-model' required><option value=''>Choose from the catalogue…</option>${sorted.map(x => `<option value='${esc(x.id)}' ${x.id === e.modelId ? 'selected' : ''}>${esc(x.vendor ? `${x.vendor} · ${x.name}` : x.name)}</option>`).join('')}<optgroup label='Separate bench devices'>${benchProviders.map(x => `<option value='${esc(x.id)}' ${x.id === e.modelId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</optgroup></select></label>
        <label>Name<input id='eq-name' value='${esc(e.name || '')}' placeholder='e.g. Core facility Flex'></label>
        <label>Owner or contact<input id='eq-owner' value='${esc(e.owner || '')}' placeholder='Who to ask'></label>
        <label>Can you book it?<select id='eq-access'>${[['yes', 'Yes'], ['unknown', 'Not sure yet']].map(([v, l]) => `<option value='${v}' ${(e.access || 'unknown') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <div class='row'>
        <label>Whose is it?<select id='eq-arrangement'>${Object.entries(arrangements).map(([v, l]) => `<option value='${v}' ${(e.arrangement || 'borrow') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
        <label>Charge per run (GBP)<input id='eq-charge-run' type='number' min='0' step='any' value='${e.chargePerRun ?? ''}' placeholder='if charged'></label>
        <label>Charge per hour of run (GBP)<input id='eq-charge-hour' type='number' min='0' step='any' value='${e.chargePerHour ?? ''}' placeholder='if charged'></label>
        <label>Travel and hand-over (min per run)<input id='eq-travel' type='number' min='0' step='1' value='${e.travelMinutes ?? ''}' placeholder='your estimate'></label>
      </div>
      ${h ? `<p class='sub'>${esc(h.name)} pipetting range in the catalogue: ${range?.minUl != null ? `${range.minUl}–${range.maxUl} µL` : 'not recorded'}.</p>
      ${heads.length ? `<fieldset class='opts'><legend>Installed pipetting heads</legend>
        <label>Evidence status<select id='eq-head-status'>${statuses.map(([value, label]) =>
          `<option value='${value}'${headState === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
        <div id='eq-head-counts' ${concreteHeadStatus(headState) ? '' : 'hidden'}>
          ${heads.map(head => `<label>${esc(head.label)} · fitted channels
            <input type='number' min='${head.independent ? 1 : head.channels}' max='${head.channels}' step='1'
              data-installed-head='${esc(head.id)}' ${concreteHeadStatus(headState) ? '' : 'disabled'} value='${esc(fitted.find(x => x?.id === head.id)?.channels ?? '')}'>
          </label>`).join('')}
          <p class='sub'>Leave a head blank if it is absent. Plate transfers stay manual in this as-installed scenario.</p>
        </div>
      </fieldset>` : ''}
      ${opts.length ? `<fieldset class='opts'><legend>Which of these does it have?</legend>
        ${opts.map(o => `<div class='opt'><span><strong>${esc(o.name)}</strong><small>${o.kind === 'module' ? 'On-deck module' : 'Connected device its software is documented to drive'} · ${esc(o.ops.map(x => x.replace(/-/g, ' ')).join(', '))}</small></span>
          <span class='seg'>${STATES.map(([v, l]) => `<label><input type='radio' name='opt-${esc(o.key)}' value='${v}' ${(e.options?.[o.op] || 'unknown') === v ? 'checked' : ''}> ${l}</label>`).join('')}</span></div>`).join('')}
      </fieldset>` : `<p class='sub'>The catalogue lists no optional modules for this model.</p>`}
      ${buildsFor(h).length ? `<fieldset class='opts'><legend>Open-source parts for this model</legend>
        <p class='sub'>Parts you could build or have built, including ones that fill an option it lacks. Planned counts as something to build; built answers whether it works; validated also settles its checks. Anything else stays a question.</p>
        ${buildsFor(h).map(b => `<div class='opt'><span><strong><a href='${esc(b.url)}' target='_blank' rel='noopener'>${esc(b.name)}</a></strong><small>${esc(b.ops.map(x => x.replace(/-/g, ' ')).join(', '))} · ${esc(b.maturity)}${b.upgrades ? ` · upgrades the ${esc(b.upgrades)}` : ''}${b.statedCost ? ` · ${esc(b.statedCost)}` : ''}</small></span>
          <span class='seg'>${BUILD_STATES.map(([v, l]) => `<label><input type='radio' name='build-${esc(b.id)}' value='${v}' ${(e.builds?.[b.id] || '') === v ? 'checked' : ''}> ${l}</label>`).join('')}</span></div>`).join('')}
      </fieldset>` : ''}` : ''}
      ${bench ? `<p class='sub'>${esc(bench.kind)}. Considered with the tips and run time objective.</p>` : ''}
      <div class='row'><button class='btn' ${h || bench ? '' : 'disabled'}>Save</button><button type='button' class='link' data-cancel='1'>Cancel</button></div>
    </form>`;
  }

  function card(e) {
    const h = handlers.find(x => x.id === e.modelId), bench = benchProviders.find(x => x.id === e.modelId);
    const opts = h ? modelOptions(h) : [];
    const count = s => opts.filter(o => (e.options?.[o.op] || 'unknown') === s).length;
    const canEdit = !e.lab || ctx.lab().canEdit;
    return `<article class='card'><h4>${e.lab ? `<span class='tag'>Lab</span> ` : ''}${esc(e.name)}</h4><p class='sub'>${esc(h?.name || bench?.name || `Unknown model ${e.modelId}`)} · ${esc(e.owner || 'no contact')} · booking ${e.access === 'yes' ? 'confirmed' : 'not confirmed'} · ${esc(arrangements[e.arrangement] || arrangements.borrow)}${e.chargePerRun != null ? ` · £${e.chargePerRun}/run` : ''}${e.chargePerHour != null ? ` · £${e.chargePerHour}/h` : ''}</p>
      ${e.installedHeads ? `<p class='sub'>Installed heads · ${esc(HEAD_STATES.find(([state]) => state === e.installedHeads.status)?.[1])
        }${(Array.isArray(e.installedHeads.heads) ? e.installedHeads.heads : []).filter(Boolean).map(head => ` · ${esc(head.id)} ×${esc(head.channels)}`).join('')}</p>` : ''}
      ${bench ? `<p class='sub'>${esc(bench.kind)}</p>` : `<p class='sub'>Options: ${count('yes')} have, ${count('no')} don’t have, ${count('unknown')} not sure</p>`}
      ${Object.keys(e.builds || {}).length ? `<p class='sub'>Open-source parts: ${Object.entries(e.builds).map(([id, s]) => `${esc(buildsFor(h || {}).find(b => b.id === id)?.name || id)} (${esc(buildStates[s] || s)})`).join('; ')}</p>` : ''}
      ${canEdit ? `<button class='link' data-edit='${esc(e.id)}'>Edit</button> <button class='link' data-del='${esc(e.id)}'>Remove</button>` : `<small class='sub'>Kept by the lab owner.</small>`}${!e.lab && ctx.lab().canEdit ? ` <button class='link' data-share='${esc(e.id)}'>Add to the lab's list</button>` : ''}</article>`;
  }

  const readForm = () => {
    const f = el.querySelector('#eq-form');
    const numIn = sel => { const v = f.querySelector(sel).value; return v === '' || !(Number(v) >= 0) ? undefined : Number(v); };
    const modelId = f.querySelector('#eq-model').value;
    const h = handlers.find(x => x.id === modelId);
    const options = {};
    for (const o of h ? modelOptions(h) : []) { const v = f.querySelector(`input[name='opt-${CSS.escape(o.key)}']:checked`)?.value || 'unknown'; for (const op of o.ops) options[op] = v; }
    const builds = {};
    for (const b of h ? buildsFor(h) : []) { const v = f.querySelector(`input[name='build-${CSS.escape(b.id)}']:checked`)?.value; if (buildStates[v]) builds[b.id] = v; }
    const status = f.querySelector('#eq-head-status')?.value;
    const installedHeads = status && status !== 'catalogue' ? {status, heads: concreteHeadStatus(status)
      ? [...f.querySelectorAll('[data-installed-head]')].filter(input => input.value !== '')
        .map(input => ({id: input.dataset.installedHead, channels: Number(input.value)}))
      : []} : undefined;
    return {...editing, installedHeads, modelId, name: f.querySelector('#eq-name').value.trim() || h?.name || benchProviders.find(x => x.id === modelId)?.name || modelId, owner: f.querySelector('#eq-owner').value.trim(), access: f.querySelector('#eq-access').value, arrangement: f.querySelector('#eq-arrangement').value, chargePerRun: numIn('#eq-charge-run'), chargePerHour: numIn('#eq-charge-hour'), travelMinutes: numIn('#eq-travel'), options, builds};
  };

  el.onchange = ev => {
    if (ev.target.id === 'eq-head-status') {
      const counts = el.querySelector('#eq-head-counts');
      counts.hidden = !concreteHeadStatus(ev.target.value);
      for (const input of counts.querySelectorAll('input')) input.disabled = counts.hidden;
    }
    if (ev.target.id === 'eq-model') {
      editing = {...readForm(), installedHeads: {status: 'unknown', heads: []}, options: {}, builds: {}};
      if (!handlers.some(x => x.id === editing.modelId && installedHeadOptions(x).length)) delete editing.installedHeads;
      editing.name = '';
      draw();
    }
  };
  // The lab's list is saved to the lab (owner only); everything else to the person's profile.
  const labList = () => ctx.profile().equipment.filter(x => x.lab);
  const saveLab = (list, done) => ctx.saveLabEquipment(list).then(() => { note = done; editing = null; draw(); }, err => { note = `Not saved to the lab: ${err.message}`; draw(); });
  el.onsubmit = ev => {
    ev.preventDefault();
    const e = readForm();
    const handler = handlers.find(x => x.id === e.modelId);
    if (e.installedHeads !== undefined && (!handler || !validateInstalledHeads(handler, e.installedHeads))) {
      editing = e;
      note = 'Enter the fitted channel count for at least one recorded head.';
      return draw();
    }
    const {isNew, ...rec} = e;
    if (rec.lab) return saveLab(labList().map(x => x.id === rec.id ? rec : x), `Saved ${rec.name} to the lab's list.`);
    const p = ctx.profile();
    p.equipment = isNew ? [...p.equipment, rec] : p.equipment.map(x => x.id === rec.id ? rec : x);
    ctx.update(p); note = `Saved ${rec.name}.`; editing = null; draw();
  };
  el.onclick = ev => {
    const b = ev.target.closest('button[data-add],button[data-edit],button[data-del],button[data-cancel],button[data-share]');
    if (!b) return;
    ev.preventDefault();
    const p = ctx.profile();
    const hit = p.equipment.find(x => x.id === (b.dataset.del || b.dataset.share));
    if (b.dataset.del && hit?.lab) return saveLab(labList().filter(x => x.id !== hit.id), `Removed ${hit.name} from the lab's list.`);
    if (b.dataset.share && hit) {
      return ctx.saveLabEquipment([...labList(), {...hit, lab: true}]).then(() => { p.equipment = p.equipment.filter(x => x.id !== hit.id && !x.lab); ctx.update(p); note = `${hit.name} is now on the lab's list.`; draw(); }, err => { note = `Not added: ${err.message}`; draw(); });
    }
    if (b.dataset.add) editing = {id: uid('eq'), isNew: true, options: {}};
    if (b.dataset.edit) editing = structuredClone(p.equipment.find(x => x.id === b.dataset.edit));
    if (b.dataset.cancel) editing = null;
    if (b.dataset.del) { p.equipment = p.equipment.filter(x => x.id !== b.dataset.del); ctx.update(p); }
    note = ''; draw();
  };
  draw();
}
