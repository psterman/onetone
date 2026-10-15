/**
 * Contract: deferred debug-about must not kill bootstrap hooks / left-nav boot.
 * Runtime log showed: legacy-register bootstrap failed reading exportDiagnosticLogs
 * → hooks=0 → markBoot is not a function → left directory dead.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
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

const bootHooksSrc = readFileSync(join(root, 'src/js/core/app-bootstrap-hooks.js'), 'utf8');
const langHooksSrc = readFileSync(join(root, 'src/js/core/app-lang-hooks.js'), 'utf8');
const bootSrc = readFileSync(join(root, 'src/js/core/app-boot.js'), 'utf8');
const indexHtml = readFileSync(join(root, 'src/index.html'), 'utf8');

check('debug-about is deferred', /data-ot-defer="debug"[^>]*debug-about\.js/.test(indexHtml));
check('bootstrap hooks lazy DebugAbout', bootHooksSrc.includes("debugAboutFn('exportDiagnosticLogs')"));
check('bootstrap hooks no eager D.exportDiagnosticLogs', !/exportDiagnosticLogs:\s*D\.exportDiagnosticLogs/.test(bootHooksSrc));
check('lang hooks lazy renderAboutPanel', langHooksSrc.includes('OneToneDebugAbout') && langHooksSrc.includes('renderAboutPanel'));
check('lang hooks no eager D.renderAboutPanel', !/renderAboutPanel:\s*D\.renderAboutPanel/.test(langHooksSrc));
check('app-boot markBoot fallback', bootSrc.includes('OneToneDom.markBoot') && bootSrc.includes('function markBoot'));

// Runtime: register must succeed when DebugAbout is missing.
const sandbox = {
  window: {},
  globalThis: {},
  console,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(bootHooksSrc, sandbox);
vm.runInContext(langHooksSrc, sandbox);

let threw = null;
try {
  sandbox.OneToneAppBootstrapHooks.register({
    t: function () { return ''; },
    vpInvoke: function () {},
    logGlobalError: function () {},
    setTheme: function () {},
    getAppLang: function () { return 'zh'; },
    setAppLang: function () {},
    applyLang: function () {},
    setFontScale: function () {},
    fontScaleValues: function () { return {}; },
    markBoot: function (label) { sandbox.__markBootCalls = (sandbox.__markBootCalls || []).concat([label]); },
  });
} catch (err) {
  threw = err;
}
check(
  'bootstrap register without DebugAbout',
  !threw && sandbox.__vp_bootstrap_hooks__ && typeof sandbox.__vp_bootstrap_hooks__.markBoot === 'function'
);
if (threw) console.error('  register error:', threw && threw.stack ? threw.stack : threw);
check(
  'exportDiagnosticLogs is callable stub',
  !!(sandbox.__vp_bootstrap_hooks__ && typeof sandbox.__vp_bootstrap_hooks__.exportDiagnosticLogs === 'function')
);

let langThrew = null;
try {
  sandbox.OneToneAppLangHooks.register({
    applyTheme: function () {},
    applyFontScale: function () {},
    setLangBootstrapPending: function () {},
    t: function () { return ''; },
    ui: function () { return {}; },
    applyHomeLiveLang: function () {},
    renderVoiceDiagTabs: function () {},
    renderVoiceDiagLog: function () {},
    getAppLang: function () { return 'zh'; },
    selectedDisplayTriggerKey: function () { return ''; },
    selectedDisplayTargetKey: function () { return ''; },
    syncVoiceEndModeUi: function () {},
    renderVoiceModeSwitch: function () {},
    runtimePaused: function () { return false; },
    mappingRecordMode: function () { return 'none'; },
    setRecording: function () {},
    render: function () {},
    frontendLog: function () {},
    dict: function () { return {}; },
    applyBootstrapLangTexts: function () {},
    applyCoreLangTexts: function () {},
    applySettingsLangTexts: function () {},
    applyMappingPrefsLangTexts: function () {},
    applyRuntimeLangTexts: function () {},
  });
} catch (err) {
  langThrew = err;
}
check('lang register without DebugAbout', !langThrew && typeof sandbox.__vp_app_lang_settings_hooks__.renderAboutPanel === 'function');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
