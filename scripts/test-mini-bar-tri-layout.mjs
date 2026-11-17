/**
 * Mini bar E · listen-first: idle 语音命令 (click); armed 发送/继续/取消; sys off face.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'src/codex-micro-overlay.html'), 'utf8');
const css = readFileSync(join(root, 'src/css/codex-micro-overlay.css'), 'utf8');

assert.match(html, /data-layout="listen-e"/);
assert.match(html, /id="miniClusterVoice"/);
assert.match(html, /id="miniClusterAgent"/);
assert.match(html, /function miniBarListenArmed/);
assert.match(html, /function resolveMiniToolSlots/);
assert.match(html, /MINI_IDLE_SLOTS/);
assert.match(html, /MINI_ARMED_SLOTS/);
assert.match(html, /is-mini-scheme-e/);
assert.match(html, /overlay-mini__action--hold/);
assert.match(html, /语音命令/);
assert.match(html, /overlay-mini__action--primary/);
assert.match(html, /发送/);
assert.match(html, /继续/);
assert.match(html, /取消/);
assert.match(
  html,
  /if\(slotId==='pushToTalk'\)\{[\s\S]*?setPointerCapture[\s\S]*?beginnerPadFire\([\s\S]*?'tap',slotId\)/,
  'mini pushToTalk fires tap on pointerdown (up is lost to Soft Pad drag)'
);
assert.match(
  html,
  /语音命令已开启/,
  'mini pushToTalk toasts when armed'
);
assert.match(
  html,
  /labelZh:'语音命令'/,
  'idle CTA label is 语音命令 (not cryptic 口头)'
);
// E drops always-on 免按 / materials pin from the face.
assert.doesNotMatch(html, /function withPinnedMiniSlots/);
assert.match(html, /miniClusterSys\.hidden=true/);

assert.match(css, /\.overlay-mini__cluster/);
assert.match(css, /\.overlay-mini__group--voice/);
assert.match(css, /\.overlay-mini__action--hold/);
assert.match(css, /\.wrap\.is-mini-scheme-e\.is-mini-tools-on/);
assert.match(css, /\.wrap\.is-mini-scheme-e \.overlay-mini__group--sys/);
assert.match(css, /\.overlay-mini__action--primary/);
assert.match(css, /\.overlay-mini__action--danger/);

const dispatch = readFileSync(join(root, 'src-tauri/src/ipc/runtime_dispatch.rs'), 'utf8');
assert.match(dispatch, /toggle_session_overlay/, 'overlay Soft Pad skips FG refuse');
assert.ok(
  dispatch.includes('else if from_overlay')
    && dispatch.includes('toggle_session_overlay(state, &app, &route.mapping_id)'),
  'pad_fire uses overlay toggle when from Soft Pad'
);

const overlayRs = readFileSync(join(root, 'src-tauri/src/codex_micro_overlay.rs'), 'utf8');
assert.match(
  overlayRs,
  /!slot_id\.eq_ignore_ascii_case\("pushToTalk"\)/,
  'overlay resolve: pushToTalk is not hold despite startDictation'
);
assert.match(
  overlayRs,
  /!slot\.eq_ignore_ascii_case\("pushToTalk"\)/,
  'overlay resolve keeps empty-chord pushToTalk (WorkBuddy/Cursor oral)'
);
assert.ok(
  overlayRs.includes('surface_is_non_cursor')
    && overlayRs.indexOf('surface_is_non_cursor')
      < overlayRs.indexOf('should_prefer_cursor_soft_pad(cfg)'),
  'WorkBuddy Soft Pad surface beats Cursor-alive sticky before oral arm'
);
assert.match(
  html,
  /__pttTapAt/,
  '语音命令 tap is debounced against double pointerdown'
);
assert.match(
  html,
  /applied==='cursor'/,
  'armed 发送/继续 use Soft Pad fire unless Soft Pad is Cursor'
);

console.log('ok mini-bar-listen-e');
