'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var orch = fs.readFileSync(path.join(root, 'src/js/features/home/quick-start-orchestrator.js'), 'utf8');
var css = fs.readFileSync(path.join(root, 'src/css/qs-mode-matrix.css'), 'utf8');
var indexHtml = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');

assert.ok(indexHtml.includes('css/qs-mode-matrix.css'), 'qs-mode-matrix.css linked in index');

assert.ok(orch.includes('qs-mode-matrix'), 'matrix root class in orchestrator');
assert.ok(orch.includes('data-type="newbie"'), 'newbie card');
assert.ok(orch.includes('data-type="vibe"'), 'vibe card');
assert.ok(orch.includes('data-type="veteran"'), 'veteran card');
assert.ok(orch.includes('function selectModeCard'), 'selectModeCard helper');
assert.ok(orch.includes("classList.add('has-selection')") || orch.includes('classList.add("has-selection")'), 'has-selection on select');
assert.ok(orch.includes("classList.remove('has-selection')") || orch.includes('classList.remove("has-selection")'), 'has-selection cleared on re-click');
assert.ok(orch.includes("id=\"qsGoBeginner\"") || orch.includes("id='qsGoBeginner'"), 'beginner confirm CTA');
assert.ok(orch.includes("id=\"qsGoVibe\"") || orch.includes("id='qsGoVibe'"), 'vibe confirm CTA');
assert.ok(orch.includes('qsVeteranPick') && orch.includes('data-qs-panel'), 'veteran pick rows');
assert.ok(orch.includes("startCore('beginner')"), 'beginner path wired');
assert.ok(orch.includes('goTool()'), 'vibe path wired');
assert.ok(orch.includes('openSettingsPanel'), 'pick opens settings');
assert.ok(orch.includes('selectModeCard:selectModeCard'), 'selectModeCard exported');
assert.ok(orch.includes('handleHeaderBack:handleHeaderBack'), 'handleHeaderBack exported');
assert.ok(orch.includes('qsMicSvg'), 'preset mic SVG helper');
assert.ok(orch.includes('qs-newbie-scene'), 'newbie scene markup');
assert.ok(orch.includes('qs-newbie-hero'), 'newbie hero wrapper for centered rings');
assert.ok(orch.includes('qs-newbie-rings'), 'concentric ring markup');
assert.ok(orch.includes('我是新手'), 'newbie title copy');
assert.ok(orch.includes('程序员'), 'programmer title copy');
assert.ok(orch.includes('老用户'), 'veteran title copy');
assert.ok(orch.includes('已检测 6 个 agent'), 'default agent chip');
assert.ok(orch.includes('qsIntentAgentsN'), 'dynamic agent count key');
assert.ok(!orch.includes('qs-mode-matrix__brand'), 'no OneTone brand block');
assert.ok(!orch.includes('qs-float-badge'), 'no marketing float badges');
assert.ok(!orch.includes('qs-speech-ribbon'), 'no speech ribbon');
assert.ok(!orch.includes('零配置'), 'no marketing copy');
assert.ok(orch.match(/veteranFrame1[\s\S]*veteranFrame1/), 'veteran frame1 clone for seamless loop');
assert.ok(orch.includes("ev.target.closest('button,[data-qs-panel]')"), 'CTA/pick clicks do not toggle card');
assert.ok(indexHtml.includes('habit-setup-back--header'), 'header back button markup');
assert.ok(indexHtml.includes('habit-setup-screen--matrix'), 'matrix full-bleed class on intent view');

assert.ok(css.includes('.qs-mode-matrix'), 'scoped matrix CSS');
assert.ok(css.includes('@keyframes qs-newbie-ring'), 'newbie ring keyframes');
assert.ok(css.includes('@keyframes qs-newbie-bar-mid'), 'symmetrical bar keyframes');
assert.ok(css.includes('@keyframes qs-quad-carousel'), 'quad carousel keyframes');
assert.ok(css.includes('@keyframes qs-code-scroll'), 'code scroll keyframes');
assert.ok(css.includes('.cards-container.has-selection .mode-card.selected'), 'selection scale CSS');
assert.ok(css.includes('#habitSetupIntentView'), 'intent view dark stage');
assert.ok(css.includes('habit-setup-screen--matrix'), 'matrix screen modifier');
assert.ok(css.includes('height:min(72vh,680px)'), 'cards height capped with whitespace');
assert.ok(css.includes('width:min(100%,1280px)'), 'cards width capped');
assert.ok(css.includes('width:230px'), 'single-frame veteran viewport');
assert.ok(!css.includes('qs-quad-fade'), 'no side fades on single-frame carousel');
assert.ok(css.includes('.qs-newbie-scene'), 'newbie scene styles');
assert.ok(css.includes('.qs-mic-ico svg'), 'preset mic SVG styled');
assert.ok(!/\.mode-card:not\(\.selected\)\{[^}]*pointer-events\s*:\s*none/.test(css), 'non-selected cards remain clickable');

/* Minimal DOM stand-in for selectModeCard algorithm (mirrors orchestrator). */
function mockCard(type){
  var set = {};
  return {
    _set: set,
    classList: {
      contains: function(c){ return !!set[c]; },
      add: function(c){ set[c] = true; },
      remove: function(c){ delete set[c]; }
    },
    getAttribute: function(k){ return k === 'data-type' ? type : null; }
  };
}
function selectModeCard(container, card){
  if(!container || !card) return null;
  if(card.classList.contains('selected')){
    container.classList.remove('has-selection');
    card.classList.remove('selected');
    return null;
  }
  container.classList.add('has-selection');
  var cards = container.querySelectorAll('.mode-card');
  for(var i = 0; i < cards.length; i++) cards[i].classList.remove('selected');
  card.classList.add('selected');
  return card.getAttribute('data-type') || null;
}
var a = mockCard('newbie');
var b = mockCard('vibe');
var container = {
  _set: {},
  classList: {
    contains: function(c){ return !!container._set[c]; },
    add: function(c){ container._set[c] = true; },
    remove: function(c){ delete container._set[c]; }
  },
  querySelectorAll: function(){ return [a, b]; }
};
assert.strictEqual(selectModeCard(container, a), 'newbie');
assert.ok(container.classList.contains('has-selection') && a.classList.contains('selected'));
assert.strictEqual(selectModeCard(container, b), 'vibe');
assert.ok(b.classList.contains('selected') && !a.classList.contains('selected'));
assert.strictEqual(selectModeCard(container, b), null);
assert.ok(!container.classList.contains('has-selection'));

console.log('qs-mode-matrix tests passed');
