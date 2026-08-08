// Guard: follow-foreground toggle (default off) + edit-aligned scene cards.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wb = readFileSync(join(root, 'src/js/features/home/home-workbench.js'), 'utf8');
const panels = readFileSync(join(root, 'src/js/features/home/home-workbench-panels.js'), 'utf8');
const css = readFileSync(join(root, 'src/css/home-workbench.css'), 'utf8');
const html = readFileSync(join(root, 'src/index.html'), 'utf8');
const persist = readFileSync(join(root, 'src/js/core/config-persist.js'), 'utf8');
const rust = readFileSync(join(root, 'src-tauri/src/config.rs'), 'utf8');

assert.match(html, /id="wbFollowFgToggle"/);
assert.match(html, /wb-scene-rail-follow-block|wbFollowFgHint/);
assert.match(wb, /followForegroundAppScenario/);
assert.match(wb, /syncFollowForegroundApp/);
assert.match(wb, /setFollowFgEnabled/);
assert.match(wb, /source:'foreground'/);
assert.match(wb, /source:'manual'/);
assert.match(wb, /homeWbFollowFgOffHint|homeWbHabitRailTempPick/);
assert.doesNotMatch(wb, /钉住|手动模式|固定使用/);
assert.match(persist, /followForegroundAppScenario:false/);
assert.match(persist, /followForegroundAppScenario:!!st\.config\.followForegroundAppScenario/);
assert.match(rust, /follow_foreground_app_scenario/);
assert.match(rust, /rename = "followForegroundAppScenario"/);
assert.match(rust, /if !cfg\.follow_foreground_app_scenario/);

const card = panels.match(/function sceneChipHtml\([\s\S]*?\n  function /);
assert.ok(card);
assert.doesNotMatch(card[0], /data-wb-scenario-use/);
assert.doesNotMatch(card[0], /data-wb-scenario-edit/);
assert.match(card[0], /wb-scene-chip/);
assert.match(panels, /data-wb-habit-open-hub/);
assert.doesNotMatch(panels, /function sceneSummaryHtml/);
assert.match(panels, /Never prune\+persist on paint|Display filter below is enough/);
assert.doesNotMatch(
  panels.match(/function renderScenarioPanel\([\s\S]*?\n  function /)?.[0] || '',
  /pruneIncompleteCustomStubs\(\{persist:true\}\)/
);
assert.match(panels, /homeWbHabitRailTempPick/);
assert.match(panels, /softPadActiveHabitConfigLayer/);
assert.match(panels, /finalizeSoftPadSnapshot/);
assert.match(panels, /homeWbSoftPadHabitNa/);
assert.match(panels, /homeWbSoftPadControlAuto/);
assert.doesNotMatch(
  panels.match(/function finalizeSoftPadSnapshot\([\s\S]*?\n  function /)?.[0] || '',
  /homeWbHowToSoftPadOn/
);
assert.match(wb, /openHabitsHubForMapping/);
assert.match(wb, /data-wb-habit-open-hub/);
assert.match(wb, /panel:'habits',\s*focus:'mappings'/);
assert.match(wb, /hasAppScenarioMappings/);
assert.match(html, /id="wbHabitManage"/);
assert.match(css, /\.wb-scene-chip\b/);
assert.match(css, /align-self:\s*center/);
assert.match(css, /\.wb-scene-rail-follow-block/);
assert.doesNotMatch(css, /\.wb-scene-summary\s*\{/);

const snap = panels.match(/function softPadHowToSnapshot\(\)\{[\s\S]*?\n  function /);
assert.ok(snap);
assert.match(snap[0], /resolvePrimaryLane/);
assert.match(snap[0], /finalizeSoftPadSnapshot/);
assert.doesNotMatch(snap[0], /\(on\.length\s*\?\s*on\s*:\s*entries\)\s*\[\s*0\s*\]/);

const activate = readFileSync(join(root, 'src/js/features/scene/scene-activate.js'), 'utf8');
assert.match(activate, /pendingSwitchSource/);
assert.match(activate, /takePendingSwitchSource/);
assert.match(activate, /source:'foreground'|normalizeSource/);

const feedback = readFileSync(join(root, 'src/js/features/home/scheme-switch-feedback.js'), 'utf8');
assert.match(feedback, /schemeSwitchedHonest/);
assert.match(feedback, /schemeSwitchedAuto/);
assert.match(feedback, /source==='foreground'/);

const heroModel = readFileSync(join(root, 'src/js/features/home/home-hero-mode-model.js'), 'utf8');
assert.match(heroModel, /softPad-config/);
assert.match(heroModel, /softPad-control/);
assert.doesNotMatch(heroModel, /statusLbl === t\('homeWbHowToSoftPadOn'\)/);

const softHub = readFileSync(join(root, 'src/js/features/agent/soft-pad-hub-ui.js'), 'utf8');
assert.match(softHub, /resolvePrimaryLane:\s*resolvePrimaryLane/);
assert.match(softHub, /pickHubDefaultScopeId:\s*pickHubDefaultScopeId/);
assert.match(wb, /noteLaneForeground/);

console.log('ok habit-follow-fg');
