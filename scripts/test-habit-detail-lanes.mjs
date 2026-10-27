/**
 * Habit command right pane: edit | lanes (keys2 channel grid).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(path.join(root, 'src/js/features/mapping/habit-command-link.js'), 'utf8');

const mapping = {
  id: 'm1',
  appTargetId: 'cursor-chat',
  agentBindings: [
    {
      slotId: 'pressEsc',
      actionId: 'action.pressEsc',
      triggerType: 'camera',
      triggerBinding: 'shakeHead',
      enabled: true
    }
  ],
  oralCommandScheme: { items: {}, triggerKey: '', activationMode: 'hold' },
  codexMicroPad: { keys: [] }
};

const context = {
  console,
  window: {},
  OneToneState: {
    state: { selectedMappingId: 'm1', config: { mappings: [mapping] } },
    ui: { habitDetailPane: 'lanes', habitMatchCommand: 'action:action.pressEsc', habitListChannel: 'all' }
  },
  OneToneMappingCore: { byId: () => mapping },
  OneToneDom: {
    esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
  },
  OneToneConfigPersist: { ensureConfig() {}, save() {} },
  OneToneAgentActions: {},
  OneToneSemanticActionStore: {},
  OneToneOralCommandUi: {},
  document: {
    getElementById() {
      return null;
    },
    createElement() {
      return { className: '', appendChild() {} };
    }
  }
};
context.window = context;
context.globalThis = context;

vm.runInNewContext(src, context);
const Link = context.OneToneHabitCommandLink;
assert.ok(Link, 'exports Link');
assert.equal(Link.detailPaneMode(), 'lanes');
const model = Link.buildModel(mapping);
assert.ok(model.commands.length >= 1, 'has command');
const cmd = model.commands[0];
if (!cmd.channels) {
  /* enrich via overview */
}
const html = Link.channelsOverviewHtml(cmd);
assert.match(html, /keys2-lanes/, 'renders lanes grid');
assert.match(html, /摄像头|shakeHead|已绑定/, 'shows camera bind');
assert.match(html, /data-hcl-detail-pane="edit"/, 'cta to edit');

context.OneToneState.ui.habitDetailPane = 'edit';
assert.equal(Link.detailPaneMode(), 'edit');

console.log('test-habit-detail-lanes: ok');
