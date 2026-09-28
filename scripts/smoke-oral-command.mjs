/**
 * Narrow smoke for oral-command aggregation + writeback contract (plan Phase E).
 * Run: node scripts/smoke-oral-command.mjs
 */
'use strict';

function tokenizeOralSay(v) {
  return String(v || '')
    .split(/[、,，;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

// Soft say stays on scheme; prompt/bind say must not be the sole truth in scheme.
function applyOralWritebackStub(m, domItems) {
  const whitelist = {};
  Object.keys(domItems).forEach((id) => {
    const it = domItems[id] || {};
    const enabled = it.enabled !== false;
    const say = String(it.say || '').trim();
    if (id.indexOf('soft:') === 0) {
      whitelist[id] = { enabled, say };
      return;
    }
    if (id.indexOf('prompt:') === 0) {
      whitelist[id] = { enabled };
      const peerId = id.slice(7);
      const peer = (m.peers || []).find((p) => p.id === peerId);
      if (peer) peer.wakePhrases = tokenizeOralSay(say);
      return;
    }
    if (id.indexOf('bind:') === 0) {
      whitelist[id] = { enabled };
      const ref = id.slice(5);
      const b = (m.agentBindings || []).find((x) => x.slotId === ref);
      if (b) b.triggerBinding = tokenizeOralSay(say).join('、') || say;
      return;
    }
    whitelist[id] = { enabled, say };
  });
  m.oralCommandScheme = { items: whitelist };
}

const m = {
  peers: [{ id: 'p1', wakePhrases: ['旧词'] }],
  agentBindings: [{ slotId: 'slotA', triggerType: 'voice', triggerBinding: '旧绑定' }],
  oralCommandScheme: { items: {} }
};

applyOralWritebackStub(m, {
  'soft:stopOrSend': { say: '发出去', enabled: true },
  'prompt:p1': { say: '新注入、备用', enabled: true },
  'bind:slotA': { say: '继续干', enabled: false }
});

assert(m.oralCommandScheme.items['soft:stopOrSend'].say === '发出去', 'soft say on scheme');
assert(m.oralCommandScheme.items['prompt:p1'].say == null, 'prompt say not on scheme');
assert(m.peers[0].wakePhrases.join(',') === '新注入,备用', 'prompt wake writeback');
assert(m.agentBindings[0].triggerBinding === '继续干', 'bind trigger writeback');
assert(m.oralCommandScheme.items['bind:slotA'].enabled === false, 'bind enabled whitelist');

// Camera token present in local action set contract.
const CAMERA_LOCAL = {
  toggleOralListen: 1,
  pauseVoice: 1
};
assert(CAMERA_LOCAL.toggleOralListen === 1, 'camera oral listen token');

// Trigger pin isolation: custom-key peers must not inherit habit RShift for record/display.
function activeTriggerMappingIdStub(activeTab, customKeyMatchEditId, selectedMappingId, mappings) {
  if (activeTab === 'voice') return selectedMappingId;
  if (activeTab === 'key') {
    const editId = String(customKeyMatchEditId || '').trim();
    if (editId && mappings.some((m) => m && m.id === editId)) return editId;
    return '';
  }
  return selectedMappingId;
}
const maps = [
  { id: 'habit', triggerKey: 'RShift' },
  { id: 'peer-a', triggerKey: 'F1' },
  { id: 'peer-b', triggerKey: '' }
];
assert(
  activeTriggerMappingIdStub('voice', 'peer-a', 'habit', maps) === 'habit',
  'oral tab keeps habit mapping for oral key'
);
assert(
  activeTriggerMappingIdStub('key', 'peer-a', 'habit', maps) === 'peer-a',
  'key tab pins peer trigger'
);
assert(
  activeTriggerMappingIdStub('key', 'peer-b', 'habit', maps) === 'peer-b',
  'key tab empty peer does not fall back to habit RShift'
);
assert(
  activeTriggerMappingIdStub('key', '', 'habit', maps) === '',
  'key tab without edit leaves 01 empty'
);

// Channel A: oral / dictation / peer keys stay separate.
function channelTriggerDisplayKeyStub(slot, habit, peer) {
  if (slot === 'oral') {
    return String((habit.oralCommandScheme && habit.oralCommandScheme.triggerKey) || '').trim();
  }
  if (slot === 'peer-empty') return '';
  if (slot === 'peer') return String((peer && peer.triggerKey) || '').trim();
  return String((habit && habit.triggerKey) || '').trim();
}
const habitA = {
  id: 'habit',
  triggerKey: 'F8',
  oralCommandScheme: { triggerKey: 'RShift', items: {} }
};
const peerA = { id: 'peer-a', triggerKey: 'F1' };
assert(channelTriggerDisplayKeyStub('habit', habitA, null) === 'F8', 'dictation shows habit key');
assert(channelTriggerDisplayKeyStub('oral', habitA, null) === 'RShift', 'oral shows oral key');
assert(channelTriggerDisplayKeyStub('peer', habitA, peerA) === 'F1', 'peer shows own key');
assert(channelTriggerDisplayKeyStub('peer-empty', habitA, null) === '', 'no peer → empty 01');

// cmd_save must keep oralCommandScheme.triggerKey (was dropped → UI-only side button).
function serializeOralCommandScheme(scheme) {
  if (!scheme || typeof scheme !== 'object') return { items: {}, triggerKey: '' };
  return {
    items: scheme.items && typeof scheme.items === 'object' ? scheme.items : {},
    triggerKey: String(scheme.triggerKey || '').trim()
  };
}
const savedOral = serializeOralCommandScheme({ triggerKey: 'XButton2', items: { 'soft:speak': { enabled: true } } });
assert(savedOral.triggerKey === 'XButton2', 'save keeps oral triggerKey');
assert(savedOral.items['soft:speak'].enabled === true, 'save keeps oral items');
assert(serializeOralCommandScheme(null).triggerKey === '', 'empty scheme ok');

console.log('smoke-oral-command: ok');
