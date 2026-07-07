#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

function loadModule(relPath, sandbox) {
  const code = fs.readFileSync(path.join(root, relPath), 'utf8');
  vm.runInNewContext(code, sandbox, { filename: relPath });
}

function createSandbox() {
  const sandbox = {
    console,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Math,
    Date,
    Set,
    Error,
    globalThis: null,
    window: null
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  return sandbox;
}

function defaultCfg() {
  return {
    version: 6,
    activeSceneId: 'scene-default',
    mappings: [{
      id: 'scene-default',
      label: '',
      group: '  ',
      triggerKey: 'AutoTrigger',
      targetKey: 'F2',
      enabled: true,
      order: 0,
      triggerMode: 'tap',
      appTargetId: '',
      appBehaviorRules: [],
      voiceOverride: null
    }],
    voiceVosk: {
      enabled: true,
      phrases: ['小调小调'],
      targetKey: 'RAlt'
    },
    voiceSapi: { enabled: false, phrases: [], targetKey: '' },
    voiceEnd: {
      enabled: true,
      phrasesZh: ['结束输入'],
      phrasesEn: ['send it'],
      targetKey: ''
    }
  };
}

function addMapping(cfg, id, order, enabled) {
  cfg.mappings.push({
    id,
    label: '',
    group: '  ',
    triggerKey: 'AutoTrigger',
    targetKey: 'F2',
    enabled,
    order,
    triggerMode: 'tap',
    appTargetId: '',
    appBehaviorRules: [],
    voiceOverride: null
  });
  return id;
}

function assertReconcile(HabitProfile, cfg, label) {
  const result = HabitProfile.reconcileWithSceneConfig(cfg);
  if (!result.ok) {
    console.error('FAIL', label, result.errors);
    process.exitCode = 1;
    return;
  }
  console.log('ok', label);
}

function main() {
  const sandbox = createSandbox();
  sandbox.OneToneMappingCore = {
    editorTrigger: function (m) { return String(m.triggerKey || '').trim(); },
    editorTarget: function (m) { return String(m.targetKey || '').trim(); },
    isSaved: function (m) {
      return !!(String(m.triggerKey || '').trim() && String(m.targetKey || '').trim());
    }
  };
  loadModule('src/js/core/scene-config.js', sandbox);
  loadModule('src/js/core/habit-profile.js', sandbox);
  const HabitProfile = sandbox.OneToneHabitProfile;
  if (!HabitProfile || !HabitProfile.reconcileWithSceneConfig) {
    console.error('OneToneHabitProfile.reconcileWithSceneConfig missing');
    process.exit(1);
  }

  const cfg = defaultCfg();
  assertReconcile(HabitProfile, cfg, 't2-null-override');

  const t3 = defaultCfg();
  t3.mappings[0].voiceOverride = { targetKey: 'F9' };
  assertReconcile(HabitProfile, t3, 't3-partial-target');

  const t4 = defaultCfg();
  t4.mappings[0].voiceOverride = {
    wakePhrases: ['小调小调'],
    endPhrases: { zh: ['结束输入'], en: ['send it'] }
  };
  assertReconcile(HabitProfile, t4, 't4-wake-end-override');

  const t5 = defaultCfg();
  t5.mappings[0].appTargetId = 'cursor-chat';
  t5.mappings[0].targetKey = 'Ctrl+L';
  assertReconcile(HabitProfile, t5, 't5-workflow-app');

  const t7 = defaultCfg();
  const b = addMapping(t7, 'scene-b', 1, false);
  t7.mappings.find(function (m) { return m.id === b; }).voiceOverride = {
    wakePhrases: ['scene b wake']
  };
  t7.activeSceneId = b;
  assertReconcile(HabitProfile, t7, 't7-switch-active');

  const split = defaultCfg();
  split.activeSceneId = split.mappings[0].id;
  split.mappings[0].enabled = false;
  addMapping(split, 'scene-b', 1, true);
  assertReconcile(HabitProfile, split, 'key-enabled-vs-active');

  if (!process.exitCode) console.log('all reconcile checks passed');
}

main();
