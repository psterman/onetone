/**
 * Scheme-B input aim calibrate guard: overlay + per-app anchors + FE wire.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let fail = 0;
function check(name, ok) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name);
  if (!ok) fail++;
}

const cal = read('src-tauri/src/input_aim_calibrate.rs');
const chat = read('src-tauri/src/app_chat_workflow.rs');
const cfg = read('src-tauri/src/config.rs');
const lib = read('src-tauri/src/lib.rs');
const ipc = read('src-tauri/permissions/app-ipc.toml');
const cap = read('src-tauri/capabilities/input-aim-calibrate.json');
const overlay = read('src/input-aim-calibrate.html');
const html = read('src/index.html');
const rail = read('src/js/features/voice/voice-intent-rail.js');
const persist = read('src/js/core/config-persist.js');

check('ComposerAnchor dual slots', /struct ComposerAnchor/.test(cfg) && /MAX_SLOTS/.test(cfg) && /from_legacy_xy/.test(cfg) && /active_point/.test(cfg));
check('voice_end.composer_anchors', /composer_anchors/.test(cfg));
check('composer_anchor_for_app prefers active slot', /composer_anchor_for_app/.test(chat) && /active_point\(\)/.test(chat));
check('focus_composer_for_send uses calibrated', /let anchor = composer_anchor_for_app/.test(chat));
check('screen_point_to_client_ratio', /fn screen_point_to_client_ratio/.test(chat));
check('prepare_target_for_calibrate', /fn prepare_target_for_calibrate/.test(chat));
check('calibrate module cmds', /cmd_input_aim_calibrate_begin/.test(cal) && /cmd_input_aim_calibrate_commit/.test(cal) && /cmd_input_aim_calibrate_set_active/.test(cal));
check('PENDING_SLOT for dual write', /PENDING_SLOT/.test(cal) && /slot/.test(cal));
check('no Win32 fullscreen (breaks transparency)', !/\.fullscreen\s*\(/.test(cal));
check('borderless transparent overlay', /\.transparent\s*\(\s*true\s*\)/.test(cal) && /\.decorations\s*\(\s*false\s*\)/.test(cal) && /\.shadow\s*\(\s*false\s*\)/.test(cal));
check('cover primary monitor helper', /fn cover_primary_monitor/.test(cal));
check('lib registers calibrate', /mod input_aim_calibrate/.test(lib) && lib.includes('cmd_input_aim_calibrate_begin') && lib.includes('cmd_input_aim_calibrate_set_active'));
check('app-ipc allows', ipc.includes('allow-cmd-input-aim-calibrate-begin') && ipc.includes('allow-cmd-input-aim-calibrate-status') && ipc.includes('allow-cmd-input-aim-calibrate-set-active'));
check('overlay capability', cap.includes('input_aim_calibrate') && cap.includes('allow-cmd-input-aim-calibrate-commit'));
check('overlay HTML scheme B', overlay.includes('粗圈') && overlay.includes('cmd_input_aim_calibrate_commit') && overlay.includes('screenX'));
check('hint docks near marquee', overlay.includes('placeChromeNearBox') && overlay.includes('is-near'));
check('HTML body paints alpha (hit-test)', /background:rgba\(8,\s*16,\s*24/.test(overlay) && overlay.includes('setPointerCapture'));
check('no click-through veil', !overlay.includes('id="veil"'));
check('FE buttons + slots', html.includes('btnVoiceAimCalibrate') && html.includes('btnVoiceAimCalibrateClear') && html.includes('voiceAimSlots') && html.includes('data-aim-slot') && html.includes('voice-aim-map'));
check('rail invokes begin/clear/status/set_active', rail.includes('cmd_input_aim_calibrate_begin') && rail.includes('cmd_input_aim_calibrate_clear') && rail.includes('cmd_input_aim_calibrate_status') && rail.includes('cmd_input_aim_calibrate_set_active'));
check('persist dual-slot composerAnchors', persist.includes('composerAnchors') && persist.includes('slots') && persist.includes('active'));
check('overlay loads without query string', /WebviewUrl::App\("input-aim-calibrate\.html"\.into\(\)\)/.test(cal));
check('prepare warn does not abort begin', /calibrate_prepare_warn/.test(cal) && !/prepare_target_for_calibrate\(&tid\)\?/.test(cal));
check('FE beginAimCalibrate export', rail.includes('beginAimCalibrate'));
check('FE capture-phase click', rail.includes('_vpAimCalCapture') && rail.includes('aim_calibrate_click'));
check('commit emits to main', cal.includes('input_aim_calibrated') && cal.includes('emit_to_main_if_available'));
check('FE applies calibrate event', rail.includes('applyAimCalEvent') && rail.includes('input_aim_calibrated'));
check('FE watches until commit', rail.includes('startAimCalWatch') && rail.includes('stopAimCalWatch'));
check('FE slot switcher', rail.includes('setActiveAimSlot') && rail.includes('syncAimSlotDots') && rail.includes('normalizeAimBank') && rail.includes('voice-aim-spot'));
check('FE slot tabs', html.includes('voiceAimSlotTabs') && html.includes('voice-aim-slot-tab') && rail.includes('unsetPreview'));
check('FE one-at-a-time view', rail.includes('btn.hidden=!on') && rail.includes('unsetPreview={x:0.50,y:0.86}'));
check('FE script cache bust', html.includes('voice-intent-rail.js?v=prompt-land-9'));
check('no CSP-blocked inline onclick', !/btnVoiceAimCalibrate"[^>]*onclick=/.test(html));
check('begin queues then opens on UI thread', /calibrate_begin_queued/.test(cal) && /run_on_main_thread/.test(cal) && /calibrate_open_ok/.test(cal));
check('prepare not on IPC path', /aim-cal-begin/.test(cal) && !/prepare_target_for_calibrate\(&tid\)\?/.test(cal));
check('status payload has slots', /"slots"/.test(cal) && /bank\.any_set/.test(cal));
process.exit(fail ? 1 : 0);