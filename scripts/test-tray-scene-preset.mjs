// tray-scene-preset logic smoke test (no DOM)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
let fail = 0;
function check(label, ok) {
  if (ok) { pass++; console.log('  ✓', label); }
  else { fail++; console.error('  ✗', label); }
}

const js = readFileSync(join(root, 'src/js/features/settings/tray-scene-preset.js'), 'utf8');
check('exports setScenePreset', js.includes('setScenePreset'));
check('exports renderSceneBlock', js.includes('renderSceneBlock'));
check('allOn mute presets', js.includes("'allOn'") && js.includes("'mute'"));
check('custom snapshot', js.includes('customSwitchSnapshot'));
check('runtime ipc', js.includes('cmd_tray_runtime_get'));
check('persist apply on open', js.includes('applyPersistedSceneOnOpen'));

const shape = readFileSync(join(root, 'scripts/channel-config-state-shape.mjs'), 'utf8');
check('trayScenePreset key', shape.includes('trayRuntime.trayScenePreset'));
check('noFaceMute key', shape.includes('autoMute.noFaceMute'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
