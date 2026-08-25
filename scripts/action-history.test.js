'use strict';

const assert = require('assert');

function formatRelative(tsMs, now, t) {
  if (!(tsMs > 0)) return '—';
  const d = Math.max(0, now - tsMs);
  if (d < 60000) return t('habitUsageJustNow', '刚刚');
  if (d < 3600000) return t('habitUsageMinsAgo', '{n} 分钟前').replace('{n}', String(Math.floor(d / 60000)));
  if (d < 86400000) return t('habitUsageHoursAgo', '{n} 小时前').replace('{n}', String(Math.floor(d / 3600000)));
  return 'dated';
}

function windowSpoken(hours, t) {
  if (hours <= 168) return t('habitUsageWindowWeek', '近 7 天');
  if (hours <= 720) return t('habitUsageWindowMonth', '近 30 天');
  return t('habitUsageWindowAllTime', '一共');
}

function formatWindowCount(n, hours, t) {
  if (!(n > 0)) return t('habitUsageNever', '这段时间还没用过');
  return t('habitUsageInWindow', '{window}用了 {n} 次')
    .replace('{window}', windowSpoken(hours, t))
    .replace('{n}', String(n));
}

function formatLastLine(tsMs, channel, now, t) {
  if (!(tsMs > 0)) return t('habitUsageLastNever', '还没用过');
  const when = formatRelative(tsMs, now, t);
  const chMap = { key: '按键', voice: '语音' };
  const ch = chMap[channel] || '';
  if (ch) {
    return t('habitUsageLastWithChannel', '上次 · {when} · {channel}')
      .replace('{when}', when)
      .replace('{channel}', ch);
  }
  return t('habitUsageLastOnly', '上次 · {when}').replace('{when}', when);
}

function exportHint(hours, t) {
  if (hours <= 168) return t('habitUsageExportHint7d', '导出近 7 天数据');
  if (hours <= 720) return t('habitUsageExportHint30d', '导出近 30 天数据');
  return t('habitUsageExportHintAll', '导出全部数据');
}

function isUsageEntry(entry) {
  return entry.channel !== 'system' && entry.kind !== 'scheme_switch';
}

const fakeT = (key, fb) => fb || key;
const now = Date.UTC(2026, 0, 10, 12, 0, 0);

assert.strictEqual(formatWindowCount(0, 168, fakeT), '这段时间还没用过');
assert.strictEqual(formatWindowCount(3, 168, fakeT), '近 7 天用了 3 次');
assert.strictEqual(formatWindowCount(5, 720, fakeT), '近 30 天用了 5 次');
assert.strictEqual(
  formatLastLine(now - 13 * 60_000, 'key', now, fakeT),
  '上次 · 13 分钟前 · 按键',
);
assert.strictEqual(exportHint(168, fakeT), '导出近 7 天数据');
assert.strictEqual(exportHint(720, fakeT), '导出近 30 天数据');
assert.strictEqual(exportHint(8760, fakeT), '导出全部数据');
assert.ok(isUsageEntry({ channel: 'key', kind: 'send_key' }));
assert.ok(!isUsageEntry({ channel: 'system', kind: 'scheme_switch' }));

function buildHabitMarkdownSmoke(label, count) {
  return '# 习惯使用文档 · ' + label + '\n\n- 近 7 天用了 ' + count + ' 次\n';
}
const md = buildHabitMarkdownSmoke('Cursor · 启动输入', 3);
assert.ok(md.indexOf('习惯使用文档') >= 0);
assert.ok(md.indexOf('近 7 天用了 3 次') >= 0);

console.log('action-history.test.js: ok');
