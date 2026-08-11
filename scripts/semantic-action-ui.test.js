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
    console.log('semantic-action-ui.test.js: ok');
  })
  .catch(function (err) {
    console.error(err);
    process.exit(1);
  });
