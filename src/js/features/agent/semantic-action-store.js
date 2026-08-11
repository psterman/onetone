/**
 * Semantic action store — catalog / options / pending snapshot.
 * bindable may be cached; executableNow must be refreshed with needsInputKind.
 */
(function (global) {
  'use strict';

  var _catalog = null;
  var _optionsCache = {}; // key -> { at, entries }
  var OPTIONS_TTL_MS = 30_000;
  var _pending = [];
  var _pendingSig = '';
  var _listeners = [];

  function invoke(cmd, args) {
    var fn = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    if (!fn) return Promise.reject(new Error('no_invoke'));
    return Promise.resolve(fn(cmd, args || {}));
  }

  function onChange(fn) {
    _listeners.push(fn);
    return function () {
      _listeners = _listeners.filter(function (x) {
        return x !== fn;
      });
    };
  }

  function emit() {
    _listeners.forEach(function (fn) {
      try {
        fn();
      } catch (_) {}
    });
  }

  /** Notify subscribers after a local mutation (cancel / route) — not after silent poll. */
  function notifyLocalChange() {
    emit();
  }

  function pendingSignature(rows) {
    try {
      return JSON.stringify(rows || []);
    } catch (_) {
      return String((rows && rows.length) || 0);
    }
  }

  function ensureCatalog() {
    if (_catalog) return Promise.resolve(_catalog);
    if (global.OneToneAgentActions && global.OneToneAgentActions.fetchSemanticCatalog) {
      return global.OneToneAgentActions.fetchSemanticCatalog().then(function (dto) {
        _catalog = dto;
        return dto;
      });
    }
    return invoke('cmd_semantic_action_catalog').then(function (dto) {
      _catalog = dto;
      return dto;
    });
  }

  function catalog() {
    return _catalog;
  }

  function optionsKey(mappingId, channel) {
    return String(mappingId || '') + '|' + String(channel || '');
  }

  /** Structural bindable list (cacheable). */
  function fetchOptions(mappingId, channel, force) {
    var key = optionsKey(mappingId, channel);
    var hit = _optionsCache[key];
    if (!force && hit && Date.now() - hit.at < OPTIONS_TTL_MS) {
      return Promise.resolve(hit.entries);
    }
    return invoke('cmd_semantic_action_options', {
      mappingId: mappingId,
      channel: channel
    }).then(function (res) {
      var entries = (res && res.entries) || [];
      _optionsCache[key] = { at: Date.now(), entries: entries };
      return entries;
    });
  }

  /** Merge live executableNow from needsInputKind — never trust stale executableNow alone. */
  function withExecutableNow(entries, needsKind) {
    var kind = String(needsKind || 'none');
    return (entries || []).map(function (e) {
      var meta = entryMeta(e.actionId);
      var when = (meta && meta.availableWhen) || [];
      var okWhen = !when.length || when.indexOf(kind) >= 0;
      return Object.assign({}, e, {
        executableNow: !!(e.bindable && okWhen)
      });
    });
  }

  function entryMeta(actionId) {
    var c = _catalog;
    if (!c || !c.entries) return null;
    var id = String(actionId || '').trim();
    if (id.indexOf('agent:') === 0) id = id.slice(6);
    for (var i = 0; i < c.entries.length; i++) {
      if (c.entries[i].id === id) return c.entries[i];
    }
    return null;
  }

  /**
   * @param {string|null} mappingId
   * @param {{ silent?: boolean }|boolean} [opts] silent:true → never emit (home poll)
   */
  function fetchPendingSnapshot(mappingId, opts) {
    var silent = false;
    if (opts === true) silent = true;
    else if (opts && typeof opts === 'object') silent = !!opts.silent;
    return invoke('cmd_semantic_pending_snapshot', {
      mappingId: mappingId || null
    }).then(function (rows) {
      var next = Array.isArray(rows) ? rows : [];
      var sig = pendingSignature(next);
      var changed = sig !== _pendingSig;
      _pending = next;
      _pendingSig = sig;
      if (!silent && changed) emit();
      return _pending;
    });
  }

  function pendingRows() {
    return _pending.slice();
  }

  function latestPending() {
    return _pending.length ? _pending[0] : null;
  }

  function cancelPending(confirmationId) {
    return invoke('cmd_semantic_confirmation_cancel', {
      confirmationId: confirmationId
    }).then(function (res) {
      return fetchPendingSnapshot(null, { silent: true }).then(function () {
        notifyLocalChange();
        return res;
      });
    });
  }

  function bindingViews(mappingId) {
    return invoke('cmd_action_binding_views', { mappingId: mappingId }).then(function (rows) {
      return Array.isArray(rows) ? rows : [];
    });
  }

  function semanticSlotId(channel, actionId) {
    return 'semantic:' + channel + ':' + actionId;
  }

  function invalidateOptions() {
    _optionsCache = {};
  }

  /**
   * Bindable on channel — Options is authoritative when loaded.
   * Catalog-only path: channels + implemented (no requiresSecondChannel block).
   * Fail closed when catalog missing.
   */
  function isSemanticBindableOnChannel(actionId, channel) {
    if (!_catalog) return false;
    var meta = entryMeta(actionId);
    if (!meta || !meta.implemented) return false;
    var ch = String(channel || '');
    if (meta.channels && meta.channels.indexOf(ch) < 0) return false;
    return true;
  }

  /** Look up a cached option row (fail closed if options never fetched). */
  function optionFor(mappingId, channel, actionId) {
    var key = optionsKey(mappingId, channel);
    var hit = _optionsCache[key];
    if (!hit || !hit.entries) return null;
    var id = String(actionId || '').trim();
    if (id.indexOf('agent:') === 0) id = id.slice(6);
    for (var i = 0; i < hit.entries.length; i++) {
      if (hit.entries[i].actionId === id) return hit.entries[i];
    }
    return null;
  }

  /**
   * Validate bind before persist. Returns Promise<{ok, reason?, option?}>.
   * Fail closed if catalog/options not available.
   */
  function assertBindable(mappingId, channel, actionId) {
    return ensureCatalog().then(function () {
      if (!isSemanticBindableOnChannel(actionId, channel)) {
        return { ok: false, reason: 'not_bindable_on_channel' };
      }
      return fetchOptions(mappingId, channel, false).then(function (entries) {
        var id = String(actionId || '').trim();
        if (id.indexOf('agent:') === 0) id = id.slice(6);
        var opt = null;
        for (var i = 0; i < (entries || []).length; i++) {
          if (entries[i].actionId === id) {
            opt = entries[i];
            break;
          }
        }
        if (!opt) return { ok: false, reason: 'option_missing' };
        if (!opt.bindable) return { ok: false, reason: 'not_bindable', option: opt };
        var disp = opt.routeDisposition || 'execute';
        if (disp !== 'execute' && disp !== 'pendingConfirmation') {
          return { ok: false, reason: 'bad_disposition', option: opt };
        }
        return { ok: true, option: opt };
      });
    });
  }

  global.OneToneSemanticActionStore = {
    ensureCatalog: ensureCatalog,
    catalog: catalog,
    fetchOptions: fetchOptions,
    withExecutableNow: withExecutableNow,
    entryMeta: entryMeta,
    fetchPendingSnapshot: fetchPendingSnapshot,
    pendingRows: pendingRows,
    latestPending: latestPending,
    cancelPending: cancelPending,
    bindingViews: bindingViews,
    semanticSlotId: semanticSlotId,
    invalidateOptions: invalidateOptions,
    onChange: onChange,
    notifyLocalChange: notifyLocalChange,
    isSemanticBindableOnChannel: isSemanticBindableOnChannel,
    optionFor: optionFor,
    assertBindable: assertBindable
  };
})(typeof window !== 'undefined' ? window : globalThis);
