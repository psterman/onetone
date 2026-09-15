/**
 * Phrase → prompt-peer inject MVP. Run: node scripts/test-prompt-peer-phrase-route.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

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

const rt = read('src-tauri/src/voice_end_runtime.rs');
const picker = read('src/js/features/mapping/keys-channel-command-picker.js');
const panel = read('src/js/features/mapping/keys-scene-actions-panel.js');

check('rust find_prompt_inject_peer_for_phrase', rt.includes('fn find_prompt_inject_peer_for_phrase'));
check('rust peer route before intent', /Prompt inject before wrong_fg[\s\S]*?voiceEnd\.intent=prompt/.test(rt));
check('rust dispatch_prompt_inject route peer', rt.includes('"peer"') && rt.includes('fn dispatch_prompt_inject'));
check('rust unit test peer phrase', rt.includes('prompt_peer_phrase_routes_before_generic_wake'));
check('fe stampPromptPeerWakePhrases', picker.includes('function stampPromptPeerWakePhrases'));
check('fe stamp on save', /function updatePromptPeer[\s\S]*?stampPromptPeerWakePhrases\(existing\)/.test(picker));
check('fe stamp on create', /stampPromptPeerWakePhrases\(copy\)/.test(picker));
check('fe export stamp', picker.includes('stampPromptPeerWakePhrases: stampPromptPeerWakePhrases'));
check('panel prefers peer wake phrases', /a\.kind === 'prompt'[\s\S]*?wakePhrases/.test(panel));
check('stamp keeps only first phrase', picker.includes('peer.voiceOverride.wakePhrases = [list[0]]'));
check('prompt inject before wrong_fg', /Prompt inject before wrong_fg[\s\S]*?never wrong-FG gate/.test(rt));
check('scm commit demoted', read('src-tauri/src/app_chat_workflow.rs').includes('to commit') || read('src-tauri/src/app_chat_workflow.rs').includes('source control'));
check('bring-up syncs same-app peers', read('src/js/features/voice/voice-ui-bindings.js').includes('Same-app peers share the switch'));

/** Mirror of Rust find_prompt_inject_peer_for_phrase (exact trim match for this check). */
function findPeer(maps, activeApp, phrase) {
  let best = null;
  let bestSame = false;
  for (const m of maps) {
    const href = m.captureHeroRef || {};
    if (String(href.kind || '').toLowerCase() !== 'prompt') continue;
    if (String(href.bindingRef || '') !== String(m.id || '')) continue;
    if (!m.enabled) continue;
    const text = ((m.targetActions || []).find((a) => a && a.type === 'text') || {}).value || '';
    if (!String(text).trim()) continue;
    const phrases = (m.voiceOverride && m.voiceOverride.wakePhrases) || [];
    if (!phrases.some((w) => String(w).trim() === phrase)) continue;
    const same = activeApp && String(m.appTargetId || '') === activeApp;
    if (!best || (same && !bestSame)) {
      best = m;
      bestSame = !!same;
    }
  }
  return best;
}

const maps = [
  {
    id: 'habit',
    enabled: true,
    appTargetId: 'cursor',
    voiceOverride: { wakePhrases: ['开始输入', '么么哒'] }
  },
  {
    id: 'peer-1',
    enabled: true,
    appTargetId: 'cursor',
    captureHeroRef: { kind: 'prompt', bindingRef: 'peer-1' },
    voiceOverride: { wakePhrases: ['么么哒'] },
    targetActions: [{ type: 'text', value: '继续吗？' }, { type: 'key', value: 'Enter' }]
  }
];
check('logic: 么么哒 hits peer', findPeer(maps, 'cursor', '么么哒')?.id === 'peer-1');
check('logic: 开始输入 misses peer', findPeer(maps, 'cursor', '开始输入') == null);
check(
  'logic: prefers same app',
  findPeer(
    [
      ...maps,
      {
        id: 'peer-other',
        enabled: true,
        appTargetId: 'other',
        captureHeroRef: { kind: 'prompt', bindingRef: 'peer-other' },
        voiceOverride: { wakePhrases: ['么么哒'] },
        targetActions: [{ type: 'text', value: 'x' }]
      }
    ],
    'cursor',
    '么么哒'
  )?.id === 'peer-1'
);

if (fail) {
  console.error('\n' + fail + ' failed, ' + pass + ' passed');
  process.exit(1);
}
console.log('\n' + pass + ' passed');
