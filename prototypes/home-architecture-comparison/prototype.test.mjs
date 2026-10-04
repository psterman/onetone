import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, '$1'));
const runtimeFiles = [
  'shared.js',
  'variant-resume-desk.js',
  'variant-intent-stage.js',
  'variant-action-table.js',
  'variant-split-cockpit.js'
];

async function loadRuntime() {
  const window = {};
  const sandbox = vm.createContext({
    window,
    globalThis: window,
    console,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout
  });

  for (const file of runtimeFiles) {
    try {
      const source = await fs.readFile(path.join(root, file), 'utf8');
      vm.runInContext(source, sandbox, { filename: file });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return window.OneToneHomePrototype;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('runtime registers four genuinely distinct homepage directions', async () => {
  const runtime = await loadRuntime();
  assert.ok(runtime, 'prototype runtime should exist');
  assert.deepEqual(
    Array.from(runtime.variants, (variant) => variant.id),
    ['resume-desk', 'intent-stage', 'action-table', 'split-cockpit']
  );
  assert.equal(new Set(Array.from(runtime.variants, (variant) => variant.axis)).size, 4);
});

test('every state renders provenance and exactly one primary action in every variant', async () => {
  const runtime = await loadRuntime();
  assert.ok(runtime, 'prototype runtime should exist');
  const states = ['idle', 'resume', 'running', 'waiting', 'dictating', 'degraded'];

  for (const state of states) {
    const model = runtime.modelFor(state);
    assert.equal(model.state, state);
    for (const variant of runtime.variants) {
      const html = variant.render(model);
      assert.match(html, new RegExp(`data-variant=["']${variant.id}["']`));
      assert.match(html, new RegExp(`data-home-state=["']${state}["']`));
      assert.equal((html.match(/data-primary-action/g) || []).length, 1, `${variant.id}/${state}`);
      assert.match(html, /data-source-quality=/, `${variant.id}/${state} should expose provenance`);
    }
  }
});

test('primary resume intent advances to running and preserves the selected variant', async () => {
  const runtime = await loadRuntime();
  assert.ok(runtime, 'prototype runtime should exist');
  assert.deepEqual(plain(runtime.reduceIntent({ state: 'resume', variant: 2 }, { type: 'primary' })), {
    state: 'running',
    variant: 2,
    effect: 'resume-session'
  });
});

test('camera approval is gated by a second channel', async () => {
  const runtime = await loadRuntime();
  assert.ok(runtime, 'prototype runtime should exist');
  assert.deepEqual(
    plain(runtime.channelIntent({ state: 'waiting', actionId: 'agent.approve', channel: 'camera' })),
    {
      allowed: false,
      confirmation: 'cross-channel',
      message: '摄像头只能发起批准请求，请再用按键、语音或 Soft Pad 确认。'
    }
  );
});

test('degraded state is honest about missing data and offers recovery instead of fake content', async () => {
  const runtime = await loadRuntime();
  assert.ok(runtime, 'prototype runtime should exist');
  const model = runtime.modelFor('degraded');
  assert.equal(model.project.known, false);
  assert.equal(model.source.quality, 'unavailable');
  assert.equal(model.primary.id, 'repair-source');
  assert.equal(model.work.title, '暂时无法确认你正在做什么');
});

test('collapsed desktop rail keeps explicit accessible names for all top-level destinations', async () => {
  const runtime = await loadRuntime();
  assert.ok(runtime, 'prototype runtime should exist');
  const html = runtime.variants[0].render(runtime.modelFor('resume'));
  const destinations = [
    ['home', '首页'],
    ['habits', '我的习惯'],
    ['actions', '动作与入口'],
    ['agent', 'Agent'],
    ['settings', '设置']
  ];
  for (const [id, name] of destinations) {
    assert.match(html, new RegExp(`data-nav=["']${id}["'][^>]*aria-label=["']${name}["']`));
  }
});
