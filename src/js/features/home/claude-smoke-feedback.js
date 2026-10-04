/**
 * Claude smoke feedback MVP — home → loopback HTTP → Claude CLI (-p plan) → task card.
 * Polls GET /api/tasks/:id every 500ms. Never fabricates success.
 * Patches DOM in place so <details> do not snap shut on each poll.
 */
(function (global) {
  'use strict';

  var BASE = 'http://127.0.0.1:8796';
  var POLL_MS = 500;
  var MISSING_CLI = '未找到 Claude CLI，请先安装或配置 PATH';

  var pollTimer = null;
  var busy = false;

  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatTime(ms) {
    if (ms == null || !ms) return '—';
    try {
      return new Date(ms).toLocaleString();
    } catch (_) {
      return String(ms);
    }
  }

  function phaseLabel(status) {
    var map = {
      created: '已创建',
      starting: '正在启动 Claude',
      running: 'Claude 正在运行',
      output_received: '已收到 Claude 输出',
      completed: 'Claude 已完成',
      failed: 'Claude 执行失败'
    };
    return map[status] || status || '…';
  }

  function liveCore(task) {
    var summary = String(task.summary || '').trim();
    if (summary) return summary;
    var raw = String(task.rawStdout || '').trim();
    if (!raw) return '';
    var lines = raw
      .split(/\r?\n/)
      .map(function (l) {
        return l.trim();
      })
      .filter(function (l) {
        return l && l.charAt(0) !== '{';
      });
    if (!lines.length) return '';
    return lines.slice(-3).join('\n');
  }

  function ensureCardSkeleton() {
    var card = $('claudeSmokeTaskCard');
    if (!card) return null;
    card.hidden = false;
    if (card.getAttribute('data-smoke-ready') === '2') return card;
    card.innerHTML =
      '<div class="codex-smoke-feedback__chips">' +
      '<span class="codex-smoke-feedback__chip" data-smoke="agent">Claude</span>' +
      '<span class="codex-smoke-feedback__chip codex-smoke-feedback__chip--status" data-smoke="status">…</span>' +
      '</div>' +
      '<p class="codex-smoke-feedback__headline" data-smoke="headline"></p>' +
      '<pre class="codex-smoke-feedback__live" data-smoke="live" hidden></pre>' +
      '<div class="codex-smoke-feedback__foot">' +
      '<span data-smoke="title"></span>' +
      '<span data-smoke="time"></span>' +
      '</div>' +
      '<p class="codex-smoke-feedback__ask" data-smoke="ask" hidden></p>' +
      '<div class="codex-smoke-feedback__extras">' +
      '<details class="codex-smoke-feedback__raw" data-smoke-details="raw" hidden>' +
      '<summary>原始输出</summary><pre data-smoke="raw"></pre></details>' +
      '<details class="codex-smoke-feedback__raw" data-smoke-details="cmd" hidden>' +
      '<summary>执行命令</summary><pre data-smoke="cmd"></pre></details>' +
      '</div>';
    card.setAttribute('data-smoke-ready', '2');
    return card;
  }

  function setText(el, text) {
    if (!el) return;
    var next = text == null ? '' : String(text);
    if (el.textContent !== next) el.textContent = next;
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    busy = false;
    var btn = $('claudeSmokeTestBtn');
    if (btn) btn.disabled = false;
  }

  function renderTask(task) {
    if (!task) return;
    var card = ensureCardSkeleton();
    if (!card) return;

    var status = task.status || '';
    var isDone = status === 'completed';
    var isFail = status === 'failed';
    var core = liveCore(task);
    var phase = task.phaseLabel || phaseLabel(status);
    var headline = isFail
      ? String(task.error || task.rawStderr || 'Claude 执行失败').trim()
      : core || phase;

    var agentEl = card.querySelector('[data-smoke="agent"]');
    var statusEl = card.querySelector('[data-smoke="status"]');
    var headlineEl = card.querySelector('[data-smoke="headline"]');
    var liveEl = card.querySelector('[data-smoke="live"]');
    var titleEl = card.querySelector('[data-smoke="title"]');
    var timeEl = card.querySelector('[data-smoke="time"]');
    var rawDetails = card.querySelector('[data-smoke-details="raw"]');
    var cmdDetails = card.querySelector('[data-smoke-details="cmd"]');
    var rawPre = card.querySelector('[data-smoke="raw"]');
    var cmdPre = card.querySelector('[data-smoke="cmd"]');

    setText(agentEl, task.agent || 'Claude');
    setText(statusEl, status || '…');
    if (statusEl) statusEl.setAttribute('data-status', status || '');

    if (headlineEl) {
      headlineEl.classList.toggle('is-fail', !!isFail);
      headlineEl.classList.toggle('is-done', !!isDone);
      setText(headlineEl, headline);
    }

    if (liveEl) {
      var multi = !isFail && !isDone && core && core.indexOf('\n') !== -1;
      if (multi) {
        setText(headlineEl, phase);
        setText(liveEl, core);
        liveEl.hidden = false;
      } else {
        liveEl.hidden = true;
        if (liveEl.textContent) liveEl.textContent = '';
      }
    }

    setText(titleEl, task.title || '验证 Claude 数据回流');
    setText(
      timeEl,
      formatTime(task.startedAt) +
        (task.completedAt ? ' → ' + formatTime(task.completedAt) : '')
    );

    var askEl = card.querySelector('[data-smoke="ask"]');
    if (askEl) {
      var ask = String(task.prompt || '').trim();
      if (ask) {
        askEl.hidden = false;
        setText(askEl, '提问：' + ask);
      } else {
        askEl.hidden = true;
        askEl.textContent = '';
      }
    }

    var rawText =
      (task.rawStdout || '') +
      (task.rawStderr ? '\n--- stderr ---\n' + task.rawStderr : '');
    if (rawDetails && rawPre) {
      if (rawText.trim()) {
        rawDetails.hidden = false;
        setText(rawPre, rawText);
      } else {
        rawDetails.hidden = true;
      }
    }
    if (cmdDetails && cmdPre) {
      if (task.command) {
        cmdDetails.hidden = false;
        setText(cmdPre, task.command);
      } else {
        cmdDetails.hidden = true;
      }
    }
  }

  function renderError(msg) {
    var card = $('claudeSmokeTaskCard');
    if (card) card.removeAttribute('data-smoke-ready');
    ensureCardSkeleton();
    renderTask({
      agent: 'Claude',
      status: 'failed',
      phaseLabel: 'Claude 执行失败',
      title: '验证 Claude 数据回流',
      error: msg,
      startedAt: Date.now()
    });
  }

  function ensureLoopback() {
    if (!global.OneToneIpc || !global.OneToneIpc.invoke) {
      return Promise.reject(new Error('IPC 不可用，无法启动本机 8796 服务'));
    }
    return global.OneToneIpc.invoke('cmd_codex_micro_protocol_server_status')
      .then(function (st) {
        if (st && st.enabled) return true;
        return global.OneToneIpc.invoke('cmd_codex_micro_protocol_server_start', {
          port: 8796
        }).then(function (r) {
          if (r && r.ok) return true;
          throw new Error((r && r.error) || '无法启动 loopback 8796（可能端口被占用）');
        });
      });
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function fetchJson(url, opts) {
    return fetch(url, opts).then(function (res) {
      return res.text().then(function (text) {
        var body = null;
        try {
          body = text ? JSON.parse(text) : null;
        } catch (_) {
          body = { error: text || 'invalid_json' };
        }
        return { ok: res.ok, status: res.status, body: body };
      });
    });
  }

  function friendlyFetchError(err) {
    var msg = String((err && err.message) || err || '');
    if (/failed to fetch|networkerror|load failed/i.test(msg)) {
      return '无法连接本机 8796（请重启 OneTone，或确认 loopback 已启动）';
    }
    return msg || '请求失败';
  }

  function waitHealth(healthPath) {
    return ensureLoopback().then(function () {
      var tries = 0;
      function attempt() {
        tries += 1;
        return fetchJson(BASE + healthPath).catch(function (err) {
          if (tries >= 12) throw err;
          return sleep(150).then(attempt);
        });
      }
      return attempt();
    });
  }

  function pollTask(taskId) {
    if (pollTimer) clearInterval(pollTimer);
    function tick() {
      fetchJson(BASE + '/api/tasks/' + encodeURIComponent(taskId))
        .then(function (r) {
          if (!r.ok || !r.body) {
            stopPoll();
            renderError((r.body && r.body.error) || '查询任务失败');
            return;
          }
          renderTask(r.body);
          var s = r.body.status;
          if (s === 'completed' || s === 'failed') {
            stopPoll();
          }
        })
        .catch(function (err) {
          stopPoll();
          renderError(friendlyFetchError(err));
        });
    }
    tick();
    pollTimer = setInterval(tick, POLL_MS);
  }

  function startSmoke() {
    if (busy) return;
    var input = $('claudeSmokePrompt');
    var prompt = input ? String(input.value || '').trim() : '';
    busy = true;
    var btn = $('claudeSmokeTestBtn');
    if (btn) btn.disabled = true;

    var card = $('claudeSmokeTaskCard');
    if (card) card.removeAttribute('data-smoke-ready');
    renderTask({
      agent: 'Claude',
      status: 'starting',
      phaseLabel: '正在启动 Claude',
      title: prompt ? prompt.slice(0, 48) : '验证 Claude 数据回流',
      prompt: prompt,
      startedAt: Date.now()
    });

    waitHealth('/api/agents/claude/health')
      .then(function (healthRes) {
        if (!healthRes || !healthRes.body) {
          throw new Error('健康检查无响应（loopback 8796 是否已启动？）');
        }
        var h = healthRes.body;
        if (!h.installed) {
          stopPoll();
          renderError(h.message || MISSING_CLI);
          return null;
        }
        return fetchJson(BASE + '/api/tasks/claude-smoke-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: prompt })
        });
      })
      .then(function (createRes) {
        if (!createRes) return;
        if (!createRes.ok || !createRes.body || !createRes.body.taskId) {
          stopPoll();
          renderError(
            (createRes.body && (createRes.body.error || createRes.body.message)) ||
              '创建任务失败'
          );
          return;
        }
        pollTask(createRes.body.taskId);
      })
      .catch(function (err) {
        stopPoll();
        renderError(friendlyFetchError(err));
      });
  }

  function bind() {
    var btn = $('claudeSmokeTestBtn');
    if (!btn || btn.getAttribute('data-claude-smoke-bound') === '1') return;
    btn.setAttribute('data-claude-smoke-bound', '1');
    btn.addEventListener('click', startSmoke);
    var input = $('claudeSmokePrompt');
    if (input) {
      input.addEventListener('keydown', function (ev) {
        if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
          ev.preventDefault();
          startSmoke();
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  global.OneToneClaudeSmokeFeedback = {
    start: startSmoke,
    bind: bind
  };
})(typeof window !== 'undefined' ? window : this);
