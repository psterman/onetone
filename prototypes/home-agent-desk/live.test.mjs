/**
 * home-agent-desk live projector — empty zones collapse; no invented Marvis.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(dir, 'live.js'), 'utf8');
const sandbox = { window: {}, globalThis: {} };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(src, sandbox);
const Live = sandbox.OneToneHomeAgentDeskLive;
assert.ok(Live && typeof Live.project === 'function', 'exports project');

const empty = Live.project({});
assert.equal(Object.keys(empty.S).length, 0);
assert.ok(!empty.sit.layout.needs);
assert.ok(!empty.sit.layout.living);
assert.ok(!empty.sit.layout.continue);
assert.ok(!empty.sit.layout.recent);
assert.equal(empty.sitName, 'quiet');

const wait = Live.project({
  attention: {
    rows: [
      {
        agent: 'codex',
        sessionId: 's1',
        state: 'needsInput',
        cause: 'PermissionRequest',
        waitingEligible: true,
        observedAtMs: Date.now() - 120000,
        source: 'hook',
      },
      {
        agent: 'claude',
        sessionId: 's2',
        state: 'working',
        cause: 'Notification',
        waitingEligible: false,
        observedAtMs: Date.now(),
        source: 'hook',
      },
    ],
  },
  home: {},
  focus: { project: { name: 'voice-pilot', confirmed: true, match: 'exact' }, work: { status: 'idle' } },
});
assert.equal(wait.sitName, 'attention');
assert.equal(wait.sit.layout.needs.ids.length, 1);
assert.ok(!wait.sit.layout.living, 'waiting clears living');
assert.match(wait.S[wait.sit.layout.needs.ids[0]].title, /Codex|批准/);
assert.equal(wait.sit.topProj, 'voice-pilot');

const cont = Live.project({
  attention: { rows: [] },
  home: {
    project: { displayName: 'voice-pilot' },
    checkpoint: {
      checkpointId: 'c1',
      sessionId: 'sess-a',
      currentTask: 'desk IA',
      updatedAt: Date.now() - 7200000,
    },
    recentSessions: [
      { sessionId: 'sess-a', provider: 'cursor', title: 'same as ckpt', updatedAt: Date.now() },
      { sessionId: 'sess-b', provider: 'cursor', title: 'older', updatedAt: Date.now() - 1000 },
    ],
  },
  focus: { project: { name: 'voice-pilot', confirmed: true, match: 'exact' }, work: { status: 'resumable' } },
});
assert.equal(cont.sitName, 'resume');
assert.ok(cont.sit.layout.continue);
assert.ok(cont.sit.layout.recent);
assert.ok(!cont.sit.layout.recent.ids.includes('sess-' + 'sess-a') || cont.sit.layout.recent.ids.every((id) => id !== 'ckpt-c1'));
// checkpoint session skipped from recent duplicate
assert.ok(!cont.sit.layout.recent.ids.some((id) => id === 'sess-sess-a'));

const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
assert.ok(html.includes('src="./live.js"'), 'loads live bridge');
assert.ok(html.includes('wantLive'), 'auto live gate');
assert.ok(html.includes('layout.needs && (layout.needs.ids || []).length'), 'collapse empty needs');

console.log('home-agent-desk live: ok');
