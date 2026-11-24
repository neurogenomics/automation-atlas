// Freshness of content/open-hardware.json (#79): re-check every entry's
// primary source and, for GitHub repositories, record the last push, the
// archived flag and the licence. An entry whose repository has had no push for
// two years is marked dormant. Writes the file only when something other than
// the check date changes. Usage: node scripts/check-open-hardware.mjs [--today YYYY-MM-DD]
// Uses GITHUB_TOKEN when set (the weekly workflow provides it).
import {readFileSync, writeFileSync} from 'node:fs';

const FILE = new URL('../content/open-hardware.json', import.meta.url);
const arg = process.argv.indexOf('--today');
const today = arg > 0 ? process.argv[arg + 1] : new Date().toISOString().slice(0, 10);
const DORMANT_DAYS = 730;
const headers = {'User-Agent': 'automation-atlas-open-hardware-check', Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? {Authorization: `Bearer ${process.env.GITHUB_TOKEN}`} : {})};

const repoOf = url => { const m = /^https:\/\/github\.com\/([^/]+)\/([^/#?]+)/.exec(url); return m ? `${m[1]}/${m[2].replace(/\.git$/, '')}` : null; };

async function check(url) {
  const repo = repoOf(url);
  if (repo) {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {headers});
    if (res.status === 404) return {status: 'missing', http: 404};
    if (!res.ok) return {status: 'not checked', http: res.status};
    const j = await res.json();
    const lastPush = j.pushed_at?.slice(0, 10) || null;
    const days = lastPush ? (Date.parse(today) - Date.parse(lastPush)) / 864e5 : null;
    return {status: j.archived ? 'archived' : days != null && days > DORMANT_DAYS ? 'dormant' : 'active', lastPush, archived: !!j.archived, licence: j.license?.spdx_id && j.license.spdx_id !== 'NOASSERTION' ? j.license.spdx_id : null, ...(j.full_name.toLowerCase() !== repo.toLowerCase() ? {movedTo: `https://github.com/${j.full_name}`} : {})};
  }
  // Papers and project sites: reachable or not. Sites that refuse automated
  // requests are recorded as not checked, never as gone.
  let res = await fetch(url, {method: 'HEAD', redirect: 'follow', headers: {'User-Agent': headers['User-Agent']}}).catch(() => null);
  if (!res || res.status === 405) res = await fetch(url, {redirect: 'follow', headers: {'User-Agent': headers['User-Agent']}}).catch(() => null);
  if (!res) return {status: 'not checked', http: null};
  if (res.status === 404 || res.status === 410) return {status: 'missing', http: res.status};
  return res.ok ? {status: 'reachable', http: res.status} : {status: 'not checked', http: res.status};
}

const data = JSON.parse(readFileSync(FILE, 'utf8'));
const before = JSON.stringify(data.entries.map(e => ({...e, activity: e.activity && {...e.activity, checked: null}})));
const report = [];
for (const e of data.entries) {
  const a = await check(e.url);
  e.activity = {checked: today, ...a};
  report.push(`${a.status.padEnd(12)} ${e.id}${a.lastPush ? ` (last push ${a.lastPush})` : ''}${a.http ? ` HTTP ${a.http}` : ''}`);
}
const after = JSON.stringify(data.entries.map(e => ({...e, activity: {...e.activity, checked: null}})));
console.log(report.join('\n'));
if (before === after) { console.log('No change apart from the check date; file left as it was.'); process.exit(0); }
writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
console.log(`Updated ${FILE.pathname}.`);
