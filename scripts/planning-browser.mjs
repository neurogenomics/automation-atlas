// Compare the real Decide download with the authenticated HTTP Worker across
// both synthetic workflow structures and every scope. Only loopback traffic.
import assert from 'node:assert/strict';
import {spawn, execFile} from 'node:child_process';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {chromium} from 'playwright';
import {connectPlanningPreview} from './planning-client.mjs';
import {benchDevice, benchPlanningFixture, planningFixture} from './planning-fixtures.mjs';
import {snapshotFromText} from '../lib/snapshots.js';

const probe = createServer();
probe.listen(0, '127.0.0.1');
await once(probe, 'listening');
const {port} = probe.address();
await new Promise(resolve => probe.close(resolve));
const origin = `http://localhost:${port}`;
const server = spawn(process.execPath, ['scripts/dev.mjs'], {
  env: {PATH: process.env.PATH, PORT: String(port)}, stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '', browser;
server.stdout.on('data', chunk => serverLog += chunk);
server.stderr.on('data', chunk => serverLog += chunk);
const failures = [], rows = [];
try {
  for (let n = 0; ; n++) {
    try { if ((await fetch(origin + '/api/me')).ok) break; } catch {}
    if (n === 99) throw Error(serverLog);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  // A raw network header cannot create a user at this loopback edge.
  const raw = await fetch(origin + '/api/planning/v1/assess', {method: 'POST', headers: {
    'Content-Type': 'application/json', 'oai-authenticated-user-id': 'forged-preview-identity',
  }, body: JSON.stringify(planningFixture())});
  assert.equal(raw.status, 401);
  const client = await promisify(execFile)(process.execPath, ['scripts/planning-client.mjs', origin]);
  const clean = JSON.parse(client.stdout);
  assert.equal(clean.file_roundtrip, true);
  const call = await connectPlanningPreview(origin);
  const options = {headless: true};
  if (process.env.BROWSER_DEPS_DIR) {
    const d = process.env.BROWSER_DEPS_DIR;
    options.env = {...process.env, LD_LIBRARY_PATH: (await readFile(join(d, 'library-path'), 'utf8')).trim(),
      FONTCONFIG_FILE: join(d, 'fonts.conf')};
  }
  browser = await chromium.launch(options);
  for (const seed of ['grouped', 'individual']) {
    for (const missing of [false, true]) {
      const page = await browser.newPage({acceptDownloads: true});
      page.on('pageerror', e => failures.push(e.message));
      await page.route('**/*', route => {
        if (new URL(route.request().url()).origin === origin) return route.continue();
        failures.push('Unexpected request to ' + route.request().url());
        return route.abort();
      });
      const setup = planningFixture(seed, 'design', missing);
      await page.goto(origin + '/web/index.html#decide');
      await page.locator('#import-file').setInputFiles({name: 'synthetic-profile.json', mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({version: 1, protocols: setup.protocol.snapshots,
          workflows: [setup.protocol.workflow], equipment: setup.installations}))});
      await page.locator('#dc-workload').waitFor();
      for (const scope of ['accessible', 'upgrade', 'design']) {
        await page.locator(`button[data-scope="${scope}"][aria-pressed]`).click();
        await page.getByText('How this was worked out', {exact: true}).click();
        const download = page.waitForEvent('download');
        await page.locator('[data-planning-result]').click();
        const ui = JSON.parse(await readFile(await (await download).path(), 'utf8'));
        const api = await call('assess', planningFixture(seed, scope, missing));
        assert.deepEqual(ui, api.data.decision);
        assert.equal(ui.baseline.missingWaits, Number(missing));
        assert.ok(ui.source_actions.length > 0);
        if (scope === 'design') assert.ok(ui.configurations.length >= 2);
        if (scope === 'accessible' && missing) assert.equal(ui.recommended, null);
        rows.push({seed, scope, missing, configurations: ui.configurations.length, http_ms: api.ms});
      }
      await page.close();
    }
  }
  const overflow = planningFixture('grouped', 'accessible');
  const fill = snapshotFromText('Synthetic water fill', '1. Water fill\n' +
    Array(20).fill('Add 11 uL water to each well.').join('\n'));
  overflow.protocol.snapshots = [fill];
  overflow.protocol.workflow.parts = [{source: 'text', id: fill.id, versionId: fill.version.id}];
  const blocked = await browser.newPage({acceptDownloads: true});
  blocked.on('pageerror', error => failures.push(error.message));
  await blocked.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    failures.push('Unexpected request to ' + route.request().url());
    return route.abort();
  });
  await blocked.goto(origin + '/web/index.html#decide');
  await blocked.locator('#import-file').setInputFiles({name: 'overflow-profile.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({version: 1, protocols: [fill], workflows: [overflow.protocol.workflow],
      equipment: overflow.installations}))});
  await blocked.locator('button[data-scope="accessible"][aria-pressed]').click();
  await blocked.getByRole('heading', {name: 'Physical checks block this plan'}).waitFor();
  await blocked.getByText('How this was worked out', {exact: true}).click();
  const blockedDownload = blocked.waitForEvent('download');
  await blocked.locator('[data-planning-result]').click();
  const blockedDecision = JSON.parse(await readFile(await (await blockedDownload).path(), 'utf8'));
  assert.equal(blockedDecision.recommended, null);
  assert.equal(blockedDecision.physical_issues.filter(issue => issue.kind === 'overflow').length, 2);
  assert.deepEqual(blockedDecision, (await call('assess', overflow)).data.decision);
  await blocked.close();

  const bench = await browser.newPage({acceptDownloads: true});
  bench.on('pageerror', e => failures.push(e.message));
  await bench.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    failures.push('Unexpected request to ' + route.request().url());
    return route.abort();
  });
  const large = benchPlanningFixture();
  await bench.goto(origin + '/web/index.html#decide');
  await bench.locator('#import-file').setInputFiles({name: 'inert-profile.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({version: 1, protocols: large.protocol.snapshots, workflows: [large.protocol.workflow], equipment: []}))});
  await bench.locator('#dc-workload').waitFor();
  assert.equal(await bench.locator('#dc-workload').inputValue(), '384');
  assert.equal(await bench.locator('#dc-objective').inputValue(), 'labour');
  await bench.getByText('How this was worked out', {exact: true}).click();
  const legacyDownload = bench.waitForEvent('download');
  await bench.locator('[data-planning-result]').click();
  const legacy = JSON.parse(await readFile(await (await legacyDownload).path(), 'utf8'));
  assert.equal(legacy.recommended.id, 'purchase-flex:connected:base');
  assert.deepEqual(legacy.recommended.metrics.tips.total, {lo: 72, hi: 72});
  assert.deepEqual(legacy.recommended.metrics.elapsed, {lo: 128, hi: 261});
  assert.equal(legacy.bench_routes, undefined);
  await bench.locator('#dc-objective').selectOption('tips-runtime');
  const device = bench.locator(`[data-bench-route="${benchDevice}"]`);
  await device.getByText(/compatibility needs confirmation/).waitFor();
  await device.getByRole('button', {name: 'Yes', exact: true}).click();
  await bench.getByText('Dispenser alone, plate carried by hand', {exact: true}).first().waitFor();
  await bench.getByText(/72 manual plate handoffs/).waitFor();
  assert.equal(await bench.locator('[data-tip-runtime] tbody tr').count(), 9);
  assert.equal(await bench.locator('[data-tip-runtime] td').filter({hasText: /Tip-free dispense/}).count(), 9);
  assert.equal(await bench.locator('[data-tip-runtime] td').filter({hasText: /Pipette with tips/}).count(), 9);
  assert.equal(await bench.locator('[data-plr-export]').count(), 0);
  await assert.rejects(call('assess', large), /400 invalid_assessment_request/);
  await bench.locator('#dc-workload').fill('192');
  await bench.locator('#dc-workload').press('Tab');
  await bench.getByText(/36 manual plate handoffs/).waitFor();
  await bench.getByText('How this was worked out', {exact: true}).click();
  const saved = bench.waitForEvent('download');
  await bench.locator('[data-planning-result]').click();
  const ui = JSON.parse(await readFile(await (await saved).path(), 'utf8'));
  const api = await call('assess', benchPlanningFixture(192));
  assert.deepEqual(ui, api.data.decision);
  assert.equal(api.data.decision.recommended.route, 'standalone');
  await bench.close();
  assert.equal(rows.length, 12);
  assert.deepEqual(failures, []);
  console.log(JSON.stringify({standalone_clean_client: clean, parity: rows, standalone_bench: {
    browser_samples: 384, additions: 9, handoffs: 72, api_samples: 192, parity: true,
  }}, null, 2));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
