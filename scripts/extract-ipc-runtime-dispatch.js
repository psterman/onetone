const fs = require('fs');

const corePath = 'c:/Users/Administrator/Desktop/voice-pilot/src-tauri/src/ipc/core.rs';
const outPath = 'c:/Users/Administrator/Desktop/voice-pilot/src-tauri/src/ipc/runtime_dispatch.rs';
const modPath = 'c:/Users/Administrator/Desktop/voice-pilot/src-tauri/src/ipc/mod.rs';

const lines = fs.readFileSync(corePath, 'utf8').split(/\r?\n/);

const header = `use std::sync::Arc;

use tauri::Emitter;

use crate::ipc::core::{push_runtime, push_runtime_with_cue};
use crate::press_gesture::parse_physical_event;
use crate::AppState;

`;

// 1-indexed inclusive ranges moved into runtime_dispatch.rs
const ranges = [
  [109, 284],
  [459, 471],
];

function inRange(n) {
  return ranges.some(([s, e]) => n >= s && n <= e);
}

const body = [];
const coreOut = [];

for (let i = 0; i < lines.length; i++) {
  const n = i + 1;
  if (inRange(n)) body.push(lines[i]);
  else coreOut.push(lines[i]);
}

fs.writeFileSync(outPath, header + body.join('\n') + '\n', 'utf8');
fs.writeFileSync(corePath, coreOut.join('\n') + '\n', 'utf8');

let modSrc = fs.readFileSync(modPath, 'utf8');
if (!modSrc.includes('mod runtime_dispatch;')) {
  modSrc = modSrc.replace(
    'mod recording;',
    'mod recording;\nmod runtime_dispatch;'
  );
  modSrc = modSrc.replace(
    'pub use recording::*;',
    'pub use recording::*;\npub use runtime_dispatch::*;'
  );
  fs.writeFileSync(modPath, modSrc, 'utf8');
}

console.log('runtime_dispatch.rs lines', body.length + 8);
console.log('core.rs lines', coreOut.length);
