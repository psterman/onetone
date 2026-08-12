/**
 * Channel binding adapters — write via existing save paths only.
 * bindingRef === slotId (semantic:<channel>:<actionId> for singleton;
 * semantic:<channel>:app.shortcut:<suffix> for multi-instance).
 */
(function (global) {
  'use strict';

  function state() {
    return global.OneToneState || {};
  }

  function persist() {
    if (global.OneToneConfigPersist && global.OneToneConfigPersist.saveAsync) {
      return global.OneToneConfigPersist.saveAsync();
    }
    return Promise.resolve();
  }

  function mappingById(id) {
    var cfg = state().cfg || state().config;
    if (!cfg || !cfg.mappings) return null;
    for (var i = 0; i < cfg.mappings.length; i++) {
      if (cfg.mappings[i].id === id) return cfg.mappings[i];
    }
    return null;
  }

  function canonical(actionId) {
    if (global.OneToneAgentActions && global.OneToneAgentActions.resolveCanonicalActionId) {
      return global.OneToneAgentActions.resolveCanonicalActionId(actionId);
    }
    return String(actionId || '').trim();
  }

  function isMultiInstance(actionId) {
    return canonical(actionId) === 'app.shortcut';
  }

  function normalizeOpts(bindingRefOrOpts, maybeOpts) {
    if (maybeOpts && typeof maybeOpts === 'object') return maybeOpts;
    if (bindingRefOrOpts && typeof bindingRefOrOpts === 'object' && !Array.isArray(bindingRefOrOpts)) {
      return bindingRefOrOpts;
    }
    return {};
  }

  function bindingRefFrom(bindingRefOrOpts, opts) {
    if (typeof bindingRefOrOpts === 'string') return bindingRefOrOpts;
    return (opts && opts.bindingRef) || '';
  }

  function slotIdFor(channel, actionId, existing, actionInstanceId) {
    if (existing && existing.slotId) return existing.slotId;
    var dotted = canonical(actionId);
    if (isMultiInstance(dotted) && actionInstanceId) {
      var suffix = String(actionInstanceId)
        .replace(/^app\.shortcut:/, '')
        .replace(/^app-shortcut:/, '');
      return 'semantic:' + channel + ':' + dotted + ':' + suffix;
    }
    var store = global.OneToneSemanticActionStore;
    return store
      ? store.semanticSlotId(channel, actionId)
      : 'semantic:' + channel + ':' + dotted;
  }

  function findPrimaryBinding(m, channel, actionId, actionInstanceId) {
    if (!m || !m.agentBindings) return null;
    var dotted = canonical(actionId);
    var wantInst = String(actionInstanceId || '').trim();
    for (var i = 0; i < m.agentBindings.length; i++) {
      var b = m.agentBindings[i];
      if (String(b.triggerType || '') !== channel) continue;
      if (canonical(b.actionId) !== dotted) continue;
      if (isMultiInstance(dotted)) {
        if (wantInst && String(b.actionInstanceId || '') === wantInst) return b;
        continue;
      }
      return b;
    }
    return null;
  }

  function withBindable(channel, mappingId, actionId, then) {
    var store = global.OneToneSemanticActionStore;
    if (!store || !store.assertBindable) {
      return Promise.reject(new Error('options_unavailable'));
    }
    return store.assertBindable(mappingId, channel, actionId).then(function (res) {
      if (!res || !res.ok) {
        return Promise.reject(new Error((res && res.reason) || 'not_bindable'));
      }
      return then();
    });
  }

  function upsertAgentBinding(channel, mappingId, actionId, trigger, bindingRefOrOpts, maybeOpts) {
    var opts = normalizeOpts(bindingRefOrOpts, maybeOpts);
    var bindingRef = bindingRefFrom(bindingRefOrOpts, opts);
    return withBindable(channel, mappingId, actionId, function () {
      var m = mappingById(mappingId);
      if (!m) return Promise.reject(new Error('no_mapping'));
      if (channel === 'key' && !trigger) return Promise.reject(new Error('no_trigger'));
      m.agentBindings = m.agentBindings || [];
      var dotted = canonical(actionId);
      var multi = isMultiInstance(dotted);
      var instanceId = String(
        (opts && opts.actionInstanceId) ||
          (bindingRef &&
            m.agentBindings.find(function (b) {
              return b.slotId === bindingRef;
            }) &&
            m.agentBindings.find(function (b) {
              return b.slotId === bindingRef;
            }).actionInstanceId) ||
          ''
      ).trim();
      if (multi && !instanceId) {
        instanceId = 'app-shortcut:' + Date.now().toString(36);
      }
      if (!multi && dotted === 'app.open' && !instanceId) {
        instanceId = 'app-open:' + mappingId;
      }
      var existing =
        (bindingRef &&
          m.agentBindings.find(function (b) {
            return b.slotId === bindingRef;
          })) ||
        findPrimaryBinding(m, channel, actionId, multi ? instanceId : '');
      var sid = slotIdFor(channel, actionId, existing, instanceId);
      var actionArgs =
        opts && Object.prototype.hasOwnProperty.call(opts, 'actionArgs')
          ? opts.actionArgs
          : existing
            ? existing.actionArgs
            : null;
      if (existing) {
        existing.actionId = actionId;
        if (trigger != null && trigger !== '') existing.triggerBinding = trigger;
        existing.triggerType = channel;
        existing.slotId = existing.slotId || sid;
        existing.enabled = true;
        if (instanceId) existing.actionInstanceId = instanceId;
        if (actionArgs != null) existing.actionArgs = actionArgs;
      } else if (!multi && findPrimaryBinding(m, channel, actionId, '')) {
        return Promise.reject(new Error('duplicate_primary_binding'));
      } else if (multi && findPrimaryBinding(m, channel, actionId, instanceId)) {
        return Promise.reject(new Error('duplicate_primary_binding'));
      } else {
        var row = {
          slotId: sid,
          actionId: actionId,
          triggerType: channel,
          triggerBinding: trigger || '',
          enabled: true,
          activationScope: 'global'
        };
        if (instanceId) row.actionInstanceId = instanceId;
        if (actionArgs != null) row.actionArgs = actionArgs;
        m.agentBindings.push(row);
      }
      return persist();
    });
  }

  var keyAdapter = {
    channel: 'key',
    list: function (mappingId) {
      var m = mappingById(mappingId);
      if (!m) return [];
      return (m.agentBindings || []).filter(function (b) {
        return b.triggerType === 'key';
      });
    },
    upsert: function (mappingId, actionId, trigger, bindingRefOrOpts, maybeOpts) {
      return upsertAgentBinding('key', mappingId, actionId, trigger, bindingRefOrOpts, maybeOpts);
    },
    describeTrigger: function (b) {
      return (b && b.triggerBinding) || '';
    },
    openEditor: function (mappingId, actionId, bindingRef) {
      if (global.OneToneActionNav) {
        global.OneToneActionNav.openChannelEditor({
          mappingId: mappingId,
          channel: 'key',
          actionId: actionId,
          bindingRef: bindingRef
        });
      }
    },
    findPrimaryBinding: findPrimaryBinding,
    isMultiInstance: isMultiInstance
  };

  var voiceAdapter = {
    channel: 'voice',
    list: function (mappingId) {
      var m = mappingById(mappingId);
      if (!m) return [];
      return (m.agentBindings || []).filter(function (b) {
        return b.triggerType === 'voice';
      });
    },
    upsert: function (mappingId, actionId, trigger, bindingRefOrOpts, maybeOpts) {
      return upsertAgentBinding('voice', mappingId, actionId, trigger, bindingRefOrOpts, maybeOpts);
    },
    describeTrigger: function (b) {
      return (b && b.triggerBinding) || '';
    },
    openEditor: function (mappingId, actionId, bindingRef) {
      if (global.OneToneActionNav) {
        global.OneToneActionNav.openChannelEditor({
          mappingId: mappingId,
          channel: 'voice',
          actionId: actionId,
          bindingRef: bindingRef
        });
      }
    }
  };

  /**
   * trigger = { bindKey: 'shakeHead', actionToken: 'agent:input.cancel' }
   * or string actionToken with opts.bindKey
   */
  var cameraAdapter = {
    channel: 'camera',
    list: function () {
      return [];
    },
    upsert: function (mappingId, actionId, trigger, bindingRef) {
      var bindKey =
        (trigger && typeof trigger === 'object' && trigger.bindKey) ||
        bindingRef ||
        'shakeHead';
      var token =
        (trigger && typeof trigger === 'object' && trigger.actionToken) ||
        (typeof trigger === 'string' ? trigger : null);
      if (!token) {
        var A = global.OneToneAgentActions;
        token = A && A.agentActionToken ? A.agentActionToken(actionId) : 'agent:' + actionId;
      }
      var Cam = global.OneToneCameraPresenceActions;
      if (Cam && typeof Cam.persistBindAction === 'function') {
        // persistBindAction already assertBindable
        return Promise.resolve(Cam.persistBindAction(mappingId, bindKey, token));
      }
      return withBindable('camera', mappingId, actionId, function () {
        var m = mappingById(mappingId);
        if (!m) return Promise.reject(new Error('no_mapping'));
        m.cameraOverride = m.cameraOverride || {};
        m.cameraOverride[bindKey] = token;
        return persist();
      });
    },
    describeTrigger: function (b) {
      return (b && (b.trigger || b.triggerBinding)) || '';
    },
    openEditor: function (mappingId, actionId, bindingRef) {
      if (global.OneToneActionNav) {
        global.OneToneActionNav.openChannelEditor({
          mappingId: mappingId,
          channel: 'camera',
          actionId: actionId,
          bindingRef: bindingRef
        });
      }
    }
  };

  /**
   * Soft Pad: upsert agentBindings row with triggerType softPad (no empty key chord).
   * Physical key mapping stays in codexMicroPad via caller commitEditKeycapDraft.
   */
  var softPadAdapter = {
    channel: 'softPad',
    list: function (mappingId) {
      var m = mappingById(mappingId);
      if (!m) return [];
      return (m.agentBindings || []).filter(function (b) {
        return b.triggerType === 'softPad';
      });
    },
    upsert: function (mappingId, actionId, trigger, bindingRefOrOpts, maybeOpts) {
      var opts = normalizeOpts(bindingRefOrOpts, maybeOpts);
      var bindingRef = bindingRefFrom(bindingRefOrOpts, opts);
      var microKey =
        (trigger && typeof trigger === 'object' && trigger.microKeyId) ||
        (typeof trigger === 'string' ? trigger : '');
      return withBindable('softPad', mappingId, actionId, function () {
        var m = mappingById(mappingId);
        if (!m) return Promise.reject(new Error('no_mapping'));
        m.agentBindings = m.agentBindings || [];
        var dotted = canonical(actionId);
        var multi = isMultiInstance(dotted);
        var instanceId = String((opts && opts.actionInstanceId) || '').trim();
        if (multi && !instanceId) {
          instanceId = 'app-shortcut:' + Date.now().toString(36);
        }
        var existing =
          (bindingRef &&
            m.agentBindings.find(function (b) {
              return b.slotId === bindingRef;
            })) ||
          null;
        var primary = findPrimaryBinding(m, 'softPad', actionId, multi ? instanceId : '');
        if (!multi && existing && primary && existing.slotId !== primary.slotId) {
          return Promise.reject(new Error('duplicate_primary_binding'));
        }
        if (!existing) existing = primary;
        var sid = slotIdFor('softPad', actionId, existing, instanceId);
        var actionArgs =
          opts && Object.prototype.hasOwnProperty.call(opts, 'actionArgs')
            ? opts.actionArgs
            : existing
              ? existing.actionArgs
              : null;
        if (existing) {
          existing.actionId = actionId;
          existing.triggerType = 'softPad';
          existing.slotId = existing.slotId || sid;
          existing.enabled = true;
          if (microKey) existing.triggerBinding = microKey;
          if (instanceId) existing.actionInstanceId = instanceId;
          if (actionArgs != null) existing.actionArgs = actionArgs;
        } else {
          var row = {
            slotId: sid,
            actionId: actionId,
            triggerType: 'softPad',
            triggerBinding: microKey || '',
            enabled: true,
            activationScope: 'global'
          };
          if (instanceId) row.actionInstanceId = instanceId;
          if (actionArgs != null) row.actionArgs = actionArgs;
          m.agentBindings.push(row);
        }
        return persist().then(function () {
          return { slotId: sid };
        });
      });
    },
    describeTrigger: function (b) {
      return (b && b.triggerBinding) || '';
    },
    openEditor: function (mappingId, actionId, bindingRef) {
      if (global.OneToneActionNav) {
        global.OneToneActionNav.openChannelEditor({
          mappingId: mappingId,
          channel: 'softPad',
          actionId: actionId,
          bindingRef: bindingRef
        });
      }
    }
  };

  global.OneToneActionBindingAdapters = {
    key: keyAdapter,
    voice: voiceAdapter,
    camera: cameraAdapter,
    softPad: softPadAdapter,
    get: function (ch) {
      return this[ch] || null;
    },
    findPrimaryBinding: findPrimaryBinding,
    isMultiInstance: isMultiInstance,
    canonical: canonical
  };
})(typeof window !== 'undefined' ? window : globalThis);
