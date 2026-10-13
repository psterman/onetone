import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'src/js/features/agent/soft-pad-carry.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/css/soft-pad-carry.css'), 'utf8');

let fail = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    fail++;
  } else {
    console.log('PASS', msg);
  }
}

function fn(name, nextName) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) return '';
  const end = nextName ? src.indexOf('function ' + nextName + '(', start + 1) : src.length;
  return src.slice(start, end < 0 ? src.length : end);
}

const shouldShow = fn('shouldShowCarryUi', 'requestOverlayFit');
const ensureMats = fn('ensureMatsBar', 'syncMatsRailGeometry');
const pointerInside = fn('matsPointerStillInside', 'scheduleMatsLeaveClose');
const paintMats = fn('paintMats', 'noteSoftPadMaterial');
const optimisticAdd = fn('optimisticAddMaterial', 'paint');
const applySnapshot = fn('applySnapshot', 'pullSnapshot');
const scheduleLeave = fn('scheduleMatsLeaveClose', 'bindMatsPadLeave');
const setDrawer = fn('setMatsDrawerOpen', 'chipPreview');
const isFreshHandoff = fn('isFreshHandoff', 'ico');
const handleMatsClick = fn('handleMatsPanelClick', 'bindMatsPanelListeners');
assert(/carryUiArmed/.test(shouldShow), 'operation dock gated on fresh handoff arm');
assert(!/carryActive\(s\)\s*;\s*return true/.test(shouldShow), 'stale carry.active alone does not show operation dock');
assert(!/materialBadge\(s\)\s*>\s*0/.test(shouldShow), 'materials alone do not show operation dock');
assert(!/assembledMd/.test(shouldShow), 'assembled materials alone do not show operation dock');
assert(/isFreshHandoff\(snap,\s*prev\)/.test(applySnapshot), 'handoff freshness uses updatedAt on cold mount');
assert(/lastArmedCarryGen/.test(applySnapshot), 'duplicate tray events do not re-arm materials');
assert(/HANDOFF_FRESH_MS/.test(isFreshHandoff), 'cold mount handoff window is bounded');
assert(!/pointerenter[\s\S]{0,160}?setMatsDrawerOpen\(true\)/.test(ensureMats), 'hovering materials rail does not auto-open');
assert(/bar\.addEventListener\('pointerleave'[\s\S]{0,240}?scheduleMatsLeaveClose\(\)/.test(ensureMats),
  'leaving materials rail schedules close');
assert(!/wrap\.matches\(':hover'\)/.test(pointerInside), 'Soft Pad hover alone does not keep materials panel open');
assert(!/matsAssistOpen/.test(scheduleLeave), 'paste assist does not block leave-close (pin only)');
assert(/requestMatsRailWidth\(true\)[\s\S]{0,200}?applyMatsDrawerDom\(true\)/.test(setDrawer),
  'HWND widens before materials panel paints open');
assert(!/matsPinned\s*\|\|\s*matsOpenOnCollect/.test(paintMats), 'pin and collect do not force-open materials');
assert(/matsOpenOnCollect\s*=\s*false/.test(optimisticAdd), 'collecting a material stays collapsed unless already opened');
assert(/\.wrap\.is-minimized \.sp-mats-rail[\s\S]{0,120}?display:\s*none\s*!important/.test(css),
  'materials rail stays off the mini bar');
assert(/if \(mini\)[\s\S]{0,480}?paintMiniMatsPop/.test(paintMats),
  'mini mode paints compact materials popover instead of side rail');
assert(!/matsBarEl\.hidden\s*=\s*true/.test(paintMats),
  'mini mode does not sticky-hide materials rail via [hidden]');
assert(/syncChrome:\s*paint/.test(src), 'carry API exports syncChrome for mini↔full');
assert(/Carry\.syncChrome/.test(
  fs.readFileSync(path.join(root, 'src/codex-micro-overlay.html'), 'utf8')
), 'expand/minimize refreshes SoftPad materials chrome');
assert(/toggleMiniMaterials:\s*toggleMiniMaterials/.test(src),
  'carry API exports toggleMiniMaterials');
assert(/slotId==='materials'[\s\S]{0,520}?toggleMiniMaterials/.test(
  fs.readFileSync(path.join(root, 'src/codex-micro-overlay.html'), 'utf8')
), 'mini materials tool toggles carry popover');
assert(/id:\s*'materials'/.test(
  fs.readFileSync(path.join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8')
), 'materials is configurable in mini tool settings');
assert(/data-sp-mats-toggle[\s\S]{0,200}?toggleMatsPanelOpen\(\)/.test(handleMatsClick),
  'materials tab click toggles open (no forced false)');
assert(!/data-sp-mats-toggle[\s\S]{0,200}?toggleMatsPanelOpen\(false\)/.test(handleMatsClick),
  'materials tab click does not force-close');
assert(/data-sp-mats-paste-target/.test(src) && /pasteOnly\(\)/.test(handleMatsClick),
  'mini materials popover can paste into target');
assert(/data-sp-mini-mats-preview/.test(src) && /data-sp-mini-mats-hint/.test(src),
  'mini materials popover has hint + preview');
assert(/withMaterialsMiniSlot/.test(
  fs.readFileSync(path.join(root, 'src/codex-micro-overlay.html'), 'utf8')
), 'beginner mini tools still get a materials slot');
assert(/粘贴到输入框/.test(css) || /sp-mini-mats__paste/.test(css),
  'mini paste CTA has dedicated styles');
assert(/wrap\.is-mini-mats[\s\S]{0,120}?overlay-mini-listen/.test(css),
  'mini materials hides listen band while open');
assert(/wrap\.is-mini-mats\s+\.overlay-mini-stack\s*\{[\s\S]{0,120}?gap:\s*0/.test(css),
  'mini materials clears stack gap so list is not clipped');
assert(/\.sp-mini-mats\s*\{[\s\S]{0,200}?position:\s*relative/.test(css),
  'mini materials is an inline stack card (not absolute overlay)');
assert(/\.sp-mini-mats__panel\s*\{[\s\S]{0,160}?width:\s*100%/.test(css),
  'mini materials panel uses full mini width');
assert(/\.sp-mini-mats__panel\s*\{[\s\S]{0,200}?max-height:\s*396px/.test(css),
  'mini materials panel is capped inside HWND budget');
assert(/\.sp-mini-mats__fold\[open\]\s*\{[\s\S]{0,80}?flex:\s*1\s+1\s+auto/.test(css),
  'open fold absorbs leftover panel height');
assert(/\.sp-mini-mats__chips\s*\{[\s\S]{0,120}?min-height:\s*0/.test(css),
  'chips flex-shrink so list scrolls instead of HWND clip');
assert(/getElementById\('overlayMiniStack'\)/.test(src),
  'mini materials docks into overlayMiniStack');
assert(/requestMatsRailWidth\(miniMatsOpen\)/.test(src),
  'opening mini materials grows HWND before paint');
assert(/if \(isMiniMode\(\)\) return/.test(fn('scheduleMatsLeaveClose', 'bindMatsPadLeave')),
  'mini materials does not auto-close on pointer leave');
assert(/if \(!isMiniMode\(\)\) setMatsDrawerOpen\(true\)/.test(src),
  'mini file pick does not force full materials drawer');
assert(/sp-mini-mats__fold/.test(src) && /renderMiniMatsChipsHtml/.test(src),
  'mini materials list is a fold of short name chips');
assert(/sp-mini-mats__fold/.test(css) && /sp-mini-mats__chip-name/.test(css),
  'mini fold/chip styles present');
assert(/OVERLAY_HEIGHT_MINI_MATS_EXTRA:\s*f64\s*=\s*404\.0/.test(
  fs.readFileSync(path.join(root, 'src-tauri/src/codex_micro_overlay.rs'), 'utf8')
), 'HWND mats budget covers panel max-height');

if (fail) {
  console.error(fail + ' failed');
  process.exit(1);
}
console.log('ok soft-pad carry gating');
