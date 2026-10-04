/**
 * Minimal check for Claude smoke feedback MVP wiring (no live Claude spawn).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const indexHtml = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
assert.match(indexHtml, /id="claudeSmokeTestBtn"/);
assert.match(indexHtml, /id="claudeSmokePrompt"/);
assert.match(indexHtml, /向 Claude 提问/);
assert.match(indexHtml, /claude-smoke-feedback\.js/);

const js = fs.readFileSync(
  path.join(root, 'src/js/features/home/claude-smoke-feedback.js'),
  'utf8'
);
assert.match(js, /127\.0\.0\.1:8796/);
assert.match(js, /\/api\/agents\/claude\/health/);
assert.match(js, /\/api\/tasks\/claude-smoke-test/);
assert.match(js, /POLL_MS\s*=\s*500/);
assert.match(js, /未找到 Claude CLI/);
assert.doesNotMatch(js, /测试成功/);

const rs = fs.readFileSync(path.join(root, 'src-tauri/src/claude_smoke_task.rs'), 'utf8');
assert.match(rs, /claude -p --permission-mode plan/);
assert.match(rs, /HEALTH_PATH:\s*&str\s*=\s*"\/api\/agents\/claude\/health"/);
assert.match(rs, /CREATE_PATH:\s*&str\s*=\s*"\/api\/tasks\/claude-smoke-test"/);
assert.match(rs, /--permission-mode\",\s*\"plan\"/);

const server = fs.readFileSync(
  path.join(root, 'src-tauri/src/codex_micro_protocol_server.rs'),
  'utf8'
);
assert.match(server, /handle_claude_health_get/);
assert.match(server, /handle_claude_smoke_create_post/);
assert.match(server, /handle_smoke_task_get/);

console.log('claude-smoke-feedback wiring ok');
