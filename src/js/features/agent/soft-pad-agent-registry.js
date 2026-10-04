/**
 * Soft Pad face/routing catalog ONLY (kind / appId / connectKind / face caps for pad UI).
 *
 * NOT authoritative for Agent Center install status, version, data path, health,
 * or resolvedCapabilities — those come from cmd_agent_center_snapshot / agent_registry.
 * Do not turn this file into an async IPC registry (Soft Pad boot depends on sync SSOT).
 * Agent Center must not read `caps` from here.
 *
 * Mirrors agent_catalog/mod.rs Soft Pad face rows — update both when adding Soft Pad agents.
 */
(function (global) {
  'use strict';

  /** @typedef {{ topbar: boolean, keys: string, ambient: boolean, session: boolean }} AgentLightsCaps */

  var ENTRIES = [
    { kind: 'codex', appId: 'codex-chat', connectKind: 'codex', caps: { topbar: true, keys: 'preset', ambient: true, session: true } },
    { kind: 'claude', appId: 'claude-code', connectKind: 'claude', caps: { topbar: true, keys: 'preset', ambient: true, session: true } },
    { kind: 'cursor', appId: 'cursor-chat', connectKind: 'cursor', caps: { topbar: true, keys: 'customizable', ambient: true, session: false } },
    { kind: 'minimax', appId: 'minimax-chat', connectKind: 'minimax', caps: { topbar: true, keys: 'unsupported', ambient: true, session: false } },
    { kind: 'workbuddy', appId: 'workbuddy-chat', connectKind: 'shell', caps: { topbar: true, keys: 'shell', ambient: true, session: false } },
    { kind: 'trae', appId: 'trae-work', connectKind: 'solo', caps: { topbar: true, keys: 'unsupported', ambient: true, session: false } },
    { kind: 'traeCode', appId: 'trae-code', connectKind: 'shell', caps: { topbar: true, keys: 'shell', ambient: true, session: false } },
    { kind: 'windsurf', appId: 'windsurf-chat', connectKind: 'solo', caps: { topbar: true, keys: 'unsupported', ambient: true, session: false } },
    { kind: 'qoder', appId: 'qoder-chat', connectKind: 'shell', caps: { topbar: true, keys: 'shell', ambient: true, session: false } },
    { kind: 'gemini', appId: 'gemini-cli', connectKind: 'shell', caps: { topbar: true, keys: 'shell', ambient: true, session: false } },
    { kind: 'cline', appId: 'cline-chat', connectKind: 'shell', caps: { topbar: true, keys: 'shell', ambient: true, session: false } },
    { kind: 'roo', appId: 'roo-chat', connectKind: 'shell', caps: { topbar: true, keys: 'shell', ambient: true, session: false } },
    { kind: 'opencode', appId: 'opencode-chat', connectKind: 'shell', caps: { topbar: true, keys: 'shell', ambient: true, session: false } },
    { kind: 'copilotCli', appId: 'copilot-cli', connectKind: 'shell', caps: { topbar: true, keys: 'shell', ambient: true, session: false } },
    { kind: 'copilotVscode', appId: 'copilot-vscode', connectKind: 'shell', caps: { topbar: true, keys: 'shell', ambient: true, session: false } },
    { kind: 'aider', appId: 'aider-chat', connectKind: 'shell', caps: { topbar: true, keys: 'shell', ambient: true, session: false } }
  ];

  var byKind = Object.create(null);
  ENTRIES.forEach(function (row) {
    byKind[row.kind] = row;
    byKind[String(row.kind).toLowerCase()] = row;
  });

  function listAgentRegistry() {
    return ENTRIES.slice();
  }

  function agentConnectKind(kind) {
    var row = byKind[String(kind || '')] || byKind[String(kind || '').toLowerCase()];
    return row ? row.connectKind : 'shell';
  }

  function agentLightsCapability(kind) {
    var row = byKind[String(kind || '')] || byKind[String(kind || '').toLowerCase()];
    if (!row) {
      return { topbar: false, keys: 'unsupported', ambient: true, session: false };
    }
    return Object.assign({}, row.caps);
  }

  global.OneToneSoftPadAgentRegistry = {
    listAgentRegistry: listAgentRegistry,
    agentConnectKind: agentConnectKind,
    agentLightsCapability: agentLightsCapability
  };
})(typeof window !== 'undefined' ? window : globalThis);
