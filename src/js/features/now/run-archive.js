/**
 * OneToneRunArchive — Rust-backed run persistence with JS scrub + interrupted coerce.
 */
(function (global) {
  'use strict';
  var PREFIX = 'onetone.runArchive.v1.';
  var C = function () { return global.OneToneRunContracts; };

  function key(id) { return PREFIX + String(id || ''); }

  function scrubLocal(snapshot) {
    var contracts = C();
    if (contracts && contracts.toArchivePayload) {
      try { return contracts.toArchivePayload(snapshot); } catch (_) {}
    }
    if (contracts && contracts.scrubValue) return contracts.scrubValue(snapshot);
    return snapshot;
  }

  function coerce(snapshot) {
    var contracts = C();
    if (contracts && contracts.coerceInterrupted) return contracts.coerceInterrupted(snapshot);
    return snapshot;
  }

  function ipcInvoke(cmd, args) {
    var ipc = global.OneToneIpc;
    if (!ipc || typeof ipc.invoke !== 'function') return null;
    return ipc.invoke(cmd, args);
  }

  function localSave(snapshot) {
    try {
      var clean = scrubLocal(snapshot);
      global.localStorage.setItem(key(clean.runId), JSON.stringify(clean));
      global.localStorage.setItem(PREFIX + 'latest', clean.runId);
      return true;
    } catch (_) { return false; }
  }

  function markFallback(runId, snapshot) {
    try { global.sessionStorage.setItem(PREFIX + 'fallback.' + String(runId || ''), '1'); } catch (_) {}
    if (snapshot && typeof snapshot === 'object') {
      snapshot.archive_fallback = true;
      if (Array.isArray(snapshot.trace)) {
        snapshot.trace.push({
          type: 'archive_fallback',
          at: new Date().toISOString(),
          runId: String(runId || '')
        });
      }
    }
  }

  function hadFallback(runId) {
    try {
      return global.sessionStorage.getItem(PREFIX + 'fallback.' + String(runId || '')) === '1';
    } catch (_) {
      return false;
    }
  }

  function save(snapshot) {
    if (!snapshot || !snapshot.runId) return Promise.resolve(false);
    var clean = scrubLocal(snapshot);
    var p = ipcInvoke('cmd_run_archive_save', {
      args: { runId: clean.runId, snapshot: clean }
    });
    if (p && typeof p.then === 'function') {
      return p.then(function () { return true; }).catch(function () {
        markFallback(clean.runId, clean);
        return localSave(clean);
      });
    }
    markFallback(clean.runId, clean);
    return Promise.resolve(localSave(clean));
  }

  function load(runId) {
    try {
      var id = runId || global.localStorage.getItem(PREFIX + 'latest');
      var raw = id && global.localStorage.getItem(key(id));
      if (!raw) return null;
      return coerce(JSON.parse(raw));
    } catch (_) { return null; }
  }

  function loadAsync(runId) {
    var p = ipcInvoke('cmd_run_archive_load', { runId: runId || '' });
    if (p && typeof p.then === 'function') {
      return p
        .then(function (value) {
          if (value) return coerce(value);
          return load(runId);
        })
        .catch(function () {
          markFallback(runId);
          return load(runId);
        });
    }
    return Promise.resolve(load(runId));
  }

  function restore(runId) {
    return loadAsync(runId).then(function (snap) {
      if (!snap) return null;
      return coerce(snap);
    });
  }

  function list(opts) {
    opts = opts || {};
    var p = ipcInvoke('cmd_run_archive_list', {});
    function filter(rows) {
      rows = Array.isArray(rows) ? rows : [];
      if (opts.mode) {
        rows = rows.filter(function (r) { return r && String(r.mode || '') === String(opts.mode); });
      }
      if (opts.status) {
        rows = rows.filter(function (r) { return r && String(r.status || '') === String(opts.status); });
      }
      if (opts.resumeAvailable) {
        rows = rows.filter(function (r) { return r && !!r.resumeAvailable; });
      }
      return rows;
    }
    if (p && typeof p.then === 'function') {
      return p.then(filter).catch(function () { return []; });
    }
    return Promise.resolve([]);
  }

  /** Boot helper: interrupted work runs for user resume/discard — never auto-running. */
  function listInterruptedWork() {
    return list({ mode: 'work' }).then(function (rows) {
      return (rows || []).filter(function (r) {
        return r && (r.status === 'interrupted' || r.resumeAvailable);
      });
    });
  }

  function remove(runId) {
    var p = ipcInvoke('cmd_run_archive_remove', { runId: runId });
    if (p && typeof p.then === 'function') p.catch(function () {});
    try { global.localStorage.removeItem(key(runId)); return true; } catch (_) { return false; }
  }

  function migrate(runId) {
    var old = null;
    try {
      var id = runId || global.localStorage.getItem(PREFIX + 'latest');
      var raw = id && global.localStorage.getItem(key(id));
      old = raw ? JSON.parse(raw) : null;
    } catch (_) { old = null; }
    if (!old) return null;
    save(old).then(function (ok) {
      if (!ok) return;
      try {
        global.localStorage.removeItem(key(old.runId));
        if (global.localStorage.getItem(PREFIX + 'latest') === old.runId) {
          global.localStorage.removeItem(PREFIX + 'latest');
        }
      } catch (_) {}
    });
    return coerce(old);
  }

  global.OneToneRunArchive = {
    save: save,
    load: load,
    loadAsync: loadAsync,
    restore: restore,
    list: list,
    listInterruptedWork: listInterruptedWork,
    remove: remove,
    migrate: migrate,
    scrubLocal: scrubLocal,
    hadFallback: hadFallback
  };
})(typeof window !== 'undefined' ? window : globalThis);
