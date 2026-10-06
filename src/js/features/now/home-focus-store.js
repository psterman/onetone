/**
 * Home Focus store — cmd_home_focus_snapshot / retry only (no title→PathBuf).
 */
(function (global) {
  'use strict';

  var cache = null;
  var lastKey = '';
  var pollTimer = 0;
  var listeners = [];

  function invoke(cmd, args) {
    var ipc = global.OneToneIpc;
    if (!ipc || !ipc.invoke) return Promise.reject(new Error('no ipc'));
    return ipc.invoke(cmd, args || {});
  }

  function notify() {
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i](cache);
      } catch (_) {}
    }
  }

  function keyOf(dto) {
    try {
      return JSON.stringify({
        p: dto && dto.project && dto.project.id,
        m: dto && dto.project && dto.project.match,
        c: dto && dto.project && dto.project.confirmed,
        w: dto && dto.work && dto.work.status,
        a: dto && dto.nextAction && dto.nextAction.kind,
        pr: dto && dto.provider && dto.provider.status,
        f: dto && dto.foreground && dto.foreground.appName,
        s: dto && dto.source && dto.source.freshness
      });
    } catch (_) {
      return String(Date.now());
    }
  }

  function fetchSnapshot() {
    return invoke('cmd_home_focus_snapshot', {})
      .then(function (dto) {
        var k = keyOf(dto);
        cache = dto || null;
        if (k !== lastKey) {
          lastKey = k;
          notify();
        }
        return cache;
      })
      .catch(function () {
        return cache;
      });
  }

  function retry() {
    return invoke('cmd_home_focus_retry', {}).then(function (res) {
      setTimeout(fetchSnapshot, 400);
      return res;
    });
  }

  function confirmProject(opts) {
    opts = opts || {};
    return invoke('cmd_home_confirm_project', {
      args: {
        projectRoot: opts.projectRoot || null,
        projectId: opts.projectId || null
      }
    }).then(function (res) {
      if (res && res.ok === false) {
        return Promise.reject(new Error(res.error || 'confirm failed'));
      }
      return fetchSnapshot().then(function () {
        return res;
      });
    });
  }

  function listProjects(limit) {
    return invoke('cmd_home_list_known_projects', {
      args: { limit: limit || 20 }
    });
  }

  function resumeCheckpoint(sessionId) {
    return invoke('cmd_agent_checkpoint_resume', {
      args: { sessionId: sessionId }
    });
  }

  function startPolling(ms) {
    stopPolling();
    pollTimer = setInterval(function () {
      fetchSnapshot();
    }, ms || 5000);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = 0;
    }
  }

  function subscribe(fn) {
    if (typeof fn === 'function') listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (x) {
        return x !== fn;
      });
    };
  }

  global.OneToneHomeFocusStore = {
    fetch: fetchSnapshot,
    retry: retry,
    confirmProject: confirmProject,
    listProjects: listProjects,
    resumeCheckpoint: resumeCheckpoint,
    get: function () {
      return cache;
    },
    subscribe: subscribe,
    startPolling: startPolling,
    stopPolling: stopPolling
  };
})(typeof window !== 'undefined' ? window : globalThis);
