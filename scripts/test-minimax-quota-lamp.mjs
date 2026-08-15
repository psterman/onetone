/**
 * Guard: MiniMax chip is a steady quota lamp — no Cursor-style lifecycle flash.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const rust = read('src-tauri/src/codex_micro_overlay.rs');
assert.ok(rust.includes('Quota lamp only'), 'snapshot forces MiniMax idle');
assert.ok(
  !/want = lights && crate::app_identity::minimax_code_process_running/.test(rust),
  'no process→Working for MiniMax'
);

const overlay = read('src/codex-micro-overlay.html');
assert.ok(
  overlay.includes("if(kind==='minimax') state='idle'"),
  'overlay forces MiniMax idle'
);
assert.ok(
  overlay.includes("==='minimax') return"),
  'MiniMax skips status flash/sparkle'
);

const css = read('src/css/codex-micro-overlay.css');
assert.ok(
  css.includes('[data-agent="minimax"]') && css.includes('animation: none'),
  'CSS kills MiniMax breathe/pulse'
);

console.log('ok minimax-quota-lamp');
