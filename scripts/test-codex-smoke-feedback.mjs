/**
 * Minimal check for Codex smoke feedback MVP wiring (no live Codex spawn).
 * Fails if paths / UI hooks drift.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const indexHtml = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
assert.match(indexHtml, /id="codexSmokeTestBtn"/);
assert.match(indexHtml, /id="codexSmokePrompt"/);
assert.match(indexHtml, /发送并回流到卡片/);
assert.match(indexHtml, /codex-smoke-feedback\.js/);
assert.match(indexHtml, /codex-smoke-feedback\.css/);

const js = fs.readFileSync(
  path.join(root, 'src/js/features/home/codex-smoke-feedback.js'),
  'utf8'
);
assert.match(js, /127\.0\.0\.1:8796/);
assert.match(js, /\/api\/agents\/codex\/health/);
assert.match(js, /\/api\/tasks\/codex-smoke-test/);
assert.match(js, /POLL_MS\s*=\s*500/);
assert.match(js, /prompt:\s*prompt/);
assert.match(js, /未找到 Codex CLI，请先安装或配置 PATH/);
assert.doesNotMatch(js, /测试成功/);

const rs = fs.readFileSync(path.join(root, 'src-tauri/src/codex_smoke_task.rs'), 'utf8');
assert.match(rs, /codex exec --sandbox read-only/);
assert.match(rs, /-o/);
assert.doesNotMatch(rs, /--ask-for-approval/);
assert.match(rs, /请只读取当前项目，返回一句项目状态摘要/);
assert.match(rs, /HEALTH_PATH:\s*&str\s*=\s*"\/api\/agents\/codex\/health"/);
assert.match(rs, /CREATE_PATH:\s*&str\s*=\s*"\/api\/tasks\/codex-smoke-test"/);

const server = fs.readFileSync(
  path.join(root, 'src-tauri/src/codex_micro_protocol_server.rs'),
  'utf8'
);
assert.match(server, /handle_codex_health_get/);
assert.match(server, /handle_codex_smoke_create_post/);
assert.match(server, /handle_codex_smoke_task_get/);

console.log('codex-smoke-feedback wiring ok');
