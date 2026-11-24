import {readFile} from 'node:fs/promises';
import {canonical, hash, hashText, interpretationDigest} from '../../lib/reviewed/json.js';
import {bindingOf, INPUT_PROFILE} from '../../lib/reviewed/input.js';
const base = JSON.parse(await readFile(new URL('../fixtures/reviewed/base.json', import.meta.url), 'utf8'));
export const q = (value, role = 'state_total', basis = 'total', unit = 'uL') => ({...structuredClone(base.states[0].quantity), value, role, basis, unit, unknown_reason: value === null ? 'Synthetic unknown amount.' : null});
export async function seal(input, prefix = '') {
  const r = input.record;
  const text = prefix + 'Synthetic software fixture statements. ' + canonical({states: r.states.map(s => ({id:s.id, material:s.material_id, location:s.location_id, value:s.quantity.value, unit:s.quantity.unit,basis:s.quantity.basis})), movements:r.operations.map(o => ({id:o.id,kind:o.kind,movement:o.movement && {intent:o.movement.intent,amount:o.movement.amount.value,unit:o.movement.amount.unit,basis:o.movement.amount.basis,model:o.movement.model.kind}}))});
  const span = {pointer:'/state/content/0',step_guid:'synthetic-step',quote:text};
  function spans(value) {
    if (!value || typeof value !== 'object') return;
    for (const [k,v] of Object.entries(value)) {
      if (k === 'source_spans' || k === 'evidence') { if (Array.isArray(v) && v.length) value[k] = [structuredClone(span)]; }
      else spans(v);
    }
  }
  spans(r);
  const native = {id:900002,protocol_collection:{id:900001},state:{type:'doc',content:[{type:'protocol_step',attrs:{guid:'synthetic-step'},content:[{type:'text',text}]}]}};
  r.source.version_hash = await hash(native);
  r.source.export_hash = await hashText('[' + '[' + JSON.stringify('synthetic-step') + ', ' + JSON.stringify(text) + ']' + ']');
  r.source.collection_hash = await hash({id:900001});
  r.coverage = [{pointer:'/state/content/0',status:'mapped',operation_ids:r.operations.map(o=>o.id),reason:null}];
  r.interpretation_digest = await interpretationDigest(r); input.binding = bindingOf(r);
  return input;
}
export async function fixture({donor='30', recipient='7', moved='10', residual='20', final='17', unit='uL', basis='total'} = {}) {
  const r = structuredClone(base);
  for (const [i,value] of [donor,recipient,residual,final].entries()) r.states[i].quantity = q(value,'state_total',basis,unit);
  r.states[1].material_id = recipient === '0' ? null : 'B';
  r.states[3].material_id = moved === '0' ? r.states[1].material_id : recipient === '0' ? 'A' : 'mixture-AB';
  r.operations[0].movement.amount = q(moved,'added',basis,unit);
  refreshPorts(r); r.limitations = [];
  return seal({schema:INPUT_PROFILE,record:r,binding:null,
    run:{cardinalities:{},layout:{'tube-1':[{id:'source',units:1,capacity_uL:'100000000000000000000'}], 'tube-2':[{id:'recipient',units:1,capacity_uL:'100000000000000000000'}]}},
    configurations:[{id:'synthetic-head',revision:'v1',head:{min_uL:'0',max_uL:'100000000000000000000'},evidence:'Synthetic software limit.',availability:'unknown'}],review_claims:[],upstream_findings:[]});
}
export function refreshPorts(r) {
  const states = new Map(r.states.map(s=>[s.id,s]));
  for (const op of r.operations) if (op.movement) {
    const m=op.movement;
    op.inputs = [m.donor_before_state_id,m.recipient_before_state_id].map(id=>({state_id:id,fraction:'whole',quantity:structuredClone(states.get(id).quantity)}));
    op.outputs = [m.donor_after_state_id,m.recipient_after_state_id].map(id=>({state_id:id,fraction:'whole',quantity:structuredClone(states.get(id).quantity)}));
  }
}
export function appendMove(input, {id, donor, recipient, moved, residual, final, material, depends}) {
  const r=input.record, db=r.states.find(s=>s.id===donor), rb=r.states.find(s=>s.id===recipient);
  const da={...structuredClone(db),id:id+'-donor-after',quantity:q(residual),lineage:[{state_id:donor,relationship:'split_from'}]};
  const ra={...structuredClone(rb),id:id+'-recipient-after',material_id:material,quantity:q(final),lineage:[{state_id:donor,relationship:'pooled_from'},{state_id:recipient,relationship:'pooled_from'}]};
  r.states.push(da,ra);
  const op=structuredClone(base.operations[0]);op.id=id;op.depends_on=depends;
  Object.assign(op.movement,{donor_before_state_id:donor,donor_after_state_id:da.id,recipient_before_state_id:recipient,recipient_after_state_id:ra.id,amount:q(moved,'added')});
  r.operations.push(op);refreshPorts(r);return {donor:da.id,recipient:ra.id};
}
export const resultState = (result,id) => result.states.find(s=>s.declared.id===id);
