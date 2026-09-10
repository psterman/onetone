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
check('purpose demo has compare', /soft-pad-demo-compare/.test(purposeDemo));
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
check('css purpose compare equal footprint',
  /\.soft-pad-mode-preview--purpose \.soft-pad-demo-compare \.soft-pad-purpose-live-hw[\s\S]*?max-width:\s*min\(100%,\s*320px\)/.test(css) &&
  /aspect-ratio:\s*1\s*\/\s*1\s*!important/.test(css));
check('css purpose no white frame',
  /\.soft-pad-mode-preview--purpose[\s\S]*?background:\s*transparent/.test(css) &&
  /\[data-pad-mode-preview="purpose"\][\s\S]*?background:\s*transparent/.test(css));
check('css purpose hide face title in demos',
  /\.soft-pad-mode-preview--purpose \.soft-pad-purpose-live-hw \.micro-hw__face-top/.test(css));
check('purpose seat-match Soft Pad',
  /seatMatch:\s*true/.test(padUi) && /is-seat-match/.test(padUi));
check('purpose demos use real hardware Soft Pad',
  /function renderPurposeLiveSoftPadHtml\([\s\S]*?renderHardwarePad/.test(padUi));
check('purpose occupy uses live Soft Pad',
  /function renderPurposeFeatureDemoHtml\([\s\S]*?renderPurposeLiveSoftPadHtml/.test(padUi));
check('export paintSoftPadPadModePreview',
  /paintSoftPadPadModePreview:\s*paintSoftPadPadModePreview/.test(padUi));

console.log('[softpad-preview-split] ' + (fail ? fail + ' failed' : 'all passed'));
if (fail) process.exit(1);
