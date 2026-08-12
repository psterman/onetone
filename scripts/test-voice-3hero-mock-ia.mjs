/**
 * Guardrails for voice-ui-3hero design mocks after IA evaluation fix.
 * Fails if Hero① again serializes camera/SoftPad into the start causal chain,
 * or if overview still claims "UI-only" while bundling capability increments into P0.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const overview = read('design-mock/voice-ui-3hero-overview.html');
const start = read('design-mock/voice-ui-3hero-1-start.html');
const end = read('design-mock/voice-ui-3hero-2-end.html');
const send = read('design-mock/voice-ui-3hero-3-send.html');

assert.ok(start.includes('语音因果链') || start.includes('进入听写'), 'Hero① names voice causal chain');
assert.ok(start.includes('相关能力（并列通道'), 'Hero① keeps camera/SoftPad as side links');
assert.ok(!/path-step[\s\S]*④ 摄像头/.test(start), 'Hero① must not put camera in path steps');
assert.ok(!/path-step[\s\S]*⑤ SoftPad/.test(start), 'Hero① must not put SoftPad in path steps');
assert.ok(start.includes('selectedMappingId') && start.includes('activeSceneId'), 'Hero① documents bind');

assert.ok(overview.includes('旁链 · 摄像头通道'), 'overview matrix: camera is side channel');
assert.ok(overview.includes('旁链 · Soft Pad 通道'), 'overview matrix: SoftPad is side channel');
assert.ok(overview.includes('selectedMappingId') && overview.includes('activeSceneId'), 'overview nails edit vs use');
assert.ok(overview.includes('UI 重组') && overview.includes('能力增量'), 'overview splits tracks');
assert.ok(overview.includes('首页只投影') || overview.includes('只读投影'), 'overview: home is read-only projection');
assert.ok(!overview.includes('把 5 步链路拼成新 hero'), 'overview P0 must not promise 5-step chain');

assert.ok(end.includes('能力增量') && end.includes('另排期'), 'Hero② defers 2s undo');
assert.ok(send.includes('send_mode=none') && send.includes('send_mode=auto'), 'Hero③ keeps existing send_mode as P0');
assert.ok(send.includes('is-deferred') || send.includes('能力增量'), 'Hero③ marks copy/agent/smart as deferred');
assert.ok(send.includes('selectedMappingId') && send.includes('activeSceneId'), 'Hero③ documents bind');

console.log('ok voice-3hero-mock-ia');
