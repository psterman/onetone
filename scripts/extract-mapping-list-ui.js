const fs = require('fs');

const bootstrapPath = 'c:/Users/Administrator/Desktop/voice-pilot/src/js/core/app-bootstrap.js';
const outPath = 'c:/Users/Administrator/Desktop/voice-pilot/src/js/features/mapping/mapping-list-ui.js';

const lines = fs.readFileSync(bootstrapPath, 'utf8').split(/\r?\n/);

// 1-indexed line ranges from app-bootstrap.js (mapping list + float menu UI)
const ranges = [
  [458, 463],
  [488, 610],
  [629, 656],
  [664, 683],
];

function inRange(n) {
  return ranges.some(([s, e]) => n >= s && n <= e);
}

const chunks = [];
for (let i = 0; i < lines.length; i++) {
  if (inRange(i + 1)) chunks.push(lines[i]);
}

let body = chunks.join('\n');
body = body.replace(/^\s{6}/gm, '    ');
body = body.replace(/\bh\./g, 'hooks().');
body = body.replace(/if\(openMenuId&&menuAnchorBtn\) hooks\(\)\.openFloatMenu\(openMenuId, menuAnchorBtn\)/g,
  'if(hooks().openMenuId()&&hooks().menuAnchorBtn()) hooks().openFloatMenu(hooks().openMenuId(), hooks().menuAnchorBtn())');

const file = `(function(global){
  'use strict';
  var $ = function(id){ return global.OneToneDom.$(id); };
  function hooks(){ return global.__vp_mapping_list_ui_hooks__ || {}; }
  function bindEvents(){
    var state = global.OneToneState.state;
    var t = hooks().t;
${body}
  }
  global.OneToneMappingListUi = { bindEvents: bindEvents };
})((typeof window !== 'undefined') ? window : globalThis);
`;

fs.writeFileSync(outPath, file, 'utf8');

const out = [];
for (let i = 0; i < lines.length; i++) {
  if (!inRange(i + 1)) out.push(lines[i]);
}

// Insert call after bindUiEvents opens - find "function bindUiEvents" and add call at end before closing }
// Simpler: insert before bindWebViewBus function
const insertLine = '    if(global.OneToneMappingListUi) global.OneToneMappingListUi.bindEvents();';
let inserted = false;
const bootstrapOut = out.map((line) => {
  if (!inserted && line.trim() === 'function bindWebViewBus(){') {
    inserted = true;
    return insertLine + '\n' + line;
  }
  return line;
});

fs.writeFileSync(bootstrapPath, bootstrapOut.join('\n') + '\n', 'utf8');
console.log('mapping-list-ui.js lines', file.split('\n').length);
console.log('app-bootstrap.js lines', bootstrapOut.length);
