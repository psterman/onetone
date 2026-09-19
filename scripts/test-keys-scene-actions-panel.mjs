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
check('center add host', html.includes('keys-center-new-action') && html.includes('id="keysSceneActionsAdd"'));
check('voice center add host', html.includes('id="voiceSceneActionsAdd"') && html.includes('keys-center-new-action'));
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
check(
  '02 pick refreshes scene dock via persistHeroCapture',
  /function persistHeroCapture[\s\S]*?KeysSceneActionsPanel[\s\S]*?scene\.refresh/.test(pickerSrc)
);
check(
  'voice scheme strip is trouble details (not big card)',
  html.includes('id="voiceSchemeTrouble"') &&
    html.includes('voice-scheme-strip--top') &&
    html.includes('id="voiceWorkflowTabsBar"') &&
    html.indexOf('id="voiceWorkflowTabsBar"') < html.indexOf('id="voiceSchemeStrip"') &&
    html.indexOf('id="voiceSchemeStrip"') < html.indexOf('id="voiceIntentPicker"') &&
    /voiceSchemeTroubleSummary/.test(html)
);
check(
  'strategy + global opt-in live inside trouble body',
  /voiceSchemeTrouble[\s\S]*voiceSummaryEngineSwitch[\s\S]*voiceWakeListeningOptInToggle/.test(html)
);
{
  const troubleOpen = html.indexOf('class="voice-scheme-trouble-body"');
  const troubleClose = html.indexOf('</details>', troubleOpen);
  const troubleChunk =
    troubleOpen >= 0 && troubleClose > troubleOpen ? html.slice(troubleOpen, troubleClose) : '';
  check(
    'phrase edit / aliases / keys-target not in visible strip body',
    !!troubleChunk &&
      !troubleChunk.includes('btnVoiceWakePhraseEditLink') &&
      !troubleChunk.includes('btnVoiceWakeGoKeysTarget') &&
      !troubleChunk.includes('voiceWakeMoreAliases')
  );
}
check(
  'voice dock stays flat (no wake expand / opt-in)',
  /Voice dock stays a flat list/.test(panelSrc) && /function voiceWakeExtrasHtml\(\)\s*\{\s*return '';\s*\}/.test(panelSrc)
);
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
    return false;
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
  check(
    'legacy disabled orphans are not library rows',
    !isLib({
      id: 'orphan',
      enabled: false,
      targetActions: [{ type: 'open', kind: 'url', value: 'https://example.com' }],
      imePresetId: '',
      targetKey: ''
    })
  );
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
  'scene new action: keys blank peer / voice wake popover',
  /onVoicePage\(\)/.test(panelSrc) &&
    /createBlankSceneActionMapping/.test(panelSrc) &&
    /openWakePhrasePopover/.test(panelSrc) &&
    /function startNewAction[\s\S]*?var voice = onVoicePage\(\)/.test(panelSrc) &&
    !/function startNewAction\(\) \{\s*openKeysPanelIfNeeded\(\)/.test(panelSrc) &&
    !/Keys「新建」still seeds/.test(panelSrc)
);
check(
  'picker exports createBlankSceneActionMapping',
  /createBlankSceneActionMapping:\s*createBlankSceneActionMapping/.test(pickerSrc)
);
check(
  'keys buildRows uses last-selected scheme only (not all bindings)',
  /rowForLastScheme/.test(panelSrc) &&
    /Never enumerate every agentBinding/.test(panelSrc) &&
    !/appendKeysChannelExtras/.test(panelSrc)
);
check(
  'mapping-recording refreshes scene after trigger capture',
  /OneToneKeysSceneActionsPanel/.test(read('src/js/features/mapping/mapping-recording.js'))
);
check(
  'wake phrase replace primary exported',
  /replacePrimaryWakePhrase/.test(read('src/js/features/voice/voice-wake.js')) &&
    /openWakePhrasePopover\('replace'\)/.test(read('src/js/features/voice/voice-ui-bindings.js'))
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
    },
    querySelector(sel) {
      if (!sel) return null;
      if (sel.startsWith('.')) {
        const cls = sel.slice(1).split('.')[0];
        const walk = (n) => {
          if (!n) return null;
          if (n.classList && n.classList.contains(cls)) return n;
          const kids = n.children || [];
          for (let i = 0; i < kids.length; i++) {
            const hit = walk(kids[i]);
            if (hit) return hit;
          }
          return null;
        };
        return walk(this);
      }
      if (sel.startsWith('#')) return this.id === sel.slice(1) ? this : null;
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

const voiceBody = makeEl('', 'div');
voiceBody.className = 'voice-page-body';
const voicePanel = makeEl('voiceSceneActionsPanel', 'aside');
voicePanel.hidden = true;
voicePanel.parentElement = voiceBody;
voiceBody.children.push(voicePanel);
[
  'voiceSceneActionsTitle',
  'voiceSceneActionsMeta',
  'voiceSceneActionsBack',
  'voiceSceneActionsDir',
  'voiceSceneActionsDetail',
  'voiceSceneActionsPicks',
  'voiceSceneActionsEdit',
  'voiceSceneActionsApp',
  'voiceSceneActionsAppIcon',
  'voiceSceneActionsAppName',
  'voiceSceneActionsAdd'
].forEach((id) => {
  const child = makeEl(id, id === 'voiceSceneActionsAdd' ? 'button' : 'div');
  child.parentElement = voicePanel;
  if (id === 'voiceSceneActionsAdd') child.setAttribute('data-add', '1');
  els[id] = child;
});
els.voiceSceneActionsPanel = voicePanel;
els.voiceSceneActionsApp.hidden = true;
els.voiceSceneActionsAppIcon.hidden = true;

const keysPage = makeEl('settingsPanelKeys', 'section');
keysPage.hidden = false;
keysPage.children = [body];
body.parentElement = keysPage;
const voicePage = makeEl('settingsPanelVoiceWake', 'section');
voicePage.hidden = true;
voicePage.children = [voiceBody];
voiceBody.parentElement = voicePage;
els.settingsPanelKeys = keysPage;
els.settingsPanelVoiceWake = voicePage;

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
    captureHeroRef: { kind: 'customKey', bindingRef: 'match1' },
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
let createdBlankCalls = 0;
let wakePopoverMode = '';
let openedSettingsPanel = '';
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
    },
    ui: {
      settingsPanel: 'keys',
      drawerOpen: true
    }
  },
  OneToneSettingsDrawer: {
    open(opts) {
      openedSettingsPanel = String((opts && opts.panel) || '');
      if (openedSettingsPanel) {
        // Keep ui in sync when jump helpers fire.
        sandbox.OneToneState.ui.settingsPanel = openedSettingsPanel;
      }
    }
  },
  OneToneVoiceSettingsFlow: {
    scheduleVoiceSettingsRender() {}
  },
  OneToneVoiceWake: {
    currentWakePhraseList() {
      return ['开始输入', '开始听写'];
    },
    replacePrimaryWakePhrase() {
      return Promise.resolve();
    }
  },
  OneToneVoiceEnd: {
    currentSendPhraseLists() {
      return { zh: ['发送'], en: ['send'] };
    },
    currentEndPhraseLists() {
      return { zh: ['结束输入'], en: ['end dictation'] };
    },
    currentCancelPhraseLists() {
      return { zh: ['取消输入'], en: ['cancel input'] };
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
    },
    defaultCaptureHeroRef() {
      return { channel: 'key', bindingRef: 'ime', actionId: '', actionInstanceId: '', kind: 'ime' };
    },
    isDefaultCaptureHeroRef(ref) {
      if (!ref) return true;
      return String(ref.kind || '') === 'ime' && !String(ref.actionId || '').trim();
    },
    captureHeroRefForMapping(m) {
      if (!m || !m.captureHeroRef) {
        return { channel: 'key', bindingRef: 'ime', actionId: '', actionInstanceId: '', kind: 'ime' };
      }
      return m.captureHeroRef;
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
  OneToneVoiceUiBindings: {
    openWakePhrasePopover(mode) {
      wakePopoverMode = mode || 'add';
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
      return false;
    },
    customKeyMatchDisplayName(m) {
      const lab = String((m && m.label) || '').trim();
      return lab || '自定义键';
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
    createBlankSceneActionMapping() {
      createdBlankCalls++;
      const copy = {
        id: 'blank-new',
        appTargetId: 'cursor-chat',
        triggerKey: '',
        targetKey: '',
        targetActions: [],
        captureHeroRef: null,
        label: '新动作'
      };
      mappings['blank-new'] = copy;
      mappingList.push(copy);
      jumpedStep = 'trigger';
      jumpedTab = 'ime';
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

check('source filters by channel', /filterRowsForChannel/.test(panelSrc) && /kind === 'recognition'/.test(panelSrc));
check('habit hub deeplink in dock', /data-habit-hub/.test(panelSrc));
check(
  'scene labels prefer Chinese over dotted action ids',
  /function labelForRow/.test(panelSrc) && /known\[tail\]/.test(panelSrc) && /bareAid/.test(panelSrc)
);

API.render(mappings.base);
check('baseline mapping → panel hidden', panel.hidden === true);

API.render(mappings.cursor);
check('app-scenario → panel visible', panel.hidden === false);
check('has-scene-panel', body.classList.contains('has-scene-panel'));
check('stays on dir (no detail mode)', panel.getAttribute('data-panel') === 'dir');
check('shows app title', els.keysSceneActionsApp.hidden === false && /Cursor|appTargetCursor/.test(els.keysSceneActionsAppName.textContent));
check('shows app icon', els.keysSceneActionsAppIcon.hidden === false && els.keysSceneActionsAppIcon.src.includes('cursor.png'));

const dirHtml = els.keysSceneActionsDir.innerHTML;
check('keys page shows recognition (听写方式)', /data-jump="voice:cursor"/.test(dirHtml));
check('keys recognition labeled 听写方式 not 语音输入', /听写方式|keysChannelTabIme/.test(dirHtml) || !/>语音输入</.test(dirHtml));
check('keys page shows custom-key trigger', dirHtml.includes('F13'));
check(
  'keys page does not list every agentBinding scheme',
  !/LAlt\+G/.test(dirHtml) && !/softPad:cursor/.test(dirHtml)
);
check('lists sibling with custom name', dirHtml.includes('继续并确认'));
check('bare custom-key keeps list name (not 语音输入)', dirHtml.includes('>1<') || /keys-scene-actions__n[^>]*>1</.test(dirHtml));
check('no channel icon strip', !/keys-scene-actions__ch-ico/.test(dirHtml));
check('row uses body+trail layout', /keys-scene-actions__body/.test(dirHtml));
check('has status dot', /keys-scene-actions__dot/.test(dirHtml));
check('edit is main button jump', /keys-scene-actions__dir-main[^>]*data-jump="voice:cursor"/.test(dirHtml));
check('peer custom-key has delete', /data-del="match1"/.test(dirHtml));
check('habit recognition also has delete', /data-del="cursor"/.test(dirHtml));
check('drag handle when multiple rows', /keys-scene-actions__drag/.test(dirHtml));
check('has add action button', els.keysSceneActionsAdd && /新建动作/.test(els.keysSceneActionsAdd.textContent || ''));
check('detail host stays hidden', els.keysSceneActionsDetail.hidden === true);
check('meta shows one-scheme-per-peer count', /4/.test(els.keysSceneActionsMeta.textContent));
check('habit link present', /data-habit-hub/.test(dirHtml));
check('keys dock group is 本场景动作', /本场景动作|keysSceneActionsTitle/.test(dirHtml));

const rows = API.buildRows(mappings.cursor);
check(
  'one last scheme per peer (IME + 3 customKey)',
  rows.length === 4 &&
    rows.filter((r) => r.kind === 'recognition').length === 1 &&
    rows.filter((r) => r.kind === 'customKey').length === 3 &&
    !rows.some((r) => r.actionId === 'app.shortcut')
);
check(
  'keys customKey rows are only 我录的键 ids',
  rows
    .filter((r) => r.kind === 'customKey')
    .every((r) => ['match1', 'matchBare', 'matchNamedEmpty'].includes(r.mappingId))
);
check(
  'sibling line is trigger not recognition chord',
  /F13/.test(rows.find((r) => r.mappingId === 'match1').binds.key) &&
    !/→/.test(rows.find((r) => r.mappingId === 'match1').binds.key)
);
check(
  'bare custom-key row uses renamed label',
  rows.some((r) => r.mappingId === 'matchBare' && r.kind === 'customKey' && r.label === '1')
);
check(
  'bare custom-key is not voice',
  rows.every((r) => r.mappingId !== 'matchBare' || (r.kind === 'customKey' && r.label !== '语音输入'))
);
check(
  'empty voice stub hidden from scene list',
  rows.every((r) => r.mappingId !== 'emptyVoice')
);
check(
  'named empty custom-key still listed',
  rows.some((r) => r.mappingId === 'matchNamedEmpty' && r.label === '2' && r.kind === 'customKey')
);
check(
  'keys recognition labeled 听写方式',
  rows.some((r) => r.kind === 'recognition' && r.label === '听写方式')
);
check(
  'voice recognition carries ime meta',
  rows.some((r) => r.kind === 'recognition' && r.ime && r.ime.id === 'typeless')
);
check('habit trigger not overwritten in rows', mappings.cursor.triggerKey === 'XButton1');

// Last-selected Soft Pad replaces IME for the same trigger — still one row.
mappings.cursor.captureHeroRef = {
  channel: 'softPad',
  bindingRef: 'pad1',
  actionId: 'app.shortcut',
  actionInstanceId: 'a1',
  kind: 'action'
};
const softRows = API.buildRows(mappings.cursor);
check(
  'last softPad scheme replaces IME on same peer',
  softRows.filter((r) => r.mappingId === 'cursor').length === 1 &&
    softRows.some((r) => r.mappingId === 'cursor' && r.kind === 'softPad' && r.actionId === 'app.shortcut') &&
    !softRows.some((r) => r.mappingId === 'cursor' && r.kind === 'recognition')
);
mappings.cursor.captureHeroRef = null;
API.render(mappings.cursor);

// Voice page host: only recognition rows
keysPage.hidden = true;
voicePage.hidden = false;
sandbox.OneToneState.ui.settingsPanel = 'voiceWake';
API.render(mappings.cursor);
const voiceDir = els.voiceSceneActionsDir.innerHTML;
check('voice page shows recognition jump', /data-jump="voice:cursor"/.test(voiceDir));
check('voice page hides custom-key F13', !voiceDir.includes('F13'));
check('voice page shows IME badge', /keys-scene-actions__ime-name/.test(voiceDir));
check('voice meta includes recognition + wake phrases', /3/.test(els.voiceSceneActionsMeta.textContent));
check('voice dock lists wake phrase rows', /data-row-key="wake:开始输入"/.test(voiceDir) || /开启口令/.test(voiceDir));
check('voice habit recognition has delete', /data-del="cursor"/.test(voiceDir));
check('voice row shows drag handle', /keys-scene-actions__drag/.test(voiceDir));
check('voice card has no wake expand', !/data-wake-phrase/.test(voiceDir) && !/data-wake-optin/.test(voiceDir));
check('voice card has no finish chips', !/data-finish-edit="send"/.test(voiceDir));
check(
  'voice dock source skips empty recognition fallback',
  !/still show 语音输入/.test(panelSrc) && !/rows\.push\(recognitionRow\(m, fbTrig\)\)/.test(panelSrc)
);

// Voice page still lists 语音输入 when keys last-scheme diverted to softPad
mappings.cursor.captureHeroRef = {
  channel: 'softPad',
  bindingRef: 'pad1',
  actionId: 'app.shortcut',
  actionInstanceId: 'a1',
  kind: 'action'
};
API.render(mappings.cursor);
check(
  'voice page keeps recognition when softPad is last keys scheme',
  /data-jump="voice:cursor"/.test(els.voiceSceneActionsDir.innerHTML)
);
mappings.cursor.agentBindings.push({
  triggerType: 'voice',
  triggerBinding: '继续并确认',
  slotId: 'app.shortcut',
  actionId: 'app.shortcut',
  actionInstanceId: 'a1',
  enabled: true
});
API.render(mappings.cursor);
check(
  'voice page does not dump Soft Pad / agent voice catalogue',
  !/继续并确认/.test(els.voiceSceneActionsDir.innerHTML) &&
    !/agent\.continue/.test(els.voiceSceneActionsDir.innerHTML)
);
// Non-SoftPad voice phrase (no pad keys) should list and be deletable.
mappings.cursor.agentBindings.push({
  triggerType: 'voice',
  triggerBinding: '场景专用口令',
  slotId: 'scene.voice.only',
  actionId: 'app.shortcut',
  actionInstanceId: 'scene-v1',
  enabled: true
});
API.render(mappings.cursor);
check(
  'voice page lists non-SoftPad voice phrase',
  /场景专用口令/.test(els.voiceSceneActionsDir.innerHTML)
);
check(
  'voice phrase row has delete',
  /data-del-key="vphrase:cursor:scene-v1"/.test(els.voiceSceneActionsDir.innerHTML) ||
    /data-del="cursor"/.test(els.voiceSceneActionsDir.innerHTML)
);
mappings.cursor.agentBindings = mappings.cursor.agentBindings.filter(function (b) {
  return !(b && String(b.triggerBinding || '') === '场景专用口令');
});
check(
  'voice page line keeps IME chip at foot (no duplicate name line)',
  /keys-scene-actions__trail--foot/.test(els.voiceSceneActionsDir.innerHTML) &&
    /keys-scene-actions__ime/.test(els.voiceSceneActionsDir.innerHTML)
);
mappings.cursor.captureHeroRef = null;
mappings.cursor.agentBindings = mappings.cursor.agentBindings.filter(function (b) {
  return !(b && b.triggerType === 'voice' && String(b.triggerBinding || '') === '继续并确认');
});
keysPage.hidden = false;
voicePage.hidden = true;
sandbox.OneToneState.ui.settingsPanel = 'keys';
API.render(mappings.cursor);

jumpedTab = '';
jumpedStep = '';
jumpedFocus = '';
API.jumpToEdit(rows.find((r) => r.kind === 'recognition') || rows[0]);
check('jump opens target step', jumpedStep === 'target');
check('jump opens ime tab (no record in dock)', jumpedTab === 'ime');
check('jump focuses voice mapping', jumpedFocus === 'cursor');

createdCalls = 0;
createdVoiceCalls = 0;
createdBlankCalls = 0;
recordPinned = '';
jumpedStep = '';
jumpedTab = '';
openedSettingsPanel = '';
API.startNewAction();
check('keys new action creates blank scene mapping', createdBlankCalls === 1 && createdCalls === 0 && createdVoiceCalls === 0);
check('keys new action opens trigger step', jumpedStep === 'trigger');
check('keys new action does not auto-record trigger', recordPinned === '');
check('keys new action stays on ime tab', jumpedTab === 'ime');
check('keys new action stays on keys panel', openedSettingsPanel === '' && sandbox.OneToneState.ui.settingsPanel === 'keys');
check('habit trigger unchanged after new action', mappings.cursor.triggerKey === 'XButton1');

// Voice page: open wake phrase popover, do not record / create voice peer
keysPage.hidden = true;
voicePage.hidden = false;
sandbox.OneToneState.ui.settingsPanel = 'voiceWake';
createdCalls = 0;
createdVoiceCalls = 0;
createdBlankCalls = 0;
recordPinned = '';
wakePopoverMode = '';
jumpedStep = '';
jumpedTab = '';
openedSettingsPanel = '';
API.render(mappings.cursor);
API.startNewAction();
check('voice new action opens wake phrase popover', wakePopoverMode === 'add');
check('voice new action does not create mappings', createdVoiceCalls === 0 && createdBlankCalls === 0 && createdCalls === 0);
check('voice new action does not auto-record', recordPinned === '');
check('voice new action does not open keys panel', openedSettingsPanel !== 'keys');
check('voice new action stays on voiceWake', sandbox.OneToneState.ui.settingsPanel === 'voiceWake');
check(
  'voice dock keeps existing recognition row',
  /data-jump="voice:cursor"/.test(els.voiceSceneActionsDir.innerHTML)
);

// Wake-first: IME set, no hardware triggerKey — must still list (口令唤醒).
const prevTrig = mappings.cursor.triggerKey;
mappings.cursor.triggerKey = '';
API.render(mappings.cursor);
check(
  'voice dock lists recognition without triggerKey',
  /data-jump="voice:cursor"/.test(els.voiceSceneActionsDir.innerHTML)
);
mappings.cursor.triggerKey = prevTrig;
keysPage.hidden = false;
voicePage.hidden = true;
sandbox.OneToneState.ui.settingsPanel = 'keys';

mappings.cursor.targetKey = 'F2';
mappings.cursor.imePresetId = 'xunfei';
sandbox.OneToneImePresets.presetById = (id) =>
  id === 'xunfei'
    ? { id: 'xunfei', nameKey: 'imePresetXunfei', icon: 'icons/ime/xunfei.png' }
    : null;
API.render(mappings.cursor);
check('keys refresh still lists custom-key', els.keysSceneActionsDir.innerHTML.includes('F13'));
keysPage.hidden = true;
voicePage.hidden = false;
sandbox.OneToneState.ui.settingsPanel = 'voiceWake';
API.render(mappings.cursor);
check('voice refresh follows new IME badge', /xunfei|imePresetXunfei/i.test(els.voiceSceneActionsDir.innerHTML));
check('voice refresh keeps recognition row', /data-jump="voice:cursor"/.test(els.voiceSceneActionsDir.innerHTML));

// Delete habit 语音输入 must not resurrect as unset draft.
API.deleteSceneRow({ kind: 'recognition', mappingId: 'cursor', key: 'voice:cursor' });
API.render(mappings.cursor);
check(
  'voice delete habit recognition removes dock row',
  !/data-jump="voice:cursor"/.test(els.voiceSceneActionsDir.innerHTML)
);
check('voice delete clears habit ime', !String(mappings.cursor.imePresetId || '').trim());

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
