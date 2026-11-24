import {esc, download} from './store.js';
import {parseReview, canonical, MAX_BYTES, hash} from '../lib/reviewed/json.js';
import {admit, bindingOf, INPUT_PROFILE} from '../lib/reviewed/input.js';
import {assess} from '../lib/reviewed/assessment.js';
import {legacyDiagnostic} from './reviewed-comparison.js';

const session = {input:null, previous:null, result:null, legacy:null, run:'', configs:'', epoch:0, message:''};
const pretty = v => JSON.stringify(v, null, 2);
const display = v => v === null || v === undefined ? 'Unknown' : typeof v === 'object' ? `${v.numerator}/${v.denominator}` : String(v);
async function fileText(file) {
  if (!file || file.size > MAX_BYTES) throw Error('File exceeds the 2 MiB compact-input limit.');
  return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await file.arrayBuffer());
}
function candidate() {
  if (!session.input) throw Error('Import a reviewed record first.');
  return {...session.input,run:parseReview(session.run),configurations:parseReview(session.configs)};
}
function adopt(input) {
  session.previous = session.input ? {input:structuredClone(session.input),run:session.run,configs:session.configs} : null;
  session.input=input;session.run=pretty(input.run);session.configs=pretty(input.configurations);session.result=null;session.legacy=null;
}
export function mountReviewed(el,ctx) {
  session.epoch++;
  let alive=true;
  const active=()=>alive && el.querySelector('#reviewed-workspace')?.isConnected && location.hash.split('/')[0] === '#reviewed';
  const current=epoch=>epoch===session.epoch && active();
  function counts(){try{return parseReview(session.run)?.cardinalities || {};}catch{return {};}}
  function resultHTML() {
    const a=session.result;if(!a)return '<p id="assessment-status">No current assessment. Assess after importing or changing inputs.</p>';
    return `<h2>Assessment</h2><p id="assessment-status">Structural preview · overall feasibility not established · execution disabled</p>
      <p>Source/revision: ${esc(a.binding.source.collection_id)} / ${esc(a.binding.source.version_id)} / ${esc(a.binding.revision_id)}. Native source hashes and portable approval claims are unverified here. Connected review authority stays in the Protocol Portal.</p>
      <h3>Explicit movements</h3><div class="reviewed-table"><table><thead><tr><th>Operation</th><th>Kind / intent</th><th>Requested movement per run (µL)</th><th>Accounting</th></tr></thead><tbody>${a.operations.map(o=>`<tr><td>${esc(o.operation_id)}</td><td>${esc(o.declared.kind)} / ${esc(o.declared.movement?.intent || 'unsupported')}</td><td>${esc(display(o.consumption_uL))}</td><td>${esc(o.status)} · stock ${esc(o.stock_sufficiency || 'unknown')}</td></tr>`).join('')}</tbody></table></div>
      <p>Movement amounts are separate from final vessel totals. Internal transfers are not automatically reagent purchase consumption. No durations, costs or automation savings are invented.</p>
      <h3>Material states and physical instances</h3><div class="reviewed-table"><table><thead><tr><th>State / location</th><th>Aggregate µL</th><th>Original contributors / amounts</th><th>Physical layout</th></tr></thead><tbody>${a.states.map(s=>`<tr><td>${esc(s.declared.id)} / ${esc(s.declared.location_id)}${s.current?' (current)':''}</td><td>${esc(display(s.aggregate_uL))}</td><td>${esc(s.contributor_ids?.join(', ')||'Unknown')}<br>${esc(s.components_uL?Object.entries(s.components_uL).map(([id,q])=>`${id}: ${display(q)}`).join('; '):'Component partition unknown')}</td><td>${esc(s.layout?s.layout.map(x=>`${x.instance_id}: ${display(x.amount_uL)} µL; capacity ${display(x.capacity_uL)}; ${x.fits===true?'fits':x.fits===false?'EXCEEDS':'unknown'}`).join('; '):'Layout unknown')}</td></tr>`).join('')}</tbody></table></div><p>Contributor IDs describe ancestry. After a partial mixture withdrawal they do not guarantee current composition or target retention.</p>
      <h3>Selected configuration checks</h3>${a.configurations.length?a.configurations.map(c=>`<h4>${esc(c.id)} (${esc(c.revision)})</h4><ul>${c.operations.map(o=>`<li>${esc(o.operation_id)}: ${esc(o.status)}</li>`).join('')}</ul>`).join(''):'<p>No configuration supplied; technical fit unknown.</p>'}<p>These compare the stated quantity basis with a head range, not a pipetting stroke or dispense schedule. Capacity checks above are separate per-instance checks. They do not establish scientific compatibility, installed modules, access, a schedule or overall feasibility.</p>
      <h3>Losses, unknowns and blockers</h3><ul>${a.findings.map(f=>`<li><strong>${esc(f.code)}</strong> ${esc(f.path)}: ${esc(f.message)}</li>`).join('')}</ul>
      <button id="reviewed-export-assessment">Export private assessment</button><details><summary>Inspect full assessment and retained meaning</summary><pre>${esc(pretty(a))}</pre></details>`;
  }
  function comparisonHTML() {
    const d=session.legacy;
    return d?`<h3>Source-bound legacy diagnostic</h3><p>${d.difference.legacy_action_count} legacy actions / ${d.difference.reviewed_operation_count} reviewed operations. Counts need not correspond one-to-one.</p><div class="reviewed-table"><table><thead><tr><th>Legacy action</th><th>Heuristic amount µL</th></tr></thead><tbody>${d.legacy_actions.map(a=>`<tr><td>${esc(a.line)}</td><td>${esc(display(a.volume_uL))}</td></tr>`).join('')}</tbody></table></div><p>${esc(d.limits.join(' '))}</p><details><summary>Inspect differential report</summary><pre>${esc(pretty(d))}</pre></details><button id="reviewed-export-comparison">Export private differential report</button>`:'<p id="legacy-status">Legacy comparison unavailable: upload the matching original source export explicitly. Reviewed prose is never reparsed by the assessment.</p>';
  }
  function draw() {
    if(!alive)return;
    el.innerHTML=`<section id="reviewed-workspace"><h1>Reviewed assessment</h1><p class="notice">Explicit opt-in mode. Work stays in memory in this tab, never in your account or browser storage. Save a private file before reloading. The usual planner and profile remain unchanged.</p>
      <p><button id="reviewed-import">Import / reopen private file</button> <input id="reviewed-file" type="file" accept=".json" hidden> <button id="reviewed-default">Return to default planner</button></p>
      <p role="status" id="reviewed-message">${esc(session.message)}</p>
      ${session.input?`<h2>${esc(session.input.record.title)}</h2><p>Revision ${esc(session.input.record.revision_id)} · schema ${esc(session.input.record.schema_version)}. Correct protocol meaning in its review authority, then import the new revision.</p>
      <div class="form-row">${['per_sample','per_container','per_batch'].map(k=>`<label>${esc(k.replaceAll('_',' '))} count <input data-cardinality="${k}" type="number" min="1" max="1000000" value="${esc(counts()[k]??'')}"></label>`).join('')}</div>
      <details open><summary>Run cardinalities and physical layout</summary><p>Each layout slot needs an explicit identity, units of the state basis, and capacity_uL (decimal string or null). Slot units must sum to that basis cardinality. A total-basis shared source has one unit; eight sample wells each have one per-sample unit. No layout is inferred.</p><label>Run JSON<textarea id="reviewed-run" rows="12" spellcheck="false">${esc(session.run)}</textarea></label></details>
      <details open><summary>Selected configurations</summary><p>Enter an array of configurations: id, revision, head {min_uL, max_uL}, evidence, availability (unknown/available/unavailable). Limits remain decimal strings; null means unknown. Different configurations are never combined into one imaginary instrument.</p><label>Configuration JSON<textarea id="reviewed-configs" rows="9" spellcheck="false">${esc(session.configs)}</textarea></label></details>
      <p><button id="reviewed-assess">Assess declared inputs</button> <button id="reviewed-save">Save private workspace / backup</button> <button id="reviewed-restore" ${session.previous?'':'disabled'}>Restore previous import</button></p>
      <details><summary>Inspect immutable imported record</summary><pre>${esc(pretty(session.input.record))}</pre></details>
      <div id="reviewed-result">${resultHTML()}</div><h2>Separate legacy comparison</h2><button id="reviewed-legacy">Upload matching source export for comparison</button><input id="reviewed-legacy-file" type="file" accept=".json" hidden><div id="reviewed-comparison">${comparisonHTML()}</div>`:'<p>Import a compact assessment input, a canonical ReviewedProtocol 0.2 record, or a workspace saved here. Native source bundles are not accepted.</p>'}</section>`;
    wire();
  }
  function message(text) {session.message=text;if(active())el.querySelector('#reviewed-message').textContent=text;}
  function invalidate() {session.epoch++;session.result=null;session.legacy=null;el.querySelector('#reviewed-result').innerHTML=resultHTML();el.querySelector('#reviewed-comparison').innerHTML=comparisonHTML();message('Inputs changed. Previous assessment and comparison are no longer current.');}
  function wire() {
    el.querySelector('#reviewed-import').onclick=()=>el.querySelector('#reviewed-file').click();
    el.querySelector('#reviewed-default').onclick=()=>{alive=false;ctx.go('decide');};
    el.querySelector('#reviewed-file').onchange=async ev=>{
      const file=ev.target.files[0];ev.target.value='';if(!file)return;const epoch=++session.epoch;
      try {
        const raw=parseReview(await fileText(file));let input=raw;
        if(raw?.schema==='lab-automation-planner/reviewed-workspace/1'){if(Object.keys(raw).sort().join(',')!=='input,schema')throw Error('workspace_fields');input=raw.input;}
        else if(raw?.schema_version==='0.2.0')input={schema:INPUT_PROFILE,record:raw,binding:bindingOf(raw),run:{cardinalities:{},layout:{}},configurations:[],review_claims:[],upstream_findings:[]};
        await admit(input);if(epoch!==session.epoch||!active())return;adopt(input);session.message='Imported privately. No portable approval was adopted.';draw();
      } catch(e){if(!current(epoch))return;message(`Not imported (${e.code||'invalid_file'}). Existing workspace kept.`);}
    };
    if(!session.input)return;
    for(const [selector,key] of [['#reviewed-run','run'],['#reviewed-configs','configs']])el.querySelector(selector).oninput=ev=>{session[key]=ev.target.value;invalidate();};
    el.querySelectorAll('[data-cardinality]').forEach(node=>node.onchange=()=>{
      try {const run=parseReview(session.run);run.cardinalities[node.dataset.cardinality]=node.value===''?null:Number(node.value);session.run=pretty(run);el.querySelector('#reviewed-run').value=session.run;invalidate();}catch{message('Correct the run JSON before changing counts.');}
    });
    el.querySelector('#reviewed-assess').onclick=async()=>{
      const epoch=++session.epoch;message('Assessing declared inputs…');
      try {const result=await assess(candidate());if(epoch!==session.epoch||!active())return;session.result=result;session.message='Assessment recomputed. This is a structural preview, not approval or execution permission.';draw();}
      catch(e){if(!current(epoch))return;session.result=null;message(`Assessment rejected (${e.code||'invalid_input'}). Correct the inputs; no old result applies.`);el.querySelector('#reviewed-result').innerHTML=resultHTML();}
    };
    el.querySelector('#reviewed-save').onclick=async()=>{
      const epoch=session.epoch;
      try {const input=candidate();await admit(input);if(!current(epoch))return;const text=canonical({schema:'lab-automation-planner/reviewed-workspace/1',input});if(new TextEncoder().encode(text).length>MAX_BYTES)throw Error('limit');download('reviewed-workspace-private.json',text);message('Private workspace downloaded. Reopen validates the input and recomputes assessment.');}catch(e){if(!current(epoch))return;message(`Not saved (${e.code||'invalid_input'}).`);}
    };
    el.querySelector('#reviewed-restore').onclick=()=>{const previous=session.previous;if(!previous)return;session.epoch++;session.input=previous.input;session.run=previous.run;session.configs=previous.configs;session.previous=null;session.result=null;session.legacy=null;session.message='Previous import restored; reassess before using results.';draw();};
    el.querySelector('#reviewed-legacy').onclick=()=>el.querySelector('#reviewed-legacy-file').click();
    el.querySelector('#reviewed-legacy-file').onchange=async ev=>{
      const file=ev.target.files[0];ev.target.value='';if(!file)return;const epoch=++session.epoch;
      try {const input=candidate();await admit(input);const diagnostic=await legacyDiagnostic(await fileText(file),input);if(epoch!==session.epoch||!active())return;session.legacy=diagnostic;session.message='Separate source-bound legacy diagnostic generated; reviewed accounting is unchanged.';draw();}
      catch(e){if(!current(epoch))return;session.legacy=null;message(`Comparison unavailable (${e.code||'invalid_legacy'}).`);el.querySelector('#reviewed-comparison').innerHTML=comparisonHTML();}
    };
    el.querySelector('#reviewed-export-assessment')?.addEventListener('click',async()=>{
      const epoch=session.epoch, result=session.result;
      try {const input=candidate(), digest=await hash(input);if(!current(epoch))return;
        if(result && result===session.result && result.input_digest===digest)download('reviewed-assessment-private.json',canonical(result));
        else message('Assessment is stale. Reassess before exporting.');
      }catch{if(current(epoch))message('Assessment is stale. Reassess before exporting.');}
    });
    el.querySelector('#reviewed-export-comparison')?.addEventListener('click',()=>download('legacy-differential-private.json',canonical(session.legacy)));
  }
  draw();
}
