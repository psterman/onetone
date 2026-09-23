#!/usr/bin/env node
/** Soft Pad appear/purpose: demos on left, controls on right. */
'use strict';
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
var padUi = fs.readFileSync(path.join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');
var hub = fs.readFileSync(path.join(root, 'src/js/features/agent/soft-pad-hub-ui.js'), 'utf8');
var css = fs.readFileSync(path.join(root, 'src/css/soft-pad-hub.css'), 'utf8');
var fail = 0;

function check(name, ok) {
  if (!ok) {
    console.error('FAIL ' + name);
    fail++;
  } else {
    console.log('ok   ' + name);
  }
}

function sliceFn(src, name, nextName) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) return '';
  var end = nextName ? src.indexOf('function ' + nextName + '(', start + 1) : src.length;
  if (end < 0) end = src.length;
  return src.slice(start, end);
}

var controls = sliceFn(padUi, 'buildSoftPadDisplayControlsHtml', 'paintSoftPadPadModePreview');
var preview = sliceFn(padUi, 'buildSoftPadDisplayPreviewHtml', 'buildSoftPadCursorArmRowHtml');
var livePad = sliceFn(padUi, 'buildSoftPadAppearLivePadHtml', 'buildSoftPadDisplayPreviewHtml');
var numpad = sliceFn(padUi, 'renderNumpadMapHtml', 'renderSoftPadRuntimePanel');
var purposeDemo = sliceFn(padUi, 'renderPurposeFeatureDemoHtml', 'buildSoftPadPurposePreviewHtml');
var purposePreview = sliceFn(padUi, 'buildSoftPadPurposePreviewHtml', 'renderNumpadMapHtml');
var paint = sliceFn(padUi, 'paintSoftPadPadModePreview', 'renderSoftPadDisplayPanel');

check('controls have show tabs', /renderShowModeTabsHtml/.test(controls));
check('controls omit scene', !/renderShowModeSceneHtml/.test(controls));
check('controls host skin section', /buildSoftPadPresentationSkinSectionHtml/.test(controls));
check('preview has scene', /renderShowModeSceneHtml/.test(preview));
check('preview has live Soft Pad', /buildSoftPadAppearLivePadHtml/.test(preview));
check('preview omits skin cards', !/buildSoftPadPresentationSkinSectionHtml/.test(preview));
check('live pad uses real hardware', /renderHardwarePad/.test(livePad));
check('numpad controls omit compare demo', !/soft-pad-demo-compare/.test(numpad));
check('numpad controls omit switch demo', !/soft-pad-demo-switch/.test(numpad));
check('purpose demo has solo numpad preview',
  /renderNumpadCompareHtml/.test(purposeDemo) ||
  /function renderNumpadCompareHtml\([\s\S]*?soft-pad-numpad-solo/.test(padUi));
check('purpose preview wraps demo', /renderPurposeFeatureDemoHtml/.test(purposePreview));
check('paint writes appear/purpose html', /buildSoftPadDisplayPreviewHtml/.test(paint) &&
  /buildSoftPadPurposePreviewHtml/.test(paint));
check('hub ensureSoftPadPreview routes mode preview',
  /function ensureSoftPadPreview[\s\S]*?paintSoftPadPadModePreview/.test(hub));
check('hub skipPaint for appear/purpose',
  /modePreview[\s\S]*?skipPaint = true/.test(hub) ||
  /appear' \|\| softPadPadMode === 'purpose'[\s\S]*?skipPaint = true/.test(hub));
check('css mode preview column', /\.soft-pad-mode-preview/.test(css));
check('css left preview theme tokens', /--sp-preview-cyan/.test(css));
check('css left live Soft Pad', /\.soft-pad-mode-preview__live/.test(css) &&
  /\.soft-pad-mode-preview__hw/.test(css));
check('css purpose live Soft Pad', /\.soft-pad-purpose-live-hw/.test(css));
check('css purpose solo numpad preview',
  /\.soft-pad-numpad-solo/.test(css) &&
  /\.soft-pad-numpad-solo__pad/.test(css));
check('css opacity checkerboard stage',
  /\.soft-pad-opacity-stage/.test(css) &&
  /background-image:/.test(css));
check('css skin text options',
  /\.soft-pad-skin-text/.test(css) &&
  /\.soft-pad-skin-list/.test(css));
check('css purpose Soft Pad icons fill key caps',
  /\.soft-pad-mode-preview--purpose \.soft-pad-purpose-live-hw \.micro-hw__icon[\s\S]*?max-width:\s*78%/.test(css));
check('css appear live Soft Pad hides face chrome',
  /\.soft-pad-mode-preview--appear[\s\S]*?\.micro-hw__face-top[\s\S]*?display:\s*none/.test(css));
check('css mini tools wrap for bleed',
  /\.soft-pad-agent-mini-bar__tools[\s\S]*?flex-wrap:\s*wrap/.test(css));
check('css preview mutes agent key glow blobs',
  /\.soft-pad-mode-preview \.micro-hw__key--agent[\s\S]*?--ag-glow:\s*transparent/.test(css));
check('css preview strips codex green chassis',
  /\.soft-pad-mode-preview \.micro-hw-shell\.is-mode-codex \.micro-hw[\s\S]*?background:\s*#eef2f6/.test(css));
check('css mini speech fits width',
  /\.soft-pad-agent-mini-bar__speech[\s\S]*?width:\s*100%/.test(css));
check('css purpose no white frame',
  /\.soft-pad-mode-preview--purpose[\s\S]*?background:\s*transparent/.test(css) &&
  /\[data-pad-mode-preview="purpose"\][\s\S]*?background:\s*transparent/.test(css));
check('css purpose hide face title in demos',
  /\.soft-pad-mode-preview--purpose \.soft-pad-purpose-live-hw \.micro-hw__face-top/.test(css));
check('purpose soft/occupy share 108-only face demo',
  /function renderKeepNumpadDemoHtml\([\s\S]*?mode: 'soft'/.test(padUi) &&
  /function renderFullKeyboardOccupyDemoHtml\([\s\S]*?mode: 'occupy'/.test(padUi) &&
  /soft-pad-fk--108-only/.test(padUi) &&
  !/function renderKeepNumpadDemoHtml\([\s\S]*?soft-pad-fk__soft-col/.test(padUi));
check('purpose demos use real hardware Soft Pad',
  /function renderPurposeLiveSoftPadHtml\([\s\S]*?renderHardwarePad/.test(padUi));
check('purpose occupy uses full keyboard demo',
  /function renderNumpadCompareHtml\([\s\S]*?renderFullKeyboardOccupyDemoHtml/.test(padUi) &&
  /function renderKeepNumpadDemoHtml/.test(padUi));
check('purpose occupy uses solo preview not switch',
  /function renderPurposeFeatureDemoHtml\([\s\S]*?renderNumpadCompareHtml/.test(padUi) &&
  !/function renderPurposeFeatureDemoHtml\([\s\S]{0,400}?soft-pad-demo-switch/.test(padUi));
check('css full keyboard occupy demo',
  /\.soft-pad-fk__board/.test(css) &&
  /\.soft-pad-fk__numpad/.test(css));
check('css 108-only demo uses full width',
  /\.soft-pad-fk--108-only/.test(css) &&
  /soft-pad-numpad-solo__pad\.soft-pad-fk--108-only[\s\S]*?max-width:\s*100%/.test(css));
check('css purpose preview host not capped at 340',
  /data-pad-mode-preview="purpose"[\s\S]{0,180}?max-width:\s*none/.test(css) &&
  /\.soft-pad-fk--108-only/.test(css));
check('css 108 board is horizontal main|cluster|numpad',
  /\.soft-pad-fk__board--108[\s\S]*?soft-pad-fk__108-body/.test(css) &&
  /soft-pad-fk__board--108/.test(padUi));
check('occupy demo flips digit→Soft Pad on same seats',
  /data-np-face/.test(padUi) &&
  /soft-pad-fk__np-layer--soft/.test(padUi) &&
  /function startOccupyCompareDemo[\s\S]*?data-np-face/.test(padUi));
check('mode preview stays on result face without loop',
  /function startOccupyCompareDemo[\s\S]*?clearInterval/.test(padUi) &&
  !/function startOccupyCompareDemo[\s\S]*?setInterval/.test(padUi) &&
  /data-fk-result/.test(padUi));
check('css soft seat fused into keyboard not floating card',
  /\.soft-pad-fk__numpad--fused/.test(css) &&
  /soft-pad-fk__np-layer--soft/.test(css) &&
  /box-shadow:\s*none\s*!important/.test(css));
check('purpose demo omits bottom explain and restore',
  !/function renderFullKeyboardFaceDemoHtml[\s\S]*?numpadRestoreDigits/.test(padUi) &&
  !/function renderNumpadCompareHtml[\s\S]*?soft-pad-numpad-solo__hint/.test(padUi));
check('live pad has opacity stage',
  /soft-pad-opacity-stage/.test(livePad) && /data-screen-opacity-preview/.test(livePad));
check('skin seg is text list',
  /function renderSkinSeg\([\s\S]*?soft-pad-skin-text/.test(padUi) &&
  !/function renderSkinSeg\([\s\S]*?soft-pad-skin-card/.test(padUi));
check('appear preview puts live Soft Pad before scene',
  /buildSoftPadAppearLivePadHtml[\s\S]{0,80}?renderShowModeSceneHtml/.test(preview));
check('export paintSoftPadPadModePreview',
  /paintSoftPadPadModePreview:\s*paintSoftPadPadModePreview/.test(padUi));
check('skin preview paints into island paint host',
  /function refreshSoftPadFloatSkinPreview[\s\S]*?resolveSoftPadPreviewPaintHost/.test(padUi));
check('skin preview keeps outer host, paints child',
  /function refreshSoftPadFloatSkinPreview[\s\S]*?var outer = document\.getElementById\('softPadPreviewHost'\)[\s\S]*?resolveSoftPadPreviewPaintHost\(outer\)[\s\S]*?host\.innerHTML\s*=/.test(padUi));
check('live skin lights re-check paint-target focus',
  /function liveSoftPadFloatSkinLights[\s\S]*?resolveSoftPadPreviewPaintHost[\s\S]*?is-skin-focus/.test(padUi));
check('hub skipPaint for float skin/show',
  /floatTab === 'show' \|\| floatTab === 'skin'[\s\S]*?skipPaint = true/.test(hub));
check('hub ensureSoftPadPreview keeps float skin/show',
  /function ensureSoftPadPreview[\s\S]*?floatTab === 'skin'[\s\S]*?refreshSoftPadFloatSkinPreview/.test(hub));
check('css mid skin ambient ring beats clear-shadow',
  /#softPadPreviewHost\[data-skin-ambient\][\s\S]*?\.micro-hw-shell[\s\S]*?--agent-ambient-ring/.test(css));
check('float dock change opts fall back to Hub onChanged',
  /function softPadFloatDockChangeOpts[\s\S]*?getSoftPadSubpagePaintOpts/.test(padUi));
check('persistPadAmbient quiet IPC',
  /function persistPadAmbient[\s\S]*?cmd_codex_micro_pad_set_ambient/.test(padUi));
check('ambient color input uses persistPadAmbient',
  /data-act="ambient-solid-rgb"[\s\S]*?persistPadAmbient\(m\)/.test(padUi));
check('numpad replace uses mode cards not checkboxes',
  (function () {
    var start = padUi.indexOf('function renderNumpadMapHtml(');
    var end = padUi.indexOf('function renderSoftPadRuntimePanel(', start + 1);
    if (start < 0 || end < 0) end = padUi.indexOf('\n  function ', start + 1);
    var slice = start >= 0 && end > start ? padUi.slice(start, end) : '';
    return /data-act="numpadMode"/.test(slice) &&
      /soft-pad-numpad-mode/.test(slice) &&
      !/type="checkbox"/.test(slice);
  })());
check('purpose preview scrolls to top after paint',
  /function paintSoftPadPadModePreview[\s\S]*?scrollTop = 0/.test(padUi));

console.log('[softpad-preview-split] ' + (fail ? fail + ' failed' : 'all passed'));
if (fail) process.exit(1);
