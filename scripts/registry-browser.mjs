// Exercise the built Planner Worker and real browser with synthetic registry data only.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {memoryD1} from './memory-d1.mjs';
import {handle, assets} from '../dist/server/index.js';
import {planningFixture} from './planning-fixtures.mjs';
import {snapshotFromText} from '../lib/snapshots.js';
import {registryContracts} from './registry-contracts.mjs';
import {requestDraftFixture} from '../tests/helpers/request-draft-fixture.mjs';
import {roarFixture} from '../tests/helpers/roar-cases.js';

const atlas = process.env.ROAR_ATLAS_DIST;
const contracts = await registryContracts(), synthetic = await roarFixture(contracts, 1);
const roarInput = atlas ? {
  crosswalk: await readFile(join(atlas, 'roar-discovery.json'), 'utf8'),
  bundle: await readFile(join(atlas, 'instrument-model/0.1.0/2026-11-12.public.1/bundle.json'), 'utf8'),
} : synthetic.input;

const db = memoryD1(), errors = [], external = [], profileWrites = [];
const server = createServer(async (req, res) => {
  try {
    const headers = new Headers(req.headers), chunks = [];
    const actor = /^fixture_actor=([a-z]+)$/.exec(req.headers.cookie ?? '')?.[1];
    if (actor) headers.set('oai-authenticated-user-id', 'fixture-' + actor);
    for await (const chunk of req) chunks.push(chunk);
    if (req.method === 'PUT' && req.url === '/api/profile') profileWrites.push(actor);
    const response = await handle(new Request(origin + req.url, {method: req.method, headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined}), {DB: db}, assets, atlas ? {} : {registryContracts: {...contracts, roarRelease: synthetic.pin}});
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) { errors.push(e.message); res.writeHead(500).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const url = hash => origin + '/web/index.html' + hash;
const pictures = process.env.REGISTRY_SCREENSHOTS_DIR;
let browser;
const button = (p, name) => p.getByRole('button', {name, exact: true});
const heading = (p, name) => p.getByRole('heading', {name, exact: true}).waitFor();
const seen = (p, text) => p.getByText(text, {exact: true}).waitFor();
const recordId = p => new URL(p.url()).hash.split('/').at(-1);
const orgPath = org => '#registry/workspace/' + org;
const apiPath = org => '/api/registry/organisations/' + org;
const detail = (org, id) => orgPath(org) + '/' + id;
const fill = (p, name, value) => p.getByLabel(name, {exact: true}).fill(value);
const select = (p, name, value) => p.getByLabel(name, {exact: true}).selectOption(value);
const site = (p, hash) => p.url() === url(hash) ? p.reload() : p.goto(url(hash));
const shot = async (page, name) => { if (pictures) await page.screenshot({path: join(pictures, name + '.png'), fullPage: true}); };
const waitPost = (page, suffix, code) => page.waitForResponse(r => r.url().endsWith(suffix) && r.request().method() === 'POST' && r.status() === code);
const fixtures = {name: 'Same-name synthetic workspace', group: 'Synthetic equipment group', location: 'private-fixture-location',
  citation: 'https://example.org/dated-source', ineligible: 'https://example.org/source?marker=private-fixture',
  date: '2026-01-01', rights: 'Synthetic declaration', sha: 'sha256:' + '1'.repeat(64)};
async function session(actor, viewport = {width: 1180, height: 920}) {
  const ctx = await browser.newContext({viewport, baseURL: origin});
  if (actor) await ctx.addCookies([{name: 'fixture_actor', value: actor, url: origin}]);
  await ctx.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  page.on('pageerror', e => errors.push(e.message));
  // Chromium logs HTTP denials from expected, same-origin probes; reject actual console errors.
  page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource: the server responded with a status of (403|404|409)/.test(m.text()) &&
    !(/status of 400/.test(m.text()) && m.location().url.endsWith('/roar-import/preview'))) errors.push(m.text()); });
  return page;
}
async function createOrg(page) {
  await site(page, '#registry/workspace');
  await fill(page, 'Organisation name', fixtures.name);
  await button(page, 'Create workspace').click();
  await heading(page, 'Workspace reports');
  return recordId(page);
}
async function member(p, user, role) {
  await fill(p, 'Canonical Planner user ID', 'fixture-' + user);
  await select(p, 'Registry role', role);
  await button(p, 'Save membership').click();
  await p.locator('[data-members]').getByText('fixture-' + user, {exact: true}).waitFor();
}
async function rights(host) {
  for (const k of ['Discovery', 'Assessment', 'Republication']) await select(host, k, 'permitted');
  await fill(host, 'Permission basis (required for any permitted use)', fixtures.rights);
}
async function source(p, href, i) {
  await button(p, 'Add dated source').click();
  const row = p.locator('.reg-source').last();
  await fill(row, 'Source HTTPS URL', href);
  await fill(row, 'Source namespace', 'example:record');
  await fill(row, 'Source identifier', 'symbolic-source-' + i);
  await fill(row, 'Source observation date', fixtures.date);
  await fill(row, 'Source snapshot SHA-256 (optional)', fixtures.sha);
  await select(row, 'Source visibility', 'public');
  await rights(row);
}
async function openNew(p, org, kind) {
  await site(p, orgPath(org));
  await p.getByRole('link', {name: 'New equipment report', exact: true}).click();
  await select(p, 'Record type', kind);
  await fill(p, 'Observation date', fixtures.date);
  await rights(p.locator('[data-rights]'));
}
async function save(p, label) {
  await button(p, 'Save report').click();
  await heading(p, 'Current revision · ' + label);
  return recordId(p);
}
async function clickAction(p, label, status) {
  await button(p, label).click();
  await seen(p, status);
}
try {
  if (pictures) await mkdir(pictures, {recursive: true});
  const env = process.env.BROWSER_DEPS_DIR;
  browser = await chromium.launch({headless: true, ...(env ? {env: {...process.env,
    LD_LIBRARY_PATH: (await readFile(join(env, 'library-path'), 'utf8')).trim(), FONTCONFIG_FILE: join(env, 'fonts.conf')}} : {})});
  const owner = await session('alice'), foreign = await session('bob'), editor = await session('editor');
  const reviewer = await session('reviewer'), guest = await session(null, {width: 390, height: 844});
  await site(guest, '#decide');
  await guest.getByRole('link', {name: 'Registry', exact: true}).click();
  await guest.getByText(/No reviewed reports are published yet/).waitFor();
  const a = await createOrg(owner), b = await createOrg(foreign);
  assert.notEqual(a, b);
  await seen(owner, a); await seen(foreign, b);
  await seen(owner, 'owner · unverified affiliation');
  await site(editor, '#registry/workspace');
  await seen(editor, 'fixture-editor');
  await member(owner, 'editor', 'editor'); await member(owner, 'reviewer', 'reviewer');
  await member(foreign, 'alice', 'editor');

  await openNew(editor, a, 'installation_group');
  await fill(editor, 'Report label', fixtures.group);
  await fill(editor, 'Reported group count (blank if unknown)', '3');
  await fill(editor, 'Reported location (private; blank if unknown)', fixtures.location);
  await select(editor, 'Record visibility', 'public');
  await source(editor, fixtures.citation, 1);
  await source(editor, fixtures.ineligible, 2);
  const group = await save(editor, fixtures.group);
  const groupPath = detail(a, group), publicPath = '#registry/public/' + group;
  assert.equal(await button(editor, 'Record evidence review').count(), 0);
  assert.equal(await button(editor, 'Preview public fields').count(), 0);
  await site(foreign, groupPath);
  await seen(foreign, 'This record or workspace is unavailable.');
  assert(!(await foreign.locator('#view').innerText()).includes(fixtures.group));
  await site(reviewer, groupPath);
  await heading(reviewer, 'Current revision · ' + fixtures.group);
  assert.equal(await button(reviewer, 'Start correction').count(), 0);
  await clickAction(reviewer, 'Record evidence review', 'Record evidence review saved.');
  await site(owner, groupPath);
  const groupCount = owner.getByRole('checkbox', {name: 'Reported group count'});
  const sourceChoice = owner.getByRole('checkbox', {name: new RegExp(fixtures.citation)});
  await groupCount.check(); await sourceChoice.check();
  assert.equal(await owner.getByRole('checkbox').count(), 2);
  await button(owner, 'Preview public fields').click();
  await heading(owner, 'Server preview · private until published');
  await groupCount.uncheck();
  assert(await button(owner, 'Publish this exact preview').isDisabled());
  await groupCount.check();
  await button(owner, 'Preview public fields').click();
  await heading(owner, 'Server preview · private until published');
  await shot(owner, 'owner-preview');
  await site(guest, publicPath);
  await seen(guest, 'This record or workspace is unavailable.');
  await clickAction(owner, 'Publish this exact preview', 'Published the selected fields.');
  await site(guest, '#registry');
  await guest.getByRole('link', {name: fixtures.group, exact: true}).click();
  // The list card has the same heading as the detail view, with a link.
  const publicDetail = guest.locator('.reg-projection', {has: guest.locator('h3:not(:has(a))')});
  await publicDetail.getByRole('heading', {name: fixtures.group, exact: true}).waitFor();
  assert.equal(new URL(guest.url()).hash, publicPath);
  const publishedText = await guest.locator('[data-content]').innerText();
  for (const s of [fixtures.location, fixtures.ineligible, 'symbolic-source-1', fixtures.rights, 'fixture-reviewer', a]) assert(!publishedText.includes(s), s);
  assert(publishedText.includes(fixtures.citation));
  assert(await publicDetail.getByText('3', {exact: true}).isVisible());
  assert(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await shot(guest, 'public-390');
  await clickAction(owner, 'Withdraw publication', 'Withdrew the public report.');
  await site(guest, publicPath);
  await seen(guest, 'This record or workspace is unavailable.');

  await openNew(editor, a, 'installation');
  await fill(editor, 'Report label', 'Synthetic individual report');
  const single = await save(editor, 'Synthetic individual report');
  await openNew(editor, a, 'configuration');
  await editor.getByLabel('Target revision', {exact: true}).selectOption({index: 1});
  await button(editor, 'Add module').click();
  await fill(editor, 'Module identifier', 'symbolic-module-unknown');
  await button(editor, 'Add module').click();
  const secondModule = editor.locator('.reg-module').last();
  await fill(secondModule, 'Module identifier', 'symbolic-module-fitted');
  await select(secondModule, 'Fitting status', 'reported_fitted');
  await source(editor, fixtures.citation, 1);
  await button(editor, 'Edit exact JSON').click();
  const exact = editor.getByLabel('Exact registry JSON');
  const configPayload = JSON.parse(await exact.inputValue());
  assert.equal(configPayload.record.installation.record_id, single);
  assert.deepEqual(configPayload.record.fitted_modules.items.map(i => i.state), ['unknown', 'reported_fitted']);
  configPayload.record.operating_envelopes = [{
    envelope_id: 'joint-fixture', source_pointer: '/sources/0', conditions: [], all_of:
      [['temperature', '50', 'Cel', 'absolute_value'], ['pressure', '5', 'bar', 'absolute']].map(([dimension, value, unit, basis]) => ({
        observable_id: dimension, operator: 'lte', threshold: {schema_version: '0.1.0', value, dimension, unit, basis, reference: null,
          provenance: {kind: 'source_stated', evidence: [{document_id: 'symbolic-source-1',
            document_digest: fixtures.sha, pointer: '/limits/' + dimension}], explanation: null}},
      })),
  }];
  await exact.fill(JSON.stringify(configPayload));
  const config = await save(editor, 'Configuration');
  await seen(editor, '1 joint envelope(s); see exact revision');
  const savedConfig = await (await editor.request.get(apiPath(a) + '/records/' + config)).json();
  assert.deepEqual(savedConfig.revision.record.record.operating_envelopes, configPayload.record.operating_envelopes);
  await editor.getByText(/symbolic-module-unknown: unknown/).waitFor();
  await openNew(editor, a, 'assertion');
  await editor.getByLabel('Target revision', {exact: true}).selectOption({label: await editor.locator('option').filter({hasText: 'Synthetic individual report ·'}).textContent()});
  await select(editor, 'Outcome', 'affirmed');
  await fill(editor, 'Statement (optional)', 'Synthetic private assertion');
  await source(editor, fixtures.citation, 3);
  const claim = await save(editor, 'existence assertion');
  await site(reviewer, detail(a, claim));
  await clickAction(reviewer, 'Mark review disputed', 'Mark review disputed saved.');
  await site(reviewer, detail(a, single));
  await button(reviewer, 'Load related assertions').click();
  await reviewer.getByText(/affirmed · disputed · current target revision/).waitFor();

  const original = await (await editor.request.get(apiPath(a) + '/records/' + single)).json();
  const ref = original.revision.record;
  const {schema_version, organisation_id, record_id, revision_id, content_digest} = ref;
  const pinned = await editor.request.post(apiPath(a) + '/assessments', {data: {visibility: 'organisation',
    references: [{schema_version, organisation_id, record_id, revision_id, content_digest, record_type: 'installation'}]}});
  assert.equal(pinned.status(), 201);
  await site(editor, detail(a, single));
  await button(editor, 'Start correction').click();
  await fill(editor, 'Report label', 'Editor stale draft kept in browser');
  await site(owner, detail(a, single));
  await button(owner, 'Start correction').click();
  await fill(owner, 'Report label', 'New current server label');
  await clickAction(owner, 'Save correction', 'Saved a new revision.');
  await heading(owner, 'Current revision · New current server label');
  const conflict = waitPost(editor, '/revisions', 409);
  await button(editor, 'Save correction').click();
  await conflict;
  await editor.getByText(/Your draft is still here/).waitFor();
  await editor.getByText(/Current server revision ·/).waitFor();
  assert.equal(await editor.getByLabel('Report label', {exact: true}).inputValue(), 'Editor stale draft kept in browser');
  await shot(editor, 'stale-draft');
  await button(owner, 'Load exact history').click();
  const history = owner.locator('[data-history] details.card');
  await history.nth(1).waitFor();
  assert.equal(await history.count(), 2);
  await history.first().locator('summary').first().click();
  await heading(owner, 'Synthetic individual report');
  await clickAction(owner, 'Retire record', 'Retire record saved.');
  await clickAction(owner, 'Restore record', 'Restore record saved.');

  await site(owner, orgPath(a));
  await button(owner, 'Check dependent assessments').click();
  await owner.getByText(/Needs recheck ·/).waitFor();
  await owner.locator('[data-assessments] [data-list] > details > summary').click();
  await owner.getByText(/revised · record/).waitFor();
  const dl = owner.waitForEvent('download');
  await button(owner, 'Download private backup').click();
  const archive = JSON.parse(await readFile(await (await dl).path(), 'utf8'));
  assert.equal(archive.organisation.id, a);
  assert.equal(archive.format, 'planner-registry-export/2');
  assert(archive.revisions.some(r => r.record.record_id === config));

  await site(owner, detail(a, single));
  await clickAction(owner, 'Restrict to owners and reviewers', 'Applied the owner restriction.');
  await site(editor, detail(a, config));
  await seen(editor, 'This record or workspace is unavailable.');
  assert(!(await editor.locator('#view').innerText()).includes('symbolic-module'));
  await site(editor, orgPath(a));
  await button(editor, 'Check dependent assessments').click();
  await editor.locator('[data-assessments] [data-list] > details > summary').click();
  await seen(editor, 'Unavailable dependency');
  assert(!(await editor.locator('[data-assessments]').innerText()).includes(single));
  await site(reviewer, detail(a, config));
  await heading(reviewer, 'Current revision · Configuration');
  await clickAction(owner, 'Lift owner restriction', 'Lifted the owner restriction.');
  const narrowEditor = await session('editor', {width: 390, height: 844});
  await site(narrowEditor, detail(a, config));
  await heading(narrowEditor, 'Current revision · Configuration');
  assert(await narrowEditor.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await shot(narrowEditor, 'workspace-390');

  // Create a default and a service through the ordinary form, then check an
  // exact backed configuration, scope access evidence and draft locally.
  const serviceLabel = 'Synthetic configuration service';
  const serviceProvider = 'example:provider symbolic-provider';
  const material = 'example:material symbolic-private-material';
  const method = 'example:method symbolic-method';
  const policyFields = async (page, version, namespace = 'example:policy') => {
    await fill(page, 'Provider source reference', serviceProvider);
    await fill(page, 'Offer policy source and version', namespace + ' symbolic-policy ' + version);
    await fill(page, 'Offer policy SHA-256', fixtures.sha);
    await fill(page, 'Policy effective from', fixtures.date);
    await fill(page, 'Policy effective until (inclusive)', '2099-01-01');
    await select(page, 'Listing state', 'listed');
  };
  await openNew(owner, a, 'offer');
  await fill(owner, 'Service or policy label', 'Synthetic facility default');
  await select(owner, 'Report purpose', 'facility_default');
  await policyFields(owner, 'facility-v1', 'planner:facility_policy');
  await fill(owner, 'Reported methods (one reference per line)', method);
  await fill(owner, 'Accepted inputs (one reference per line)', material);
  await fill(owner, 'Excluded materials (one reference per line)', '-');
  const defaultId = await save(owner, 'Synthetic facility default');
  assert.equal(await button(owner, 'Check reported service fit').count(), 0);

  const currentWire = async id => {
    const response = await owner.request.get(apiPath(a) + '/records/' + id);
    assert.equal(response.status(), 200);
    return (await response.json()).revision.record;
  };
  const installation = await currentWire(single);
  const pin = ({schema_version, organisation_id, record_id, revision_id, content_digest, record}) =>
    ({schema_version, organisation_id, record_type: record.record_type, record_id, revision_id, content_digest});
  const createdConfig = await owner.request.post(apiPath(a) + '/records', {data: {
    visibility: 'organisation', observed_at: fixtures.date, expires_at: null, sources: [],
    use_rights: {discovery: 'permitted', assessment: 'permitted', republication: 'unknown', basis: fixtures.rights},
    record: {record_type: 'configuration', installation: pin(installation), fitted_modules: null,
      operating_envelopes: [{envelope_id: 'symbolic-bounds', conditions: [], source_pointer: null,
        all_of: [{observable_id: 'test-quantity', operator: 'lte', threshold: {schema_version: '0.1.0', value: '4',
          dimension: 'test-dimension', unit: 'test-unit', basis: 'test-basis', reference: {kind: 'none', id: null, conditions: []},
          provenance: {kind: 'reviewer_asserted', evidence: [], explanation: 'Synthetic bound'}}}]}]},
  }});
  assert.equal(createdConfig.status(), 201);
  const bounded = (await createdConfig.json()).revision.record;
  await site(owner, orgPath(a));
  await owner.locator('a[href="' + detail(a, bounded.record_id) + '"]').click();
  await heading(owner, 'Operator inventory survey');
  const survey = owner.locator('section[data-survey]');
  await button(survey, 'Open operator survey').click();
  await seen(survey, 'Step 1 of 7: Heads and modules');
  assert.equal(await survey.getByLabel('Answer status').inputValue(), 'unknown');
  await button(survey, 'Save and continue').click();
  await seen(survey, 'Step 2 of 7: Labware and handling');
  await survey.getByLabel('Private equipment details or referral role').click();
  assert(await survey.getByLabel('Private equipment details or referral role').evaluate(el => el === document.activeElement));
  await select(survey, 'Answer status', 'referral');
  await fill(survey, 'Private equipment details or referral role', 'Synthetic support referral');
  await button(survey, 'Save and continue').click();
  await seen(survey, 'Step 3 of 7: Drivers, software and connections');
  await button(survey, 'Add reported connection').click();
  const connection = survey.locator('[data-connection]');
  await fill(connection, 'Exact endpoint', 'synthetic:endpoint-a');
  await fill(connection, 'Exact interface', 'synthetic:interface-v2');
  await select(connection, 'Connection status', 'present');
  await fill(connection, 'Evidence observation date', fixtures.date);
  await connection.getByLabel('Calculate a digest from a local file').setInputFiles({
    name: 'private-symbolic-filename.txt', mimeType: 'text/plain', buffer: Buffer.from('synthetic digest bytes'),
  });
  await connection.locator('[name=value]').waitFor();
  await owner.waitForFunction(() => document.querySelector('[data-connection] [name=value]').value.length === 64);
  const connectionDigest = await connection.getByLabel('Evidence reference or digest').inputValue();
  const writeSurvey = waitPost(owner, '/survey', 200);
  await button(survey, 'Save survey draft').click();
  const surveyRequest = (await writeSurvey).request().postData();
  assert(surveyRequest.includes(connectionDigest) && !surveyRequest.includes('private-symbolic-filename') &&
    !surveyRequest.includes('synthetic digest bytes'));
  await seen(survey, 'Saved to your account.');
  await owner.reload();
  await button(survey, 'Open operator survey').click();
  await seen(survey, 'Step 3 of 7: Drivers, software and connections');
  assert.equal(await connection.getByLabel('Exact endpoint').inputValue(), 'synthetic:endpoint-a');
  assert.equal(await connection.getByLabel('Evidence reference or digest').inputValue(), connectionDigest);
  await seen(connection, bounded.revision_id);
  await button(survey, 'Save and go back').click();
  await seen(survey, 'Step 2 of 7: Labware and handling');
  assert.equal(await survey.getByLabel('Answer status').inputValue(), 'referral');
  await survey.getByRole('checkbox', {name: 'Booking', exact: true}).check();
  await select(survey, 'Enquiry status', 'ready_for_review');
  await button(survey, 'Save enquiry draft').click();
  await survey.getByLabel('Saved enquiry preview').waitFor();
  await button(survey, 'Approve this exact enquiry text').click();
  const safeEnquiry = await survey.getByLabel('Reviewed enquiry text').inputValue();
  assert(safeEnquiry.includes('How is the equipment booked?'));
  assert(!/synthetic:endpoint|support referral|fixture-alice|method|material/.test(safeEnquiry));
  await survey.getByRole('checkbox', {name: 'Charges', exact: true}).check();
  assert(await survey.getByLabel('Reviewed enquiry text').isHidden());

  await site(narrowEditor, detail(a, bounded.record_id));
  const editorSurvey = narrowEditor.locator('section[data-survey]');
  await button(editorSurvey, 'Open operator survey').click();
  await seen(editorSurvey, 'Step 1 of 7: Heads and modules');
  assert.equal(await editorSurvey.getByLabel('Saved enquiry preview').count(), 0);
  assert(await narrowEditor.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await shot(narrowEditor, 'operator-survey-390');
  await site(foreign, detail(a, bounded.record_id));
  await seen(foreign, 'This record or workspace is unavailable.');
  await openNew(owner, a, 'offer');
  await fill(owner, 'Service or policy label', serviceLabel);
  await policyFields(owner, 'service-v1');
  const localDefault = await currentWire(defaultId);
  const defaultPicker = owner.getByLabel('Local facility default revision', {exact: true});
  await defaultPicker.selectOption({label: 'Synthetic facility default · ' + localDefault.revision_id});
  const backing = owner.getByLabel('Backing configurations (select all reported alternatives)', {exact: true});
  await backing.selectOption({label: 'configuration · ' + bounded.revision_id});
  await fill(owner, 'Operator (optional)', 'Reported fixture operator');
  await fill(owner, 'Provider links (enquiry, quote or booking, followed by a plain HTTPS URL)', 'enquiry https://example.org/enquiry');
  const serviceId = await save(owner, serviceLabel);
  const service = await currentWire(serviceId);
  assert.equal(service.record.access_policy.facility_default.source.version, localDefault.revision_id);
  assert.deepEqual(service.record.backing_configurations, [pin(bounded)]);
  await seen(owner, 'Reported fixture operator');
  await openNew(owner, a, 'access_claim');
  const target = owner.getByLabel('Target revision', {exact: true});
  await target.selectOption({label: serviceLabel + ' · ' + service.revision_id});
  await select(owner, 'Access dimension', 'eligibility');
  await select(owner, 'Reported access outcome', 'affirmed');
  await select(owner, 'Subject scope', 'principal');
  await fill(owner, 'Exact subject ID (principal only; choose restricted visibility)', 'fixture-alice');
  await select(owner, 'Record visibility', 'restricted');
  await save(owner, 'Access claim');
  await openNew(owner, a, 'availability_claim');
  await owner.getByLabel('Target revision', {exact: true}).selectOption({label: serviceLabel + ' · ' + service.revision_id});
  await select(owner, 'Reported availability', 'unknown');
  await save(owner, 'Availability claim');
  await site(owner, detail(a, serviceId));
  await heading(owner, 'Assess this service');
  await fill(owner, 'Requested method reference', method);
  await fill(owner, 'Requested material reference', material);
  await fill(owner, 'Required points (one per line: observable value dimension unit basis reference)', 'test-quantity 2 test-dimension test-unit test-basis none');
  await owner.getByLabel('Save this private assessment and its exact inputs').check();
  await button(owner, 'Check reported service fit').click();
  await heading(owner, 'Technical fit is reported; access is unverified');
  await owner.getByText(/Saved private assessment/).waitFor();
  await seen(owner, 'reported affirmed');
  assert.equal(await owner.getByRole('link', {name: 'Open provider enquiry page'}).getAttribute('href'), 'https://example.org/enquiry');
  await button(owner, 'Prepare a local enquiry draft').click();
  const enquiry = await owner.getByLabel('Local enquiry draft').inputValue();
  assert(!enquiry.includes('symbolic-private-material') && !enquiry.includes('fixture-alice'));
  await heading(owner, 'Questions that could change this assessment');
  await owner.getByText(/Would training meet this offer/).click();
  await owner.getByText(/Who can answer: Training coordinator/).waitFor();
  await fill(owner, 'Required points (one per line: observable value dimension unit basis reference)', 'test-quantity 3 test-dimension test-unit test-basis none');
  await button(owner, 'Check reported service fit').click();
  await owner.getByText(/Saved private assessment/).waitFor();
  await openNew(owner, a, 'access_claim');
  await owner.getByLabel('Target revision', {exact: true}).selectOption({label: serviceLabel + ' · ' + service.revision_id});
  await select(owner, 'Access dimension', 'training');
  await select(owner, 'Reported access outcome', 'denied');
  await select(owner, 'Subject scope', 'principal');
  await fill(owner, 'Exact subject ID (principal only; choose restricted visibility)', 'fixture-alice');
  await select(owner, 'Record visibility', 'restricted');
  await source(owner, fixtures.citation, 12);
  const trainingId = await save(owner, 'Access claim');
  await clickAction(owner, 'Record evidence review', 'Record evidence review saved.');
  await site(owner, detail(a, serviceId));
  await fill(owner, 'Requested method reference', method);
  await fill(owner, 'Requested material reference', material);
  await fill(owner, 'Required points (one per line: observable value dimension unit basis reference)', 'test-quantity 2 test-dimension test-unit test-basis none');
  await button(owner, 'Check reported service fit').click();
  await heading(owner, 'A report indicates access is denied');
  await button(owner, 'Refresh my affected assessments').click();
  await seen(owner, 'Saved 2 refreshed assessment(s). Original captures remain in Dependent assessments.');
  const refreshResults = owner.locator('[data-refresh-outcome]');
  assert.equal(await refreshResults.getByText(/Before: Decision: Technical fit is reported/).count(), 2);
  assert.equal(await refreshResults.getByText(/After: Decision: A report indicates access is denied/).count(), 2);
  await site(owner, orgPath(a));
  await button(owner, 'Check dependent assessments').click();
  const assessments = owner.locator('[data-assessments]');
  const serviceAssessments = assessments.locator('details.card').filter({hasText: 'Saved service assessment'});
  await serviceAssessments.getByText(/Needs recheck/).first().waitFor();
  assert.equal(await serviceAssessments.getByText(/Needs recheck/).count(), 2);
  assert.equal(await serviceAssessments.getByText(/^Current · /).count(), 2);
  // One normal refresh action advances past a full batch. A conflict in the
  // next request leaves its earlier pairs intact and can be retried.
  const extraInput = {expected_head: pin(service), method: {namespace: 'example:method', native_id: 'symbolic-method'},
    material: {namespace: 'example:material', native_id: 'symbolic-private-material'}, conditions: [],
    requirements: [{observable_id: 'test-quantity', value: '2', dimension: 'test-dimension', unit: 'test-unit',
      basis: 'test-basis', reference: {kind: 'none', id: null}}], save: true};
  const extra = await Promise.all(Array.from({length: 11}, () =>
    owner.request.post(apiPath(a) + '/records/' + serviceId + '/match', {data: extraInput})));
  assert(extra.every(r => r.status() === 201));
  await site(owner, detail(a, trainingId));
  await clickAction(owner, 'Record evidence review', 'Record evidence review saved.');
  await site(owner, detail(a, serviceId));
  await fill(owner, 'Requested method reference', method);
  await fill(owner, 'Requested material reference', material);
  await fill(owner, 'Required points (one per line: observable value dimension unit basis reference)', 'test-quantity 2 test-dimension test-unit test-basis none');
  await button(owner, 'Check reported service fit').click();
  await heading(owner, 'A report indicates access is denied');
  let batches = 0;
  const refreshRoute = '**/refresh-matches';
  await owner.route(refreshRoute, route => ++batches === 2 ?
    route.fulfill({status: 409, json: {error: 'Synthetic retry conflict.'}}) : route.continue());
  await button(owner, 'Refresh my affected assessments').click();
  await seen(owner, 'Synthetic retry conflict.');
  await seen(owner, 'Saved 12 refreshed assessment(s). Original captures remain in Dependent assessments.');
  await seen(owner, 'More assessments remain. Choose Refresh my affected assessments to continue.');
  await owner.unroute(refreshRoute);
  await button(owner, 'Refresh my affected assessments').click();
  await seen(owner, 'Saved 13 refreshed assessment(s). Original captures remain in Dependent assessments.');
  await site(owner, orgPath(a));
  await button(owner, 'Check dependent assessments').click();
  const nextAssessments = button(owner, 'More dependent assessments');
  await nextAssessments.waitFor();
  assert.equal(await assessments.locator('details.card').count(), 25);
  await nextAssessments.click();
  await nextAssessments.waitFor({state: 'hidden'});
  const continued = await assessments.locator('details.card > summary').allTextContents();
  assert.ok(continued.length > 25);
  assert.equal(new Set(continued).size, continued.length);
  await site(foreign, detail(a, serviceId));
  await seen(foreign, 'This record or workspace is unavailable.');
  await site(guest, '#registry/public/' + serviceId);
  await seen(guest, 'This record or workspace is unavailable.');
  await site(narrowEditor, detail(a, serviceId));
  await heading(narrowEditor, 'Assess this service');
  assert(await narrowEditor.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await site(owner, detail(a, single));
  await clickAction(owner, 'Restrict to owners and reviewers', 'Applied the owner restriction.');
  await site(narrowEditor, detail(a, serviceId));
  await seen(narrowEditor, 'This record or workspace is unavailable.');
  await clickAction(owner, 'Lift owner restriction', 'Lifted the owner restriction.');

  const duplicateLabel = 'Synthetic duplicate report', canonicalLabel = 'Synthetic canonical report';
  await openNew(owner, a, 'installation');
  await fill(owner, 'Report label', duplicateLabel);
  await select(owner, 'Record visibility', 'public');
  await source(owner, fixtures.citation, 3);
  const duplicateId = await save(owner, duplicateLabel);
  await clickAction(owner, 'Record evidence review', 'Record evidence review saved.');
  await button(owner, 'Preview public fields').click();
  await heading(owner, 'Server preview · private until published');
  await clickAction(owner, 'Publish this exact preview', 'Published the selected fields.');
  const duplicatePublic = '#registry/public/' + duplicateId;
  await site(guest, duplicatePublic);
  await heading(guest, duplicateLabel);
  await openNew(owner, a, 'installation');
  await fill(owner, 'Report label', canonicalLabel);
  await fill(owner, 'Reported location (private; blank if unknown)', 'Earlier synthetic site');
  const canonicalId = await save(owner, canonicalLabel);
  const originalCanonical = await currentWire(canonicalId);
  const startLink = async canonical => {
    await site(owner, detail(a, duplicateId));
    await button(owner, 'Link as duplicate').click();
    await owner.getByLabel('Canonical installation revision', {exact: true}).selectOption({label: canonicalLabel + ' · ' + canonical.revision_id});
    await fill(owner, 'Change date', fixtures.date);
    await fill(owner, 'Reason', 'Reported records describe one synthetic installation');
  };
  await startLink(originalCanonical);
  await site(editor, detail(a, canonicalId));
  assert.equal(await button(editor, 'Link as duplicate').count(), 0);
  await button(editor, 'Record dated location change').click();
  await fill(editor, 'New reported location (blank if unknown)', 'New synthetic site');
  await fill(editor, 'Change date', fixtures.date);
  await fill(editor, 'Reason', 'Synthetic dated move record');
  const moveSource = editor.locator('[data-installation] .reg-source');
  await fill(moveSource, 'Source HTTPS URL', 'https://example.org/dated-move');
  await fill(moveSource, 'Source namespace', 'example:record');
  await fill(moveSource, 'Source identifier', 'symbolic-dated-move');
  await fill(moveSource, 'Source observation date', fixtures.date);
  await button(editor, 'Save location change').click();
  await seen(editor, 'Saved the dated location change.');
  await seen(editor, 'New synthetic site');
  await button(editor, 'Load exact history').click();
  await editor.locator('[data-history] details.card').first().locator('summary').first().click();
  await seen(editor, 'Earlier synthetic site');
  await button(owner, 'Save duplicate resolution').click();
  await owner.getByText(/registry head or sharing policy changed/).waitFor();
  assert.equal(await owner.getByLabel('Reason', {exact: true}).inputValue(), 'Reported records describe one synthetic installation');
  await startLink(await currentWire(canonicalId));
  await fill(owner, 'Evidence locator (optional HTTPS URL)', 'https://example.org/duplicate-evidence');
  await button(owner, 'Save duplicate resolution').click();
  await seen(owner, 'Saved the duplicate resolution.');
  assert.equal(await button(owner, 'Restore record').count(), 0);
  await site(guest, duplicatePublic);
  await seen(guest, 'This record or workspace is unavailable.');
  await site(foreign, detail(a, duplicateId));
  await seen(foreign, 'This record or workspace is unavailable.');
  await site(narrowEditor, orgPath(a));
  await narrowEditor.getByText(/Canonical report with 1 visible duplicate/).waitFor();
  await narrowEditor.getByText(/Linked duplicate/).waitFor();
  await site(narrowEditor, detail(a, canonicalId));
  await button(narrowEditor, 'Show visible duplicate reports').click();
  await narrowEditor.getByRole('link', {name: duplicateLabel, exact: true}).click();
  await heading(narrowEditor, 'Current revision · ' + duplicateLabel);
  assert(await narrowEditor.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await button(owner, 'Unlink duplicate').click();
  await fill(owner, 'Change date', fixtures.date);
  await fill(owner, 'Reason', 'Correction after comparing the retained reports');
  await button(owner, 'Save unlink').click();
  await seen(owner, 'Removed the duplicate link.');
  await site(guest, duplicatePublic);
  await seen(guest, 'This record or workspace is unavailable.');
  await button(owner, 'Load exact history').click();
  await owner.locator('[data-history] details.card').nth(3).waitFor({state: 'attached'});
  assert.equal(await owner.locator('[data-history] details.card').count(), 4);

  // Register and reconfirm a symbolic pilot lead through the normal Registry workspace.
  const pilotLabel = 'Synthetic pilot installation', cohortLabel = 'Synthetic pilot cohort';
  await openNew(owner, a, 'installation');
  await fill(owner, 'Report label', pilotLabel);
  await select(owner, 'Record visibility', 'restricted');
  await source(owner, fixtures.citation, 1);
  const pilotInstallation = await save(owner, pilotLabel);
  await clickAction(owner, 'Record evidence review', 'Record evidence review saved.');
  const oldPilotReview = await currentWire(pilotInstallation);
  const today = new Date().toISOString().slice(0, 10);
  await site(owner, orgPath(a));
  await owner.getByRole('link', {name: 'Pilot cohorts', exact: true}).click();
  await button(owner, 'New pilot cohort').click();
  await fill(owner, 'Cohort name', cohortLabel);
  await fill(owner, 'Sampling frame', 'Single symbolic installation');
  await fill(owner, 'Identification window starts', fixtures.date);
  await fill(owner, 'Identification window ends', today);
  await fill(owner, 'Required evidence checklist', 'module: Synthetic module\ninterface: Synthetic interface');
  await fill(owner, 'Reason for this change', 'Register symbolic cohort');
  await button(owner, 'Save').click();
  await heading(owner, cohortLabel);
  const pilotRoute = new URL(owner.url()).hash;
  const pilotId = pilotRoute.split('/').at(-1).slice(6);
  const pilotPath = apiPath(a) + '/pilot/' + pilotId;
  const metric = async (key, value) => {
    await owner.locator('[data-metric="' + key + '"]').getByText(value, {exact: true}).waitFor();
  };
  await button(owner, 'Register lead').click();
  await fill(owner, 'Private lead label', 'Symbolic installation lead');
  for (const label of ['Identified date', 'Invited date', 'Reply received date', 'Operator review date']) await fill(owner, label, today);
  const expand = text => owner.locator('summary').getByText(text, {exact: true}).click();
  const evidence = async (host, label, key) => {
    await fill(host, label + ' evidence reference', 'ref:fixture/' + key);
    await fill(host, label + ' evidence date', today);
  };
  await expand('Responsible person and steward consent');
  await fill(owner, 'Responsible person label', 'Synthetic operator role');
  await select(owner, 'Responsible role', 'operator');
  await evidence(owner, 'Responsible role', 'operator');
  await fill(owner, 'Steward label', 'Synthetic steward role');
  await select(owner, 'Reported steward consent', 'attested');
  await evidence(owner, 'Steward consent', 'consent');
  await expand('Overlap, referral, access and support');
  for (const [label, state] of [['Overlap', 'clear'], ['Referral', 'suggested'], ['Access', 'inaccessible'], ['Support', 'conditional']]) {
    await select(owner, label, state);
    await evidence(owner, label, label.toLowerCase());
  }
  await expand('Required module and interface facts');
  for (const kind of ['module', 'interface']) {
    await button(owner, 'Add required fact').click();
    const row = owner.locator('[data-fact]').last();
    await select(row, 'Fact kind', kind);
    await fill(row, 'Fact name', 'Synthetic ' + kind);
    await select(row, 'Fact evidence state', 'reported_present');
    await evidence(row, 'Fact', kind);
  }
  const choosePilotReview = async ref => {
    await expand('Exact installation review and reconfirmation');
    await button(owner, 'Load reviewed installations').click();
    await select(owner, 'Reviewed installation revision', ref.revision_id);
    await fill(owner, 'Reconfirm by date', '2099-01-01');
  };
  await choosePilotReview(oldPilotReview);
  await expand('Before and after decision');
  await select(owner, 'Decision outcome', 'no_change');
  await fill(owner, 'Decision date', today);
  await fill(owner, 'Decision explanation', 'Both references support the same symbolic decision.');
  await evidence(owner, 'Before decision', 'before/v1');
  await evidence(owner, 'After decision', 'after/v2');
  await fill(owner, 'Reason for this change', 'Register evidence and initial review');
  await button(owner, 'Save').click();
  await seen(owner, 'Saved a private pilot revision.');
  await metric('verified', '1 / 1');
  await metric('response', '1 / 1');
  await metric('inaccessible', '1 / 1');
  await owner.getByText(/Decision no change/).waitFor();
  for (const visitor of [foreign, editor, guest]) {
    await site(visitor, pilotRoute);
    if (visitor === guest) await visitor.getByText(/Sign in to open or create a registry workspace/).waitFor();
    else await seen(visitor, 'This record or workspace is unavailable.');
    assert(!(await visitor.locator('#view').innerText()).includes(cohortLabel));
  }
  await reviewer.setViewportSize({width: 390, height: 844});
  await site(reviewer, pilotRoute);
  await heading(reviewer, cohortLabel);
  assert(await reviewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const revisePilotInstallation = async (ref, data) => {
    const r = await owner.request.post(apiPath(a) + '/records/' + pilotInstallation + '/revisions', {data: {expected_head: pin(ref), ...data}});
    assert.equal(r.status(), 200, (await r.json()).error);
    return (await r.json()).revision.record;
  };
  const correction = {visibility: 'restricted', observed_at: fixtures.date, expires_at: '2026-01-02T00:00:00.000Z',
    sources: oldPilotReview.sources, use_rights: oldPilotReview.use_rights, record: oldPilotReview.record};
  const expiredPilot = await revisePilotInstallation(oldPilotReview, correction);
  await site(owner, pilotRoute);
  await owner.getByText(/installation expired/).waitFor();
  await metric('verified', '0 / 1');
  await metric('stale', '1 / 1');
  const correctedPilot = await revisePilotInstallation(expiredPilot, {...correction, expires_at: null});
  await site(owner, pilotRoute);
  await owner.getByText(/installation revision changed/).waitFor();
  await metric('verified', '0 / 1');
  await site(owner, detail(a, pilotInstallation));
  await clickAction(owner, 'Record evidence review', 'Record evidence review saved.');
  const freshPilot = await currentWire(pilotInstallation);
  assert.notEqual(freshPilot.revision_id, oldPilotReview.revision_id);
  assert.equal(freshPilot.parent.revision_id, correctedPilot.revision_id);
  await site(owner, pilotRoute);
  await metric('stale', '1 / 1');
  await button(owner, 'Edit lead').click();
  await choosePilotReview(freshPilot);
  await fill(owner, 'Reason for this change', 'Reconfirm against fresh exact evidence review');
  await button(owner, 'Save').click();
  await metric('verified', '1 / 1');
  await metric('stale', '0 / 1');
  const updatedPilot = (await (await owner.request.get(pilotPath)).json()).cohort;
  assert.deepEqual(updatedPilot.leads[0].review.pin, pin(freshPilot));
  assert.equal(updatedPilot.leads[0].decision.outcome, 'no_change');
  await button(owner, 'Correction history').click();
  await owner.locator('[data-history-list] summary').getByText(/Register evidence and initial review/).click();
  await owner.locator('[data-history-list] pre').getByText(new RegExp(oldPilotReview.revision_id)).waitFor();
  await shot(owner, 'pilot-reconfirmation');

  // Profile hydration belongs to the rest of Planner. A delayed response must
  // not replace an already-open Registry form for the same signed-in account.
  const hydrating = await session('editor');
  let hydrate, profileRequested;
  const resume = new Promise(resolve => { hydrate = resolve; });
  const profilePending = new Promise(resolve => { profileRequested = resolve; });
  await hydrating.route('**/api/profile', async route => {
    const response = await route.fetch();
    profileRequested(); await resume; await route.fulfill({response});
  });
  await site(hydrating, '#registry');
  await profilePending;
  await hydrating.evaluate(hash => { location.hash = hash; }, detail(a, config));
  await button(hydrating, 'Start correction').click();
  await fill(hydrating.locator('.reg-module').first(), 'Module identifier', 'draft-kept-during-hydration');
  hydrate();
  await hydrating.locator('#account strong').waitFor();
  assert.equal(await hydrating.locator('.reg-module').first().getByLabel('Module identifier').inputValue(), 'draft-kept-during-hydration');

  // Deliver a real, already-authorized response after navigating to a different
  // workspace. Detached nodes must never restore the former selection or data.
  let release, requested, delivered;
  const held = new Promise(resolve => { release = resolve; });
  const requestedResponse = new Promise(resolve => { requested = resolve; });
  const responseDelivered = new Promise(resolve => { delivered = resolve; });
  await owner.route('**' + apiPath(a) + '/records/' + group, async route => {
    const response = await route.fetch();
    requested(); await held; await route.fulfill({response}); delivered();
  });
  await owner.evaluate(hash => { location.hash = hash; }, groupPath);
  await requestedResponse;
  await owner.evaluate(hash => { location.hash = hash; }, orgPath(b));
  await seen(owner, b);
  release(); await responseDelivered;
  await owner.evaluate(() => new Promise(requestAnimationFrame));
  assert(!(await owner.locator('#view').innerText()).includes(fixtures.group));
  assert.equal(new URL(owner.url()).hash, orgPath(b));
  // Exercise the Worker page boundary rather than injecting a browser result.
  const pageOnly = 'Paginated synthetic report';
  for (let i = 0; i < 101; i++) {
    const result = await foreign.request.post(apiPath(b) + '/records', {data: {visibility: 'organisation',
      observed_at: fixtures.date, expires_at: null, sources: [], use_rights: {discovery: 'unknown',
        assessment: 'unknown', republication: 'unknown', basis: null}, record: {record_type: 'installation',
        label: pageOnly + ' ' + i, reported_location: null, model: null, external_id_claims: []}}});
    assert.equal(result.status(), 201);
  }
  await openNew(owner, b, 'configuration');
  const targetPicker = owner.getByLabel('Target revision', {exact: true});
  assert.equal(await targetPicker.locator('option').count(), 101);
  await targetPicker.selectOption({index: 1});
  const selectedTarget = await targetPicker.inputValue();
  await button(owner, 'Add module').click();
  await fill(owner, 'Module identifier', 'preserve-module-draft');
  await button(owner, 'Load more target revisions').click();
  await targetPicker.locator('option').nth(101).waitFor({state: 'attached'});
  assert.equal(await targetPicker.inputValue(), selectedTarget);
  assert.equal(await owner.getByLabel('Module identifier', {exact: true}).inputValue(), 'preserve-module-draft');
  await site(owner, orgPath(b));
  await owner.getByRole('link', {name: new RegExp(pageOnly)}).first().waitFor();
  const revoked = await foreign.request.post(apiPath(b) + '/members', {data: {user_id: 'fixture-alice', role: null}});
  assert.equal(revoked.status(), 200);
  await button(owner, 'More workspace reports').click();
  await seen(owner, 'This record or workspace is unavailable.');
  assert(!(await owner.locator('#view').innerText()).includes(pageOnly));
  // A fresh synthetic workspace; optionally load the exact reviewed Atlas bytes.
  await site(owner, '#registry/workspace');
  const roarOrg = await createOrg(owner);
  const importRoute = orgPath(roarOrg) + '/roar-import';
  await owner.getByRole('link', {name: 'Import ROAR reports', exact: true}).click();
  await heading(owner, 'Import ROAR reports');
  await owner.setViewportSize({width: 390, height: 844});
  const chooseRoar = (label, text) => owner.getByLabel(label).setInputFiles({
    name: 'release.json', mimeType: 'application/json', buffer: Buffer.from(text),
  });
  await chooseRoar('ROAR discovery crosswalk', roarInput.crosswalk);
  await chooseRoar('C11 instrument model bundle', roarInput.bundle + ' ');
  await button(owner, 'Preview import').click();
  await seen(owner, 'The ROAR files do not match the reviewed crosswalk and exact C11 release.');
  assert(await button(owner, 'Save private reports').isDisabled());
  await chooseRoar('C11 instrument model bundle', roarInput.bundle);
  const response = waitPost(owner, '/roar-import/preview', 200);
  await button(owner, 'Preview import').click();
  const proposed = (await (await response).json()).reports;
  const report = atlas ? 'Freeslate Junior reported roles' : 'Fixture report';
  const entry = owner.locator('summary').getByText(report + ' · create', {exact: true});
  await entry.click();
  await owner.getByText(atlas ? 'junior-dispensing' : 'fixture-role', {exact: true}).waitFor();
  assert(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await shot(owner, 'roar-import-preview');
  await button(owner, 'Save private reports').click();
  await seen(owner, `Saved privately: ${proposed.length} new, 0 revised, 0 unchanged.`);
  await owner.getByRole('link', {name: 'Open workspace reports'}).click();
  await owner.getByRole('link', {name: report, exact: true}).click();
  await heading(owner, 'Current revision · ' + report);
  await button(owner, 'Load related assertions').click();
  await owner.getByRole('link', {name: 'ROAR source evidence · ' + report, exact: true}).click();
  await heading(owner, 'Current revision · ROAR source evidence · ' + report);
  await heading(owner, 'Reported roles');
  if (!atlas) await heading(owner, 'Conflicting reports');
  await shot(owner, 'roar-import-readback');
  await site(owner, importRoute);
  await chooseRoar('ROAR discovery crosswalk', roarInput.crosswalk);
  await chooseRoar('C11 instrument model bundle', roarInput.bundle);
  await button(owner, 'Preview import').click();
  await owner.locator('summary').getByText(report + ' · unchanged', {exact: true}).waitFor();
  assert(await button(owner, 'Save private reports').isDisabled());
  await site(foreign, importRoute);
  await seen(foreign, 'This record or workspace is unavailable.');
  await site(guest, '#registry');
  assert.equal(await guest.getByRole('link', {name: 'Atlas ROAR discovery'}).getAttribute('href'),
    'https://instrument-capability-catalogue.nathan-skene.chatgpt.site/#roar');
  assert.equal(await guest.getByRole('link', {name: 'Contribution workspace'}).getAttribute('href'), '#registry/workspace');

  const f = await requestDraftFixture(async (path, method, body) => {
    const response = await owner.request.fetch(path, {method, ...(body ? {data: body} : {})});
    return {status: response.status(), json: await response.json()};
  }, 'fixture-alice');
  await site(guest, '#registry/public/' + f.grouped.record_id);
  await heading(guest, 'Synthetic grouped discovery');
  await site(owner, orgPath(f.organisation.id));
  await button(owner, 'Check dependent assessments').click();
  const card = owner.locator('[data-list] > details').filter({hasText: f.matched.assessment_id});
  await card.locator(':scope > summary').click();
  await card.getByLabel('Reviewed assessment input JSON').setInputFiles({
    name: 'synthetic-reviewed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(f.reviewed)),
  });
  const prepared = waitPost(owner, '/request-v1', 201);
  await button(card, 'Prepare private request').click();
  const request = (await (await prepared).json()).draft;
  await seen(owner, 'Prepared for local review. No provider outcome has been supplied.');
  const downloaded = owner.waitForEvent('download');
  await button(card, 'Download private request JSON').click();
  assert.deepEqual(JSON.parse(await readFile(await (await downloaded).path(), 'utf8')), request);
  await site(owner, orgPath(f.organisation.id));
  await owner.getByText('Retrieve a private service request', {exact: true}).click();
  await fill(owner, 'Private request ID', request.id);
  await button(owner, 'Retrieve private request').click();
  await owner.getByText('Exact private request', {exact: true}).waitFor();
  assert.equal(request.provider_outcome, null);
  const foreignDraft = await foreign.request.get(f.path + '/request-drafts-v1/' + request.id);
  assert.equal(foreignDraft.status(), 404);
  const inventoryBody = {visibility:'organisation', observed_at:fixtures.date, expires_at:null, sources:[],
    use_rights:{discovery:'permitted', assessment:'permitted', republication:'unknown', basis:fixtures.rights}};
  const createPlanningRecord = async record => {
    const res = await owner.request.post(apiPath(a) + '/records', {data:{...inventoryBody, record}});
    assert.equal(res.status(), 201);
    return (await res.json()).revision.record;
  };
  const witness = await createPlanningRecord({record_type:'installation', label:'Synthetic planning installation',
    model:null, external_id_claims:[], reported_location:null});
  const witnessConfig = await createPlanningRecord({record_type:'configuration',
    installation:pin(witness), fitted_modules:{coverage:'partial', items:[
      {module_id:'test-mover', state:'unknown', source_pointer:null},
      {module_id:'test-magnet', state:'reported_absent', source_pointer:null},
    ]},
    operating_envelopes:null});
  const {protocol} = planningFixture('grouped','upgrade');
  const profileSeed = {version:1, workflows:[protocol.workflow], equipment:[], setups:[], answers:{}};
  db._db.prepare('INSERT INTO profiles (user_id, email, data, updated_at) VALUES (?,?,?,?)')
    .run('fixture-alice', '', JSON.stringify(profileSeed), Date.now());
  await owner.evaluate(data => localStorage.setItem('atlas-profile-v1', JSON.stringify({
    version:1, workflows:[data.workflow], protocols:data.snapshots, equipment:[], setups:[], answers:{},
  })), protocol);
  await site(owner, detail(a,witness.record_id));
  await owner.reload();
  await heading(owner, 'Current revision · Synthetic planning installation');
  const planning = owner.locator('[data-planning]');
  await planning.getByText('Compare a workflow on this installation', {exact:true}).click();
  await fill(planning, 'Protocol review reference', 'synthetic-reviewed-source');
  await button(planning, 'Find configurations').click();
  await planning.locator('select[name="configuration"] option').nth(1).waitFor({state:'attached'});
  await planning.locator('select[name="configuration"]').selectOption(witnessConfig.revision_id);
  await planning.locator('select[name="model"]').selectOption('plr-hamilton-star');
  await planning.locator('input[data-head="1000ul-channels"]').fill('8');
  await planning.locator('select[data-inventory-module="test-magnet"]').selectOption('optional:Invitrogen Ambion Magnetic Stand');
  const evaluated = waitPost(owner, '/planning-v1', 200);
  await button(planning, 'Compare privately').click();
  const comparison = await (await evaluated).json();
  assert.equal(comparison.binding.configuration.revision_id, witnessConfig.revision_id);
  assert.equal(comparison.binding.access, 'unverified');
  await heading(planning, 'Private comparison');
  await planning.getByText('Proposed work by person and device', {exact:true}).click();
  await planning.getByText('automated candidate', {exact:true}).first().waitFor();
  await planning.getByRole('columnheader', {name:'Modeled liquid per vessel', exact:true}).first().waitFor();
  await planning.getByText('Station handoffs to review', {exact:true}).click();
  await planning.getByText('Initial loading', {exact:true}).waitFor();
  await planning.getByText('Included in setup', {exact:true}).waitFor();
  assert.ok(comparison.assessment.work_map.transport_review.directed_links.every(link => link.estimated_savings_minutes === null));
  assert.equal(comparison.assessment.decision.recommended.head_id, 'as-installed:1000ul-channels-8');
  assert.equal(comparison.assumptions.status, 'caller_hypothesis');
  assert.deepEqual(comparison.assumptions.module_mappings.map(mapping => [mapping.status,mapping.effect]),[['reported_absent','excluded']]);
  await planning.getByText(/Invitrogen Ambion Magnetic Stand\s*·\s*reported absent\s*·\s*excluded/).waitFor();
  await planning.getByText('Choose a protocol block', {exact:true}).click();
  await planning.locator('select[name="block_source"]').selectOption('0');
  await planning.locator('select[name="first_step"]').selectOption('2');
  await planning.locator('select[name="last_step"]').selectOption('3');
  await planning.locator('select[name="input_labware"]').selectOption('tube-1.5');
  await button(planning, 'Compare privately').click();
  await seen(planning, 'Starting volume is unknown. The selected block has no numeric estimate.');
  await planning.locator('input[name="input_volume"]').fill('40');
  await planning.locator('input[name="input_evidence"]').fill('Synthetic volume record');
  const boundedResponse = waitPost(owner, '/planning-v1', 200);
  await button(planning, 'Compare privately').click();
  const boundedResult = await (await boundedResponse).json();
  const boundedPlan = boundedResult.assessment.decision;
  assert.deepEqual(boundedPlan.source_actions.map(action => action.step_position), [2,3]);
  assert.equal(boundedPlan.block.input.labware, 'tube-1.5');
  await planning.getByText(/Source steps 2–3.*starting volume 40 µL/s).first().waitFor();
  const takeReplay = owner.waitForEvent('download');
  await button(planning, 'Download replay file').click();
  const savedReplay = JSON.parse(await readFile(await (await takeReplay).path(),'utf8'));
  assert.equal(savedReplay.workflow.block.from,2);
  assert.equal(savedReplay.binding_sha256,boundedResult.binding_sha256);
  assert.ok(savedReplay.scenario.module_hypotheses.length);
  assert.equal(savedReplay.protocol,undefined);
  assert.equal(savedReplay.assessment,undefined);
  await owner.reload();
  await heading(owner, 'Current revision · Synthetic planning installation');
  await planning.getByText('Compare a workflow on this installation', {exact:true}).click();
  const replayInput = planning.getByLabel('Reopen a private comparison');
  const reopen = waitPost(owner, '/planning-v1', 200);
  const uploadReplay = file => replayInput.setInputFiles({name:'replay.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});
  await uploadReplay(savedReplay);
  assert.deepEqual(await (await reopen).json(),boundedResult);
  await planning.getByText(/Saved comparison verified against the current workflow/).waitFor();
  const changedReplay = structuredClone(savedReplay);
  changedReplay.scenario.decision.workload--;
  const refusedReplay = waitPost(owner, '/planning-v1', 409);
  await uploadReplay(changedReplay);
  await refusedReplay;
  await planning.getByText(/Run a fresh private comparison/).waitFor();
  assert.equal(await planning.getByRole('heading',{name:'Private comparison'}).count(),0);
  const outputSource = snapshotFromText('Inert output choice', [
    '1. Prepare water', 'Add 45 uL water to each tube.',
    '2. Allocate water', 'Transfer 35 uL liquid to a fresh tube (or 29 uL main sample + 6 uL control in separate tubes)',
  ].join('\n'));
  const outputWorkflow = {id:'synthetic-outputs', name:outputSource.name, format:'tube', labware:'tube-1.5', defaultWorkload:1,
    parts:[{source:'text', id:outputSource.id, versionId:outputSource.version.id}],
    branches:{[`text-${outputSource.id}-2:output-1`]:'Separate output vessels'}};
  db._db.prepare('UPDATE profiles SET data = ? WHERE user_id = ?')
    .run(JSON.stringify({...profileSeed, workflows:[outputWorkflow]}), 'fixture-alice');
  await owner.evaluate(({workflow, snapshot}) => localStorage.setItem('atlas-profile-v1', JSON.stringify({
    version:1, workflows:[workflow], protocols:[snapshot], equipment:[], setups:[], answers:{},
  })), {workflow:outputWorkflow, snapshot:outputSource});
  await owner.reload();
  await heading(owner, 'Current revision · Synthetic planning installation');
  await planning.getByText('Compare a workflow on this installation', {exact:true}).click();
  await fill(planning, 'Protocol review reference', 'synthetic-water-output-review');
  await planning.locator('select[name="model"]').selectOption('plr-hamilton-star');
  await planning.locator('input[data-head="1000ul-channels"]').fill('8');
  const splitResponse = waitPost(owner, '/planning-v1', 200);
  await button(planning, 'Compare privately').click();
  const splitPlan = (await (await splitResponse).json()).assessment;
  const outputAction = splitPlan.decision.source_actions.find(action => action.output_allocation);
  assert.equal(outputAction.body_line, 1);
  assert.deepEqual(outputAction.output_allocation.map(output => output.volumeUl), [29,6]);
  assert.equal(splitPlan.work_map.baseline.find(row => row.action_id === outputAction.id).assignment, 'operator');
  await planning.getByText('Manual baseline', {exact:true}).click();
  await planning.getByText('main sample · 29 µL · tube', {exact:true}).waitFor();
  await planning.getByText('control · 6 µL · tube', {exact:true}).waitFor();
  assert.deepEqual(await owner.evaluate(() => JSON.parse(localStorage.getItem('atlas-profile-v1')).equipment), []);
  assert.deepEqual(await owner.evaluate(() => Object.keys(localStorage).filter(k => /registry/i.test(k))), []);
  assert.deepEqual(profileWrites, []);
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  console.log('Registry browser passed: two same-name organisations; owner/editor/reviewer; scoped reports, exact history and stale correction; preview, publish, withdraw, restrictions, dependencies, backup; service defaults, scoped access, matching and local enquiry; progressive survey, local digest, save/resume and two reviewed refreshes; duplicate resolution, dated move and unlink; private pilot expiry, exact reconfirmation, history and isolation; exact private service request, download and scoped readback; Registry-bound workflow and protocol-block comparisons; paginated targets, revoked pagination, late responses and 390 px; ROAR file preview, private save, readback and replay; no errors, external requests or profile writes.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
