import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'prototypes', 'home-control-center');
const read = (file) => fs.readFileSync(path.join(dir, file), 'utf8');

for (const file of [
  'index.html', 'styles/shell.css', 'styles/variants.css',
  'scripts/fixtures.js', 'scripts/variants.js', 'scripts/evaluation.js', 'scripts/app.js', 'README.md',
]) assert.ok(fs.existsSync(path.join(dir, file)), `missing ${file}`);

const html = read('index.html');
const variantCss = read('styles/variants.css');
for (const hook of ['prototype-app', 'variant-nav', 'state-nav', 'stage', 'evaluation-panel', 'prototype-feedback']) {
  assert.match(html, new RegExp(`data-${hook}|id=["']${hook}["']`), `missing ${hook} mount`);
}
assert.match(html, /class="proto-picker"/);
assert.match(variantCss, /\.vision-actions\s*\{[^}]*display\s*:\s*flex/s, 'Vision action row must keep usable button spacing');

const context = { window: {}, console, structuredClone: globalThis.structuredClone };
vm.createContext(context);
for (const script of ['scripts/fixtures.js', 'scripts/variants.js', 'scripts/evaluation.js']) {
  vm.runInContext(read(script), context, { filename: script });
}

const F = context.window.HomePrototypeFixtures;
assert.deepEqual(Array.from(F.stateIds), ['idle', 'listening', 'running', 'waiting', 'missing-config']);
for (const id of F.stateIds) {
  const snap = F.getSnapshot(id);
  assert.equal(snap.stateId, id);
  assert.equal(snap.channels.length, 4);
  assert.ok(snap.scene && snap.target && snap.agents.length && snap.availableActions.length);
}
const missing = F.getSnapshot('missing-config');
assert.equal(missing.target.confirmed, false);
assert.equal(missing.channels.find((item) => item.id === 'voice').available, false);

const V = context.window.HomePrototypeVariants;
assert.equal(V.length, 8);
assert.deepEqual(Array.from(V, (item) => item.id), ['vibe', 'beginner', 'vision', 'quest', 'search', 'agents', 'notion', 'raycast']);
assert.equal(new Set(Array.from(V, (item) => item.axis)).size, 8);
for (const variant of V) {
  const idleMarkup = variant.render(F.getSnapshot('idle'));
  const missingMarkup = variant.render(missing);
  assert.match(idleMarkup, /data-action=/, `${variant.id} has no action`);
  assert.match(missingMarkup, /设置麦克风|选择目标|修复/, `${variant.id} has no repair affordance`);
  assert.doesNotMatch(idleMarkup + missingMarkup, /\b\d{1,3}%\b|额度剩余|已完成\s*\d+\/\d+/);
}

const E = context.window.HomePrototypeEvaluation;
const memoryStore = E.createStore({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
memoryStore.saveVariant('vibe', { scores: { beginner: 4, launch: 5 }, notes: '保留流程' });
assert.equal(memoryStore.load().vibe.notes, '保留流程');
assert.equal(memoryStore.summary().length, 1);

console.log('home-control-center prototype: 8 variants, 5 states, contracts ok');
