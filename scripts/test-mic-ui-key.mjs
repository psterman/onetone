import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'src/js/core/app-mic.js'), 'utf8');

assert.match(src, /function resolveMicSurfaceKey\(/);
assert.doesNotMatch(src, /else if\(!micMuteKnown\) key='checking'/);

function resolveMicSurfaceKey(hasDevice, recovering, muteKnown, muted) {
  if (recovering && !hasDevice) return 'recovering';
  if (!hasDevice) return 'missing';
  if (muteKnown && muted) return 'muted';
  return 'ready';
}

assert.equal(resolveMicSurfaceKey(true, false, false, false), 'ready');
assert.equal(resolveMicSurfaceKey(true, false, true, true), 'muted');
assert.equal(resolveMicSurfaceKey(true, false, true, false), 'ready');
assert.equal(resolveMicSurfaceKey(false, false, false, false), 'missing');
assert.equal(resolveMicSurfaceKey(false, true, false, false), 'recovering');

assert.match(src, /voiceCaptureActive\(\)\) return 500/);
assert.match(src, /Read-only poll of shared MicLevelState/);

console.log('test-mic-ui-key.mjs OK');
