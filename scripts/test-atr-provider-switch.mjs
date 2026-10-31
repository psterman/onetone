/**
 * Seal: ATR multi-provider switch — WorkBuddy OAuth freemodel primary, Soft Pad secondary.
 * Usage: node scripts/test-atr-provider-switch.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const cmd = read('src-tauri/src/ipc/commands/shell/agent_task_runtime_cmd.rs');
assert.match(cmd, /fn cmd_agent_task_drive\b/);
assert.match(cmd, /provider_ready_snapshot/);

const providers = read('src-tauri/src/agent_task_runtime/providers.rs');
assert.match(providers, /workbuddy/);
assert.match(providers, /DeepSeek/);
assert.match(providers, /selectedDefault/);
assert.match(providers, /recommended_try_edit|recommendedProvider/);
assert.match(providers, /tryEdit/);
assert.match(providers, /editCapable/);
assert.match(providers, /workbuddyChatReady/);
assert.match(providers, /probe_workbuddy_edit/);
assert.match(providers, /WorkbuddyDriver/);
assert.match(providers, /workbuddy_chat_ready/);
assert.match(providers, /workbuddy_unconfigured/);
assert.doesNotMatch(providers, /workbuddy_edit_disabled/);
assert.doesNotMatch(providers, /编辑暂不可用/);
assert.match(providers, /recommend_workbuddy_when_try_edit/);
assert.match(providers, /Value::Null/);

const wb = read('src-tauri/src/agent_task_runtime/workbuddy.rs');
assert.match(wb, /scripted_readme_step/);
assert.match(wb, /user_tool_trace_section/);
assert.match(wb, /system_tool_list_does_not_count_as_ran/);
assert.match(wb, /workbuddy_edit_ready/);
assert.match(wb, /probe_workbuddy_edit/);
assert.match(wb, /agent_json_turn/);
assert.match(wb, /workbuddy_has_account/);

const soft = read('src-tauri/src/agent_task_runtime/deepseek.rs');
assert.match(soft, /scripted_readme_step/);
assert.match(soft, /user_tool_trace_section/);
assert.match(soft, /connect_timeout/);

const cmdDrive = read('src-tauri/src/ipc/commands/shell/agent_task_runtime_cmd.rs');
assert.match(cmdDrive, /max_steps/);
assert.match(cmdDrive, /spawn_blocking/);
assert.match(cmdDrive, /async fn cmd_agent_task_drive\b/);
assert.match(cmdDrive, /cmd_agent_task_probe_workbuddy/);

const llm = read('src-tauri/src/workbuddy_local_llm.rs');
assert.match(llm, /probe_native_tool_calling/);
assert.match(llm, /response_has_native_tool_call/);
assert.match(llm, /atr_edit_ready/);
assert.match(llm, /agent_json_turn/);
assert.match(llm, /oauth_start/);

const taskJs = read('src/js/features/now/home-agent-task.js');
assert.match(taskJs, /onStarted/);
assert.match(taskJs, /maxSteps:\s*1/);
assert.match(taskJs, /probeWorkbuddy/);
assert.match(taskJs, /isEditCapableRow/);
assert.match(taskJs, /locallyVerified|allowTryEdit|evaluateVerify|ensureVerifySandbox/);
assert.match(taskJs, /workbuddyReady|enrichReadySnapshot/);
assert.match(taskJs, /editCapable: editCapable|editCapable === true/);
assert.doesNotMatch(
  taskJs,
  /editCapable:\s*verified/
);
assert.match(taskJs, /ensureVerifySandbox|cmd_agent_task_ensure_verify_sandbox/);

const fe = read('src/js/features/now/home-agent-task.js');
assert.match(fe, /onetone\.atr\.provider/);
assert.match(fe, /function drive\b/);
assert.match(fe, /cmd_agent_task_drive/);
assert.match(fe, /provider_unconfigured/);

const ui = read('src/js/features/now/home-agent-v2.js');
assert.match(ui, /data-ha2-atr-provider/);
assert.match(ui, /writeProvider/);
assert.match(ui, /function consultStripHtml[\s\S]*?return '';/);
assert.match(ui, /String\(\(snap && snap\.workMode\) \|\| ''\) === 'edit'/);
assert.match(ui, /maybeProbeWorkbuddyEdit/);
assert.doesNotMatch(ui, /编辑暂不可用/);
assert.match(ui, /ATR 编辑引擎/);
assert.match(ui, /ATR 编辑/);
assert.match(ui, /ha2AtrDraftPlaceholder/);
assert.match(ui, /把 README 复制到桌面/);
assert.match(ui, /data-ha2-atr-abandon-send/);
assert.match(ui, /abandonAndStartAgentTask/);
assert.match(ui, /atrTaskPanelHtml/);
assert.match(ui, /ha2-atr-timeline/);
assert.match(ui, /maybeOpenAtrWbPage/);
assert.match(ui, /openAtrEditPage/);
assert.match(ui, /atrWbPageForced/);
assert.match(ui, /atrMainGateHtml/);
assert.match(ui, /data-ha2-atr-gate/);
assert.match(ui, /data-ha2-atr-open-page/);
assert.match(ui, /data-ha2-atr-page/);
assert.match(ui, /atrWbPageTranscriptHtml/);
assert.match(ui, /data-ha2-atr-approve-all/);
assert.match(ui, /批准补丁写入|批准并执行/);
assert.match(ui, /同意所有任务/);
assert.match(ui, /拒绝方案/);
assert.match(ui, /data-ha2-atr-verify-engine|隔离验证/);
assert.match(ui, /ensureVerifySandbox/);
assert.match(ui, /edit_not_admitted/);
assert.doesNotMatch(ui, /E:\/voice-pilot\/\.tmp-atr-e2e-sandbox/);
assert.match(ui, /atrSendConflict|keep-draft|保留草稿/);
assert.doesNotMatch(ui, /writeProvider\(info\.selectedDefault\)/);
assert.match(
  read('src/js/features/now/home-agent-v2-store.js'),
  /evaluateVerify/
);
assert.match(
  read('src/js/features/now/home-agent-v2-store.js'),
  /edit_not_admitted/
);
assert.doesNotMatch(
  read('src/js/features/now/home-agent-v2-store.js'),
  /markEditVerified\(provider/
);
// FE isolation verify: sandboxId only — no FE-owned expected_* authority.
assert.match(
  read('src/js/features/now/home-agent-task.js'),
  /sandboxId: opts\.sandboxId/
);
assert.doesNotMatch(
  read('src/js/features/now/home-agent-task.js'),
  /expectedContent: opts\.expectedContent/
);
assert.match(ui, /ha2AtrDoneQuietNoWrite|ha2AtrDoneQuietWrote/);
assert.match(
  read('src/js/features/now/home-agent-capabilities.js'),
  /勿臆测「本机无网/
);
assert.doesNotMatch(ui, /ha2-wb-page-turn--strategy/);
assert.match(ui, /silent verify first if needed|ha2AtrVerifySilent/);
assert.match(ui, /startConfirmedWorkTask/);
assert.match(ui, /startAtrSandboxVerify/);
assert.match(ui, /taskCoreHtml/);
assert.match(ui, /atrUserStepLine/);
assert.match(ui, /syncModeChrome/);
assert.match(ui, /ha2ModeBoundaryWork|ha2ModeBoundaryChat/);
assert.match(ui, /开始执行|ha2WorkStartCta/);
assert.match(ui, /当前工作任务/);
assert.match(ui, /Steps first; then local-chat only after this ATR open/);
assert.match(ui, /atrChatSinceMs = Date\.now/);
assert.match(ui, /atrWbChatTurnsHtml/);
assert.match(ui, /atrChatSinceMs/);
assert.match(ui, /本次任务后的讨论/);
assert.match(
  read('src/js/features/now/home-agent-capabilities.js'),
  /formatChatBodyHtml/
);
assert.match(
  read('src/js/features/now/home-agent-capabilities.js'),
  /Mermaid/
);
assert.match(
  read('src/js/features/now/home-agent-capabilities.js'),
  /少改写、少说教/
);
assert.doesNotMatch(
  read('src/js/features/now/home-agent-capabilities.js'),
  /要改仓库时一句交 Cursor/
);
assert.match(
  read('src-tauri/src/agent_task_runtime/workbuddy.rs'),
  /scripted_readme_never_hijacks_model|must not script/
);
assert.match(
  read('src-tauri/src/agent_task_runtime/workbuddy.rs'),
  /pub fn scripted_readme_step[\s\S]*?None/
);
assert.match(ui, /wbTurnBodyHtml/);
assert.match(
  read('src-tauri/src/agent_task_runtime/prompts.rs'),
  /勿擅自换成 README\.md/
);
assert.match(
  read('src-tauri/src/agent_task_runtime/prompts.rs'),
  /read_file 返回 not_found 时，下一步必须 propose_changes/
);
assert.match(
  read('src-tauri/src/agent_task_runtime/engine.rs'),
  /fn prefer_tool_call/
);
assert.match(
  read('src-tauri/src/agent_task_runtime/engine.rs'),
  /map_tool_error_for_call/
);
assert.match(ui, /modelExcerpt/);
{
  const atrFn = ui.match(
    /function atrWbPageTranscriptHtml\([\s\S]*?\n  function wbChatPageHtml/
  );
  assert.ok(atrFn, 'atrWbPageTranscriptHtml block');
  assert.match(atrFn[0], /atrWbChatTurnsHtml/);
  assert.match(atrFn[0], /atrLogCardHtml/);
  assert.doesNotMatch(atrFn[0], /ha2-wb-page-turn--atr/);
}
{
  const chatFn = ui.match(
    /function atrWbChatTurnsHtml\([\s\S]*?\n  function atrWbPageTranscriptHtml/
  );
  assert.ok(chatFn, 'atrWbChatTurnsHtml block');
  assert.match(chatFn[0], /wbPageTurnsForPaint/);
}
assert.match(ui, /function patchWbChatPageLive/);
assert.match(ui, /never rebuild textarea/);
assert.match(ui, /isHa2ComposeTarget/);
{
  const paint = ui.match(
    /function paintWbChatPage\([\s\S]*?\n  function openWbChatPage/
  );
  assert.ok(paint, 'paintWbChatPage block');
  assert.match(paint[0], /patchWbChatPageLive/);
  assert.match(paint[0], /transcript\.scrollTop/);
  // Poll path must keep existing textarea (no host.innerHTML wipe while page open).
  assert.match(paint[0], /if \(page && draftEl\)/);
}
{
  const patch = ui.match(
    /function patchWbChatPageLive\([\s\S]*?\n  function paintWbChatPage/
  );
  assert.ok(patch, 'patchWbChatPageLive block');
  assert.match(patch[0], /prevTranscript\.innerHTML/);
  assert.doesNotMatch(patch[0], /host\.innerHTML\s*=/);
}
assert.match(
  read('src/css/home-agent-v2.css'),
  /\.ha2-wb-page-host\{[\s\S]*?overflow:hidden/
);
assert.match(ui, /data-ha2-atr-log/);
assert.match(ui, /data-ha2-atr-log-toggle/);
assert.match(ui, /data-ha2-atr-log-copy/);
assert.match(ui, /defaults expanded|default expanded|Active task defaults expanded/);
assert.match(
  read('src/css/home-agent-v2.css'),
  /ha2-atr-log\.is-expanded[\s\S]*?max-height:\s*none/
);
assert.match(ui, /format_error:\s*t\('ha2AtrEvFormatFail'/);
assert.match(ui, /if \(p\.reason\)/);
assert.match(ui, /Failures must appear in the transcript/);
assert.match(ui, /keep the latest few/);
assert.match(ui, /atrLogExpandedById/);
assert.match(ui, /copyAtrLog/);
assert.match(ui, /OneToneAppToast/);
assert.match(ui, /execCommand\('copy'\)/);
assert.match(ui, /ha2-atr-last/);
assert.match(ui, /atrTaskLogItems/);
assert.match(ui, /data-atr-task-id/);
assert.match(
  read('src-tauri/src/agent_task_runtime/engine.rs'),
  /"tool_call"[\s\S]*modelExcerpt/
);
assert.match(
  read('src-tauri/src/agent_task_runtime/engine.rs'),
  /allow_dirty_eff/
);
assert.match(
  read('src-tauri/src/agent_task_runtime/engine.rs'),
  /PermissionMode::WriteAutonomous/
);
assert.match(
  read('src-tauri/src/agent_task_runtime/engine.rs'),
  /"patch_applied"[\s\S]*Some\("apply_patch"\)/
);
assert.match(
  read('src-tauri/src/agent_task_runtime/engine.rs'),
  /export_to_desktop/
);
assert.match(
  read('src-tauri/src/agent_task_runtime/tools.rs'),
  /pub fn export_to_desktop/
);
assert.match(ui, /ha2AtrEvExported/);
assert.match(ui, /本任务剩余写入不再询问/);
assert.match(
  read('src-tauri/src/agent_task_runtime/mod.rs'),
  /dirty_baseline_apply_reaches_waiting_not_error_loop/
);
assert.match(
  read('src-tauri/src/agent_task_runtime/engine.rs'),
  /autoBeforeApply/
);
assert.match(
  read('src-tauri/src/agent_task_runtime/mod.rs'),
  /apply_without_read_auto_reads_then_waits/
);
assert.match(ui, /atrEditTargetChipHtml/);
assert.match(ui, /openAtrWbLoginInline/);
assert.match(ui, /cmd_workbuddy_local_oauth_start/);
assert.match(ui, /cmd_workbuddy_local_oauth_poll/);
assert.match(ui, /登录 WorkBuddy/);
assert.match(ui, /data-ha2-atr-wb-login/);
assert.doesNotMatch(ui, /就地配置编辑密钥/);
assert.doesNotMatch(ui, /data-ha2-atr-key-setup/);
assert.match(ui, /function atrRuntimeOn/);
assert.match(ui, /promoteWorkModeForEditGoal/);
assert.match(ui, /ha2AutoSwitchedWork/);
assert.match(ui, /Keep visible after flipping to 对话/);

const store = read('src/js/features/now/home-agent-v2-store.js');
assert.match(store, /WORK_MODE_KEY/);
assert.match(store, /loadWorkMode/);
assert.match(store, /persistWorkMode/);
assert.match(store, /state\.workMode = loadWorkMode/);
assert.match(ui, /ha2-mode-row--segment/);
assert.match(ui, /workModeSegmentHtml/);
assert.match(ui, /ha2ModeChat/);
assert.match(ui, /ha2ModeWork/);
assert.match(ui, /do not force edit/);
assert.match(ui, /dispatchEditModeSend|routeToChatInsteadOfEdit/);
{
  const routeChat = ui.match(
    /function routeToChatInsteadOfEdit\([\s\S]*?\n  \/\*\*[\s\S]*?Work-mode send/
  );
  assert.ok(routeChat, 'routeToChatInsteadOfEdit block');
  // Keep 工作 mode — answer via chat channel only, do not flip UI to 对话.
  assert.doesNotMatch(routeChat[0], /setWorkMode\(\s*['"]think['"]\s*\)/);
  assert.match(routeChat[0], /ha2WorkKeptChatAnswer|仍在「工作」/);
}
{
  const pageSend = ui.match(
    /function sendWbPageDraft\([\s\S]*?\n  function stopWbLocalStream/
  );
  assert.ok(pageSend, 'sendWbPageDraft block');
  assert.match(pageSend[0], /promoteWorkModeForEditGoal/);
  assert.match(pageSend[0], /workMode[\s\S]*=== 'edit'/);
  assert.match(pageSend[0], /dispatchEditModeSend/);
  assert.match(ui, /abandonAndStartAgentTask|startConfirmedWorkTask/);
}
assert.match(
  read('src/js/features/now/home-agent-capabilities.js'),
  /chat.*think|m === 'chat'/
);
assert.match(
  read('src/js/features/now/home-agent-capabilities.js'),
  /looksLikeWorkspaceEditGoal/
);
assert.match(store, /编辑任务进行中/);
assert.match(store, /abandonAndStartAgentTask/);
assert.match(store, /abandon_and_send/);
assert.match(store, /preflightAtrStart/);
assert.match(store, /旧任务已放弃，新任务未创建/);
assert.match(store, /放弃并发送草稿/);
assert.match(store, /workbuddy_unconfigured/);
assert.match(store, /请先登录 WorkBuddy/);
assert.match(store, /persistAutonomous/);
assert.match(store, /writePermissionMode/);
assert.match(store, /agentTaskStack/);
assert.match(store, /rememberAgentTask/);

const task = read('src/js/features/now/home-agent-task.js');
assert.match(task, /v === '0'/);
assert.match(task, /readPermissionMode/);
assert.match(task, /persistAutonomous/);
assert.match(
  read('src-tauri/src/agent_task_runtime/engine.rs'),
  /identical_tool_streak_from_events/
);
assert.match(
  read('src-tauri/src/agent_task_runtime/workbuddy.rs'),
  /Model-first: no content hijack/
);
assert.match(
  read('src-tauri/src/agent_task_runtime/workbuddy.rs'),
  /scripted_readme_never_hijacks_model/
);
assert.match(
  read('src-tauri/src/agent_task_runtime/tools.rs'),
  /export_to_desktop/
);
assert.match(
  read('src-tauri/src/agent_task_runtime/contracts.rs'),
  /persist_autonomous/
);
assert.match(
  read('src-tauri/src/agent_task_runtime/store.rs'),
  /permission_mode=\?15/
);

const appIpc = read('src-tauri/permissions/app-ipc.toml');
assert.match(appIpc, /allow-cmd-agent-task-drive"/);
assert.match(appIpc, /allow-cmd-agent-task-probe-workbuddy"/);
assert.match(appIpc, /allow-cmd-agent-task-ensure-verify-sandbox"/);
assert.match(appIpc, /allow-cmd-agent-task-evaluate-verify"/);

console.log('test-atr-provider-switch: ok');
