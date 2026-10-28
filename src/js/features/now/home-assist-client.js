/**
 * Home assist client — cmd_assist_run / cancel; never mutates draft itself.
 * Prep.beginAssistOrganize / adoptAssistResult own draft state.
 */
(function (global) {
  'use strict';

  var ALLOW_METERED_KEY = 'onetone.assist.allowMetered';
  var CONFIRMED_PROVIDERS_KEY = 'onetone.assist.confirmedProviders';

  /** Tauri commands take a single `args` param — wrap payload like home-focus-store. */
  function invoke(cmd, payload) {
    var ipc = global.OneToneIpc;
    if (!ipc || typeof ipc.invoke !== 'function') {
      return Promise.reject(new Error('no_ipc'));
    }
    if (payload === undefined || payload === null) {
      return ipc.invoke(cmd, {});
    }
    return ipc.invoke(cmd, { args: payload });
  }

  function allowMetered() {
    try {
      return global.localStorage && global.localStorage.getItem(ALLOW_METERED_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function setAllowMetered(on) {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(ALLOW_METERED_KEY, on ? '1' : '0');
      }
    } catch (_) {}
  }

  function confirmedProviders() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(CONFIRMED_PROVIDERS_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function rememberProviders(list) {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(CONFIRMED_PROVIDERS_KEY, JSON.stringify(list || []));
      }
    } catch (_) {}
  }

  function reasonMessage(reason) {
    var map = {
      invalid_request: '请求无效（材料或参数超限）',
      no_key: '未配置 Soft Pad 提供商密钥',
      no_free_model: '当前无可用的零价模型',
      provider_disabled: '提供商不可用或未启用',
      rate_limited: '请求过于频繁（429）',
      timeout: '整理超时',
      cancelled: '已取消整理（提供商侧可能仍在计费）',
      offline: '网络不可用或无法连接提供商',
      bad_response: '模型响应异常',
      invalid_output: '整理结果格式无效，未写入草稿',
      not_found: '找不到该请求',
      duplicate_request: '重复请求被拒绝',
      internal: '内部错误',
      interrupted: '整理已中断（例如页面刷新）',
      no_ipc: '后端 Assist 未接通',
      no_prep: '材料模块未加载',
      busy: '已有整理在进行',
      already_running: '已有整理在进行',
      stale: '材料已变，旧整理结果已丢弃'
    };
    var r = String(reason || '').trim();
    if (!r) return '整理未完成（原因未知）';
    return map[r] || ('整理未完成：' + r);
  }

  /** Full notice: reason + next action. Never bare「整理失败」. */
  function formatFailureNotice(reason, opts) {
    opts = opts || {};
    var r = String(reason || '').trim() || 'internal';
    var head = reasonMessage(r);
    var next = '';
    if (r === 'no_key') {
      next = '请到 Soft Pad → 提供商密钥配置后重试，或直接发送原稿。';
    } else if (r === 'no_free_model') {
      next = allowMetered()
        ? '已允许计量额度但仍无可用模型；请检查密钥，或直接发送原稿。'
        : '可勾选「允许计量额度」后重试（会产生费用），或直接发送原稿。';
    } else if (r === 'rate_limited' || r === 'timeout') {
      next = '可稍后重试，或直接发送原稿。';
    } else if (r === 'cancelled') {
      next = '可重新整理，或直接发送原稿。';
    } else if (r === 'offline' || r === 'no_ipc') {
      next = '网络恢复后可再试；整理失败不影响直接发送。';
    } else if (r === 'invalid_output' || r === 'bad_response') {
      next = '可重试整理，或直接发送原稿。';
    } else {
      next = '可直接发送原稿，不必等待整理。';
    }
    if (opts.detail) next = String(opts.detail) + ' ' + next;
    return head + ' · ' + next;
  }

  function fetchReady() {
    return invoke('cmd_assist_ready', { allowMetered: allowMetered() }).catch(function () {
      return {
        skillId: 'task_organize',
        implemented: true,
        ready: false,
        reason: 'no_ipc'
      };
    });
  }

  /**
   * Start organize. Caller should confirm remote send when first time.
   * @returns {Promise<{ok:boolean, reason?:string, adopted?:boolean}>}
   */
  function runOrganize(opts) {
    opts = opts || {};
    var Prep = global.OneToneHomePromptPrep;
    if (!Prep || typeof Prep.beginAssistOrganize !== 'function') {
      return Promise.resolve({ ok: false, reason: 'no_prep' });
    }
    var begun = Prep.beginAssistOrganize({
      allowMetered: allowMetered(),
      allowedProviders: opts.allowedProviders,
      sendScope: opts.sendScope,
      deadlineMs: opts.deadlineMs || 30000
    });
    if (!begun.ok) {
      return Promise.resolve({ ok: false, reason: begun.reason || 'busy' });
    }

    var snap = begun.snapshot || {};
    var input = {
      draft: (snap.draft && (snap.draft.body || snap.draft.title)) || '',
      materials: (snap.materials || []).map(function (m) {
        return {
          id: m.id,
          name: m.name,
          source: m.source,
          content: m.content,
          path: m.path,
          citeMode: m.citeMode
        };
      })
    };

    return invoke('cmd_assist_run', {
      requestId: begun.requestId,
      skillId: 'task_organize',
      input: input,
      policy: {
        allowedProviders: begun.policy.allowedProviders,
        allowMetered: !!begun.policy.allowMetered,
        callPolicy: begun.policy.callPolicy,
        maxInputChars: begun.policy.maxInputChars,
        maxOutputChars: begun.policy.maxOutputChars,
        deadlineMs: begun.policy.deadlineMs,
        sendScope: begun.policy.sendScope
      }
    })
      .then(function (res) {
        res = res || {};
        var adopted = Prep.adoptAssistResult({
          ok: !!res.ok,
          requestId: begun.requestId,
          reason: res.reason,
          result: res.result,
          message: reasonMessage(res.reason)
        });
        if (!res.ok) {
          return {
            ok: false,
            reason: res.reason || 'internal',
            message: reasonMessage(res.reason),
            adopted: false,
            retryable: !!res.retryable
          };
        }
        if (!adopted.adopted) {
          return { ok: true, adopted: false, reason: adopted.reason || 'stale' };
        }
        return { ok: true, adopted: true };
      })
      .catch(function (err) {
        Prep.finishAssistLocal('failed', {
          reason: 'offline',
          message: String((err && err.message) || err || '')
        });
        return { ok: false, reason: 'offline', message: reasonMessage('offline') };
      });
  }

  function cancelOrganize() {
    var Prep = global.OneToneHomePromptPrep;
    var model = Prep && Prep._model && Prep._model();
    var rid = model && model.assist && model.assist.requestId;
    if (!rid) {
      if (Prep && Prep.finishAssistLocal) Prep.finishAssistLocal('cancelled');
      return Promise.resolve({ ok: true, state: 'already_finished' });
    }
    return invoke('cmd_assist_cancel', { requestId: rid })
      .then(function (res) {
        if (Prep && Prep.finishAssistLocal) {
          Prep.finishAssistLocal('cancelled', {
            reason: 'cancelled',
            message: reasonMessage('cancelled')
          });
        }
        return res || { ok: true };
      })
      .catch(function () {
        if (Prep && Prep.finishAssistLocal) Prep.finishAssistLocal('cancelled');
        return { ok: false, reason: 'offline' };
      });
  }

  function sendScopeHint() {
    var Prep = global.OneToneHomePromptPrep;
    var Own = global.OneToneHomeAssistOwnership;
    if (!Prep || !Own) return '';
    var snap = Prep.buildAssistInputSnapshot && Prep.buildAssistInputSnapshot();
    if (!snap) return '';
    var d = Own.describeSendScope(snap);
    return d.willSend + ' · ' + d.hint;
  }

  global.OneToneHomeAssistClient = {
    allowMetered: allowMetered,
    setAllowMetered: setAllowMetered,
    confirmedProviders: confirmedProviders,
    rememberProviders: rememberProviders,
    reasonMessage: reasonMessage,
    formatFailureNotice: formatFailureNotice,
    fetchReady: fetchReady,
    runOrganize: runOrganize,
    cancelOrganize: cancelOrganize,
    sendScopeHint: sendScopeHint,
    openProviderKeys: function () {
      try {
        var Hub = global.OneToneSoftPadHub;
        if (Hub && typeof Hub.openSubpage === 'function') {
          Hub.openSubpage('pad', { padMode: 'connect' });
          return true;
        }
      } catch (_) {}
      try {
        if (global.OneToneSettingsDrawer && global.OneToneSettingsDrawer.open) {
          global.OneToneSettingsDrawer.open({ panel: 'softPad' });
          return true;
        }
      } catch (_) {}
      return false;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
