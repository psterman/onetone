/**
 * Unified deep-link into Agent page (overview | data | capsule).
 * Does not invent sessions — only forwards provider/project/session when reliable.
 */
(function (global) {
  'use strict';

  /**
   * @typedef {{
   *   view?: 'overview'|'data'|'capsule',
   *   section?: string|null,
   *   provider?: string|null,
   *   projectId?: string|null,
   *   sessionId?: string|null,
   *   workspace?: string|null
   * }} AgentNavTarget
   */

  function normalize(raw) {
    raw = raw || {};
    var view =
      raw.view === 'data' ? 'data' : raw.view === 'capsule' ? 'capsule' : 'overview';
    var section = raw.section != null ? String(raw.section) : null;
    var provider = raw.provider != null && String(raw.provider).trim() ? String(raw.provider).trim() : null;
    var projectId =
      raw.projectId != null && String(raw.projectId).trim() ? String(raw.projectId).trim() : null;
    var sessionId =
      raw.sessionId != null && String(raw.sessionId).trim() && String(raw.sessionId) !== 'unknown'
        ? String(raw.sessionId).trim()
        : null;
    var workspace =
      raw.workspace != null && String(raw.workspace).trim() ? String(raw.workspace).trim() : null;
    return {
      view: view,
      section: section,
      provider: provider,
      projectId: projectId,
      sessionId: sessionId,
      workspace: workspace
    };
  }

  function open(raw) {
    var target = normalize(raw);
    var SD = global.OneToneSettingsDrawer;
    if (!SD || typeof SD.open !== 'function') return false;
    try {
      SD.open({
        panel: 'agent',
        agentSub:
          target.view === 'data' ? 'data' : target.view === 'capsule' ? 'capsule' : null,
        tmWorkspace: target.workspace || undefined,
        agentTarget: target
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  global.OneToneAgentNavTarget = {
    normalize: normalize,
    open: open
  };
})(typeof window !== 'undefined' ? window : globalThis);
