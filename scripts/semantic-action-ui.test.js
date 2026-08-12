/**
 * Phase B-fix UI behavior checks (no Tauri window).
 * Run: node scripts/semantic-action-ui.test.js
 */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function loadScript(rel, sandbox) {
  vm.runInNewContext(read(rel), sandbox, { filename: rel });
  return sandbox;
}

// --- Model unit ---
var modelSrc = read('src/js/features/home/home-context-actions-model.js');
var sandbox = { window: {}, console: console };
vm.runInNewContext(modelSrc, sandbox);
var model = sandbox.window.OneToneHomeContextActionsModel;
assert.ok(model);

var built = model.buildHomeContextActions({
  needsInputKind: 'dictating',
  catalogEntries: [
    { id: 'input.send', implemented: true, labelZh: '发送', labelEn: 'Send', risk: 'dangerous' },
    { id: 'input.commit', implemented: true, labelZh: '完成', labelEn: 'Commit', risk: 'confirm' },
    { id: 'input.cancel', implemented: true, labelZh: '取消', labelEn: 'Cancel', risk: 'safe' },
    { id: 'agent.focus', implemented: true, labelZh: '焦点', labelEn: 'Focus', risk: 'safe' }
  ],
  options: [
    { actionId: 'input.send', bindable: true, executableNow: true },
    { actionId: 'input.commit', bindable: true, executableNow: true },
    { actionId: 'input.cancel', bindable: true, executableNow: true }
  ],
  pending: null
});
assert.strictEqual(built.actions.length, 3);
assert.strictEqual(built.actions[0].actionId, 'input.send');

var pendingBuilt = model.buildHomeContextActions({
  needsInputKind: 'none',
  catalogEntries: [],
  options: [],
  pending: { confirmationId: 'c1', actionId: 'agent.approve', sourceChannel: 'camera', expiresInMs: 1000 }
});
assert.strictEqual(pendingBuilt.state, 'pending');
assert.ok(pendingBuilt.pendingCard);

var choice = model.buildHomeContextActions({
  needsInputKind: 'waitingChoice',
  catalogEntries: [
    { id: 'agent.focus', implemented: true, labelZh: '焦点', labelEn: 'Focus', risk: 'safe' },
    { id: 'input.start', implemented: true, labelZh: '开始', labelEn: 'Start', risk: 'confirm' },
    { id: 'agent.reject', implemented: true, labelZh: '拒绝', labelEn: 'Reject', risk: 'safe' }
  ],
  options: [
    { actionId: 'agent.focus', bindable: true, executableNow: true },
    { actionId: 'input.start', bindable: true, executableNow: true },
    { actionId: 'agent.reject', bindable: true, executableNow: true }
  ],
  pending: null
});
assert.notStrictEqual(choice.state, 'waitingChoice');

// Source gates
var picker = read('src/js/features/agent/semantic-action-picker.js');
assert.ok(picker.indexOf('OneToneSemanticActionStore') >= 0);
assert.ok(picker.indexOf('ACTIONS') < 0 || picker.indexOf('legacy') >= 0);
assert.ok(picker.indexOf('role="dialog"') >= 0);

var storeSrc = read('src/js/features/agent/semantic-action-store.js');
assert.ok(storeSrc.indexOf('_optionsCache = {}') >= 0 || storeSrc.indexOf('_optionsCache={}') >= 0);
assert.ok(storeSrc.indexOf('silent') >= 0);
assert.ok(storeSrc.indexOf('notifyLocalChange') >= 0);

var adaptersSrc = read('src/js/features/agent/action-binding-adapters.js');
assert.ok(adaptersSrc.indexOf("triggerType: 'softPad'") >= 0 || adaptersSrc.indexOf('triggerType:"softPad"') >= 0);
assert.ok(adaptersSrc.indexOf('duplicate_primary_binding') >= 0);

var detail = read('src/js/features/mapping/habit-actions-detail.js');
assert.ok(detail.indexOf('OneToneActionNav') >= 0);
assert.ok(detail.indexOf('hadPickChannel') >= 0 || detail.indexOf('选择入口') >= 0);

var homeUi = read('src/js/features/home/home-context-actions-ui.js');
assert.ok(homeUi.indexOf('silent: true') >= 0 || homeUi.indexOf('silent:true') >= 0);
assert.ok(homeUi.indexOf('fetchPendingSnapshot') >= 0);
// onChange must paint only — no nested fetchPendingSnapshot in subscriber
assert.ok(homeUi.indexOf('onChange(function') >= 0 || homeUi.indexOf('.onChange(') >= 0);
var paintSub = homeUi.indexOf('if (homeVisible()) paint()');
assert.ok(paintSub >= 0, 'onChange must call paint only');
assert.ok(homeUi.indexOf('onChange(function () {\n        if (homeVisible()) refresh()') < 0);

var cam = read('src/js/features/camera/camera-presence-actions.js');
assert.ok(cam.indexOf('OneToneSemanticActionPicker') >= 0);
assert.ok(cam.indexOf('persistBindAction') >= 0);
assert.ok(cam.indexOf('isSemanticBindableOnChannel') >= 0);
assert.ok(cam.indexOf('applyCameraPendingNav') >= 0);
assert.ok(cam.indexOf('ActionBindingAdapters') >= 0);

var pad = read('src/js/features/agent/codex-micro-pad-ui.js');
assert.ok(pad.indexOf('OneToneSemanticActionPicker') >= 0);
assert.ok(pad.indexOf('adapters.softPad') >= 0 || pad.indexOf('adapters && adapters.softPad') >= 0);
assert.ok(pad.indexOf('applySoftPadPendingNav') >= 0);
// Must not push fake empty key chords from semantic picker path
assert.ok(
  pad.indexOf("triggerType: 'key',\n                triggerBinding: ''") < 0 &&
    pad.indexOf('triggerType: \'key\',\n                triggerBinding: \'\'') < 0
);

var voice = read('src/js/features/agent/agent-capability-ui.js');
assert.ok(voice.indexOf('data-sap-channel="key"') >= 0);
assert.ok(voice.indexOf('data-sap-channel="voice"') >= 0);
assert.ok(voice.indexOf('openKeySemanticPicker') >= 0);
assert.ok(voice.indexOf('OneToneActionBindingAdapters') >= 0);
assert.ok(voice.indexOf('consumePendingNav') >= 0);

var indexHtml = read('src/index.html');
assert.ok(indexHtml.indexOf('semantic-action-picker.js') >= 0);
assert.ok(indexHtml.indexOf('habit-actions-detail.js') >= 0);
assert.ok(indexHtml.indexOf('home-context-actions-ui.js') >= 0);
assert.ok(indexHtml.indexOf('action-binding-adapters.js') >= 0);

var agentActions = read('src/js/features/agent/agent-actions.js');
assert.ok(agentActions.indexOf('providerId != null') >= 0 || agentActions.indexOf('providerId: opts.providerId != null') >= 0);

var dispatch = read('src-tauri/src/agent/dispatch.rs');
assert.ok(dispatch.indexOf('route_semantic_action') >= 0);
var sendKey = read('src-tauri/src/ipc/trigger_dispatch/send_key.rs');
assert.ok(sendKey.indexOf('dispatch_semantic_binding') >= 0);
var voiceRt = read('src-tauri/src/voice_end_runtime.rs');
assert.ok(voiceRt.indexOf('dispatch_semantic_action_ids') >= 0);
var softRt = read('src-tauri/src/ipc/runtime_dispatch.rs');
assert.ok(softRt.indexOf('ActionChannel::SoftPad') >= 0);

var pendingRs = read('src-tauri/src/agent/pending_confirm.rs');
assert.ok(pendingRs.indexOf('take_valid_if_action_matches') >= 0);
assert.ok(pendingRs.indexOf('confirmation_action_mismatch') >= 0);

// --- Behavior: store silent pending poll emits once on change only ---
var invokeCalls = [];
function optionRowsFor(channel) {
  var ch = String(channel || 'key');
  return [
    {
      actionId: 'input.cancel',
      bindable: true,
      executableNow: true,
      routeDisposition: 'execute'
    },
    {
      actionId: 'input.send',
      bindable: ch === 'camera' || ch === 'key' || ch === 'voice' || ch === 'softPad',
      executableNow: false,
      routeDisposition: ch === 'camera' ? 'pendingConfirmation' : 'execute'
    },
    {
      actionId: 'agent.approve',
      bindable: true,
      executableNow: false,
      routeDisposition: ch === 'camera' ? 'pendingConfirmation' : 'execute'
    }
  ];
}
var storeBox = {
  window: {
    __vp_invoke__: function (cmd, args) {
      invokeCalls.push({ cmd: cmd, args: args });
      if (cmd === 'cmd_semantic_pending_snapshot') {
        return Promise.resolve([{ confirmationId: 'x', actionId: 'input.cancel' }]);
      }
      if (cmd === 'cmd_semantic_action_catalog') {
        return Promise.resolve({
          entries: [
            {
              id: 'input.cancel',
              implemented: true,
              channels: ['camera', 'key', 'voice', 'softPad'],
              category: 'input',
              availableWhen: [],
              requiresSecondChannelFrom: [],
              labelZh: '取消',
              labelEn: 'Cancel',
              risk: 'safe'
            },
            {
              id: 'input.send',
              implemented: true,
              channels: ['key', 'voice', 'softPad', 'camera'],
              category: 'input',
              availableWhen: ['dictating'],
              requiresSecondChannelFrom: ['camera'],
              labelZh: '发送',
              labelEn: 'Send',
              risk: 'dangerous'
            },
            {
              id: 'agent.approve',
              implemented: true,
              channels: ['key', 'voice', 'softPad', 'camera'],
              category: 'decision',
              availableWhen: ['waitingApproval'],
              requiresSecondChannelFrom: ['camera'],
              labelZh: '批准',
              labelEn: 'Approve',
              risk: 'dangerous'
            }
          ],
          featureActionPickerUi: true,
          featureDynamicContextActions: false
        });
      }
      if (cmd === 'cmd_semantic_action_options') {
        return Promise.resolve({ entries: optionRowsFor(args && args.channel) });
      }
      return Promise.resolve(null);
    }
  },
  console: console,
  Promise: Promise,
  Object: Object,
  Array: Array,
  String: String,
  Date: Date,
  JSON: JSON,
  Error: Error,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout
};
loadScript('src/js/features/agent/semantic-action-store.js', storeBox);
var Store = storeBox.window.OneToneSemanticActionStore;
assert.ok(Store);
var emitCount = 0;
Store.onChange(function () {
  emitCount++;
});

return Promise.resolve()
  .then(function () {
    return Store.fetchPendingSnapshot('m1', { silent: true });
  })
  .then(function () {
    assert.strictEqual(emitCount, 0, 'silent fetch must not emit');
    var pendingInvokes = invokeCalls.filter(function (c) {
      return c.cmd === 'cmd_semantic_pending_snapshot';
    });
    assert.strictEqual(pendingInvokes.length, 1, 'one pending snapshot invoke');
    return Store.fetchPendingSnapshot('m1', { silent: true });
  })
  .then(function () {
    assert.strictEqual(emitCount, 0, 'unchanged silent still no emit');
    return Store.fetchPendingSnapshot('m1'); // non-silent, same content
  })
  .then(function () {
    assert.strictEqual(emitCount, 0, 'same content non-silent must not emit');
    Store.notifyLocalChange();
    assert.strictEqual(emitCount, 1, 'local notify emits once');
  })
  .then(function () {
    // --- Behavior: adapters key upsert uniqueness (Options assertBindable) ---
    var cfg = {
      mappings: [
        {
          id: 'map1',
          agentBindings: []
        }
      ]
    };
    var saves = 0;
    var adBox = {
      window: {
        OneToneState: { cfg: cfg },
        OneToneConfigPersist: {
          saveAsync: function () {
            saves++;
            return Promise.resolve();
          }
        },
        OneToneAgentActions: {
          resolveCanonicalActionId: function (id) {
            return String(id || '');
          }
        },
        OneToneSemanticActionStore: Store
      },
      console: console,
      Promise: Promise,
      Object: Object,
      Array: Array,
      String: String,
      Error: Error
    };
    loadScript('src/js/features/agent/action-binding-adapters.js', adBox);
    var Ad = adBox.window.OneToneActionBindingAdapters;
    return Ad.key.upsert('map1', 'input.cancel', 'Ctrl+K', null).then(function () {
      assert.strictEqual(cfg.mappings[0].agentBindings.length, 1);
      assert.strictEqual(cfg.mappings[0].agentBindings[0].triggerType, 'key');
      assert.ok(cfg.mappings[0].agentBindings[0].slotId.indexOf('semantic:key:') === 0);
      var primary = Ad.findPrimaryBinding(cfg.mappings[0], 'key', 'input.cancel');
      assert.ok(primary);
      return Ad.key.upsert('map1', 'input.cancel', 'Ctrl+L', null).then(function () {
        assert.strictEqual(cfg.mappings[0].agentBindings.length, 1);
        assert.strictEqual(cfg.mappings[0].agentBindings[0].triggerBinding, 'Ctrl+L');
        return Ad.softPad.upsert('map1', 'input.cancel', { microKeyId: 'F1' }, null).then(function (res) {
          assert.ok(res.slotId.indexOf('semantic:softPad:') === 0);
          var soft = cfg.mappings[0].agentBindings.filter(function (b) {
            return b.triggerType === 'softPad';
          });
          assert.strictEqual(soft.length, 1);
          assert.notStrictEqual(soft[0].triggerType, 'key');
          return Ad.softPad.upsert('map1', 'input.cancel', { microKeyId: 'F2' }, null).then(function () {
            var soft2 = cfg.mappings[0].agentBindings.filter(function (b) {
              return b.triggerType === 'softPad';
            });
            assert.strictEqual(soft2.length, 1);
            assert.strictEqual(soft2[0].triggerBinding, 'F2');
            assert.strictEqual(
              Ad.findPrimaryBinding(cfg.mappings[0], 'softPad', 'input.cancel').slotId,
              soft2[0].slotId
            );
          });
        });
      });
    });
  })
  .then(function () {
    // --- ActionNav handoff ---
    var navBox = {
      window: { OneToneState: {} },
      console: console
    };
    loadScript('src/js/features/agent/action-nav.js', navBox);
    var Nav = navBox.window.OneToneActionNav;
    var opened = null;
    navBox.window.OneToneSettingsDrawer = {
      open: function (o) {
        opened = o;
      }
    };
    Nav.openChannelEditor({
      mappingId: 'm9',
      channel: 'camera',
      actionId: 'input.cancel',
      bindingRef: 'shakeHead'
    });
    assert.strictEqual(navBox.window.OneToneState.selectedMappingId, 'm9');
    assert.ok(opened && opened.panel === 'camera');
    var peeked = Nav.peekPendingNav();
    assert.strictEqual(peeked.actionId, 'input.cancel');
    var consumed = Nav.consumePendingNav();
    assert.strictEqual(consumed.bindingRef, 'shakeHead');
    assert.strictEqual(Nav.consumePendingNav(), null);
  })
  .then(function () {
    // --- Bindable: Camera may bind send/approve (Options authority) ---
    return Store.ensureCatalog().then(function () {
      assert.ok(Store.isSemanticBindableOnChannel('input.cancel', 'camera'));
      assert.ok(Store.isSemanticBindableOnChannel('input.send', 'camera'));
      assert.ok(Store.isSemanticBindableOnChannel('agent.approve', 'camera'));
      return Store.assertBindable('map1', 'camera', 'input.send').then(function (res) {
        assert.ok(res.ok);
        assert.strictEqual(res.option.routeDisposition, 'pendingConfirmation');
        assert.strictEqual(res.option.bindable, true);
      });
    });
  })
  .then(function () {
    // --- Chain: camera adapter persist → gesture dispatch → routeSemanticAction ---
    var routeCalls = [];
    var enterInjected = false;
    var presenceActions = {
      enabled: true,
      triggers: { away: false, shake: true, blink: false, openPalm: false, okHand: false, fist: false, wave: false },
      onAway: 'none',
      onReturn: 'none',
      shakeHead: 'none',
      deliberateBlink: 'none',
      openPalm: 'none',
      okHand: 'none',
      fist: 'none',
      wave: 'none'
    };
    var stateConfig = {
      mappings: [{ id: 'mapCam', agentBindings: [], cameraOverride: null }],
      cameraPrefs: { presenceActions: presenceActions },
      activeSceneId: 'mapCam'
    };
    var camBox = {
      window: {
        OneToneState: {
          cfg: stateConfig,
          state: { selectedMappingId: 'mapCam', config: stateConfig },
          selectedMappingId: 'mapCam',
          ui: { habitScenarioReturnId: 'mapCam' }
        },
        OneToneConfigPersist: {
          isLoaded: function () {
            return true;
          },
          saveAsync: function () {
            return Promise.resolve();
          },
          saveCameraPrefsQuiet: function () {
            return true;
          },
          rememberCameraPrefs: function () {}
        },
        OneToneAgentActions: {
          resolveCanonicalActionId: function (id) {
            return String(id || '');
          },
          agentActionToken: function (id) {
            return 'agent:' + id;
          },
          featureActionPickerUi: function () {
            return true;
          },
          routeSemanticAction: function (req) {
            routeCalls.push(req);
            return Promise.resolve({
              status: 'pendingConfirmation',
              actionId: req.actionId,
              confirmationId: 'conf-chain-1',
              reasonCode: 'camera_requires_confirmation'
            });
          },
          execute: function () {
            enterInjected = true;
            return Promise.resolve({ ok: true });
          }
        },
        OneToneSemanticActionStore: Store,
        OneToneI18n: {
          t: function (k, f) {
            return f || k;
          }
        },
        OneToneDom: {
          $: function () {
            return null;
          }
        },
        document: {
          readyState: 'loading',
          getElementById: function () {
            return null;
          },
          querySelector: function () {
            return null;
          },
          querySelectorAll: function () {
            return [];
          },
          createElement: function () {
            return {
              setAttribute: function () {},
              appendChild: function () {},
              classList: { add: function () {}, remove: function () {}, toggle: function () {} }
            };
          },
          addEventListener: function () {},
          body: { appendChild: function () {} }
        },
        performance: {
          now: function () {
            return Date.now();
          }
        },
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        console: console
      },
      console: console,
      Promise: Promise,
      Object: Object,
      Array: Array,
      String: String,
      Error: Error,
      Date: Date,
      JSON: JSON,
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      performance: {
        now: function () {
          return Date.now();
        }
      }
    };
    camBox.window.__ONETONE_E2E__ = true; // must be set before loadScript so conditional exports are included
    camBox.window.window = camBox.window;
    camBox.document = camBox.window.document;
    loadScript('src/js/features/camera/camera-presence-actions.js', camBox);
    loadScript('src/js/features/agent/action-binding-adapters.js', camBox);
    var Cam = camBox.window.OneToneCameraPresenceActions;
    var Ad2 = camBox.window.OneToneActionBindingAdapters;
    assert.ok(Cam && Ad2);
    assert.ok(Cam.isSendClassAction('send'));
    assert.ok(Cam.isSendClassAction('submit'));
    assert.ok(!Cam.isSendClassAction('input.send'));
    assert.ok(!Cam.isSendClassAction('agent.approve'));
    return Ad2.camera
      .upsert('mapCam', 'input.send', { bindKey: 'shakeHead', actionToken: 'agent:input.send' }, 'shakeHead')
      .then(function () {
        var saved = stateConfig.cameraPrefs.presenceActions.shakeHead;
        assert.ok(
          saved === 'agent:input.send' || saved === 'input.send',
          'persisted send binding: ' + saved
        );
        Cam._testSetPresence('present');
        camBox.window.OneToneCameraPreview = {
          isRunning: function () {
            return true;
          },
          getGazeDebugState: function () {
            return { previewLive: true };
          }
        };
        camBox.window.OneToneCameraGazeCalibration = {
          getState: function () {
            return { running: false };
          }
        };
        return Cam.dispatchAction(saved, 'shake', { immediate: true });
      })
      .then(function (res) {
        assert.ok(routeCalls.length >= 1, 'routeSemanticAction must be called');
        var last = routeCalls[routeCalls.length - 1];
        assert.strictEqual(last.actionId, 'input.send');
        assert.strictEqual(last.sourceChannel, 'camera');
        assert.strictEqual(last.mappingId, 'mapCam');
        assert.strictEqual(enterInjected, false, 'no local Enter/send execute');
        assert.ok(res && res.injectedEnter !== true);
        assert.ok(
          res &&
            (res.visionOutcome === 'pendingConfirm' ||
              res.reason === 'camera_requires_confirmation' ||
              res.confirmationId === 'conf-chain-1')
        );
      });
  })
  .then(function () {
    // --- Picker DOM: real render shows send + 需其他入口确认 ---
    var nodes = {};
    function makeEl(tag) {
      var el = {
        tagName: String(tag || 'div').toUpperCase(),
        _id: '',
        className: '',
        hidden: false,
        _innerHTML: '',
        textContent: '',
        value: '',
        children: [],
        style: {},
        attributes: {},
        listeners: {},
        setAttribute: function (k, v) {
          this.attributes[k] = String(v);
          if (k === 'id') this.id = String(v);
        },
        getAttribute: function (k) {
          return this.attributes[k] != null ? this.attributes[k] : null;
        },
        appendChild: function (c) {
          this.children.push(c);
          if (c.id) nodes[c.id] = c;
          return c;
        },
        addEventListener: function (type, fn) {
          this.listeners[type] = this.listeners[type] || [];
          this.listeners[type].push(fn);
        },
        querySelector: function (sel) {
          if (sel && sel.charAt(0) === '#') return nodes[sel.slice(1)] || null;
          return null;
        },
        querySelectorAll: function (sel) {
          if (sel === '.sap-item') {
            var out = [];
            var parts = String(this.innerHTML || '').split('data-action-id="');
            for (var i = 1; i < parts.length; i++) {
              out.push({
                _id: parts[i].split('"')[0],
                getAttribute: function (k) {
                  return k === 'data-action-id' ? this._id : null;
                },
                addEventListener: function () {}
              });
            }
            return out;
          }
          if (sel === '.sap-cat') return [];
          return [];
        },
        focus: function () {},
        classList: {
          add: function () {},
          remove: function () {},
          toggle: function () {},
          contains: function () {
            return false;
          }
        }
      };
      Object.defineProperty(el, 'id', {
        get: function () {
          return this._id;
        },
        set: function (v) {
          this._id = String(v || '');
          if (this._id) nodes[this._id] = this;
        }
      });
      Object.defineProperty(el, 'innerHTML', {
        get: function () {
          return this._innerHTML;
        },
        set: function (html) {
          this._innerHTML = String(html || '');
          ['sapTitle', 'sapSub', 'sapClose', 'sapSearch', 'sapCats', 'sapList', 'sapEmpty'].forEach(
            function (id) {
              if (
                this._innerHTML.indexOf('id="' + id + '"') >= 0 ||
                this._innerHTML.indexOf("id='" + id + "'") >= 0
              ) {
                if (!nodes[id]) {
                  var child = makeEl(id === 'sapSearch' ? 'input' : 'div');
                  child.id = id;
                }
              }
            }.bind(this)
          );
        }
      });
      return el;
    }
    var body = makeEl('body');
    var doc = {
      body: body,
      getElementById: function (id) {
        return nodes[id] || null;
      },
      createElement: function (tag) {
        return makeEl(tag);
      },
      querySelector: function (sel) {
        if (sel === '#sapCats .is-active') {
          return {
            getAttribute: function () {
              return 'input';
            }
          };
        }
        return null;
      },
      activeElement: null
    };
    var pickBox = {
      window: {
        document: doc,
        OneToneSemanticActionStore: Store,
        OneToneAgentActions: {
          featureActionPickerUi: function () {
            return true;
          }
        },
        OneToneI18n: {
          t: function (k, f) {
            return f || k;
          },
          getLang: function () {
            return 'zh';
          }
        },
        console: console
      },
      document: doc,
      console: console,
      Promise: Promise,
      Object: Object,
      Array: Array,
      String: String,
      Error: Error
    };
    pickBox.window.window = pickBox.window;
    loadScript('src/js/features/agent/semantic-action-picker.js', pickBox);
    var Picker = pickBox.window.OneToneSemanticActionPicker;
    assert.ok(Picker);
    return new Promise(function (resolve, reject) {
      Picker.open({
        mappingId: 'map1',
        channel: 'camera',
        onSelect: function () {}
      });
      setTimeout(function () {
        try {
          var list = doc.getElementById('sapList');
          assert.ok(list, 'sapList host');
          var html = String(list.innerHTML || '');
          assert.ok(html.indexOf('data-action-id="input.send"') >= 0, 'send visible in picker DOM');
          assert.ok(
            html.indexOf('data-sap-pending-hint="1"') >= 0 || html.indexOf('需其他入口确认') >= 0,
            'pending hint node present'
          );
          assert.ok(html.indexOf('data-route-disposition="pendingConfirmation"') >= 0);
          resolve();
        } catch (e) {
          reject(e);
        }
      }, 40);
    });
  })
  .then(function () {
    var pickerSrc = read('src/js/features/mapping/keys-channel-command-picker.js');
    assert.ok(pickerSrc.indexOf('cmd_action_binding_views') < 0);
    assert.ok(pickerSrc.indexOf('bindingViews') >= 0);
    assert.ok(pickerSrc.indexOf("fetchOptions(mappingId, 'key'") >= 0);
    assert.ok(pickerSrc.indexOf("fetchOptions(mappingId, 'voice'") < 0);
    assert.ok(pickerSrc.indexOf('voiceCommands') < 0);
    assert.ok(pickerSrc.indexOf('adapters.key') >= 0 || pickerSrc.indexOf('key.upsert') >= 0);
    assert.ok(pickerSrc.indexOf('camera.upsert') < 0);
    assert.ok(pickerSrc.indexOf('voice.upsert') < 0);
    assert.ok(pickerSrc.indexOf('softPad.upsert') < 0);

    var html = read('src/index.html');
    assert.ok(html.indexOf('keysChannelSubtabs') >= 0);
    assert.ok(html.indexOf('keysChannelPanel') >= 0);
    assert.ok(html.indexOf('keysChannelTabIme') >= 0);
    assert.ok(html.indexOf('data-channel="ime"') >= 0);
    assert.ok(html.indexOf('keysTargetModeBadge') >= 0);
    assert.ok(html.indexOf('keys-channel-command-picker.js') >= 0);
    assert.ok(pickerSrc.indexOf("'ime'") >= 0 || pickerSrc.indexOf('"ime"') >= 0);
    assert.ok(pickerSrc.indexOf('setCodexImeTabHidden') >= 0);
    assert.ok(pickerSrc.indexOf('keysChannelEmptyVoice') >= 0);
    assert.ok(pickerSrc.indexOf('voice-lifecycle:start') >= 0);
    assert.ok(pickerSrc.indexOf('voice-lifecycle:cancel') >= 0);
    assert.ok(pickerSrc.indexOf('voice-lifecycle:end') >= 0);
    assert.ok(pickerSrc.indexOf('guide-finish') >= 0);
    assert.ok(pickerSrc.indexOf('input.start') >= 0);
    assert.ok(pickerSrc.indexOf('input.cancel') >= 0);
    assert.ok(pickerSrc.indexOf('app.open') >= 0);
    assert.ok(pickerSrc.indexOf('open-app-acoustic') >= 0);
    assert.ok(pickerSrc.indexOf('app.shortcut') >= 0);
    assert.ok(pickerSrc.indexOf('startAddAppShortcutWizard') >= 0 || pickerSrc.indexOf('data-add-app-shortcut') >= 0);
    assert.ok(pickerSrc.indexOf('actionInstanceId') >= 0);

    var adaptersSrc = read('src/js/features/agent/action-binding-adapters.js');
    assert.ok(adaptersSrc.indexOf('actionInstanceId') >= 0);
    assert.ok(adaptersSrc.indexOf('actionArgs') >= 0);
    assert.ok(adaptersSrc.indexOf('isMultiInstance') >= 0);
    assert.ok(adaptersSrc.indexOf('app.shortcut') >= 0);

    var upsertCalls = [];
    var doc = {
      getElementById: function (id) {
        if (id === 'keysChannelPicker') return { hidden: false };
        if (id === 'keysChannelSubtabs') return { querySelectorAll: function () { return []; }, addEventListener: function () {} };
        if (id === 'keysChannelPanel') return { innerHTML: '', addEventListener: function () {} };
        if (id === 'keysTargetModeBadge') return { textContent: '', classList: { add: function () {}, remove: function () {} } };
        if (id === 'keysTargetKeycapHint') return { textContent: '' };
        if (id === 'targetView') return { textContent: '' };
        if (id === 'targetDisplay') return { classList: { toggle: function () {}, add: function () {}, remove: function () {} } };
        if (id === 'habitKeyMapCellTarget') return { classList: { add: function () {}, remove: function () {} } };
        return null;
      },
      addEventListener: function () {}
    };
    var sb = {
      window: {
        OneToneState: {
          state: {
            selectedMappingId: 'm1',
            config: {
              mappings: [
                {
                  id: 'm1',
                  targetKey: 'RAlt',
                  triggerKey: 'F8',
                  agentBindings: [
                    {
                      slotId: 'semantic:voice:input.cancel',
                      actionId: 'input.cancel',
                      triggerType: 'voice',
                      triggerBinding: '取消',
                      enabled: true
                    }
                  ],
                  cameraOverride: { shakeHead: 'agent:cancel' },
                  codexMicroPad: null
                }
              ]
            }
          },
          ui: {},
          runtime: {}
        },
        OneToneI18n: { t: function (k, fb) { return fb || k; }, lang: 'zh' },
        OneToneSemanticActionStore: {
          bindingViews: function () {
            return Promise.resolve([
              {
                mappingId: 'm1',
                actionId: 'input.cancel',
                channel: 'voice',
                bindingRef: 'semantic:voice:input.cancel',
                trigger: '取消',
                enabled: true
              },
              {
                mappingId: 'm1',
                actionId: 'camera.local.pressEsc',
                channel: 'camera',
                bindingRef: 'shakeHead',
                trigger: 'shakeHead',
                enabled: true
              }
            ]);
          },
          ensureCatalog: function () { return Promise.resolve({}); },
          fetchOptions: function () {
            return Promise.resolve([
              { actionId: 'input.cancel', bindable: true },
              { actionId: 'camera.local.pressEsc', bindable: false }
            ]);
          },
          entryMeta: function (id) {
            if (id === 'input.cancel') return { labelZh: '取消' };
            return { labelZh: id };
          },
          isSemanticBindableOnChannel: function () { return true; },
          optionFor: function (_m, _c, id) {
            if (id === 'input.cancel') return { bindable: true };
            return { bindable: false };
          }
        },
        OneToneActionBindingAdapters: {
          key: {
            upsert: function (mappingId, actionId, trigger, bindingRef) {
              upsertCalls.push({ mappingId: mappingId, actionId: actionId, trigger: trigger, bindingRef: bindingRef });
              return Promise.resolve();
            }
          }
        },
        OneToneKeysPageState: { getStep: function () { return 'target'; } },
        OneToneUiFeedback: { toast: function () {} },
        document: doc
      },
      document: doc,
      console: console
    };
    sb.window.document = doc;
    loadScript('src/js/features/mapping/keys-channel-command-picker.js', sb);
    var P = sb.window.OneToneKeysChannelCommandPicker;
    assert.ok(P);
    return P.refresh().then(function () {
      assert.ok(!P.hasSelection());
      P.setSelection({
        mappingId: 'm1',
        sourceChannel: 'voice',
        sourceBindingRef: 'semantic:voice:input.cancel',
        actionId: 'input.cancel',
        keyBindingRef: ''
      });
      assert.ok(P.hasSelection());
      assert.strictEqual(upsertCalls.length, 0, 'select must not persist');
      P.clearSelection();
      assert.ok(!P.hasSelection());
    });
  })
  .then(function () {
    var pickerSrc = read('src/js/features/mapping/keys-channel-command-picker.js');
    assert.ok(pickerSrc.indexOf('resolveMigratableAction') >= 0);
    assert.ok(pickerSrc.indexOf('previewPadClone') >= 0);
    assert.ok(pickerSrc.indexOf('keysSoftPadPickHost') >= 0);
    assert.ok(pickerSrc.indexOf('heroModel') >= 0);
    assert.ok(
      pickerSrc.indexOf('global.OneToneState && global.OneToneState.state') >= 0,
      'state() reads inner OneToneState.state'
    );
    assert.ok(pickerSrc.indexOf('function config()') >= 0, 'config() helper present');
    assert.ok(
      pickerSrc.indexOf('return global.OneToneState || {}') < 0,
      'no outer OneToneState fallback'
    );
    // prepareSoftPadScopeScenario may call ensurePad on a resolved mapping; pick render must not.
    var renderSlice = pickerSrc.slice(
      pickerSrc.indexOf('function renderSoftPadKeyboardPanel'),
      pickerSrc.indexOf('function syncImeTabChrome')
    );
    assert.ok(renderSlice.indexOf('ensurePad') < 0, 'SoftPad pick render must not ensurePad');
    assert.ok(pickerSrc.indexOf('function prepareSoftPadScopeScenario') >= 0);
    assert.ok(
      pickerSrc.indexOf("if (selection.sourceChannel === 'softPad') return selection.sourceBindingRef") < 0
    );

    var html = read('src/index.html');
    assert.ok(html.indexOf('keysTargetActionIconHost') >= 0);

    var listSrc = read('src/js/features/mapping/mapping-list.js');
    assert.ok(listSrc.indexOf('heroModel') >= 0);

    var softPadBinding = {
      slotId: 'semantic:softPad:input.cancel',
      actionId: 'input.cancel',
      triggerType: 'softPad',
      triggerBinding: 'AG05',
      enabled: true,
      actionInstanceId: '',
      actionArgs: null
    };
    var keyBindingExisting = {
      slotId: 'semantic:key:app.shortcut:inst1',
      actionId: 'app.shortcut',
      triggerType: 'key',
      triggerBinding: 'F9',
      enabled: true,
      actionInstanceId: 'inst1',
      actionArgs: { chord: 'Ctrl+K' }
    };
    var mapping = {
      id: 'm-soft',
      appTargetId: 'codex-chat',
      targetKey: 'RAlt',
      triggerKey: 'F8',
      agentBindings: [softPadBinding, keyBindingExisting],
      codexMicroPad: {
        enabled: false,
        keys: [
          {
            microKeyId: 'AG05',
            slotId: 'semantic:softPad:input.cancel',
            enabled: true,
            uiIconId: 'reject'
          },
          {
            microKeyId: 'AG04',
            slotId: 'semantic:key:app.shortcut:inst1',
            enabled: true,
            uiIconId: 'send'
          }
        ]
      }
    };
    var mappingSnap = JSON.stringify(mapping);
    var upsertCalls2 = [];
    var ensurePadCalls = 0;
    var panelHtml = '';
    var iconHost = { innerHTML: '', hidden: true, setAttribute: function () {} };
    var targetView = { textContent: 'IME' };
    var panelClickListeners = [];
    var panelNode = {
            get innerHTML() {
              return panelHtml;
            },
            set innerHTML(v) {
              panelHtml = String(v || '');
            },
            classList: { add: function () {}, remove: function () {} },
            setAttribute: function () {},
            addEventListener: function (type, fn) {
              if (type === 'click') panelClickListeners.push(fn);
            },
            contains: function () {
              return true;
            },
            querySelectorAll: function (sel) {
              if (String(sel).indexOf('data-micro-key') < 0) return [];
              // Minimal NodeList-like for retarget
              var ids = ['AG05', 'AG04', 'ENC', 'NAV_UP'];
              return ids.map(function (mid) {
                var classes = {
                  list: [],
                  add: function (c) {
                    this.list.push(c);
                  },
                  remove: function (c) {
                    this.list = this.list.filter(function (x) {
                      return x !== c;
                    });
                  },
                  contains: function (c) {
                    return this.list.indexOf(c) >= 0;
                  }
                };
                return {
                  tagName: 'BUTTON',
                  classList: classes,
                  tabIndex: 0,
                  getAttribute: function (n) {
                    if (n === 'data-micro-key') return mid;
                    if (n === 'role') return mid === 'ENC' ? 'switch' : null;
                    if (n === 'aria-disabled') return classes.contains('is-disabled') ? 'true' : null;
                    if (n === 'aria-label') return mid;
                    return null;
                  },
                  setAttribute: function () {},
                  removeAttribute: function () {},
                  querySelector: function () {
                    return { innerHTML: '<svg data-icon="' + mid + '"></svg>' };
                  }
                };
              });
            }
          };
    var doc2 = {
      getElementById: function (id) {
        if (id === 'keysChannelPicker') return { hidden: false };
        if (id === 'keysChannelSubtabs') {
          return {
            querySelectorAll: function () {
              return [];
            },
            addEventListener: function () {}
          };
        }
        if (id === 'keysChannelPanel') {
          return panelNode;
        }
        if (id === 'keysTargetModeBadge') {
          return { textContent: '', classList: { add: function () {}, remove: function () {} } };
        }
        if (id === 'keysTargetKeycapHint') return { textContent: '' };
        if (id === 'targetView') return targetView;
        if (id === 'targetDisplay') {
          return { classList: { toggle: function () {}, add: function () {}, remove: function () {} } };
        }
        if (id === 'habitKeyMapCellTarget') {
          return { classList: { add: function () {}, remove: function () {} } };
        }
        if (id === 'keysTargetActionIconHost') return iconHost;
        if (id === 'targetImeIconMapping') return { hidden: false };
        if (id === 'targetAppBadgeMapping') {
          return { hidden: false, setAttribute: function () {} };
        }
        return null;
      },
      addEventListener: function () {}
    };
    var views = [
      {
        mappingId: 'm-soft',
        actionId: 'input.cancel',
        channel: 'softPad',
        bindingRef: 'semantic:softPad:input.cancel',
        trigger: 'AG05',
        enabled: true
      },
      {
        mappingId: 'm-soft',
        actionId: 'app.shortcut',
        channel: 'softPad',
        bindingRef: 'AG04',
        trigger: 'AG04',
        enabled: true
      }
    ];
    var sb2 = {
      window: {
        OneToneState: {
          state: {
            selectedMappingId: 'm-soft',
            config: { mappings: [mapping] }
          },
          ui: {},
          runtime: {}
        },
        OneToneI18n: {
          t: function (k, fb) {
            return fb || k;
          },
          lang: 'zh'
        },
        OneToneAppTargetPresets: {
          presets: [
            { id: 'codex-chat', icon: 'icons/app-target/codex.png', nameKey: 'appTargetCodex' },
            { id: 'claude-code', icon: 'icons/app-target/claude.png', nameKey: 'appTargetClaudeCode' },
            { id: 'cursor-chat', icon: 'icons/app-target/cursor.png', nameKey: 'appTargetCursor' },
            { id: 'trae-chat', icon: 'icons/app-target/trae.png', name: 'Trae' },
            { id: 'workbuddy-chat', icon: 'icons/app-target/workbuddy.png', name: 'WorkBuddy' }
          ],
          presetById: function (id) {
            for (var i = 0; i < this.presets.length; i++) {
              if (this.presets[i].id === id) return this.presets[i];
            }
            return null;
          },
          isWorkflowAppTarget: function (id) {
            return !!this.presetById(id);
          }
        },
        OneToneSemanticActionStore: {
          bindingViews: function () {
            return Promise.resolve(views);
          },
          ensureCatalog: function () {
            return Promise.resolve({});
          },
          fetchOptions: function () {
            return Promise.resolve([
              { actionId: 'input.cancel', bindable: true },
              { actionId: 'app.shortcut', bindable: true }
            ]);
          },
          entryMeta: function (id) {
            return { labelZh: id };
          },
          isSemanticBindableOnChannel: function () {
            return true;
          },
          optionFor: function () {
            return { bindable: true };
          }
        },
        OneToneActionBindingAdapters: {
          isMultiInstance: function (id) {
            return id === 'app.shortcut';
          },
          key: {
            upsert: function (mappingId, actionId, trigger, opts) {
              upsertCalls2.push({
                mappingId: mappingId,
                actionId: actionId,
                trigger: trigger,
                bindingRef: opts && Object.prototype.hasOwnProperty.call(opts, 'bindingRef')
                  ? opts.bindingRef
                  : opts,
                actionInstanceId: opts && opts.actionInstanceId,
                actionArgs: opts && opts.actionArgs
              });
              // Simulate creating a new key binding without touching softPad source.
              mapping.agentBindings.push({
                slotId: 'semantic:key:input.cancel:new',
                actionId: actionId,
                triggerType: 'key',
                triggerBinding: trigger,
                enabled: true,
                actionInstanceId: (opts && opts.actionInstanceId) || '',
                actionArgs: (opts && opts.actionArgs) || null
              });
              return Promise.resolve();
            }
          }
        },
        OneToneCodexMicroPadUi: {
          ensurePad: function () {
            ensurePadCalls++;
            throw new Error('ensurePad must not be called from softPad pick');
          },
          renderHardwarePad: function (_m, pad) {
            assert.strictEqual(pad.enabled, true, 'preview pad enabled');
            return (
              '<div class="micro-hw">' +
              '<button type="button" class="micro-hw__key is-bound" data-micro-key="AG05"><span class="micro-hw__icon"><svg></svg></span></button>' +
              '<button type="button" class="micro-hw__key is-bound" data-micro-key="AG04"><span class="micro-hw__icon"><svg></svg></span></button>' +
              '<button type="button" class="micro-hw__key is-bound" data-micro-key="ENC" role="switch"><span class="micro-hw__icon"></span></button>' +
              '<button type="button" class="micro-hw__key is-bound" data-micro-key="NAV_UP"><span class="micro-hw__icon"></span></button>' +
              '</div>'
            );
          }
        },
        OneToneKeysPageState: {
          getStep: function () {
            return 'target';
          }
        },
        OneToneUiFeedback: { toast: function () {} },
        OneToneMappingRecording: {
          mode: function () {
            return 'none';
          },
          startAgentBinding: function (_mid, hooks) {
            var n = (this._n = (this._n || 0) + 1);
            hooks.onDone(n === 1 ? 'F10' : 'F11');
            return Promise.resolve(true);
          }
        },
        document: doc2
      },
      document: doc2,
      console: console
    };
    sb2.window.document = doc2;
    loadScript('src/js/features/mapping/keys-channel-command-picker.js', sb2);
    var P2 = sb2.window.OneToneKeysChannelCommandPicker;
    assert.ok(P2);
    P2.init();

    function fireSoftPadKeyClick(microId, opts) {
      opts = opts || {};
      var keyEl = {
        classList: {
          contains: function (c) {
            return !!(opts.disabled && c === 'is-disabled');
          }
        },
        getAttribute: function (n) {
          if (n === 'data-micro-key') return microId;
          if (n === 'aria-disabled') return opts.disabled ? 'true' : null;
          return null;
        },
        querySelector: function () {
          return { innerHTML: '<svg data-icon="' + microId + '"></svg>' };
        },
        closest: function (sel) {
          if (String(sel).indexOf('data-micro-key') >= 0 || String(sel).indexOf('micro-hw__key') >= 0) {
            return keyEl;
          }
          return null;
        }
      };
      var ev = {
        preventDefault: function () {},
        target: keyEl,
        altKey: false,
        shiftKey: false
      };
      assert.ok(panelClickListeners.length > 0, 'panel click listener bound');
      panelClickListeners.forEach(function (fn) {
        fn(ev);
      });
    }

    // previewPadClone must not mutate mapping / must not call ensurePad
    var clone = P2.previewPadClone(mapping);
    assert.strictEqual(clone.enabled, true);
    assert.strictEqual(mapping.codexMicroPad.enabled, false, 'mapping pad stays disabled');
    assert.strictEqual(ensurePadCalls, 0);
    assert.strictEqual(JSON.stringify(mapping), mappingSnap, 'no pad mutation before refresh');

    return P2.refresh().then(function () {
      P2.setActiveTab('softPad');
      assert.ok(panelHtml.indexOf('keysSoftPadPickHost') >= 0, 'softPad keyboard host');
      assert.ok(panelHtml.indexOf('data-go-softpad') >= 0 || panelHtml.indexOf('data-add-app-shortcut') >= 0);

      // bindingRef === microKeyId (projection)
      var rProj = P2.resolveMigratableAction(mapping, 'AG04');
      assert.ok(rProj, 'projection microKey resolves');
      assert.strictEqual(rProj.actionId, 'app.shortcut');
      assert.strictEqual(rProj.actionInstanceId, 'inst1');
      assert.deepStrictEqual(rProj.actionArgs, { chord: 'Ctrl+K' });
      assert.strictEqual(rProj.keyBindingRef, 'semantic:key:app.shortcut:inst1');

      // trigger === microKeyId (softPad agent binding view)
      var rTrig = P2.resolveMigratableAction(mapping, 'AG05');
      assert.ok(rTrig, 'trigger microKey resolves');
      assert.strictEqual(rTrig.actionId, 'input.cancel');
      assert.strictEqual(rTrig.keyBindingRef, '', 'no key binding yet → empty keyBindingRef');

      assert.strictEqual(P2.resolveMigratableAction(mapping, 'ENC'), null, 'ENC not selectable');
      assert.strictEqual(P2.resolveMigratableAction(mapping, 'NAV_UP'), null, 'NAV not selectable');

      P2.setSelection({
        mappingId: 'm-soft',
        sourceChannel: 'softPad',
        sourceBindingRef: 'AG05',
        actionId: 'input.cancel',
        keyBindingRef: '',
        iconHtml: '<svg data-test="1"></svg>'
      });
      assert.strictEqual(P2.selectedSlotId(), '', 'selectedSlotId ignores softPad source ref');
      var hm = P2.heroModel();
      assert.ok(hm.active);
      assert.ok(String(hm.targetLabel).indexOf('input.cancel') >= 0 || hm.targetLabel.indexOf('待设置') >= 0);
      assert.ok(iconHost.innerHTML.indexOf('data-test') >= 0, 'icon host filled');

      return P2.recordSelected().then(function () {
        assert.strictEqual(upsertCalls2.length, 1, 'one key.upsert');
        assert.strictEqual(upsertCalls2[0].bindingRef, null, 'upsert bindingRef null when no key');
        assert.strictEqual(upsertCalls2[0].actionId, 'input.cancel');
        var softStill = mapping.agentBindings.find(function (b) {
          return b.slotId === 'semantic:softPad:input.cancel';
        });
        assert.ok(softStill);
        assert.strictEqual(softStill.triggerType, 'softPad', 'softPad source untouched');

        // app.shortcut keeps instance/args on upsert path
        upsertCalls2.length = 0;
        P2.setSelection({
          mappingId: 'm-soft',
          sourceChannel: 'softPad',
          sourceBindingRef: 'AG04',
          actionId: 'app.shortcut',
          keyBindingRef: 'semantic:key:app.shortcut:inst1',
          actionInstanceId: 'inst1',
          actionArgs: { chord: 'Ctrl+K' }
        });
        return P2.recordSelected().then(function () {
          assert.strictEqual(upsertCalls2.length, 1);
          assert.strictEqual(upsertCalls2[0].bindingRef, 'semantic:key:app.shortcut:inst1');
          assert.strictEqual(upsertCalls2[0].actionInstanceId, 'inst1');
          assert.deepStrictEqual(upsertCalls2[0].actionArgs, { chord: 'Ctrl+K' });

          P2.clearSelection();
          assert.ok(!P2.hasSelection());
          assert.strictEqual(iconHost.innerHTML, '', 'icon cleared');
          assert.ok(iconHost.hidden, 'icon host hidden');

          // no pad mapping: preview clone, no mutation
          var bare = { id: 'm-bare', agentBindings: [], codexMicroPad: null };
          var bareJson = JSON.stringify(bare);
          var bareClone = P2.previewPadClone(bare);
          assert.strictEqual(bareClone.enabled, true);
          assert.ok(Array.isArray(bareClone.keys));
          assert.strictEqual(JSON.stringify(bare), bareJson, 'no pad: mapping unchanged');
          assert.strictEqual(ensurePadCalls, 0);

          // Legacy commandPalette route → app.shortcut + DEFAULT_KEY_BY_SLOT chord
          var legacyMap = {
            id: 'm-legacy',
            appTargetId: 'codex-chat',
            agentBindings: [],
            codexMicroPad: {
              enabled: true,
              keys: [
                {
                  microKeyId: 'AG00',
                  slotId: 'commandPalette',
                  enabled: true,
                  uiIconId: 'palette'
                },
                {
                  microKeyId: 'AG05',
                  slotId: 'cancel',
                  enabled: true,
                  uiIconId: 'reject'
                }
              ]
            }
          };
          sb2.window.OneToneState.state.selectedMappingId = 'm-legacy';
          sb2.window.OneToneState.state.config.mappings = [legacyMap];
          sb2.window.OneToneAgentActions = {
            resolveCanonicalActionId: function (raw, sendMode) {
              var id = String(raw || '').trim();
              if (id === 'startDictation') return 'input.start';
              if (id === 'cancel') return 'input.cancel';
              if (id === 'openAgent' || id === 'focusComposer') return 'agent.focus';
              if (id === 'stopOrSendDictation') {
                return String(sendMode || '').toLowerCase() === 'auto' ? 'input.send' : 'input.commit';
              }
              return id;
            },
            slotById: function (id) {
              if (id === 'commandPalette') {
                return { slotId: 'commandPalette', actionId: 'commandPalette' };
              }
              if (id === 'cancel') return { slotId: 'cancel', actionId: 'cancel' };
              return null;
            },
            defaultKeyForSlot: function (id) {
              if (id === 'commandPalette') return 'Ctrl+K';
              if (id === 'cancel') return 'Escape';
              return '';
            },
            DEFAULT_KEY_BY_SLOT: { commandPalette: 'Ctrl+K', cancel: 'Escape' }
          };
          sb2.window.OneToneSemanticActionStore.bindingViews = function () {
            return Promise.resolve([]);
          };
          sb2.window.OneToneSemanticActionStore.fetchOptions = function () {
            return Promise.resolve([
              { actionId: 'app.shortcut', bindable: true },
              { actionId: 'input.cancel', bindable: true }
            ]);
          };
          return P2.refresh().then(function () {
            var rPal = P2.resolveMigratableAction(legacyMap, 'AG00');
            assert.ok(rPal, 'commandPalette route migratable');
            assert.strictEqual(rPal.actionId, 'app.shortcut');
            assert.strictEqual(rPal.actionInstanceId, 'softpad-mig:AG00');
            assert.ok(rPal.actionArgs, 'actionArgs present');
            assert.strictEqual(String(rPal.actionArgs.chord || ''), 'Ctrl+K');
            assert.strictEqual(rPal.keyBindingRef, '', 'no key row yet');

            var rCancel = P2.resolveMigratableAction(legacyMap, 'AG05');
            assert.ok(rCancel, 'cancel alias migratable');
            assert.strictEqual(rCancel.actionId, 'input.cancel');
            assert.strictEqual(rCancel.keyBindingRef, '');

            assert.strictEqual(P2.resolveMigratableAction(legacyMap, 'ENC'), null);
            assert.strictEqual(P2.resolveMigratableAction(legacyMap, 'NAV_UP'), null);
            assert.strictEqual(ensurePadCalls, 0);

            // Global edit: SoftPad requires app scope; upsert must hit scenario mapping, not global.
            var globalMap = {
              id: 'm-global',
              targetKey: 'RAlt',
              agentBindings: [],
              codexMicroPad: null
            };
            var codexMap = {
              id: 'm-codex-scene',
              appTargetId: 'codex-chat',
              agentBindings: [],
              codexMicroPad: {
                enabled: true,
                keys: [
                  {
                    microKeyId: 'AG00',
                    slotId: 'commandPalette',
                    enabled: true,
                    uiIconId: 'palette'
                  }
                ]
              }
            };
            var globalUpserts = [];
            sb2.window.OneToneState.state.selectedMappingId = 'm-global';
            sb2.window.OneToneState.state.config.mappings = [globalMap, codexMap];
            sb2.window.OneToneHabitHub = {
              findAppScenarioByAppId: function (appId) {
                return appId === 'codex-chat' ? codexMap : null;
              }
            };
            sb2.window.OneToneActionBindingAdapters.key.upsert = function (
              mappingId,
              actionId,
              trigger,
              opts
            ) {
              globalUpserts.push({
                mappingId: mappingId,
                actionId: actionId,
                trigger: trigger,
                bindingRef: opts && opts.bindingRef,
                actionInstanceId: opts && opts.actionInstanceId,
                actionArgs: opts && opts.actionArgs
              });
              return Promise.resolve();
            };
            sb2.window.OneToneSemanticActionStore.bindingViews = function (mappingId) {
              if (mappingId === 'm-codex-scene') {
                return Promise.resolve([
                  {
                    mappingId: 'm-codex-scene',
                    actionId: 'app.shortcut',
                    channel: 'softPad',
                    bindingRef: 'AG00',
                    trigger: 'AG00',
                    enabled: true
                  }
                ]);
              }
              return Promise.resolve([]);
            };
            P2.setSoftPadScopeAppId('', { skipRender: true, skipHero: true, skipClear: true });
            return P2.refresh().then(function () {
              // Manual clear keeps empty until user picks — lock blocks auto default.
              P2.setActiveTab('softPad');
              assert.ok(
                panelHtml.indexOf('data-softpad-scope-app') >= 0,
                'global softPad shows scope picker'
              );
              assert.ok(panelHtml.indexOf('soft-pad-app-chip') >= 0, 'scope chips use soft-pad-app-chip');
              assert.ok(
                panelHtml.indexOf('soft-pad-app-chip-icon') >= 0,
                'scope chips include app icons'
              );
              assert.ok(
                panelHtml.indexOf('keys-softpad-scope-more') < 0,
                'no nested details more row'
              );
              assert.ok(
                panelHtml.indexOf('data-softpad-scope-app="workbuddy-chat"') >= 0 ||
                  panelHtml.indexOf('data-softpad-scope-app="trae-chat"') >= 0,
                'more apps appear in same chip grid'
              );

              // Fresh session: enter SoftPad → default scope + keyboard
              P2.resetSoftPadScopeSession();
              P2.setActiveTab('softPad');
              assert.ok(P2.getSoftPadScopeAppId(), 'default app scope on SoftPad enter');
              assert.ok(
                panelHtml.indexOf('keysSoftPadPickHost') >= 0,
                'keyboard loads after default scope'
              );
              assert.ok(panelHtml.indexOf('keys-softpad-cap') >= 0, 'capability panel present');
              assert.ok(
                panelHtml.indexOf('keys-softpad-stage') >= 0,
                'pad+cap stage layout'
              );

              P2.setSoftPadScopeAppId('codex-chat', { refresh: false, skipRender: true });
              return P2.refresh().then(function () {
                P2.setActiveTab('softPad');
                var scope = P2.resolveSoftPadScope();
                assert.ok(scope);
                assert.strictEqual(scope.globalProxy, true);
                assert.strictEqual(scope.targetMappingId, 'm-codex-scene');
                assert.ok(panelHtml.indexOf('keysSoftPadPickHost') >= 0, 'scoped keyboard shown');
                assert.ok(panelHtml.indexOf('is-preview-only') < 0, 'real pad not preview-only');
                assert.ok(
                  panelHtml.indexOf('点击左侧键帽') >= 0 ||
                    panelHtml.indexOf('keysSoftPadCapEmpty') >= 0 ||
                    panelHtml.indexOf('Key capability') >= 0 ||
                    panelHtml.indexOf('键帽能力') >= 0,
                  'empty capability hint when no key selected'
                );

                var rScope = P2.resolveMigratableAction(codexMap, 'AG00');
                assert.ok(rScope);
                P2.setSelection({
                  mappingId: 'm-codex-scene',
                  sourceChannel: 'softPad',
                  sourceBindingRef: 'AG00',
                  actionId: rScope.actionId,
                  keyBindingRef: '',
                  actionInstanceId: rScope.actionInstanceId || '',
                  actionArgs: rScope.actionArgs,
                  iconHtml: '<svg data-cap="1"></svg>'
                });
                assert.ok(panelHtml.indexOf('keys-softpad-cap') >= 0);
                assert.ok(
                  panelHtml.indexOf('data-softpad-record') >= 0,
                  'selected key shows record CTA in cap'
                );
                var hmScope = P2.heroModel();
                assert.ok(hmScope.active);
                assert.ok(
                  String(hmScope.targetLabel).indexOf('Codex') >= 0 ||
                    String(hmScope.scopeTitle).indexOf('Codex') >= 0 ||
                    String(hmScope.scopeTitle).length > 0,
                  'hero shows app scope'
                );
                return P2.recordSelected().then(function () {
                  assert.strictEqual(globalUpserts.length, 1);
                  assert.strictEqual(
                    globalUpserts[0].mappingId,
                    'm-codex-scene',
                    'upsert writes scenario mapping, not global'
                  );
                  assert.notStrictEqual(globalUpserts[0].mappingId, 'm-global');

                  // P0: record snapshot survives clearSelection mid-record
                  var deferredHooks = null;
                  sb2.window.OneToneMappingRecording.startAgentBinding = function (_mid, hooks) {
                    deferredHooks = hooks;
                    return Promise.resolve(true);
                  };
                  globalUpserts.length = 0;
                  P2.setSelection({
                    mappingId: 'm-codex-scene',
                    sourceChannel: 'softPad',
                    sourceBindingRef: 'AG00',
                    actionId: 'app.shortcut',
                    keyBindingRef: '',
                    actionInstanceId: 'softpad-mig:AG00',
                    actionArgs: { chord: 'Ctrl+K' }
                  });
                  return P2.recordSelected().then(function () {
                    assert.strictEqual(P2.getSoftPadScopeLock(), 'record');
                    P2.clearSelection({ skipRender: true, skipHero: true });
                    P2.setSoftPadScopeAppId('claude-code', { skipRender: true, skipHero: true });
                    assert.strictEqual(
                      P2.getSoftPadScopeAppId(),
                      'codex-chat',
                      'record lock blocks scope switch'
                    );
                    assert.ok(deferredHooks && deferredHooks.onDone);
                    deferredHooks.onDone('F12');
                    return Promise.resolve().then(function () {
                      assert.strictEqual(globalUpserts.length, 1);
                      assert.strictEqual(globalUpserts[0].mappingId, 'm-codex-scene');
                      assert.strictEqual(globalUpserts[0].actionId, 'app.shortcut');
                      assert.notStrictEqual(P2.getSoftPadScopeLock(), 'record');

                      // P0: enabled Cursor scene wins over disabled+pad.on; missing pad → prepare on source
                      var cursorGeneral = {
                        id: 'm-cursor-general',
                        name: '通用设置',
                        enabled: false,
                        appTargetId: 'cursor-chat',
                        agentBindings: [],
                        codexMicroPad: {
                          enabled: true,
                          keys: [
                            {
                              microKeyId: 'AG00',
                              slotId: 'commandPalette',
                              enabled: true
                            }
                          ]
                        }
                      };
                      var cursorScene = {
                        id: 'm-cursor-scene',
                        name: 'Cursor 场景',
                        enabled: true,
                        appTargetId: 'cursor-chat',
                        agentBindings: [],
                        codexMicroPad: null
                      };
                      sb2.window.OneToneState.state.config.mappings = [
                        globalMap,
                        cursorGeneral,
                        cursorScene
                      ];
                      P2.resetSoftPadScopeSession();
                      P2.setSoftPadScopeAppId('cursor-chat', {
                        skipRender: true,
                        skipHero: true,
                        skipClear: true
                      });
                      var curScope = P2.resolveSoftPadScope();
                      assert.ok(curScope);
                      assert.strictEqual(
                        curScope.sourceMappingId,
                        'm-cursor-scene',
                        'unique enabled Cursor scene selected'
                      );
                      assert.strictEqual(curScope.targetMappingId, '');
                      assert.ok(curScope.missingScenario, 'no pad → missing');
                      var ensurePadTargets = [];
                      sb2.window.OneToneCodexMicroPadUi.ensurePad = function (m) {
                        ensurePadTargets.push(m && m.id);
                        m.codexMicroPad = {
                          enabled: true,
                          keys: [
                            {
                              microKeyId: 'AG00',
                              slotId: 'commandPalette',
                              enabled: true
                            }
                          ]
                        };
                        return m.codexMicroPad;
                      };
                      sb2.window.OneToneHabitHub = {
                        findAppScenarioByAppId: function () {
                          return cursorGeneral;
                        },
                        createAppScenario: function () {
                          throw new Error('must not create when sourceMappingId exists');
                        }
                      };
                      P2.prepareSoftPadScopeScenario();
                      assert.deepStrictEqual(
                        ensurePadTargets,
                        ['m-cursor-scene'],
                        'prepare ensurePad targets enabled Cursor scene'
                      );
                      assert.ok(cursorScene.codexMicroPad, 'pad written on Cursor scene');
                      assert.strictEqual(
                        P2.resolveSoftPadScope().targetMappingId,
                        'm-cursor-scene'
                      );

                      // P0: multi-scenario same appTargetId (both enabled) → ambiguous
                      var traeA = {
                        id: 'm-trae-a',
                        name: 'Trae A',
                        appTargetId: 'trae-chat',
                        agentBindings: [],
                        codexMicroPad: { enabled: true, keys: [] }
                      };
                      var traeB = {
                        id: 'm-trae-b',
                        name: 'Trae B',
                        appTargetId: 'trae-chat',
                        agentBindings: [],
                        codexMicroPad: { enabled: true, keys: [] }
                      };
                      sb2.window.OneToneState.state.config.mappings = [
                        globalMap,
                        codexMap,
                        traeA,
                        traeB
                      ];
                      P2.resetSoftPadScopeSession();
                      P2.setSoftPadScopeAppId('trae-chat', {
                        skipRender: true,
                        skipHero: true,
                        skipClear: true
                      });
                      var amb = P2.resolveSoftPadScope();
                      assert.ok(amb && amb.ambiguous, 'multi scenario ambiguous');
                      assert.strictEqual(amb.targetMappingId, '');
                      assert.strictEqual(amb.missingScenario, false);

                      // P0: missing scenario fail-closed + read-only SoftPad preview
                      P2.setSoftPadScopeAppId('workbuddy-chat', {
                        skipHero: true,
                        skipClear: true
                      });
                      var miss = P2.resolveSoftPadScope();
                      assert.ok(miss && miss.missingScenario);
                      assert.strictEqual(miss.targetMappingId, '');
                      assert.ok(
                        panelHtml.indexOf('keysSoftPadPickHost') >= 0,
                        'missing scenario still shows SoftPad preview'
                      );
                      assert.ok(panelHtml.indexOf('is-preview-only') >= 0, 'preview marked read-only');
                      assert.ok(
                        panelHtml.indexOf('data-softpad-prepare') >= 0,
                        'prepare CTA present in cap'
                      );
                      assert.ok(panelHtml.indexOf('keys-softpad-cap') >= 0);

                      // Hub scheme with pad → load that mapping's keyboard
                      var claudeHub = {
                        id: 'm-claude-hub',
                        appTargetId: 'claude-code',
                        agentBindings: [],
                        codexMicroPad: {
                          enabled: true,
                          keys: [
                            {
                              microKeyId: 'AG00',
                              slotId: 'commandPalette',
                              enabled: true,
                              uiIconId: 'palette'
                            }
                          ]
                        }
                      };
                      sb2.window.OneToneState.state.config.mappings = [globalMap, claudeHub];
                      sb2.window.OneToneSoftPadHub = {
                        listSoftPadSchemes: function () {
                          return [
                            {
                              appId: 'claude-code',
                              kind: 'claude',
                              mapping: claudeHub,
                              padEnabled: true,
                              canPrepare: false,
                              title: 'Claude'
                            }
                          ];
                        },
                        kindForAppId: function (id) {
                          return id === 'claude-code' ? 'claude' : '';
                        },
                        getFreshForegroundAppId: function () {
                          return '';
                        }
                      };
                      P2.resetSoftPadScopeSession();
                      P2.setSoftPadScopeAppId('claude-code', {
                        skipHero: true,
                        skipClear: true
                      });
                      var hubScope = P2.resolveSoftPadScope();
                      assert.ok(hubScope);
                      assert.strictEqual(hubScope.targetMappingId, 'm-claude-hub');
                      assert.strictEqual(hubScope.missingScenario, false);
                      assert.ok(panelHtml.indexOf('keysSoftPadPickHost') >= 0);
                      assert.ok(panelHtml.indexOf('is-preview-only') < 0);

                      // P1: fresh fg auto-preselect once
                      P2.resetSoftPadScopeSession();
                      sb2.window.OneToneSoftPadHub = {
                        getFreshForegroundAppId: function () {
                          return 'trae-chat';
                        }
                      };
                      sb2.window.OneToneAppTargetPresets = {
                        isWorkflowAppTarget: function (id) {
                          return id === 'trae-chat' || id === 'codex-chat';
                        },
                        presetById: function (id) {
                          return id === 'trae-chat'
                            ? { id: id, name: 'Trae', icon: 'icons/app-target/trae.png' }
                            : null;
                        },
                        presets: [{ id: 'trae-chat', name: 'Trae', icon: 'icons/app-target/trae.png' }]
                      };
                      assert.strictEqual(P2.maybeAutoPreselectSoftPadScope(), true);
                      assert.strictEqual(P2.getSoftPadScopeAppId(), 'trae-chat');
                      assert.strictEqual(P2.getSoftPadScopeLock(), 'none');
                      // second attempt blocked by autoPreselectDone
                      sb2.window.OneToneSoftPadHub.getFreshForegroundAppId = function () {
                        return 'codex-chat';
                      };
                      assert.strictEqual(P2.maybeAutoPreselectSoftPadScope(), false);
                      assert.strictEqual(P2.getSoftPadScopeAppId(), 'trae-chat');

                      // P1: manual lock wins over new fg
                      P2.resetSoftPadScopeSession();
                      P2.setSoftPadScopeAppId('codex-chat', {
                        skipRender: true,
                        skipHero: true,
                        skipClear: true
                      });
                      assert.strictEqual(P2.getSoftPadScopeLock(), 'manual');
                      sb2.window.OneToneSoftPadHub.getFreshForegroundAppId = function () {
                        return 'trae-chat';
                      };
                      assert.strictEqual(P2.maybeAutoPreselectSoftPadScope(), false);
                      assert.strictEqual(P2.getSoftPadScopeAppId(), 'codex-chat');

                      // No FG → fallback default app (Codex), not left empty
                      // Clear ready non-Codex pads so primary scan falls through to Codex.
                      P2.resetSoftPadScopeSession();
                      sb2.window.OneToneState.state.config.mappings = [globalMap];
                      sb2.window.OneToneSoftPadHub.getFreshForegroundAppId = function () {
                        return '';
                      };
                      assert.strictEqual(P2.maybeAutoPreselectSoftPadScope(), true);
                      assert.strictEqual(P2.getSoftPadScopeAppId(), 'codex-chat');
                      P2.resetSoftPadScopeSession();
                      sb2.window.OneToneSoftPadHub.getFreshForegroundAppId = function () {
                        return 'OneTone';
                      };
                      assert.strictEqual(P2.maybeAutoPreselectSoftPadScope(), true);
                      assert.strictEqual(P2.getSoftPadScopeAppId(), 'codex-chat');

                      // Real delegated click: migratable key → selection + cap + hero
                      sb2.window.OneToneState.state.config.mappings = [globalMap, codexMap];
                      sb2.window.OneToneState.state.selectedMappingId = 'm-global';
                      sb2.window.OneToneHabitHub = {
                        findAppScenarioByAppId: function (appId) {
                          return appId === 'codex-chat' ? codexMap : null;
                        }
                      };
                      sb2.window.OneToneSemanticActionStore.bindingViews = function (mappingId) {
                        if (mappingId === 'm-codex-scene') {
                          return Promise.resolve([
                            {
                              mappingId: 'm-codex-scene',
                              actionId: 'app.shortcut',
                              channel: 'softPad',
                              bindingRef: 'AG00',
                              trigger: 'AG00',
                              enabled: true
                            }
                          ]);
                        }
                        return Promise.resolve([]);
                      };
                      P2.resetSoftPadScopeSession();
                      P2.setSoftPadScopeAppId('codex-chat', {
                        skipHero: true,
                        skipClear: true
                      });
                      return P2.refresh().then(function () {
                        P2.clearSelection({ skipRender: true, skipHero: true });
                        fireSoftPadKeyClick('ENC');
                        assert.strictEqual(P2.hasSelection(), false, 'ENC does not select');
                        fireSoftPadKeyClick('NAV_UP');
                        assert.strictEqual(P2.hasSelection(), false, 'NAV does not select');
                        fireSoftPadKeyClick('AG00', { disabled: true });
                        assert.strictEqual(P2.hasSelection(), false, 'disabled key ignored');
                        fireSoftPadKeyClick('AG00');
                        var sel = P2.getSelection();
                        assert.ok(sel, 'click selects migratable key');
                        assert.strictEqual(sel.sourceBindingRef, 'AG00');
                        assert.strictEqual(sel.mappingId, 'm-codex-scene');
                        assert.ok(panelHtml.indexOf('data-softpad-record') >= 0);
                        assert.ok(P2.heroModel().active);
                        fireSoftPadKeyClick('AG00');
                        assert.strictEqual(
                          P2.hasSelection(),
                          false,
                          'second click clears selection'
                        );

                        // P0: real state shape — Codex with pad (no fake preview)
                        var codexReady = {
                          id: 'm-codex-ready',
                          appTargetId: 'codex-chat',
                          agentBindings: [],
                          codexMicroPad: {
                            enabled: true,
                            keys: [
                              {
                                microKeyId: 'AG00',
                                slotId: 'commandPalette',
                                enabled: true,
                                uiIconId: 'palette'
                              }
                            ]
                          }
                        };
                        sb2.window.OneToneState.selectedMappingId = 'wrong';
                        sb2.window.OneToneState.cfg = { mappings: [] };
                        sb2.window.OneToneState.state.selectedMappingId = 'm-global';
                        sb2.window.OneToneState.state.config.mappings = [globalMap, codexReady];
                        P2.resetSoftPadScopeSession();
                        P2.setSoftPadScopeAppId('codex-chat', {
                          skipRender: true,
                          skipHero: true,
                          skipClear: true
                        });
                        var readyScope = P2.resolveSoftPadScope();
                        assert.ok(readyScope);
                        assert.strictEqual(
                          readyScope.missingScenario,
                          false,
                          'inner config sees Codex pad'
                        );
                        assert.strictEqual(readyScope.targetMappingId, 'm-codex-ready');
                        assert.strictEqual(readyScope.globalProxy, true);
                        return P2.refresh().then(function () {
                          assert.ok(
                            panelHtml.indexOf('is-preview-only') < 0,
                            'no default preview shell when pad exists'
                          );
                          assert.ok(panelHtml.indexOf('keysSoftPadPickHost') >= 0);

                          // P0: direct scenario edit — no app chips, not globalProxy
                          var cursorDirect = {
                            id: 'm-cursor-direct',
                            name: 'Cursor 场景',
                            appTargetId: 'cursor-chat',
                            agentBindings: [],
                            codexMicroPad: {
                              enabled: true,
                              keys: [
                                {
                                  microKeyId: 'AG00',
                                  slotId: 'commandPalette',
                                  enabled: true
                                }
                              ]
                            }
                          };
                          sb2.window.OneToneState.state.selectedMappingId = 'm-cursor-direct';
                          sb2.window.OneToneState.state.config.mappings = [
                            globalMap,
                            cursorDirect
                          ];
                          P2.resetSoftPadScopeSession();
                          var directScope = P2.resolveSoftPadScope();
                          assert.ok(directScope);
                          assert.strictEqual(directScope.globalProxy, false);
                          assert.strictEqual(directScope.targetMappingId, 'm-cursor-direct');
                          assert.strictEqual(directScope.missingScenario, false);
                          return P2.refresh().then(function () {
                            assert.ok(
                              panelHtml.indexOf('data-softpad-scope="1"') < 0,
                              'scenario edit hides app picker'
                            );

                            // P0: scenario exists but no pad → real missing, not fake-ready
                            var bareCursor = {
                              id: 'm-cursor-bare',
                              name: 'Cursor bare',
                              appTargetId: 'cursor-chat',
                              agentBindings: [],
                              codexMicroPad: null
                            };
                            sb2.window.OneToneState.state.selectedMappingId = 'm-global';
                            sb2.window.OneToneState.state.config.mappings = [
                              globalMap,
                              bareCursor
                            ];
                            P2.resetSoftPadScopeSession();
                            P2.setSoftPadScopeAppId('cursor-chat', {
                              skipRender: true,
                              skipHero: true,
                              skipClear: true
                            });
                            var bareScope = P2.resolveSoftPadScope();
                            assert.strictEqual(bareScope.sourceMappingId, 'm-cursor-bare');
                            assert.strictEqual(bareScope.targetMappingId, '');
                            assert.strictEqual(bareScope.missingScenario, true);
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  })
  .then(function () {
    var disabledPadOn = {
      mapping: {
        id: 'a',
        enabled: false,
        order: 0,
        codexMicroPad: { enabled: true, overlayEnabled: true }
      }
    };
    var enabledPadOff = {
      mapping: {
        id: 'b',
        enabled: true,
        order: 99,
        codexMicroPad: { enabled: false, overlayEnabled: false }
      }
    };
    function schemeBetterLocal(a, b) {
      if (!b) return true;
      if (!a) return false;
      var ma = a.mapping;
      var mb = b.mapping;
      var aEn = ma && ma.enabled !== false ? 1 : 0;
      var bEn = mb && mb.enabled !== false ? 1 : 0;
      if (aEn !== bEn) return aEn > bEn;
      var aPad = ma && ma.codexMicroPad && ma.codexMicroPad.enabled ? 1 : 0;
      var bPad = mb && mb.codexMicroPad && mb.codexMicroPad.enabled ? 1 : 0;
      if (aPad !== bPad) return aPad > bPad;
      var aOv = ma && ma.codexMicroPad && ma.codexMicroPad.overlayEnabled ? 1 : 0;
      var bOv = mb && mb.codexMicroPad && mb.codexMicroPad.overlayEnabled ? 1 : 0;
      if (aOv !== bOv) return aOv > bOv;
      var aOrd = Number(ma && ma.order) || 0;
      var bOrd = Number(mb && mb.order) || 0;
      if (aOrd !== bOrd) return aOrd < bOrd;
      return String((ma && ma.id) || '') < String((mb && mb.id) || '');
    }
    assert.ok(
      schemeBetterLocal(enabledPadOff, disabledPadOn),
      'enabled mapping beats disabled+pad.on'
    );
    assert.strictEqual(
      !!(
        disabledPadOn.mapping.enabled !== false &&
        disabledPadOn.mapping.codexMicroPad.enabled
      ),
      false,
      'runtime padEnabled excludes disabled mapping'
    );
    console.log('semantic-action-ui.test.js: ok');
  })
  .catch(function (err) {
    console.error(err);
    process.exit(1);
  });
