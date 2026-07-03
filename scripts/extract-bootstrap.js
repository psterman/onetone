const fs = require('fs');
const mainPath = 'c:/Users/Administrator/Desktop/voice-pilot/src/js/main-legacy.js';
const outPath = 'c:/Users/Administrator/Desktop/voice-pilot/src/js/core/app-bootstrap.js';
const lines = fs.readFileSync(mainPath, 'utf8').split(/\r?\n/);
const uiLines = lines.slice(3771, 4475);
const busLines = lines.slice(4476, 4540);
const bootLines = lines.slice(4542, 4587);
const errLines = [
  "    var h = hooks();",
  "    window.addEventListener('error',function(e){",
  "      const msg=(e.message||'error')+(e.filename?(' @ '+e.filename+':'+e.lineno):'');",
  "      h.logGlobalError('window.error',msg);",
  "    });",
  "    window.addEventListener('unhandledrejection',function(e){",
  "      const reason=e.reason;",
  "      const msg=reason&&(reason.message||reason.stack||String(reason))||'unhandled rejection';",
  "      h.logGlobalError('unhandledrejection',msg);",
  "    });"
];

const header = `(function(global){
  'use strict';
  var $ = function(id){ return global.OneToneDom.$(id); };
  function hooks(){ return global.__vp_bootstrap_hooks__ || {}; }
  function bindGlobalErrorHandlers(){
${errLines.join('\n')}
  }
  function bindUiEvents(){
    var h = hooks();
    var state = global.OneToneState.state;
    var ui = global.OneToneState.ui;
    var runtime = global.OneToneState.runtime;
    var t = h.t;
    var vpInvoke = h.vpInvoke;
`;

const mid = `
  }
  function bindWebViewBus(){
    var h = hooks();
    var state = global.OneToneState.state;
    var runtime = global.OneToneState.runtime;
    var t = h.t;
`;

const bootHeader = `
  }
  function bootApp(){
    var h = hooks();
    var state = global.OneToneState.state;
    var markBoot = h.markBoot;
    var t = h.t;
`;

const footer = `
  }
  function install(){
    bindGlobalErrorHandlers();
    bindUiEvents();
    bindWebViewBus();
    bootApp();
  }
  global.OneToneBootstrap = {
    install: install,
    bindUiEvents: bindUiEvents,
    bindWebViewBus: bindWebViewBus,
    bootApp: bootApp,
    bindGlobalErrorHandlers: bindGlobalErrorHandlers
  };
})((typeof window !== 'undefined') ? window : globalThis);
`;

function prefixHookCalls(body) {
  const names = [
    'setTheme','getAppLang','setAppLang','applyLang','setFontScale','toggleAutostart','toggleSoundsMaster',
    'setSoundSlotEnabled','setSoundSlotId','previewSoundSlot','toggleVoiceSapi','bindVoiceModeCard',
    'testVoiceSapiSend','openVoiceSapiSetup','addVoiceSapiPreset','toggleVoiceVosk','testVoiceVoskSend',
    'addVoiceVoskPreset','syncVoiceVoskPresetButtons','changeVoiceVoskModelPreset','toggleVoiceEnd',
    'toggleVoiceEndAutoSend','addVoiceEndPreset','onVoiceEndDelayInput','onVoiceEndDelayChange',
    'setVoiceEndCommitKey','testVoiceEndStop','testVoiceEndCommit','updateVoiceSapiConfidence',
    'closeWelcome','homeOneClickStart','openSettings','closeDrawer','isHomeFirstRunFocusMode',
    'defaultUpdateState','installAppUpdate','checkForAppUpdate','dismissAppUpdate','handleHomeCtaClick',
    'initHomeGuide','toggleHomeKeyEnable','toggleHomeSchemeMenu','closeHomeSchemeMenu',
    'selectHomeMapping','toggleHomeSchemeMappingEnabled','switchVoiceMode','homeToggleVoiceWake',
    'updateHomeVoiceSapiConfidence','toggleHomeVoiceEndAutoSend','focusSettingsField',
    'openHomeKeyFinishSettings','openHomeKeySettings','setSettingsPanel','loadMicDevices',
    'clearMicBackoff','toast','setDebugFocusMode','setVoiceDiagTab','exportDiagnosticLogs',
    'openExternalUrl','syncEditorFromSelection','closeFloatMenu','render','focusMapping',
    'toggleGlobalListen','closeTestModal','fireTestSend','startTriggerRecord','startTargetRecord',
    'cancelDraftOrRecording','deleteMappingFromMenu','startSchemeSwitchRecord','cancelRecording',
    'clearSchemeSwitchKey','liveUpdateTimingRange','handleKeyFinishFlowInput','handleKeyFinishFlowClick',
    'focusSchemeEditStep','selectedMapping','isSavedMapping','setMappingEnabled','ensureMappingTiming',
    'save','renderKeyFinishFlowPanel','renderMappingList','renderHomeKeyFinishPreview',
    'startNativeRestoreRecord','startMappingSwitchRecord','removeMappingSwitchKey',
    'isCurrentDraftComplete','renderDraftHint','ensureConfig','newMappingId','defaultConfig',
    'renderRecordCancelBar','openConfirmModal','closeConfirmModal','duplicateMapping',
    'reorderMapping','restoreFromTrash','openFloatMenu','escHtml','friendlyKeyName','pushLog',
    'renderDebugPanel','onboardIsOpen','closeWelcome','markBoot','applyLang','scheduleLangBootstrap',
    'setRecording','deferProcessUsagePoll','maybeStartProcessUsagePoll','requestBackendConfig',
    'fallbackConfigLoaded','openWelcome','isFirstSuccessDone'
  ];
  let out = body;
  names.forEach(function(name) {
    const re = new RegExp('(?<!h\\.)\\b' + name + '\\b(?=\\s*\\()', 'g');
    out = out.replace(re, 'h.' + name);
  });
  return out;
}

function transformUi(body) {
  body = prefixHookCalls(body);
  return body
    .replace(/\bhomeSchemeMenuOpen\b/g, 'global.OneToneHomeScheme.isMenuOpen()')
    .replace(/if\(savedTheme==='dark'\|\|savedTheme==='light'\) theme=savedTheme;/g, "if(savedTheme==='dark'||savedTheme==='light') h.setTheme(savedTheme);")
    .replace(/if\(savedFontScale&&FONT_SCALE_VALUES\[savedFontScale\]\) fontScale=savedFontScale;/g, 'if(savedFontScale&&h.fontScaleValues()[savedFontScale]) h.setFontScale(savedFontScale);')
    .replace(/if\(window\.OneToneOnboarding&&window\.OneToneOnboarding\.shouldAutoOpen\(\)\) welcomeOpen=true;/g, 'if(window.OneToneOnboarding&&window.OneToneOnboarding.shouldAutoOpen()) h.setWelcomeOpen(true);')
    .replace(/uiBootstrapping=false;/g, 'h.setUiBootstrapping(false);')
    .replace(/if\(welcomeOpen\) openWelcome\(\);/g, 'if(h.welcomeOpen()) h.openWelcome();')
    .replace(/if\(welcomeOpen\) markBoot/g, 'if(h.welcomeOpen()) markBoot')
    .replace(/if\(!welcomeOpen&&!onboardIsOpen\(\)\)/g, 'if(!h.welcomeOpen()&&!h.onboardIsOpen())')
    .replace(/editorTriggerKey='';/g, 'h.setEditorTriggerKey("");')
    .replace(/editorTargetKey='';/g, 'h.setEditorTargetKey("");')
    .replace(/pendingNewDraftId=id;/g, 'h.setPendingNewDraftId(id);')
    .replace(/openExternalUrl\(GITHUB_REPO_URL\)/g, 'h.openExternalUrl(h.githubRepoUrl())')
    .replace(/if\(openMenuId\)/g, 'if(h.openMenuId())')
    .replace(/if\(!pop\.contains\(e\.target\) && !\(menuAnchorBtn&&menuAnchorBtn\.contains\(e\.target\)\)\)/g, 'if(!pop.contains(e.target) && !(h.menuAnchorBtn()&&h.menuAnchorBtn().contains(e.target)))')
    .replace(/if\(openMenuId&&menuAnchorBtn\) openFloatMenu\(openMenuId, menuAnchorBtn\)/g, 'if(h.openMenuId()&&h.menuAnchorBtn()) h.openFloatMenu(h.openMenuId(), h.menuAnchorBtn())')
    .replace(/if\(openMenuId\) closeFloatMenu\(\)/g, 'if(h.openMenuId()) h.closeFloatMenu()')
    .replace(/lastKeyDebug=\{/g, 'h.setLastKeyDebug({')
    .replace(/\[t\('debugKeyLabel'\),lastKeyDebug\.key/g, "[t('debugKeyLabel'),h.lastKeyDebug().key")
    .replace(/\[t\('debugCodeLabel'\),lastKeyDebug\.code/g, "[t('debugCodeLabel'),h.lastKeyDebug().code")
    .replace(/lastKeyDebug\.key\|\|/g, 'h.lastKeyDebug().key||')
    .replace(/lastKeyDebug\.code\|\|/g, 'h.lastKeyDebug().code||')
    .replace(/pushLog\(new Date\(\)\.toLocaleTimeString\(\)\+' key='\+lastKeyDebug\.key/g, "pushLog(new Date().toLocaleTimeString()+' key='+h.lastKeyDebug().key")
    .replace(/\+lastKeyDebug\.code\)/g, '+h.lastKeyDebug().code)')
    .replace(/if\(micRecoveryTimer\)/g, 'if(h.micRecoveryTimer())')
    .replace(/clearTimeout\(micRecoveryTimer\);\s*\n\s*micRecoveryTimer=0;/g, 'h.clearMicRecoveryTimer();')
    .replace(/logLines\.length=0;/g, 'h.clearLogLines();')
    .replace(/if\(welcomeOpen\)\{ closeWelcome\(true\); return; \}/g, 'if(h.welcomeOpen()){ h.closeWelcome(true); return; }');
}

function transformBus(body) {
  return body
    .replace(/if\(!micLevelUiVisible\(\)\)/g, 'if(!h.micLevelUiVisible())')
    .replace(/\bupdateMicLevelBars\b/g, 'h.updateMicLevelBars')
    .replace(/\bclearMicBackoff\b/g, 'h.clearMicBackoff')
    .replace(/\bhandleMicMonitorError\b/g, 'h.handleMicMonitorError')
    .replace(/\bapplyMvpInit\b/g, 'h.applyMvpInit')
    .replace(/\btoast\(/g, 'h.toast(')
    .replace(/\brender\(\)/g, 'h.render()')
    .replace(/\bmarkFirstSuccessDone\b/g, 'h.markFirstSuccessDone')
    .replace(/\bonboardEmit\b/g, 'h.onboardEmit')
    .replace(/\brenderHome\(\)/g, 'h.renderHome()')
    .replace(/\bplaySoundCue\b/g, 'h.playSoundCue')
    .replace(/\bisVoiceWakeRuntimeAction\b/g, 'h.isVoiceWakeRuntimeAction')
    .replace(/\bscheduleRuntimeRender\b/g, 'h.scheduleRuntimeRender')
    .replace(/\bensureConfig\b/g, 'h.ensureConfig')
    .replace(/\bshowSchemeSwitchFeedback\b/g, 'h.showSchemeSwitchFeedback')
    .replace(/\bhandleTestSendResult\b/g, 'h.handleTestSendResult');
}

function transformBoot(body) {
  body = prefixHookCalls(body);
  return body
    .replace(/state\.firstSuccess=isFirstSuccessDone\(\)/g, 'state.firstSuccess=h.isFirstSuccessDone()')
    .replace(/state\.config=defaultConfig\(\)/g, 'state.config=h.defaultConfig()')
    .replace(/state\.update=defaultUpdateState\(\)/g, 'state.update=h.defaultUpdateState()')
    .replace(/\bensureConfig\(\)/g, 'h.ensureConfig()')
    .replace(/\bsyncEditorFromSelection\(\)/g, 'h.syncEditorFromSelection()')
    .replace(/\bapplyLang\(true,\{bootstrap:true\}\)/g, 'h.applyLang(true,{bootstrap:true})')
    .replace(/\brenderHome\(\)/g, 'h.renderHome()')
    .replace(/\bscheduleLangBootstrap\(\)/g, 'h.scheduleLangBootstrap()')
    .replace(/setRecording\('none',\{silent:true\}\)/g, "h.setRecording('none',{silent:true})")
    .replace(/pushLog\(t\('waitLog'\)\)/g, "h.pushLog(t('waitLog'))")
    .replace(/\bdeferProcessUsagePoll\(\)/g, 'h.deferProcessUsagePoll()')
    .replace(/\bmaybeStartProcessUsagePoll\(\)/g, 'h.maybeStartProcessUsagePoll()')
    .replace(/\brequestBackendConfig\(8\)/g, 'h.requestBackendConfig(8)')
    .replace(/if\(savedTheme==='dark'\|\|savedTheme==='light'\) theme=savedTheme;/g, "if(savedTheme==='dark'||savedTheme==='light') h.setTheme(savedTheme);")
    .replace(/if\(savedFontScale&&FONT_SCALE_VALUES\[savedFontScale\]\) fontScale=savedFontScale;/g, 'if(savedFontScale&&h.fontScaleValues()[savedFontScale]) h.setFontScale(savedFontScale);')
    .replace(/if\(window\.OneToneOnboarding&&window\.OneToneOnboarding\.shouldAutoOpen\(\)\) welcomeOpen=true;/g, 'if(window.OneToneOnboarding&&window.OneToneOnboarding.shouldAutoOpen()) h.setWelcomeOpen(true);')
    .replace(/uiBootstrapping=false;/g, 'h.setUiBootstrapping(false);')
    .replace(/if\(welcomeOpen\) h\.openWelcome\(\);/g, 'if(h.welcomeOpen()) h.openWelcome();')
    .replace(/if\(welcomeOpen\) markBoot/g, 'if(h.welcomeOpen()) markBoot');
}

const body = transformUi(uiLines.join('\n'));
const busBody = transformBus(busLines.join('\n'));
const bootBody = transformBoot(bootLines.join('\n'));

const out =
  header +
  body.split('\n').map((l) => '    ' + l).join('\n') +
  mid +
  busBody.split('\n').map((l) => '    ' + l).join('\n') +
  bootHeader +
  bootBody.split('\n').map((l) => '    ' + l).join('\n') +
  footer;

fs.writeFileSync(outPath, out, 'utf8');
console.log('wrote', outPath, 'lines', out.split('\n').length);
