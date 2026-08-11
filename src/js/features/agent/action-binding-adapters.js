/**
 * Channel binding adapters — write via existing save paths only.
 * bindingRef === slotId (semantic:<channel>:<actionId> for new rows).
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

  function slotIdFor(channel, actionId, existing) {
    if (existing && existing.slotId) return existing.slotId;
    var store = global.OneToneSemanticActionStore;
    return store
      ? store.semanticSlotId(channel, actionId)
      : 'semantic:' + channel + ':' + actionId;
  }

  function findPrimaryBinding(m, channel, actionId) {
    if (!m || !m.agentBindings) return null;
    var dotted = canonical(actionId);
    for (var i = 0; i < m.agentBindings.length; i++) {
      var b = m.agentBindings[i];
      if (String(b.triggerType || '') !== channel) continue;
      if (canonical(b.actionId) === dotted) return b;
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

  var keyAdapter = {
    channel: 'key',
    list: function (mappingId) {
      var m = mappingById(mappingId);
      if (!m) return [];
      return (m.agentBindings || []).filter(function (b) {
        return b.triggerType === 'key';
      });
    },
    upsert: function (mappingId, actionId, trigger, bindingRef) {
      return withBindable('key', mappingId, actionId, function () {
        var m = mappingById(mappingId);
        if (!m) return Promise.reject(new Error('no_mapping'));
        if (!trigger) return Promise.reject(new Error('no_trigger'));
        m.agentBindings = m.agentBindings || [];
        var existing =
          (bindingRef &&
            m.agentBindings.find(function (b) {
              return b.slotId === bindingRef;
            })) ||
          findPrimaryBinding(m, 'key', actionId);
        var sid = slotIdFor('key', actionId, existing);
        if (existing) {
          existing.actionId = actionId;
          existing.triggerBinding = trigger;
          existing.triggerType = 'key';
          existing.slotId = existing.slotId || sid;
          existing.enabled = true;
        } else if (findPrimaryBinding(m, 'key', actionId)) {
          return Promise.reject(new Error('duplicate_primary_binding'));
        } else {
          m.agentBindings.push({
            slotId: sid,
            actionId: actionId,
            triggerType: 'key',
            triggerBinding: trigger,
            enabled: true,
            activationScope: 'global'
          });
        }
        return persist();
      });
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
    findPrimaryBinding: findPrimaryBinding
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
    upsert: function (mappingId, actionId, trigger, bindingRef) {
      return withBindable('voice', mappingId, actionId, function () {
        var m = mappingById(mappingId);
        if (!m) return Promise.reject(new Error('no_mapping'));
        if (!trigger) return Promise.reject(new Error('no_trigger'));
        m.agentBindings = m.agentBindings || [];
        var existing =
          (bindingRef &&
            m.agentBindings.find(function (b) {
              return b.slotId === bindingRef;
            })) ||
          findPrimaryBinding(m, 'voice', actionId);
        var sid = slotIdFor('voice', actionId, existing);
        if (existing) {
          existing.actionId = actionId;
          existing.triggerBinding = trigger;
          existing.triggerType = 'voice';
          existing.slotId = existing.slotId || sid;
          existing.enabled = true;
        } else if (findPrimaryBinding(m, 'voice', actionId)) {
          return Promise.reject(new Error('duplicate_primary_binding'));
        } else {
          m.agentBindings.push({
            slotId: sid,
            actionId: actionId,
            triggerType: 'voice',
            triggerBinding: trigger,
            enabled: true,
            activationScope: 'global'
          });
        }
        return persist();
      });
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
    upsert: function (mappingId, actionId, trigger, bindingRef) {
      return withBindable('softPad', mappingId, actionId, function () {
        var m = mappingById(mappingId);
        if (!m) return Promise.reject(new Error('no_mapping'));
        m.agentBindings = m.agentBindings || [];
        var existing =
          (bindingRef &&
            m.agentBindings.find(function (b) {
              return b.slotId === bindingRef;
            })) ||
          null;
        var primary = findPrimaryBinding(m, 'softPad', actionId);
        if (existing && primary && existing.slotId !== primary.slotId) {
          return Promise.reject(new Error('duplicate_primary_binding'));
        }
        if (!existing) existing = primary;
        var sid = slotIdFor('softPad', actionId, existing);
        var microKey =
          (trigger && typeof trigger === 'object' && trigger.microKeyId) ||
          (typeof trigger === 'string' ? trigger : '');
        if (existing) {
          existing.actionId = actionId;
          existing.triggerType = 'softPad';
          existing.slotId = existing.slotId || sid;
          existing.enabled = true;
          if (microKey) existing.triggerBinding = microKey;
        } else {
          m.agentBindings.push({
            slotId: sid,
            actionId: actionId,
            triggerType: 'softPad',
            triggerBinding: microKey || '',
            enabled: true,
            activationScope: 'global'
          });
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
    canonical: canonical
  };
})(typeof window !== 'undefined' ? window : globalThis);
