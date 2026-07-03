const fs = require('fs');
const path = require('path');

const registerPath = path.join(__dirname, '../src/js/core/app-legacy-register.js');
const shimsPath = path.join(__dirname, '../src/js/core/app-legacy-shims.js');
const outPath = registerPath;

const registerSrc = fs.readFileSync(registerPath, 'utf8').replace(/^\uFEFF/, '');
const lines = registerSrc.split(/\r?\n/);
const start = lines.findIndex((l) => l.includes('function registerCoreHooks'));
const end = lines.findIndex((l, i) => i > start && /^\s+registerCoreHooks\(\);/.test(l));
if (start < 0 || end < 0) {
  console.error('Could not find register block in', registerPath, { start, end });
  process.exit(1);
}
const block = lines.slice(start, end).join('\n');
const registerCalls = [
  '    registerCoreHooks();',
  '    registerSettingsDebugHooks();',
  '    registerVoiceHooks();',
  '    registerHomeHooks();',
  '    registerMappingHooks();',
  '    registerRuntimeHooks();',
  '    registerAppLangHooks();',
  '    registerBootstrapHooks();',
].join('\n');

const shimsSrc = fs.readFileSync(shimsPath, 'utf8').replace(/^\uFEFF/, '');
const buildStart = shimsSrc.indexOf('function build(){');
const returnStart = shimsSrc.indexOf('    return {', buildStart);
const shimBody = shimsSrc.slice(buildStart, returnStart > buildStart ? returnStart : shimsSrc.length);
const symbols = new Set();
for (const m of shimBody.matchAll(/^\s+(?:function\s+(\w+)|const\s+(\w+)|let\s+(\w+))/gm)) {
  symbols.add(m[1] || m[2] || m[3]);
}
symbols.add('logLines');
symbols.add('$');

const globals = new Set([
  'OneToneAppCoreHooks', 'OneToneSettingsDebugHooks', 'OneToneVoiceHomeSync', 'OneToneVoiceHooks',
  'OneToneAppHomeRuntimeHooks', 'OneToneHomeHooks', 'OneToneMappingHooks', 'OneToneAppRuntimeHooks',
  'OneToneAppLangHooks', 'OneToneAppBootstrapHooks', 'OneToneAppThemePrefs', 'OneToneAppBridge',
  'OneToneConfigPersist', 'OneToneAppMic', 'OneToneAppSession', 'OneToneAppProcessUsage',
  'OneToneMappingRecording', 'OneToneMappingTrashMenu', 'OneToneMappingTestSend', 'OneToneMappingList',
  'OneToneVoiceSettingsFlow', 'OneToneVoiceWake', 'OneToneHomeGuide', 'OneToneI18n',
  'OneToneAppGlobalError', 'OneToneMappingEditorState', 'window', 'global', 'globalThis',
  'true', 'false', 'null', 'undefined', 'function', 'return', 'if', 'else', 'var', 'new', 'Promise',
  'console', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Date', 'JSON', 'Error',
  'registerCoreHooks', 'registerSettingsDebugHooks', 'registerVoiceHooks', 'registerHomeHooks',
  'registerMappingHooks', 'registerRuntimeHooks', 'registerAppLangHooks', 'registerBootstrapHooks',
]);

let body = block;
// If block already uses d.* refs, normalize by stripping then re-applying.
body = body.replace(/\bd\.(\$|\w+)\b/g, '$1');
body = body.replace(/function\(\)\{\s*return state\(\);\s*\}/g, 'function(){ return state; }');
body = body.replace(/function\(\)\{\s*return ui\(\);\s*\}/g, 'function(){ return ui; }');
body = body.replace(/function\(\)\{\s*return runtime\(\);\s*\}/g, 'function(){ return runtime; }');

const sorted = [...symbols].sort((a, b) => b.length - a.length);
for (const sym of sorted) {
  if (globals.has(sym)) continue;
  const esc = sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reShorthand = new RegExp('([,{\\s])' + esc + ':(' + esc + ')(?=[,\\s}])', 'g');
  body = body.replace(reShorthand, '$1' + sym + ':d.' + sym);
  if (sym === 'state' || sym === 'ui' || sym === 'runtime') {
    body = body.replace(/function\(\)\{\s*return state;\s*\}/g, 'function(){ return d.state(); }');
    body = body.replace(/function\(\)\{\s*return ui;\s*\}/g, 'function(){ return d.ui(); }');
    body = body.replace(/function\(\)\{\s*return runtime;\s*\}/g, 'function(){ return d.runtime(); }');
  }
  const reVal = new RegExp('(?<![.\\w$])' + esc + '(?![.\\w])', 'g');
  body = body.replace(reVal, (match, offset, str) => {
    if (offset >= 2 && str.slice(offset - 2, offset) === 'd.') return match;
    const after = str[offset + match.length];
    if (after === ':') return match;
    return 'd.' + sym;
  });
}
body = body.replace(/d\.d\./g, 'd.');
for (const sym of symbols) {
  if (globals.has(sym)) continue;
  const esc = sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  body = body.replace(new RegExp('([,{\\s])' + esc + ':(' + esc + ')(?=[,\\s}])', 'g'), '$1' + sym + ':d.' + sym);
}

const out = [
  '(function(global){',
  "  'use strict';",
  '',
  '  function registerAll(d){',
  ...body.split('\n').map((l) => '    ' + l),
  '',
  registerCalls,
  '  }',
  '',
  '  global.OneToneAppLegacyRegister={registerAll:registerAll};',
  "})((typeof window!=='undefined')?window:globalThis);",
  '',
].join('\n');

fs.writeFileSync(outPath, out);
console.log('Wrote', outPath, '(' + out.length + ' chars)');
