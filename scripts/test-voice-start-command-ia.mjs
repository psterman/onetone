/**
 * Wake is prefix; command intents show scheme command words in start + match chain.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const cfg = {
  mappings: [
    {
      id: 'app-cursor',
      group: 'Cursor',
      appTargetId: 'cursor-chat',
      agentBindings: [
        { triggerType: 'voice', triggerBinding: '保存', enabled: true, slotId: 'save' }
      ]
    }
  ]
};

const els = {};
function makeEl(id) {
  return {
    id,
    textContent: '',
    hidden: false,
    title: '',
    classList: {
      _c: new Set(),
      add(c) { this._c.add(c); },
      remove(c) { this._c.delete(c); },
      toggle(c, on) { if (on) this._c.add(c); else this._c.delete(c); }
    },
    setAttribute(k, v) { this[k] = v; },
    getAttribute(k) { return this[k]; },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    addEventListener() {},
    removeEventListener() {}
  };
}

[
  'voiceFlowNodeWakeVal', 'voiceFlowNodeFinishVal', 'voiceMatchChainLead',
  'voiceMatchChainWake', 'voiceMatchChainWakeArr', 'voiceMatchChainPhrase',
  'voiceMatchChainIntent', 'voiceMatchChain', 'voiceIntentStartSlim',
  'voiceIntentStartBadge', 'voiceIntentStartTitle', 'voiceIntentStartPrefix',
  'voiceIntentStartHint', 'btnVoiceIntentStartPhrase', 'voiceIntentStartPhraseText',
  'voicePromptArmed', 'voicePromptLand', 'voicePromptInjectBody', 'voicePromptTitle',
  'voiceIntentRail'
].forEach((id) => { els[id] = makeEl(id); });

const context = {
  console,
  document: {
    getElementById(id) { return els[id] || null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {}
  },
  localStorage: { getItem() { return null; }, setItem() {} },
  setTimeout,
  clearTimeout,
  OneToneDom: { $(id) { return els[id] || null; }, esc: (s) => String(s || '') },
  OneToneI18n: { t: (k, fb) => fb || k },
  OneToneState: {
    state: { config: cfg, selectedMappingId: 'app-cursor' },
    ui: { voiceEditSchemeId: 'app-cursor', settingsPanel: 'voiceWake' }
  },
  OneToneMappingCore: {
    byId(id) { return cfg.mappings.find((m) => m.id === id) || null; },
    selected() { return cfg.mappings[0]; }
  },
  OneToneVoicePageHeaderRender: {
    resolveScopeMapping() { return cfg.mappings[0]; }
  },
  OneToneVoiceSettingsViewModel: {
    build() { return {}; },
    resolveDisplayWakePhrase() { return { display: '一声' }; }
  },
  OneToneVoiceWake: {
    primaryWakePhraseDisplay() { return '一声'; }
  }
};
context.addEventListener = function () {};
context.removeEventListener = function () {};
context.globalThis = context;
context.window = context;
context.global = context;
vm.createContext(context);

vm.runInContext(
  readFileSync(new URL('../src/js/features/voice/voice-intent-rail.js', import.meta.url), 'utf8'),
  context,
  { filename: 'voice-intent-rail.js' }
);

const Rail = context.OneToneVoiceIntentRail;
assert.ok(Rail);

const ime = Rail.resolveStartSurface('ime');
assert.equal(ime.kind, 'wake');
assert.equal(ime.chainPhrase, '一声');
assert.equal(ime.chainWake, '');

const key = Rail.resolveStartSurface('key');
assert.equal(key.kind, 'command');
assert.equal(key.display, '保存');
assert.equal(key.chainWake, '一声');
assert.equal(key.chainPhrase, '保存');
assert.match(key.prefix, /一声/);

context.__vp_voice_intent__ = 'key';
Rail.syncHeroVals();
assert.equal(els.voiceMatchChainWake.hidden, false);
assert.match(els.voiceMatchChainWake.textContent, /一声/);
assert.match(els.voiceMatchChainPhrase.textContent, /保存/);
assert.equal(els.voiceMatchChainIntent.textContent, '自定义快捷键');
assert.equal(els.voiceIntentStartSlim['data-start-kind'], 'command');
assert.match(els.voiceIntentStartPhraseText.textContent, /保存/);
assert.equal(els.voiceIntentStartPrefix.hidden, false);

console.log('[voice-start-command-ia] all checks passed');
process.exit(0);
