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
assert(/var softPadPadMode = 'appear'/.test(src), 'softPadPadMode default appear');
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
assert(/goSoftPadFlowNode[\s\S]*?setSoftPadFace\('agent'\)/.test(src), 'flow node agent → setSoftPadFace');
assert(/goSoftPadFlowNode[\s\S]*?setSoftPadFace\('timeline'\)/.test(src), 'flow node timeline → setSoftPadFace');
assert(/nodeId === 'pad'[\s\S]*?setSoftPadFace\('pad'/.test(src), 'flow node pad → setSoftPadFace');
assert(/canPaint = true/.test(src), 'timeline keeps Soft Pad preview');

assert(html.includes('id="softPadFacePad"'), 'html face pad root');
assert(html.includes('id="softPadFaceAgent"'), 'html face agent root');
assert(html.includes('id="softPadFaceTimeline"'), 'html face timeline root');
assert(html.includes('id="softPadPadTabs"'), 'html pad mode tabs');
assert(html.includes('data-pad-mode="appear"'), 'html appear tab');
assert(html.includes('data-pad-mode="keys"'), 'html keys tab');
assert(html.includes('data-pad-mode="look"'), 'html look tab');
assert(html.includes('data-pad-mode="purpose"'), 'html purpose tab');
assert(html.includes('id="softPadAgentBody"'), 'html agent body host');
assert(html.includes('id="softPadTmDetailHost"'), 'html tm detail host');
assert(!/01 \/ Soft Pad/.test(html), 'flow node tags drop 01/ numbering');
assert(!html.includes('id="softPadPadChassis"') || html.includes('soft-pad-pad-ring" id="softPadPadRing" hidden'), 'pad chassis ring not main path');

assert(/soft-pad-face-pad/.test(css), 'css C1 face grid');
assert(/soft-pad-face-agent/.test(css), 'css C2 face grid');
assert(/soft-pad-face-timeline/.test(css), 'css C3 face grid');
assert(/soft-pad-tm-spine/.test(css), 'css C3 horizontal spine');
assert(/soft-pad-tm-mark/.test(tm), 'tm spine mark markup');
assert(/#softPadPreviewHost.*micro-hw|min\(100%,\s*520px\)/.test(css), 'hub Soft Pad fills left column');
assert(/\.soft-pad-face-agent[\s\S]{0,1200}?max-width:\s*300px/.test(css),
  'C2 Soft Pad preview compact');
assert(/\.soft-pad-page-body\.is-face-agent[\s\S]*?grid-template-columns/.test(css),
  'C2 agent face enables page aside column');
assert(/\.soft-pad-page-body\.is-face-agent #softPadSchemeAside[\s\S]*?display:\s*flex/.test(css),
  'C2 agent face shows scheme aside');
assert(/function renderForegroundAppBarHtml\(/.test(src), 'foreground app bar for scheme rail');
assert(/is-face-agent/.test(src), 'syncFaceChrome toggles is-face-agent');
assert(/\.soft-pad-face-tm[\s\S]{0,1200}?max-width:\s*300px/.test(css),
  'C3 Soft Pad preview compact');

assert(/softPadTmDetailHost/.test(tm), 'tm detail paints into face host');
assert(!/stage\.classList\.toggle\('is-tm-desk'/.test(tm), 'tm does not toggle stage is-tm-desk');

const padUi = fs.readFileSync(path.join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');
assert(/function renderStatusLightsSimple\(/.test(padUi), 'renderStatusLightsSimple');
assert(/TOPBAR_LIGHT_CANDIDATES/.test(padUi), 'TOPBAR_LIGHT_CANDIDATES registry');
assert(/function renderTopbarLightsPanel\(/.test(padUi), 'renderTopbarLightsPanel');
assert(/data-lights-simple/.test(padUi), 'agent panel data-lights-simple');
assert(!/data-act="lights-topbar"/.test(
  padUi.slice(padUi.indexOf('function renderStatusLightsSimple'), padUi.indexOf('function renderStatusLightsPreviewLegend'))
), 'simple panel no duplicate topbar sync checkbox');
assert(!/fillStatusLightsAdvanced[\s\S]*?renderAgentLightsPicker/.test(padUi),
  'advanced section no global agent lights picker');
assert(/data-lights-topbar-preview/.test(padUi), 'left preview topbar strip marker');
assert(/function renderTopbarPreviewStrip\(/.test(padUi), 'renderTopbarPreviewStrip');
assert(/\.soft-pad-lights-topbar-preview/.test(css), 'css topbar preview strip');
assert(/\.soft-pad-topbar-lights-card/.test(css), 'css topbar monitor card');
assert(!/renderSoftPadMoreBody[\s\S]*?renderAgentLightsPicker/.test(padUi),
  'Soft Pad more body no topbar picker');
assert(!/data-adapter-card/.test(padUi.slice(padUi.indexOf('renderStatusLightsSimple'), padUi.indexOf('function renderSoftPadAgentPanel') + 220)),
  'simple lights path avoids adapter cards');
assert(/function renderSoftPadPurposePanel\(/.test(padUi), 'purpose panel renderer');
assert(/function renderSoftPadRuntimePanel\([\s\S]*?renderSoftPadPurposePanel/.test(padUi) &&
  !/function renderSoftPadRuntimePanel\([\s\S]*?renderNumpadMapHtml\(pad\)/.test(
    padUi.slice(padUi.indexOf('function renderSoftPadRuntimePanel'), padUi.indexOf('function renderSoftPadPurposePanel'))
  ), 'runtime panel no longer hosts feature demos');
assert(/function renderSoftPadPurposePanel\([\s\S]*?renderNumpadMapHtml\(pad\)/.test(padUi),
  'purpose panel hosts feature demos');
assert(/soft-pad-feature-subtab/.test(padUi) && /data-feature-tab/.test(padUi),
  'purpose feature demos use subtabs');
assert(/function renderShowModeTabsHtml\(/.test(padUi) && /data-show-mode/.test(padUi),
  'runtime show mode uses horizontal subtabs');
assert(/empty\.mode === 'ready'[\s\S]*?return ''/.test(src),
  'ready panel chrome returns empty (no idle primary shell)');
assert(/soft-pad-layout-key-preview/.test(padUi) && /mode:\s*'modal'/.test(padUi),
  'layout uses key preview + modal editor');
assert(/min\(100%,\s*520px\)/.test(css), 'C1 Soft Pad fills left column up to 520px');
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

assert(/softPadLightsSubtab/.test(padUi), 'v12 lights subtab state');
assert(/function getSoftPadLightsSubtab\(/.test(padUi), 'getSoftPadLightsSubtab export');
assert(/function renderStatusLightsSubtabBar\(/.test(padUi), 'renderStatusLightsSubtabBar');
assert(/btn\('topbar'/.test(padUi) && /btn\('ambient'/.test(padUi) && /btn\('keys'/.test(padUi),
  'v12 three lights subtabs');
assert(/function renderLightsAmbientTab\(/.test(padUi) && /function renderLightsKeysTab\(/.test(padUi),
  'v12 ambient and keys tab panels');
assert(/data-light-template-scope="keys"/.test(padUi),
  'v12 scoped light template pickers for keys');
assert(/data-lights-preview-accent/.test(padUi), 'v12 preview accent attribute');
assert(/\.soft-pad-lights-subtabs/.test(css) && /data-lights-preview-accent="ambient"/.test(css),
  'v12 subtabs and preview accent css');
assert(/resetView: softPadFace !== 'agent'/.test(src),
  'agent face scheme click keeps resetView false');
assert(/forceRemount: softPadFace === 'agent'/.test(src),
  'agent face scheme click forceRemounts lights panel');
assert(/getSelectedScopeId:\s*function/.test(src) && /iconForKind:\s*iconForKind/.test(src),
  'hub exports scope id and iconForKind for topbar focus');
assert(/is-focused/.test(padUi) && /\.is-focused/.test(css),
  'topbar preview chip focus class + css');
assert(/agentLightIconSrc/.test(padUi) && /focusAgent/.test(padUi),
  'topbar icons resolve via presets and focusAgent');
assert(/CREATE_NO_WINDOW/.test(
  fs.readFileSync(path.join(root, 'src-tauri/src/shell_agent_hook_setup.rs'), 'utf8')
), 'shell hook node -v uses CREATE_NO_WINDOW');

// v13 habit UX: no center-column Shell Hook mount; topbar add menu; ambient solid
assert(!/mountShellAgentHookPanel\(paintHost/.test(src),
  'agent face does not mount Shell Hook into center column');
assert(!/<details class="soft-pad-topbar-light-add">/.test(padUi),
  'topbar add is not details/summary box');
assert(/data-act="topbar-add-toggle"/.test(padUi) && /soft-pad-topbar-add__menu/.test(padUi),
  'topbar add uses compact toggle menu');
assert(/\.soft-pad-topbar-add__btn/.test(css) && /soft-pad-topbar-add__menu\[hidden\]/.test(css),
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
assert(/rgb_for_ambient|parse_hex_rgb/.test(
  fs.readFileSync(path.join(root, 'src-tauri/src/pad_status/adapters/soft_rgb.rs'), 'utf8')
), 'soft_rgb solid ambient support');
assert(/ambient_mode/.test(
  fs.readFileSync(path.join(root, 'src-tauri/src/config.rs'), 'utf8')
), 'pad config has ambient_mode field');

if (fail) {
  console.error(fail + ' failed');
  process.exit(1);
}
console.log('ok soft-pad face routing');
