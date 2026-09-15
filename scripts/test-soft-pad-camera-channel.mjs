import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pad = readFileSync(join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');
const pick = readFileSync(join(root, 'src/js/features/mapping/keys-channel-command-picker.js'), 'utf8');
const i18n = readFileSync(join(root, 'src/js/core/i18n.js'), 'utf8');

let fail = 0;
function check(name, ok) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name);
  if (!ok) fail++;
}

check('tabs has camera', /LAYOUT_CHANNEL_TABS = \[[^\]]*camera/.test(pad));
check('render camera list', pad.includes('function renderLayoutCameraChannelList'));
check('bind camera', pad.includes('function bindCameraGestureToPadKey'));
check('collects app-selected camera actions', pad.includes('function collectAppSelectedCameraRows'));
check('reads effective camera token', pad.includes('function effectiveCameraActionToken'));
check('uses configured app camera rows', pad.includes('function layoutConfiguredCameraRows'));
check('resolves app camera mapping', pad.includes('function resolveCameraConfigMapping'));
check('catalog only selected actions', pick.includes('only gestures with a user-selected action'));
check('zh lead', i18n.includes("softPadLayoutChannelLeadCamera:'当前应用摄像头里已选好的手势动作"));
check('en lead', i18n.includes('Actions already chosen for this app'));
check('zh empty', i18n.includes("softPadLayoutEmptyCamera:'当前应用还没有选好手势动作"));
check('go drawer', pad.includes("drawer.setPanel('camera'"));
check(
  'proto shows Cursor selected actions',
  readFileSync(join(root, 'prototypes/softpad-habit-column/key-detail-timing.html'), 'utf8').includes(
    'Cursor 摄像头里已选好的动作'
  )
);

process.exit(fail ? 1 : 0);
