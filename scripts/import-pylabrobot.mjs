#!/usr/bin/env node
// Read upstream JSON as data only. Never import or execute upstream source.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const args = process.argv.slice(2);
const allowed = new Set(['--commit', '--retrieved-at', '--output']);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!allowed.has(args[i]) || !args[i + 1]) throw new Error('Usage: node scripts/import-pylabrobot.mjs --commit <40-character SHA> --retrieved-at YYYY-MM-DD [--output absolute-or-relative-path]');
  if (options[args[i]]) throw new Error(`Duplicate option ${args[i]}`);
  options[args[i]] = args[i + 1];
}
const commit = options['--commit'];
const retrievedAt = options['--retrieved-at'];
if (!/^[0-9a-f]{40}$/.test(commit || '')) throw new Error('An explicit immutable --commit SHA is required; main is not accepted.');
if (!/^\d{4}-\d{2}-\d{2}$/.test(retrievedAt || '') || Number.isNaN(Date.parse(retrievedAt))) throw new Error('Explicit --retrieved-at date is required for reproducible metadata.');
const base = 'https://raw.githubusercontent.com/PyLabRobot/pylabrobot';
const pinnedUrl = `${base}/${commit}/docs/_static/devices.json`;
const licenseUrl = `${base}/${commit}/LICENSE`;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Upstream returned HTTP ${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 5_000_000) throw new Error('Upstream file exceeds bounded data import size.');
  return bytes;
}
const [bytes, licenseBytes] = await Promise.all([download(pinnedUrl), download(licenseUrl)]);
const license = licenseBytes.toString('utf8').trim();
if (!license.startsWith('MIT License\n') || !license.includes('Permission is hereby granted, free of charge') || !license.includes('THE SOFTWARE IS PROVIDED "AS IS"')) throw new Error('Unrecognised licence; review before importing.');
const input = JSON.parse(bytes.toString('utf8'));
if (!Array.isArray(input) || !input.length) throw new Error('Expected nonempty registry array.');
const ids = new Set();
const invalidUrls = [];
const missingFields = { api: [], documentation: [], manufacturer: [] };
function httpUrl(value, id, field) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') {
    try { const url = new URL(value); if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href; } catch { /* Preserve original separately, not as an active link. */ }
  }
  invalidUrls.push({ id, field, value });
  return null;
}
const mapped = new Set(['id', 'vendor', 'name', 'kind', 'capabilities', 'status', 'api', 'doc_slug', 'oem', 'notes']);
const records = input.map(item => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Expected object record.');
  for (const field of ['id', 'vendor', 'name', 'kind', 'status']) if (typeof item[field] !== 'string' || !item[field].trim()) throw new Error(`Missing ${field} in ${item.id || '(unidentified)'}`);
  if (!/^[a-z0-9-]+$/.test(item.id)) throw new Error(`Unexpected ID syntax: ${item.id}`);
  if (ids.has(item.id)) throw new Error(`Duplicate upstream ID: ${item.id}`);
  ids.add(item.id);
  if (!Array.isArray(item.capabilities) || !item.capabilities.every(c => typeof c === 'string')) throw new Error(`Invalid capability list: ${item.id}`);
  const documentationUrl = typeof item.doc_slug === 'string' && /^[a-zA-Z0-9_/-]+$/.test(item.doc_slug) && !item.doc_slug.split('/').includes('..') ? `https://docs.pylabrobot.org/stable/user_guide/${item.doc_slug}.html` : null;
  if (item.doc_slug && !documentationUrl) invalidUrls.push({ id: item.id, field: 'doc_slug', value: item.doc_slug });
  const manufacturerUrl = httpUrl(item.oem, item.id, 'oem');
  if (!item.api) missingFields.api.push(item.id);
  if (!documentationUrl) missingFields.documentation.push(item.id);
  if (!manufacturerUrl) missingFields.manufacturer.push(item.id);
  return {
    id: `plr-${item.id}`, upstreamId: item.id, vendor: item.vendor, name: item.name,
    category: item.kind, capabilities: [...item.capabilities],
    driverStatus: item.status,
    status: 'Upstream integration lead; driver status is not hardware, assay or local installation validation.',
    api: typeof item.api === 'string' ? item.api : null,
    documentationUrl, manufacturerUrl, oem: item.oem ?? null, notes: item.notes ?? null,
    upstreamMetadata: Object.fromEntries(Object.entries(item).filter(([key]) => !mapped.has(key))),
    source: { url: 'https://github.com/PyLabRobot/pylabrobot/blob/main/docs/_static/devices.json', pinnedUrl, commit, license: 'MIT' }
  };
});
const counts = key => Object.fromEntries([...new Set(records.map(r => r[key]))].sort().map(k => [k, records.filter(r => r[key] === k).length]));
const registry = {
  version: `pylabrobot-${commit}`, title: 'PyLabRobot instrument integration registry',
  description: 'Complete pinned upstream registry, normalized for public discovery. Family records may include many nested models. Entries and capability labels are integration leads, not manufacturer-verified performance specifications, protocol matches, access claims or hardware validation.',
  provenance: { upstream: 'https://github.com/PyLabRobot/pylabrobot', commit, pinnedUrl, retrievedAt, sourceSha256: hash(bytes), license: 'MIT', licenseText: license, licenseUrl, licenseSha256: hash(licenseBytes), noticeFile: 'THIRD_PARTY_NOTICES.md', importCommand: `node scripts/import-pylabrobot.mjs --commit ${commit} --retrieved-at ${retrievedAt}` },
  audit: { inputCount: input.length, outputCount: records.length, categories: counts('category'), driverStatuses: counts('driverStatus'), recordsWithModelVariants: input.filter(r => Array.isArray(r.models)).length, nestedModelCount: input.reduce((sum, r) => sum + (Array.isArray(r.models) ? r.models.length : 0), 0), hardwareTestingFlags: input.filter(r => 'needs_hardware_testing' in r).map(r => ({ id: `plr-${r.id}`, value: r.needs_hardware_testing })), missingFields, invalidUrls, unmappedFieldNames: [...new Set(records.flatMap(r => Object.keys(r.upstreamMetadata)))].sort() },
  records
};
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = options['--output'] ? resolve(options['--output']) : resolve(root, 'content/registry.js');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `// Generated by scripts/import-pylabrobot.mjs from pinned MIT-licensed data.\n// See THIRD_PARTY_NOTICES.md. Do not infer hardware validation from driver status.\nexport const registry = ${JSON.stringify(registry, null, 2)};\n`);
const notice = `# Third-party notices\n\n## PyLabRobot instrument registry\n\nSource: ${pinnedUrl}\n\nCommit: ${commit}. Retrieved: ${retrievedAt}. Source SHA-256: ${hash(bytes)}.\n\nThe complete upstream registry is normalized in content/registry.js. Original capability strings, driver status, nested model records and additional metadata are retained. No upstream Python code is executed. These records describe integration leads, not manufacturer-verified performance or local protocol compatibility.\n\nLicence source: ${licenseUrl}\n\n\`\`\`text\n${license}\n\`\`\`\n`;
// With an alternative output (e.g. a reproduction check), avoid mutating the project notice.
// Replace only this importer's block, so other notices (e.g. the labware
// library, scripts/labware-from-pylabrobot.mjs) are kept.
if (!options['--output']) {
  const { readFile } = await import('node:fs/promises');
  const file = resolve(root, 'THIRD_PARTY_NOTICES.md');
  const current = await readFile(file, 'utf8').catch(() => '# Third-party notices\n');
  const block = `<!-- registry:start -->\n${notice.replace(/^# Third-party notices\n\n/, '')}<!-- registry:end -->\n`;
  const next = /<!-- registry:start -->[\s\S]*<!-- registry:end -->\n?/.test(current) ? current.replace(/<!-- registry:start -->[\s\S]*<!-- registry:end -->\n?/, block) : `# Third-party notices\n\n${block}${current.replace(/^# Third-party notices\n\n/, '').replace(/^## PyLabRobot instrument registry[\s\S]*?```text[\s\S]*?```\n?/, '')}`;
  await writeFile(file, next);
}
console.log(JSON.stringify({ commit, sourceSha256: hash(bytes), inputCount: input.length, outputCount: records.length, categoryCount: Object.keys(registry.audit.categories).length, invalidUrls: invalidUrls.length, nestedModelCount: registry.audit.nestedModelCount, output }));
