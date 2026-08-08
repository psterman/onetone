/**
 * Boot settle+10s deferred voice remount must not thrash idle resourceSaver
 * (empty KWS → desired=none) — that path restarted mic + home live and 假死'd ~5s.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const session = readFileSync(join(root, 'src/js/core/app-session.js'), 'utf8');
const mic = readFileSync(join(root, 'src/js/core/app-mic.js'), 'utf8');

assert.match(session, /function resourceSaverStaysIdle/);
assert.match(session, /strategyEarly==='off'\|\|\(strategyEarly==='resourceSaver'&&resourceSaverStaysIdle/);
assert.match(session, /Already correct — do not remount home live/);
assert.doesNotMatch(
  session.match(/if\(runtimeAlreadyMatchesStrategy\(snapshot,strategy\)\)\{[\s\S]*?return null;/)?.[0] || '',
  /renderHomeLiveZone/
);

assert.match(mic, /Already on this device — stop\/start on every home paint used to 假死/);
assert.match(mic, /!opts\.force&&micMonitorDeviceId&&micMonitorDeviceId===want/);

console.log('ok boot-voice-defer-freeze');
