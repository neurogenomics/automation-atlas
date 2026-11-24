// Re-find every PyLabRobot name the script skeletons call (#99) in
// PyLabRobot's source at a commit: content/pylabrobot-export.json 'api'.
//   node scripts/check-pylabrobot-api.mjs                 check at the recorded commit (fetches from GitHub)
//   node scripts/check-pylabrobot-api.mjs --src DIR       read a local checkout instead
//   node scripts/check-pylabrobot-api.mjs --commit SHA --write
//                                                         re-find at another commit and record its lines
// Fails if a name is missing; never adds names.
import {readFileSync, writeFileSync} from 'node:fs';

const path = new URL('../content/pylabrobot-export.json', import.meta.url);
const data = JSON.parse(readFileSync(path, 'utf8'));
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const commit = arg('--commit') || data.commit, src = arg('--src'), write = process.argv.includes('--write');

const cache = new Map();
async function source(file) {
  if (!cache.has(file)) {
    if (src) cache.set(file, readFileSync(`${src}/${file}`, 'utf8'));
    else {
      const res = await fetch(`https://raw.githubusercontent.com/PyLabRobot/pylabrobot/${commit}/${file}`);
      if (!res.ok) throw Error(`${file}: HTTP ${res.status}`);
      cache.set(file, await res.text());
    }
  }
  return cache.get(file).split('\n');
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function locate(lines, {owner, name, kind}) {
  const top = kind === 'class' ? new RegExp(`^class ${esc(name)}\\b`) : new RegExp(`^(async )?def ${esc(name)}\\(`);
  if (!owner) { const i = lines.findIndex(l => top.test(l)); return i < 0 ? null : i + 1; }
  const start = lines.findIndex(l => new RegExp(`^class ${esc(owner)}\\b`).test(l));
  if (start < 0) return null;
  const inner = kind === 'attr' ? new RegExp(`^\\s+self\\.${esc(name)}\\s*[:=]`) : new RegExp(`^\\s+(async )?def ${esc(name)}\\(`);
  for (let i = start + 1; i < lines.length; i++) {
    if (/^(class|def|async def) /.test(lines[i])) break;
    if (inner.test(lines[i])) return i + 1;
  }
  return null;
}

const missing = [];
let moved = 0;
for (const e of data.api) {
  const line = locate(await source(e.file), e);
  const id = `${e.owner ? e.owner + '.' : ''}${e.name}`;
  if (!line) { missing.push(`${id} (${e.file})`); continue; }
  if (line !== e.line) { moved++; if (!write) missing.push(`${id}: recorded line ${e.line}, found at ${e.file}:${line}`); }
  e.line = line;
}
if (missing.length) { console.error(`PyLabRobot ${commit.slice(0, 7)}:\n  ${missing.join('\n  ')}`); process.exit(1); }
if (write) { data.commit = commit; writeFileSync(path, JSON.stringify(data, null, 2) + '\n'); }
console.log(`PyLabRobot ${commit.slice(0, 7)}: all ${data.api.length} names found${write ? `; ${moved} line numbers updated` : ''}.`);
