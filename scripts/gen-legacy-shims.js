const fs = require('fs');
const path = require('path');

const shimsPath = path.join(__dirname, '../src/js/core/app-legacy-shims.js');
const mainPath = path.join(__dirname, '../src/js/main-legacy.js');
const registerPath = path.join(__dirname, '../src/js/core/app-legacy-register.js');
const outPath = shimsPath;

function extractShimBody(src) {
  const lines = src.split(/\r?\n/);
  const buildStart = lines.findIndex((l) => /function build\(\)/.test(l));
  const returnStart = lines.findIndex((l, i) => i > buildStart && /^\s+return \{/.test(l));
  if (buildStart >= 0 && returnStart > buildStart) {
    return lines.slice(buildStart + 1, returnStart)
      .map((l) => l.replace(/^    /, ''))
      .filter((l, i, arr) => !(i === arr.length - 1 && l.trim() === ''));
  }
  const regStart = lines.findIndex((l) => l.includes('OneToneAppLegacyRegister.registerAll'));
  if (regStart >= 0) {
    return lines.slice(0, regStart)
      .map((l) => l.replace(/^  /, ''))
      .filter((l, i, arr) => !(i === arr.length - 1 && l.trim() === ''));
  }
  return null;
}

const shimsSrc = fs.readFileSync(shimsPath, 'utf8').replace(/^\uFEFF/, '');
let shimLines = extractShimBody(shimsSrc);
if (!shimLines || !shimLines.length) {
  const main = fs.readFileSync(mainPath, 'utf8').replace(/^\uFEFF/, '');
  shimLines = extractShimBody(main);
}
if (!shimLines || !shimLines.length) {
  console.error('Could not extract shim body from', shimsPath, 'or', mainPath);
  process.exit(1);
}

const registerSrc = fs.readFileSync(registerPath, 'utf8');
const used = new Set();
for (const m of registerSrc.matchAll(/\bd\.(\$|\w+)\b/g)) used.add(m[1]);

const shimBody = shimLines.join('\n');
const symbols = new Set(['$']);
for (const m of shimBody.matchAll(/^(?:function\s+(\w+)|const\s+(\$|\w+)|let\s+(\$|\w+))/gm)) {
  symbols.add(m[1] || m[2] || m[3]);
}

const getters = new Set(['state', 'ui', 'runtime']);
const missing = [...used].filter((sym) => !symbols.has(sym));
if (missing.length) {
  console.warn('Register expects symbols not defined in shims:', missing.join(', '));
}

const returnLines = [...used].sort().map((sym) => {
  if (getters.has(sym)) return '      ' + sym + ':function(){ return ' + sym + '; },';
  return '      ' + sym + ':' + sym + ',';
});

const out = [
  '(function(global){',
  "  'use strict';",
  '',
  '  function build(){',
  ...shimBody.split('\n').map((l) => '    ' + l),
  '',
  '    return {',
  ...returnLines,
  '    };',
  '  }',
  '',
  '  global.OneToneAppLegacyShims={build:build};',
  "})((typeof window!=='undefined')?window:globalThis);",
  '',
].join('\n');

fs.writeFileSync(outPath, out);
console.log('Wrote', outPath, '(' + out.split(/\r?\n/).length + ' lines,', used.size, 'exports)');
