import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let CapsuleMount = null;
try {
  CapsuleMount = require('../src/js/features/agent/agent-capsule-mount.js');
} catch (_) {
  // The assertion below keeps the RED phase an intentional behavior failure,
  // instead of aborting with a module-loader error.
}

assert.ok(CapsuleMount, 'agent capsule mount helper must exist');
assert.equal(typeof CapsuleMount.waitForHosts, 'function');

let attempts = 0;
const desk = { id: 'agentCapsuleDesk' };
const detail = { id: 'agentCapsuleDetail' };
const host = { id: 'capsuleHost' };

const result = await CapsuleMount.waitForHosts({
  getFrame() {
    attempts += 1;
    if (attempts < 3) return null;
    return {
      contentDocument: {
        readyState: 'complete',
        getElementById(id) {
          return { agentCapsuleDesk: desk, agentCapsuleDetail: detail, capsuleHost: host }[id] || null;
        }
      }
    };
  },
  schedule(run) {
    queueMicrotask(run);
  },
  maxAttempts: 5
});

assert.equal(attempts, 3, 'waits until the lazy iframe exposes the capsule hosts');
assert.equal(result.desk, desk);
assert.equal(result.detail, detail);
assert.equal(result.host, host);

await assert.rejects(
  CapsuleMount.waitForHosts({
    getFrame() {
      return null;
    },
    schedule(run) {
      queueMicrotask(run);
    },
    maxAttempts: 2
  }),
  /胶囊视图尚未就绪/
);

console.log('Agent capsule mount readiness checks passed.');
