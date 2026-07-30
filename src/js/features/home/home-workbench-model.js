/**
 * Phase1：home/workbench 单一表面模型。
 * 五问：状态 / 触发方式 / 目标输入法 / 下一步 / 异常修复入口。
 * paint 只读此源；状态文案/token 必须来自 runtime-status-lexicon 协议小模型。
 */
(function (global) {
  'use strict';

  var CARD_HARD_CAP = 5;

  function t(key) {
    return global.OneToneI18n && global.OneToneI18n.t ? global.OneToneI18n.t(key) : key;
  }

  function lexicon() {
    return global.OneToneRuntimeStatusLexicon || null;
  }

  function unsetLabel() {
    return t('homeLiveUnset');
  }

  function isUnset(v) {
    var s = String(v == null ? '' : v).trim();
    return !s || s === '—' || s === unsetLabel();
  }

  function triggerModeOf(m) {
    return String((m && m.triggerMode) || 'tap').toLowerCase();
  }

  function detectNeedsSetup(hs, summary, raw) {
    if (hs && (hs.ctaMode === 'start' || hs.ctaMode === 'config') && !hs.keyReady) {
      if (isUnset(raw && raw.triggerKey) || isUnset(raw && raw.targetLabel)) return true;
    }
    if (summary && summary.micUnavailable) return true;
    if (summary && summary.engine === 'off' && isUnset(raw && raw.triggerKey)) return true;
    if (isUnset(raw && raw.triggerKey) && isUnset(raw && raw.targetLabel)) return true;
    return false;
  }

  function mapStatusToken(hs, summary, runtime, needsSetup) {
    var lex = lexicon();
    var bits = {
      paused: !!(runtime && runtime.paused),
      dictating: !!(summary && summary.dictating),
      needsSetup: !!needsSetup,
      triggered: !!(summary && summary.statusMode === 'triggered'),
      statusMode: (hs && hs.statusMode) || (summary && summary.statusMode) || 'idle',
    };
    if (lex && typeof lex.fromHomeBits === 'function') {
      var token = lex.fromHomeBits(bits);
      if (needsSetup && token === 'idle') return 'needsSetup';
      return token;
    }
    if (bits.paused) return 'paused';
    if (bits.dictating) return 'dictating';
    if (bits.triggered) return 'triggered';
    if (bits.statusMode === 'error') return 'error';
    if (needsSetup) return 'needsSetup';
    if (bits.statusMode === 'listening' || bits.statusMode === 'active' || bits.statusMode === 'ready') {
      return 'listening';
    }
    return 'idle';
  }

  function buildPrimaryCta(hs, statusToken, needsSetup, protocol) {
    hs = hs || {};
    var ia = global.OneToneShellIaConvergence;
    if (protocol && protocol.canResume) {
      return {
        mode: 'resume',
        labelKey: 'listenResume',
        label: t('listenResume'),
        panel: 'resume',
        focus: null,
        debugMode: null,
      };
    }
    if (statusToken === 'paused') {
      return {
        mode: 'resume',
        labelKey: 'listenResume',
        label: t('listenResume'),
        panel: 'resume',
        focus: null,
        debugMode: null,
      };
    }
    if (statusToken === 'error' || hs.ctaMode === 'error') {
      return {
        mode: 'repair',
        labelKey: 'debugFocusRepair',
        label: (protocol && protocol.repairText) || t('debugFocusRepair'),
        panel: 'debug',
        focus: null,
        debugMode: 'repair',
      };
    }
    if (statusToken === 'needsSetup' || needsSetup) {
      var setupPanel = hs.ctaPanel || 'keys';
      if (ia && ia.isForbiddenHomeCta && setupPanel === 'camera') setupPanel = 'keys';
      return {
        mode: 'setup',
        labelKey: 'homeSetupStart',
        label: hs.ctaMain || t('homeSetupStart'),
        panel: setupPanel,
        focus: hs.ctaFocus || 'trigger',
        debugMode: null,
      };
    }
    var panel = hs.ctaPanel || 'keys';
    if (ia && ia.isForbiddenHomeCta && (panel === 'camera' || ia.isForbiddenHomeCta('camera'))) {
      if (panel === 'camera') panel = 'keys';
    }
    return {
      mode: hs.ctaMode || 'config',
      labelKey: '',
      label: hs.ctaMain || t('homeSetupStart'),
      panel: panel,
      focus: hs.ctaFocus || null,
      debugMode: null,
    };
  }

  function statusTone(statusToken) {
    if (statusToken === 'error') return 'error';
    if (statusToken === 'paused' || statusToken === 'needsSetup') return 'warn';
    if (statusToken === 'dictating' || statusToken === 'listening' || statusToken === 'triggered') {
      return 'ok';
    }
    return 'neutral';
  }

  function buildCards(modelBits) {
    var cards = [];
    cards.push({
      id: 'status',
      title: t('homeWbFlowStatus'),
      body: modelBits.statusLine,
      tone: statusTone(modelBits.statusToken),
    });
    cards.push({
      id: 'trigger',
      title: t('homeWbFlowTrigger'),
      body: modelBits.triggerLabel,
      tone: 'neutral',
    });
    cards.push({
      id: 'target',
      title: t('homeWbFlowTarget'),
      body: modelBits.targetLabel,
      tone: 'neutral',
    });
    cards.push({
      id: 'next',
      title: t('homeWbStatusWork'),
      body: modelBits.cta.label || '—',
      tone: modelBits.cta.mode === 'repair' ? 'error' : 'ok',
    });
    if (modelBits.repair) {
      cards.push({
        id: 'repair',
        title: modelBits.repair.label,
        body: t('debugFocusRepair'),
        tone: 'error',
      });
    }
    return cards.slice(0, CARD_HARD_CAP);
  }

  function signature(parts) {
    return parts.join('\0');
  }

  function emptyProtocol() {
    var lex = lexicon();
    if (lex && typeof lex.protocolSnapshot === 'function') {
      return lex.protocolSnapshot({ statusToken: 'idle', statusLine: '—' });
    }
    return {
      statusToken: 'idle',
      statusText: '—',
      triggerText: '—',
      targetText: '—',
      repairText: '',
      canPause: true,
      canResume: false,
      lastEventText: '',
      ts: Date.now(),
      label: '—',
      detail: '—',
    };
  }

  function buildHomeWorkbenchModel(opts) {
    opts = opts || {};
    var force = !!opts.force;
    if (!global.OneToneHomeV9 || typeof global.OneToneHomeV9.buildViewModel !== 'function') {
      var emptyProto = emptyProtocol();
      return {
        ready: false,
        protocol: emptyProto,
        statusToken: emptyProto.statusToken,
        statusLine: emptyProto.statusText,
        triggerMode: 'tap',
        triggerLabel: emptyProto.triggerText,
        targetLabel: emptyProto.targetText,
        nextActionLabel: '—',
        cta: { mode: 'config', label: '—', panel: 'keys' },
        repair: null,
        canPause: emptyProto.canPause,
        canResume: emptyProto.canResume,
        cards: [],
        cardHardCap: CARD_HARD_CAP,
        sig: 'empty',
        rawVm: null,
        force: force,
      };
    }
    var raw = global.OneToneHomeV9.buildViewModel();
    if (global.OneToneHomeWorkbench && typeof global.OneToneHomeWorkbench.enrichViewModel === 'function') {
      raw = global.OneToneHomeWorkbench.enrichViewModel(raw);
    }
    var hs = raw.hs || {};
    var summary = raw.summary || {};
    var runtime = raw.runtime || (global.OneToneState && global.OneToneState.runtime) || {};
    var needsSetup = detectNeedsSetup(hs, summary, raw);
    var statusToken = mapStatusToken(hs, summary, runtime, needsSetup);

    // Draft surface texts → protocol is the locked source of truth for paint.
    var draftStatus =
      statusToken === 'needsSetup'
        ? t('homeSetupStart')
        : hs.statusLine || summary.statusLine || statusToken;
    var draftTrigger = isUnset(raw.triggerKey) ? unsetLabel() : String(raw.triggerKey);
    var draftTarget = isUnset(raw.targetLabel) ? unsetLabel() : String(raw.targetLabel);
    var habitName = raw.habitName || '';
    if (habitName && habitName !== draftTarget && !isUnset(draftTarget)) {
      draftTarget = habitName + ' · ' + draftTarget;
    }
    var draftRepair =
      statusToken === 'error' || hs.ctaMode === 'error' ? t('debugFocusRepair') : '';

    var lex = lexicon();
    var protocol =
      lex && typeof lex.buildFromWorkbenchInputs === 'function'
        ? lex.buildFromWorkbenchInputs({
            statusToken: statusToken,
            statusText: draftStatus,
            triggerText: draftTrigger,
            targetText: draftTarget,
            repairText: draftRepair,
            paused: !!runtime.paused,
          })
        : lex && typeof lex.protocolSnapshot === 'function'
          ? lex.protocolSnapshot({
              statusToken: statusToken,
              statusLine: draftStatus,
              triggerLabel: draftTrigger,
              targetLabel: draftTarget,
              repair: draftRepair ? { label: draftRepair } : null,
              paused: !!runtime.paused,
            })
          : {
              statusToken: statusToken,
              statusText: draftStatus,
              triggerText: draftTrigger,
              targetText: draftTarget,
              repairText: draftRepair,
              canPause: statusToken !== 'paused' && statusToken !== 'needsSetup',
              canResume: statusToken === 'paused',
              lastEventText: '',
              ts: Date.now(),
              label: draftStatus,
              detail: draftTrigger,
            };

    // Map protocol → paint aliases (single layer; no parallel copy).
    // Maintenance「模拟异常」可挂临时 override，强制三端同读，不改配置。
    var override = global.__otRuntimeStatusOverride;
    if (override && override.statusToken) {
      protocol = override;
    }
    statusToken = protocol.statusToken;
    var statusLine = protocol.statusText;
    var triggerLabel = protocol.triggerText;
    var targetLabel = protocol.targetText;

    var cta = buildPrimaryCta(hs, statusToken, needsSetup, protocol);
    var repair =
      protocol.repairText
        ? {
            mode: 'repair',
            labelKey: 'debugFocusRepair',
            label: protocol.repairText,
            panel: 'debug',
            focus: null,
            debugMode: 'repair',
          }
        : cta.mode === 'repair'
          ? cta
          : null;

    var modelBits = {
      statusToken: statusToken,
      statusLine: statusLine,
      triggerLabel: triggerLabel,
      targetLabel: targetLabel,
      cta: cta,
      repair: repair,
    };
    var cards = buildCards(modelBits);
    var triggerMode = triggerModeOf(raw.m);
    var model = {
      ready: true,
      protocol: protocol,
      statusToken: statusToken,
      statusLine: statusLine,
      statusMode: hs.statusMode || 'idle',
      triggerMode: triggerMode,
      triggerLabel: triggerLabel,
      targetLabel: targetLabel,
      nextActionLabel: cta.label || '—',
      habitName: habitName,
      cta: cta,
      repair: repair,
      needsSetup: !!needsSetup,
      canPause: !!protocol.canPause,
      canResume: !!protocol.canResume,
      lastEventText: protocol.lastEventText || '',
      cards: cards,
      cardHardCap: CARD_HARD_CAP,
      engineLine: raw.engineLine || '',
      micLabel: raw.micLabel || '',
      finishLabel: String(raw.finishPill || raw.finishText || '').trim() || unsetLabel(),
      paused: !!runtime.paused || statusToken === 'paused',
      dictating: !!summary.dictating || statusToken === 'dictating',
      rawVm: raw,
      force: force,
    };
    model.sig = signature([
      model.statusToken,
      model.statusLine,
      model.triggerMode,
      model.triggerLabel,
      model.targetLabel,
      model.nextActionLabel,
      model.cta.mode,
      model.cta.label,
      model.cta.panel,
      model.repair ? model.repair.label : '',
      model.needsSetup ? '1' : '0',
      model.paused ? '1' : '0',
      model.dictating ? '1' : '0',
      model.canPause ? '1' : '0',
      model.canResume ? '1' : '0',
      model.lastEventText || '',
      model.engineLine,
      model.micLabel,
      (raw.compatSnapshot && raw.compatSnapshot.status) || '',
    ]);
    return model;
  }

  global.OneToneHomeWorkbenchModel = {
    build: buildHomeWorkbenchModel,
    CARD_HARD_CAP: CARD_HARD_CAP,
  };
})(typeof window !== 'undefined' ? window : globalThis);
