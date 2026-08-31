// Channel config compact layer — CI guards + whitelist freshness.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
let fail = 0;
function check(label, ok) {
  if (ok) { pass++; console.log('  ✓', label); }
  else { fail++; console.error('  ✗', label); }
}
function read(rel) { return readFileSync(join(root, rel), 'utf8'); }

const mockPath = 'design-mock/channel-config-final.html';
const mock = existsSync(join(root, mockPath)) ? read(mockPath) : '';

// sync-state-keys freshness
try {
  execSync('node scripts/sync-state-keys.mjs --check', { cwd: root, stdio: 'pipe' });
  check('sync-state-keys generated fresh', true);
} catch (_) {
  check('sync-state-keys generated fresh', false);
}

const whitelistSrc = read('src/js/features/settings/channel-config-state-keys.generated.js');
const whitelistMatch = whitelistSrc.match(/__CHANNEL_CONFIG_GENERATED_KEYS__\s*=\s*(\[[\s\S]*?\]);/);
const whitelistKeys = whitelistMatch ? JSON.parse(whitelistMatch[1]) : [];

function extractDataStateKeys(html) {
  const keys = [];
  const re = /data-state-key="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) keys.push(m[1]);
  return keys;
}

function homeOverviewWritable(html) {
  const blocks = html.split('data-component="home-overview"');
  if (blocks.length < 2) return false;
  const chunk = blocks[1].split('data-component=')[0] || '';
  return /<(input|select|textarea)\b/i.test(chunk) || /role="switch"/i.test(chunk) || /class="toggle"/i.test(chunk);
}

if (mock) {
  check('design-mock exists', true);
  check('home-overview has no writable controls', !homeOverviewWritable(mock));
  check('no 当前习惯 config dropdown', !/当前习惯[\s\S]{0,80}<select/i.test(mock));
  check('no today stats in compact', !/今日\s*\d+\s*次[\s\S]{0,40}data-state-key/i.test(mock));
  check('settings-panel-compact present', mock.includes('data-component="settings-panel-compact"'));
  check('ipc-config border class', mock.includes('ipc-config'));
  check('ipc-customization border class', mock.includes('ipc-customization'));

  extractDataStateKeys(mock).forEach(function (key) {
    check('whitelist: mock key ' + key, whitelistKeys.includes(key));
  });

  const compactChunk = mock.split('data-component="settings-panel-compact"')[1] || '';
  const ipcRe = /data-ipc="(customization|config)"/g;
  let im;
  while ((im = ipcRe.exec(compactChunk))) {
    const line = compactChunk.slice(Math.max(0, im.index - 120), im.index + 80);
    if (im[1] === 'customization') {
      check('customization only showInTray', /showInTray/.test(line));
    }
  }
}

const compactJs = read('src/js/features/settings/channel-config-compact.js');
const overviewJs = read('src/js/features/settings/channel-config-overview.js');
const indexHtml = read('src/index.html');

check('channel-config-compact.js exists', compactJs.length > 100);
check('channel-config-overview.js exists', overviewJs.length > 100);
check('saveCustomization via shared module', compactJs.includes('saveCustomization') && (compactJs.includes('OneToneTrayChannelControls') || /function saveCustomization/.test(compactJs)));
check('channel-config:changed event', compactJs.includes('channel-config:changed'));
check('overview subscribes changed', overviewJs.includes('channel-config:changed'));

['keys', 'voiceWake', 'softPad', 'camera'].forEach(function (ch) {
  var id = ch === 'voiceWake' ? 'channelConfigCompactVoice' : ch === 'keys' ? 'channelConfigCompactKeys' : ch === 'softPad' ? 'channelConfigCompactSoftPad' : 'channelConfigCompactCamera';
  check('compact mount ' + id, indexHtml.includes(id));
});
check('home overview mount', indexHtml.includes('channelConfigOverview'));
check('camera compact no app-behavior-rules', !/app-behavior-rules/.test(compactJs.split('camera')[1] || '') || compactJs.indexOf('camera') < 0 || !/renderCompactAppPrefs/.test((compactJs.match(/camera[\s\S]*renderCompactAppPrefs/) || [])[0] || ''));

extractDataStateKeys(compactJs).forEach(function (key) {
  check('whitelist: compact.js key ' + key, whitelistKeys.includes(key));
});

console.log('[channel-config] ' + pass + ' passed / ' + fail + ' failed');
if (fail > 0) process.exit(1);
