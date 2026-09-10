// Guard: Soft Pad「键位」= left preview + right command list + key detail form (no modal cap list).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
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

const pad = readFileSync(join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');
const css = readFileSync(join(root, 'src/css/soft-pad-hub.css'), 'utf8');
const i18n = readFileSync(join(root, 'src/js/core/i18n.js'), 'utf8');

console.log('[soft-pad-layout-key-form]');
check('shell mounts action library + layout editor', /soft-pad-layout-stack[\s\S]*data-soft-pad-action-library[\s\S]*data-soft-pad-layout-editor/.test(pad));
check('softPadLayoutEditorHost returns node', pad.includes('function softPadLayoutEditorHost') &&
  /querySelector\('\[[^\]]*data-soft-pad-layout-editor[^\]]*\]'\)/.test(pad.slice(pad.indexOf('function softPadLayoutEditorHost'))));
check('previewEdit uses inline', /function softPadPreviewEditKey[\s\S]*?mode:\s*'inline'/.test(pad));
check('softPad panel never falls back to capability modal',
  /Soft Pad settings: always left preview[\s\S]*never capability modal/.test(pad) &&
  /softPadPanelActive\(\)[\s\S]*softPadPreviewEditKey\(m, id\)/.test(pad));
check('action list helpers exported in module', pad.includes('function renderLayoutActionList') &&
  pad.includes('function onLayoutActionPick') && pad.includes('function bindLayoutActionLibrary'));
check('inline form is detail fields (no slot dropdown)', pad.includes('function buildLayoutKeyFormHtml') &&
  !pad.includes('id="layoutKeySlot"') && pad.includes('layoutKeyCurrentAction') &&
  pad.includes('layoutKeyPhrases') && pad.includes('layoutKeyChord') && pad.includes('layoutKeyFocus') &&
  pad.includes('soft-pad-layout-form__segment') &&
  pad.includes('data-layout-focus') &&
  !pad.includes('microHwEditHint') &&
  !pad.includes('soft-pad-layout-form-hint'));
check('inline skips capability card list', /function buildEditKeycapInnerHtml\(mode\)[\s\S]*?if \(mode === 'inline'\) return buildLayoutKeyFormHtml\(\)/.test(pad));
check('no mapping test console', pad.indexOf('映射测试控制台') < 0 && pad.indexOf('mapping-test-console') < 0);
check('commit writes layout bindings', /function commitEditKeycapDraft[\s\S]*?applyLayoutKeyBindings\(m, slotId, editDraft\)/.test(pad));
check('CSS action list + detail form', css.includes('.soft-pad-action-list') && css.includes('.soft-pad-layout-form') &&
  /soft-pad-layout-form \{[\s\S]*flex-direction:\s*column/.test(css) &&
  css.includes('.soft-pad-layout-form__segment') &&
  css.includes('.soft-pad-layout-form__chord-value') &&
  css.includes('.soft-pad-layout-form__chord-row'));
check('accordion does not shrink under is-editing-key',
  /is-editing-key[\s\S]*soft-pad-layout-editor--accordion[\s\S]*flex:\s*0 0 auto/.test(css) &&
  /soft-pad-layout-editor--accordion \{[\s\S]*overflow:\s*visible/.test(css));
check('inline form drops live badge + action chip', pad.includes('function buildLayoutKeyFormHtml') &&
  !/buildLayoutKeyFormHtml[\s\S]*microHwEditBadge/.test(pad.slice(pad.indexOf('function buildLayoutKeyFormHtml'), pad.indexOf('function buildLayoutKeyFormHtml') + 1200)) &&
  !/buildLayoutKeyFormHtml[\s\S]*soft-pad-layout-form__current-badge/.test(pad.slice(pad.indexOf('function buildLayoutKeyFormHtml'), pad.indexOf('function buildLayoutKeyFormHtml') + 1200)));
check('i18n action list labels zh', i18n.includes("softPadLayoutActionListLbl:'命令列表'") &&
  i18n.includes("softPadLayoutFieldCurrent:'动作'"));
check('i18n action list labels en', i18n.includes("softPadLayoutActionListLbl:'Commands'") &&
  i18n.includes("softPadLayoutFieldCurrent:'Action'"));
check('plain form title copy', i18n.includes("softPadLayoutFormTitle:'{key}'") &&
  !i18n.includes('这个键怎么用') &&
  !/softPadLayoutFormHint:'[^']{8,}/.test(i18n));
check('record early-exit toasts', pad.includes("softPadLayoutRecordFailed") &&
  /function startRecordLayoutChord[\s\S]*softPadLayoutPickKey[\s\S]*softPadLayoutCustomNeedSlot/.test(pad));
check('layout key record uses rec sheet mode', pad.includes("layoutRecSheetMode = 'layoutKey'") &&
  pad.includes("layoutRecSheetMode = 'custom'") &&
  pad.includes('function beginRecSheetListen') &&
  /function startRecordLayoutChord[\s\S]*beginRecSheetListen/.test(pad) &&
  /mode === 'layoutKey'[\s\S]*editDraft\.chord/.test(pad) &&
  i18n.includes("softPadLayoutCustomRecOkKey:'确认'"));
check('accordion relocate helpers', pad.includes('function parkLayoutEditorOutsideList') &&
  pad.includes('function placeLayoutEditorUnderSelection') &&
  pad.includes('soft-pad-layout-editor--accordion') &&
  pad.includes('function revealCommonsLayoutForKey') &&
  pad.includes('function scrollLayoutEditorIntoView'));
check('key pick reveals 我的常见 + scrolls form',
  /function softPadPreviewEditKey[\s\S]*?revealCommonsLayoutForKey/.test(pad));
check('settings preview banner removed',
  !readFileSync(join(root, 'src/index.html'), 'utf8').includes('id="softPadSettingsPreviewBanner"'));
check('custom layer creates new shortcut (not overwrite key)', pad.includes('data-layout-custom-record') &&
  pad.includes('function createCustomShortcut') &&
  pad.includes('function openCustomRecSheet') &&
  pad.includes('customShortcuts') &&
  !pad.includes('function maybeAutoStartCustomRecord') &&
  !pad.includes('data-layout-start-record'));
check('custom layer hides accordion', /layoutActionLayer === 'custom'[\s\S]*ed\.hidden = true/.test(
  pad.slice(pad.indexOf('function placeLayoutEditorUnderSelection'))
));
check('custom UI has name + phrases + record sheet', pad.includes('data-layout-custom-name') &&
  pad.includes('data-layout-custom-phrases') &&
  pad.includes('softPadCustomRecSheet') &&
  pad.includes('确认并加入常见') &&
  !pad.includes('softPadLayoutCustomCallout') &&
  !pad.includes('softPadLayoutCustomRecSub') &&
  !pad.includes('softPadLayoutActionsLbl'));
check('layout panel has no batch actions card', !/soft-pad-layout-actions[\s\S]*批量操作/.test(pad) &&
  !pad.includes('soft-pad-action-drag-hint'));
check('custom_ uses app.shortcut bindings', pad.includes("actionId: 'app.shortcut'") &&
  pad.includes('function upsertCustomShortcutBindings'));
check('commons manage move + reset + custom delete', pad.includes('data-layout-common-move') &&
  pad.includes('data-layout-common-reset') &&
  pad.includes('data-layout-custom-delete') &&
  pad.includes('soft-pad-action-icon-btn') &&
  pad.includes('function softPadTrailIcon') &&
  pad.includes('function moveCursorCommonSlot') &&
  pad.includes('function resetCursorCommonSlots') &&
  pad.includes('function deleteCustomShortcut'));
check('CSS commons trail uses icon buttons', css.includes('.soft-pad-action-icon-btn') &&
  css.includes('.soft-pad-action-common-moves') &&
  /soft-pad-action-item__trail[\s\S]*flex-direction:\s*row/.test(css));
check('i18n custom create flow', i18n.includes("softPadLayoutCustomRecordBtn:'录制按键'") &&
  i18n.includes("softPadLayoutCustomRecordTitle:'新建自定义快捷键'") &&
  i18n.includes("softPadLayoutCustomRecOk:'确认并加入常见'") &&
  i18n.includes("softPadLayoutCustomRecCancel:'取消'") &&
  i18n.includes("softPadLayoutCommonTagCustom:'自定义'") &&
  i18n.includes("softPadLayoutCommonReset:'恢复默认常见'"));
check('CSS custom create + rec sheet', css.includes('.soft-pad-action-custom__record') &&
  css.includes('.soft-pad-custom-rec-sheet') &&
  css.includes('.soft-pad-action-custom__field') &&
  !css.includes('.soft-pad-action-custom__callout') &&
  !css.includes('.soft-pad-custom-rec-sheet__sub') &&
  !css.includes('.soft-pad-layout-actions'));
check('CSS accordion + scene rail (D) + option list', css.includes('.soft-pad-layout-editor--accordion') &&
  css.includes('.soft-pad-action-scene-split') &&
  css.includes('.soft-pad-action-scene-rail') &&
  /soft-pad-action-scene-pane \.soft-pad-action-item__title[\s\S]*font-size:\s*12px/.test(css));
check('scenes use Directory D rail + Option 1 rows', pad.includes('soft-pad-action-scene-split') &&
  pad.includes('soft-pad-action-scene-rail__btn') &&
  pad.includes('cursorSlotGroupRailLabel') &&
  !pad.includes('data-layout-scene-back'));

console.log(`[soft-pad-layout-key-form] ${pass} passed / ${fail} failed`);
if (fail > 0) process.exit(1);
