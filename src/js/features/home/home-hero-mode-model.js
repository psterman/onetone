/**
 * Home Hero 四模式投影：纯展示模型。
 * 不读 DOM / 不写 storage / 不 dispatch；输入由调用方一次采集。
 */
(function (global) {
  'use strict';

  var MODES = ['voice', 'keys', 'softPad', 'camera'];

  function normalizeMode(mode) {
    var raw = String(mode || '').trim();
    var low = raw.toLowerCase();
    if (low === 'keys' || low === 'camera') return low;
    if (low === 'softpad' || low === 'soft_pad') return 'softPad';
    return 'voice';
  }

  function unsetLabel(t) {
    return t('homeLiveUnset');
  }

  function isUnset(v, t) {
    var s = String(v == null ? '' : v).trim();
    return !s || s === '—' || s === unsetLabel(t);
  }

  function statusTone(token) {
    if (token === 'error') return 'error';
    if (token === 'paused' || token === 'needsSetup') return 'warn';
    if (token === 'dictating' || token === 'listening' || token === 'triggered') return 'live';
    if (token === 'ready') return 'ready';
    return 'idle';
  }

  function cameraPresenceLabel(presence, t) {
    if (presence === 'present') return t('homeWbCameraPresencePresent');
    if (presence === 'away') return t('homeWbCameraPresenceAway');
    return t('homeWbCameraPresenceIdle');
  }

  function cameraChannelLabel(cam, t) {
    if (!cam || !cam.enabled) return t('homeWbCameraOff');
    if (cam.actionsLine) return cam.actionsLine;
    if (cam.running || cam.status === 'running') return t('homeWbCameraOn');
    var base = t('homeWbCameraConfiguredIdle', '已配置 · 未运行');
    if (cam.lastError && cam.lastError.message) return base + ' · ' + cam.lastError.message;
    if (cam.manualStopped || cam.status === 'manual_stopped') {
      return t('homeWbCameraManualStopped', '已配置 · 未运行（已手动停止）');
    }
    return base;
  }

  function cameraChannelTone(cam) {
    if (!cam || !cam.enabled) return { pill: 'is-muted', hero: 'is-standby', live: false };
    if (cam.running || cam.status === 'running') return { pill: 'is-ok', hero: 'is-ok', live: true };
    return { pill: 'is-warn', hero: 'is-standby', live: false };
  }

  function enginePillLabel(vm, t) {
    var summary = (vm && vm.summary) || {};
    if (summary.engine === 'off') return t('homeWbVoiceOff');
    if (summary.statusMode === 'error' || (vm && vm.engineStatus === t('homeV9EngineOffline'))) {
      return t('homeWbVoiceOffline');
    }
    if (summary.engine === 'sapi') {
      var sapiSuffix =
        summary.statusMode === 'listening' ? t('homeWbVoiceWaitingWake') : t('homeWbVoiceReady');
      return t('homeWbVoiceSystem') + ' · ' + sapiSuffix;
    }
    var base = (vm && vm.engineLine) || '';
    var split = base.indexOf(' · ');
    if (split >= 0) base = base.slice(0, split);
    var suffix =
      summary.statusMode === 'listening' ? t('homeWbVoiceWaitingWake') : t('homeWbVoiceReady');
    return (base || t('homeWbHeroEngineOnline')) + ' · ' + suffix;
  }

  function tabFor(mode, t) {
    if (mode === 'keys') {
      return { label: t('homeWbHeroModeKeys'), hint: t('homeWbHeroHintKeys') };
    }
    if (mode === 'softPad') {
      return { label: t('homeWbHeroModeSoftPad'), hint: t('homeWbHeroHintSoftPad') };
    }
    if (mode === 'camera') {
      return { label: t('homeWbHeroModeCamera'), hint: t('homeWbHeroHintCamera') };
    }
    return { label: t('homeWbHeroModeVoice'), hint: t('homeWbHeroHintVoice') };
  }

  function localActionFor(mode, t) {
    if (mode === 'keys') {
      return {
        id: 'open-keys-settings',
        label: t('homeWbFlowCtaKeys'),
        enabled: true,
        kind: 'settings',
        panel: 'keys',
      };
    }
    if (mode === 'softPad') {
      return {
        id: 'open-softPad-settings',
        label: t('homeWbFlowCtaSoftPad'),
        enabled: true,
        kind: 'settings',
        panel: 'softPad',
      };
    }
    if (mode === 'camera') {
      return {
        id: 'open-camera-settings',
        label: t('homeWbFlowCtaCamera'),
        enabled: true,
        kind: 'settings',
        panel: 'camera',
      };
    }
    return {
      id: 'open-voice-settings',
      label: t('homeWbFlowCtaVoice'),
      enabled: true,
      kind: 'settings',
      panel: 'voiceWake',
    };
  }

  function flowBits(mode, workbench, vm, camera, softPad, t) {
    workbench = workbench || {};
    vm = vm || {};
    var trigger = workbench.triggerLabel || unsetLabel(t);
    var target = workbench.targetLabel || unsetLabel(t);
    var next = localActionFor(mode, t).label;
    var repair = workbench.repair && workbench.repair.label ? workbench.repair.label : '';

    if (mode === 'voice') {
      var micOk =
        vm.micLabel &&
        vm.micLabel !== t('homeLiveMicUnset') &&
        vm.micLabel !== t('homeLiveMicUnknown');
      if (!micOk) trigger = t('homeWbFlowEmptyMic');
      else if (vm.wakePrimary && vm.wakePrimary !== unsetLabel(t)) trigger = vm.wakePrimary;
      else if (vm.summary && vm.summary.engine && vm.summary.engine !== 'off') {
        trigger = enginePillLabel(vm, t);
      }
    } else if (mode === 'keys') {
      var trig = vm.triggerKey || '';
      if (trig && trig !== unsetLabel(t)) trigger = trig;
      else trigger = t('homeWbFlowEmptyKeys');
    } else if (mode === 'softPad') {
      if (softPad && (softPad.controlLine || softPad.configLine)) {
        trigger = softPad.controlLine || softPad.value || trigger;
        target = softPad.configLine || softPad.configLbl || target;
      } else if (softPad && (softPad.empty || softPad.schemeCount === 0)) {
        trigger = t('homeWbFlowEmptySoftPad');
        target = t('homeWbChannelUnset');
      } else {
        trigger = (softPad && (softPad.value || softPad.boundName)) || trigger;
        target = (softPad && softPad.boundName) || target;
      }
    } else if (mode === 'camera') {
      if (!camera || !camera.enabled) trigger = t('homeWbFlowEmptyCamera');
      else trigger = cameraChannelLabel(camera, t) || trigger || t('homeWbHeroModeCamera');
      if (camera && camera.bound) {
        target = t('homeWbCameraBoundCount').replace('{n}', String(camera.bound));
      }
    }

    return { trigger: trigger, target: target, next: next, repair: repair || undefined };
  }

  function pillsFor(mode, vm, camera, softPad, t) {
    vm = vm || {};
    var paused = !!(vm.runtime && vm.runtime.paused);
    var out = [];

    if (mode === 'camera') {
      var tone = cameraChannelTone(camera);
      out.push({
        id: 'camera-status',
        label: cameraLiveStatusShort(camera, t),
        tone: tone.pill,
      });
      out.push({
        id: 'camera-presence',
        label: cameraPresenceLabel(camera && camera.presence, t),
        tone: 'is-presence',
      });
      out.push({
        id: 'open-camera-settings',
        label: t('homeWbFlowCtaCamera'),
        tone: 'is-solo',
        action: 'open-camera-settings',
      });
      return out;
    }

    if (mode === 'softPad') {
      var cfgOk = !!(softPad && softPad.configConfigured);
      var hasControl = !!(softPad && softPad.agentName);
      out.push({
        id: 'softPad-config',
        label:
          (softPad && softPad.configLine) ||
          t('homeWbSoftPadHabitLine', '此习惯：{state}').replace(
            '{state}',
            (softPad && softPad.configLbl) || t('homeWbSoftPadHabitNa', '不含 Soft Pad')
          ),
        tone: cfgOk ? 'is-ok' : 'is-muted',
      });
      out.push({
        id: 'softPad-control',
        label:
          (softPad && softPad.controlLine) ||
          t('homeWbSoftPadControlLine', '当前控制：{state}').replace(
            '{state}',
            (softPad && softPad.controlLbl) || t('homeWbSoftPadControlNone', '暂无')
          ),
        tone: hasControl ? 'is-bound' : 'is-muted',
      });
      out.push({
        id: 'open-softPad-settings',
        label: t('homeWbFlowCtaSoftPad'),
        tone: 'is-solo',
        action: 'open-softPad-settings',
      });
      return out;
    }

    var engineOn = vm.summary && vm.summary.engine && vm.summary.engine !== 'off';
    if (engineOn) {
      var engOk =
        vm.summary.statusMode !== 'error' && vm.engineStatus !== t('homeV9EngineOffline');
      out.push({
        id: 'engine',
        label: enginePillLabel(vm, t),
        tone: engOk ? 'is-engine is-ok' : 'is-engine is-warn',
      });
    } else {
      out.push({ id: 'engine-off', label: t('homeWbVoiceOff'), tone: 'is-muted' });
    }

    if (mode === 'keys') {
      var key = vm.triggerKey || '';
      if (key && key !== unsetLabel(t)) {
        out.push({ id: 'trigger-key', label: key, tone: 'is-key' });
      }
      out.push({
        id: 'listen-toggle',
        label: paused ? t('homeWbListenResume') : t('homeWbListenPause'),
        tone: paused ? 'is-solo is-paused' : 'is-solo',
        action: 'listen-toggle',
      });
      return out;
    }

    // voice
    var micFull =
      vm.micLabel &&
      vm.micLabel !== t('homeLiveMicUnset') &&
      vm.micLabel !== t('homeLiveMicUnknown')
        ? vm.micLabel
        : t('homeLiveMicUnset');
    out.push({
      id: 'mic',
      label: micFull,
      tone: paused ? 'is-mic is-paused' : 'is-mic',
      action: 'open-mic-settings',
    });
    out.push({
      id: 'listen-toggle',
      label: paused ? t('homeWbListenResume') : t('homeWbListenPause'),
      tone: paused ? 'is-paused' : '',
      action: 'listen-toggle',
    });
    return out;
  }

  function howtoCards(mode, howto, softPad, camera, t) {
    howto = howto || {};
    softPad = softPad || {};
    camera = camera || {};
    var camLabel = cameraChannelLabel(camera, t);
    var micEmpty = !!howto.micEmpty;
    var keysEmpty = !!howto.keysEmpty;
    var wakeEmpty = isUnset(howto.wakeMain, t);

    var voiceValue = t('homeLiveUnset');
    var voiceEmpty = true;
    var voiceEmptyText;
    if (micEmpty) {
      voiceValue = t('homeWbFlowEmptyMic');
      voiceEmptyText = t('homeWbFlowEmptyMic');
    } else if (!wakeEmpty) {
      voiceValue = howto.wakeMain;
      voiceEmpty = false;
    }

    var voiceLines = [];
    if (!micEmpty && howto.micLabel) {
      voiceLines.push({ lbl: t('homeWbHowToMic'), val: String(howto.micLabel) });
    }
    if (howto.cursorArmPhrase) {
      voiceLines.unshift({
        lbl: t('homeCursorArmMetaLbl', '进入聆听'),
        val: String(howto.cursorArmPhrase),
      });
    }

    var keysLines = [];
    if (!keysEmpty && howto.finish && howto.finish !== '—') {
      keysLines.push({ lbl: t('homeWbHowToFinish'), val: howto.finish });
    }

    var softLines = [];
    softLines.push({
      lbl: t('homeWbSoftPadHabitMetaLbl', '此习惯'),
      val: softPad.configLbl || t('homeWbSoftPadHabitNa', '不含 Soft Pad'),
    });
    softLines.push({
      lbl: t('homeWbSoftPadControlMetaLbl', '当前控制'),
      val: softPad.controlLbl || t('homeWbSoftPadControlNone', '暂无'),
    });

    var camLines = [];
    if (camera.enabled) {
      camLines.push({
        lbl: t('homeWbHowToCameraPresence'),
        val: cameraPresenceLabel(camera.presence, t),
      });
      camLines.push({
        lbl: t('homeWbHowToStatus'),
        val:
          camera.running || camera.status === 'running'
            ? t('homeWbCameraOn')
            : t('homeWbCameraConfiguredIdle', '已配置 · 未运行'),
      });
    }

    return [
      {
        mode: 'voice',
        title: t('homeWbHeroModeVoice'),
        value: voiceValue,
        lines: voiceLines.slice(0, 2),
        active: mode === 'voice',
        empty: voiceEmpty,
        emptyText: voiceEmptyText,
      },
      {
        mode: 'keys',
        title: t('homeWbHeroModeKeys'),
        value: keysEmpty ? t('homeWbFlowEmptyKeys') : howto.keysLine || howto.triggerKey || '—',
        lines: keysLines.slice(0, 2),
        artKind: 'keycaps',
        artPayload: howto.triggerKey || '',
        active: mode === 'keys',
        empty: keysEmpty,
        emptyText: keysEmpty ? t('homeWbFlowEmptyKeys') : undefined,
      },
      {
        mode: 'softPad',
        title: t('homeWbHeroModeSoftPad'),
        value:
          softPad.controlLine ||
          softPad.displayPrimary ||
          softPad.value ||
          t('homeWbSoftPadControlLine', '当前控制：{state}').replace(
            '{state}',
            softPad.controlLbl || t('homeWbSoftPadControlNone', '暂无')
          ),
        lines: softLines.slice(0, 2),
        status: softPad.followHint || softPad.status || '',
        artKind: 'softArt',
        active: mode === 'softPad',
        empty: false,
      },
      {
        mode: 'camera',
        title: t('homeWbHeroModeCamera'),
        value: !camera.enabled ? t('homeWbFlowEmptyCamera') : camLabel,
        lines: camLines.slice(0, 2),
        status:
          camera.enabled && camera.bound
            ? t('homeWbCameraBoundCount').replace('{n}', String(camera.bound))
            : camera.enabled
              ? t('homeWbHabitActive')
              : '',
        artKind: 'camDot',
        cameraEnabled: !!camera.enabled,
        cameraRunning: !!(camera.running || camera.status === 'running'),
        active: mode === 'camera',
        empty: !camera.enabled,
        emptyText: !camera.enabled ? t('homeWbFlowEmptyCamera') : undefined,
      },
    ];
  }

  /** Live preview copy for modes without dictation — capability summary, not "click above/below". */
  function liveHintFor(mode, camera, softPad, t) {
    if (mode === 'camera') {
      if (!camera || !camera.enabled) return t('homeWbLiveCameraOffHint', t('homeWbFlowEmptyCamera'));
      if (camera.actionsLine) return String(camera.actionsLine);
      return t('homeWbLiveCameraEmptyHint', '已开启，还没绑定动作 — 再点下方「摄像头确认」去绑定');
    }
    if (mode === 'softPad') {
      if (softPad && softPad.followHint) return String(softPad.followHint);
      if (softPad && softPad.controlLine) return String(softPad.controlLine);
      if (softPad && (softPad.empty || softPad.schemeCount === 0) && !softPad.configLbl) {
        return t('homeWbLiveSoftPadOffHint', t('homeWbFlowEmptySoftPad'));
      }
      var softLine =
        (softPad && (softPad.displayPrimary || softPad.agentName || softPad.boundName || softPad.value)) || '';
      if (softLine) return String(softLine);
      return t('homeWbLiveSoftPadHint');
    }
    return '';
  }

  /** Short ready-state for the flow pill — not the full actionsLine (that lives in liveHint). */
  function cameraLiveStatusShort(cam, t) {
    if (!cam || !cam.enabled) return t('homeWbCameraOff');
    if (cam.running || cam.status === 'running') return t('homeWbCameraReady', '已就绪');
    if (cam.manualStopped || cam.status === 'manual_stopped') {
      return t('homeWbCameraManualStopped', '已配置 · 未运行（已手动停止）');
    }
    return t('homeWbCameraReady', '已就绪');
  }

  function liveStatusFor(mode, vm, camera, softPad, t) {
    if (mode === 'camera') return cameraLiveStatusShort(camera, t);
    if (mode === 'softPad') {
      return (
        (softPad && (softPad.controlLbl || softPad.followHint || softPad.statusLbl)) ||
        t('homeWbSoftPadControlNone', '暂无')
      );
    }
    var paused = !!(vm && vm.runtime && vm.runtime.paused);
    var eng = vm && vm.summary && vm.summary.engine;
    var dictating =
      (vm && vm.vpState === 'DICTATING') || !!(vm && vm.summary && vm.summary.dictating);
    var listening =
      !paused &&
      (dictating ||
        (vm && vm.summary && vm.summary.statusMode === 'listening') ||
        (vm && vm.vpState === 'LISTENING'));
    if (paused) return t('homeWbLivePreviewPaused');
    if (!eng || eng === 'off') return t('homeWbLivePreviewOff');
    if (listening) return t('homeWbLivePreviewListening');
    return t('homeWbLivePreviewStandby');
  }

  /**
   * @param {{
   *   mode: string,
   *   workbench?: object,
   *   vm?: object,
   *   camera?: object,
   *   softPad?: object,
   *   howto?: object,
   *   t?: function
   * }} input
   */
  function buildHomeHeroModeModel(input) {
    input = input || {};
    var t =
      typeof input.t === 'function'
        ? input.t
        : function (k) {
            return k;
          };
    var mode = normalizeMode(input.mode);
    var workbench = input.workbench || {};
    var vm = input.vm || workbench.rawVm || {};
    var camera = input.camera || {};
    var softPad = input.softPad || {};
    var howto = input.howto || {};

    var token = String(workbench.statusToken || 'idle');
    var flow = flowBits(mode, workbench, vm, camera, softPad, t);
    var cards = howtoCards(mode, howto, softPad, camera, t);
    var modePills = pillsFor(mode, vm, camera, softPad, t);
    var preview = null;
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].mode === mode) {
        preview = {
          title: cards[i].title,
          value: cards[i].value,
          meta: (cards[i].lines || []).map(function (m) {
            return m.lbl + ': ' + m.val;
          }),
          empty: !!cards[i].empty,
          emptyText: cards[i].emptyText,
        };
        break;
      }
    }

    var dictating =
      (vm && vm.vpState === 'DICTATING') || !!(vm && vm.summary && vm.summary.dictating);
    var camLive = !!(camera.running || camera.status === 'running');
    var paused = !!(vm.runtime && vm.runtime.paused) || token === 'paused';
    var softPadHasMic = false;
    var cameraSend = false;
    for (var pi = 0; pi < modePills.length; pi++) {
      var pill = modePills[pi];
      if (!pill) continue;
      var id = String(pill.id || '');
      var act = String(pill.action || '');
      if (mode === 'softPad' && (id === 'mic' || act === 'listen-toggle' || id.indexOf('mic') >= 0)) {
        softPadHasMic = true;
      }
      if (/send/i.test(id) || /send/i.test(act) || /confirm-send/i.test(act)) cameraSend = true;
    }

    return {
      mode: mode,
      modes: MODES.slice(),
      tab: tabFor(mode, t),
      status: {
        token: token,
        text: workbench.statusLine || token,
        tone: statusTone(token),
      },
      flow: flow,
      pills: modePills,
      preview: preview || {
        title: tabFor(mode, t).label,
        value: '—',
        meta: [],
        empty: true,
      },
      howtoCards: cards,
      localAction: localActionFor(mode, t),
      liveHint: liveHintFor(mode, camera, softPad, t),
      liveStatus: liveStatusFor(mode, vm, camera, softPad, t),
      chrome: {
        mode: mode,
        hint: tabFor(mode, t).hint,
        isLive: mode === 'camera' ? camLive : !!dictating,
        isPaused: paused,
        cameraRunning: camLive,
      },
      guards: {
        cameraSendClass: cameraSend,
        softPadHasMicPill: softPadHasMic,
        globalCtaIsCamera: !!(workbench.cta && workbench.cta.panel === 'camera'),
      },
    };
  }

  global.OneToneHomeHeroModeModel = {
    build: buildHomeHeroModeModel,
    buildHomeHeroModeModel: buildHomeHeroModeModel,
    normalizeMode: normalizeMode,
    MODES: MODES,
  };
})(typeof window !== 'undefined' ? window : globalThis);
