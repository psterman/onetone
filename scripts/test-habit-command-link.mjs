/**
 * Freeze-contract smoke: OneToneHabitCommandLink projection + L7/L3 writes + deeplink + keys2 RO + seal.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => readFileSync(join(root, rel), 'utf8');

let saves = 0;
const mapping = {
  id: 'habit-a',
  enabled: true,
  agentBindings: [
    {
      slotId: 'semantic:voice:continueReply',
      actionId: 'continueReply',
      triggerType: 'voice',
      triggerBinding: '继续',
      enabled: true
    },
    {
      slotId: 'semantic:key:continueReply',
      actionId: 'continueReply',
      triggerType: 'key',
      triggerBinding: 'Vol-',
      enabled: true
    }
  ],
  oralCommandScheme: {
    items: {
      'bind:semantic:voice:continueReply': { enabled: true, say: '继续、接着写', sort: 0 },
      'soft:send': { enabled: true, say: '发送', sort: 1 }
    }
  },
  codexMicroPad: {
    enabled: true,
    keys: [{ microKeyId: 'AG02', slotId: 'semantic:softPad:continueReply', enabled: true }]
  },
  cameraOverride: { okHand: 'agent:continueReply' }
};

const context = {
  console,
  Promise,
  OneToneState: {
    state: { config: { mappings: [mapping], activeSceneId: 'other' }, selectedMappingId: 'habit-a' },
    ui: {}
  },
  OneToneMappingCore: {
    byId(id) {
      return context.OneToneState.state.config.mappings.find((m) => m && m.id === id) || null;
    }
  },
  OneToneConfigPersist: {
    ensureConfig() {},
    save() {
      saves++;
    },
    saveAsync() {
      saves++;
      return Promise.resolve(true);
    }
  },
  OneToneOralCommandUi: {
    ORAL_SOFT_SLOTS: [
      { id: 'soft:send', name: '发送', auto: '发送', core: true },
      { id: 'soft:stopOrSend', slotId: 'stopOrSend', microKeyId: 'ACT12', name: '发送' },
      { id: 'soft:continue', slotId: 'continue', microKeyId: 'AG02', name: '继续' },
      { id: 'soft:newThread', slotId: 'newThread', microKeyId: 'AG01', name: '新建对话' },
      { id: 'soft:pushToTalk', slotId: 'pushToTalk', microKeyId: 'ACT10', name: '说话' },
      { id: 'soft:cancelListen', slotId: 'cancelListen', microKeyId: 'ACT08', name: '取消' }
    ],
    tokenizeOralSay(v) {
      return String(v || '')
        .split(/[、,，;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    },
    persistOralScheme(m, items) {
      if (!m.oralCommandScheme) m.oralCommandScheme = { items: {} };
      m.oralCommandScheme.items = items;
    }
  },
  OneToneAgentActions: {
    resolveCanonicalActionId(id) {
      return String(id || '').trim();
    },
    labelForActionId(id) {
      return id === 'continueReply' ? '继续回复' : String(id || '');
    }
  },
  OneToneActionBindingAdapters: {
    softPad: {
      upsert(mappingId, actionId, trigger, bindingRef) {
        const m = context.OneToneMappingCore.byId(mappingId);
        if (!m) return Promise.reject(new Error('no_mapping'));
        m.agentBindings = m.agentBindings || [];
        const micro =
          (trigger && typeof trigger === 'object' && trigger.microKeyId) ||
          (typeof trigger === 'string' ? trigger : '');
        let hit = m.agentBindings.find(
          (b) => b && b.triggerType === 'softPad' && (b.slotId === bindingRef || b.actionId === actionId)
        );
        if (!hit) {
          hit = {
            slotId: bindingRef || 'semantic:softPad:' + actionId,
            actionId,
            triggerType: 'softPad',
            triggerBinding: micro,
            enabled: true
          };
          m.agentBindings.push(hit);
        } else {
          hit.triggerBinding = micro;
          hit.enabled = true;
        }
        return Promise.resolve({ slotId: hit.slotId });
      }
    }
  },
  document: {
    getElementById() {
      return null;
    },
    createElement() {
      return { style: {}, setAttribute() {}, appendChild() {} };
    },
    body: { appendChild() {} }
  }
};
context.globalThis = context;
context.window = context;
vm.createContext(context);
vm.runInContext(src('src/js/features/mapping/habit-command-link.js'), context);

const Api = context.OneToneHabitCommandLink;
assert.ok(Api, 'OneToneHabitCommandLink exported');
assert.equal(typeof Api.buildModel, 'function');
assert.equal(typeof Api.commandIdentity, 'function');
assert.equal(typeof Api.setCommandPhrase, 'function');
assert.equal(typeof Api.removeCommandPhrase, 'function');
assert.equal(typeof Api.setSoftPadBinding, 'function');
assert.equal(typeof Api.applyMatchDeepLink, 'function');

// --- proj-api: buildModel ---
const model = Api.buildModel(mapping);
assert.equal(model.mappingId, 'habit-a');
assert.ok(model.commands.length >= 2, 'commands projected');
assert.ok(model.entry && model.entry.triggerKey, 'entry zone model');
const cont = model.commands.find((c) => c.actionId === 'continueReply' || /continueReply/.test(c.slotId));
assert.ok(cont, 'continueReply command present');
assert.equal(cont.oral.enabled, true);
assert.ok(String(cont.oral.say).includes('继续'));
assert.equal(cont.key.enabled, true);
assert.equal(cont.key.chord, 'Vol-');
assert.equal(cont.pad.enabled, true);
assert.equal(cont.pad.microKeyId, 'AG02');
assert.equal(cont.gesture.enabled, true);
assert.ok(cont.channels, 'channels state machine');
assert.equal(cont.channels.voice.state, 'bound');
assert.equal(cont.channels.voice.action, 'edit');
assert.equal(cont.channels.key.state, 'bound');
assert.equal(cont.channels.key.action, 'record');
assert.equal(cont.channels.pad.state, 'bound');
assert.equal(cont.channels.pad.action, 'bind-pad');
assert.equal(cont.commandRef, Api.commandIdentity(cont));
assert.equal(cont.category, 'agent', 'continueReply category fallback → agent');

const soft = model.commands.find((c) => c.slotId === 'soft:send');
assert.ok(soft && soft.oral.enabled && soft.oral.say === '发送', 'soft oral slot projected');
assert.equal(soft.category, 'input', 'soft:send → input');

const softNtMap = {
  id: 'habit-soft-cat',
  agentBindings: [],
  oralCommandScheme: {
    items: {
      'soft:newThread': { enabled: true, say: '新建', sort: 0 },
      'soft:continue': { enabled: true, say: '继续', sort: 1 }
    }
  },
  codexMicroPad: {
    keys: [
      { microKeyId: 'AG01', slotId: 'newThread', enabled: true },
      { microKeyId: 'AG02', slotId: 'continue', enabled: true }
    ]
  },
  cameraOverride: {}
};
const softCat = Api.buildModel(softNtMap);
const softNt = softCat.commands.find((c) => c.slotId === 'soft:newThread');
assert.ok(softNt && softNt.oral.enabled && softNt.pad.enabled, 'soft:newThread merges pad');
assert.equal(softNt.category, 'session', 'soft:newThread → session');
const softCont = softCat.commands.find((c) => c.slotId === 'soft:continue');
assert.ok(softCont && softCont.pad.microKeyId === 'AG02', 'soft:continue merges pad');
assert.equal(softCont.category, 'agent', 'soft:continue → agent');
assert.ok(!softCat.commands.some((c) => c.slotId === 'newThread'), 'no bare newThread duplicate');
const matrixSoft = Api.renderMatrixHtml(softNtMap);
assert.ok(!/<span class="hcl-meta">[^<]*(soft:|action:)/.test(matrixSoft), 'list meta has no raw ids');
assert.ok(/hcl-ch/.test(matrixSoft) && /hcl-ch-ico/.test(matrixSoft), 'list uses channel icon chips');
assert.ok(!/<span class="hcl-ch-lab">/.test(matrixSoft), 'channel chips are icon-only');
assert.ok(softNt.capabilityKind === 'softPad', 'soft:newThread kind = softPad (B)');
assert.ok(softCont.capabilityKind === 'softPad', 'soft:continue kind = softPad (B)');
const viewKindMap = {
  id: 'kind-view',
  agentBindings: [
    {
      slotId: 'semantic:voice:status',
      actionId: 'status',
      triggerType: 'voice',
      triggerBinding: '查看状态',
      enabled: true
    },
    {
      slotId: 'semantic:key:plan',
      actionId: 'plan',
      triggerType: 'key',
      triggerBinding: 'Ctrl+Alt+Shift+P',
      enabled: true
    },
    {
      slotId: 'semantic:voice:continueReply',
      actionId: 'continueReply',
      triggerType: 'voice',
      triggerBinding: '继续',
      enabled: true
    },
    {
      slotId: 'semantic:key:openTerminal',
      actionId: 'openTerminal',
      triggerType: 'key',
      triggerBinding: 'Ctrl+`',
      enabled: true
    },
    {
      slotId: 'semantic:voice:startDictation',
      actionId: 'startDictation',
      triggerType: 'voice',
      triggerBinding: '开麦',
      enabled: true
    }
  ],
  oralCommandScheme: { items: {} },
  codexMicroPad: { keys: [] },
  cameraOverride: {}
};
context.OneToneAgentActions.actionById = function (id) {
  if (id === 'status' || id === 'plan') return { id: id, mode: 'insertOnly', labelZh: id };
  if (id === 'continueReply') return { id: id, mode: 'execute', labelZh: '继续回复' };
  if (id === 'openTerminal') return { id: id, mode: 'execute', labelZh: '打开终端' };
  if (id === 'startDictation') return { id: id, mode: 'execute', labelZh: '开始听写' };
  return null;
};
const kinds = Api.buildModel(viewKindMap);
assert.equal(kinds.commands.find((c) => c.actionId === 'status').capabilityKind, 'slash');
assert.equal(kinds.commands.find((c) => c.actionId === 'plan').capabilityKind, 'cursorKey');
assert.equal(kinds.commands.find((c) => c.actionId === 'plan').cursorKeyFamily, 'agentMode');
assert.equal(kinds.commands.find((c) => c.actionId === 'continueReply').capabilityKind, 'talk');
assert.equal(kinds.commands.find((c) => c.actionId === 'openTerminal').capabilityKind, 'cursorKey');
assert.equal(kinds.commands.find((c) => c.actionId === 'openTerminal').cursorKeyFamily, 'editorShell');
context.OneToneState.ui.habitMatchCommand = 'action:continueReply';
const agentHtml = Api.renderMatrixHtml(viewKindMap);
assert.ok(/data-cat="chat"/.test(agentHtml) && /对话中/.test(agentHtml), 'scene: chat');
assert.ok(/data-cat="agent"/.test(agentHtml) && /控 Agent/.test(agentHtml), 'scene: agent');
assert.ok(/data-cat="dictate"/.test(agentHtml) && /听写/.test(agentHtml), 'scene: dictate');
assert.ok(/data-hcl-search/.test(agentHtml) && /data-hcl-ch-filter/.test(agentHtml), 'search + channel chips');
assert.ok(!/data-cat="slash"/.test(agentHtml) && !/data-cat="softPad"/.test(agentHtml), 'no modality top folders');
assert.ok(!/data-cat="mode"/.test(agentHtml) && !/data-cat="extra"/.test(agentHtml), 'old Cursor buckets gone');
assert.ok(!/在 Cursor 操作|听写与发送|推进对话/.test(agentHtml), 'old job-folder labels gone');
assert.ok(!/控制当前 Agent/.test(agentHtml), 'no fat agent accordion');
assert.ok(/<details class="hcl-acc hcl-sec" data-cat="chat"[^>]* open/.test(agentHtml), 'deep-link opens chat section only');
assert.ok(/is-focus/.test(agentHtml), 'deep-link focuses continueReply row');
assert.ok(!/<details class="hcl-acc hcl-sec" data-cat="agent"[^>]* open/.test(agentHtml), 'sibling sections stay closed');
const agentBlock = agentHtml.match(/<details class="hcl-acc hcl-sec" data-cat="agent"[\s\S]*?<\/details>/);
assert.ok(agentBlock && /plan|status|查看/.test(agentBlock[0]), 'agent holds plan/slash');
const findBlock = agentHtml.match(/<details class="hcl-acc hcl-sec" data-cat="find"[\s\S]*?<\/details>/);
assert.ok(findBlock && /openTerminal|终端/.test(findBlock[0]), 'find holds terminal');
assert.ok(!/hcl-kind/.test(agentHtml), 'no capability kind badge on rows');
assert.ok(!/title="action:/.test(agentHtml), 'no raw action: title tooltip');
assert.ok(/hcl-row is-focus/.test(agentHtml), 'deep-link focuses continueReply row');
assert.ok(/hcl-edit-card/.test(agentHtml), 'selected command opens right edit card');
assert.ok(/hcl-lane voice/.test(agentHtml) && /hcl-lane key/.test(agentHtml), 'four channel lanes');
assert.ok(/hcl-chs/.test(agentHtml), 'list rows show channel icons');
assert.ok(/stroke="currentColor"/.test(agentHtml), 'channel icons are stroke like left nav');
assert.ok(/M8 6h13/.test(agentHtml), 'all = list (nav twin)');
assert.ok(/M12 1a3 3 0 0 0-3 3v8/.test(agentHtml), 'voice = mic outline');
assert.ok(/rect x="4" y="3" width="16" height="18"/.test(agentHtml), 'pad = soft keyboard');
assert.ok(/M23 7l-7 5 7 5V7z/.test(agentHtml), 'cam = camcorder');
assert.ok(/rect x="2" y="6" width="20" height="12"/.test(agentHtml), 'key = keyboard');

delete context.OneToneState.ui.habitMatchCommand;
delete context.OneToneState.ui.habitListOpenSec;
const matrixClosed = Api.renderMatrixHtml(mapping);
assert.ok(/<details class="hcl-acc hcl-sec"/.test(matrixClosed), 'sections are accordion');
const openCount = (matrixClosed.match(/<details class="hcl-acc hcl-sec"[^>]* open/g) || []).length;
assert.equal(openCount, 1, 'default opens exactly one section');
assert.ok(!/hcl-edit-card/.test(matrixClosed), 'no edit card until pick');
assert.ok(/hcl-chs/.test(matrixClosed), 'idle list still shows channel icons');
assert.ok(/搜索或点选一条命令/.test(matrixClosed), 'empty detail until pick');
assert.ok(/hcl-chip/.test(matrixClosed) && /hcl-search/.test(matrixClosed), 'locate chrome');

context.OneToneState.ui.habitMatchCommand = cont.commandRef || 'action:continueReply';
const matrix = Api.renderMatrixHtml(mapping);
assert.ok(/class="hcl-acc hcl-sec"/.test(matrix) && /data-cat="chat"/.test(matrix), 'section markup');
assert.ok(!/hcl-add-ways/.test(matrix) && !/从动作库添加/.test(matrix), 'no add-source catalog');
assert.ok(/hcl-edit-card/.test(matrix), 'right panel edit card');
assert.ok(/data-hcl-phrase-input/.test(matrix), 'voice sayings input');
assert.ok(
  (/data-hcl-softpad-board|data-hcl-pad-pill=/.test(matrix) || /hcl-softpad-host|hcl-pad-row/.test(matrix)) &&
    /data-hcl-gest-pill=/.test(matrix),
  'pad board or pills + gesture pills'
);
assert.ok(/data-hcl-rec-key/.test(matrix), 'key local record control');
assert.ok(/点此录键|再录覆盖/.test(matrix), 'key record copy');
assert.ok(
  /hcl-softpad-host|habitSoftPadBoardHtml|hcl-pad-row|hcl-keycap-lab/.test(matrix) ||
    /habitSoftPadBoardHtml/.test(readFileSync(join(root, 'src/js/features/mapping/habit-command-link.js'), 'utf8')),
  'soft pad float board helper'
);
// With CodexMicroPadUi present → real mini board (not AG/ACT pills).
let lastPadOpts = null;
context.OneToneCodexMicroPadUi = {
  renderHardwarePad(_m, pad) {
    lastPadOpts = pad;
    return (
      '<div class="micro-hw-wrap"><div class="micro-hw-shell"><div class="micro-hw micro-hw--sm">' +
      '<div class="micro-hw__face"><div class="micro-hw__grid micro-hw__grid--no-nav">' +
      '<button type="button" class="micro-hw__key" data-micro-key="AG02" data-cap-name="继续" data-cap-chord="AG02">AG02</button>' +
      '</div></div></div></div></div>'
    );
  }
};
const boardMatrix = Api.renderMatrixHtml(mapping);
assert.ok(/data-hcl-softpad-board="1"/.test(boardMatrix), 'soft pad float board host');
assert.ok(/hcl-softpad-host/.test(boardMatrix) && /data-micro-key="AG02"/.test(boardMatrix), 'mini keyboard keys');
assert.ok(!/data-hcl-pad-pill=/.test(boardMatrix), 'board path skips AG/ACT pills');
assert.ok(/点键帽绑定/.test(boardMatrix) && /占位键需确认/.test(boardMatrix), 'board bind hint + steal confirm');
assert.ok(lastPadOpts && lastPadOpts.showNavigationPad === false, 'habit board hides NAV arrows');
assert.ok(/data-soft-pad-caption/.test(boardMatrix) && /悬停键帽看说明/.test(boardMatrix), 'key caption under board');
assert.ok(
  /hcl-softpad-host\{[^}]*background:transparent/.test(
    readFileSync(join(root, 'src/css/habit-workspace.css'), 'utf8')
  ),
  'no grey host chrome behind pad'
);
assert.ok(
  /decorateHabitPadBoard/.test(
    readFileSync(join(root, 'src/js/features/mapping/habit-command-link.js'), 'utf8')
  ) && /hcl-pk-lab/.test(readFileSync(join(root, 'src/css/habit-workspace.css'), 'utf8')),
  'pad key title + occupancy decorate'
);
assert.equal(typeof Api.confirmStealPadKey, 'function');
{
  let asked = 0;
  context.OneToneConfirm = {
    ask(msg) {
      asked += 1;
      assert.ok(/已占用此键/.test(String(msg || '')), 'steal confirm names occupancy');
      return Promise.resolve(false);
    }
  };
  const deny = await Api.confirmStealPadKey(
    mapping,
    'semantic:softPad:pasteSend',
    'AG02'
  );
  assert.equal(deny, false, 'steal denied');
  assert.equal(asked, 1, 'confirm asked once for taken key');
  asked = 0;
  const free = await Api.confirmStealPadKey(mapping, 'semantic:softPad:pasteSend', 'AG09');
  assert.equal(free, true, 'empty key skips confirm');
  assert.equal(asked, 0, 'no dialog for free key');
  const own = await Api.confirmStealPadKey(
    mapping,
    'semantic:softPad:continueReply',
    'AG02'
  );
  assert.equal(own, true, 'own key skips confirm');
  assert.equal(asked, 0, 'no dialog for own key');
  delete context.OneToneConfirm;
}
delete context.OneToneCodexMicroPadUi;
assert.ok(/本页改完即生效/.test(matrix), 'auto-write copy');
assert.equal(typeof Api.actionCtaLabel, 'function');
assert.equal(Api.actionCtaLabel('record', 'key'), '点此录键');
assert.equal(Api.actionCtaLabel('edit', 'voice'), '改说法');
assert.equal(Api.actionCtaLabel('bind-pad', 'softPad'), '选 Pad 键');
assert.equal(Api.actionCtaLabel('edit', 'camera'), '选手势');
assert.equal(typeof Api.setCommandKeyChord, 'function');
await Api.setCommandKeyChord(mapping, cont.commandRef || 'action:continueReply', 'F8');
const afterKey = Api.buildModel(mapping).commands.find((c) => c.actionId === 'continueReply');
assert.ok(afterKey && afterKey.key && afterKey.key.chord === 'F8', 'local key chord written');
await Api.setCommandKeyChord(mapping, cont.commandRef || 'action:continueReply', '');
const clearedKey = Api.buildModel(mapping).commands.find((c) => c.actionId === 'continueReply');
assert.ok(!(clearedKey && clearedKey.key && clearedKey.key.enabled && clearedKey.key.chord), 'local key chord cleared');

// selectedMappingId ≠ activeSceneId must not break projection
assert.notEqual(context.OneToneState.state.config.activeSceneId, mapping.id);
const model2 = Api.buildModel(mapping);
assert.equal(model2.mappingId, 'habit-a');

// --- l7-write ---
const beforeActive = context.OneToneState.state.config.activeSceneId;
await Api.setCommandPhrase(mapping, 'semantic:voice:continueReply', '继续, 往下写');
assert.equal(context.OneToneState.state.config.activeSceneId, beforeActive, 'L7 must not activateScene');
const say = mapping.oralCommandScheme.items['bind:semantic:voice:continueReply'].say;
assert.ok(say.includes('往下写'), 'oral items updated');
const voiceBind = mapping.agentBindings.find(
  (b) => b.triggerType === 'voice' && b.slotId === 'semantic:voice:continueReply'
);
assert.ok(voiceBind && String(voiceBind.triggerBinding).includes('往下写'), 'voice triggerBinding updated');

await Api.removeCommandPhrase(mapping, 'bind:semantic:voice:continueReply');
assert.ok(!mapping.oralCommandScheme.items['bind:semantic:voice:continueReply'], 'phrase item removed');
assert.ok(
  !mapping.agentBindings.some(
    (b) => b.triggerType === 'voice' && b.slotId === 'semantic:voice:continueReply'
  ),
  'voice binding removed'
);

// restore for pad tests
mapping.agentBindings.push({
  slotId: 'semantic:voice:continueReply',
  actionId: 'continueReply',
  triggerType: 'voice',
  triggerBinding: '继续',
  enabled: true
});
mapping.oralCommandScheme.items['bind:semantic:voice:continueReply'] = {
  enabled: true,
  say: '继续',
  sort: 0
};

// --- l3-write ---
await Api.setSoftPadBinding(mapping, 'semantic:softPad:pasteSend', 'AG03');
const padRoute = mapping.codexMicroPad.keys.find((k) => k.microKeyId === 'AG03');
assert.ok(padRoute && padRoute.slotId === 'semantic:softPad:pasteSend' && padRoute.enabled !== false);
const softBind = mapping.agentBindings.find(
  (b) => b.triggerType === 'softPad' && b.triggerBinding === 'AG03'
);
assert.ok(softBind, 'softPad agentBinding stamped');
// AG02 still on continue — clearing AG02 slot then rebind
await Api.setSoftPadBinding(mapping, 'semantic:softPad:continueReply', '');
assert.ok(
  !mapping.codexMicroPad.keys.some(
    (k) => k.enabled !== false && k.slotId === 'semantic:softPad:continueReply'
  ),
  'pad slot cleared'
);

// --- soft: Chinese labels (no raw soft:stopOrSend titles) ---
function looksLikeTech(s) {
  return /^(soft|prompt|action|semantic):/i.test(String(s || '')) || /^[a-z]+[A-Z]/.test(String(s || ''));
}
const softStopMap = {
  id: 'habit-soft-label',
  agentBindings: [],
  oralCommandScheme: {
    items: {
      'soft:stopOrSend': { enabled: true, say: '发送', sort: 0 }
    }
  },
  codexMicroPad: {
    keys: [{ microKeyId: 'AG04', slotId: 'soft:stopOrSend', enabled: true }]
  },
  cameraOverride: {}
};
const softStopModel = Api.buildModel(softStopMap);
const softStop = softStopModel.commands.find((c) => c.slotId === 'soft:stopOrSend');
assert.ok(softStop, 'soft:stopOrSend projected');
assert.equal(softStop.label, '发送', 'soft:stopOrSend label is Chinese 发送');
assert.ok(!looksLikeTech(softStop.label), 'label is not tech id');
const softDupMap = {
  id: 'habit-soft-merge',
  agentBindings: [],
  oralCommandScheme: {
    items: {
      'soft:stopOrSend': { enabled: true, say: '发送', sort: 0 }
    }
  },
  codexMicroPad: {
    keys: [{ microKeyId: 'AG04', slotId: 'semantic:softPad:stopOrSend', enabled: true }]
  },
  cameraOverride: {}
};
const softDup = Api.buildModel(softDupMap);
const softDupRows = softDup.commands.filter(
  (c) => c.slotId === 'soft:stopOrSend' || /stopOrSend/.test(String(c.slotId || c.actionId || ''))
);
assert.equal(softDupRows.length, 1, 'semantic softPad + soft: oral merge to one row');
assert.equal(softDupRows[0].label, '发送', 'merged soft row Chinese label');

// --- undo last Soft Pad bind ---
assert.equal(typeof Api.undoLastBind, 'function', 'undoLastBind exported');
const undoMap = {
  id: 'habit-undo',
  agentBindings: [
    {
      slotId: 'semantic:softPad:continueReply',
      actionId: 'continueReply',
      triggerType: 'softPad',
      triggerBinding: 'AG02',
      enabled: true
    }
  ],
  oralCommandScheme: { items: {} },
  codexMicroPad: {
    keys: [{ microKeyId: 'AG02', slotId: 'semantic:softPad:continueReply', enabled: true }]
  },
  cameraOverride: {}
};
context.OneToneState.state.config.mappings.push(undoMap);
await Api.setSoftPadBinding(undoMap, 'semantic:softPad:continueReply', 'AG05');
assert.ok(
  undoMap.codexMicroPad.keys.some((k) => k.microKeyId === 'AG05' && k.slotId === 'semantic:softPad:continueReply'),
  'pad rebound to AG05'
);
await Api.undoLastBind(null);
assert.ok(
  undoMap.codexMicroPad.keys.some(
    (k) => k.enabled !== false && k.microKeyId === 'AG02' && k.slotId === 'semantic:softPad:continueReply'
  ),
  'undo restores prior Soft Pad bind'
);
context.OneToneState.ui.habitMatchCommand = 'soft:stopOrSend';
const softEditHtml = Api.renderMatrixHtml(softStopMap);
assert.ok(/data-hcl-undo|撤销刚才/.test(softEditHtml) || /hcl-undo/.test(src('src/js/features/mapping/habit-command-link.js')), 'undo control wired');
delete context.OneToneState.ui.habitMatchCommand;

// CSS: Soft Pad larger + hero compressed
const hclCss = src('src/css/habit-workspace.css');
assert.ok(/280px/.test(hclCss) && /hcl-softpad-host/.test(hclCss), 'Soft Pad mini board enlarged');
assert.ok(/habit-locator-hero\{[^}]*padding:8px/.test(hclCss), 'locator hero padding compressed');
assert.ok(/hcl-undo/.test(hclCss), 'undo button style present');
const hubCss = src('src/css/app.css');
assert.ok(/habit-hub-hint\{[^}]*display:none/.test(hubCss), 'hub long hint hidden to free space');

// --- deeplink ---
Api.applyMatchDeepLink({
  mappingId: 'habit-a',
  matchChannel: 'voice',
  matchCommand: 'semantic:voice:continueReply',
  openMatchEditor: true,
  returnPanel: 'voiceWake'
});
assert.equal(context.OneToneState.state.selectedMappingId, 'habit-a');
assert.equal(context.OneToneState.ui.habitMatchChannel, 'voice');
assert.equal(context.OneToneState.ui.habitMatchCommand, 'semantic:voice:continueReply');
assert.equal(context.OneToneState.ui.habitOpenMatchEditor, true);
assert.equal(context.OneToneState.ui.habitMatchReturnPanel, 'voiceWake');
assert.equal(context.OneToneState.state.config.activeSceneId, beforeActive, 'deeplink must not activateScene');
const consumed = Api.consumeMatchDeepLink();
assert.equal(consumed.matchChannel, 'voice');
Api.clearMatchDeepLink();
assert.ok(!context.OneToneState.ui.habitMatchChannel);

// --- wiring / seal / keys2 RO (static) ---
assert.ok(existsSync(join(root, 'src/js/features/mapping/habit-command-link.js')));
const html = src('src/index.html');
assert.ok(html.includes('js/features/mapping/habit-command-link.js'), 'index loads habit-command-link');
const ws = src('src/js/features/mapping/habit-workspace.js');
assert.ok(ws.includes('habitCommandLinkMount'), 'workspace mounts match UI');
assert.ok(ws.includes('OneToneHabitCommandLink'), 'workspace paints via API');
const drawer = src('src/js/features/settings/settings-drawer.js');
assert.ok(drawer.includes('applyMatchDeepLink') || drawer.includes('habitMatchChannel'), 'drawer deeplink');
const scene = src('src/js/features/mapping/keys-scene-actions-panel.js');
assert.ok(scene.includes('openHabitsMatch') || scene.includes("panel: 'habits'"), 'native map CTA → habits');
assert.ok(!/openChannelMapSheet[\s\S]*panel:\s*['"]keys2['"]/.test(scene), 'channel map no longer opens keys2');

const keys2 = src('src/js/features/settings/keys2-command-card.js');
assert.ok(/READ_ONLY:\s*true/.test(keys2), 'keys2 READ_ONLY');
assert.ok(keys2.includes('buildModel'), 'keys2 reads buildModel');
assert.ok(keys2.includes('openHabitsMatch') || keys2.includes("panel: 'habits'"), 'keys2 edits → habits');
assert.ok(!/keys2BtnAddPhrase|keys2BtnRecordKey|data-k2-clear/.test(keys2), 'keys2 write controls gone');
assert.ok(!/OneToneConfigPersist|saveAsync|captureHeroRef\s*=/.test(keys2), 'keys2 has no persist writes');
assert.ok(
  !/agentBindings\.push|oralCommandScheme\s*=|codexMicroPad\s*=/.test(keys2),
  'keys2 does not touch mapping fields'
);

const css = src('src/css/habit-workspace.css');
assert.ok(css.includes('.hcl-hub') || css.includes('.hcl-panel'), 'hcl styles present');

// --- drift: L7/L3 must not touch K/V/P capability fields ---
mapping.triggerKey = 'F8';
mapping.targetKey = 'RAlt';
mapping.voiceOverride = { wakePhrases: ['你好助手'] };
mapping.codexMicroPad.layoutProfile = 'cursor-lane';
const snapKvp = JSON.stringify({
  triggerKey: mapping.triggerKey,
  targetKey: mapping.targetKey,
  wake: mapping.voiceOverride.wakePhrases.slice(),
  layout: mapping.codexMicroPad.layoutProfile,
  active: context.OneToneState.state.config.activeSceneId
});
await Api.setCommandPhrase(mapping, 'action:continueReply', '继续、再说');
await Api.setSoftPadBinding(mapping, 'semantic:softPad:continueReply', 'AG04');
assert.equal(
  JSON.stringify({
    triggerKey: mapping.triggerKey,
    targetKey: mapping.targetKey,
    wake: mapping.voiceOverride.wakePhrases.slice(),
    layout: mapping.codexMicroPad.layoutProfile,
    active: context.OneToneState.state.config.activeSceneId
  }),
  snapKvp,
  'L7/L3 must not change triggerKey/wake/layout/activeSceneId'
);
const afterL = Api.buildModel(mapping);
const contAfter = afterL.commands.find((c) => c.actionId === 'continueReply');
assert.ok(contAfter && contAfter.oral.enabled && String(contAfter.oral.say).includes('再说'));
assert.ok(contAfter.pad.enabled && contAfter.pad.microKeyId === 'AG04');

// returnPanel round-trip
let openedPanel = '';
context.OneToneSettingsDrawer = {
  open(opts) {
    openedPanel = String((opts && opts.panel) || '');
  }
};
Api.applyMatchDeepLink({
  mappingId: 'habit-a',
  matchChannel: 'voice',
  matchCommand: 'action:continueReply',
  returnPanel: 'voiceWake'
});
assert.equal(typeof Api.returnToCaller, 'function');
assert.equal(Api.returnToCaller(), true);
assert.equal(openedPanel, 'voiceWake');
assert.ok(!context.OneToneState.ui.habitMatchReturnPanel, 'return clears deeplink');

// gesture binding
assert.equal(typeof Api.setGestureBinding, 'function');
await Api.setGestureBinding(mapping, 'action:continueReply', 'wave');
assert.equal(mapping.cameraOverride.wave, 'agent:continueReply');
const afterG = Api.buildModel(mapping);
const contG = afterG.commands.find((c) => c.actionId === 'continueReply');
assert.ok(contG && contG.gesture.enabled && contG.gesture.bindingRef === 'wave');
await Api.setGestureBinding(mapping, 'action:continueReply', '');
assert.ok(!mapping.cameraOverride.wave);

// pad key list includes mapping routes
const padList = Api.listPadMicroKeys(mapping);
assert.ok(padList.includes('AG04'));
assert.ok(padList.includes('AG01'));

// bidirectional: native K/V/P field change → buildModel still projects L fields
mapping.triggerKey = 'F9';
mapping.agentBindings.push({
  slotId: 'semantic:voice:newThread',
  actionId: 'newThread',
  triggerType: 'voice',
  triggerBinding: '新建',
  enabled: true
});
const bi = Api.buildModel(mapping);
assert.ok(bi.commands.some((c) => c.actionId === 'newThread' && c.oral.say === '新建'));
assert.equal(mapping.triggerKey, 'F9', 'K field untouched by projection');

// pad route projects onto same action row
mapping.codexMicroPad.keys.push({
  microKeyId: 'AG07',
  slotId: 'semantic:softPad:newThread',
  enabled: true
});
const m2 = Api.buildModel(mapping);
const nt = m2.commands.find((c) => c.actionId === 'newThread');
assert.ok(nt && nt.pad.microKeyId === 'AG07' && nt.oral.say === '新建');

// Soft Pad seed bare slotId without soft: oral → noise (Soft Pad 页管布局)
mapping.codexMicroPad.keys.push({
  microKeyId: 'AG08',
  slotId: 'openTerminal',
  enabled: true
});
const m3 = Api.buildModel(mapping);
assert.ok(
  !m3.commands.some((c) => c.actionId === 'openTerminal' || c.slotId === 'openTerminal'),
  'pad-only openTerminal filtered'
);

// soft: merge Soft Pad seed kept; bare commandPalette filtered
const padOnly = Api.buildModel({
  id: 'pad-noise',
  agentBindings: [],
  oralCommandScheme: {
    items: { 'soft:newThread': { enabled: true, say: '新建', sort: 0 } }
  },
  codexMicroPad: {
    keys: [
      { microKeyId: 'AG00', slotId: 'commandPalette', enabled: true },
      { microKeyId: 'AG01', slotId: 'newThread', enabled: true }
    ]
  },
  cameraOverride: {}
});
assert.ok(
  !padOnly.commands.some((c) => c.slotId === 'commandPalette' || c.actionId === 'commandPalette'),
  'pad-only Soft Pad seed filtered'
);
assert.ok(
  padOnly.commands.some((c) => c.slotId === 'soft:newThread' && c.pad.enabled && c.oral.enabled),
  'soft-merge Soft Pad seed kept'
);

// key-only app.shortcut flood filtered; oral kept with real label
const shortcutFlood = Api.buildModel({
  id: 'sc-flood',
  agentBindings: [
    {
      slotId: 'custom_aaa',
      actionId: 'app.shortcut',
      actionInstanceId: 'custom_aaa',
      triggerType: 'key',
      triggerBinding: 'Ctrl+A',
      enabled: true
    },
    {
      slotId: 'custom_bbb',
      actionId: 'app.shortcut',
      actionInstanceId: 'custom_bbb',
      triggerType: 'key',
      triggerBinding: 'Ctrl+B',
      enabled: true
    },
    {
      slotId: 'custom_bbb',
      actionId: 'app.shortcut',
      actionInstanceId: 'custom_bbb',
      triggerType: 'voice',
      triggerBinding: '粘贴',
      enabled: true
    },
    {
      slotId: 'cursorBeginnerArm',
      actionId: 'cursorBeginnerArm',
      triggerType: 'voice',
      triggerBinding: '一声',
      enabled: true
    }
  ],
  oralCommandScheme: { items: {} },
  codexMicroPad: {
    customShortcuts: [{ id: 'custom_bbb', name: '粘贴进来', chord: 'Ctrl+B' }],
    keys: []
  },
  cameraOverride: {}
});
assert.equal(
  shortcutFlood.commands.filter((c) => c.actionId === 'app.shortcut').length,
  1,
  'only oral app.shortcut kept'
);
assert.ok(
  !shortcutFlood.commands.some((c) => /cursorBeginner/i.test(c.actionId || c.slotId || '')),
  'cursorBeginner filtered'
);
const keptSc = shortcutFlood.commands.find((c) => c.actionId === 'app.shortcut');
assert.ok(keptSc && keptSc.label === '粘贴进来', 'custom shortcut uses Soft Pad name');

// cameraOverride bag must not mint [object Object]; pressEsc gets zh label
const camBag = Api.buildModel({
  id: 'cam-bag',
  agentBindings: [],
  oralCommandScheme: { items: {} },
  codexMicroPad: { keys: [] },
  cameraOverride: {
    enabled: true,
    triggers: { shake: true, okHand: true },
    okHand: 'agent:pressEsc',
    shakeHead: 'pressEsc',
    awayMs: 1200
  }
});
assert.ok(
  !camBag.commands.some((c) => String(c.label).includes('[object Object]')),
  'no [object Object] labels'
);
assert.ok(
  !camBag.commands.some((c) => /triggers|enabled|awayMs/.test(c.slotId || c.actionId || '')),
  'camera prefs keys skipped'
);
const escRow = camBag.commands.find((c) => c.actionId === 'pressEsc');
assert.ok(escRow && escRow.gesture.enabled, 'pressEsc gesture kept');
assert.equal(escRow.label, '按 Esc 取消', 'pressEsc zh label');
const matrixNote = Api.renderMatrixHtml(camBag);
assert.ok(!/actionInstanceId/.test(matrixNote), 'footer has no tech id leak');

console.log('test-habit-command-link: ok (' + saves + ' saves)');
