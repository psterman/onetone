/**
 * Homepage habit channel pills — baseline chip + four-channel flyout closed loop.
 * Static self-check (no DOM): scene rail must expose keys/voice/camera/softPad.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const panels = readFileSync(join(root, 'src/js/features/home/home-workbench-panels.js'), 'utf8');
const hub = readFileSync(join(root, 'src/js/features/agent/soft-pad-hub-ui.js'), 'utf8');
const padUi = readFileSync(join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');
const contract = readFileSync(join(root, 'docs/HABIT_UNIFIED_CONTRACT.md'), 'utf8');
const configRs = readFileSync(join(root, 'src-tauri/src/config.rs'), 'utf8');

const pillsFn = panels.match(/function sceneChannelPillsHtml\([\s\S]*?\n  function /);
assert.ok(pillsFn, 'sceneChannelPillsHtml present');
const pillsBody = pillsFn[0];
assert.ok(pillsBody.includes("t('habitHubChCamBase'"), 'flyout camera pill · base');
assert.ok(pillsBody.includes("t('habitHubChCamOn'"), 'flyout camera pill · on');
assert.ok(pillsBody.includes("t('habitHubChCamInherit'"), 'flyout camera pill · inherit');
assert.ok(pillsBody.includes("t('homeWbHabitChKeysOn'"), 'flyout keys pill');
assert.ok(pillsBody.includes("t('homeWbHabitChVoiceBase'"), 'flyout voice pill');
assert.ok(pillsBody.includes("t('homeWbHabitChPadNa'") || pillsBody.includes("t('homeWbHabitChPadOn'"), 'flyout softPad pill');
// Order: keys → voice → camera → softPad (matches howto quad + Hub micro-pills).
assert.ok(
  /pill\(keysLbl\)\+pill\(voiceLbl\)\+pill\(camLbl\)\+pill\(padLbl\)/.test(pillsBody),
  'pill order keys·voice·camera·softPad'
);

assert.ok(panels.includes("t('homeWbChipUniversal'"), 'baseline chip short name 「通用」');
assert.ok(/isBaselineScene\(a\)\?0:1/.test(panels), 'baseline chip sorts first');

assert.ok(/BUILTIN_SOFT_PAD_APPS[\s\S]*?workbuddy-chat/.test(hub), 'Hub includes WorkBuddy');
assert.ok(/BUILTIN_SOFT_PAD_APPS[\s\S]*?trae-chat/.test(hub), 'Hub includes Trae');
assert.ok(/BUILTIN_SOFT_PAD_APPS[\s\S]*?qoder-chat/.test(hub), 'Hub includes Qoder');
assert.ok(/BUILTIN_SOFT_PAD_APPS[\s\S]*?minimax-chat/.test(hub), 'Hub includes MiniMax');

assert.ok(
  /softPadTopbarMonitorLead[\s\S]{0,220}?不是钉主控/.test(padUi) ||
    /softPadTopbarMonitorLead[\s\S]{0,280}?not a runtime pin/.test(padUi),
  'topbar lead: observe/jump, not pin'
);
assert.ok(
  /softPadTopbarMonitorLead[\s\S]{0,280}?不会关掉 Soft Pad/.test(padUi) ||
    /softPadTopbarMonitorLead[\s\S]{0,320}?does not turn off Soft Pad/.test(padUi),
  'topbar lead: switching universal habit does not turn off Soft Pad'
);

assert.ok(
  /Hub 主列表[\s\S]{0,160}?MiniMax[\s\S]{0,80}?WorkBuddy[\s\S]{0,80}?Trae[\s\S]{0,80}?Qoder/.test(contract),
  'contract Hub list includes MiniMax + shell agents'
);
assert.ok(!/MiniMax 不进 Hub/.test(contract), 'contract no longer excludes MiniMax from Hub');
assert.ok(/不是.*钉主控|观察 \/ 跳转/.test(contract), 'contract topbar is observe/jump');
assert.ok(/不要.*说 baseline mapping 存了 `cameraPrefs`/.test(contract), 'contract cameraPrefs not on baseline');

assert.ok(
  /topbar_habit_ids[\s\S]{0,200}?observe\/jump only — not runtime pin/.test(configRs) ||
    /Soft Pad top-bar status-monitor habit ids/.test(configRs),
  'Rust comment: topbar_habit_ids is status monitor, not pin'
);

console.log('ok home-habit-channel-pills');
