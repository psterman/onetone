(function (global) {
  'use strict';

  var WB_CHAT_KEY = 'onetone.ha2.wbChat.v1';
  var WB_CHAT_MAX = 40;
  var turns = [];
  var streamingId = null;
  var activeRunId = '';
  var projectName = '';
  var projectPath = '';
  var model = '';
  var accountId = '';
  var busy = false;

  function $(id) {
    return document.getElementById(id);
  }

  function invoke(cmd, args) {
    var ipc = global.OneToneIpc;
    if (ipc && typeof ipc.invoke === 'function') {
      return ipc.invoke(cmd, args || {});
    }
    return Promise.reject(new Error('ipc_unavailable'));
  }

  function listen(event, handler) {
    var ipc = global.OneToneIpc;
    if (ipc && typeof ipc.listen === 'function') {
      return ipc.listen(event, handler);
    }
    return Promise.resolve(function () {});
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function loadTurns() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(WB_CHAT_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed && parsed.turns) ? parsed.turns.filter(Boolean) : [];
    } catch (_) {
      return [];
    }
  }

  function saveTurns() {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(
          WB_CHAT_KEY,
          JSON.stringify({ turns: turns.slice(-WB_CHAT_MAX), at: Date.now() })
        );
      }
    } catch (_) {}
  }

  function setStatus(text, isErr) {
    var el = $('wbStatus');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-err', !!isErr);
  }

  function paintMeta() {
    var sub = $('wbSub');
    if (!sub) return;
    var bits = [];
    if (projectName) bits.push(projectName);
    else if (projectPath) bits.push(projectPath);
    if (model) bits.push(model);
    sub.textContent = bits.join(' · ') || '本机讨论（不打开 WorkBuddy.exe）';
    sub.title = projectPath || '';
  }

  var WB_ICON = 'icons/app-target/workbuddy.png';

  function paintTurns() {
    var host = $('wbTranscript');
    if (!host) return;
    if (!turns.length) {
      host.innerHTML =
        '<div class="wb-empty">从首页发送，或在此继续本机讨论。<br/>回复会流式出现在这里。</div>';
      return;
    }
    host.innerHTML = turns
      .map(function (t) {
        var role = t.role === 'assistant' ? 'assistant' : 'user';
        var streamCls = t.id && t.id === streamingId ? ' is-streaming' : '';
        var modelBit =
          role === 'assistant' && t.model
            ? '<span class="wb-turn-meta">· ' + esc(t.model) + '</span>'
            : role === 'assistant' && model
              ? '<span class="wb-turn-meta">· ' + esc(model) + '</span>'
              : '';
        var roleHtml =
          role === 'assistant'
            ? '<img src="' +
              WB_ICON +
              '" alt="" /><span>WorkBuddy</span>' +
              modelBit
            : '<span class="wb-avatar-me" aria-hidden="true">我</span><span>我</span>';
        return (
          '<div class="wb-turn wb-turn--' +
          role +
          streamCls +
          '"><span class="wb-turn-role">' +
          roleHtml +
          '</span><pre class="wb-turn-body">' +
          esc(t.text || '') +
          '</pre></div>'
        );
      })
      .join('');
    try {
      host.scrollTop = host.scrollHeight;
    } catch (_) {}
  }

  function appendTurn(role, text, id, opts) {
    opts = opts || {};
    var row = {
      id: id || 't_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e4),
      role: role === 'assistant' ? 'assistant' : 'user',
      text: String(text || ''),
      model: model || '',
      accountId: accountId || '',
      at: Date.now()
    };
    if (!row.text && !(opts.allowEmpty && row.role === 'assistant')) return null;
    turns.push(row);
    if (turns.length > WB_CHAT_MAX) turns = turns.slice(-WB_CHAT_MAX);
    if (!opts.skipSave) {
      saveTurns();
      var J = global.OneToneHomeTaskJournal;
      if (J && typeof J.appendChatTurn === 'function' && row.text) {
        try {
          J.appendChatTurn({
            id: row.id,
            at: row.at,
            role: row.role,
            text: row.text,
            model: row.model,
            accountId: row.accountId,
            agentKind: 'workbuddy'
          });
        } catch (_) {}
      }
    }
    paintTurns();
    return row;
  }

  function setBusy(on) {
    busy = !!on;
    syncSendEnabled();
  }

  function syncSendEnabled() {
    var btn = $('wbSend');
    var ta = $('wbDraft');
    if (!btn || !ta) return;
    btn.disabled = busy || !String(ta.value || '').trim();
  }

  function messagesForApi() {
    return turns
      .filter(function (t) {
        return t && (t.role === 'user' || t.role === 'assistant') && String(t.text || '').trim();
      })
      .slice(-24)
      .map(function (t) {
        return { role: t.role, content: String(t.text) };
      });
  }

  function systemFromMeta() {
    var Caps = global.OneToneHomeAgentCapabilities;
    if (Caps && typeof Caps.buildLocalChatSystemPrompt === 'function') {
      return Caps.buildLocalChatSystemPrompt({
        projectPath: projectPath,
        projectName: projectName
      });
    }
    if (projectPath) {
      return (
        '当前项目路径：' +
        projectPath +
        (projectName ? '\n项目名：' + projectName : '') +
        '\n请在该项目语境下回答；不要假装能读写磁盘。'
      );
    }
    return '当前未选定项目；请说明缺少项目语境后再作仓库相关回答。';
  }

  function onSeed(payload) {
    payload = payload || {};
    if (payload.projectName) projectName = String(payload.projectName);
    if (payload.projectPath) projectPath = String(payload.projectPath);
    if (payload.model) model = String(payload.model);
    if (payload.accountId) accountId = String(payload.accountId);
    paintMeta();
    var seedTurns = Array.isArray(payload.turns) ? payload.turns : [];
    var i;
    for (i = 0; i < seedTurns.length; i++) {
      var st = seedTurns[i] || {};
      var role = st.role === 'assistant' ? 'assistant' : 'user';
      var text = String(st.text || st.content || '').trim();
      if (!text) continue;
      var last = turns[turns.length - 1];
      if (last && last.role === role && last.text === text) continue;
      appendTurn(role, text);
    }
    if (payload.streaming) {
      // Home owns this run_id; clear so delta/done from home start are accepted.
      activeRunId = '';
      var asst = appendTurn('assistant', '', 'stream_' + Date.now().toString(36), {
        allowEmpty: true,
        skipSave: true
      });
      if (asst) streamingId = asst.id;
      paintTurns();
      setStatus('正在回复…');
      busy = true;
      syncSendEnabled();
    }
  }

  function onDelta(payload) {
    payload = payload || {};
    if (activeRunId && payload.runId && payload.runId !== activeRunId) return;
    var soFar = String(payload.contentSoFar != null ? payload.contentSoFar : payload.delta || '');
    if (!streamingId) {
      var asst = appendTurn('assistant', soFar || '…', 'stream_' + Date.now().toString(36), {
        allowEmpty: true,
        skipSave: true
      });
      if (asst) streamingId = asst.id;
    } else {
      for (var i = turns.length - 1; i >= 0; i--) {
        if (turns[i].id === streamingId) {
          turns[i].text = soFar;
          break;
        }
      }
    }
    paintTurns();
    setStatus('正在回复…');
  }

  function onDone(payload) {
    payload = payload || {};
    if (activeRunId && payload.runId && payload.runId !== activeRunId) return;
    busy = false;
    activeRunId = '';
    var err = payload.error ? String(payload.error) : '';
    var content = String(payload.content || '').trim();
    var modelDone = (payload.model && String(payload.model)) || model;
    if (payload.model) model = modelDone;
    if (payload.accountId) accountId = String(payload.accountId);
    paintMeta();

    if (streamingId) {
      for (var i = turns.length - 1; i >= 0; i--) {
        if (turns[i].id === streamingId) {
          if (content) turns[i].text = content;
          turns[i].model = modelDone;
          break;
        }
      }
      streamingId = null;
      saveTurns();
    } else if (content) {
      appendTurn('assistant', content);
    }

    if (err && err !== 'cancelled') setStatus('失败：' + mapErr(err), true);
    else if (err === 'cancelled') setStatus('已停止');
    else setStatus('已回复');
    paintTurns();
    syncSendEnabled();
  }

  function mapErr(msg) {
    if (msg === 'empty_model_content') return '模型返回为空';
    if (msg === 'authExpired' || msg === 'key_unauthorized') return '账号鉴权失败';
    if (msg === 'rate_limited') return '请求过于频繁';
    if (msg === 'cancelled') return '已停止';
    return msg;
  }

  function startChat(userText) {
    if (busy) return;
    var text = String(userText || '').trim();
    if (!text) return;
    appendTurn('user', text);
    var asst = appendTurn('assistant', '', 'stream_' + Date.now().toString(36), {
      allowEmpty: true,
      skipSave: true
    });
    streamingId = asst ? asst.id : null;
    busy = true;
    syncSendEnabled();
    setStatus('正在回复…');
    var messages = messagesForApi();
    var sys = systemFromMeta();
    if (sys) messages.unshift({ role: 'system', content: sys });
    invoke('cmd_workbuddy_local_chat_start', {
      args: {
        accountId: accountId || undefined,
        model: model || undefined,
        messages: messages
      }
    })
      .then(function (res) {
        activeRunId = (res && res.runId) || '';
        if (res && res.model) model = String(res.model);
        if (res && res.accountId) accountId = String(res.accountId);
        paintMeta();
        if (!activeRunId) throw new Error('chat_failed');
      })
      .catch(function (e) {
        busy = false;
        streamingId = null;
        setStatus('失败：' + ((e && e.message) || e || 'chat_failed'), true);
        syncSendEnabled();
      });
  }

  function stopChat() {
    invoke('cmd_workbuddy_local_chat_cancel', {
      args: { runId: activeRunId || undefined }
    }).catch(function () {});
  }

  function closeWindow() {
    stopChat();
    try {
      var tw = global.__TAURI__ && global.__TAURI__.window;
      if (tw && tw.getCurrentWindow) {
        tw.getCurrentWindow().hide();
        return;
      }
    } catch (_) {}
  }

  function bindTitleDrag() {
    var bar = $('wbTitlebar');
    if (!bar) return;
    bar.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest('button')) return;
      try {
        var tw = global.__TAURI__ && global.__TAURI__.window;
        if (tw && tw.getCurrentWindow) tw.getCurrentWindow().startDragging();
      } catch (_) {}
    });
  }

  function bindUi() {
    var send = $('wbSend');
    var stop = $('wbStop');
    var close = $('wbClose');
    var ta = $('wbDraft');
    if (send) {
      send.addEventListener('click', function () {
        var v = ta ? ta.value : '';
        if (ta) ta.value = '';
        startChat(v);
      });
    }
    if (stop) stop.addEventListener('click', stopChat);
    if (close) close.addEventListener('click', closeWindow);
    if (ta) {
      ta.addEventListener('input', syncSendEnabled);
      ta.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          var v = ta.value;
          ta.value = '';
          startChat(v);
        }
      });
    }
    bindTitleDrag();
    syncSendEnabled();
  }

  function subscribe() {
    return Promise.all([
      listen('wb_local_chat_seed', function (ev) {
        onSeed((ev && ev.payload) || ev || {});
      }),
      listen('wb_local_chat_delta', function (ev) {
        onDelta((ev && ev.payload) || ev || {});
      }),
      listen('wb_local_chat_done', function (ev) {
        onDone((ev && ev.payload) || ev || {});
      })
    ]).then(function (fns) {
      unsubs = (fns || []).filter(function (fn) {
        return typeof fn === 'function';
      });
    });
  }

  function boot() {
    turns = loadTurns();
    paintMeta();
    paintTurns();
    bindUi();
    subscribe().catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
