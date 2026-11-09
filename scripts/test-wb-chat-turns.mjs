/**
 * WorkBuddy chat turn markup — role/body split + first-person「我」.
 * Run: node scripts/test-wb-chat-turns.mjs
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(p, 'utf8');

const winJs = read('src/js/features/now/workbuddy-local-chat-window.js');
const winCss = read('src/css/workbuddy-local-chat.css');
const ha2 = read('src/js/features/now/home-agent-v2.js');
const ha2Css = read('src/css/home-agent-v2.css');
const storeSrc = read('src/js/features/now/home-agent-v2-store.js');

assert.match(winJs, /wb-turn-body/);
assert.match(winJs, /formatChatBodyHtml/);
assert.match(winJs, /wb-turn-plain/);
assert.match(winJs, /wb-avatar-me/);
assert.match(winJs, /wb-avatar-me[\s\S]*?>我</);
assert.doesNotMatch(winJs, /wb-avatar-me[^>]*>我<\/span><span>我<\/span>/);
assert.doesNotMatch(winJs, /: '你'/);
assert.match(winJs, /icons\/app-target\/workbuddy\.png/);

assert.match(winCss, /\.wb-turn--user/);
assert.match(winCss, /\.wb-turn--assistant/);
assert.match(winCss, /\.wb-turn-body/);
assert.match(winCss, /align-self:\s*flex-end/);
assert.match(winCss, /align-self:\s*flex-start/);

assert.match(ha2, /function wbTurnRoleHtml/);
assert.match(ha2, /function wbTurnBodyHtml/);
assert.match(ha2, /formatChatBodyHtml/);
assert.match(ha2, /ha2-md/);
assert.match(ha2, /function wbAssistantLabel/);
assert.match(ha2, /ha2WbRoleSoftPadFallback|Soft Pad→WorkBuddy/);
assert.match(ha2, /ha2WbRoleUser',\s*'我'/);
assert.match(ha2, /WB_CHAT_ICON|icons\/app-target\/workbuddy\.png/);
assert.match(ha2, /ha2-wb-avatar-me/);
assert.match(ha2, /function wbTurnRoleHtml[\s\S]*?modelRouteDisplay\(/);
assert.doesNotMatch(
  ha2,
  /ha2-wb-avatar-me"[^>]*>[\s\S]*?<\/span><span>[\s\S]*?ha2WbRoleUser/
);
assert.match(ha2, /providerId: turn\.providerId/);
assert.doesNotMatch(ha2, /providers\.push\(\{\s*id:\s*'minimax_cn'/);

assert.match(ha2Css, /\.ha2-wb-page-turn--user/);
assert.match(ha2Css, /\.ha2-wb-page-turn--assistant/);
assert.match(ha2Css, /\.ha2-wb-turn--user/);
assert.match(ha2Css, /\.ha2-wb-avatar-me/);

// A backend poll can terminate through onError without a done payload. The
// chat window must still finalize the assistant turn instead of leaving an
// empty bubble and a stuck run.
assert.match(winJs, /onDone\(\{ runId: activeRunId, error: String\(code\), content: '' \}\)/);
assert.match(winJs, /任务已停止，未生成最终回复/);
assert.match(winJs, /if \(busy \|\| streamingId\)/);

// Collapsed tool chips use <details>; flex on details leaves closed body in layout
// (grey strips + per-chip scrollbars). Guard the block display + closed-body hide.
assert.match(
  ha2Css,
  /\.ha2-wb-page-turn--tool\{[\s\S]*?display:\s*block\s*!important;/
);
assert.match(
  ha2Css,
  /details\.ha2-wb-page-turn--tool:not\(\[open\]\)\s*>\s*\*:not\(summary\)\{[\s\S]*?display:\s*none\s*!important;/
);
assert.match(
  ha2Css,
  /\.ha2-tool-step-detail\{[\s\S]*?max-height:\s*none;[\s\S]*?overflow:\s*visible;/
);

// Thinking / answer stay separate while streaming (no CoT dumped into reply bubble).
assert.match(ha2, /wbStreamingReasoning/);
assert.match(ha2, /reasoningSoFar/);
assert.match(ha2, /toolName:\s*'thinking'/);
assert.match(ha2, /function thinkingChipLabel/);
assert.match(ha2, /ha2-wb-page-turn--thinking/);
assert.match(ha2, /ha2ToolThinkingLive',\s*'思考中…'/);
assert.match(ha2, /ha2ToolThinkingDone',\s*'已思考'/);
assert.match(ha2, /ha2-tool-step-label/);
assert.match(ha2, /function ensureChatReplyAfterLatestUser/);
assert.match(ha2, /function ensureLatestChatFinish/);
assert.match(ha2, /fin_' \+ \(tid \|\| eid\)/);
// Live thinking paints as a plain div — not WebView2-fragile <details>.
assert.match(
  ha2,
  /ha2-wb-page-turn--thinking is-live[\s\S]*?data-ha2-thinking="1"/
);
assert.match(ha2, /Don't mirror the same waiting line under the header/);
assert.match(ha2Css, /\.ha2-wb-page-turn--tool\.ha2-wb-page-turn--thinking\.is-live\{/);
assert.match(ha2Css, /overflow:\s*visible/);
// New chat question must abandon+restart, not reuse the previous drive promise.
assert.match(
  storeSrc,
  /atrSendInFlight && !opts\.skipBlockingCheck\) \{\s*if \(chatLane\)/
);
assert.match(storeSrc, /if \(atrSendInFlight === flight\) atrSendInFlight = null/);
assert.match(ha2Css, /\.ha2-wb-page-turn--thinking\{/);
assert.match(ha2Css, /\.ha2-wb-page-turn--thinking \.ha2-tool-step-label/);
// Thinking badge must use ink (not washed-out muted-on-muted).
assert.match(
  ha2Css,
  /\.ha2-wb-page-turn--thinking \.ha2-tool-step-badge\{[\s\S]*?color:\s*var\(--ha2-ink/
);
// Closed thinking chips must still omit body (no grey strips).
assert.match(
  ha2Css,
  /details\.ha2-wb-page-turn--tool:not\(\[open\]\)\s*>\s*\*:not\(summary\)\{[\s\S]*?display:\s*none\s*!important;/
);
// While a thinking chip is live, do not paint a second「正在思考…」answer bubble.
assert.match(ha2, /Keep the reply empty|keep the reply empty|no second grey/i);
// Interrupted chat: one silent resume before recovery card (avoids「没有回复」).
assert.match(ha2, /function tryResumeInterruptedChat/);
assert.match(ha2, /resumeAndDriveAgentTask/);
// Start feedback is a thinking chip, not an empty answer bubble.
assert.match(ha2, /id:\s*'chat_loop_live'[\s\S]*?toolName:\s*'thinking'/);
// Live CoT goes into thinking chip detail; process_trace must not overwrite it.
assert.match(ha2, /kind:\s*'thinking'/);
assert.match(ha2, /id:\s*'trace_'\s*\+\s*tid|trace_'\s*\+\s*tid/);
assert.doesNotMatch(
  ha2,
  /function persistChatProcessTrace[\s\S]*?var rowId = 'think_'\s*\+\s*tid/
);

console.log('test-wb-chat-turns: ok');
