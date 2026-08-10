/**
 * decideAgentStatusEdge contract + chip projection integration tests.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const sandbox = { console };
vm.runInNewContext(read('src/js/core/agent-status-edge.js'), sandbox);
const Edge = sandbox.OneToneAgentStatusEdge;
assert.ok(Edge && typeof Edge.decideAgentStatusEdge === 'function');
assert.ok(typeof Edge.planAgentChipProjection === 'function');

const decide = Edge.decideAgentStatusEdge.bind(Edge);
const plan = Edge.planAgentChipProjection.bind(Edge);

// First packet: accept, no edge
{
  const d = decide(null, 'running', { sequence: 1, timestamp: 100 });
  assert.equal(d.accepted, true);
  assert.equal(d.stateChanged, false);
  assert.equal(d.nextMemory.status, 'running');
  assert.equal(d.nextMemory.warmed, true);
  assert.equal(d.nextMemory.sequence, 1);
}

// Smaller sequence: reject
{
  const prev = { status: 'running', sequence: 5, timestamp: 100, warmed: true };
  const d = decide(prev, 'done', { sequence: 4, timestamp: 200 });
  assert.equal(d.accepted, false);
  assert.equal(d.stateChanged, false);
  assert.equal(d.nextMemory.status, 'running');
  assert.equal(d.nextMemory.sequence, 5);
}

// Same sequence, same status: duplicate
{
  const prev = { status: 'running', sequence: 5, timestamp: 100, warmed: true };
  const d = decide(prev, 'running', { sequence: 5, timestamp: 100 });
  assert.equal(d.accepted, true);
  assert.equal(d.stateChanged, false);
}

// Same sequence, different status: reject
{
  const prev = { status: 'running', sequence: 5, timestamp: 100, warmed: true };
  const d = decide(prev, 'done', { sequence: 5, timestamp: 100 });
  assert.equal(d.accepted, false);
  assert.equal(d.nextMemory.status, 'running');
}

// No sequence, older timestamp: reject
{
  const prev = { status: 'running', sequence: null, timestamp: 200, warmed: true };
  const d = decide(prev, 'done', { sequence: null, timestamp: 100 });
  assert.equal(d.accepted, false);
}

// No sequence, same timestamp different status: last-write-wins
{
  const prev = { status: 'running', sequence: null, timestamp: 200, warmed: true };
  const d = decide(prev, 'done', { sequence: null, timestamp: 200 });
  assert.equal(d.accepted, true);
  assert.equal(d.stateChanged, true);
  assert.equal(d.nextMemory.status, 'done');
}

// No sequence/timestamp: receive order
{
  const prev = { status: 'idle', sequence: null, timestamp: null, warmed: true };
  const d = decide(prev, 'running', { sequence: null, timestamp: null });
  assert.equal(d.accepted, true);
  assert.equal(d.stateChanged, true);
}

// error/failed normalize — no false edge
{
  const prev = { status: 'failed', sequence: 2, timestamp: null, warmed: true };
  const d = decide(prev, 'error', { sequence: 2, timestamp: null });
  assert.equal(d.accepted, true);
  assert.equal(d.stateChanged, false);
  assert.equal(d.nextMemory.status, 'failed');
}

// Newer sequence changes status
{
  const prev = { status: 'running', sequence: 2, timestamp: 10, warmed: true };
  const d = decide(prev, 'done', { sequence: 3, timestamp: 20 });
  assert.equal(d.accepted, true);
  assert.equal(d.stateChanged, true);
  assert.equal(d.nextMemory.sequence, 3);
}

// metaFromRow separates fields
{
  const meta = Edge.metaFromRow({ seq: 9, updatedAt: 12345, state: 'running' });
  assert.equal(meta.sequence, 9);
  assert.equal(meta.timestamp, 12345);
}

// planAgentChipProjection matrix
{
  const reject = plan({ accepted: false, stateChanged: false, lightsOn: false });
  assert.equal(reject.applyRow, false);
  assert.equal(reject.hidden, null);
  assert.equal(reject.applyStatusTip, false);
  assert.equal(reject.playEdge, false);

  const lightsOff = plan({ accepted: true, stateChanged: true, lightsOn: false });
  assert.equal(lightsOff.applyRow, true);
  assert.equal(lightsOff.hidden, true);
  assert.equal(lightsOff.applyStatusTip, false);
  assert.equal(lightsOff.playEdge, false);

  const edgeOn = plan({ accepted: true, stateChanged: true, lightsOn: true });
  assert.equal(edgeOn.applyStatusTip, true);
  assert.equal(edgeOn.playEdge, true);
  assert.equal(edgeOn.hidden, false);
}

/** Fake chip + memory loop mirroring overlay projection order. */
function projectChip(chip, memory, packet, focus) {
  const kind = chip.kind;
  const row = packet;
  const lightsOn = !!(row.lightsEnabled || row.lights_enabled);
  const state = Edge.normalizeStatus(row.state || 'idle');
  const meta = Edge.metaFromRow(row);

  chip.focus = kind === focus;
  chip.ariaPressed = kind === focus ? 'true' : 'false';

  const decision = decide(memory.current, state, meta);
  if (decision.accepted && decision.nextMemory) memory.current = decision.nextMemory;

  const p = plan({
    accepted: decision.accepted,
    stateChanged: decision.stateChanged,
    lightsOn
  });
  if (!p.applyRow) return { decision, plan: p };
  if (p.hidden != null) chip.hidden = !!p.hidden;
  if (!p.applyStatusTip) return { decision, plan: p };
  chip.status = state;
  chip.playedEdge = !!p.playEdge;
  return { decision, plan: p };
}

// Integration: new packet shows → stale lightsOff reject keeps visible + focus updates
{
  const chip = { kind: 'codex', hidden: true, focus: false, ariaPressed: 'false', status: 'idle', playedEdge: false };
  const memory = { current: null };

  projectChip(chip, memory, {
    state: 'running', sequence: 2, lightsEnabled: true
  }, 'codex');
  assert.equal(chip.hidden, false);
  assert.equal(chip.focus, true);
  assert.equal(chip.status, 'running');
  assert.equal(memory.current.sequence, 2);

  projectChip(chip, memory, {
    state: 'idle', sequence: 1, lightsEnabled: false
  }, 'claude');
  assert.equal(chip.hidden, false, 'stale lightsOff must not hide chip');
  assert.equal(chip.focus, false, 'focus chrome still syncs on reject');
  assert.equal(chip.ariaPressed, 'false');
  assert.equal(chip.status, 'running', 'status stays from accepted packet');
  assert.equal(memory.current.sequence, 2);
}

// Integration: accepted lights-off hides without edge play
{
  const chip = { kind: 'codex', hidden: false, focus: false, ariaPressed: 'false', status: 'running', playedEdge: false };
  const memory = {
    current: { status: 'running', sequence: 2, timestamp: null, warmed: true }
  };
  const out = projectChip(chip, memory, {
    state: 'done', sequence: 3, lightsEnabled: false
  }, 'codex');
  assert.equal(out.decision.accepted, true);
  assert.equal(out.decision.stateChanged, true);
  assert.equal(chip.hidden, true);
  assert.equal(chip.focus, true);
  assert.equal(out.plan.playEdge, false);
  assert.equal(chip.playedEdge, false);
  assert.equal(chip.status, 'running', 'status tip skipped when lights off');
}

// Overlay loads the module + focus before hidden in applyAgentChipEl
{
  const html = read('src/codex-micro-overlay.html');
  assert.ok(/js\/core\/agent-status-edge\.js/.test(html), 'overlay loads agent-status-edge.js');
  const idx = html.indexOf('js/core/agent-status-edge.js');
  const usage = html.indexOf('usage-format.js');
  assert.ok(idx > 0 && usage > idx, 'edge before usage-format');

  const fnStart = html.indexOf('function applyAgentChipEl');
  assert.ok(fnStart >= 0, 'applyAgentChipEl present');
  const fnSlice = html.slice(fnStart, fnStart + 3500);
  const focusIdx = fnSlice.indexOf('is-usage-focus');
  const hiddenIdx = fnSlice.indexOf('el.hidden');
  assert.ok(focusIdx >= 0 && hiddenIdx >= 0, 'focus + hidden present in applyAgentChipEl');
  assert.ok(focusIdx < hiddenIdx, 'is-usage-focus before el.hidden in applyAgentChipEl');
  assert.ok(/planAgentChipProjection/.test(fnSlice), 'overlay uses planAgentChipProjection');

  const edgeFnStart = html.indexOf('function applyAgentStatusEdge');
  const edgeFnEnd = html.indexOf('function playAgentChipEdge');
  assert.ok(edgeFnStart >= 0 && edgeFnEnd > edgeFnStart, 'playAgentChipEdge after applyAgentStatusEdge');
  const edgeFn = html.slice(edgeFnStart, edgeFnEnd);
  assert.ok(!/playOnce/.test(edgeFn), 'applyAgentStatusEdge no longer plays edge');
}
{
  const html = read('src/index.html');
  assert.ok(/js\/core\/agent-status-edge\.js/.test(html), 'index loads agent-status-edge.js');
  assert.ok(/js\/core\/panel-reveal\.js/.test(html), 'index loads panel-reveal.js');
}

console.log('test-agent-status-edge: ok');
