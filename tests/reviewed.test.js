import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {parseReview,canonical,hash,interpretationDigest,MAX_BYTES} from '../lib/reviewed/json.js';
import {admit,assertPinnedKeywords} from '../lib/reviewed/input.js';
import {assess} from '../lib/reviewed/assessment.js';
import {fixture,seal,q,refreshPorts,appendMove,resultState} from './helpers/reviewed.mjs';
const corp = JSON.parse(await readFile(new URL('./fixtures/reviewed/independent-canonical-json-cases.json',import.meta.url),'utf8'));
for (const c of corp.valid) test('released canonical JSON: '+c.id,async()=>{assert.equal(canonical(c.value),c.canonical_utf8);assert.equal(await hash(c.value),c.sha256);});
for (const c of corp.invalid) test('reject original JSON: '+c.id,()=>assert.throws(()=>parseReview(c.raw_json),e=>e.code===c.expected_code));
test('pinned schema never silently accepts new keywords',()=>assert.throws(()=>assertPinnedKeywords({type:'string',maxLength:4}),e=>e.code==='contract_keyword_unsupported'));
test('occupied recipient keeps added amount, totals and component identity',async()=>{
 const a=await assess(await fixture());assert.equal(a.operations[0].consumption_uL,'10');
 assert.equal(resultState(a,'donor-after').aggregate_uL,'20');assert.equal(resultState(a,'recipient-after').aggregate_uL,'17');
 assert.deepEqual(resultState(a,'recipient-after').components_uL,{A:'10',B:'7'});assert.equal(a.overall_feasibility,'not_established');
});
test('distinct same-named material identities never collapse',async()=>{
 const i=await fixture({recipient:'0',final:'10'});i.record.materials.forEach(m=>m.name='Synthetic liquid');
 i.record.locations.push({id:'third',name:'Third',kind:'tube'});
 i.record.states.push({id:'B-stock',material_id:'B',location_id:'third',description:'stock',quantity:q('40'),lineage:[]});
 appendMove(i,{id:'pool',donor:'B-stock',recipient:'recipient-after',moved:'20',residual:'20',final:'30',material:'mixture-AB',depends:['transfer-1']});
 const a=await assess(await seal(i));assert.equal(resultState(a,'pool-donor-after').aggregate_uL,'20');assert.deepEqual(resultState(a,'pool-recipient-after').components_uL,{A:'10',B:'20'});
});
test('a reviewed collection followed by redistribution keeps the shared ancestry', async () => {
 const i=await fixture({recipient:'0',final:'10'});
 for (const [id,kind] of [['second-donor','well'],['new-well','well']]) {
  i.record.locations.push({id,name:id,kind});
  i.run.layout[id]=[{id:id+'-slot',units:1,capacity_uL:'100'}];
 }
 i.record.states.push(
  {id:'another-water',material_id:'B',location_id:'second-donor',description:'Water source B',quantity:q('20'),lineage:[]},
  {id:'new-well-empty',material_id:null,location_id:'new-well',description:'Empty well',quantity:q('0'),lineage:[]});
 const pool=appendMove(i,{id:'collect',donor:'another-water',recipient:'recipient-after',moved:'20',residual:'0',final:'30',material:'mixture-AB',depends:['transfer-1']});
 const split=appendMove(i,{id:'redistribute',donor:pool.recipient,recipient:'new-well-empty',moved:'12',residual:'18',final:'12',material:'mixture-AB',depends:['collect']});
 const a=await assess(await seal(i));
 assert.deepEqual(resultState(a,pool.recipient).components_uL,{A:'10',B:'20'});
 assert.equal(resultState(a,split.donor).aggregate_uL,'18');
 assert.equal(resultState(a,split.recipient).aggregate_uL,'12');
 assert.deepEqual(resultState(a,split.recipient).contributor_ids,['A','B']);
 assert.equal(resultState(a,split.recipient).components_uL,null);
 assert.equal(a.authority.execution_allowed,false);
});
test('fractional and large significant quantities remain exact',async()=>{
 const i=await fixture({donor:'0.3',recipient:'0',moved:'0.1',residual:'0.2',final:'0.1'});
 appendMove(i,{id:'second',donor:'donor-after',recipient:'recipient-after',moved:'0.2',residual:'0',final:'0.3',material:'A',depends:['transfer-1']});
 assert.equal(resultState(await assess(await seal(i)),'second-donor-after').aggregate_uL,'0');
 const big=await fixture({donor:'9007199254740.993',recipient:'0',moved:'0.001',residual:'9007199254740.992',final:'0.001'});
 assert.equal(resultState(await assess(big),'donor-after').aggregate_uL,'9007199254740.992'); // equivalent nL oracle, released volume units
});
test('exact unit conversion',async()=>{
 const i=await fixture({donor:'0.001',recipient:'0',moved:'0.125',residual:'0.875',final:'0.125'});
 i.record.states[0].quantity.unit='mL';refreshPorts(i.record);
 assert.equal(resultState(await assess(await seal(i)),'donor-after').aggregate_uL,'0.875');
});
async function eight(layout) {
 const i=await fixture({donor:'200',recipient:'0',moved:'20',residual:'40',final:'20'});
 for(const idx of [1,3])i.record.states[idx].quantity.basis='per_sample';
 i.record.operations[0].movement.amount.basis='per_sample';i.run.cardinalities.per_sample=8;i.run.layout['tube-2']=layout;refreshPorts(i.record);return seal(i);
}
test('eight independent wells consume160 but each contains20',async()=>{
 const a=await assess(await eight(Array.from({length:8},(_,n)=>({id:'well-'+n,units:1,capacity_uL:'50'}))));
 assert.equal(a.operations[0].consumption_uL,'160');assert.equal(resultState(a,'donor-after').aggregate_uL,'40');
 assert.ok(resultState(a,'recipient-after').layout.every(s=>s.amount_uL==='20'&&s.fits));
});
test('eight samples in one physical destination exceed50',async()=>{
 const a=await assess(await eight([{id:'shared',units:8,capacity_uL:'50'}]));
 assert.equal(resultState(a,'recipient-after').layout[0].amount_uL,'160');assert.equal(resultState(a,'recipient-after').layout[0].fits,false);
});
test('unknown layout retains aggregate consumption; mismatch never invents slots',async()=>{
 const i=await eight(null);let a=await assess(i);assert.equal(a.operations[0].consumption_uL,'160');assert.equal(resultState(a,'recipient-after').layout,null);
 i.run.layout['tube-2']=[{id:'only-one',units:1,capacity_uL:'50'}];a=await assess(i);assert.ok(a.findings.some(f=>f.code==='layout_cardinality_mismatch'));
 delete i.run.cardinalities.per_sample;a=await assess(i);assert.equal(a.operations[0].consumption_uL,null);
});
test('known addition with unknown stock is not physical stock sufficiency',async()=>{
 const i=await fixture({donor:null,residual:null});const a=await assess(i);assert.equal(a.operations[0].consumption_uL,'10');assert.equal(a.operations[0].stock_sufficiency,'unknown');assert.equal(resultState(a,'donor-after').aggregate_uL,null);
});
test('zero movement does not add a donor contributor',async()=>{
 const a=await assess(await fixture({moved:'0',residual:'30',final:'7'}));assert.deepEqual(resultState(a,'recipient-after').components_uL,{B:'7'});assert.deepEqual(resultState(a,'recipient-after').contributor_ids,['B']);
});
test('explicit unrolled exchanges preserve inventories without claiming retention',async()=>{
 const i=await fixture({donor:'100',recipient:'10',moved:'20',residual:'80',final:'30'});
 i.record.locations.push({id:'waste',name:'Waste',kind:'vessel'});i.record.materials.push({id:'withdrawn',name:'Withdrawn mixture'});
 i.record.states.push({id:'waste-0',material_id:null,location_id:'waste',description:'empty',quantity:q('0'),lineage:[]});
 let source='donor-after',sample='recipient-after',waste='waste-0',prev='transfer-1';
 for(let n=1;n<=3;n++){
  const x=appendMove(i,{id:'remove-'+n,donor:sample,recipient:waste,moved:'20',residual:'10',final:String(n*20),material:'mixture-AB',depends:[prev]});sample=x.donor;waste=x.recipient;prev='remove-'+n;
  if(n<3){const y=appendMove(i,{id:'add-'+n,donor:source,recipient:sample,moved:'20',residual:String(80-n*20),final:'30',material:'mixture-AB',depends:[prev]});source=y.donor;sample=y.recipient;prev='add-'+n;}
 }
 const a=await assess(await seal(i));assert.equal(resultState(a,source).aggregate_uL,'40');assert.equal(resultState(a,sample).aggregate_uL,'10');assert.equal(resultState(a,waste).aggregate_uL,'60');assert.ok(a.findings.some(f=>f.code==='component_partition_unknown'));
});
test('stale donor and overlapping branches reject instead of replaying inventory',async()=>{
 const i=await fixture();appendMove(i,{id:'stale',donor:'donor-before',recipient:'recipient-after',moved:'10',residual:'20',final:'27',material:'mixture-AB',depends:['transfer-1']});
 await assert.rejects(assess(await seal(i)),e=>e.code==='state_double_use');
});
test('unknown head range stays unknown; portable approval changes no authority',async()=>{
 for (const head of [{min_uL:null,max_uL:null},{min_uL:'1',max_uL:null},{min_uL:null,max_uL:'100'}]) {
  const i=await fixture();i.configurations[0].head=head;i.review_claims=[{assurance:'local_authenticated',approved:true}];
  const a=await assess(i);assert.equal(a.configurations[0].operations[0].status,'technical_fit_unknown');
  assert.equal(a.configurations[0].operations[0].within_declared_range,null);
  assert.equal(a.configurations[0].overall_feasibility,'not_established');
  assert.equal(a.authority.execution_allowed,false);assert.equal(a.authority.status,'external_claims_only');
 }
});
test('unknown structured movement never reparses prose',async()=>{
 const i=await fixture({moved:null});i.record.operations[0].source_spans[0].quote='Synthetic note says 10uL';i.record.interpretation_digest=await interpretationDigest(i.record);i.binding.interpretation_digest=i.record.interpretation_digest;
 const a=await assess(i);assert.equal(a.operations[0].consumption_uL,null);
});
test('target retains exact operands and is not a final-total addition',async()=>{
 const i=await fixture({recipient:'5',final:'15'}),m=i.record.operations[0].movement;
 m.intent='make_up_to';m.target=q('15','final_target');m.derivation={rule:'target_minus_recipient_before',initial_state_id:'recipient-before',initial_quantity:structuredClone(i.record.states[1].quantity),target_quantity:structuredClone(m.target),provenance:structuredClone(m.amount.provenance)};
 let a=await assess(await seal(i));assert.equal(a.operations[0].consumption_uL,'10');m.derivation.initial_quantity.value='4';a=await assess(await seal(i));assert.equal(a.operations[0].consumption_uL,null);assert.ok(a.findings.some(f=>f.code==='movement_derivation'));
});
test('null movement, unknown version, tampered digest and stale binding fail safely',async()=>{
 for(const mutate of [i=>i.record.operations[0].movement=null,i=>i.record.schema_version='0.3.0',i=>i.record.title='tampered',i=>i.binding.revision_id='stale']){const i=await fixture();mutate(i);await assert.rejects(assess(i),e=>e.code&&!(e instanceof TypeError));}
});
test('unresolved control, flow, free-text conditions and delays remain explicit',async()=>{
 for(const mode of ['conditional','repeat','unknown']){const i=await fixture();i.record.operations[0].control.mode=mode;const a=await assess(await seal(i));assert.equal(a.operations[0].consumption_uL,null);assert.ok(a.findings.some(f=>f.code==='control_unsupported'));}
 const i=await fixture();i.record.operations[0].conditions=[{kind:'other',description:'50degrees and5bar simultaneously',quantity:null,known:true}];i.record.operations[0].constraints=[{kind:'max_delay',description:'No more than5minutes after other operation',quantity:{...q('300','duration'),dimension:'time',unit:'s'},after_operation_id:null,status:'known'}];const a=await assess(await seal(i));assert.ok(a.findings.some(f=>f.code==='condition_unassessed'));assert.ok(a.findings.some(f=>f.code==='schedule_required'));assert.equal(a.overall_feasibility,'not_established');
});
test('bounds and invalid RFC3339 rollover apply to in-process input',async()=>{
 const i=await fixture();i.record.created_at='2026-01-01T24:00:00Z';await assert.rejects(admit(i),e=>e.code==='schema_invalid');
 i.review_claims=['x'.repeat(MAX_BYTES)];await assert.rejects(admit(i),e=>e.code==='json_limit');
});
test('offline stdin CLI parity and malformed lexical refusal',async()=>{
 const i=await fixture();const child=spawnSync(process.execPath,['scripts/assess-reviewed.mjs'],{input:canonical(i),encoding:'utf8'});assert.equal(child.status,0,child.stderr);assert.deepEqual(JSON.parse(child.stdout),await assess(i));
 const bad=spawnSync(process.execPath,['scripts/assess-reviewed.mjs'],{input:'{"a":1,"a":2}',encoding:'utf8'});assert.equal(bad.status,2);assert.equal(JSON.parse(bad.stdout).error.code,'json_duplicate_key');
});

test('original stdin bytes reject BOM, malformed UTF8 and float tokens',()=>{
 for(const input of [Buffer.from([0xef,0xbb,0xbf,0x7b,0x7d]),Buffer.from([0xc3,0x28]),Buffer.from('{"a":1.0}'),Buffer.from('{"a":1e0}')]){
  const result=spawnSync(process.execPath,['scripts/assess-reviewed.mjs'],{input,encoding:'utf8'});assert.equal(result.status,2);assert.ok(JSON.parse(result.stdout).error.code);
 }
});
test('zero quantity is not a subminimum stroke; configurations remain separate',async()=>{
 const i=await fixture({moved:'0',residual:'30',final:'7'});i.configurations[0].head.min_uL='1';
 const a=await assess(i);assert.equal(a.configurations[0].operations[0].status,'not_applicable_zero_movement');
 const j=await fixture();j.configurations.push({...structuredClone(j.configurations[0]),id:'small',head:{min_uL:'1',max_uL:'5'}});
 const b=await assess(j);assert.equal(b.configurations[0].operations[0].status,'range_only_matches');assert.equal(b.configurations[1].operations[0].status,'outside_declared_range');
});
test('graph cycles, missing identities and false whole-state ports cannot produce a balanced result',async()=>{
 for(const mutate of [i=>i.record.operations[0].depends_on=['transfer-1'],i=>i.record.states[0].material_id='absent']){
  const i=await fixture();mutate(i);await assert.rejects(assess(await seal(i)),e=>e.code&&!(e instanceof TypeError));
 }
 const i=await fixture();i.record.operations[0].outputs[0].quantity.value='19';const a=await assess(await seal(i));assert.equal(a.operations[0].consumption_uL,null);assert.ok(a.findings.some(f=>f.code==='movement_port_total'));
});
test('unknown model preserves stated consumption without assuming additive balance',async()=>{
 const i=await fixture({final:'16.5'});i.record.operations[0].movement.model.kind='unknown';const a=await assess(await seal(i));assert.equal(a.operations[0].consumption_uL,'10');assert.equal(a.operations[0].status,'consumption_only');assert.equal(resultState(a,'recipient-after').aggregate_uL,null);
});
test('UI legacy comparison binds original text projection separately',async()=>{
 const {legacyDiagnostic}=await import('../web/reviewed-comparison.js');
 const i=await seal(await fixture(),'Add 10 µl buffer to recipient.\n'),text=i.record.operations[0].source_spans[0].quote;
 const raw={schema:'lab-mcp/protocol-export/1',collection_id:Number(i.record.source.collection_id),version:{id:Number(i.record.source.version_id)},content_hash:i.record.source.export_hash,steps:[{guid:'synthetic-step',text}]};
 const diagnostic=await legacyDiagnostic(canonical(raw),i);assert.ok(diagnostic.legacy_actions.length>0);assert.equal(diagnostic.reviewed_operations[0].movement.amount.value,'10');assert.equal(diagnostic.authoritative,false);
 raw.steps[0].text='Transfer 100 uL.';await assert.rejects(legacyDiagnostic(canonical(raw),i),e=>e.code==='legacy_export_hash_mismatch');
});
test('source-bound differential preserves legacy missed vessel-phrase quantity versus explicit10',async()=>{
 const {legacyDiagnostic}=await import('../web/reviewed-comparison.js');
 const i=await seal(await fixture(),'Transfer 10 µl from source tube to recipient tube.\n'),source=i.record.source;
 const raw={schema:'lab-mcp/protocol-export/1',collection_id:Number(source.collection_id),version:{id:Number(source.version_id)},content_hash:source.export_hash,steps:[{guid:'synthetic-step',text:i.record.operations[0].source_spans[0].quote}]};
 const d=await legacyDiagnostic(canonical(raw),i);assert.equal(d.legacy_actions[0].volume_uL,null);assert.equal(d.reviewed_operations[0].movement.amount.value,'10');assert.equal((await assess(i)).operations[0].consumption_uL,'10');assert.equal(d.authoritative,false);
});
test('negative declared state cannot become supported consumption by looking unknown',async()=>{
 const i=await fixture({residual:'-1'});const a=await assess(i);assert.equal(a.operations[0].consumption_uL,null);assert.ok(a.findings.some(f=>f.code==='quantity_negative'));
});
test('retained record can be reconstructed with its exact interpretation digest',async()=>{
 const i=await fixture(),a=await assess(i);const record={...a.record_metadata,...a.retained,states:a.states.map(s=>s.declared),operations:a.operations.map(o=>o.declared)};
 // Ledger order may be topological; this one-operation fixture preserves array order.
 assert.equal(await interpretationDigest(record),i.record.interpretation_digest);
});
test('near-boundary findings stay shared and configuration expansion refuses early',async()=>{
 const i=await fixture();i.upstream_findings=Array.from({length:2000},(_,n)=>({code:'retained-'+n,path:'',message:'Synthetic retained finding.'}));i.configurations=Array.from({length:50},(_,n)=>({...i.configurations[0],id:'config-'+n}));
 const a=await assess(i);assert.equal(a.findings.filter(f=>f.code.startsWith('upstream_')).length,2000);assert.ok(canonical(a).length<400000);assert.equal(a.configurations[0].operations[0].finding_scope,'transfer-1');assert.ok(a.finding_index.global.length>=2000);
 const j=await fixture();j.configurations=i.configurations;j.record.operations=Array.from({length:201},(_,n)=>({...j.record.operations[0],id:'op-'+n}));j.record.interpretation_digest=await interpretationDigest(j.record);j.binding.interpretation_digest=j.record.interpretation_digest;await assert.rejects(assess(j),e=>e.code==='assessment_expansion_limit');
});
