/**
 * WorkBuddy chat turn markup — role/body split + first-person「我」.
 * Run: node scripts/test-wb-chat-turns.mjs
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(p, 'utf8');

const winJs = read('src/js/features/now/workbuddy-local-chat-window.js');
const winCss = read('src/css/workbuddy-local-chat.css');
const ha2 = read('src/js/features/now/home-agent-v2.js');
const ha2Css = read('src/css/home-agent-v2.css');

assert.match(winJs, /wb-turn-body/);
assert.match(winJs, /wb-avatar-me/);
assert.match(winJs, /wb-avatar-me[\s\S]*?>我</);
assert.doesNotMatch(winJs, /wb-avatar-me[^>]*>我<\/span><span>我<\/span>/);
assert.doesNotMatch(winJs, /: '你'/);
assert.match(winJs, /icons\/app-target\/workbuddy\.png/);

assert.match(winCss, /\.wb-turn--user/);
assert.match(winCss, /\.wb-turn--assistant/);
assert.match(winCss, /\.wb-turn-body/);
assert.match(winCss, /align-self:\s*flex-end/);
assert.match(winCss, /align-self:\s*flex-start/);

assert.match(ha2, /function wbTurnRoleHtml/);
assert.match(ha2, /function wbAssistantLabel/);
assert.match(ha2, /ha2WbRoleSoftPadFallback|Soft Pad→WorkBuddy/);
assert.match(ha2, /ha2WbRoleUser',\s*'我'/);
assert.match(ha2, /WB_CHAT_ICON|icons\/app-target\/workbuddy\.png/);
assert.match(ha2, /ha2-wb-avatar-me/);
assert.match(ha2, /function wbTurnRoleHtml[\s\S]*?modelRouteDisplay\(/);
assert.doesNotMatch(
  ha2,
  /ha2-wb-avatar-me"[^>]*>[\s\S]*?<\/span><span>[\s\S]*?ha2WbRoleUser/
);
assert.match(ha2, /providerId: turn\.providerId/);
assert.doesNotMatch(ha2, /providers\.push\(\{\s*id:\s*'minimax_cn'/);

assert.match(ha2Css, /\.ha2-wb-page-turn--user/);
assert.match(ha2Css, /\.ha2-wb-page-turn--assistant/);
assert.match(ha2Css, /\.ha2-wb-turn--user/);
assert.match(ha2Css, /\.ha2-wb-avatar-me/);

// Collapsed tool chips use <details>; flex on details leaves closed body in layout
// (grey strips + per-chip scrollbars). Guard the block display + closed-body hide.
assert.match(
  ha2Css,
  /\.ha2-wb-page-turn--tool\{[\s\S]*?display:\s*block;/
);
assert.match(
  ha2Css,
  /details\.ha2-wb-page-turn--tool:not\(\[open\]\)\s*>\s*\.ha2-tool-step-detail\{[\s\S]*?display:\s*none;/
);
assert.match(
  ha2Css,
  /\.ha2-tool-step-detail\{[\s\S]*?max-height:\s*none;[\s\S]*?overflow:\s*visible;/
);

console.log('test-wb-chat-turns: ok');
