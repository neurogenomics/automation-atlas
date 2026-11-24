// Synthetic real-browser routing regression (#289), no external services or app test hooks.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {snapshotFromText} from '../lib/snapshots.js';
import {setupOptions} from '../lib/work.js';
import {planningFixture} from './planning-fixtures.mjs';
import pipettes from '../content/pipettes.json' with {type: 'json'};
import decks from '../content/decks.json' with {type: 'json'};

const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const origin=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['scripts/dev.mjs'],{env:{PATH:process.env.PATH,PORT:String(port)},stdio:['ignore','pipe','pipe']});
let logs='',browser;server.stdout.on('data',x=>logs+=x);server.stderr.on('data',x=>logs+=x);
const first=snapshotFromText('Existing synthetic protocol','1. Add 10 uL buffer.');
const existing={version:1,protocols:[first],workflows:[{id:'existing-workflow',name:'Existing workflow',parts:[{source:'text',id:first.id,versionId:first.version.id}],labware:'tube-1.5',format:'tube',defaultWorkload:3,workloadLabel:'samples'}],equipment:[{id:'existing-ot2',name:'Existing OT-2',modelId:'ot2',owner:'Synthetic owner',access:'yes',options:{'heating-cooling':'no','magnetic-separation':'no'}}],setups:[],answers:{'existing-answer':'preserve-me'}};
const imported={schema:'lab-mcp/protocol-export/1',source:'labstep',collection_id:900001,name:'Synthetic imported source',version:{id:900002,number:1,locked_at:'2026-10-01T00:00:00Z'},steps:[{guid:'synthetic-step',position:1,title:'Synthetic addition',text:'Synthetic addition\nAdd 10 uL of buffer.'}]};
imported.content_hash='sha256:'+createHash('sha256').update(`[[${JSON.stringify(imported.steps[0].guid)}, ${JSON.stringify(imported.steps[0].text)}]]`).digest('hex');
const errors=[],external=[];
const profile=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('atlas-profile-v1')));
const preserve=async page=>{const p=await profile(page);for(const k of ['equipment','setups','answers'])assert.deepEqual(p[k],existing[k]);assert.deepEqual(p.protocols[0],first);assert.deepEqual(p.workflows[0],existing.workflows[0]);assert.deepEqual(p.protocols[1],imported);};
const selected=async(page,id,count)=>{await page.waitForFunction(([id,count])=>document.querySelector('#dc-protocol')?.value===id&&document.querySelector('#dc-workload')?.value===String(count),[id,count]);};
async function newPage(holdAccount=false, initial=existing, missing=null){
 const context=await browser.newContext();const page=await context.newPage();
 await context.addInitScript(p=>{if(!localStorage.getItem('atlas-profile-v1'))localStorage.setItem('atlas-profile-v1',JSON.stringify(p));},initial);
 page.on('pageerror',e=>errors.push(e.message));let release,accountHeld=false;
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin!==origin){external.push(u.href);return route.abort();}
  if(missing && u.pathname===missing.path)return route.fulfill({json:missing.data});
  if(holdAccount&&u.pathname==='/api/me'){
   accountHeld=true;await new Promise(r=>release=r);return route.fulfill({json:{storage:true,user:{name:'Synthetic account'},login:{enabled:false}}});
  }
  if(holdAccount&&u.pathname==='/api/profile')return route.fulfill({json:{profile:await profile(page)}});
  if(holdAccount&&u.pathname==='/api/lab/protocols')return route.fulfill({json:{protocols:[],updatedAt:'synthetic-refresh'}});
  if(holdAccount&&u.pathname==='/api/lab/equipment')return route.fulfill({json:{equipment:[],canEdit:false}});
  return route.continue();
 });
 await page.goto(origin+'/web/index.html#protocols');
 if(holdAccount){
  // Navigate using ordinary browser hashes while initial account loading is pending.
  await page.waitForFunction(()=>document.readyState==='complete');
  assert(accountHeld);await page.evaluate(()=>location.hash='equipment');await page.locator('h2').waitFor();
  await page.locator('a[data-view="protocols"]').click();
 }
 await page.locator('#pr-files').waitFor();
 return {context,page,releaseAccount:()=>release()};
}
async function makeSecond(page){
 await page.locator('#pr-files').setInputFiles({name:'synthetic-source.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});
 await page.locator('input[data-pick="labstep:900001"]').check();
 await page.locator('#wf-name').fill('Seven specimen workflow');await page.locator('#wf-labware').selectOption('tube-1.5');
 await page.locator('#wf-batch').fill('7');await page.locator('#wf-unit').fill('specimens');await page.locator('#wf-new button').click();
 const p=await profile(page);assert.equal(p.workflows.length,2);const made=p.workflows[1];assert.equal(made.defaultWorkload,7);await preserve(page);return made;
}
try{
 for(let n=0;n<100;n++){try{if((await fetch(origin+'/web/index.html')).ok)break;}catch{}if(n===99)throw Error(logs);await new Promise(r=>setTimeout(r,100));}
 const options={headless:true};if(process.env.BROWSER_DEPS_DIR){const d=process.env.BROWSER_DEPS_DIR;options.env={...process.env,LD_LIBRARY_PATH:(await readFile(join(d,'library-path'),'utf8')).trim(),FONTCONFIG_FILE:join(d,'fonts.conf')};}
 browser=await chromium.launch(options);
 {
  const raw = snapshotFromText('Synthetic wash comparison', [
   '1. Wash', 'Spin down for 2 min.', 'Add 10 uL water.', 'Spin down for 6 min.',
   '2. Pool', 'Pool water from wells into the collection tube.',
  ].join('\n'));
  const pin = {source:'text', id:raw.id, versionId:raw.version.id};
  const proposal = {id:'compare-wash', label:'Review wash routes', substitution:'spin-as-magnetic-capture',
   targets:[{...pin,position:1,bodyLine:1}], washComparison:{retainedMaterial:'Inert particles'}};
  const workflow = {...existing.workflows[0], parts:[pin], variants:[proposal]};
  const {context,page} = await newPage(false,{...existing,protocols:[raw],workflows:[workflow]});
  const card = page.locator('[data-workflow-card="existing-workflow"]');
  await card.locator(':scope > summary').click();
  await card.getByText('Review wash routes · 1 proposed, 1 kept',{exact:true}).click();
  const download = page.waitForEvent('download');
  await card.getByRole('button',{name:'Download private comparison'}).click();
  const comparison = JSON.parse(await readFile(await (await download).path(),'utf8'));
  assert.equal(comparison.routes.length,6);
  assert.equal(comparison.poolBoundaries.length,1);
  assert.ok(comparison.routes.every(route => route.metrics===null && !route.executionAllowed));
  const replay = card.getByLabel('Verify a saved comparison');
  const upload = record => replay.setInputFiles({name:'comparison.json',mimeType:'application/json',
   buffer:Buffer.from(JSON.stringify(record))});
  await upload(comparison);
  await card.getByText('Saved comparison matches this workflow and its current assessment.',{exact:true}).waitFor();
  await upload({...comparison,context:{...comparison.context,planningWorkload:99}});
  await card.getByText(/Workflow context changed · planning workload/).waitFor();
  await card.getByText('Matched run observations',{exact:true}).click();
  const templateDownload = page.waitForEvent('download');
  await card.getByRole('button',{name:'Download observation template'}).click();
  const observed = JSON.parse(await readFile(await (await templateDownload).path(),'utf8'));
  Object.assign(observed,{output_unit:'test output',qc_ref:'fixture QC',candidate:{method:'filter',execution:'machine-assisted'}});
  const [pair] = observed.pairs;
  Object.assign(pair,{matching_ref:'same fixture input',inputs_per_run:10});
  for (const [arm, minutes, passing] of [['manual',20,10],['candidate',5,0]]) {
   const run = pair[arm];
   Object.assign(run,{evidence_ref:arm+' fixture',outputs_attempted:10,outputs_passing:passing,failed:passing===0});
   for (const key of Object.keys(run.operator_minutes)) run.operator_minutes[key]=key==='active_processing' ? minutes : 0;
  }
  const observationsUpload = record => card.getByLabel('Summarize observed runs').setInputFiles({name:'observations.json',
   mimeType:'application/json',buffer:Buffer.from(JSON.stringify(record))});
  await observationsUpload(observed);
  await card.getByText('Observed results',{exact:true}).waitFor();
  const effort = card.getByRole('row').filter({hasText:'Operator minutes per QC-passing output'});
  assert.deepEqual(await effort.getByRole('cell').allTextContents(),['2','Unavailable']);
  await observationsUpload({...observed,comparison:{...comparison,context:{...comparison.context,planningWorkload:99}}});
  await card.locator('[data-wash-observation-summary]').getByText(/Workflow context changed · planning workload/).waitFor();
  assert.equal(await card.getByText('Observed results',{exact:true}).count(),0);
  assert.deepEqual((await profile(page)).workflows,[workflow]);
  await context.close();
 }
 {
  const alternative = snapshotFromText('Synthetic alternatives',
    '1. Alternatives\nFor First route: Add 10 uL of water.\nFor Second route: Add 20 uL of buffer.');
  const workflow = {...existing.workflows[0], parts: [{source:'text',id:alternative.id,versionId:alternative.version.id}]};
  const {context,page} = await newPage(false, {...existing, protocols:[alternative],workflows:[workflow]});
  const card = page.locator('[data-workflow-card="existing-workflow"]');
  await card.locator(':scope > summary').click();
  const picker = card.locator('select[data-branch-step]');
  assert.equal(await picker.inputValue(), '');
  await picker.selectOption('Second route');
  const saved = (await profile(page)).workflows[0].branches;
  assert.deepEqual(Object.values(saved), ['Second route']);
  await page.reload();
  await card.locator(':scope > summary').click();
  assert.equal(await picker.inputValue(), 'Second route');
  await card.getByRole('button', {name:'Assess',exact:true}).click();
  await page.locator('.dc-alternatives').getByText('Second route', {exact:true}).waitFor();
  await page.locator('a[data-view="protocols"]').click();
  await card.locator(':scope > summary').click();
  await picker.selectOption('');
  assert.deepEqual((await profile(page)).workflows[0].branches, {});
  await context.close();
 }
 {
  const optional = snapshotFromText('Synthetic dependent stage', [
   '1. Handler setup', 'Optional: Preliminary rinse', 'Add 13 uL water.', 'Mix by pipetting.',
   'Fluid exchange (shared)', 'If preliminary rinse was performed, add 17 uL buffer.',
   'For fluid exchange only, add 29 uL buffer.', 'Transfer 12 uL to a new tube.',
  ].join('\n'));
  const workflow = {...existing.workflows[0], parts: [{source:'text',id:optional.id,versionId:optional.version.id}]};
  const {context,page} = await newPage(false, {...existing, protocols:[optional],workflows:[workflow]});
  const card = page.locator('[data-workflow-card="existing-workflow"]');
  await card.getByRole('button', {name:'Assess',exact:true}).click();
  await page.getByText(/Choose the dependent protocol alternatives before assessing/).waitFor();
  assert.equal(await page.locator('#dc-protocol').count(), 0);
  assert.equal(new URL(page.url()).hash, '#protocols');
  await card.locator('select[data-branch-step]').selectOption('Include Preliminary rinse');
  await card.getByRole('button', {name:'Assess',exact:true}).click();
  await page.locator('.dc-alternatives').getByText('Include Preliminary rinse', {exact:true}).waitFor();
  await context.close();
 }
 {
  const condition = 'If the QC trace shows a low peak, add 17 uL water.';
  const otherwise = 'Otherwise, record status.';
  const snapshot = snapshotFromText('Synthetic QC decision', ['1. Inspect', 'Check the trace.', condition, otherwise].join('\n'));
  const workflow = {...existing.workflows[0], parts: [{source:'text', id:snapshot.id, versionId:snapshot.version.id}]};
  const other = {...existing.workflows[0], id:'available-workflow', name:'Another available workflow'};
  const {context,page} = await newPage(false, {...existing, protocols:[snapshot, first], workflows:[workflow, other]});
  const card = page.locator('[data-workflow-card="existing-workflow"]');
  await card.locator(':scope > summary').click();
  await card.getByRole('heading', {name:'Quality-control decisions'}).waitFor();
  const outcome = card.getByRole('listitem').filter({hasText: condition});
  await outcome.getByText(condition, {exact:true}).waitFor();
  await outcome.getByText(otherwise, {exact:true}).waitFor();
  await card.getByRole('button', {name:'Assess', exact:true}).click();
  await page.getByText(/Review the quality-control gates on the workflow card/).waitFor();
  assert.equal(new URL(page.url()).hash, '#protocols');
  assert.equal(await page.locator('#dc-protocol').count(), 0);
  await context.close();
 }
 {
  const {context,page}=await newPage();const made=await makeSecond(page);
  // Observe DOM mounts, not private app functions. The changed hash must mount Decide once.
  await page.evaluate(()=>{window.decisionMounts=0;new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n.id==='dc-main')window.decisionMounts++;}).observe(document.querySelector('#view'),{childList:true});});
  await page.locator(`button[data-assess="${made.id}"]`).click();await selected(page,made.id,7);
  await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.decisionMounts),1);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('automation-decide-v3')).protocolId),made.id);
  // No input change is needed to make the initial Assess selection survive reload.
  await page.reload();await selected(page,made.id,7);await preserve(page);
  await page.locator('#dc-workload').fill('9');await page.locator('#dc-workload').press('Tab');
  await page.reload();await selected(page,made.id,9);
  await page.locator('a[data-view="protocols"]').click();await page.locator('button[data-assess="existing-workflow"]').click();await selected(page,'existing-workflow',3);
  // Native History API changes the URL without hashchange. The still-mounted form
  // now exercises ctx.go's same-hash path through its actual public Assess button.
  await page.locator('a[data-view="protocols"]').click();await page.locator(`button[data-assess="${made.id}"]`).waitFor();await page.evaluate(()=>history.replaceState(null,'','#decide'));
  await page.locator(`button[data-assess="${made.id}"]`).click();await selected(page,made.id,7);
  await page.reload();await selected(page,made.id,7);await preserve(page);
  // A browser render failure must not commit the newly requested selection.
  const saved=await page.evaluate(()=>localStorage.getItem('automation-decide-v3'));
  await page.locator('a[data-view="protocols"]').click();await page.locator('button[data-assess="existing-workflow"]').waitFor();
  await page.evaluate(()=>{const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');Object.defineProperty(Element.prototype,'innerHTML',{...descriptor,set(value){if(this.id==='dc-main'){Object.defineProperty(Element.prototype,'innerHTML',descriptor);throw Error('Synthetic render failure');}return descriptor.set.call(this,value);}});});
  await page.locator('button[data-assess="existing-workflow"]').click();await page.getByText('Could not show this page: Synthetic render failure').waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('automation-decide-v3')),saved);
  await context.close();
 }
 {
  const {context,page,releaseAccount}=await newPage(true);const made=await makeSecond(page);
  await page.locator(`button[data-assess="${made.id}"]`).click();await selected(page,made.id,7);
  const old=await page.locator('#dc-main').elementHandle();releaseAccount();
  await page.waitForFunction(()=>document.querySelector('#account strong')?.textContent==='Synthetic account');
  await page.waitForFunction(el=>!el.isConnected,old);await selected(page,made.id,7);await preserve(page);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('automation-decide-v3')).protocolId),made.id);
  await context.close();
 }
 {
  const {context,page}=await newPage();
  const capture=(number,{draft=false,id=900010+number,day=number,text='Record status '+number+'.'}={})=>{
   const raw={...imported,version:{id,number,locked_at:draft?null:'2026-10-01T00:00:00Z',is_draft:draft},
    retrieved_at:`2026-10-${String(day).padStart(2,'0')}T00:00:00Z`,
    steps:[{...imported.steps[0],title:'Synthetic task',text,prescribedSeconds:17}]};
   raw.content_hash='sha256:'+createHash('sha256').update(`[[${JSON.stringify(raw.steps[0].guid)}, ${JSON.stringify(text)}]]`).digest('hex');
   return raw;
  };
  const upload=async raw=>{
   await page.locator('#pr-files').setInputFiles({name:'synthetic-provenance.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(raw))});
  };
  const one=capture(1,{draft:true}), two=capture(2), three=capture(3,{draft:true});
  await upload({...one,content_hash:'sha256:'+'1'.repeat(64)});
  await page.getByText(/step GUIDs or text do not match/).waitFor();
  assert.equal((await profile(page)).protocols.length,1);
  await upload(one);
  await page.locator('button[data-review="labstep:900001"]').click();
  await page.getByText(/Captured at export: 2026-10-01T00:00:00/).waitFor();
  await page.locator('input[data-pick="labstep:900001"]').check();
  await page.locator('#wf-name').fill('Exact draft workflow');
  await page.locator('#wf-labware').selectOption('tube-1.5');
  await page.locator('#wf-batch').fill('4');
  await page.locator('#wf-new button').click();
  const w=(await profile(page)).workflows.at(-1);
  assert.deepEqual(w.parts,[{source:'labstep',id:900001,versionId:one.version.id,contentHash:one.content_hash}]);
  await page.locator('a[data-view="decide"]').click();
  await selected(page,'existing-workflow',3);
  assert.equal(await page.locator(`#dc-protocol option[value="${w.id}"]`).count(),0);
  await page.locator('a[data-view="protocols"]').click();
  const assess=page.locator(`button[data-assess="${w.id}"]`);
  page.once('dialog',d=>d.dismiss());
  await assess.click();
  assert.match(page.url(),/#protocols$/);
  page.once('dialog',d=>d.accept());
  await assess.click();
  await selected(page,w.id,4);
  await page.getByText('Draft assessment:',{exact:true}).waitFor();
  await page.reload();
  await selected(page,'existing-workflow',3);
  assert.equal(await page.locator(`#dc-protocol option[value="${w.id}"]`).count(),0);

  await page.locator('a[data-view="protocols"]').click();
  await upload({...one,retrieved_at:'2026-10-04T00:00:00Z',steps:[{...one.steps[0],prescribedSeconds:18}]});
  await page.getByText(/conflicts with the stored version/).waitFor();
  assert.equal((await profile(page)).protocols.at(-1).steps[0].prescribedSeconds,17);
  await upload({...one,retrieved_at:'2026-10-04T00:00:00Z',has_unpublished_draft:true});
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('atlas-profile-v1')).protocols.at(-1).has_unpublished_draft);
  await upload(two);
  const compare=page.locator(`button[data-repin="${w.id}"]`);
  await compare.click();
  assert.equal(await page.locator('.repin-steps td:first-child pre').textContent(),one.steps[0].text);
  assert.equal(await page.locator('.repin-steps td:last-child pre').textContent(),two.steps[0].text);
  assert.equal((await profile(page)).workflows.at(-1).parts[0].versionId,one.version.id);
  await upload(three);
  await page.waitForFunction(id=>JSON.parse(localStorage.getItem('atlas-profile-v1')).protocols.at(-1).version.id===id,three.version.id);
  await page.locator('button[data-repin-confirm]').click();
  await page.getByText(/changed after the comparison/).waitFor();
  assert.equal((await profile(page)).workflows.at(-1).parts[0].versionId,one.version.id);
  await upload(two);
  await page.getByText(/version 2 cannot replace version 3/).waitFor();
  await upload(capture(4,{id:one.version.id}));
  await page.getByText(/reuses a version ID/).waitFor();
  await compare.click();
  assert.equal(await page.locator('.repin-steps td:first-child pre').textContent(),one.steps[0].text);
  assert.equal(await page.locator('.repin-steps td:last-child pre').textContent(),three.steps[0].text);
  await page.locator('button[data-repin-confirm]').click();
  assert.equal((await profile(page)).workflows.at(-1).parts[0].versionId,three.version.id);
  assert.equal((await profile(page)).workflows.at(-1).parts[0].contentHash,three.content_hash);
  assert.deepEqual((await profile(page)).protocolArchive.map(x=>x.version.id),[one.version.id,two.version.id]);
  await page.locator('a[data-view="decide"]').click();
  assert.equal(await page.locator(`#dc-protocol option[value="${w.id}"]`).count(),0);
  await page.locator('a[data-view="protocols"]').click();
  const otherOne={...capture(1),collection_id:900002}, otherTwo={...capture(2),collection_id:900002};
  await upload(otherOne);
  await page.locator('input[data-pick="labstep:900002"]').waitFor();
  await upload(otherTwo);
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('atlas-profile-v1')).protocolArchive.some(r=>r.collection_id===900002));
  const remove=async()=>{
   const confirmation=new Promise(resolve=>page.once('dialog',async d=>{const message=d.message();await d.accept();resolve(message);}));
   await page.locator('button[data-del-protocol="labstep:900001"]').click();
   assert.match(await confirmation,/2 archived copies and 1 dependent workflow/);
  };
  await page.evaluate(()=>{
   const set=Storage.prototype.setItem;
   Storage.prototype.setItem=function(key,value){
    if(key==='atlas-profile-v1'){Storage.prototype.setItem=set;throw new DOMException('Synthetic storage refusal','QuotaExceededError');}
    return set.call(this,key,value);
   };
  });
  await remove();
  await page.getByText(/browser could not save/).waitFor();
  assert.equal((await profile(page)).protocolArchive.length,3);
  await remove();
  await page.getByText(/deleted its archived copies/).waitFor();
  await page.reload();
  await page.locator('input[data-pick="labstep:900002"]').waitFor();
  const saved=await profile(page);
  assert.deepEqual(saved.protocols,[first,otherTwo]);
  assert.deepEqual(saved.protocolArchive,[otherOne]);
  assert.deepEqual(saved.workflows,existing.workflows);
  await context.close();
 }
 {
  const context=await browser.newContext();
  const page=await context.newPage();
  const before={...imported};
  const after={...imported,version:{...imported.version,id:900003,number:2},
   steps:[{...imported.steps[0],text:'Record the revised status.'}]};
  after.content_hash='sha256:'+createHash('sha256').update(`[[${JSON.stringify(after.steps[0].guid)}, ${JSON.stringify(after.steps[0].text)}]]`).digest('hex');
  const remoteWorkflow={...existing.workflows[0],id:'hosted-workflow',name:'Hosted archive workflow',
   parts:[{source:'labstep',id:before.collection_id,versionId:before.version.id,contentHash:before.content_hash}]};
  const latest={...after,version:{...after.version,id:900004,number:3}};
  let requested=0, synced, hosted=after;
  await context.addInitScript(p=>localStorage.setItem('atlas-profile-v1',JSON.stringify(p)),existing);
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.origin!==origin){external.push(u.href);return route.abort();}
   if(u.pathname==='/api/me')return route.fulfill({json:{storage:true,user:{name:'Synthetic member'}}});
   if(u.pathname==='/api/profile'){
    if(route.request().method()==='PUT'){synced=route.request().postDataJSON();return route.fulfill({json:{ok:true}});}
    return route.fulfill({json:{profile:{...existing,workflows:[remoteWorkflow]}}});
   }
   if(u.pathname==='/api/lab/equipment')return route.fulfill({json:{equipment:[],canEdit:false}});
   if(u.pathname==='/api/lab/protocols')return route.fulfill({json:{protocols:[{...hosted,lab:{pushedAt:42}}]}});
   if(u.pathname==='/api/lab/protocols/900001/versions/900002'){
    requested++;
    return route.fulfill({json:{protocol:{...before,lab:{pushedAt:24}}}});
   }
   return route.continue();
  });
  await page.goto(origin+'/web/index.html#protocols');
  const compareHosted=page.locator('button[data-repin="hosted-workflow"]');
  await compareHosted.waitFor();
  const labRow=page.locator('tr').filter({has:page.locator('input[data-pick="labstep:900001"]')});
  assert.equal(await labRow.locator('td').nth(2).textContent(),'2');
  assert.equal(await labRow.locator('button[data-del-protocol]').count(),0);
  const denied=new Promise(resolve=>page.once('dialog',async d=>{const message=d.message();await d.accept();resolve(message);}));
  const oldBackup={...existing,protocols:[first,before]};
  await page.locator('#import-file').setInputFiles({name:'older-profile.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(oldBackup))});
  assert.match(await denied,/version 1 cannot replace version 2/);
  assert.equal(await labRow.locator('td').nth(2).textContent(),'2');
  assert.deepEqual((await profile(page)).protocols,[first]);
  await compareHosted.click();
  await page.locator('.repin-steps').waitFor();
  assert.equal(requested,1);
  assert.equal(await page.locator('.repin-steps td:first-child pre').textContent(),before.steps[0].text);
  assert.equal(await page.locator('.repin-steps td:last-child pre').textContent(),after.steps[0].text);
  hosted=latest;
  await page.locator('button[data-repin-confirm]').click();
  await page.getByText(/changed after the comparison/).waitFor();
  assert.equal((await profile(page)).workflows[0].parts[0].versionId,before.version.id);
  await page.locator('button[data-repin="hosted-workflow"]').click();
  await page.locator('.repin-steps').waitFor();
  const push=page.waitForResponse(r=>r.url()===origin+'/api/profile'&&r.request().method()==='PUT');
  await page.locator('button[data-repin-confirm]').click();
  await push;
  assert.deepEqual((await profile(page)).protocols,[first]);
  assert.deepEqual((await profile(page)).protocolArchive,[]);
  assert.equal(synced.protocols,undefined);
  assert.equal(synced.protocolArchive,undefined);
  assert.equal(synced.workflows[0].parts[0].versionId,latest.version.id);
  await context.close();
 }
 {
  const raw=snapshotFromText('Synthetic method selection','1. Preparing samples\nAdd 50 µl buffer to each well.\n'+
   Array(8).fill('Mix by low speed vortexing.').join('\n'));
  const w={id:'synthetic-method',name:'Synthetic method',parts:[{source:'text',id:raw.id,versionId:raw.version.id}],
   format:'plate',labware:'plate-96-pcr',defaultWorkload:384,portfolio:{include:true}};
  const setup={id:'synthetic-flex',name:'Synthetic Flex',handler:'flex',route:'deck',
   pipettes:setupOptions('flex','deck').pipettes[0].id,modules:['Heater-Shaker']};
  const {context,page}=await newPage(false,{...existing,protocols:[raw],workflows:[w],equipment:[],setups:[setup]});
  await page.locator('a[data-view="decide"]').click();
  const decide=page.locator('#dc-methods'), portfolio=page.locator('#pf-methods');
  const decideQuestion=page.locator("[data-question$=':method:agitation-as-shaking']");
  const portfolioQuestion=page.locator('#dc-portfolio').getByText(/Can orbital shaking replace vortexing/);
  const off=async()=>{
   await selected(page,w.id,384);
   assert.equal(await decide.isChecked(),false);
   assert.equal(await portfolio.isChecked(),false);
   assert.equal(await decideQuestion.count(),0);
   assert.equal(await portfolioQuestion.count(),0);
  };
  await off();
  const decision={protocolId:w.id,workload:384,scope:'design',objective:'labour',facts:{},methodChanges:true};
  await page.evaluate(d=>localStorage.setItem('automation-decide-v2',JSON.stringify(d)),decision);
  await page.reload();
  await off();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('automation-decide-v3')).methodChanges),false);
  await page.evaluate(d=>{
   localStorage.setItem('automation-decide-v3',JSON.stringify({...d,methodChanges:'true'}));
   localStorage.setItem('automation-portfolio-method-changes-v1',JSON.stringify('true'));
  },decision);
  await page.reload();
  await off();
  await decide.check();
  await decideQuestion.waitFor();
  assert.equal(await portfolio.isChecked(),false);
  assert.equal(await portfolioQuestion.count(),0);
  await portfolio.check();
  await portfolioQuestion.waitFor({state:'attached'});
  await page.reload();
  await selected(page,w.id,384);
  assert.equal(await decide.isChecked(),true);
  assert.equal(await portfolio.isChecked(),true);
  await decideQuestion.waitFor();
  await portfolioQuestion.waitFor({state:'attached'});
  await decide.uncheck();
  assert.equal(await portfolio.isChecked(),true);
  assert.equal(await decideQuestion.count(),0);
  await portfolio.uncheck();
  await page.reload();
  await off();
  await context.close();
 }
 {
  const raw=snapshotFromText('Synthetic setup comparison','1. Generic additions\n'+
   Array(12).fill('Add 10 µl buffer to each well.').join('\n'));
  const w={id:'synthetic-config',name:'Synthetic setup comparison',parts:[{source:'text',id:raw.id,versionId:raw.version.id}],
   format:'plate',labware:'plate-96-pcr',defaultWorkload:384,portfolio:{include:true,runsPerYear:24}};
  const configured=(id,name,handler)=>({id,name,handler,route:'deck',pipettes:setupOptions(handler,'deck').pipettes[0].id});
  const setups=[configured('saved-flex','Saved Flex configuration','flex'),configured('other','Other assessed setup','starlet')];
  const equipment=[{id:'installed-flex',name:'Synthetic installed Flex',modelId:'flex',options:{}}];
  const profile={...existing,protocols:[raw],workflows:[w],equipment,setups};
  for(const [file,records,reason] of [['pipettes',pipettes,/missing pipette configuration/],['decks',decks,/missing deck capacity/]]){
   const data=structuredClone(records);
   delete data.handlers.flex;
   const {context,page}=await newPage(false,profile,{path:`/content/${file}.json`,data});
   await page.locator('a[data-view="decide"]').click();
   await selected(page,w.id,384);
   const decide=page.locator('#dc-main'), portfolio=page.locator('#dc-portfolio');
   await decide.getByText(/Equipment with insufficient data/).click();
   await decide.locator('details[open]').getByText(reason).first().waitFor();
   await portfolio.getByRole('heading',{name:'Setups with insufficient data'}).waitFor();
   await portfolio.locator('li').filter({hasText:'Saved Flex configuration'}).getByText(reason).waitFor();
   assert.equal(await portfolio.getByRole('row').filter({hasText:'Saved Flex configuration'}).count(),0);
   await portfolio.getByRole('row').filter({hasText:'Other assessed setup'}).waitFor();
   assert.equal(await portfolio.getByText(/unknown pipette configuration/).count(),0);
   await context.close();
  }
 }
 {
  const fixture=volume=>({schema:'planner/text-import/1',id:'physical-fixture',name:'Synthetic ledger fixture',version:{id:1},
   steps:Array.from({length:11},(_,i)=>({position:i+1,title:`Symbolic task ${i+1}`,text:`Add ${i===10?20:volume} µl water.`}))});
  const raw=fixture(20);
  const w={id:'physical-fixture',name:raw.name,parts:[{source:'text',id:raw.id,versionId:raw.version.id}],format:'plate',
   labware:'plate-96-pcr',defaultWorkload:384,portfolio:{include:true,runsPerYear:24}};
  const setup={id:'saved',name:'Synthetic configured setup',handler:'flex',route:'deck',pipettes:setupOptions('flex','deck').pipettes[0].id};
  const {context,page}=await newPage(false,{...existing,protocols:[raw],workflows:[w],equipment:[],setups:[setup]});
  await page.locator('a[data-view="decide"]').click();
  await selected(page,w.id,384);
  const decide=page.locator('#dc-main'), portfolio=page.locator('#dc-portfolio');
  const automation=decide.getByRole('row').filter({hasText:'Repeated actions done by the instrument'});
  const credit=decide.locator('.dc-sentence'), result=portfolio.getByRole('row').filter({hasText:setup.name});
  const acknowledge=decide.getByRole('button',{name:'Acknowledge',exact:true});
  await acknowledge.waitFor();
  assert.match(await automation.textContent(),/40 of 44/);
  await portfolio.getByRole('heading',{name:'Impossible protocol actions'}).waitFor();
  const before=[await credit.textContent(),await result.textContent()];
  await acknowledge.click();
  await decide.getByText('Acknowledged. Still blocked.').waitFor();
  assert.match(await automation.textContent(),/40 of 44/);
  assert.deepEqual([await credit.textContent(),await result.textContent()],before);
  const replace=async next=>{
   await page.evaluate(raw=>{
    const p=JSON.parse(localStorage.getItem('atlas-profile-v1'));
    p.protocols=[raw];
    localStorage.setItem('atlas-profile-v1',JSON.stringify(p));
   },next);
   await page.reload();
   await selected(page,w.id,384);
  };
  await replace(fixture(15));
  assert.match(await automation.textContent(),/44 of 44/);
  assert.equal(await acknowledge.count(),0);
  assert.equal(await portfolio.getByRole('heading',{name:'Impossible protocol actions'}).count(),0);
  await replace({...raw,steps:[{...raw.steps[0],text:'Add 250 µl water.'}]});
  await decide.getByText('No recommendation yet').waitFor();
  await decide.getByRole('heading',{name:'Physical checks'}).waitFor();
  await acknowledge.waitFor();
  await portfolio.getByRole('heading',{name:'Impossible protocol actions'}).waitFor();
  await context.close();
 }
 {
  const raw=snapshotFromText('Synthetic unverified range','1. Generic additions\n'+
   Array(12).fill('Add 10 µl water to each well.').join('\n'));
  const w={id:'synthetic-range',name:'Synthetic range',parts:[{source:'text',id:raw.id,versionId:raw.version.id}],
   format:'plate',labware:'plate-96-pcr',defaultWorkload:384,portfolio:{include:true,runsPerYear:24}};
  const setups=[{id:'saved-range',name:'Saved configuration',handler:'flex',route:'deck',pipettes:setupOptions('flex','deck').pipettes[0].id}];
  const equipment=[{id:'installed-range',name:'Synthetic installed Flex',modelId:'flex',access:'yes'}];
  const data=structuredClone(pipettes);
  for(const head of data.handlers.flex.heads){head.minUl='1';head.maxUl=null;}
  const {context,page}=await newPage(false,{...existing,protocols:[raw],workflows:[w],equipment,setups},{path:'/content/pipettes.json',data});
  await page.locator('a[data-view="decide"]').click();
  await selected(page,w.id,384);
  const decide=page.locator('#dc-main'), portfolio=page.locator('#dc-portfolio');
  await decide.getByText('No recommendation yet').waitFor();
  await decide.getByText(/Not assessed: pipette head range is unverified/).first().waitFor();
  await portfolio.getByRole('heading',{name:'Setups with insufficient data'}).waitFor();
  await portfolio.getByText(/Not assessed: pipette head range is unverified/).waitFor();
  assert.equal(await portfolio.getByRole('row').filter({hasText:'Saved configuration'}).count(),0);
  await context.close();
 }
 {
  const {protocol} = planningFixture('grouped', 'accessible');
  const {context,page} = await newPage(false, {
    ...existing, equipment: [], protocols: protocol.snapshots, workflows: [protocol.workflow],
  });
  await page.locator('a[data-view="equipment"]').click();
  await page.getByRole('button', {name:'Add an instrument', exact:true}).click();
  await page.locator('#eq-model').selectOption('plr-hamilton-star');
  assert.equal(await page.locator('#eq-head-status').inputValue(), 'unknown');
  await page.locator('#eq-head-status').selectOption('reported');
  await page.locator('[data-installed-head="1000ul-channels"]').fill('8');
  await page.locator('#eq-name').fill('Synthetic exact installation');
  await page.locator('#eq-access').selectOption('yes');
  await page.getByRole('button', {name:'Save', exact:true}).click();
  const [saved] = (await profile(page)).equipment;
  assert.deepEqual(saved.installedHeads, {status:'reported', heads:[{id:'1000ul-channels', channels:8}]});
  await page.reload();
  await page.locator('a[data-view="decide"]').click();
  await selected(page, protocol.workflow.id, 192);
  await page.locator('button[data-scope="accessible"]').click();
  await page.getByText('No recommendation yet').waitFor();
  await page.locator('a[data-view="equipment"]').click();
  await page.getByRole('button', {name:'Edit', exact:true}).click();
  assert.equal(await page.locator('[data-installed-head="1000ul-channels"]').inputValue(), '8');
  await page.locator('#eq-head-status').selectOption('confirmed');
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.locator('a[data-view="decide"]').click();
  await page.getByText(/1000 µL independent CO-RE channels \(×8\)/).first().waitFor();
  assert.equal(await page.getByText('No recommendation yet').count(), 0);
  await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log(JSON.stringify({assess_button_selected_correct_workflow:true,changed_hash_single_mount:true,same_hash_assess:true,initial_selection_reload:true,edited_count_reload:true,failed_render_preserves_saved_request:true,delayed_account_refresh:true,source_and_unrelated_profile_preserved:true,exact_draft_session:true, archived_before_after:true, hosted_history_stays_out_of_profile:true, older_backup_cannot_hide_hosted:true, removed_private_protocol_purges_its_archive:true, stale_comparison_refused:true, default_and_persisted_method_opt_ins:true, missing_equipment_excluded_in_decide_and_portfolio:true, physical_acknowledgement_keeps_credit_blocked:true, unverified_head_ranges_have_no_assessed_rank:true, installed_head_evidence_persisted:true, javascript_errors:0,external_requests:0}));
}finally{await browser?.close();server.kill('SIGTERM');}
