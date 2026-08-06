'use strict';

/** Guard: home habit rail scheme B — chips + summary + jump to habits hub. */
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var panels = fs.readFileSync(path.join(root, 'src/js/features/home/home-workbench-panels.js'), 'utf8');
var wb = fs.readFileSync(path.join(root, 'src/js/features/home/home-workbench.js'), 'utf8');
var html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
var css = fs.readFileSync(path.join(root, 'src/css/home-workbench.css'), 'utf8');
var i18n = fs.readFileSync(path.join(root, 'src/js/core/i18n.js'), 'utf8');

assert.ok(panels.includes('function sceneChipHtml'));
assert.ok(panels.includes('function sceneSummaryHtml'));
assert.ok(panels.includes('wb-scene-chips'));
assert.ok(panels.includes('data-wb-habit-open-hub'));
assert.ok(!/function sceneCardHtml\(/.test(panels));
assert.ok(!panels.includes('data-wb-scenario-edit'));

assert.ok(wb.includes('function openHabitsHubForMapping'));
assert.ok(/panel:\s*'habits',\s*focus:\s*'mappings'/.test(wb));
assert.ok(wb.includes('data-habit-card'));
assert.ok(wb.includes('hasAppScenarioMappings'));

assert.ok(html.includes('id="wbHabitManage"'));
assert.ok(html.includes('wb-scene-rail-body') || html.includes('id="wbScenarioPanel"'));
assert.ok(css.includes('.wb-scene-chip'));
assert.ok(css.includes('.wb-scene-summary-cta'));
assert.ok(i18n.includes("homeWbHabitOpenHub:'查看全部'") || i18n.includes('homeWbHabitOpenHub'));

console.log('ok habit-rail-scheme-b');
