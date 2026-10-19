import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

for (const key of ['XButton1', 'XButton2']) {
  let finishes = 0;
  let committed = '';
  const requests = [];
  const timers = new Map();
  let timerId = 0;
  const ctx = {
    console, Promise, Date,
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    OneToneDom: { $: () => null },
    OneToneI18n: { t: k => k },
    OneToneMappingCore: { recording: () => null, byId: () => null, selected: () => null },
    OneToneMappingRecording: {
      mode: () => 'trigger', triggerSlot: () => 'oral', mappingId: () => 'habit',
      previewKey: () => key, resolveHardwareTriggerFromSeen: k => k,
      isHardwareCaptureToken: k => /^XButton[12]$/.test(k),
      previewCaptureKey: (_mode, k) => k, updatePreview() {}, notifyOnboardingPreview() {},
      finishTrigger(k, _source, _sourceKey, _time, options) {
        assert.equal(options.backendCommitted, true);
        committed = k;
      },
      finishDetectedHardwareTrigger: () => { finishes++; }
    },
    OneToneIpc: { invoke: async (command, args) => { requests.push({ command, args }); } },
    __vp_mapping_recording_input_hooks__: {
      pushLog() {}, toast() {}, playSoundCue() {}, armTriggerPeripheralGuard() {},
      friendlyKeyName: k => k, triggerPeripheralGuardUntil: () => 0
    }
  };
  vm.runInNewContext(fs.readFileSync('src/js/features/mapping/mapping-recording-input.js', 'utf8'), ctx);
  ctx.OneToneMappingRecordingInput.handleWebViewMessage({ type: 'mvp_record_seen', key, mappingId: 'habit' });
  assert.equal(finishes, 0, 'seen preview must not finish oral capture');
  for (const fn of [...timers.values()]) fn();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(finishes, 0, 'timeout must not report a successful oral recording before native acknowledgement');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].command, 'cmd_frontend_keydown');
  assert.equal(requests[0].args.mode, 'oralTrigger');
  assert.equal(requests[0].args.key, key);
  ctx.OneToneMappingRecordingInput.handleWebViewMessage({ type: 'mvp_key_captured', key, mode: 'oralTrigger', mappingId: 'habit' });
  assert.equal(committed, key, 'native acknowledgement completes the correct side button');
}
console.log('oral recording waits for native acknowledgement: ok');
