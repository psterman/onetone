// Guard: 动作链页对齐 Mac Keys — left catalog (听写 + 序列) / mid dual live faces.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'src/index.html'), 'utf8');
const panel = readFileSync(join(root, 'src/js/features/mapping/keys-seq-panel.js'), 'utf8');
const css = readFileSync(join(root, 'src/css/keys-seq-panel.css'), 'utf8');
const i18n = readFileSync(join(root, 'src/js/core/i18n.js'), 'utf8');
const flowIx = readFileSync(join(root, 'src/js/features/mapping/keys-flow-interaction.js'), 'utf8');
const keysUi = readFileSync(join(root, 'src/js/features/settings/keys-panel-ui.js'), 'utf8');
const drawer = readFileSync(join(root, 'src/js/features/settings/settings-drawer.js'), 'utf8');
const picker = readFileSync(join(root, 'src/js/features/mapping/keys-channel-command-picker.js'), 'utf8');
const kw = readFileSync(join(root, 'src/css/keys-workflow.css'), 'utf8');
const appCss = readFileSync(join(root, 'src/css/app.css'), 'utf8');

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

console.log('[keys-seq-mac-catalog]');

const railStart = html.indexOf('id="keysSeqRail"');
const railEnd = html.indexOf('id="keysSeqMain"');
const mainEnd = html.indexOf('id="keysSeqSceneActionsPanel"');
const railChunk = railStart >= 0 && railEnd > railStart ? html.slice(railStart, railEnd) : '';
const mainChunk = railEnd >= 0 && mainEnd > railEnd ? html.slice(railEnd, mainEnd) : '';

check('rail has catalog list', /id="keysSeqSavedList"/.test(railChunk) && !/hidden/.test(railChunk.match(/id="keysSeqSavedList"[^>]*>/)?.[0] || 'hidden'));
check('rail has no trigger row', !/id="keysSeqTriggerRow"/.test(railChunk));
check('rail has no accordion toggle', !/id="keysSeqSavedToggle"/.test(railChunk));
check('rail has dictation card', /id="keysSeqImeCard"/.test(railChunk) && /keys-seq-dictation-card/.test(railChunk));
check('rail has seq group + tpl', /keysSeqRailSeqGroup/.test(railChunk) && /id="keysSeqTplAction"/.test(railChunk));
check('mid hosts dual desks', /id="keysSeqImeDesk"/.test(mainChunk) && /id="keysSeqSeqDesk"/.test(mainChunk));
check('mid ime host for live Keys IME', /id="keysSeqImeHost"/.test(mainChunk));
check('mid ime purpose copy', /id="keysSeqImePurpose"/.test(mainChunk));
check('JS focuses dictation peer on IME face', /focusDictationPeerForIme/.test(panel));
check('mid key host for live custom key', /id="keysSeqKeyHost"/.test(mainChunk));
check('mid no fake proto banner', !/keysSeqImeProtoBanner|keysSeqImeOpenKeys/.test(mainChunk));
check('mid has trigger chrome slots', /id="keysSeqTriggerChrome"/.test(mainChunk) && /id="keysSeqTriggerModesSlot"/.test(mainChunk));
check('no open-legacy Keys link', !/id="keysSeqOpenLegacy"/.test(html));
check('classic Keys nav hidden', /id="wbNavTriggers"[^>]*\bhidden\b/.test(html));
check('mid hosts trigger row in seq desk', /id="keysSeqTriggerRow"/.test(mainChunk));
check('mid hosts trigger cap', /id="keysSeqTriggerCap"/.test(mainChunk));
check('mid has Mac name + delete', /id="keysSeqSeqName"/.test(mainChunk) && /id="keysSeqSeqDelete"/.test(mainChunk));
check('mid has habit folder', /id="keysSeqHabitFolder"/.test(mainChunk));
check('mid name+folder share one meta row', /keys-seq-meta-row/.test(mainChunk) && /keys-seq-meta-name/.test(mainChunk) && /keys-seq-meta-folder/.test(mainChunk));
check('JS paints Mac path summary', /→/.test(panel) && /keysSeqSeqName/.test(panel) && /keysSeqFolder|keysSeqHabitFolder/.test(panel));
check('CSS Mac title + key row', /keys-seq-meta-row/.test(css) && /keys-seq-title-in/.test(css) && /keys-seq-key-row/.test(css) && /keys-seq-retrigger/.test(css));
check('classic Keys IME + custom key sources remain', /id="keysChannelPaneRight"/.test(html) && /id="keysCaptureTargetActionsHost"/.test(html) && /id="keysCustomKeyMatchList"/.test(html));
check('scene dock still hidden', /id="keysSeqSceneActionsPanel"[^>]*hidden/.test(html) && /display:none!important/.test(html));

check('JS mounts live pane for both faces', /mountLivePane/.test(panel) && /keysSeqKeyHost/.test(panel) && /keysSeqImeHost/.test(panel));
check('JS mounts trigger chrome', /mountTriggerChrome/.test(panel) && /unmountLiveKeysChrome/.test(panel));
check('JS lists custom-key mappings', /listCustomKeyMappingsForCurrentApp/.test(panel));
check('JS new uses createCustomKeyMatchMapping', /createCustomKeyMatchMapping/.test(panel));
check(
  'JS new stamps sourceId + selects created',
  /createCustomKeyMatchMapping\(\{[\s\S]*?sourceId:[\s\S]*?selectSaved\(created\.id\)/.test(panel)
);
check(
  'picker keeps editId after setActiveTab on create',
  /setActiveTab\('key'[\s\S]*?customKeyMatchEditId\s*=\s*newId/.test(picker) &&
    /curEdit[\s\S]*?mappingById\(curEdit\)/.test(picker)
);
check('JS hostsCustomKey + live chrome', /hostsCustomKey/.test(panel) && /hostsLiveKeysChrome/.test(panel));
check('JS setCustomKeyMatchEditId on select', /setCustomKeyMatchEditId/.test(panel));
check('picker exports setCustomKeyMatchEditId', /setCustomKeyMatchEditId:\s*function/.test(picker));
check('JS no savedExpanded gate', !/savedExpanded/.test(panel));
check('JS no left flow expand', !/flowOpenId|stepFlowHtml|data-seq-flow/.test(panel));
check('CSS dictation + key hosts', /keys-seq-dictation-card/.test(css) && /keys-seq-ime-host/.test(css) && /keys-seq-key-host/.test(css));
check('CSS seq face hides nested match list', /is-seq-face[\s\S]*keys-custom-key-match/.test(css));
check('CSS rail width 210', /grid-template-columns:\s*210px/.test(css));
check('Keys custom-key styles under keysSeq', /:is\(#settingsPanelKeys, #settingsPanelKeysSeq\) \.keys-custom-key-detail/.test(kw) || /:is\(#settingsPanelKeys, #settingsPanelKeysSeq\) \.keys-custom-key-split/.test(kw));
check('Keys IME finish peers style under keysSeq', /:is\(#settingsPanelKeys, #settingsPanelKeysSeq\) \.keys-finish-peers/.test(kw));
check(
  'dictation press styles cover keysSeq',
  /:is\(#settingsPanelKeys, #settingsPanelKeysSeq\) \.keys-dictation-press/.test(kw)
);
check(
  'cancel strategy layout covers keysSeq',
  /:is\(#settingsPanelKeys, #settingsPanelKeysSeq\) \.keys-cancel-row\{/.test(appCss) &&
    /grid-template-columns:\s*76px/.test(appCss) &&
    !/#settingsPanelKeys \.keys-cancel-row\{/.test(appCss)
);
check(
  'finish chrome styles cover keysSeq',
  /:is\(#settingsPanelKeys, #settingsPanelKeysSeq\) \.keys-finish/.test(appCss) &&
    !/#settingsPanelKeys \.keys-finish-mode-hint/.test(appCss)
);
check('i18n rail/mid + ime labels', /keysSeqRailImeGroup:/.test(i18n) && /keysSeqImeCardTitle:/.test(i18n) && /keysSeqImeMidLabel:/.test(i18n));
check('i18n mid Mac chrome labels', /keysSeqHabitFolder:/.test(i18n) && /keysSeqRetrigger:/.test(i18n) && /keysSeqStepsLabel:/.test(i18n));
check('keysUi treats keysSeq live as active', /keysSeqHostsLive/.test(keysUi));
check('flow ix binds keysSeq + live host', /settingsPanelKeysSeq/.test(flowIx) && /keysSeqHostsLive/.test(flowIx));
check(
  'flow ix routes dictation-press clicks',
  /data-dictation-press/.test(flowIx) && /dispatchFinishClick/.test(flowIx)
);
check(
  'dictation press lives in 听写键 card',
  /id="keysDictationPress"/.test(html) && /data-dictation-press="tap"/.test(html)
);
check(
  'trigger mode model drops 按法 matrix',
  !/buildGestureModesHtml/.test(keysUi) && /paintDictationPressUi/.test(keysUi) && /effectiveDictationPress/.test(keysUi)
);
check('drawer refreshes custom key face', /refreshCustomKeyPaint/.test(drawer));
check('drawer maps keys→keysSeq', /keyWake['"]?\s*\|\|\s*panel===['"]keys['"][\s\S]*?return ['"]keysSeq['"]/.test(drawer));
check(
  'shell-ia triggers→keysSeq',
  /triggers:\s*\{\s*panel:\s*'keysSeq'/.test(
    readFileSync(join(root, 'src/js/shared/shell-ia-convergence.js'), 'utf8')
  )
);

if (fail) {
  console.error(fail + ' failed');
  process.exit(1);
}
console.log(pass + ' passed');
