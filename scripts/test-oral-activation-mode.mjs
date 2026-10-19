import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

globalThis.OneToneDom = { $: () => null };
globalThis.OneToneI18n = { t: (_key) => '' };
globalThis.OneToneState = { state: { config: { mappings: [] }, ui: {} } };
globalThis.OneToneSettingsDrawer = { isKeysPanel: () => false };
globalThis.__vp_mapping_core_hooks__ = { ensureConfig() {} };

const here = path.dirname(fileURLToPath(import.meta.url));
await import(pathToFileURL(path.join(here, '..', 'src/js/features/mapping/mapping-core.js')).href);

const mapping = { oralCommandScheme: { items: {} } };
globalThis.OneToneMappingCore.ensureMappingExtras(mapping);

assert.equal(
  mapping.oralCommandScheme.activationMode,
  'hold',
  'new oral trigger bindings default to hold-to-talk'
);

mapping.oralCommandScheme.activationMode = 'toggle';
globalThis.OneToneMappingCore.ensureMappingExtras(mapping);
assert.equal(mapping.oralCommandScheme.activationMode, 'toggle');

// Mirror config-persist.serializeOralCommandScheme — FE save must keep mode.
function serializeOralCommandScheme(scheme) {
  if (!scheme || typeof scheme !== 'object') {
    return { items: {}, triggerKey: '', activationMode: 'hold' };
  }
  var mode = String(scheme.activationMode || '')
    .trim()
    .toLowerCase();
  if (mode !== 'hold' && mode !== 'toggle') mode = 'hold';
  return {
    items: scheme.items && typeof scheme.items === 'object' ? scheme.items : {},
    triggerKey: String(scheme.triggerKey || '').trim(),
    activationMode: mode
  };
}

const persistSrc = await import('node:fs').then((fs) =>
  fs.readFileSync(path.join(here, '..', 'src/js/core/config-persist.js'), 'utf8')
);
assert.match(
  persistSrc,
  /activationMode/,
  'config-persist serializes activationMode'
);
assert.match(
  persistSrc,
  /activationMode:mode/,
  'serializeOralCommandScheme writes activationMode field'
);

const saved = serializeOralCommandScheme(mapping.oralCommandScheme);
assert.equal(saved.activationMode, 'toggle', 'serialize keeps toggle');
const reloaded = { oralCommandScheme: saved };
globalThis.OneToneMappingCore.ensureMappingExtras(reloaded);
assert.equal(
  reloaded.oralCommandScheme.activationMode,
  'toggle',
  'reload after save keeps toggle'
);
const secondSave = serializeOralCommandScheme({
  ...saved,
  items: { ...(saved.items || {}), extra: { enabled: true } }
});
assert.equal(secondSave.activationMode, 'toggle', 'second save does not reset to hold');

const legacy = serializeOralCommandScheme({ triggerKey: 'XButton1', items: {} });
assert.equal(legacy.activationMode, 'hold', 'legacy missing field defaults hold');

console.log('test-oral-activation-mode: ok');
