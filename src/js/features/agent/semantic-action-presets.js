/**
 * OneTone semantic presets — FE-only apply via ActionBindingAdapters.
 * Snapshot / restore on failure; preview before write; skip unsupported.
 */
(function (global) {
  'use strict';

  var PRESETS = [
    {
      id: 'voiceCoding',
      nameZh: '语音编码',
      nameEn: 'Voice coding',
      descZh: '语音开始/发送/取消，并保留按键发送兜底',
      descEn: 'Voice start/send/cancel with key send fallback',
      bindings: [
        { channel: 'voice', actionId: 'input.start', trigger: '开始输入' },
        { channel: 'voice', actionId: 'input.send', trigger: '发送' },
        { channel: 'voice', actionId: 'input.cancel', trigger: '取消' },
        { channel: 'key', actionId: 'input.send', trigger: 'Ctrl+Enter' }
      ]
    },
    {
      id: 'visionApprove',
      nameZh: '视觉发起批准',
      nameEn: 'Vision-start approve',
      descZh: '摄像头发起批准，SoftPad/按键第二通道确认（非免手批准）',
      descEn: 'Camera starts approve; SoftPad/Key confirm (not hands-free)',
      bindings: [
        {
          channel: 'camera',
          actionId: 'agent.approve',
          trigger: { bindKey: 'okHand', actionToken: 'agent:agent.approve' }
        },
        { channel: 'softPad', actionId: 'agent.approve', trigger: {} },
        { channel: 'key', actionId: 'agent.approve', trigger: 'Ctrl+Shift+Y' }
      ]
    },
    {
      id: 'agentSafety',
      nameZh: 'Agent 安全控制',
      nameEn: 'Agent safety controls',
      descZh: '中断与拒绝：键/语音中断，SoftPad/摄像头拒绝',
      descEn: 'Interrupt and reject across channels',
      bindings: [
        { channel: 'key', actionId: 'agent.interrupt', trigger: 'Escape' },
        { channel: 'voice', actionId: 'agent.interrupt', trigger: '中断' },
        { channel: 'softPad', actionId: 'agent.reject', trigger: {} },
        {
          channel: 'camera',
          actionId: 'agent.reject',
          trigger: { bindKey: 'shakeHead', actionToken: 'agent:agent.reject' }
        }
      ]
    },
    {
      id: 'awayReturn',
      nameZh: '离开/返回',
      nameEn: 'Away / return',
      descZh: '摄像头离席暂停、返回恢复；SoftPad 暂停/恢复兜底',
      descEn: 'Camera away pauses voice; return resumes; SoftPad fallback',
      bindings: [
        {
          channel: 'camera',
          actionId: 'onetone.pause',
          trigger: { bindKey: 'onAway', actionToken: 'pauseVoice' },
          legacyCamera: true
        },
        {
          channel: 'camera',
          actionId: 'onetone.resume',
          trigger: { bindKey: 'onReturn', actionToken: 'resumeVoice' },
          legacyCamera: true
        },
        { channel: 'softPad', actionId: 'onetone.pause', trigger: {} },
        { channel: 'softPad', actionId: 'onetone.resume', trigger: {} }
      ]
    }
  ];

  function adapters() {
    return global.OneToneActionBindingAdapters;
  }

  function mappingById(id) {
    var cfg = (global.OneToneState && (global.OneToneState.cfg || global.OneToneState.config)) || {};
    var maps = cfg.mappings || [];
    for (var i = 0; i < maps.length; i++) {
      if (maps[i] && maps[i].id === id) return maps[i];
    }
    return null;
  }

  function cloneJson(v) {
    return v == null ? null : JSON.parse(JSON.stringify(v));
  }

  function snapshotBindings(mappingId) {
    var m = mappingById(mappingId);
    if (!m) return null;
    return {
      mappingId: mappingId,
      agentBindings: cloneJson(m.agentBindings || []),
      cameraOverride: cloneJson(m.cameraOverride),
      codexMicroPad: cloneJson(m.codexMicroPad)
    };
  }

  function restoreBindings(snap) {
    if (!snap) return Promise.reject(new Error('no_snapshot'));
    var m = mappingById(snap.mappingId);
    if (!m) return Promise.reject(new Error('no_mapping'));
    m.agentBindings = cloneJson(snap.agentBindings || []);
    m.cameraOverride = snap.cameraOverride ? cloneJson(snap.cameraOverride) : null;
    if (snap.codexMicroPad !== undefined) {
      m.codexMicroPad = snap.codexMicroPad ? cloneJson(snap.codexMicroPad) : null;
    }
    if (global.OneToneConfigPersist && global.OneToneConfigPersist.saveAsync) {
      return global.OneToneConfigPersist.saveAsync();
    }
    return Promise.resolve();
  }

  function presetById(id) {
    for (var i = 0; i < PRESETS.length; i++) {
      if (PRESETS[i].id === id) return PRESETS[i];
    }
    return null;
  }

  function optionsFor(mappingId, channel) {
    var store = global.OneToneSemanticActionStore;
    if (!store || !store.fetchOptions) return Promise.resolve([]);
    return store.fetchOptions(mappingId, channel);
  }

  function findOption(opts, actionId) {
    if (!opts) return null;
    for (var i = 0; i < opts.length; i++) {
      if (opts[i] && opts[i].actionId === actionId) return opts[i];
    }
    return null;
  }

  function softPadNeedsMicroKey(trigger) {
    if (!trigger || typeof trigger !== 'object') return true;
    var mk = String(trigger.microKeyId || trigger.triggerBinding || '').trim();
    return !mk;
  }

  function existingTrigger(mappingId, channel, actionId, trigger) {
    if (channel === 'camera') {
      var m = mappingById(mappingId);
      var ov = m && m.cameraOverride;
      if (!ov) return '';
      var bindKey =
        trigger && typeof trigger === 'object' ? String(trigger.bindKey || '').trim() : '';
      if (bindKey) return ov[bindKey] != null ? String(ov[bindKey]) : '';
      return '';
    }
    var A = adapters();
    if (!A) return '';
    var primary = A.findPrimaryBinding
      ? A.findPrimaryBinding(mappingById(mappingId), channel, actionId)
      : null;
    return primary ? String(primary.triggerBinding || '') : '';
  }

  function pushPreviewItem(items, mappingId, b, status, reason, optsCache) {
    items.push({
      channel: b.channel,
      actionId: b.actionId,
      status: status,
      reason: reason,
      willOverwrite:
        status === 'apply' &&
        !!existingTrigger(mappingId, b.channel, b.actionId, b.trigger),
      trigger: b.trigger
    });
  }

  function preview(mappingId, presetId) {
    var preset = presetById(presetId);
    if (!preset) return Promise.reject(new Error('unknown_preset'));
    var byChannel = {};
    var chain = Promise.resolve();
    var items = [];

    preset.bindings.forEach(function (b) {
      chain = chain.then(function () {
        if (b.channel === 'softPad' && softPadNeedsMicroKey(b.trigger)) {
          pushPreviewItem(items, mappingId, b, 'needs_key', 'needs_micro_key', byChannel);
          return;
        }
        if (b.legacyCamera || (b.channel === 'camera' && b.trigger && b.trigger.actionToken)) {
          pushPreviewItem(items, mappingId, b, 'apply', null, byChannel);
          return;
        }
        if (!byChannel[b.channel]) {
          return optionsFor(mappingId, b.channel).then(function (opts) {
            byChannel[b.channel] = opts || [];
            var o = findOption(byChannel[b.channel], b.actionId);
            if (!o || !o.bindable) {
              pushPreviewItem(
                items,
                mappingId,
                b,
                'skip',
                (o && o.reasonCode) || 'provider_unsupported',
                byChannel
              );
            } else {
              pushPreviewItem(items, mappingId, b, 'apply', null, byChannel);
            }
          });
        }
        var o2 = findOption(byChannel[b.channel], b.actionId);
        if (!o2 || !o2.bindable) {
          pushPreviewItem(
            items,
            mappingId,
            b,
            'skip',
            (o2 && o2.reasonCode) || 'provider_unsupported',
            byChannel
          );
        } else {
          pushPreviewItem(items, mappingId, b, 'apply', null, byChannel);
        }
      });
    });

    return chain.then(function () {
      return { preset: preset, items: items };
    });
  }

  function upsertCameraMappingScoped(mappingId, item) {
    var Cam = global.OneToneCameraPresenceActions;
    if (!Cam || !Cam.persistBindActionMappingScoped) {
      return Promise.reject(new Error('camera_scoped_unavailable'));
    }
    var tr = item.trigger || {};
    return Cam.persistBindActionMappingScoped(
      mappingId,
      tr.bindKey,
      tr.actionToken
    );
  }

  function upsertOne(mappingId, item) {
    if (item.channel === 'camera') {
      return upsertCameraMappingScoped(mappingId, item);
    }
    var A = adapters();
    if (!A) return Promise.reject(new Error('adapters_unavailable'));
    var ad = A.get(item.channel);
    if (!ad || !ad.upsert) return Promise.reject(new Error('no_adapter'));
    return ad.upsert(mappingId, item.actionId, item.trigger);
  }

  function apply(mappingId, presetId, opts) {
    opts = opts || {};
    return preview(mappingId, presetId).then(function (plan) {
      if (!opts.confirmed) {
        return Promise.reject(new Error('not_confirmed'));
      }
      var snap = snapshotBindings(mappingId);
      if (!snap) return Promise.reject(new Error('no_mapping'));
      var applied = [];
      var skipped = [];
      var needsKey = [];
      var chain = Promise.resolve();
      plan.items.forEach(function (item) {
        if (item.status === 'skip') {
          skipped.push(item);
          return;
        }
        if (item.status === 'needs_key') {
          needsKey.push(item);
          return;
        }
        chain = chain.then(function () {
          return upsertOne(mappingId, item).then(function () {
            applied.push(item);
          });
        });
      });
      return chain
        .then(function () {
          return {
            ok: true,
            presetId: presetId,
            applied: applied,
            skipped: skipped,
            needsKey: needsKey
          };
        })
        .catch(function (err) {
          return restoreBindings(snap).then(function () {
            return Promise.reject(err);
          });
        });
    });
  }

  function list() {
    return PRESETS.slice();
  }

  global.OneToneSemanticPresets = {
    list: list,
    presetById: presetById,
    preview: preview,
    apply: apply,
    snapshotBindings: snapshotBindings,
    restoreBindings: restoreBindings,
    softPadNeedsMicroKey: softPadNeedsMicroKey
  };
})(typeof window !== 'undefined' ? window : globalThis);
