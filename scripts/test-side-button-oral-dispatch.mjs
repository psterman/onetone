import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync('src-tauri/src/hotkey_win.rs', 'utf8');
const pad = fs.readFileSync('src-tauri/src/codex_numpad_layer.rs', 'utf8');
const finish = fs.readFileSync('src-tauri/src/ipc/recording/hardware/finish.rs', 'utf8');
const dom = fs.readFileSync('src/js/core/app-keyboard.js', 'utf8');
const recordingInput = fs.readFileSync('src/js/features/mapping/mapping-recording-input.js', 'utf8');

assert.match(
  src,
  /active_sender\(\)[\s\S]{0,450}format!\("keyup:\{name\}"\)/,
  'side-button LL path must forward keyup to the runtime'
);
assert.match(
  src,
  /try_dispatch_named_pad\(name, is_x_up\)/,
  'side-button path must preserve Soft Pad down/up dispatch'
);
assert.match(
  pad,
  /pushToTalk[\s\S]{0,260}already-active micro session/,
  'pushToTalk named route must be able to start the first Soft Pad session'
);
assert.match(
  finish,
  /struct RecordingExitGuard[\s\S]{0,900}abort_recording_session\(\)/,
  'every rejected capture must release the native recording owner'
);
assert.match(
  dom,
  /type!==['"]mousedown['"]&&type!==['"]pointerdown['"]/, 
  'DOM side-button fallback must ignore pointerup/auxclick duplicates'
);
assert.doesNotMatch(
  recordingInput,
  /if\(Rec\(\)\.isHardwareCaptureToken\(btn\)\)[\s\S]{0,900}finishDetectedHardwareTrigger\(btn\)/,
  'peripheral trigger fallback must wait for native capture acknowledgement'
);

console.log('test-side-button-oral-dispatch: ok');
