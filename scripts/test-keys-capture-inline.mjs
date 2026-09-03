import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'src/index.html'), 'utf8');
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

const targetStart = html.indexOf('id="habitKeyMapRowTarget"');
const targetEnd = html.indexOf('id="habitFinishCard"');
const targetChunk = targetStart >= 0 && targetEnd > targetStart ? html.slice(targetStart, targetEnd) : '';
const popStart = html.indexOf('id="keysCapturePopover"');
const popEnd = html.indexOf('id="targetKeyPickerOverlay"');
const popChunk = popStart >= 0 && popEnd > popStart ? html.slice(popStart, popEnd) : '';

check('target card exists', targetChunk.includes('id="habitKeyMapRowTarget"'));
check('picker inside target card', targetChunk.includes('id="keysChannelPicker"'));
check(
  'scheme D split shell',
  targetChunk.includes('id="keysChannelSplit"') &&
    targetChunk.includes('id="keysChannelSearch"') &&
    targetChunk.includes('id="keysChannelSubtabs"') &&
    targetChunk.includes('data-channel="ime"') &&
    targetChunk.includes('data-channel="camera"')
);
check(
  'ime/key detail inside right pane',
  targetChunk.includes('id="keysChannelPaneRight"') &&
    targetChunk.indexOf('id="keysChannelPaneRight"') < targetChunk.indexOf('id="keysCaptureHeroCard"') &&
    targetChunk.indexOf('id="keysCaptureHeroCard"') < targetChunk.indexOf('id="keysCaptureKeyPanel"') &&
    targetChunk.indexOf('id="keysCaptureKeycapZone"') < targetChunk.indexOf('id="keysFinishModeHost"') &&
    !targetChunk.includes('id="keysRecognizeCore"')
);
check(
  'hero and options are separate cards',
  targetChunk.includes('keys-detail-card--hero') &&
    targetChunk.includes('keys-detail-card--options') &&
    targetChunk.indexOf('keys-detail-card--hero') < targetChunk.indexOf('keys-detail-card--options')
);
check('no habit scheme strip', !targetChunk.includes('id="keysHabitSchemeStrip"'));
check('ime strip in card', targetChunk.includes('id="keysImeStripWrap"'));
check('finish host inside target card', targetChunk.includes('id="keysFinishModeHost"'));
check('picker not in popover', !popChunk.includes('id="keysChannelPicker"'));

const css = readFileSync(join(root, 'src/css/keys-workflow.css'), 'utf8');
check(
  'flow nodes and desk are separate cards',
  /#settingsPanelKeys\.keys-page-desk \.keys-workflow-pipeline\s*\{[^}]*background:\s*transparent/s.test(css) &&
    /#settingsPanelKeys\.keys-page-desk #keysFlowNodes\s*\{[^}]*border:\s*1px solid/s.test(css) &&
    /#settingsPanelKeys\.keys-page-desk \.flow-desk-panel\s*\{[^}]*border:\s*1px solid/s.test(css)
);
check(
  'left rail fixed category rhythm',
  css.includes('min-height: 100%') &&
    css.includes('justify-content: flex-start') &&
    /#settingsPanelKeys \.keys-channel-subtab[\s\S]{0,400}?flex:\s*0 0 auto/.test(css) &&
    /#settingsPanelKeys \.keys-channel-subtab[\s\S]{0,400}?height:\s*44px/.test(css) &&
    !/#settingsPanelKeys \.keys-channel-tree[\s\S]{0,500}?justify-content:\s*space-between/.test(css)
);
check(
  'ime strip spaced above hero card',
  /#settingsPanelKeys \.keys-ime-strip-wrap[\s\S]{0,280}?padding:\s*4px 2px 10px/.test(css) &&
    /#settingsPanelKeys \.keys-channel-pane-right\s*\{[^}]*gap:\s*14px/s.test(css)
);

const pickerSrc = readFileSync(join(root, 'src/js/features/mapping/keys-channel-command-picker.js'), 'utf8');
check(
  'classified tree and search, no scheme strip',
  pickerSrc.includes('data-auto-create') &&
    pickerSrc.includes('keysChannelSearch') &&
    pickerSrc.includes('matchesSearch') &&
    !pickerSrc.includes('renderSchemeStrip') &&
    !pickerSrc.includes('data-keys-scheme-apply') &&
    !pickerSrc.includes('renderBoundKeysHtml')
);
check(
  'ime catalog tab never hidden for Codex',
  /function setCodexImeTabHidden[\s\S]{0,220}?imeTabHidden\s*=\s*false/.test(pickerSrc) &&
    !/function setCodexImeTabHidden[\s\S]{0,220}?imeTabHidden\s*=\s*!!/.test(pickerSrc)
);

const capUiSrc = readFileSync(join(root, 'src/js/features/agent/agent-capability-ui.js'), 'utf8');
check(
  'codex chrome does not steal catalog tab to softPad',
  /function ensureDefaultSelection[\s\S]{0,180}?void m/.test(capUiSrc) &&
    !/function ensureDefaultSelection[\s\S]{0,280}?setActiveTab\(['"]softPad['"]\)/.test(capUiSrc)
);

const imeSrc = readFileSync(join(root, 'src/js/ime-presets.js'), 'utf8');
check(
  'mapping ime strip has no custom pencil twin',
  /ctx === 'mapping'[\s\S]{0,420}?Scheme D: hand-record/.test(imeSrc) &&
    !/ctx === 'mapping'[\s\S]{0,520}?data-ime-custom="1"/.test(imeSrc)
);

const finishSrc = readFileSync(join(root, 'src/js/features/mapping/key-finish-flow-render.js'), 'utf8');
check(
  'cancel window compact single title',
  finishSrc.includes('keys-finish-cancel-card--compact') &&
    finishSrc.includes('keysFinishCancelEnable') &&
    html.includes('id="habitFlowFinishMoreCancelLbl"') &&
    /class="habit-flow-cancel-label sr-only" id="habitFlowFinishMoreCancelLbl"/.test(html)
);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
