/**
 * Guard: Keys settings three-col desk — rail (trigger+recognize) | detail | scene.
 * Aligns with prototypes/keys-rail-plan.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'src/index.html'), 'utf8');
const css = readFileSync(join(root, 'src/css/keys-workflow.css'), 'utf8');
const state = readFileSync(join(root, 'src/js/features/mapping/keys-page-state.js'), 'utf8');
const table = readFileSync(join(root, 'src/js/features/mapping/habit-key-mapping-table.js'), 'utf8');
const panelUi = readFileSync(join(root, 'src/js/features/settings/keys-panel-ui.js'), 'utf8');
const i18n = readFileSync(join(root, 'src/js/core/i18n.js'), 'utf8');

assert.ok(html.includes('keys-page-body--three-col'), 'body marks three-col');
assert.ok(html.includes('id="keysPageRail"'), 'left rail host');
assert.ok(html.includes('id="habitKeyMapCellTrigger"'), 'trigger keycap id kept');
assert.ok(html.includes('id="keysChannelPaneLeft"'), 'directory pane kept');
assert.ok(!html.includes('id="keysChannelSearch"'), 'no channel search in rail');
assert.ok(html.includes('id="keysChannelPaneRight"'), 'detail pane kept');
assert.ok(html.includes('id="keysSceneActionsPanel"'), 'scene dock kept');
assert.ok(html.includes('id="keysTriggerModeHost"'), 'trigger mode host kept');
assert.ok(html.includes('keys-work-tag__modes'), 'modes live in work-tag (not rail)');
{
  const railStart = html.indexOf('id="keysPageRail"');
  const workTag = html.indexOf('id="keysWorkTag"');
  assert.ok(railStart > 0 && workTag > railStart, 'work tag after rail');
  const railBlock = html.slice(railStart, workTag);
  assert.ok(!railBlock.includes('keysTriggerModeHost'), 'modes host not inside rail');
  assert.ok(html.slice(workTag, workTag + 800).includes('keysTriggerModeHost'), 'modes host in work tag');
}
assert.ok(
  /keys-scene-actions__foot[\s\S]*?id="keysSceneActionsAdd"/.test(html),
  'add action lives in scene foot'
);
assert.ok(html.includes('keys-page-rail__item'), 'rail uses clean item class');
assert.ok(!html.includes('keysChannelTabImeN'), 'no secondary .n labels on rail items');
assert.ok(
  /id="keysPageRail"[\s\S]*?id="keysRecordingFeedback"[\s\S]*?id="keysChannelPaneLeft"/.test(html),
  'recording feedback sits in rail above directory'
);
assert.ok(html.includes('id="keysWorkTag"'), 'work tag bar present');
assert.ok(
  /id="keysFlowNodes"[^>]*\bhidden\b/.test(html) ||
    (html.includes('id="keysFlowNodes"') && html.includes('flow-nodes sr-only')),
  'flow nodes hidden'
);
assert.ok(html.includes('keys-channel-split--detail-only'), 'split is detail-only');

const railIdx = html.indexOf('id="keysPageRail"');
const triggerIdx = html.indexOf('id="habitKeyMapRowTrigger"');
const dirIdx = html.indexOf('id="keysChannelPaneLeft"');
const rightIdx = html.indexOf('id="keysChannelPaneRight"');
assert.ok(railIdx > 0 && triggerIdx > railIdx && dirIdx > triggerIdx, 'rail: trigger then directory');
assert.ok(rightIdx > dirIdx, 'detail pane after directory');
assert.ok(!/keys-page-rail[\s\S]{0,800}录到的用法/.test(html), 'no primary 录到的用法 block on rail');

assert.ok(css.includes('keys-page-body--three-col'), 'css three-col grid');
assert.ok(css.includes('keys-page-rail'), 'css rail styles');
assert.ok(css.includes('180px minmax(0, 1fr)'), 'css rail | main columns');
assert.ok(css.includes('keys-page-rail__item'), 'css rail item');
assert.ok(css.includes('keys-work-tag'), 'css work tag');
assert.ok(css.includes('grid-column: 1 !important'), 'rail pinned to column 1');
assert.ok(css.includes('grid-column: 2 !important'), 'main pinned to column 2');
assert.ok(css.includes('min-height: 120px'), 'directory tree has min height for tabs');
assert.ok(css.includes('keys-channel-split--detail-only'), 'css detail-only split');

assert.ok(state.includes("activeStep='target'"), 'default step target for channel refresh');
assert.ok(state.includes("el.classList.add('is-active-step')"), 'both steps stay active');
assert.ok(state.includes('keys-page-body--three-col'), 'state ensures three-col class');
assert.ok(table.includes('keysPageRail'), 'rail click bind for trigger keycap');
assert.ok(panelUi.includes('keysRailStartBadge'), 'rail badge i18n wiring');
assert.ok(panelUi.includes('syncKeysWorkChannelPill'), 'work channel pill sync');
assert.ok(i18n.includes("keysRailStartBadge:'起点'"), 'zh rail badge');
assert.ok(i18n.includes("keysRailTriggerLbl:'触发键'"), 'zh rail trigger lbl');
assert.ok(i18n.includes("keysRailDirLbl:'识别'"), 'zh rail dir lbl');

console.log('ok keys-three-col-layout');
