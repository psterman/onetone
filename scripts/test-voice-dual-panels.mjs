/**
 * QS voice wake/end dual panels: vertical stack, hover demo, free pick, mic open/close.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const js = readFileSync(join(root, 'src/js/features/home/habit-trigger-setup.js'), 'utf8');
const i18n = readFileSync(join(root, 'src/js/core/i18n.js'), 'utf8');
const css = readFileSync(join(root, 'src/css/app.css'), 'utf8');
const mockPath = join(root, 'design-mock/voice-activate-end-preview.html');

assert.ok(existsSync(mockPath), 'activate-end mock file');
const mock = readFileSync(mockPath, 'utf8');
assert.ok(mock.includes('card__bar') || mock.includes('is-wake'), 'mock wake/end cards');
assert.ok(mock.includes('card__mic') || mock.includes('mic-body'), 'mock mic demo');

assert.ok(js.includes("habit-setup-voice-lessons--parallel"), 'parallel class on QS host');
assert.ok(js.includes('function syncQsVoicePanels'), 'syncQsVoicePanels');
assert.ok(js.includes('function bindQsVoiceDemoHover'), 'hover bind');
assert.ok(js.includes('is-hot'), 'is-hot hover class');
assert.ok(js.includes('resetQsVoiceDemoCardRest'), 'rest reset helper');
assert.ok(!js.includes("item.id==='end'&&!wakeDone"), 'no end lock until wake');
assert.ok(!/lessonId==='end'&&!\(setupState\.voiceLessons&&setupState\.voiceLessons\.wake\)/.test(js), 'enter stage free pick');
assert.ok(js.includes('habit-setup-voice-demo-stage'), 'demo stage markup');
assert.ok(js.includes('habit-setup-voice-demo-mic'), 'demo mic markup');
assert.ok(js.includes('habit-setup-voice-demo-bar'), 'demo bar markup');
assert.ok(js.includes('mic-body'), 'mic svg parts');
assert.ok(!js.includes('habit-setup-voice-demo-bubble'), 'no bubble in demo');
assert.ok(!js.includes('habit-setup-voice-demo-check'), 'no check in demo');
assert.ok(js.includes('function startQsVoiceDemoTick'), 'demo tick start');
assert.ok(js.includes('function stopQsVoiceDemoTick'), 'demo tick stop');
assert.ok(js.includes('is-demo-hit'), 'demo hit class');
assert.ok(js.includes('is-listening'), 'listening class');
assert.ok(js.includes(" is-end") || js.includes("' is-end'"), 'end accent class');
assert.ok(js.includes('qsVoiceDemoPendingText'), 'pending text helper');
assert.ok(js.includes('qsVoiceDemoListeningText'), 'listening text helper');

assert.ok(i18n.includes('悬停卡片可预览'), 'zh hover guide');
assert.ok(i18n.includes('任选顺序') || i18n.includes('any order'), 'free order guide');
assert.ok(i18n.includes('qsVoicePanelGuidePartial'), 'partial guide key');
assert.ok(i18n.includes('qsVoicePanelGuide:'), 'en guide key');
assert.ok(i18n.includes("qsVoiceDemoStatusWakePending:'未激活'"), 'zh wake pending');
assert.ok(i18n.includes("qsVoiceDemoStatusEndPending:'听写中'"), 'zh end pending');
assert.ok(i18n.includes('qsVoiceDemoStatusWakeListening'), 'wake listening key');
assert.ok(i18n.includes('qsVoiceDemoStatusEndListening'), 'end listening key');
assert.ok(i18n.includes('qsVoiceDemoStatusRecognizing'), 'recognizing status key');
assert.ok(i18n.includes('qsVoiceDemoStatusWakeDone'), 'wake done status key');
assert.ok(i18n.includes('qsVoiceDemoStatusEndDone'), 'end done status key');
assert.ok(i18n.includes('麦克风打开'), 'zh wake desc mentions mic open');
assert.ok(i18n.includes('麦克风关闭'), 'zh end desc mentions mic close');

assert.ok(css.includes('.habit-setup-voice-lessons--parallel'), 'parallel css');
assert.ok(
  /\.habit-setup-voice-lessons--parallel\{[^}]*grid-template-columns:\s*minmax\(0,1fr\)/s.test(css),
  'vertical single column'
);
assert.ok(css.includes('max-width:min(420px,100%)') || css.includes('max-width:min(440px,100%)'), 'narrow stacked column');
assert.ok(css.includes('align-content:center'), 'vertically centered stack');
assert.ok(css.includes('.habit-setup-voice-lesson-card.is-hot'), 'hot card css');
assert.ok(css.includes('animation-play-state:paused'), 'bars paused until hover');
assert.ok(css.includes('is-hot .habit-setup-voice-demo-bar'), 'bars run when hot');
assert.ok(css.includes('qsVoiceDemoBarStage'), 'staged bar keyframes');
assert.ok(css.includes('qsVoiceDemoMicPress'), 'mic press keyframes');
assert.ok(css.includes('habit-setup-voice-demo-mic-inner'), 'mic inner css');
assert.ok(css.includes('is-demo-hit'), 'demo hit css');
assert.ok(!css.includes('.habit-setup-voice-demo-bubble{'), 'no bubble css rule');
assert.ok(!css.includes('.habit-setup-voice-demo-check{'), 'no check css rule');
assert.ok(!/habit-setup-test-grid,\s*\.habit-setup-voice-lessons\[hidden\]\{display:none/.test(css), 'do not hide test-grid with lessons[hidden]');

console.log('test-voice-dual-panels: ok');
