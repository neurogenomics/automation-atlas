// Clean client for the loopback preview. Uses preview sign-in and a cookie
// held in this Node process. It never loads a page, profile or localStorage.
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {planningFixture} from './planning-fixtures.mjs';

export async function connectPlanningPreview(base) {
  const {origin, protocol, hostname, username, password} = new URL(base);
  if (origin !== base || protocol !== 'http:' || hostname !== 'localhost' || username || password)
    throw Error('Use the local preview origin, for example http://localhost:8000.');
  const signIn = await fetch(origin + '/signin-with-chatgpt?as=planning-example', {redirect: 'manual'});
  assert.equal(signIn.status, 303);
  const cookie = signIn.headers.getSetCookie().find(c => c.startsWith('dev_user='))?.split(';')[0];
  assert.ok(cookie, 'The loopback preview did not establish the session.');
  const identity = await fetch(origin + '/api/me', {headers: {Cookie: cookie}}).then(r => r.json());
  assert.equal(identity.user?.name, 'planning-example');
  return async (route, body) => {
    const started = performance.now();
    const response = await fetch(origin + '/api/planning/v1/' + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {Origin: origin, Cookie: cookie, 'Content-Type': 'application/json'},
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    if (!response.ok) throw Error(`${route}: ${response.status} ${data.error?.code ?? ''}`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return {data, ms: Number((performance.now() - started).toFixed(1))};
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const call = await connectPlanningPreview(process.argv[2] || 'http://localhost:8000');
  const input = planningFixture('individual', 'design', true);
  const contract = await call('contract');
  const validation = await call('validate', input);
  const assessed = await call('assess', input);
  const configurations = assessed.data.decision.configurations.slice(0, 2).map(c => c.id);
  assert.equal(configurations.length, 2);
  const comparison = await call('compare', {input, configurations});
  assert.deepEqual([comparison.data.comparison.left.id, comparison.data.comparison.right.id], configurations);
  const questions = await call('questions', input);
  assert.ok(questions.data.questions.length > 0);
  assert.deepEqual(questions.data.questions, assessed.data.decision.questions);
  const exported = await call('export', input);
  const directory = await mkdtemp(join(tmpdir(), 'planner-example-'));
  try {
    const path = join(directory, 'workspace.json');
    await writeFile(path, JSON.stringify(exported.data), {mode: 0o600});
    const restored = await call('import', JSON.parse(await readFile(path, 'utf8')));
    assert.equal(restored.data.reproducible_here, true);
    assert.deepEqual((await call('assess', restored.data.workspace)).data, assessed.data);
    console.log(JSON.stringify({evaluator: contract.data.evaluator, operation_count: validation.data.operation_count,
      compared: configurations, questions: questions.data.questions.length, file_roundtrip: true,
      latency_ms: {validate: validation.ms, assess: assessed.ms, compare: comparison.ms, questions: questions.ms}}, null, 2));
  } finally { await rm(directory, {recursive: true, force: true}); }
}
