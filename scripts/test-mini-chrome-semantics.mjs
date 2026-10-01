/**
 * Mini chrome semantics — pure contract + source assertions.
 * Covers toolsAll (all-off) and orthogonal showMode (timing × presentation).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const padUi = fs.readFileSync(path.join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');
const overlay = fs.readFileSync(path.join(root, 'src/codex-micro-overlay.html'), 'utf8');
const i18n = fs.readFileSync(path.join(root, 'src/js/core/i18n.js'), 'utf8');
const configRs = fs.readFileSync(path.join(root, 'src-tauri/src/config.rs'), 'utf8');

let fail = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    fail++;
  } else {
    console.log('PASS', msg);
  }
}

/** Mirrors resolveSoftPadShowMode after the orthogonal split. */
function resolveSoftPadShowMode(pad) {
  if (!pad || !pad.overlayEnabled) return 'hidden';
  if (pad.requireForeground === false) return 'front';
  return 'follow';
}

/** Apply timing without touching presentation. */
function applySoftPadShowMode(pad, mode) {
  mode = String(mode || 'follow');
  if (mode === 'mini') mode = 'follow';
  if (mode === 'hidden') {
    pad.overlayEnabled = false;
    return;
  }
  pad.overlayEnabled = true;
  pad.requireForeground = mode !== 'front';
}

const ALL_IDS = ['pushToTalk', 'stopOrSend', 'continue', 'newThread', 'cancelListen'];

function toggleTool(chrome, id) {
  const cur = chrome.toolsAll !== false
    ? ALL_IDS.slice()
    : (Array.isArray(chrome.toolIds) ? chrome.toolIds.slice() : []);
  const i = cur.indexOf(id);
  if (i >= 0) cur.splice(i, 1);
  else cur.push(id);
  const next = ALL_IDS.filter((x) => cur.indexOf(x) >= 0);
  chrome.toolsAll = next.length === ALL_IDS.length;
  chrome.toolIds = chrome.toolsAll ? [] : next;
}

function visibleTools(chrome) {
  if (chrome.toolsAll !== false) return ALL_IDS.slice();
  return ALL_IDS.filter((id) => (chrome.toolIds || []).indexOf(id) >= 0);
}

// --- Behavior: toolsAll ---
{
  const chrome = { toolsAll: true, toolIds: [] };
  for (const id of ALL_IDS) toggleTool(chrome, id);
  assert(chrome.toolsAll === false, 'turning all tools off sets toolsAll=false');
  assert(Array.isArray(chrome.toolIds) && chrome.toolIds.length === 0, 'all-off stores empty toolIds');
  assert(visibleTools(chrome).length === 0, 'all-off shows zero tools');
}

{
  const chrome = { toolsAll: false, toolIds: [] };
  assert(visibleTools(chrome).length === 0, 'toolsAll=false + [] stays none (not all)');
  toggleTool(chrome, 'pushToTalk');
  assert(chrome.toolsAll === false && chrome.toolIds.length === 1, 'subset stays toolsAll=false');
  assert(visibleTools(chrome).join() === 'pushToTalk', 'subset shows only selected');
}

{
  const chrome = { toolsAll: false, toolIds: ALL_IDS.slice(0, 4) };
  toggleTool(chrome, 'cancelListen');
  assert(chrome.toolsAll === true && chrome.toolIds.length === 0, 'selecting last missing tool collapses to toolsAll');
}

// --- Behavior: showMode orthogonal ---
{
  const pad = { overlayEnabled: true, requireForeground: false, presentation: 'mini' };
  assert(resolveSoftPadShowMode(pad) === 'front', 'mini+always-on resolves to front (not mini)');
  applySoftPadShowMode(pad, 'follow');
  assert(pad.presentation === 'mini', 'apply follow does not clobber presentation');
  assert(pad.requireForeground === true && pad.overlayEnabled === true, 'follow sets FG gate');
  applySoftPadShowMode(pad, 'front');
  assert(pad.presentation === 'mini', 'apply front keeps mini');
  assert(pad.requireForeground === false, 'front clears FG gate');
  applySoftPadShowMode(pad, 'mini');
  assert(pad.presentation === 'mini', 'legacy mini mode does not force presentation');
  assert(resolveSoftPadShowMode(pad) === 'follow' || resolveSoftPadShowMode(pad) === 'front',
    'legacy mini maps away from packed enum');
}

{
  const pad = { overlayEnabled: true, requireForeground: true, presentation: 'full' };
  applySoftPadShowMode(pad, 'hidden');
  assert(pad.overlayEnabled === false && pad.presentation === 'full', 'hidden leaves presentation alone');
}

// --- Source contracts ---
assert(/toolsAll:\s*true/.test(padUi), 'defaultMiniChrome has toolsAll');
assert(/chrome\.toolsAll\s*=\s*cur\.length\s*===\s*allIds\.length/.test(padUi),
  'tool toggle writes toolsAll from selection length');
assert(!/chrome\.toolIds\s*=\s*cur\.length\s*===\s*allIds\.length\s*\?\s*\[\]\s*:\s*cur/.test(padUi),
  'no longer collapses full selection to bare []');
assert(!/var toolsAll\s*=\s*!toolIds\.length/.test(padUi), 'UI no longer derives toolsAll from empty array');
assert(!/voiceChipWhen/.test(padUi), 'voiceChipWhen removed from pad UI');
assert(!/voiceChipWhen/.test(overlay), 'voiceChipWhen removed from overlay');
assert(/toolsAll/.test(overlay) && /tools_all/.test(overlay), 'overlay reads toolsAll');
assert(!/if\s*\(\s*pad\.presentation\s*===\s*'mini'\s*\)\s*return\s*'mini'/.test(padUi),
  'resolveSoftPadShowMode no longer short-circuits on presentation');
assert(!/data-show-mode="mini"/.test(padUi) && !/softPadMiniShowForceMini/.test(padUi),
  'force-mini timing tab removed');
assert(/aria-labelledby=/.test(padUi), 'mini chrome toggles have aria-labelledby');
{
  const panelSrc = padUi.slice(
    padUi.indexOf('function renderAgentMiniPanel'),
    padUi.indexOf('function renderAgentCrossPanel')
  );
  assert(/data-act="mini-preset"/.test(panelSrc) && /data-act="mini-slot"/.test(panelSrc),
    'mini panel uses preset + slot chips');
  assert(/data-mini-preset-chrome/.test(panelSrc), 'mini panel marks preset chrome');
  assert(/softPadMiniPresetUsual|日常推荐/.test(panelSrc), 'usual preset present');
}
assert(/softPadMiniPanelLead/.test(padUi) || /先定它怎么出现/.test(padUi),
  'panel lead / appear-first framing present');
assert(/softPadMiniDisplayTitle:'细条形态'/.test(i18n), 'zh display title is 细条形态');
assert(/softPadMiniDisplayTitle:'Bar shape'/.test(i18n), 'en display title is Bar shape');
assert(/softPadMiniGotoData:'Where numbers come from →'/.test(i18n), 'en softPadMiniGotoData present');
assert(/softPadMiniPresetLean:'Just enough'/.test(i18n), 'en lean preset present');
assert(!/softPadMiniVoiceWhen/.test(i18n), 'voiceWhen i18n keys removed');
assert(!/softPadMiniShowForceMini/.test(i18n), 'ForceMini i18n keys removed');
assert(/tools_all:\s*Option<bool>/.test(configRs), 'Rust MiniChromeConfig has tools_all Option');
assert(!/voice_chip_when/.test(configRs), 'Rust voice_chip_when removed');

if (fail) {
  console.error(`\n${fail} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll mini-chrome semantics checks passed');
