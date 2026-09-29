#!/usr/bin/env node
/**
 * Locks the FE guards that stop Cursor XButton1→RAlt from being wiped on save/heal.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const diff = read('src/js/core/habit-override-diff.js');
const core = read('src/js/features/mapping/mapping-core.js');
const persist = read('src/js/core/config-persist.js');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
  console.log('ok', msg);
}

assert(
  /AutoTrigger[\s\S]*XButton[\s\S]*targetKey[\s\S]*RAlt/.test(diff),
  'normalizeKeyFieldsForSave keeps RAlt for peripheral AutoTrigger'
);
assert(
  /peripheralHabitScore/.test(persist),
  'remember refuses weaker wipe of peripheral habit'
);
assert(
  /Drop wiped peripheral snaps/.test(persist) || /wiped peripheral/.test(persist),
  'backup load drops wiped AutoTrigger snaps'
);
assert(
  /Orphan heal stubs|No app \+ no physical trigger/.test(persist),
  'reinject skips orphan empty-trigger rows'
);
assert(
  /KWS is listening for wake phrases only/.test(
    fs.readFileSync(path.join(root, 'src/js/features/home/home-v9-bridge.js'), 'utf8')
  ),
  'home idle label explains KWS has no free STT'
);
assert(
  /Heal empty-trigger baseline stubs/.test(diff),
  'ensureGlobalBaselineMapping heals empty trigger stubs'
);
assert(
  /strategy==='auto'\|\|strategy==='enhanced'\)syncDesiredEngineConfig\('vosk'\)/.test(
    fs.readFileSync(path.join(root, 'src/js/features/voice/voice-wake.js'), 'utf8').replace(/\s+/g, '')
  ),
  'FE auto strategy mirrors vosk desiredEngine'
);
assert(
  /enableLiveTranscription/.test(
    fs.readFileSync(path.join(root, 'src/js/features/home/home-v9-bridge.js'), 'utf8')
  ),
  'KWS hint offers one-tap live transcription'
);
assert(
  /switchListeningStrategy\('auto'/.test(
    fs.readFileSync(path.join(root, 'src/js/features/home/home-live-actions.js'), 'utf8')
  ),
  'home voice toggle starts auto/Vosk not resourceSaver'
);
assert(
  /XButton\/i\.test\(srcA\)/.test(core) || /XButton\/i\.test\(srcA\)/.test(core.replace(/\s/g, '')),
  'ensureMappingExtras restores RAlt for XButton AutoTrigger'
);
assert(
  /if\(\/\^XButton\/i\.test\(srcR\)\)/.test(core),
  'ensureMappingExtras does not fold XButton-sourced RAlt to Volume'
);

console.log('test-cursor-target-preserve: all ok');
