/**
 * P0 agent-home-pulse projection — §12 helped-you + pulse (beginner copy).
 * Run: node scripts/test-agent-home-pulse.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const Pulse = require(path.join(dir, '../src/js/features/agent/agent-home-pulse.js'));

const raw = [
  {
    eventId: 'e1',
    eventType: 'task_paused',
    eventClass: 'onetone_lifecycle',
    summary: 'Agent 工作已暂停',
    timestamp: Date.UTC(2026, 9, 3, 6, 32, 0)
  },
  {
    eventId: 'w1',
    eventType: 'user_turn_observed',
    eventClass: 'provider_observed',
    summary: 'User turn observed',
    timestamp: Date.UTC(2026, 9, 3, 5, 0, 0)
  },
  {
    eventId: 'w2',
    eventType: 'session_updated',
    eventClass: 'provider_observed',
    summary: 'Cursor session updated',
    timestamp: Date.UTC(2026, 9, 3, 4, 59, 0)
  },
  {
    eventId: 'e2',
    eventType: 'waiting_approval',
    eventClass: 'onetone_lifecycle',
    summary: 'Agent 在等你确认',
    timestamp: Date.UTC(2026, 9, 3, 4, 0, 0)
  }
];

const rows = Pulse.projectHelpedYou(raw, { foldWeak: true });
assert.equal(rows[0].category, 'paused');
assert.match(rows[0].summary, /停|接着/);
assert.ok(!/User turn observed/i.test(JSON.stringify(rows)));
assert.equal(rows[1].category, 'weak');
assert.ok(rows[1].foldedCount === 2 || /动静/.test(rows[1].summary));
assert.equal(rows[2].category, 'need_you');
assert.equal(rows[2].actions[0].label, '去拍板');

const eng = Pulse.projectEvent({
  eventType: 'user_turn_observed',
  summary: 'User turn observed'
});
assert.match(eng.summary, /你刚/);

const pulseRun = Pulse.projectPulse({
  activeSession: { status: 'running' },
  syncStatus: 'ready',
  probeStatus: 'ready',
  project: { matchKind: 'exact' },
  checkpoint: { nextAction: '接着排呈现' }
});
assert.equal(pulseRun.dynamic, '正在帮你');
assert.match(pulseRun.help, /开口/);
assert.equal(pulseRun.health, '顺利');
assert.equal(pulseRun.quota, null);
assert.equal(pulseRun.progress, '接着排呈现');

const pulseWait = Pulse.projectPulse({
  activeSession: { status: 'waiting_approval' },
  project: { matchKind: 'exact' }
});
assert.equal(pulseWait.dynamic, '在等你拍板');
assert.equal(pulseWait.health, '要你点一下');

const pulseBad = Pulse.projectPulse({
  activeSession: { status: 'idle' },
  probeStatus: 'read_error',
  project: { matchKind: 'unknown' }
});
assert.match(pulseBad.health, /连不上|认准/);
assert.equal(pulseBad.quota, null);
assert.equal(pulseBad.progress, null);

const live = Pulse.fromHomeSnapshot({
  syncStatus: 'ready',
  probeStatus: 'ready',
  project: { displayName: 'voice-pilot', matchKind: 'exact', projectId: 'p1' },
  activeSession: {
    sessionId: 's1',
    provider: 'cursor',
    status: 'waiting_approval',
    title: '改文案',
    updatedAt: Date.UTC(2026, 9, 3, 6, 0, 0)
  },
  checkpoint: {
    checkpointId: 'c1',
    pendingQuestions: ['要不要写入？'],
    nextAction: '等你确认后写入'
  },
  recentEvents: [
    {
      eventId: 'e1',
      eventType: 'waiting_approval',
      eventClass: 'onetone_lifecycle',
      summary: 'Agent 在等你确认',
      timestamp: Date.UTC(2026, 9, 3, 6, 0, 0)
    },
    {
      eventId: 'w1',
      eventType: 'user_turn_observed',
      eventClass: 'provider_observed',
      summary: 'User turn observed',
      timestamp: Date.UTC(2026, 9, 3, 5, 0, 0)
    }
  ]
});
assert.equal(live.live, true);
assert.equal(live.dataSource, 'ipc');
assert.equal(live.mode, 'attention');
assert.equal(live.pulse.dynamic, '在等你拍板');
assert.equal(live.pulse.quota, null);
assert.ok(live.attention && live.attention.primaryLabel === '去拍板');
assert.ok(live.recentEvents.some(function (e) { return e.category === 'need_you'; }));
assert.ok(!JSON.stringify(live.recentEvents).includes('User turn observed'));

console.log('test-agent-home-pulse: ok');
