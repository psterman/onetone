/**
 * Guard: oral「继续」must not double-dispatch Detected+Final (focus fight),
 * and empty Agent Edit after right punch must be accepted for insert/Enter.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vosk = readFileSync(join(root, 'src-tauri/src/voice_vosk_runtime.rs'), 'utf8');
const chat = readFileSync(join(root, 'src-tauri/src/app_chat_workflow.rs'), 'utf8');
const insert = readFileSync(join(root, 'src-tauri/src/agent/insert_text.rs'), 'utf8');

assert.ok(vosk.includes('oral_soft_dispatch_dup'), 'oral Detected+Final dedup helper');
assert.ok(
  /if crate::voice_command_session::is_armed\(\) \{[\s\S]{0,200}oral_soft_dispatch_dup/.test(vosk),
  'process_detected oral path collapses Detected+Final'
);
assert.ok(
  chat.includes('cursor_empty_edit_after_right_click'),
  'empty Agent Edit after right punch accepted'
);
assert.ok(
  /post_cursor_low[\s\S]{0,400}cursor_empty_edit_after_right_click/.test(chat)
    || /cursor_empty_edit_after_right_click[\s\S]{0,200}post_cursor_low/.test(chat),
  'post_cursor_low uses empty-edit accept'
);
assert.ok(
  insert.includes('send_text(trimmed)') && insert.includes('chars().count() <= 32'),
  'short continue text prefers unicode send_text over Ctrl+V'
);

const beginner = readFileSync(join(root, 'src-tauri/src/cursor_beginner.rs'), 'utf8');
const session = readFileSync(join(root, 'src-tauri/src/voice_command_session.rs'), 'utf8');
assert.ok(session.includes('oral_composer_app_target'), 'oral composer target helper');
assert.ok(
  beginner.includes('oral_composer_app_target')
    && beginner.includes('focus_composer_for_send(&app, &app_target'),
  'continue/send punch oral app_target (Codex), not hard-coded Cursor only'
);

console.log('ok oral-continue-dedup');
