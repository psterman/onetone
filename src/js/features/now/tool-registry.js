(function (global) {
  'use strict';
  /**
   * Workspace tools execute inside Rust ATR (executor atr_internal).
   * FE may only invoke atr_turn / atr_verify / model_chat / research+network tools.
   */
  var defs = {
    inspect_workspace: {
      modes: ['chat', 'work'], permission: 'workspace_read',
      executor: 'atr_internal', retryable: true, cancellable: true,
      timeoutMs: 30000, required: [],
      inputSchema: { type: 'object', additionalProperties: true }
    },
    read_file: {
      modes: ['chat', 'work'], permission: 'workspace_read',
      executor: 'atr_internal', retryable: true, cancellable: true,
      timeoutMs: 30000, required: ['path'],
      inputSchema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } }
    },
    search_code: {
      modes: ['chat', 'work'], permission: 'workspace_read',
      executor: 'atr_internal', retryable: true, cancellable: true,
      timeoutMs: 60000, required: ['query'],
      inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } }
    },
    inspect_diff: {
      modes: ['work'], permission: 'workspace_read',
      executor: 'atr_internal', retryable: true, cancellable: true,
      timeoutMs: 30000, required: [],
      inputSchema: { type: 'object', additionalProperties: true }
    },
    propose_changes: {
      modes: ['work'], permission: 'workspace_write',
      executor: 'atr_internal', retryable: false, cancellable: true,
      timeoutMs: 60000, required: [],
      inputSchema: { type: 'object', additionalProperties: true }
    },
    apply_patch: {
      modes: ['work'], permission: 'workspace_write',
      executor: 'atr_internal', retryable: false, cancellable: false,
      timeoutMs: 60000, required: [],
      inputSchema: { type: 'object', additionalProperties: true }
    },
    run_check: {
      modes: ['work'], permission: 'workspace_execute',
      executor: 'atr_internal', retryable: true, cancellable: true,
      timeoutMs: 120000, required: [],
      inputSchema: { type: 'object', additionalProperties: true }
    },
    export_to_desktop: {
      modes: ['work', 'research'], permission: 'workspace_write',
      executor: 'atr_internal', retryable: false, cancellable: true,
      timeoutMs: 60000, required: [],
      inputSchema: { type: 'object', additionalProperties: true }
    },
    request_user_input: {
      modes: ['chat', 'work'], permission: 'none',
      executor: 'atr_internal', retryable: false, cancellable: true,
      timeoutMs: 0, required: [],
      inputSchema: { type: 'object', additionalProperties: true }
    },
    deliver_to_agent: {
      modes: ['chat', 'work'], permission: 'deliver',
      executor: 'atr_internal', retryable: false, cancellable: true,
      timeoutMs: 15000, required: ['text'],
      inputSchema: {
        type: 'object',
        required: ['text'],
        properties: { text: { type: 'string' }, kind: { type: 'string' } }
      }
    },
    web_search: {
      modes: ['chat', 'work', 'research'], permission: 'network_read',
      executor: 'atr_internal', retryable: true, cancellable: true,
      timeoutMs: 45000, required: ['query'],
      budgetKind: 'search',
      inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } }
    },
    fetch_url: {
      modes: ['chat', 'work', 'research'], permission: 'network_read',
      executor: 'atr_internal', retryable: true, cancellable: true,
      timeoutMs: 45000, required: ['url'],
      budgetKind: 'fetch',
      inputSchema: { type: 'object', required: ['url'], properties: { url: { type: 'string' } } }
    },
    model_chat: {
      modes: ['chat', 'work', 'research'], permission: 'model',
      executor: 'model_chat', retryable: true, cancellable: true,
      timeoutMs: 120000, required: ['messages'],
      budgetKind: 'model',
      inputSchema: { type: 'object', required: ['messages'] }
    },
    network_diagnostics: {
      modes: ['chat', 'work', 'research'], permission: 'local_read',
      executor: 'cmd_network_diagnostics', retryable: true, cancellable: true,
      timeoutMs: 20000, required: [],
      inputSchema: { type: 'object' }
    },
    ping_host: {
      modes: ['chat', 'work', 'research'], permission: 'network_read',
      executor: 'cmd_network_ping', retryable: true, cancellable: true,
      timeoutMs: 15000, required: ['host'],
      inputSchema: { type: 'object', required: ['host'] }
    },
    dns_check: {
      modes: ['chat', 'work', 'research'], permission: 'network_read',
      executor: 'cmd_network_dns_check', retryable: true, cancellable: true,
      timeoutMs: 15000, required: ['host'],
      inputSchema: { type: 'object', required: ['host'] }
    },
    proxy_status: {
      modes: ['chat', 'work', 'research'], permission: 'local_read',
      executor: 'cmd_network_proxy_status', retryable: true, cancellable: true,
      timeoutMs: 10000, required: [],
      inputSchema: { type: 'object' }
    },
    // Meta drive IPC — not a workspace mutation. Chat lane must be able to step ATR.
    atr_turn: {
      modes: ['chat', 'work'], permission: 'model',
      executor: 'cmd_agent_task_drive', retryable: true, cancellable: true,
      timeoutMs: 180000, required: ['taskId'],
      budgetKind: 'model',
      inputSchema: { type: 'object', required: ['taskId'] }
    },
    atr_tool_call: {
      modes: ['chat', 'work'], permission: 'model',
      executor: 'cmd_agent_task_drive', retryable: true, cancellable: true,
      timeoutMs: 180000, required: ['taskId'],
      inputSchema: { type: 'object', required: ['taskId'] }
    },
    atr_verify: {
      modes: ['work'], permission: 'workspace_read',
      executor: 'cmd_agent_task_evaluate_verify', retryable: true, cancellable: true,
      timeoutMs: 60000, required: ['taskId'],
      inputSchema: { type: 'object', required: ['taskId'] }
    },
    finish: {
      modes: ['chat', 'work', 'research'], permission: 'none',
      executor: null, retryable: false, cancellable: false,
      timeoutMs: 0, required: [],
      inputSchema: { type: 'object' }
    },
    clarify: {
      modes: ['chat', 'work', 'research'], permission: 'none',
      executor: null, retryable: false, cancellable: false,
      timeoutMs: 0, required: [],
      inputSchema: { type: 'object' }
    }
  };

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function aliasToolId(id) {
    id = String(id || '');
    if (id === 'search') return 'web_search';
    if (id === 'fetch') return 'fetch_url';
    return id;
  }

  function get(id) {
    id = aliasToolId(id);
    return defs[id] ? Object.assign({ id: id }, clone(defs[id])) : null;
  }

  function resolve(id) {
    var d = get(id);
    if (!d) return { ok: false, code: 'unknown_tool' };
    return { ok: true, tool: d };
  }

  function list(mode) {
    return Object.keys(defs).map(get).filter(function (d) {
      return !mode || d.modes.indexOf(mode) >= 0;
    });
  }

  function validate(id, input, mode) {
    var resolved = resolve(id);
    if (!resolved.ok) return resolved;
    var d = resolved.tool;
    if (mode && d.modes.indexOf(mode) < 0) return { ok: false, code: 'tool_not_allowed' };
    if (input != null && (typeof input !== 'object' || Array.isArray(input))) {
      return { ok: false, code: 'invalid_arguments' };
    }
    var args = input || {};
    var req = d.required || [];
    for (var i = 0; i < req.length; i++) {
      var key = req[i];
      if (args[key] == null || args[key] === '') {
        return { ok: false, code: 'missing_field', field: key };
      }
    }
    return { ok: true, tool: d };
  }

  function checkPermission(id, mode, granted) {
    var resolved = resolve(id);
    if (!resolved.ok) return resolved;
    var need = resolved.tool.permission || 'none';
    if (need === 'none') return { ok: true, tool: resolved.tool };
    if (mode && resolved.tool.modes.indexOf(mode) < 0) {
      return { ok: false, code: 'tool_not_allowed' };
    }
    if (Array.isArray(granted) && granted.indexOf(need) < 0 && granted.indexOf('*') < 0) {
      return { ok: false, code: 'permission_denied', permission: need };
    }
    return { ok: true, tool: resolved.tool };
  }

  function actionSchema(mode) {
    return list(mode).map(function (d) {
      return {
        name: d.id,
        description: d.id,
        parameters: d.inputSchema || { type: 'object', additionalProperties: true, required: d.required || [] }
      };
    });
  }

  global.OneToneToolRegistry = {
    get: get,
    resolve: resolve,
    list: list,
    validate: validate,
    checkPermission: checkPermission,
    actionSchema: actionSchema,
    aliasToolId: aliasToolId,
    __testOnly: { defs: defs }
  };
})(typeof window !== 'undefined' ? window : globalThis);
