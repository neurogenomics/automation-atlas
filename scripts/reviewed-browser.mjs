// Synthetic, loopback-only lifecycle test. No account or protocol backend.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {fixture,seal} from '../tests/helpers/reviewed.mjs';
import {canonical} from '../lib/reviewed/json.js';
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const origin=`http://127.0.0.1:${port}`,dir=await mkdtemp(join(tmpdir(),'reviewed-browser-'));
const server=spawn(process.execPath,['scripts/dev.mjs'],{env:{PATH:process.env.PATH,PORT:String(port)},stdio:['ignore','pipe','pipe']});let logs='';server.stdout.on('data',x=>logs+=x);server.stderr.on('data',x=>logs+=x);
let browser;
try {
 for(let n=0;n<100;n++){try{if((await fetch(origin+'/web/index.html')).ok)break;}catch{}if(n===99)throw Error(logs);await new Promise(r=>setTimeout(r,100));}
 const options={headless:true};
 if(process.env.BROWSER_DEPS_DIR){const d=process.env.BROWSER_DEPS_DIR;options.env={...process.env,LD_LIBRARY_PATH:(await readFile(join(d,'library-path'),'utf8')).trim(),FONTCONFIG_FILE:join(d,'fonts.conf')};}
 browser=await chromium.launch(options);const page=await browser.newPage({acceptDownloads:true});const errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(origin+'/web/index.html#reviewed');await page.locator('#reviewed-file').waitFor({state:'attached'});
 const storage=await page.evaluate(()=>JSON.stringify({...localStorage}));
 const input=await seal(await fixture(),'Transfer 10 µl from source tube to recipient tube.\n');const text=input.record.operations[0].source_spans[0].quote;
 const original={schema:'lab-mcp/protocol-export/1',collection_id:Number(input.record.source.collection_id),version:{id:Number(input.record.source.version_id)},content_hash:input.record.source.export_hash,steps:[{guid:'synthetic-step',text}]};
 const upload=async(value,selector='#reviewed-file')=>page.locator(selector).setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.isBuffer(value)?value:Buffer.from(canonical(value))});
 const assess=async()=>{await page.locator('#reviewed-assess').click();await page.locator('#reviewed-export-assessment').waitFor();};
 await upload(input);await page.locator('#reviewed-assess').waitFor();await assess();assert.match(await page.locator('#reviewed-result').innerText(),/Structural preview/);
 const download=async selector=>{const promise=page.waitForEvent('download');await page.locator(selector).click();const d=await promise,p=join(dir,d.suggestedFilename());await d.saveAs(p);return JSON.parse(await readFile(p,'utf8'));};
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>[e.tagName,e.id,e.className,e.getBoundingClientRect().width]).slice(0,20))));await page.setViewportSize({width:1280,height:900});
 const saved=await download('#reviewed-save');assert.equal(saved.schema,'lab-automation-planner/reviewed-workspace/1');
 const output=await download('#reviewed-export-assessment');assert.equal(output.operations[0].consumption_uL,'10');assert.equal(output.authority.execution_allowed,false);
 await upload(original,'#reviewed-legacy-file');await page.locator('#reviewed-export-comparison').waitFor();const comparison=await download('#reviewed-export-comparison');assert.equal(comparison.legacy_actions[0].volume_uL,null);assert.equal(comparison.reviewed_operations[0].movement.amount.value,'10');assert.equal(comparison.authoritative,false);
 // File re-open has no cached scientific approval or previous computed result.
 await page.reload();await page.locator('#reviewed-file').waitFor({state:'attached'});assert.equal(await page.locator('#reviewed-assess').count(),0);
 await upload(saved);await page.locator('#reviewed-assess').waitFor();assert.equal(await page.locator('#reviewed-export-assessment').count(),0);await assess();
 await upload({...saved,assessment:{approved:true}});await page.waitForFunction(()=>document.querySelector('#reviewed-message').textContent.includes('Not imported'));assert.equal(await page.locator('#reviewed-export-assessment').count(),1);
 for(const bytes of [Buffer.from([0xef,0xbb,0xbf,123,125]),Buffer.from([0xc3,0x28]),Buffer.from('{"a":1,"a":2}'),Buffer.from('{"a":1.0}')]){await upload(bytes);await page.waitForFunction(()=>document.querySelector('#reviewed-message').textContent.includes('Not imported'));}
 // Invalid JSON stays editable across routing rather than breaking draw().
 await page.locator('#reviewed-run').fill('{invalid');await page.locator('#reviewed-default').click();await page.locator('a[data-view="reviewed"]').click();await page.locator('#reviewed-run').waitFor();assert.equal(await page.locator('#reviewed-run').inputValue(),'{invalid');
 await page.locator('#reviewed-run').fill(JSON.stringify(input.run));await assess();
 // Artificially delay WebCrypto, exercising real asynchronous production paths.
 const hold=async reject=>page.evaluate(reject=>{const original=crypto.subtle.digest.bind(crypto.subtle);window.releaseDigest=null;crypto.subtle.digest=async(...args)=>{crypto.subtle.digest=original;await new Promise(r=>window.releaseDigest=r);if(reject)throw Error('Synthetic delayed failure');return original(...args);};},reject);
 const release=async()=>{await page.waitForFunction(()=>typeof window.releaseDigest==='function');await page.evaluate(()=>window.releaseDigest());await page.waitForTimeout(100);};
 for(const fail of [false,true]){
  await hold(fail);await page.locator('#reviewed-assess').click();await page.waitForFunction(()=>typeof window.releaseDigest==='function');await page.locator('#reviewed-run').fill(JSON.stringify({...input.run,cardinalities:{per_sample:2}}));await release();assert.equal(await page.locator('#reviewed-export-assessment').count(),0);assert.match(await page.locator('#reviewed-message').innerText(),/Inputs changed/);await page.locator('#reviewed-run').fill(JSON.stringify(input.run));await assess();
 }
 for(const selector of ['#reviewed-save','#reviewed-export-assessment']){
  let downloads=0;const listener=()=>downloads++;page.on('download',listener);await hold(false);await page.locator(selector).click();await page.waitForFunction(()=>typeof window.releaseDigest==='function');await page.locator('#reviewed-run').fill(JSON.stringify({...input.run,cardinalities:{per_sample:3}}));await release();assert.equal(downloads,0);page.off('download',listener);await page.locator('#reviewed-run').fill(JSON.stringify(input.run));await assess();
 }
 // Late failed import/comparison cannot replace the newer successful result.
 for(const selector of ['#reviewed-file','#reviewed-legacy-file']){
  await hold(true);await upload(selector==='#reviewed-file'?input:original,selector);await page.waitForFunction(()=>typeof window.releaseDigest==='function');await page.locator('#reviewed-run').fill(JSON.stringify(input.run));await assess();await release();assert.equal(await page.locator('#reviewed-export-assessment').count(),1);assert.match(await page.locator('#reviewed-message').innerText(),/Assessment recomputed/);
 }
 // An old mount must not revive after sidebar away and back.
 await hold(true);await page.locator('#reviewed-assess').click();await page.waitForFunction(()=>typeof window.releaseDigest==='function');await page.locator('a[data-view="decide"]').click();await page.locator('#reviewed-workspace').waitFor({state:'detached'});await page.locator('a[data-view="reviewed"]').click();await assess();await release();assert.match(await page.locator('#reviewed-message').innerText(),/Assessment recomputed/);
 // Restore previous import and default-mode rollback, without profile storage.
 const other=await fixture({moved:'5',residual:'25',final:'12'});await upload(other);await page.waitForFunction(()=>document.querySelector('#reviewed-message').textContent.startsWith('Imported'));await page.locator('#reviewed-restore').click();await assess();assert.equal((await download('#reviewed-export-assessment')).operations[0].consumption_uL,'10');
 assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage})),storage);await page.locator('#reviewed-default').click();await page.waitForFunction(()=>location.hash==='#decide');await page.locator('#reviewed-workspace').waitFor({state:'detached'});assert.equal(await page.locator('#reviewed-workspace').count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('Reviewed browser lifecycle: import, strict bytes, assess, save/reopen/export, comparison, stale async successes/failures, rollback and private storage all passed.');
}finally{await browser?.close();server.kill('SIGTERM');await rm(dir,{recursive:true,force:true});}
