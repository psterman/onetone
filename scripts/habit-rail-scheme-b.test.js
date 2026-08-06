'use strict';

/** Guard: home habit rail — chips + flyout to hub; no duplicate summary card. */
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
assert.ok(!panels.includes('function sceneSummaryHtml'));
assert.ok(!panels.includes('wb-scene-summary"'));
assert.ok(panels.includes('function sceneChipShortName'));
assert.ok(panels.includes('function chipFlyoutContent'));
assert.ok(panels.includes('wb-scene-chips'));
assert.ok(panels.includes('wbSceneChipFlyout'));
assert.ok(panels.includes('data-wb-habit-open-hub'));
assert.ok(panels.includes('data-wb-chip-id'));
assert.ok(!/function sceneCardHtml\(/.test(panels));
assert.ok(!panels.includes('data-wb-scenario-edit'));

assert.ok(wb.includes('function openHabitsHubForMapping'));
assert.ok(wb.includes('function showChipFlyout'));
assert.ok(wb.includes('function hideChipFlyout'));
assert.ok(wb.includes('bindChipFlyout'));
assert.ok(wb.includes('chipFlyoutOpenId'));
assert.ok(wb.includes('OneToneSceneActivate.activateScene'));
assert.ok(/panel:\s*'habits',\s*focus:\s*'mappings'/.test(wb));
assert.ok(wb.includes('data-habit-card'));
assert.ok(wb.includes('hasAppScenarioMappings'));
assert.ok(wb.includes('data-wb-scenario-use'));

var activate = fs.readFileSync(path.join(root, 'src/js/features/scene/scene-activate.js'), 'utf8');
assert.ok(activate.includes('mvp_scheme_select'));
assert.ok(activate.includes('cfg.activeSceneId=id'));
assert.ok(!/HomeWorkbench\.forceHomeRender|wb\.render/.test(activate));
var feedback = fs.readFileSync(path.join(root, 'src/js/features/home/scheme-switch-feedback.js'), 'utf8');
assert.ok(feedback.includes('requestAnimationFrame'));
assert.ok(/forceHomeRender[\s\S]*requestAnimationFrame[\s\S]*wb\.render/.test(feedback));
assert.ok(feedback.includes('drawerOpen'));

assert.ok(html.includes('id="wbHabitManage"'));
assert.ok(html.includes('wb-scene-rail-body') || html.includes('id="wbScenarioPanel"'));
assert.ok(css.includes('.wb-scene-chip'));
assert.ok(css.includes('justify-content: center') || css.includes('justify-content:center'));
assert.ok(css.includes('-webkit-line-clamp: 2') || css.includes('-webkit-line-clamp:2'));
assert.ok(css.includes('.wb-scene-chip-flyout'));
assert.ok(css.includes('align-self: center'));
assert.ok(css.includes('.wb-scene-summary-cta'));
assert.ok(!/\.wb-scene-summary\s*\{/.test(css));
assert.ok(i18n.includes('homeWbHabitOpenHub'));
assert.ok(i18n.includes('homeWbChipUniversal'));

console.log('ok habit-rail-scheme-b');
