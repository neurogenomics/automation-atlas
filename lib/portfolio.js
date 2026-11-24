// Exports for the portfolio assessment (#89): CSV and Markdown suitable for
// pasting into a funding application. Every figure comes from portfolio() in
// work.js; this file only formats. It names no protocol, lab or instrument.

const hrs = r => !r ? '' : Math.round(r.lo) === Math.round(r.hi) ? `${Math.round(r.lo)}` : `${Math.round(r.lo)}–${Math.round(r.hi)}`;
const mins = r => !r ? '' : Math.round(r.lo) === Math.round(r.hi) ? `${Math.round(r.lo)}` : `${Math.round(r.lo)}–${Math.round(r.hi)}`;
const gbp = n => `£${Math.round(n).toLocaleString('en-GB')}`;
export const priceText = c => !c ? '—' : !c.new ? `unpriced (${c.missing.length} item${c.missing.length === 1 ? '' : 's'} without recorded evidence)`
  : `${gbp(c.new.lo)}${Math.round(c.new.lo) === Math.round(c.new.hi) ? '' : `–${gbp(c.new.hi)}`}${c.complete ? '' : ` for ${c.knownItems} of ${c.items} items`}`;
function excludedHours(runs, blocked) {
  return [runs ? `${runs} without runs per year` : '', blocked ? `${blocked} pending protocol review` : ''].filter(Boolean).join(', ');
}
export const hoursText = s => {
  if (s.unassessed || s.blockedWorkflows?.length === s.workflowsTotal) return '—';
  const excluded = excludedHours(s.withoutRuns.length, s.blockedWorkflows?.length);
  return `${hrs(s.hoursPerYear) || '0'} h/year${excluded ? ` (excludes ${excluded})` : ''}`;
};
const groupHours = g => {
  if (!g.workflowsRun) return '—';
  const excluded = excludedHours(g.withoutRuns?.length, g.blockedWorkflows?.length);
  return `${hrs(g.hoursPerYear) || '0'}${excluded ? ` (excludes ${excluded})` : ''}`;
};

// Steps left to a person, counted by operation (or by protocol line), for one group.
export function manualSummary(g, by = 'operation') {
  const n = new Map();
  for (const m of g.manual) n.set(m[by], (n.get(m[by]) || 0) + 1);
  return [...n].map(([label, k]) => ({label, count: k})).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
const summaryText = (g, by) => manualSummary(g, by).map(m => `${m.label}${m.count > 1 ? ` ×${m.count}` : ''}`).join('; ');

const cell = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = rows => rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';

// One row per setup.
export function portfolioCsv(p) {
  const head = ['Setup', 'Liquid handler', 'Route', 'Pipettes', 'Modules', 'Connected devices', 'Workflows it runs', 'Workflows total', 'Groups it serves', 'Groups total', 'Groups served',
    'Hands-on hours removed per year (low)', 'Hands-on hours removed per year (high)', 'Workflows without runs per year', 'Workflows pending protocol review', 'Purchase price new GBP (low)', 'Purchase price new GBP (high)', 'Price complete', 'Unpriced items', 'Open questions',
    ...p.groups.flatMap(g => [`${g}: workflows run`, `${g}: steps left manual`])];
  const rows = p.setups.map(s => [s.setup.name, s.setup.handler.name, s.setup.route, s.setup.pipettes?.label || '', s.setup.modules.join('; '), s.setup.devices.join('; '),
    s.unassessed || s.workflowsRun, s.workflowsTotal, s.unassessed ? '' : s.groupsRun.length, s.groupsTotal, s.groupsRun.join('; '),
    s.hoursPerYear ? Math.round(s.hoursPerYear.lo) : '', s.hoursPerYear ? Math.round(s.hoursPerYear.hi) : '', s.withoutRuns.join('; '), (s.blockedWorkflows || []).join('; '),
    s.cost?.new ? Math.round(s.cost.new.lo) : '', s.cost?.new ? Math.round(s.cost.new.hi) : '', s.cost ? s.cost.complete ? 'yes' : 'no' : '', s.cost?.missing.join('; ') || '', s.unassessed ? '' : s.questions.length,
    ...s.byGroup.flatMap(g => s.unassessed ? ['', 'not assessed'] : [`${g.workflowsRun}/${g.workflowsTotal}`, g.workflowsRun ? `${g.manual.length}: ${summaryText(g, 'operation')}` : 'not run'])]);
  return csv([['# ' + p.caveat], head, ...rows]);
}

// One row per setup and workflow.
export function portfolioWorkflowCsv(p) {
  const head = ['Setup', 'Group', 'Workflow', 'Batch size', 'Runs per year', 'Runs on this setup', 'Why not', 'Hands-on minutes per run by hand', 'Hands-on minutes per run with setup', 'Minutes saved per run', 'Hours saved per year', 'Steps left manual', 'Manual steps by operation', 'Manual steps (protocol lines)', 'Open questions'];
  const rows = p.setups.flatMap(s => s.workflows.map(w => [s.setup.name, w.group, w.name, w.workload, w.runsPerYear ?? 'not given', s.unassessed || w.blocked ? 'not assessed' : w.runs ? 'yes' : 'no', w.why || '',
    mins(w.baseline?.active), w.withSetup ? mins(w.withSetup.active) : '', mins(w.savedPerRun), w.runs ? (w.runsPerYear == null ? 'runs per year not given' : hrs(w.savedHoursPerYear)) : '', w.runs ? w.manual.length : '', w.runs ? summaryText({manual: w.manual}, 'operation') : '', w.runs ? summaryText({manual: w.manual}, 'label') : '', s.unassessed ? '' : w.facts.length]));
  return csv([['# ' + p.caveat], head, ...rows]);
}

const md = v => String(v ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
export function portfolioMarkdown(p, {title = 'Shared automation: demand across groups'} = {}) {
  const assessed = p.setups.filter(s => !s.unassessed).length;
  const out = [`# ${title}`, '',
    `> **Planning estimates.** ${p.caveat}`, '',
    `${p.workflows.length} workflow${p.workflows.length === 1 ? '' : 's'} from ${p.groups.length} group${p.groups.length === 1 ? '' : 's'} (${p.groups.join(', ')}) listed with ${p.setups.length} candidate setup${p.setups.length === 1 ? '' : 's'}. ${assessed} setup${assessed === 1 ? '' : 's'} assessed. Price evidence: ${p.prices.version}.`, '',
    '## Summary', '',
    '| Setup | Groups served | Workflows run | Hands-on hours removed per year | Purchase price (new) | Open questions |', '|---|---|---|---|---|---|',
    ...p.setups.map(s => s.unassessed
      ? `| ${md(s.setup.name)} | — | Not assessed | — | — | — |`
      : `| ${md(s.setup.name)} | ${s.groupsRun.length}/${s.groupsTotal} | ${s.workflowsRun}/${s.workflowsTotal} | ${md(hoursText(s))} | ${md(priceText(s.cost))} | ${s.questions.length} |`), '',
    '## Workflows', '',
    '| Group | Workflow | Batch size | Runs per year | Hands-on per run by hand (min) |', '|---|---|---|---|---|',
    ...p.workflows.map(w => `| ${md(w.group)} | ${md(w.name)} | ${w.workload} | ${w.runsPerYear ?? 'not given'} | ${mins(w.baseline?.active)} |`), ''];
  for (const s of p.setups) {
    out.push(`## ${s.setup.name}`, '',
      `${s.setup.handler.name}, ${s.setup.route} route${s.setup.pipettes ? `, ${s.setup.pipettes.label}` : ''}. Modules: ${s.setup.modules.join(', ') || 'none'}.${s.setup.devices.length ? ` Connected devices: ${s.setup.devices.join(', ')}.` : ''}`, '');
    if (s.unassessed) { out.push(md(s.unassessed), ''); continue; }
    out.push(`- Runs ${s.workflowsRun} of ${s.workflowsTotal} workflows, serving ${s.groupsRun.length} of ${s.groupsTotal} groups${s.groupsRun.length ? ` (${s.groupsRun.join(', ')})` : ''}.`,
      `- Hands-on time removed: ${hoursText(s)}.`,
      `- Purchase price (new): ${priceText(s.cost)}.${s.cost.bundle ? ` Priced as ${s.cost.bundle}.` : ''}${s.cost.missing.length ? ` Unpriced: ${s.cost.missing.join('; ')}.` : ''}`, '');
    out.push('| Group | Workflows run | Hours removed per year | Steps left manual (by operation) |', '|---|---|---|---|');
    for (const g of s.byGroup) {
      const left = g.workflowsRun ? summaryText(g, 'operation') || 'none' : '';
      const not = g.notRun.map(n => `${n.workflow}: not run (${n.why})`).join(' ');
      out.push(`| ${md(g.group)} | ${g.workflowsRun}/${g.workflowsTotal} | ${groupHours(g)} | ${md([left, not].filter(Boolean).join(' '))} |`);
    }
    out.push('');
    if (s.questions.length) {
      out.push('**Open questions**', '');
      for (const q of s.questions) out.push(`- ${md(q.question)} *(${md(q.owner)}; ${q.workflows.length} workflow${q.workflows.length === 1 ? '' : 's'})*`);
      out.push('');
    }
  }
  return out.join('\n');
}
