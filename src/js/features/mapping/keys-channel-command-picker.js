/**
 * Recognition footer: browse other-channel configured actions → add a Key entry.
 * Read source channel BindingViews; write only via Key Adapter. No silent defaults.
 */
(function (global) {
  'use strict';

  var TABS = ['key', 'voice', 'cursor', 'softPad', 'camera', 'ime'];
  var CHANNEL_TABS = ['voice', 'softPad', 'camera'];
  /** Voice lifecycle intents shown on 识别 — not full BindingView expansion. */
  var VOICE_LIFECYCLE_IDS = {
    start: 'input.start',
    cancel: 'input.cancel',
    // end/send: open capture sheet key/voice — never a separate finish step
    endCommit: 'input.commit',
    endSend: 'input.send'
  };
  /** Layout-only Cursor catalogue, grouped by how the action is triggered. */
  var CURSOR_COMMAND_GROUPS = [
    {
      id: 'native',
      titleKey: 'keysChannelCursorGroupNative',
      titleFb: '原生快捷键（Cursor / VS Code）',
      items: [
        {
          slotId: 'stopOrSend',
          labelZh: '发送',
          labelEn: 'Send',
          phrase: '发送',
          chordHint: 'Enter',
          noteZh: 'Composer 内回车发送',
          noteEn: 'Enter in Composer'
        },
        {
          slotId: 'newThread',
          labelZh: '新会话',
          labelEn: 'New chat',
          phrase: '新会话',
          chordHint: 'Ctrl+N',
          noteZh: '新建；是否等于新 Composer 看绑定',
          noteEn: 'New; may differ from new Composer'
        },
        {
          slotId: 'quickSearch',
          labelZh: '搜索',
          labelEn: 'Search',
          phrase: '搜索',
          chordHint: 'Ctrl+P',
          noteZh: '快速打开文件',
          noteEn: 'Quick Open'
        },
        {
          slotId: 'commandPalette',
          labelZh: '命令',
          labelEn: 'Command',
          phrase: '命令',
          chordHint: 'Ctrl+Shift+P',
          noteZh: '命令面板',
          noteEn: 'Command Palette'
        }
      ]
    },
    {
      id: 'editor',
      titleKey: 'keysChannelCursorGroupEditor',
      titleFb: '编辑器习惯键',
      items: [
        {
          slotId: 'quickChat',
          labelZh: '开 Chat',
          labelEn: 'Open Chat',
          phrase: '开 Chat',
          chordHint: 'Ctrl+I',
          noteZh: '侧栏 Chat / Agent（亦常见 Ctrl+L）',
          noteEn: 'Sidepanel Chat / Agent (also Ctrl+L)'
        },
        {
          slotId: 'inlineEdit',
          labelZh: '行内编辑',
          labelEn: 'Inline Edit',
          phrase: '行内编辑',
          chordHint: 'Ctrl+K',
          noteZh: '选中代码后就地改',
          noteEn: 'Inline edit on selection'
        },
        {
          slotId: 'acceptTab',
          labelZh: '接受补全',
          labelEn: 'Accept Tab',
          phrase: '接受补全',
          chordHint: 'Tab',
          noteZh: '接受 Cursor Tab 建议',
          noteEn: 'Accept Cursor Tab suggestion'
        },
        {
          slotId: 'modeMenu',
          labelZh: '切模式',
          labelEn: 'Mode menu',
          phrase: '切模式',
          chordHint: 'Ctrl+.',
          noteZh: 'Mode Menu；输入框内亦可用 Shift+Tab 轮换',
          noteEn: 'Mode Menu; Shift+Tab cycles in chat input'
        }
      ]
    },
    {
      id: 'seeded',
      titleKey: 'keysChannelCursorGroupSeeded',
      titleFb: 'OneTone 写入 Cursor',
      items: [
        {
          slotId: 'plan',
          labelZh: '定计划',
          labelEn: 'Plan',
          phrase: '定计划',
          chordHint: 'Ctrl+Alt+Shift+P',
          noteZh: 'seed composerMode.plan',
          noteEn: 'seed composerMode.plan'
        },
        {
          slotId: 'switchAgent',
          labelZh: '开工',
          labelEn: 'Agent',
          phrase: '开工',
          chordHint: 'Ctrl+Alt+.',
          noteZh: 'seed composerMode.agent',
          noteEn: 'seed composerMode.agent'
        },
        {
          slotId: 'cancel',
          labelZh: '取消',
          labelEn: 'Cancel',
          phrase: '取消',
          chordHint: 'Ctrl+Shift+Backspace',
          noteZh: 'OneTone 默认停生成映射',
          noteEn: 'OneTone stop-generation default'
        }
      ]
    },
    {
      id: 'inject',
      titleKey: 'keysChannelCursorGroupInject',
      titleFb: '无固定快捷键 / 注入',
      items: [
        {
          slotId: 'pushToTalk',
          labelZh: '说话',
          labelEn: 'Talk',
          phrase: '说话',
          chordHint: '',
          rightLabelZh: '语音键',
          rightLabelEn: 'Voice key',
          noteZh: 'PTT → 第三方输入法，非 Cursor 自带麦',
          noteEn: 'PTT → IME, not Cursor mic'
        },
        {
          slotId: 'continue',
          labelZh: '继续',
          labelEn: 'Continue',
          phrase: '继续',
          chordHint: '',
          rightLabelZh: '模板句',
          rightLabelEn: 'Template',
          noteZh: '注入固定文案，无 Cursor 原生键',
          noteEn: 'Injected template, no native key'
        },
        {
          slotId: 'summarizeDiff',
          labelZh: '总结改动',
          labelEn: 'Summarize',
          phrase: '总结改动',
          chordHint: '',
          rightLabelZh: '模板句',
          rightLabelEn: 'Template',
          noteZh: '注入固定总结提示',
          noteEn: 'Injected summarize prompt'
        },
        {
          slotId: 'runChecks',
          labelZh: '跑测试',
          labelEn: 'Run checks',
          phrase: '跑测试',
          chordHint: '',
          rightLabelZh: '模板句',
          rightLabelEn: 'Template',
          noteZh: '注入 lint/test 提示，不直跑终端',
          noteEn: 'Injected lint/test prompt, not direct terminal'
        }
      ]
    },
    {
      id: 'wrapup',
      titleKey: 'keysChannelCursorGroupWrapup',
      titleFb: '回合收尾',
      items: [
        {
          slotId: 'focusComposer',
          labelZh: '回 Cursor',
          labelEn: 'Focus Cursor',
          phrase: '回 Cursor',
          chordHint: '',
          rightLabelZh: '焦点',
          rightLabelEn: 'Focus',
          noteZh: '从其他 App 切回并聚焦 Composer',
          noteEn: 'Focus Composer from another app'
        },
        {
          slotId: 'paste',
          labelZh: '粘贴',
          labelEn: 'Paste',
          phrase: '粘贴',
          chordHint: 'Ctrl+V',
          noteZh: '聚焦后粘贴（截图/剪贴板）',
          noteEn: 'Focus then paste clipboard'
        },
        {
          slotId: 'nextChange',
          labelZh: '下一处',
          labelEn: 'Next change',
          phrase: '下一处',
          chordHint: 'F7',
          noteZh: 'diff 下一处；Cursor 上不一定稳定',
          noteEn: 'Next diff hunk; may be unreliable in Cursor'
        },
        {
          slotId: 'prevChange',
          labelZh: '上一处',
          labelEn: 'Prev change',
          phrase: '上一处',
          chordHint: 'Shift+F7',
          noteZh: 'diff 上一处；Cursor 上不一定稳定',
          noteEn: 'Prev diff hunk; may be unreliable in Cursor'
        },
        {
          slotId: 'acceptChanges',
          labelZh: '接受',
          labelEn: 'Accept',
          phrase: '接受',
          chordHint: 'Ctrl+Enter',
          gated: true,
          noteZh: 'gate 默认关；needs_input 时才高亮',
          noteEn: 'Gate off by default; only when needs_input'
        },
        {
          slotId: 'acceptAllChanges',
          labelZh: '全部接受',
          labelEn: 'Accept all',
          phrase: '全部接受',
          chordHint: 'Ctrl+Shift+Enter',
          gated: true,
          noteZh: 'gate 默认关；接受当前建议全部改动',
          noteEn: 'Gate off by default; accept all suggested changes'
        }
      ]
    }
  ];
  var activeTab = 'ime';
  var openPanels = { ime: true, key: false, voice: false, cursor: false, softPad: false, camera: false };
  var imeTabHidden = false;
  var searchQuery = '';
  /** @type {{mappingId:string,sourceChannel:string,sourceBindingRef:string,actionId:string,keyBindingRef:string,actionInstanceId?:string,actionArgs?:*,iconHtml?:string}|null} */
  var selection = null;
  var viewsCache = [];
  /** SoftPad BindingViews for the scoped app mapping (may differ from selected/global). */
  var softPadViewsCache = [];
  var softPadViewsMappingId = '';
  var bindableByAction = {};
  var bindableMappingId = '';
  var bound = false;
  var renderToken = 0;
  /** When editing global baseline: appTargetId chosen for SoftPad proxy (e.g. codex-chat). */
  var softPadScopeAppId = '';
  /** Explicit mapping pick when multiple scenarios share appTargetId. */
  var softPadScopeMappingIdOverride = '';
  /** 'none' | 'manual' | 'record' — session lock for SoftPad app scope. */
  var scopeLock = 'none';
  var autoPreselectDone = false;
  var autoPreselectHint = false;
  var scopeSessionMappingId = '';
  /** Frozen selection for in-flight key recording / wizard. */
  var recordSnap = null;
  var capturePopoverOpen = false;
  var captureReturnPanel = '';
  var capturePopoverEscapeBound = false;

  var SOFTPAD_SCOPE_PRIMARY = [
    { appTargetId: 'codex-chat', kind: 'codex', titleKey: 'softPadHubKindCodex', titleFb: 'Codex' },
    { appTargetId: 'claude-code', kind: 'claude', titleKey: 'softPadHubKindClaude', titleFb: 'Claude' },
    { appTargetId: 'cursor-chat', kind: 'cursor', titleKey: 'softPadHubKindCursor', titleFb: 'Cursor' }
  ];

  function t(k, fb) {
    if (global.OneToneI18n && global.OneToneI18n.t) {
      var v = global.OneToneI18n.t(k);
      if (v && v !== k) return v;
    }
    return fb || k;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(msg) {
    try {
      if (global.OneToneUiFeedback && global.OneToneUiFeedback.toast) {
        global.OneToneUiFeedback.toast(msg);
      }
    } catch (_) {}
  }

  function state() {
    return (global.OneToneState && global.OneToneState.state) || {};
  }

  function config() {
    return state().config || state().cfg || {};
  }

  function selectedMappingId() {
    return String(state().selectedMappingId || '').trim();
  }

  function mappingById(id) {
    var mappings = Array.isArray(config().mappings) ? config().mappings : [];
    for (var i = 0; i < mappings.length; i++) {
      if (mappings[i].id === id) return mappings[i];
    }
    return null;
  }

  function activeMapping() {
    var id = selectedMappingId();
    return id ? mappingById(id) : null;
  }

  function isAppScenarioMapping(m) {
    if (!m) return false;
    var diff = global.OneToneHabitOverrideDiff;
    if (diff && typeof diff.isAppScenarioMapping === 'function') {
      return !!diff.isAppScenarioMapping(m);
    }
    return !!String(m.appTargetId || '').trim();
  }

  function isGlobalKeysEditContext() {
    var m = activeMapping();
    if (!m) return true;
    return !isAppScenarioMapping(m);
  }

  function softPadScopePrimaryDef(appId) {
    var id = String(appId || '').trim();
    for (var i = 0; i < SOFTPAD_SCOPE_PRIMARY.length; i++) {
      if (SOFTPAD_SCOPE_PRIMARY[i].appTargetId === id) return SOFTPAD_SCOPE_PRIMARY[i];
    }
    return null;
  }

  function softPadAppTitle(appId) {
    var id = String(appId || '').trim();
    var def = softPadScopePrimaryDef(id);
    if (def) return t(def.titleKey, def.titleFb);
    var hub = global.OneToneSoftPadHub;
    if (hub && typeof hub.kindForAppId === 'function' && typeof hub.listSoftPadSchemes === 'function') {
      var kind = hub.kindForAppId(id);
      if (kind === 'workbuddy') return t('softPadHubKindWorkBuddy', 'WorkBuddy');
      if (kind === 'trae') return t('softPadHubKindTrae', 'Trae');
      if (kind === 'qoder') return t('softPadHubKindQoder', 'Qoder');
      if (kind === 'minimax') return t('softPadHubKindMinimax', 'MiniMax');
    }
    var presets = global.OneToneAppTargetPresets;
    if (presets && presets.presetById) {
      var p = presets.presetById(id);
      if (p && p.nameKey) {
        var n = t(p.nameKey);
        if (n && n !== p.nameKey) return n;
      }
      if (p && p.name) return String(p.name);
    }
    return id || t('keysSoftPadScopeApp', '应用');
  }

  function softPadAppIconSrc(appId) {
    var id = String(appId || '').trim();
    if (!id) return '';
    var presets = global.OneToneAppTargetPresets;
    if (presets && presets.presetById) {
      var p = presets.presetById(id);
      if (p && p.icon) return String(p.icon);
    }
    return '';
  }

  function softPadAppIconHtml(appId) {
    var src = softPadAppIconSrc(appId);
    if (!src) return '';
    return (
      '<img class="soft-pad-app-chip-icon" src="' +
      esc(src) +
      '" alt="" decoding="async" width="18" height="18" />'
    );
  }

  function softPadScopeChipHtml(appTargetId, title, opts) {
    opts = opts || {};
    var on = !!opts.active;
    var recordLocked = !!opts.recordLocked;
    return (
      '<button type="button" class="soft-pad-app-chip' +
      (on ? ' is-active' : '') +
      '" role="tab" data-softpad-scope-app="' +
      esc(appTargetId) +
      '" aria-selected="' +
      (on ? 'true' : 'false') +
      '"' +
      (recordLocked ? ' disabled' : '') +
      ' title="' +
      esc(title) +
      '">' +
      softPadAppIconHtml(appTargetId) +
      '<span>' +
      esc(title) +
      '</span></button>'
    );
  }

  function listScenariosForAppTargetId(appId) {
    var id = String(appId || '').trim();
    if (!id) return [];
    var list = Array.isArray(config().mappings) ? config().mappings : [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (!m || !isAppScenarioMapping(m)) continue;
      if (String(m.appTargetId || '') === id) out.push(m);
    }
    return out;
  }

  function scenarioIsEnabled(m) {
    return !!(m && m.enabled !== false);
  }

  function scenarioHasPad(m) {
    return !!(m && m.codexMicroPad);
  }

  function scenarioPadSwitchOn(m) {
    return !!(m && m.codexMicroPad && m.codexMicroPad.enabled);
  }

  /**
   * Build SoftPad scope from a concrete mapping.
   * Pad object present (even if pad.enabled=false) → ready to show/bind.
   * No pad → missingScenario (prepare only; no Options/upsert).
   */
  function scopeFromMapping(mapping, base) {
    base = base || {};
    var appId = String(
      (mapping && mapping.appTargetId) || base.appTargetId || softPadScopeAppId || ''
    ).trim();
    var def = softPadScopePrimaryDef(appId);
    var ready = scenarioHasPad(mapping);
    var mid = mapping && mapping.id ? String(mapping.id) : '';
    return {
      scopeKind: base.scopeKind || (def ? def.kind : appId || 'app'),
      sourceMappingId: mid,
      targetMappingId: ready ? mid : '',
      title:
        base.title ||
        softPadAppTitle(appId) ||
        String((mapping && mapping.name) || ''),
      globalProxy: !!base.globalProxy,
      appTargetId: appId,
      missingScenario: !ready,
      ambiguous: false,
      scenarios: Array.isArray(base.scenarios) ? base.scenarios : []
    };
  }

  function resetSoftPadScopeSession() {
    softPadScopeAppId = '';
    softPadScopeMappingIdOverride = '';
    scopeLock = 'none';
    autoPreselectDone = false;
    autoPreselectHint = false;
    recordSnap = null;
  }

  function ensureSoftPadScopeSession() {
    var mid = selectedMappingId();
    if (scopeSessionMappingId && mid && scopeSessionMappingId !== mid) {
      resetSoftPadScopeSession();
    }
    if (keysStep() !== 'target') {
      resetSoftPadScopeSession();
      scopeSessionMappingId = mid;
      return;
    }
    scopeSessionMappingId = mid;
  }

  /**
   * SoftPad read/write context. Global edit requires an explicit app scope;
   * scenario edit uses the selected mapping directly (no chip UI).
   * Hub never decides which mapping to write — only app auto-preselect.
   */
  function resolveSoftPadScope() {
    var selected = activeMapping();
    if (selected && isAppScenarioMapping(selected)) {
      var appIdSel = String(selected.appTargetId || '').trim();
      return scopeFromMapping(selected, {
        globalProxy: false,
        appTargetId: appIdSel,
        title: softPadAppTitle(appIdSel) || String(selected.name || ''),
        scenarios: []
      });
    }
    var scopeApp = String(softPadScopeAppId || '').trim();
    if (!scopeApp) return null;
    var def = softPadScopePrimaryDef(scopeApp);
    var title = softPadAppTitle(scopeApp);
    var scenarios = listScenariosForAppTargetId(scopeApp);
    var base = {
      globalProxy: true,
      appTargetId: scopeApp,
      scopeKind: def ? def.kind : scopeApp,
      title: title,
      scenarios: scenarios
    };
    var override = String(softPadScopeMappingIdOverride || '').trim();

    if (override) {
      var overrideMap = mappingById(override);
      if (overrideMap && String(overrideMap.appTargetId || '') === scopeApp) {
        return scopeFromMapping(overrideMap, base);
      }
    }

    if (!scenarios.length) {
      return {
        scopeKind: def ? def.kind : scopeApp,
        sourceMappingId: '',
        targetMappingId: '',
        title: title,
        globalProxy: true,
        appTargetId: scopeApp,
        missingScenario: true,
        ambiguous: false,
        scenarios: []
      };
    }

    if (scenarios.length === 1) {
      return scopeFromMapping(scenarios[0], base);
    }

    // ponytail: canonical pick — preset apps should have at most one enabled scenario after reconcile
    var hubCanon = global.OneToneHabitHub;
    var canonical =
      hubCanon && hubCanon.pickCanonicalAppScenario
        ? hubCanon.pickCanonicalAppScenario(scenarios)
        : null;
    if (canonical) {
      return scopeFromMapping(canonical, base);
    }

    var enabled = [];
    var i;
    for (i = 0; i < scenarios.length; i++) {
      if (scenarioIsEnabled(scenarios[i])) enabled.push(scenarios[i]);
    }
    if (enabled.length === 1) {
      return scopeFromMapping(enabled[0], base);
    }
    // Legacy fallback only — normal data should not reach ambiguous after reconcile.
    return {
      scopeKind: def ? def.kind : scopeApp,
      sourceMappingId: '',
      targetMappingId: '',
      title: title,
      globalProxy: true,
      appTargetId: scopeApp,
      missingScenario: false,
      ambiguous: true,
      scenarios: scenarios
    };
  }

  function softPadWorkMapping() {
    var ctx = resolveSoftPadScope();
    if (!ctx || !ctx.targetMappingId) return null;
    return mappingById(ctx.targetMappingId);
  }

  function softPadWorkMappingId() {
    var ctx = resolveSoftPadScope();
    return ctx && ctx.targetMappingId ? String(ctx.targetMappingId) : '';
  }

  function softPadAuthorityReady(mappingId) {
    var mid = String(mappingId || '').trim();
    if (!mid) return false;
    return softPadViewsMappingId === mid && bindableMappingId === mid;
  }

  function softPadAuthorityPending(mappingId) {
    var mid = String(mappingId || '').trim();
    if (!mid) return false;
    return !softPadAuthorityReady(mid);
  }

  function canRecordSoftPadSelection(ctx) {
    var mid = String((ctx && ctx.targetMappingId) || '');
    return !!(
      selection &&
      selection.sourceChannel === 'softPad' &&
      selection.mappingId === mid &&
      softPadAuthorityReady(mid) &&
      bindableMappingId === mid &&
      bindableByAction[selection.actionId] === true
    );
  }

  function setSoftPadScopeAppId(appId, opts) {
    opts = opts || {};
    if (scopeLock === 'record' && !opts.force) {
      toast(t('keysSoftPadScopeRecordLocked', '录制中不可切换应用作用域'));
      return;
    }
    softPadScopeAppId = String(appId || '').trim();
    softPadScopeMappingIdOverride = '';
    if (opts.fromAuto) {
      autoPreselectHint = true;
    } else {
      scopeLock = 'manual';
      autoPreselectHint = false;
      autoPreselectDone = true;
    }
    if (!(opts && opts.skipClear)) clearSelection({ skipRender: true, skipHero: true });
    if (!(opts && opts.skipRender)) {
      if (opts && opts.refresh) refresh();
      else renderPanelOnly();
    }
    if (!(opts && opts.skipHero)) applyHero();
  }

  function setSoftPadScopeMappingOverride(mappingId, opts) {
    opts = opts || {};
    if (scopeLock === 'record' && !opts.force) {
      toast(t('keysSoftPadScopeRecordLocked', '录制中不可切换应用作用域'));
      return;
    }
    softPadScopeMappingIdOverride = String(mappingId || '').trim();
    scopeLock = 'manual';
    autoPreselectHint = false;
    autoPreselectDone = true;
    if (!(opts && opts.skipClear)) clearSelection({ skipRender: true, skipHero: true });
    if (!(opts && opts.skipRender)) {
      if (opts.refresh) refresh();
      else renderPanelOnly();
    }
    if (!(opts && opts.skipHero)) applyHero();
  }

  function isKnownSoftPadAppTargetId(appId) {
    var id = String(appId || '').trim();
    if (!id || id === 'custom') return false;
    var presets = global.OneToneAppTargetPresets;
    if (presets && presets.isWorkflowAppTarget && presets.isWorkflowAppTarget(id)) return true;
    if (presets && presets.presetById && presets.presetById(id)) return true;
    return !!softPadScopePrimaryDef(id);
  }

  function maybeAutoPreselectSoftPadScope() {
    if (!isGlobalKeysEditContext()) return false;
    if (!openPanels.softPad) return false;
    if (String(softPadScopeAppId || '').trim()) return false;
    if (scopeLock !== 'none') return false;
    if (autoPreselectDone) return false;
    autoPreselectDone = true;
    var hub = global.OneToneSoftPadHub;
    var fg = '';
    if (hub && typeof hub.getFreshForegroundAppId === 'function') {
      fg = String(hub.getFreshForegroundAppId() || '').trim();
    }
    if (fg && isKnownSoftPadAppTargetId(fg)) {
      softPadScopeAppId = fg;
      softPadScopeMappingIdOverride = '';
      autoPreselectHint = true;
      return true;
    }
    // Fallback: first primary app with an enabled mapping that has a pad, else Codex.
    var i;
    for (i = 0; i < SOFTPAD_SCOPE_PRIMARY.length; i++) {
      var appId = SOFTPAD_SCOPE_PRIMARY[i].appTargetId;
      var sc = listScenariosForAppTargetId(appId);
      var hasReady = false;
      var j;
      for (j = 0; j < sc.length; j++) {
        if (scenarioIsEnabled(sc[j]) && scenarioHasPad(sc[j])) {
          hasReady = true;
          break;
        }
      }
      if (hasReady) {
        softPadScopeAppId = appId;
        softPadScopeMappingIdOverride = '';
        autoPreselectHint = false;
        return true;
      }
    }
    softPadScopeAppId = 'codex-chat';
    softPadScopeMappingIdOverride = '';
    autoPreselectHint = false;
    return true;
  }

  /** Ensure SoftPad tab always has an app scope so the pad stage can render. */
  function ensureSoftPadDefaultScope() {
    if (!isGlobalKeysEditContext()) return false;
    if (!openPanels.softPad) return false;
    if (String(softPadScopeAppId || '').trim()) return false;
    if (scopeLock === 'manual' || scopeLock === 'record') return false;
    if (!autoPreselectDone) return maybeAutoPreselectSoftPadScope();
    // auto already ran and left empty (should not happen) — force Codex
    softPadScopeAppId = 'codex-chat';
    softPadScopeMappingIdOverride = '';
    return true;
  }

  function keysStep() {
    try {
      if (global.OneToneKeysPageState && global.OneToneKeysPageState.getStep) {
        return String(global.OneToneKeysPageState.getStep() || 'trigger');
      }
    } catch (_) {}
    return 'trigger';
  }

  function finishSendMode() {
    var cfg = config();
    var end = cfg.voiceEnd || cfg.voice_end || {};
    return String(end.sendMode || end.send_mode || 'manual').toLowerCase();
  }

  function canonicalActionId(raw) {
    if (global.OneToneAgentActions && global.OneToneAgentActions.resolveCanonicalActionId) {
      return global.OneToneAgentActions.resolveCanonicalActionId(raw, finishSendMode());
    }
    return String(raw || '').trim();
  }

  function isSemanticKeyAction(actionId) {
    var id = String(actionId || '').trim();
    if (!id) return false;
    if (id.indexOf('.') >= 0) return true;
    return id === 'app.shortcut' || id === 'app.open';
  }

  function defaultChordForSlot(slotId) {
    var A = global.OneToneAgentActions;
    var id = String(slotId || '').trim();
    if (!id) return '';
    if (A && typeof A.defaultKeyForSlot === 'function') {
      return String(A.defaultKeyForSlot(id) || '').trim();
    }
    if (A && A.DEFAULT_KEY_BY_SLOT) {
      return String(A.DEFAULT_KEY_BY_SLOT[id] || '').trim();
    }
    return '';
  }

  function actionIdFromSlot(slotId) {
    var sid = String(slotId || '').trim();
    if (!sid) return '';
    if (sid === 'stopOrSend') return canonicalActionId('stopOrSendDictation');
    var A = global.OneToneAgentActions;
    var slot = A && A.slotById ? A.slotById(sid) : null;
    var raw = slot ? String(slot.actionId || sid) : sid;
    if (raw === 'stopOrSendDictation' || raw === 'stopOrSend') {
      return canonicalActionId('stopOrSendDictation');
    }
    return canonicalActionId(raw);
  }

  function keyBindingOnSlot(m, slotId) {
    if (!m || !slotId) return null;
    var list = m.agentBindings || [];
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (b && b.slotId === slotId && b.triggerType === 'key') return b;
    }
    return null;
  }

  function friendlyChord(chord) {
    var raw = String(chord || '').trim();
    if (!raw) return '';
    try {
      var hooks = global.__vp_mapping_recording_hooks__;
      if (hooks && hooks.friendlyKeyName) return hooks.friendlyKeyName(raw);
    } catch (_) {}
    return raw;
  }

  function normalizeChord(chord) {
    return String(chord || '')
      .trim()
      .toLowerCase()
      .replace(/\s*\+\s*/g, '+')
      .replace(/\s+/g, '');
  }

  function actionLabel(actionId) {
    var store = global.OneToneSemanticActionStore;
    if (store && store.entryMeta) {
      var meta = store.entryMeta(actionId);
      if (meta) {
        var lang = (global.OneToneI18n && global.OneToneI18n.lang) || 'zh';
        if (lang === 'en' && meta.labelEn) return meta.labelEn;
        if (meta.labelZh) return meta.labelZh;
        if (meta.label_zh) return meta.label_zh;
        if (meta.labelEn) return meta.labelEn;
      }
    }
    var A = global.OneToneAgentActions;
    if (A && A.resolveCanonicalActionId && A.actionById) {
      var legacy = A.actionById(String(actionId || '').split('.').pop());
      if (legacy) {
        var en = ((global.OneToneI18n && global.OneToneI18n.lang) || 'zh') === 'en';
        return en ? legacy.labelEn || legacy.labelZh : legacy.labelZh || legacy.labelEn;
      }
    }
    return String(actionId || '').trim() || '—';
  }

  function gestureLabel(ref) {
    var map = {
      onAway: 'keysChannelGestureOnAway',
      onReturn: 'keysChannelGestureOnReturn',
      shakeHead: 'keysChannelGestureShakeHead',
      deliberateBlink: 'keysChannelGestureDeliberateBlink',
      openPalm: 'keysChannelGestureOpenPalm',
      okHand: 'keysChannelGestureOkHand',
      fist: 'keysChannelGestureFist',
      wave: 'keysChannelGestureWave'
    };
    var key = map[ref];
    return key ? t(key, ref) : String(ref || '');
  }

  function channelOnlyLabel(channel) {
    var name =
      channel === 'voice'
        ? t('keysChannelTabVoice', '语音命令')
        : channel === 'softPad'
          ? t('keysChannelTabSoftPad', '虚拟键盘')
          : t('keysChannelTabCamera', '摄像头操作');
    return t('keysChannelKeyOnly', '仅{channel}可用').replace('{channel}', name);
  }

  function viewRef(v) {
    return String((v && (v.bindingRef || v.binding_ref)) || '').trim();
  }

  function viewChannel(v) {
    return String((v && v.channel) || '').trim();
  }

  function viewActionId(v) {
    return canonicalActionId((v && (v.actionId || v.action_id)) || '');
  }

  function viewTrigger(v) {
    return String((v && v.trigger) || '').trim();
  }

  function findKeyBinding(m, actionId, actionInstanceId) {
    if (!m) return null;
    var want = canonicalActionId(actionId);
    var wantInst = String(actionInstanceId || '').trim();
    var multi =
      global.OneToneActionBindingAdapters &&
      global.OneToneActionBindingAdapters.isMultiInstance &&
      global.OneToneActionBindingAdapters.isMultiInstance(want);
    var list = m.agentBindings || [];
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b || b.triggerType !== 'key') continue;
      if (canonicalActionId(b.actionId) !== want) continue;
      if (multi) {
        if (wantInst && String(b.actionInstanceId || '') === wantInst) return b;
        continue;
      }
      return b;
    }
    return null;
  }

  function softPadViewsForResolve(mappingId) {
    var mid = String(mappingId || softPadWorkMappingId() || '').trim();
    var rows = [];
    if (mid && softPadViewsMappingId === mid) rows = softPadViewsCache;
    else if (mid && selectedMappingId() === mid) rows = viewsCache;
    return (rows || []).filter(function (v) {
      return viewChannel(v) === 'softPad' && v.enabled !== false;
    });
  }

  function routeOnPad(pad, microKeyId) {
    if (!pad || !Array.isArray(pad.keys) || !microKeyId) return null;
    for (var i = 0; i < pad.keys.length; i++) {
      if (pad.keys[i] && pad.keys[i].microKeyId === microKeyId) return pad.keys[i];
    }
    return null;
  }

  function findAgentBindingPreferSoftPad(m, slotId) {
    if (!m || !slotId) return null;
    var list = m.agentBindings || [];
    var soft = null;
    var key = null;
    var any = null;
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b || b.slotId !== slotId) continue;
      if (b.triggerType === 'softPad' && !soft) soft = b;
      else if (b.triggerType === 'key' && !key) key = b;
      else if (!any) any = b;
    }
    return soft || key || any;
  }

  /**
   * Resolve a Soft Pad microKey to a key-channel-migratable action.
   * sourceBindingRef must stay microKeyId; keyBindingRef only from findKeyBinding.
   * opts.skipBindable: peek actionId before Options map is loaded.
   */
  function resolveMigratableAction(m, microKeyId, opts) {
    var mid = String(microKeyId || '').trim();
    if (!mid || mid === 'ENC' || mid === 'JOY' || /^NAV_/.test(mid)) return null;
    if (/^NPAD_/.test(mid) || /^NUM_/.test(mid)) return null;

    var workMid = String((m && m.id) || '').trim();
    if (!(opts && opts.skipBindable) && softPadAuthorityPending(workMid)) return null;
    var views = softPadViewsForResolve(workMid);
    var v = null;
    var i;
    for (i = 0; i < views.length; i++) {
      if (viewRef(views[i]) === mid) {
        v = views[i];
        break;
      }
    }
    if (!v) {
      for (i = 0; i < views.length; i++) {
        if (viewTrigger(views[i]) === mid) {
          v = views[i];
          break;
        }
      }
    }

    var pad = m && m.codexMicroPad;
    var route = routeOnPad(pad, mid);
    var slotId =
      route && route.enabled !== false ? String(route.slotId || '').trim() : '';

    if (!v && slotId) {
      for (i = 0; i < views.length; i++) {
        if (viewRef(views[i]) === slotId) {
          v = views[i];
          break;
        }
      }
    }

    var actionId = '';
    var sourceBinding = null;
    if (v) {
      actionId = viewActionId(v);
      var vRef = viewRef(v);
      sourceBinding = findAgentBindingPreferSoftPad(m, vRef);
      if (!sourceBinding && slotId && slotId !== vRef) {
        sourceBinding = findAgentBindingPreferSoftPad(m, slotId);
      }
      // Projection views use microKeyId as bindingRef; args live on key binding at route.slotId.
      if ((!sourceBinding || sourceBinding.triggerType === 'key') && slotId) {
        var bySlot = findAgentBindingPreferSoftPad(m, slotId);
        if (bySlot) sourceBinding = bySlot;
      }
    }

    if (!actionId && slotId) {
      sourceBinding = findAgentBindingPreferSoftPad(m, slotId);
      if (sourceBinding) actionId = canonicalActionId(sourceBinding.actionId);
    }

    if (!actionId && slotId) {
      actionId = actionIdFromSlot(slotId);
    }

    actionId = canonicalActionId(actionId);
    if (!actionId && !slotId) return null;

    var actionInstanceId = '';
    var actionArgs = null;

    if (sourceBinding) {
      var srcAid = canonicalActionId(sourceBinding.actionId);
      if (isSemanticKeyAction(srcAid)) {
        actionId = srcAid;
        actionInstanceId = String(sourceBinding.actionInstanceId || '').trim();
        actionArgs = sourceBinding.actionArgs != null ? sourceBinding.actionArgs : null;
      }
    }

    // Legacy Soft Pad hotkey slots → app.shortcut + default/output chord.
    if (!isSemanticKeyAction(actionId)) {
      if (!slotId) return null;
      var chord = '';
      var keyOnSlot = keyBindingOnSlot(m, slotId);
      if (keyOnSlot) {
        chord = String(keyOnSlot.triggerBinding || '').trim();
      }
      if (!chord) chord = defaultChordForSlot(slotId);
      if (!chord) {
        var slotted = actionIdFromSlot(slotId);
        if (isSemanticKeyAction(slotted)) {
          actionId = slotted;
        } else {
          return null;
        }
      } else {
        actionId = 'app.shortcut';
        actionInstanceId = 'softpad-mig:' + mid;
        actionArgs = { chord: chord };
      }
    }

    if (!(opts && opts.skipBindable) && bindableByAction[actionId] === false) {
      return null;
    }

    var keyB = findKeyBinding(m, actionId, actionInstanceId);
    return {
      microKeyId: mid,
      actionId: actionId,
      actionInstanceId: actionInstanceId,
      actionArgs: actionArgs,
      keyBindingRef: keyB ? String(keyB.slotId || '') : '',
      uiIconId: route ? String(route.uiIconId || '').trim() : '',
      sourceTriggerType: sourceBinding ? String(sourceBinding.triggerType || '') : ''
    };
  }

  /** Non-mutating Soft Pad preview (never call ensurePad). */
  function previewPadClone(m) {
    var src = m && m.codexMicroPad;
    if (src && typeof src === 'object') {
      return Object.assign({}, src, {
        enabled: true,
        keys: Array.isArray(src.keys) ? src.keys.slice() : []
      });
    }
    return { enabled: true, keys: [], skin: '' };
  }

  function findMicroKeyForSlotLocal(m, slotId) {
    var pad = m && m.codexMicroPad;
    if (!pad || !Array.isArray(pad.keys) || !slotId) return '';
    for (var i = 0; i < pad.keys.length; i++) {
      var k = pad.keys[i];
      if (k && k.enabled !== false && k.slotId === slotId) return String(k.microKeyId || '');
    }
    return '';
  }

  function findChordConflict(m, chord, excludeSlotId) {
    var cap = global.OneToneAgentCapabilityUi;
    if (cap && cap.findChordConflict) {
      return cap.findChordConflict(m, chord, excludeSlotId || '');
    }
    var norm = normalizeChord(chord);
    if (!norm || !m) return null;
    var list = m.agentBindings || [];
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b || b.triggerType !== 'key' || b.enabled === false) continue;
      if (excludeSlotId && b.slotId === excludeSlotId) continue;
      if (normalizeChord(b.triggerBinding) === norm) {
        return { kind: 'capability', slotId: b.slotId, label: b.slotId };
      }
    }
    if (normalizeChord(m.triggerKey) === norm) {
      return { kind: 'trigger', label: t('codexCapConflictTrigger', '触发键') };
    }
    if (normalizeChord(m.targetKey) === norm) {
      return { kind: 'ime', label: t('codexCapConflictIme', '语音识别键') };
    }
    return null;
  }

  function getSelection() {
    return selection;
  }

  function hasSelection() {
    return !!(selection && selection.mappingId && selection.actionId);
  }

  function clearSelection(opts) {
    var had = !!selection;
    selection = null;
    if (had && !(opts && opts.skipPersist)) {
      persistHeroCapture(defaultCaptureHeroRef());
    }
    if (had && !(opts && opts.skipHero)) applyHero();
    if (had && !(opts && opts.skipRender)) renderPanelOnly();
    if (had && global.OneToneCodexMicroPadUi && global.OneToneCodexMicroPadUi.notifySelection) {
      try {
        global.OneToneCodexMicroPadUi.notifySelection('');
      } catch (_) {}
    }
  }

  function setSelection(next, opts) {
    selection = next
      ? {
          mappingId: String(next.mappingId || ''),
          sourceChannel: String(next.sourceChannel || ''),
          sourceBindingRef: String(next.sourceBindingRef || ''),
          actionId: String(next.actionId || ''),
          keyBindingRef: String(next.keyBindingRef || ''),
          actionInstanceId: String(next.actionInstanceId || ''),
          actionArgs: next.actionArgs != null ? next.actionArgs : null,
          iconHtml: next.iconHtml != null ? String(next.iconHtml) : ''
        }
      : null;
    if (next && !(opts && opts.skipPersist)) {
      persistHeroCapture(selectionToHeroRef(selection));
    }
    if (!(opts && opts.skipHero)) applyHero();
    if (!(opts && opts.skipRender)) renderPanelOnly();
  }

  /** Codex chip bridge: sourceBindingRef is microKeyId only; keyBindingRef from key binding. */
  function selectFromSlotId(mappingId, slotId) {
    var mid = String(mappingId || selectedMappingId() || '').trim();
    var sid = String(slotId || '').trim();
    if (!mid || !sid) {
      clearSelection();
      return;
    }
    var m = mappingById(mid);
    var microId = findMicroKeyForSlotLocal(m, sid);
    if (microId) {
      var resolved = resolveMigratableAction(m, microId);
      if (resolved) {
        setSelection({
          mappingId: mid,
          sourceChannel: 'softPad',
          sourceBindingRef: microId,
          actionId: resolved.actionId,
          keyBindingRef: resolved.keyBindingRef || '',
          actionInstanceId: resolved.actionInstanceId || '',
          actionArgs: resolved.actionArgs
        });
        return;
      }
    }
    var keyB = null;
    var list = (m && m.agentBindings) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].slotId === sid && list[i].triggerType === 'key') {
        keyB = list[i];
        break;
      }
    }
    var actionId = keyB
      ? canonicalActionId(keyB.actionId)
      : (function () {
          var A = global.OneToneAgentActions;
          var slot = A && A.slotById ? A.slotById(sid) : null;
          return slot ? canonicalActionId(slot.actionId) : '';
        })();
    if (!actionId || !keyB) {
      clearSelection();
      return;
    }
    setSelection({
      mappingId: mid,
      sourceChannel: 'softPad',
      sourceBindingRef: '',
      actionId: actionId,
      keyBindingRef: String(keyB.slotId || ''),
      actionInstanceId: String(keyB.actionInstanceId || ''),
      actionArgs: keyB.actionArgs != null ? keyB.actionArgs : null
    });
  }

  function selectedSlotId() {
    if (!selection) return '';
    return selection.keyBindingRef || '';
  }

  function syncSelectionToMapping(mid) {
    mid = String(mid || selectedMappingId() || '').trim();
    if (!selection) return;
    if (selection.mappingId === mid) return;
    var ctx = resolveSoftPadScope();
    if (ctx && ctx.targetMappingId && selection.mappingId === ctx.targetMappingId) {
      return;
    }
    loadHeroCaptureFromMapping(mappingById(mid));
  }

  function defaultCaptureHeroRef() {
    var coreApi = global.OneToneMappingCore;
    if (coreApi && coreApi.defaultCaptureHeroRef) return coreApi.defaultCaptureHeroRef();
    return { channel: 'key', bindingRef: 'ime', actionId: '', actionInstanceId: '', kind: 'ime' };
  }

  function normalizeCaptureHeroRef(ref) {
    var coreApi = global.OneToneMappingCore;
    if (coreApi && coreApi.normalizeCaptureHeroRef) return coreApi.normalizeCaptureHeroRef(ref);
    return defaultCaptureHeroRef();
  }

  function captureHeroRefForMapping(m) {
    var coreApi = global.OneToneMappingCore;
    if (coreApi && coreApi.captureHeroRefForMapping) return coreApi.captureHeroRefForMapping(m);
    return defaultCaptureHeroRef();
  }

  function isDefaultCaptureHeroRef(ref) {
    var coreApi = global.OneToneMappingCore;
    if (coreApi && coreApi.isDefaultCaptureHeroRef) return coreApi.isDefaultCaptureHeroRef(ref);
    ref = normalizeCaptureHeroRef(ref);
    return ref.kind === 'ime' && !ref.actionId;
  }

  function isCommandChannel(ch) {
    return ch === 'voice' || ch === 'cursor' || ch === 'softPad' || ch === 'camera';
  }

  function isChannelOpen(ch) {
    return !!openPanels[ch];
  }

  function hasAnyOpenPanel() {
    var i;
    for (i = 0; i < TABS.length; i++) {
      if (openPanels[TABS[i]]) return true;
    }
    return false;
  }

  function firstOpenChannel() {
    var i;
    for (i = 0; i < TABS.length; i++) {
      if (openPanels[TABS[i]]) return TABS[i];
    }
    return 'ime';
  }

  function syncOpenChrome() {
    var i;
    for (i = 0; i < TABS.length; i++) {
      openPanels[TABS[i]] = TABS[i] === activeTab;
    }
    if (imeTabHidden) openPanels.ime = false;
    var tabs = document.getElementById('keysChannelSubtabs');
    if (tabs) {
      tabs.querySelectorAll('[data-channel]').forEach(function (btn) {
        var on = btn.getAttribute('data-channel') === activeTab;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }
    var imeTab = document.getElementById('keysChannelTabIme');
    if (imeTab) imeTab.classList.toggle('is-codex-hidden', imeTabHidden);
    var imeStrip = document.getElementById('keysImeStripWrap');
    if (imeStrip) imeStrip.hidden = activeTab !== 'ime' || imeTabHidden;
    var onImeOrKey = activeTab === 'ime' || activeTab === 'key';
    var keyPanel = document.getElementById('keysCaptureKeyPanel');
    if (keyPanel) keyPanel.hidden = !onImeOrKey;
    var heroCard = document.getElementById('keysCaptureHeroCard');
    if (heroCard) heroCard.hidden = !onImeOrKey;
    var zone = document.getElementById('keysCaptureKeycapZone');
    if (zone) zone.hidden = !onImeOrKey;
    var panel = document.getElementById('keysChannelPanel');
    if (panel) panel.hidden = false;
  }

  function channelTabLabel(ch) {
    var map = {
      key: 'keysChannelTabKey',
      voice: 'keysChannelTabVoice',
      cursor: 'keysChannelTabCursor',
      softPad: 'keysChannelTabSoftPad',
      camera: 'keysChannelTabCamera',
      ime: 'keysChannelTabIme'
    };
    return t(map[ch] || ch, ch);
  }

  function selectionToHeroRef(sel) {
    if (!sel) return defaultCaptureHeroRef();
    var kind = 'action';
    if (sel.sourceChannel === 'camera') kind = 'gesture';
    else if (sel.sourceChannel === 'ime') kind = 'imePreset';
    else if (sel.sourceChannel === 'key' && !sel.actionId) kind = 'ime';
    return {
      channel: String(sel.sourceChannel || 'voice'),
      bindingRef: String(sel.sourceBindingRef || ''),
      actionId: String(sel.actionId || ''),
      actionInstanceId: String(sel.actionInstanceId || ''),
      kind: kind
    };
  }

  function heroRefMatches(ref, opts) {
    ref = normalizeCaptureHeroRef(ref);
    opts = opts || {};
    if (opts.kind === 'ime' || (opts.channel === 'key' && !opts.actionId)) {
      return isDefaultCaptureHeroRef(ref);
    }
    return (
      ref.channel === opts.channel &&
      ref.bindingRef === opts.bindingRef &&
      ref.actionId === opts.actionId &&
      String(ref.actionInstanceId || '') === String(opts.actionInstanceId || '')
    );
  }

  function persistHeroCapture(ref, mid) {
    mid = String(mid || selectedMappingId() || '').trim();
    var m = mappingById(mid);
    if (!m) return;
    var norm = normalizeCaptureHeroRef(ref);
    var coreApi = global.OneToneMappingCore;
    if (coreApi && coreApi.setCaptureHeroRef) coreApi.setCaptureHeroRef(m, norm);
    else if (isDefaultCaptureHeroRef(norm)) m.captureHeroRef = null;
    else m.captureHeroRef = norm;
  }

  function captureRefToSelection(ref, mid) {
    ref = normalizeCaptureHeroRef(ref);
    mid = String(mid || selectedMappingId() || '').trim();
    if (!mid || isDefaultCaptureHeroRef(ref)) return null;
    return {
      mappingId: mid,
      sourceChannel: ref.channel,
      sourceBindingRef: ref.bindingRef,
      actionId: ref.actionId,
      actionInstanceId: ref.actionInstanceId || '',
      keyBindingRef: '',
      actionArgs: null,
      iconHtml: ''
    };
  }

  function loadHeroCaptureFromMapping(m) {
    m = m || mappingById(selectedMappingId());
    if (!m) {
      selection = null;
      return;
    }
    selection = captureRefToSelection(captureHeroRefForMapping(m), m.id);
    if (selection) {
      var keyB = findKeyBinding(m, selection.actionId, selection.actionInstanceId);
      if (keyB) selection.keyBindingRef = String(keyB.slotId || '');
    }
  }

  function resolveHeroCapture(m) {
    m = m || mappingById(selectedMappingId());
    if (!m) {
      return {
        kind: 'ime',
        active: false,
        primaryLabel: '',
        secondaryLabel: '',
        badge: t('keysHeroModeIme', '输入法识别键'),
        chord: '',
        empty: true,
        channel: 'key',
        channelLabel: channelTabLabel('key'),
        targetLabel: '',
        targetEmpty: true,
        actionId: '',
        sourceChannel: 'key',
        iconHtml: ''
      };
    }
    var ref = captureHeroRefForMapping(m);
    var bootHooks = global.__vp_mapping_core_hooks__ || {};
    var friendly = bootHooks.friendlyKeyName || function (k) {
      return k;
    };
    if (isDefaultCaptureHeroRef(ref)) {
      var coreApi = global.OneToneMappingCore;
      var tgt =
        coreApi && coreApi.editorTarget
          ? String(coreApi.editorTarget(m) || '').trim()
          : String(m.targetKey || '').trim();
      var fl = tgt ? friendly(tgt) || tgt : t('badgeNotRecorded', '未设置');
      return {
        kind: 'ime',
        active: false,
        primaryLabel: fl,
        secondaryLabel: '',
        badge: t('keysHeroModeIme', '输入法识别键'),
        chord: tgt,
        empty: !tgt,
        channel: 'key',
        channelLabel: channelTabLabel('key'),
        targetLabel: fl,
        targetEmpty: !tgt,
        actionId: '',
        sourceChannel: 'key',
        iconHtml: ''
      };
    }
    var label = actionLabel(ref.actionId) || ref.bindingRef;
    if (ref.kind === 'imePreset') {
      var preset =
        global.OneToneImePresets && global.OneToneImePresets.presetById
          ? global.OneToneImePresets.presetById(ref.bindingRef)
          : null;
      label =
        preset && preset.nameKey
          ? t(preset.nameKey)
          : ref.bindingRef || t('keysHeroModeIme', '输入法识别键');
    }
    var ctx = resolveSoftPadScope();
    var scopeTitle =
      ref.channel === 'softPad' && ctx && ctx.title ? String(ctx.title) : '';
    if (scopeTitle) label = scopeTitle + ' · ' + label;
    var keyB = findKeyBinding(m, ref.actionId, ref.actionInstanceId);
    var chord = keyB ? String(keyB.triggerBinding || '').trim() : '';
    var primary = chord ? (friendly(chord) || chord) + ' · ' + label : label;
    var badge = channelTabLabel(ref.channel);
    if (chord || ref.kind === 'action') {
      badge = badge + ' · ' + t('keysHeroModeAction', '动作快捷键');
    }
    return {
      kind: ref.kind,
      active: true,
      primaryLabel: primary,
      secondaryLabel: label,
      badge: badge,
      chord: chord,
      empty: !label && !chord,
      channel: ref.channel,
      channelLabel: channelTabLabel(ref.channel),
      targetLabel: primary,
      targetEmpty: !chord && !label,
      actionId: ref.actionId,
      sourceChannel: ref.channel,
      iconHtml: '',
      scopeTitle: scopeTitle
    };
  }

  function syncCaptureHeroDisplay() {
    var m = mappingById(selectedMappingId());
    var cap = resolveHeroCapture(m);
    var popBadge = document.getElementById('keysCaptureKeycapBadge');
    var zone = document.getElementById('keysCaptureKeycapZone');
    if (popBadge) popBadge.textContent = cap.badge || t('keysHeroModeIme', '输入法识别键');
    if (zone) {
      zone.classList.toggle(
        'is-hero-mapped',
        isDefaultCaptureHeroRef(captureHeroRefForMapping(m))
      );
    }
  }

  function syncCaptureRecordChrome() {
    var table = global.OneToneHabitKeyMappingTable;
    // Hero card stays mounted for both 输入法 and 自定义键 so selecting an IME
    // never blanks the key + finish options.
    if (keysStep() === 'target' && (activeTab === 'key' || activeTab === 'ime')) {
      if (table && table.mountTargetRecordToCapture) table.mountTargetRecordToCapture();
    } else if (table && table.restoreTargetRecordFromStash) {
      table.restoreTargetRecordFromStash();
    }
    if (table && table.syncCaptureRecordingChrome) {
      try {
        table.syncCaptureRecordingChrome();
      } catch (_) {}
    }
    syncCaptureHeroDisplay();
    if (global.OneToneKeysPanelUi && global.OneToneKeysPanelUi.syncRecordButtons) {
      try {
        global.OneToneKeysPanelUi.syncRecordButtons();
      } catch (_) {}
    }
    if (global.OneToneMappingEditorChrome && global.OneToneMappingEditorChrome.updatePrimaryCTA) {
      try {
        global.OneToneMappingEditorChrome.updatePrimaryCTA();
      } catch (_) {}
    }
  }

  function onStepChange(step) {
    ensureSoftPadScopeSession();
    if (String(step || '') !== 'target') {
      closeCapturePopover({ keepPanel: true, skipStep: true });
    } else {
      bindOnce();
      capturePopoverOpen = true;
      loadHeroCaptureFromMapping();
      syncCaptureRecordChrome();
      refresh();
      renderKeyFinishHosts();
    }
  }

  function isCapturePopoverOpen() {
    return keysStep() === 'target' || !!capturePopoverOpen;
  }

  function isCaptureSheetOpen() {
    return isCapturePopoverOpen();
  }

  function bindCapturePopoverEscape() {
    if (capturePopoverEscapeBound) return;
    capturePopoverEscapeBound = true;
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape' || !capturePopoverOpen) return;
      ev.preventDefault();
      closeCapturePopover({});
    });
  }

  function renderKeyFinishHosts() {
    try {
      if (
        global.OneToneKeyFinishFlowRender &&
        global.OneToneKeyFinishFlowRender.renderKeyFinishFlowPanel
      ) {
        global.OneToneKeyFinishFlowRender.renderKeyFinishFlowPanel();
      }
    } catch (_) {}
  }

  function openCapturePopover(opts) {
    opts = opts || {};
    bindOnce();
    var drawer = global.OneToneSettingsDrawer;
    var ui = global.OneToneState && global.OneToneState.ui;
    var curPanel =
      ui && ui.settingsPanel
        ? String(global.OneToneSettingsDrawer && global.OneToneSettingsDrawer.normalizePanel
            ? global.OneToneSettingsDrawer.normalizePanel(ui.settingsPanel)
            : ui.settingsPanel)
        : '';
    if (opts.returnPanel) {
      captureReturnPanel = String(opts.returnPanel);
    } else if (curPanel && curPanel !== 'keys' && !captureReturnPanel) {
      captureReturnPanel = curPanel;
    }
    if (drawer && drawer.setPanel) {
      try {
        drawer.setPanel('keys', opts.drawerOpts || {});
      } catch (_) {}
    }
    if (!opts.skipStep && global.OneToneKeysPageState && global.OneToneKeysPageState.setStep) {
      try {
        global.OneToneKeysPageState.setStep('target', {
          skipSheet: true,
          skipOpenSheet: true,
          skipScroll: !!opts.skipScroll
        });
      } catch (_) {}
    }
    capturePopoverOpen = true;
    loadHeroCaptureFromMapping();
    bindCapturePopoverEscape();
    if (opts.tab && TABS.indexOf(opts.tab) >= 0) {
      setActiveTab(opts.tab, { skipRender: false });
    } else {
      renderPanelOnly();
    }
    refresh();
    if (opts.expandFinishMore) {
      var more = document.getElementById('habitFlowFinishMore');
      if (more) more.open = true;
    }
    renderKeyFinishHosts();
    syncCaptureRecordChrome();
  }

  function closeCapturePopover(opts) {
    opts = opts || {};
    var pop = document.getElementById('keysCapturePopover');
    var backdrop = document.getElementById('keysCapturePopoverBackdrop');
    if (pop) pop.hidden = true;
    if (backdrop) backdrop.hidden = true;
    capturePopoverOpen = false;
    loadHeroCaptureFromMapping();
    if (!opts.skipStep && global.OneToneKeysPageState && global.OneToneKeysPageState.setStep) {
      try {
        global.OneToneKeysPageState.setStep('target', {
          skipSheet: true,
          skipOpenSheet: true,
          skipScroll: true
        });
      } catch (_) {}
    }
    var ret = captureReturnPanel;
    captureReturnPanel = '';
    syncCaptureRecordChrome();
    if (!opts.keepPanel && ret && ret !== 'keys') {
      var drawer = global.OneToneSettingsDrawer;
      if (drawer && drawer.setPanel) {
        try {
          drawer.setPanel(ret);
        } catch (_) {}
      }
    }
    applyHero();
  }

  function openCaptureSheet(opts) {
    openCapturePopover(opts);
  }

  function closeCaptureSheet(opts) {
    closeCapturePopover(opts);
  }

  function syncCaptureEntrySummary() {}

  function syncImeTabChrome() {
    syncOpenChrome();
    if (openPanels.ime) syncImeHeroMarkers();
  }

  function heroModel() {
    var cap = resolveHeroCapture();
    return {
      active: !!cap.active,
      actionId: cap.actionId || '',
      chord: cap.chord || '',
      targetLabel: cap.targetLabel || cap.primaryLabel || '',
      targetEmpty: !!cap.targetEmpty,
      iconHtml: cap.iconHtml || '',
      sourceChannel: cap.sourceChannel || cap.channel || '',
      scopeTitle: cap.scopeTitle || '',
      badge: cap.badge || '',
      channelLabel: cap.channelLabel || ''
    };
  }

  function syncActionIconHost(iconHtml) {
    var iconHost = document.getElementById('keysTargetActionIconHost');
    if (!iconHost) return;
    var html = String(iconHtml || '').trim();
    if (html) {
      iconHost.innerHTML = html;
      iconHost.hidden = false;
      iconHost.setAttribute('aria-hidden', 'false');
    } else {
      iconHost.innerHTML = '';
      iconHost.hidden = true;
      iconHost.setAttribute('aria-hidden', 'true');
    }
  }

  function syncImeStay() {
    var el = document.getElementById('keysImeStay');
    if (!el) return;
    var hm = heroModel();
    var show = !!(selection && hm.active);
    if (!show) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    var mid = selectedMappingId();
    var m = mappingById(mid) || activeMapping();
    var chord = m ? String(m.targetKey || '').trim() : '';
    el.hidden = false;
    el.textContent = chord
      ? t('keysImeStayWithChord', '识别键仍为 {chord}（未改动）').replace(
          '{chord}',
          friendlyChord(chord)
        )
      : t('keysImeStayEmpty', '识别键未设置 · 录动作快捷键不会改动它');
  }

  function selectionToast(displayName, hasChord) {
    var tip = hasChord
      ? t('keysActionKeyUpdateToast', '已选中 · 再录将更新该命令快捷键（不改动识别键）')
      : t('keysActionKeyAppendToast', '已选中 · 录制后将追加动作快捷键（不改动识别键）');
    toast(tip + ' · ' + displayName);
  }

  function applyHero() {
    var badge = document.getElementById('keysTargetModeBadge');
    var targetEl = document.getElementById('targetView');
    var targetDisp = document.getElementById('targetDisplay');
    var host = document.getElementById('habitKeyMapCellTarget');
    var imeIcon = document.getElementById('targetImeIconMapping');
    var appBadge = document.getElementById('targetAppBadgeMapping');
    var m = mappingById(selectedMappingId());
    var cap = resolveHeroCapture(m);
    var hm = heroModel();

    if (cap.active) {
      if (selection && m) {
        var keyB = findKeyBinding(m, selection.actionId, selection.actionInstanceId);
        if (selection) {
          selection.keyBindingRef = keyB ? String(keyB.slotId || '') : '';
          if (keyB && keyB.actionInstanceId && !selection.actionInstanceId) {
            selection.actionInstanceId = String(keyB.actionInstanceId);
          }
          if (keyB && keyB.actionArgs != null && selection.actionArgs == null) {
            selection.actionArgs = keyB.actionArgs;
          }
        }
      }
      if (badge) {
        badge.textContent = cap.badge || t('keysHeroModeAction', '动作快捷键');
        badge.classList.add('is-action');
      }
      if (imeIcon) imeIcon.hidden = true;
      if (appBadge) {
        appBadge.hidden = true;
        appBadge.setAttribute('aria-hidden', 'true');
      }
      syncActionIconHost(hm.iconHtml);
      if (global.__otMappingEditorDisplayMounted && typeof global.__otMappingEditorDisplaySync === 'function') {
        global.__otMappingEditorDisplaySync();
      } else if (targetEl) {
        targetEl.textContent = cap.primaryLabel || cap.targetLabel || '';
      }
      if (targetDisp) {
        targetDisp.classList.toggle('empty', !!cap.empty);
        targetDisp.classList.add('is-codex-cap-edit');
      }
      if (host) host.classList.add('is-codex-cap-edit');
      syncImeStay();
      syncCaptureRecordChrome();
      return true;
    }

    if (badge) {
      badge.textContent = cap.badge || t('keysHeroModeIme', '输入法识别键');
      badge.classList.remove('is-action');
    }
    syncActionIconHost('');
    if (global.__otMappingEditorDisplayMounted && typeof global.__otMappingEditorDisplaySync === 'function') {
      global.__otMappingEditorDisplaySync();
    } else if (targetEl) {
      targetEl.textContent = cap.primaryLabel || '';
    }
    if (targetDisp) {
      targetDisp.classList.toggle('empty', !!cap.empty);
      targetDisp.classList.remove('is-codex-cap-edit');
    }
    if (host) host.classList.remove('is-codex-cap-edit');
    syncImeStay();
    syncCaptureRecordChrome();
    return false;
  }

  function filteredViews(channel) {
    return (viewsCache || []).filter(function (v) {
      if (viewChannel(v) !== channel) return false;
      if (v.enabled === false) return false;
      var aid = viewActionId(v);
      var ref = viewRef(v);
      if (!aid || !ref) return false;
      // Lifecycle covered by FE bridges — avoid duplicate rows.
      if (
        channel === 'voice' &&
        (aid === VOICE_LIFECYCLE_IDS.start ||
          aid === VOICE_LIFECYCLE_IDS.cancel ||
          aid === VOICE_LIFECYCLE_IDS.endCommit ||
          aid === VOICE_LIFECYCLE_IDS.endSend)
      ) {
        return false;
      }
      return true;
    });
  }

  function primaryWakePhrase() {
    var cfg = config();
    var lists = [];
    var sapi = cfg.voiceSapi || cfg.voice_sapi || {};
    var vosk = cfg.voiceVosk || cfg.voice_vosk || {};
    if (Array.isArray(sapi.phrases)) lists = lists.concat(sapi.phrases);
    if (Array.isArray(vosk.phrases)) lists = lists.concat(vosk.phrases);
    for (var i = 0; i < lists.length; i++) {
      var p = String(lists[i] || '').trim();
      if (p) return p;
    }
    return t('keysVoiceBridgeStartPhraseFallback', '开始听写');
  }

  function finishSendModeLabel() {
    var cfg = config();
    var end = cfg.voiceEnd || cfg.voice_end || {};
    var mode = String(end.sendMode || end.send_mode || 'manual').toLowerCase();
    if (mode === 'auto') return t('keysVoiceBridgeEndSend', '结束并发送');
    return t('keysVoiceBridgeEndCommit', '结束听写');
  }

  /**
   * Translate voice-page lifecycle into reusable intents for recognition.
   * Does not expand BindingView; end/send only guides to step 03.
   */
  function appDisplayName(appId) {
    var id = String(appId || '').trim();
    if (!id) return '';
    var ab = global.OneToneAppBehaviorRules;
    if (ab && ab.appDisplayName) {
      try {
        return String(ab.appDisplayName(id, null) || id);
      } catch (_) {}
    }
    var atp = global.OneToneAppTargetPresets;
    if (atp && atp.presetById) {
      var p = atp.presetById(id);
      if (p && p.nameKey) {
        var n = t(p.nameKey);
        if (n && n !== p.nameKey) return n;
      }
      if (p && p.name) return String(p.name);
    }
    return id;
  }

  function openAppAcousticProjection() {
    var m = activeMapping();
    if (!m) return null;
    var appId = String(m.appTargetId || '').trim();
    if (!appId || appId === 'custom') return null;
    var cmds = Array.isArray(m.acousticVoiceCommands) ? m.acousticVoiceCommands : [];
    var cmd = null;
    for (var i = 0; i < cmds.length; i++) {
      if (cmds[i]) {
        cmd = cmds[i];
        break;
      }
    }
    var name = appDisplayName(appId);
    var note = '';
    if (cmd) {
      note = String(cmd.displayText || cmd.display_text || '').trim();
    }
    var sourceRef = cmd
      ? String(cmd.id || cmd.commandId || cmd.command_id || 'acmd-' + (m.id || '')).trim()
      : 'open-app:' + (m.id || appId);
    return {
      kind: 'bind',
      actionId: 'app.open',
      bindingRef: 'open-app-acoustic:' + sourceRef,
      actionInstanceId: 'app-open:' + String(m.id || ''),
      name: t('keysVoiceBridgeOpenApp', '打开应用') + ' · ' + name,
      sub:
        t('keysVoiceBridgeOpenAppSub', '口令') +
        (note ? ' · ' + note : '') +
        ' · ' +
        t('keysVoiceBridgeOpenAppMigratable', '可迁移为按键，不改语音配置'),
      offerIme: false,
      sourceKind: 'open-app-acoustic',
      transferable: true
    };
  }

  function voiceLifecycleBridges() {
    var rows = [
      {
        kind: 'bind',
        actionId: VOICE_LIFECYCLE_IDS.start,
        bindingRef: 'voice-lifecycle:start',
        name: t('keysVoiceBridgeStart', '开始听写'),
        sub:
          t('keysVoiceBridgeStartSub', '语音口令') +
          ' · ' +
          primaryWakePhrase() +
          ' · ' +
          t('keysVoiceBridgeStartOrIme', '可补按键，或改用输入法识别键'),
        offerIme: true
      },
      {
        kind: 'bind',
        actionId: VOICE_LIFECYCLE_IDS.cancel,
        bindingRef: 'voice-lifecycle:cancel',
        name: t('keysVoiceBridgeCancel', '取消'),
        sub: t('keysVoiceBridgeCancelSub', '对应语义 input.cancel · 可补动作快捷键'),
        offerIme: false
      },
      {
        kind: 'guide-finish',
        actionId: VOICE_LIFECYCLE_IDS.endCommit,
        bindingRef: 'voice-lifecycle:end',
        name: finishSendModeLabel(),
        sub: t('keysVoiceBridgeEndSub', '在「快捷键」标签配置按键收尾，不在识别区重复建键'),
        offerIme: false
      }
    ];
    var openProj = openAppAcousticProjection();
    if (openProj) rows.unshift(openProj);
    return rows;
  }

  function existingAppShortcutRows(m) {
    if (!m || !Array.isArray(m.agentBindings)) return [];
    var out = [];
    for (var i = 0; i < m.agentBindings.length; i++) {
      var b = m.agentBindings[i];
      if (!b || b.triggerType !== 'key') continue;
      if (canonicalActionId(b.actionId) !== 'app.shortcut') continue;
      var chordOut =
        b.actionArgs && b.actionArgs.chord
          ? String(b.actionArgs.chord)
          : '';
      out.push({
        kind: 'bind',
        actionId: 'app.shortcut',
        bindingRef: String(b.slotId || ''),
        actionInstanceId: String(b.actionInstanceId || ''),
        actionArgs: b.actionArgs || null,
        name:
          t('keysAppShortcutRow', '应用快捷键') +
          (chordOut ? ' · ' + friendlyChord(chordOut) : ''),
        sub:
          t('keysAppShortcutTrigger', '触发') +
          ' · ' +
          (friendlyChord(b.triggerBinding) || t('keysHeroActionNeedsKey', '待设置快捷键')),
        offerIme: false
      });
    }
    return out;
  }

  function rowsForTab(ch) {
    if (ch === 'voice') {
      return { bridges: voiceLifecycleBridges(), views: filteredViews('voice'), footer: null };
    }
    if (ch === 'softPad') {
      return {
        kind: 'softPadKeyboard',
        bridges: existingAppShortcutRows(activeMapping()),
        views: [],
        footer: {
          kind: 'add-app-shortcut',
          label: t('keysAddAppShortcut', '＋ 添加应用快捷键')
        }
      };
    }
    return { bridges: [], views: filteredViews(ch), footer: null };
  }

  function sourceSubline(channel, v) {
    var trig = viewTrigger(v);
    if (channel === 'voice') {
      return t('keysChannelTriggerPhrase', '口令') + (trig ? ' · ' + trig : '');
    }
    if (channel === 'camera') {
      return t('keysChannelGesture', '手势') + ' · ' + gestureLabel(viewRef(v));
    }
    return t('keysChannelPadKey', '键位') + (trig ? ' · ' + trig : '');
  }

  function emptyCopy(channel) {
    if (channel === 'voice') {
      return t('keysChannelEmptyVoice', '当前习惯暂无可适配为快捷键的语音命令');
    }
    if (channel === 'cursor') {
      return t('keysChannelEmptyCursor', '暂无 Cursor 命令');
    }
    if (channel === 'softPad') {
      return t('keysChannelEmptySoftPad', '当前习惯暂无可适配为快捷键的虚拟键盘命令');
    }
    if (channel === 'camera') {
      return t('keysChannelEmptyCamera', '当前习惯暂无可适配为快捷键的摄像头动作');
    }
    return t('keysChannelEmpty', '当前习惯暂无可适配为快捷键的命令');
  }

  function cursorItemLabel(item) {
    var en = ((global.OneToneI18n && global.OneToneI18n.lang) || 'zh') === 'en';
    return en ? item.labelEn || item.labelZh : item.labelZh || item.labelEn;
  }

  function cursorItemNote(item) {
    var en = ((global.OneToneI18n && global.OneToneI18n.lang) || 'zh') === 'en';
    return en ? item.noteEn || item.noteZh || '' : item.noteZh || item.noteEn || '';
  }

  function cursorItemChord(item) {
    var hint = String((item && item.chordHint) || '').trim();
    if (hint) return hint;
    var A = global.OneToneAgentActions;
    return A && A.defaultCursorKeyForSlot
      ? String(A.defaultCursorKeyForSlot(item.slotId) || '').trim()
      : '';
  }

  function cursorItemRightLabel(item) {
    var en = ((global.OneToneI18n && global.OneToneI18n.lang) || 'zh') === 'en';
    var custom = en ? item.rightLabelEn || item.rightLabelZh : item.rightLabelZh || item.rightLabelEn;
    if (custom) return custom;
    var chord = cursorItemChord(item);
    if (chord) return friendlyChord(chord);
    return t('keysHeroActionNeedsKey', '待设置快捷键');
  }

  function cursorItemSub(item) {
    var note = cursorItemNote(item);
    var phrase = String((item && item.phrase) || '').trim();
    var parts = [];
    if (phrase) parts.push(t('keysChannelTriggerPhrase', '口令') + ' · ' + phrase);
    if (note) parts.push(note);
    return parts.join(' · ') || note || '';
  }

  function cursorItemActionId(item) {
    var sid = String((item && item.slotId) || '').trim();
    if (!sid) return '';
    var fromSlot = actionIdFromSlot(sid);
    if (fromSlot && fromSlot !== sid) return fromSlot;
    var A = global.OneToneAgentActions;
    var slot = A && A.slotById ? A.slotById(sid) : null;
    if (slot && slot.actionId) return canonicalActionId(slot.actionId);
    return 'cursor.' + sid;
  }

  function renderCursorCommandsPanel(panel) {
    if (panel.classList) panel.classList.remove('is-softpad-pick');
    syncSoftPadTargetChrome(false);
    var mid = selectedMappingId();
    var m = mappingById(mid);
    var html = '';
    var gi;
    for (gi = 0; gi < CURSOR_COMMAND_GROUPS.length; gi++) {
      var group = CURSOR_COMMAND_GROUPS[gi];
      if (group.titleKey || group.titleFb) {
        html +=
          '<p class="keys-channel-group-label">' +
          esc(t(group.titleKey, group.titleFb)) +
          '</p>';
      }
      var items = group.items || [];
      var ii;
      for (ii = 0; ii < items.length; ii++) {
        var item = items[ii];
        var slotId = String(item.slotId || '').trim();
        var actionId = cursorItemActionId(item);
        var gated = !!item.gated;
        if (
          !matchesSearch(
            cursorItemLabel(item) + ' ' + cursorItemSub(item) + ' ' + actionId + ' ' + slotId
          )
        ) {
          continue;
        }
        var keyB = mid ? findKeyBinding(m, actionId, '') : null;
        var boundChord = keyB ? String(keyB.triggerBinding || '').trim() : '';
        var selected =
          selection &&
          selection.sourceChannel === 'cursor' &&
          selection.sourceBindingRef === slotId &&
          (!mid || selection.mappingId === mid);
        var heroRef = captureHeroRefForMapping(m);
        var heroMapped = heroRefMatches(heroRef, {
          channel: 'cursor',
          bindingRef: slotId,
          actionId: actionId,
          actionInstanceId: ''
        });
        html +=
          '<button type="button" class="keys-channel-item' +
          (selected ? ' is-selected' : '') +
          (heroMapped ? ' is-hero-mapped' : '') +
          (gated ? ' is-disabled' : '') +
          '" data-channel-item="1" data-channel="cursor" data-binding-ref="' +
          esc(slotId) +
          '" data-action-id="' +
          esc(actionId) +
          '" data-cursor-slot="' +
          esc(slotId) +
          '"' +
          (gated ? ' data-gated="1" disabled aria-disabled="true"' : '') +
          '>' +
          '<span class="keys-channel-item-name">' +
          esc(cursorItemLabel(item)) +
          '</span>' +
          '<span class="keys-channel-item-key">' +
          esc(
            gated
              ? t('keysChannelCursorGated', 'gate 关闭')
              : boundChord
                ? friendlyChord(boundChord)
                : cursorItemRightLabel(item)
          ) +
          '</span>' +
          '<span class="keys-channel-item-sub">' +
          esc(cursorItemSub(item)) +
          '</span>' +
          (heroMapped
            ? '<span class="keys-channel-item-hero-tag">' +
              esc(t('keysCaptureHeroMapped', '已映射到识别按钮')) +
              '</span>'
            : '') +
          '</button>';
      }
    }
    if (!html) {
      html = '<p class="keys-channel-empty">' + esc(emptyCopy('cursor')) + '</p>';
    }
    panel.innerHTML = html;
  }

  function guideToSoftPadSettings() {
    var ctx = resolveSoftPadScope();
    var workMid =
      (ctx && ctx.targetMappingId) ||
      (ctx && ctx.sourceMappingId) ||
      '';
    var drawer = global.OneToneSettingsDrawer;
    if (drawer && drawer.setPanel) {
      try {
        if (workMid) drawer.setPanel('softPad', { mappingId: workMid });
        else drawer.setPanel('softPad');
        return;
      } catch (_) {}
    }
    toast(t('keysChannelGoSoftPad', '去虚拟键盘配置'));
  }

  function persistSoftPadMapping(m) {
    if (!m) return;
    try {
      if (global.OneToneCodexMicroPadUi && global.OneToneCodexMicroPadUi.persist) {
        global.OneToneCodexMicroPadUi.persist();
        return;
      }
    } catch (_) {}
    try {
      if (global.OneToneConfigApi && global.OneToneConfigApi.save) {
        global.OneToneConfigApi.save();
      }
    } catch (_) {}
  }

  function prepareSoftPadScopeScenario(opts) {
    opts = opts || {};
    var silent = !!opts.silent;
    var appId = String(softPadScopeAppId || '').trim();
    if (!appId && isGlobalKeysEditContext()) return;
    var ctx = resolveSoftPadScope();
    var sourceId = ctx && ctx.sourceMappingId ? String(ctx.sourceMappingId) : '';
    var PadUi = global.OneToneCodexMicroPadUi;
    var hub = global.OneToneHabitHub;
    var target = null;

    if (sourceId) {
      target = mappingById(sourceId);
      if (!target) {
        toast(t('keysSoftPadScopePrepareFail', '无法准备虚拟键盘场景'));
        return;
      }
      if (!target.codexMicroPad) {
        if (!PadUi || typeof PadUi.ensurePad !== 'function') {
          toast(t('keysSoftPadScopePrepareFail', '无法准备虚拟键盘场景'));
          return;
        }
        PadUi.ensurePad(target, { persist: true });
        persistSoftPadMapping(target);
      }
      softPadScopeMappingIdOverride = String(target.id || '');
      softPadScopeAppId = String(target.appTargetId || appId || softPadScopeAppId);
      if (!silent) {
        toast(
          t('keysSoftPadScopePrepared', '已准备 {app} 虚拟键盘').replace(
            '{app}',
            softPadAppTitle(softPadScopeAppId)
          )
        );
      }
      refresh();
      return;
    }

    // No resolved scenario — create only when none exist for this app.
    var existing = listScenariosForAppTargetId(appId);
    if (existing.length) {
      toast(t('keysSoftPadScopeAmbiguous', '该应用有多个场景，请选择'));
      return;
    }

    if (
      appId === 'codex-chat' &&
      global.OneToneAgentScenarioTemplate &&
      global.OneToneAgentScenarioTemplate.findOrCreateCodexScenario
    ) {
      var res = global.OneToneAgentScenarioTemplate.findOrCreateCodexScenario();
      target = res && res.mapping ? res.mapping : null;
    } else if (hub && hub.createAppScenario) {
      target = hub.createAppScenario(appId);
    }
    if (!target) {
      toast(t('keysSoftPadScopePrepareFail', '无法准备虚拟键盘场景'));
      return;
    }
    if (!target.codexMicroPad && PadUi && typeof PadUi.ensurePad === 'function') {
      PadUi.ensurePad(target, { persist: true });
      persistSoftPadMapping(target);
    }
    softPadScopeMappingIdOverride = String(target.id || '');
    softPadScopeAppId = String(target.appTargetId || appId);
    if (!silent) {
      toast(
        t('keysSoftPadScopePrepared', '已准备 {app} 虚拟键盘').replace(
          '{app}',
          softPadAppTitle(softPadScopeAppId)
        )
      );
    }
    refresh();
  }

  function moreSoftPadScopeApps() {
    var presets = global.OneToneAppTargetPresets;
    var list = (presets && presets.presets) || [];
    var primary = {};
    SOFTPAD_SCOPE_PRIMARY.forEach(function (d) {
      primary[d.appTargetId] = true;
    });
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var id = p && p.id;
      if (!id || primary[id] || id === 'custom') continue;
      out.push({ appTargetId: id, title: softPadAppTitle(id) });
    }
    return out;
  }

  function renderSoftPadScopeChipsHtml(ctx) {
    if (!isGlobalKeysEditContext()) return '';
    var recordLocked = scopeLock === 'record';
    var html =
      '<div class="keys-softpad-scope' +
      (recordLocked ? ' is-record-locked' : '') +
      '" data-softpad-scope="1">' +
      '<p class="keys-softpad-scope-label">' +
      esc(t('keysSoftPadScopeLabel', '虚拟键盘按应用分别配置')) +
      '</p>';
    if (autoPreselectHint && softPadScopeAppId) {
      html +=
        '<p class="keys-softpad-scope-autohint">' +
        esc(
          t(
            'keysSoftPadScopeAutoHint',
            '已根据刚才使用的应用选择 {app}'
          ).replace('{app}', softPadAppTitle(softPadScopeAppId))
        ) +
        ' · ' +
        '<button type="button" class="keys-channel-item-link" data-softpad-scope-change="1">' +
        esc(t('keysSoftPadScopeChange', '更改')) +
        '</button></p>';
    }
    html += '<div class="keys-softpad-scope-chips" role="tablist">';
    SOFTPAD_SCOPE_PRIMARY.forEach(function (d) {
      html += softPadScopeChipHtml(d.appTargetId, t(d.titleKey, d.titleFb), {
        active: softPadScopeAppId === d.appTargetId,
        recordLocked: recordLocked
      });
    });
    moreSoftPadScopeApps().forEach(function (d) {
      html += softPadScopeChipHtml(d.appTargetId, d.title, {
        active: softPadScopeAppId === d.appTargetId,
        recordLocked: recordLocked
      });
    });
    html += '</div></div>';
    return html;
  }

  function renderSoftPadCapHtml(ctx, opts) {
    opts = opts || {};
    var missing = !!(opts.missing || (ctx && ctx.missingScenario));
    var html = '<aside class="keys-softpad-cap" id="keysSoftPadCap">';
    if (missing) {
      html +=
        '<p class="keys-softpad-cap-title">' +
        esc(t('keysSoftPadCapNeedPrepareTitle', '尚未准备')) +
        '</p>' +
        '<p class="keys-softpad-cap-body">' +
        esc(
          t(
            'keysSoftPadCapNeedPrepareBody',
            '先准备 {app} 虚拟键盘，再点选键帽绑定识别键。'
          ).replace('{app}', (ctx && ctx.title) || '')
        ) +
        '</p>' +
        '<button type="button" class="keys-channel-go-softpad" data-softpad-prepare="1">' +
        esc(
          t('keysSoftPadScopePrepare', '准备 {app} 虚拟键盘').replace(
            '{app}',
            (ctx && ctx.title) || ''
          )
        ) +
        '</button>';
      if (ctx && ctx.sourceMappingId) {
        html +=
          '<button type="button" class="keys-channel-item-link" data-go-softpad="1">' +
          esc(
            t('keysSoftPadScopeManage', '管理 {app} 虚拟键盘').replace(
              '{app}',
              (ctx && ctx.title) || ''
            )
          ) +
          '</button>';
      }
      html += '</aside>';
      return html;
    }

    var selOk =
      selection &&
      selection.sourceChannel === 'softPad' &&
      selection.actionId &&
      ctx &&
      ctx.targetMappingId &&
      selection.mappingId === ctx.targetMappingId;

    if (!selOk) {
      html +=
        '<p class="keys-softpad-cap-title">' +
        esc(t('keysSoftPadCapEmptyTitle', '键帽能力')) +
        '</p>' +
        '<p class="keys-softpad-cap-body keys-softpad-cap-body--emphasis">' +
        esc(t('keysSoftPadCapEmpty', '点击左侧键帽查看能力')) +
        '</p>';
      html += '</aside>';
      return html;
    }

    var m = softPadWorkMapping();
    var keyB = findKeyBinding(m, selection.actionId, selection.actionInstanceId);
    var chord = keyB ? String(keyB.triggerBinding || '').trim() : '';
    var chordText = chord
      ? friendlyChord(chord)
      : t('keysHeroActionNeedsKey', '待设置快捷键');
    var label = actionLabel(selection.actionId);
    html +=
      '<p class="keys-softpad-cap-kicker">' +
      esc((ctx && ctx.title) || softPadAppTitle(softPadScopeAppId)) +
      '</p>';
    if (selection.iconHtml) {
      html +=
        '<div class="keys-softpad-cap-icon" aria-hidden="true">' +
        selection.iconHtml +
        '</div>';
    }
    html +=
      '<p class="keys-softpad-cap-title">' +
      esc(label) +
      '</p>' +
      '<p class="keys-softpad-cap-chord' +
      (chord ? '' : ' is-pending') +
      '">' +
      esc(chordText) +
      '</p>' +
      '<p class="keys-softpad-cap-body">' +
      esc(
        t(
          'keysSoftPadCapBindHint',
          '将此能力绑定到实体识别键后即可触发'
        )
      ) +
      '</p>' +
      (canRecordSoftPadSelection(ctx)
        ? '<button type="button" class="keys-channel-go-softpad" data-softpad-record="1">' +
          esc(t('keysSoftPadCapRecord', '录制识别键')) +
          '</button>'
        : '');
    html += '</aside>';
    return html;
  }

  function softPadDefaultPreviewPad() {
    return {
      enabled: true,
      skin: 'default',
      keys: [],
      showNavigationPad: true,
      presentation: 'full'
    };
  }

  function softPadPreviewStubMapping(appId) {
    return {
      id: '',
      appTargetId: String(appId || ''),
      agentBindings: [],
      codexMicroPad: softPadDefaultPreviewPad()
    };
  }

  function renderSoftPadPreviewOnlyHtml(ctx) {
    var appId = (ctx && ctx.appTargetId) || softPadScopeAppId;
    var stub = softPadPreviewStubMapping(appId);
    var PadUi = global.OneToneCodexMicroPadUi;
    var html =
      '<div class="keys-softpad-stage">' +
      '<div id="keysSoftPadPickHost" class="keys-softpad-pick-host is-preview-only" aria-hidden="true">';
    if (PadUi && typeof PadUi.renderHardwarePad === 'function') {
      html += PadUi.renderHardwarePad(stub, softPadDefaultPreviewPad(), {
        mode: 'softPad',
        compact: false
      });
    }
    html += '</div>' + renderSoftPadCapHtml(ctx, { missing: true }) + '</div>';
    return html;
  }

  function disableAllSoftPadPickKeys(host) {
    if (!host || !host.querySelectorAll) return;
    host.querySelectorAll('[data-micro-key]').forEach(function (el) {
      el.classList.remove('is-bound', 'is-focused', 'is-pressed', 'is-active');
      el.classList.add('is-disabled');
      el.setAttribute('aria-disabled', 'true');
      el.tabIndex = -1;
      if (el.getAttribute('role') === 'switch') {
        el.removeAttribute('role');
        el.removeAttribute('aria-checked');
      }
    });
  }

  function countMigratableSoftPadKeys(m) {
    var pad = m && m.codexMicroPad;
    var keys = pad && Array.isArray(pad.keys) ? pad.keys : [];
    var n = 0;
    var seen = {};
    for (var i = 0; i < keys.length; i++) {
      var id = keys[i] && keys[i].microKeyId;
      if (!id || seen[id]) continue;
      seen[id] = true;
      if (resolveMigratableAction(m, id)) n++;
    }
    softPadViewsForResolve().forEach(function (v) {
      var ref = viewRef(v);
      var trig = viewTrigger(v);
      [ref, trig].forEach(function (cand) {
        if (!cand || seen[cand]) return;
        if (resolveMigratableAction(m, cand)) {
          seen[cand] = true;
          n++;
        }
      });
    });
    return n;
  }

  function retargetSoftPadPickKeys(host, m) {
    if (!host || !host.querySelectorAll) return;
    var workMid = m && m.id ? String(m.id) : '';
    host.querySelectorAll('[data-micro-key]').forEach(function (el) {
      var id = el.getAttribute('data-micro-key') || '';
      var resolved = resolveMigratableAction(m, id);
      var keyName =
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        id ||
        t('keysChannelPadKey', '键位');
      el.classList.remove('is-bound', 'is-focused', 'is-pressed', 'is-active');
      if (id === 'ENC') {
        el.classList.add('is-disabled');
        el.setAttribute('aria-disabled', 'true');
        el.tabIndex = -1;
        el.setAttribute(
          'title',
          t('keysSoftPadKeyEncDisabled', '电源旋钮不可用于识别绑定')
        );
        el.setAttribute(
          'aria-label',
          keyName + ' · ' + t('keysSoftPadKeyEncDisabled', '电源旋钮不可用于识别绑定')
        );
        return;
      }
      if (id === 'JOY' || /^NAV_/.test(id)) {
        el.classList.add('is-disabled');
        el.setAttribute('aria-disabled', 'true');
        el.tabIndex = -1;
        el.setAttribute(
          'title',
          t('keysSoftPadKeyNavDisabled', '导航键不可用于识别绑定')
        );
        el.setAttribute(
          'aria-label',
          keyName +
            ' · ' +
            t('keysSoftPadKeyNavDisabled', '导航键不可用于识别绑定')
        );
        return;
      }
      if (resolved) {
        el.classList.add('is-bound');
        el.classList.remove('is-disabled');
        el.removeAttribute('aria-disabled');
        el.removeAttribute('disabled');
        if (el.tagName === 'BUTTON') el.tabIndex = 0;
        el.removeAttribute('title');
        if (
          selection &&
          selection.mappingId === workMid &&
          selection.sourceChannel === 'softPad' &&
          selection.sourceBindingRef === id
        ) {
          el.classList.add('is-focused');
        }
      } else {
        el.classList.add('is-disabled');
        el.setAttribute('aria-disabled', 'true');
        el.tabIndex = -1;
        var uncfg = t('keysSoftPadKeyUnconfigured', '未配置，不可选择');
        el.setAttribute('title', keyName + ' · ' + uncfg);
        el.setAttribute('aria-label', keyName + ' · ' + uncfg);
        if (el.getAttribute('role') === 'switch') {
          el.removeAttribute('role');
          el.removeAttribute('aria-checked');
        }
      }
    });
  }

  function scenarioStatusLabel(m) {
    var en = scenarioIsEnabled(m)
      ? t('keysSoftPadScenarioEnabled', '已启用')
      : t('keysSoftPadScenarioDisabled', '已停用');
    var pad = scenarioPadSwitchOn(m)
      ? t('keysSoftPadScenarioPadOn', '虚拟键盘开启')
      : scenarioHasPad(m)
        ? t('keysSoftPadScenarioPadOff', '虚拟键盘关闭')
        : t('keysSoftPadScenarioPadMissing', '虚拟键盘未准备');
    return en + ' · ' + pad;
  }

  function scenarioDisplayName(m) {
    if (!m) return '';
    if (global.OneToneHabitProfile && global.OneToneHabitProfile.habitDisplayName) {
      try {
        var title = String(global.OneToneHabitProfile.habitDisplayName(m) || '').trim();
        if (title && title !== '—') return title;
      } catch (_) {}
    }
    return String(m.group || m.label || m.name || m.id || '').trim();
  }

  function renderSoftPadSecondaryHtml(workMid, workM, bridges, footer, ctx) {
    var html = '<div class="keys-softpad-secondary">';
    if (softPadAuthorityPending(workMid)) {
      html +=
        '<p class="keys-channel-empty">' +
        esc(t('keysSoftPadCapLoading', '正在加载此场景的可绑定键位…')) +
        '</p>';
    }
    var migratable = countMigratableSoftPadKeys(workM);
    if (!softPadAuthorityPending(workMid) && !migratable) {
      html +=
        '<p class="keys-channel-empty">' +
        esc(emptyCopy('softPad')) +
        '</p>';
    } else if (!softPadAuthorityPending(workMid) && ctx && ctx.globalProxy && ctx.title) {
      html +=
        '<p class="keys-softpad-scope-hint">' +
        esc(
          t(
            'keysSoftPadScopePickHint',
            '选择键帽后，将为 {app} 配置实体快捷键'
          ).replace('{app}', ctx.title)
        ) +
        '</p>';
    }
    if (ctx && (ctx.targetMappingId || ctx.sourceMappingId)) {
      html +=
        '<button type="button" class="keys-channel-go-softpad" data-go-softpad="1">' +
        esc(
          t('keysSoftPadScopeManage', '管理 {app} 虚拟键盘').replace(
            '{app}',
            (ctx && ctx.title) || softPadAppTitle(workM && workM.appTargetId)
          )
        ) +
        '</button>';
    }
    var canAddShortcut = !!(workM && String(workM.appTargetId || '').trim());
    var bi;
    for (bi = 0; bi < bridges.length; bi++) {
      var br = bridges[bi];
      html += renderBindRowHtml({
        mid: workMid,
        m: workM,
        actionId: br.actionId,
        bindingRef: br.bindingRef,
        name: br.name,
        sub: br.sub,
        offerIme: br.offerIme,
        actionInstanceId: br.actionInstanceId || '',
        channel: 'softPad',
        actionArgsChord:
          br.actionArgs && br.actionArgs.chord ? String(br.actionArgs.chord) : ''
      });
    }
    if (canAddShortcut && footer && footer.kind === 'add-app-shortcut') {
      html +=
        '<button type="button" class="keys-channel-add-shortcut keys-channel-add-shortcut--compact" data-add-app-shortcut="1">' +
        esc(footer.label) +
        '</button>';
    }
    html += '</div>';
    return html;
  }

  function renderSoftPadKeyboardPanel(panel) {
    if (panel.classList) panel.classList.add('is-softpad-pick');
    ensureSoftPadDefaultScope();
    var ctx = resolveSoftPadScope();
    var html = '';
    if (isGlobalKeysEditContext()) {
      html += renderSoftPadScopeChipsHtml(ctx);
    }

    if (isGlobalKeysEditContext() && !softPadScopeAppId) {
      html +=
        '<p class="keys-channel-empty">' +
        esc(
          t(
            'keysSoftPadScopeNeedPick',
            '虚拟键盘按应用生效，请先选择要配置的应用。'
          )
        ) +
        '</p>';
      panel.innerHTML = html;
      syncSoftPadTargetChrome(false);
      return;
    }

    if (ctx && ctx.missingScenario) {
      if (isKnownSoftPadAppTargetId(ctx.appTargetId || softPadScopeAppId)) {
        prepareSoftPadScopeScenario({ silent: true });
        var afterCtx = resolveSoftPadScope();
        if (afterCtx && !afterCtx.missingScenario) {
          return;
        }
        ctx = afterCtx || ctx;
      }
      html += renderSoftPadPreviewOnlyHtml(ctx);
      panel.innerHTML = html;
      disableAllSoftPadPickKeys(panel);
      syncSoftPadTargetChrome(true);
      return;
    }

    if (ctx && ctx.ambiguous) {
      html +=
        '<p class="keys-channel-empty">' +
        esc(
          t(
            'keysSoftPadScopeAmbiguous',
            '此应用有多个 SoftPad 场景，请选择要加载的场景'
          )
        ) +
        '</p>' +
        '<div class="keys-softpad-scope-scenarios">';
      (ctx.scenarios || []).forEach(function (sc) {
        if (!sc || !sc.id) return;
        html +=
          '<button type="button" class="keys-softpad-scenario-option" data-softpad-scope-mapping="' +
          esc(String(sc.id)) +
          '">' +
          '<span class="keys-softpad-scenario-option__name">' +
          esc(scenarioDisplayName(sc)) +
          '</span>' +
          '<span class="keys-softpad-scenario-option__status">' +
          esc(scenarioStatusLabel(sc)) +
          '</span>' +
          '</button>';
      });
      html += '</div>';
      panel.innerHTML = html;
      syncSoftPadTargetChrome(true);
      return;
    }

    var workM = softPadWorkMapping();
    var workMid = workM ? String(workM.id || '') : '';
    if (!workM || !workMid) {
      html +=
        '<p class="keys-channel-empty">' +
        esc(emptyCopy('softPad')) +
        '</p>';
      panel.innerHTML = html;
      syncSoftPadTargetChrome(true);
      return;
    }

    var pack = {
      bridges: existingAppShortcutRows(workM),
      footer: {
        kind: 'add-app-shortcut',
        label: t('keysAddAppShortcut', '＋ 添加应用快捷键')
      }
    };
    var PadUi = global.OneToneCodexMicroPadUi;
    var previewPad = previewPadClone(workM);
    html += '<div class="keys-softpad-stage">';
    html += '<div id="keysSoftPadPickHost" class="keys-softpad-pick-host">';
    if (PadUi && typeof PadUi.renderHardwarePad === 'function') {
      html += PadUi.renderHardwarePad(workM, previewPad, {
        mode: 'softPad',
        compact: false
      });
    }
    html += '</div>';
    html += renderSoftPadCapHtml(ctx);
    html += '</div>';
    html += renderSoftPadSecondaryHtml(
      workMid,
      workM,
      pack.bridges || [],
      pack.footer,
      ctx
    );
    panel.innerHTML = html;
    retargetSoftPadPickKeys(panel, workM);
    syncSoftPadTargetChrome(true);
  }

  function syncSoftPadTargetChrome(active) {
    var row = document.getElementById('habitKeyMapRowTarget');
    if (row && row.classList) {
      row.classList.toggle('is-softpad-channel', !!active && openPanels.softPad);
    }
  }

  function renderBindRowHtml(opts) {
    var mid = opts.mid;
    var m = opts.m;
    var actionId = opts.actionId;
    var ref = opts.bindingRef;
    var name = opts.name;
    var sub = opts.sub;
    var offerIme = !!opts.offerIme;
    var channel = opts.channel || 'voice';
    var actionInstanceId = String(opts.actionInstanceId || '');
    var bindable = bindableByAction[actionId];
    if (bindable === undefined) bindable = true;
    var keyB = findKeyBinding(m, actionId, actionInstanceId);
    var chord = keyB ? String(keyB.triggerBinding || '').trim() : '';
    var selected =
      selection &&
      selection.mappingId === mid &&
      selection.sourceChannel === channel &&
      selection.sourceBindingRef === ref;
    var disabled = !bindable;
    var heroRef = captureHeroRefForMapping(m);
    var heroMapped = heroRefMatches(heroRef, {
      channel: channel,
      bindingRef: ref,
      actionId: actionId,
      actionInstanceId: actionInstanceId
    });
    var html =
      '<div class="keys-channel-item-wrap' +
      (selected ? ' is-selected' : '') +
      (heroMapped ? ' is-hero-mapped' : '') +
      (disabled ? ' is-disabled' : '') +
      '">' +
      '<button type="button" class="keys-channel-item' +
      (selected ? ' is-selected' : '') +
      (disabled ? ' is-disabled' : '') +
      '" data-channel-item="1" data-channel="' +
      esc(channel) +
      '" data-binding-ref="' +
      esc(ref) +
      '" data-action-id="' +
      esc(actionId) +
      '"' +
      (actionInstanceId
        ? ' data-action-instance-id="' + esc(actionInstanceId) + '"'
        : '') +
      (opts.actionArgsChord
        ? ' data-action-args-chord="' + esc(opts.actionArgsChord) + '"'
        : '') +
      (disabled ? ' disabled aria-disabled="true"' : '') +
      '>' +
      '<span class="keys-channel-item-name">' +
      esc(name) +
      '</span>' +
      '<span class="keys-channel-item-key">' +
      esc(
        disabled
          ? channelOnlyLabel(channel)
          : chord
            ? friendlyChord(chord)
            : t('keysHeroActionNeedsKey', '待设置快捷键')
      ) +
      '</span>' +
      '<span class="keys-channel-item-sub">' +
      esc(sub) +
      '</span>' +
      (heroMapped
        ? '<span class="keys-channel-item-hero-tag">' +
          esc(t('keysCaptureHeroMapped', '已映射到识别按钮')) +
          '</span>'
        : '') +
      '</button>';
    if (offerIme) {
      html +=
        '<button type="button" class="keys-channel-item-link" data-bridge-ime="1">' +
        esc(t('keysVoiceBridgeGoIme', '改用输入法识别键')) +
        '</button>';
    }
    html += '</div>';
    return html;
  }

  function renderGuideFinishHtml(bridge) {
    return (
      '<button type="button" class="keys-channel-item keys-channel-item--guide" data-guide-finish="1" data-binding-ref="' +
      esc(bridge.bindingRef) +
      '">' +
      '<span class="keys-channel-item-name">' +
      esc(bridge.name) +
      '</span>' +
      '<span class="keys-channel-item-key">' +
      esc(t('keysVoiceBridgeGoFinish', '去快捷键收尾')) +
      '</span>' +
      '<span class="keys-channel-item-sub">' +
      esc(bridge.sub) +
      '</span>' +
      '</button>'
    );
  }

  function renderListChannelHtml(ch, opts) {
    opts = opts || {};
    var mid = selectedMappingId();
    var m = mappingById(mid);
    var pack = rowsForTab(ch);
    var bridges = pack.bridges || [];
    var rows = pack.views || [];
    var footer = pack.footer;
    if (!bridges.length && !rows.length && !footer) {
      return '<p class="keys-channel-empty">' + esc(emptyCopy(ch)) + '</p>';
    }
    var html = '<p class="keys-channel-group-label">' + esc(channelTabLabel(ch)) + '</p>';
    var bi;
    for (bi = 0; bi < bridges.length; bi++) {
      var br = bridges[bi];
      if (!matchesSearch(br.name + ' ' + (br.sub || '') + ' ' + (br.actionId || ''))) continue;
      if (br.kind === 'guide-finish') {
        html += renderGuideFinishHtml(br);
      } else {
        html += renderBindRowHtml({
          mid: mid,
          m: m,
          actionId: br.actionId,
          bindingRef: br.bindingRef,
          name: br.name,
          sub: br.sub,
          offerIme: br.offerIme,
          actionInstanceId: br.actionInstanceId || '',
          channel: ch,
          actionArgsChord:
            br.actionArgs && br.actionArgs.chord ? String(br.actionArgs.chord) : ''
        });
      }
    }
    var i;
    for (i = 0; i < rows.length; i++) {
      var v = rows[i];
      var actionId = viewActionId(v);
      var ref = viewRef(v);
      var rowName = actionLabel(actionId);
      var rowSub = sourceSubline(ch, v);
      if (!matchesSearch(rowName + ' ' + rowSub + ' ' + actionId)) continue;
      var bindable = bindableByAction[actionId];
      if (bindable === undefined) bindable = true;
      var keyB = findKeyBinding(m, actionId);
      var chord = keyB ? String(keyB.triggerBinding || '').trim() : '';
      var selected =
        selection &&
        selection.mappingId === mid &&
        selection.sourceChannel === ch &&
        selection.sourceBindingRef === ref;
      var disabled = !bindable;
      var heroRef = captureHeroRefForMapping(m);
      var heroMapped = heroRefMatches(heroRef, {
        channel: ch,
        bindingRef: ref,
        actionId: actionId,
        actionInstanceId: ''
      });
      html +=
        '<button type="button" class="keys-channel-item' +
        (selected ? ' is-selected' : '') +
        (heroMapped ? ' is-hero-mapped' : '') +
        (disabled ? ' is-disabled' : '') +
        '" data-channel-item="1" data-channel="' +
        esc(ch) +
        '" data-binding-ref="' +
        esc(ref) +
        '" data-action-id="' +
        esc(actionId) +
        '"' +
        (disabled ? ' disabled aria-disabled="true"' : '') +
        '>' +
        '<span class="keys-channel-item-name">' +
        esc(rowName) +
        '</span>' +
        '<span class="keys-channel-item-key">' +
        esc(
          disabled
            ? channelOnlyLabel(ch)
            : chord
              ? friendlyChord(chord)
              : t('keysHeroActionNeedsKey', '待设置快捷键')
        ) +
        '</span>' +
        '<span class="keys-channel-item-sub">' +
        esc(rowSub) +
        '</span>' +
        (heroMapped
          ? '<span class="keys-channel-item-hero-tag">' +
            esc(t('keysCaptureHeroMapped', '已映射到识别按钮')) +
            '</span>'
          : '') +
        '</button>';
    }
    if (footer && footer.kind === 'add-app-shortcut') {
      html +=
        '<button type="button" class="keys-channel-add-shortcut" data-add-app-shortcut="1">' +
        esc(footer.label) +
        '</button>';
    }
    return html || '<p class="keys-channel-empty">' + esc(emptyCopy(ch)) + '</p>';
  }

  function matchesSearch(text) {
    var q = String(searchQuery || '')
      .trim()
      .toLowerCase();
    if (!q) return true;
    return String(text || '')
      .toLowerCase()
      .indexOf(q) >= 0;
  }

  function autoCreateBarHtml() {
    var label = '';
    if (activeTab === 'cursor') label = t('keysAutoCreateCursor', '按方案补全 Cursor 快捷键');
    else if (activeTab === 'softPad') label = t('keysAutoCreateSoftPad', '自动准备本习惯虚拟键盘');
    else if (activeTab === 'voice') label = t('keysAutoCreateVoice', '套用当前习惯方案');
    if (!label) return '';
    return (
      '<button type="button" class="keys-channel-add-shortcut" data-auto-create="' +
      esc(activeTab) +
      '">' +
      esc(label) +
      '</button>'
    );
  }

  function suggestedSchemeId() {
    var m = mappingById(selectedMappingId());
    var app = m && String(m.appTargetId || '').trim();
    if (app === 'cursor-chat') return 'cursor-dev';
    if (app === 'codex-chat' || app === 'claude-code') return 'cursor-dev';
    return 'writing';
  }

  function autoCreateForTab(ch) {
    if (ch === 'voice') {
      var tplApi = global.OneToneKeysWorkflowTemplates;
      if (tplApi && tplApi.applyTemplate) {
        return Promise.resolve(tplApi.applyTemplate(suggestedSchemeId())).then(function () {
          refresh();
        });
      }
      return Promise.resolve();
    }
    if (ch === 'softPad') {
      prepareSoftPadScopeScenario();
      return Promise.resolve();
    }
    if (ch !== 'cursor') return Promise.resolve();
    var Ad = global.OneToneActionBindingAdapters;
    var mid = selectedMappingId();
    var m = mappingById(mid);
    if (!Ad || !Ad.key || !Ad.key.upsert || !mid || !m) {
      toast(t('keysActionKeyNeedHabit', '请先选择一个习惯'));
      return Promise.resolve();
    }
    var jobs = [];
    var gi;
    for (gi = 0; gi < CURSOR_COMMAND_GROUPS.length; gi++) {
      var items = CURSOR_COMMAND_GROUPS[gi].items || [];
      var ii;
      for (ii = 0; ii < items.length; ii++) {
        var item = items[ii];
        if (!item || item.gated) continue;
        var actionId = cursorItemActionId(item);
        var hint = String(item.chordHint || '').trim();
        if (!actionId || !hint) continue;
        if (findKeyBinding(m, actionId, '')) continue;
        jobs.push(Ad.key.upsert(mid, actionId, hint, null));
      }
    }
    return Promise.all(jobs).then(function () {
      toast(
        jobs.length
          ? t('keysAutoCreateCursorDone', '已按方案补全 Cursor 快捷键')
          : t('keysAutoCreateCursorNone', '没有可补全的 Cursor 快捷键')
      );
      refresh();
    });
  }

  function renderPanelOnly() {
    var panel = document.getElementById('keysChannelPanel');
    if (!panel) return;
    syncOpenChrome();
    if (activeTab === 'ime' || activeTab === 'key') {
      renderKeyFinishHosts();
      syncCaptureRecordChrome();
    }
    if (activeTab === 'ime' && global.OneToneImePresets && global.OneToneImePresets.refresh) {
      try {
        global.OneToneImePresets.refresh('mapping');
      } catch (_) {}
    }
    if (activeTab === 'ime') {
      panel.innerHTML = '';
      if (panel.classList) panel.classList.remove('is-softpad-pick');
      syncSoftPadTargetChrome(false);
      return;
    }
    if (activeTab === 'key') {
      panel.innerHTML = '';
      if (panel.classList) panel.classList.remove('is-softpad-pick');
      syncSoftPadTargetChrome(false);
      return;
    }
    panel.innerHTML = autoCreateBarHtml();
    if (activeTab === 'cursor') {
      var wrap = document.createElement('div');
      wrap.className = 'keys-channel-section';
      panel.appendChild(wrap);
      renderCursorCommandsPanel(wrap);
      return;
    }
    if (activeTab === 'softPad') {
      var padWrap = document.createElement('div');
      padWrap.className = 'keys-channel-section';
      panel.appendChild(padWrap);
      renderSoftPadKeyboardPanel(padWrap);
      return;
    }
    if (panel.classList) panel.classList.remove('is-softpad-pick');
    syncSoftPadTargetChrome(false);
    var listWrap = document.createElement('div');
    listWrap.className = 'keys-channel-section';
    listWrap.innerHTML = renderListChannelHtml(activeTab === 'camera' ? 'camera' : 'voice');
    panel.appendChild(listWrap);
  }

  function guideToFinish() {
    setActiveTab('ime');
    toast(
      t('keysVoiceBridgeEndToast', '结束/发送请在「快捷键」标签配置按键收尾，不在识别区重复建键')
    );
  }

  function guideToIme() {
    clearSelection({ skipRender: true });
    setActiveTab('ime');
    if (global.OneToneMappingList && global.OneToneMappingList.renderEditor) {
      try {
        global.OneToneMappingList.renderEditor();
      } catch (_) {}
    }
    toast(t('keysVoiceBridgeImeToast', '已切换到输入方式 · 点选输入法设置识别键'));
  }

  function setActiveTab(ch, opts) {
    if (TABS.indexOf(ch) < 0) return;
    opts = opts || {};
    var prev = activeTab;
    activeTab = ch;
    openPanels[ch] = true;
    if (ch === 'ime' && selection) {
      clearSelection({ skipRender: true, skipHero: !!(opts && opts.skipHeroClear) });
      if (!(opts && opts.skipHeroClear) && global.OneToneMappingList && global.OneToneMappingList.renderEditor) {
        try {
          global.OneToneMappingList.renderEditor();
        } catch (_) {}
      }
    }
    var scopeBefore = softPadScopeAppId;
    if (ch === 'softPad' && isGlobalKeysEditContext()) {
      ensureSoftPadScopeSession();
      maybeAutoPreselectSoftPadScope();
      ensureSoftPadDefaultScope();
    } else if (!openPanels.softPad) {
      syncSoftPadTargetChrome(false);
    }
    if (!(opts && opts.skipRender) || prev !== ch) {
      if (
        ch === 'softPad' &&
        isGlobalKeysEditContext() &&
        (prev !== 'softPad' || scopeBefore !== softPadScopeAppId)
      ) {
        return refresh();
      }
      renderPanelOnly();
    }
    syncCaptureRecordChrome();
  }

  function onSoftPadKeyClick(keyEl, ev) {
    if (!keyEl) return;
    if (
      keyEl.classList &&
      keyEl.classList.contains('is-disabled')
    ) {
      return;
    }
    if (keyEl.getAttribute('aria-disabled') === 'true') return;
    var ctx = resolveSoftPadScope();
    if (!ctx || !ctx.targetMappingId) return;
    var mid = String(ctx.targetMappingId);
    var m = mappingById(mid);
    if (!m) return;
    var microId = String(keyEl.getAttribute('data-micro-key') || '').trim();
    var resolved = resolveMigratableAction(m, microId);
    if (!resolved) return;

    if (
      selection &&
      selection.mappingId === mid &&
      selection.sourceChannel === 'softPad' &&
      selection.sourceBindingRef === microId
    ) {
      clearSelection();
      toast(t('codexCapDeselected', '已恢复语音识别键显示'));
      if (global.OneToneMappingList && global.OneToneMappingList.renderEditor) {
        global.OneToneMappingList.renderEditor();
      }
      return;
    }

    var iconEl = keyEl.querySelector && keyEl.querySelector('.micro-hw__icon');
    var iconHtml = iconEl ? String(iconEl.outerHTML || '') : '';
    var forceRecord = !!(ev && (ev.altKey || ev.shiftKey));
    setSelection({
      mappingId: mid,
      sourceChannel: 'softPad',
      sourceBindingRef: microId,
      actionId: resolved.actionId,
      keyBindingRef: resolved.keyBindingRef || '',
      actionInstanceId: resolved.actionInstanceId || '',
      actionArgs: resolved.actionArgs,
      iconHtml: iconHtml
    });

    var keyB = findKeyBinding(m, resolved.actionId, resolved.actionInstanceId);
    var chord = keyB ? String(keyB.triggerBinding || '').trim() : '';
    var label = actionLabel(resolved.actionId);
    var scopeBit = ctx.title ? ctx.title + ' · ' : '';
    toast(
      t('codexCapLoadedToKeycap', '已加载到识别键') +
        ' · ' +
        scopeBit +
        label +
        (chord ? ' · ' + friendlyChord(chord) : ' · ' + t('keysHeroActionNeedsKey', '待设置快捷键'))
    );
    if (forceRecord || !chord) {
      recordSelected();
    }
  }

  function onItemClick(btn, ev) {
    if (!btn || btn.disabled) return;
    var channel = btn.getAttribute('data-channel') || activeTab;
    var mid = selectedMappingId();
    if (channel === 'cursor') {
      if (btn.getAttribute('data-gated') === '1') {
        toast(t('keysChannelCursorGatedToast', '接受类需开启 gate 后才可绑定'));
        return;
      }
      var slotId = btn.getAttribute('data-cursor-slot') || btn.getAttribute('data-binding-ref') || '';
      var cursorActionId = canonicalActionId(btn.getAttribute('data-action-id') || '') || slotId;
      if (!slotId || !cursorActionId) return;
      if (!mid) {
        toast(t('keysActionKeyNeedHabit', '请先选择一个习惯'));
        return;
      }
      if (
        selection &&
        selection.mappingId === mid &&
        selection.sourceChannel === 'cursor' &&
        selection.sourceBindingRef === slotId
      ) {
        clearSelection();
        toast(t('codexCapDeselected', '已恢复语音识别键显示'));
        if (global.OneToneMappingList && global.OneToneMappingList.renderEditor) {
          global.OneToneMappingList.renderEditor();
        }
        return;
      }
      var mapCur = mappingById(mid);
      var keyBCur = findKeyBinding(mapCur, cursorActionId, '');
      var forceRecordCur = !!(ev && (ev.altKey || ev.shiftKey));
      setSelection({
        mappingId: mid,
        sourceChannel: 'cursor',
        sourceBindingRef: slotId,
        actionId: cursorActionId,
        keyBindingRef: keyBCur ? String(keyBCur.slotId || '') : '',
        actionInstanceId: (keyBCur && keyBCur.actionInstanceId) || '',
        actionArgs: keyBCur && keyBCur.actionArgs ? keyBCur.actionArgs : null
      });
      var nameEl = btn.querySelector('.keys-channel-item-name');
      selectionToast(
        nameEl ? nameEl.textContent : cursorItemLabel({ labelZh: slotId, labelEn: slotId }),
        !!(keyBCur && keyBCur.triggerBinding)
      );
      if (forceRecordCur) recordSelected();
      return;
    }
    if (channel === 'key') {
      if (!mid) return;
      var keyRef = btn.getAttribute('data-binding-ref') || '';
      var keyActionId = canonicalActionId(btn.getAttribute('data-action-id') || '');
      var keyInst = btn.getAttribute('data-action-instance-id') || '';
      if (!keyRef || !keyActionId) return;
      if (
        selection &&
        selection.mappingId === mid &&
        selection.keyBindingRef === keyRef &&
        selection.actionId === keyActionId
      ) {
        clearSelection();
        toast(t('codexCapDeselected', '已恢复语音识别键显示'));
        if (global.OneToneMappingList && global.OneToneMappingList.renderEditor) {
          global.OneToneMappingList.renderEditor();
        }
        return;
      }
      var mapKey = mappingById(mid);
      var keyRow = findKeyBinding(mapKey, keyActionId, keyInst);
      setSelection({
        mappingId: mid,
        sourceChannel: 'key',
        sourceBindingRef: keyRef,
        actionId: keyActionId,
        keyBindingRef: keyRef,
        actionInstanceId: keyInst || (keyRow && keyRow.actionInstanceId) || '',
        actionArgs: keyRow && keyRow.actionArgs ? keyRow.actionArgs : null
      });
      selectionToast(actionLabel(keyActionId), !!(keyRow && keyRow.triggerBinding));
      return;
    }
    if (channel === 'softPad') {
      var ctx = resolveSoftPadScope();
      if (!ctx || !ctx.targetMappingId) return;
      mid = ctx.targetMappingId;
    }
    if (!mid) return;
    var ref = btn.getAttribute('data-binding-ref') || '';
    var actionId = canonicalActionId(btn.getAttribute('data-action-id') || '');
    var actionInstanceId = btn.getAttribute('data-action-instance-id') || '';
    var argsChord = btn.getAttribute('data-action-args-chord') || '';
    if (!actionId || !ref) return;
    if (bindableByAction[actionId] === false) return;

    if (
      selection &&
      selection.mappingId === mid &&
      selection.sourceChannel === channel &&
      selection.sourceBindingRef === ref
    ) {
      clearSelection();
      toast(t('codexCapDeselected', '已恢复语音识别键显示'));
      if (global.OneToneMappingList && global.OneToneMappingList.renderEditor) {
        global.OneToneMappingList.renderEditor();
      }
      return;
    }

    var m = mappingById(mid);
    var keyB = findKeyBinding(m, actionId, actionInstanceId);
    var forceRecord = !!(ev && (ev.altKey || ev.shiftKey));
    var sourceRef = ref;
    setSelection({
      mappingId: mid,
      sourceChannel: channel,
      sourceBindingRef: sourceRef,
      actionId: actionId,
      keyBindingRef: keyB ? String(keyB.slotId || '') : '',
      actionInstanceId: actionInstanceId || (keyB && keyB.actionInstanceId) || '',
      actionArgs:
        argsChord
          ? { chord: argsChord }
          : keyB && keyB.actionArgs
            ? keyB.actionArgs
            : null
    });

    var chord = keyB ? String(keyB.triggerBinding || '').trim() : '';
    var displayName =
      ref.indexOf('voice-lifecycle:') === 0 || ref.indexOf('open-app-acoustic:') === 0
        ? btn.querySelector('.keys-channel-item-name')
          ? btn.querySelector('.keys-channel-item-name').textContent
          : actionLabel(actionId)
        : actionLabel(actionId);
    selectionToast(displayName, !!chord);

    if (forceRecord || !chord) {
      recordSelected();
    }
  }

  function recordSelected() {
    if (!hasSelection()) return Promise.resolve(false);
    var snap = {
      mappingId: String(selection.mappingId || ''),
      actionId: String(selection.actionId || ''),
      actionInstanceId: selection.actionInstanceId
        ? String(selection.actionInstanceId)
        : '',
      actionArgs: selection.actionArgs || null,
      keyBindingRef: selection.keyBindingRef ? String(selection.keyBindingRef) : '',
      sourceBindingRef: selection.sourceBindingRef
        ? String(selection.sourceBindingRef)
        : '',
      sourceChannel: selection.sourceChannel
        ? String(selection.sourceChannel)
        : '',
      scopeTitle: ''
    };
    var mid = snap.mappingId;
    var m = mappingById(mid);
    if (!m || !snap.actionId) return Promise.resolve(false);
    if (snap.sourceChannel === 'softPad' && !canRecordSoftPadSelection({ targetMappingId: mid })) {
      return Promise.resolve(false);
    }
    if (bindableByAction[snap.actionId] === false) {
      toast(channelOnlyLabel(snap.sourceChannel));
      return Promise.resolve(false);
    }
    var rec = global.OneToneMappingRecording;
    if (!rec || !rec.startAgentBinding) return Promise.resolve(false);
    if (rec.mode && rec.mode() !== 'none') return Promise.resolve(false);

    var scopeAtStart = resolveSoftPadScope();
    if (scopeAtStart && scopeAtStart.globalProxy && scopeAtStart.title) {
      snap.scopeTitle = String(scopeAtStart.title);
    }

    recordSnap = snap;
    var prevLock = scopeLock;
    scopeLock = 'record';

    var table = global.OneToneHabitKeyMappingTable;
    var host =
      (table && table.recordingChromeHostEl && table.recordingChromeHostEl()) ||
      document.getElementById('habitKeyMapCellTarget');
    if (host) host.classList.add('is-recording');
    if (table && table.syncCaptureRecordingChrome) {
      try {
        table.syncCaptureRecordingChrome();
      } catch (_) {}
    }
    var excludeRef = snap.keyBindingRef || '';
    var upsertOpts = {
      bindingRef: snap.keyBindingRef ? snap.keyBindingRef : null,
      actionInstanceId: snap.actionInstanceId || '',
      actionArgs: snap.actionArgs || null
    };

    function endRecordLock() {
      recordSnap = null;
      if (scopeLock === 'record') scopeLock = prevLock === 'record' ? 'manual' : prevLock;
    }

    return Promise.resolve(
      rec.startAgentBinding(mid, {
        onDone: function (chord) {
          if (host) host.classList.remove('is-recording');
          endRecordLock();
          if (table && table.syncCaptureRecordingChrome) {
            try {
              table.syncCaptureRecordingChrome();
            } catch (_) {}
          }
          var next = String(chord || '').trim();
          if (!next) return;
          var mapNow = mappingById(mid);
          var conflict = findChordConflict(mapNow, next, excludeRef);
          if (conflict) {
            if (global.OneToneAgentCapabilityUi && global.OneToneAgentCapabilityUi.conflictToast) {
              global.OneToneAgentCapabilityUi.conflictToast(conflict, next);
            } else {
              toast(
                t('codexCapConflictOther', '快捷键与现有按键冲突，请换一个') +
                  ' · ' +
                  (friendlyChord(next) || next) +
                  ' / ' +
                  (conflict.label || '')
              );
            }
            applyHero();
            return;
          }
          var adapters = global.OneToneActionBindingAdapters;
          if (!adapters || !adapters.key || !adapters.key.upsert) {
            toast('key adapter unavailable');
            return;
          }
          adapters.key
            .upsert(mid, snap.actionId, next, upsertOpts)
            .then(function () {
              var keyB = findKeyBinding(
                mappingById(mid),
                snap.actionId,
                snap.actionInstanceId
              );
              if (
                selection &&
                selection.mappingId === mid &&
                selection.actionId === snap.actionId &&
                String(selection.actionInstanceId || '') === String(snap.actionInstanceId || '')
              ) {
                selection.keyBindingRef = keyB ? String(keyB.slotId || '') : '';
                if (keyB && keyB.actionInstanceId) {
                  selection.actionInstanceId = String(keyB.actionInstanceId);
                }
              }
              applyHero();
              renderPanelOnly();
              var savedLabel = actionLabel(snap.actionId);
              var savedToast = snap.scopeTitle
                ? t('keysSoftPadScopeSaved', '已为 {app} 设置 {key} → {action}')
                    .replace('{app}', snap.scopeTitle)
                    .replace('{key}', friendlyChord(next))
                    .replace('{action}', savedLabel)
                : t('codexCapLoadedToKeycap', '已加载到识别键') +
                  ' · ' +
                  savedLabel +
                  ' · ' +
                  friendlyChord(next);
              toast(savedToast);
            })
            .catch(function (err) {
              toast(String((err && err.message) || err || 'bind failed'));
            });
        },
        onCancel: function () {
          if (host) host.classList.remove('is-recording');
          endRecordLock();
          applyHero();
        }
      })
    );
  }

  function startAddAppShortcutWizard() {
    var ctx = resolveSoftPadScope();
    var mid =
      ctx && ctx.targetMappingId ? String(ctx.targetMappingId) : selectedMappingId();
    var m = mappingById(mid);
    if (!mid || !m) {
      toast(t('keysAddAppShortcutNeedMapping', '请先选择习惯'));
      return;
    }
    if (!String(m.appTargetId || '').trim()) {
      toast(t('keysAddAppShortcutNeedApp', '请先为习惯指定目标应用'));
      return;
    }
    if (bindableByAction['app.shortcut'] === false) {
      toast(t('keysAddAppShortcutNotBindable', '当前习惯不可绑定应用快捷键'));
      return;
    }
    var rec = global.OneToneMappingRecording;
    if (!rec || !rec.startAgentBinding) {
      toast('recording unavailable');
      return;
    }
    if (rec.mode && rec.mode() !== 'none') return;
    toast(t('keysAddAppShortcutRecordOut', '先录制要发送到应用的快捷键（如 Ctrl+K）'));
    var table = global.OneToneHabitKeyMappingTable;
    var host =
      (table && table.recordingChromeHostEl && table.recordingChromeHostEl()) ||
      document.getElementById('habitKeyMapCellTarget');
    if (host) host.classList.add('is-recording');
    if (table && table.syncCaptureRecordingChrome) {
      try {
        table.syncCaptureRecordingChrome();
      } catch (_) {}
    }
    var wizSnap = {
      mappingId: mid,
      appTargetId: String(m.appTargetId || '')
    };
    recordSnap = wizSnap;
    var prevLock = scopeLock;
    scopeLock = 'record';
    function endWizardLock() {
      recordSnap = null;
      if (scopeLock === 'record') scopeLock = prevLock === 'record' ? 'manual' : prevLock;
      if (table && table.syncCaptureRecordingChrome) {
        try {
          table.syncCaptureRecordingChrome();
        } catch (_) {}
      }
    }
    Promise.resolve(
      rec.startAgentBinding(mid, {
        onDone: function (outChord) {
          if (host) host.classList.remove('is-recording');
          var output = String(outChord || '').trim();
          if (!output) {
            endWizardLock();
            return;
          }
          toast(
            t('keysAddAppShortcutRecordTrigger', '再录制触发键（如 F9）') +
              ' · ' +
              friendlyChord(output)
          );
          if (host) host.classList.add('is-recording');
          Promise.resolve(
            rec.startAgentBinding(mid, {
              onDone: function (trigChord) {
                if (host) host.classList.remove('is-recording');
                endWizardLock();
                var trigger = String(trigChord || '').trim();
                if (!trigger) return;
                var mapNow = mappingById(mid);
                var conflict = findChordConflict(mapNow, trigger, '');
                if (conflict) {
                  toast(
                    t('codexCapConflictOther', '快捷键与现有按键冲突，请换一个') +
                      ' · ' +
                      friendlyChord(trigger)
                  );
                  return;
                }
                var adapters = global.OneToneActionBindingAdapters;
                if (!adapters || !adapters.key || !adapters.key.upsert) {
                  toast('key adapter unavailable');
                  return;
                }
                var instanceId = 'app-shortcut:' + Date.now().toString(36);
                adapters.key
                  .upsert(mid, 'app.shortcut', trigger, {
                    actionInstanceId: instanceId,
                    actionArgs: { chord: output }
                  })
                  .then(function () {
                    setSelection({
                      mappingId: mid,
                      sourceChannel: 'softPad',
                      sourceBindingRef: '',
                      actionId: 'app.shortcut',
                      keyBindingRef: '',
                      actionInstanceId: instanceId,
                      actionArgs: { chord: output }
                    });
                    var keyB = findKeyBinding(mappingById(mid), 'app.shortcut', instanceId);
                    if (selection && keyB) {
                      selection.keyBindingRef = String(keyB.slotId || '');
                      // List identity for secondary row — not a softPad microKey / upsert target.
                      selection.sourceBindingRef = String(keyB.slotId || '');
                    }
                    renderPanelOnly();
                    toast(
                      t('keysAddAppShortcutSaved', '已添加应用快捷键') +
                        ' · ' +
                        friendlyChord(trigger) +
                        ' → ' +
                        friendlyChord(output)
                    );
                  })
                  .catch(function (err) {
                    toast(String((err && err.message) || err || 'bind failed'));
                  });
              },
              onCancel: function () {
                if (host) host.classList.remove('is-recording');
                endWizardLock();
                toast(t('keysAddAppShortcutCancelled', '已取消添加应用快捷键'));
              }
            })
          );
        },
        onCancel: function () {
          if (host) host.classList.remove('is-recording');
          endWizardLock();
          toast(t('keysAddAppShortcutCancelled', '已取消添加应用快捷键'));
        }
      })
    );
  }

  /** ponytail: IPC/options failure — unblock pick UI; upsert may still fail closed later */
  function failOpenSoftPadAuthority(mappingId) {
    var mid = String(mappingId || '').trim();
    if (!mid) return;
    softPadViewsMappingId = mid;
    bindableMappingId = mid;
  }

  function loadBindableMap(mappingId, actionIds) {
    var store = global.OneToneSemanticActionStore;
    if (!store || !store.fetchOptions) {
      bindableByAction = {};
      bindableMappingId = String(mappingId || '').trim();
      actionIds.forEach(function (id) {
        bindableByAction[id] = true;
      });
      return Promise.resolve(bindableByAction);
    }
    return store.ensureCatalog().then(function () {
      return store.fetchOptions(mappingId, 'key', false).then(function (entries) {
        var map = {};
        actionIds.forEach(function (id) {
          map[id] = false;
        });
        (entries || []).forEach(function (e) {
          if (!e || !e.actionId) return;
          if (actionIds.indexOf(e.actionId) >= 0) map[e.actionId] = !!e.bindable;
        });
        // Also accept catalog-only bindable check for ids missing from options rows.
        actionIds.forEach(function (id) {
          if (map[id]) return;
          if (store.isSemanticBindableOnChannel && store.isSemanticBindableOnChannel(id, 'key')) {
            // Options is authoritative when loaded — keep false if option row missing.
            var opt = store.optionFor ? store.optionFor(mappingId, 'key', id) : null;
            map[id] = !!(opt && opt.bindable);
          }
        });
        bindableByAction = map;
        bindableMappingId = String(mappingId || '').trim();
        return map;
      });
    });
  }

  function refresh() {
    var picker = document.getElementById('keysChannelPicker');
    if (!picker) {
      return Promise.resolve();
    }
    ensureSoftPadScopeSession();
    var mid = selectedMappingId();
    syncSelectionToMapping(mid);
    if (!mid || (keysStep() !== 'target' && !capturePopoverOpen)) {
      picker.hidden = keysStep() !== 'target' && !capturePopoverOpen;
      applyHero();
      renderPanelOnly();
      return Promise.resolve();
    }
    picker.hidden = false;
    if (activeTab === 'softPad' && isGlobalKeysEditContext()) {
      maybeAutoPreselectSoftPadScope();
      ensureSoftPadDefaultScope();
    }
    var store = global.OneToneSemanticActionStore;
    var token = ++renderToken;
    var softCtx = resolveSoftPadScope();
    var softMid = softCtx && softCtx.targetMappingId ? String(softCtx.targetMappingId) : '';
    var optionsMid = softMid || mid;
    if (activeTab === 'softPad') {
      softPadViewsCache = [];
      softPadViewsMappingId = '';
      bindableByAction = {};
      bindableMappingId = '';
      renderPanelOnly();
      applyHero();
    }
    if (!store || !store.bindingViews) {
      viewsCache = [];
      softPadViewsCache = [];
      softPadViewsMappingId = '';
      bindableByAction = {};
      bindableMappingId = '';
      renderPanelOnly();
      applyHero();
      return Promise.resolve();
    }

    function finishRefreshRender() {
      if (token !== renderToken) return;
      renderPanelOnly();
      applyHero();
    }

    function handleRefreshFailure(err) {
      if (token !== renderToken) return;
      try {
        console.warn('[keys-channel] refresh failed:', err);
      } catch (_) {}
      failOpenSoftPadAuthority(optionsMid);
      finishRefreshRender();
    }

    return store
      .bindingViews(mid)
      .then(function (rows) {
        if (token !== renderToken) return;
        viewsCache = Array.isArray(rows) ? rows : [];
        var softViewsP =
          softMid && softMid !== mid
            ? store.bindingViews(softMid)
            : Promise.resolve(softMid ? viewsCache : []);
        return softViewsP.then(function (softRows) {
          if (token !== renderToken) return;
          softPadViewsCache = Array.isArray(softRows) ? softRows : [];
          softPadViewsMappingId = softMid;
          var ids = [];
          CHANNEL_TABS.forEach(function (ch) {
            filteredViews(ch).forEach(function (v) {
              var id = viewActionId(v);
              if (id && ids.indexOf(id) < 0) ids.push(id);
            });
          });
          softPadViewsForResolve().forEach(function (v) {
            var id = viewActionId(v);
            if (id && ids.indexOf(id) < 0) ids.push(id);
          });
          var mapM = softPadWorkMapping() || mappingById(mid);
          if (mapM && mapM.codexMicroPad && Array.isArray(mapM.codexMicroPad.keys)) {
            mapM.codexMicroPad.keys.forEach(function (k) {
              if (!k || !k.microKeyId) return;
              var peeked = resolveMigratableAction(mapM, k.microKeyId, { skipBindable: true });
              if (peeked && peeked.actionId && ids.indexOf(peeked.actionId) < 0) {
                ids.push(peeked.actionId);
              }
            });
          }
          [VOICE_LIFECYCLE_IDS.start, VOICE_LIFECYCLE_IDS.cancel, 'app.open', 'app.shortcut'].forEach(
            function (id) {
              if (ids.indexOf(id) < 0) ids.push(id);
            }
          );
          return loadBindableMap(optionsMid, ids).then(finishRefreshRender);
        });
      })
      .catch(handleRefreshFailure);
  }

  function bindOnce() {
    if (bound) return;
    bound = true;
    var panel = document.getElementById('keysChannelPanel');
    var closeBtn = document.getElementById('btnKeysCaptureClose');
    var backdrop = document.getElementById('keysCapturePopoverBackdrop');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        closeCapturePopover({});
      });
    }
    if (backdrop) {
      backdrop.addEventListener('click', function () {
        closeCapturePopover({});
      });
    }
    var keyZone = document.getElementById('keysCaptureKeycapZone');
    if (keyZone) {
      keyZone.addEventListener('click', function (ev) {
        if (!isCapturePopoverOpen() || (activeTab !== 'key' && activeTab !== 'ime')) return;
        if (ev.target && ev.target.closest && ev.target.closest('button,a,input,label')) return;
        var rec = global.OneToneMappingRecording;
        if (rec && rec.mode && rec.mode() !== 'none') return;
        if (hasSelection() && selection.sourceChannel && selection.sourceChannel !== 'key') {
          recordSelected();
          return;
        }
        var table = global.OneToneHabitKeyMappingTable;
        if (table && table.startTargetRecordForKeysPanel) {
          table.startTargetRecordForKeysPanel();
        }
      });
    }
    var tabs = document.getElementById('keysChannelSubtabs');
    if (tabs) {
      tabs.addEventListener('click', function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest('[data-channel]') : null;
        if (!btn || !tabs.contains(btn)) return;
        if (btn.classList.contains('is-codex-hidden') || btn.disabled) return;
        var ch = btn.getAttribute('data-channel');
        if (TABS.indexOf(ch) < 0 || ch === activeTab) return;
        setActiveTab(ch);
      });
    }
    var searchInput = document.getElementById('keysChannelSearch');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        searchQuery = String(searchInput.value || '');
        renderPanelOnly();
      });
    }
    var imeStrip = document.getElementById('keysImeStripWrap');
    if (imeStrip) {
      imeStrip.addEventListener('click', function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest('[data-ime-id]') : null;
        if (!btn || !imeStrip.contains(btn) || btn.getAttribute('data-ime-context') !== 'mapping') {
          return;
        }
        if (!isCapturePopoverOpen() || activeTab !== 'ime') return;
        var id = btn.getAttribute('data-ime-id') || '';
        if (!id) return;
        setSelection(
          {
            mappingId: selectedMappingId(),
            sourceChannel: 'ime',
            sourceBindingRef: id,
            actionId: id,
            keyBindingRef: '',
            actionInstanceId: '',
            actionArgs: null,
            iconHtml: ''
          },
          { skipRender: false }
        );
        toast(t('keysCaptureHeroMapped', '已映射到识别按钮'));
      });
    }
    if (panel) {
      panel.addEventListener('click', function (ev) {
        var autoBtn =
          ev.target && ev.target.closest ? ev.target.closest('[data-auto-create]') : null;
        if (autoBtn && panel.contains(autoBtn)) {
          ev.preventDefault();
          autoCreateForTab(autoBtn.getAttribute('data-auto-create') || activeTab);
          return;
        }
        var imeBtn =
          ev.target && ev.target.closest ? ev.target.closest('[data-bridge-ime]') : null;
        if (imeBtn && panel.contains(imeBtn)) {
          ev.preventDefault();
          guideToIme();
          return;
        }
        var guideBtn =
          ev.target && ev.target.closest ? ev.target.closest('[data-guide-finish]') : null;
        if (guideBtn && panel.contains(guideBtn)) {
          ev.preventDefault();
          guideToFinish();
          return;
        }
        var goSoft =
          ev.target && ev.target.closest ? ev.target.closest('[data-go-softpad]') : null;
        if (goSoft && panel.contains(goSoft)) {
          ev.preventDefault();
          guideToSoftPadSettings();
          return;
        }
        var prepareSoft =
          ev.target && ev.target.closest ? ev.target.closest('[data-softpad-prepare]') : null;
        if (prepareSoft && panel.contains(prepareSoft)) {
          ev.preventDefault();
          prepareSoftPadScopeScenario();
          return;
        }
        var recordSoft =
          ev.target && ev.target.closest ? ev.target.closest('[data-softpad-record]') : null;
        if (recordSoft && panel.contains(recordSoft)) {
          ev.preventDefault();
          recordSelected();
          return;
        }
        var scopeChange =
          ev.target && ev.target.closest ? ev.target.closest('[data-softpad-scope-change]') : null;
        if (scopeChange && panel.contains(scopeChange)) {
          ev.preventDefault();
          autoPreselectHint = false;
          scopeLock = 'manual';
          autoPreselectDone = true;
          renderPanelOnly();
          var chip = panel.querySelector('[data-softpad-scope-app]');
          if (chip && chip.focus) chip.focus();
          return;
        }
        var scopeMapping =
          ev.target && ev.target.closest
            ? ev.target.closest('[data-softpad-scope-mapping]')
            : null;
        if (scopeMapping && panel.contains(scopeMapping)) {
          ev.preventDefault();
          var midPick = scopeMapping.getAttribute('data-softpad-scope-mapping') || '';
          setSoftPadScopeMappingOverride(midPick, { refresh: true });
          return;
        }
        var scopeChip =
          ev.target && ev.target.closest ? ev.target.closest('[data-softpad-scope-app]') : null;
        if (scopeChip && panel.contains(scopeChip)) {
          ev.preventDefault();
          if (scopeLock === 'record' || scopeChip.disabled) return;
          var appId = scopeChip.getAttribute('data-softpad-scope-app') || '';
          setSoftPadScopeAppId(appId, { refresh: true });
          return;
        }
        var addShortcut =
          ev.target && ev.target.closest ? ev.target.closest('[data-add-app-shortcut]') : null;
        if (addShortcut && panel.contains(addShortcut)) {
          ev.preventDefault();
          startAddAppShortcutWizard();
          return;
        }
        var padKey =
          ev.target && ev.target.closest
            ? ev.target.closest('.micro-hw__key[data-micro-key]')
            : null;
        if (padKey && panel.contains(padKey)) {
          ev.preventDefault();
          onSoftPadKeyClick(padKey, ev);
          return;
        }
        var btn = ev.target && ev.target.closest ? ev.target.closest('[data-channel-item]') : null;
        if (!btn || !panel.contains(btn)) return;
        onItemClick(btn, ev);
      });
    }
  }

  function syncImeHeroMarkers() {
    var strip = document.getElementById('imePresetStripMapping');
    if (!strip) return;
    var m = mappingById(selectedMappingId());
    var ref = captureHeroRefForMapping(m);
    strip.querySelectorAll('[data-ime-id]').forEach(function (btn) {
      var id = btn.getAttribute('data-ime-id') || '';
      var on =
        ref.kind === 'imePreset' &&
        ref.channel === 'ime' &&
        ref.bindingRef === id;
      btn.classList.toggle('is-hero-mapped', on);
    });
  }

  function init() {
    bindOnce();
    loadHeroCaptureFromMapping();
    refresh();
  }

  function setCodexImeTabHidden(_hidden) {
    // Scheme D: 输入法 stays in the left catalog for every habit (incl. Codex).
    // Callers may still invoke this; ignore hide requests so the tab cannot vanish.
    imeTabHidden = false;
    syncImeTabChrome();
  }

  global.OneToneKeysChannelCommandPicker = {
    init: init,
    refresh: refresh,
    getSelection: getSelection,
    hasSelection: hasSelection,
    clearSelection: clearSelection,
    setSelection: setSelection,
    selectFromSlotId: selectFromSlotId,
    selectedSlotId: selectedSlotId,
    applyHero: applyHero,
    heroModel: heroModel,
    resolveHeroCapture: resolveHeroCapture,
    loadHeroCaptureFromMapping: loadHeroCaptureFromMapping,
    resolveMigratableAction: resolveMigratableAction,
    resolveSoftPadScope: resolveSoftPadScope,
    setSoftPadScopeAppId: setSoftPadScopeAppId,
    setSoftPadScopeMappingOverride: setSoftPadScopeMappingOverride,
    prepareSoftPadScopeScenario: prepareSoftPadScopeScenario,
    maybeAutoPreselectSoftPadScope: maybeAutoPreselectSoftPadScope,
    ensureSoftPadDefaultScope: ensureSoftPadDefaultScope,
    resetSoftPadScopeSession: resetSoftPadScopeSession,
    getSoftPadScopeLock: function () {
      return scopeLock;
    },
    getSoftPadScopeAppId: function () {
      return softPadScopeAppId;
    },
    previewPadClone: previewPadClone,
    recordSelected: recordSelected,
    onStepChange: onStepChange,
    setCodexImeTabHidden: setCodexImeTabHidden,
    getActiveTab: function () {
      return activeTab;
    },
    isChannelOpen: isChannelOpen,
    setActiveTab: setActiveTab,
    openCapturePopover: openCapturePopover,
    closeCapturePopover: closeCapturePopover,
    isCapturePopoverOpen: isCapturePopoverOpen,
    openCaptureSheet: openCaptureSheet,
    closeCaptureSheet: closeCaptureSheet,
    isCaptureSheetOpen: isCaptureSheetOpen
  };
})(typeof window !== 'undefined' ? window : globalThis);
