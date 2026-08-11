/**
 * Smoke + rollback tests for OneToneSemanticPresets (C3 P0).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(
  path.join(__dirname, '../src/js/features/agent/semantic-action-presets.js'),
  'utf8'
);

function makeSandbox(extra) {
  var sandbox = {
    console,
    setTimeout,
    clearTimeout,
    Promise,
    JSON,
    Error,
    Array,
    Object,
    String,
    Math,
    Date,
    globalThis: null
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  if (extra) Object.assign(sandbox, extra);
  vm.runInNewContext(src, sandbox);
  return sandbox;
}

var base = makeSandbox();
var P = base.OneToneSemanticPresets;
assert.ok(P, 'OneToneSemanticPresets exported');
assert.strictEqual(P.list().length, 4, 'four presets');
assert.ok(P.softPadNeedsMicroKey({}));
assert.ok(!P.softPadNeedsMicroKey({ microKeyId: 'AG04' }));

base.OneToneState = {
  cfg: {
    mappings: [
      {
        id: 'm1',
        agentBindings: [{ slotId: 'x', actionId: 'input.start', triggerType: 'voice' }],
        cameraOverride: { shakeHead: 'none' },
        codexMicroPad: { layoutId: 'test' }
      }
    ]
  }
};
base.OneToneConfigPersist = {
  saveAsync: function () {
    return Promise.resolve();
  }
};

var snap = P.snapshotBindings('m1');
assert.strictEqual(snap.agentBindings.length, 1);
assert.ok(snap.cameraOverride);
assert.ok(snap.codexMicroPad);
base.OneToneState.cfg.mappings[0].agentBindings = [];
base.OneToneState.cfg.mappings[0].cameraOverride = null;
base.OneToneState.cfg.mappings[0].codexMicroPad = null;

  function previewNeedsKey() {
    var sb = makeSandbox({
      OneToneState: base.OneToneState,
      OneToneSemanticActionStore: {
        fetchOptions: function () {
          return Promise.resolve([
            { actionId: 'agent.approve', bindable: true },
            { actionId: 'agent.reject', bindable: true }
          ]);
        }
      }
    });
    return sb.OneToneSemanticPresets.preview('m1', 'visionApprove').then(function (plan) {
      var soft = plan.items.filter(function (it) {
        return it.channel === 'softPad';
      });
      assert.strictEqual(soft.length, 1);
      assert.strictEqual(soft[0].status, 'needs_key');
      assert.strictEqual(soft[0].reason, 'needs_micro_key');
    });
  }

  function cameraOverwriteUsesBindKey() {
    var sb = makeSandbox({
      OneToneState: {
        cfg: {
          mappings: [
            {
              id: 'm1',
              cameraOverride: { okHand: 'agent:agent.approve' }
            }
          ]
        }
      },
      OneToneSemanticActionStore: {
        fetchOptions: function () {
          return Promise.resolve([{ actionId: 'agent.approve', bindable: true }]);
        }
      }
    });
    return sb.OneToneSemanticPresets.preview('m1', 'visionApprove').then(function (plan) {
      var cam = plan.items.filter(function (it) {
        return it.channel === 'camera' && it.actionId === 'agent.approve';
      });
      assert.strictEqual(cam.length, 1);
      assert.strictEqual(cam[0].status, 'apply');
      assert.strictEqual(cam[0].willOverwrite, true);
    });
  }

function rollbackOnThirdFailure() {
  var m = base.OneToneState.cfg.mappings[0];
  m.agentBindings = [{ slotId: 'a', actionId: 'input.start', triggerType: 'voice', triggerBinding: 'x' }];
  m.cameraOverride = { shakeHead: 'none' };
  m.codexMicroPad = { layoutId: 'keep' };

  var writes = 0;
  var sb = makeSandbox({
    OneToneState: base.OneToneState,
    OneToneConfigPersist: { saveAsync: function () { return Promise.resolve(); } },
    OneToneSemanticActionStore: {
      fetchOptions: function (_mid, ch) {
        var ids =
          ch === 'key'
            ? ['agent.interrupt']
            : ch === 'voice'
              ? ['agent.interrupt']
              : ['agent.reject'];
        return Promise.resolve(
          ids.map(function (id) {
            return { actionId: id, bindable: true };
          })
        );
      }
    },
    OneToneActionBindingAdapters: {
      get: function (ch) {
        if (ch !== 'key' && ch !== 'voice') return null;
        return {
          upsert: function () {
            writes++;
            if (writes >= 3) return Promise.reject(new Error('fail_third'));
            m.agentBindings.push({
              slotId: 'w' + writes,
              actionId: 'agent.interrupt',
              triggerType: ch,
              triggerBinding: 't' + writes
            });
            return Promise.resolve();
          }
        };
      },
      findPrimaryBinding: function () {
        return null;
      }
    },
    OneToneCameraPresenceActions: {
      persistBindActionMappingScoped: function () {
        writes++;
        if (writes >= 3) return Promise.reject(new Error('fail_third'));
        m.cameraOverride = { shakeHead: 'agent:agent.reject' };
        return Promise.resolve('agent:agent.reject');
      }
    }
  });

  return sb.OneToneSemanticPresets.apply('m1', 'agentSafety', { confirmed: true })
    .then(function () {
      throw new Error('expected failure');
    })
    .catch(function (err) {
      assert.strictEqual(err.message, 'fail_third');
      assert.strictEqual(m.agentBindings.length, 1);
      assert.strictEqual(m.agentBindings[0].slotId, 'a');
      assert.strictEqual(m.cameraOverride.shakeHead, 'none');
      assert.strictEqual(m.codexMicroPad.layoutId, 'keep');
    });
}

Promise.resolve()
  .then(function () {
    return P.restoreBindings(snap);
  })
  .then(function () {
    assert.strictEqual(base.OneToneState.cfg.mappings[0].agentBindings.length, 1);
    assert.ok(base.OneToneState.cfg.mappings[0].cameraOverride);
    assert.ok(base.OneToneState.cfg.mappings[0].codexMicroPad);
    return previewNeedsKey();
  })
  .then(function () {
    return cameraOverwriteUsesBindKey();
  })
  .then(function () {
    return rollbackOnThirdFailure();
  })
  .then(function () {
    console.log('semantic-action-presets.test.js: ok');
  })
  .catch(function (err) {
    console.error(err);
    process.exit(1);
  });
