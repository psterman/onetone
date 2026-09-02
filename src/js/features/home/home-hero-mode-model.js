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

  function howtoStackTip(mode, ctx, t) {
    ctx = ctx || {};
    if (mode === 'voice') {
      var lead = t('homeWbHowToStackVoiceLead', '说话');
      var desc = ctx.micEmpty
        ? t('homeWbHowToStackVoiceDescEmpty', '选好消息筒和唤醒词，就能用说话写进当前窗口')
        : t('homeWbHowToStackVoiceDesc', '说完的话会进到当前正在用的窗口');
      var cur = '';
      if (!ctx.micEmpty && ctx.micLabel) {
        cur = t('homeWbHowToStackCurrentMic', '当前：麦克风 {mic}').replace(
          '{mic}',
          String(ctx.micLabel)
        );
      } else if (!ctx.micEmpty && ctx.wakeMain) {
        cur = t('homeWbHowToStackCurrentWake', '当前：唤醒「{wake}」').replace(
          '{wake}',
          String(ctx.wakeMain)
        );
      }
      return { lead: lead, desc: desc, current: cur };
    }
    if (mode === 'keys') {
      return {
        lead: t('homeWbHowToStackKeysLead', '按键'),
        desc: ctx.keysEmpty
          ? t('homeWbHowToStackKeysDescEmpty', '给这个习惯设一个触发键，按住就能映射')
          : t('homeWbHowToStackKeysDesc', '按住你设的键，就能代替另一个键'),
        current: ctx.keysEmpty
          ? ''
          : t('homeWbHowToStackCurrentKeys', '当前：{mapping}').replace(
              '{mapping}',
              String(ctx.keysLine || ctx.triggerKey || '—')
            ),
      };
    }
    if (mode === 'softPad') {
      return {
        lead: t('homeWbHowToStackSoftPadLead', '屏幕按钮'),
        desc: t(
          'homeWbHowToStackSoftPadDesc',
          '在屏幕上点按钮，控制 Codex / Claude 等 Agent'
        ),
        current: t('homeWbHowToStackCurrentSoftPad', '当前：{control}').replace(
          '{control}',
          String(ctx.controlLbl || t('homeWbSoftPadControlNone', '暂无'))
        ),
      };
    }
    if (mode === 'camera') {
      return {
        lead: t('homeWbHowToStackCameraLead', '摄像头'),
        desc: ctx.enabled
          ? t('homeWbHowToStackCameraDesc', '做手势可以确认、取消或结束语音输入')
          : t(
              'homeWbHowToStackCameraDescEmpty',
              '绑定手势后，可用手势确认或取消说话'
            ),
        current: ctx.enabled
          ? t('homeWbHowToStackCurrentCamera', '当前：{actions}').replace(
              '{actions}',
              String(ctx.actionsLine || '—')
            )
          : '',
      };
    }
    return { lead: '', desc: '', current: '' };
  }

  function howtoCapabilityTip(mode, ctx, t) {
    ctx = ctx || {};
    if (mode === 'voice') {
      if (ctx.micEmpty) {
        return t(
          'homeWbHowToCapVoiceEmpty',
          '说话通道：选择麦克风并配置唤醒方式后，可用语音写入前台应用。'
        );
      }
      var parts = [
        t('homeWbHowToCapVoice', '说话通道：采集语音并写入当前前台应用。'),
      ];
      if (ctx.micLabel) {
        parts.push(
          t('homeWbHowToCapMicCur', '麦克风 {mic}').replace('{mic}', String(ctx.micLabel))
        );
      }
      if (ctx.wakeMain && !isUnset(ctx.wakeMain, t)) {
        parts.push(
          t('homeWbHowToCapWakeCur', '唤醒 {wake}').replace('{wake}', String(ctx.wakeMain))
        );
      }
      if (ctx.cursorArmPhrase) {
        parts.push(
          t('homeWbHowToCapArmCur', '进入聆听 {phrase}').replace(
            '{phrase}',
            String(ctx.cursorArmPhrase)
          )
        );
      }
      return parts.join(' · ');
    }
    if (mode === 'keys') {
      if (ctx.keysEmpty) {
        return t(
          'homeWbHowToCapKeysEmpty',
          '按键通道：为当前习惯绑定触发键与目标键，按住即可映射。'
        );
      }
      var map = ctx.keysLine || ctx.triggerKey || '—';
      var tip = t('homeWbHowToCapKeys', '按键通道：{mapping}').replace('{mapping}', map);
      if (ctx.finish && ctx.finish !== '—') {
        tip +=
          ' · ' +
          t('homeWbHowToCapKeysFinish', '结束 {finish}').replace('{finish}', String(ctx.finish));
      }
      return tip;
    }
    if (mode === 'softPad') {
      var cfg = ctx.configLbl || t('homeWbSoftPadHabitNa', '不含 Soft Pad');
      var ctl = ctx.controlLbl || t('homeWbSoftPadControlNone', '暂无');
      return t(
        'homeWbHowToCapSoftPad',
        '屏幕按钮：此习惯 {config}；当前控制 {control}。'
      )
        .replace('{config}', cfg)
        .replace('{control}', ctl);
    }
    if (mode === 'camera') {
      if (!ctx.enabled) {
        return t(
          'homeWbHowToCapCameraEmpty',
          '摄像头通道：绑定手势或离席动作，用于确认或取消语音输入。'
        );
      }
      var camTip = t('homeWbHowToCapCamera', '摄像头通道：识别姿态并触发已绑定的动作。');
      if (ctx.actionsLine) {
        camTip += ' ' + String(ctx.actionsLine);
      }
      return camTip;
    }
    return '';
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
    if (!wakeEmpty && howto.wakeMain) {
      voiceLines.push({ lbl: t('homeVoiceMapWakeLbl', '唤醒词'), val: String(howto.wakeMain) });
    }
    if (howto.cursorArmPhrase) {
      voiceLines.unshift({
        lbl: t('homeCursorArmMetaLbl', '进入聆听'),
        val: String(howto.cursorArmPhrase),
      });
    }

    var keysLines = [];
    if (!keysEmpty && howto.triggerKey && howto.triggerKey !== '—') {
      keysLines.push({ lbl: t('homeWbHowToTrigger', '触发键'), val: String(howto.triggerKey) });
    }
    if (!keysEmpty && howto.finish && howto.finish !== '—') {
      keysLines.push({ lbl: t('homeWbHowToFinish'), val: howto.finish });
    }

    var keysStatusLbl = keysEmpty
      ? t('homeWbFlowEmptyKeys')
      : howto.keysEnabled === false
        ? t('keysSummaryStatusInactive', '未启用')
        : t('keysSummaryStatusActive', '已启用');

    var softLines = [];
    softLines.push({
      lbl: t('homeWbSoftPadHabitMetaLbl', '此习惯'),
      val: softPad.configLbl || t('homeWbSoftPadHabitNa', '不含 Soft Pad'),
    });
    softLines.push({
      lbl: t('homeWbSoftPadControlMetaLbl', '当前控制'),
      val: softPad.controlLbl || t('homeWbSoftPadControlNone', '暂无'),
    });
    if (softPad.followHint) {
      softLines.push({
        lbl: t('homeWbSoftPadFollowMetaLbl', '跟随'),
        val: String(softPad.followHint),
      });
    }

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
      if (camera.actionsLine) {
        camLines.push({
          lbl: t('homeWbHowToCameraActions', '动作'),
          val: String(camera.actionsLine),
        });
      }
      if (camera.bound) {
        camLines.push({
          lbl: t('homeWbHowToCameraBound', '已绑定'),
          val: t('homeWbCameraBoundCount').replace('{n}', String(camera.bound)),
        });
      }
    }

    var voicePrimary = micEmpty
      ? t('homeWbHowToVoiceUnset', '未选麦克风')
      : !wakeEmpty
        ? String(howto.wakeMain)
        : howto.micLabel
          ? String(howto.micLabel)
          : t('homeWbHowToVoiceReady', '已就绪');
    var voiceState = micEmpty
      ? { lbl: t('homeWbHowToStateUnset', '待设置'), tone: 'is-muted' }
      : { lbl: t('homeWbHowToStateReady', '已配置'), tone: 'is-on' };

    var keysPrimary = keysEmpty
      ? t('homeWbFlowEmptyKeys')
      : howto.keysLine || howto.triggerKey || '—';
    var keysState = keysEmpty
      ? { lbl: t('homeWbHowToStateUnset', '待设置'), tone: 'is-muted' }
      : howto.keysEnabled === false
        ? { lbl: t('keysSummaryStatusInactive', '未启用'), tone: 'is-off' }
        : { lbl: t('keysSummaryStatusActive', '已启用'), tone: 'is-on' };

    var softPrimary =
      softPad.controlLbl ||
      softPad.displayPrimary ||
      t('homeWbSoftPadControlNone', '暂无');
    var softState = softPad.configConfigured
      ? { lbl: t('homeWbHowToStateReady', '已配置'), tone: 'is-on' }
      : softPad.configKind === 'na'
        ? { lbl: t('homeWbSoftPadHabitNa', '不适用'), tone: 'is-muted' }
        : { lbl: t('homeWbHowToStateUnset', '待设置'), tone: 'is-warn' };

    var camPrimary = !camera.enabled
      ? t('homeWbFlowEmptyCamera')
      : camera.actionsLine || camLabel;
    var camState = !camera.enabled
      ? { lbl: t('homeWbHowToStateOff', '未开启'), tone: 'is-muted' }
      : camera.running || camera.status === 'running'
        ? { lbl: t('homeWbCameraOn'), tone: 'is-on' }
        : { lbl: t('homeWbHowToStateReady', '已配置'), tone: 'is-warn' };

    return [
      {
        mode: 'voice',
        title: t('homeWbHeroModeVoice'),
        value: voiceValue,
        primaryLine: voicePrimary,
        stateLabel: voiceState.lbl,
        stateTone: voiceState.tone,
        capabilityTip: howtoCapabilityTip('voice', howto, t),
        stackTip: howtoStackTip('voice', howto, t),
        lines: voiceLines,
        active: mode === 'voice',
        empty: voiceEmpty,
        emptyText: voiceEmptyText,
      },
      {
        mode: 'keys',
        title: t('homeWbHeroModeKeys'),
        value: keysStatusLbl,
        primaryLine: keysPrimary,
        stateLabel: keysState.lbl,
        stateTone: keysState.tone,
        capabilityTip: howtoCapabilityTip('keys', howto, t),
        stackTip: howtoStackTip('keys', howto, t),
        summaryLine: keysEmpty ? '' : howto.keysLine || howto.triggerKey || '—',
        detailValue: keysEmpty ? t('homeWbFlowEmptyKeys') : howto.keysLine || howto.triggerKey || '—',
        lines: keysLines,
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
        primaryLine: softPrimary,
        stateLabel: softState.lbl,
        stateTone: softState.tone,
        capabilityTip: howtoCapabilityTip(
          'softPad',
          {
            configLbl: softPad.configLbl,
            controlLbl: softPad.controlLbl,
          },
          t
        ),
        stackTip: howtoStackTip(
          'softPad',
          {
            configLbl: softPad.configLbl,
            controlLbl: softPad.controlLbl,
          },
          t
        ),
        lines: softLines,
        artKind: 'softArt',
        active: mode === 'softPad',
        empty: false,
      },
      {
        mode: 'camera',
        title: t('homeWbHeroModeCamera'),
        value: !camera.enabled ? t('homeWbFlowEmptyCamera') : camLabel,
        primaryLine: camPrimary,
        stateLabel: camState.lbl,
        stateTone: camState.tone,
        capabilityTip: howtoCapabilityTip(
          'camera',
          {
            enabled: camera.enabled,
            actionsLine: camera.actionsLine,
          },
          t
        ),
        stackTip: howtoStackTip(
          'camera',
          {
            enabled: camera.enabled,
            actionsLine: camera.actionsLine,
          },
          t
        ),
        lines: camLines,
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

  function nodeDetail(fn, logic, data) {
    return { function: fn || '', logic: logic || '', data: data || [] };
  }

  function linearProgress(mode, token) {
    var states = [];
    var pathPct = 0;
    var isLive = false;
    var count = mode === 'voice' ? 3 : 2;
    var i;
    for (i = 0; i < count; i++) {
      states.push({ state: 'idle', live: false });
    }
    if (mode === 'voice') {
      if (token === 'listening' || token === 'triggered') {
        pathPct = 33;
        states[0] = { state: 'done', live: false };
        states[1] = { state: 'active', live: true };
        isLive = true;
      } else if (token === 'dictating') {
        pathPct = 66;
        states[0] = { state: 'done', live: false };
        states[1] = { state: 'active', live: true };
        isLive = true;
      } else if (token === 'ready') {
        pathPct = 100;
        for (i = 0; i < count; i++) states[i] = { state: 'done', live: false };
      }
    } else if (mode === 'keys') {
      if (token === 'triggered' || token === 'dictating') {
        pathPct = 50;
        states[0] = { state: 'active', live: true };
        isLive = true;
      } else if (token === 'ready') {
        pathPct = 100;
        states[0] = { state: 'done', live: false };
        states[1] = { state: 'done', live: false };
      }
    } else if (mode === 'softPad') {
      if (token === 'triggered' || token === 'dictating') {
        pathPct = 50;
        states[0] = { state: 'done', live: false };
        states[1] = { state: 'active', live: true };
        isLive = true;
      } else if (token === 'ready') {
        pathPct = 100;
        for (i = 0; i < count; i++) states[i] = { state: 'done', live: false };
      }
    }
    return { states: states, pathPct: pathPct, isLive: isLive };
  }

  function cameraActionShort(action, t) {
    var s = String(action || '').trim();
    if (!s || s === 'none') return '';
    if (s === 'pressEsc') {
      var e = t('cameraPresenceActionEsc');
      return !e || e === 'cameraPresenceActionEsc' ? 'Esc' : e;
    }
    if (s === 'pressCtrlI') {
      var c = t('homeLiveVoiceTitle');
      return !c || c === 'homeLiveVoiceTitle' ? t('homeWbShowcaseVoiceActivate', '语音激活') : c;
    }
    if (s === 'privacyScreen') {
      var p = t('cameraPresenceActionPrivacy');
      return !p || p === 'cameraPresenceActionPrivacy' ? t('homeWbShowcasePrivacy', '遮罩') : p;
    }
    if (s === 'resumeVoice') {
      var r = t('cameraPresenceActionResume');
      return !r || r === 'cameraPresenceActionResume' ? t('homeWbShowcaseResumeVoice', '恢复语音') : r;
    }
    if (s.indexOf('agent:') === 0) return s.slice(6);
    return s;
  }

  function cameraRuleBits(camera, t) {
    var out = [];
    if (!camera || !camera.prefs) return out;
    var prefs = camera.prefs;
    var tr = prefs.triggers || {};
    function add(id, trigOn, action, title) {
      if (!trigOn || !action || action === 'none') return;
      var short = cameraActionShort(action, t);
      if (!short) return;
      out.push({
        id: id,
        label: title + '→' + short,
        trigger: title,
        action: short,
        active: !!(camera.running || camera.status === 'running'),
        detail: nodeDetail(
          t('homeWbShowcaseCamRuleFn', '识别 {trigger} 后执行动作').replace('{trigger}', title),
          t('homeWbShowcaseCamRuleLogic', '当摄像头检测到 {trigger}').replace('{trigger}', title),
          [
            { lbl: t('homeWbShowcaseCamRuleTrigger', '触发'), val: title },
            { lbl: t('homeWbShowcaseCamRuleAction', '动作'), val: short },
          ]
        ),
      });
    }
    add(
      'shake',
      !!tr.shake,
      prefs.shakeHead,
      t('cameraCardShakeTitle') === 'cameraCardShakeTitle'
        ? t('homeWbShowcaseShake', '摇头')
        : t('cameraCardShakeTitle')
    );
    add('blink', !!tr.blink, prefs.deliberateBlink, t('homeWbShowcaseBlink', '闭眼'));
    add(
      'away',
      !!tr.away,
      prefs.onAway,
      t('cameraPresenceOnAway') === 'cameraPresenceOnAway'
        ? t('homeWbShowcaseAway', '离席')
        : t('cameraPresenceOnAway')
    );
    add(
      'return',
      !!tr.away,
      prefs.onReturn,
      t('cameraPresenceOnReturn') === 'cameraPresenceOnReturn'
        ? t('homeWbShowcaseReturn', '回席')
        : t('cameraPresenceOnReturn')
    );
    add(
      'palm',
      !!tr.openPalm,
      prefs.openPalm,
      t('homeWbCameraPalmShort') === 'homeWbCameraPalmShort'
        ? t('homeWbShowcasePalm', '张掌')
        : t('homeWbCameraPalmShort')
    );
    add(
      'ok',
      !!tr.okHand,
      prefs.okHand,
      t('homeWbCameraOkShort') === 'homeWbCameraOkShort' ? 'OK' : t('homeWbCameraOkShort')
    );
    add(
      'fist',
      !!tr.fist,
      prefs.fist,
      t('homeWbCameraFistShort') === 'homeWbCameraFistShort'
        ? t('homeWbShowcaseFist', '握拳')
        : t('homeWbCameraFistShort')
    );
    add(
      'wave',
      !!tr.wave,
      prefs.wave,
      t('homeWbCameraWaveShort') === 'homeWbCameraWaveShort'
        ? t('homeWbShowcaseWave', '挥手')
        : t('homeWbCameraWaveShort')
    );
    return out;
  }

  function showcaseFocus(mode, token, deviceReady, workbench, vm, camera, softPad, flow, t) {
    var statusText = (workbench && workbench.statusLine) || '';
    if (mode === 'voice') {
      if (!deviceReady) return t('homeWbFlowEmptyMic');
      if (token === 'dictating' && statusText) return statusText;
      if (token === 'dictating') return t('homeWbShowcaseFocusDictating', '正在听写…');
      if (token === 'listening' || token === 'triggered') {
        return t('homeWbShowcaseFocusListening', '等待唤醒词');
      }
      if (token === 'ready') return t('homeWbShowcaseFocusSend', '说「发送」结束');
      if (statusText && statusText !== 'idle') return statusText;
      return t('homeWbShowcaseFocusVoiceIdle', '按快捷键或唤醒词说话');
    }
    if (mode === 'keys') {
      if (!deviceReady) return t('homeWbFlowEmptyKeys');
      if (token === 'triggered') {
        return t('homeWbShowcaseFocusKeysHold', '按住 {key}').replace(
          '{key}',
          flow.trigger || t('homeLiveUnset')
        );
      }
      if (token === 'ready') {
        return t('homeWbShowcaseFocusKeysOut', '输出到 {target}').replace(
          '{target}',
          flow.target || t('homeLiveUnset')
        );
      }
      return flow.trigger && flow.trigger !== unsetLabel(t)
        ? t('homeWbShowcaseFocusKeysHold', '按住 {key}').replace('{key}', flow.trigger)
        : t('homeWbFlowEmptyKeys');
    }
    if (mode === 'softPad') {
      if (token === 'triggered') return t('homeWbShowcaseFocusPadActive', '正在确认 Agent');
      if (token === 'ready') return t('homeWbShowcaseFocusPadDone', '操作已完成');
      return (
        (softPad && (softPad.controlLbl || softPad.displayPrimary)) ||
        t('homeWbShowcaseFocusPadIdle', '屏幕按钮待命')
      );
    }
    if (!deviceReady) return t('homeWbFlowEmptyCamera');
    if (camera.running || camera.status === 'running') {
      return t('homeWbShowcaseFocusCamRun', '监控中');
    }
    if (token === 'triggered') return t('homeWbShowcaseFocusCamTrig', '手势已触发');
    return t('homeWbShowcaseFocusCamIdle', '待命');
  }

  function voiceShowcaseNodes(howto, vm, flow, progress, t) {
    var micEmpty = !!howto.micEmpty;
    var wake =
      !isUnset(howto.wakeMain, t) && howto.wakeMain
        ? String(howto.wakeMain)
        : howto.cursorArmPhrase
          ? String(howto.cursorArmPhrase)
          : t('homeWbShowcaseVoiceWakeUnset', '—');
    var mic =
      !micEmpty && howto.micLabel ? String(howto.micLabel) : t('homeWbFlowEmptyMic');
    var target = flow.target || unsetLabel(t);
    var st = progress.states;
    return [
      {
        id: 'wake',
        label: t('homeWbShowcaseNodeWake', '开启'),
        summary: wake,
        state: st[0].state,
        live: st[0].live,
        detail: nodeDetail(
          t('homeWbShowcaseVoiceWakeFn', '用唤醒词或快捷键进入聆听'),
          t('homeWbShowcaseVoiceWakeLogic', '检测到唤醒词或按下快捷键'),
          [
            { lbl: t('homeVoiceMapWakeLbl', '唤醒词'), val: wake },
            howto.micLabel ? { lbl: t('homeWbHowToMic'), val: mic } : null,
          ].filter(Boolean)
        ),
      },
      {
        id: 'dictate',
        label: t('homeWbShowcaseNodeDictate', '听写'),
        summary: micEmpty ? t('homeWbHowToVoiceUnset', '未选麦克风') : mic,
        state: st[1].state,
        live: st[1].live,
        detail: nodeDetail(
          t('homeWbShowcaseVoiceDictFn', '采集语音并显示实时文字'),
          t('homeWbShowcaseVoiceDictLogic', '聆听期间写入前台应用'),
          [
            { lbl: t('homeWbHowToMic'), val: mic },
            { lbl: t('homeWbShowcaseNodeTarget', '目标'), val: target },
          ]
        ),
      },
      {
        id: 'send',
        label: t('homeWbShowcaseNodeSend', '发送'),
        summary: howto.finish && howto.finish !== '—' ? howto.finish : t('homeWbShowcaseFocusSend', '说「发送」结束'),
        state: st[2].state,
        live: st[2].live,
        detail: nodeDetail(
          t('homeWbShowcaseVoiceSendFn', '结束听写并提交文本'),
          t('homeWbShowcaseVoiceSendLogic', '说出结束口令或松开快捷键'),
          [{ lbl: t('homeWbHowToFinish', '结束'), val: howto.finish || '—' }]
        ),
      },
    ];
  }

  function keysShowcaseNodes(howto, flow, progress, t) {
    var keysEmpty = !!howto.keysEmpty;
    var st = progress.states;
    var trig = keysEmpty ? t('homeWbFlowEmptyKeys') : howto.triggerKey || flow.trigger || '—';
    var out = keysEmpty ? t('homeWbFlowEmptyKeys') : howto.keysLine || flow.target || '—';
    return [
      {
        id: 'trigger',
        label: t('homeWbHowToTrigger', '触发键'),
        summary: trig,
        state: st[0].state,
        live: st[0].live,
        detail: nodeDetail(
          t('homeWbShowcaseKeysTrigFn', '按住触发键开始映射'),
          t('homeWbShowcaseKeysTrigLogic', 'keydown 期间输出目标键'),
          [{ lbl: t('homeWbHowToTrigger', '触发键'), val: trig }]
        ),
      },
      {
        id: 'target',
        label: t('homeWbShowcaseNodeTarget', '输出'),
        summary: out,
        state: st[1].state,
        live: st[1].live,
        detail: nodeDetail(
          t('homeWbShowcaseKeysOutFn', '向当前应用发送目标键'),
          t('homeWbShowcaseKeysOutLogic', '松开触发键后停止'),
          [
            { lbl: t('homeWbShowcaseNodeTarget', '输出'), val: out },
            howto.finish && howto.finish !== '—'
              ? { lbl: t('homeWbHowToFinish'), val: howto.finish }
              : null,
          ].filter(Boolean)
        ),
      },
    ];
  }

  function softPadOutlineFor(softPad, token, flow, t) {
    softPad = softPad || {};
    flow = flow || {};
    var capVals = (softPad && softPad.heroCaps) || {};
    var scenarios = [
      { id: 'standby', label: t('homeWbSpScenarioStandby', '待命'), hint: t('homeWbSpScenarioStandbyHint', '监听前台 Agent') },
      { id: 'confirm', label: t('homeWbSpScenarioConfirm', '待确认'), hint: t('homeWbSpScenarioConfirmHint', '提案等待确认') },
      { id: 'done', label: t('homeWbSpScenarioDone', '已提交'), hint: t('homeWbSpScenarioDoneHint', '指令已发送') },
    ];
    var phaseIdx = token === 'triggered' || token === 'dictating' ? 1 : token === 'ready' ? 2 : 0;
    scenarios = scenarios.map(function (s, i) {
      return {
        id: s.id,
        label: s.label,
        hint: s.hint,
        state: i < phaseIdx ? 'done' : i === phaseIdx ? 'active' : 'idle',
      };
    });
    function cap(id, lbl, sub, detailFn, detailLogic, detailData) {
      return {
        id: id,
        label: lbl,
        sub: sub,
        value: capVals[id] || '—',
        detail: nodeDetail(detailFn, detailLogic, detailData),
      };
    }
    var bindVal = capVals.bind || softPad.boundName || flow.target || '—';
    return {
      scenarios: scenarios,
      capabilities: {
        agent: [
          cap('bind', t('homeWbSpCapBind', '绑定'), t('homeWbSpCapBindSub', '前台应用'), t('homeWbSpCapBindFn', '绑定前台应用'), t('homeWbSpCapBindLogic', '决定 Agent 控制目标'), [{ lbl: t('homeWbSpCapBind', '绑定'), val: bindVal }]),
          cap('scheme', t('homeWbSpCapScheme', '方案'), t('homeWbSpCapSchemeSub', 'Agent 档位'), t('homeWbShowcasePadFn', '点击屏幕悬浮按钮'), t('homeWbShowcasePadLogic', '按钮映射到 Agent 动作'), [{ lbl: t('homeWbSoftPadHabitMetaLbl', '此习惯'), val: capVals.scheme || softPad.configLbl || '—' }]),
          cap('status', t('homeWbSpCapStatus', '状态灯'), t('homeWbSpCapStatusSub', '忙闲指示'), t('homeWbShowcasePadAgentFn', '向 Agent 发送确认/拒绝等指令'), t('homeWbShowcasePadAgentLogic', '根据当前控制目标路由'), [{ lbl: t('homeWbSoftPadControlMetaLbl', '当前控制'), val: capVals.status || softPad.controlLbl || '—' }]),
        ],
        data: [
          cap('account', t('homeWbSpCapAccount', '账号'), t('homeWbSpCapAccountSub', '登录态'), t('homeWbSpCapAccountFn', 'Codex 账号'), t('homeWbSpCapAccountLogic', '未登录时部分能力不可用'), [{ lbl: t('homeWbSpCapAccount', '账号'), val: capVals.account || softPad.agentName || '—' }]),
          cap('quota', t('homeWbSpCapQuota', '额度'), t('homeWbSpCapQuotaSub', 'API 用量'), t('homeWbSpCapQuotaFn', '本周期 API 用量'), t('homeWbSpCapQuotaLogic', '仅本地统计'), [{ lbl: t('homeWbSpCapQuota', '额度'), val: capVals.quota || '—' }]),
          cap('token', t('homeWbSpCapToken', '凭据'), t('homeWbSpCapTokenSub', 'Token'), t('homeWbSpCapTokenFn', 'API Token 配置'), t('homeWbSpCapTokenLogic', '未配置时部分动作不可用'), [{ lbl: t('homeWbSpCapToken', '凭据'), val: capVals.token || '—' }]),
        ],
      },
      hotMicroKeyId: token === 'triggered' || token === 'dictating' ? 'ACT08' : token === 'ready' ? 'ACT12' : 'AG00',
    };
  }

  var CAMERA_GROUP_DEFS = [
    { id: 'presence', ruleIds: ['away', 'return'] },
    { id: 'gesture', ruleIds: ['ok', 'palm', 'shake', 'wave'] },
    { id: 'gaze', ruleIds: ['blink'] },
    { id: 'action', ruleIds: ['fist'] },
  ];

  function cameraRuleTriggerLabel(id, t) {
    if (id === 'shake') {
      return t('cameraCardShakeTitle') === 'cameraCardShakeTitle'
        ? t('homeWbShowcaseShake', '摇头')
        : t('cameraCardShakeTitle');
    }
    if (id === 'blink') return t('homeWbShowcaseBlink', '闭眼');
    if (id === 'away') {
      return t('cameraPresenceOnAway') === 'cameraPresenceOnAway'
        ? t('homeWbShowcaseAway', '离席')
        : t('cameraPresenceOnAway');
    }
    if (id === 'return') {
      return t('cameraPresenceOnReturn') === 'cameraPresenceOnReturn'
        ? t('homeWbShowcaseReturn', '回席')
        : t('cameraPresenceOnReturn');
    }
    if (id === 'palm') {
      return t('homeWbCameraPalmShort') === 'homeWbCameraPalmShort'
        ? t('homeWbShowcasePalm', '张掌')
        : t('homeWbCameraPalmShort');
    }
    if (id === 'ok') {
      return t('homeWbCameraOkShort') === 'homeWbCameraOkShort' ? 'OK' : t('homeWbCameraOkShort');
    }
    if (id === 'fist') {
      return t('homeWbCameraFistShort') === 'homeWbCameraFistShort'
        ? t('homeWbShowcaseFist', '握拳')
        : t('homeWbCameraFistShort');
    }
    if (id === 'wave') {
      return t('homeWbCameraWaveShort') === 'homeWbCameraWaveShort'
        ? t('homeWbShowcaseWave', '挥手')
        : t('homeWbCameraWaveShort');
    }
    return id;
  }

  function cameraRuleSceneHint(id, t) {
    var scenes = {
      away: t('homeWbCamSceneAway', '离开工位'),
      return: t('homeWbCamSceneReturn', '回到座位'),
      ok: t('homeWbCamSceneOk', '提案通过'),
      palm: t('homeWbCamScenePalm', '结束发言'),
      shake: t('homeWbCamSceneShake', '否决方案'),
      wave: t('homeWbCamSceneWave', '打断流程'),
      blink: t('homeWbCamSceneBlink', '快速确认'),
      fist: t('homeWbCamSceneFist', '紧急暂停'),
    };
    return scenes[id] || t('homeWbCamDimLogic', '保持条件达到阈值后触发');
  }

  function cameraRuleCatalogEntry(id, t) {
    var trigger = cameraRuleTriggerLabel(id, t);
    var scene = cameraRuleSceneHint(id, t);
    var unbound = t('homeWbCamRuleUnbound', '未绑定');
    return {
      id: id,
      trigger: trigger,
      action: unbound,
      scene: scene,
      active: false,
      configured: false,
      detail: nodeDetail(
        trigger,
        t('homeWbCamRuleUnboundHint', '在 Camera Pro 设置中绑定动作'),
        [
          { lbl: t('homeWbCamRuleScene', '场景'), val: scene },
          { lbl: t('homeWbHowToStatus'), val: unbound },
        ]
      ),
    };
  }

  function cameraGroupsFor(camera, t) {
    var rules = cameraRuleBits(camera, t);
    var byId = {};
    var i;
    for (i = 0; i < rules.length; i++) byId[rules[i].id] = rules[i];
    var labels = {
      presence: t('homeWbCamDimPresence', '在场'),
      gesture: t('homeWbCamDimGesture', '手势'),
      gaze: t('homeWbCamDimGaze', '眼神'),
      action: t('homeWbCamDimAction', '动作'),
    };
    var subs = {
      presence: t('homeWbCamDimPresenceSub', '离座防护'),
      gesture: t('homeWbCamDimGestureSub', '举手确认'),
      gaze: t('homeWbCamDimGazeSub', '注视确认'),
      action: t('homeWbCamDimActionSub', '头部动作'),
    };
    return CAMERA_GROUP_DEFS.map(function (def) {
      var groupRules = def.ruleIds.map(function (rid) {
        var r = byId[rid];
        if (r) {
          return {
            id: r.id,
            trigger: r.trigger,
            action: r.action,
            scene: cameraRuleSceneHint(r.id, t) || r.action,
            active: r.active,
            configured: true,
            detail: r.detail,
          };
        }
        return cameraRuleCatalogEntry(rid, t);
      });
      var bound = groupRules.filter(function (gr) { return gr.configured; }).length;
      return {
        id: def.id,
        label: labels[def.id] || def.id,
        sub: subs[def.id] || '',
        fn: t('homeWbCamDimFn', '识别 {dim}').replace('{dim}', labels[def.id] || def.id),
        logic: t('homeWbCamDimLogic', '保持条件达到阈值后触发'),
        boundCount: bound,
        slotCount: groupRules.length,
        rules: groupRules,
      };
    });
  }

  function defaultShowcaseSelId(mode, showcase, token) {
    if (!showcase) return '';
    if (mode === 'softPad') return 'status';
    if (mode === 'camera') {
      if (token === 'triggered' && showcase.groups) {
        var gi, ri, g, r;
        for (gi = 0; gi < showcase.groups.length; gi++) {
          g = showcase.groups[gi];
          for (ri = 0; ri < g.rules.length; ri++) {
            r = g.rules[ri];
            if (r.active) return r.id;
          }
        }
      }
      return 'gesture';
    }
    var nodes = showcase.nodes || [];
    var i;
    for (i = 0; i < nodes.length; i++) {
      if (nodes[i].state === 'active') return nodes[i].id;
    }
    for (i = 0; i < nodes.length; i++) {
      if (nodes[i].live) return nodes[i].id;
    }
    return nodes[0] ? nodes[0].id : '';
  }

  function softPadShowcaseNodes(softPad, flow, progress, t) {
    var st = progress.states;
    var agent =
      (softPad && (softPad.controlLbl || softPad.agentName)) ||
      t('homeWbSoftPadControlNone', '暂无');
    var pad =
      (softPad && softPad.configLbl) || t('homeWbSoftPadHabitNa', '不含 Soft Pad');
    return [
      {
        id: 'pad',
        label: t('homeWbShowcaseNodePad', '屏幕'),
        summary: pad,
        state: st[0].state,
        live: st[0].live,
        detail: nodeDetail(
          t('homeWbShowcasePadFn', '点击屏幕悬浮按钮'),
          t('homeWbShowcasePadLogic', '按钮映射到 Agent 动作'),
          [{ lbl: t('homeWbSoftPadHabitMetaLbl', '此习惯'), val: pad }]
        ),
      },
      {
        id: 'agent',
        label: 'Agent',
        summary: agent,
        state: st[1].state,
        live: st[1].live,
        detail: nodeDetail(
          t('homeWbShowcasePadAgentFn', '向 Agent 发送确认/拒绝等指令'),
          t('homeWbShowcasePadAgentLogic', '根据当前控制目标路由'),
          [{ lbl: t('homeWbSoftPadControlMetaLbl', '当前控制'), val: agent }]
        ),
      },
    ];
  }

  function showcaseFor(mode, token, flow, howto, vm, camera, softPad, workbench, t) {
    howto = howto || {};
    vm = vm || {};
    camera = camera || {};
    softPad = softPad || {};
    workbench = workbench || {};
    flow = flow || {};

    if (mode === 'camera') {
      var camRunning = !!(camera.running || camera.status === 'running');
      var camEnabled = !!camera.enabled;
      var presence = cameraPresenceLabel(camera.presence, t);
      var rules = cameraRuleBits(camera, t);
      var chips = rules.slice(0, 2);
      var overflow = Math.max(0, rules.length - 2);
      var camLive = camRunning && camEnabled;
      return {
        kind: 'camera',
        schema: 'multimodal',
        focus: showcaseFocus(mode, token, camEnabled, workbench, vm, camera, softPad, flow, t),
        context: flow.target || unsetLabel(t),
        deviceReady: camEnabled,
        pathPct: 0,
        isLive: camLive || token === 'triggered',
        visual: 'mark',
        nodes: [],
        groups: cameraGroupsFor(camera, t),
        badges: [
          {
            id: 'runtime',
            label: camRunning
              ? t('homeWbCameraOn')
              : t('homeWbShowcaseCamOff', '未运行'),
            tone: camRunning ? 'is-active' : 'is-muted',
            active: camRunning,
            detail: nodeDetail(
              t('homeWbShowcaseCamRunFn', '摄像头后台识别姿态'),
              t('homeWbShowcaseCamRunLogic', '启用后持续分析画面'),
              [
                {
                  lbl: t('homeWbHowToStatus'),
                  val: camRunning
                    ? t('homeWbCameraOn')
                    : t('homeWbCameraConfiguredIdle', '已配置 · 未运行'),
                },
              ]
            ),
          },
          {
            id: 'presence',
            label: presence,
            tone: camera.presence === 'present' ? 'is-present' : 'is-muted',
            active: camera.presence === 'present',
            detail: nodeDetail(
              t('homeWbShowcaseCamPresFn', '检测是否在座'),
              t('homeWbShowcaseCamPresLogic', '离席/回席可触发绑定动作'),
              [{ lbl: t('homeWbHowToCameraPresence'), val: presence }]
            ),
          },
        ],
        chips: chips,
        overflowCount: overflow,
        allChips: rules,
      };
    }

    var progress = linearProgress(mode, token);
    var deviceReady = true;
    if (mode === 'voice') deviceReady = !howto.micEmpty;
    else if (mode === 'keys') deviceReady = !howto.keysEmpty;

    var nodes;
    var visual = 'orb';
    var schema = 'linear-prod';
    var outline = null;
    if (mode === 'voice') {
      nodes = voiceShowcaseNodes(howto, vm, flow, progress, t);
      visual = 'orb';
    } else if (mode === 'keys') {
      nodes = keysShowcaseNodes(howto, flow, progress, t);
      visual = 'mark';
    } else {
      outline = softPadOutlineFor(softPad, token, flow, t);
      nodes = [];
      visual = 'mark';
      schema = 'outline';
    }

    var isLive = progress.isLive && deviceReady;

    return {
      kind: schema === 'outline' ? 'outline' : 'linear',
      schema: schema,
      focus: showcaseFocus(mode, token, deviceReady, workbench, vm, camera, softPad, flow, t),
      context: flow.target || unsetLabel(t),
      deviceReady: deviceReady,
      pathPct: deviceReady ? progress.pathPct : 0,
      isLive: isLive,
      visual: visual,
      nodes: nodes,
      scenarios: outline ? outline.scenarios : [],
      capabilities: outline ? outline.capabilities : null,
      hotMicroKeyId: outline ? outline.hotMicroKeyId : '',
      badges: [],
      chips: [],
      overflowCount: 0,
      allChips: [],
      groups: [],
    };
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

    var showcase = showcaseFor(
      mode,
      token,
      flow,
      howto,
      vm,
      camera,
      softPad,
      workbench,
      t
    );

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
      showcase: showcase,
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
    showcaseFor: showcaseFor,
    defaultShowcaseSelId: defaultShowcaseSelId,
    softPadOutlineFor: softPadOutlineFor,
    cameraGroupsFor: cameraGroupsFor,
    CAMERA_GROUP_DEFS: CAMERA_GROUP_DEFS,
    normalizeMode: normalizeMode,
    MODES: MODES,
  };
})(typeof window !== 'undefined' ? window : globalThis);
