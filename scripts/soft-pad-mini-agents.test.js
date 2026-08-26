'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var html = fs.readFileSync(path.join(root, 'src/codex-micro-overlay.html'), 'utf8');
var css = fs.readFileSync(path.join(root, 'src/css/codex-micro-overlay.css'), 'utf8');
var rust = fs.readFileSync(path.join(root, 'src-tauri/src/codex_micro_overlay.rs'), 'utf8');
var overlayCmd = fs.readFileSync(
  path.join(root, 'src-tauri/src/ipc/commands/shell/codex_micro_overlay_cmd.rs'),
  'utf8'
);
var fmt = require(path.join(root, 'src/js/features/agent/usage-format.js'));

['codex', 'claude', 'cursor', 'copilotCli', 'gemini', 'minimax', 'workbuddy', 'trae', 'traeCode', 'windsurf', 'qoder', 'cline', 'opencode', 'aider'].forEach(function (kind) {
  assert.ok(html.includes('data-agent="' + kind + '"'), 'missing agent chip: ' + kind);
});
assert.ok(html.includes('id="overlayAppMeta"') && html.includes('id="overlayLightGate"'));
assert.ok(
  html.indexOf('id="overlayAppMeta"') < html.indexOf('id="overlayLightGate"') &&
    html.indexOf('id="overlayLightGate"') < html.indexOf('id="overlayToast"'),
  'app-meta must sit above light-gate in pad stack (no overlay occlusion)'
);
assert.ok(html.includes('function pickLightGateFail'), 'bottleneck prefers Applied over misleading hook');
assert.ok(html.includes('未收到 Claude Hook') || html.includes('pickLightGateFail'), 'hook detail honest when not Claude');
assert.ok(html.includes('function applyMiniAgentChips'));
assert.ok(html.includes('function applyMiniUsagePill'));
assert.ok(html.includes('function pickMiniUsageKind'));
assert.ok(html.includes('function contextAgentKind'), 'IDE/applied context before tip-pin');
assert.ok(html.includes('function shouldShowUsageFocusChrome'), 'focus chrome gate');
assert.ok(
  /function resolveUsageFocus\(s\)\{[\s\S]*?contextAgentKind\(s\)[\s\S]*?usageFocusPinned/.test(html),
  'resolveUsageFocus: context must beat tip-pin'
);
{
  var chromeFn = html.match(/function shouldShowUsageFocusChrome\([\s\S]*?\n    \}/);
  assert.ok(chromeFn, 'shouldShowUsageFocusChrome body');
  assert.ok(!chromeFn[0].includes('usageFocusPinned'), 'focus chrome must not use sticky tip-pin');
  assert.ok(chromeFn[0].includes('ctx') || chromeFn[0].includes('context'), 'focus chrome follows IDE context');
}
assert.ok(html.includes('function applyUsageCaptionIdle') || html.includes('usageCaptionIdle'));
assert.ok(html.includes('usage-format.js'));
assert.ok(html.includes('OneToneUsageFormat') || html.includes('formatResetCountdown'));
assert.ok(html.includes('id="miniUsagePill"'));
assert.ok(html.includes('usageSummary(kind,usage'));
assert.ok(html.includes('pinUsageFocusOnHover') && html.includes('chipFocusActionLine'), 'hover pin + short focus tip');
assert.ok(!html.includes('id="overlayUsageRail"'), 'usage rail must be removed');
assert.ok(!html.includes('data-usage-tab='), 'usage tabs must be removed');
assert.ok(!html.includes('function applyUsageRail'), 'applyUsageRail must be removed');
assert.ok(html.includes('cmd_soft_pad_focus_agent'));
assert.ok(html.includes('focusedUsageAgent') || html.includes('onetoneFocusedUsageAgent'));
assert.ok(html.includes('usageFocusPinned') || html.includes('onetoneUsageFocusPinned'));
assert.ok(html.includes('is-usage-focus') || html.includes('setUsageFocusFromUi'));
assert.ok(fmt.windowQuotaLabel, 'windowQuotaLabel missing');
assert.strictEqual(fmt.windowQuotaLabel({ kind: 'primary', durationMins: 10080, remainingPercent: 35 }), '周余35%');
assert.strictEqual(fmt.windowQuotaLabel({ kind: 'primary', durationMins: 300, remainingPercent: 76 }), '5h余76%');
assert.ok(!String(fmt.windowQuotaLabel({ durationMins: 10080, remainingPercent: 35 })).includes('10080'));
assert.ok(css.includes('soft-pad-agent-bar'));
assert.ok(css.includes('soft-pad-agent-bar__chip'));
assert.ok(html.includes('icons/app-target/codex.png') && html.includes('icons/app-target/claude.png') && html.includes('icons/app-target/cursor.png'));
assert.ok(!html.includes('codex-glyph.svg') && !html.includes('claude-glyph.svg') && !html.includes('cursor-glyph.svg'));
assert.ok(!html.includes('soft-pad-agent-bar__abbr'));
assert.ok(css.includes('is-usage-focus'));
assert.ok(!css.includes('.overlay-usage-rail {') && !css.includes('.overlay-usage-rail{'), 'rail CSS must be gone');
assert.ok(fs.existsSync(path.join(root, 'src/icons/app-target/codex.png')));
assert.ok(fs.existsSync(path.join(root, 'src/icons/app-target/claude.png')));
assert.ok(fs.existsSync(path.join(root, 'src/icons/app-target/cursor.png')));
var padUi = fs.readFileSync(path.join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');
assert.ok(padUi.includes('cmd_cursor_hook_setup_status'));
assert.ok(padUi.includes('AGENT_LIGHT_SPECS') || padUi.includes("renderAgentLightRow('cursor'"));
assert.ok(padUi.includes('workbuddyStatusLightsEnabled'));
assert.ok(
  /workbuddyStatusLightsEnabled:\s*true/.test(padUi) &&
    /traeStatusLightsEnabled:\s*true/.test(padUi) &&
    /qoderStatusLightsEnabled:\s*true/.test(padUi),
  'Shell three status lights default on in ensurePad'
);
assert.ok(padUi.includes("agent === 'cursor'") || padUi.includes('softPadCursorConnect'));
assert.ok(!html.includes('模型未知'));
assert.ok(!html.includes('账户余额'));
assert.ok(!html.includes('id="miniLeds"'));
assert.ok(html.includes('overlay-mini__expand-icon'), 'mini expand uses expand icon');
assert.ok(!html.includes('overlay-mini__switch'), 'mini expand must not look like a power switch');
var miniFn = html.match(/function applyMiniAgentChips\(s\)\{[\s\S]*?\n    \}/);
assert.ok(miniFn, 'applyMiniAgentChips body missing');
assert.ok(!/appAgent|app_agent|appStatus|app_status/.test(miniFn[0]), 'mini chips must not read singleton appAgent/appStatus');
assert.ok(
  html.includes('el.hidden = !lightsOn') ||
    html.includes('el.hidden=!lightsOn') ||
    (html.includes('lightsOn') && html.includes('plan.hidden') && html.includes('lightsEnabled')),
  'all agents gate on lightsEnabled'
);
assert.ok(!/if\s*\(\s*SHELL_LIGHT_AGENTS\[kind\]\s*\)\s*\{\s*el\.hidden/.test(html), 'Codex/Claude/Cursor must not stay always-visible');
assert.ok(html.includes('isRenderableUsage') || html.includes('hasRenderable'));
assert.ok(!/if\s*\(\s*kind\s*===\s*['"]claude['"]\s*\)\s*return\s*false/.test(html), 'Claude must not be hard-blocked for mini pill');
assert.ok(html.includes('Number.isFinite') || html.includes('isFinite'));
assert.ok(html.includes('claudeOtelBits') || html.includes('本会话'));
assert.ok(html.includes('额度未同步') || html.includes('无官方额度') || html.includes('用量暂无接口'));
assert.ok(html.includes('claudeFallbackCaption') || html.includes('额度未同步'));
assert.ok(css.includes('.overlay-mini__agent[data-status="needs_input"]'));
assert.ok(css.includes('.overlay-mini__agent[data-status="running"]'));
assert.ok(css.includes('.overlay-mini__usage'));
assert.ok(css.includes('text-overflow: ellipsis') || css.includes('text-overflow:ellipsis'));
assert.ok(rust.includes('pub agents: Vec<CodexMicroAgentSnapshot>'));
assert.ok(rust.includes('fn agent_chip_snapshots('));
assert.ok(rust.includes('primary_state_for(kind)'));
assert.ok(rust.includes('agent_model_metadata::snapshot'));
assert.ok(rust.includes('headline_label') || rust.includes('headline_for_agent'));
assert.ok(rust.includes('AgentKind::Codex') && rust.includes('AgentKind::Claude') && rust.includes('AgentKind::Cursor'));
assert.ok(rust.includes('AgentKind::WorkBuddy') && rust.includes('AgentKind::Trae') && rust.includes('AgentKind::Windsurf') && rust.includes('AgentKind::Qoder'));
assert.ok(rust.includes('workbuddy_status_lights_enabled'));
assert.ok(rust.includes('windsurf_status_lights_enabled'));
assert.ok(
  rust.includes('sync_minimax_inferred_lifecycle') &&
    rust.includes('Quota lamp only') &&
    !/want = lights && crate::app_identity::minimax_code_process_running/.test(rust),
  'MiniMax stays idle quota lamp — no process→running impersonation'
);
assert.ok(
  /WorkBuddy \| AgentKind::Qoder[\s\S]{0,80}OfficialHook/.test(rust) ||
    /else if matches!\(kind, AgentKind::WorkBuddy \| AgentKind::Qoder\)/.test(rust),
  'WorkBuddy/Qoder motion lamp gated on OfficialHook'
);
assert.ok(
  !/else if matches!\(kind, AgentKind::WorkBuddy \| AgentKind::TraeCode \| AgentKind::Qoder\)/.test(
    rust
  ),
  'TraeCode no longer OfficialHook-only for motion lamp'
);
assert.ok(
  rust.includes('last_mapping_id.is_empty()') ||
    /if last_mapping_id\.is_empty\(\)/.test(rust),
  'expand/minimize sticky across Soft Pad mapping FG switches'
);
assert.ok(
  rust.includes('sync_shell_inferred_lifecycle'),
  'overlay tick syncs shell inferred lifecycle'
);
assert.ok(rust.includes('hook_configured'), 'overlay snapshot exposes hook_configured');
var shellProc = fs.readFileSync(
  path.join(root, 'src-tauri/src/pad_status/adapters/shell_agent_process.rs'),
  'utf8'
);
var padStore = fs.readFileSync(path.join(root, 'src-tauri/src/pad_status/store.rs'), 'utf8');
var appId = fs.readFileSync(path.join(root, 'src-tauri/src/app_identity.rs'), 'utf8');
assert.ok(
  shellProc.includes('infer_busy_from_mtime_age') &&
    padStore.includes('SHELL_AGENT_MTIME_BUSY_MS') &&
    padStore.includes('60_000') &&
    appId.includes('process_running_by_exe') &&
    shellProc.includes('process_running_by_exe'),
  'Shell three process+mtime fallback'
);
var rankJs = fs.readFileSync(path.join(root, 'src/js/features/agent/soft-pad-agent-bar-rank.js'), 'utf8');
assert.ok(
  /PLACEHOLDER_KINDS\s*=\s*\[[^\]]*workbuddy[^\]]*traeCode[^\]]*qoder/.test(rankJs) ||
    (rankJs.includes("'workbuddy'") &&
      rankJs.includes("'traeCode'") &&
      rankJs.includes("'qoder'") &&
      rankJs.includes('PLACEHOLDER_KINDS')),
  'PLACEHOLDER_KINDS includes Hook shell agents (not Trae Work)'
);
assert.ok(html.includes('cmd_soft_pad_open_shell_hook'), 'placeholder click opens shell hook panel');
assert.ok(
  padUi.includes('softPadAgentLightsMatrix') || padUi.includes('进程+mtime'),
  'Soft Pad agent lights help matrix'
);
var docs = fs.readFileSync(path.join(root, 'docs/soft-pad-shell-agents-hook-setup.md'), 'utf8');
assert.ok(docs.includes('Process Fallback') || docs.includes('进程不在'), 'docs honest Hook 2-state + fallback');
assert.ok(docs.includes('60s') || docs.includes('60 s'), 'docs mention 60s mtime busy window');
assert.ok(rust.includes('cmd_soft_pad_focus_agent') || overlayCmd.includes('cmd_soft_pad_focus_agent'));
assert.ok(/OVERLAY_WIDTH_MINI:\s*f64\s*=\s*(24[0-9]|3[0-9]{2})\.0/.test(rust), 'mini width constant present');
assert.ok(/OVERLAY_HEIGHT_MINI:\s*f64\s*=\s*44\.0/.test(rust), 'mini height should stay 44');
assert.ok(/OVERLAY_HEIGHT_FULL:\s*f64\s*=\s*6[5-9][0-9]\.0|OVERLAY_HEIGHT_FULL:\s*f64\s*=\s*[7-9][0-9]{2}\.0/.test(rust), 'full height must clear caption+gate');
assert.ok(/align-items:\s*flex-start/.test(css), 'pad stack top-packs so bottom caption is not centered-clipped');
assert.ok(/providerBalanceCaption\(usage\)/.test(html) && /usageCaptionText/.test(html), 'caption path present');
assert.ok(/balCap=kind==='claude'\?providerBalanceCaption/.test(html) || /Prefer official balance/.test(html), 'caption prefers DeepSeek balance over OTel');
assert.ok(overlayCmd.includes('cmd_soft_pad_focus_agent'));
assert.ok(overlayCmd.includes('MINIMAX_APP_TARGET_ID'));
assert.ok(rust.includes('foreground_agent'));
assert.ok(rust.includes('parse_minimax_config_model_label') || fs.readFileSync(path.join(root, 'src-tauri/src/agent_model_metadata.rs'), 'utf8').includes('parse_minimax_config_model_label'));
assert.ok(overlayCmd.includes('CLAUDE_CODE_APP_TARGET_ID'));
assert.ok(overlayCmd.includes('CURSOR_APP_TARGET_ID'));
assert.ok(overlayCmd.includes('focus_composer_only'));

assert.strictEqual(fmt.formatResetCountdown(Math.floor(Date.now() / 1000) - 10), '待刷新');
assert.ok(/^2h/.test(fmt.formatResetCountdown(Math.floor(Date.now() / 1000) + 2 * 3600 + 90)));

assert.ok(html.includes('soft-pad-agent-bar-rank.js'));
assert.ok(html.includes('id="padAgentBarMore"'));
assert.ok(html.includes('id="padAgentBarOverflow"'));
assert.ok(html.includes('id="miniAgentMore"'));
assert.ok(html.includes('function layoutPadAgentBar'));
assert.ok(html.includes('function layoutMiniAgentBar'));
assert.ok(html.includes('function touchAgentBarRecency'));
assert.ok(html.includes('noteForegroundRecency') || html.includes('foregroundAgent'));
assert.ok(html.includes('setAgentBarExpanded') || html.includes('setAgentBarOverflowOpen'));
assert.ok(html.includes('is-expanded') || html.includes('agentBarExpanded'), 'pad bar two-row expand');
assert.ok(
  /el\.hidden=expanded\?/.test(html) || /el\.hidden=expanded \?/.test(html) || html.includes('laid.topSet[k]'),
  'pad folds to top6 unless expanded'
);
assert.ok(!html.includes('padAgentBarMore.hidden=true;\n        setAgentBarOverflowOpen'), 'pad no longer force-hides +N');
assert.ok(
  html.includes("padAgentBarMore.textContent='⌃'") ||
    html.includes('padAgentBarMore.textContent="⌃"') ||
    /data-collapse/.test(html),
  'expanded pad uses compact collapse control (not full-row 收起)'
);
assert.ok(!/padAgentBarMore\.textContent=['"]收起['"]/.test(html), 'no full-width 收起 label on more button');

assert.ok(
  html.includes('miniAgentMore.hidden=false') || /rest\.length/.test(html),
  'mini +N uses Rank rest length'
);
assert.ok(html.includes('id="miniUsageFresh"'), 'freshness dot');
assert.ok(html.includes('id="miniQuotaDropdown"'), 'quota dropdown');
assert.ok(html.includes('quota_menu') || html.includes('providerQuotas'), 'multi-provider pill path');
assert.ok(html.includes('data-placeholder'), 'placeholder chips for copilot/gemini');
assert.ok(
  /display:\s*flex/.test(css.match(/\.soft-pad-agent-bar\s*\{[^}]+\}/)[0]) &&
    /flex-wrap:\s*nowrap/.test(css.match(/\.soft-pad-agent-bar\s*\{[^}]+\}/)[0]),
  'collapsed agent bar is a single nowrap row'
);
assert.ok(/\.soft-pad-agent-bar\.is-expanded\s*\{[^}]*flex-wrap:\s*wrap/.test(css), 'expanded agent bar wraps to two rows');
assert.ok(
  /flex:\s*1\s+1\s+0/.test(css) &&
    /aspect-ratio:\s*1\s*\/\s*1/.test(css) &&
    /max-width:\s*34px/.test(css),
  'expand chips adaptively fill one row as squares'
);
assert.ok(!/grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/.test(css), 'agent bar must not stretch chips with 1fr');
assert.ok(!/grid-template-columns:\s*repeat\(4,\s*34px\)/.test(css), 'agent bar is no longer 2×4 grid');
assert.ok(/\.soft-pad-agent-bar__more[\s,{]/.test(css));
assert.ok(!/\.soft-pad-agent-bar__more,\s*\n?\.soft-pad-agent-bar__overflow\s*\{\s*display:\s*none\s*!important/.test(css), 'pad +N must be visible when unhidden');
assert.ok(/width:\s*6px/.test(css) && /height:\s*6px/.test(css), 'status dot 6px');
assert.ok(css.includes('soft-pad-chip-status-flash') || css.includes('is-status-flash'));
assert.ok(css.includes('soft-pad-chip-breathe') && css.includes('soft-pad-mini-agent-breathe'), 'running chip breathe');
assert.ok(/\.soft-pad-agent-bar__chip\[data-status="running"\]\s*\{[^}]*scale\(1\.18\)/.test(css), 'running chip larger');
assert.ok(/\.overlay-mini__agent\[data-status="running"\]\s*\{/.test(css), 'mini running style');
assert.ok(/\.soft-pad-agent-bar__chip\[data-status="done"\]\s*\{/.test(css), 'done lasting ring on pad');
assert.ok(/\.overlay-mini__agent\[data-status="done"\]\s*\{/.test(css), 'done lasting ring on mini');
assert.ok(html.includes("el.classList.contains('overlay-mini__agent')"), 'done flash applies to mini');
assert.ok(
  html.includes("wrap.classList.remove('ot-status-pulse'") ||
    html.includes('wrap.classList.remove("ot-status-pulse"'),
  'chassis must not breathe from rgbPulse'
);
assert.ok(!/wrap\.classList\.toggle\('ot-status-pulse'/.test(html), 'no wrap breathing toggle');
assert.ok(css.includes('overlay-mini__more'));
assert.ok(css.includes('overlay-mini__fresh') && css.includes('is-stale'), 'freshness styles');
assert.ok(css.includes('overlay-mini__quota-dd'), 'quota dropdown styles');
assert.ok(css.includes('data-placeholder') || css.includes('[data-placeholder="1"]'), 'placeholder chip styles');
assert.ok(!/\.overlay-mini__more\s*\{\s*display:\s*none\s*!important/.test(css), 'mini +N must be visible when unhidden');

var rank = require(path.join(root, 'src/js/features/agent/soft-pad-agent-bar-rank.js'));
function lit(kind, state, updated) {
  return { lightsEnabled: true, state: state || 'idle', updatedAt: updated || 0 };
}
rank.resetStickyOrder();
var byKind = {
  codex: lit('codex', 'idle', 1),
  claude: lit('claude', 'needs_input', 1),
  cursor: lit('cursor', 'running', 1),
  minimax: lit('minimax', 'idle', 1),
  workbuddy: lit('workbuddy', 'idle', 1),
  trae: lit('trae', 'idle', 1),
  qoder: lit('qoder', 'idle', 1)
};
var r1 = rank.rankPadAgentBarKinds({}, byKind, 'codex', {});
assert.deepStrictEqual(
  r1.top,
  ['codex', 'claude', 'cursor', 'minimax', 'workbuddy', 'trae'],
  'stable catalog order — no state/focus reshuffle'
);
assert.deepStrictEqual(r1.rest, ['qoder'], 'fold remainder into rest for +N');
assert.strictEqual(r1.top.length, 6, 'VISIBLE_PAD=6');
assert.deepStrictEqual(
  rank.CATALOG.slice(0, 5),
  ['codex', 'claude', 'cursor', 'copilotCli', 'gemini'],
  'catalog order includes copilotCli + gemini'
);
assert.ok(rank.CATALOG.indexOf('cline') >= 0 && rank.CATALOG.indexOf('aider') >= 0, 'catalog includes cline/opencode/aider');

rank.resetStickyOrder();
var r2a = rank.rankPadAgentBarKinds({}, byKind, 'minimax', {});
var r2b = rank.rankPadAgentBarKinds(
  {},
  Object.assign({}, byKind, { claude: lit('claude', 'idle', 9), cursor: lit('cursor', 'done', 9) }),
  'minimax',
  { claude: Date.now(), cursor: Date.now() }
);
assert.deepStrictEqual(r2a.top, r2b.top, 'state/recency must not reshuffle sticky order');
assert.deepStrictEqual(r2a.rest, r2b.rest, 'rest stays sticky too');

rank.resetStickyOrder();
var r3 = rank.rankPadAgentBarKinds(
  {},
  { codex: lit('codex'), claude: { lightsEnabled: false, state: 'running' } },
  '',
  {}
);
assert.deepStrictEqual(r3.top, ['codex']);
assert.deepStrictEqual(r3.rest, []);

assert.strictEqual(rank.VISIBLE_PAD, 6);
var merged = rank.mergePlaceholderKinds(r3, {}, 6);
assert.deepStrictEqual(
  merged.top,
  ['codex', 'workbuddy', 'traeCode', 'qoder'],
  'shell PLACEHOLDER_KINDS fill remaining top slots (Trae Code Hook CTA, not Trae Work)'
);
assert.deepStrictEqual(merged.rest, [], 'placeholders fit in VISIBLE_PAD');
assert.ok(
  Array.isArray(rank.PLACEHOLDER_KINDS) &&
    rank.PLACEHOLDER_KINDS.indexOf('workbuddy') >= 0 &&
    rank.PLACEHOLDER_KINDS.indexOf('traeCode') >= 0 &&
    rank.PLACEHOLDER_KINDS.indexOf('qoder') >= 0,
  'PLACEHOLDER_KINDS exports Hook shell agents'
);

rank.resetStickyOrder();
assert.strictEqual(
  rank.padLightFromRanked({}, byKind, 'codex', {}),
  'needs_input',
  'pad aura still finds live agent in sticky top (claude), without promoting it'
);
assert.strictEqual(
  rank.padLightFromRanked({}, { codex: lit('codex', 'idle') }, '', {}),
  '',
  'all-idle chips leave pad light to pad/app fallback'
);
assert.ok(html.includes('padLightFromRanked') || html.includes('fromAgents'));

rank.resetStickyOrder();
var idleAll = {
  codex: lit('codex', 'idle', 1),
  claude: lit('claude', 'idle', 2),
  cursor: lit('cursor', 'idle', 3),
  minimax: lit('minimax', 'idle', 4)
};
var rFg = rank.rankPadAgentBarKinds({ foregroundAgent: 'minimax' }, idleAll, '', {});
assert.strictEqual(rFg.top[0], 'minimax', 'FG minimax ranks first among idle agents');
assert.deepStrictEqual(
  rFg.top.slice(1),
  ['codex', 'claude', 'cursor'],
  'non-FG keep sticky relative order'
);
var rFg2 = rank.rankPadAgentBarKinds({ foregroundAgent: 'codex' }, idleAll, '', {});
assert.strictEqual(rFg2.top[0], 'codex', 'new FG pins to front');
assert.deepStrictEqual(
  rFg2.top.slice(1),
  ['claude', 'cursor', 'minimax'],
  'sticky relative order preserved when FG changes'
);
var rNoFg = rank.rankPadAgentBarKinds({}, idleAll, '', {});
assert.deepStrictEqual(
  rNoFg.top,
  ['codex', 'claude', 'cursor', 'minimax'],
  'without FG, restore sticky base order'
);

// Partial-failure dropdown keeps ok + warn rows
var partial = fmt.providerQuotaDropdownRows([
  { provider: 'or', status: 'warn', icon: 'warn', caption: 'OpenRouter · 429' },
  { provider: 'ds', status: 'warn', icon: 'warn', caption: 'DeepSeek · 429' },
  { provider: 'kimi', status: 'offline', icon: 'err', caption: 'Kimi · offline' },
  { provider: 'sf', status: 'ok', icon: 'ok', caption: 'SiliconFlow · 余 $1' }
]);
assert.strictEqual(partial.filter(function (r) { return r.icon === 'ok'; }).length, 1, 'keeps ok row');
assert.strictEqual(partial.filter(function (r) { return r.icon === 'warn'; }).length, 2, 'keeps warn rows');
assert.ok(partial.some(function (r) { return r.icon === 'err' || r.status === 'offline'; }), 'offline still listed');
assert.strictEqual(
  fmt.firstOkQuotaCaption([
    { provider: 'or', status: 'warn', icon: 'warn', caption: 'OpenRouter · 429' },
    { provider: 'ds', status: 'warn', icon: 'warn', caption: 'DeepSeek · 429' },
    { provider: 'kimi', status: 'offline', icon: 'err', caption: 'Kimi · offline' },
    { provider: 'sf', status: 'ok', icon: 'ok', caption: 'SiliconFlow · 余 $1' }
  ]),
  'SiliconFlow · 余 $1'
);
assert.strictEqual(fmt.quotaIconGlyph('ok'), '✓');
assert.strictEqual(fmt.quotaIconGlyph('warn'), '⚠');
assert.strictEqual(fmt.quotaIconGlyph('err'), '✗');

var now = Date.now();
var freshOk = fmt.quotasFreshnessAge(now - 60 * 1000, now);
assert.strictEqual(freshOk.stale, false);
assert.ok(/Updated/.test(freshOk.title));
var freshStale = fmt.quotasFreshnessAge(now - 6 * 60 * 1000, now);
assert.strictEqual(freshStale.stale, true);
assert.strictEqual(freshStale.mins, 6);
assert.strictEqual(freshStale.title, 'Updated 6m ago');

// Vibecoding mini bar: focus ACL + actionable tip + pill refresh
var overlayIpc = fs.readFileSync(
  path.join(root, 'src-tauri/permissions/codex-micro-overlay-ipc.toml'),
  'utf8'
);
assert.ok(overlayIpc.includes('allow-cmd-soft-pad-focus-session'), 'overlay ACL must allow focus_session');
assert.ok(overlayIpc.includes('allow-cmd-codex-micro-overlay-refresh-usage'), 'overlay ACL must allow usage refresh');
assert.ok(html.includes('cmd_soft_pad_focus_session'), 'mini must call focus_session');
assert.ok(html.includes('chipFocusActionLine') || html.includes('点击聚焦'), 'tip action line');
assert.ok(html.includes('本轮失败（不是未接 Hook）') || html.includes('chipFailureHonestyLine'), 'failed tip honesty');
assert.ok(html.includes('cmd_codex_micro_overlay_refresh_usage'), 'pill refresh IPC');
assert.ok(html.includes('refreshUsageFromOverlay') && html.includes('data-pill-action'), 'pill action wiring');
assert.ok(html.includes('未能聚焦'), 'focus failure toast');
assert.ok(rust.includes('pub agents: Vec<CodexMicroAgentSnapshot>'), 'agents snapshot');
assert.ok(overlayCmd.includes('cmd_codex_micro_overlay_refresh_usage'), 'refresh command registered');
assert.ok(css.includes('pointer-events: none') && css.includes('.overlay-agent-tip'), 'tip ignores pointer');

var guide = fs.readFileSync(path.join(root, 'docs/soft-pad-mini-ui-guidelines.md'), 'utf8');
assert.ok(guide.includes('overlayAgentTip') && (guide.includes('点击聚焦') || guide.includes('点击跳转')), 'guidelines match tip contract');
assert.ok(guide.includes('cmd_codex_micro_overlay_refresh_usage'), 'guidelines mention pill refresh');
assert.ok(guide.includes('pinUsageFocusOnHover') || guide.includes('禁止盖条'), 'guidelines ban covering strip');
assert.ok(guide.includes('VISIBLE_PAD') && guide.includes('providerQuotas') && guide.includes('Updated Xm ago'), 'Slice D appendix');
assert.ok(html.includes("kind==='opencode'") && html.includes("return 'OpenCode'"), 'opencode must not fall through to Codex label');
assert.ok(html.includes("kind==='cline'") && html.includes("return 'Cline'"), 'cline label');
assert.ok(html.includes("kind==='aider'") && html.includes("return 'Aider'"), 'aider label');
assert.ok(html.includes('usageSummary(kind,usage||{},true') || html.includes("usageSummary(kind,usage||{},true"), 'pad tip includes usage basics');
assert.ok(/pinUsageFocusOnHover\(kind\)/.test(html) && /isPadChip/.test(html), 'full Soft Pad hover also previews bottom caption');

console.log('soft-pad mini agent tests passed');
