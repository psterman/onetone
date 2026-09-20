/**
 * Guard: Voice「我录的键」loads keys-page sequences — no exclusive passphrase pane.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const js = readFileSync(join(root, 'src/js/features/voice/voice-bridge-keys.js'), 'utf8');
const css = readFileSync(join(root, 'src/css/voice-page-shell.css'), 'utf8');

assert.ok(js.includes('appliedCustomKeyMatchId'), 'tracks applied sequence');
assert.ok(js.includes('stepCount'), 'shows step count from keys catalog');
assert.ok(
  /phrasePane\.hidden\s*=\s*true/.test(js) || /phrasePane\.hidden=true/.test(js),
  'hides 录制专属口令 pane'
);
assert.ok(js.includes('点选一条序列加载到当前习惯'), 'clear load hint');
assert.ok(js.includes('去按键页管理序列'), 'CTA goes to keys page');
assert.ok(js.includes('使用中'), 'marks applied sequence');
assert.ok(js.includes('voice-keys-pick-row'), 'uses clear card layout');
assert.ok(!/点左侧序列 · 右侧录口令/.test(js), 'old passphrase hint removed');
assert.ok(css.includes('is-custom-key-seq'), 'full-width custom-key list style');
assert.ok(css.includes('voice-keys-pick-row__badge'), 'applied badge style');

console.log('ok voice-custom-key-load-no-phrase');
