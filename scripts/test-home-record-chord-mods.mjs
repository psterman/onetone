// Guard: HomeRecordChord must commit modifier-only chords (RAlt, Ctrl+Shift+Win) on keyup.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'src/js/features/home/home-live.js'), 'utf8');
const beginner = readFileSync(join(root, 'src-tauri/src/cursor_beginner.rs'), 'utf8');

let fail = 0;
function check(name, ok) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name);
  if (!ok) fail++;
}

const fnStart = src.indexOf('function recordChordInline');
const fnChunk = fnStart >= 0 ? src.slice(fnStart, fnStart + 4500) : '';

check('recordChordInline present', fnStart >= 0);
check('sided AltRight → RAlt', /case\s+['"]AltRight['"]:\s*return\s+['"]RAlt['"]/.test(fnChunk));
check('mod-only peakParts on keyup', /peakParts/.test(fnChunk) && /onKeyUp/.test(fnChunk));
check('keyup finishes when mods released', /Object\.keys\(heldCodes\)\.length/.test(fnChunk) && /finish\(chord\)/.test(fnChunk));
check('multi-mod uses Ctrl+Shift+Win style', /p\.push\('Win'\)/.test(fnChunk) && /p\.push\('Ctrl'\)/.test(fnChunk));
check(
  'oral pushToTalk accepts 开始输入',
  /voice_phrases:\s*&\[\s*"说话"[\s\S]*?"开始输入"[\s\S]*?"开始听写"/.test(beginner)
);
const router = readFileSync(join(root, 'src-tauri/src/voice_command_router.rs'), 'utf8');
check(
  'soft slot phrases union defaults',
  /fn soft_slot_match_phrases/.test(router) && /soft_slot_custom_say_keeps_wake_aliases/.test(router)
);
const layer1 = readFileSync(join(root, 'src-tauri/src/agent/layer1_native.rs'), 'utf8');
check(
  'Soft speak prefers habit Lab 听写键',
  /resolve_dictation_ime_key/.test(layer1)
);
const endRt = readFileSync(join(root, 'src-tauri/src/voice_end_runtime.rs'), 'utf8');
check(
  'dictation resolver skips seeded RAlt',
  /fn resolve_dictation_ime_key/.test(endRt) &&
    /is_seeded_cursor_ptt_placeholder/.test(endRt) &&
    /soft_pad_dictation_uses_habit_ime_not_seeded_ralt/.test(endRt)
);
check(
  'wake 开始输入 follows FG then baseline',
  /fn resolve_wake_mapping_id_from_parts/.test(endRt) &&
    /fn resolve_wake_dictation_key/.test(endRt) &&
    /wake_start_input_follows_fg_habit_lab_else_baseline/.test(endRt)
);

process.exit(fail ? 1 : 0);
