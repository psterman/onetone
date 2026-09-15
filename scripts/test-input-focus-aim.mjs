/**
 * Phase0 guard: shared InputFocusAim + voice prompt fail-closed + Soft Pad Text+Enter.
 *
 * Cursor field matrix (manual, after build):
 * 1. Composer already focused → inject should succeed (aim auto)
 * 2. Focus in code editor → aim should succeed OR toast; never type into editor
 *    (editor tab titles like input-*.html must not pass UIA via substring "input")
 * 3. Target not FG + bring-up off → wrong_fg refuse
 * 4. Target not FG + bring-up on → aim then inject
 * 5. Strategy none → inject without aim (advanced)
 * 6. Split window / DPI → log cursor_send_oplog for Phase1
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const aim = readFileSync(join(root, 'src-tauri/src/input_focus_aim.rs'), 'utf8');
const voiceRt = readFileSync(join(root, 'src-tauri/src/voice_end_runtime.rs'), 'utf8');
const logic = readFileSync(
  join(root, 'src-tauri/crates/onetone-logic/src/runtime_event.rs'),
  'utf8'
);
const pad = readFileSync(join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');
const rail = readFileSync(join(root, 'src/js/features/voice/voice-intent-rail.js'), 'utf8');
const bind = readFileSync(join(root, 'src/js/features/voice/voice-ui-bindings.js'), 'utf8');
const html = readFileSync(join(root, 'src/index.html'), 'utf8');
const cfg = readFileSync(join(root, 'src-tauri/src/config.rs'), 'utf8');
const persist = readFileSync(join(root, 'src/js/core/config-persist.js'), 'utf8');

let fail = 0;
function check(name, ok) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name);
  if (!ok) fail++;
}

check('shared module InputAimStrategy', /pub enum InputAimStrategy/.test(aim));
check('aim_input_focus entry', /pub fn aim_input_focus/.test(aim));
check('lib registers module', readFileSync(join(root, 'src-tauri/src/lib.rs'), 'utf8').includes('mod input_focus_aim'));
check('voiceEnd.input_aim_strategy', /input_aim_strategy/.test(cfg));
check('default auto', /default_voice_end_input_aim_strategy/.test(cfg) && cfg.includes('"auto"'));
check('prompt wake calls aim', /aim_input_focus\(app,/.test(voiceRt));
check('prompt fail-closed event', /VOICE_PROMPT_AIM_FAILED/.test(voiceRt));
check('kind constant', /VOICE_PROMPT_AIM_FAILED/.test(logic));
check('mapping sequence uses aim', /aim_input_focus\(/.test(voiceRt) && /run_mapping_target_sequence/.test(voiceRt));
check('none strategy skips', /InputAimStrategy::None/.test(aim) && /if strategy == InputAimStrategy::None/.test(aim));
check('HTML aim select', html.includes('voiceInputAimStrategy') && html.includes('先对准，再填入'));
check('HTML aim cards', html.includes('voice-prompt-aim__card') && html.includes('直接填入') && html.includes('只在已对准时填'));
check('no jargon labels', !html.includes('自动链式') && !html.includes('仅探测'));
check('rail persists strategy', rail.includes('inputAimStrategy'));
check('toast on aim failed', bind.includes('voice_prompt_aim_failed'));
check('Soft Pad Text+Enter bind', /runTargetSequence/.test(pad) && /promptInjectActions/.test(pad));
check('persist field', persist.includes('inputAimStrategy'));
const workflow = readFileSync(join(root, 'src-tauri/src/app_chat_workflow.rs'), 'utf8');
check('rejects editor tab as composer', /looks_like_editor_document/.test(workflow) && workflow.includes('input-aim-calibrate'));
check('Phase1 deferred note', /Phase1/.test(aim));

process.exit(fail ? 1 : 0);
