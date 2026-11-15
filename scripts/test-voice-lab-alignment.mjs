// Static alignment checks: scope / nav / snapshot / Lab hosts / product entry.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

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

console.log('[voice-lab-alignment]');

const html = read('src/index.html');
const scopeJs = read('src/js/features/voice/voice-scope.js');
const navJs = read('src/js/features/voice/voice-nav.js');
const labJs = read('src/js/features/voice/voice-lab-panel.js');
const uiState = read('src/js/core/voice-ui-state.js');
const drawer = read('src/js/features/settings/settings-drawer.js');
const persist = read('src/js/features/voice/voice-scheme-persist.js');
const header = read('src/js/features/voice/voice-page-header-render.js');
const vmJs = read('src/js/features/voice/voice-settings-view-model.js');
const shellIa = read('src/js/shared/shell-ia-convergence.js');
const linkMap = read('src/js/features/home/home-voice-link-map.js');
const acousticJs = read('src/js/features/voice/voice-wake-acoustic.js');
const themePrefsJs = read('src/js/core/app-theme-prefs.js');

check('voice-scope.js script tag', /voice-scope\.js/.test(html));
check('voice-nav.js script tag', /voice-nav\.js/.test(html));
check('OneToneVoiceScope.resolveEditMapping', /function resolveEditMapping/.test(scopeJs) && /OneToneVoiceScope/.test(scopeJs));
check('scope priority habitScenarioReturnId first', /habitScenarioReturnId/.test(scopeJs) && scopeJs.indexOf('habitScenarioReturnId') < scopeJs.indexOf('selectedMappingId'));
check('Lab activeMapping uses VoiceScope', /OneToneVoiceScope/.test(labJs) && /resolveEditMapping/.test(labJs));
check('header resolveScopeMapping uses VoiceScope', /OneToneVoiceScope/.test(header));
check('Persist resolveVoiceScopeMapping uses VoiceScope', /OneToneVoiceScope/.test(persist));
check('getVoiceStatusSnapshot exported', /getVoiceStatusSnapshot/.test(uiState));
check('Lab syncLiveFromSnapshot', /function syncLiveFromSnapshot/.test(labJs) && /syncLiveFromSnapshot/.test(labJs));
check('openVoice + adaptOpenOpts', /function openVoice/.test(navJs) && /adaptOpenOpts/.test(navJs));
check('drawer maps voiceWake→voiceLab unless legacy', /legacy===true\|\|opts\.openLegacy===true/.test(drawer) && /panel:'voiceLab'/.test(drawer));
check('Lab focusRegion exported', /focusRegion:\s*focusRegion/.test(labJs));
check('Lab cancel phrase host', /id="voiceLabCancelPhraseTags"/.test(html));
check('Lab binds cancel phrase tags', /bindPhraseTags\('voiceLabCancelPhraseTags'/.test(labJs));
check('Lab mic picker host', /id="voiceLabMicPicker"/.test(html));
check('Lab resource status host', /id="voiceLabResourceStatus"/.test(html));
check('Lab resource download CTA', /id="voiceLabResourceDownload"/.test(html) && /id="voiceLabResourceProgress"/.test(html));
check('Lab kicks vosk download via Wake API', /function kickLabVoskDownload/.test(labJs) && /downloadVoskModelGuide/.test(labJs));
check('Lab auto-kick when vosk model missing', /labVoskAutoKickDone/.test(labJs) && /kickLabVoskDownload\('auto'\)/.test(labJs));
check('Wake progress paints Lab bar', /voiceLabResourceProgressFill/.test(read('src/js/features/voice/voice-wake.js')));
check('Lab SoftPad/Keys/Camera bridge hosts', /id="voiceLabBridgeSoftPad"/.test(html) && /id="voiceLabBridgeKeys"/.test(html) && /id="voiceLabBridgeCamera"/.test(html));
check('Lab acoustic hosts removed', !/id="voiceLabAcousticEndHost"/.test(html) && !/id="voiceLabAcousticCancelHost"/.test(html) && !/id="voiceLabAcousticHosts"/.test(html));
check('acoustic egg parked on Sounds legacy fold', /id="soundAcousticEgg"/.test(html) && /id="voiceEndAcousticHost"/.test(html) && /id="voiceCancelAcousticHost"/.test(html) && /id="soundLegacyFold"[\s\S]*?id="soundAcousticEgg"/.test(html));
check('Lab does not mount acoustic chrome', !/Ac\.render\('end'\)/.test(labJs) && !/Ac\.render\("end"\)/.test(labJs));
check('Sounds panel mounts acoustic egg', /soundAcousticEggSummary/.test(themePrefsJs) && /OneToneVoiceControlAcoustic/.test(themePrefsJs));
check('acoustic has no Lab host remap', !/labHostId/.test(acousticJs));
check('Lab mic picker does not open voiceWake', /function openLabMicPicker/.test(labJs) && !/openLabMicPicker[\s\S]{0,200}openPanel\('voiceWake'\)/.test(labJs));
check('HOME_VOICE_LINK_MAP targets voiceLab', /panel:\s*'voiceLab'/.test(linkMap) && /focus:\s*'finish'/.test(linkMap));
check('shell-ia voice → voiceLab', /voice:\s*\{\s*panel:\s*'voiceLab'/.test(shellIa));
check('product Wake nav hidden', /id="wbNavVoice"[^>]*\bhidden\b/.test(html) && /id="settingsNavVoiceWake"[^>]*\bhidden\b/.test(html));
check('voiceLab product nav kept', /id="wbNavVoiceLab"/.test(html) && /id="settingsPanelVoiceLab"/.test(html) && /id="settingsNavVoiceLab"/.test(html));
check('voiceWake panel kept (compat)', /id="settingsPanelVoiceWake"/.test(html));
check('VM includes scope + statusSnapshot', /scopeIsGlobal/.test(vmJs) && /statusSnapshot/.test(vmJs));
check('settingsPanelNeedsVoicePoll includes voiceLab', /p==='voiceWake'\|\|p==='voiceLab'\|\|p==='debug'/.test(read('src/js/features/voice/voice-wake.js')));

// Runtime: resolveEditMapping priority
function loadIife(src) {
  const sandbox = { console, window: {}, globalThis: null };
  sandbox.globalThis = sandbox.window;
  vm.runInNewContext(src, sandbox);
  return sandbox.window;
}
const scopeWin = loadIife(scopeJs);
scopeWin.OneToneState = {
  state: {
    selectedMappingId: 'sel',
    config: {
      activeSceneId: 'active',
      mappings: [
        { id: 'scenario', name: 'Scenario', appTargetId: 'cursor-chat' },
        { id: 'sel', name: 'Selected', appTargetId: '' },
        { id: 'edit', name: 'Edit', appTargetId: 'vscode' },
        { id: 'active', name: 'Active', appTargetId: '' },
      ],
    },
  },
  ui: { habitScenarioReturnId: 'scenario', voiceEditSchemeId: 'edit' },
};
scopeWin.OneToneMappingCore = {
  byId(id) {
    return scopeWin.OneToneState.state.config.mappings.find((m) => m.id === id) || null;
  },
};
const Scope = scopeWin.OneToneVoiceScope;
check('runtime scenario wins', Scope.resolveEditMapping().id === 'scenario');
scopeWin.OneToneState.ui.habitScenarioReturnId = '';
check('runtime selected next', Scope.resolveEditMapping().id === 'sel');
scopeWin.OneToneState.state.selectedMappingId = '';
check('runtime voiceEditScheme next', Scope.resolveEditMapping().id === 'edit');
scopeWin.OneToneState.ui.voiceEditSchemeId = '__global__';
check('runtime activeScene fallback', Scope.resolveEditMapping().id === 'active');
const desc = Scope.describeScope(Scope.resolveEditMapping({}));
check('describeScope global flag', desc.isGlobal === true);

const navWin = loadIife(navJs);
const Nav = navWin.OneToneVoiceNav;
check('normalizeFocus wakePhrases→wake', Nav.normalizeFocus('wakePhrases') === 'wake');
check('normalizeFocus endPhrases→finish', Nav.normalizeFocus('endPhrases') === 'finish');
const adapted = Nav.adaptOpenOpts({ panel: 'voiceWake', focus: 'mic' });
check('adaptOpenOpts voiceWake→voiceLab', adapted.panel === 'voiceLab' && adapted.focus === 'mic');
const legacy = Nav.adaptOpenOpts({ panel: 'voiceWake', legacy: true });
check('adaptOpenOpts legacy keeps voiceWake', legacy.panel === 'voiceWake');

if (fail) {
  console.error(fail + ' failed');
  process.exit(1);
}
console.log(pass + ' passed');
