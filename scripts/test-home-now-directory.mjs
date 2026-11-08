/**
 * Assert left-nav 对话/工作 parallel tabs under 首页.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'src/js/features/home/home-now-directory.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/css/home-workbench.css'), 'utf8');

assert.ok(html.includes('id="wbNavHome"') && html.includes('data-wb-nav="home"'), '首页 remains');
assert.ok(html.includes('id="wbNavHomeV2"') && html.includes('data-wb-nav="homeV2"'), '新首页 remains');
assert.ok(html.includes('wb-nav-acc__tabs') && html.includes('role="tablist"'), 'parallel tablist');
assert.ok(html.includes('data-wb-now-tab="chat"') && html.includes('data-wb-now-tab="work"'), 'two tabs');
assert.ok(html.includes('data-wb-acc-panel="chat"') && html.includes('data-wb-acc-panel="work"'), 'two panels');
assert.ok(html.includes('id="wbNavNewWork"') || js.includes('wbNavNewWork'), '+ 新工作');
assert.ok(js.includes('wbNavNewChat') && js.includes('onNewChat'), '+ 新对话');
assert.ok(js.includes('loadChatTaskTurns'), 'switch chat loads journal turns');

const homeAt = html.indexOf('id="wbNavHome"');
const accAt = html.indexOf('id="wbNowDirectory"');
const homeV2At = html.indexOf('id="wbNavHomeV2"');
assert.ok(homeAt > 0 && accAt > homeAt && homeV2At > accAt, 'tabs between 首页 and 新首页');

assert.ok(js.includes('setActiveLane'), 'tab switch helper');
assert.ok(js.includes('ArrowLeft') && js.includes('ArrowRight'), 'keyboard tab switch');
assert.ok(js.includes('syncTabChrome'), 'tab chrome sync');
assert.ok(js.includes('isWorkJournalTask'), 'work/chat journal split helper');
assert.ok(js.includes("lane: 'work'"), '新工作 creates work-lane journal task');
assert.ok(js.includes('openExclusiveChat') && js.includes('openWbChatPage'), 'chat row can open exclusive page');
assert.ok(js.includes('closeExclusiveChat'), 'home closes exclusive page');
assert.ok(
  /function goHome\([\s\S]*?closeExclusiveChat\(/.test(js),
  'goHome closes exclusive so 首页 is not blank'
);
const setLaneFn = js.slice(js.indexOf('function setActiveLane'), js.indexOf('function openChatTask'));
assert.ok(setLaneFn.includes('closeExclusiveChat'), 'tabs flip intent only — close exclusive');
assert.ok(!setLaneFn.includes('openExclusiveChat'), 'tabs do not open empty exclusive');
assert.ok(/function openChatTask\([\s\S]*?openExclusiveChat\(/.test(js), 'chat row opens exclusive');
assert.ok(!/setOpenLane|accordion toggle/.test(js), 'no accordion toggle path');

const ha2 = fs.readFileSync(path.join(root, 'src/js/features/now/home-agent-v2.js'), 'utf8');
assert.ok(/function wbTranscriptHtml[\s\S]*?return '';/.test(ha2), 'home dock hides inline transcript');
assert.ok(ha2.includes('openWbChatPage: openWbChatPage'), 'exports openWbChatPage');
assert.ok(
  /function embedCompose\([\s\S]*?is-wb-chat-page/.test(ha2),
  'embedCompose clears orphaned exclusive cover after Focus remount'
);

const nowHome = fs.readFileSync(path.join(root, 'src/js/features/now/now-home.js'), 'utf8');
const setIntentAt = nowHome.indexOf("kind === 'set_intent'");
const setIntentFn = nowHome.slice(setIntentAt, nowHome.indexOf("kind === 'open_soft_pad'", setIntentAt));
assert.ok(setIntentFn.includes('closeWbChatPage'), '提问/投递 closes exclusive');
assert.ok(!/\.openWbChatPage\b/.test(setIntentFn), '提问/投递 does not open empty exclusive');

const wb = fs.readFileSync(path.join(root, 'src/js/features/home/home-workbench.js'), 'utf8');
assert.ok(
  /function syncNowHomeSurface\([\s\S]*?closeWbChatPage/.test(wb),
  'left-nav 首页 closes exclusive chat'
);

assert.ok(css.includes('.wb-nav-acc__tabs'), 'tabs css');
assert.ok(css.includes('grid-template-columns: 1fr 1fr'), 'parallel tabs');
assert.ok(css.includes('.wb-nav-acc__panel.is-on'), 'panel fade');

console.log('test-home-now-directory: ok');
