// Offline fixed entrypoint: no payload-selected files, network, subprocess or hardware.
import {parseReview, canonical, MAX_BYTES} from '../lib/reviewed/json.js';
import {assess} from '../lib/reviewed/assessment.js';
try {
  if (process.argv.length !== 2) throw Object.assign(Error(), {code: 'arguments_refused'});
  const chunks = []; let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > MAX_BYTES) throw Object.assign(Error(), {code: 'json_limit'});
    chunks.push(chunk);
  }
  let text;
  try { text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(Buffer.concat(chunks)); }
  catch { throw Object.assign(Error(), {code: 'json_invalid'}); }
  process.stdout.write(canonical(await assess(parseReview(text))) + '\n');
} catch (e) {
  process.stdout.write(JSON.stringify({schema: 'lab-automation-planner/reviewed-assessment-error/1',
    error: {code: e.code || 'assessment_failed', path: e.path || '', message: 'Assessment input rejected; no result admitted.'}}) + '\n');
  process.exitCode = 2;
}
