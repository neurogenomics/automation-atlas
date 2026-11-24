// Explicit offline advisory command. Payloads supply data only.
import {parseReview, canonical, reject} from '../lib/reviewed/json.js';
import {MAX_BYTES} from '../offline/process-advisory/contract.js';
import {assessProcess} from '../offline/process-advisory/evaluator.js';

try {
  if (process.argv.length !== 2) reject('arguments_refused');
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    if ((bytes += chunk.length) > MAX_BYTES) reject('json_limit');
    chunks.push(chunk);
  }
  let text;
  try { text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(Buffer.concat(chunks)); }
  catch { reject('json_invalid'); }
  process.stdout.write(canonical(await assessProcess(parseReview(text))) + '\n');
} catch (error) {
  process.stdout.write(JSON.stringify({schema: 'lab-automation-planner/process-advisory-error/1',
    error: {code: error.code || 'assessment_failed', path: error.path || ''}}) + '\n');
  process.exitCode = 2;
}
