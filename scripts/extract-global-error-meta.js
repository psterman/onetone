const fs = require('fs');
const p = require('path').join(__dirname, '../src/js/main-legacy.js');
let lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);

// Remove const logLines=[] 
const logLinesIdx = lines.findIndex((l) => l.trim() === 'const logLines=[];');
if (logLinesIdx >= 0) lines.splice(logLinesIdx, 1);

// Remove logGlobalError block
const logErrStart = lines.findIndex((l) => l.includes('function logGlobalError('));
const logErrEnd = lines.findIndex((l, i) => i > logErrStart && l.includes('function newMappingId()'));
if (logErrStart >= 0 && logErrEnd > logErrStart) lines.splice(logErrStart, logErrEnd - logErrStart);

// Remove formatSourceTime through renderSwitchKeysBlock (before renderModeAnim)
const metaStart = lines.findIndex((l) => l.includes('function formatSourceTime('));
const metaEnd = lines.findIndex((l, i) => i > metaStart && l.includes('function renderModeAnim('));
if (metaStart >= 0 && metaEnd > metaStart) lines.splice(metaStart, metaEnd - metaStart);

// Remove pushLog function
const pushStart = lines.findIndex((l) => l.includes('function pushLog('));
const pushEnd = lines.findIndex((l, i) => i > pushStart && l.includes('function openWelcome('));
if (pushStart >= 0 && pushEnd > pushStart) lines.splice(pushStart, pushEnd - pushStart);

const insertAt = lines.findIndex((l) => l.includes('function registerConfigPersistHooks()'));
const block = [
  '  const logLines=OneToneAppGlobalError.logLines;',
  '  function pushLog(line){ return OneToneAppGlobalError.pushLog(line); }',
  '  function logGlobalError(kind,detail){ return OneToneAppGlobalError.logGlobalError(kind,detail); }',
  '  function formatSourceTime(raw){ return OneToneMappingMetaRender.formatSourceTime(raw); }',
  '  function formatNativeKeyLabels(m){ return OneToneMappingMetaRender.formatNativeKeyLabels(m); }',
  '  function renderTriggerMetaBlock(m,id){ return OneToneMappingMetaRender.renderTriggerMetaBlock(m,id); }',
  '  function renderNativeRestoreBlock(m,id){ return OneToneMappingMetaRender.renderNativeRestoreBlock(m,id); }',
  '  function renderSwitchKeysBlock(m,id){ return OneToneMappingMetaRender.renderSwitchKeysBlock(m,id); }',
  '',
  '  function registerAppGlobalErrorHooks(){',
  '    window.__vp_app_global_error_hooks__={',
  '      t:t,',
  '      vpInvoke:vpInvoke,',
  '      toast:toast,',
  '      renderDebugDeveloperPanel:renderDebugDeveloperPanel,',
  '      renderSettingsDebugSubnav:renderSettingsDebugSubnav',
  '    };',
  '  }',
  '  registerAppGlobalErrorHooks();',
  '',
  '  function registerMappingMetaRenderHooks(){',
  '    window.__vp_mapping_meta_render_hooks__={',
  '      normalizeTriggerKey:normalizeTriggerKey,',
  '      friendlyKeyName:friendlyKeyName,',
  '      ensureMappingExtras:ensureMappingExtras',
  '    };',
  '  }',
  '  registerMappingMetaRenderHooks();',
  '',
];
lines.splice(insertAt, 0, ...block);

// Update bootstrap clearLogLines
let content = lines.join('\n');
content = content.replace(
  /clearLogLines:function\(\)\{ logLines\.length=0; \}/,
  'clearLogLines:function(){ OneToneAppGlobalError.clearLogLines(); }'
);

fs.writeFileSync(p, content);
console.log('done, lines:', content.split(/\n/).length);
