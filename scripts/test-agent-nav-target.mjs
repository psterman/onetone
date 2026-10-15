/**
 * Agent nav target + routing IA contract.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const navSrc = read('src/js/features/agent/agent-nav-target.js');
const stripSrc = read('src/js/features/now/home-agent-status-strip.js');
const shell = read('src/js/shared/shell-ia-convergence.js');
const drawer = read('src/js/features/settings/settings-drawer.js');
const workbench = read('src/js/features/home/home-workbench.js');
const cmdk = read('src/js/features/home/home-workbench-cmdk.js');
const indexHtml = read('src/index.html');

assert.match(shell, /agentData:[\s\S]*agentSub:\s*'data'/);
assert.match(drawer, /agentSub:'data'/);
assert.match(cmdk, /agentSub:'data'/);
assert.match(workbench, /panel==='agent'\|\|panel==='agentData'\) return 'agent'/);
assert.match(workbench, /agentData:'agent'/);
assert.doesNotMatch(workbench, /return 'agentData'/);
assert.doesNotMatch(indexHtml, /id="wbNavAgentData"|data-wb-nav="agentData"/);
assert.match(indexHtml, /agent-nav-target\.js/);
assert.match(stripSrc, /pickStatus/);
assert.match(stripSrc, /去处理|查看问题|继续/);
assert.doesNotMatch(stripSrc, /fixtureSnap|伪装/);

const opens = [];
const ctx = {
  window: {},
  globalThis: null,
  OneToneSettingsDrawer: {
    open(opts) {
      opens.push(opts);
    }
  }
};
ctx.globalThis = ctx;
ctx.window = ctx;
vm.runInNewContext(navSrc, ctx);

const Nav = ctx.OneToneAgentNavTarget;
assert.ok(Nav);
const n = Nav.normalize({
  view: 'data',
  section: 'efficiency',
  provider: 'codex',
  sessionId: 'unknown'
});
assert.equal(n.view, 'data');
assert.equal(n.section, 'efficiency');
assert.equal(n.provider, 'codex');
assert.equal(n.sessionId, null, 'unknown sessionId must not be guessed');

assert.equal(Nav.open({ view: 'overview', provider: 'Cursor', section: 'working' }), true);
assert.equal(opens.length, 1);
assert.equal(opens[0].panel, 'agent');
assert.equal(opens[0].agentSub, null);
assert.equal(opens[0].agentTarget.provider, 'Cursor');

assert.equal(Nav.open({ view: 'data' }), true);
assert.equal(opens[1].agentSub, 'data');

console.log('ok agent-nav-target');
