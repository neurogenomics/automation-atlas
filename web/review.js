// A timings review (#105): lab members read each step of the protocol as the
// planner understood it, with the time it assumes, and say whether that is
// how long it takes them. Answers save as they go and the lab can see them.
import {api, account, esc, download} from './store.js';
import {signInPanel, labState} from './lab.js';

const VERDICTS = [['right', 'About right'], ['longer', 'Takes longer'], ['shorter', 'Takes less'], ['different', 'We do it differently'], ['unsure', 'Not sure']];
const AS_RUN = [['yes', 'Yes'], ['mostly', 'Mostly'], ['no', 'No']];
const mins = r => r == null ? '—' : r.lo === r.hi ? fmt(r.lo) : r.hi < 90 ? `${Math.round(r.lo)}–${Math.round(r.hi)} min` : `${fmt(r.lo)}–${fmt(r.hi)}`;
function fmt(m) { if (m == null) return '—'; if (m < 90) return `${Math.round(m)} min`; const h = m / 60; return `${h < 10 ? h.toFixed(1).replace(/\.0$/, '') : Math.round(h)} h`; }
const label = (list, v) => list.find(x => x[0] === v)?.[1] || '';
const median = xs => { const s = xs.filter(x => x != null).sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

export function mountReview(el, ctx, params = {}) {
  const id = params.id;
  el.innerHTML = `<section class='pg'><p class='sub'><a href='#lab'>← Lab</a></p><div id='rv'><p class='sub'>Loading…</p></div></section>`;
  const box = el.querySelector('#rv');
  let data = null;
  const timers = {};
  const load = async () => {
    try {
      const s = await labState();
      if (!s) { box.innerHTML = signInPanel('read and answer this review'); return; }
      if (s.me.status !== 'active') { box.innerHTML = `<p class='notice bad'>Only lab members can open this review. ${s.me.status === 'pending' ? 'Ask the lab owner to admit you.' : ''}</p>`; return; }
      data = await api(`reviews/${encodeURIComponent(id)}`);
      draw();
    } catch (e) { box.innerHTML = `<p class='notice bad'>${esc(e.message)}</p>`; }
  };
  const mine = stepId => data.responses.find(r => r.stepId === stepId && r.userId === data.me) || {};
  const others = stepId => data.responses.filter(r => r.stepId === stepId && r.userId !== data.me);
  const draw = () => {
    const {review: r} = data, p = r.packet, w = p.workflow, open = r.status === 'open';
    const unit = w.batch === 1 ? w.workloadLabel.replace(/s$/, '') : w.workloadLabel;
    const o = mine('_overall');
    box.innerHTML = `
      <h2>${esc(r.title)}</h2>
      <p class='lede'>Sent by ${esc(r.author)} on ${esc(new Date(r.createdAt).toLocaleDateString())}. ${open ? '' : '<strong>This review is closed.</strong>'}</p>
      <div class='notice'>
        <p><strong>What we are asking.</strong> The Automation Atlas reads our protocol and estimates how long each step takes when done by hand, to work out what automation would save. These times are guesses until people who run the protocol check them.</p>
        <p>For each step below: is the time about right for how <em>you</em> run it? If not, give your own minutes and say what is different. Skip any step you have never done. Your answers save as you go, and the rest of the lab can see them.</p>
      </div>
      <h3>The protocol</h3>
      <p>${esc(w.name)}: times for one batch of <strong>${esc(w.batch)} ${esc(unit)}</strong>${w.labware ? `, in ${esc(w.labware)}` : ''}.</p>
      <ul>${w.protocols.map(x => `<li>${x.url ? `<a href='${esc(x.url)}' target='_blank' rel='noopener'>${esc(x.name || x.id)}</a>` : esc(x.name || x.id)}${x.versionNumber != null ? ` <small style="display:inline">version ${esc(x.versionNumber)}</small>` : ''}</li>`).join('')}</ul>
      <p>The planner’s total: <strong>${mins(p.totals.handsOn)}</strong> hands-on (including desk work), <strong>${mins(p.totals.elapsed)}</strong> from start to finish, coming back to the bench ${esc(p.totals.visits?.lo ?? '?')} times.</p>
      <h3>What the planner assumes</h3>
      <ul class='rv-assume'>${p.assumptions.map(a => `<li>${esc(a.text)}</li>`).join('')}</ul>
      <div class='card' data-step='_overall'>
        <h4>Overall</h4>
        <fieldset class='opts'><legend>Is this the protocol as you run it?</legend><span class='seg'>${AS_RUN.map(([v, t]) => `<label><input type='radio' name='asRun' value='${v}' ${o.asRun === v ? 'checked' : ''} ${open ? '' : 'disabled'}>${t}</label>`).join('')}</span></fieldset>
        <div class='row'><label>How many ${esc(w.workloadLabel)} do you usually run in one batch?<input type='number' name='batch' min='0' value='${esc(o.batch ?? '')}' ${open ? '' : 'disabled'}></label></div>
        <label>Anything missing, different or wrong in the protocol or the assumptions above?<textarea name='comment' rows='3' ${open ? '' : 'disabled'}>${esc(o.comment || '')}</textarea></label>
        <p class='sub rv-saved'></p>
        ${othersHtml('_overall')}
      </div>
      ${r.canManage ? summaryHtml() : ''}
      <h3>Step by step (${p.steps.length})</h3>
      ${p.steps.map((s, i) => stepHtml(s, i, open)).join('')}`;
  };
  const othersHtml = stepId => {
    const xs = others(stepId);
    if (!xs.length) return '';
    return `<div class='rv-others'><p class='sub'>Others in the lab:</p><ul>${xs.map(x => `<li><strong>${esc(x.name)}</strong>: ${esc(x.stepId === '_overall' ? [label(AS_RUN, x.asRun) && `as run: ${label(AS_RUN, x.asRun)}`, x.batch != null && `batch of ${x.batch}`].filter(Boolean).join(', ') : [label(VERDICTS, x.verdict), x.handsOnMin != null && `${fmt(x.handsOnMin)} hands-on`, x.waitMin != null && `${fmt(x.waitMin)} waiting`].filter(Boolean).join(', '))}${x.comment ? ` · “${esc(x.comment)}”` : ''}</li>`).join('')}</ul></div>`;
  };
  const stepHtml = (s, i, open) => {
    const a = mine(s.id);
    return `<div class='card rv-step' data-step='${esc(s.id)}'>
      <h4>${i + 1}. ${esc(s.name)} ${s.url ? `<small style="display:inline"><a href='${esc(s.url)}' target='_blank' rel='noopener'>${esc(s.protocol || 'protocol')}${s.position != null ? `, step ${esc(s.position)}` : ''}</a></small>` : ''}</h4>
      <details><summary>The protocol says (${s.lines.length} line${s.lines.length === 1 ? '' : 's'})</summary><ol class='rv-lines'>${s.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ol></details>
      <p class='rv-plan'><strong>The planner assumes:</strong> ${mins(s.handsOn)} hands-on${s.desk && s.desk.hi ? `, plus ${mins(s.desk)} desk work` : ''}${s.waits.length ? `; waiting ${s.waits.map(x => `${mins(x.minutes)} (${esc(x.label.length > 70 ? x.label.slice(0, 68) + '…' : x.label)}, ${esc(x.basisText)})`).join('; ')}` : '; no waiting'}.${s.observed ? ` Observed in Labstep runs: median ${fmt(s.observed.medianMin)} (${esc(s.observed.n)} runs).` : ''}</p>
      ${s.questions.length ? `<p class='sub'>The planner also asks: ${s.questions.map(q => esc(q.text)).join(' ')}</p>` : ''}
      <fieldset class='opts'><legend>Are these times right for how you do it?</legend><span class='seg rv-verdict'>${VERDICTS.map(([v, t]) => `<label><input type='radio' name='verdict-${esc(s.id)}' data-field='verdict' value='${v}' ${a.verdict === v ? 'checked' : ''} ${open ? '' : 'disabled'}>${t}</label>`).join('')}</span></fieldset>
      <div class='row'><label>Your hands-on minutes<input type='number' min='0' data-field='handsOnMin' value='${esc(a.handsOnMin ?? '')}' ${open ? '' : 'disabled'}></label><label>Your waiting minutes (if different)<input type='number' min='0' data-field='waitMin' value='${esc(a.waitMin ?? '')}' ${open ? '' : 'disabled'}></label></div>
      <label>What is different? (optional)<textarea rows='2' data-field='comment' ${open ? '' : 'disabled'}>${esc(a.comment || '')}</textarea></label>
      <p class='sub rv-saved'></p>
      ${othersHtml(s.id)}
    </div>`;
  };
  const summaryHtml = () => {
    const p = data.review.packet, people = new Set(data.responses.map(x => x.userId)).size;
    return `<div class='card rv-summary'><h4>Answers so far (${people} ${people === 1 ? 'person' : 'people'})</h4>
      <div class='tbl-wrap'><table class='tbl'><thead><tr><th>Step</th><th>Planner hands-on</th><th>Answers</th><th>Their hands-on (median)</th></tr></thead><tbody>
      ${p.steps.map((s, i) => { const xs = data.responses.filter(x => x.stepId === s.id); return `<tr><td>${i + 1}. ${esc(s.name)}</td><td>${mins(s.handsOn)}</td><td>${xs.length ? esc(VERDICTS.map(([v, t]) => [t, xs.filter(x => x.verdict === v).length]).filter(x => x[1]).map(x => `${x[0]} ×${x[1]}`).join(', ') || 'comment only') : '—'}</td><td>${fmt(median(xs.map(x => x.handsOnMin)))}</td></tr>`; }).join('')}
      </tbody></table></div>
      <p><button class='btn ghost' data-csv>Download all answers (CSV)</button> <button class='btn ghost' data-status='${data.review.status === 'open' ? 'closed' : 'open'}'>${data.review.status === 'open' ? 'Close the review' : 'Reopen the review'}</button></p></div>`;
  };
  const save = async card => {
    const stepId = card.dataset.step, msg = card.querySelector('.rv-saved');
    const val = f => card.querySelector(`[data-field='${f}']`)?.value ?? '';
    const body = stepId === '_overall'
      ? {stepId, asRun: card.querySelector("input[name='asRun']:checked")?.value || '', batch: card.querySelector("input[name='batch']").value, comment: card.querySelector("textarea[name='comment']").value}
      : {stepId, verdict: card.querySelector("input[data-field='verdict']:checked")?.value || '', handsOnMin: val('handsOnMin'), waitMin: val('waitMin'), comment: val('comment')};
    msg.textContent = 'Saving…';
    try {
      const {response} = await api(`reviews/${encodeURIComponent(id)}/responses`, 'PUT', body);
      const i = data.responses.findIndex(x => x.stepId === stepId && x.userId === data.me);
      const row = {stepId, userId: data.me, name: account.user?.name || 'You', updatedAt: Date.now(), ...response};
      if (i >= 0) data.responses[i] = row; else data.responses.push(row);
      msg.textContent = 'Saved.';
    } catch (e) { msg.textContent = `Not saved: ${e.message}`; msg.classList.add('bad'); }
  };
  const queue = (card, delay) => { clearTimeout(timers[card.dataset.step]); timers[card.dataset.step] = setTimeout(() => save(card), delay); };
  el.onchange = ev => { const card = ev.target.closest('[data-step]'); if (card) queue(card, 0); };
  el.oninput = ev => { const card = ev.target.closest('[data-step]'); if (card && ev.target.matches('textarea,input[type=number]')) queue(card, 900); };
  el.onclick = async ev => {
    const t = ev.target;
    if (t.closest('[data-signin]')) return account.signIn();
    if (t.closest('[data-csv]')) return download(`review-${id}.csv`, csv(data), 'text/csv');
    const s = t.closest('[data-status]');
    if (s) { try { await api(`reviews/${encodeURIComponent(id)}/status`, 'POST', {status: s.dataset.status}); load(); } catch (e) { alert(e.message); } }
  };
  load();
}

// One row per answer, with the planner's figures beside it.
export function csv(data) {
  const p = data.review.packet, cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['step', 'step name', 'person', 'answer', 'their hands-on min', 'their waiting min', 'planner hands-on min (low)', 'planner hands-on min (high)', 'planner waiting min', 'usual batch', 'comment', 'answered']];
  for (const x of data.responses) {
    const s = p.steps.find(s => s.id === x.stepId);
    const wait = s ? s.waits.reduce((t, w) => t + (w.minutes?.lo || 0), 0) : '';
    rows.push([x.stepId, s?.name || 'Overall', x.name, x.stepId === '_overall' ? label(AS_RUN, x.asRun) : label(VERDICTS, x.verdict), x.handsOnMin ?? '', x.waitMin ?? '', s?.handsOn.lo ?? '', s?.handsOn.hi ?? '', wait, x.batch ?? '', x.comment || '', new Date(x.updatedAt).toISOString()]);
  }
  return rows.map(r => r.map(cell).join(',')).join('\n') + '\n';
}
