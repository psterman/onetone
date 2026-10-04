/**
 * Acceptance for home-now-behavior v1 baseline + shell isolation.
 * Run: node --test prototypes/home-now-behavior/prototype.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

function load() {
  const ctx = { window: {}, globalThis: null };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(dir, 'shared.js'), 'utf8'), ctx);
  return ctx.OneToneNowProto;
}

test('four modes render with three-item nav only', () => {
  const R = load();
  for (const mode of R.modes) {
    const html = R.renderHome(mode);
    assert.ok(html.includes('现在'));
    assert.ok(html.includes('我的习惯'));
    assert.ok(html.includes('设置'));
    assert.ok(!html.includes('data-nav="history"'));
    assert.ok(!html.includes('项目记忆'));
    assert.ok(!html.includes('68%'));
    assert.ok(!html.includes('Agent Session'));
  }
});

test('quiet has no CTA and concrete assistance + presence', () => {
  const R = load();
  const html = R.renderHome('quiet');
  assert.ok(!html.includes('hn-cta'));
  assert.ok(html.includes('hn-presence'));
  assert.ok(html.includes('已识别 Cursor 和 voice-pilot'));
  assert.ok(html.includes('需要你时再提醒'));
  assert.ok(!html.includes('需要时直接说一句话即可'));
  assert.ok(!html.includes('hn-recall-chip'));
});

test('attention keeps one CTA, source line, and update time', () => {
  const R = load();
  const html = R.renderHome('attention');
  assert.equal((html.match(/class="hn-cta"/g) || []).length, 1);
  assert.ok(html.includes('查看并决定'));
  assert.ok(html.includes('1 分钟前'));
  assert.ok(html.includes('hn-whisper'));
});

test('quiet progress stays null; return shows whisper progress', () => {
  const R = load();
  assert.equal(R.snapshotFor('quiet').progress, null);
  const ret = R.renderHome('return');
  assert.ok(ret.includes('hn-whisper'));
  assert.ok(ret.includes('今天 14:32'));
});

test('evidence recall links live only inside details, not as default chips', () => {
  const R = load();
  const html = R.renderHome('quiet');
  assert.ok(html.includes('查看判断依据'));
  assert.ok(html.includes('data-recall="history"'));
  assert.ok(html.includes('data-recall="memory"'));
  assert.ok(!html.includes('hn-recall-chip'));
  const idxDetails = html.indexOf('<details');
  const idxHistory = html.indexOf('data-recall="history"');
  assert.ok(idxDetails >= 0 && idxHistory > idxDetails);
});

test('degraded explains and restores', () => {
  const R = load();
  const html = R.renderHome('degraded');
  assert.ok(html.includes('无法确认'));
  assert.ok(html.includes('确认当前项目'));
  assert.ok(!html.includes('暂无内容'));
});

test('shell isolates canvas-only as 640x680 with overflow hidden', () => {
  const css = fs.readFileSync(path.join(dir, 'styles.css'), 'utf8');
  assert.ok(css.includes('body.canvas-only'));
  assert.ok(/body\.canvas-only[\s\S]*?overflow:\s*hidden/.test(css));
  assert.ok(/body\.canvas-only[\s\S]*?width:\s*640px/.test(css));
  assert.ok(/body\.canvas-only[\s\S]*?height:\s*680px/.test(css));
  assert.ok(css.includes('body.canvas-only .chrome'));
  assert.ok(css.includes('display: none !important'));
  assert.ok(css.includes('body.canvas-only .frame-label'));
});

test('review mode uses grid not fixed overlay chrome', () => {
  const css = fs.readFileSync(path.join(dir, 'styles.css'), 'utf8');
  assert.ok(css.includes('body.review'));
  assert.ok(css.includes('grid-template-columns'));
  assert.ok(css.includes('overflow-x: hidden'));
  // Chrome in review must be static, not fixed
  assert.ok(/body\.review\s+\.chrome\s*\{[^}]*position:\s*static/s.test(css));
  assert.ok(!/^\.chrome\s*\{[^}]*position:\s*fixed/m.test(css));
  const app = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
  assert.ok(app.includes("classList.add('review')"));
  assert.ok(app.includes("classList.add('canvas-only')"));
});

test('index keeps canvas=1 open-in-new-window link', () => {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.ok(html.includes('canvas=1'));
  assert.ok(html.includes('target="_blank"'));
  assert.ok(html.includes('id="chrome"'));
  assert.ok(html.includes('id="productFrame"'));
});
