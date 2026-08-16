/**
 * QS voice wake/end dual panels: mutual dim + order lock.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const js = readFileSync(join(root, 'src/js/features/home/habit-trigger-setup.js'), 'utf8');
const i18n = readFileSync(join(root, 'src/js/core/i18n.js'), 'utf8');
const css = readFileSync(join(root, 'src/css/app.css'), 'utf8');
const mockPath = join(root, 'design-mock/voice-wake-end-panels-preview.html');

assert.ok(existsSync(mockPath), 'mock file');
const mock = readFileSync(mockPath, 'utf8');
assert.ok(mock.includes('data-id="wake"'), 'mock wake panel');
assert.ok(mock.includes('data-id="end"'), 'mock end panel');
assert.ok(mock.includes('is-dim'), 'mock dim');

assert.ok(js.includes("habit-setup-voice-lessons--parallel"), 'parallel class on QS host');
assert.ok(js.includes("is-dim"), 'dim class');
assert.ok(js.includes("is-locked"), 'locked class');
assert.ok(js.includes('function syncQsVoicePanels'), 'syncQsVoicePanels');
assert.ok(js.includes('qsVoiceEndLockedHint'), 'order lock toast');
assert.ok(js.includes("item.id==='end'&&!wakeDone"), 'end locked until wake done');

assert.ok(i18n.includes("qsVoicePanelGuide:'点左侧开始练激活"), 'zh guide');
assert.ok(i18n.includes("qsVoiceEndLockedHint:'请先完成左侧"), 'zh lock hint');
assert.ok(i18n.includes('qsVoicePanelGuide:'), 'en guide key');

assert.ok(css.includes('.habit-setup-voice-lessons--parallel'), 'parallel css');
assert.ok(css.includes('.habit-setup-voice-lesson-card.is-dim'), 'dim css');
assert.ok(css.includes('animation-play-state:paused'), 'pause animation when dim');
assert.ok(css.includes('.is-locked'), 'locked css');

console.log('test-voice-dual-panels: ok');
