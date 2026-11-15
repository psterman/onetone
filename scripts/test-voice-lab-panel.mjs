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
const imeJs = read('src/js/ime-presets.js');

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

check(
  'status bar hosts mode+save (no shell toolbar card)',
  /id="voiceLabStatusBar"[\s\S]*?id="voiceLabModeSw"[\s\S]*?id="voiceLabBtnSave"/.test(labChunk) &&
    /voice-lab-mode-cluster/.test(labChunk) &&
    !/voice-lab-tb/.test(labChunk) &&
    !/voice-lab-habit-strip/.test(labChunk) &&
    !/id="voiceLabHabitCta"/.test(labChunk)
);
check('status bar scene chrome (app+mode+reminder)', /id="voiceLabSceneChrome"/.test(labChunk) && /id="voiceLabSceneApp"/.test(labChunk) && /id="voiceLabSceneMode"/.test(labChunk) && /id="voiceLabSceneEditing"/.test(labChunk) && /id="voiceLabSceneHint"/.test(labChunk));
const noAriaDots = !/aria-hidden="true">[\u00B7\u2022]</.test(labChunk);
const midClean = /id="voiceLabMidLabel">口令进门 常驻唤醒</.test(labChunk);
check('no mid-dot mid labels', noAriaDots && midClean);
check('CSS mode cluster kept; shell toolbar row gone', /voice-lab-mode-cluster/.test(css) && !/\.voice-lab-tb\{/.test(css) && !/\.voice-lab-habit-strip\{/.test(css));
check('JS syncSceneChrome fills app icon + reminder', /function syncSceneChrome/.test(panelJs) && /voiceLabSceneApp/.test(panelJs) && /settingsContextEditing/.test(panelJs));
check('JS mid labels without · separators', /dictation:\s*'听写 口令 输入法 收尾'/.test(panelJs) && !/听写 · 口令 · 输入法 · 收尾/.test(panelJs));
check(
  'session cards host aim blocks; dictation aim inside ime desk',
  /id="voiceLabImeDesk"[\s\S]*?data-vl-aim-for="dictation"[\s\S]*?id="voiceLabFinishCard"/.test(labChunk) &&
    /data-vl-aim-for="oral-cont"/.test(labChunk) &&
    /data-vl-aim-for="oral-fix"/.test(labChunk) &&
    /data-vl-aim-for="oral-send"/.test(labChunk)
);
check(
  'JS aim strategy + click-to-expand demo',
  /function syncAimBlocks/.test(panelJs) &&
    /function setAimStrategy/.test(panelJs) &&
    /Composer 输入框/.test(panelJs) &&
    /keysSeqImeAimFirst/.test(panelJs) &&
    /voice-lab-aim-stage/.test(panelJs) &&
    /data-vl-aim-demo-toggle/.test(panelJs) &&
    /aimDemoExpanded/.test(panelJs) &&
    /输入框对准/.test(panelJs)
);
check(
  'JS aim demo four schemes + voice capsule + 上屏',
  /AIM_DEMO_STORY/.test(panelJs) &&
    /AIM_HINT/.test(panelJs) &&
    /AIM_VOICE_SAMPLE/.test(panelJs) &&
    /function runAimDemoLoop/.test(panelJs) &&
    /function normalizeAimDemoMode/.test(panelJs) &&
    /data-vl-aim-box/.test(panelJs) &&
    /data-vl-aim-beats/.test(panelJs) &&
    /data-vl-aim-capsule/.test(panelJs) &&
    /data-vl-aim-cap-status/.test(panelJs) &&
    /data-vl-aim-cap-partial/.test(panelJs) &&
    /data-vl-aim-rec-badge/.test(panelJs) &&
    /voiceLabAimSmart/.test(panelJs) &&
    /智能填入/.test(panelJs) &&
    /seg\('smart'/.test(panelJs) &&
    /seg\('auto'/.test(panelJs) &&
    /seg\('none'/.test(panelJs) &&
    /seg\('probe'/.test(panelJs) &&
    /开始语音输入/.test(panelJs) &&
    /回放动作 · 点进输入框/.test(panelJs) &&
    /语音输入中/.test(panelJs) &&
    /填入完成/.test(panelJs) &&
    /自动识别输入框/.test(panelJs) &&
    /autoFindAndActivateBox/.test(panelJs) &&
    /正在识别输入框/.test(panelJs) &&
    /已激活输入框/.test(panelJs) &&
    /写到光标处/.test(panelJs) &&
    /mode === 'smart'/.test(panelJs) &&
    /raw === 'uia'/.test(panelJs) &&
    /aimMouseActionRecorded/.test(panelJs) &&
    /playAimMouseStroke/.test(panelJs) &&
    /activateBoxByReplay/.test(panelJs) &&
    /startVoiceCapsule/.test(panelJs) &&
    /capsuleTranscribeAndCommit/.test(panelJs) &&
    /setAimCapsule/.test(panelJs) &&
    /data-vl-aim-mq/.test(panelJs) &&
    /data-vl-aim-pin/.test(panelJs) &&
    /aimMqAroundBox/.test(panelJs) &&
    /aimStoryForMode/.test(panelJs) &&
    /probeMiss/.test(panelJs) &&
    /probeHit/.test(panelJs) &&
    /aimProbeHitNext/.test(panelJs) &&
    /圈住输入框/.test(panelJs) &&
    /蓝框内点一下/.test(panelJs) &&
    /这轮先跳过/.test(panelJs) &&
    /检查已对准/.test(panelJs) &&
    /检查还没对准/.test(panelJs) &&
    /is-probe-ok/.test(panelJs) &&
    /'skip'/.test(panelJs) &&
    /还没对准 · 这轮先跳过/.test(panelJs) &&
    /不激活输入框/.test(panelJs) &&
    /不录制/.test(panelJs) &&
    /'回放'/.test(panelJs) &&
    /已记住位置/.test(panelJs) &&
    !/胶囊录制转化/.test(panelJs) &&
    !/误写入编辑器/.test(panelJs) &&
    !/今天的笔记：/.test(panelJs) &&
    !/别处/.test(panelJs) &&
    !/data-vl-aim-code/.test(panelJs) &&
    !/data-vl-aim-away/.test(panelJs) &&
    !/激活命令模式/.test(panelJs) &&
    !/data-vl-aim-cmd/.test(panelJs) &&
    !/voiceWriteInto/.test(panelJs) &&
    !/录落点/.test(panelJs) &&
    !/style="--spot-x/.test(panelJs)
);
check(
  'CSS voice-lab-aim beats + capsule + marquee/pin stroke',
  /voice-lab-aim-seg/.test(css) &&
    /voice-lab-aim-demo-toggle/.test(css) &&
    /voice-lab-aim-beats/.test(css) &&
    /voice-lab-aim-rec-badge/.test(css) &&
    /voice-lab-aim-capsule/.test(css) &&
    /voice-lab-aim-capsule__waves/.test(css) &&
    /voice-lab-aim-capsule__partial/.test(css) &&
    /is-transcribe/.test(css) &&
    /is-commit/.test(css) &&
    /is-skip/.test(css) &&
    /is-probe-ok/.test(css) &&
    /vlAimProbePulse/.test(css) &&
    /vlAimProbeOkPulse/.test(css) &&
    /voice-lab-aim-stage\.is-rec/.test(css) &&
    /voice-lab-aim-stage\.is-replay/.test(css) &&
    /voice-lab-aim-stage__mq/.test(css) &&
    /voice-lab-aim-stage__pin/.test(css) &&
    /voice-lab-aim-stage__box\.is-dim/.test(css) &&
    /#5ad0f5/.test(css) &&
    /voice-lab-aim-stage__click/.test(css) &&
    /overflow:visible/.test(css) &&
    /padding-top:36px/.test(css) &&
    /vlAimClickPop/.test(css) &&
    /vlAimWave/.test(css)
);
check(
  'Lab phrase summary + sheet popup',
  /id="voiceLabPhraseSummary"/.test(labChunk) &&
    /id="voiceLabPhraseSheet"/.test(labChunk) &&
    /data-vl-phrase-open="primary"/.test(labChunk) &&
    /data-vl-phrase-open="cancel"/.test(labChunk) &&
    /function openPhraseSheet/.test(panelJs) &&
    /function syncPhrasePreviews/.test(panelJs)
);
check('JS new oral builds editor not blank pane', /function ensureCustomOralPane/.test(panelJs) && /function saveCustomOral/.test(panelJs) && /savePromptInjectMapping/.test(panelJs) && /wakePhrases/.test(panelJs) && /data-vl-oral-say/.test(panelJs) && /data-vl-oral-body/.test(panelJs));
check('JS new oral enables prompt peer for VOSK', /function enableOralPromptPeer/.test(panelJs) && /prompt:/.test(panelJs) && /cmd_test_send|runInvoke/.test(panelJs));
check('JS oral after uses finish segs confirm/phrase/auto', /data-vl-oral-after="confirm"/.test(panelJs) && /data-vl-oral-after="phrase"/.test(panelJs) && /data-vl-oral-after="auto"/.test(panelJs) && /function syncOralAfterChrome/.test(panelJs) && /function promptActionsForAfter/.test(panelJs) && /normalizeOralAfter/.test(panelJs));
check('JS oral after auto appends Enter; confirm/phrase text only', /mode === 'auto'/.test(panelJs) && /type: 'key', value: 'Enter'/.test(panelJs) && /after:\s*'confirm'/.test(panelJs));
check('JS session cards get after blocks except gate', /SESSION_AFTER_PANES/.test(panelJs) && /function ensureSessionAfterBlocks/.test(panelJs) && /oral-cont/.test(panelJs) && /oral-fix/.test(panelJs) && /oral-send/.test(panelJs) && /function sessionAfterBlockHtml/.test(panelJs));
check('rail gate + dictation + oral', /voiceLabRailGate/.test(labChunk) && /voiceLabRailDict/.test(labChunk) && /oral-cont/.test(labChunk));
check('dictation IME face prefixed', /id="voiceLabMatchChain"/.test(labChunk) && /id="voiceLabImeDesk"/.test(labChunk) && /id="voiceLabImePresetStrip"/.test(labChunk) && /id="voiceLabFinishCard"/.test(labChunk));
check('ime icons use icons/ime/', /src="icons\/ime\/xunfei\.png"/.test(labChunk) && !/\.\.\/src\/icons\//.test(labChunk));
check(
  'Lab IME strip empty host for ime-presets mount',
  /id="voiceLabImePresetStrip"[^>]*>\s*<\/div>/.test(labChunk) && /data-ime-context="voiceLab"/.test(labChunk)
);
check(
  'Lab end phrase host empty for VoiceEnd paint',
  /id="voiceLabEndPhraseTags"[^>]*>\s*<\/div>/.test(labChunk)
);
check(
  'JS dictation syncs finish+IME+phrases to classic APIs',
  /function syncDictationChrome/.test(panelJs) &&
    /function syncLabPhraseTags/.test(panelJs) &&
    /setOutputMode/.test(panelJs) &&
    /addCustomEndPhrase|addCustomSendPhrase/.test(panelJs) &&
    /OneToneImePresets/.test(panelJs) &&
    /refresh\('voiceLab'\)/.test(panelJs)
);
check(
  'JS saveToHabit uses VoiceSchemePersist',
  /function saveToHabit/.test(panelJs) &&
    /saveVoiceScheme/.test(panelJs) &&
    /mirrorGlobalToOverride/.test(panelJs) &&
    /saveToHabit\(\)/.test(panelJs)
);
check(
  'JS dictation key record + match chain sync',
  /function rerecordDictationKey/.test(panelJs) &&
    /setVoiceTarget/.test(panelJs) &&
    /OneToneHomeRecordChord/.test(panelJs) &&
    /function syncMatchChain/.test(panelJs) &&
    /primaryWakePhraseDisplay|resolveDisplayWakePhrase/.test(panelJs) &&
    /voiceLabSettingsTargetKey/.test(panelJs)
);
check(
  'ime-presets mounts voiceLab as voice twin',
  /voiceLab:\s*'voiceLabImePresetStrip'/.test(imeJs) &&
    /function isVoiceCtx/.test(imeJs) &&
    /setVoiceTarget:\s*applyVoiceTarget/.test(imeJs) &&
    /rerecordDictationKey/.test(imeJs)
);
check('no classic voiceWake ids inside lab', !/id="imePresetStripVoice"/.test(labChunk) && !/id="voiceImeDesk"/.test(labChunk) && !/id="voiceFinishCard"/.test(labChunk) && !/id="voiceMatchChain"/.test(labChunk));
check('LIVE drawer present', /id="voiceLabLiveDrawer"/.test(labChunk));

check('shell-ia voiceLab entry', /voiceLab:\s*\{\s*panel:\s*'voiceLab'[\s\S]*?note:\s*'mac-voice-lab'/.test(shellIa));
check('NAV_PANEL_MAP voiceLab', /voiceLab:'voiceLab'/.test(workbench));
check('PANEL_IDS voiceLab', /voiceLab:'settingsPanelVoiceLab'/.test(drawer));
check('drawer renders OneToneVoiceLabPanel', /panel==='voiceLab'[\s\S]*?OneToneVoiceLabPanel\.render/.test(drawer));
check('JS exports render+bind', /OneToneVoiceLabPanel\s*=\s*\{[\s\S]*render:[\s\S]*bind:/.test(panelJs));
check('JS opens legacy voiceWake with legacy flag', /panel === 'voiceWake'/.test(panelJs) && /legacy:\s*true|legacy = true/.test(panelJs));
check(
  'product entry is voiceLab; classic voiceWake nav hidden but panel kept',
  /id="wbNavVoice"[^>]*\bhidden\b/.test(html) &&
    /id="settingsNavVoiceWake"[^>]*\bhidden\b/.test(html) &&
    /id="settingsPanelVoiceWake"/.test(html) &&
    /id="wbNavVoiceLab"/.test(html) &&
    !/id="wbNavVoiceLab"[^>]*\bhidden\b/.test(html) &&
    /id="settingsPanelVoiceLab"/.test(html)
);
check(
  'voiceWake panel id map kept; product CTAs go voiceLab via adapter',
  /voiceWake:'settingsPanelVoiceWake'/.test(drawer) &&
    /voiceLab:'settingsPanelVoiceLab'/.test(drawer) &&
    /voiceWake:'voice'/.test(workbench) &&
    /voiceLab:'voiceLab'/.test(workbench) &&
    (/legacy===true\|\|opts\.openLegacy===true/.test(drawer) || /OneToneVoiceNav/.test(drawer))
);
check(
  'Lab advanced mic+engine hosts (no intent rail)',
  /id="voiceLabAdvanced"/.test(labChunk) &&
    /id="voiceLabMicBtn"/.test(labChunk) &&
    /id="voiceLabEngineGrid"/.test(labChunk) &&
    /data-voice-engine-tab="sapi"/.test(labChunk) &&
    /data-voice-engine-tab="vosk"/.test(labChunk) &&
    /data-voice-engine-tab="kws"/.test(labChunk) &&
    !/id="voiceIntentRail"/.test(labChunk) &&
    !/data-voice-intent=/.test(labChunk)
);
check(
  'JS syncAdvancedChrome + engine/mic bridge',
  /function syncAdvancedChrome/.test(panelJs) &&
    /function switchLabEngine/.test(panelJs) &&
    /function openLabMicPicker/.test(panelJs) &&
    /switchMode/.test(panelJs)
);
check(
  'Lab resource block has download+progress for first-run vosk',
  /id="voiceLabResourceDownload"/.test(labChunk) &&
    /id="voiceLabResourceProgress"/.test(labChunk) &&
    /function kickLabVoskDownload/.test(panelJs) &&
    /downloadVoskModelGuide/.test(panelJs)
);
check(
  'product line host kept; gate annotation clutter gone',
  /id="voiceLabProductLineHint"/.test(labChunk) &&
    !/id="voiceLabGateBanner"/.test(labChunk) &&
    !/voice-lab-cut-note/.test(labChunk) &&
    !/不提供意图分类列表|不放意图分类列表/.test(labChunk) &&
    !/相对 Windows 现页/.test(labChunk)
);
check('legacy link still opens classic voice settings', /id="voiceLabOpenLegacy"/.test(labChunk) && /openPanel\('voiceWake'\)/.test(panelJs));
check('JS can open habits panel', /['"]habits['"]/.test(panelJs) && /function openPanel/.test(panelJs));
check('CSS scoped under settingsPanelVoiceLab', /#settingsPanelVoiceLab\.voice-lab-page/.test(css) && /#settingsPanelVoiceLab \.voice-lab-shell/.test(css));
check('CSS advanced fold', /voice-lab-advanced/.test(css) && /voice-lab-engine-btn/.test(css));
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
