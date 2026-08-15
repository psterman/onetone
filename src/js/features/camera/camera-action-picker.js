/**
 * Camera action picker — full-screen modal, 2D filter (app × scene) + search.
 */
(function (global) {
  'use strict';

  var HOST_ID = 'cameraActionPickerOverlay';
  var DEFAULT_LIMIT = 5;
  var SCENES = [
    { id: 'begin', zh: '启动', en: 'Start' },
    { id: 'end', zh: '结束', en: 'End' },
    { id: 'general', zh: '通用', en: 'General' }
  ];
  var CHANNEL_DIRS = [
    { id: '', zh: '全部', en: 'All' },
    { id: 'key', zh: '按键', en: 'Keys' },
    { id: 'voice', zh: '语音', en: 'Voice' },
    { id: 'softPad', zh: '虚拟键盘', en: 'Soft Pad' }
  ];
  var BINDKEY_SCENE = {
    deliberateBlink: 'begin',
    openPalm: 'begin',
    shakeHead: 'end',
    onAway: 'general',
    onReturn: 'general',
    okHand: 'general',
    fist: 'general',
    wave: 'general'
  };
  var LOCAL_SCENE = {
    none: 'general',
    pressEsc: 'end',
    pressCtrlI: 'begin',
    privacyScreen: 'general',
    pauseVoice: 'general',
    resumeVoice: 'general',
    lowPowerMode: 'general'
  };

  var openOpts = null;
  var uiState = {
    bindKey: '',
    mappingId: '',
    sceneTab: 'general',
    query: '',
    channelTab: '',
    showAll: false,
    activeIndex: -1,
    apps: [],
    views: [],
    options: [],
    rowEl: null,
    returnFocus: null
  };

  var RECENCY_PREFIX = 'onetone.cameraActionRecency.';

  function t(key, fb) {
    if (global.OneToneI18n && global.OneToneI18n.t) {
      var v = global.OneToneI18n.t(key);
      if (v && v !== key) return v;
    }
    return fb != null ? fb : key;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function langEn() {
    return (
      global.OneToneI18n &&
      global.OneToneI18n.getLang &&
      String(global.OneToneI18n.getLang()).toLowerCase().indexOf('en') === 0
    );
  }

  function api() {
    return global.OneToneCameraPresenceActions || null;
  }

  function stateRoot() {
    return (global.OneToneState && global.OneToneState.state) || {};
  }

  function cfg() {
    return stateRoot().config || {};
  }

  function canonicalActionId(token) {
    var A = global.OneToneAgentActions;
    var norm = api() && api().normalizeAction ? api().normalizeAction(token) : String(token || 'none');
    if (norm.indexOf('agent:') === 0) {
      var raw = norm.slice(6);
      if (A && A.resolveCanonicalActionId) return A.resolveCanonicalActionId(raw);
      return raw;
    }
    if (norm.indexOf('.') > 0) return norm;
    if (norm === 'pressEsc') return 'input.cancel';
    if (norm === 'pressCtrlI') return 'input.start';
    return norm;
  }

  function tokensMatch(a, b) {
    return canonicalActionId(a) === canonicalActionId(b) || String(a || '') === String(b || '');
  }

  function defaultSceneForBindKey(bindKey) {
    return BINDKEY_SCENE[String(bindKey || '')] || 'general';
  }

  function tokenScene(token) {
    var norm = api() && api().normalizeAction ? api().normalizeAction(token) : String(token || '');
    if (LOCAL_SCENE[norm]) return LOCAL_SCENE[norm];
    var store = global.OneToneSemanticActionStore;
    var id = norm.indexOf('agent:') === 0 ? norm.slice(6) : norm;
    var meta = store && store.entryMeta ? store.entryMeta(id) : null;
    if (meta) {
      var cat = String(meta.category || '').toLowerCase();
      if (cat === 'input' && (id.indexOf('start') >= 0 || id === 'agent.focus')) return 'begin';
      if (cat === 'input' && (id.indexOf('cancel') >= 0 || id.indexOf('commit') >= 0 || id.indexOf('send') >= 0))
        return 'end';
      if (cat === 'decision') return 'end';
    }
    if (id.indexOf('input.start') === 0 || id === 'agent.focus' || id === 'startDictation' || id === 'openAgent')
      return 'begin';
    if (
      id.indexOf('input.cancel') === 0 ||
      id.indexOf('input.commit') === 0 ||
      id === 'cancel' ||
      id.indexOf('input.send') === 0 ||
      id === 'agent.approve'
    )
      return 'end';
    return 'general';
  }

  function bindKeyTitle(bindKey) {
    var map = {
      onAway: t('cameraCardAwayTitle', '离席'),
      onReturn: t('cameraCardReturnTitle', '回席'),
      shakeHead: t('cameraCardShakeTitle', '摇头'),
      deliberateBlink: t('cameraCardBlinkTitle', '故意眨眼确认'),
      openPalm: t('cameraCardOpenPalmTitle', '五指张开'),
      okHand: t('cameraCardOkHandTitle', 'OK'),
      fist: t('cameraCardFistTitle', '握拳'),
      wave: t('cameraCardWaveTitle', '挥手')
    };
    return map[bindKey] || String(bindKey || '');
  }

  function actionLabel(token) {
    if (api() && api().actionLabel) return api().actionLabel(token);
    return String(token || 'none');
  }

  function normalizeChannel(ch) {
    var s = String(ch || '').trim();
    if (s === 'key' || s === 'keys') return 'key';
    if (s === 'voice' || s === 'voiceWake') return 'voice';
    if (s === 'softPad' || s === 'softpad' || s === 'soft_pad') return 'softPad';
    if (s === 'camera' || s === 'cam') return 'camera';
    return s;
  }

  function channelLabel(ch) {
    ch = normalizeChannel(ch);
    if (ch === 'key') return t('cameraPickerChKey', '按键');
    if (ch === 'voice') return t('cameraPickerChVoice', '语音');
    if (ch === 'softPad') return t('cameraPickerChSoftPad', 'Soft Pad');
    if (ch === 'camera') return t('cameraPickerChCamera', '摄像头');
    return ch;
  }

  function channelIconSvg(ch) {
    if (ch === 'voice')
      return '<svg class="cap-channel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>';
    if (ch === 'softPad')
      return '<svg class="cap-channel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01M8 15h8"/></svg>';
    if (ch === 'key')
      return '<svg class="cap-channel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/></svg>';
    return '<svg class="cap-channel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></svg>';
  }

  function buildApps() {
    var diff = global.OneToneHabitOverrideDiff;
    var core = global.OneToneMappingCore;
    var shared = global.OneToneHabitShared;
    var mappings = Array.isArray(cfg().mappings) ? cfg().mappings : [];
    var baseline =
      diff && diff.findGlobalBaselineMapping ? diff.findGlobalBaselineMapping(cfg(), core) : null;
    var apps = [];
    if (baseline && baseline.id) {
      apps.push({
        mappingId: String(baseline.id),
        label: t('cameraPickerBaseline', '通用设置'),
        sub: t('cameraPickerBaselineSub', '全局默认'),
        isBaseline: true,
        iconHtml: '<span class="cap-app-icon">⌂</span>'
      });
    }
    mappings.forEach(function (m) {
      if (!m || !m.id) return;
      if (baseline && m.id === baseline.id) return;
      if (diff && diff.isAppScenarioMapping && !diff.isAppScenarioMapping(m)) return;
      var name =
        shared && shared.appName ? shared.appName(m) : String(m.group || m.label || m.id);
      var scene = shared && shared.sceneName ? shared.sceneName(m) : '';
      apps.push({
        mappingId: String(m.id),
        label: name,
        sub: scene,
        isBaseline: false,
        iconHtml:
          shared && shared.appIconHtml
            ? shared.appIconHtml(m).replace('habit-ws-app-icon', 'cap-app-icon')
            : '<span class="cap-app-icon">' + esc(name.charAt(0) || '?') + '</span>'
      });
    });
    return apps;
  }

  function hintAliases(aid) {
    var id = String(aid || '').trim();
    if (!id) return [];
    var out = [id];
    var canon = canonicalActionId(id);
    if (canon && out.indexOf(canon) < 0) out.push(canon);
    if (id.indexOf('agent:') === 0 && out.indexOf(id.slice(6)) < 0) out.push(id.slice(6));
    if (id.indexOf('.') < 0) {
      var dotted = 'agent.' + id;
      if (out.indexOf(dotted) < 0) out.push(dotted);
    }
    return out;
  }

  function buildCrossHintMap(views, mappingId) {
    var map = {};
    (views || []).forEach(function (v) {
      if (!v) return;
      if (v.enabled === false) return;
      var raw = String(v.actionId || v.action_id || '').trim();
      if (!raw) return;
      var ch = normalizeChannel(v.channel);
      if (!ch || ch === 'camera') return;
      var trig = String(v.trigger || v.bindingRef || v.binding_ref || '').trim();
      var rec = null;
      var aliases = hintAliases(raw);
      for (var a = 0; a < aliases.length; a++) {
        if (map[aliases[a]]) {
          rec = map[aliases[a]];
          break;
        }
      }
      if (!rec) rec = { current: [], other: [] };
      aliases.forEach(function (k) {
        map[k] = rec;
      });
      var onCurrent = String(v.mappingId || v.mapping_id || mappingId) === String(mappingId);
      var bucket = onCurrent ? rec.current : rec.other;
      var dup = false;
      for (var i = 0; i < bucket.length; i++) {
        if (bucket[i].channel === ch && bucket[i].trigger === trig) {
          dup = true;
          break;
        }
      }
      if (dup) return;
      if (onCurrent) bucket.push({ channel: ch, trigger: trig });
      else
        bucket.push({
          mappingLabel: String(v.mappingLabel || v.mapping_label || ''),
          channel: ch,
          trigger: trig
        });
    });
    return map;
  }

  function lookupHint(token, hintMap) {
    var id = canonicalActionId(token);
    var hint = hintMap && hintMap[id];
    if (hint && hint.current && hint.current.length) return hint;
    var keys = Object.keys(hintMap || {});
    for (var i = 0; i < keys.length; i++) {
      if (tokensMatch(keys[i], token)) return hintMap[keys[i]];
    }
    return null;
  }

  function tokenBoundOnChannel(token, hintMap, channel) {
    var hint = lookupHint(token, hintMap);
    if (!hint || !hint.current) return false;
    var want = normalizeChannel(channel);
    for (var i = 0; i < hint.current.length; i++) {
      if (normalizeChannel(hint.current[i].channel) === want) return true;
    }
    return false;
  }

  function channelCounts(hintMap) {
    var counts = { key: 0, voice: 0, softPad: 0 };
    var seenRec = [];
    Object.keys(hintMap || {}).forEach(function (aid) {
      var rec = hintMap[aid];
      if (!rec || seenRec.indexOf(rec) >= 0) return;
      seenRec.push(rec);
      var cur = rec.current || [];
      var seenCh = {};
      cur.forEach(function (e) {
        var ch = normalizeChannel(e.channel);
        if (counts[ch] == null || seenCh[ch]) return;
        seenCh[ch] = true;
        counts[ch] += 1;
      });
    });
    return counts;
  }

  function formatCrossHint(token, hintMap, channelTab) {
    var hint = lookupHint(token, hintMap);
    if (!hint || !hint.current || !hint.current.length) return '';
    var want = normalizeChannel(channelTab);
    var rows = hint.current.filter(function (e) {
      return !want || normalizeChannel(e.channel) === want;
    });
    if (!rows.length) return '';
    if (want) {
      return rows
        .map(function (e) {
          return e.trigger || '—';
        })
        .join(' · ');
    }
    var seenCh = {};
    var out = [];
    rows.forEach(function (e) {
      var ch = normalizeChannel(e.channel);
      if (!ch || seenCh[ch]) return;
      seenCh[ch] = true;
      out.push(
        t('cameraPickerHintFmt', '已在{ch} {trig}')
          .replace('{ch}', channelLabel(ch))
          .replace('{trig}', e.trigger || '—')
      );
    });
    return out.join(' · ');
  }

  function requiresConfirm(token) {
    var store = global.OneToneSemanticActionStore;
    var id = canonicalActionId(token);
    var opt = null;
    if (store && store.optionFor && uiState.mappingId) {
      opt = store.optionFor(uiState.mappingId, 'camera', id);
    }
    if (opt && opt.routeDisposition === 'pendingConfirmation') return true;
    var meta = store && store.entryMeta ? store.entryMeta(id) : null;
    if (meta && meta.requiresSecondChannelFrom && meta.requiresSecondChannelFrom.indexOf('camera') >= 0)
      return true;
    return id === 'input.send' || id === 'agent.approve';
  }

  function recencyMap(bindKey) {
    try {
      var raw = global.localStorage && localStorage.getItem(RECENCY_PREFIX + bindKey);
      var obj = raw ? JSON.parse(raw) : {};
      return obj && typeof obj === 'object' ? obj : {};
    } catch (_) {
      return {};
    }
  }

  function recencyOf(map, token) {
    if (!map) return 0;
    var n = Number(map[token] || map[canonicalActionId(token)] || 0);
    return n > 0 ? n : 0;
  }

  function bumpRecency(bindKey, token) {
    try {
      if (!global.localStorage || !token || token === 'none') return;
      var map = recencyMap(bindKey);
      map[token] = Date.now();
      localStorage.setItem(RECENCY_PREFIX + bindKey, JSON.stringify(map));
    } catch (_) {}
  }

  function tokenFromOption(entry) {
    if (!entry) return '';
    var id = String(entry.actionId || entry.action_id || '').trim();
    if (!id) return '';
    var A = global.OneToneAgentActions;
    return A && A.agentActionToken ? A.agentActionToken(id) : 'agent:' + id;
  }

  function collectAllowedTokens(bindKey) {
    return api() && api().allowedActionsForBindKey ? api().allowedActionsForBindKey(bindKey) : ['none'];
  }

  function collectCandidateTokens(bindKey, options, query) {
    var apiRef = api();
    var norm = function (tok) {
      return apiRef && apiRef.normalizeAction ? apiRef.normalizeAction(tok) : String(tok || 'none');
    };
    var seen = {};
    var out = [];
    function add(tok) {
      tok = norm(tok);
      if (!tok || tok === 'none') return;
      var canon = canonicalActionId(tok);
      if (seen[canon] || seen[tok]) return;
      seen[canon] = true;
      seen[tok] = true;
      out.push(tok);
    }
    (collectAllowedTokens(bindKey) || []).forEach(add);
    (options || []).forEach(function (e) {
      if (!e || e.bindable === false) return;
      add(tokenFromOption(e));
      if (e.actionId) add(e.actionId);
    });
    if (String(query || '').trim()) {
      var store = global.OneToneSemanticActionStore;
      var cat = store && store.catalog ? store.catalog() : null;
      var entries = cat && cat.entries ? cat.entries : [];
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        if (!e || !e.implemented) continue;
        if (e.channels && e.channels.indexOf('camera') < 0) continue;
        add(e.id);
      }
    }
    return out;
  }

  function buildActionRows(bindKey, mappingId, sceneTab, query, currentToken, hintMap, showAll, options, channelTab) {
    var uniq = collectCandidateTokens(bindKey, options, query);
    var q = String(query || '')
      .trim()
      .toLowerCase();
    var ch = String(channelTab || '');
    var recent = recencyMap(bindKey);
    var filtered = uniq.filter(function (tok) {
      if (tok === 'none') return false;
      if (ch && !tokenBoundOnChannel(tok, hintMap, ch)) return false;
      if (q) {
        var hay = (actionLabel(tok) + ' ' + tok + ' ' + canonicalActionId(tok)).toLowerCase();
        return hay.indexOf(q) >= 0;
      }
      if (ch) return true;
      return tokenScene(tok) === sceneTab;
    });

    var recommended = [];
    if (global.OneToneAgentActions && global.OneToneAgentActions.cameraRecommendedActionIds) {
      recommended = global.OneToneAgentActions.cameraRecommendedActionIds().map(function (id) {
        return global.OneToneAgentActions.agentActionToken(id);
      });
    }

    function score(tok) {
      var s = 0;
      if (tokensMatch(tok, currentToken)) s += 1000;
      if (formatCrossHint(tok, hintMap)) s += 200;
      if (recommended.indexOf(tok) >= 0) s += 100;
      if (recencyOf(recent, tok)) s += 10;
      return s;
    }

    filtered.sort(function (a, b) {
      var recA = recencyOf(recent, a);
      var recB = recencyOf(recent, b);
      var d = score(b) - score(a);
      if (d) return d;
      if (recB !== recA) return recB - recA;
      return actionLabel(a).localeCompare(actionLabel(b), langEn() ? 'en' : 'zh');
    });

    var slice = showAll || q || ch ? filtered : filtered.slice(0, DEFAULT_LIMIT);
    return {
      rows: slice.map(function (tok) {
        return {
          token: tok,
          label: actionLabel(tok),
          scene: tokenScene(tok),
          requiresConfirm: requiresConfirm(tok),
          crossHint: formatCrossHint(tok, hintMap, channelTab),
          recency: recencyOf(recent, tok)
        };
      }),
      total: filtered.length,
      showAll: showAll || !!q || !!ch
    };
  }

  function buildCameraActionPickerModel(opts) {
    opts = opts || {};
    var bindKey = String(opts.bindKey || '');
    var mappingId = String(opts.mappingId || '');
    var sceneTab = opts.sceneTab || defaultSceneForBindKey(bindKey);
    var query = String(opts.query || '');
    var showAll = !!opts.showAll;
    var channelTab = opts.channelTab != null ? String(opts.channelTab) : uiState.channelTab || '';
    var currentToken =
      api() && api().normalizeAction ? api().normalizeAction(opts.currentToken) : 'none';
    var views = Array.isArray(opts.views) ? opts.views : uiState.views || [];
    var options = Array.isArray(opts.options) ? opts.options : uiState.options || [];
    var hintMap = buildCrossHintMap(views, mappingId);
    var list = buildActionRows(
      bindKey,
      mappingId,
      sceneTab,
      query,
      currentToken,
      hintMap,
      showAll,
      options,
      channelTab
    );
    return {
      bindKey: bindKey,
      currentToken: currentToken,
      selectedMappingId: mappingId,
      sceneTab: sceneTab,
      channelTab: channelTab,
      query: query,
      candidates: list.rows,
      totalCandidates: list.total,
      showAll: list.showAll,
      channelCounts: channelCounts(hintMap),
      crossHints: hintMap,
      apps: opts.apps || uiState.apps || buildApps()
    };
  }

  function ensureHost() {
    var el = document.getElementById(HOST_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = HOST_ID;
    el.className = 'camera-action-picker-overlay';
    el.hidden = true;
    el.innerHTML =
      '<div class="camera-action-picker-modal" role="dialog" aria-modal="true" aria-labelledby="capTitle">' +
      '<header class="cap-header">' +
      '<div><h2 id="capTitle" class="cap-title"></h2><p class="cap-sub" id="capSub"></p></div>' +
      '<button type="button" class="cap-close" id="capClose" aria-label="' +
      esc(t('cameraPickerClose', '关闭')) +
      '">×</button>' +
      '</header>' +
      '<div class="cap-toolbar">' +
      '<label class="cap-search"><input type="search" id="capSearch" autocomplete="off" /></label>' +
      '<nav class="cap-scenes" id="capScenes"></nav>' +
      '</div>' +
      '<div class="cap-body">' +
      '<div class="cap-apps" id="capApps" role="listbox"></div>' +
      '<div class="cap-main">' +
      '<nav class="cap-channels" id="capChannels" role="tablist" aria-label="' +
      esc(t('cameraPickerChannelsAria', '按通道筛选')) +
      '"></nav>' +
      '<div class="cap-actions" id="capActions" role="listbox" aria-labelledby="capTitle"></div>' +
      '</div></div></div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      if (e.target === el) close();
    });
    el.querySelector('#capClose').addEventListener('click', close);
    el.querySelector('#capSearch').addEventListener('input', function () {
      uiState.query = el.querySelector('#capSearch').value;
      uiState.showAll = !!String(uiState.query || '').trim();
      uiState.activeIndex = -1;
      render();
    });
    el.addEventListener('keydown', onKeyDown);
    return el;
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    var host = document.getElementById(HOST_ID);
    if (!host || host.hidden) return;
    if (e.key === 'Tab') {
      var modal = host.querySelector('.camera-action-picker-modal');
      var nodes = modal
        ? modal.querySelectorAll('button:not([disabled]), input, [href], select, textarea')
        : [];
      if (!nodes.length) return;
      var first = nodes[0];
      var last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      return;
    }
    var rows = host.querySelectorAll('.cap-action-row, .cap-action-none');
    if (!rows.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      uiState.activeIndex = Math.min(rows.length - 1, uiState.activeIndex + 1);
      renderActiveRow();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      uiState.activeIndex = Math.max(0, uiState.activeIndex - 1);
      renderActiveRow();
    } else if (e.key === 'Enter' && uiState.activeIndex >= 0) {
      e.preventDefault();
      var row = rows[uiState.activeIndex];
      if (row) selectToken(row.getAttribute('data-token') || 'none');
    }
  }

  function renderActiveRow() {
    var host = document.getElementById(HOST_ID);
    if (!host) return;
    var rows = host.querySelectorAll('.cap-action-row, .cap-action-none');
    rows.forEach(function (r, i) {
      r.classList.toggle('is-active', i === uiState.activeIndex);
      if (i === uiState.activeIndex) {
        r.scrollIntoView({ block: 'nearest' });
        syncA11yActive(r.getAttribute('data-token') || 'none');
      }
    });
  }

  function syncA11yActive(token) {
    if (!uiState.rowEl) return;
    var sel = uiState.rowEl.querySelector('select.camera-action-select');
    if (!sel) return;
    sel.value = api().normalizeAction(token);
    var id = 'cap-opt-' + String(token).replace(/[^a-zA-Z0-9_-]/g, '_');
    var list = document.getElementById('capActions');
    if (list) list.setAttribute('aria-activedescendant', id);
  }

  function renderScenes(model) {
    var host = document.getElementById('capScenes');
    if (!host) return;
    host.innerHTML = SCENES.map(function (s) {
      var on = model.sceneTab === s.id;
      return (
        '<button type="button" class="cap-scene' +
        (on ? ' is-active' : '') +
        '" data-scene="' +
        esc(s.id) +
        '">' +
        esc(langEn() ? s.en : s.zh) +
        '</button>'
      );
    }).join('');
    host.querySelectorAll('.cap-scene').forEach(function (btn) {
      btn.addEventListener('click', function () {
        uiState.sceneTab = btn.getAttribute('data-scene') || 'general';
        uiState.channelTab = '';
        uiState.showAll = false;
        uiState.activeIndex = -1;
        render();
      });
    });
  }

  function renderChannels(model) {
    var host = document.getElementById('capChannels');
    if (!host) return;
    var counts = model.channelCounts || {};
    host.innerHTML = CHANNEL_DIRS.map(function (c) {
      var on = String(model.channelTab || '') === c.id;
      var count = c.id ? counts[c.id] || 0 : 0;
      return (
        '<button type="button" class="cap-channel' +
        (on ? ' is-active' : '') +
        '" role="tab" aria-selected="' +
        (on ? 'true' : 'false') +
        '" data-channel="' +
        esc(c.id) +
        '">' +
        channelIconSvg(c.id) +
        '<span>' +
        esc(langEn() ? c.en : c.zh) +
        '</span>' +
        (c.id ? '<span class="cap-channel-count">' + count + '</span>' : '') +
        '</button>'
      );
    }).join('');
    host.querySelectorAll('.cap-channel').forEach(function (btn) {
      btn.addEventListener('click', function () {
        uiState.channelTab = btn.getAttribute('data-channel') || '';
        uiState.showAll = true;
        uiState.activeIndex = -1;
        render();
      });
    });
  }

  function renderApps(model) {
    var host = document.getElementById('capApps');
    if (!host) return;
    host.innerHTML = model.apps
      .map(function (app) {
        var sel = app.mappingId === model.selectedMappingId;
        return (
          '<button type="button" class="cap-app' +
          (sel ? ' is-selected' : '') +
          '" data-mapping-id="' +
          esc(app.mappingId) +
          '" role="option" aria-selected="' +
          (sel ? 'true' : 'false') +
          '">' +
          app.iconHtml +
          '<span class="cap-app-copy"><strong>' +
          esc(app.label) +
          '</strong><small>' +
          esc(app.sub || '') +
          '</small></span></button>'
        );
      })
      .join('');
    host.querySelectorAll('.cap-app').forEach(function (btn) {
      btn.addEventListener('click', function () {
        uiState.mappingId = btn.getAttribute('data-mapping-id') || '';
        uiState.showAll = false;
        uiState.activeIndex = -1;
        loadMappingData(uiState.mappingId).then(render);
      });
    });
  }

  function renderActions(model) {
    var host = document.getElementById('capActions');
    if (!host) return;
    var noneSel = model.currentToken === 'none';
    var html =
      '<button type="button" class="cap-action-none' +
      (noneSel ? ' is-selected' : '') +
      '" data-token="none" id="cap-opt-none" role="option">' +
      esc(t('cameraPresenceActionNoneAlt', '不执行动作')) +
      '</button>';
    if (!model.candidates.length && !String(uiState.query || '').trim()) {
      html +=
        '<p class="cap-empty">' +
        esc(
          model.channelTab
            ? t('cameraPickerEmptyChannel', '此通道暂无已绑定动作')
            : t('cameraPickerEmptyScene', '此分类下暂无动作')
        ) +
        '</p>';
    }
    model.candidates.forEach(function (row) {
      var sel = tokensMatch(row.token, model.currentToken);
      var id = 'cap-opt-' + String(row.token).replace(/[^a-zA-Z0-9_-]/g, '_');
      html +=
        '<button type="button" class="cap-action-row' +
        (sel ? ' is-selected' : '') +
        '" data-token="' +
        esc(row.token) +
        '" id="' +
        esc(id) +
        '" role="option">' +
        '<span><span class="cap-action-label">' +
        esc(row.label) +
        '</span>' +
        '</span>' +
        (row.crossHint ? '<span class="cap-action-hint">' + esc(row.crossHint) + '</span>' : '') +
        (row.requiresConfirm
          ? '<span class="cap-action-badge">' +
            esc(t('cameraPickerNeedsConfirm', '需第二通道确认')) +
            '</span>'
          : '') +
        '<span class="cap-action-add" aria-hidden="true">+</span></button>';
    });
    if (!model.showAll && model.totalCandidates > model.candidates.length) {
      html +=
        '<button type="button" class="cap-show-all" data-show-all="1">' +
        esc(
          t('cameraPickerShowAll', '显示全部 {n} 项').replace('{n}', String(model.totalCandidates))
        ) +
        '</button>';
    }
    host.innerHTML = html;
    host.querySelectorAll('[data-token]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectToken(btn.getAttribute('data-token') || 'none');
      });
    });
    var showAllBtn = host.querySelector('[data-show-all]');
    if (showAllBtn) {
      showAllBtn.addEventListener('click', function () {
        uiState.showAll = true;
        render();
      });
    }
  }

  function render() {
    var host = ensureHost();
    var model = buildCameraActionPickerModel({
      bindKey: uiState.bindKey,
      mappingId: uiState.mappingId,
      sceneTab: uiState.sceneTab,
      query: uiState.query,
      channelTab: uiState.channelTab,
      showAll: uiState.showAll,
      currentToken: openOpts && openOpts.currentToken,
      views: uiState.views,
      options: uiState.options,
      apps: uiState.apps
    });
    host.querySelector('#capTitle').textContent =
      t('cameraPickerTitle', '选 Camera 动作') + ' · ' + bindKeyTitle(model.bindKey);
    host.querySelector('#capSub').textContent = t(
      'cameraPickerSub',
      '按应用场景与分类筛选；同一动作可在按键/语音/Soft Pad 复用'
    );
    host.querySelector('#capSearch').placeholder = t('cameraPickerSearchPh', '搜索动作...');
    renderScenes(model);
    renderChannels(model);
    renderApps(model);
    renderActions(model);
    if (uiState.activeIndex >= 0) renderActiveRow();
  }

  function loadMappingData(mappingId) {
    var store = global.OneToneSemanticActionStore;
    uiState.views = [];
    uiState.options = [];
    if (!store) return Promise.resolve();
    var viewsP = store.bindingViews ? store.bindingViews(mappingId) : Promise.resolve([]);
    var optsP = Promise.resolve()
      .then(function () {
        return store.ensureCatalog ? store.ensureCatalog() : null;
      })
      .then(function () {
        return store.fetchOptions ? store.fetchOptions(mappingId, 'camera', false) : [];
      });
    return Promise.all([viewsP, optsP])
      .then(function (pair) {
        uiState.views = Array.isArray(pair[0]) ? pair[0] : [];
        uiState.options = Array.isArray(pair[1]) ? pair[1] : [];
        return uiState.options;
      })
      .catch(function () {
        uiState.views = [];
        uiState.options = [];
        return [];
      });
  }

  function loadViewsForMapping(mappingId) {
    return loadMappingData(mappingId);
  }

  function persistSelection(mappingId, isBaseline, bindKey, token) {
    if (isBaseline) {
      if (api() && api().persist) {
        var patch = {};
        patch[bindKey] = token;
        api().persist(patch);
      }
      return Promise.resolve(token);
    }
    if (api() && api().persistBindActionMappingScoped) {
      return api()
        .persistBindActionMappingScoped(mappingId, bindKey, token)
        .then(function () {
          if (api().syncUiFromPrefs) api().syncUiFromPrefs();
          return token;
        });
    }
    return Promise.reject(new Error('no_persist'));
  }

  function selectToken(token) {
    token = api() && api().normalizeAction ? api().normalizeAction(token) : String(token || 'none');
    var app = null;
    for (var i = 0; i < uiState.apps.length; i++) {
      if (uiState.apps[i].mappingId === uiState.mappingId) {
        app = uiState.apps[i];
        break;
      }
    }
    persistSelection(uiState.mappingId, !!(app && app.isBaseline), uiState.bindKey, token)
      .then(function () {
        bumpRecency(uiState.bindKey, token);
        close();
      })
      .catch(function () {
        if (api() && api().persist) {
          var patch = {};
          patch[uiState.bindKey] = token;
          api().persist(patch);
        }
        close();
      });
  }

  function open(opts) {
    opts = opts || {};
    if (!api()) return;
    openOpts = opts;
    uiState.bindKey = String(opts.bindKey || 'shakeHead');
    uiState.sceneTab = opts.sceneTab || defaultSceneForBindKey(uiState.bindKey);
    uiState.query = '';
    uiState.channelTab = '';
    uiState.showAll = false;
    uiState.activeIndex = -1;
    uiState.apps = buildApps();
    uiState.rowEl =
      opts.rowEl ||
      (opts.anchorEl && opts.anchorEl.closest ? opts.anchorEl.closest('[data-camera-bind-key]') : null);
    uiState.returnFocus = opts.anchorEl || null;

    var mid = String(opts.mappingId || stateRoot().selectedMappingId || '').trim();
    if (!mid && uiState.apps.length) mid = uiState.apps[0].mappingId;
    uiState.mappingId = mid;

    var host = ensureHost();
    host.hidden = false;
    document.body.classList.add('camera-action-picker-open');

    loadMappingData(uiState.mappingId).then(function () {
      render();
      var search = host.querySelector('#capSearch');
      if (search) {
        search.value = '';
        try {
          search.focus();
        } catch (_) {}
      }
    });
  }

  function close() {
    var host = document.getElementById(HOST_ID);
    if (host) host.hidden = true;
    document.body.classList.remove('camera-action-picker-open');
    if (uiState.rowEl) {
      var trig = uiState.rowEl.querySelector('.camera-action-trigger');
      if (trig) trig.setAttribute('aria-expanded', 'false');
    }
    openOpts = null;
    if (uiState.returnFocus && uiState.returnFocus.focus) {
      try {
        uiState.returnFocus.focus();
      } catch (_) {}
    }
  }

  global.OneToneCameraActionPicker = {
    open: open,
    close: close,
    buildCameraActionPickerModel: buildCameraActionPickerModel,
    defaultSceneForBindKey: defaultSceneForBindKey,
    bindKeyTitle: bindKeyTitle
  };
})((typeof window !== 'undefined') ? window : globalThis);
