/**
 * Freemodel channels — registry + connect capability for home picker.
 *
 * connectKind (product CTA):
 *   one_tap   — enable without opening login (Kilo anonymous)
 *   oauth     — in-app OAuth poll (WorkBuddy, OpenCode Zen)
 *   paste_key — open console + paste Token into model_provider
 *
 * authKind / tokenCapture remain for checkIn plumbing.
 * Soft Pad DeepSeek/Kimi keys are paid API — not freemodel (P2 eliminated).
 *
 * Capability state (primary card status — NOT checkedToday):
 *   unconfigured | connecting | ready | error
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'onetone.freemodel.checkin.v1';
  var ENABLED_KEY = 'onetone.freemodel.enabled.v1';
  var CONNECT_KEY = 'onetone.freemodel.connect.v1';

  /** @type {ReadonlyArray<object>} */
  var CHANNELS = [
    {
      id: 'workbuddy',
      priority: 'P0',
      connectOrder: 20,
      connectKind: 'oauth',
      label: 'WorkBuddy',
      freeQuota: '登录后导入账号模型 → 首页下拉选用',
      authKind: 'oauth',
      tokenCapture: 'oauth_poll',
      checkinUrl: '',
      loginUrl: '',
      baseUrl: '',
      defaultModel: '',
      modelsHint: '账号内免费/赠送模型',
      status: 'active'
    },
    {
      id: 'opencode_zen',
      priority: 'P0',
      connectOrder: 30,
      connectKind: 'oauth',
      label: 'OpenCode Zen',
      freeQuota: '设备登录后进首页下拉 · 默认 big-pickle',
      authKind: 'oauth',
      tokenCapture: 'oauth_poll',
      checkinUrl: 'https://opencode.ai/zen',
      loginUrl: 'https://opencode.ai/console/device',
      baseUrl: 'https://opencode.ai/zen/v1',
      defaultModel: 'big-pickle',
      modelsHint: 'Zen free pool (device OAuth)',
      status: 'active'
    },
    {
      id: 'kilo',
      priority: 'P0',
      connectOrder: 10,
      connectKind: 'one_tap',
      label: 'Kilo',
      freeQuota: '一键启用 kilo-auto/free（可选再填 Key）',
      authKind: 'one_tap',
      tokenCapture: 'none',
      checkinUrl: 'https://app.kilo.ai',
      loginUrl: 'https://app.kilo.ai',
      baseUrl: 'https://ai-gateway.kilo.ai/api/v1',
      defaultModel: 'kilo-auto/free',
      modelsHint: 'kilo-auto/free · Gateway',
      status: 'active'
    },
    {
      id: 'gemini_ca',
      priority: 'P1',
      label: 'Google Antigravity',
      freeQuota: '个人免费档 · 不进首页推理',
      authKind: 'browser_checkin',
      tokenCapture: 'none',
      checkinUrl: 'https://antigravity.google.com/',
      loginUrl: 'https://antigravity.google.com/',
      baseUrl: '',
      defaultModel: '',
      modelsHint: 'Antigravity free / Pro',
      status: 'active'
    },
    {
      id: 'trae',
      priority: 'P1',
      label: 'TRAE',
      freeQuota: '免费档每日额度 · 不进首页推理',
      authKind: 'browser_checkin',
      tokenCapture: 'none',
      checkinUrl: 'https://www.trae.cn/login',
      loginUrl: 'https://www.trae.cn/login',
      baseUrl: '',
      defaultModel: '',
      modelsHint: 'TRAE CN free',
      status: 'active'
    },
    {
      id: 'qoder_cn',
      priority: 'P1',
      label: 'Qoder 中国',
      freeQuota: '每日免费额度 · 不进首页推理',
      authKind: 'browser_checkin',
      tokenCapture: 'none',
      checkinUrl: 'https://qoder.com.cn/users/sign-in',
      loginUrl: 'https://qoder.com.cn/users/sign-in',
      baseUrl: '',
      defaultModel: '',
      modelsHint: 'Qoder CN free',
      status: 'active'
    },
    {
      id: 'loomy',
      priority: 'P0',
      connectOrder: 40,
      connectKind: 'oauth',
      label: 'Loomy（讯飞·含星火）',
      freeQuota: '短信登录后进下拉 · 默认 spark-x',
      authKind: 'oauth',
      tokenCapture: 'oauth_poll',
      checkinUrl: 'https://loomy.xunfei.cn/web/',
      loginUrl: 'https://loomy.xunfei.cn/web/',
      baseUrl: 'https://loomyad.xunfei.cn/api/v1',
      defaultModel: 'spark-x',
      modelsHint: 'Loomy chat · spark-x 等',
      status: 'active'
    },
    {
      id: 'muse_spark',
      priority: 'P2',
      label: '讯飞星火 Lite（控制台 Key）',
      freeQuota: '',
      authKind: 'eliminated',
      tokenCapture: 'none',
      checkinUrl: '',
      modelsHint: '',
      status: 'eliminated',
      reason: '请用「Loomy（讯飞·含星火）」短信登录开通'
    },
    {
      id: 'sensenova',
      priority: 'P2',
      label: '商汤日日新 SenseNova（控制台 Key）',
      freeQuota: '',
      authKind: 'eliminated',
      tokenCapture: 'none',
      checkinUrl: '',
      modelsHint: '',
      status: 'eliminated',
      reason: '请用「Raccoon（商汤）」微信扫码开通'
    },
    {
      id: 'zcode',
      priority: 'P1',
      label: 'ZCode',
      freeQuota: '每日 GLM Flash · 不进首页推理',
      authKind: 'browser_checkin',
      tokenCapture: 'none',
      checkinUrl: 'https://open.bigmodel.cn/login',
      loginUrl: 'https://open.bigmodel.cn/login',
      baseUrl: '',
      defaultModel: '',
      modelsHint: 'BigModel / GLM Flash',
      status: 'active'
    },
    {
      id: 'lobsterai',
      priority: 'P1',
      label: 'LobsterAI 有道龙虾',
      freeQuota: '有免费积分 · 仅龙虾客户端内，不进首页推理',
      authKind: 'browser_checkin',
      tokenCapture: 'none',
      checkinUrl: 'https://lobsterai.youdao.com/portal#/login?redirect=/',
      loginUrl: 'https://lobsterai.youdao.com/portal#/login?redirect=/',
      baseUrl: '',
      defaultModel: '',
      modelsHint: 'Youdao LobsterAI portal',
      status: 'active'
    },
    {
      id: 'raccoon',
      priority: 'P0',
      connectOrder: 50,
      connectKind: 'oauth',
      label: 'Raccoon（商汤）',
      freeQuota: '微信扫码登录后进下拉 · 默认 SenseNova Flash Lite',
      authKind: 'oauth',
      tokenCapture: 'oauth_poll',
      checkinUrl: 'https://www.xiaohuanxiong.com/login',
      // login/mp?code=… is WeChat QR payload (browser 404); HA2 renders QR in-card.
      loginUrl: 'https://xiaohuanxiong.com/login',
      baseUrl: 'https://xiaohuanxiong.com/api/web/llm/v2',
      defaultModel: 'sn-sensenova-6-8-flash-lite',
      modelsHint: 'SenseNova / GLM / Kimi via Raccoon',
      status: 'active'
    },
    {
      id: 'softpad_paid_keys',
      priority: 'P2',
      label: 'Soft Pad DeepSeek / Kimi Key',
      freeQuota: '',
      authKind: 'eliminated',
      tokenCapture: 'none',
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
      tokenCapture: 'none',
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
      tokenCapture: 'none',
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

  function connectKindOf(ch) {
    if (!ch) return 'none';
    if (ch.connectKind) return ch.connectKind;
    if (ch.authKind === 'oauth') return 'oauth';
    if (ch.authKind === 'one_tap') return 'one_tap';
    if (ch.authKind === 'paste_key') return 'paste_key';
    return 'none';
  }

  function tokenCaptureOf(ch) {
    if (!ch) return 'none';
    if (ch.tokenCapture) return ch.tokenCapture;
    if (ch.authKind === 'oauth') return 'oauth_poll';
    if (ch.authKind === 'paste_key') return 'paste_key';
    return 'none';
  }

  function isChatCapable(ch) {
    if (!ch || ch.status !== 'active') return false;
    var kind = connectKindOf(ch);
    if (kind === 'one_tap' || kind === 'oauth' || kind === 'paste_key') {
      return !!ch.baseUrl || ch.id === 'workbuddy';
    }
    return false;
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
            c.authKind === 'anonymous' ||
            c.authKind === 'paste_key' ||
            c.authKind === 'one_tap')
        );
      });
    }
    if (filter.chatCapable) {
      list = list.filter(isChatCapable);
    }
    if (filter.siteOnly) {
      list = list.filter(function (c) {
        return c.status === 'active' && c.authKind === 'browser_checkin';
      });
    }
    return list;
  }

  /** chatCapable sorted by connectOrder (product order, not P0). */
  function connectChannels() {
    return channels({ chatCapable: true })
      .slice()
      .sort(function (a, b) {
        var oa = typeof a.connectOrder === 'number' ? a.connectOrder : 999;
        var ob = typeof b.connectOrder === 'number' ? b.connectOrder : 999;
        if (oa !== ob) return oa - ob;
        return String(a.label || '').localeCompare(String(b.label || ''), 'zh');
      });
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

  function connectStateStore() {
    return readJson(CONNECT_KEY, {});
  }

  function isEnabled(id) {
    var ch = byId(id);
    if (!ch || ch.status !== 'active') return false;
    if (ch.authKind === 'oauth' || ch.authKind === 'one_tap') return true;
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

  /** True only after real auth/enable (status === 'ok'). Auxiliary — not primary card state. */
  function checkedToday(id) {
    var e = entry(id);
    return !!(e && e.day === todayKey() && e.status === 'ok');
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

  function setConnectState(id, state, extra) {
    id = String(id || '').trim();
    state = String(state || '').trim();
    if (!id) return null;
    var st = connectStateStore();
    if (!state || state === 'unconfigured') {
      delete st[id];
    } else {
      st[id] = {
        state: state,
        at: Date.now(),
        error: (extra && extra.error) || ''
      };
    }
    writeJson(CONNECT_KEY, st);
    return st[id] || null;
  }

  function getConnectState(id) {
    var row = connectStateStore()[id];
    if (!row || !row.state) return { state: 'unconfigured', error: '', at: 0 };
    return {
      state: String(row.state),
      error: String(row.error || ''),
      at: Number(row.at) || 0
    };
  }

  /**
   * Resolve primary capability for a channel.
   * @param {object} ch
   * @param {{ hasProvider?: boolean, wbLoggedIn?: boolean, wbModelCount?: number }} ctx
   */
  function resolveCapability(ch, ctx) {
    ctx = ctx || {};
    var stored = getConnectState(ch && ch.id);
    var out = {
      state: 'unconfigured',
      wbPhase: '',
      error: stored.error || '',
      label: '未开通'
    };
    if (!ch) return out;

    if (ch.id === 'workbuddy') {
      var loggedIn = !!ctx.wbLoggedIn;
      var n = Number(ctx.wbModelCount) || 0;
      if (!loggedIn) {
        out.wbPhase = 'logged_out';
        out.state = stored.state === 'connecting' ? 'connecting' : 'unconfigured';
        out.label = out.state === 'connecting' ? '开通中' : '未登录';
        return out;
      }
      if (n <= 0) {
        out.wbPhase = 'no_models';
        out.state = stored.state === 'connecting' ? 'connecting' : 'unconfigured';
        out.label = out.state === 'connecting' ? '开通中' : '已登录但未导入';
        return out;
      }
      out.wbPhase = 'ready';
      out.state = 'ready';
      out.label = '已可用';
      return out;
    }

    if (stored.state === 'connecting') {
      out.state = 'connecting';
      out.label = '开通中';
      return out;
    }
    if (stored.state === 'error' && !ctx.hasProvider) {
      out.state = 'error';
      out.label = '开通失败';
      return out;
    }
    if (ctx.hasProvider || stored.state === 'ready') {
      out.state = 'ready';
      out.label = '已可用';
      return out;
    }
    out.state = 'unconfigured';
    out.label = '未开通';
    return out;
  }

  /**
   * Channels still needing connect (capability ≠ ready).
   * @param {{ readyIds?: Record<string, boolean> }} opts
   */
  function dueChannels(opts) {
    opts = opts || {};
    var readyIds = opts.readyIds || {};
    return connectChannels().filter(function (c) {
      if (readyIds[c.id]) return false;
      var st = getConnectState(c.id);
      if (st.state === 'ready') return false;
      return true;
    });
  }

  function dueCount(opts) {
    return dueChannels(opts).length;
  }

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
   * Kick off connect for one channel.
   * Returns { ok, action: 'one_tap'|'oauth'|'paste_key'|'opened'|'noop', channel, message }
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

    var kind = connectKindOf(ch);

    if (kind === 'one_tap' || ch.authKind === 'one_tap') {
      setConnectState(ch.id, 'connecting');
      return Promise.resolve({
        ok: true,
        action: 'one_tap',
        channel: ch,
        message: 'one_tap_ready'
      });
    }

    if (kind === 'oauth' || tokenCaptureOf(ch) === 'oauth_poll' || ch.authKind === 'oauth') {
      setConnectState(ch.id, 'connecting');
      return Promise.resolve({
        ok: true,
        action: 'oauth',
        channel: ch,
        message: 'start_oauth'
      });
    }

    if (kind === 'paste_key' || tokenCaptureOf(ch) === 'paste_key' || ch.authKind === 'paste_key') {
      var pasteUrl = ch.loginUrl || ch.checkinUrl || '';
      var openPaste =
        opts.openUrl !== false && pasteUrl ? openUrl(pasteUrl) : Promise.resolve(false);
      return openPaste.then(function (opened) {
        return {
          ok: true,
          action: 'paste_key',
          channel: ch,
          opened: !!opened,
          message: 'paste_key_ready'
        };
      });
    }

    if (ch.authKind === 'anonymous') {
      setEnabled(ch.id, true);
      markChecked(ch.id, { status: 'ok', note: 'anonymous_enabled' });
      setConnectState(ch.id, 'ready');
      return Promise.resolve({
        ok: true,
        action: 'enabled',
        channel: ch,
        opened: false,
        message: 'anonymous_ready'
      });
    }

    if (ch.authKind === 'browser_checkin') {
      var siteUrl = ch.loginUrl || ch.checkinUrl || '';
      var openSite =
        opts.openUrl !== false && siteUrl ? openUrl(siteUrl) : Promise.resolve(false);
      return openSite.then(function (opened) {
        var ok = opts.openUrl === false ? true : !!opened;
        return {
          ok: ok,
          action: 'opened',
          channel: ch,
          opened: !!opened,
          message: ok ? 'login_page_opened' : 'open_failed'
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

  function checkInAllDue(opts) {
    opts = opts || {};
    var due = dueChannels(opts);
    var oauthIds = [];
    var oneTapIds = [];
    var queue = Promise.resolve();
    var results = [];
    var staggerMs = typeof opts.staggerMs === 'number' ? opts.staggerMs : 450;

    due.forEach(function (ch, idx) {
      var kind = connectKindOf(ch);
      if (kind === 'oauth' || tokenCaptureOf(ch) === 'oauth_poll' || ch.authKind === 'oauth') {
        oauthIds.push(ch.id);
        return;
      }
      if (kind === 'one_tap' || ch.authKind === 'one_tap') {
        oneTapIds.push(ch.id);
        queue = queue.then(function () {
          return checkIn(ch.id, { openUrl: false }).then(function (r) {
            results.push(r);
          });
        });
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
      return {
        results: results,
        oauthIds: oauthIds,
        oneTapIds: oneTapIds,
        dueCount: due.length
      };
    });
  }

  function summaryLine(ch, cap) {
    if (!ch) return '';
    if (ch.status === 'eliminated' || ch.status === 'deferred') {
      return (ch.reason || ch.status) + '';
    }
    if (cap && cap.label) return cap.label;
    var kind = connectKindOf(ch);
    if (kind === 'one_tap') return '一键启用';
    if (kind === 'oauth') return '登录开通';
    if (kind === 'paste_key') return '登录开通';
    if (ch.authKind === 'browser_checkin') return '仅官网额度';
    return ch.freeQuota || '';
  }

  function connectCtaLabel(ch, cap) {
    if (!ch) return '';
    if (cap && cap.state === 'ready') return '已可用';
    if (cap && cap.state === 'connecting') return '开通中…';
    var kind = connectKindOf(ch);
    if (ch.id === 'workbuddy') {
      if (cap && cap.wbPhase === 'no_models') return '刷新模型';
      return '登录开通';
    }
    if (kind === 'one_tap') return '一键启用';
    if (kind === 'oauth') return '登录开通';
    // Spark / SenseNova: console login → copy key → paste (same CTA language as oauth).
    if (kind === 'paste_key') return '登录开通';
    return '打开登录页';
  }

  global.OneToneFreemodelChannels = {
    STORAGE_KEY: STORAGE_KEY,
    CONNECT_KEY: CONNECT_KEY,
    CHANNELS: CHANNELS,
    channels: channels,
    connectChannels: connectChannels,
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
    summaryLine: summaryLine,
    tokenCaptureOf: tokenCaptureOf,
    connectKindOf: connectKindOf,
    setConnectState: setConnectState,
    getConnectState: getConnectState,
    resolveCapability: resolveCapability,
    connectCtaLabel: connectCtaLabel
  };
})(typeof window !== 'undefined' ? window : globalThis);
