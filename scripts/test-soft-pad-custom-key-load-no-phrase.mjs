/**
 * Guard: Soft Pad「我录的键」loads Keys-page sequences — clear cards, no Soft Pad passphrase.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const js = readFileSync(join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');
const css = readFileSync(join(root, 'src/css/soft-pad-hub.css'), 'utf8');

assert.ok(js.includes('function renderLayoutKeyChannelList'), 'renders key channel list');
assert.ok(js.includes('soft-pad-key-seq-row'), 'uses clear card layout');
assert.ok(js.includes('soft-pad-key-seq-row__badge'), 'marks applied sequence');
assert.ok(js.includes('softPadLayoutKeyApplied'), '使用中 badge copy');
assert.ok(js.includes('data-layout-go-keys'), 'CTA goes to keys page');
assert.ok(js.includes('function layoutKeyPhrasesFieldHidden'), 'hides Soft Pad passphrase for 我录的键');
assert.ok(js.includes('layoutKeyPhrasesField'), 'phrases field can hide');
assert.ok(js.includes("editDraft.phrases = ''"), 'clears phrases on custom-key bind');
assert.ok(
  js.includes('步骤与触发键在按键页改') || js.includes('softPadLayoutChannelLeadKey'),
  'clear load hint'
);
assert.ok(css.includes('soft-pad-key-seq-row__badge'), 'badge style');
assert.ok(css.includes('.soft-pad-action-list .soft-pad-key-seq-row'), 'card grid style');

console.log('ok soft-pad-custom-key-load-no-phrase');
