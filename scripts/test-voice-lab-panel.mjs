// Guard: Mac voice lab settings page wired parallel to keysSeq, prefixed ids only.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const html = read('src/index.html');
const panelJs = read('src/js/features/voice/voice-lab-panel.js');
const css = read('src/css/voice-lab-panel.css');
const i18n = read('src/js/core/i18n.js');
const drawer = read('src/js/features/settings/settings-drawer.js');
const shellIa = read('src/js/shared/shell-ia-convergence.js');
const workbench = read('src/js/features/home/home-workbench.js');

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

console.log('[voice-lab-panel]');

check('wbNavVoiceLab after voice', /id="wbNavVoice"[\s\S]*?data-wb-nav="voiceLab"[\s\S]*?id="wbNavVoiceLab"/.test(html));
check('wbNavVoiceLab label 语音', /id="wbNavVoiceLab"[\s\S]*?data-i18n="homeWbNavVoiceLab">语音</.test(html));
check('settings drawer sibling voiceLab', /id="settingsNavVoiceWakeGroup"[\s\S]*?data-panel="voiceLab"[\s\S]*?settingsNavVoiceLab/.test(html));
check('panel id settingsPanelVoiceLab', /id="settingsPanelVoiceLab"/.test(html));
check('panel after voiceWake before sounds', /id="settingsPanelVoiceWake"[\s\S]*?id="settingsPanelVoiceLab"[\s\S]*?id="settingsPanelSounds"/.test(html));
check('css link voice-lab-panel.css', /href="css\/voice-lab-panel\.css"/.test(html));
check('script voice-lab-panel.js', /src="js\/features\/voice\/voice-lab-panel\.js"/.test(html));

const labStart = html.indexOf('id="settingsPanelVoiceLab"');
const labEnd = html.indexOf('id="settingsPanelSounds"');
const labChunk = labStart >= 0 && labEnd > labStart ? html.slice(labStart, labEnd) : '';

check('shell toolbar + habit strip', /voice-lab-tb/.test(labChunk) && /voice-lab-habit-strip/.test(labChunk));
check('status bar scene chrome (app+mode+reminder)', /id="voiceLabSceneChrome"/.test(labChunk) && /id="voiceLabSceneApp"/.test(labChunk) && /id="voiceLabSceneMode"/.test(labChunk) && /id="voiceLabSceneEditing"/.test(labChunk) && /id="voiceLabSceneHint"/.test(labChunk));
const habitStripMatch = labChunk.match(/class="voice-lab-habit-strip"[\s\S]*?<\/div>/);
const habitStripHtml = habitStripMatch ? habitStripMatch[0] : '';
const noHabitDots = !!habitStripHtml && !/[\u00B7\u2022]/.test(habitStripHtml);
const noAriaDots = !/aria-hidden="true">[\u00B7\u2022]</.test(labChunk);
const midClean = /id="voiceLabMidLabel">口令进门 常驻唤醒</.test(labChunk);
check('no mid-dot habit strip / mid labels', noHabitDots && noAriaDots && midClean);
check('JS syncSceneChrome fills app icon + reminder', /function syncSceneChrome/.test(panelJs) && /voiceLabSceneApp/.test(panelJs) && /settingsContextEditing/.test(panelJs));
check('JS mid labels without · separators', /dictation:\s*'听写 口令 输入法 收尾'/.test(panelJs) && !/听写 · 口令 · 输入法 · 收尾/.test(panelJs));
check('session cards host aim blocks', /data-vl-aim-host/.test(labChunk) && /data-vl-aim-for="dictation"/.test(labChunk) && /data-vl-aim-for="oral-cont"/.test(labChunk) && /data-vl-aim-for="oral-fix"/.test(labChunk) && /data-vl-aim-for="oral-send"/.test(labChunk));
check('JS aim strategy + demo for agent box', /function syncAimBlocks/.test(panelJs) && /function setAimStrategy/.test(panelJs) && /Composer 输入框/.test(panelJs) && /keysSeqImeAimFirst/.test(panelJs) && /voice-aim-demo/.test(panelJs));
check('CSS voice-lab-aim segments', /voice-lab-aim-seg/.test(css) && /voice-lab-aim-demo/.test(css));
check('JS new oral builds editor not blank pane', /function ensureCustomOralPane/.test(panelJs) && /function saveCustomOral/.test(panelJs) && /savePromptInjectMapping/.test(panelJs) && /wakePhrases/.test(panelJs) && /data-vl-oral-say/.test(panelJs) && /data-vl-oral-body/.test(panelJs));
check('JS new oral enables prompt peer for VOSK', /function enableOralPromptPeer/.test(panelJs) && /prompt:/.test(panelJs) && /cmd_test_send|runInvoke/.test(panelJs));
check('JS oral after uses finish segs confirm/phrase/auto', /data-vl-oral-after="confirm"/.test(panelJs) && /data-vl-oral-after="phrase"/.test(panelJs) && /data-vl-oral-after="auto"/.test(panelJs) && /function syncOralAfterChrome/.test(panelJs) && /function promptActionsForAfter/.test(panelJs) && /normalizeOralAfter/.test(panelJs));
check('JS oral after auto appends Enter; confirm/phrase text only', /mode === 'auto'/.test(panelJs) && /type: 'key', value: 'Enter'/.test(panelJs) && /after:\s*'confirm'/.test(panelJs));
check('JS session cards get after blocks except gate', /SESSION_AFTER_PANES/.test(panelJs) && /function ensureSessionAfterBlocks/.test(panelJs) && /oral-cont/.test(panelJs) && /oral-fix/.test(panelJs) && /oral-send/.test(panelJs) && /function sessionAfterBlockHtml/.test(panelJs));
check('rail gate + dictation + oral', /voiceLabRailGate/.test(labChunk) && /voiceLabRailDict/.test(labChunk) && /oral-cont/.test(labChunk));
check('dictation IME face prefixed', /id="voiceLabMatchChain"/.test(labChunk) && /id="voiceLabImeDesk"/.test(labChunk) && /id="voiceLabImePresetStrip"/.test(labChunk) && /id="voiceLabFinishCard"/.test(labChunk));
check('ime icons use icons/ime/', /src="icons\/ime\/xunfei\.png"/.test(labChunk) && !/\.\.\/src\/icons\//.test(labChunk));
check('no classic voiceWake ids inside lab', !/id="imePresetStripVoice"/.test(labChunk) && !/id="voiceImeDesk"/.test(labChunk) && !/id="voiceFinishCard"/.test(labChunk) && !/id="voiceMatchChain"/.test(labChunk));
check('LIVE drawer present', /id="voiceLabLiveDrawer"/.test(labChunk));

check('shell-ia voiceLab entry', /voiceLab:\s*\{\s*panel:\s*'voiceLab'[\s\S]*?note:\s*'mac-voice-lab'/.test(shellIa));
check('NAV_PANEL_MAP voiceLab', /voiceLab:'voiceLab'/.test(workbench));
check('PANEL_IDS voiceLab', /voiceLab:'settingsPanelVoiceLab'/.test(drawer));
check('drawer renders OneToneVoiceLabPanel', /panel==='voiceLab'[\s\S]*?OneToneVoiceLabPanel\.render/.test(drawer));
check('JS exports render+bind', /OneToneVoiceLabPanel\s*=\s*\{[\s\S]*render:[\s\S]*bind:/.test(panelJs));
check('JS opens legacy voiceWake', /openPanel\('voiceWake'\)/.test(panelJs) || /panel:\s*'voiceWake'/.test(panelJs));
check('JS habit CTA panel', /openPanel\([^)]*habits/.test(panelJs) || /data-vl-open-panel="habits"/.test(labChunk));
check('CSS scoped under settingsPanelVoiceLab', /#settingsPanelVoiceLab\.voice-lab-page/.test(css) && /#settingsPanelVoiceLab \.voice-lab-shell/.test(css));
check('CSS remaps ime strip for lab', /#settingsPanelVoiceLab \.voice-ime-strip-wrap \.ime-preset-strip/.test(css));
check('CSS product ime fills mid (no 560 cap)', /voice-product-ime\{[\s\S]*?max-width:none/.test(css) && !/\.voice-product-ime\{max-width:560px\}/.test(css));
check('CSS shell fills drawer height', /#settingsPanelVoiceLab\.voice-lab-page\{[\s\S]*?flex:1 1 auto/.test(css));
check('gate oral keycap + rerecord + trial ids', /id="voiceLabOralKeycap"/.test(labChunk) && /id="voiceLabOralRerecord"/.test(labChunk) && /id="voiceLabOralTrial"/.test(labChunk));
check('JS arms oral session via session_toggle', /cmd_voice_command_session_toggle/.test(panelJs) && /startOralTriggerRecord/.test(panelJs));
check('JS oral rerecord shows centered HomeRecordChord', /OneToneHomeRecordChord/.test(panelJs) && /voiceLabOralRecordTitle|录制命令键/.test(panelJs));
check('JS trial does not require bound oral key', /function trialOpenAssist/.test(panelJs) && !/if\s*\(\s*!oralKeyRaw\(m\)\s*\)/.test(panelJs));
check('JS trial status + toggle-first', /voiceLabOralTrialStatus/.test(panelJs) && /setTrialStatus/.test(panelJs));
check('JS syncGateChrome from oral scheme', /syncGateChrome/.test(panelJs) && /oralTriggerKeyLabel|oralTriggerKeyRaw/.test(panelJs));
check('JS keyless wake via OneToneVoiceKeyless', /OneToneVoiceKeyless/.test(panelJs) && /setKeyless|setOn/.test(panelJs));
check('HTML trial status host', /id="voiceLabOralTrialStatus"/.test(labChunk));

check('i18n zh homeWbNavVoiceLab', /homeWbNavVoiceLab:'语音'/.test(i18n));
check('i18n zh settingsNavVoiceLab', /settingsNavVoiceLab:'语音'/.test(i18n));
check('i18n zh voiceLabTitle + openLegacy', /voiceLabTitle:'语音'/.test(i18n) && /voiceLabOpenLegacy:'打开原语音设置 →'/.test(i18n));
check('i18n keeps homeWbNavVoice 语音设置', /homeWbNavVoice:'语音设置'/.test(i18n));
check('i18n en Voice keys', /homeWbNavVoiceLab:'Voice'/.test(i18n) && /settingsNavVoiceLab:'Voice'/.test(i18n) && /voiceLabOpenLegacy:'Open classic Voice settings →'/.test(i18n));
check('temp css extract deleted', !existsSync(join(root, 'scripts/_voice-lab-css-extract.txt')));

if (fail) {
  console.error(fail + ' failed');
  process.exit(1);
}
console.log(pass + ' passed');
