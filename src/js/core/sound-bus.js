/**
 * Attention-first sound bus: typed events → few user categories.
 * Policies: never | when_unseen | always. No overlapping cues; priority arbitration.
 */
(function (global) {
  'use strict';

  var POLICY = { never: 'never', when_unseen: 'when_unseen', always: 'always' };
  var DEDUPE_MS = 800;
  var FAIL_SUPPRESS_DONE_MS = 2500;
  var MIN_TASK_MS = 3000;

  /** @type {Record<string,{category:string,priority:number,defaultPolicy:string,surface:string}>} */
  var EVENT_TABLE = {
    'agent.needs_input': { category: 'needAttention', priority: 100, defaultPolicy: POLICY.when_unseen, surface: 'agent' },
    'agent.failed': { category: 'taskFailed', priority: 80, defaultPolicy: POLICY.when_unseen, surface: 'agent' },
    'agent.completed': { category: 'taskDone', priority: 40, defaultPolicy: POLICY.when_unseen, surface: 'agent' },
    'pad.dispatch_failed': { category: 'taskFailed', priority: 85, defaultPolicy: POLICY.always, surface: 'none' },
    'voice.wake_failed': { category: 'taskFailed', priority: 85, defaultPolicy: POLICY.always, surface: 'none' },
    'voice.cancel_phrase': { category: 'confirm', priority: 30, defaultPolicy: POLICY.always, surface: 'none' },
    'voice.send_failed': { category: 'taskFailed', priority: 85, defaultPolicy: POLICY.always, surface: 'none' },
    'voice.send_succeeded': { category: 'confirm', priority: 20, defaultPolicy: POLICY.always, surface: 'none' },
    'mic.device_lost': { category: 'deviceAlert', priority: 95, defaultPolicy: POLICY.when_unseen, surface: 'device' },
    'mic.switch_failed': { category: 'deviceAlert', priority: 90, defaultPolicy: POLICY.when_unseen, surface: 'device' },
    'engine.degraded': { category: 'deviceAlert', priority: 95, defaultPolicy: POLICY.when_unseen, surface: 'device' },
    'model.missing': { category: 'deviceAlert', priority: 95, defaultPolicy: POLICY.when_unseen, surface: 'device' }
  };

  var CATEGORY_DEFAULTS = {
    needAttention: { policy: POLICY.when_unseen, id: 'input-ready-soft' },
    taskFailed: { policy: POLICY.when_unseen, id: 'error-subtle' },
    taskDone: { policy: POLICY.when_unseen, id: 'send-confirm-click' },
    confirm: { policy: POLICY.always, id: 'tiny-tick' },
    deviceAlert: { policy: POLICY.when_unseen, id: 'error-subtle' }
  };

  var USER_CATEGORY_KEYS = Object.keys(CATEGORY_DEFAULTS);

  var lastByDedupe = {};
  var lastPlayedAt = 0;
  var lastPlayedPriority = 0;
  var lastFailAt = 0;
  var playingUntil = 0;
  var lastResults = [];

  function prefs() {
    return global.OneToneAppThemePrefs;
  }

  function sounds() {
    var p = prefs();
    return p && p.ensureSoundsConfig ? p.ensureSoundsConfig() : null;
  }

  function normalizePolicy(raw, fallback) {
    var p = String(raw || '').trim().toLowerCase();
    if (p === 'never' || p === 'when_unseen' || p === 'always') return p;
    if (p === 'off' || p === 'false') return POLICY.never;
    if (p === 'on' || p === 'true') return POLICY.always;
    return fallback || POLICY.never;
  }

  function categoryConfig(cat) {
    var s = sounds() || {};
    var cats = s.categories || {};
    var def = CATEGORY_DEFAULTS[cat] || { policy: POLICY.never, id: 'tiny-tick' };
    var cur = cats[cat] || {};
    return {
      policy: normalizePolicy(cur.policy, def.policy),
      id: String(cur.id || def.id || 'tiny-tick')
    };
  }

  function surfaceSeen(surface) {
    var api = global.OneToneSoundSurfaces;
    if (!api) return false;
    if (surface === 'agent') return !!(api.agentFeedbackSeen && api.agentFeedbackSeen());
    if (surface === 'device') return !!(api.deviceAlertSeen && api.deviceAlertSeen());
    return false;
  }

  function pushResult(result, eventId, detail) {
    var row = { result: result, eventId: eventId || '', at: Date.now(), detail: detail || '' };
    lastResults.push(row);
    while (lastResults.length > 40) lastResults.shift();
    return result;
  }

  function effectivePolicy(eventId, meta) {
    var eventOverride = meta && meta.policy;
    if (eventOverride) return normalizePolicy(eventOverride, meta.defaultPolicy);
    // Event default wins over category default when more specific (always for pad fail).
    var cat = categoryConfig(meta.category);
    // Category policy can only restrict: never always wins; else use stricter of event default vs category.
    if (cat.policy === POLICY.never) return POLICY.never;
    if (meta.defaultPolicy === POLICY.always && cat.policy === POLICY.when_unseen) {
      // User set category to when_unseen — respect for agent.failed; eyes-off fails keep always via event default.
      if (eventId === 'agent.failed') return POLICY.when_unseen;
      return POLICY.always;
    }
    if (meta.defaultPolicy === POLICY.when_unseen) return cat.policy === POLICY.always ? POLICY.always : POLICY.when_unseen;
    return cat.policy;
  }

  /**
   * @param {string} eventId
   * @param {{dedupeKey?:string, taskMs?:number, forcePreview?:boolean}} [opts]
   * @returns {string} result code
   */
  function notify(eventId, opts) {
    opts = opts || {};
    eventId = String(eventId || '').trim();
    var meta = EVENT_TABLE[eventId];
    if (!meta) return pushResult('suppressed_disabled', eventId, 'unknown_event');

    if (eventId === 'agent.completed') {
      // Rust already gates ≥ MIN_TASK_MS before emit; only enforce when caller passes taskMs.
      if (opts.taskMs != null) {
        var taskMs = Number(opts.taskMs);
        if (!isFinite(taskMs) || taskMs < MIN_TASK_MS) {
          return pushResult('suppressed_disabled', eventId, 'short_task');
        }
      }
      if (lastFailAt && Date.now() - lastFailAt < FAIL_SUPPRESS_DONE_MS) {
        return pushResult('suppressed_priority', eventId, 'after_fail');
      }
    }

    var s = sounds();
    if (!s || !s.masterEnabled) return pushResult('suppressed_master', eventId);

    var policy = effectivePolicy(eventId, meta);
    if (policy === POLICY.never) return pushResult('suppressed_disabled', eventId, 'never');

    if (policy === POLICY.when_unseen && surfaceSeen(meta.surface)) {
      return pushResult('suppressed_seen', eventId);
    }

    var dedupeKey = String(opts.dedupeKey || eventId);
    var now = Date.now();
    var prev = lastByDedupe[dedupeKey] || 0;
    if (now - prev < DEDUPE_MS) return pushResult('suppressed_duplicate', eventId);

    if (now < playingUntil && meta.priority <= lastPlayedPriority) {
      return pushResult('suppressed_priority', eventId, 'overlap');
    }
    if (now - lastPlayedAt < 120 && meta.priority < lastPlayedPriority) {
      return pushResult('suppressed_priority', eventId, 'lower');
    }

    var cat = categoryConfig(meta.category);
    var p = prefs();
    if (!p || typeof p.playSoundFile !== 'function') {
      return pushResult('suppressed_disabled', eventId, 'no_player');
    }

    lastByDedupe[dedupeKey] = now;
    lastPlayedAt = now;
    lastPlayedPriority = meta.priority;
    playingUntil = now + 320;
    if (eventId === 'agent.failed' || eventId.indexOf('failed') >= 0 || eventId.indexOf('device_lost') >= 0) {
      lastFailAt = now;
    }

    p.playSoundFile(cat.id, true);
    return pushResult('played', eventId);
  }

  /** Map legacy runtime soundCue → bus or legacy slot playback. */
  function handleRuntimeCue(cue) {
    cue = String(cue || '').trim();
    if (!cue) return '';
    if (EVENT_TABLE[cue]) return notify(cue, { dedupeKey: cue });
    if (cue === 'send_fail') return notify('voice.send_failed', { dedupeKey: 'voice.send_failed' });
    if (cue === 'send_success') return notify('voice.send_succeeded', { dedupeKey: 'voice.send_succeeded' });
    // Legacy snake cues → keep theme-prefs slot path
    var p = prefs();
    if (p && p.playSoundCue) {
      p.playSoundCue(cue);
      return 'legacy';
    }
    return 'suppressed_disabled';
  }

  function ensureCategoriesConfig(soundsObj) {
    if (!soundsObj.categories || typeof soundsObj.categories !== 'object') soundsObj.categories = {};
    USER_CATEGORY_KEYS.forEach(function (key) {
      var def = CATEGORY_DEFAULTS[key];
      if (!soundsObj.categories[key]) {
        soundsObj.categories[key] = { policy: def.policy, id: def.id };
      } else {
        if (!soundsObj.categories[key].policy) soundsObj.categories[key].policy = def.policy;
        if (!soundsObj.categories[key].id) soundsObj.categories[key].id = def.id;
        soundsObj.categories[key].policy = normalizePolicy(soundsObj.categories[key].policy, def.policy);
      }
    });
    return soundsObj.categories;
  }

  global.OneToneSoundBus = {
    POLICY: POLICY,
    EVENT_TABLE: EVENT_TABLE,
    CATEGORY_DEFAULTS: CATEGORY_DEFAULTS,
    USER_CATEGORY_KEYS: USER_CATEGORY_KEYS,
    MIN_TASK_MS: MIN_TASK_MS,
    notify: notify,
    handleRuntimeCue: handleRuntimeCue,
    ensureCategoriesConfig: ensureCategoriesConfig,
    lastResults: function () {
      return lastResults.slice();
    },
    resetForTest: function () {
      lastByDedupe = {};
      lastPlayedAt = 0;
      lastPlayedPriority = 0;
      lastFailAt = 0;
      playingUntil = 0;
      lastResults = [];
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
