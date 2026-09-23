/**
 * Guard: Soft Pad mid = left function list | right preview + key ability under it.
 * Page right habits column unchanged.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'src/index.html'), 'utf8');
const css = readFileSync(join(root, 'src/css/soft-pad-hub.css'), 'utf8');
const hub = readFileSync(join(root, 'src/js/features/agent/soft-pad-hub-ui.js'), 'utf8');
const pad = readFileSync(join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');
const i18n = readFileSync(join(root, 'src/js/core/i18n.js'), 'utf8');

assert.ok(html.includes('soft-pad-page-body--three-col'), 'body marks three-col');
assert.ok(html.includes('id="softPadPageRail"'), 'left rail host');
assert.ok(html.includes('id="softPadChannelNav"'), 'channel nav host');
assert.ok(html.includes('data-soft-pad-channel="softPad"'), 'softPad rail channel');
assert.ok(html.includes('data-soft-pad-channel="ime"'), 'ime rail channel');
assert.ok(html.includes('data-soft-pad-channel="key"'), 'key rail channel');
assert.ok(html.includes('data-soft-pad-channel="voice"'), 'voice rail channel');
assert.ok(html.includes('data-soft-pad-channel="cursor"'), 'cursor rail channel');
assert.ok(html.includes('data-soft-pad-channel="camera"'), 'camera rail channel');
assert.ok(!html.includes('soft-pad-page-rail__badge'), 'no 另页 badges on rail');
assert.ok(!html.includes('is-keys-page'), 'rail items not marked as jump-away');
assert.ok(html.includes('id="softPadRightCol"'), 'right col host');
assert.ok(html.includes('soft-pad-right-col--habits-only'), 'right col habits-only (no pad)');
assert.ok(html.includes('id="softPadPreviewColLbl"'), 'app label host');
assert.ok(html.includes('soft-pad-preview-hint--slim'), 'slim preview hint');
assert.ok(html.includes('id="softPadPreviewHint"'), 'preview hint host');
assert.ok(html.includes('id="softPadPreviewHost"'), 'preview host kept');
assert.ok(html.includes('id="softPadMidPad"'), 'mid Soft Pad wrap');
assert.ok(html.includes('id="softPadMidStack"'), 'mid stack wraps preview + ability');
assert.ok(html.includes('id="softPadFnSwapHost"'), 'fn swap host on left');
assert.ok(html.includes('soft-pad-face-pad--pad-mid'), 'face marks pad-mid');
assert.ok(html.includes('id="softPadSummaryKeys"'), 'summary keys id kept');
assert.ok(html.includes('id="softPadBindApp"'), 'bind app id kept');
assert.ok(html.includes('id="softPadSceneKeysPanel"'), 'scene keys panel kept');
assert.ok(html.includes('soft-pad-face-pad--desk'), 'mid desk face');
assert.ok(html.includes('data-i18n="softPadPadTabBind"'), 'bind tab label');
assert.ok(!html.includes('id="softPadChannelSearch"'), 'no channel search');

{
  const softPadStart = html.indexOf('id="settingsPanelSoftPad"');
  const trayStart = html.indexOf('id="settingsPanelTray"');
  assert.ok(softPadStart > 0 && trayStart > softPadStart, 'soft pad panel block found');
  const block = html.slice(softPadStart, trayStart);
  const railIdx = block.indexOf('id="softPadPageRail"');
  const mainIdx = block.indexOf('id="softPadHubStage"');
  const fnIdx = block.indexOf('id="softPadFnSwapHost"');
  const midPadIdx = block.indexOf('id="softPadMidPad"');
  const previewIdx = block.indexOf('id="softPadPreviewHost"');
  const abilityIdx = block.indexOf('id="softPadSubpageHost"');
  const stackIdx = block.indexOf('id="softPadMidStack"');
  const hintIdx = block.indexOf('id="softPadPreviewHint"');
  const sceneIdx = block.indexOf('id="softPadSceneKeysPanel"');
  const rightIdx = block.indexOf('id="softPadRightCol"');
  assert.ok(railIdx > 0 && mainIdx > railIdx, 'rail before mid workbench');
  assert.ok(rightIdx > mainIdx, 'right col after mid');
  // Mid face: Soft Pad stack first, fn list sibling after (CSS places it to the right of the pad).
  assert.ok(stackIdx > mainIdx && stackIdx < fnIdx, 'mid stack before fn list');
  assert.ok(fnIdx > midPadIdx && fnIdx < rightIdx, 'function list after Soft Pad mid');
  assert.ok(previewIdx > stackIdx && previewIdx < abilityIdx, 'preview above key ability');
  assert.ok(abilityIdx > previewIdx && abilityIdx < fnIdx, 'key ability under preview in mid');
  assert.ok(hintIdx > rightIdx, 'hint in right col');
  assert.ok(sceneIdx > hintIdx, 'scene keys under hint');
  assert.ok(!/id="softPadRightCol"[\s\S]*?id="softPadPreviewHost"/.test(block), 'no Soft Pad host inside right col');
  assert.ok(
    /id="softPadPreviewHint"[\s\S]*?id="softPadSummaryKeys"/.test(block),
    'hint contains softPadSummaryKeys'
  );
  assert.ok(
    /id="btnSoftPadEditKeys"[^>]*\bsr-only\b/.test(block) ||
      (/id="btnSoftPadEditKeys"/.test(block) && /id="btnSoftPadEditKeys"[\s\S]{0,120}aria-hidden="true"/.test(block)),
    'edit-keys demoted from primary hint'
  );
}

assert.ok(css.includes('soft-pad-face-pad--pad-mid'), 'css pad-mid face');
assert.ok(css.includes('soft-pad-mid-pad'), 'css mid Soft Pad wrap');
assert.ok(css.includes('soft-pad-mid-stack'), 'css mid stack');
assert.ok(css.includes('soft-pad-mid-fn-swap'), 'css left fn swap');
assert.ok(css.includes('soft-pad-mid-ability'), 'css ability under preview');
assert.ok(
  /grid-template-columns:\s*minmax\(300px,\s*1\.25fr\)\s+minmax\(220px,\s*0\.9fr\)/.test(css),
  'css Soft Pad mid | fn list split'
);
assert.ok(
  /grid-template-columns:\s*minmax\(200px,\s*220px\)\s+minmax\(0,\s*1fr\)\s+minmax\(300px,\s*340px\)/.test(css),
  'css wider rail | main | right columns'
);
assert.ok(css.includes('soft-pad-flat-bind-dock'), 'css editor dock');
assert.ok(css.includes('soft-pad-layout-shell--pad-edit'), 'css pad-edit shell');
assert.ok(css.includes('soft-pad-layout-shell--key-first'), 'css key-first shell');
assert.ok(css.includes('soft-pad-preview-hint--slim'), 'css slim hint');
assert.ok(css.includes('soft-pad-right-col--purpose'), 'css purpose right col');
assert.ok(css.includes('soft-pad-layout-shell--channel'), 'css channel workbench shell');
assert.ok(css.includes('soft-pad-mid-stack--fused .soft-pad-work-tag[hidden]'), 'css hides work-tag in fused card');

assert.ok(hub.includes('setSoftPadRailChannel'), 'hub rail channel switch');
assert.ok(hub.includes('paintSoftPadRailChannelWorkbench'), 'hub paints channel workbench');
assert.ok(hub.includes('focusKeyId'), 'hub passes Soft Pad key focus into channel workbench');
assert.ok(hub.includes('ensureSoftPadThreeColLayout'), 'hub ensures three-col class');
assert.ok(hub.includes('softPadPreviewHint'), 'hub binds preview hint');
assert.ok(hub.includes('workTag.hidden = true'), 'hub always hides work-tag');
assert.ok(hub.includes("btn.classList.remove('is-keys-page')"), 'hub treats rail channels as first-class');

assert.ok(pad.includes('soft-pad-layout-shell--pad-edit'), 'pad edit-only shell');
assert.ok(pad.includes('soft-pad-layout-shell--key-first'), 'pad key-first shell');
assert.ok(pad.includes('soft-pad-flat-bind-dock'), 'pad emits editor dock');
assert.ok(!pad.includes('soft-pad-bind-steps'), 'pad no longer emits two-step strip');
assert.ok(pad.includes('setSoftPadFnSwapVisible'), 'pad shows fn swap on left');
assert.ok(pad.includes('paintSoftPadChannelIntoFnSwap'), 'pad paints channels into left column');
assert.ok(pad.includes('refreshSoftPadFnSwapForMode'), 'pad preserves channel mode on key edit');
assert.ok(pad.includes('renderCapabilityList(m)'), 'pad paints capability swap list');
assert.ok(pad.includes('capabilityListHost'), 'pad resolves mid vs modal cap list');
assert.ok(pad.includes('renderSoftPadChannelWorkbench'), 'pad channel workbench renderer');
assert.ok(pad.includes('if (softPadPanelActive()) return true;'), 'phrases hidden on Soft Pad panel');
assert.ok(!pad.includes('softPadFlatBindHint'), 'no flat-bind subtitle copy');
assert.ok(pad.includes('scrollIntoView'), 'pad scrolls active fn card into view');
assert.ok(!pad.includes('softPadChannelOpenInKeys'), 'channel workbench no jump-primary CTA');
{
  const formStart = pad.indexOf('function buildLayoutKeyFormHtml');
  assert.ok(formStart > 0, 'buildLayoutKeyFormHtml present');
  const formSlice = pad.slice(formStart, formStart + 1800);
  assert.ok(formSlice.includes('layoutKeyChord'), 'form keeps chord');
  assert.ok(!formSlice.includes('layoutKeyPhrasesField'), 'form drops text phrases');
  assert.ok(!formSlice.includes('layoutKeyFocus'), 'form drops focus destination');
  assert.ok(!formSlice.includes('soft-pad-layout-fn-swap'), 'fn swap not inside side form');
}
{
  const start = pad.indexOf('function renderSoftPadLayoutPanel');
  assert.ok(start > 0, 'renderSoftPadLayoutPanel present');
  const slice = pad.slice(start, start + 2800);
  assert.ok(slice.includes('soft-pad-layout-shell--key-first'), 'layout panel is key-first');
  assert.ok(slice.includes('soft-pad-flat-bind-dock'), 'layout panel has editor dock');
  assert.ok(slice.includes('setSoftPadFnSwapVisible(true)'), 'layout panel opens left fn list');
  assert.ok(!slice.includes('soft-pad-app-cmd'), 'layout panel has no flat app-cmd wall');
  assert.ok(!slice.includes('data-soft-pad-flat-bind="1"'), 'layout panel has no flat bind list');
  assert.ok(!slice.includes('buildSoftPadFlatBindListHtml'), 'layout panel does not build flat wall');
  assert.ok(!slice.includes('soft-pad-bind-steps'), 'layout panel drops bind-steps strip');
}
{
  const start = pad.indexOf('function renderCapabilityList');
  assert.ok(start > 0, 'renderCapabilityList present');
  const slice = pad.slice(start, start + 900);
  assert.ok(!slice.includes('layoutActionSceneId = sceneFromSlot'), 'cap list does not reset scene tab');
}

assert.ok(i18n.includes("softPadKeyFnSwapLbl:"), 'fn swap label i18n');
assert.ok(i18n.includes("softPadFnChannelLead:"), 'channel lead i18n');
assert.ok(css.includes('soft-pad-fn-subs'), 'css horizontal fn sub tabs');
assert.ok(css.includes('soft-pad-mid-stack--fused'), 'css fused preview+ability card');
assert.ok(css.includes('max-width: 340px'), 'css constrains preview host width');
assert.ok(css.includes('height: 100%'), 'css three-col fills height');
assert.ok(css.includes('#settingsPanelSoftPad.soft-pad-page'), 'css soft-pad panel fills wrap');
assert.ok(css.includes('soft-pad-fn-card__detail'), 'css detailed fn cards');
assert.ok(css.includes('soft-pad-fn-channel-block'), 'css channel block in left column');
assert.ok(pad.includes('renderSoftPadFnSubs'), 'pad paints horizontal subs');
assert.ok(pad.includes('data-fn-scene="all"') || pad.includes("data-fn-scene=\"all\""), 'all vibe job pill');
assert.ok(pad.includes('openSoftPadSemanticPick'), 'semantic pick helper (modal)');
assert.ok(pad.includes('softPadFnQuery'), 'fn search state');
assert.ok(pad.includes('normalizeLayoutActionSceneId'), 'legacy→vibe remap');
assert.ok(css.includes('soft-pad-fn-find'), 'css fn search');
assert.ok(i18n.includes('softPadFnJobAll:'), 'job all i18n');
assert.ok(
  i18n.includes("softPadKeyFnSwapLbl:'按键'") ||
    i18n.includes("softPadFloatTabKeys:'按键'") ||
    i18n.includes('这颗键做什么'),
  'keys / float tab label'
);
assert.ok(!i18n.includes("softPadFnSapPeer:'语义目录'"), 'no 语义目录 i18n peer');
assert.ok(html.includes('id="softPadFnSearch"'), 'fn search host');
assert.ok(pad.includes('applySoftPadCapabilityPick'), 'pad click left maps onto current Soft Pad key');
assert.ok(pad.includes("upsertRoute(m, pad, other, { slotId: '', enabled: false }"), 'pad steals slot from other key when mapping');
assert.ok(pad.includes('findMicroKeyForSlot'), 'pad finds key for capability');
assert.ok(html.includes('id="softPadFnSubs"'), 'fn subs host');
assert.ok(html.includes('id="softPadFnChannelBlock"'), 'channel block host');
assert.ok(html.includes('soft-pad-mid-stack--fused'), 'fused mid stack mark');
assert.ok(!html.includes('softPadRailKeysBadge'), 'no 另页 badges on rail');
assert.ok(i18n.includes("softPadFnUnboundOnPad:"), 'fn unbound-on-pad i18n');
assert.ok(css.includes('is-need-agent'), 'css hides right col until agent loaded');
assert.ok(hub.includes('syncSoftPadNeedAgentChrome'), 'hub syncs need-agent chrome');
assert.ok(hub.includes('softPadAgentReady'), 'hub gates on concrete agent');
assert.ok(i18n.includes('softPadNeedAgentTitle:'), 'need-agent title i18n');
assert.ok(html.includes('当前应用') || html.includes('softPadPreviewColLbl'), 'right app label');
// Mid card: tabs + keys/style/agent page content (fn-swap nested under ability).
{
  const faceStart = html.indexOf('id="softPadFacePad"');
  const stackStart = html.indexOf('id="softPadMidStack"');
  const tabsStart = html.indexOf('id="softPadPadTabs"');
  const abilityStart = html.indexOf('id="softPadSubpageHost"');
  const fnSwapStart = html.indexOf('id="softPadFnSwapHost"');
  const bodyStart = html.indexOf('id="softPadSubpageBody"');
  assert.ok(faceStart > 0 && stackStart > faceStart, 'mid stack inside face-pad');
  assert.ok(abilityStart > stackStart, 'ability after mid stack');
  assert.ok(tabsStart > abilityStart && tabsStart < bodyStart, 'pad tabs inside mid-ability card');
  assert.ok(bodyStart > tabsStart && bodyStart < fnSwapStart || bodyStart > tabsStart,
    'subpage body with tabs in same card');
  assert.ok(fnSwapStart > abilityStart && fnSwapStart < html.indexOf('id="softPadPadRing"'),
    'fn-swap nested in mid-ability card');
  const stackSlice = html.slice(stackStart, abilityStart);
  assert.ok(!stackSlice.includes('id="softPadPadTabs"'), 'tabs not on Soft Pad preview stack');
  assert.ok(!stackSlice.includes('id="softPadSubpageHost"'), 'ability not nested in mid-stack');
}
assert.ok(hub.includes('softPadKeysWorkbenchOpen'), 'keys workbench gate');
assert.ok(hub.includes('softPadFloatDock'), 'float dock hidden outside keys');
assert.ok(css.includes('.soft-pad-mid-ability .soft-pad-style-panel'), 'mid-ability hosts style/more panels');
assert.ok(css.includes('.soft-pad-style-panel .soft-pad-numpad-mode'), 'style panel reuses numpad card styles');

assert.match(hub, /function syncPadTabs\([\s\S]*?softPadAgentReady/);
assert.ok(hub.includes('panelWb'), 'style/agent shows mid-ability on right');
assert.ok(css.includes('> .soft-pad-mid-ability'), 'css places mid-ability on right grid track');
assert.ok(
  css.includes('.soft-pad-face-pad--desk > .soft-pad-face-pad__panel:not(.soft-pad-mid-ability)'),
  'desk panel unset excludes mid-ability grid cell'
);
assert.ok(
  /function setDetailOpen\([\s\S]*?Do NOT removeAttribute\('hidden'\)/.test(hub),
  'setDetailOpen does not force-show mid-ability'
);
assert.ok(pad.includes('soft-pad-style-panel'), 'style panel restored');
assert.ok(pad.includes("btn('show'") && pad.includes("btn('skin'"), 'style helpers keep 何时显示 + 皮肤');
assert.ok(pad.includes('omitSubtabs'), 'top tabs own show/skin — panel omits nested subtabs');
assert.ok(i18n.includes("softPadPadTabShow:'何时显示'"), '何时显示 top-tab i18n');
assert.ok(i18n.includes("softPadPadTabSkin:'皮肤'"), '皮肤 top-tab i18n');
assert.ok(pad.includes('function renderSoftPadMorePanel'), 'more panel helper kept');
assert.ok(hub.includes("VALID_SOFT_PAD_PAD_MODES = { keys: 1, show: 1, skin: 1 }") ||
  /VALID_SOFT_PAD_PAD_MODES\s*=\s*\{\s*keys:\s*1,\s*show:\s*1,\s*skin:\s*1\s*\}/.test(hub),
  'pad modes keys/show/skin');
assert.ok(
  /function buildSoftPadFloatDockHtml[\s\S]*?is-keys-only/.test(pad),
  'float dock keys-only (show/skin moved to top tabs)'
);
assert.ok(html.includes('何时显示') && html.includes('皮肤'), 'html top tabs 何时显示/皮肤');
assert.ok(!html.includes('data-pad-mode="style"'), 'html drops 样子 mode');
assert.ok(!/data-i18n="softPadPadTabMore"/.test(html), 'html drops 更多 tab');

console.log('ok softpad-three-col-layout');
