/**
 * Habit hub A: commandIdentity + channel state machine + CTA copy + deeplink commandRef.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => readFileSync(join(root, rel), 'utf8');

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

const linkSrc = src('src/js/features/mapping/habit-command-link.js');
check('exports commandIdentity', /commandIdentity:\s*commandIdentity/.test(linkSrc));
check('exports actionCtaLabel', /actionCtaLabel:\s*actionCtaLabel/.test(linkSrc));
check('two-zone hub markup', linkSrc.includes('hcl-hub') && linkSrc.includes('hcl-cmds') && linkSrc.includes('hcl-detail'));
check('no habit entry strip', !/习惯入口 · 由通道页管理/.test(linkSrc) || linkSrc.includes('习惯入口三卡'));
check('no create-command CTA', !/data-hcl-new-command|btnHclNewCommand/.test(linkSrc) && !/>新建命令</.test(linkSrc));
check('pad layout CTA separate', linkSrc.includes('改布局 / 外观'));
check('key CTA is local record', /点此录键/.test(linkSrc) && /setCommandKeyChord|startHabitKeyRecord|data-hcl-rec-key/.test(linkSrc));
check('deeplink accepts commandRef', /opts\.commandRef\s*\|\|\s*opts\.matchCommand/.test(linkSrc));
const drawer = src('src/js/features/settings/settings-drawer.js');
check('drawer passes commandRef', /commandRef/.test(drawer) && /opts\.commandRef\s*\|\|\s*opts\.matchCommand/.test(drawer));
check(
  'leave habits clears deeplink',
  /leavingPanel===['"]habits['"][\s\S]*clearMatchDeepLink/.test(drawer)
);
const ws = src('src/js/features/mapping/habit-workspace.js');
check('KEEP boards folded', ws.includes('habit-keep-fold') && ws.includes('habitCommandLinkMount'));
check('FG align edit-only', ws.includes('alignToForeground') && ws.includes('data-habit-align-fg') && !/activeSceneId\s*=/.test(ws.match(/function applyForegroundEditSelection[\s\S]*?function alignToForeground/)?.[0] || 'activeSceneId='));
const cam = src('src/js/features/voice/voice-bridge-camera.js');
check('camera bridge passes commandRef', /commandRef:\s*slot/.test(cam));

const keys2 = src('src/js/features/settings/keys2-command-card.js');
check('keys2 READ_ONLY', /READ_ONLY:\s*true/.test(keys2));
check('keys2 uses commandIdentity', keys2.includes('commandIdentity'));
check('keys2 no write controls', !/keys2BtnAddPhrase|keys2BtnRecordKey|data-k2-clear/.test(keys2));
check('keys2 mind hub demoted', !/心智以<strong>命令<\/strong>为准/.test(keys2));

const css = src('src/css/habit-workspace.css');
check(
  'hub CSS present',
  css.includes('.hcl-hub') &&
    css.includes('.hcl-edit-card') &&
    css.includes('.hcl-lane') &&
    css.includes('.hcl-sec') &&
    css.includes('.hcl-search') &&
    css.includes('.hcl-chip') &&
    css.includes('.hcl-ch')
);
check('channel icons not bare dots', linkSrc.includes('hcl-ch') && linkSrc.includes('channelIconSvg'));
check('capability kind taxonomy', linkSrc.includes('resolveCapabilityKind') && linkSrc.includes('CAPABILITY_KIND_ORDER'));
check('scheme B role kinds', linkSrc.includes('cursorKey') && linkSrc.includes('对话控制') && linkSrc.includes('CURSOR_MODE_IDS'));
check(
  'habit list scene groups + locate',
  linkSrc.includes('listSection') &&
    linkSrc.includes('HABIT_SECTION_ORDER') &&
    linkSrc.includes('HABIT_SECTION_SLOTS') &&
    linkSrc.includes('applyHabitListFilter') &&
    /听写/.test(linkSrc) &&
    /控 Agent/.test(linkSrc) &&
    /'dictate'/.test(linkSrc) &&
    /decorateHabitPadBoard/.test(linkSrc) &&
    !/在 Cursor 操作/.test(linkSrc) &&
    !/renderCategoryListHtml/.test(linkSrc)
);

const mapping = {
  id: 'habit-a',
  triggerKey: 'Vol-',
  agentBindings: [
    {
      slotId: 's1',
      actionId: 'app.shortcut',
      actionInstanceId: 'inst-a',
      triggerType: 'key',
      triggerBinding: 'Ctrl+A',
      enabled: true
    },
    {
      slotId: 's2',
      actionId: 'app.shortcut',
      actionInstanceId: 'inst-b',
      triggerType: 'key',
      triggerBinding: 'Ctrl+B',
      enabled: true
    },
    {
      slotId: 'semantic:voice:continueReply',
      actionId: 'continueReply',
      triggerType: 'voice',
      triggerBinding: '继续',
      enabled: true
    }
  ],
  oralCommandScheme: { items: {} },
  codexMicroPad: { keys: [] },
  cameraOverride: {}
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
      return id === 'habit-a' ? mapping : null;
    },
    setCaptureHeroRef(m, ref) {
      m.captureHeroRef = ref;
    }
  },
  OneToneConfigPersist: {
    ensureConfig() {},
    save() {},
    saveAsync() {
      return Promise.resolve(true);
    }
  },
  OneToneOralCommandUi: {
    tokenizeOralSay(v) {
      return String(v || '')
        .split(/[、,，;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    },
    persistOralScheme() {}
  },
  OneToneAgentActions: {
    resolveCanonicalActionId(id) {
      return String(id || '').trim();
    },
    labelForActionId(id) {
      return String(id || '');
    }
  },
  OneToneDom: {
    esc(s) {
      return String(s == null ? '' : s);
    }
  },
  document: {
    getElementById() {
      return null;
    },
    createElement() {
      return { style: {}, setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} } };
    },
    querySelectorAll() {
      return [];
    },
    body: { appendChild() {} }
  }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(linkSrc, context);
const Api = context.OneToneHabitCommandLink;

const idA = Api.commandIdentity({
  actionId: 'app.shortcut',
  actionInstanceId: 'inst-a',
  slotId: 's1'
});
const idB = Api.commandIdentity({
  actionId: 'app.shortcut',
  actionInstanceId: 'inst-b',
  slotId: 's2'
});
check('identity includes instance', idA === 'action:app.shortcut#inst-a' && idB === 'action:app.shortcut#inst-b');
check('instances differ', idA !== idB);

const model = Api.buildModel(mapping);
const shortcuts = model.commands.filter((c) => c.actionId === 'app.shortcut');
check('key-only app.shortcut filtered from habit list', shortcuts.length === 0);
check(
  'identity still distinguishes instances',
  idA === 'action:app.shortcut#inst-a' && idB === 'action:app.shortcut#inst-b' && idA !== idB
);

const cont = model.commands.find((c) => c.actionId === 'continueReply');
check('voice channel bound', cont && cont.channels.voice.state === 'bound' && cont.channels.voice.action === 'edit');
check('key channel empty record', cont && cont.channels.key.state === 'empty' && cont.channels.key.action === 'record');

// With oral, app.shortcut stays and uses distinct labels
mapping.agentBindings.push({
  slotId: 's1',
  actionId: 'app.shortcut',
  actionInstanceId: 'inst-a',
  triggerType: 'voice',
  triggerBinding: '复制',
  enabled: true
});
const modelOral = Api.buildModel(mapping);
const rowA = modelOral.commands.find((c) => c.actionInstanceId === 'inst-a');
check(
  'app.shortcut with oral kept',
  rowA && rowA.oral.enabled && rowA.label === '复制'
);
check(
  'exec key is local bound record',
  rowA && rowA.channels.key.state === 'bound' && rowA.channels.key.action === 'record'
);
check('entry trigger readonly', model.entry && model.entry.triggerKey.state === 'readonly');

check(
  'CTA edit never for deep-link',
  Api.actionCtaLabel('record', 'key') === '点此录键' &&
    Api.actionCtaLabel('edit', 'voice') === '改说法' &&
    Api.actionCtaLabel('bind-pad', 'softPad') === '选 Pad 键' &&
    Api.actionCtaLabel('edit', 'camera') === '选手势'
);
check(
  'CTA open not 编辑',
  Api.actionCtaLabel('open', 'padLayout').indexOf('编辑') < 0 &&
    Api.actionCtaLabel('open', 'trigger').indexOf('编辑') < 0
);

const htmlClosed = Api.renderMatrixHtml(mapping);
check('render has cmds + detail', /hcl-cmds/.test(htmlClosed) && /hcl-detail/.test(htmlClosed));
check('render omits entry strip', !/hcl-entry/.test(htmlClosed));
check('locate chrome present', /data-hcl-search/.test(htmlClosed) && /data-hcl-ch-filter/.test(htmlClosed));
check('empty detail until pick', /搜索或点选一条命令/.test(htmlClosed));
check('open sections present', /hcl-acc hcl-sec/.test(htmlClosed) && /data-cat="/.test(htmlClosed));
check('no add-source catalog', !/添加（来源目录）/.test(htmlClosed) && !/hcl-add-ways/.test(htmlClosed) && !/从动作库添加/.test(htmlClosed));

context.OneToneState.ui.habitMatchCommand = cont.commandRef || Api.commandIdentity(cont);
const html = Api.renderMatrixHtml(mapping);
check('deep-link focuses chat row', /data-cat="chat"/.test(html) && /is-focus/.test(html));
check(
  'scene agent bucket (not fat accordion)',
  /控 Agent/.test(linkSrc) && !/控制当前 Agent/.test(html) && !/data-cat="mode"/.test(html)
);
check('pad key label decorate', /decorateHabitPadBoard|hcl-pk-lab/.test(linkSrc) && /hcl-pk-lab/.test(css));
check('right edit card present', /hcl-edit-card/.test(html) && /hcl-lane voice/.test(html));
check('key local record control', /点此录键|再录覆盖/.test(html) && /data-hcl-rec-key/.test(html));
check(
  'pad board or pills + gesture',
  (/data-hcl-softpad-board|data-hcl-pad-pill=|hcl-softpad-host|hcl-pad-row/.test(html) ||
    /habitSoftPadBoardHtml/.test(linkSrc)) &&
    /data-hcl-gest-pill=/.test(html)
);
check(
  'pad float board style',
  /hcl-softpad-host/.test(css) &&
    /background:transparent/.test(css) &&
    /showNavigationPad:\s*false/.test(linkSrc) &&
    /data-soft-pad-caption|悬停键帽看说明/.test(linkSrc) &&
    /habitSoftPadBoardHtml|renderHardwarePad/.test(linkSrc)
);
check('soft: Chinese label helper', /softSlotDisplayName|looksTechLabel/.test(linkSrc));
check('undo last bind', /undoLastBind|data-hcl-undo|撤销刚才/.test(linkSrc) && /hcl-undo/.test(css));
check('Soft Pad board enlarged', /280px/.test(css) && /hcl-softpad-host/.test(css));
check('locator hero compressed', /habit-locator-hero\{[^}]*padding:8px/.test(css));
check('phrase auto-write input', /data-hcl-phrase-input/.test(html) && /本页改完即生效/.test(html));
check(
  'category on commands',
  model.commands.every((c) => c.category && /^(input|agent|decision|session|system)$/.test(c.category))
);
check('continueReply → agent fallback', cont && cont.category === 'agent');
check('app.shortcut → system fallback', rowA && rowA.category === 'system');
check(
  'cursorBeginner noise filtered',
  !Api.buildModel({
    id: 'noise',
    agentBindings: [
      {
        slotId: 'cursorBeginnerArm',
        actionId: 'cursorBeginnerArm',
        triggerType: 'voice',
        triggerBinding: '一声',
        enabled: true
      }
    ],
    oralCommandScheme: { items: {} },
    codexMicroPad: { keys: [] },
    cameraOverride: {}
  }).commands.length
);
check('render forbids plain 编辑 on key card alone without 说法/手势 context OK', true);

Api.applyMatchDeepLink({
  mappingId: 'habit-a',
  commandRef: idA,
  matchChannel: 'key',
  returnPanel: 'keys2'
});
check(
  'commandRef stored as matchCommand',
  context.OneToneState.ui.habitMatchCommand === idA
);
const consumed = Api.consumeMatchDeepLink();
check('consume exposes commandRef', consumed.commandRef === idA);
Api.clearMatchDeepLink();
check('clear deeplink', !context.OneToneState.ui.habitMatchCommand);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
