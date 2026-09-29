/**
 * Oral listen exit: Esc + spoken cancel phrases must stay wired.
 * Run: node scripts/test-oral-esc-exit.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let fail = 0;
function check(name, ok) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name);
  if (!ok) fail++;
}

const hot = read('src-tauri/src/hotkey_win.rs');
check(
  'input_capture_needed keeps LL while oral armed',
  /voice_command_session::wants_esc_exit\(\)/.test(hot) && /fn input_capture_needed/.test(hot)
);
check('SyncCapture cmd', /SyncCapture/.test(hot));
check('oral Esc before send_guard in hook', /Oral Esc before send_guard/.test(hot));
check('hook Esc uses wants_esc_exit', /wants_esc_exit\(\)/.test(hot));

const rt = read('src-tauri/src/ipc/runtime_dispatch.rs');
check('try_dispatch_oral_esc_exit', /fn try_dispatch_oral_esc_exit/.test(rt));
check('esc exit before send_guard in dispatch', /Oral Esc must win over send_guard/.test(rt));
check('esc exit uses force_cancel', /try_dispatch_oral_esc_exit[\s\S]{0,900}force_cancel/.test(rt));
check('esc exit uses wants_esc_exit', /wants_esc_exit\(\)/.test(rt));
check(
  'Soft Pad cancel when oral armed uses force_cancel',
  /pad_cancelListen|beginner_cancel[\s\S]{0,400}force_cancel/.test(rt)
);
check(
  'swallows dictation side-key while oral armed',
  /blocks_dictation_physical_key/.test(rt)
);

const sess = read('src-tauri/src/voice_command_session.rs');
check('oral window at least 60s', /DEFAULT_WINDOW_MS:\s*u64\s*=\s*60_000/.test(sess));
check('session_end is logged', /session_end mapping=/.test(sess));
check('wants_esc_exit helper', /pub fn wants_esc_exit/.test(sess));
check('force_cancel syncs Esc capture', /fn force_cancel[\s\S]{0,1600}sync_oral_esc_capture/.test(sess));
check('temp engine for oral when global off', /ensure_oral_temp_engine/.test(sess));
check(
  'temp engine before resume_listen path',
  /ensure_oral_temp_engine[\s\S]{0,600}resume_listen/.test(sess)
);
check(
  'soft resume keeps listening engine',
  /oral arm keep engine \(already listening\)/.test(sess)
);
check(
  'reclaim mic from voice IME helper',
  /pub fn reclaim_mic_from_voice_ime/.test(sess)
);
check(
  'oral arm force engine after IME reclaim',
  /oral arm force engine after IME reclaim/.test(sess)
);
check(
  'blocks SendKey voice chord while oral',
  /pub fn blocks_voice_ime_chord/.test(sess)
);
check(
  'blocks dictation physical key while oral',
  /pub fn blocks_dictation_physical_key/.test(sess)
);
check('clears asr quiet on oral arm', /settings_asr_quiet[\s\S]{0,80}store\(false/.test(sess));
check('sync_oral_esc_capture', /sync_oral_esc_capture/.test(sess));
check(
  'temp engine flips strategy not only desired_engine',
  /apply_voice_listening_strategy\([\s\S]*resourceSaver/.test(sess)
);
check('temp engine restores off', /apply_voice_listening_strategy\([\s\S]*"off"/.test(sess));
check('flow hint mentions Esc', /Esc/.test(sess) && /listen_flow_hint/.test(sess));
check('force_cancel helper', /pub fn force_cancel/.test(sess));
check(
  'begin_session does NOT unconditional force:oral_arm after resume',
  !/resume_listen\(state,\s*app\);[\s\S]{0,200}force:oral_arm/.test(sess)
);
check(
  'temp borrow path still may force:oral_arm',
  /fn ensure_oral_temp_engine[\s\S]{0,2500}force:oral_arm/.test(sess)
);
check(
  'oral engine ready gate exists',
  /is_oral_engine_ready|mark_oral_engine_warming/.test(sess)
);
check(
  'force_cancel always push_state',
  /Always push[\s\S]{0,120}push_state|push_state[\s\S]{0,80}disarm/.test(sess)
);

const router = read('src-tauri/src/voice_command_router.rs');
check(
  'oral disarm uses force_cancel',
  /is_disarm_phrase[\s\S]{0,280}force_cancel/.test(router)
);
check(
  'oral soft cancel uses force_cancel',
  /cancelListen[\s\S]{0,200}force_cancel|force_cancel[\s\S]{0,120}oral_soft_cancel/.test(router)
);
check(
  'oral unmatched seals — no None fallthrough to Wake/IME',
  /Seal oral window[\s\S]{0,200}Some\(skip/.test(router) &&
    /未匹配口令/.test(router)
);
check(
  'oral non-disarm waits for engine ready',
  /is_oral_engine_ready[\s\S]{0,120}引擎启动中/.test(router)
);
check(
  'disarm runs before oral engine ready gate',
  /Hard exit[\s\S]{0,1200}is_oral_engine_ready/.test(router)
);

const bootstrap = read('src-tauri/src/voice_bootstrap.rs');
check(
  'activate stomp debounce 1500ms',
  /ACTIVATE_STOMP_DEBOUNCE_MS:\s*u64\s*=\s*1500/.test(bootstrap) &&
    /should_skip_stomp_activate/.test(bootstrap)
);
check(
  'stomp debounce covers vosk/kws retry but NOT force:oral_arm',
  (() => {
    const m = bootstrap.match(
      /fn activate_reason_is_stomp\([\s\S]*?\n\}/
    );
    if (!m) return false;
    const body = m[0];
    return (
      /"vosk_retry_start"/.test(body) &&
      /"force:kws_retry_start"/.test(body) &&
      !/"force:oral_arm"/.test(body)
    );
  })()
);
check(
  'oral_arm_foreground_identity helper',
  /fn oral_arm_foreground_identity/.test(read('src-tauri/src/soft_pad_runtime/mod.rs'))
);
check(
  'mapping FG lookups use Soft Pad oral identity',
  /fn find_mapping_for_event[\s\S]{0,400}oral_arm_foreground_identity/.test(
    read('src-tauri/src/config.rs')
  ) &&
    /fn find_mapping_for_oral_event[\s\S]{0,500}oral_arm_foreground_identity/.test(
      read('src-tauri/src/config.rs')
    )
);
check(
  'bindings keep peripheral dictation keys off-pack',
  /is_peripheral_trigger_key[\s\S]{0,200}XButton|App-habit mouse[\s\S]{0,200}peripheral/.test(
    read('src-tauri/src/config.rs')
  )
);
check(
  'refuse_wrong_fg uses oral Soft Pad FG identity',
  /fn refuse_wrong_fg[\s\S]{0,700}oral_arm_foreground_identity/.test(sess)
);
check(
  'refuse_wrong_fg allows OneTone/Soft Pad self FG',
  /fn refuse_wrong_fg[\s\S]{0,500}foreground_is_self/.test(sess)
);
check(
  'oral temp gen guards late oral_end',
  /ORAL_TEMP_GEN/.test(sess) &&
    /fn restore_oral_temp_engine[\s\S]{0,500}ORAL_TEMP_GEN/.test(sess)
);

const beg = read('src-tauri/src/cursor_beginner.rs');
check('disarm phrases include 退出', /DISARM_PHRASES[\s\S]{0,120}退出/.test(beg));
check('cancelListen voice includes 退出收听', /cancelListen[\s\S]{0,200}退出收听/.test(beg));
check(
  'beginner voice cancel uses force_cancel not get_main_window',
  /beginner_voice_cancel|force_cancel[\s\S]{0,80}beginner_voice/.test(beg) &&
    !/is_disarm_phrase[\s\S]{0,200}get_main_window/.test(beg)
);

const cmd = read('src-tauri/src/ipc/commands/shell/cursor_beginner_cmd.rs');
check('disarm cmd force_cancels oral', /cmd_cursor_beginner_disarm[\s\S]{0,500}force_cancel/.test(cmd));

const overlay = read('src/codex-micro-overlay.html');
check('Soft Pad Esc ends oral via exitOralListen', /exitOralListen\(['"]esc['"]\)/.test(overlay));
check('clearOralListenChromeLocal helper', /function clearOralListenChromeLocal/.test(overlay));
check(
  'normalize oral snap when armed false',
  /normalizeOralSnapFields/.test(overlay) && /oralListenArmed===false/.test(overlay)
);
check(
  'normalize clears sticky 口头收听 arm hint',
  /normalizeOralSnapFields[\s\S]{0,1600}口头收听/.test(overlay)
);
check(
  'pull not blocked by oral ACT10 listening',
  /function pull\([\s\S]{0,280}holdLockId!=='ACT10'/.test(overlay)
);
check(
  'oral_pad_listening_chrome helper',
  /fn oral_pad_listening_chrome/.test(read('src-tauri/src/codex_micro_overlay.rs'))
);
check(
  'grid early-return still refreshes oral chrome',
  /shouldDeferGridRebuild[\s\S]{0,280}applyOralListenMini\(lastSnap\)/.test(overlay)
);
check('oral cancel chip clickable', /data-oral-slot|exitOralListen\(['"]chip['"]\)/.test(overlay));
check(
  'exitOralListen calls disarm cmd first',
  /function exitOralListen[\s\S]{0,200}cmd_cursor_beginner_disarm/.test(overlay)
);
check(
  'Esc also clears sticky oral caption chrome',
  /oralChrome[\s\S]{0,200}is-oral-arm-caption/.test(overlay)
);

check(
  'disarm not classified as Wake (cooldown trap)',
  /is_disarm_phrase[\s\S]{0,120}VoiceKeywordKind::Cancel/.test(
    read('src-tauri/src/voice_keyword_dispatch.rs')
  )
);
check(
  'kws oral armed bypasses wake cooldown',
  /Oral Soft Pad listen: every soft say[\s\S]{0,1200}handle_detection/.test(
    read('src-tauri/src/voice_kws_runtime.rs')
  )
);
check(
  'vosk oral armed bypasses wake cooldown',
  /fn process_detected[\s\S]{0,1500}handle_detection/.test(
    read('src-tauri/src/voice_vosk_runtime.rs')
  ) && /fn process_detected[\s\S]{0,400}is_armed\(\)/.test(
    read('src-tauri/src/voice_vosk_runtime.rs')
  )
);

const kwsGolden = read('src-tauri/resources/kws/onetone-keywords.txt');
check('KWS golden has 退出', /@退出\s*$/m.test(kwsGolden) || /@退出\r?$/m.test(kwsGolden));
check('KWS golden has 退出收听', /@退出收听/.test(kwsGolden));
check('KWS golden has 停止收听', /@停止收听/.test(kwsGolden));

const kwsKw = read('src-tauri/src/voice_kws_keywords.rs');
check(
  'encode test includes 退出',
  /beginner_golden_phrases_encode[\s\S]{0,400}"退出"/.test(kwsKw)
);

const scene = read('src-tauri/src/scene_config.rs');
check(
  'oral armed injects DISARM into kws plan first',
  /fn kws_keyword_plan_for_cfg[\s\S]{0,400}is_armed\(\)[\s\S]{0,200}DISARM_PHRASES/.test(scene)
);
check(
  'oral armed injects soft says into kws plan',
  /fn kws_keyword_plan_for_cfg[\s\S]{0,600}listen_say_list/.test(scene)
);
check(
  'vosk final routes oral soft says when armed',
  /try_route_vosk_final_phrase[\s\S]{0,800}listen_say_list/.test(
    read('src-tauri/src/voice_vosk_runtime.rs')
  )
);
check(
  'vosk grammar injects oral says when armed',
  /vosk_grammar_phrases_for_cfg[\s\S]{0,2500}listen_say_list\(cfg,\s*32\)/.test(scene)
);
check(
  'oral arm stops IME before resume',
  /fn begin_session[\s\S]{0,1200}reclaim_mic_from_voice_ime/.test(sess)
);
check(
  'enter_dictating notes IME ownership',
  /fn enter_dictating[\s\S]{0,1600}note_ime_voice_active/.test(
    read('src-tauri/src/voice_end_runtime.rs')
  )
);
check(
  'vosk_retry reclaims IME before soft noop',
  /vosk_retry_start[\s\S]{0,500}reclaim_mic_from_voice_ime/.test(
    read('src-tauri/src/voice_vosk_runtime.rs')
  )
);
check(
  'vosk status exposes asrQuiet',
  /"asrQuiet":\s*state\.settings_asr_quiet/.test(
    read('src-tauri/src/voice_vosk_runtime.rs')
  )
);
check(
  'beginner ensure does not steal active_scene',
  !/fn ensure_beginner_overlay_ready[\s\S]{0,2500}set_active_scenario\(/.test(
    read('src-tauri/src/cursor_beginner.rs')
  )
);
check(
  '2s heal does not save_config',
  /LAST_CURSOR_ENSURE[\s\S]{0,2000}In-memory heal only/.test(
    read('src-tauri/src/codex_micro_overlay.rs')
  ) &&
    !/LAST_CURSOR_ENSURE[\s\S]{0,2000}cursor-beginner-ensure-save/.test(
      read('src-tauri/src/codex_micro_overlay.rs')
    )
);
check(
  'continuous ASR skips fingerprint mic stomp',
  /continuous ASR keep mic/.test(read('src-tauri/src/voice_bootstrap.rs'))
);
check(
  'continuous Vosk skips kws_grammar_reload stomp',
  /skip_grammar_reload/.test(read('src-tauri/src/codex_micro_overlay.rs'))
);
check(
  'home FE rejects asrQuiet as listening-ok',
  /asrQuiet===true/.test(read('src/js/features/voice/voice-wake.js'))
);
check(
  'blocks dictation IME while oral armed',
  /blocks_dictation_ime_start/.test(sess) &&
    /blocks_dictation_ime_start/.test(read('src-tauri/src/agent/layer1_native.rs'))
);
check(
  'SendKey skips voice chord while oral armed',
  /blocks_voice_ime_chord/.test(read('src-tauri/src/ipc/trigger_dispatch/send_key.rs'))
);
check(
  'listen resume no longer force_stops while starting',
  !/allow_while_starting\s*=\s*[^\n]*listen resume/.test(
    read('src-tauri/src/voice_bootstrap.rs')
  )
);
check(
  'soft speak allows IME while oral',
  /pushToTalk[\s\S]{0,200}allow_next_ime_start_while_oral/.test(
    read('src-tauri/src/cursor_beginner.rs')
  )
);
check(
  'vosk_retry skipped while oral armed',
  /vosk_retry_start skipped \(oral armed/.test(
    read('src-tauri/src/voice_vosk_runtime.rs')
  )
);
check(
  'bootstrap skips home retry while oral armed',
  /oral_blocks_home_retry|skip activate \(oral armed/.test(
    read('src-tauri/src/voice_bootstrap.rs')
  )
);
check(
  'home nudge skips when oralArmed',
  /maybeNudgeVoskOnHome[\s\S]{0,200}oralArmed/.test(
    read('src/js/features/voice/voice-wake.js')
  )
);

if (fail) process.exit(1);
console.log('test-oral-esc-exit: ok');
