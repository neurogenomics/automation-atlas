// A timings review (#105): the protocol as the planner read it, the
// assumptions it makes and the time it gives each step when done by hand,
// packaged for the people who run the protocol to check. Generic: it names no
// protocol, lab or instrument.
import {simulate} from './work.js';

const WAIT_BASIS = {
  source: 'stated in the protocol',
  published: 'from the protocol’s published timings',
  estimated: 'a typical time, not stated in the protocol',
  missing: 'not stated anywhere; counted as zero until someone gives it',
};
const sum = rows => rows.reduce((t, r) => ({lo: t.lo + (r.minutes?.lo || 0), hi: t.hi + (r.minutes?.hi || 0)}), {lo: 0, hi: 0});
const round = r => ({lo: Math.round(r.lo * 10) / 10, hi: Math.round(r.hi * 10) / 10});

export function reviewPacket(model, workload, workflow = {}) {
  const sim = simulate(model, workload, null, false);
  const rows = new Map();
  for (const r of sim.timeline) { if (!rows.has(r.chunkId)) rows.set(r.chunkId, []); rows.get(r.chunkId).push(r); }
  const unit = workload === 1 ? model.workloadLabel.replace(/s$/, '') : model.workloadLabel;
  const steps = model.chunks.map(c => {
    const here = rows.get(c.id) || [];
    return {
      id: c.id, name: c.name,
      protocol: c.source?.protocol || null, position: c.source?.position ?? null, url: c.source?.url || null,
      lines: [...new Set(c.actions.map(a => a.line).filter(Boolean))],
      handsOn: round(sum(here.filter(r => r.type === 'H'))),
      desk: round(sum(here.filter(r => r.type === 'D'))),
      waits: here.filter(r => r.type === 'W').map(r => ({label: r.label.replace(/ \(running\)$/, ''), minutes: r.minutes, basis: r.waitBasis || 'missing', basisText: WAIT_BASIS[r.waitBasis] || WAIT_BASIS.missing})),
      observed: c.observed || null,
      prescribedMinutes: c.prescribedSeconds != null ? Math.round(c.prescribedSeconds / 6) / 10 : null,
      questions: (model.checks || []).filter(k => k.chunkId === c.id).map(k => ({line: k.line, text: k.text})),
    };
  });
  const waits = steps.flatMap(s => s.waits);
  const count = b => waits.filter(w => w.basis === b).length;
  const assumptions = [
    {id: 'batch', text: `Times are for one batch of ${workload} ${unit}, done by hand by one person.`},
    {id: 'format', text: `Run in ${model.format === 'plate' ? `${model.labware?.label || 'plates'}` : 'tubes'}${workflow.formatBasis ? `: ${workflow.formatBasis}` : '.'}`},
    // 'assumed' only tells the planner's user to choose labware; the format line above covers it.
    ...(model.labwareWarnings || []).filter(w => w.type !== 'assumed').map((w, i) => ({id: `labware-${i}`, text: w.text})),
    {id: 'hands-on', text: 'Hands-on minutes are planning estimates: a typical time for each kind of operation (adding, mixing, removing supernatant, moving to a magnet…), counted once per batch, per plate or per sample depending on the operation. None was measured in this lab.'},
    {id: 'waits', text: `Waits (incubations, spins, runs): ${count('source')} stated in the protocol, ${count('published') + count('estimated')} typical estimates, ${count('missing')} not stated and counted as zero.`},
    {id: 'observed', text: steps.some(s => s.observed) ? `${steps.filter(s => s.observed).length} steps also have elapsed times observed from Labstep runs, shown beside the estimate.` : 'No observed Labstep run times were available for these steps.'},
    {id: 'desk', text: 'Desk work (recording indexes, exporting data) is counted separately: it can be done at any time.'},
  ];
  const protocols = [...new Map(model.chunks.map(c => c.source).filter(s => s?.id != null).map(s => [`${s.source}:${s.id}`, {source: s.source, id: s.id, name: s.protocol || null, versionId: s.versionId ?? null, versionNumber: s.versionNumber ?? null, url: s.url || null}])).values()];
  return {
    version: 1, kind: 'timings',
    workflow: {name: model.name, batch: workload, workloadLabel: model.workloadLabel, format: model.format, labware: model.labware?.label || null, protocols},
    assumptions, steps,
    totals: {handsOn: round(sim.metrics.active), elapsed: round(sim.metrics.elapsed), visits: sim.metrics.visits},
  };
}
