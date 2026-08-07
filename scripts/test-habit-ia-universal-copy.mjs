/**
 * Habit IA copy — Universal / edit≠use / Soft Pad Auto.
 * Static self-check (no DOM): global voice edit identity, strip hint, no「默认」baseline label.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const vm = read('src/js/features/voice/voice-settings-view-model.js');
const schemes = read('src/js/features/voice/voice-schemes-ui.js');
const header = read('src/js/features/voice/voice-page-header-render.js');
const strip = read('src/js/features/mapping/habit-channel-status-strip.js');
const softPad = read('src/js/features/agent/soft-pad-hub-ui.js');
const i18n = read('src/js/core/i18n.js');
const indexHtml = read('src/index.html');

// --- Global voice edit: mapping=null, never borrow active app name ---
assert.ok(
  /uiEdit==='__global__'\|\|uiEdit===null/.test(vm) || /uiEdit==='__global__'/.test(vm),
  'resolveActiveHabit treats __global__ as universal'
);
assert.ok(/function universalHabit\(\)[\s\S]*?mapping:null/.test(vm), 'universal habit returns mapping:null');
assert.ok(
  /if\(uiEdit==='__global__'[\s\S]{0,120}?return universalHabit\(\)/.test(vm),
  '__global__ wins before leftover scenario return id'
);
assert.ok(
  /if\(!m\) return t\('voiceSummaryScopeUniversal'\)/.test(vm) ||
    /if\(!m\) return t\('voiceSummaryScopeUniversal'\)\|\|t\('voiceSummaryScopeAll'\)/.test(vm),
  'null mapping forces universal / all-habits scope'
);

// Header: __global__ short label is 通用, not active Cursor
assert.ok(
  /homeWbChipUniversal/.test(header) &&
    /selectedId==='__global__'[\s\S]{0,80}?displayName=universalLbl/.test(header),
  'header __global__ uses short Universal'
);
// --- Strip: edit universal + active app hint; no activate CTA for universal ---
assert.ok(
  /habitChannelStripHintEditUniversalActiveApp/.test(strip),
  'strip has edit-universal + active-app hint'
);
assert.ok(
  /editing\.canActivate&&editing\.id&&editing\.id!==active\.id/.test(strip),
  'strip activate CTA requires editing.id (universal has none)'
);
assert.ok(/panel==='softPad'[\s\S]{0,200}?softPadAutoVsActiveHint/.test(strip), 'strip Soft Pad uses Auto≠In-use line');

// --- Sidebar: 通用 + baseline running only + title 语音编辑对象 ---
assert.ok(/function isBaselineRuntimeActive/.test(schemes), 'baseline running gate exists');
assert.ok(
  /renderGlobalTab\(editing===GLOBAL_SCHEME_ID,baselineRunning\)/.test(schemes),
  'global tab running uses baseline gate, not running==='
);
assert.ok(!/renderGlobalTab\([^)]*running===''/.test(schemes), 'global tab no longer treats empty voice-scheme running as baseline');
assert.ok(
  /var isRunning=isBaselineRuntimeActive\(cfg\)/.test(schemes),
  'hub runtime row uses baseline gate'
);
assert.ok(/function universalShortName/.test(schemes), 'universal short name helper');
assert.ok(/voiceHubCardTitle/.test(schemes), 'hub title from voiceHubCardTitle');
assert.ok(/voiceHubCardTitle:'语音编辑对象'/.test(i18n), 'i18n hub title 语音编辑对象');
assert.ok(/id="voiceHubTitleLbl">语音编辑对象</.test(indexHtml), 'HTML default hub title');

// --- Soft Pad fixed one-liner ---
assert.ok(/softPadAutoVsActiveHint/.test(softPad), 'Soft Pad boundary hint uses Auto≠In-use key');
assert.ok(/softPadAutoVsActiveHint:/.test(i18n), 'i18n softPadAutoVsActiveHint present');
assert.ok(
  /键位跟随前台 Agent（Auto），与「正在使用」习惯不是同一个开关/.test(i18n),
  'zh Soft Pad Auto one-liner'
);

// --- No「默认」as baseline label on critical paths ---
assert.ok(/voiceSchemeDefaultName:'通用 · 系统输入法'/.test(i18n), 'voiceSchemeDefaultName starts with 通用');
assert.ok(!/voiceSchemeDefaultName:'默认/.test(i18n), 'voiceSchemeDefaultName not 默认');
assert.ok(!/voiceHubCardTitle:'默认/.test(i18n), 'hub title not 默认');
assert.ok(
  !/universalShortName[\s\S]{0,200}?'默认'/.test(schemes) &&
    !/renderVoiceHubRuntimeRow[\s\S]{0,120}?默认/.test(schemes),
  'schemes UI no hard-coded 默认 baseline label'
);

console.log('ok habit-ia-universal-copy');
