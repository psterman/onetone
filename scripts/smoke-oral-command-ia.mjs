/**
 * Smoke: voice oral intent + keys loader + Soft default rows.
 * Run: node scripts/smoke-oral-command-ia.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const html = read('src/index.html');
assert.ok(html.includes('data-voice-intent="oral"'), 'voice rail has oral tab');
assert.ok(html.includes('id="voiceIntentPaneOral"'), 'voice oral pane exists');
assert.ok(html.includes('id="voiceIntentOralHost"'), 'voice oral host exists');
assert.ok(html.includes('oral-command-ui.js'), 'oral-command-ui script tagged');

const rail = read('src/js/features/voice/voice-intent-rail.js');
assert.ok(/INTENTS\s*=\s*\[[^\]]*['"]oral['"]/.test(rail), 'INTENTS includes oral');
assert.ok(rail.includes("oral:'voiceIntentPaneOral'"), 'PANE_BY_INTENT maps oral');
assert.ok(rail.includes("OneToneOralCommandUi"), 'rail mounts oral UI');

const oralUi = read('src/js/features/voice/oral-command-ui.js');
assert.ok(oralUi.includes('data-oral-mode="loader"') || oralUi.includes("data-oral-loader"), 'loader mark');
assert.ok(oralUi.includes('renderOralLoaderHtml'), 'loader renderer');
assert.ok(oralUi.includes('renderOralEditorHtml'), 'editor renderer');
assert.ok(oralUi.includes('keys-oral-main--solo') || oralUi.includes('keys-oral-cats--row'), 'G compact layout');
assert.ok(oralUi.includes('keys-oral-card'), 'G card mark');
assert.ok(oralUi.includes('data-oral-cat'), 'G category nav');
assert.ok(oralUi.includes('keys-oral-say'), 'editable say input');
assert.ok(oralUi.includes('shiftOralInCat'), 'G sort helper');
assert.ok(!/keys-oral-tog/.test(oralUi.replace(/\/\*[\s\S]*?\*\//g, '')), 'editor dropped toggles');
assert.ok(oralUi.includes("source: d.core ? 'core' : 'soft'"), 'core/soft split');
assert.ok(oralUi.includes('enabled !== true'), 'bind/prompt opt-in');

const keys = read('src/js/features/mapping/keys-channel-command-picker.js');
assert.ok(keys.includes('mountLoader'), 'keys uses oral loader');
assert.ok(keys.includes('renderOralLoaderHtml'), 'keys falls back to loader html');

const router = read('src-tauri/src/voice_command_router.rs');
assert.ok(router.includes('soft_oral_default_on'), 'router soft defaults helper');
assert.ok(router.includes('oral_item_enabled(scheme.as_ref(), &id, false)'), 'prompt/bind default off');

const session = read('src-tauri/src/voice_command_session.rs');
assert.ok(session.includes('soft_oral_default_on'), 'session soft defaults');

const bind = read('src/js/features/voice/voice-ui-bindings.js');
assert.ok(bind.includes("setIntent('oral'") || bind.includes('setIntent("oral"'), 'bridge opens oral intent');

console.log('smoke-oral-command-ia: ok');
