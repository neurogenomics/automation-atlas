// Explicit UI-only legacy diagnostic. Never imported by the reviewed CLI/ledger.
import {parseReview, hashText, hash, canonical, reject} from '../lib/reviewed/json.js';
import {bindingOf,admit} from '../lib/reviewed/input.js';

export async function legacyDiagnostic(text, input) {
  await admit(input);
  const raw = parseReview(text), source = input.record.source;
  if (raw.schema !== 'lab-mcp/protocol-export/1' || String(raw.collection_id) !== source.collection_id || String(raw.version?.id) !== source.version_id || !Array.isArray(raw.steps) || raw.steps.length > 1000) reject('legacy_binding_mismatch');
  const ids = new Set();
  for (const s of raw.steps) {
    if (typeof s.guid !== 'string' || !s.guid || ids.has(s.guid) || typeof s.text !== 'string') reject('legacy_step_identity');
    ids.add(s.guid);
  }
  // lab-mcp's export hash uses Python json.dumps default separator spaces.
  const contentHash = await hashText('[' + raw.steps.map(s => '[' + JSON.stringify(s.guid) + ', ' + JSON.stringify(s.text) + ']').join(', ') + ']');
  if (contentHash !== source.export_hash || raw.content_hash !== source.export_hash) reject('legacy_export_hash_mismatch');
  // Parse only the verified text projection. Other unbound export decorations
  // (inventory/timers/device fields) cannot silently affect this comparison.
  const projected = {schema:raw.schema,collection_id:raw.collection_id,version:{id:raw.version.id},name:'Original source text projection',observed:null,steps: raw.steps.map((s, i) => ({guid:s.guid,text:s.text,title:'',position:i+1}))};
  const {buildWorkflowModel} = await import('../lib/work.js');
  const model = buildWorkflowModel({id:'reviewed-comparison',name:'Source-bound diagnostic',parts:[{source:'labstep',id:raw.collection_id,versionId:raw.version.id}],format:'plate',defaultWorkload:input.run.cardinalities.per_sample || 1},[projected]);
  const legacy = model.chunks.flatMap(c => c.actions.map(a => ({id:a.id,kind:a.kind || a.operation || a.op || a.type || 'unknown',line:a.line || a.label || '',volume_uL:Number.isFinite(a.volumeUl) ? String(a.volumeUl) : null,scope:'legacy_parser_per_action_interpretation'})));
  const reviewed = input.record.operations.map(op => ({id:op.id,kind:op.kind,movement:op.movement,conditions:op.conditions,constraints:op.constraints}));
  return {schema:'lab-automation-planner/legacy-diagnostic/1',producer:'existing-buildWorkflowModel/text-projection',
    binding:bindingOf(input.record),run_digest:await hash(input.run),status:'source_export_text_bound_diagnostic',
    limits:['Native source hash is attributed, not independently verified.', 'Only export GUID/text projection is bound; other metadata is omitted.', 'Legacy parser quantities are heuristic; source-step and reviewed operation cardinalities need not match. No derived metric or recommendation is substituted.'],
    legacy_actions:legacy, reviewed_operations:reviewed,
    difference:{legacy_action_count:legacy.length,reviewed_operation_count:reviewed.length,quantity_comparison:'Inspect action amounts versus explicit movements; no automatic one-to-one pairing or equivalence claim.'},
    authoritative:false,diagnostic_digest:await hash({legacy,reviewed,binding:bindingOf(input.record),run:input.run})};
}
export function comparisonMatches(diagnostic, input) {
  return canonical(diagnostic.binding) === canonical(bindingOf(input.record));
}
