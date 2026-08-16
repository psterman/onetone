/**
 * Trigger page parallel scene gate: dual animations + equal pick buttons.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'src/index.html'), 'utf8');
const js = readFileSync(join(root, 'src/js/features/home/habit-trigger-setup.js'), 'utf8');
const i18n = readFileSync(join(root, 'src/js/core/i18n.js'), 'utf8');
const css = readFileSync(join(root, 'src/css/app.css'), 'utf8');

assert.ok(html.includes('id="habitSetupTriggerGate"'), 'gate markup');
assert.ok(html.includes('habit-setup-trigger-parallel'), 'parallel layout');
assert.ok(html.includes('habit-setup-trigger-scene--keep'), 'keep scene');
assert.ok(html.includes('habit-setup-trigger-scene--extra'), 'extra scene');
assert.ok(html.includes('data-vk="LAlt"'), 'left Alt data-vk');
assert.ok(html.includes('data-vk="RAlt"'), 'right Alt data-vk');
assert.ok(html.includes('id="habitSetupTriggerKbd"'), 'kbd id for sync');
assert.ok(!html.includes('is-cand is-ralt is-active'), 'no hardcoded Right Alt active');
assert.ok(i18n.includes("habitSetupTriggerFbKeep:'按住 {key} 说话中'") || i18n.includes('按住 {key} 说话中'), 'fb keep uses {key}');
assert.ok(js.includes('function syncGateKeepKeyboard'), 'syncGateKeepKeyboard');
assert.ok(js.includes('gateDemoActivationCombo'), 'uses activation combo');
assert.ok(js.includes('activationTargetKey'), 'reads prior IME key');

assert.ok(css.includes('.habit-setup-trigger-parallel'), 'parallel styles');
assert.ok(css.includes('.habit-setup-trigger-pick'), 'equal pick button styles');
assert.ok(css.includes('htvKbdPress'), 'kbd press');
assert.ok(css.includes('htvDevCycle'), 'device cycle');
assert.ok(!css.includes('.habit-setup-trigger-tabs{'), 'tabs CSS removed');
assert.ok(
  /\.habit-setup-trigger-scene\{[^}]*background\s*:\s*transparent/s.test(css),
  'scene has no card background'
);
assert.ok(
  /\.habit-setup-trigger-kbd__key\{[^}]*height\s*:\s*30px/s.test(css),
  'larger keyboard keys'
);

assert.ok(!js.includes('function switchGateDemoScene'), 'no tab switcher');
assert.ok(js.includes('function chooseTriggerKeepExisting'), 'keep handler');
assert.ok(js.includes('function chooseTriggerNeedExtra'), 'extra handler');
assert.ok(js.includes('startGateDeviceFeedback'), 'device feedback');
assert.ok(js.includes('function setTriggerGateColHot'), 'hover hot helper');
assert.ok(js.includes("classList.contains('is-hot')"), 'device feedback gated by is-hot');
assert.ok(js.includes("pointerenter"), 'pointerenter sets hot');
assert.ok(js.includes("pointerleave"), 'pointerleave clears hot');
assert.ok(
  css.includes('.habit-setup-trigger-col.is-hot .habit-setup-trigger-feedback__pulse') ||
    css.includes('.habit-setup-trigger-col:hover .habit-setup-trigger-feedback__pulse'),
  'animations gated by hover/is-hot'
);
assert.ok(!css.includes('.habit-setup-trigger-col:focus-within'), 'no focus-stuck animation');
assert.ok(
  !/\.habit-setup-voice-scene\{\s*\n\s*\.habit-setup-voice-scene\{/.test(css),
  'no orphaned voice-scene brace (breaks global .btn)'
);

function triggerStepReady(state) {
  if (!state) return false;
  if (state.triggerScenario === 'keep_existing') return true;
  if (state.triggerScenario !== 'need_extra') return false;
  if (state.triggerTestPassed) return true;
  return !!(state.triggerCaptured || state.hasPreview);
}
assert.equal(triggerStepReady({ triggerScenario: 'keep_existing' }), true);
assert.equal(triggerStepReady({ triggerScenario: 'undecided' }), false);

console.log('test-trigger-scenario-gate: ok');
