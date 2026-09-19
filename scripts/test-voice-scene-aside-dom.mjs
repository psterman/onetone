/**
 * Voice scene aside must share Keys dock layout:
 * - direct child of .voice-page-body.keys-page-body
 * - dock under .voice-page-shell
 * - Keys + voice-page-k layout selectors pin col 2
 *
 * IMPORTANT: closes must match by tag name. A naive stack.pop() false-passes
 * when an extra </div> closes .voice-page-body before the aside.
 *
 * Run: node scripts/test-voice-scene-aside-dom.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(root, '../src/index.html'), 'utf8');
const start = html.indexOf('<div class="voice-page-shell">');
const end = html.indexOf('id="settingsPanelSounds"');
if (start < 0 || end < 0) {
  console.error('FAIL: voice shell / sounds panel markers missing');
  process.exit(1);
}
const chunk = html.slice(start, end);
const re = /<!--[\s\S]*?-->|<\/?(div|section|footer|aside)(\s[^>]*)?>/g;
const stack = [];
let sceneParent = null;
let dockParent = null;
let bodyClass = '';
let mainClass = '';
let m;
while ((m = re.exec(chunk))) {
  const tag = m[0];
  if (tag.startsWith('<!--')) continue;
  const name = m[1];
  if (tag.startsWith('</')) {
    let i = stack.length - 1;
    while (i >= 0 && stack[i].name !== name) i--;
    if (i >= 0) stack.splice(i);
    continue;
  }
  if (/\/>$/.test(tag)) continue;
  const attrs = m[2] || '';
  const id = (attrs.match(/id="([^"]+)"/) || [])[1] || '';
  const cls = (attrs.match(/class="([^"]+)"/) || [])[1] || '';
  const label =
    id ||
    cls.split(/\s+/).find((c) => c === 'voice-page-body' || c === 'voice-page-main' || c === 'voice-page-shell') ||
    cls.split(/\s+/)[0] ||
    name;
  stack.push({ name, label });
  if (cls.includes('voice-page-body')) bodyClass = cls;
  if (cls.includes('voice-page-main') && !mainClass) mainClass = cls;
  if (id === 'voiceSceneActionsPanel') sceneParent = stack[stack.length - 2]?.label || null;
  if (id === 'voiceBottomDock') dockParent = stack[stack.length - 2]?.label || null;
}

let fail = 0;
function check(name, cond) {
  if (cond) console.log('  PASS ' + name);
  else {
    fail++;
    console.error('  FAIL ' + name + (name.includes('parent') ? ` (got ${name.includes('scene') ? sceneParent : dockParent})` : ''));
  }
}
check('scene aside parent is voice-page-body', sceneParent === 'voice-page-body');
check('bottom dock parent is voice-page-shell', dockParent === 'voice-page-shell');
check('body also has keys-page-body', bodyClass.includes('keys-page-body'));
check('main also has keys-page-main', mainClass.includes('keys-page-main'));

const keysCss = readFileSync(join(root, '../src/css/keys-workflow.css'), 'utf8');
check(
  'keys layout covers voice panel',
  keysCss.includes('#settingsPanelVoiceWake:has(#voiceSceneActionsPanel:not([hidden])) .keys-page-body')
);
check(
  'keys layout pins scene col 2',
  keysCss.includes('#settingsPanelVoiceWake:has(#voiceSceneActionsPanel:not([hidden])) #voiceSceneActionsPanel')
);

const shellCss = readFileSync(join(root, '../src/css/voice-page-shell.css'), 'utf8');
check(
  'voice-page-k defaults to flex column',
  /#settingsPanelVoiceWake\.voice-page-k \.voice-page-body\s*\{[^}]*display:\s*flex/s.test(shellCss)
);
check(
  'voice-page-k reopens 2-col when scene open',
  shellCss.includes(
    '#settingsPanelVoiceWake.voice-page-k:has(#voiceSceneActionsPanel:not([hidden])) .voice-page-body'
  ) && shellCss.includes('minmax(0, 1fr) minmax(200px, 248px) !important')
);
check(
  'voice-page-k pins main to col 1',
  shellCss.includes(
    '#settingsPanelVoiceWake.voice-page-k:has(#voiceSceneActionsPanel:not([hidden])) .voice-page-body > .voice-page-main'
  ) && shellCss.includes('grid-column: 1 !important')
);
check(
  'voice-page-k pins scene to col 2',
  shellCss.includes('#settingsPanelVoiceWake.voice-page-k #voiceSceneActionsPanel:not([hidden])') &&
    shellCss.includes('grid-column: 2 !important')
);

if (fail) {
  console.error('\n' + fail + ' failed');
  process.exit(1);
}
console.log('\n' + (10 - fail) + ' passed');
