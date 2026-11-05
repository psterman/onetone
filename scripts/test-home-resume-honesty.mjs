'use strict';

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

var root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
var adapterSrc = fs.readFileSync(
  path.join(root, 'src/js/features/now/home-focus-adapter.js'),
  'utf8'
);
var viewSrc = fs.readFileSync(
  path.join(root, 'src/js/features/now/home-focus-view.js'),
  'utf8'
);
var css = fs.readFileSync(path.join(root, 'src/css/now-home.css'), 'utf8');
var rust = fs.readFileSync(
  path.join(root, 'src-tauri/src/agent_memory/home_focus.rs'),
  'utf8'
);

assert.ok(adapterSrc.includes('RESUME_MAX_AGE_MS'), 'FE age gate');
assert.ok(adapterSrc.includes('isResumeCtaLabel'), 'FE CTA filter');
assert.ok(adapterSrc.includes('usableResumeStep'), 'FE usable step');
assert.ok(adapterSrc.includes('resumeAssistance'), 'FE precise resume stats');
assert.ok(adapterSrc.includes('再做一件相关的事'), 'filters known false step');
assert.ok(rust.includes('RESUME_MAX_AGE_MS'), 'Rust age gate');
assert.ok(rust.includes('is_resume_cta_label'), 'Rust CTA filter');
assert.ok(viewSrc.includes('hn-intent') || viewSrc.includes('set_intent'), 'chrome has intent switch');
assert.ok(!/var where = project \? '现在 · ' \+ project/.test(viewSrc), 'no 现在 · prefix');
assert.ok(css.includes('hn-chrome--proto') || css.includes('hn-intent'), 'proto chrome styles');

var sandbox = { window: {}, console: console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(adapterSrc, sandbox);
var A = sandbox.OneToneHomeFocusAdapter;
assert.ok(A && A.toViewModel && A.enrichFromHomeSnapshot, 'adapter exports');

var now = Date.now();
var base = A.toViewModel({
  foreground: { appName: 'Cursor', appId: 'cursor' },
  project: {
    id: 'p1',
    name: 'voice-pilot',
    root: 'E:\\\\voice-pilot',
    match: 'exact',
    confirmed: true
  },
  work: { status: 'idle', title: '', description: '', updatedAt: now },
  provider: { id: 'codex', status: 'idle' },
  source: { freshness: 'cached', reason: 'test' }
});
assert.strictEqual(base.mode, 'quiet', 'idle → quiet');

var ctaHome = {
  checkpoint: {
    sessionId: 's1',
    currentTask: '再做一件相关的事',
    nextAction: '从上次进度继续',
    updatedAt: now - 60_000
  },
  recentSessions: [{ sessionId: 's1', provider: 'codex', updatedAt: now - 60_000 }]
};
var ctaVm = A.enrichFromHomeSnapshot(
  JSON.parse(JSON.stringify(base)),
  ctaHome
);
assert.notStrictEqual(ctaVm.mode, 'return', 'CTA-only checkpoint must not force return');
assert.ok(
  !String(ctaVm.headline || '').includes('再做一件相关的事'),
  'headline must not quote CTA label'
);

var realHome = {
  checkpoint: {
    sessionId: 's2',
    currentTask: '修首页顶栏截断',
    nextAction: '继续：「修首页顶栏截断」',
    updatedAt: now - 3_600_000
  },
  recentSessions: [
    {
      sessionId: 's2',
      provider: 'codex',
      updatedAt: now - 3_600_000,
      matchConfidence: 0.92
    }
  ]
};
var realVm = A.enrichFromHomeSnapshot(
  JSON.parse(JSON.stringify(base)),
  realHome
);
assert.strictEqual(realVm.mode, 'return', 'fresh real step → return');
assert.ok(
  String(realVm.headline).includes('修首页顶栏截断'),
  'headline uses real step'
);
assert.ok(
  /有进度|可恢复进度/.test(String(realVm.assistance)),
  'assistance has human age fact'
);
assert.ok(
  String(realVm.assistance).includes('继续'),
  'assistance invites continue'
);
assert.ok(
  !/\bcheckpoint\b|probe\s*=/i.test(String(realVm.assistance)),
  'card assistance must not show checkpoint/probe jargon'
);

var staleHome = {
  checkpoint: {
    sessionId: 's3',
    currentTask: '很久以前的任务',
    updatedAt: now - 8 * 24 * 60 * 60 * 1000
  },
  recentSessions: [{ sessionId: 's3', provider: 'codex', updatedAt: now - 8 * 24 * 60 * 60 * 1000 }]
};
var staleVm = A.enrichFromHomeSnapshot(
  JSON.parse(JSON.stringify(base)),
  staleHome
);
assert.notStrictEqual(staleVm.mode, 'return', 'stale checkpoint must not force return');
assert.ok(!staleVm.desk || !staleVm.desk.continueCard, 'stale checkpoint skips continue card');

// ATR checkpoint must not be labeled as Cursor (FG Soft Pad).
var atrDto = A.toViewModel({
  foreground: { appName: 'Cursor', appId: 'cursor' },
  project: {
    id: 'p1',
    name: 'voice-pilot',
    root: 'E:\\\\voice-pilot',
    match: 'exact',
    confirmed: true
  },
  work: {
    status: 'resumable',
    title: '最近修改了什么代码？',
    description: '可以继续或放弃。',
    updatedAt: now - 120_000
  },
  provider: { id: 'onetone_atr', status: 'ready' },
  nextAction: { title: '继续上次工作', kind: 'resume', executable: true },
  source: { freshness: 'live', reason: 'probe=ready;atr_checkpoint;interrupted' }
});
assert.strictEqual(atrDto.mode, 'return', 'ATR resumable → return');
assert.ok(
  String(atrDto.headline).includes('最近修改了什么代码？'),
  'ATR headline keeps goal'
);
assert.ok(
  !/Cursor/.test(String(atrDto.headline)),
  'ATR headline must not say Cursor, got: ' + atrDto.headline
);
assert.ok(
  rust.includes('PROVIDER_ONETONE_ATR') && rust.includes('atr_owns'),
  'Rust sets ATR provider when atr owns work'
);

var atrMislabel = A.enrichFromHomeSnapshot(
  A.toViewModel({
    foreground: { appName: 'Cursor', appId: 'cursor' },
    project: {
      id: 'p1',
      name: 'voice-pilot',
      root: 'E:\\\\voice-pilot',
      match: 'exact',
      confirmed: true
    },
    work: { status: 'idle', title: '', description: '', updatedAt: now },
    provider: { id: 'cursor', status: 'ready' },
    source: { freshness: 'cached', reason: 'probe=ready;atr_checkpoint;interrupted' }
  }),
  {
    checkpoint: {
      sessionId: 'atr-sess',
      provider: 'onetone_atr',
      currentTask: '今天改动了什么文件？',
      updatedAt: now - 60_000
    },
    recentSessions: [
      { sessionId: 'atr-sess', provider: 'onetone_atr', updatedAt: now - 60_000 }
    ],
    provider: { id: 'cursor' },
    source: { reason: 'probe=ready;atr_checkpoint;interrupted' }
  }
);
assert.strictEqual(atrMislabel.mode, 'return', 'ATR enrich → return');
assert.ok(
  !/Cursor/.test(String(atrMislabel.headline)),
  'enriched ATR must not say Cursor, got: ' + atrMislabel.headline
);
assert.ok(
  atrMislabel.desk &&
    atrMislabel.desk.continueCard &&
    atrMislabel.desk.continueCard.badge !== 'Cursor',
  'continue badge must not be Cursor'
);

console.log('home-resume-honesty tests passed');
