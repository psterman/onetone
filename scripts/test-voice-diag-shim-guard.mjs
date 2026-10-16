'use strict';

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

var root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
var shim = fs.readFileSync(path.join(root, 'src/js/core/app-legacy-shims.js'), 'utf8');
var index = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');

assert.ok(index.includes('data-ot-defer="debug"') && index.includes('voice-diag.js'), 'voice-diag stays deferred');
assert.ok(shim.includes('function voiceDiag()'), 'shim has voiceDiag helper');
assert.ok(shim.includes('global.OneToneVoiceDiag'), 'shim uses global.OneToneVoiceDiag');
assert.ok(
  !/function updateVoiceDiagMetric\([^)]*\)\{\s*return OneToneVoiceDiag\./.test(shim),
  'updateVoiceDiagMetric must not bare-call OneToneVoiceDiag'
);
assert.ok(
  /function updateVoiceDiagMetric\([^)]*\)\{\s*var d=voiceDiag\(\)/.test(shim),
  'updateVoiceDiagMetric guards via voiceDiag()'
);
assert.ok(
  /function forceVoiceDiagLog\([^)]*\)\{\s*var d=voiceDiag\(\)/.test(shim),
  'forceVoiceDiagLog guards via voiceDiag()'
);
assert.ok(
  /function scheduleDebugChromeRefresh\(\)\{\s*var d=voiceDiag\(\)/.test(shim),
  'scheduleDebugChromeRefresh guards via voiceDiag()'
);

var wake = fs.readFileSync(path.join(root, 'src/js/features/voice/voice-wake.js'), 'utf8');
var end = fs.readFileSync(path.join(root, 'src/js/features/voice/voice-end.js'), 'utf8');
var renderLoop = fs.readFileSync(path.join(root, 'src/js/core/render-loop.js'), 'utf8');
assert.ok(
  wake.includes("if(global.OneToneVoiceDiag&&(!liveOnly||ui().settingsPanel==='debug'))"),
  'sapi status sync guards VoiceDiag'
);
assert.ok(
  /if\(global\.OneToneVoiceDiag&&\(!liveOnly\|\|ui\(\)\.settingsPanel==='debug'\|\|!ui\(\)\.drawerOpen\)\)/.test(wake),
  'vosk status sync guards VoiceDiag'
);
assert.ok(
  end.includes('if(global.OneToneVoiceDiag&&global.OneToneVoiceDiag.updateMetric)'),
  'voice-end status sync guards VoiceDiag'
);
assert.ok(
  renderLoop.includes("global.OneToneVoiceDiag&&global.OneToneVoiceDiag.getFocusMode&&global.OneToneVoiceDiag.getFocusMode()==='developer'"),
  'render-loop guards VoiceDiag before getFocusMode'
);

console.log('voice-diag-shim-guard tests passed');
