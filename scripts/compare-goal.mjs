// Fixed offline stdin/stdout; request contents cannot select resources.
import {parseReview, canonical, MAX_BYTES, reject} from '../lib/reviewed/json.js';
import {compareGoal} from '../offline/goal-comparison/evaluator.js';

try {
  if (process.argv.length !== 2) reject('arguments_refused');
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > MAX_BYTES) reject('json_limit');
    chunks.push(chunk);
  }
  let text;
  try { text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(Buffer.concat(chunks)); }
  catch { reject('json_invalid'); }
  process.stdout.write(canonical(await compareGoal(parseReview(text))) + '\n');
} catch (e) {
  process.stdout.write(JSON.stringify({schema: 'lab-automation-planner/goal-comparison-error/1',
    error: {code: e.code || 'comparison_failed', path: e.path || '', message: 'Goal comparison input rejected; no result admitted.'}}) + '\n');
  process.exitCode = 2;
}
