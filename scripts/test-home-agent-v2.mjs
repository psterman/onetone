/**
 * Home Agent V2 — source + fixture checks for trusted workbench batch 1.
 *
 * Real Tauri manual checklist (fixtures cannot prove these):
 * 1) Send with locked project → IPC projectHint equals Dock project leaf path
 * 2) Window focus + paste confirmation outcomes match deliveryReceipt wording
 * 3) Attention「前往处理」opens the attention Agent, not the currently selected one
 * 4) Agent Center clientEffect navigate still works from HA2 dispatch
 * Chat ask polish hand-check:
 * 5) 「戴佳伟是谁」→ web_search / fetch → finish 自然语言（无框架表）
 * 6) 无已确认项目时提问仍能启动（atr-chat-scratch），不弹 need_project
 * 7) Needs input 内联回复（无 window.prompt），compose「继续」续跑
 * 8) Stop 取消 chat ATR（transcript「已停止」）
 * 9) 坏模型 / 未配置 → transcript finish 诚实失败（换引擎/配置密钥）
 * 10) deliver_to_agent → 批准前不粘贴；批准后 clipboard+paste
 *
 * Run: npm run test:home-agent-v2
 * Also: npm run test:project-path && npm run test:now-home && npm run test:agent-center
 *       && npm run test:agent-home-pulse && npm run test:agent-nav-target
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(p, 'utf8');
const html = read('src/index.html');
const triadSrc = read('src/js/features/now/home-focus-triad.js');
const storeSrc = read('src/js/features/now/home-agent-v2-store.js');
const dockSrc = read('src/js/features/now/home-agent-v2-dock.js');
const shell = read('src/js/features/now/home-agent-v2.js');
const css = read('src/css/home-agent-v2.css');
const now = read('src/js/features/now/now-home.js');
const workbench = read('src/js/features/home/home-workbench.js');
const focusView = read('src/js/features/now/home-focus-view.js');

assert.match(html, /css\/home-agent-v2\.css/);
assert.match(html, /js\/features\/now\/home-focus-triad\.js/);
assert.match(html, /home-focus-triad\.js[\s\S]*home-focus-view\.js/);
assert.match(html, /js\/core\/project-path\.js/);
assert.match(html, /project-path\.js[\s\S]*home-agent-capabilities\.js/);
assert.match(html, /home-agent-capabilities\.js[\s\S]*home-agent-v2-store\.js/);
assert.match(html, /js\/features\/now\/home-agent-capabilities\.js/);
assert.match(html, /data-ot-defer="home-agent"[^>]*home-agent-v2-store\.js|home-agent-v2-store\.js[^>]*data-ot-defer="home-agent"/);
assert.match(html, /data-ot-defer="home-agent"[^>]*home-agent-v2-dock\.js|home-agent-v2-dock\.js[^>]*data-ot-defer="home-agent"/);
assert.match(html, /data-ot-defer="home-agent"[^>]*home-agent-v2\.js|home-agent-v2\.js[^>]*data-ot-defer="home-agent"/);
assert.match(html, /data-wb-nav="homeV2"/);
assert.match(html, />新首页</);
assert.match(now, /homeAgentV2/);
assert.match(now, /onetone\.homeSurface/);
assert.match(now, /ensureHomeAgentScripts/);
assert.match(now, /loadGroup\(['"]home-agent['"]\)/);
assert.match(now, /OneToneHomeAgentV2\.mount|HA2\.mount/);
assert.match(now, /detectHomeAgentV2\(\)[\s\S]*ensureHomeAgentScripts[\s\S]*showAgentV2Surface/);
assert.match(now, /ls === 'focus' \|\| ls === 'classic'/);
assert.match(now, /ls === 'agentV2'/);
assert.match(now, /return false/);
assert.match(now, /tryEmbedHa2Compose|embedCompose/);
assert.match(shell, /function ensureHomeAgentReadyThenSend/);
assert.match(shell, /loadGroup\(['"]home-agent['"]\)/);
assert.match(shell, /ensureHomeAgentReadyThenSend\(\)/);
assert.match(storeSrc, /controller_unavailable/);
assert.match(storeSrc, /controller_create_failed/);
assert.match(workbench, /onetone\.homeSurface/);
assert.match(workbench, /action==='homeV2'/);
assert.match(workbench, /homeSurface','focus'/);

const capsSrc = read('src/js/features/now/home-agent-capabilities.js');
assert.match(capsSrc, /OneToneHomeAgentCapabilities/);
assert.match(capsSrc, /projectCapabilities|projectSession|projectPermissions/);
assert.match(capsSrc, /task_organize|projectTaskOrganize/);
assert.match(capsSrc, /cmd_assist_run|cmd_assist_cancel/);
assert.match(capsSrc, /available:\s*st\s*===\s*'available'/);
assert.match(html, /home-assist-ownership\.js[\s\S]*home-assist-client\.js[\s\S]*home-prompt-prep\.js/);
assert.doesNotMatch(capsSrc, /\blocalStorage\s*\.|\bOneToneIpc\b|\bsetInterval\s*\(|\bsetTimeout\s*\(/);
assert.match(storeSrc, /OneToneHomeAgentV2Store/);
assert.match(storeSrc, /wbSendMode|setWbSendMode/);
assert.match(storeSrc, /session:|buildSessionProjection/);
assert.match(storeSrc, /evidence:/);
assert.match(storeSrc, /OneToneHomeFocusStore/);
assert.match(storeSrc, /inventoryDiscovery/);
assert.match(storeSrc, /presence/);
assert.match(storeSrc, /confidence/);
assert.doesNotMatch(storeSrc, /row\.installed \|\| row\.isInstalled/);
assert.match(storeSrc, /agent\.focus/);
assert.match(storeSrc, /LAST_GOOD_MAX_AGE_MS/);
assert.match(storeSrc, /savedAt/);
assert.match(storeSrc, /currentWork/);
assert.match(storeSrc, /observedStatus/);
assert.match(storeSrc, /cmd_agent_center_snapshot/);
assert.match(storeSrc, /cmd_agent_install_inventory/);
assert.match(storeSrc, /cmd_agent_attention_snapshot/);
// Progressive refresh: inventory must not gate first paint.
assert.match(storeSrc, /must not gate first paint|Fast path/);
assert.match(storeSrc, /refreshGen/);
assert.match(shell, /function presenceBits/);
assert.match(shell, /ha2TaskEmptyTitle[\s\S]*没有正在推进的事/);
// Honest resume hero: archive / strong continue before empty boilerplate; never fake running.
assert.match(shell, /interruptedWorkRuns[\s\S]*ha2TaskReturn[\s\S]*没有正在推进的事/);
assert.match(shell, /\/resumable\|interrupted\//);
assert.match(storeSrc, /Strong step \+ resumable is honest resume/);
assert.doesNotMatch(storeSrc, /Closed \/ not-running agents must not occupy the workspace as fake monitoring/);
assert.match(storeSrc, /function quietHintLines/);
assert.match(shell, /quietHintLines/);
assert.match(shell, /ha2-quiet-hint|ha2-empty--hints/);
assert.doesNotMatch(shell, /还没有可叙述的任务行|用底栏直接投递/);
assert.doesNotMatch(shell, /暂无可叙述任务/);
// Empty state: no「现在」kicker + agent name dump (pulse chips own that).
assert.doesNotMatch(shell, /bit\.running\.join\(/);
assert.match(shell, /kicker:\s*['"]['"]/);
assert.doesNotMatch(shell, /ha2PillTarget|发送到['"]\s*\)\s*\+\s*['"]\s*<\/span><span class="ha2-pill-val/);
assert.match(storeSrc, /cmd_tm_status/);
assert.match(storeSrc, /timeMachine/);
assert.match(shell, /workspaceTitleChipHtml|data-ha2-ws-chip/);
assert.match(shell, /openTimeCapsule[\s\S]*view:\s*'capsule'|agentSub:\s*'capsule'/);
assert.doesNotMatch(shell, /openTimeCapsule[\s\S]*openSubpage\('timeline'/);
assert.match(css, /\.ha2-ws-chip\b/);
assert.match(css, /\.ha2-workspace-icon\b/);
assert.match(css, /\.ha2-quiet-hint/);
assert.match(css, /\.ha2-empty--hints/);
// Workspace capsule is part of the existing list and exposes one useful action.
assert.match(shell, /data-ha2-ws-chip/);
assert.match(shell, /n < 1/);
assert.doesNotMatch(
  shell,
  /ha2-section-head[\s\S]{0,280}ha2ViewAll|ha2-section-head[\s\S]{0,280}data-ha2-open-model-providers/
);
assert.match(shell, /data-ha2-model-route-host/);
assert.match(shell, /data-ha2-wb-account-host/);
assert.match(shell, /data-ha2-open-model-providers/);
assert.match(
  shell,
  /data-ha2-model-route-host[\s\S]*?data-ha2-open-model-providers/
);
assert.match(shell, /ha2WorkspaceChanges|项改动/);
assert.match(shell, /ha2TmClean|工作区干净/);
assert.match(shell, /ha2OpenProjectTimeline|打开项目时间线/);
assert.match(shell, /resolveHomeTimelineWorkspace|targetContext\.projectPath/);
assert.doesNotMatch(shell, /data-ha2-workspace-review|审查工作区改动/);
// Picker anchors to trigger; aim must not treat slot index as locked.
assert.match(shell, /positionPickerPanel/);
assert.match(shell, /visibility\s*=\s*'hidden'/);
assert.match(shell, /var pickerSide = null/);
assert.match(shell, /never rewrite innerHTML/);
assert.match(shell, /pickerPositioning/);
assert.match(shell, /function onPickerReposition\(e\)/);
assert.match(read('src/css/now-home.css'), /Pin from top|justify-content:\s*flex-start/);
assert.match(css, /\.ha2-picker\{[^}]*position:\s*fixed/);
assert.match(dockSrc, /aimPointActive/);
assert.doesNotMatch(dockSrc, /hasActive \|\| s\.active \|\| s\.confirmed/);
assert.match(dockSrc, /force:\s*true/);
// Per-agent aim: send inherits memory; 「现在定位」forces calibrate.
assert.match(dockSrc, /function ensureAim/);
assert.match(dockSrc, /function refreshAllAims/);
assert.match(shell, /ensureAim\(c\.id,\s*\{\s*force:\s*false/);
assert.doesNotMatch(shell, /clipWrite[\s\S]{0,200}calibrateAim\(c\.id\)/);
// Send must call ensureAim (not swallow) then agent.focus+paste; project is not a gate.
assert.match(shell, /Project is a handoff hint only/);
assert.match(shell, /function sendAgentIdFor/);
assert.match(shell, /pasteClipboard:\s*true/);
assert.match(shell, /Ctrl\/Cmd\+Enter|ctrlKey \|\| e\.metaKey/);
assert.doesNotMatch(
  shell,
  /function send\([\s\S]*?if\s*\(!ctx\.projectPath\)/
);
assert.match(storeSrc, /icons\/app-target\/kimi\.png/);
assert.match(storeSrc, /icons\/app-target\/pi\.png/);
assert.match(storeSrc, /icons\/app-target\/openclaw\.png/);
assert.match(storeSrc, /icons\/app-target\/hermes\.png/);
assert.ok(fs.existsSync('src/icons/app-target/kimi.png'));
assert.ok(fs.existsSync('src/icons/app-target/pi.png'));
assert.ok(fs.existsSync('src/icons/app-target/openclaw.png'));
assert.ok(fs.existsSync('src/icons/app-target/hermes.png'));
// Aim clear: omit slot (usize) — string 'active' broke IPC; optimistic local clear.
assert.match(dockSrc, /function clearAim[\s\S]*cmd_input_aim_calibrate_clear[\s\S]*appTargetId/);
assert.doesNotMatch(dockSrc, /slot:\s*['"]active['"]/);
assert.match(dockSrc, /setAim\(appId,\s*\{\s*hasActive:\s*false/);
// Dock: compose + inline agent strip; send history lives in left-nav panel.
assert.match(shell, /aimChipHtml|ha2-aim-ico/);
assert.match(shell, /syncAimChip/);
assert.match(shell, /agentStripHtml|data-ha2-agent-strip|data-ha2-agent-pick/);
assert.match(shell, /ha2-agent-flyout|data-ha2-agent-flyout/);
assert.match(shell, /data-ha2-agent-toggle|openAgentFlyout|closeAgentFlyout/);
assert.match(shell, /ha2-agent-ico/);
assert.match(shell, /data-ot-tip/);
assert.doesNotMatch(shell, /data-ha2-hist|histMenuHtml|histMenuOpen/);
assert.match(shell, /ha2-agent-fuse|data-ha2-agent-fuse/);
assert.match(shell, /ha2-channel-caps/);
assert.match(shell, /agentCapBtn\(caps,\s*'softPad'/);
assert.match(shell, /agentCapBtn\(caps,\s*'voice'/);
assert.match(shell, /agentCapBtn\(caps,\s*'camera'/);
// WorkBuddy default model switch on home dock (same account store as Soft Pad 监视中).
assert.match(shell, /data-ha2-wb-model-host|wbModelSelectHtml/);
assert.match(shell, /data-ha2-wb-model/);
assert.match(shell, /cmd_workbuddy_local_account_set_model/);
assert.match(shell, /cmd_workbuddy_local_accounts_list/);
assert.match(css, /\.ha2-wb-model\b/);
// P1: home local chat (default) + desktop handoff toggle; transcript separate from handoff journal.
assert.match(shell, /Gateway\.streamChat/);
assert.match(shell, /cmd_workbuddy_local_chat_poll/);
assert.match(shell, /startWbPoll/);
// Provider connectivity checks may use a small maxTokens budget; the chat stream
// itself is routed through Gateway rather than carrying a WorkBuddy-only option.
assert.equal((shell.match(/function sendWbLocal/g) || []).length, 1);
assert.equal((shell.match(/function ensureWbStreamListen/g) || []).length, 1);
assert.match(shell, /wb_local_chat_done/);
assert.match(shell, /wb_local_chat_delta/);
assert.match(shell, /function sendWbLocal/);
assert.match(shell, /openWbChatPage|data-ha2-wb-page/);
assert.match(shell, /onWbStreamDelta/);
assert.doesNotMatch(shell, /cmd_workbuddy_local_chat_start/);
assert.match(shell, /paintWbStreamingLive|wb_local_chat_delta/);
assert.doesNotMatch(shell, /ha2WbPageChatting|正在流式回复/);
assert.doesNotMatch(shell, /ha2-wb-page-status/);
assert.match(css, /\.ha2-wb-page\b/);
assert.match(read('src-tauri/src/workbuddy_local_llm.rs'), /chat_stream_poll/);
assert.match(read('src-tauri/src/workbuddy_local_llm.rs'), /remove\("reasoning_effort"\)/);
const wbWindow = read('src/js/features/now/workbuddy-local-chat-window.js');
assert.match(wbWindow, /OneToneModelGateway/);
assert.doesNotMatch(wbWindow, /cmd_workbuddy_local_chat_start/);
assert.match(
  read('src/js/features/now/workbuddy-local-chat-window.js'),
  /turns\s*=\s*loadTurns\(\)/
);
assert.match(
  read('src/js/features/now/workbuddy-local-chat-window.js'),
  /wb_local_chat_delta/
);
assert.match(read('src-tauri/src/workbuddy_local_llm.rs'), /wb_local_chat_delta/);
assert.doesNotMatch(
  read('src-tauri/src/workbuddy_local_llm.rs'),
  /workbuddy_local_chat:\/\//
);
assert.match(shell, /wbUsesLocalChat/);
assert.match(shell, /function gatewayChatEligible/);
assert.match(shell, /gatewayChatEligible\(snap\)/);
// Chat + Cursor/etc still uses gateway unless WorkBuddy「桌面」.
assert.match(
  shell,
  /kind === 'workbuddy' && wbSendModeOf\(snap\) === 'desktop'/
);
assert.doesNotMatch(
  shell,
  /function gatewayChatEligible[\s\S]{0,220}return !kind \|\| kind === 'workbuddy'/
);
assert.match(shell, /data-ha2-wb-mode/);
assert.match(shell, /data-ha2-wb-transcript/);
assert.match(shell, /WB_CHAT_KEY|onetone\.ha2\.wbChat/);
assert.match(shell, /appendWbChatTurn/);
assert.match(shell, /kind:\s*'local_chat'/);
assert.match(shell, /outcome:\s*'local_replied'/);
assert.match(shell, /empty_model_content/);
// Freemodel (non-WB) route: empty reply is a hard fail, not a silent blank bubble.
assert.match(shell, /if \(!reply\) throw new Error\('empty_model_content'\)/);
assert.match(shell, /iam_confirm_required\|raccoon_relogin\|auth_failed/);
assert.match(shell, /ha2PillLocalChat/);
assert.match(shell, /wbMessagesForApi\(snapCtx\)|wbMessagesForApi\(snap/);
assert.match(shell, /wbLocalSystemContent|buildLocalChatSystemPrompt/);
assert.match(shell, /role:\s*'system'/);
assert.doesNotMatch(shell, /archiveOnSuccess\([\s\S]{0,80}sendWbLocal|sendWbLocal[\s\S]{0,120}archiveOnSuccess/);
// Streaming chat window asset exists.
assert.match(
  read('src/workbuddy-local-chat.html'),
  /workbuddy-local-chat-window\.js|data-wb-local-chat/
);
assert.match(read('src/js/features/now/workbuddy-local-chat-window.js'), /wb_local_chat_delta/);
assert.match(css, /\.ha2-wb-transcript\b/);
assert.match(css, /\.ha2-wb-mode-btn\b/);
// Compose rail: Agent+model inside card; caps in overflow.
// Aim+Agent strip only in 投递 (edit); 提问 omits both.
assert.match(
  shell,
  /ha2-compose-rail[\s\S]*ha2-agent-fuse[\s\S]*data-ha2-send/
);
assert.match(shell, /function askModeOn|askModeOn\(snap\)/);
assert.match(shell, /clearAskModeTargetChrome/);
assert.match(
  shell,
  /var askMode = askModeOn\(snap\)[\s\S]{0,200}askMode[\s\S]{0,80}\?[\s\S]{0,40}''[\s\S]{0,40}:[\s\S]{0,40}agentStripHtml/
);
assert.match(shell, /aimChipHtml\(!!hasAim\)[\s\S]{0,400}agentIcoBtnHtml/);
assert.match(shell, /ha2-compose-overflow[\s\S]*ha2-channel-caps/);
assert.match(shell, /function lucide\(|data-lucide=/);
assert.match(shell, /plus|paperclip|arrow-up|ellipsis|infinity/);
assert.match(shell, /data-ha2-mat="url"/);
assert.match(shell, /data-ha2-mat="folder"/);
assert.match(shell, /lucide\('plus'/);
assert.doesNotMatch(shell, /ha2-agent-caps/);
assert.match(shell, /draftRemember/);
assert.match(dockSrc, /listComposerHistory/);
assert.match(dockSrc, /restoreComposerHistory/);
assert.match(dockSrc, /archiveOnSuccess\(kind,\s*opts\)|opts\.body/);
assert.doesNotMatch(shell, /data-ha2-soft-chip|data-ha2-saved-chip/);
assert.doesNotMatch(shell, /data-ha2-quick/);
assert.match(css, /\.ha2-aim-chip\.is-off|\.ha2-aim-chip\.is-ok/);
assert.match(css, /\.ha2-agent-fuse/);
assert.match(css, /\.ha2-agent-pick/);
assert.match(css, /\.ha2-agent-fused/);
assert.match(css, /\.ha2-agent-flyout/);
assert.match(css, /\.ha2-agent-ico/);
assert.match(css, /\.ha2-compose > \.ha2-agent-flyout/);
assert.doesNotMatch(css, /\.ha2-agent-strip\{[^}]*overflow-x:\s*auto/);
assert.match(shell, /ha2-agent-fused|agentStripHtml\(snap/);
assert.match(shell, /agentFlyoutHtml|data-ha2-agent-flyout/);
assert.match(shell, /data-ot-tip-prefer/);
assert.match(read('src/js/core/hover-tip.js'), /data-ot-tip-prefer.*above|preferAbove/);
assert.match(read('src/js/features/now/home-agent-v2-store.js'), /cursor\.svg/);
// Top-right menu = vertical list; compose uses inline strip (no dock popup).
assert.match(shell, /data-ha2-menu-picker/);
assert.match(shell, /ha2-picker-list|is-menu/);
assert.match(shell, /pickerSurface === 'menu'|pickerSurface = 'menu'|openPickerSurface\('menu'/);
assert.match(shell, /data-ha2-pick-follow|ha2FollowRecogn|跟随识别/);
assert.match(shell, /sendMenuLabel|发送/);
assert.match(css, /\.ha2-picker-list|\.ha2-picker-row/);
assert.match(css, /\.ha2-picker\.is-menu/);
assert.match(css, /backdrop-filter:\s*blur/);
assert.match(css, /html\[data-theme="dark"\]\s*\.ha2-picker\.is-menu/);
assert.match(css, /\.ha2-picker-row-ico img[^}]*object-fit:\s*contain/);
// Mat menu dismiss: outside click + Escape. Dock agent strip needs no popup dismiss.
assert.match(shell, /onDocPointerDown|onDocKeyDown/);
assert.match(shell, /closePickerSurface/);
assert.match(shell, /closeMatMenu/);
// File covers images — no separate「图片」row.
assert.doesNotMatch(shell, /function matMenuHtml[\s\S]*data-ha2-mat="image"/);
assert.match(shell, /data-ha2-mat="file"/);
assert.match(shell, /data-ha2-mat="paste"/);
assert.match(dockSrc, /function pasteFromClipboard/);
// Image ingest errors must not fall through to text clipboard fallback.
assert.match(dockSrc, /pasteImageBlob|Image ingest errors must NOT/);
assert.doesNotMatch(
  dockSrc,
  /\.read\(\)[\s\S]*?\.then\(function \(items\)[\s\S]*?\.catch\(function \(\) \{\s*if \(clip && typeof clip\.readText/
);
assert.match(dockSrc, /updateMaterialContent/);
assert.match(dockSrc, /previewDataUrl:\s*isImg/);
assert.match(dockSrc, /pasteTextAsMaterial/);
assert.match(dockSrc, /pasteImageFromNative|cmd_clipboard_read_image/);
assert.match(shell, /pasteImageFromNative/);
assert.match(shell, /draftWantsImagePaste|addEventListener\('paste',\s*onPaste,\s*true\)/);
{
  const ipcToml = fs.readFileSync('src-tauri/permissions/app-ipc.toml', 'utf8');
  assert.match(ipcToml, /allow-cmd-tray-inbox-write/);
  assert.match(ipcToml, /allow-cmd-clipboard-read-image/);
}
assert.match(shell, /ha2-mat-card|materialCardHtml/);
assert.match(shell, /data-ha2-mat-text/);
assert.match(shell, /ha2-mat-card-close/);
assert.match(shell, /shouldPasteAsTextCard|pasteTextAsMaterial/);
assert.match(shell, /matTextExpanded|data-ha2-mat-expand|data-ha2-mat-collapse/);
assert.match(shell, /expandMatText|collapseMatText|maybeExpandLongMat|isLongMatText/);
assert.match(shell, /htmlToPlainMultiline|clipboardPlainText|rebuildAttachments/);
assert.match(shell, /matCollapseGuardUntil|onMatTogglePointerDown|ha2-mat-toggle/);
assert.match(shell, /ha2-mat-preview|is-text-open|ha2MatExpand|ha2MatCollapse/);
assert.match(css, /\.ha2-mat-toggle/);
assert.match(css, /\.ha2-mat-card\b/);
assert.match(css, /\.ha2-mat-card--thumb/);
assert.match(css, /\.ha2-mat-thumbs/);
assert.match(css, /\.ha2-mat-card-close/);
assert.match(css, /\.ha2-mat-preview|\.ha2-mat-card-text\.is-open|is-text-open/);
assert.match(shell, /ha2-mat-card--thumb|ha2-mat-thumbs/);
assert.match(storeSrc, /syncMaterialsFromPrep[\s\S]*emit/);
assert.match(storeSrc, /clearSelected/);
assert.match(storeSrc, /Unknown → null|return null/);
assert.doesNotMatch(storeSrc, /function canonical\(raw\)[\s\S]*return'codex'/);
assert.match(storeSrc, /state\.selectedKind = null/);

assert.match(triadSrc, /OneToneHomeFocusTriad/);
assert.match(triadSrc, /composerHtml/);
assert.match(triadSrc, /agentGridHtml/);
assert.match(triadSrc, /aimMemoryHtml/);
assert.match(focusView, /OneToneHomeFocusTriad/);
// Mac IA: scroll = situation + rows; draft only in Dock (no Mid Focus composer).
assert.doesNotMatch(shell, /midComposerHtml|data-ha2-mid-draft|data-ha2-mid>/);
assert.match(shell, /permissionHtml|ha2-permission/);
assert.match(shell, /homeContentHtml[\s\S]*situationHtml[\s\S]*ha2-list/);
assert.match(shell, /ha2-compose[\s\S]*data-ha2-draft/);
// Consult above draft; host patched each paint; dock height reserves main pad.
assert.match(shell, /data-ha2-consult-host[\s\S]*ha2-compose[\s\S]*data-ha2-draft/);
assert.match(shell, /syncDockReserve|ha2-dock-reserve/);
assert.match(shell, /consultHost\.innerHTML = consultStripHtml/);
assert.match(css, /--ha2-dock-reserve/);
assert.match(css, /\.ha2-dock\{[\s\S]*max-height/);
assert.match(shell, /classifyActionResult/);
assert.match(shell, /verified_paste|AttemptedUnverified|ha2AttemptedUnverified/);
assert.match(shell, /compositionstart|onCompositionStart/);
assert.match(shell, /syncDraftMirrors/);
assert.match(shell, /function stashLiveComposeDrafts/);
assert.match(shell, /wbPageDraftText/);
assert.match(shell, /stashLiveComposeDrafts:\s*stashLiveComposeDrafts/);
assert.match(
  now,
  /liveComposeHost/,
  'now-home Focus remount preserves compose host (draft focus)'
);
assert.match(now, /composeSlot\.replaceWith\(liveComposeHost\)/);
assert.match(
  shell,
  /!next && String\(nodes\[i\]\.value \|\| ''\)\) continue/
);

assert.match(dockSrc, /OneToneHomeDockBridge/);
assert.match(dockSrc, /configOn/);
assert.match(dockSrc, /runtimeReady/);
assert.match(dockSrc, /cmd_soft_pad_force_open/);
assert.match(dockSrc, /cmd_voice_command_session_toggle/);
assert.match(dockSrc, /ot:runtime-event/);
assert.match(dockSrc, /ensureOralVoiceEngine|switchListeningStrategy\('auto'/);
assert.doesNotMatch(dockSrc, /homeToggleVoiceWake/);

assert.match(shell, /OneToneHomeAgentV2Store/);
assert.match(shell, /cmd_agent_center_action/);
assert.match(shell, /situationHtml|data-ha2-situation/);
assert.match(shell, /ha2-pulse|data-ha2-pulse/);
assert.match(shell, /pillsHtml|data-ha2-pills/);
assert.match(shell, /approveHtml|data-ha2-approve/);
assert.match(shell, /ha2GoHandle|前往处理/);
assert.match(shell, /isWaitingForUserStatus|needs\|waiting\|approval\|needsinput/);
assert.doesNotMatch(
  shell,
  /function approvalTarget[\s\S]{0,400}can\([^)]*approval\.approve/
);
assert.match(shell, /ha2OpenProjectTimeline|打开项目时间线/);
assert.match(shell, /resolveHomeTimelineWorkspace|targetContext\.projectPath/);
assert.match(shell, /整理并交接任务|data-ha2-handoff/);
assert.match(shell, /data-ha2-organize|整理任务/);
// 「整理」only after + materials (not idle empty compose).
assert.match(shell, /orgBtn\.hidden\s*=\s*atrEdit\s*\|\|\s*\(!running\s*&&\s*!hasMats\)/);
assert.match(shell, /subscribeMaterials/);
// Dock no longer keeps permanent 工程材料 / 密钥 / 计量额度 — need-driven notice CTAs only.
assert.doesNotMatch(shell, /ha2-metered-toggle|ha2AddProjectMaterialsManual/);
assert.doesNotMatch(
  shell,
  /data-ha2-work-secondary[\s\S]{0,120}data-ha2-assist-keys|data-ha2-work-secondary data-ha2-pcx/
);
assert.doesNotMatch(shell, /<input[^>]*data-ha2-allow-metered/);
assert.match(shell, /data-ha2-assist-keys|data-ha2-enable-metered/);
assert.match(shell, /允许计量/);
assert.match(shell, /formatFailureNotice|runOrganizeTask|OneToneHomeAssistClient/);
assert.match(shell, /syncComposeDraftIntoPrep|setDraftBody[\s\S]{0,80}force:\s*true/);
assert.match(shell, /ha2OrganizeNeedDraft|先写一句或加入材料/);
assert.match(shell, /snapshotId/);
assert.doesNotMatch(shell, /t\('ha2OrganizeFailed',\s*'整理失败'\)/);
assert.match(shell, /已填入草稿/);
assert.doesNotMatch(shell, /已开始编码/);
assert.match(css, /\.ha2-session-chrome|\.ha2-mode-btn|\.ha2-handoff/);
assert.match(css, /\.ha2-task-core|\.ha2-work-confirm|\.ha2-home-notice/);
assert.match(css, /\.ha2-send\.is-labeled|\.ha2-work-secondary/);
assert.match(shell, /syncModeChrome|taskCoreHtml|workConfirmGateHtml/);
assert.match(shell, /atrSelectedProviderEditCapable|atrPageNoticeHtml|ha2WorkStartCta/);
assert.match(shell, /ha2AtrVerifySilent|首次编辑：正在后台验证引擎/);
assert.match(shell, /permissionMode:\s*'write_autonomous'/);
assert.match(shell, /atrUserStepLine|degradedNextHint|atrFailureNextHint/);
// Work confirm: forcePage opt; embed must not set atrWbPageForced.
assert.match(shell, /function openWorkConfirm\(goal, matSum, opts\)/);
assert.match(shell, /opts\.forcePage === true/);
assert.match(shell, /forcePage:\s*!embedMode/);
assert.match(shell, /atrWbPageForced = false/);
assert.match(shell, /function patchFocusNotice/);
assert.match(shell, /patchDockMeta\(snap\);\s*\n\s*patchFocusNotice\(snap\)/);
assert.match(focusView, /data-hf-home-notice/);
// Home card dedup: confirm hides taskCore; model mutex; single notice; trim mode copy.
assert.match(shell, /if \(workConfirmOpen\) return ''/);
assert.match(shell, /atrLive[\s\S]{0,80}pillsHtml|taskCoreHtml\(snap\) \+ pillsHtml/);
assert.match(shell, /function modelRouteSelectHtml|data-ha2-model-route-host/);
// Mixed model picker: WB models + API providers + add (custom dropdown with brand icons).
assert.match(shell, /wb:|api:|__add__/);
assert.match(shell, /ha2ModelTagWb|ha2ModelTagApi|ha2ModelAddProvider/);
// Empty model list: primary CTA opens provider sheet.
assert.match(shell, /modelListEmpty[\s\S]*data-ha2-open-model-providers|ha2ModelOpenProviders/);
assert.match(shell, /ha2-model-empty-cta/);
assert.match(css, /\.ha2-model-empty-cta/);
assert.match(now, /kind === 'go_handle'|go_handle/);
assert.match(shell, /modelBrandMeta|data-ha2-model-route-trigger|icons\/model-brand\//);
assert.match(shell, /applyModelRouteSelection|data-ha2-model-route-opt/);
assert.match(shell, /positionModelRouteMenu|fixed/);
assert.match(shell, /space\[-_\\s\]\?bunny|太空兔|space-bunny\.png/);
assert.doesNotMatch(shell, /· WB/);
assert.ok(
  fs.existsSync('src/icons/model-brand/space-bunny.png'),
  'space-bunny brand icon missing'
);
assert.match(css, /\.ha2-model-dd-trigger|\.ha2-model-dd-menu/);
assert.match(css, /\.ha2-model-dd-search|\.ha2-model-dd-list|scrollbar-width:\s*thin/);
assert.match(css, /\.ha2-model-dd-tag|\.ha2-model-dd-rate|\.ha2-model-dd-speed/);
assert.match(shell, /modelRouteOfferMeta|data-ha2-model-route-search|filterModelRouteMenu/);
assert.match(shell, /modelRouteApiLaneKey|modelRouteApiPreferScore|paidByLane/);
assert.match(shell, /minimax-cn-openai[\s\S]*无余额|Chat API Key 无平台余额接口/);
assert.match(shell, /限时免费|夜间折扣|订阅优先|0\.00x/);
{
  // Lane collapse: legacy MiniMax CN + minimax-cn-openai share one CN bucket.
  const laneFn = shell.match(
    /function modelRouteApiLaneKey\(id, label\) \{([\s\S]*?)\n  \}/
  );
  assert.ok(laneFn, 'modelRouteApiLaneKey present');
  assert.match(laneFn[0], /minimax-cn/);
  assert.match(laneFn[0], /minimax-io/);
}
assert.doesNotMatch(shell, /ha2-fm-wb-models|freemodelEliminatedHtml|ha2FmElimTitle/);
assert.match(shell, /ha2ModelTagSoftPad|data-fm-subtabs|data-fm-tab|ha2-fm-connect|开通免费模型/);
assert.match(shell, /ha2-fm-ico|ha2FmTabFree|data-fm-paid-keys|data-fm-pane/);
assert.match(shell, /ha2ModelProviderFuseHint|startWbFreemodelLoginFromDock/);
assert.match(shell, /setTab\('paid'\)|softPadFocus/);
assert.match(shell, /customApiPresets|OneToneCustomApiPresets|data-custom-prov|ha2-fm-prov-trigger/);
assert.match(shell, /resolveCustomApi|applyCustomProv|data-custom-prov-search|filterCustomProv/);
assert.match(shell, /ha2FmCustomSavedBadge|data-custom-saved|fetchCustomModels|cmd_model_provider_list_models/);
assert.match(shell, /ha2FmTabSoftPad|Soft Pad 能力|softPadCapsHtml|余额可见|ATR 可驱动/);
assert.match(shell, /ha2-softpad-key-row|ha2-softpad-key-link|拿 Key|saveSoftPadKey|粘贴即自动保存/);
assert.doesNotMatch(shell, /data-softpad-save/);
assert.match(css, /\.ha2-softpad-key-row|\.ha2-softpad-key-input|\.ha2-softpad-key-link/);
assert.match(shell, /ha2FmCustomMinimaxKeyNote|Coding Plan Key|seedModelsForProv|MiniMax-M3\.1-Flash/);
assert.match(shell, /brand: 'MiniMax'|minimax\.png/);
assert.doesNotMatch(shell, /minimax\|hailuo\|海螺\|abab/);
assert.match(css, /\.ha2-softpad-key-row|\.ha2-softpad-key-input/);
{
  const presetsSrc = read('src/js/features/now/custom-api-presets.js');
  assert.match(presetsSrc, /minimax-cn-openai[\s\S]*minimax\.png/);
  assert.match(presetsSrc, /MiniMax-M3\.1-Flash/);
  assert.ok(fs.existsSync('src/icons/model-brand/minimax.png'), 'minimax brand icon');
  const modelLists = (presetsSrc.match(/"models":\s*\[/g) || []).length;
  assert.ok(modelLists >= 100, 'most presets should ship models[] seed: ' + modelLists);
}
assert.doesNotMatch(shell, /name="purpose"|默认用途/);
assert.doesNotMatch(shell, /ha2FmSiteOnlyTitle|官网额度/);
assert.doesNotMatch(shell, /data-fm-more|ha2FmMore/);
assert.match(css, /\.ha2-fm-prov-trigger|\.ha2-fm-prov-menu|\.ha2-fm-prov-search|\.ha2-fm-prov-saved|\.ha2-fm-caps/);
{
  const presetsSrc = read('src/js/features/now/custom-api-presets.js');
  assert.match(html, /custom-api-presets\.js/);
  assert.match(presetsSrc, /OneToneCustomApiPresets/);
  assert.match(presetsSrc, /above\.dev|AgentRouter|DeepSeek|OpenAI/);
  const presetCount = (presetsSrc.match(/"baseUrl":/g) || []).length;
  assert.ok(presetCount >= 100, 'custom api presets too few: ' + presetCount);
}
{
  const mp = fs.readFileSync('src-tauri/src/model_provider.rs', 'utf8');
  assert.match(mp, /fn list_models|pub fn list_models/);
  const ipcToml = fs.readFileSync('src-tauri/permissions/app-ipc.toml', 'utf8');
  assert.match(ipcToml, /allow-cmd-model-provider-list-models/);
}
assert.doesNotMatch(
  shell,
  /cap\.state === 'ready' && ch\.id !== 'workbuddy' \? ' disabled'/
);
// Soft Pad paid keys live on their own subtab (not freemodel primary).
assert.match(shell, /SOFTPAD_FREEMODEL_CATALOG|refreshSoftPadFreemodelKeys/);
assert.match(shell, /sp:|data-softpad-save|cmd_soft_pad_provider_key_set/);
assert.match(shell, /onetone\.softpadPreferredProvider|preferredProvider/);
assert.match(css, /\.ha2-softpad-key-card/);
// P0–P2 freemodel check-in hub.
const freemodelSrc = read('src/js/features/now/freemodel-channels.js');
assert.match(html, /freemodel-channels\.js/);
assert.match(html, /model-gateway\.js[\s\S]*freemodel-channels\.js[\s\S]*home-agent-v2\.js/);
assert.match(freemodelSrc, /OneToneFreemodelChannels/);
assert.match(freemodelSrc, /authKind:\s*'oauth'/);
assert.match(freemodelSrc, /tokenCapture:\s*'oauth_poll'/);
assert.match(freemodelSrc, /connectKind:\s*'oauth'/);
assert.match(freemodelSrc, /checkInAllDue|dueCount|markChecked/);
assert.match(freemodelSrc, /id:\s*'workbuddy'/);
assert.match(freemodelSrc, /id:\s*'opencode_zen'/);
assert.match(freemodelSrc, /id:\s*'gemini_ca'/);
assert.match(freemodelSrc, /softpad_paid_keys[\s\S]*eliminated/);
assert.match(freemodelSrc, /muse_spark[\s\S]*eliminated/);
assert.match(freemodelSrc, /sensenova[\s\S]*eliminated/);
assert.match(freemodelSrc, /action:\s*'oauth'/);
assert.match(shell, /freemodelCheckinCardsHtml|runFreemodelCheckin|chatCapable/);
assert.match(shell, /开通免费模型/);
assert.doesNotMatch(shell, /登录后免费模型/);
assert.doesNotMatch(shell, /免费额度签到/);
assert.match(shell, /startFreemodelOauthById|startOpencodeZenOauth|cmd_opencode_zen_oauth_start/);
assert.match(shell, /startRaccoonOauth|cmd_raccoon_oauth_start|data-loomy-sms-send|cmd_loomy_sms_login/);
assert.match(shell, /data-raccoon-qr-host|showRaccoonQr|OneToneRaccoonQr/);
assert.match(shell, /请用微信扫一扫|不要用浏览器打开/);
assert.ok(fs.existsSync('src/js/features/now/raccoon-qr.js'), 'raccoon qr svg helper');
assert.match(html, /raccoon-qr\.js/);
{
  const raccoonRs = fs.readFileSync('src-tauri/src/raccoon_oauth.rs', 'utf8');
  assert.match(raccoonRs, /WeChat QR|QR payload|不要|Do NOT open/);
  assert.match(raccoonRs, /\/api\/iam\/v1\/auth\/mp\/qrcode/);
  assert.match(raccoonRs, /source=platform/);
  assert.doesNotMatch(raccoonRs, /AUTH_PREFIX\}\/login_with_qrcode_code|\/api\/web\/auth\/v1\/login_with_qrcode_code/);
  assert.doesNotMatch(
    raccoonRs,
    /let _ = open_system_browser\(&auth_url\)/
  );
}
{
  const ipcToml = fs.readFileSync('src-tauri/permissions/app-ipc.toml', 'utf8');
  assert.match(ipcToml, /allow-cmd-opencode-zen-oauth-start/);
  assert.match(ipcToml, /allow-cmd-opencode-zen-oauth-poll/);
  assert.match(ipcToml, /allow-cmd-opencode-zen-oauth-cancel/);
  assert.match(ipcToml, /allow-cmd-loomy-sms-send/);
  assert.match(ipcToml, /allow-cmd-loomy-sms-login/);
  assert.match(ipcToml, /allow-cmd-raccoon-oauth-start/);
  assert.match(ipcToml, /allow-cmd-raccoon-oauth-poll/);
  assert.match(ipcToml, /allow-cmd-raccoon-oauth-cancel/);
  assert.ok(
    fs.existsSync('src-tauri/permissions/autogenerated/cmd_opencode_zen_oauth_start.toml'),
    'opencode oauth start permission file'
  );
  assert.ok(
    fs.existsSync('src-tauri/permissions/autogenerated/cmd_loomy_sms_send.toml'),
    'loomy sms permission file'
  );
  assert.ok(
    fs.existsSync('src-tauri/permissions/autogenerated/cmd_raccoon_oauth_start.toml'),
    'raccoon oauth permission file'
  );
}
assert.match(shell, /upsertFreemodelProvider|afterFreemodelProviderReady|data-fm-paste-save/);
assert.match(shell, /data-fm-paste-reveal|填写 API Key/);
assert.doesNotMatch(shell, /data-fm-anon|先用匿名 free/);
// Picker: ready-only options; unconfigured channels are NOT select options.
assert.match(shell, /开通免费模型/);
assert.match(shell, /fmFocus|connectChannels|resolveCapability/);
assert.doesNotMatch(shell, /ha2ModelFreeNeedLogin|ha2ModelFreeNeedPaste/);
assert.doesNotMatch(shell, /ha2ModelTagFreeGroup/);
assert.match(freemodelSrc, /connectKind:\s*'one_tap'/);
assert.match(freemodelSrc, /connectOrder:\s*10/);
assert.match(freemodelSrc, /connectKind:\s*'oauth'/);
assert.match(freemodelSrc, /connectChannels|resolveCapability|setConnectState/);
assert.match(freemodelSrc, /loginUrl:\s*'https:\/\/opencode\.ai\/console\/device'/);
assert.doesNotMatch(freemodelSrc, /loginUrl:\s*'[^']*\/console\/console\//);
// OAuth action must dispatch by channel id — not hardcode WorkBuddy only.
assert.match(shell, /action === 'oauth'[\s\S]{0,400}startFreemodelOauthById/);
assert.match(shell, /action === 'one_tap'|一键启用/);
assert.match(shell, /ha2FmLoginWaiting|setFmLoginStatus|api\.checkIn\(id\)/);
assert.doesNotMatch(shell, /openFreemodelSite\(ch\)/);
assert.match(freemodelSrc, /antigravity\.google\.com|loomy\.xunfei\.cn|portal#\/login/);
assert.match(freemodelSrc, /qoder\.com\.cn\/users\/sign-in/);
assert.match(freemodelSrc, /e\.status === 'ok'/);
assert.match(shell, /ha2FmZenCodeHint|验证码|Unable to verify|verification_uri_complete/);
assert.doesNotMatch(shell, /data-fm-open-site[\s\S]{0,80}target="_blank"/);
assert.doesNotMatch(shell, /P1 · 每日签到|ha2FmP1/);
assert.match(freemodelSrc, /Loomy（讯飞|Raccoon（商汤/);
assert.match(freemodelSrc, /loomyad\.xunfei\.cn|xiaohuanxiong\.com\/api\/web\/llm/);
assert.match(freemodelSrc, /filter\.siteOnly|siteOnly: true/);
assert.match(freemodelSrc, /id:\s*'raccoon'/);
assert.match(freemodelSrc, /id:\s*'loomy'/);
assert.match(freemodelSrc, /defaultModel:\s*'spark-x'/);
assert.match(freemodelSrc, /sn-sensenova-6-8-flash-lite/);
// WB tristate + capability status (not checkedToday as primary card state).
assert.match(shell, /wbPhase|logged_out|no_models|已登录但未导入|未登录/);
assert.match(shell, /unconfigured|connecting|ready|resolveCapability/);
assert.match(shell, /markChecked\('workbuddy'/);
assert.match(css, /\.ha2-fm-card|\.ha2-fm-connect/);
// Home freemodel login: chat-mode strip + dock 登录/换号 (not ATR-only).
assert.match(shell, /function atrWbLoginShouldShow/);
assert.match(shell, /wbRouteIsActive\(\) && !wbLocalReady\(\)/);
assert.match(shell, /wbLocalCache == null\) return false/);
assert.match(shell, /atrWbLoginChatDismissed/);
assert.match(shell, /needs_setup[\s\S]{0,80}return \{ html: '', kind: null \}/);
assert.doesNotMatch(
  shell,
  /function atrWbLoginShouldShow[\s\S]{0,120}if \(!atrEditPathOn\(snap\)\) return false/
);
assert.match(shell, /data-ha2-wb-login-cta|wbAccountChipHtml|startWbFreemodelLoginFromDock/);
assert.match(shell, /ha2WbFreemodelLoginOk|setRoute\(p, 'workbuddy'\)/);
assert.match(shell, /data-ha2-wb-account-host/);
assert.match(css, /\.ha2-wb-account-cta|\.ha2-wb-account-host/);
// No top-left「首页」on home; plan/doc titles go on agent cards.
assert.match(shell, /top\.hidden = true/);
assert.match(shell, /fgDocHintForKind|ha2-ctx-app/);
assert.match(shell, /currentHabitMatchedApps/);
assert.doesNotMatch(shell, /ha2-ctx-matched/);
assert.doesNotMatch(shell, /data-ha2-send-scope-hint/);
assert.doesNotMatch(shell, /ha2-ctx-fg|ha2HabitChip/);
assert.match(css, /\.ha2-ctx-app|\.ha2-top\[hidden\]/);
assert.match(shell, /ha2-mode-row--tabs/);
assert.match(shell, /workspaceResumeRowHtml|data-ha2-resume-row/);
assert.match(shell, /atrProvHost\.hidden = !atrEdit/);
assert.match(css, /\.ha2-mode-row--tabs|\.ha2-resume-row/);
assert.doesNotMatch(shell, /ha2-mode-boundary|data-ha2-mode-boundary/);
assert.doesNotMatch(shell, /ha2RoleWork|ha2RoleChat/);
assert.match(shell, /开始执行|批准并执行|批准补丁写入/);
assert.match(shell, /data-ha2-work-secondary|data-ha2-work-confirm/);
assert.match(storeSrc, /provider_not_edit_capable/);
assert.match(
  storeSrc,
  /edit_not_admitted' \|\| code === 'provider_not_edit_capable/
);
{
  const ipcToml = fs.readFileSync('src-tauri/permissions/app-ipc.toml', 'utf8');
  assert.match(ipcToml, /allow-cmd-agent-task-ensure-verify-sandbox/);
  assert.match(ipcToml, /allow-cmd-agent-task-evaluate-verify/);
}
assert.match(shell, /write_with_approval/);
assert.match(shell, /data-ha2-go-agent/);
assert.match(shell, /ha2-row-main/);
assert.match(shell, /workspaceTitleChipHtml|data-ha2-ws-chip/);
assert.match(shell, /completionObservationHtml|检测到 Agent 报告完成状态/);
assert.match(shell, /setDeliveryReceipt|setActionReceipt|setValidationNotice/);
assert.match(shell, /projectHint:\s*ctx\.projectPath|projectHint:\s*hint/);
assert.doesNotMatch(shell, /projectHint:\s*null/);
assert.doesNotMatch(shell, /ha2PillSent/);
assert.doesNotMatch(shell, /t\('ha2PillSent'|「已投递」|'已投递'/);
assert.doesNotMatch(shell, /t\('[^']*',\s*'已发送'\)|'已发送到'|phase:\s*'sent'/);
assert.match(shell, /aria-live="polite"/);
assert.match(shell, /data-ha2-home-notice[\s\S]*aria-live/);
assert.match(shell, /function homeNoticeHtml/);
assert.match(shell, /ha2-row-tag|data-evidence/);
assert.doesNotMatch(
  shell,
  /cta === 'send'[\s\S]{0,220}ha2SendHere/
);
assert.doesNotMatch(shell, /rowHtml[\s\S]{0,800}windowsLabel/);
assert.match(storeSrc, /resolveTargetContext|buildSessionCards/);
assert.match(storeSrc, /primaryCta:\s*'navigate'|return 'navigate'/);
assert.match(storeSrc, /setDeliveryReceipt|setActionReceipt|setValidationNotice/);
assert.match(storeSrc, /isBannedNarration|UNKNOWN_PROMPT_SUMMARY|isEligible/);
assert.match(storeSrc, /evidenceTier/);
assert.match(storeSrc, /deskSupplementRows|mergeWorkRowMaps/);
assert.match(storeSrc, /enrichFromHomeSnapshot|cmd_agent_home_snapshot/);
assert.doesNotMatch(storeSrc, /\|\| '最近工作'/);
assert.doesNotMatch(storeSrc, /\|\| '查看最近工作'/);
assert.match(workbench, /getPrimaryAlertModel|handleAlertAction/);
assert.match(now, /openHabitHub:\s*openHabitHub|openHabitHub: openHabitHub/);
assert.match(now, /OneToneProjectPath/);
assert.match(css, /\.ha2-situation|\.ha2-task-title|\.ha2-pulse-chip/);
assert.match(css, /\.ha2-section-head|\.ha2-row-tag|\.ha2-when/);
assert.match(css, /\.ha2-row-main:focus-visible/);
assert.match(css, /\.ha2-atr-history-row \.ha2-row-main/);
assert.match(shell, /ha2-atr-history-row|workHistoryRowsHtml/);
assert.match(css, /--ha2-ok:\s*var\(--ot-success/);
const agentCenter = read('src/js/features/agent/agent-center.js');
assert.match(agentCenter, /OneToneAgentClientEffects|applyClientEffect:\s*applyClientEffect/);

// --- DTO fixture sandbox ---
const sandbox = { window: {}, console, Date, setTimeout, clearTimeout, setInterval, clearInterval };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.sessionStorage = {
  _m: {},
  getItem(k) {
    return this._m[k] != null ? this._m[k] : null;
  },
  setItem(k, v) {
    this._m[k] = String(v);
  },
  removeItem(k) {
    delete this._m[k];
  }
};
sandbox.localStorage = {
  _m: {},
  getItem(k) {
    return this._m[k] != null ? this._m[k] : null;
  },
  setItem(k, v) {
    this._m[k] = String(v);
  },
  removeItem(k) {
    delete this._m[k];
  }
};
const pathSrc = read('src/js/core/project-path.js');
vm.createContext(sandbox);
vm.runInContext(pathSrc, sandbox, { filename: 'project-path.js' });
vm.runInContext(triadSrc, sandbox, { filename: 'home-focus-triad.js' });
vm.runInContext(capsSrc, sandbox, { filename: 'home-agent-capabilities.js' });
vm.runInContext(storeSrc, sandbox, { filename: 'home-agent-v2-store.js' });

const Store = sandbox.OneToneHomeAgentV2Store;
const Caps = sandbox.OneToneHomeAgentCapabilities;
const Triad = sandbox.OneToneHomeFocusTriad;
const PP = sandbox.OneToneProjectPath;
assert.ok(Store && Store.__testOnly, 'store exports __testOnly');
assert.ok(Caps && Caps.projectSession, 'capabilities module loaded');
assert.ok(Triad && Triad.composerHtml && Triad.agentGridHtml);
assert.ok(PP && PP.normalizeAbsolutePath);
assert.equal(
  Caps.looksLikeWorkspaceEditGoal('根据最新的情况更新一个readme2的文档，说明更新内容，并发到桌面'),
  true
);
assert.equal(Caps.looksLikeWorkspaceEditGoal('这个方案怎么看？'), false);
assert.equal(Caps.looksLikeWorkspaceEditGoal('今天天气'), false);
assert.equal(Caps.looksLikeWorkspaceEditGoal('没有补充'), false);
assert.equal(Caps.looksLikeWeatherAsk('今天天气'), true);
var promptChat = Caps.buildLocalChatSystemPrompt({ workMode: 'think', projectPath: 'E:/x' });
assert.match(promptChat, /对话模式/);
assert.match(promptChat, /禁止把|自己用工具查/);
assert.match(promptChat, /回复语气：/);
assert.match(promptChat, /轻量 Markdown/);
assert.doesNotMatch(promptChat, /请用户点顶部|后再发目标/);
var promptWork = Caps.buildLocalChatSystemPrompt({ workMode: 'edit', projectPath: 'E:/x' });
assert.match(promptWork, /已在「工作」/);
assert.match(promptWork, /禁止再说/);
assert.match(promptWork, /回复语气：/);
assert.equal(Caps.normalizeChatReplyTone('concise'), 'concise');
assert.equal(Caps.normalizeChatReplyTone('weird'), 'natural');
assert.match(Caps.chatReplyToneHint('colleague'), /同事口吻/);
assert.match(Caps.withChatReplyToneMaterials('user: hi', 'natural'), /^reply_tone:/);
assert.match(shell, /onetone\.chat\.replyTone|REPLY_TONE_KEY/);
assert.match(shell, /data-ha2-reply-tone|replyToneSegmentHtml/);
assert.match(shell, /withChatReplyToneMaterials/);
// Work-mode send must not regex-kick to chat.
assert.doesNotMatch(
  shell,
  /if\s*\(\s*!looksLikeEditGoalText\(text\)\s*\)\s*\{[\s\S]*?routeToChatInsteadOfEdit/
);
assert.match(shell, /looksLikeWeatherAsk/);
assert.equal(Caps.looksLikeWeatherAsk('这个方案怎么看'), false);
assert.equal(Caps.extractWeatherCity('今天北京天气'), '北京');
assert.equal(Caps.extractWeatherCity('今天天气'), '');
assert.equal(Caps.extractWeatherCity('今天天气怎么样？'), '');
assert.equal(Caps.isPlausibleWeatherCity('怎么样'), false);
assert.equal(Caps.looksLikeCityOnly('上海'), true);
assert.match(shell, /tryHandleWeatherLocal|cmd_weather_now|ha2WeatherAskCity/);
assert.match(shell, /dispatchEditModeSend|atrLooksLikeContinueInput/);
assert.match(shell, /function dispatchChatModeSend/);
assert.match(shell, /permissionMode:\s*'read_only'|permissionMode:\s*"read_only"/);
assert.match(shell, /syncChatLoopFromAtr|atrIsChatLoopTask/);
assert.match(shell, /ha2-wb-page-turn--tool|Needs input/);
assert.match(shell, /data-ha2-chat-needs-reply/);
assert.match(shell, /chatHistoryMaterialsSummary/);
assert.match(shell, /deliver_approval|waiting_deliver|data-ha2-chat-deliver-approve/);
assert.match(shell, /chatLoopHonestFailText|ha2ChatFormatFail|换引擎/);
assert.match(shell, /ha2ChatToolError|检索\/工具调用中断/);
assert.match(shell, /tool_error[\s\S]*driveActiveIfRunning/);
assert.match(storeSrc, /tool_error[\s\S]*driveActiveIfRunning\(\{\s*force:\s*true/);
assert.match(shell, /function stopWbLocalStream[\s\S]*?A\.cancel|OneToneHomeAgentTask[\s\S]*?cancel/);
assert.match(shell, /chatStopPendingId/);
assert.match(shell, /chatDriveAlive|isAtrDriveInFlight/);
assert.match(shell, /maybeHealChatDrive|driveActiveIfRunning\(\{\s*force:\s*true\s*\}\)/);
assert.match(shell, /maybeStallChatDrive|CHAT_STALL_MS|ha2ChatLoopStall|ha2ChatLoopWaitingModel/);
assert.match(shell, /chatLoopProgressText/);
assert.match(shell, /Never dump liveThinking|ha2ChatLoopThinking/);
// Persist thinking chip + tool_call sync + cancelled → 已停止 (not literal English).
assert.match(shell, /function upsertChatLoopProgressTurn[\s\S]*?id:\s*'think_'\s*\+\s*tid/);
assert.match(shell, /function finalizeChatLoopProgressTurn[\s\S]*?ha2ChatLoopStoppedStep|已停止（第/);
assert.match(shell, /kind === 'tool_call'[\s\S]*?id:\s*'toolcall_'\s*\+\s*eid[\s\S]*?kind:\s*'tool_step'/);
assert.match(
  shell,
  /function chatLoopHonestFailText[\s\S]*?code === 'cancelled'[\s\S]*?ha2WbChatCancelled[\s\S]*?已停止/
);
{
  // Pure-function self-check: cancelled mapping (mirrors chatLoopHonestFailText branch).
  function mapCancelled(code, fallback) {
    code = String(code || '');
    fallback = String(fallback || '');
    if (code === 'cancelled' || /^cancelled$/i.test(fallback)) {
      return '已停止';
    }
    return fallback || code;
  }
  assert.equal(mapCancelled('cancelled', ''), '已停止');
  assert.equal(mapCancelled('', 'cancelled'), '已停止');
  assert.equal(mapCancelled('', 'Cancelled'), '已停止');
  assert.doesNotMatch(mapCancelled('cancelled', 'cancelled'), /cancelled/i);
  // Source must wire sync + upsert so cancel mid-think still leaves a foldable step.
  assert.match(shell, /upsertChatLoopProgressTurn\(task\)/);
  assert.match(shell, /finalizeChatLoopProgressTurn/);
  assert.match(shell, /toolcall_/);
}
assert.match(shell, /chatShouldStartNewWhileWaiting/);
assert.match(
  shell,
  /chatShouldStartNewWhileWaiting\(text,\s*task\)[\s\S]{0,200}abandonAgentTask/
);
// 「我要开发小程序」is 7 CJK chars — must not be blocked by a length≤8 gate.
assert.doesNotMatch(
  shell,
  /function chatShouldStartNewWhileWaiting[\s\S]{0,220}t\.length\s*<=\s*8/
);
// Lone "?" while busy must not abandon mid-answer (「突然停止」).
assert.match(shell, /function looksLikeChatNudge/);
assert.match(
  shell,
  /chatAtrBusyPhase\(st\)[\s\S]{0,180}looksLikeChatNudge[\s\S]{0,220}ha2ChatWaitCurrent|正在回答上一问/
);
assert.match(shell, /CHAT_TURN0_REDRIVE_MS\s*=\s*12000/);
assert.match(
  shell,
  /quietMs\s*>=\s*CHAT_TURN0_REDRIVE_MS[\s\S]{0,280}driveActiveIfRunning/
);
// Terminal done/failed without synced finish event must still leave a bubble.
assert.match(shell, /ensureLatestChatFinish\(task,\s*snap\)/);
assert.match(shell, /err_status_'\s*\+\s*tid|err_status_\$\{/);
assert.match(
  shell,
  /nudgeRaw[\s\S]{0,200}resolveChatContinueGoal|looksLikeChatNudge\(text\)[\s\S]{0,280}chatPriorUserQuestion/
);
// Waiting clarify must paint under latest user — old needs_input must not block.
assert.match(
  shell,
  /function ensureChatNeedsInputFromAtr[\s\S]{0,480}latestUserHasChatReply\(\)/
);
assert.match(shell, /ha2-chat-needs-q/);
assert.doesNotMatch(
  shell,
  /function ensureChatNeedsInputFromAtr[\s\S]{0,280}kind === 'needs_input'\) return false/
);
// New send clears syncedEv while old done DTO lingers — must not replay Gate7 finish.
assert.match(
  shell,
  /paste the old Gate7 essay|String\(chatLoopTaskId \|\| ''\) !== tid[\s\S]{0,120}stBind === 'done'/
);
assert.match(shell, /quietMs\s*<\s*CHAT_STALL_MS/);
assert.match(shell, /abandoned\/i\.test\(cancelReason\)|reason === 'abandoned'|\/abandoned\/i/);
assert.match(storeSrc, /Stop poll before abandon|stopAtrPoll\(\);\s*\n\s*return A\.abandon/);
assert.match(shell, /kind === 'interrupted'|task_interrupted/);
assert.match(shell, /emitChatRecoveryTurn|ha2ChatLoopInterrupted|ha2ChatLoopDriveDropped/);
assert.match(storeSrc, /!isChatLaneTask\(dto\)[\s\S]{0,80}atr_driving|chat owns its own transcript/);
assert.match(
  shell,
  /abandon_start_failed[\s\S]{0,200}chat_conflict|vnCode === 'abandon_start_failed'/
);
assert.doesNotMatch(shell, /gatewayChatEligible\(snap\)[\s\S]{0,200}sendWbLocal\(draftRemember/);
// Chat needs_input is inline — atr-input prompt stays work-page only.
assert.match(shell, /data-ha2-chat-needs-input/);
assert.match(
  shell,
  /function wbToolStepHtml[\s\S]*?needs_input[\s\S]*?data-ha2-chat-needs-reply[\s\S]*?function wbChatTurnHtml/
);
assert.match(shell, /function chatLiveProjection/);
assert.match(shell, /raw\.indexOf\('answer\|'\)/);
assert.match(shell, /raw\.indexOf\('status\|'\)/);
assert.match(shell, /function settleStreamedChatAnswer/);
assert.match(shell, /settleStreamedChatAnswer\(tid, finId/);
assert.match(shell, /fin_' \+ \(tid \|\| eid\)/);
assert.match(shell, /function persistChatProcessTrace/);
assert.match(shell, /toolName: 'process_trace'/);
assert.match(shell, /persistChatProcessTrace\(tid, evs, 'done'\)/);
{
  const storeAsk = fs.readFileSync('src/js/features/now/home-agent-v2-store.js', 'utf8');
  assert.match(storeAsk, /ensureChatWorkspaceRoot|ensureChatScratch/);
  assert.match(storeAsk, /approveAgentDeliver|rejectAgentDeliver/);
  assert.match(storeAsk, /chatLane[\s\S]*?ensureChatWorkspaceRoot/);
  assert.match(
    storeAsk,
    /chatLane[\s\S]{0,600}abandonAgentTask|Chat Q&A must not trap/
  );
  assert.match(storeAsk, /chatLanePf[\s\S]{0,200}editCapable|Chat only needs chatReady/);
  assert.match(storeAsk, /function isAtrDriveInFlight/);
  // Idle ATR poll must not thrash emit/localStorage while waiting/done (WebView RSS).
  assert.match(storeAsk, /function atrTaskMirrorSig/);
  assert.match(
    storeAsk,
    /!isAgentTaskBusy\(st\) && !isAtrDriveInFlight\(state\.activeAgentTaskId\)/
  );
  assert.match(storeAsk, /atrPersistSig === before/);
  assert.match(storeAsk, /liveThinking \|\| dto\.live_thinking/);
  assert.match(
    storeAsk,
    /function ensureWorkController[\s\S]*?mode:\s*chatLane\s*\?\s*'chat'\s*:\s*'work'/
  );
  assert.match(
    storeAsk,
    /chatLane\s*\?\s*\[\s*'read_project',\s*'web',\s*'ask_user',\s*'deliver',\s*'model'\s*\]/
  );
  assert.match(shell, /chat_conflict|ha2ChatBlockedByWork|ha2ChatAbandonStartFail/);
  assert.match(shell, /atrLooksLikeContinueInput[\s\S]{0,400}priorQ|conflictGoal/);
  // Busy only when drive-in-flight — poll alone must not re-stick 「工具循环中」.
  assert.match(
    shell,
    /chatAtrBusyPhase\(st\)[\s\S]*?chatDriveAlive\(tid\)[\s\S]*?ha2ChatLoopBusy/
  );
  assert.match(shell, /chatStopPendingId[\s\S]*?never re-stick|Soft-stop/);
  // ensureWorkController remounts chat mode from read_only task.
  {
    const created = [];
    sandbox.OneToneWorkController = {
      create: function (opts) {
        created.push(opts);
        return {
          driveAtrUntilIdle: function () {
            return Promise.resolve({ ok: true });
          },
          confirmPlan: function () {},
          isPlanConfirmed: function () {
            return true;
          },
          bindAtrTask: function () {}
        };
      }
    };
    const st = Store.__testOnly.getState();
    st.workController = null;
    st.agentTask = {
      taskId: 'chat-t1',
      status: 'running',
      permissionMode: 'read_only',
      goal: 'who is x'
    };
    st.activeAgentTaskId = 'chat-t1';
    const ctrl = Store.__testOnly.ensureWorkController({
      taskId: 'chat-t1',
      goal: 'who is x',
      planConfirmed: true
    });
    assert.ok(ctrl && typeof ctrl.driveAtrUntilIdle === 'function');
    assert.equal(created.length, 1);
    assert.equal(created[0].mode, 'chat');
    assert.equal(
      JSON.stringify(created[0].permissions),
      JSON.stringify([
        'read_project',
        'web',
        'ask_user',
        'deliver',
        'model'
      ])
    );
    assert.equal(Store.isChatLaneTask(st.agentTask), true);
    assert.equal(Store.isAtrDriveInFlight('chat-t1'), false);
    // Wrong-mode remount: existing work Controller must be replaced for chat task.
    st.workController = {
      driveAtrUntilIdle: function () {
        return Promise.resolve({ ok: true });
      },
      snapshot: function () {
        return { mode: 'work' };
      },
      confirmPlan: function () {},
      isPlanConfirmed: function () {
        return true;
      },
      bindAtrTask: function () {}
    };
    created.length = 0;
    Store.__testOnly.ensureWorkController({
      taskId: 'chat-t1',
      goal: 'who is x',
      planConfirmed: true
    });
    assert.equal(created.length, 1);
    assert.equal(created[0].mode, 'chat');
    st.workController = null;
    st.agentTask = null;
    st.activeAgentTaskId = null;
  }
  const taskSrc = fs.readFileSync('src/js/features/now/home-agent-task.js', 'utf8');
  assert.match(taskSrc, /cmd_agent_task_ensure_chat_scratch/);
  assert.match(taskSrc, /cmd_agent_task_approve_deliver/);
  assert.match(taskSrc, /cmd_agent_task_reject_deliver/);
  assert.match(taskSrc, /resolveChatProvider|isChatLaneOpts/);
  assert.match(taskSrc, /chatLane[\s\S]*?anyChatProviderReady|anyChatProviderReady/);
  const promptsRs = fs.readFileSync('src-tauri/src/agent_task_runtime/prompts.rs', 'utf8');
  assert.match(promptsRs, /user_input/);
  assert.match(promptsRs, /prior_chat/);
  const engRs = fs.readFileSync('src-tauri/src/agent_task_runtime/engine.rs', 'utf8');
  assert.match(engRs, /deliver_approval/);
  assert.match(engRs, /fn approve_deliver|pub fn approve_deliver/);
  const ipcToml = fs.readFileSync('src-tauri/permissions/app-ipc.toml', 'utf8');
  assert.match(ipcToml, /allow-cmd-agent-task-ensure-chat-scratch/);
  assert.match(ipcToml, /allow-cmd-agent-task-approve-deliver/);
}
{
  const reg = fs.readFileSync('src/js/features/now/tool-registry.js', 'utf8');
  assert.match(reg, /deliver_to_agent/);
  assert.match(reg, /web_search:[\s\S]*modes:\s*\[[^\]]*chat/);
  assert.match(reg, /search_code:[\s\S]*modes:\s*\[[^\]]*chat/);
  // Chat WorkController mode:'chat' must be able to step atr_turn (else tool_not_allowed @ 第0步).
  assert.match(reg, /atr_turn:\s*\{[\s\S]*?modes:\s*\[[^\]]*chat/);
  assert.match(reg, /atr_tool_call:\s*\{[\s\S]*?modes:\s*\[[^\]]*chat/);
  const regSrc = read('src/js/features/now/tool-registry.js');
  vm.runInContext(regSrc, sandbox, { filename: 'tool-registry.js' });
  const Reg = sandbox.OneToneToolRegistry;
  assert.equal(Reg.validate('atr_turn', { taskId: 't1', maxSteps: 1 }, 'chat').ok, true);
  assert.equal(Reg.checkPermission('atr_turn', 'chat', ['model']).ok, true);
  assert.equal(Reg.validate('atr_turn', { taskId: 't1', maxSteps: 1 }, 'work').ok, true);
}
assert.match(shell, /ha2AtrDoneQuietNoWrite|编辑回合结束 · 未写入文件/);
assert.match(shell, /atrOwnsHomeChrome/);
{
  const ipcToml = fs.readFileSync('src-tauri/permissions/app-ipc.toml', 'utf8');
  assert.match(ipcToml, /allow-cmd-weather-now/);
}

// --- Capability contract ---
{
  const local = Caps.projectSession({ selectedKind: 'workbuddy', wbSendMode: 'local', workMode: 'think' });
  assert.equal(local.role, 'think');
  assert.equal(local.mode, 'think');
  assert.equal(local.modeEffective, true);
  assert.equal(local.capabilities.text_chat.status, 'available');
  assert.equal(local.capabilities.text_chat.available, true);
  assert.equal(local.capabilities.approval_execute.status, 'not_wired');
  assert.equal(local.capabilities.approval_execute.available, false);
  assert.equal(local.capabilities.diff.status, 'partial');
  assert.equal(local.capabilities.diff.available, false);
  assert.match(local.capabilities.diff.reason, /项目时间线/);
  assert.equal(local.diffRef, null);
  assert.equal(local.sessionId, null);
  assert.equal(local.permissions.read_project.available, false);
  assert.equal(local.permissions.write_project.status, 'not_wired');

  const desk = Caps.projectSession({ selectedKind: 'workbuddy', wbSendMode: 'desktop', workMode: 'think' });
  assert.equal(desk.role, 'code');
  assert.equal(desk.capabilities.text_chat.available, false);
  assert.equal(desk.modeEffective, false);

  const cursor = Caps.projectSession({ selectedKind: 'cursor', wbSendMode: 'local', workMode: 'edit' });
  assert.equal(cursor.role, 'code');
  assert.equal(cursor.mode, 'edit');
  assert.equal(cursor.modeEffective, false);

  // Local chat system prompt carries home project path (no fake FS).
  assert.equal(typeof Caps.buildLocalChatSystemPrompt, 'function');
  const withPath = Caps.buildLocalChatSystemPrompt({
    projectPath: 'E:\\voice-pilot',
    projectName: 'voice-pilot',
    workTitle: 'home local chat context'
  });
  assert.match(withPath, /E:\\voice-pilot|E:\\\\voice-pilot/);
  assert.match(withPath, /voice-pilot/);
  assert.match(withPath, /home local chat context/);
  assert.match(withPath, /少改写、少说教|用工具把问题查清楚/);
  assert.match(withPath, /无 OCR|勿编造路径/);
  assert.doesNotMatch(withPath, /请用户点顶部|后再发目标|不能读写磁盘/);
  assert.doesNotMatch(withPath, /你是 OneTone 首页的 WorkBuddy 本机讨论助手/);
  const noPath = Caps.buildLocalChatSystemPrompt({});
  assert.match(noPath, /未选定/);
  assert.match(withPath, /回复语气：|轻量 Markdown/);

  assert.equal(typeof Caps.formatChatBodyHtml, 'function');
  const mdHtml = Caps.formatChatBodyHtml('# 标题\n\n- 一项\n\n**粗体** 与 `code`');
  assert.match(mdHtml, /ha2-md-h/);
  assert.match(mdHtml, /<ul>/);
  assert.match(mdHtml, /<strong>/);
  assert.match(mdHtml, /<code>/);

  assert.equal(typeof Caps.compactLocalChatUserText, 'function');
  const compact = Caps.compactLocalChatUserText(
    [
      '## 目标',
      '换一个 logo',
      '',
      '## 用户观察',
      '- （无）',
      '',
      '## 已确认证据',
      '- `image.png`（截图；未宣称已 OCR）',
      '',
      '## 请求',
      '先定位相关路径并说明依据；证据不足只调查，不假定根因。',
      '',
      '## 验收标准',
      '- 能说明依据'
    ].join('\n')
  );
  assert.match(compact, /换一个 logo/);
  assert.match(compact, /image\.png/);
  assert.doesNotMatch(compact, /建议检查|验收标准|给 Cursor/);
  assert.equal(Caps.compactLocalChatUserText('直接问：按钮点了没反应'), '直接问：按钮点了没反应');

  // available must derive from status — never hand-written independently
  const entry = Caps.entry('partial', 'x', []);
  assert.equal(entry.available, false);
  assert.equal(Caps.entry('available', 'y', []).available, true);

  assert.equal(Caps.isWaitingForUserStatus('needs_input'), true);
  assert.equal(Caps.isWaitingForUserStatus('idle'), false);
  assert.equal(Caps.isWaitingForUserStatus('working'), false);

  assert.equal(
    Caps.resolveHomeTimelineWorkspace({
      projectPath: 'E:\\home-project',
      tmWorkspace: 'D:\\tm-other'
    }),
    'E:\\home-project'
  );
  assert.equal(
    Caps.resolveHomeTimelineWorkspace({ projectPath: null, tmWorkspace: 'D:\\tm-only' }),
    'D:\\tm-only'
  );
}

const cursorDto = {
  agentId: 'kind:cursor',
  runtimeKind: 'cursor',
  displayName: 'Cursor',
  recentPrompt: 'refactor home dock',
  currentWork: {
    projectName: 'voice-pilot',
    title: 'Home Agent V2 merge',
    updatedAt: Date.now() - 60_000
  },
  recentWork: [{ title: 'older', projectName: 'voice-pilot' }],
  observedStatus: { value: 'working', source: 'probe', confidence: 'high' },
  presenceState: 'here',
  resolvedCapabilities: { interrupt: { enabled: true } },
  actions: [
    { id: 'agent.focus', enabled: true },
    { id: 'agent.interrupt', enabled: true }
  ]
};

const projected = Store.__testOnly.projectAgent(cursorDto);
assert.equal(projected.kind, 'cursor');
assert.equal(projected.project, 'voice-pilot');
assert.equal(projected.title, 'refactor home dock');
assert.equal(projected.line, 'refactor home dock');
assert.equal(projected.status, 'working');
assert.equal(projected.tag, '执行中');
assert.equal(projected.canSend, true);
assert.equal(projected.eligible, true);
assert.ok(projected.evidenceTier === 'A' || projected.evidenceTier === 'B');
assert.equal(Store.__testOnly.resolveKind('totally-unknown-xyz'), null);
assert.equal(Store.__testOnly.resolveKind('cursor-chat'), 'cursor');

// Banned narration must not become a work line / eligible row.
assert.equal(Store.__testOnly.isBannedNarration('检测到交互，内容未知'), true);
assert.equal(Store.__testOnly.isBannedNarration('已探测 · 可发送'), true);
assert.equal(Store.__testOnly.workLine({ recentPrompt: '检测到交互，内容未知' }), '');
const unknownOnly = Store.__testOnly.projectAgent({
  agentId: 'kind:codex',
  runtimeKind: 'codex',
  displayName: 'Codex',
  recentPrompt: '检测到交互，内容未知',
  observedStatus: { value: 'idle', source: 'inferred', confidence: 'low' },
  actions: []
});
assert.equal(unknownOnly.eligible, false);
assert.doesNotMatch(unknownOnly.line || '', /内容未知/);

// Active A/B with unknown prompt → short status line, still no banned text.
const unknownWorking = Store.__testOnly.projectAgent({
  agentId: 'kind:codex',
  runtimeKind: 'codex',
  displayName: 'Codex',
  recentPrompt: '检测到交互，内容未知',
  observedStatus: { value: 'working', source: 'officialHook', confidence: 'high' },
  actions: [{ id: 'agent.focus', enabled: true }]
});
assert.equal(unknownWorking.line, '执行中');
assert.equal(unknownWorking.lineShell, true);
assert.equal(unknownWorking.tag, '执行中');
assert.equal(unknownWorking.evidenceTier, 'A');
assert.equal(unknownWorking.eligible, true);
assert.doesNotMatch(unknownWorking.line, /内容未知|已探测|可发送/);
// UI note must not repeat the tag — omit shell-only copy.
assert.equal(Store.__testOnly.rowNoteText(unknownWorking), '');
assert.equal(
  Store.__testOnly.rowNoteText(Object.assign({}, unknownWorking, { project: 'voice-pilot' })),
  'voice-pilot'
);

// Session title is real data — prefer over status shell.
const withSession = Store.__testOnly.projectAgent({
  agentId: 'kind:cursor',
  runtimeKind: 'cursor',
  recentPrompt: '检测到交互，内容未知',
  observedStatus: { value: 'working', source: 'officialHook', confidence: 'high' },
  actions: [{ id: 'agent.focus', enabled: true }],
  sessions: [{ sessionId: 's1', title: '修首页 Cursor 行', isActive: true }],
  currentWork: { projectName: 'voice-pilot' }
});
assert.equal(withSession.line, '修首页 Cursor 行');
assert.equal(withSession.lineShell, false);
assert.equal(withSession.project, 'voice-pilot');
assert.equal(Store.__testOnly.rowNoteText(withSession), '修首页 Cursor 行 · voice-pilot');
assert.doesNotMatch(Store.__testOnly.rowNoteText(withSession), /^执行中/);

// workRows filters non-eligible even when agents[] is non-empty
Store.__testOnly.applyAgentSnap(
  {
    agents: [
      {
        agentId: 'kind:codex',
        runtimeKind: 'codex',
        recentPrompt: '检测到交互，内容未知',
        observedStatus: { value: 'idle', source: 'inferred' },
        actions: []
      },
      cursorDto
    ]
  },
  {}
);
const rows = Store.__testOnly.workRows(3);
assert.equal(rows.length, 1);
assert.equal(rows[0].kind, 'cursor');
assert.equal(rows[0].line, 'refactor home dock');

// --- P1: desk Soft Pad / Continue merge + dedupe ---
{
  const st = Store.__testOnly.getState();
  // Center: idle Claude (not eligible) + working Cursor (eligible)
  Store.__testOnly.applyAgentSnap(
    {
      agents: [
        {
          agentId: 'kind:claude',
          runtimeKind: 'claude',
          recentPrompt: '',
          observedStatus: { value: 'idle', source: 'inferred' },
          actions: [{ id: 'approval.approve', enabled: true }]
        },
        cursorDto
      ]
    },
    {}
  );
  st.focusVm = {
    mode: 'attention',
    desk: {
      needsYouRows: [
        {
          title: '批准 Claude 的操作？',
          provider: 'Claude',
          badge: 'Claude',
          stale: false
        }
      ],
      livingRows: [{ title: 'Codex 正在活动', provider: 'Codex', badge: 'Codex' }],
      continueCard: {
        title: '拆分首页布局',
        badge: 'Cursor',
        sessionId: 'sess-cursor-1'
      }
    }
  };
  const merged = Store.__testOnly.workRows(5);
  const kinds = merged
    .map((r) => r.kind)
    .slice()
    .sort()
    .join(',');
  // Claude from Soft Pad needs, Codex from living, Cursor from Center (working beats Continue)
  assert.equal(kinds, 'claude,codex,cursor');
  const claude = merged.find((r) => r.kind === 'claude');
  assert.equal(claude.status, 'needs_input');
  assert.match(claude.line, /批准 Claude/);
  assert.equal(claude.deskSource, 'needsYou');
  // Fixture may still carry phantom approval.approve; CTA must stay navigate (not_wired)
  assert.ok(claude.actions.some((a) => a.id === 'approval.approve'));
  assert.equal(claude.primaryCta || Store.__testOnly.primaryCtaOf(claude.status, claude.actions), 'navigate');
  const cursorRow = merged.find((r) => r.kind === 'cursor');
  assert.equal(cursorRow.status, 'working');
  assert.doesNotMatch(cursorRow.line || '', /拆分首页/); // Continue suppressed while Living/working
  assert.equal(merged.filter((r) => r.kind === 'claude').length, 1); // no dual Soft Pad + Center needs

  // Living + Continue same kind → Continue dropped
  st.focusVm = {
    mode: 'return',
    desk: {
      needsYouRows: [],
      livingRows: [{ title: 'Codex 正在活动', provider: 'Codex' }],
      continueCard: { title: '上次 Codex 进度', badge: 'Codex', sessionId: 's-codex' }
    }
  };
  Store.__testOnly.applyAgentSnap({ agents: [] }, {});
  const livingOnly = Store.__testOnly.workRows(5);
  assert.equal(livingOnly.length, 1);
  assert.equal(livingOnly[0].kind, 'codex');
  assert.equal(livingOnly[0].deskSource, 'living');
  assert.match(livingOnly[0].line, /正在活动/);

  // Living shell + Center session title → show session, not「正在活动」
  // Center stays non-eligible (idle shell); sessions only used by enrichLivingNarration.
  assert.equal(Store.__testOnly.isActivityShellLine('Cursor 正在活动'), true);
  Store.__testOnly.applyAgentSnap(
    {
      agents: [
        {
          agentId: 'kind:cursor',
          runtimeKind: 'cursor',
          recentPrompt: '',
          observedStatus: { value: 'idle', source: 'inferred' },
          actions: [{ id: 'agent.focus', enabled: true }],
          sessions: [
            {
              sessionId: 'sess-live-1',
              title: '对齐 Soft Pad 时间胶囊',
              isActive: true
            }
          ]
        }
      ]
    },
    {}
  );
  st.focusVm = {
    mode: 'attention',
    desk: {
      needsYouRows: [],
      livingRows: [
        {
          title: 'Cursor 正在活动',
          provider: 'Cursor',
          badge: 'Cursor',
          sessionId: 'sess-live-1'
        }
      ],
      continueCard: null
    }
  };
  const livingEnriched = Store.__testOnly.workRows(5);
  assert.equal(livingEnriched.length, 1);
  assert.equal(livingEnriched[0].kind, 'cursor');
  assert.equal(livingEnriched[0].deskSource, 'living');
  assert.equal(livingEnriched[0].line, '对齐 Soft Pad 时间胶囊');
  assert.equal(livingEnriched[0].sessionId, 'sess-live-1');
  assert.doesNotMatch(livingEnriched[0].line, /正在活动/);

  // Center「执行中」shell + living enriched session → prefer session line
  Store.__testOnly.applyAgentSnap(
    {
      agents: [
        {
          agentId: 'kind:cursor',
          runtimeKind: 'cursor',
          recentPrompt: '检测到交互，内容未知',
          observedStatus: { value: 'working', source: 'officialHook', confidence: 'high' },
          actions: [{ id: 'agent.focus', enabled: true }],
          sessions: [{ sessionId: 'sess-live-2', title: '修首页 Cursor 行', isActive: true }]
        }
      ]
    },
    {}
  );
  st.focusVm = {
    mode: 'attention',
    desk: {
      needsYouRows: [],
      livingRows: [
        {
          title: 'Cursor 正在活动',
          provider: 'Cursor',
          sessionId: 'sess-live-2'
        }
      ],
      continueCard: null
    }
  };
  const shellMerged = Store.__testOnly.workRows(5);
  const cursorShell = shellMerged.find((r) => r.kind === 'cursor');
  assert.ok(cursorShell);
  assert.equal(cursorShell.line, '修首页 Cursor 行');
  assert.doesNotMatch(cursorShell.line, /正在活动|执行中/);

  // Closed Codex + weak「上次进度」Continue must NOT enter workspace or steal default.
  const st2 = Store.__testOnly.getState();
  st2.focusVm = { mode: 'quiet', desk: { needsYouRows: [], livingRows: [], continueCard: null } };
  st2.inventory = {
    agents: [
      { kind: 'codex', presence: 'cli', confidence: 'high', running: false },
      { kind: 'cursor', presence: 'desktop', confidence: 'high', running: true }
    ]
  };
  st2.inventoryLoaded = true;
  st2.userLocked = false;
  Store.__testOnly.applyAgentSnap(
    {
      agents: [
        {
          agentId: 'kind:codex',
          runtimeKind: 'codex',
          recentPrompt: '',
          observedStatus: { value: 'idle', source: 'inferred' },
          actions: [
            { id: 'agent.focus', enabled: true },
            { id: 'session.resume', enabled: true }
          ]
        },
        {
          agentId: 'kind:cursor',
          runtimeKind: 'cursor',
          recentPrompt: 'live cursor task',
          observedStatus: { value: 'working', source: 'officialHook' },
          actions: [{ id: 'agent.focus', enabled: true }]
        }
      ]
    },
    {}
  );
  // Idle + session.resume alone must not mint a「可恢复」workspace row.
  assert.ok(!Store.__testOnly.workRows(5).some((r) => r.kind === 'codex'));
  st2.focusVm = {
    mode: 'return',
    desk: {
      needsYouRows: [],
      livingRows: [],
      continueCard: {
        title: 'Codex 上次进度',
        badge: 'Codex',
        sessionId: 'old-codex'
      }
    }
  };
  st2.selectedKind = 'codex';
  Store.__testOnly.sanitizeSelectedKind();
  const noGhost = Store.__testOnly.workRows(5);
  assert.ok(!noGhost.some((r) => r.kind === 'codex' && r.deskSource === 'continue'));
  assert.ok(noGhost.some((r) => r.kind === 'cursor' && /live cursor/.test(r.line)));
  assert.notEqual(Store.__testOnly.getState().selectedKind, 'codex');
  assert.equal(Store.__testOnly.getState().selectedKind, 'cursor');

  // Strong continue + closed Codex → honest resumable row (not fake working / monitoring).
  st2.inventory = {
    agents: [{ kind: 'codex', presence: 'cli', confidence: 'high', running: false }]
  };
  st2.focusVm = {
    mode: 'return',
    desk: {
      needsYouRows: [],
      livingRows: [],
      continueCard: {
        title: '拆分首页布局',
        badge: 'Codex',
        sessionId: 'old-codex-strong'
      }
    }
  };
  Store.__testOnly.applyAgentSnap(
    {
      agents: [
        {
          agentId: 'kind:codex',
          runtimeKind: 'codex',
          recentPrompt: '',
          observedStatus: { value: 'idle', source: 'inferred' },
          actions: [
            { id: 'agent.focus', enabled: true },
            { id: 'session.resume', enabled: true }
          ]
        }
      ]
    },
    {}
  );
  const strongContinue = Store.__testOnly.workRows(5);
  const codexResume = strongContinue.find(
    (r) => r.kind === 'codex' && r.deskSource === 'continue'
  );
  assert.ok(codexResume, 'strong continue should surface for closed agent');
  assert.equal(codexResume.status, 'resumable');
  assert.equal(codexResume.line, '拆分首页布局');
  assert.doesNotMatch(codexResume.line || '', /执行中|正在活动/);

  // Discovered-only (nothing running) → no invented default send target.
  st2.inventory = {
    agents: [{ kind: 'codex', presence: 'cli', confidence: 'high', running: false }]
  };
  st2.focusVm = { mode: 'quiet', desk: { needsYouRows: [], livingRows: [], continueCard: null } };
  st2.userLocked = false;
  Store.__testOnly.applyAgentSnap(
    {
      agents: [
        {
          agentId: 'kind:codex',
          runtimeKind: 'codex',
          recentPrompt: '',
          observedStatus: { value: 'idle', source: 'inferred' },
          actions: [
            { id: 'agent.focus', enabled: true },
            { id: 'session.resume', enabled: true }
          ]
        }
      ]
    },
    {}
  );
  assert.equal(Store.__testOnly.workRows(5).length, 0);
  assert.equal(Store.__testOnly.getState().selectedKind, null);

  // Cursor FG + workspace observable, Codex listed first / still "running" → dock = Cursor.
  st2.focusDto = {
    foreground: { appId: 'cursor-chat', appName: 'Cursor', windowTitle: 'voice-pilot - Cursor' }
  };
  st2.focusVm = {
    mode: 'attention',
    desk: { needsYouRows: [], livingRows: [{ title: 'Cursor 可观察', provider: 'Cursor' }], continueCard: null }
  };
  st2.inventory = {
    agents: [
      { kind: 'codex', presence: 'cli', confidence: 'high', running: true },
      { kind: 'cursor', presence: 'desktop', confidence: 'high', running: true }
    ]
  };
  st2.inventoryLoaded = true;
  st2.userLocked = false;
  st2.selectedKind = 'codex';
  Store.__testOnly.applyAgentSnap(
    {
      agents: [
        {
          agentId: 'kind:codex',
          runtimeKind: 'codex',
          recentPrompt: '',
          observedStatus: { value: 'idle', source: 'inferred' },
          actions: [{ id: 'agent.focus', enabled: true }]
        },
        {
          agentId: 'kind:cursor',
          runtimeKind: 'cursor',
          recentPrompt: '',
          observedStatus: { value: 'idle', source: 'inferred' },
          actions: [{ id: 'agent.focus', enabled: true }]
        }
      ]
    },
    {}
  );
  Store.__testOnly.sanitizeSelectedKind();
  assert.equal(
    Store.__testOnly.getState().selectedKind,
    'cursor',
    'Cursor FG must win dock over stale Codex running'
  );

  // Enter homepage → live FG is OneTone (no appId). Sticky last Cursor must keep dock.
  st2.focusDto = { foreground: { appId: null, appName: 'OneTone', windowTitle: 'OneTone' } };
  st2.selectedKind = 'codex';
  Store.__testOnly.sanitizeSelectedKind();
  assert.equal(
    Store.__testOnly.getState().selectedKind,
    'cursor',
    'opening homepage (self FG) must keep last Cursor send target, not flip to Codex'
  );

  // ChatGPT/Codex startup-running in background, no FG / no live work → do not invent dock.
  Store.__testOnly.setLastExternalSendKind(null);
  st2.focusDto = { foreground: { appId: null, appName: 'OneTone', windowTitle: 'OneTone' } };
  st2.inventory = {
    agents: [
      { kind: 'codex', presence: 'cli', confidence: 'high', running: true },
      { kind: 'cursor', presence: 'desktop', confidence: 'high', running: true }
    ]
  };
  st2.focusVm = { mode: 'quiet', desk: { needsYouRows: [], livingRows: [], continueCard: null } };
  st2.userLocked = false;
  st2.selectedKind = 'codex';
  Store.__testOnly.applyAgentSnap(
    {
      agents: [
        {
          agentId: 'kind:codex',
          runtimeKind: 'codex',
          recentPrompt: '',
          observedStatus: { value: 'idle', source: 'inferred' },
          actions: [{ id: 'agent.focus', enabled: true }]
        },
        {
          agentId: 'kind:cursor',
          runtimeKind: 'cursor',
          recentPrompt: '',
          observedStatus: { value: 'idle', source: 'inferred' },
          actions: [{ id: 'agent.focus', enabled: true }]
        }
      ]
    },
    {}
  );
  Store.__testOnly.sanitizeSelectedKind();
  assert.equal(
    Store.__testOnly.getState().selectedKind,
    null,
    'background Codex running must not become dock default without FG or live work'
  );
}

// inventory discovery — no installed field
const disc = Store.__testOnly.inventoryDiscovery({
  kind: 'cursor',
  presence: 'desktop',
  confidence: 'high',
  running: true,
  evidence: [{ kind: 'desktop', detail: 'Cursor.exe' }]
});
assert.equal(disc.discovered, true);
assert.equal(disc.running, true);
assert.equal(disc.channel, 'app');

const none = Store.__testOnly.inventoryDiscovery({
  kind: 'codex',
  presence: 'none',
  confidence: 'low',
  running: false,
  evidence: []
});
assert.equal(none.discovered, false);

// Triad remains for classic Home Focus; V2 Mac surface does not mount Mid.
const focusHtml = Triad.composerHtml(
  { mode: 'quiet', headline: '今天想推进什么？' },
  {
    draftText: 'hello',
    probeTargets: [{ kind: 'cursor', label: 'Cursor', discovered: true, running: true }],
    probePending: false,
    actPrefix: 'hf'
  }
);
assert.match(focusHtml, /hn-quiet-composer/);
assert.match(focusHtml, /hn-agent-grid/);

const pendingGrid = Triad.agentGridHtml([], { probePending: true, actPrefix: 'hf' });
assert.match(pendingGrid, /is-pending/);
assert.match(pendingGrid, /正在检测/);

// evidence sidecar shape on empty snapshot
const snap0 = Store.getSnapshot();
assert.ok(snap0.evidence);
assert.ok(snap0.evidence.mode);
assert.ok('source' in snap0.evidence.mode);
assert.ok('agents' in snap0.evidence);
assert.ok(Array.isArray(snap0.targets));

// default selectedKind must not invent agent when Center+inventory empty
{
  const emptySt = Store.__testOnly.getState();
  emptySt.inventory = null;
  emptySt.inventoryLoaded = false;
  emptySt.targets = [];
  emptySt.agents = [];
  emptySt.focusVm = { mode: 'quiet', desk: { needsYouRows: [], livingRows: [], continueCard: null } };
  emptySt.userLocked = false;
  emptySt.selectedKind = null;
}
Store.__testOnly.applyAgentSnap(null, {});
assert.equal(Store.__testOnly.getState().selectedKind, null);

Store.__testOnly.applyAgentSnap(
  {
    agents: [cursorDto]
  },
  {}
);
assert.equal(Store.__testOnly.getState().selectedKind, 'cursor');
assert.equal(Store.__testOnly.getState().agents[0].canSend, true);

// quietHintLines: help fallback when nothing narratable; history when continue/homeSnap exist
{
  const qs = Store.__testOnly.getState();
  qs.agents = [];
  qs.homeSnap = null;
  qs.focusVm = { mode: 'quiet', desk: { needsYouRows: [], livingRows: [], continueCard: null } };
  qs.selectedKind = null;
  const helpOnly = Store.__testOnly.quietHintLines(3);
  assert.equal(helpOnly.length, 1);
  assert.equal(helpOnly[0].kind, 'help');
  assert.match(helpOnly[0].text, /底栏/);
  assert.doesNotMatch(helpOnly[0].text, /可叙述|直接投递/);

  qs.selectedKind = 'cursor';
  const helpSel = Store.__testOnly.quietHintLines(1);
  assert.match(helpSel[0].text, /Cursor|底栏/);

  qs.focusVm = {
    mode: 'quiet',
    desk: {
      needsYouRows: [],
      livingRows: [],
      continueCard: { title: '修校准提示', badge: 'Cursor', when: '昨天' }
    }
  };
  qs.homeSnap = {
    recentSessions: [{ title: '首页空态文案', provider: 'Claude' }]
  };
  const hist = Store.__testOnly.quietHintLines(3);
  assert.ok(hist.length >= 1);
  assert.ok(hist.some((h) => /上次：修校准提示/.test(h.text)));
  assert.ok(hist.some((h) => /最近：首页空态文案/.test(h.text)));
  assert.ok(hist.every((h) => h.kind !== 'help' || hist.length === 1));
  assert.ok(!hist.some((h) => /可叙述|直接投递/.test(h.text)));
}

// lastGood TTL
const st = Store.__testOnly;
sandbox.sessionStorage.setItem(
  st.LAST_GOOD_KEY,
  JSON.stringify({ snap: { agents: [] }, savedAt: Date.now() - st.LAST_GOOD_MAX_AGE_MS - 1000 })
);
assert.equal(st.loadLastGood(), null);

// --- Trusted workbench: targetContext, receipts, sessionCards ---
{
  const state = Store.__testOnly.getState();
  state.agents = [
    Store.__testOnly.projectAgent({
      agentId: 'kind:codex',
      runtimeKind: 'codex',
      displayName: 'Codex',
      recentPrompt: 'AGENT_LEVEL_PROMPT_MUST_NOT_LEAK',
      currentWork: {
        title: 'work-a',
        sessionId: 'sess-work',
        projectPath: 'C:\\repo\\voice-pilot',
        updatedAt: Date.now()
      },
      recentWork: [
        {
          title: 'rw-1',
          sessionId: 'sess-rw',
          projectId: 'p1',
          activitySource: 'probe',
          updatedAt: Date.now() - 1000
        }
      ],
      observedStatus: { value: 'idle', freshUntil: Date.now() + 60000 },
      actions: [{ id: 'agent.focus', enabled: true }]
    })
  ].filter(Boolean);
  state.selectedKind = 'codex';
  state.userLocked = false;
  state.lockedProjectPath = null;
  state.focusDto = { project: { root: 'C:\\repo\\voice-pilot' } };
  state.timeMachine = {
    workspace: 'C:\\repo\\voice-pilot',
    isGit: true,
    changedCount: 6,
    tipId: 'tip-1',
    tipLabel: 'auto'
  };
  state.homeSnap = {
    recentSessions: [
      {
        sessionId: 'sess-home',
        provider: 'codex',
        title: 'from-home',
        projectId: 'p2',
        projectMatch: 'exact',
        status: 'idle',
        updatedAt: Date.now() - 500,
        activitySource: 'home_snap',
        activeConfidence: 0.8
      },
      {
        sessionId: 'sess-other',
        provider: 'claude',
        title: 'other-provider'
      }
    ]
  };
  state.deliveryReceipt = null;
  state.actionReceipt = null;
  state.validationNotice = null;
  state.evidence.delivery = { source: null, observedAt: 0, verified: false };

  const ctx = Store.resolveTargetContext();
  assert.ok(ctx.projectPath, 'targetContext needs project path');
  assert.equal(PP.normalizeAbsolutePath(ctx.projectPath), 'C:\\repo\\voice-pilot');
  assert.equal(ctx.tmWorkspaceMatched, true);

  // validation notice must not write delivery evidence
  const beforeEv = JSON.stringify(state.evidence.delivery);
  Store.setValidationNotice({ kind: 'missing_project', message: '先选定项目' });
  assert.equal(state.validationNotice.kind, 'missing_project');
  assert.equal(JSON.stringify(state.evidence.delivery), beforeEv);

  // action receipt must not touch delivery evidence
  Store.setActionReceipt({
    actionId: 'session.resume',
    outcome: 'verified',
    title: '操作已确认',
    message: 'ok'
  });
  assert.equal(state.actionReceipt.outcome, 'verified');
  assert.equal(JSON.stringify(state.evidence.delivery), beforeEv);

  Store.setDeliveryReceipt({
    outcome: 'pasted_confirmed',
    title: '已确认粘贴到输入框',
    verified: true,
    inputConfirmed: true
  });
  assert.equal(state.deliveryReceipt.outcome, 'pasted_confirmed');
  assert.equal(state.evidence.delivery.verified, true);
  assert.equal(state.validationNotice, null);

  const cards = Store.buildSessionCards('codex');
  assert.ok(cards.length >= 2, 'session cards from recentWork + homeSnap');
  assert.ok(cards.some((c) => c.sessionId === 'sess-rw'));
  assert.ok(cards.some((c) => c.sessionId === 'sess-home'));
  assert.ok(!cards.some((c) => c.sessionId === 'sess-other'));
  assert.ok(
    !JSON.stringify(cards).includes('AGENT_LEVEL_PROMPT_MUST_NOT_LEAK'),
    'Agent recentPrompt must not leak into session cards'
  );

  // Soft Pad needs → always「前往处理」; approval.approve is not_wired in Agent Center
  assert.equal(Store.__testOnly.primaryCtaOf('needs_input', []), 'navigate');
  assert.equal(
    Store.__testOnly.primaryCtaOf('needs_input', [{ id: 'approval.approve', enabled: true }]),
    'navigate'
  );

  // Idle + phantom approval.approve is NOT a waiting target (status gate only)
  assert.equal(Caps.isWaitingForUserStatus('idle'), false);
  assert.equal(
    Store.__testOnly.primaryCtaOf('idle', [{ id: 'approval.approve', enabled: true }]),
    'open'
  );

  // TM mismatch → no task-result semantics (workspace review gated in UI)
  state.timeMachine.workspace = 'D:\\other\\proj';
  const ctx2 = Store.resolveTargetContext();
  assert.equal(ctx2.tmWorkspaceMatched, false);
}

// --- wbSendMode in store + session role projection ---
{
  Store.setSelected('workbuddy', { lock: true, force: true });
  Store.setWbSendMode('local', { force: true });
  let snap = Store.getSnapshot();
  assert.equal(snap.wbSendMode, 'local');
  assert.equal(snap.session.role, 'think');
  assert.equal(snap.session.capabilities.text_chat.available, true);
  assert.equal(snap.session.diffRef, null);

  Store.setWbSendMode('desktop');
  snap = Store.getSnapshot();
  assert.equal(snap.wbSendMode, 'desktop');
  assert.equal(snap.session.role, 'code');
  assert.equal(snap.session.capabilities.text_chat.available, false);
  assert.equal(sandbox.localStorage.getItem('onetone.ha2.wbSendMode'), 'desktop');

  // Legacy readonly / hidden research → 对话 (primary UI is chat|work).
  Store.setWorkMode('readonly');
  snap = Store.getSnapshot();
  assert.equal(snap.session.mode, 'think');
  assert.equal(sandbox.localStorage.getItem('onetone.ha2.workMode'), 'think');

  Store.setWorkMode('work');
  snap = Store.getSnapshot();
  assert.equal(snap.session.mode, 'edit');
  assert.equal(sandbox.localStorage.getItem('onetone.ha2.workMode'), 'edit');

  Store.setWorkMode('chat');
  snap = Store.getSnapshot();
  assert.equal(snap.session.mode, 'think');
  assert.equal(sandbox.localStorage.getItem('onetone.ha2.workMode'), 'think');

  // Research chrome is product-hidden — collapse to think.
  Store.setWorkMode('research');
  snap = Store.getSnapshot();
  assert.equal(snap.session.mode, 'think');
  assert.equal(sandbox.localStorage.getItem('onetone.ha2.workMode'), 'think');
  Store.setWorkMode('think');
  snap = Store.getSnapshot();
  assert.equal(snap.session.mode, 'think');

  // All permissions not_wired / no fake toggles
  const perms = snap.session.permissions;
  for (const id of Caps.PERM_IDS) {
    assert.equal(perms[id].status, 'not_wired');
    assert.equal(perms[id].available, false);
  }
}

// --- Fail-closed when capabilities module missing ---
{
  const saved = sandbox.OneToneHomeAgentCapabilities;
  sandbox.OneToneHomeAgentCapabilities = null;
  const closed = Store.buildSessionProjection({ projectPath: null, agentId: '' });
  assert.equal(closed.modeEffective, false);
  assert.match(closed.modeReason || '', /未加载/);
  sandbox.OneToneHomeAgentCapabilities = saved;
}

// --- Handoff tracking uses handoffId, never fabricates sessionId ---
{
  Store.setHandoffId('handoff_test1');
  const snap = Store.getSnapshot();
  assert.equal(snap.handoffId, 'handoff_test1');
  assert.equal(snap.session.handoffId, 'handoff_test1');
  assert.equal(snap.session.sessionId, null);
  assert.equal(snap.session.externalSessionId, null);
  Store.setHandoffId(null);
}

// --- ATR mirror sig tracks liveThinking so busy poll still paints ---
{
  const sig = Store.__testOnly.atrTaskMirrorSig;
  assert.equal(typeof sig, 'function');
  const a = sig({ taskId: 't1', status: 'running', liveThinking: 'think' }, []);
  const b = sig({ taskId: 't1', status: 'running', liveThinking: 'thinking…' }, []);
  const c = sig({ taskId: 't1', status: 'waiting', liveThinking: 'thinking…' }, []);
  assert.notEqual(a, b);
  assert.notEqual(b, c);
  assert.equal(
    sig({ taskId: 't1', status: 'waiting', liveThinking: 'thinking…' }, []),
    c
  );
}

console.log('test-home-agent-v2: ok');
