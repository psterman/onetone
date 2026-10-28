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
assert.doesNotMatch(winJs, /: '你'/);
assert.match(winJs, /icons\/app-target\/workbuddy\.png/);

assert.match(winCss, /\.wb-turn--user/);
assert.match(winCss, /\.wb-turn--assistant/);
assert.match(winCss, /\.wb-turn-body/);
assert.match(winCss, /align-self:\s*flex-end/);
assert.match(winCss, /align-self:\s*flex-start/);

assert.match(ha2, /function wbTurnRoleHtml/);
assert.match(ha2, /ha2WbRoleUser',\s*'我'/);
assert.match(ha2, /WB_CHAT_ICON|icons\/app-target\/workbuddy\.png/);
assert.match(ha2, /ha2-wb-avatar-me/);

assert.match(ha2Css, /\.ha2-wb-page-turn--user/);
assert.match(ha2Css, /\.ha2-wb-page-turn--assistant/);
assert.match(ha2Css, /\.ha2-wb-turn--user/);
assert.match(ha2Css, /\.ha2-wb-avatar-me/);

console.log('test-wb-chat-turns: ok');
