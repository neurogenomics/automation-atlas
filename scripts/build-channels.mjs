// Build content/handler-channels.json from data/handler-channels-research.json (#82).
// Expands heads the research groups (e.g. one entry for all of a handler's
// single-channel pipettes) to every head id in content/pipettes.json, and gives
// a column-mode head the entry of the head it is a mode of.
import {readFileSync, writeFileSync} from 'node:fs';
const research = JSON.parse(readFileSync('data/handler-channels-research.json', 'utf8'));
const pipettes = JSON.parse(readFileSync('content/pipettes.json', 'utf8'));
const groups = {andrew: {'1ch': /^aa-1-ch-/, '8ch': /^aa-8-ch-/}};
const out = {
  version: research.retrieved,
  about: 'Channel independence per head and programming route per liquid handler (#82), built by scripts/build-channels.mjs from data/handler-channels-research.json. mode: independent (own Z, variable spacing, a volume per channel), fixed (one block at a fixed pitch), fixed-partial (a block that can pick up fewer tips), null = not found. Every value cites its source; null means not found, never assumed. PyLabRobot support is not here: it comes from the pinned registry (lib/equipment.js).',
  pylabrobotStatuses: {
    supported: 'PyLabRobot “Full”: comprehensive support (≥90% of capabilities), with documentation.',
    partial: 'PyLabRobot “Mostly” or “Basic”: core or most functionality in pylabrobot:main, some commands missing.',
    community: 'PyLabRobot “WIP”: contributed driver work in progress, awaiting hardware verification.',
    none: 'No driver in the pinned PyLabRobot registry.',
  },
  pylabrobotStatusSource: {url: 'https://github.com/PyLabRobot/pylabrobot/blob/7779f506d12755f5f274b4c5cab4d095f4fccb62/docs/user_guide/machines.md', quote: 'Full — comprehensive support (≥90% of capabilities), with documentation.'},
  handlers: {},
};
for (const [id, r] of Object.entries(research.handlers)) {
  const heads = {};
  for (const head of pipettes.handlers[id]?.heads || []) {
    const g = Object.entries(groups[id] || {}).find(([, re]) => re.test(head.id))?.[0];
    const e = r.heads[head.id] || (g && r.heads[g]) || r.heads[head.id.replace(/-col$/, '')];
    if (e) heads[head.id] = e;
  }
  out.handlers[id] = {heads, software: r.software};
}
writeFileSync('content/handler-channels.json', JSON.stringify(out, null, 1) + '\n');
console.log(`Wrote channel and programming entries for ${Object.keys(out.handlers).length} handlers.`);
