/**
 * Smoke: Now home — 当前情景驾驶舱（fixtures only）。
 * Run: npm run test:now-home
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'src/js/features/now');

const ctx = {
  window: {},
  globalThis: null,
  document: {
    readyState: 'complete',
    addEventListener() {},
    getElementById() {
      return null;
    },
    querySelector() {
      return null;
    }
  },
  URLSearchParams,
  location: { search: '' }
};
ctx.globalThis = ctx;
ctx.window = ctx;

for (const f of ['fixtures.js', 'now-model.js', 'now-home-ui.js', 'now-home.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx);
}

const m = ctx.OneToneNowModel;
const fx = ctx.OneToneNowFixtures;
const ui = ctx.OneToneNowHomeUi;

const live = fx.cloneState('s1');
const snap = m.projectNowHome(live);
if (!snap.active || snap.active.id !== 'create') throw new Error('expected create active');
if (!snap.habits.some((h) => h.id === 'meet' && h.maybe)) throw new Error('expected meet suggested');
if (snap.active.description !== '正在电脑前工作') throw new Error('create description');
if (!snap.active.helping.includes('减少消息打扰')) throw new Error('helping result copy');

const next = m.activateHabit(live, 'away');
const away = m.projectNowHome(next);
if (!away.active || away.active.id !== 'away') throw new Error('activate away failed');

const html = ui.renderNowView({ snapshot: away, needsExpanded: false, adjustOpen: false });
if (!html.includes('当前情景')) throw new Error('missing 当前情景');
if (!html.includes('我的情景')) throw new Error('missing 我的情景');
if (!html.includes('data-now-adjust')) throw new Error('missing adjust control');
if (!html.includes('离开电脑') || !html.includes('需要决定')) throw new Error('now view missing');

const adjusted = ui.renderNowView({ snapshot: away, needsExpanded: false, adjustOpen: true });
if (!adjusted.includes('data-now-adjust-done')) throw new Error('missing adjust done');
if (!adjusted.includes('微调这个情景')) throw new Error('missing adjust mode');
if (!adjusted.includes('data-now-op=')) throw new Error('missing action toggles');

const wait = fx.cloneState('sWait');
const waitSnap = m.projectNowHome(wait);
const capped = ui.renderNowView({ snapshot: waitSnap, needsExpanded: false });
if (!capped.includes('查看全部')) throw new Error('needsYou cap missing');

const scenes = ui.renderScenesView({ snapshot: away });
if (!scenes.includes('结果开关') || !scenes.includes('何时进入')) throw new Error('scenes view missing');

console.log('smoke-now-home: ok');
