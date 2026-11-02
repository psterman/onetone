/**
 * OneToneModelGateway — provider-neutral model routing for home modes.
 *
 * WorkBuddy remains the first concrete chat transport. Soft Pad's managed
 * freemodel route is represented explicitly and may use a host supplied
 * transport; when that transport is unavailable, callers can fall back to
 * WorkBuddy without changing the controller contract.
 */
(function (global) {
  'use strict';

  var providers = {
    softpad_our_freemodel: {
      id: 'softpad_our_freemodel',
      kind: 'managed',
      source: 'softpad',
      protocol: 'internal',
      label: 'Soft Pad · our freemodel',
      capabilities: { structuredOutput: true, streaming: false, tools: false }
    },
    workbuddy: {
      id: 'workbuddy',
      kind: 'managed',
      source: 'workbuddy',
      protocol: 'workbuddy_chat',
      label: 'WorkBuddy',
      capabilities: { structuredOutput: true, streaming: true, tools: true }
    },
    custom_openai_compatible: {
      id: 'custom_openai_compatible',
      kind: 'custom',
      source: 'user',
      protocol: 'openai_compatible',
      label: '自定义 OpenAI 兼容接口',
      capabilities: { structuredOutput: true, streaming: true, tools: false }
    }
  };

  // Default research/chat to WorkBuddy — Soft Pad freemodel is often empty/unwired
  // and used to make the picker show WorkBuddy while synthesis still hit Soft Pad.
  var routes = {
    intent: 'workbuddy',
    planning: 'workbuddy',
    toolDecision: 'workbuddy',
    review: 'workbuddy',
    repair: 'workbuddy',
    synthesis: 'workbuddy'
  };
  try {
    var savedRoutes = global.localStorage && JSON.parse(global.localStorage.getItem('onetone.modelRoutes') || '{}');
    if (savedRoutes && typeof savedRoutes === 'object') Object.keys(savedRoutes).forEach(function (k) {
      if (providers[savedRoutes[k]]) routes[k] = savedRoutes[k];
    });
  } catch (_) {}

  var host = {
    invoke: null,
    resolveWorkbuddy: null,
    softpadChat: null,
    customChat: null,
    softpadStatus: null,
    configured: false
  };
  var activeStreamCancel = null;

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function providersList() {
    return Object.keys(providers).map(function (id) {
      return clone(providers[id]);
    });
  }

  function registerProvider(raw) {
    if (!raw || !raw.id) return null;
    providers[raw.id] = Object.assign({
      kind: 'custom',
      source: 'user',
      protocol: 'openai_compatible',
      capabilities: { structuredOutput: true, streaming: false, tools: false }
    }, raw);
    return clone(providers[raw.id]);
  }

  function resolveProvider(purpose, requested) {
    var id = requested || routes[purpose] || routes.synthesis || 'workbuddy';
    return clone(providers[id] || providers.workbuddy);
  }

  function configure(opts) {
    opts = opts || {};
    // `'key' in opts` lets tests clear stubs with null without sticky host state.
    if ('invoke' in opts) host.invoke = opts.invoke || null;
    if ('resolveWorkbuddy' in opts) host.resolveWorkbuddy = opts.resolveWorkbuddy || null;
    if ('softpadChat' in opts) host.softpadChat = opts.softpadChat || null;
    if ('customChat' in opts) host.customChat = opts.customChat || null;
    if ('softpadStatus' in opts) host.softpadStatus = opts.softpadStatus || null;
    if (opts.routes) {
      Object.keys(opts.routes).forEach(function (purpose) {
        if (providers[opts.routes[purpose]]) routes[purpose] = opts.routes[purpose];
      });
    }
    host.configured = true;
    return snapshot();
  }

  function snapshot() {
    return {
      providers: providersList(),
      routes: clone(routes),
      configured: host.configured,
      softpad: host.softpadStatus || null
    };
  }

  function refreshStatus() {
    var p = host.invoke ? host.invoke('cmd_assist_status', {}) : invoke('cmd_assist_status', {});
    return Promise.resolve(p).then(function (status) {
      host.softpadStatus = status || null;
      return snapshot();
    });
  }

  function refreshCustomProviders() {
    var p = host.invoke ? host.invoke('cmd_model_provider_snapshot', {}) : invoke('cmd_model_provider_snapshot', {});
    return Promise.resolve(p).then(function (items) {
      (Array.isArray(items) ? items : []).forEach(function (item) {
        registerProvider({
          id: item.id,
          label: item.name || item.id,
          name: item.name || item.id,
          kind: 'custom',
          source: 'user',
          protocol: item.protocol || 'openai_compatible',
          configured: !!item.configured,
          capabilities: {
            structuredOutput: item.supportsJson !== false,
            streaming: !!item.supportsStreaming,
            tools: !!item.supportsTools
          }
        });
      });
      try {
        var saved = JSON.parse(global.localStorage.getItem('onetone.modelRoutes') || '{}');
        Object.keys(saved || {}).forEach(function (purpose) {
          if (providers[saved[purpose]]) routes[purpose] = saved[purpose];
        });
      } catch (_) {}
      return snapshot();
    });
  }

  function normalizeError(err, providerId) {
    err = err || {};
    var raw = String(err.code || err.status || err.message || 'model_error');
    var low = raw.toLowerCase();
    // Default model_error — never label unknown failures as network_error
    // (that made WorkBuddy research show「网络不通」when JSON/API failed).
    var code = 'model_error';
    if (/401|403|auth|unauthor|key|oauth|token/.test(low)) code = 'auth_failed';
    else if (/429|rate/.test(low)) code = 'rate_limited';
    else if (/timeout|timed/.test(low)) code = 'timeout';
    else if (/json|format|schema/.test(low)) code = 'unsupported_format';
    else if (/network|offline|econn|enotfound|fetch failed|dns|socket/.test(low))
      code = 'network_error';
    else if (/no_ipc|ipc_unavailable|tauri invoke unavailable/.test(low)) code = 'no_ipc';
    return {
      ok: false,
      providerId: providerId || err.providerId || null,
      code: code,
      message: String(err.message || raw),
      retryable: /timeout|network|429|rate|no_ipc/.test(code)
    };
  }

  function invoke(cmd, args) {
    if (host.invoke) return host.invoke(cmd, args);
    var ipc = global.OneToneIpc;
    if (!ipc || typeof ipc.invoke !== 'function') {
      return Promise.reject(Object.assign(new Error('no_ipc'), { code: 'no_ipc' }));
    }
    return ipc.invoke(cmd, { args: args || {} });
  }

  function workbuddyChat(req) {
    var resolve = host.resolveWorkbuddy;
    var ready = resolve ? resolve() : Promise.resolve({});
    return ready.then(function (llm) {
      return invoke('cmd_workbuddy_local_chat', {
        accountId: llm && llm.accountId,
        model: (req && req.model) || (llm && llm.model),
        messages: req.messages || [],
        maxTokens: req.maxTokens || 4096
      }).then(function (res) {
        var text = (res && (res.content || res.text || res.message)) || '';
        if (!text && res && res.choices && res.choices[0] && res.choices[0].message) {
          text = res.choices[0].message.content || '';
        }
        return {
          ok: true,
          providerId: 'workbuddy',
          model: (res && (res.model || res.modelId)) || (llm && llm.model) || '',
          text: typeof text === 'string' ? text : JSON.stringify(text),
          usage: res && res.usage,
          finishReason: res && res.finishReason,
          capabilities: providers.workbuddy.capabilities
        };
      });
    });
  }

  function customChat(req) {
    return invoke('cmd_model_provider_chat', {
      providerId: req.providerId,
      model: req.model,
      messages: req.messages || [],
      responseFormat: req.responseFormat || 'text',
      maxTokens: req.maxTokens || 4096,
      temperature: req.temperature
    });
  }

  function softpadPreferredProvider() {
    try {
      return String(
        (global.localStorage &&
          global.localStorage.getItem('onetone.softpadPreferredProvider')) ||
          ''
      ).trim();
    } catch (_) {
      return '';
    }
  }

  function softpadChat(req) {
    var preferred =
      (req && req.preferredProvider) || softpadPreferredProvider() || undefined;
    return invoke('cmd_assist_model_chat', {
      messages: req.messages || [],
      maxTokens: req.maxTokens || 4096,
      deadlineMs: req.deadlineMs || 30000,
      allowMetered: !!req.allowMetered,
      preferredProvider: preferred || null
    });
  }

  function softpadErrCode(err) {
    return String((err && (err.code || err.message || err)) || '').toLowerCase();
  }

  /** FreeOnly catalog is often empty; try Soft Pad metered keys before WorkBuddy. */
  function softpadChatWithMeteredRetry(req) {
    var run = host.softpadChat || softpadChat;
    var first = run(req);
    if (req && req.allowMetered) return first;
    return first.catch(function (err) {
      var code = softpadErrCode(err);
      if (/no_free_model|no_model_provider|provider_disabled/.test(code)) {
        return run(Object.assign({}, req, { allowMetered: true }));
      }
      throw err;
    });
  }

  function signalAborted(signal) {
    return !!(signal && (signal.aborted || signal.aborted === true));
  }

  function chat(req) {
    req = req || {};
    var selected = resolveProvider(req.purpose, req.providerId);
    var started = Date.now();
    var call = null;
    var signal = req.signal || null;
    if (signalAborted(signal)) {
      return Promise.reject(Object.assign(new Error('cancelled'), { code: 'cancelled', providerId: selected.id }));
    }
    var prepare = selected.id === 'custom_openai_compatible' || (req.providerId && !providers[req.providerId])
      ? refreshCustomProviders().catch(function () { return snapshot(); })
      : Promise.resolve(snapshot());
    return prepare.then(function () {
      if (signalAborted(signal)) {
        throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
      }
      selected = resolveProvider(req.purpose, req.providerId);
      if (selected.id === 'softpad_our_freemodel') {
        call = softpadChatWithMeteredRetry(req);
      } else if (selected.kind === 'custom' || selected.id === 'custom_openai_compatible') {
        call = (host.customChat || customChat)(Object.assign({}, req, { providerId: selected.id }));
      } else {
        call = workbuddyChat(req);
      }
      return call;
    })
      .catch(function (err) {
        if (err && err.code === 'cancelled') throw err;
        if (selected.id === 'softpad_our_freemodel') {
          if (signalAborted(signal)) {
            throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
          }
          return workbuddyChat(req).then(function (fallback) {
            fallback.fallbackFrom = selected.id;
            return fallback;
          });
        }
        throw err;
      })
      .then(function (res) {
        if (signalAborted(signal)) {
          throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
        }
        res = res || {};
        // Soft Pad sometimes returns 200 with empty body — fall through to WorkBuddy.
        if (
          selected.id === 'softpad_our_freemodel' &&
          !res.fallbackFrom &&
          !String(res.text || res.content || '').trim()
        ) {
          if (signalAborted(signal)) {
            throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
          }
          return workbuddyChat(req).then(function (fallback) {
            fallback.fallbackFrom = selected.id;
            return fallback;
          });
        }
        return res;
      })
      .then(function (res) {
        if (signalAborted(signal)) {
          throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
        }
        res = res || {};
        res.routeProviderId = selected.id;
        res.backendProviderId = res.providerId || null;
        // Keep Soft Pad route id when Soft Pad answered (backend may be deepseek/…).
        // WorkBuddy fallback keeps providerId=workbuddy + fallbackFrom.
        if (selected.id === 'softpad_our_freemodel' && !res.fallbackFrom) {
          res.providerId = selected.id;
        } else {
          res.providerId = res.providerId || selected.id;
        }
        res.durationMs = Date.now() - started;
        return res;
      })
      .catch(function (err) {
        if (err && err.code === 'cancelled') {
          err.durationMs = Date.now() - started;
          err.providerId = err.providerId || selected.id;
          return Promise.reject(err);
        }
        var normalized = normalizeError(err, selected.id);
        normalized.durationMs = Date.now() - started;
        return Promise.reject(normalized);
      });
  }

  function streamChat(req) {
    req = req || {};
    var selected = resolveProvider(req.purpose, req.providerId);
    if (selected.id !== 'workbuddy') {
      return chat(req).then(function (res) {
        if (typeof req.onComplete === 'function') req.onComplete(res);
        return res;
      }).catch(function (err) {
        if (typeof req.onError === 'function') req.onError(err);
        throw err;
      });
    }
    var resolve = host.resolveWorkbuddy;
    var started = Date.now();
    var cancelled = false;
    var timer = 0;
    var last = '';
    var runId = '';
    activeStreamCancel = function () {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (runId) invoke('cmd_workbuddy_local_chat_cancel', { runId: runId }).catch(function () {});
    };
    return Promise.resolve(resolve ? resolve() : {}).then(function (llm) {
      if (cancelled) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
      return invoke('cmd_workbuddy_local_chat_start', {
        accountId: llm && llm.accountId,
        model: req.model || (llm && llm.model),
        messages: req.messages || []
      });
    }).then(function (start) {
      runId = start && start.runId;
      if (!runId) throw new Error('chat_failed');
      return new Promise(function (resolveDone, rejectDone) {
        timer = setInterval(function () {
          if (cancelled) {
            clearInterval(timer);
            rejectDone(Object.assign(new Error('cancelled'), { code: 'cancelled' }));
            return;
          }
          invoke('cmd_workbuddy_local_chat_poll', { runId: runId }).then(function (res) {
            res = res || {};
            var text = String(res.contentSoFar != null ? res.contentSoFar : res.content || '');
            if (text !== last && typeof req.onDelta === 'function') {
              last = text;
              req.onDelta({ runId: runId, contentSoFar: text });
            }
            if (res.done) {
              clearInterval(timer);
              var out = { ok: !res.error, providerId: 'workbuddy', model: res.model || req.model || (llm && llm.model) || '', text: text, error: res.error || null, durationMs: Date.now() - started };
              if (res.error) rejectDone(Object.assign(new Error(res.error), { code: res.error }));
              else { if (typeof req.onComplete === 'function') req.onComplete(out); resolveDone(out); }
            }
          }).catch(rejectDone);
        }, 80);
      });
    }).catch(function (err) {
      if (typeof req.onError === 'function') req.onError(normalizeError(err, 'workbuddy'));
      throw err;
    }).finally(function () {
      activeStreamCancel = null;
    });
  }

  global.OneToneModelGateway = {
    providers: providersList,
    snapshot: snapshot,
    registerProvider: registerProvider,
    configure: configure,
    resolveProvider: resolveProvider,
    normalizeError: normalizeError,
    chat: chat,
    streamChat: streamChat,
    cancel: function () { if (activeStreamCancel) activeStreamCancel(); },
    setRoute: function (purpose, providerId) {
      if (providers[providerId]) routes[purpose] = providerId;
      try { global.localStorage.setItem('onetone.modelRoutes', JSON.stringify(routes)); } catch (_) {}
      return resolveProvider(purpose);
    },
    refreshStatus: refreshStatus
    ,
    refreshCustomProviders: refreshCustomProviders
  };
})(typeof window !== 'undefined' ? window : globalThis);
