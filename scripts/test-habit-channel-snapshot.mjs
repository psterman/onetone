import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const context = {
  console,
  OneToneSceneConfig: {
    globalWakePhrases: () => ['你好'],
    globalEndPhrases: () => ({ zh: ['结束'], en: ['done'] }),
    globalVoiceTargetKey: () => 'RAlt'
  },
  OneToneVoiceWake: { currentMode: () => 'vosk' },
  OneToneAppBehaviorRules: {
    isIncompleteCustomStub(m) {
      if (!m) return false;
      if (String(m.appTargetId || '').trim() !== 'custom') return false;
      const rules = Array.isArray(m.appBehaviorRules) ? m.appBehaviorRules : [];
      return !rules.some((r) => r && r.match && (
        (Array.isArray(r.match.exeNames) && r.match.exeNames.length) ||
        String(r.match.fullPath || '').trim()
      ));
    },
    appDisplayName(id) {
      if (id === 'cursor-chat') return 'Cursor';
      return id;
    }
  },
  OneToneMappingCore: {
    byId(id) {
      const mappings = context.__cfg.mappings || [];
      return mappings.find((m) => m && m.id === id) || null;
    }
  }
};
context.globalThis = context;
context.window = context;
vm.createContext(context);

vm.runInContext(readFileSync('src/js/core/habit-override-diff.js', 'utf8'), context);
vm.runInContext(readFileSync('src/js/features/mapping/habit-channel-snapshot.js', 'utf8'), context);

const Diff = context.OneToneHabitOverrideDiff;
const Snap = context.OneToneHabitChannelSnapshot;

const baseline = {
  id: 'base',
  group: '通用设置',
  enabled: true,
  triggerKey: 'F8',
  targetKey: 'RAlt',
  autoEnterEnabled: true,
  cancelEnabled: true
};

function cfgWith(extra) {
  const mappings = [baseline].concat(extra || []);
  context.__cfg = {
    activeSceneId: 'base',
    mappings,
    cameraPrefs: {
      presenceActions: {
        enabled: true,
        triggers: { away: true, blink: true, shake: false, fist: false, openPalm: false, okHand: false, wave: false },
        onAway: 'pressEsc',
        onReturn: 'none',
        deliberateBlink: 'pressCtrlI',
        shakeHead: 'none',
        fist: 'none',
        openPalm: 'none',
        okHand: 'none',
        wave: 'none'
      }
    }
  };
  return context.__cfg;
}

// --- camera override false covers global true ---
{
  const cfg = cfgWith([]);
  const m = { id: 'c1', cameraOverride: { triggers: { blink: false } } };
  const p = Diff.getEffectiveCameraPresence(m, cfg);
  assert.equal(p.triggers.blink, false);
  assert.equal(p.inheritedTriggers.blink, false);
  assert.equal(p.triggers.away, true);
  assert.equal(p.inheritedTriggers.away, true);
}

// --- raw empty + baseline complete → ready (not attention) ---
{
  const cfg = cfgWith([]);
  const app = {
    id: 'app-1',
    appTargetId: 'cursor-chat',
    group: 'Cursor',
    enabled: true,
    triggerKey: '',
    targetKey: ''
  };
  cfg.mappings.push(app);
  const snap = Snap.make(app, cfg, 'zh');
  assert.equal(snap.channels.key.tone, 'ready');
  assert.ok(snap.channels.key.actions.some((a) => a.id === 'keys.trigger' && a.inherited));
  assert.ok(snap.channels.key.actions.some((a) => a.id === 'keys.target' && a.inherited));
}

// --- effective still missing → attention ---
{
  const cfg = cfgWith([]);
  cfg.mappings[0].triggerKey = '';
  cfg.mappings[0].targetKey = '';
  const app = {
    id: 'app-2',
    appTargetId: 'cursor-chat',
    enabled: true,
    triggerKey: '',
    targetKey: ''
  };
  cfg.mappings.push(app);
  const snap = Snap.make(app, cfg, 'zh');
  assert.equal(snap.channels.key.tone, 'attention');
  // restore baseline for later tests
  cfg.mappings[0].triggerKey = 'F8';
  cfg.mappings[0].targetKey = 'RAlt';
}

// --- disabled → four channels idle ---
{
  const cfg = cfgWith([]);
  const app = {
    id: 'app-off',
    appTargetId: 'cursor-chat',
    enabled: false,
    triggerKey: 'F9',
    targetKey: 'Enter',
    voiceOverride: { wakePhrases: ['开始'] },
    cameraOverride: { triggers: { blink: true } },
    codexMicroPad: { enabled: true, keys: [{ id: '1', slotId: 'semantic:softPad:x', microKeyId: 'ACT10', enabled: true }] }
  };
  const snap = Snap.make(app, cfg, 'zh');
  assert.equal(snap.channels.key.tone, 'idle');
  assert.equal(snap.channels.voice.tone, 'idle');
  assert.equal(snap.channels.cam.tone, 'idle');
  assert.equal(snap.channels.pad.tone, 'idle');
}

// --- Soft Pad excludes disabled / unbound ---
{
  const cfg = cfgWith([]);
  const app = {
    id: 'app-pad',
    appTargetId: 'cursor-chat',
    enabled: true,
    codexMicroPad: {
      enabled: true,
      keys: [
        { id: 'a', slotId: 'semantic:softPad:a', microKeyId: 'ACT10', enabled: true },
        { id: 'b', slotId: 'semantic:softPad:b', microKeyId: 'ACT11', enabled: false },
        { id: 'c', microKeyId: 'ACT12', enabled: true },
        { id: 'd', slotId: '', microKeyId: 'ACT13', enabled: true }
      ]
    }
  };
  const snap = Snap.make(app, cfg, 'zh');
  assert.equal(snap.channels.pad.actions.length, 1);
  assert.equal(snap.channels.pad.actions[0].key, 'ACT10');
  assert.equal(Snap.padBoundKeys(app).length, 1);
}

// --- incomplete stub filtered; process-rule without appTargetId ≠ global ---
{
  const stub = { id: 'stub', appTargetId: 'custom', enabled: true, appBehaviorRules: [] };
  const orphan = {
    id: 'orphan',
    enabled: true,
    appBehaviorRules: [{ appId: 'custom', match: { exeNames: ['Cursor.exe'] } }]
  };
  const cfg = cfgWith([stub, orphan]);
  const groups = Snap.habitLocatorGroups(cfg.mappings, cfg, 'zh');
  assert.ok(!groups.some((g) => g.schemes.some((s) => s.id === 'stub')));
  const orphanGroup = groups.find((g) => g.schemes.some((s) => s.id === 'orphan'));
  assert.ok(orphanGroup);
  assert.notEqual(orphanGroup.scope, 'global');
  const globalGroup = groups.find((g) => g.scope === 'global');
  assert.ok(globalGroup);
  assert.ok(globalGroup.schemes.every((s) => s.id === 'base'));
}

// --- pickSchemeInGroup priority ---
{
  const schemes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(Snap.pickSchemeInGroup(schemes, 'b', 'c').id, 'b');
  assert.equal(Snap.pickSchemeInGroup(schemes, 'missing', 'c').id, 'c');
  assert.equal(Snap.pickSchemeInGroup(schemes, 'x', 'y').id, 'a');
}

// --- channel map + focus ---
{
  assert.equal(Snap.editorChannelId('cam'), 'camera');
  assert.equal(Snap.editorChannelId('pad'), 'softPad');
  assert.equal(Snap.editorChannelId('key'), 'key');
  assert.equal(Snap.editorChannelId('voice'), 'voice');
  assert.equal(Snap.focusIdForAction('key', 'keys.trigger'), 'trigger');
  assert.equal(Snap.focusIdForAction('key', 'keys.finish'), 'keyFinishFlow');
  assert.equal(Snap.focusIdForAction('voice', 'voice.wake.0'), 'wakePhrases');
  assert.equal(Snap.focusIdForAction('cam', 'cam.blink'), 'cameraPresence');
  assert.equal(Snap.focusIdForAction('pad', 'pad.1'), 'softPadLayout');
}

// --- configuredActionCount excludes muted ---
{
  const cfg = cfgWith([]);
  const app = {
    id: 'app-count',
    appTargetId: 'cursor-chat',
    enabled: true,
    triggerKey: '',
    targetKey: '',
    voiceOverride: null
  };
  cfg.mappings.push(app);
  const snap = Snap.make(app, cfg, 'zh');
  // keys: trigger+target+finish all inherited/muted → 0 from keys; voice inherit muted → 0
  const unmuted = ['key', 'voice', 'cam', 'pad'].reduce((n, id) => {
    return n + snap.channels[id].actions.filter((a) => !a.muted).length;
  }, 0);
  assert.equal(snap.configuredActionCount, unmuted);
  assert.equal(snap.channels.key.actions.filter((a) => !a.muted).length, 0);
}

// --- inherited camera still counts when unmuted? Plan: inherited camera WITH valid trigger counts if not muted.
// We mark inherited triggers as muted — so inherited camera does NOT count. Explicit override does.
{
  const cfg = cfgWith([]);
  const inheritedCam = Snap.make({ id: 'x', appTargetId: 'cursor-chat', enabled: true }, cfg, 'zh');
  // global has blink+away on → actions exist but muted (inherited)
  assert.ok(inheritedCam.channels.cam.actions.length > 0);
  assert.ok(inheritedCam.channels.cam.actions.every((a) => a.muted));
  const localCam = Snap.make({
    id: 'y',
    appTargetId: 'cursor-chat',
    enabled: true,
    cameraOverride: { triggers: { blink: true }, deliberateBlink: 'pressCtrlI' }
  }, cfg, 'zh');
  assert.ok(localCam.channels.cam.actions.some((a) => a.id === 'cam.blink' && !a.muted));
}

console.log('test-habit-channel-snapshot: ok');
