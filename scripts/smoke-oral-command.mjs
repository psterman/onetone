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

// Legacy migrate must not copy 听写→口头; equal keys heal to unset.
function migrateLegacyOralGestureStub(m) {
  var scheme = m.oralCommandScheme || (m.oralCommandScheme = { items: {}, triggerKey: '' });
  var oralRaw = String(scheme.triggerKey || '').trim();
  var habitRaw = String(m.triggerKey || '').trim();
  var changed = false;
  if (oralRaw && habitRaw && oralRaw === habitRaw) {
    scheme.triggerKey = '';
    changed = true;
  }
  return changed;
}
const polluted = { triggerKey: 'RShift', oralCommandScheme: { triggerKey: 'RShift', items: {} } };
assert(migrateLegacyOralGestureStub(polluted) === true, 'equal oral/dictation heals');
assert(polluted.oralCommandScheme.triggerKey === '', 'oral cleared when equal to dictation');
assert(polluted.triggerKey === 'RShift', 'dictation key untouched');
const separate = { triggerKey: 'RShift', oralCommandScheme: { triggerKey: 'XButton1', items: {} } };
assert(migrateLegacyOralGestureStub(separate) === false, 'distinct oral key kept');
assert(separate.oralCommandScheme.triggerKey === 'XButton1', 'oral stays independent');

// cmd_save must keep oralCommandScheme.triggerKey + activationMode
// (triggerKey drop → UI-only side button; activationMode drop → toggle resets to hold).
function serializeOralCommandScheme(scheme) {
  if (!scheme || typeof scheme !== 'object') {
    return { items: {}, triggerKey: '', activationMode: 'hold' };
  }
  var mode = String(scheme.activationMode || '')
    .trim()
    .toLowerCase();
  if (mode !== 'hold' && mode !== 'toggle') mode = 'hold';
  return {
    items: scheme.items && typeof scheme.items === 'object' ? scheme.items : {},
    triggerKey: String(scheme.triggerKey || '').trim(),
    activationMode: mode
  };
}
const savedOral = serializeOralCommandScheme({
  triggerKey: 'XButton2',
  activationMode: 'toggle',
  items: { 'soft:speak': { enabled: true } }
});
assert(savedOral.triggerKey === 'XButton2', 'save keeps oral triggerKey');
assert(savedOral.activationMode === 'toggle', 'save keeps activationMode toggle');
assert(savedOral.items['soft:speak'].enabled === true, 'save keeps oral items');
assert(serializeOralCommandScheme(null).triggerKey === '', 'empty scheme ok');
assert(serializeOralCommandScheme(null).activationMode === 'hold', 'empty scheme defaults hold');
assert(
  serializeOralCommandScheme({ triggerKey: 'F13', items: {} }).activationMode === 'hold',
  'missing activationMode defaults hold'
);
assert(
  serializeOralCommandScheme({ triggerKey: 'F13', activationMode: 'weird' }).activationMode ===
    'hold',
  'unknown activationMode falls back to hold'
);
// Second save must not wipe toggle (other settings edit path).
const again = serializeOralCommandScheme({
  ...savedOral,
  items: { ...savedOral.items, 'soft:cancel': { enabled: true } }
});
assert(again.activationMode === 'toggle', 'resave keeps toggle');

// Voice settings left-rail「起点」follows intent (wake phrase vs oral arm key).
function resolveStartKindStub(intent, oralKey) {
  if (String(intent || '') === 'oral') return oralKey ? 'oral' : 'oral-unset';
  return 'wake';
}
assert(resolveStartKindStub('ime', 'X2') === 'wake', 'ime start stays wake phrase');
assert(resolveStartKindStub('prompt', '') === 'wake', 'prompt start stays wake phrase');
assert(resolveStartKindStub('oral', 'X2') === 'oral', 'oral start uses arm key');
assert(resolveStartKindStub('oral', '') === 'oral-unset', 'oral without key is unset');

// Multi-phrase voice bind: any token matches (oral arm hears「保存」from「保存、另存」).
function voiceBindPhraseMatchStub(heard, triggerBinding) {
  const text = String(heard || '').trim();
  const raw = String(triggerBinding || '').trim();
  if (!text || !raw) return false;
  if (text === raw) return true;
  return raw
    .split(/[、,，;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .some((p) => p === text);
}
assert(voiceBindPhraseMatchStub('保存', '保存、另存'), 'split voice bind matches first token');
assert(voiceBindPhraseMatchStub('另存', '保存、另存'), 'split voice bind matches second token');
assert(!voiceBindPhraseMatchStub('发送', '保存、另存'), 'unrelated phrase no match');

console.log('smoke-oral-command: ok');
