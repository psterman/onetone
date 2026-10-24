/**
 * Guard: habit list locate IA prototype — search + sections + right-panel channel edit.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'prototypes/onetone-habit-list-sections.html'), 'utf8');

assert.match(html, /onetone-habit-list-sections\.html/);
assert.match(html, /data-proto="habit-list-sections"/);
assert.match(html, /id="hclSearch"/);
assert.match(html, /data-ch="voice"/);
assert.match(html, /data-ch="key"/);
assert.match(html, /data-ch="pad"/);
assert.match(html, /data-ch="cam"/);
assert.match(html, /ico-voice/);
assert.match(html, /ico-key/);
assert.match(html, /ico-pad/);
assert.match(html, /ico-cam/);
assert.match(html, /ico-all/);
assert.match(html, /分区手风琴|默认只开一项|本页改完即生效/);
assert.match(html, /<details class="sec"[^>]* data-sec="chat"[^>]* open/);
assert.match(html, /class="edit-card"/);
assert.match(html, /class="lab">语音</);
assert.match(html, /class="lab">按键</);
assert.match(html, /class="lab">Soft Pad</);
assert.match(html, /class="lab">手势</);
assert.match(html, /点此录键/);
assert.match(html, /说法，逗号分隔/);
assert.match(html, /改完自动写入本习惯/);
assert.match(html, /M8 6h13/, 'all = list');
assert.match(html, /M12 1a3 3 0 0 0-3 3v8/, 'voice = mic');
assert.match(html, /rect x="4" y="3" width="16" height="18"/, 'pad = soft keyboard');
assert.match(html, /M23 7l-7 5 7 5V7z/, 'cam = camcorder');

const chips = html.match(/aria-label="按通道筛选"[\s\S]*?<\/div>/);
assert.ok(chips, 'channel filter chips');
assert.doesNotMatch(chips[0], />口</);
assert.doesNotMatch(chips[0], />键</);
assert.doesNotMatch(chips[0], />手势</);
assert.doesNotMatch(chips[0], />口头</);

for (const sec of ['talk', 'chat', 'mode', 'find', 'extra']) {
  assert.match(html, new RegExp('data-sec="' + sec + '"'), 'section ' + sec);
}

assert.match(html, /输入法/);
assert.match(html, /对话/);
assert.match(html, /模式/);
assert.match(html, /查找/);
assert.match(html, /data-cmd="continueReply"/);
assert.match(html, /data-cmd="cancelGen"/);
assert.match(html, /id="detailTitle"/);
assert.doesNotMatch(html, /data-view="before"/);
assert.doesNotMatch(html, /data-view="after"/);
assert.doesNotMatch(html, /在 Cursor 操作/);
assert.doesNotMatch(html, /data-sec="slash"/);

console.log('test-habit-list-sections-proto: ok');
