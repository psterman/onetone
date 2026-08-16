'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var orch = fs.readFileSync(path.join(root, 'src/js/features/home/quick-start-orchestrator.js'), 'utf8');
var css = fs.readFileSync(path.join(root, 'src/css/qs-mode-matrix.css'), 'utf8');
var indexHtml = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
var i18n = fs.readFileSync(path.join(root, 'src/js/core/i18n.js'), 'utf8');

assert.ok(indexHtml.includes('css/qs-mode-matrix.css'), 'qs-mode-matrix.css linked in index');
assert.ok(indexHtml.includes('id="wbNavRuntime"') && /id="wbNavRuntime"[^>]*\bhidden\b/.test(indexHtml), 'runtime nav hidden');

assert.ok(orch.includes('qs-mode-matrix'), 'matrix root class in orchestrator');
assert.ok(orch.includes('data-type="newbie"'), 'newbie card');
assert.ok(orch.includes('data-type="vibe"'), 'vibe card');
assert.ok(orch.includes('data-type="veteran"'), 'veteran card');
assert.ok(!orch.includes('qsGoBeginner'), 'beginner CTA button removed');
assert.ok(!orch.includes('qsGoVibe'), 'vibe CTA button removed');
assert.ok(!orch.includes('qs-mode-confirm'), 'confirm CTA chrome removed');
assert.ok(orch.includes("startCore('beginner')"), 'beginner path wired');
assert.ok(orch.includes('goTool()'), 'vibe path wired');
assert.ok(orch.includes("openSettingsPanel('debug'"), 'veteran opens debug');
assert.ok(orch.includes('data-qs-debug'), 'maintenance debug rows');
assert.ok(!orch.includes('data-qs-panel'), 'old settings jump panels removed');
assert.ok(orch.includes('qsMaintRow') && orch.includes('qs-pick-row__ico'), 'maint pick icons');
assert.ok(orch.includes("ev.target.closest('button,[data-qs-debug]')"), 'debug row clicks do not re-enter card');
assert.ok(orch.includes('handleHeaderBack:handleHeaderBack'), 'handleHeaderBack exported');
assert.ok(orch.includes('qsMicSvg'), 'preset mic SVG helper');
assert.ok(orch.includes('qs-newbie-scene'), 'newbie scene markup');
assert.ok(orch.includes('后台维护'), 'maint title copy');
assert.ok(orch.includes('已检测 6 个 agent'), 'default agent chip');
assert.ok(orch.includes('qsIntentAgentsN'), 'dynamic agent count key');
assert.ok(!orch.includes('qs-mode-matrix__brand'), 'no OneTone brand block');
assert.ok(orch.match(/veteranFrame1[\s\S]*veteranFrame1/), 'veteran frame1 clone for seamless loop');
assert.ok(indexHtml.includes('habit-setup-back--header'), 'header back button markup');
assert.ok(indexHtml.includes('habit-setup-screen--matrix'), 'matrix full-bleed class on intent view');

assert.ok(i18n.includes("qsIntentPickTitle:'后台维护'"), 'zh maint title');
assert.ok(i18n.includes("qsIntentPickTitle:'Background maintenance'"), 'en maint title');

assert.ok(css.includes('.qs-mode-matrix'), 'scoped matrix CSS');
assert.ok(css.includes('@keyframes qs-newbie-ring'), 'newbie ring keyframes');
assert.ok(css.includes('@keyframes qs-quad-carousel'), 'quad carousel keyframes');
assert.ok(css.includes('.mode-card[data-type="veteran"]:is(:hover, :focus-within) .qs-veteran-pick'), 'maint options on hover');
assert.ok(!css.includes('.mode-card.selected .qs-mode-confirm'), 'selected confirm CTA css gone');
assert.ok(css.includes('.mode-card:hover .selection-badge'), 'badge on hover');
assert.ok(!/\.mode-card:not\(\.selected\)\{[^}]*pointer-events\s*:\s*none/.test(css), 'non-selected cards remain clickable');

console.log('qs-mode-matrix tests passed');
