(function (global) {
  'use strict';

  var selectedScopeId = 'codex';

  function getSelectedMappingId() {
    var st = global.OneToneState && global.OneToneState.state;
    if (!st || st.selectedMappingId == null || st.selectedMappingId === '') return null;
    return String(st.selectedMappingId);
  }

  function setSelectedMappingId(id) {
    var st = global.OneToneState && global.OneToneState.state;
    if (!st) return;
    st.selectedMappingId = (id == null || id === '') ? null : String(id);
  }

  var softPadView = 'hub'; // hub | layout | presentation | runtime | agent
  /** Last opened Soft Pad detail tile — restored on later opens; first prepare forces runtime. */
  var lastSoftPadView = 'runtime';
  var VALID_SOFT_PAD_VIEWS = { layout: 1, presentation: 1, runtime: 1, agent: 1 };
  var chromeBound = false;
  var selectToken = 0;
  var selectTimer = 0;
  var paintBusy = false;
  var pendingPaintEntry = null;
  var pendingPaintOpts = null;
  var paintedMappingId = null;
  var agentLoadToken = 0;
  var subpageToken = 0;
  var paintReentry = 0;
  /** Preview-only epoch — do not merge into selectToken (scope/scheme) on first cut. */
  var previewEpoch = 0;
  var previewTimer = 0;

  function feLog(line) {
    try {
      var invoke = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
      if (invoke) invoke('cmd_app_log', { line: String(line || '') }).catch(function () {});
    } catch (_) {}
  }

  /** Agent Soft Pad app targets (extensible for future apps). */
  var AGENT_SOFT_PAD_APP_IDS = {
    'codex-chat': 'codex',
    'claude-code': 'claude',
    'cursor-chat': 'cursor',
    'minimax-chat': 'minimax'
  };

  /** Always-visible Soft Pad apps (Codex + Claude only for now). */
  var BUILTIN_SOFT_PAD_APPS = [
    { kind: 'codex', appId: 'codex-chat' },
    { kind: 'claude', appId: 'claude-code' }
  ];

  function t(key, fallback) {
    var i18n = global.OneToneI18n;
    if (i18n && i18n.t) {
      var v = i18n.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function mappings() {
    var st = global.OneToneState && global.OneToneState.state;
    return (st && st.config && st.config.mappings) || [];
  }

  function codexAppId() {
    var A = global.OneToneAgentActions;
    return (A && A.APP_TARGET_ID) || 'codex-chat';
  }

  function kindForAppId(appId) {
    appId = String(appId || '');
    if (appId === codexAppId() || appId === 'codex-chat') return 'codex';
    if (AGENT_SOFT_PAD_APP_IDS[appId]) return AGENT_SOFT_PAD_APP_IDS[appId];
    return '';
  }

  function appIdForKind(kind) {
    kind = String(kind || '');
    for (var i = 0; i < BUILTIN_SOFT_PAD_APPS.length; i++) {
      if (BUILTIN_SOFT_PAD_APPS[i].kind === kind) return BUILTIN_SOFT_PAD_APPS[i].appId;
    }
    return '';
  }

  function iconForAppId(appId) {
    appId = String(appId || '');
    if (!appId) return '';
    var P = global.OneToneAppTargetPresets;
    var preset = P && P.presetById ? P.presetById(appId) : null;
    return preset && preset.icon ? String(preset.icon) : '';
  }

  function iconForKind(kind) {
    return iconForAppId(appIdForKind(kind));
  }

  function iconHtml(kind, cls) {
    var src = iconForKind(kind);
    if (!src) return '';
    return '<img class="' + esc(cls || 'soft-pad-app-icon') + '" src="' + esc(src) +
      '" alt="" decoding="async" width="18" height="18" />';
  }

  /**
   * Soft Pad scheme eligibility (shared).
   * - Soft Pad enabled, or
   * - Known agent app target (Codex / Claude / …)
   */
  function isSoftPadSchemeEligible(m) {
    if (!m || !m.id) return false;
    var pad = m.codexMicroPad;
    if (pad && pad.enabled === true) return true;
    return !!kindForAppId(m.appTargetId);
  }

  /** Builtin Soft Pad kinds shown in hub UI (Codex + Claude only). */
  function isHubSoftPadKind(kind) {
    return kind === 'codex' || kind === 'claude';
  }

  function appTitleFor(kind) {
    if (kind === 'claude') return t('softPadHubKindClaude', 'Claude');
    if (kind === 'codex') return t('softPadHubKindCodex', 'Codex');
    if (kind === 'cursor') return t('softPadHubKindCursor', 'Cursor');
    if (kind === 'minimax') return t('softPadHubKindMinimax', 'MiniMax');
    return t('softPadHubKindSoft', 'Soft Pad');
  }

  /** Default app tab when opening Soft Pad (no「全局」). */
  function pickDefaultScopeId(entries) {
    entries = entries || listSoftPadSchemes();
    var i;
    for (i = 0; i < entries.length; i++) {
      if (entries[i].kind === 'codex' && entries[i].padEnabled) return 'codex';
    }
    for (i = 0; i < entries.length; i++) {
      if (entries[i].padEnabled) return entries[i].kind;
    }
    if (entries[0] && entries[0].kind) return entries[0].kind;
    return 'codex';
  }

  function pickDefaultEntry(entries) {
    entries = entries || listSoftPadSchemes();
    var scopeId = pickDefaultScopeId(entries);
    var i;
    for (i = 0; i < entries.length; i++) {
      if (entries[i].kind === scopeId) return entries[i];
    }
    return pickGlobalEntry(entries) || entries[0] || null;
  }

  function schemeRank(entry) {
    var pad = entry.mapping && entry.mapping.codexMicroPad;
    var score = 0;
    if (pad && pad.enabled) score += 100;
    if (pad && pad.overlayEnabled) score += 10;
    if (entry.mapping && entry.mapping.enabled) score += 1;
    score -= Number(entry.mapping && entry.mapping.order) || 0;
    return score;
  }

  /**
   * One Soft Pad scheme per agent app (Codex / Claude / …).
   */
  function listSoftPadSchemes() {
    var byKind = {};
    mappings().forEach(function (m) {
      if (!isSoftPadSchemeEligible(m)) return;
      var kind = kindForAppId(m.appTargetId) || 'soft';
      if (!isHubSoftPadKind(kind)) return;
      var pad = m.codexMicroPad;
      var enabled = !!(pad && pad.enabled);
      var entry = {
        mapping: m,
        kind: kind,
        appId: String(m.appTargetId || ''),
        padEnabled: enabled,
        canEnable: !enabled,
        canPrepare: false,
        title: appTitleFor(kind),
        presentation: (pad && pad.presentation === 'mini') ? 'mini' : 'full'
      };
      var prev = byKind[kind];
      if (!prev || schemeRank(entry) > schemeRank(prev)) {
        byKind[kind] = entry;
      }
    });
    var out = Object.keys(byKind).map(function (k) { return byKind[k]; });
    out.sort(function (a, b) {
      var rank = { codex: 0, claude: 1, soft: 9 };
      var ra = rank[a.kind] != null ? rank[a.kind] : 8;
      var rb = rank[b.kind] != null ? rank[b.kind] : 8;
      if (ra !== rb) return ra - rb;
      return String(a.title).localeCompare(String(b.title));
    });
    return out;
  }

  function listHubEntries() {
    return listSoftPadSchemes();
  }

  /** Default Soft Pad layer for「全局」— prefer enabled, else first. */
  function pickGlobalEntry(entries) {
    entries = entries || listSoftPadSchemes();
    var i;
    for (i = 0; i < entries.length; i++) {
      if (entries[i].padEnabled) return entries[i];
    }
    return entries[0] || null;
  }

  function placeholderEntry(kind, appId) {
    return {
      mapping: null,
      kind: kind,
      appId: appId,
      padEnabled: false,
      canEnable: false,
      canPrepare: true,
      title: appTitleFor(kind),
      presentation: 'full'
    };
  }

  /**
   * Create/reuse app scenario + Soft Pad for a builtin app (Claude / Cursor / …).
   * Only creates when missing — never re-enable / IPC on every tab click (假死).
   */
  function ensureAppSoftPad(appId, kind, opts) {
    opts = opts || {};
    appId = String(appId || appIdForKind(kind) || '').trim();
    kind = kind || kindForAppId(appId);
    if (!appId) return null;

    var H = global.OneToneHabitHub;
    var Pad = global.OneToneCodexMicroPadUi;
    if (!H || !H.findAppScenarioByAppId) return null;

    var existing = H.findAppScenarioByAppId(appId);
    if (existing) {
      if (Pad && Pad.ensurePad) Pad.ensurePad(existing, { persist: false });
      return existing;
    }

    if (kind === 'codex' || appId === 'codex-chat') {
      if (Pad && Pad.applyNumpadControllerStandard) {
        var cx = Pad.applyNumpadControllerStandard({ mode: 'openExisting', openPanel: false });
        if (cx) return cx;
      }
    }

    if (!H.createAppScenario) return null;
    // deferPersist: avoid habits-hub toast/remount while Soft Pad page is open.
    var m = H.createAppScenario(appId, { deferPersist: true });
    if (!m) return null;
    var persistNew = global.OneToneConfigPersist;
    if (persistNew && persistNew.saveAsync) persistNew.saveAsync();
    else if (persistNew && persistNew.save) persistNew.save();

    if (Pad && Pad.ensurePad) Pad.ensurePad(m, { persist: false });
    if (!m.codexMicroPad) return m;
    if (opts.enable !== false) {
      m.codexMicroPad.enabled = true;
      m.codexMicroPad.overlayEnabled = true;
      var invoke = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
      if (invoke) {
        invoke('cmd_codex_micro_pad_set_flags', {
          mappingId: String(m.id),
          enabled: true,
          requireNumLockOff: !!m.codexMicroPad.requireNumLockOff,
          overlayEnabled: true,
          navKeysEnabled: m.codexMicroPad.navKeysEnabled !== false
        }).catch(function () {
          var p = global.OneToneConfigPersist;
          if (p && p.saveAsync) p.saveAsync();
          else if (p && p.save) p.save();
        });
      } else if (persistNew && persistNew.saveAsync) {
        persistNew.saveAsync();
      }
    }
    return m;
  }

  /**
   * Scopes for top switcher: builtin apps only (Codex / Claude; no「全局」).
   */
  function listAppScopes() {
    var entries = listSoftPadSchemes();
    var byKind = {};
    entries.forEach(function (e) { byKind[e.kind] = e; });
    return BUILTIN_SOFT_PAD_APPS.map(function (b) {
      var entry = byKind[b.kind] || placeholderEntry(b.kind, b.appId);
      return {
        id: b.kind,
        kind: b.kind,
        appId: b.appId,
        title: entry.title,
        mapping: entry.mapping,
        entry: entry,
        padEnabled: !!entry.padEnabled,
        canPrepare: !!entry.canPrepare
      };
    });
  }

  /** Aside list: builtin apps (existing or「可准备」). */
  function listAsideEntries() {
    var entries = listSoftPadSchemes();
    var byKind = {};
    entries.forEach(function (e) { byKind[e.kind] = e; });
    return BUILTIN_SOFT_PAD_APPS.map(function (b) {
      return byKind[b.kind] || placeholderEntry(b.kind, b.appId);
    });
  }

  function findScope(scopeId) {
    var id = String(scopeId || '');
    var scopes = listAppScopes();
    var i;
    for (i = 0; i < scopes.length; i++) {
      if (scopes[i].id === id) return scopes[i];
    }
    return scopes[0] || null;
  }

  function kindLabel(kind) {
    return appTitleFor(kind);
  }

  function statusLabel(entry) {
    if (entry.padEnabled) return t('softPadHubStatusOn', '已启用');
    if (entry.canPrepare) return t('softPadHubStatusCanPrepare', '可准备');
    if (entry.canEnable) return t('softPadHubStatusCanEnable', '可开启');
    return t('softPadHubStatusOff', '未启用');
  }

  function presentationLabel(presentation) {
    return presentation === 'mini'
      ? t('softPadPresMini', '迷你条')
      : t('softPadPresFull', '大键盘');
  }

  function profileLabel(profile) {
    if (profile === 'beginner') return t('codexMicroPadProfileBeginner', '入门');
    if (profile === 'advanced') return t('codexMicroPadProfileAdvanced', '高级');
    if (profile === 'custom') return t('codexMicroPadProfileCustom', '自定义');
    return t('codexMicroPadProfileStandard', '标准');
  }

  function statusTag(entry) {
    if (entry.padEnabled) return { cls: 'is-on', key: 'softPadHubStatusOn', text: t('softPadHubStatusOn', '已启用') };
    if (entry.canPrepare) return { cls: 'is-draft', key: 'softPadHubStatusCanPrepare', text: t('softPadHubStatusCanPrepare', '可准备') };
    if (entry.canEnable) return { cls: 'is-draft', key: 'softPadHubStatusCanEnable', text: t('softPadHubStatusCanEnable', '可开启') };
    return { cls: 'is-off', key: 'softPadHubStatusOff', text: t('softPadHubStatusOff', '未启用') };
  }

  function els() {
    return {
      list: document.getElementById('softPadSchemeList'),
      count: document.getElementById('softPadSchemeCount'),
      preview: document.getElementById('softPadPreviewHost'),
      stage: document.getElementById('softPadHubStage'),
      tiles: document.getElementById('softPadFuncTiles'),
      subHost: document.getElementById('softPadSubpageHost'),
      detailIdle: document.getElementById('softPadDetailIdle'),
      detailPanel: document.getElementById('softPadDetailPanel'),
      subBody: document.getElementById('softPadSubpageBody'),
      subTitle: document.getElementById('softPadSubpageTitle'),
      subBack: document.getElementById('btnSoftPadSubBack'),
      hint: document.getElementById('softPadScopeHint'),
      empty: document.getElementById('softPadEmpty'),
      name: document.getElementById('softPadSummaryName'),
      status: document.getElementById('softPadSummaryStatus'),
      presentation: document.getElementById('softPadSummaryPresentation'),
      kind: document.getElementById('softPadSummaryKind'),
      enable: document.getElementById('softPadSummaryEnable'),
      ensureBtn: document.getElementById('btnSoftPadEnsureCodex'),
      titleLbl: document.getElementById('softPadSchemeTitleLbl'),
      switcher: document.getElementById('softPadAppSwitcher'),
      aside: document.getElementById('softPadSchemeAside')
    };
  }

  function findEntry(mappingId) {
    var entries = listSoftPadSchemes();
    var id = String(mappingId || '');
    for (var i = 0; i < entries.length; i++) {
      if (String(entries[i].mapping.id) === id) return entries[i];
    }
    return null;
  }

  function hostsNeedPaint(entry) {
    var e = els();
    if (!e.preview || e.preview.childElementCount === 0) return true;
    if (!paintedMappingId) return true;
    if (entry && entry.mapping && String(paintedMappingId) !== String(entry.mapping.id)) return true;
    return false;
  }

  function displayTitle(entry) {
    if (!entry) return '—';
    return entry.title;
  }

  function displayKind(entry) {
    return entry ? kindLabel(entry.kind) : '—';
  }

  function hasMapping(entry) {
    return !!(entry && entry.mapping && entry.mapping.id);
  }

  function updateStatusBar(entry) {
    var e = els();
    if (!entry) {
      if (e.name) e.name.textContent = '—';
      if (e.status) e.status.textContent = '—';
      if (e.presentation) e.presentation.textContent = '—';
      if (e.kind) e.kind.textContent = '—';
      if (e.enable) {
        e.enable.classList.remove('is-on');
        e.enable.setAttribute('aria-checked', 'false');
        e.enable.disabled = true;
      }
      return;
    }
    if (e.name) e.name.textContent = displayTitle(entry);
    if (e.status) e.status.textContent = statusLabel(entry);
    if (e.presentation) e.presentation.textContent = presentationLabel(entry.presentation);
    if (e.kind) e.kind.textContent = displayKind(entry);
    if (e.enable) {
      e.enable.disabled = !hasMapping(entry);
      e.enable.classList.toggle('is-on', !!entry.padEnabled);
      e.enable.setAttribute('aria-checked', entry.padEnabled ? 'true' : 'false');
    }
  }

  function updateScopeHint() {
    var e = els();
    if (!e.hint) return;
    e.hint.textContent = t('softPadHintApp', '{app}：该应用前台时的键位和状态灯')
      .replace('{app}', appTitleFor(selectedScopeId || 'codex'));
  }

  function clearSubpage() {
    ++subpageToken;
    ++agentLoadToken;
    try {
      var PadClose = global.OneToneCodexMicroPadUi;
      if (PadClose && PadClose.closeEditKeycap) PadClose.closeEditKeycap({ reopenInline: false });
    } catch (_) {}
    var e = els();
    if (e.subBody) {
      e.subBody.replaceChildren();
      e.subBody.classList.remove('is-editing-key');
      e.subBody.removeAttribute('data-soft-pad-mapping');
      e.subBody.removeAttribute('data-soft-pad-panel');
      e.subBody.removeAttribute('data-agent-load-token');
    }
    if (e.detailPanel) e.detailPanel.hidden = true;
    if (e.detailIdle) e.detailIdle.hidden = false;
    if (e.subHost) {
      e.subHost.classList.remove('is-open');
      e.subHost.removeAttribute('hidden');
    }
    if (e.subTitle) e.subTitle.textContent = '';
  }

  function setDetailOpen(open) {
    var e = els();
    open = !!open;
    if (e.detailPanel) e.detailPanel.hidden = !open;
    if (e.detailIdle) e.detailIdle.hidden = open;
    if (e.subHost) {
      e.subHost.classList.toggle('is-open', open);
      e.subHost.removeAttribute('hidden');
    }
    if (e.stage) e.stage.classList.toggle('is-detail-open', open);
  }

  function patchActiveTiles() {
    var e = els();
    if (!e.tiles) return;
    e.tiles.querySelectorAll('[data-tile]').forEach(function (btn) {
      var on = softPadView !== 'hub' && btn.getAttribute('data-tile') === softPadView;
      btn.classList.toggle('is-active', on);
      if (on) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    });
  }

  function clearMain() {
    var e = els();
    if (e.preview) e.preview.replaceChildren();
    if (e.tiles) e.tiles.innerHTML = '';
    clearSubpage();
    softPadView = 'hub';
    paintedMappingId = null;
  }

  function onPanelLeave() {
    ++selectToken;
    ++agentLoadToken;
    clearMain();
  }

  function emptyCreateCtaHtml() {
    return '<p class="soft-pad-empty__title">' + esc(t('softPadEmptyTitle', '还没有可配置的应用场景')) + '</p>' +
      '<p class="soft-pad-empty__desc">' +
      esc(t('softPadBoundaryHint', '虚拟键盘只绑定到应用场景。先创建 Codex 或 Claude 应用场景，再配置它的虚拟键盘。')) +
      '</p>' +
      '<div class="soft-pad-empty__actions">' +
      '<button type="button" class="codex-micro-pad__btn codex-micro-pad__btn--primary" data-soft-pad-create-kind="codex">' +
      esc(t('softPadEmptyCreateCodex', '创建 Codex 应用场景')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn" data-soft-pad-create-kind="claude">' +
      esc(t('softPadEmptyCreateClaude', '创建 Claude 应用场景')) + '</button>' +
      '</div>';
  }

  function bindEmptyCreateCtas(host) {
    if (!host) return;
    host.querySelectorAll('[data-soft-pad-create-kind]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var kind = btn.getAttribute('data-soft-pad-create-kind') || 'codex';
        prepareAppFromUi(appIdForKind(kind) || (kind === 'claude' ? 'claude-code' : 'codex-chat'), kind);
      });
    });
  }

  function renderEmptyMain() {
    var e = els();
    clearMain();
    updateStatusBar(null);
    updateScopeHint();
    renderAppSwitcher();
    if (e.empty) {
      e.empty.hidden = false;
      e.empty.innerHTML = emptyCreateCtaHtml();
      bindEmptyCreateCtas(e.empty);
    }
  }

  function hideEmpty() {
    var e = els();
    if (e.empty) {
      e.empty.hidden = true;
      e.empty.innerHTML = '';
    }
  }

  /** Scope without mapping: CTA only — never auto-create. */
  function showPrepareMain(scope) {
    ++selectToken;
    ++agentLoadToken;
    softPadView = 'hub';
    setSelectedMappingId(null);
    pendingPaintEntry = null;
    pendingPaintOpts = null;
    var e = els();
    if (e.preview) e.preview.replaceChildren();
    paintedMappingId = null;
    clearSubpage();

    var placeholder = (scope && scope.entry) ||
      placeholderEntry(scope && scope.kind, scope && scope.appId);
    updateStatusBar(placeholder);
    updateScopeHint();
    if (!patchAppSwitcher()) renderAppSwitcher();
    markActiveRow(null);
    syncHubChrome(placeholder);
    renderFuncTiles(placeholder);

    var prepareAppId = (scope && (scope.appId || appIdForKind(scope.kind))) || 'codex-chat';
    var prepareKind = (scope && scope.kind) || 'codex';
    var title = t('softPadHubPrepareApp', '准备 {app} Soft Pad')
      .replace('{app}', (scope && scope.title) || appTitleFor(prepareKind));

    if (e.empty) {
      e.empty.hidden = false;
      e.empty.innerHTML =
        '<p class="soft-pad-empty__title">' + esc(title) + '</p>' +
        '<p class="soft-pad-empty__desc">' +
        esc(t('softPadHubPrepareHint', '点击准备后才会创建该应用的虚拟键盘配置。')) +
        '</p>' +
        '<button type="button" class="codex-micro-pad__btn codex-micro-pad__btn--primary" data-soft-pad-prepare-cta="' +
        esc(prepareAppId) + '" data-scheme-kind="' + esc(prepareKind) + '">' +
        esc(t('softPadHubPrepareShort', '准备')) + '</button>';
      var btn = e.empty.querySelector('[data-soft-pad-prepare-cta]');
      if (btn) {
        btn.addEventListener('click', function () {
          prepareAppFromUi(
            btn.getAttribute('data-soft-pad-prepare-cta'),
            btn.getAttribute('data-scheme-kind')
          );
        });
      }
    }
  }

  function tileStatus(entry, tile) {
    var pad = entry && entry.mapping && entry.mapping.codexMicroPad;
    if (!hasMapping(entry)) {
      return t('softPadTileNeedPrepare', '先点右侧准备');
    }
    if (tile === 'layout') {
      return t('softPadTileLayoutStatus', '已设 {n}/15')
        .replace('{n}', String(boundKeyCount(entry)));
    }
    if (tile === 'presentation') {
      var skin = pad && pad.skin ? String(pad.skin) : 'graphite';
      return t('softPadTilePresStatus', '皮肤 · {s}').replace('{s}', skin);
    }
    if (tile === 'runtime') {
      var Pad = global.OneToneCodexMicroPadUi;
      var mode = Pad && Pad.resolveSoftPadShowMode
        ? Pad.resolveSoftPadShowMode(pad)
        : (pad && pad.overlayEnabled ? 'follow' : 'hidden');
      if (Pad && Pad.softPadShowModeLabel) return Pad.softPadShowModeLabel(mode);
      return softPadShowModeLabelFallback(mode);
    }
    return t('softPadTileMoreStatus', '进阶');
  }

  function softPadShowModeLabelFallback(mode) {
    if (mode === 'front') return t('softPadShowModeFront', '保持在最前');
    if (mode === 'mini') return t('softPadShowModeMini', '显示为迷你条');
    if (mode === 'hidden') return t('softPadShowModeHidden', '不显示浮窗');
    return t('softPadShowModeFollow', '跟随应用显示');
  }

  function defaultDetailView(opts) {
    opts = opts || {};
    if (opts.firstPrepare) return 'runtime';
    if (opts.forceView && VALID_SOFT_PAD_VIEWS[opts.forceView]) return opts.forceView;
    if (VALID_SOFT_PAD_VIEWS[lastSoftPadView]) return lastSoftPadView;
    return 'runtime';
  }

  function rememberSoftPadView(view) {
    if (VALID_SOFT_PAD_VIEWS[view]) lastSoftPadView = view;
  }

  function renderFuncTiles(entry) {
    var e = els();
    if (!e.tiles) return;
    var inPadViews = softPadView === 'hub' || softPadView === 'layout' ||
      softPadView === 'presentation' || softPadView === 'runtime' || softPadView === 'agent';
    if (!entry || !inPadViews) {
      e.tiles.hidden = true;
      return;
    }
    e.tiles.hidden = false;
    e.tiles.setAttribute('aria-label', t('softPadFuncTilesAria', '你想改什么？'));
    var ready = hasMapping(entry);
    var tiles = [
      {
        id: 'runtime',
        index: '1',
        title: t('softPadTileRuntime', '何时显示'),
        sub: t('softPadTileRuntimeSub', '浮窗怎么出现；要不要占数字键')
      },
      {
        id: 'layout',
        index: '2',
        title: t('softPadTileLayout', '改按键'),
        sub: t('softPadTileLayoutSub', '点键盘上的键，改它做什么')
      },
      {
        id: 'presentation',
        index: '3',
        title: t('softPadTilePres', '外观'),
        sub: t('softPadTilePresSub', '换皮肤；大键盘/迷你条在「何时显示」')
      },
      {
        id: 'agent',
        index: '4',
        title: t('softPadTileMore', '更多'),
        sub: t('softPadTileMoreSub', '状态灯等进阶选项')
      }
    ];
    e.tiles.innerHTML =
      '<div class="soft-pad-func-tiles__head">' +
      '<h4 class="soft-pad-func-tiles__title">' + esc(t('softPadFuncTilesTitle', '你想改什么？')) + '</h4>' +
      '<p class="soft-pad-func-tiles__sub">' + esc(t('softPadFuncTilesSub', '动作入口更像任务清单，适合第一次配置')) + '</p>' +
      '</div>' +
      tiles.map(function (tile) {
        var active = softPadView === tile.id;
        return (
          '<button type="button" class="soft-pad-func-tile' +
          (ready ? '' : ' is-disabled') +
          (active ? ' is-active' : '') +
          '" data-tile="' + esc(tile.id) + '"' +
          (ready ? '' : ' disabled aria-disabled="true"') +
          (active ? ' aria-current="true"' : '') + '>' +
          '<span class="soft-pad-func-tile__index" aria-hidden="true">' + esc(tile.index) + '</span>' +
          '<span class="soft-pad-func-tile__copy">' +
          '<span class="soft-pad-func-tile__title">' + esc(tile.title) + '</span>' +
          '<span class="soft-pad-func-tile__sub">' + esc(tile.sub) + '</span>' +
          '</span>' +
          '<span class="soft-pad-func-tile__status">' + esc(tileStatus(entry, tile.id)) + '</span>' +
          '</button>'
        );
      }).join('');
  }

  function syncHubChrome(entry) {
    var e = els();
    var onHub = softPadView === 'hub';
    var detailOpen = !onHub && hasMapping(entry);
    // 左侧导航（键盘+卡片）结构固定；任意子页都不收起预览，避免布局崩坏。
    if (e.tiles) e.tiles.hidden = !entry;
    setDetailOpen(detailOpen);
    if (e.preview) {
      if (!hasMapping(entry)) {
        e.preview.hidden = true;
      } else {
        e.preview.hidden = false;
        e.preview.classList.remove('is-collapsed');
      }
    }
    if (e.stage) {
      e.stage.classList.remove('is-preview-collapsed');
      e.stage.classList.toggle('is-detail-open', detailOpen);
    }
    // 何时显示是默认落地页：不显示「返回」，避免回到空白提示态。
    if (e.subBack) {
      e.subBack.hidden = softPadView === 'runtime';
      e.subBack.textContent = t('softPadSubBack', '← 返回');
    }
    if (e.subTitle && detailOpen) e.subTitle.textContent = subpageTitle(softPadView);
    if (e.detailIdle) {
      var idleTitle = e.detailIdle.querySelector('.soft-pad-detail-idle__title');
      var idleSub = e.detailIdle.querySelector('.soft-pad-detail-idle__sub');
      if (idleTitle) {
        idleTitle.textContent = t('softPadDetailIdleTitle', '点左侧一项开始调整');
      }
      if (idleSub) {
        idleSub.textContent = t('softPadDetailIdleSub', '右侧打开详情；左侧键盘与列表保持不动');
      }
    }
    if (entry) {
      if (!e.tiles.querySelector('[data-tile]')) renderFuncTiles(entry);
      else {
        e.tiles.querySelectorAll('[data-tile]').forEach(function (btn) {
          var id = btn.getAttribute('data-tile');
          var statusEl = btn.querySelector('.soft-pad-func-tile__status');
          if (statusEl) statusEl.textContent = tileStatus(entry, id);
        });
        patchActiveTiles();
      }
    }
  }

  function subpageTitle(view) {
    if (view === 'layout') return t('softPadTileLayout', '改按键');
    if (view === 'presentation') return t('softPadTilePres', '外观');
    if (view === 'runtime') return t('softPadTileRuntime', '何时显示');
    if (view === 'agent') return t('softPadTileMore', '更多');
    return '';
  }

  function syncEntryFromMapping(m) {
    if (m && m.id) setSelectedMappingId(String(m.id));
    var entry = findEntry(getSelectedMappingId());
    if (entry && m && m.codexMicroPad) {
      entry.mapping = m;
      entry.padEnabled = !!m.codexMicroPad.enabled;
      entry.presentation = m.codexMicroPad.presentation === 'mini' ? 'mini' : 'full';
      entry.title = appTitleFor(entry.kind);
    }
    return entry;
  }

  function findSchemeRow(mappingId) {
    var e = els();
    if (!e.list) return null;
    return e.list.querySelector('.keys-hub-scheme-row[data-scheme-id="' + String(mappingId || '') + '"]');
  }

  function patchSchemeRowEnable(entry) {
    if (!hasMapping(entry)) return;
    var row = findSchemeRow(entry.mapping.id);
    if (!row) {
      renderSchemeList();
      return;
    }
    row.classList.toggle('is-disabled-scheme', !entry.padEnabled);
    var tag = statusTag(entry);
    var tagEl = row.querySelector('.keys-hub-scheme-tag');
    if (tagEl) {
      tagEl.className = 'keys-hub-scheme-tag ' + tag.cls;
      tagEl.textContent = tag.text;
    }
    var toggle = row.querySelector('[data-scheme-enable]');
    if (toggle) {
      toggle.classList.toggle('is-on', !!entry.padEnabled);
      toggle.setAttribute('aria-checked', entry.padEnabled ? 'true' : 'false');
      toggle.setAttribute('aria-label', statusLabel(entry));
    }
    var pair = row.querySelector('.keys-hub-scheme-pair');
    if (pair) {
      pair.textContent = t('softPadSchemeSoftPad', '虚拟键盘') + ' · ' +
        presentationLabel(entry.presentation);
    }
  }

  function patchSchemeRowPresentation(entry) {
    if (!hasMapping(entry)) return;
    var row = findSchemeRow(entry.mapping.id);
    if (!row) {
      renderSchemeList();
      return;
    }
    var pair = row.querySelector('.keys-hub-scheme-pair');
    if (pair) {
      pair.textContent = t('softPadSchemeSoftPad', '虚拟键盘') + ' · ' +
        presentationLabel(entry.presentation);
    }
    var steps = row.querySelector('.keys-hub-scheme-steps');
    if (steps) steps.textContent = boundKeyCount(entry) + '/15';
  }

  function syncRuntimeCheckboxes(entry) {
    if (softPadView !== 'runtime' || !hasMapping(entry)) return;
    var e = els();
    if (!e.subBody) return;
    var pad = entry.mapping.codexMicroPad;
    if (!pad) return;
    var Pad = global.OneToneCodexMicroPadUi;
    var mode = Pad && Pad.resolveSoftPadShowMode
      ? Pad.resolveSoftPadShowMode(pad)
      : (pad.overlayEnabled ? 'follow' : 'hidden');
    var showModeEl = e.subBody.querySelector('[data-act="showMode"]');
    if (showModeEl) showModeEl.value = mode;
    if (Pad && Pad.syncSoftPadShowModeChrome) {
      Pad.syncSoftPadShowModeChrome(e.subBody, mode, pad);
    } else {
      var hint = e.subBody.querySelector('[data-show-mode-hint]');
      if (hint) {
        hint.textContent = mode === 'front'
          ? t('softPadShowModeFrontHint', '浮窗保持可见；按键动作仍发给对应应用，不会接管其它窗口。')
          : mode === 'mini'
            ? t('softPadShowModeMiniHint', '精简为状态灯条，适合少占屏幕。')
            : mode === 'hidden'
              ? t('softPadShowModeHiddenHint', '不显示悬浮键盘；你改过的键位配置会保留。')
              : t('softPadShowModeFollowHint', '目标应用在前台时显示悬浮键盘。');
      }
      var scene = e.subBody.querySelector('[data-show-scene]');
      if (scene) scene.setAttribute('data-show-scene', mode);
    }
    var numLockEl = e.subBody.querySelector('[data-act="numlock"]');
    if (numLockEl) {
      numLockEl.checked = !!pad.requireNumLockOff;
      numLockEl.disabled = !pad.enabled;
    }
    var enabledEl = e.subBody.querySelector('[data-act="enabled"]');
    if (enabledEl) enabledEl.checked = !!pad.enabled;
    var navKeysEl = e.subBody.querySelector('[data-act="navKeys"]');
    if (navKeysEl) {
      navKeysEl.checked = pad.navKeysEnabled !== false;
      navKeysEl.disabled = !pad.enabled;
    }
    var cards = e.subBody.querySelector('.soft-pad-feature-cards');
    if (cards) cards.setAttribute('data-mapping-on', pad.enabled ? '1' : '0');
    e.subBody.querySelectorAll('[data-feature="occupy"], [data-feature="nav"]').forEach(function (card) {
      card.classList.toggle('is-disabled', !pad.enabled);
      if (pad.enabled) card.removeAttribute('aria-disabled');
      else card.setAttribute('aria-disabled', 'true');
    });
    var numpadMap = e.subBody.querySelector('[data-numpad-on]');
    if (numpadMap) numpadMap.setAttribute('data-numpad-on', pad.requireNumLockOff ? '1' : '0');
    var demo = e.subBody.querySelector('[data-demo-mode]');
    if (demo && !demo.classList.contains('is-user-driven')) {
      demo.setAttribute('data-demo-mode', pad.requireNumLockOff ? 'soft' : 'numpad');
    }
    var navCap = e.subBody.querySelector('[data-nav-cap]');
    if (navCap) {
      navCap.textContent = pad.navKeysEnabled === false
        ? t('softPadFeatureNavCapOff', '方向键保持系统原样，Soft Pad 不显示左侧方向列。')
        : t('softPadFeatureNavCapOn', '主键盘方向键临时靠在虚拟键盘左侧；与小键盘 2/4/6/8 无关。');
    }
    var navHost = e.subBody.querySelector('[data-nav-demo-host]');
    if (navHost && Pad && typeof Pad.renderNavArrowDemoHtml === 'function') {
      navHost.innerHTML = Pad.renderNavArrowDemoHtml(pad);
    } else {
      var arrowStory = e.subBody.querySelector('[data-nav-on]');
      if (arrowStory) {
        arrowStory.setAttribute('data-nav-on', pad.navKeysEnabled === false ? '0' : '1');
      }
    }
    var hint = e.subBody.querySelector('[data-numpad-hint]');
    if (hint) {
      var showHint = pad.requireNumLockOff && softLikelyNoNumpadHint();
      if (showHint) {
        hint.hidden = false;
        hint.textContent = t('softPadNumpadNoPadHint',
          '未检测到独立数字键区。你可以关闭占用，只用悬浮 Soft Pad。');
      } else {
        hint.hidden = true;
      }
    }
  }

  function softLikelyNoNumpadHint() {
    var Pad = global.OneToneCodexMicroPadUi;
    if (Pad && typeof Pad.softLikelyNoNumpad === 'function') {
      return Pad.softLikelyNoNumpad() === true;
    }
    try {
      var touch = Number(navigator.maxTouchPoints || 0) > 0;
      var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      return !!(touch && coarse);
    } catch (_) {
      return false;
    }
  }

  /** Layered panel updates — never default to paintSubpage remount. */
  function onSoftPadPanelChanged(m, panel, changeOpts) {
    var entry = syncEntryFromMapping(m);
    if (!entry) return;
    panel = panel || softPadView;
    changeOpts = changeOpts || {};
    // Presentation toggle is ultra-hot — skip chrome rebuild before return.
    if (panel === 'presentation') {
      updateStatusBar(entry);
      patchSchemeRowPresentation(entry);
      if (softPadView === 'hub' || softPadView === 'layout' || softPadView === 'presentation' ||
          softPadView === 'runtime' || softPadView === 'agent') {
        renderFuncTiles(entry);
      }
      return;
    }
    markActiveRow(getSelectedMappingId());
    if (!patchAppSwitcher()) renderAppSwitcher();
    updateScopeHint();

    if (panel === 'layout') {
      updateStatusBar(entry);
      patchSchemeRowPresentation(entry);
      // Profile/import may change routes — queue preview (hub/layout only).
      if (softPadView === 'layout' || softPadView === 'hub') {
        schedulePreviewPaint(entry);
      }
      if (softPadView === 'hub' || softPadView === 'layout' || softPadView === 'presentation' ||
          softPadView === 'runtime' || softPadView === 'agent') {
        renderFuncTiles(entry);
      }
      if (softPadView === 'layout' && changeOpts.remountLayout !== false) {
        paintSubpage(entry);
      }
      return;
    }
    if (panel === 'runtime') {
      updateStatusBar(entry);
      patchSchemeRowEnable(entry);
      patchSchemeRowPresentation(entry);
      // Never remount runtime three-cards on toggle — SVG demos remount = 假死.
      syncRuntimeCheckboxes(entry);
      if (changeOpts.refreshPreview) {
        var mapId = String(entry.mapping.id);
        requestAnimationFrame(function () {
          if (softPadView !== 'runtime') return;
          if (String(getSelectedMappingId() || '') !== mapId) return;
          var cur = findEntry(mapId);
          if (!hasMapping(cur)) return;
          paintPreview(cur, { force: true });
        });
      }
      if (softPadView === 'hub' || softPadView === 'layout' || softPadView === 'presentation' ||
          softPadView === 'runtime' || softPadView === 'agent') {
        renderFuncTiles(entry);
      }
      return;
    }
    if (panel === 'agent') {
      return;
    }
    updateStatusBar(entry);
    if (softPadView === 'hub' || softPadView === 'layout') {
      schedulePreviewPaint(entry);
    }
    if (softPadView === 'hub' || softPadView === 'layout' || softPadView === 'presentation' ||
        softPadView === 'runtime' || softPadView === 'agent') {
      renderFuncTiles(entry);
    }
  }

  function paintSubpage(entry) {
    var e = els();
    var targetView = softPadView;
    var t0 = Date.now();
    if (!entry || !hasMapping(entry) || !e.subBody || targetView === 'hub') return;
    if (String(entry.mapping.id) !== String(getSelectedMappingId() || '')) return;
    var Pad = global.OneToneCodexMicroPadUi;
    if (!Pad) {
      feLog('fe softPad.paintSubpage no Pad ui');
      return;
    }

    function stillValid() {
      return softPadView === targetView &&
        hasMapping(entry) &&
        String(entry.mapping.id) === String(getSelectedMappingId() || '');
    }

    var onChanged = function (mapping, panel, changeOpts) {
      onSoftPadPanelChanged(mapping, panel || targetView, changeOpts);
    };
    if (e.subTitle) e.subTitle.textContent = subpageTitle(targetView);
    if (!stillValid()) return;

    try {
      if (Pad.closeEditKeycap) Pad.closeEditKeycap({ reopenInline: false });
      // Layout sets is-editing-key (locks overflow). Drop it before any non-layout paint.
      if (targetView !== 'layout') e.subBody.classList.remove('is-editing-key');
      if (targetView === 'agent' && !isHubSoftPadKind(selectedScopeId)) {
        e.subBody.innerHTML =
          '<div class="soft-pad-agent-guide">' +
          '<p>' + esc(t('softPadAgentPickApp', '选择一个应用')) + '</p>' +
          '<button type="button" class="codex-micro-pad__btn codex-micro-pad__btn--primary" data-act="pick-app">' +
          esc(t('softPadAgentPickApp', '选择一个应用')) + '</button>' +
          '</div>';
        e.subBody.setAttribute('data-soft-pad-panel', 'agent');
        e.subBody.removeAttribute('data-agent-load-token');
        var pick = e.subBody.querySelector('[data-act="pick-app"]');
        if (pick) {
          pick.addEventListener('click', function () {
            selectScope('codex', { rebuildList: true });
          });
        }
        return;
      }

      var m = entry.mapping;
      if (targetView === 'layout' && Pad.renderSoftPadLayoutPanel) {
        Pad.renderSoftPadLayoutPanel(e.subBody, m, { onChanged: onChanged });
      } else if (targetView === 'presentation' && Pad.renderSoftPadPresentationPanel) {
        Pad.renderSoftPadPresentationPanel(e.subBody, m, { onChanged: onChanged });
      } else if (targetView === 'runtime' && Pad.renderSoftPadRuntimePanel) {
        Pad.renderSoftPadRuntimePanel(e.subBody, m, { onChanged: onChanged });
      } else if (targetView === 'agent' && Pad.renderSoftPadAgentPanel) {
        var token = agentLoadToken;
        e.subBody.setAttribute('data-agent-load-token', String(token));
        Pad.renderSoftPadAgentPanel(e.subBody, m, {
          onChanged: onChanged,
          agentLoadToken: token
        });
      } else {
        e.subBody.innerHTML =
          '<p class="codex-pad-mgr__hint">' + esc(t('softPadSubUnavailable', '该面板暂不可用')) + '</p>';
      }
    } catch (err) {
      feLog('fe softPad.paintSubpage error ' + (err && err.message ? err.message : 'unknown'));
      try {
        e.subBody.innerHTML =
          '<p class="codex-pad-mgr__hint">' + esc(t('softPadSubError', '面板加载失败，请返回重试')) + '</p>';
      } catch (_) {}
      throw err;
    } finally {
      feLog('fe softPad.paintSubpage ' + targetView + ' ' + (Date.now() - t0) + 'ms');
    }
  }

  function openSubpage(view) {
    if (view !== 'layout' && view !== 'presentation' && view !== 'runtime' && view !== 'agent') return;
    var entry = findEntry(getSelectedMappingId());
    if (!hasMapping(entry)) return;
    // Re-clicking the active tile must not remount — that wiped the inline key editor.
    if (view === softPadView) {
      syncHubChrome(entry);
      return;
    }
    feLog('fe softPad.openSubpage ' + view);
    // Close keycap editor so it cannot trap clicks / feel like 假死.
    try {
      var Pad = global.OneToneCodexMicroPadUi;
      if (Pad && Pad.closeEditKeycap) Pad.closeEditKeycap({ reopenInline: false });
    } catch (_) {}
    // Do NOT bump selectToken — cancels deferred preview paint.
    if (view === 'agent' || softPadView === 'agent') ++agentLoadToken;
    softPadView = view;
    rememberSoftPadView(view);
    // Sync chrome + light panel immediately (no blank frame between hide tiles and fill body).
    syncHubChrome(entry);
    paintSubpage(entry);
    ensureSoftPadPreview(entry);
  }

  function closeSubpage() {
    var from = softPadView;
    feLog('fe softPad.closeSubpage from=' + from);
    var entry = findEntry(getSelectedMappingId());
    // 默认落地「何时显示」：其它子页返回到 runtime，不再回到空白提示态。
    if (hasMapping(entry) && from !== 'runtime') {
      openSubpage('runtime');
      return;
    }
    if (from === 'runtime') return;
    ++selectToken;
    if (from === 'agent') ++agentLoadToken;
    softPadView = 'hub';
    clearSubpage();
    var e = els();
    if (e.stage) {
      e.stage.classList.remove('is-detail-open');
      e.stage.classList.remove('is-preview-collapsed');
    }
    if (e.preview && hasMapping(entry)) {
      e.preview.hidden = false;
      e.preview.classList.remove('is-collapsed');
    } else if (e.preview) {
      e.preview.hidden = true;
    }
    updateStatusBar(entry);
    updateScopeHint();
    if (entry) {
      if (!e.tiles || !e.tiles.querySelector('[data-tile]')) renderFuncTiles(entry);
      else patchActiveTiles();
    }
    if (!hasMapping(entry)) return;
    schedulePreviewPaint(entry);
    feLog('fe softPad.closeSubpage previewQueued');
  }

  function markActiveRow(mappingId) {
    var e = els();
    if (!e.list) return;
    e.list.querySelectorAll('.keys-hub-scheme-row').forEach(function (row) {
      var kind = row.getAttribute('data-app-kind') || '';
      var on = kind === String(selectedScopeId || '');
      row.classList.toggle('is-editing', on);
      var main = row.querySelector('[data-scheme-select], [data-scheme-prepare]');
      if (main) main.setAttribute('aria-current', on ? 'true' : 'false');
      var actions = row.querySelector('.keys-hub-scheme-actions');
      if (!actions) return;
      var editing = actions.querySelector('.keys-hub-scheme-editing');
      if (on && !editing) {
        var span = document.createElement('span');
        span.className = 'keys-hub-scheme-editing';
        span.textContent = t('keysWorkflowEditing', '编辑中');
        actions.insertBefore(span, actions.firstChild);
      } else if (!on && editing) {
        editing.remove();
      }
    });
  }

  function renderAppSwitcher() {
    var e = els();
    if (!e.switcher) return;
    var scopes = listAppScopes();
    if (!scopes.length) {
      e.switcher.innerHTML = '';
      e.switcher.hidden = true;
      return;
    }
    e.switcher.hidden = false;
    e.switcher.setAttribute('aria-label', t('softPadAppSwitcherAria', '应用虚拟键盘'));
    e.switcher.innerHTML = scopes.map(function (scope) {
      var active = scope.id === String(selectedScopeId || '');
      var icon = iconHtml(scope.kind, 'soft-pad-app-chip-icon');
      return (
        '<button type="button" class="soft-pad-app-chip' +
        (active ? ' is-active' : '') +
        (scope.padEnabled ? '' : ' is-off') +
        (scope.canPrepare ? ' is-prepare' : '') +
        '" role="tab" data-scope="' + esc(scope.id) + '"' +
        (scope.appId ? ' data-app-id="' + esc(scope.appId) + '"' : '') +
        ' aria-controls="softPadHubStage"' +
        ' aria-selected="' + (active ? 'true' : 'false') + '"' +
        ' title="' + esc(scope.title) + '">' +
        icon +
        '<span>' + esc(scope.title) + '</span>' +
        '</button>'
      );
    }).join('');
  }

  function paintPreview(entry, opts) {
    opts = opts || {};
    if (!hasMapping(entry)) return;
    if (paintReentry > 0) return;
    var light = softPadView === 'runtime' || softPadView === 'presentation' || softPadView === 'agent';
    if (softPadView !== 'hub' && softPadView !== 'layout' && !light && !opts.force) return;
    var e = els();
    if (!e.preview) return;
    // Light pages: paint once when empty/stale — avoid remount loops (假死).
    if (light && !opts.force) {
      var hasPrev = !!e.preview.querySelector('.codex-micro-pad.soft-pad-preview');
      if (hasPrev && paintedMappingId === String(entry.mapping.id)) return;
    }
    var Pad = global.OneToneCodexMicroPadUi;
    if (Pad && Pad.renderSoftPadPreview) {
      paintReentry++;
      try {
        Pad.renderSoftPadPreview(e.preview, entry.mapping);
        paintedMappingId = String(entry.mapping.id);
      } finally {
        paintReentry--;
      }
    }
  }

  /** Ensure left Soft Pad preview exists on light pages (何时显示 / 外观 / 更多). */
  function ensureSoftPadPreview(entry) {
    if (!hasMapping(entry)) return;
    paintPreview(entry);
  }

  /** Single cancelable preview queue (hub/layout refresh). Uses previewEpoch, not selectToken. */
  function schedulePreviewPaint(entry) {
    if (!hasMapping(entry)) return;
    if (softPadView !== 'hub' && softPadView !== 'layout') return;
    var token = ++previewEpoch;
    var mapId = String(entry.mapping.id);
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(function () {
      previewTimer = 0;
      if (token !== previewEpoch) return;
      if (softPadView !== 'hub' && softPadView !== 'layout') return;
      if (String(getSelectedMappingId() || '') !== mapId) return;
      var cur = findEntry(mapId);
      if (!hasMapping(cur)) return;
      paintPreview(cur, { force: true });
    }, 0);
  }

  function boundKeyCount(entry) {
    var pad = entry && entry.mapping && entry.mapping.codexMicroPad;
    if (!pad || !Array.isArray(pad.keys)) return 0;
    var n = 0;
    pad.keys.forEach(function (k) {
      if (k && k.enabled !== false && String(k.slotId || '').trim()) n++;
    });
    return n;
  }

  function patchAppSwitcher() {
    var e = els();
    if (!e.switcher) return false;
    var chips = e.switcher.querySelectorAll('[data-scope]');
    if (!chips.length) return false;
    chips.forEach(function (chip) {
      var on = chip.getAttribute('data-scope') === String(selectedScopeId || '');
      chip.classList.toggle('is-active', on);
      chip.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    return true;
  }

  function syncScopeChrome(entry, opts) {
    opts = opts || {};
    updateStatusBar(entry);
    updateScopeHint();
    if (opts.rebuildSwitcher || !patchAppSwitcher()) {
      renderAppSwitcher();
    }
    markActiveRow(entry && entry.mapping ? entry.mapping.id : getSelectedMappingId());
    syncHubChrome(entry);
  }

  function paintMain(entry, opts) {
    opts = opts || {};
    if (!hasMapping(entry)) {
      renderEmptyMain();
      return;
    }
    hideEmpty();
    setSelectedMappingId(String(entry.mapping.id));
    // Hub / 键位布局需要预览；其它轻量子页禁止重绘大键盘（假死根因）。
    if (softPadView === 'hub' || softPadView === 'layout') {
      paintPreview(entry);
      if (softPadView === 'hub') {
        var detailPanel = els().detailPanel;
        if (detailPanel && !detailPanel.hidden) clearSubpage();
        renderFuncTiles(entry);
        syncHubChrome(entry);
      } else {
        syncHubChrome(entry);
        // Avoid remounting layout tools while deferred paint runs — preserves inline editor.
        var body = els().subBody;
        var layoutReady = body &&
          body.getAttribute('data-soft-pad-panel') === 'layout' &&
          body.getAttribute('data-soft-pad-mapping') === String(entry.mapping.id);
        if (!layoutReady) paintSubpage(entry);
      }
    } else {
      syncHubChrome(entry);
      ensureSoftPadPreview(entry);
      paintSubpage(entry);
    }
  }

  function flushPaint(entry, opts) {
    if (paintBusy) {
      pendingPaintEntry = entry;
      pendingPaintOpts = opts || {};
      return;
    }
    paintBusy = true;
    var t0 = Date.now();
    try {
      paintMain(entry, opts);
    } catch (err) {
      feLog('fe softPad.paintMain error ' + (err && err.message ? err.message : 'unknown'));
      throw err;
    } finally {
      paintBusy = false;
      feLog('fe softPad.paintMain ' + (Date.now() - t0) + 'ms map=' +
        (entry && entry.mapping ? entry.mapping.id : ''));
      if (pendingPaintEntry) {
        var pe = pendingPaintEntry;
        var po = pendingPaintOpts || {};
        pendingPaintEntry = null;
        pendingPaintOpts = null;
        requestAnimationFrame(function () {
          if (!hasMapping(pe)) return;
          if (String(getSelectedMappingId()) !== String(pe.mapping.id)) return;
          flushPaint(pe, po);
        });
      }
    }
  }

  function schedulePaint(entry, opts) {
    opts = opts || {};
    if (!hasMapping(entry)) return;
    var token = ++selectToken;
    hideEmpty();
    setSelectedMappingId(String(entry.mapping.id));
    // Chrome-first: status / chips / aside highlight — never block on pad remount.
    syncScopeChrome(entry, { rebuildSwitcher: false });
    if (softPadView === 'hub') renderFuncTiles(entry);

    if (opts.previewOnly) return;
    // 轻量子页立即刷右栏；改按键也立刻填说明区，避免先闪空白提示。
    // 键位预览仍走下面的 deferred paint（假死根因）。
    if (softPadView === 'presentation' || softPadView === 'runtime' || softPadView === 'agent' ||
        softPadView === 'layout') {
      paintSubpage(entry);
      if (softPadView !== 'layout') {
        ensureSoftPadPreview(entry);
        return;
      }
    }

    if (selectTimer) clearTimeout(selectTimer);
    // Never sync-paint on open: even immediateMgr waits one frame so drawer can paint.
    var delay = opts.immediateMgr ? 0 : 16;
    selectTimer = setTimeout(function () {
      selectTimer = 0;
      if (token !== selectToken) return;
      if (String(getSelectedMappingId()) !== String(entry.mapping.id)) return;
      if (softPadView === 'presentation' || softPadView === 'runtime' || softPadView === 'agent') return;
      requestAnimationFrame(function () {
        if (token !== selectToken) return;
        if (softPadView === 'presentation' || softPadView === 'runtime' || softPadView === 'agent') return;
        if (paintBusy) {
          pendingPaintEntry = entry;
          pendingPaintOpts = opts;
          return;
        }
        flushPaint(entry, { previewOnly: false });
      });
    }, delay);
  }

  function selectScheme(mappingId, opts) {
    opts = opts || {};
    var id = String(mappingId || '');
    if (!id) return;

    ++agentLoadToken;
    var entry = findEntry(id);
    if (!entry) {
      var entries = listSoftPadSchemes();
      entry = entries[0] || null;
    }
    if (!entry) {
      setSelectedMappingId(null);
      selectedScopeId = 'codex';
      softPadView = 'hub';
      renderSchemeList();
      renderEmptyMain();
      return;
    }

    if (opts.scopeId) {
      selectedScopeId = String(opts.scopeId);
    } else if (opts.fromList || !selectedScopeId || selectedScopeId === 'global') {
      selectedScopeId = entry.kind;
    }

    if (opts.resetView !== false) {
      // Default landing: 何时显示；later opens restore last tile.
      softPadView = defaultDetailView(opts);
      rememberSoftPadView(softPadView);
    }

    var sameMap = id === String(getSelectedMappingId() || '');
    var hostsOk = !hostsNeedPaint(entry);

    // Same mapping (e.g. 全局 ↔ Codex 共用) or already painted: chrome + skip pad remount.
    if (sameMap && hostsOk && !opts.forceRemount) {
      syncScopeChrome(entry, { rebuildSwitcher: !!opts.rebuildList });
      if (opts.rebuildList) renderSchemeList();
      renderFuncTiles(entry);
      if (softPadView !== 'hub') {
        paintSubpage(entry);
        if (softPadView !== 'layout') ensureSoftPadPreview(entry);
      }
      return;
    }

    setSelectedMappingId(String(entry.mapping.id));
    if (opts.rebuildList) renderSchemeList();
    else markActiveRow(getSelectedMappingId());

    schedulePaint(entry, {
      forceRemount: !!opts.forceRemount || !hostsOk,
      immediateMgr: !!opts.immediateMgr,
      previewOnly: !!opts.previewOnly
    });
    if (global.OneToneHabitChannelStatusStrip && global.OneToneHabitChannelStatusStrip.render) {
      try { global.OneToneHabitChannelStatusStrip.render(); } catch (_) {}
    }
  }

  function selectScope(scopeId, opts) {
    opts = opts || {};
    ++selectToken;
    ++agentLoadToken;

    var scope = findScope(scopeId);
    if (!scope) {
      softPadView = 'hub';
      clearSubpage();
      renderEmptyMain();
      return;
    }

    // Same chip re-click: keep / restore default 何时显示 detail (no idle tip).
    if (!opts.force && String(scope.id) === String(selectedScopeId || '') &&
        scope.mapping && String(scope.mapping.id) === String(getSelectedMappingId() || '') &&
        !hostsNeedPaint(scope.entry)) {
      softPadView = defaultDetailView(opts);
      rememberSoftPadView(softPadView);
      syncScopeChrome(scope.entry, { rebuildSwitcher: false });
      renderFuncTiles(scope.entry);
      paintSubpage(scope.entry);
      return;
    }

    selectedScopeId = String(scope.id);

    // Missing mapping → view + CTA only. Never auto-create on tab switch.
    if (!scope.entry || !scope.mapping) {
      softPadView = 'hub';
      clearSubpage();
      showPrepareMain(scope);
      return;
    }

    // Existing app: cheap switch — preview + default layout detail.
    selectScheme(scope.mapping.id, {
      scopeId: selectedScopeId,
      rebuildList: !!opts.rebuildList,
      previewOnly: false,
      forceRemount: false,
      resetView: true
    });
  }

  function renderSchemeRow(entry) {
    var hasMap = !!(entry.mapping && entry.mapping.id);
    var active = false;
    if (hasMap) {
      active = selectedScopeId === entry.kind;
    } else if (entry.canPrepare && selectedScopeId === entry.kind) {
      active = true;
    }
    var tag = statusTag(entry);
    var pair = entry.canPrepare
      ? t('softPadHubStatusCanPrepare', '可准备')
      : (t('softPadSchemeSoftPad', '虚拟键盘') + ' · ' + presentationLabel(entry.presentation));
    var steps = hasMap ? (boundKeyCount(entry) + '/15') : '—';
    var icon = iconHtml(entry.kind, 'soft-pad-scheme-leading-icon');
    var selectAttr = hasMap
      ? ' data-scheme-select="' + esc(entry.mapping.id) + '"'
      : ' data-scheme-prepare="' + esc(entry.appId || appIdForKind(entry.kind)) + '" data-scheme-kind="' + esc(entry.kind) + '"';
    return (
      '<div class="keys-hub-scheme-row soft-pad-scheme-row is-app-' + esc(entry.kind) +
      (active ? ' is-editing' : '') +
      (!entry.padEnabled ? ' is-disabled-scheme' : '') +
      (entry.canPrepare || tag.cls === 'is-draft' ? ' is-draft' : '') +
      '" role="listitem"' +
      (hasMap ? ' data-scheme-id="' + esc(entry.mapping.id) + '"' : '') +
      ' data-app-kind="' + esc(entry.kind) + '">' +
      '<button type="button" class="keys-hub-scheme-main"' + selectAttr +
      ' aria-current="' + (active ? 'true' : 'false') + '">' +
      icon +
      '<span class="keys-hub-scheme-copy">' +
      '<span class="keys-hub-scheme-name">' + esc(entry.title) + '</span>' +
      '<span class="keys-hub-scheme-pair">' + esc(pair) + '</span>' +
      '</span>' +
      '<span class="keys-hub-scheme-tag ' + esc(tag.cls) + '">' + esc(tag.text) + '</span>' +
      '<span class="keys-hub-scheme-steps">' + esc(steps) + '</span>' +
      '</button>' +
      '<div class="keys-hub-scheme-actions">' +
      (active ? '<span class="keys-hub-scheme-editing">' + esc(t('keysWorkflowEditing', '编辑中')) + '</span>' : '') +
      (hasMap
        ? ('<button type="button" class="toggle-switch keys-hub-scheme-toggle' +
          (entry.padEnabled ? ' is-on' : '') +
          '" data-scheme-enable="' + esc(entry.mapping.id) +
          '" role="switch" aria-checked="' + (entry.padEnabled ? 'true' : 'false') +
          '" aria-label="' + esc(statusLabel(entry)) + '"></button>')
        : ('<button type="button" class="keys-hub-scheme-add soft-pad-prepare-btn" data-scheme-prepare="' +
          esc(entry.appId || appIdForKind(entry.kind)) + '" data-scheme-kind="' + esc(entry.kind) + '">' +
          esc(t('softPadHubPrepareShort', '准备')) + '</button>')) +
      '</div></div>'
    );
  }

  function renderSchemeList() {
    var e = els();
    if (!e.list) return;
    if (e.titleLbl) e.titleLbl.textContent = t('keysHubTitle', '方案');
    if (e.aside) e.aside.setAttribute('aria-label', t('keysHubTitle', '方案'));
    var entries = listAsideEntries();
    if (e.count) e.count.textContent = String(entries.length);
    if (!entries.length) {
      e.list.innerHTML = '<p class="keys-hub-empty">' + esc(t('softPadHubEmptyTitle', '还没有可管理的虚拟键盘')) + '</p>';
      return;
    }
    e.list.innerHTML = '<div class="keys-hub-scheme-group">' +
      entries.map(renderSchemeRow).join('') +
      '</div>';
  }

  function ensureCodex() {
    prepareAppFromUi('codex-chat', 'codex');
  }

  function prepareAppFromUi(appId, kind) {
    kind = kind || kindForAppId(appId);
    var m = ensureAppSoftPad(appId, kind);
    if (!m) return;
    selectedScopeId = kind || 'codex';
    lastSoftPadView = 'runtime';
    renderSchemeList();
    selectScheme(m.id, {
      force: true,
      forceRemount: true,
      scopeId: selectedScopeId,
      rebuildList: true,
      firstPrepare: true
    });
  }

  function applyEnabledUi(entry) {
    if (!entry) return;
    entry.padEnabled = !!(entry.mapping && entry.mapping.codexMicroPad &&
      entry.mapping.codexMicroPad.enabled);
    updateStatusBar(entry);
    patchSchemeRowEnable(entry);
    if (!patchAppSwitcher()) renderAppSwitcher();
    if (softPadView === 'hub') renderFuncTiles(entry);
    else if (softPadView === 'runtime') syncRuntimeCheckboxes(entry);
    if (softPadView === 'hub' || softPadView === 'layout') {
      schedulePreviewPaint(entry);
    }
  }

  function toastPad(msg) {
    var toast = global.OneToneToast;
    if (toast && toast.show) {
      try { toast.show(msg); } catch (_) {}
    }
  }

  function setPadEnabled(m, enabled) {
    if (!m) return null;
    var Pad = global.OneToneCodexMicroPadUi;
    if (!m.codexMicroPad && Pad && Pad.renderSoftPadPreview) {
      Pad.renderSoftPadPreview(document.createElement('div'), m);
    }
    if (!m.codexMicroPad) return null;
    var prevEnabled = !!m.codexMicroPad.enabled;
    var prevOverlay = !!m.codexMicroPad.overlayEnabled;
    m.codexMicroPad.enabled = !!enabled;
    if (m.codexMicroPad.enabled) m.codexMicroPad.overlayEnabled = true;
    var invoke = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    if (!invoke) return null;
    return invoke('cmd_codex_micro_pad_set_flags', {
      mappingId: String(m.id),
      enabled: !!m.codexMicroPad.enabled,
      requireNumLockOff: !!m.codexMicroPad.requireNumLockOff,
      overlayEnabled: !!m.codexMicroPad.overlayEnabled,
      requireForeground: m.codexMicroPad.requireForeground !== false,
      navKeysEnabled: m.codexMicroPad.navKeysEnabled !== false
    }).catch(function () {
      m.codexMicroPad.enabled = prevEnabled;
      m.codexMicroPad.overlayEnabled = prevOverlay;
      var entry = findEntry(m.id);
      if (entry) {
        entry.mapping = m;
        applyEnabledUi(entry);
      }
      toastPad(t('softPadEnableFail', '启用状态同步失败，已回滚'));
      var p = global.OneToneConfigPersist;
      if (p && p.saveAsync) p.saveAsync();
      else if (p && p.save) p.save();
    });
  }

  function toggleSelectedEnable() {
    var entry = findEntry(getSelectedMappingId());
    if (!entry || !entry.mapping || !entry.mapping.codexMicroPad) return;
    var next = !entry.mapping.codexMicroPad.enabled;
    setPadEnabled(entry.mapping, next);
    entry.padEnabled = next;
    applyEnabledUi(entry);
  }

  function toggleRowEnable(mappingId) {
    var entry = findEntry(mappingId);
    if (!entry || !entry.mapping) return;
    var pad = entry.mapping.codexMicroPad;
    var next = !(pad && pad.enabled);
    setPadEnabled(entry.mapping, next);
    entry.padEnabled = next;
    if (String(getSelectedMappingId()) === String(mappingId)) {
      applyEnabledUi(entry);
    } else {
      patchSchemeRowEnable(entry);
      if (!patchAppSwitcher()) renderAppSwitcher();
    }
  }

  function isAgentPanelCurrent(token, mappingId) {
    if (softPadView !== 'agent') return false;
    if (token != null && Number(token) !== Number(agentLoadToken)) return false;
    if (mappingId != null && String(mappingId) !== String(getSelectedMappingId() || '')) return false;
    var ui = global.OneToneState && global.OneToneState.ui;
    if (ui) {
      if (ui.drawerOpen === false) return false;
      if (ui.settingsPanel && ui.settingsPanel !== 'softPad') return false;
    }
    return true;
  }

  function bindChrome() {
    if (chromeBound) return;
    chromeBound = true;
    var e = els();
    if (e.switcher) {
      e.switcher.addEventListener('click', function (ev) {
        var chip = ev.target.closest && ev.target.closest('[data-scope]');
        if (!chip) return;
        selectScope(chip.getAttribute('data-scope'));
      });
    }
    if (e.tiles) {
      e.tiles.addEventListener('click', function (ev) {
        var tile = ev.target.closest && ev.target.closest('[data-tile]');
        if (!tile || tile.disabled || tile.getAttribute('aria-disabled') === 'true') return;
        openSubpage(tile.getAttribute('data-tile'));
      });
    }
    if (e.subBack) {
      e.subBack.addEventListener('click', function () { closeSubpage(); });
    }
    if (e.list) {
      e.list.addEventListener('click', function (ev) {
        var prep = ev.target.closest && ev.target.closest('[data-scheme-prepare]');
        if (prep) {
          ev.preventDefault();
          ev.stopPropagation();
          prepareAppFromUi(
            prep.getAttribute('data-scheme-prepare'),
            prep.getAttribute('data-scheme-kind')
          );
          return;
        }
        var en = ev.target.closest && ev.target.closest('[data-scheme-enable]');
        if (en) {
          ev.preventDefault();
          ev.stopPropagation();
          toggleRowEnable(en.getAttribute('data-scheme-enable'));
          return;
        }
        var btn = ev.target.closest && ev.target.closest('[data-scheme-select]');
        if (!btn) return;
        var row = btn.closest('[data-app-kind]');
        var kind = row && row.getAttribute('data-app-kind');
        selectScheme(btn.getAttribute('data-scheme-select'), {
          fromList: true,
          scopeId: kind || undefined,
          forceRemount: false,
          resetView: true
        });
      });
    }
    if (e.ensureBtn) {
      e.ensureBtn.addEventListener('click', function () { ensureCodex(); });
    }
    if (e.enable) {
      e.enable.addEventListener('click', function () { toggleSelectedEnable(); });
    }
  }

  function refreshSelected(m) {
    if (paintReentry > 0) return;
    var entry = syncEntryFromMapping(m);
    markActiveRow(getSelectedMappingId());
    if (!patchAppSwitcher()) renderAppSwitcher();
    updateScopeHint();
    if (entry) {
      updateStatusBar(entry);
      // Never remount pad while on light subpages (显示形态/返回假死).
      if (softPadView === 'hub' || softPadView === 'layout') {
        schedulePreviewPaint(entry);
      }
      if (softPadView === 'hub') renderFuncTiles(entry);
      else {
        syncHubChrome(entry);
        if (softPadView === 'runtime') syncRuntimeCheckboxes(entry);
      }
    }
  }

  function render(opts) {
    opts = opts || {};
    var t0 = Date.now();
    feLog('fe softPad.render begin');
    bindChrome();
    // Will land on runtime via selectScheme({ resetView: true }); keep hub only until then.
    softPadView = 'hub';
    clearSubpage();
    var e = els();
    if (e.ensureBtn) {
      e.ensureBtn.textContent = '+ ' + t('softPadHubEnsureCodex', '准备 Codex 虚拟键盘');
    }
    var entries = listSoftPadSchemes();
    renderSchemeList();
    renderAppSwitcher();
    updateScopeHint();

    if (opts.scopeId) selectedScopeId = String(opts.scopeId);
    if (selectedScopeId === 'global') selectedScopeId = 'codex';
    if (opts.mappingId) {
      setSelectedMappingId(String(opts.mappingId));
      var mapped = findEntry(getSelectedMappingId());
      if (mapped && !opts.scopeId) selectedScopeId = mapped.kind;
    } else if (!getSelectedMappingId() && entries.length) {
      var defEntry = pickDefaultEntry(entries);
      setSelectedMappingId(defEntry ? String(defEntry.mapping.id) : String(entries[0].mapping.id));
      if (!opts.scopeId) selectedScopeId = pickDefaultScopeId(entries);
    }

    if (!entries.length) {
      // Don't wipe unrelated habit edit selection when Soft Pad has no app scenarios yet.
      var curId = getSelectedMappingId();
      if (curId) {
        var maps = mappings();
        var curMap = null;
        for (var ci = 0; ci < maps.length; ci++) {
          if (maps[ci] && String(maps[ci].id) === String(curId)) { curMap = maps[ci]; break; }
        }
        if (curMap && isSoftPadSchemeEligible(curMap)) setSelectedMappingId(null);
      }
      if (!opts.scopeId) selectedScopeId = 'codex';
      renderSchemeList();
      renderAppSwitcher();
      updateStatusBar(null);
      updateScopeHint();
      clearMain();
      var empty = e.empty;
      if (empty) {
        empty.hidden = false;
        empty.innerHTML = emptyCreateCtaHtml();
        bindEmptyCreateCtas(empty);
      }
      ensureSoftPadBoundaryHint();
      if (global.OneToneHabitChannelStatusStrip && global.OneToneHabitChannelStatusStrip.render) {
        try { global.OneToneHabitChannelStatusStrip.render(); } catch (_) {}
      }
      feLog('fe softPad.render empty ' + (Date.now() - t0) + 'ms');
      return;
    }
    if (!findEntry(getSelectedMappingId())) {
      var fallback = pickDefaultEntry(entries) || entries[0];
      setSelectedMappingId(String(fallback.mapping.id));
      selectedScopeId = fallback.kind || pickDefaultScopeId(entries);
    }

    var needEntry = findEntry(getSelectedMappingId());
    var needForce = hostsNeedPaint(needEntry) || !!opts.force || !!opts.mappingId;
    // Chrome + list sync now; pad preview always deferred (never block drawer open).
    selectScheme(getSelectedMappingId(), {
      forceRemount: needForce,
      scopeId: selectedScopeId,
      rebuildList: false,
      immediateMgr: false,
      resetView: true
    });
    ensureSoftPadBoundaryHint();
    if (global.OneToneHabitChannelStatusStrip && global.OneToneHabitChannelStatusStrip.render) {
      try { global.OneToneHabitChannelStatusStrip.render(); } catch (_) {}
    }
    feLog('fe softPad.render chrome ' + (Date.now() - t0) + 'ms map=' + String(getSelectedMappingId() || ''));
  }

  function ensureSoftPadBoundaryHint() {
    var panel = document.getElementById('settingsPanelSoftPad');
    if (!panel) return;
    var hint = document.getElementById('softPadBoundaryHint');
    if (!hint) {
      hint = document.createElement('p');
      hint.id = 'softPadBoundaryHint';
      hint.className = 'soft-pad-boundary-hint';
      hint.setAttribute('role', 'note');
      var status = document.getElementById('softPadStatusBar');
      var strip = document.getElementById('habitChannelStatusStripSoftPad');
      var anchor = status || panel.firstChild;
      if (strip && strip.nextSibling) panel.insertBefore(hint, strip.nextSibling);
      else if (status) panel.insertBefore(hint, status);
      else panel.insertBefore(hint, anchor);
    }
    hint.textContent = t('softPadBoundaryHint',
      '虚拟键盘只绑定到应用场景。先创建 Codex 或 Claude 应用场景，再配置它的虚拟键盘。');
    var entries = listSoftPadSchemes();
    // Always show boundary when no real Soft Pad app scenarios exist.
    hint.hidden = entries.length > 0;
  }

  function showList() { render({}); }
  function openDetail(mappingId, opts) {
    render(Object.assign({}, opts || {}, { mappingId: mappingId, force: true }));
  }

  global.OneToneSoftPadHub = {
    render: render,
    showList: showList,
    openDetail: openDetail,
    selectScheme: selectScheme,
    selectScope: selectScope,
    refreshSelected: refreshSelected,
    schedulePreviewPaint: schedulePreviewPaint,
    onPanelLeave: onPanelLeave,
    ensureAppSoftPad: ensureAppSoftPad,
    isAgentPanelCurrent: isAgentPanelCurrent,
    isPaintBusy: function () { return paintBusy || paintReentry > 0 || !!previewTimer; },
    getView: function () { return softPadView; },
    listSoftPadSchemes: listSoftPadSchemes,
    listAppScopes: listAppScopes,
    listHubEntries: listHubEntries,
    isSoftPadSchemeEligible: isSoftPadSchemeEligible
  };
  global.OneToneSoftPadSchemesUi = global.OneToneSoftPadHub;
})(window);
