const fs = require('fs');

const corePath = 'c:/Users/Administrator/Desktop/voice-pilot/src-tauri/src/ipc/core.rs';
const recordingPath = 'c:/Users/Administrator/Desktop/voice-pilot/src-tauri/src/ipc/recording.rs';
const modPath = 'c:/Users/Administrator/Desktop/voice-pilot/src-tauri/src/ipc/mod.rs';

const lines = fs.readFileSync(corePath, 'utf8').split(/\r?\n/);

const header = `use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::Emitter;

use crate::config::{
    self, apply_peripheral_autotrigger_with_device, canonical_trigger, is_allowed_trigger,
    is_peripheral_trigger_key, is_volume_hotkey, make_combo_trigger_source,
    make_peripheral_mixed_source_with_device, now_source_time, RawEvent, TriggerSource,
    VoiceConfig,
};
use crate::ipc::core::persist_and_rebind;
use crate::press_gesture::{
    parse_physical_event, short_device_label, RecordGestureHint, RecordedGesture,
};
use crate::AppState;

`;

// 1-indexed inclusive ranges to move into recording.rs
const recordingRanges = [
  [17, 484],
  [934, 1195],
];

function keepLine(n) {
  for (const [start, end] of recordingRanges) {
    if (n >= start && n <= end) return false;
  }
  return true;
}

const recordingBody = [];
const coreBody = [];

for (let i = 0; i < lines.length; i++) {
  const n = i + 1;
  if (n >= 17 && n <= 484) recordingBody.push(lines[i]);
  else if (n >= 934 && n <= 1195) recordingBody.push(lines[i]);
  else if (keepLine(n)) coreBody.push(lines[i]);
}

fs.writeFileSync(recordingPath, header + recordingBody.join('\n') + '\n', 'utf8');
fs.writeFileSync(corePath, coreBody.join('\n') + '\n', 'utf8');

const modSrc = fs.readFileSync(modPath, 'utf8');
if (!modSrc.includes('mod recording;')) {
  fs.writeFileSync(
    modPath,
    modSrc.replace(
      'mod commands;\nmod core;',
      'mod commands;\nmod core;\nmod recording;'
    ).replace(
      'pub use commands::*;\n',
      'pub use commands::*;\npub use recording::*;\n'
    ),
    'utf8'
  );
}

console.log('recording.rs lines', recordingBody.length + 16);
console.log('core.rs lines', coreBody.length);
