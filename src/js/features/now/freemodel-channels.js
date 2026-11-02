/**
 * Freemodel channels — P0–P2 registry + one-click daily check-in.
 *
 * Auth kinds:
 *   oauth           — in-app browser OAuth (WorkBuddy)
 *   anonymous       — no login; mark ready / enable free pool
 *   browser_checkin — open official page; record today locally
 *   eliminated      — not offered as freemodel
 *
 * Soft Pad DeepSeek/Kimi keys are paid API — not freemodel (P2 eliminated).
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'onetone.freemodel.checkin.v1';
  var ENABLED_KEY = 'onetone.freemodel.enabled.v1';

  /** @type {ReadonlyArray<object>} */
  var CHANNELS = [
    // —— P0: usable now / primary free lanes ——
    {
      id: 'workbuddy',
      priority: 'P0',
      label: 'WorkBuddy',
      freeQuota: '登录账号额度 · 多模型可切换',
      authKind: 'oauth',
      checkinUrl: '',
      modelsHint: '账号内免费/赠送模型',
      status: 'active'
    },
    {
      id: 'opencode_zen',
      priority: 'P0',
      label: 'OpenCode Zen',
      freeQuota: '匿名免费模型池 · 无需登录',
      authKind: 'anonymous',
      checkinUrl: 'https://opencode.ai/zen',
      modelsHint: 'Zen free pool',
      status: 'active'
    },
    {
      id: 'kilo',
      priority: 'P0',
      label: 'Kilo',
      freeQuota: '免费模型池 · 无需登录',
      authKind: 'anonymous',
      checkinUrl: 'https://kilo.ai',
      modelsHint: 'Kilo free pool',
      status: 'active'
    },
    // —— P1: daily browser check-in (quota confirmed) ——
    {
      id: 'gemini_ca',
      priority: 'P1',
      label: 'Gemini Code Assist',
      freeQuota: '约 1000 次/天',
      authKind: 'browser_checkin',
      checkinUrl: 'https://codeassist.google.com/',
      modelsHint: 'gemini-2.5 / code assist',
      status: 'active'
    },
    {
      id: 'trae',
      priority: 'P1',
      label: 'TRAE',
      freeQuota: '免费档每日额度',
      authKind: 'browser_checkin',
      checkinUrl: 'https://www.trae.ai/',
      modelsHint: 'TRAE free tier',
      status: 'active'
    },
    {
      id: 'qoder_cn',
      priority: 'P1',
      label: 'Qoder 中国',
      freeQuota: '每日免费额度',
      authKind: 'browser_checkin',
      checkinUrl: 'https://qoder.com/',
      modelsHint: 'Qoder CN free',
      status: 'active'
    },
    {
      id: 'loomy',
      priority: 'P1',
      label: 'Loomy',
      freeQuota: '每日登录积分',
      authKind: 'browser_checkin',
      checkinUrl: 'https://loomy.ai/',
      modelsHint: 'daily points',
      status: 'active'
    },
    {
      id: 'zcode',
      priority: 'P1',
      label: 'ZCode',
      freeQuota: '每日 GLM Flash',
      authKind: 'browser_checkin',
      checkinUrl: 'https://z.codes/',
      modelsHint: 'daily GLM flash',
      status: 'active'
    },
    {
      id: 'lobsterai',
      priority: 'P1',
      label: 'LobsterAI',
      freeQuota: '注册礼包 + 每日礼包',
      authKind: 'browser_checkin',
      checkinUrl: 'https://lobsterai.com/',
      modelsHint: 'daily gift',
      status: 'active'
    },
    {
      id: 'raccoon',
      priority: 'P1',
      label: 'Raccoon',
      freeQuota: '约 300 积分/天',
      authKind: 'browser_checkin',
      checkinUrl: 'https://raccoon.tencent.com/',
      modelsHint: 'daily points',
      status: 'active'
    },
    // —— P2: eliminated / deferred as freemodel ——
    {
      id: 'muse_spark',
      priority: 'P2',
      label: '星火 / Muse Spark',
      freeQuota: '',
      authKind: 'eliminated',
      checkinUrl: '',
      modelsHint: '',
      status: 'eliminated',
      reason: '活动已结束，不再作为 freemodel'
    },
    {
      id: 'softpad_paid_keys',
      priority: 'P2',
      label: 'Soft Pad DeepSeek / Kimi Key',
      freeQuota: '',
      authKind: 'eliminated',
      checkinUrl: '',
      modelsHint: '',
      status: 'eliminated',
      reason: '付费 API Key，非账号免费额度；请走「自定义 API」'
    },
    {
      id: 'cline',
      priority: 'P2',
      label: 'Cline',
      freeQuota: '',
      authKind: 'eliminated',
      checkinUrl: '',
      modelsHint: '',
      status: 'eliminated',
      reason: '工具壳 / BYOK，非独立免费额度源'
    },
    {
      id: 'workbuddy_global',
      priority: 'P2',
      label: 'WorkBuddy Global OAuth',
      freeQuota: '',
      authKind: 'eliminated',
      checkinUrl: '',
      modelsHint: '',
      status: 'deferred',
      reason: '后端 oauth_region_global_todo，暂仅 CN'
    }
  ];

  function todayKey(d) {
    d = d || new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function readJson(key, fallback) {
    try {
      var raw = global.localStorage && global.localStorage.getItem(key);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(key, JSON.stringify(value));
      }
    } catch (_) {}
  }

  function channels(filter) {
    var list = CHANNELS.slice();
    if (!filter) return list;
    if (filter.priority) {
      list = list.filter(function (c) {
        return c.priority === filter.priority;
      });
    }
    if (filter.activeOnly) {
      list = list.filter(function (c) {
        return c.status === 'active';
      });
    }
    if (filter.checkinable) {
      list = list.filter(function (c) {
        return (
          c.status === 'active' &&
          (c.authKind === 'oauth' ||
            c.authKind === 'browser_checkin' ||
            c.authKind === 'anonymous')
        );
      });
    }
    return list;
  }

  function byId(id) {
    id = String(id || '').trim();
    for (var i = 0; i < CHANNELS.length; i++) {
      if (CHANNELS[i].id === id) return CHANNELS[i];
    }
    return null;
  }

  function checkinState() {
    return readJson(STORAGE_KEY, {});
  }

  function enabledState() {
    return readJson(ENABLED_KEY, {});
  }

  function isEnabled(id) {
    var ch = byId(id);
    if (!ch || ch.status !== 'active') return false;
    if (ch.authKind === 'oauth') return true; // WB gated by account, not this flag
    var st = enabledState();
    return !!st[id];
  }

  function setEnabled(id, on) {
    var st = enabledState();
    if (on) st[id] = { on: true, at: Date.now() };
    else delete st[id];
    writeJson(ENABLED_KEY, st);
    return isEnabled(id);
  }

  function entry(id) {
    var st = checkinState();
    return st[id] || null;
  }

  function checkedToday(id) {
    var e = entry(id);
    return !!(e && e.day === todayKey());
  }

  function needsCheckin(id) {
    var ch = byId(id);
    if (!ch || ch.status !== 'active') return false;
    if (ch.authKind === 'eliminated') return false;
    return !checkedToday(id);
  }

  function markChecked(id, extra) {
    id = String(id || '').trim();
    if (!id) return null;
    var st = checkinState();
    var row = {
      day: todayKey(),
      at: Date.now(),
      status: (extra && extra.status) || 'ok',
      note: (extra && extra.note) || ''
    };
    st[id] = row;
    writeJson(STORAGE_KEY, st);
    return row;
  }

  function dueChannels() {
    return channels({ checkinable: true }).filter(function (c) {
      return needsCheckin(c.id);
    });
  }

  function dueCount() {
    return dueChannels().length;
  }

  /**
   * Open URL via Tauri when possible; fall back to window.open.
   * @returns {Promise<boolean>}
   */
  function openUrl(url) {
    url = String(url || '').trim();
    if (!url) return Promise.resolve(false);
    var ipc = global.OneToneIpc;
    if (ipc && typeof ipc.invoke === 'function') {
      return ipc
        .invoke('cmd_open_url', { url: url })
        .then(function () {
          return true;
        })
        .catch(function () {
          try {
            global.open(url, '_blank', 'noopener,noreferrer');
            return true;
          } catch (_) {
            return false;
          }
        });
    }
    try {
      global.open(url, '_blank', 'noopener,noreferrer');
      return Promise.resolve(true);
    } catch (_) {
      return Promise.resolve(false);
    }
  }

  /**
   * One channel check-in.
   * Returns { ok, action: 'oauth'|'opened'|'enabled'|'noop', channel, message }
   */
  function checkIn(id, opts) {
    opts = opts || {};
    var ch = byId(id);
    if (!ch) {
      return Promise.resolve({
        ok: false,
        action: 'noop',
        channel: null,
        message: 'unknown_channel'
      });
    }
    if (ch.status !== 'active') {
      return Promise.resolve({
        ok: false,
        action: 'noop',
        channel: ch,
        message: ch.reason || 'eliminated'
      });
    }

    if (ch.authKind === 'oauth') {
      // Host starts WorkBuddy OAuth; we only pre-mark pending unless skipMark.
      if (!opts.skipMark) {
        markChecked(ch.id, { status: 'pending', note: 'oauth_started' });
      }
      return Promise.resolve({
        ok: true,
        action: 'oauth',
        channel: ch,
        message: 'start_oauth'
      });
    }

    if (ch.authKind === 'anonymous') {
      setEnabled(ch.id, true);
      markChecked(ch.id, { status: 'ok', note: 'anonymous_enabled' });
      var openAnon = opts.openUrl !== false && ch.checkinUrl
        ? openUrl(ch.checkinUrl)
        : Promise.resolve(false);
      return openAnon.then(function (opened) {
        return {
          ok: true,
          action: 'enabled',
          channel: ch,
          opened: !!opened,
          message: 'anonymous_ready'
        };
      });
    }

    if (ch.authKind === 'browser_checkin') {
      return openUrl(ch.checkinUrl).then(function (opened) {
        markChecked(ch.id, {
          status: opened ? 'ok' : 'fail',
          note: opened ? 'browser_opened' : 'open_failed'
        });
        setEnabled(ch.id, true);
        return {
          ok: !!opened,
          action: 'opened',
          channel: ch,
          opened: !!opened,
          message: opened ? 'checkin_opened' : 'open_failed'
        };
      });
    }

    return Promise.resolve({
      ok: false,
      action: 'noop',
      channel: ch,
      message: 'unsupported'
    });
  }

  /**
   * Batch: browser + anonymous first (staggered), oauth channels returned for host.
   * @returns {Promise<{ results: object[], oauthIds: string[] }>}
   */
  function checkInAllDue(opts) {
    opts = opts || {};
    var due = dueChannels();
    var oauthIds = [];
    var queue = Promise.resolve();
    var results = [];
    var staggerMs = typeof opts.staggerMs === 'number' ? opts.staggerMs : 450;

    due.forEach(function (ch, idx) {
      if (ch.authKind === 'oauth') {
        oauthIds.push(ch.id);
        return;
      }
      queue = queue.then(function () {
        return checkIn(ch.id, { openUrl: opts.openUrl !== false }).then(function (r) {
          results.push(r);
          if (idx < due.length - 1 && staggerMs > 0) {
            return new Promise(function (resolve) {
              global.setTimeout(resolve, staggerMs);
            });
          }
        });
      });
    });

    return queue.then(function () {
      return { results: results, oauthIds: oauthIds, dueCount: due.length };
    });
  }

  function summaryLine(ch) {
    if (!ch) return '';
    if (ch.status === 'eliminated' || ch.status === 'deferred') {
      return (ch.reason || ch.status) + '';
    }
    if (checkedToday(ch.id)) {
      return '今日已签到';
    }
    if (ch.authKind === 'oauth') return '待登录领取额度';
    if (ch.authKind === 'anonymous') return '一键启用免费池';
    return '待签到 · ' + (ch.freeQuota || '');
  }

  global.OneToneFreemodelChannels = {
    STORAGE_KEY: STORAGE_KEY,
    CHANNELS: CHANNELS,
    channels: channels,
    byId: byId,
    todayKey: todayKey,
    checkinState: checkinState,
    entry: entry,
    checkedToday: checkedToday,
    needsCheckin: needsCheckin,
    markChecked: markChecked,
    dueChannels: dueChannels,
    dueCount: dueCount,
    isEnabled: isEnabled,
    setEnabled: setEnabled,
    openUrl: openUrl,
    checkIn: checkIn,
    checkInAllDue: checkInAllDue,
    summaryLine: summaryLine
  };
})(typeof window !== 'undefined' ? window : globalThis);
