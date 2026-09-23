/**
 * Soft Pad C IA face routing — static self-check (no DOM).
 * Fails if softPadView returns as a live driver, or face/mode helpers are missing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'src/js/features/agent/soft-pad-hub-ui.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
const tm = fs.readFileSync(path.join(root, 'src/js/features/agent/soft-pad-time-machine-ui.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/css/soft-pad-hub.css'), 'utf8');

let fail = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    fail++;
  } else {
    console.log('PASS', msg);
  }
}

const liveView = src.match(/(?:^|[^/\w])softPadView(?:\s*=|\s*===|\s*!==|\()/gm) || [];
assert(liveView.length === 0, 'softPadView has zero live reads/assignments');
assert(/var softPadFace = 'pad'/.test(src), 'softPadFace default pad');
assert(/var softPadPadMode = 'keys'/.test(src), 'softPadPadMode default keys');
assert(/function softPadPanelId\(/.test(src), 'softPadPanelId helper');
assert(/function setSoftPadFace\(/.test(src), 'setSoftPadFace');
assert(/function setSoftPadPadMode\(/.test(src), 'setSoftPadPadMode');
assert(/function syncFaceChrome\(/.test(src), 'syncFaceChrome');
assert(/function legacyViewToRoute\(/.test(src), 'legacyViewToRoute');
assert(/function previewHostForFace\(/.test(src), 'previewHostForFace');
assert(/e\.padRing\.hidden = true/.test(src), 'pad ring retired hidden');
assert(/e\.padTabs\.addEventListener/.test(src), 'pad tabs bound in bindChrome');
assert(/getView:\s*function\s*\(\)\s*\{\s*return softPadPanelId\(\)/.test(src), 'getView → softPadPanelId');
assert(/facePad:|faceAgent:|faceTimeline:/.test(src), 'els() face roots');
assert(/softPadAgentPreviewHost/.test(src) && /softPadTmPreviewHost/.test(src), 'per-face preview hosts');
assert(/PAD_MODE_TO_PANEL/.test(src) && /PANEL_TO_PAD_MODE/.test(src), 'pad mode ↔ panel maps');
assert(/mode === 'lights' \|\| mode === 'mini'/.test(src), 'lights/mini normalize to skin');
assert(/function isAgentWorkbenchMode\(/.test(src), 'isAgentWorkbenchMode helper');
assert(/face === 'agent'[\s\S]*?setSoftPadPadMode/.test(src), 'setSoftPadFace(agent) → padMode');
assert(/goSoftPadFlowNode[\s\S]*?setSoftPadPadMode\('skin'/.test(src),
  'legacy flow node agent → skin padMode');
assert(/goSoftPadFlowNode[\s\S]*?nodeId === 'timeline'[\s\S]*?return;/.test(src),
  'flow node timeline retired (no setSoftPadFace)');
assert(/canPaint = true/.test(src), 'timeline keeps Soft Pad preview');

assert(html.includes('id="softPadFacePad"'), 'html face pad root');
assert(html.includes('id="softPadFaceAgent"'), 'html face agent root');
assert(html.includes('id="softPadFaceTimeline"'), 'html face timeline root');
assert(html.includes('id="softPadPadTabs"'), 'html pad mode tabs');
assert(html.includes('data-pad-mode="show"'), 'html 何时显示 tab');
assert(html.includes('data-pad-mode="keys"'), 'html keys tab');
assert(html.includes('data-pad-mode="skin"'), 'html 皮肤 tab');
assert(!html.includes('data-pad-mode="look"'), 'html look tab removed');
assert(html.includes('id="softPadPadTabShow"'), 'html show tab id');
assert(html.includes('id="softPadPadTabSkin"'), 'html skin tab id');
assert(!html.includes('data-pad-mode="style"'), 'html style tab promoted to show');
assert(!html.includes('data-pad-mode="agent"'), 'html agent tab promoted to skin');
assert(!html.includes('data-pad-mode="purpose"'), 'html purpose tab folded into show');
assert(!html.includes('data-pad-mode="lights"') && !html.includes('id="softPadPadTabLights"'),
  'html lights tab folded into skin');
assert(!html.includes('data-pad-mode="mini"') && !html.includes('id="softPadPadTabMini"'),
  'html mini tab folded into skin');
assert(!html.includes('id="softPadFlowNodes"'), 'html face-seg retired');
assert(html.includes('id="softPadAgentBody"'), 'html agent body host');
assert(!html.includes('id="softPadAgentDirectory"'), 'html agent directory removed');
assert(html.includes('id="cameraWorkflowTabsBar"'), 'html camera status bar');
assert(html.includes('id="softPadTmDetailHost"'), 'html tm detail host');
assert(!/01 \/ Soft Pad/.test(html), 'flow node tags drop 01/ numbering');
assert(!html.includes('id="softPadPadChassis"') || html.includes('soft-pad-pad-ring" id="softPadPadRing" hidden'), 'pad chassis ring not main path');

assert(/soft-pad-face-pad/.test(css), 'css C1 face grid');
assert(/soft-pad-face-agent/.test(css), 'css C2 face grid');
assert(/soft-pad-face-timeline/.test(css), 'css C3 face grid');
assert(/soft-pad-tm-spine/.test(css), 'css C3 horizontal spine');
assert(/soft-pad-tm-mark/.test(tm), 'tm spine mark markup');
assert(/#softPadPreviewHost\.soft-pad-preview-host|soft-pad-right-col__preview|168px minmax\(0, 1fr\) minmax\(220px, 260px\)/.test(css),
  'hub Soft Pad preview in three-col right column');
assert(/\.soft-pad-face-agent[\s\S]{0,1200}?max-width:\s*300px/.test(css),
  'C2 Soft Pad preview compact');
assert(/\.soft-pad-face-agent[\s\S]{0,800}?grid-template-columns:\s*minmax\(220px,\s*0\.34fr\)\s*minmax\(320px,\s*1fr\)/.test(css),
  'C2 agent face 2-column grid');
assert(!/\.soft-pad-face-agent__directory/.test(css), 'C2 agent directory column css removed');
assert(/renderSoftPadScopeMenuItems/.test(src), 'hub exports agent scope menu for unified bar');
assert(/softPadScopeSwitchLabel/.test(src), 'hub exports scope switch label');
assert(/function setBindAppMenuOpen\(open\)/.test(src), 'bind menu open helper');
assert(!/function setBindAppMenuOpen\(open\) \{\s*if \(global\.__otSoftPadStatusMounted\) return/.test(src),
  'bind menu works from preview hint even when status island mounted');
assert(/softPadPreviewHint/.test(src), 'hub wires preview hint chrome');
assert(/getSoftPadFace:\s*function/.test(src), 'hub exports getSoftPadFace for island');
assert(/OneToneSoftPadHubUi\s*=\s*global\.OneToneSoftPadHub/.test(src), 'hub Ui alias for repaint hooks');
assert(!/soft-pad-hub-page\.is-face-agent \.soft-pad-bind-app[\s\S]*display:\s*none/.test(css),
  'agent face does not hide bind dropdown');
assert(/\.soft-pad-agent-workbench__tabs/.test(css), 'workbench horizontal tabs css');
assert(/\.soft-pad-agent-workbench__panel/.test(css), 'workbench panel css');
assert(/\.soft-pad-hub-page\.is-face-agent #softPadAppSwitcher[\s\S]*?display:\s*none/.test(css),
  'agent face hides app switcher ribbon');
assert(!/\.soft-pad-page-body\.is-face-agent #softPadSchemeAside[\s\S]*?display:\s*flex/.test(css),
  'agent face no longer shows page aside');
assert(/function renderAgentDirectory\(/.test(src), 'renderAgentDirectory helper');
assert(/schemeListHidden:\s*onAgentFace/.test(src), 'workflow model hides scheme list on agent face');
assert(/function renderForegroundAppBarHtml\(/.test(src), 'foreground app bar helper kept');
assert(/is-face-agent/.test(src), 'syncFaceChrome toggles is-face-agent');
assert(/\.soft-pad-face-tm[\s\S]{0,1200}?max-width:\s*300px/.test(css),
  'C3 Soft Pad preview compact');

assert(/softPadTmDetailHost/.test(tm), 'tm detail paints into face host');
assert(!/stage\.classList\.toggle\('is-tm-desk'/.test(tm), 'tm does not toggle stage is-tm-desk');

const padUi = fs.readFileSync(path.join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');
assert(!/function renderStatusLightsSimple\(/.test(padUi), 'v12d removed legacy renderStatusLightsSimple');
assert(!/function renderAgentLightsPicker\(/.test(padUi), 'v12d removed renderAgentLightsPicker');
assert(/function workbenchPreviewOpts\(/.test(padUi), 'workbenchPreviewOpts for contextual preview');
assert(/stripMode/.test(padUi), 'preview stripMode contextual');
assert(/function renderAgentWorkbench\(/.test(padUi), 'renderAgentWorkbench');
assert(/TOPBAR_LIGHT_CANDIDATES/.test(padUi), 'TOPBAR_LIGHT_CANDIDATES registry');
assert(/function renderTopbarLightsPanel\(/.test(padUi), 'renderTopbarLightsPanel');
assert(/data-agent-workbench/.test(padUi), 'agent panel data-agent-workbench');
assert(/data-agent-workbench-tab/.test(padUi), 'workbench horizontal tab marker');
assert(/function bindAgentWorkbenchSubtabEvents\(/.test(padUi), 'bindAgentWorkbenchSubtabEvents');
assert(/function getSoftPadWorkbenchTab\(/.test(padUi), 'getSoftPadWorkbenchTab export');
assert(/omitFaceTopbar/.test(padUi), 'agent face omitFaceTopbar preview dedup');
assert(/renderAgentWorkbench\(m, pad,\s*opts\)/.test(padUi),
  'agent panel uses renderAgentWorkbench with opts');
assert(/data-connect-mode="scope"/.test(padUi), 'connect scope mode marker');
assert(/data-connect-mode="fold"/.test(padUi), 'connect fold mode marker');
assert(/previewUsagePropsForScope/.test(src), 'hub exports preview usage for left strip');
assert(/paintTopbarPreviewChipStatus[\s\S]{0,500}?previewHostForFace/.test(padUi),
  'topbar chip status paints agent preview host');
assert(/function patchAgentLeftDataStrip\(/.test(padUi), 'left data strip can patch live usage');
assert(/Pad\.workbenchPreviewOpts/.test(src), 'agent paintPreview uses workbenchPreviewOpts');
assert(/data-agent-match-panel/.test(padUi), 'v16 match panel marker');
assert(/data-agent-data-live/.test(padUi), 'data panel live reading marker');
assert(/soft-pad-agent-data-live__grid/.test(padUi), 'data live uses metric grid not readiness row');
assert(/previewUsageDetailForScope/.test(src), 'hub exports detailed usage for data panel');
assert(/softPadDataCursorTurns/.test(padUi), 'cursor live splits turns metric');
assert(/softPadDataCursorLead/.test(padUi) || /renderCursorActivityConsentCard/.test(
  padUi.slice(padUi.indexOf('function renderAgentDataPanel'), padUi.indexOf('function renderAgentMiniPanel'))
), 'cursor data panel hosts activity consent');
assert(/\.soft-pad-agent-data-live__metric/.test(css), 'css data live metric row');
assert(/data-agent-data-panel/.test(padUi), 'v16 data panel marker');
assert(/data-agent-mini-panel/.test(padUi), 'v16 mini panel marker');
assert(/data-mini-five-chrome/.test(padUi), 'mini panel five-chrome IA marker');
assert(/showMini = face === 'mini' && pad\.presentation === 'mini'/.test(padUi),
  'mini preview only when presentation is mini');
assert(/stripMode: showMini \? 'focus'/.test(padUi),
  'mini preview uses focus strip; full keyboard uses full');
assert(/#softPadPreviewHost\.is-agent-preview-mini/.test(css),
  'mini hide rules target softPadPreviewHost (not only retired agent host)');
assert(/demoMiniBarChipsHtml/.test(padUi), 'empty mini strip falls back to demo chips');
assert(/syncStatusLightsPreviewChrome\(previewHostC/.test(padUi),
  'mini chrome toggle re-paints left preview');
assert(/softPadMiniBarHint/.test(padUi) && /softPadMiniFullHint/.test(padUi),
  'display cards hint mini abbrev vs full data');
assert(/data-act="mini-chrome"/.test(padUi), 'mini chrome toggles');
assert(/data-act="mini-tool-id"/.test(padUi), 'mini tool id toggles');
assert(/soft-pad-agent-mini-tool__ico|MINI_TOOL_SVG/.test(padUi), 'mini tools show icon chips');
assert(/soft-pad-agent-mini-rail__ico|MINI_RAIL_ICO/.test(padUi), 'mini rail shows section icons');
assert(/softPadMiniDisplayTitle|浮窗形态/.test(padUi), 'display rail renamed away from 小条外观');
assert(/soft-pad-agent-mini-demo-banner|miniRailCoach/.test(padUi), 'left preview demo coach banner');
assert(/data-mini-zone/.test(padUi), 'preview zones for rail linkage');
assert(/soft-pad-agent-mini-look__sketch/.test(padUi), 'presentation has visual sketch compare');
assert(/softPadMiniExpandShow|放大到完整键盘/.test(padUi), 'expand/close labels clarified');
assert(/data-mini-auto-roster|renderMiniAutoRoster/.test(padUi), 'mini roster uses auto-load panel');
assert(/softPadWorkbenchTabMatch/.test(padUi), 'L3 match tab label');
assert(/function normalizeWorkbenchTab\(/.test(padUi), 'legacy tab migrate helper');
assert(/data-cross-topbar-merged/.test(padUi), 'cross-app merged list marker');
assert(/function renderCrossTopbarMergedPanel\(/.test(padUi), 'renderCrossTopbarMergedPanel');
assert(!/renderCrossTopbarMergedPanel\(pad/.test(
  padUi.slice(padUi.indexOf('function renderAgentMiniPanel'), padUi.indexOf('function renderAgentCrossPanel'))
), 'mini panel does not host merged connect roster');
assert(/renderMiniAutoRoster\(pad\)|ensureAutoTopbarLights/.test(
  padUi.slice(padUi.indexOf('function renderAgentMiniPanel'), padUi.indexOf('function renderAgentCrossPanel'))
), 'mini panel hosts auto roster not manual add');
assert(/cmd_codex_micro_pad_set_mini_usage_pill/.test(padUi), 'mini pill quiet persist IPC');
assert(/cmd_codex_micro_pad_set_mini_chrome/.test(padUi), 'mini chrome quiet persist IPC');
assert(/\.soft-pad-agent-mini-bar__pill/.test(css), 'css mini bar preview pill');
const appIpc = fs.readFileSync(path.join(root, 'src-tauri/permissions/app-ipc.toml'), 'utf8');
assert(/allow-cmd-codex-micro-pad-set-mini-usage-pill/.test(appIpc), 'app-ipc allows mini usage pill');
assert(/allow-cmd-codex-micro-pad-set-presentation/.test(appIpc), 'app-ipc allows presentation');
assert(/allow-cmd-codex-micro-pad-set-mini-chrome/.test(appIpc), 'app-ipc allows mini chrome');
assert(fs.existsSync(path.join(root,
  'src-tauri/permissions/autogenerated/cmd_codex_micro_pad_set_mini_usage_pill.toml')),
  'autogenerated mini usage pill permission');
assert(fs.existsSync(path.join(root,
  'src-tauri/permissions/autogenerated/cmd_codex_micro_pad_set_presentation.toml')),
  'autogenerated presentation permission');
assert(fs.existsSync(path.join(root,
  'src-tauri/permissions/autogenerated/cmd_codex_micro_pad_set_mini_chrome.toml')),
  'autogenerated mini chrome permission');
assert(!/data-act="agent-light"/.test(
  padUi.slice(padUi.indexOf('function renderAgentReadinessPanel'), padUi.indexOf('function renderAgentLightsPanel'))
), 'readiness panel no topbar checkbox');
assert(!/data-act="agent-light"/.test(
  padUi.slice(padUi.indexOf('function renderLightsKeysTab'), padUi.indexOf('function renderLightTemplateCards'))
), 'keys tab no topbar enable checkbox');
assert(/softPadReadinessTopbarHint/.test(padUi), 'readiness points to mini bar for topbar');
assert(/softPadMiniRosterTitle|谁在忙/.test(padUi), 'mini roster title');
assert(/softPadMiniSpeechTitle|softPadMiniVoiceTitle|听你说话|听/.test(padUi), 'mini speech block');
assert(/data-mini-block=/.test(padUi) && /softPadMiniToolsTitle|快捷钮/.test(padUi), 'mini tools block marker');
assert(/data-act="mini-rail"/.test(padUi), 'mini rail nav');
assert(/soft-pad-agent-mini-rail-layout/.test(padUi), 'mini C rail layout');
assert(/soft-pad-agent-mini-bar__listen|listen-chip-icon|softPadMiniSpeech/.test(padUi), 'listen icon preview');
assert(/overlay-mini__listen-chip-icon|viewBox="0 0 24 24"/.test(
  fs.readFileSync(path.join(root, 'src/codex-micro-overlay.html'), 'utf8')),
  'overlay listen mic icon');
assert(/data-act="mini-settings"/.test(
  fs.readFileSync(path.join(root, 'src/codex-micro-overlay.html'), 'utf8')),
  'overlay mini settings jump');
assert(/softPadMini|setSoftPadWorkbenchTab/.test(padUi), 'mini settings lands on workbench mini');
assert(/overlay-mini-listen[\s\S]{0,500}?overlay-mini__listen-chip/.test(
  fs.readFileSync(path.join(root, 'src/codex-micro-overlay.html'), 'utf8')),
  'listen chip lives in speech preview band');
assert(/renderMiniAutoRoster|ensureAutoTopbarLights/.test(padUi), 'who-is-busy auto roster');
assert(/soft-pad-agent-mini-bar__speech|data-mini-speech/.test(padUi), 'preview speech band');
assert(/data-agent-preview-face/.test(padUi), 'left preview follows L3 face');
assert(/data-agent-left-data/.test(padUi), 'left data strip marker');
assert(/data-agent-mini-bar/.test(padUi), 'mini bar preview marker');
assert(/MiniChromeConfig/.test(fs.readFileSync(path.join(root, 'src-tauri/src/config.rs'), 'utf8')),
  'config has MiniChromeConfig');
assert(/cmd_codex_micro_pad_set_mini_chrome/.test(
  fs.readFileSync(path.join(root, 'src-tauri/src/lib.rs'), 'utf8')),
  'lib registers mini chrome cmd');
assert(/miniChromeOf|applyMiniChromeChrome/.test(
  fs.readFileSync(path.join(root, 'src/codex-micro-overlay.html'), 'utf8')),
  'overlay applies mini chrome');
{
  const overlayHtml = fs.readFileSync(path.join(root, 'src/codex-micro-overlay.html'), 'utf8');
  assert(/function applyMiniToolsRow\(/.test(overlayHtml), 'overlay fills tools row for all agents');
  assert(/function defaultMiniToolSlots\(/.test(overlayHtml), 'overlay has default mini tool slots');
  assert(/data-pad-only="1"/.test(overlayHtml), 'non-beginner tools use pad-only fire');
  assert(/ICON\[|action-icon/.test(overlayHtml) && !/function miniToolGlyph\(/.test(overlayHtml),
    'overlay tools use icons not Chinese glyphs');
  assert(/overlay-mini__action--settings[\s\S]{0,200}?data-act="mini-settings"/.test(overlayHtml),
    'settings sits on hover tools row');
}
assert(!/<details class="soft-pad-agent-cross-topbar" data-agent-cross-topbar>/.test(
  padUi.slice(padUi.indexOf('function renderAgentWorkbench'), padUi.indexOf('function renderStatusLightsPreviewLegend'))
), 'workbench no folded cross-topbar details');
assert(!/softPadLightsCapTopbar/.test(
  padUi.slice(padUi.indexOf('function renderAgentWorkbench'), padUi.indexOf('function renderStatusLightsPreviewLegend'))
), 'workbench lights tab no duplicate topbar row');
assert(/\.soft-pad-agent-mini-bar/.test(css), 'css mini bar preview');
assert(/\.soft-pad-agent-left-data/.test(css), 'css left data strip');
assert(/soft-pad-face-agent[\s\S]{0,180}?min-width:\s*560px/.test(css),
  'agent face keeps L|R under 1100px');
assert(!/fillStatusLightsAdvanced[\s\S]*?renderAgentLightsPicker/.test(padUi),
  'advanced section no global agent lights picker');
assert(/data-lights-topbar-preview/.test(padUi), 'left preview topbar strip marker');
assert(/function renderTopbarPreviewStrip\(/.test(padUi), 'renderTopbarPreviewStrip');
assert(/\.soft-pad-lights-topbar-preview/.test(css), 'css topbar preview strip');
assert(/\.soft-pad-topbar-lights-card/.test(css), 'css topbar monitor card');
assert(!/renderSoftPadMoreBody[\s\S]*?renderAgentLightsPicker/.test(padUi),
  'Soft Pad more body no topbar picker');
assert(/data-agent-workbench/.test(padUi), 'agent panel data-agent-workbench');
assert(/function renderSoftPadPurposePanel\(/.test(padUi), 'purpose panel renderer');
assert(/function renderSoftPadRuntimePanel\([\s\S]*?renderSoftPadDisplayPanel/.test(padUi) &&
  !/function renderSoftPadRuntimePanel\([\s\S]*?renderNumpadMapHtml\(pad\)/.test(
    padUi.slice(padUi.indexOf('function renderSoftPadRuntimePanel'), padUi.indexOf('function buildSoftPadPresentationSkinSectionHtml'))
  ), 'runtime panel delegates to display (no inline demos)');
assert(/function renderSoftPadPurposePanel\([\s\S]*?renderNumpadMapHtml\(pad\)/.test(padUi),
  'purpose panel hosts feature controls');
assert(/function paintSoftPadPadModePreview\(/.test(padUi) &&
  /function renderPurposeFeatureDemoHtml\(/.test(padUi) &&
  /function buildSoftPadDisplayPreviewHtml\(/.test(padUi) &&
  /function buildSoftPadAppearLivePadHtml\(/.test(padUi),
  'appear/purpose demos paint into left preview');
assert(/function buildSoftPadDisplayControlsHtml\([\s\S]*?renderShowModeTabsHtml/.test(padUi) &&
  /function buildSoftPadDisplayControlsHtml\([\s\S]*?buildSoftPadPresentationSkinSectionHtml/.test(padUi) &&
  !/function buildSoftPadDisplayControlsHtml\([\s\S]*?renderShowModeSceneHtml/.test(padUi),
  'display controls host skins, omit scene');
(function () {
  var start = padUi.indexOf('function buildSoftPadDisplayPreviewHtml(');
  var end = padUi.indexOf('function mapAgentPageShowMode(', start + 1);
  var slice = start >= 0 && end > start ? padUi.slice(start, end) : '';
  // 何时出现：scene animation only — live Soft Pad would hide the switch demo.
  assert(/renderShowModeSceneHtml/.test(slice) &&
    !/buildSoftPadPresentationSkinSectionHtml/.test(slice),
    'display preview is scene animation, not skin cards');
})();
assert(/function renderNumpadMapHtml\([\s\S]*?data-act="numpadMode"/.test(padUi) &&
  !/function renderNumpadMapHtml\([\s\S]*?soft-pad-demo-compare/.test(
    padUi.slice(
      padUi.indexOf('function renderNumpadMapHtml'),
      padUi.indexOf('function renderSoftPadRuntimePanel')
    )
  ),
  'purpose controls omit inline demos');
assert(/soft-pad-feature-subtab/.test(padUi) && /data-feature-tab/.test(padUi),
  'purpose feature demos use subtabs');
assert(/function renderShowModeTabsHtml\(/.test(padUi) && /data-show-mode/.test(padUi),
  'runtime show mode uses horizontal subtabs');
assert(/empty\.mode === 'ready'[\s\S]*?return ''/.test(src),
  'ready panel chrome returns empty (no idle primary shell)');
assert(/soft-pad-action-library/.test(padUi) && /data-soft-pad-action-list/.test(padUi) &&
  /mode:\s*'modal'/.test(padUi),
  'layout uses action list + modal editor');
assert(/function renderSoftPadRuntimePanel\([\s\S]*?renderSoftPadDisplayPanel/.test(padUi),
  'runtime panel delegates to display (show mode + skin)');
assert(
  /168px minmax\(0, 1fr\) minmax\(220px, 260px\)/.test(css) || /soft-pad-right-col__preview/.test(css),
  'C1 Soft Pad preview sits in three-col right column'
);
assert(/commitEditKeycapDraft/.test(padUi) && /keepOpen:\s*true/.test(padUi),
  'key editor autosaves on pick');
assert(/micro-hw-modal__guide/.test(padUi) && /data-guide-label="action"/.test(padUi),
  'key editor uses icon guide instead of long lead');
assert(/micro-hw-modal__close-x/.test(padUi), 'key editor close has designed icon');
assert(/data-act="close"/.test(padUi) && !/soft-pad-keycap-editor__foot/.test(
  padUi.slice(padUi.indexOf('function buildEditKeycapInnerHtml'), padUi.indexOf('function clearEditKeycapDomHosts'))
) && !/data-act="cancel"/.test(
  padUi.slice(padUi.indexOf('function buildEditKeycapInnerHtml'), padUi.indexOf('function clearEditKeycapDomHosts'))
), 'key editor closes from header only');
assert(/preferred\.id === 'softPadAgentBody'/.test(padUi), 'agent body paint host not redirected');
assert(/preferred\.id !== 'softPadPreviewHost'/.test(padUi), 'face preview hosts not redirected to pad island');
assert(/useIsland = softPadFace === 'pad'/.test(src), 'preview island only on pad face');

assert(/soft-pad-agent-registry\.js/.test(html), 'agent registry script in html');
assert(/function listAgentRegistry\(/.test(
  fs.readFileSync(path.join(root, 'src/js/features/agent/soft-pad-agent-registry.js'), 'utf8')
), 'agent registry listAgentRegistry');
assert(/data-light-template-scope="keys"/.test(padUi),
  'v12 scoped light template pickers for keys');
assert(/data-lights-preview-accent/.test(padUi), 'v12 preview accent attribute');
assert(/\.soft-pad-lights-subtabs/.test(css) && /data-lights-preview-accent="ambient"/.test(css),
  'v12 subtabs and preview accent css');
assert(!/\.soft-pad-hub-page\.is-face-agent \.soft-pad-bind-app[\s\S]*?display:\s*none/.test(css),
  'v15c agent face keeps status-bar bind app');
assert(/data-strip-mode/.test(padUi), 'preview strip mode attribute');
assert(/function clearStatusLightsPreviewChrome\(/.test(padUi), 'clearStatusLightsPreviewChrome helper');
assert(/paintSoftPadPadModePreview[\s\S]*?clearStatusLightsPreviewChrome/.test(padUi),
  'appear/purpose demos clear leftover lights chrome');
assert(/habitKindForMappingId/.test(padUi) && /enabledKinds\[kind\]/.test(padUi),
  'full topbar strip skips habit chips that duplicate agent kinds');
assert(/getSoftPadFace\(\) === 'agent'/.test(padUi),
  'Soft Pad preview omits face topbar for merged lights/mini');
assert(/!isAgentWorkbenchMode\(\)\) \? undefined : \{ force: true \}/.test(src),
  'lights/mini force Soft Pad preview remount + chrome');
assert(/forceRemount: isAgentWorkbenchMode\(\)/.test(src),
  'agent workbench bind select forceRemounts lights panel');
assert(/Pad\.renderSoftPadAgentPanel/.test(src),
  'hub keeps agent workbench path for legacy panel id');
assert(/function renderSoftPadStylePanel\(/.test(padUi) && /omitSubtabs/.test(padUi),
  'style panel omit nested subtabs (top tabs own show/skin)');
assert(/btn\('show'/.test(padUi) && /btn\('skin'/.test(padUi) && /softPadStyleSubtabSkin/.test(padUi),
  'style helpers keep 何时显示 + 皮肤');
assert(/VALID_SOFT_PAD_PAD_MODES\s*=\s*\{\s*keys:\s*1,\s*show:\s*1,\s*skin:\s*1\s*\}/.test(src),
  'pad modes keys/show/skin');
assert(/hideWorkbenchTabs/.test(padUi) && /foldDataIntoMini/.test(padUi) &&
  /data-hide-workbench-tabs/.test(padUi),
  'agent workbench honors flat Soft Pad tabs');
assert(/getSelectedScopeId:\s*function/.test(src) && /iconForKind:\s*iconForKind/.test(src),
  'hub exports scope id and iconForKind for topbar focus');
assert(/is-focused/.test(padUi) && /\.is-focused/.test(css),
  'topbar preview chip focus class + css');
assert(/agentLightIconSrc/.test(padUi) && /focusAgent/.test(padUi),
  'topbar icons resolve via presets and focusAgent');
assert(/CREATE_NO_WINDOW/.test(
  fs.readFileSync(path.join(root, 'src-tauri/src/shell_agent_hook_setup.rs'), 'utf8')
), 'shell hook node -v uses CREATE_NO_WINDOW');
assert(/CREATE_NO_WINDOW/.test(
  fs.readFileSync(path.join(root, 'src-tauri/src/claude_hook_setup.rs'), 'utf8')
), 'claude hook node -v uses CREATE_NO_WINDOW');
assert(/CREATE_NO_WINDOW/.test(
  fs.readFileSync(path.join(root, 'src-tauri/src/cursor_hook_setup.rs'), 'utf8')
), 'cursor hook node -v uses CREATE_NO_WINDOW');

// v13 habit UX: no center-column Shell Hook mount; topbar add menu; ambient solid
assert(!/mountShellAgentHookPanel\(paintHost/.test(src),
  'agent face does not mount Shell Hook into center column');
assert(!/<details class="soft-pad-topbar-light-add">/.test(padUi),
  'topbar add is not details/summary box');
assert(/data-act="topbar-add-open"/.test(padUi) && /openTopbarMonitorPicker/.test(padUi),
  'topbar add opens shared app picker in monitor mode');
assert(/mode:\s*'topbarMonitor'/.test(
  fs.readFileSync(path.join(root, 'src/js/features/mapping/app-behavior-rules.js'), 'utf8')
) || /mode==='topbarMonitor'/.test(
  fs.readFileSync(path.join(root, 'src/js/features/mapping/app-behavior-rules.js'), 'utf8')
), 'app picker supports topbarMonitor mode');
assert(/\.soft-pad-topbar-add__btn/.test(css),
  'topbar add compact button css');
assert(/data-act="ambient-mode"/.test(padUi) && /ambientSolidRgb|ambient-solid-rgb/.test(padUi),
  'ambient mode status/solid + color control');
assert(/data-act="ambient-mode"/.test(padUi) && /data-ambient-mode="solid"/.test(padUi),
  'ambient solid mode marker');
assert(/keysLightsCapability|data-keys-cap/.test(padUi),
  'keys tab capability tiers');
assert(/data-lights-keys-unsupported/.test(padUi),
  'unsupported keys habit hint');
assert(/kind === 'soft'/.test(src) && /softExtras/.test(src),
  'aside includes Soft Pad custom habits');
assert(/data-act="ambient-opacity"/.test(padUi) && /ambientOpacity/.test(padUi),
  'ambient opacity control');
assert(/ambient_opacity/.test(
  fs.readFileSync(path.join(root, 'src-tauri/src/config.rs'), 'utf8')
), 'pad config has ambient_opacity field');
assert(/data-act="key-light-preset"/.test(padUi) && /statusColors|status-color/.test(padUi),
  'key light preset + custom colors');
assert(/key_light_preset|SoftPadStatusColors/.test(
  fs.readFileSync(path.join(root, 'src-tauri/src/config.rs'), 'utf8')
), 'pad config has key light palette fields');
assert(/rgb_for_ambient_full|apply_rgb_opacity/.test(
  fs.readFileSync(path.join(root, 'src-tauri/src/pad_status/adapters/soft_rgb.rs'), 'utf8')
), 'soft_rgb opacity + palette');
assert(/grid-template-columns:\s*1fr auto auto/.test(css),
  'topbar chip remove button on far right');
assert(/ambientEnabled|ambient_enabled/.test(padUi) && /ambient_enabled/.test(
  fs.readFileSync(path.join(root, 'src-tauri/src/config.rs'), 'utf8')
), 'ambientEnabled pad flag');
assert(/applyStatusPaletteToPreview|paintKeysPaletteDemo/.test(padUi),
  'preview applies status palette + demo');
assert(/lightRgb|light_rgb/.test(padUi) && /light_rgb/.test(
  fs.readFileSync(path.join(root, 'src-tauri/src/config.rs'), 'utf8')
), 'per-key lightRgb field');
assert(/data-key-light|microHwKeyLightRgb|--key-light-rgb/.test(padUi + css),
  'per-key light color UI + preview tint');
assert(/soft-pad-key-swatch-disk|key-light-swatch|edit-guide-tab/.test(padUi + css),
  'key look tab swatch disk');
assert(/echoStatusPaletteOnSoftPads|softPadPreviewHost/.test(padUi),
  'status palette echoes onto Soft Pad previews');
assert(/liveSoftPadFloatSkinLights|applySoftPadSkinAmbientPreview/.test(padUi),
  'skin float live ambient apply on Soft Pad preview');
assert(/refreshPreview === false/.test(src) && /liveSoftPadFloatSkinLights/.test(src),
  'float-dock skips remount when refreshPreview false');
assert(/floatTab === 'show' \|\| floatTab === 'skin'/.test(src) ||
  /ft === 'show' \|\| ft === 'skin'/.test(src) ||
  /ftSel !== 'show' && ftSel !== 'skin'/.test(src),
  'keys preview paint skips while float tab is show/skin');

if (fail) {
  console.error(fail + ' failed');
  process.exit(1);
}
console.log('ok soft-pad face routing');
