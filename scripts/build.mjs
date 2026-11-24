// Build the Sites artifact, in the same layout as the Graph Workshop:
//   dist/server/index.js     one self-contained worker (site files embedded)
//   dist/.openai/hosting.json  Sites project and D1 binding
//   dist/drizzle/*.sql       D1 migrations
// site/ holds the plain static files for local preview.
import {mkdir, rm, cp, readFile, readdir, writeFile} from 'node:fs/promises';
import {join, extname} from 'node:path';
import {registryContracts} from './registry-contracts.mjs';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';

const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml'};
await rm('dist', {recursive: true, force: true});
await rm('site', {recursive: true, force: true});
await mkdir('site');
for (const dir of ['web', 'lib', 'content']) await cp(dir, `site/${dir}`, {recursive: true});
await writeFile('site/index.html', '<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=web/index.html"><title>Automation Atlas</title><a href="web/index.html">Open the Automation Atlas</a></html>');

const assets = {};
async function walk(dir) {
  for (const e of await readdir(dir, {withFileTypes: true})) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (TYPES[extname(e.name)]) assets[p.slice('site/'.length)] = {type: TYPES[extname(e.name)], body: await readFile(p, 'utf8')};
  }
}
await walk('site');
const app = await readFile('worker/app.js', 'utf8');
const provenance = await readFile('lib/source-provenance.js', 'utf8');
const provenanceImport = /^import .* from '\.\.\/lib\/source-provenance\.js';\n/m;
if (!provenanceImport.test(app)) throw Error('The worker provenance import is missing.');
// Inline the registry server modules in separate scopes. Only the closed
// worker dependency graph is bundled; schema bytes never become site assets.
async function inlineModule(path, name, exports, prelude = '') {
  const code = (await readFile(path, 'utf8')).replace(/^import .*;\n/gm, '')
    .replace(/^export \{.*\};\n/gm, '').replace(/^export /gm, '');
  return `const ${name} = (() => {\n${prelude}\n${code}\nreturn {${exports}};\n})();\n`;
}
const registryImport = "import {registryApi} from './registry/api.js';";
if (!app.includes(registryImport)) throw Error('The worker registry import is missing.');
const registry = await inlineModule('lib/reviewed/json.js', 'registryJson', 'canonical, hash, hashText, parseReview, reject') +
  await inlineModule('lib/reviewed/quantity.js', 'registryQuantity', 'cmp, decimal', 'const {reject} = registryJson;') +
  await inlineModule('worker/registry/contract.js', 'registryContract',
    'acceptsRecordAuthority, archiveDigest, canonical, date, hash, instrumentModelShape, parseReview, recordLinks, refOf, refShape, sameRef, timestamp, validStoredWire, wireDigest, wireShape, LOCAL_DEFAULT, localDefaultRef, sourceRefShape',
    'const {canonical, hash, parseReview} = registryJson;') +
  await inlineModule('worker/registry/service.js', 'registryService',
    'assessService, assessmentAllowed, decisionQuestions, isFacilityDefault, recordStatus, serviceClaims, validRecordLink, validServiceRecord, validMatchInput',
    'const {canonical, LOCAL_DEFAULT, localDefaultRef, recordLinks, refOf, sameRef} = registryContract; const {cmp, decimal} = registryQuantity;') +
  await inlineModule('worker/registry/installation.js', 'registryInstallation', 'installationLocator, installationRevisionId, installationText, validInstallationBinding',
    'const {date, refShape, sameRef} = registryContract; const {hash} = registryJson;') +
  await inlineModule('lib/registry-inventory.js', 'registryInventory', 'inventorySections') +
  await inlineModule('worker/registry/survey.js', 'registrySurvey', 'surveyProjection, validSurveyDraft', 'const {inventorySections} = registryInventory;') +
  await inlineModule('worker/registry/pilot.js', 'registryPilot', 'pilotCohortLimit, pilotReport, pilotReviewFits, pilotVersion, validPilot',
    'const {date, refOf, refShape, sameRef} = registryContract; const {hash} = registryJson; const {recordStatus} = registryService;') +
  await inlineModule('worker/registry/roar.js', 'registryRoar', 'readRoar, roarPacket, roarProposals, roarRevision',
    'const {canonical, hash, hashText, parseReview} = registryJson; const {date, instrumentModelShape, refOf, sameRef, wireDigest, wireShape} = registryContract;') +
  await inlineModule('worker/registry/request-draft.js', 'requestDraft', 'makeDraft, recordedExpiry, requestIdentity, requestSchema, reviewedDraftBlocker, sameReviewedMethod, validateDraftRow',
    'const {canonical, hash, parseReview, sameRef, timestamp} = registryContract;') +
  await inlineModule('worker/registry/api.js', 'registryWorker', 'registryApi',
    'const {acceptsRecordAuthority, archiveDigest, canonical, date, hash, instrumentModelShape, parseReview, recordLinks, refOf, refShape, sameRef, timestamp, validStoredWire, wireDigest, wireShape, LOCAL_DEFAULT, localDefaultRef, sourceRefShape} = registryContract; const {assessService, assessmentAllowed, decisionQuestions, isFacilityDefault, recordStatus, serviceClaims, validRecordLink, validServiceRecord, validMatchInput} = registryService; const {installationLocator, installationRevisionId, installationText, validInstallationBinding} = registryInstallation; const {surveyProjection, validSurveyDraft} = registrySurvey; const {pilotCohortLimit, pilotReport, pilotReviewFits, pilotVersion, validPilot} = registryPilot; const {readRoar, roarPacket, roarProposals, roarRevision} = registryRoar; const {makeDraft, recordedExpiry, requestIdentity, requestSchema, reviewedDraftBlocker, sameReviewedMethod, validateDraftRow} = requestDraft;') +
  'const {registryApi} = registryWorker;\nconst equipmentContracts = ' + JSON.stringify(await registryContracts()) + ';';
const planningImport = "import {planningApi, evaluateReviewedPlanningInput, planningOptions} from './planning/api.js';";
if (!app.includes(planningImport)) throw Error('The worker planning import is missing.');
// Bundle the exact modules also served to Decide, including the engine's
// JSON catalogue and circular deck-layout import. Digest the actual bundle.
const planning = (await build({entryPoints: ['worker/planning/api.js'], bundle: true, write: false,
  format: 'iife', globalName: 'planningWorker', platform: 'browser', target: 'es2022'})).outputFiles[0].text;
const release = 'sha256:' + createHash('sha256').update(planning).digest('hex');
const source = app.replace(provenanceImport, () => provenance).replace(registryImport, () => registry)
  .replace(planningImport, () => planning + '\nconst {planningApi, evaluateReviewedPlanningInput, planningOptions} = planningWorker;')
  .replace('const planningRelease = null;', () => `const planningRelease = ${JSON.stringify(release)};`)
  .replace('const defaultRegistryContracts = null;', 'const defaultRegistryContracts = equipmentContracts;');
await mkdir('dist/server', {recursive: true});
await writeFile('dist/server/index.js', `${source}\nconst assets = ${JSON.stringify(assets)};\nexport {assets};\nexport default {fetch: (req, env) => handle(req, env, assets)};\n`);
await cp('.openai/hosting.json', 'dist/.openai/hosting.json');
await cp('drizzle', 'dist/drizzle', {recursive: true});
console.log(`Built dist/server/index.js with ${Object.keys(assets).length} embedded files, plus hosting.json and ${(await readdir('drizzle')).filter(f => f.endsWith('.sql')).length} migration(s) with their Drizzle journal.`);
