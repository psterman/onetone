'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var tip = fs.readFileSync(path.join(root, 'src/js/core/hover-tip.js'), 'utf8');
var css = fs.readFileSync(path.join(root, 'src/css/app.css'), 'utf8');
var indexHtml = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
var panels = fs.readFileSync(path.join(root, 'src/js/features/home/home-workbench-panels.js'), 'utf8');
var workbench = fs.readFileSync(path.join(root, 'src/js/features/home/home-workbench.js'), 'utf8');
var habit = fs.readFileSync(path.join(root, 'src/js/features/mapping/habit-hub.js'), 'utf8');
var guide = fs.readFileSync(path.join(root, 'src/js/features/home/home-guide.js'), 'utf8');
var overlayCss = fs.readFileSync(path.join(root, 'src/css/codex-micro-overlay.css'), 'utf8');
var overlayHtml = fs.readFileSync(path.join(root, 'src/codex-micro-overlay.html'), 'utf8');

assert.ok(tip.includes('OneToneHoverTip'), 'HoverTip export');
assert.ok(tip.includes("ATTR='data-ot-tip'") || tip.includes('ATTR="data-ot-tip"'), 'data-ot-tip attr');
assert.ok(tip.includes('SHOW_DELAY_MS=280'), 'show delay');
assert.ok(tip.includes('function position'), 'flip position');
assert.ok(tip.includes('removeAttribute(\'title\')') || tip.includes('removeAttribute("title")'), 'strip native title on bind');

assert.ok(indexHtml.includes('js/core/hover-tip.js'), 'hover-tip loaded in index');
assert.ok(css.includes('.ot-hover-tip') && css.includes('.home-guide-hover-tip'), 'shared tip plate CSS');
assert.ok(css.includes('prefers-reduced-motion'), 'reduced motion for tip');
assert.ok(!/habit-hub-act\[data-tip\]:hover::after/.test(css), 'crude habit data-tip CSS removed');
assert.ok(!css.includes('.habit-hub-channel-hover-tip{'), 'orphan channel hover tip CSS removed');

assert.ok(panels.includes('data-ot-tip') && panels.includes('homeWbHowToOpenTip'), 'howto card uses HoverTip');
assert.ok(!/wb-howto-card[^>]*title=/.test(panels.replace(/\s+/g, ' ')), 'howto card has no native title');

assert.ok(workbench.includes('data-ot-tip') && workbench.includes('homeWbListenPauseTip'), 'listen tip on HoverTip');
assert.ok(workbench.includes('OneToneHoverTip') && workbench.includes('setText'), 'listen/live tip updates via setText');

assert.ok(habit.includes('data-ot-tip') && !habit.includes('data-tip='), 'habit hub migrated to data-ot-tip');
assert.ok(guide.includes('ot-hover-tip home-guide-hover-tip') || guide.includes('ot-hover-tip'), 'guide tip shares plate class');
assert.ok(guide.includes('OneToneHoverTip') && guide.includes('hide'), 'guide hides shared tip when showing');
assert.ok(guide.includes('homeGuideVpRect'), 'guide keeps zoom-aware tip position');

assert.ok(overlayCss.includes('rgba(42, 156, 196, 0.36)') || overlayCss.includes('rgba(42,156,196,.36)'), 'overlay tip cyan border');
assert.ok(overlayCss.includes('.overlay-agent-tip.is-show'), 'overlay tip show motion');
assert.ok(overlayHtml.includes("classList.add('is-show')") || overlayHtml.includes('classList.add("is-show")'), 'overlay tip toggles is-show');

console.log('hover-tip unify tests passed');
