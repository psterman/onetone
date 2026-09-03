import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
let fail = 0;

function check(name, cond) {
  if (cond) {
    pass++;
    console.log('  PASS ' + name);
  } else {
    fail++;
    console.error('  FAIL ' + name);
  }
}

function idCount(src, id) {
  const re = new RegExp('id="' + id + '"', 'g');
  return (src.match(re) || []).length;
}

const html = readFileSync(join(root, 'src/index.html'), 'utf8');
const send = readFileSync(join(root, 'src/js/features/voice/voice-step-send-render.js'), 'utf8');
const recognize = readFileSync(join(root, 'src/js/features/voice/voice-step-recognize-render.js'), 'utf8');
const css = readFileSync(join(root, 'src/css/voice-page-shell.css'), 'utf8');

const coreAt = html.indexOf('id="voiceCoreConfig"');
const flowAt = html.indexOf('id="voiceSettingsFlow"');
const advAt = html.indexOf('id="voiceCoreAdvanced"');
const langAt = html.indexOf('id="voiceCoreConfigLang"');
const engineAt = html.indexOf('id="voiceCoreConfigEngine"');
const paceAt = html.indexOf('id="voiceCoreConfigPace"');
const gridAt = html.indexOf('id="voiceRecognizeSourceGrid"');
const presetAt = html.indexOf('id="voiceVoskModelPreset"');
const delayAt = html.indexOf('id="voiceSettingsDelayRange"');
const sendParamsAt = html.indexOf('id="voiceSendParamsAside"');
const sapiSensAt = html.indexOf('id="voiceSapiSensGroup"');
const modelsAt = html.indexOf('id="voiceRecognizeResourcesDetails"');

check('index voiceCoreConfig', coreAt >= 0);
check('index three core cards', langAt >= 0 && engineAt >= 0 && paceAt >= 0);
check('core cards inside voiceCoreConfig', coreAt < langAt && langAt < engineAt && engineAt < paceAt && paceAt < flowAt);
check('pipeline then core then steps then advanced', coreAt > 0 && coreAt < flowAt && flowAt < advAt);
check('source grid moved into engine card', gridAt > engineAt && gridAt < paceAt);
check('vosk preset moved into lang card', presetAt > langAt && presetAt < engineAt);
check('delay range lives in advanced', delayAt > advAt);
check('send params in advanced', sendParamsAt > advAt);
check('sapi 6-level in advanced', sapiSensAt > advAt);
check('models in advanced', modelsAt > advAt);
check('advanced is details', /<details class="voice-core-advanced" id="voiceCoreAdvanced">/.test(html));
check('ids unique', ['voiceCoreConfig','voiceVoskModelPreset','voiceRecognizeSourceGrid','voiceSettingsDelayRange','voiceCoreAdvanced','voiceSendParamsAside'].every(function(id){ return idCount(html, id) === 1; }));
check('pace buttons 6000/4000/2000', html.includes('data-voice-pace="6000"') && html.includes('data-voice-pace="4000"') && html.includes('data-voice-pace="2000"'));
check('send render writes delay range', send.includes("range.value=String(ms)") && send.includes("voiceSettingsDelayRange"));
check('send render syncDelayRanges', send.includes('End.syncDelayRanges') && send.includes('End.onDelayChange'));
check('send render syncs pace selected', send.includes('function syncPaceButtons') && send.includes('syncPaceButtons(vm&&vm.autoSendDelayMs)'));
check('recognize opens core advanced', recognize.includes("openCoreAdvanced") && recognize.includes("voiceCoreAdvanced"));
check('language card not vosk-only', /voiceRecognizeModelRow[\s\S]{0,80}row\.hidden=!!vm\.loading/.test(recognize) && !recognize.includes("vm.mode!=='vosk'"));
check('css three-column grid', css.includes('.voice-core-config') && css.includes('grid-template-columns: repeat(3, minmax(0, 1fr))'));
check('css wake hides shared core', css.includes('is-step-wake #voiceCoreConfig') && css.includes('is-step-wake #voiceCoreAdvanced'));
check('css recognize hides pace and send params', css.includes('is-step-recognize #voiceCoreConfigPace') && css.includes('is-step-recognize #voiceSendParamsAside'));
check('css send hides lang/engine', css.includes('is-step-send #voiceCoreConfigLang') && css.includes('is-step-send #voiceCoreConfigEngine'));
check('css desk one step at a time', css.includes('voice-page-desk .voice-flow-step.keys-workflow-col:not(.is-active-step)') && css.includes('display: none !important'));
check('css narrow one column', /@media \(max-width: 860px\)[\s\S]*?\.voice-core-config[\s\S]*?grid-template-columns: 1fr/.test(css));
check('css advanced muted', css.includes('.voice-core-advanced') && css.includes('--on-surface-muted'));

console.log(`[voice-core-config] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
