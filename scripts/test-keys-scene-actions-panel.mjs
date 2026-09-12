/**
 * Keys B scene actions panel — multi-action list + new match (no overwrite).
 * Run: node scripts/test-keys-scene-actions-panel.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const html = read('src/index.html');
const css = read('src/css/keys-workflow.css');
const panelSrc = read('src/js/features/mapping/keys-scene-actions-panel.js');
const keysUi = read('src/js/features/settings/keys-panel-ui.js');
const pickerSrc = read('src/js/features/mapping/keys-channel-command-picker.js');
const targetPickerSrc = read('src/js/features/mapping/target-key-picker.js');
const targetApplySrc = read('src/js/features/mapping/target-key-apply.js');

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass++;
    console.log('  PASS ' + name);
  } else {
    fail++;
    console.error('  FAIL ' + name);
  }
}

check('aside node in index.html', html.includes('id="keysSceneActionsPanel"'));
check('app brand hosts', html.includes('id="keysSceneActionsApp"') && html.includes('id="keysSceneActionsAppName"'));
check('script tag mounted', html.includes('keys-scene-actions-panel.js'));
check('dir host', html.includes('id="keysSceneActionsDir"'));
check('add foot host', html.includes('keys-scene-actions__foot') && html.includes('id="keysSceneActionsAdd"'));
check('prototype wash/paper/line tokens', /--keys-wash:\s*#f3f7fa/.test(css) && /--keys-line:\s*#d5dee8/.test(css));
check('hero/stage use solid keys-line', /#keysFlowNodes\s*\{[^}]*border:\s*1px solid var\(--keys-line/.test(css) && /\.flow-desk-panel\s*\{[^}]*border:\s*1px solid var\(--keys-line/.test(css));
check('aside foot sits under list', /\.keys-scene-actions__foot\s*\{[^}]*padding:\s*4px 8px 10px/.test(css));
{
  const bodyStart = html.indexOf('class="keys-page-body"');
  const footStart = html.indexOf('class="keys-page-foot"');
  const chunk = bodyStart >= 0 && footStart > bodyStart ? html.slice(bodyStart, footStart) : '';
  const mainCloseThenAside =
    /keys-page-main[\s\S]*?<\/div>\s*<\/div>\s*<aside[^>]*id="keysSceneActionsPanel"/.test(chunk) ||
    /<\/div>\s*<\/div>\s*<aside[^>]*id="keysSceneActionsPanel"/.test(chunk);
  check('aside is sibling of keys-page-main (not nested inside)', mainCloseThenAside);
}
check('has-scene-panel CSS', /#settingsPanelKeys\s+\.keys-page-body\.has-scene-panel/.test(css));
check(
  'scene dock stays two-column via :has()',
  /keys-page-body:has\(>\s*\.keys-page-aside\.keys-scene-actions:not\(\[hidden\]\)\)/.test(css) &&
    /grid-column:\s*2/.test(css)
);
check(
  'scene dock also keys off #keysSceneActionsPanel visibility',
  /#settingsPanelKeys:has\(#keysSceneActionsPanel:not\(\[hidden\]\)\)\s+\.keys-page-body/.test(css)
);
check('app brand CSS', /\.keys-scene-actions__app/.test(css));
check('ime badge CSS', /\.keys-scene-actions__ime/.test(css));
check('row flex layout CSS', /\.keys-scene-actions__body/.test(css) && /\.keys-scene-actions__trail/.test(css));
check('add action CSS', /\.keys-scene-actions__add/.test(css));
check('add action not stripped to text-link', !/#settingsPanelKeys \.keys-scene-actions__add\s*\{[^}]*border:\s*none/.test(css));
check('scene dock keeps foot under list (no tall stretch)', /#settingsPanelKeys \.keys-scene-actions\s*\{[^}]*grid-template-rows:\s*auto auto auto/.test(css));
check('add is dashed list-adjacent button', /#settingsPanelKeys \.keys-scene-actions__add\s*\{[^}]*border:\s*1px dashed var\(--keys-line/.test(css));
check('active row uses mappingId', /a\.mappingId/.test(panelSrc) && /state\.mappingId/.test(panelSrc));
check('active row rail', /keys-scene-actions__dir-item\.is-active::before/.test(css));
check('keys-panel-ui wires SceneActionsPanel', /OneToneKeysSceneActionsPanel/.test(keysUi));
check(
  'picker exports createCustomKeyMatchMapping',
  /createCustomKeyMatchMapping:\s*createCustomKeyMatchMapping/.test(pickerSrc)
);
check(
  'picker exports createVoiceInputMapping',
  /createVoiceInputMapping:\s*createVoiceInputMapping/.test(pickerSrc)
);
check(
  'custom-key list excludes IME via isCustomKeyMatchMapping',
  /function isCustomKeyMatchMapping/.test(pickerSrc) &&
    /if \(!isCustomKeyMatchMapping\(m/.test(pickerSrc)
);
check(
  'custom-key list excludes habit apply-shadow (bindingRef !== id)',
  /if \(bref && bref !== mid\) return false/.test(pickerSrc)
);
{
  // Mirror list predicate: create must not surface habit+peer as two rows.
  function isLib(m, editId) {
    if (!m || !m.id) return false;
    if (editId && String(m.id) === editId) return true;
    var mid = String(m.id);
    var ref = m.captureHeroRef;
    var kind =
      ref &&
      typeof ref === 'object' &&
      String(ref.kind || '')
        .trim()
        .toLowerCase() === 'customkey';
    if (kind) {
      var bref = String(ref.bindingRef || '').trim();
      if (bref && bref !== mid) return false;
      return true;
    }
    return (
      m.enabled === false &&
      Array.isArray(m.targetActions) &&
      m.targetActions.length > 0 &&
      !String(m.imePresetId || '').trim() &&
      !String(m.targetKey || '').trim()
    );
  }
  var habit = {
    id: 'habit1',
    enabled: true,
    targetActions: [],
    captureHeroRef: { kind: 'customKey', bindingRef: 'peer1' }
  };
  var peer = {
    id: 'peer1',
    enabled: false,
    targetActions: [],
    captureHeroRef: { kind: 'customKey', bindingRef: 'peer1' }
  };
  check('create apply: habit shadow not a library row', !isLib(habit, 'peer1'));
  check('create apply: peer is the only library row', isLib(peer, 'peer1'));
}
check(
  '录制快捷键 catalog pick stays in callback mode',
  /openWithCallback\(typeof onCommit==='function' \? onCommit : onRecord\)/.test(targetPickerSrc)
);
check(
  'target picker close clears record callback',
  /_commitCallback=null;\s*_recordCallback=null;/.test(targetPickerSrc)
);
check(
  'picker apply keeps appTargetId (scene panel)',
  targetApplySrc.indexOf("m.appTargetId=''") < 0 &&
    /never strip app scenario/.test(targetApplySrc)
);
{
  const tableSrc = read('src/js/features/mapping/habit-key-mapping-table.js');
  const navSrc = read('src/js/features/mapping/keys-step-nav.js');
  check(
    'keycap left-click records target (not open picker)',
    /if\(step==='target'\)\{[\s\S]*?startTargetRecordForKeysPanel\(\)/.test(tableSrc) &&
      !/openCapturePopover[\s\S]*?highlightRow\('target'\)/.test(tableSrc)
  );
  check(
    'no right-click record on keycaps / flow nodes',
    !/contextmenu/.test(tableSrc) &&
      !/contextmenu/.test(navSrc) &&
      !/keyZone\.addEventListener\(\s*['"]contextmenu['"]/.test(pickerSrc)
  );
}
check(
  'custom-key list shows name not targetKey',
  /customKeyMatchDisplayName\(m\)/.test(pickerSrc) &&
    !/var recog = String\(m\.targetKey/.test(pickerSrc)
);
check(
  'custom-key can be named and renamed',
  /function beginInlineRenameCustomKeyMatch/.test(pickerSrc) &&
    /function renameCustomKeyMatch/.test(pickerSrc) &&
    /dblclick/.test(pickerSrc) &&
    /280/.test(pickerSrc)
);
check(
  'custom-key list has delete affordance',
  /function deleteCustomKeyMatch/.test(pickerSrc) &&
    /data-match-del/.test(pickerSrc) &&
    /deleteCustomKeyMatch:\s*deleteCustomKeyMatch/.test(pickerSrc)
);
check(
  '02 hero primary is custom-key name',
  /primaryLabel:\s*name/.test(pickerSrc) &&
    /nameSource/.test(pickerSrc)
);
check(
  'new custom match sets customKey hero',
  /kind:\s*'customKey'/.test(pickerSrc) &&
    /keysCustomKeyMatchTitle/.test(pickerSrc)
);
check(
  'new voice mapping toast guides IME pick',
  /keysVoiceInputMappingCreated|请录制 01 触发/.test(pickerSrc)
);
check(
  '02 custom-key hero uses name not trigger',
  /02 keycap: named title first/.test(pickerSrc) &&
    !/02 recognition button = that match's trigger key/.test(pickerSrc)
);
check(
  'duplicate trigger toasts and switches',
  /recordTriggerAlreadyUsed/.test(read('src/js/features/mapping/mapping-recording.js'))
);
check(
  'scene panel lists all app mappings not filtered custom list',
  /Full app peers \(voice \+ custom\)/.test(panelSrc) &&
    !/listCustomKeyMappingsForCurrentApp/.test(panelSrc)
);
check(
  'applyCustomKeyMatchAsRecognition replaces IME on habit',
  /function applyCustomKeyMatchAsRecognition/.test(pickerSrc) &&
    /habit\.targetActions\s*=\s*acts/.test(pickerSrc) &&
    /habit\.imePresetId\s*=\s*''/.test(pickerSrc) &&
    /已用「我录的键」替换听写快捷键|Applied/.test(pickerSrc)
);
check(
  'list click applies recognition without focusing match',
  /applyCustomKeyMatchAsRecognition\(id\)/.test(pickerSrc) &&
    !/Focus the match mapping so 01\/02 belong/.test(pickerSrc)
);
check(
  'IME apply clears custom-key sequence',
  /m\.targetActions\s*=\s*\[\]/.test(read('src/js/features/mapping/target-key-apply.js')) &&
    /clearCustomKeyRecognition|customkey/.test(read('src/js/features/mapping/target-key-apply.js'))
);
check(
  'scene new action prefers createVoiceInputMapping',
  /createVoiceInputMapping/.test(panelSrc)
);
check(
  'scene list hides empty stubs until configured',
  /hasConcreteConfig/.test(panelSrc) &&
    /always keep/.test(panelSrc) &&
    /isCustomKeyMatchMapping\(m\)/.test(panelSrc)
);
check(
  'scene recognition ignores inherited editorTarget',
  /never inherited editorTarget/.test(panelSrc) &&
    !/core\.editorTarget\(m\)/.test(panelSrc)
);
check(
  'new voice mapping is draft until configured (no immediate persist)',
  /In-memory only until trigger/.test(pickerSrc) &&
    /createVoiceInputMapping[\s\S]*?cfg\.mappings\.push\(copy\)/.test(pickerSrc) &&
    !/function createVoiceInputMapping[\s\S]*?persistNewPeerMapping\(copy\)/.test(pickerSrc)
);
check(
  'target-key-apply refreshes scene panel',
  /OneToneKeysSceneActionsPanel/.test(read('src/js/features/mapping/target-key-apply.js'))
);

function makeClassList(el) {
  const set = new Set(String(el.className || '').split(/\s+/).filter(Boolean));
  return {
    add(c) {
      set.add(c);
      el.className = [...set].join(' ');
    },
    remove(c) {
      set.delete(c);
      el.className = [...set].join(' ');
    },
    contains(c) {
      return set.has(c);
    }
  };
}

function makeEl(id, tag) {
  const el = {
    id: id || '',
    tagName: String(tag || 'div').toUpperCase(),
    hidden: false,
    className: '',
    innerHTML: '',
    textContent: '',
    src: '',
    parentElement: null,
    children: [],
    attributes: Object.create(null),
    listeners: Object.create(null),
    setAttribute(k, v) {
      this.attributes[k] = String(v);
    },
    getAttribute(k) {
      return Object.prototype.hasOwnProperty.call(this.attributes, k)
        ? this.attributes[k]
        : null;
    },
    removeAttribute(k) {
      delete this.attributes[k];
      if (k === 'src') this.src = '';
    },
    addEventListener(type, fn) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(fn);
    },
    closest(sel) {
      let n = this;
      while (n) {
        if (sel.startsWith('[') && n.getAttribute) {
          const raw = sel.slice(1, -1);
          const eq = raw.indexOf('=');
          if (eq < 0) {
            if (n.getAttribute(raw) != null) return n;
          } else {
            const k = raw.slice(0, eq);
            const v = raw.slice(eq + 1).replace(/^"|"$/g, '');
            if (n.getAttribute(k) === v) return n;
          }
        }
        if (sel.startsWith('#') && n.id === sel.slice(1)) return n;
        n = n.parentElement;
      }
      return null;
    }
  };
  el.classList = makeClassList(el);
  return el;
}

const els = Object.create(null);
const body = makeEl('', 'div');
body.className = 'keys-page-body';
const panel = makeEl('keysSceneActionsPanel', 'aside');
panel.hidden = true;
panel.parentElement = body;
body.children.push(panel);

[
  'keysSceneActionsTitle',
  'keysSceneActionsMeta',
  'keysSceneActionsBack',
  'keysSceneActionsDir',
  'keysSceneActionsDetail',
  'keysSceneActionsPicks',
  'keysSceneActionsEdit',
  'keysSceneActionsApp',
  'keysSceneActionsAppIcon',
  'keysSceneActionsAppName',
  'keysSceneActionsAdd',
  'habitKeyMapRowTarget',
  'habitKeyMapRowTrigger'
].forEach((id) => {
  const child = makeEl(id, id === 'keysSceneActionsAdd' ? 'button' : 'div');
  child.parentElement = id.startsWith('keysScene') ? panel : null;
  if (id === 'keysSceneActionsAdd') child.setAttribute('data-add', '1');
  els[id] = child;
});
els.keysSceneActionsPanel = panel;
els.keysSceneActionsApp.hidden = true;
els.keysSceneActionsAppIcon.hidden = true;
els.keysSceneActionsAdd.textContent = '＋ 新建动作';

const mappings = {
  base: { id: 'base', appTargetId: '', agentBindings: [] },
  cursor: {
    id: 'cursor',
    appTargetId: 'cursor-chat',
    targetKey: 'RAlt',
    imePresetId: 'typeless',
    triggerKey: 'XButton1',
    agentBindings: [
      {
        slotId: 'pushToTalk',
        actionId: 'startDictation',
        triggerType: 'key',
        triggerBinding: 'LAlt+R'
      },
      {
        actionId: 'app.shortcut',
        triggerType: 'key',
        triggerBinding: 'LAlt+G',
        actionInstanceId: 'a1'
      }
    ]
  },
  match1: {
    id: 'match1',
    appTargetId: 'cursor-chat',
    label: '继续并确认',
    triggerKey: 'F13',
    targetActions: [{ type: 'key', value: 'Enter' }],
    agentBindings: []
  },
  // Bug repro: targetKey set, empty targetActions — must stay custom name, not 语音输入.
  matchBare: {
    id: 'matchBare',
    appTargetId: 'cursor-chat',
    label: '1',
    triggerKey: '',
    targetKey: 'RAlt',
    targetActions: [],
    captureHeroRef: { kind: 'customKey', bindingRef: 'matchBare' },
    agentBindings: []
  },
  emptyVoice: {
    id: 'emptyVoice',
    appTargetId: 'cursor-chat',
    label: '语音输入',
    triggerKey: '',
    targetKey: '',
    targetActions: [],
    imePresetId: '',
    captureHeroRef: null,
    agentBindings: []
  },
  // Named「我录的键」with no actions yet — must still appear in 本场景动作.
  matchNamedEmpty: {
    id: 'matchNamedEmpty',
    appTargetId: 'cursor-chat',
    label: '2',
    triggerKey: '',
    targetKey: '',
    targetActions: [],
    captureHeroRef: { kind: 'customKey', bindingRef: 'matchNamedEmpty' },
    agentBindings: []
  }
};

let jumpedTab = '';
let jumpedStep = '';
let jumpedFocus = '';
let recordPinned = '';
let createdCalls = 0;
let createdVoiceCalls = 0;
const mappingList = [
  mappings.cursor,
  mappings.match1,
  mappings.matchBare,
  mappings.emptyVoice,
  mappings.matchNamedEmpty
];

const sandbox = {
  console,
  document: {
    getElementById(id) {
      return els[id] || null;
    }
  },
  setTimeout(fn) {
    fn();
  },
  OneToneI18n: {
    t(k) {
      return k;
    }
  },
  OneToneDom: {
    esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
  },
  OneToneHabitOverrideDiff: {
    isAppScenarioMapping(m) {
      return !!(m && String(m.appTargetId || '').trim());
    }
  },
  OneToneState: {
    state: {
      config: {
        mappings: mappingList
      }
    }
  },
  OneToneMappingCore: {
    byId(id) {
      return mappings[id] || null;
    },
    selected() {
      return mappings.cursor;
    },
    focus(id) {
      jumpedFocus = String(id || '');
    },
    editorTarget(m) {
      return (m && m.targetKey) || '';
    }
  },
  OneToneAppTargetPresets: {
    presetById(id) {
      if (id === 'cursor-chat') {
        return {
          id: 'cursor-chat',
          nameKey: 'appTargetCursor',
          name: 'Cursor',
          icon: 'icons/app-target/cursor.png'
        };
      }
      return null;
    }
  },
  OneToneImePresets: {
    presetById(id) {
      if (id === 'typeless') {
        return {
          id: 'typeless',
          nameKey: 'imePresetTypeless',
          icon: 'icons/ime/typeless.png'
        };
      }
      return null;
    }
  },
  OneToneAgentActions: {
    slotById(id) {
      return id === 'pushToTalk'
        ? { slotId: 'pushToTalk', actionId: 'startDictation', labelZh: '语音输入' }
        : null;
    },
    labelForSlot(slot) {
      return slot ? slot.labelZh : '';
    },
    labelForSlotForMapping() {
      return '语音输入';
    }
  },
  OneToneActionBindingAdapters: {
    key: { describeTrigger(b) { return (b && b.triggerBinding) || ''; } }
  },
  OneToneKeysPageState: {
    setStep(step) {
      jumpedStep = step;
    }
  },
  OneToneHabitKeyMappingTable: {
    highlightRow() {}
  },
  OneToneMappingRecording: {
    startTrigger(id) {
      recordPinned = String(id || '');
    }
  },
  OneToneKeysChannelCommandPicker: {
    clearSelection() {},
    setActiveTab(tab) {
      jumpedTab = tab;
    },
    applyHero() {},
    syncRecognitionEditorPreview() {},
    refresh() {},
    selectFromSlotId() {},
    setSelection() {},
    previewCustomKeyMatch() {},
    isCustomKeyMatchMapping(m) {
      if (!m || !m.id) return false;
      const mid = String(m.id);
      const ref = m.captureHeroRef;
      const kind =
        ref && typeof ref === 'object' && String(ref.kind || '').toLowerCase() === 'customkey';
      if (kind) {
        const bref = String(ref.bindingRef || '').trim();
        if (bref && bref !== mid) return false;
        return true;
      }
      return !!(
        m.enabled === false &&
        Array.isArray(m.targetActions) &&
        m.targetActions.length
      );
    },
    customKeyMatchDisplayName(m) {
      const lab = String((m && m.label) || '').trim();
      return lab || '按键匹配';
    },
    listCustomKeyMappingsForCurrentApp() {
      return [mappings.match1, mappings.matchBare];
    },
    createCustomKeyMatchMapping() {
      createdCalls++;
      const copy = {
        id: 'match-new',
        appTargetId: 'cursor-chat',
        triggerKey: '',
        targetActions: [],
        captureHeroRef: { kind: 'customKey' },
        label: '按键匹配'
      };
      mappings['match-new'] = copy;
      mappingList.push(copy);
      return copy;
    },
    createVoiceInputMapping() {
      createdVoiceCalls++;
      const copy = {
        id: 'voice-new',
        appTargetId: 'cursor-chat',
        triggerKey: '',
        targetKey: '',
        targetActions: [],
        imePresetId: '',
        label: '语音输入'
      };
      mappings['voice-new'] = copy;
      mappingList.push(copy);
      return copy;
    }
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(panelSrc, sandbox, { filename: 'keys-scene-actions-panel.js' });
const API = sandbox.OneToneKeysSceneActionsPanel;
assert.ok(API, 'API exported');

API.render(mappings.base);
check('baseline mapping → panel hidden', panel.hidden === true);

API.render(mappings.cursor);
check('app-scenario → panel visible', panel.hidden === false);
check('has-scene-panel', body.classList.contains('has-scene-panel'));
check('stays on dir (no detail mode)', panel.getAttribute('data-panel') === 'dir');
check('shows app title', els.keysSceneActionsApp.hidden === false && /Cursor|appTargetCursor/.test(els.keysSceneActionsAppName.textContent));
check('shows app icon', els.keysSceneActionsAppIcon.hidden === false && els.keysSceneActionsAppIcon.src.includes('cursor.png'));

const dirHtml = els.keysSceneActionsDir.innerHTML;
check('shows trigger key in scene list', /XButton1|侧键|鼠标/.test(dirHtml) && !/→/.test(dirHtml));
check('shows IME name badge', /keys-scene-actions__ime-name/.test(dirHtml) && /typeless|Typeless|imePresetTypeless/i.test(dirHtml));
check('shows IME icon', dirHtml.includes('icons/ime/typeless.png'));
check('lists sibling action with its trigger key', dirHtml.includes('F13'));
check('lists sibling with custom name', dirHtml.includes('继续并确认'));
check('bare custom-key keeps list name (not 语音输入)', dirHtml.includes('>1<') || /keys-scene-actions__lbl[^>]*>1</.test(dirHtml));
check('no channel icon strip', !/keys-scene-actions__ch-ico/.test(dirHtml));
check('no app.shortcut leftover', !dirHtml.includes('LAlt+G'));
check('has jump affordance', /data-jump="voice:cursor"/.test(dirHtml));
check('row uses body+trail layout', /keys-scene-actions__body/.test(dirHtml) && /keys-scene-actions__trail/.test(dirHtml));
check('has status dot', /keys-scene-actions__dot/.test(dirHtml));
check('has add action button', els.keysSceneActionsAdd && /新建动作/.test(els.keysSceneActionsAdd.textContent || ''));
check('detail host stays hidden', els.keysSceneActionsDetail.hidden === true);
check('meta shows action count', /4|keysSceneActionsMetaCount/.test(els.keysSceneActionsMeta.textContent));

const rows = API.buildRows(mappings.cursor);
check('recognition + sibling rows', rows.length === 4 && /XButton1|侧键|鼠标/.test(rows[0].binds.key) && rows[1].kind === 'customKey');
check('sibling line is trigger not recognition chord', /F13/.test(rows[1].binds.key) && !/→/.test(rows[1].binds.key));
check('bare custom-key row uses renamed label', rows[2].kind === 'customKey' && rows[2].label === '1');
check('bare custom-key is not voice', rows[2].kind !== 'recognition' && rows[2].label !== '语音输入');
check(
  'empty voice stub hidden from scene list',
  rows.every((r) => r.mappingId !== 'emptyVoice')
);
check(
  'named empty custom-key still listed',
  rows.some((r) => r.mappingId === 'matchNamedEmpty' && r.label === '2' && r.kind === 'customKey')
);
check('row carries ime meta', rows[0].ime && rows[0].ime.id === 'typeless');
check('habit trigger not overwritten in rows', mappings.cursor.triggerKey === 'XButton1');

jumpedTab = '';
jumpedStep = '';
jumpedFocus = '';
API.jumpToEdit(rows[0]);
check('jump opens target step', jumpedStep === 'target');
check('jump opens ime tab (no record in dock)', jumpedTab === 'ime');
check('jump focuses voice mapping', jumpedFocus === 'cursor');

createdCalls = 0;
createdVoiceCalls = 0;
recordPinned = '';
jumpedStep = '';
jumpedTab = '';
API.startNewAction();
check('new action creates voice mapping', createdVoiceCalls === 1 && createdCalls === 0);
check('new action opens trigger step', jumpedStep === 'trigger');
check('new action records on new mapping id', recordPinned === 'voice-new');
check('new action prefers ime tab for recognition', jumpedTab === 'ime');
check('habit trigger unchanged after new action', mappings.cursor.triggerKey === 'XButton1');

mappings.cursor.targetKey = 'F2';
mappings.cursor.imePresetId = 'xunfei';
sandbox.OneToneImePresets.presetById = (id) =>
  id === 'xunfei'
    ? { id: 'xunfei', nameKey: 'imePresetXunfei', icon: 'icons/ime/xunfei.png' }
    : null;
API.render(mappings.cursor);
check('refresh follows new IME badge', /xunfei|imePresetXunfei/i.test(els.keysSceneActionsDir.innerHTML));
check('refresh keeps trigger key line', /XButton1|侧键|鼠标/.test(els.keysSceneActionsDir.innerHTML) && !/→/.test(els.keysSceneActionsDir.innerHTML));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
