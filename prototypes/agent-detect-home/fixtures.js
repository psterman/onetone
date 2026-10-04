/**
 * Agent 检测首页 fixtures · 唯一用量事实源 = usage（投影到 Board DTO）。
 * 禁止平行的 stats.* 字段。
 */
(function (global) {
  'use strict';

  var AGENTS = [
    { kind: 'cursor', name: 'Cursor', connect: 'cursor' },
    { kind: 'codex', name: 'Codex', connect: 'codex' },
    { kind: 'claude', name: 'Claude', connect: 'claude' },
    { kind: 'minimax', name: 'MiniMax', connect: 'minimax' },
    { kind: 'workbuddy', name: 'WorkBuddy', connect: 'shell' },
    { kind: 'trae', name: 'Trae', connect: 'solo' },
    { kind: 'qoder', name: 'Qoder', connect: 'shell' },
    { kind: 'gemini', name: 'Gemini', connect: 'shell' }
  ];

  /** usage-shaped · null fields stay — after projection */
  var USAGE = {
    cursor: {
      source: 'cursor_local_activity',
      sourceLabel: '本机活动',
      status: 'ready',
      confidence: 'local_only',
      message: '本机活动 · 非官方额度',
      localTodayRequests: 86,
      localTodaySessions: 7,
      localTodayActiveMs: 6120000,
      remainingPercent: null,
      totalCostUsd: null,
      estimatedCostUsd: null,
      model: 'Composer'
    },
    codex: {
      source: 'codex_app_server',
      sourceLabel: 'App Server',
      status: 'ready',
      confidence: 'official',
      message: '窗口限额已连接',
      remainingPercent: 62,
      localTodayTokens: 42000,
      totalCostUsd: null,
      estimatedCostUsd: null,
      model: 'o3'
    },
    claude: {
      source: 'claude_statusline',
      sourceLabel: 'statusLine',
      status: 'ready',
      confidence: 'official',
      message: 'OTel / statusLine',
      remainingPercent: 48,
      localTodayTokens: 128000,
      estimatedCostUsd: 1.2,
      costIsEstimate: true,
      model: 'Sonnet',
      modelConfidence: 'high'
    },
    minimax: {
      source: 'provider_local',
      sourceLabel: '本机估算',
      status: 'ready',
      confidence: 'manual_or_local_estimate',
      message: '本机估算 · 无官方 remaining',
      remainingPercent: null,
      localTodayTokens: 9000,
      estimatedCostUsd: 0.4,
      costIsEstimate: true,
      model: '—'
    },
    workbuddy: {
      source: '',
      sourceLabel: '无可靠源',
      status: '',
      confidence: '',
      message: '未接通用量',
      remainingPercent: null
    },
    trae: {
      source: '',
      sourceLabel: '无可靠源',
      status: '',
      confidence: '',
      message: '未检测到',
      remainingPercent: null
    },
    qoder: {
      source: 'qoder_openapi',
      sourceLabel: 'OpenAPI',
      status: 'ready',
      confidence: 'official',
      message: 'OpenAPI 额度',
      remainingPercent: 71,
      localTodayTokens: 15000,
      totalCostUsd: 0.85,
      model: 'Qoder'
    },
    gemini: {
      source: '',
      sourceLabel: '无可靠源',
      status: '',
      confidence: '',
      message: 'CLI 已装 · 无用量回传',
      remainingPercent: null
    }
  };

  /** Cursor consent-needed variant for hooks scene */
  var USAGE_CURSOR_CONSENT = {
    source: 'cursor_local_activity',
    sourceLabel: '本机活动',
    status: 'unavailable',
    confidence: '',
    message: '未启用 Cursor 活动统计',
    localTodayRequests: null,
    localTodaySessions: null,
    localTodayActiveMs: null,
    remainingPercent: null
  };

  var SCENES = {
    mixed: {
      id: 'mixed',
      label: '混合实况',
      scannedAt: '刚刚',
      onetoneToday: { voice: 4, keys: 11, softPad: 7, camera: 0 },
      rows: {
        cursor: { presence: 'desktop', confidence: 'high', running: true, padReady: true, hook: 'ok', light: 'working' },
        codex: { presence: 'desktop', confidence: 'high', running: true, padReady: true, hook: 'ok', light: 'needsInput' },
        claude: { presence: 'cli', confidence: 'high', running: false, padReady: true, hook: 'ok', light: 'idle' },
        minimax: { presence: 'desktop', confidence: 'high', running: false, padReady: true, hook: 'partial', light: 'unknown' },
        workbuddy: { presence: 'desktop', confidence: 'high', running: false, padReady: false, hook: 'missing', light: 'unknown' },
        trae: { presence: 'none', confidence: 'low', running: false, padReady: false, hook: 'missing', light: 'unknown' },
        qoder: { presence: 'desktop', confidence: 'high', running: false, padReady: true, hook: 'ok', light: 'idle' },
        gemini: { presence: 'cli', confidence: 'high', running: false, padReady: true, hook: 'ok', light: 'idle' }
      }
    },
    quiet: {
      id: 'quiet',
      label: '都已装好 · 都空闲',
      scannedAt: '1 分钟前',
      onetoneToday: { voice: 1, keys: 3, softPad: 2, camera: 0 },
      rows: {
        cursor: { presence: 'desktop', confidence: 'high', running: false, padReady: true, hook: 'ok', light: 'idle' },
        codex: { presence: 'desktop', confidence: 'high', running: false, padReady: true, hook: 'ok', light: 'idle' },
        claude: { presence: 'cli', confidence: 'high', running: false, padReady: true, hook: 'ok', light: 'idle' },
        minimax: { presence: 'desktop', confidence: 'high', running: false, padReady: true, hook: 'partial', light: 'idle' },
        workbuddy: { presence: 'desktop', confidence: 'high', running: false, padReady: true, hook: 'ok', light: 'idle' },
        trae: { presence: 'desktop', confidence: 'high', running: false, padReady: true, hook: 'ok', light: 'idle' },
        qoder: { presence: 'desktop', confidence: 'high', running: false, padReady: true, hook: 'ok', light: 'idle' },
        gemini: { presence: 'cli', confidence: 'high', running: false, padReady: true, hook: 'ok', light: 'idle' }
      }
    },
    hooks: {
      id: 'hooks',
      label: '能控 · Hook 缺口多',
      scannedAt: '刚刚',
      onetoneToday: { voice: 2, keys: 5, softPad: 1, camera: 0 },
      cursorUsage: 'consent',
      rows: {
        cursor: { presence: 'desktop', confidence: 'high', running: true, padReady: true, hook: 'missing', light: 'unknown' },
        codex: { presence: 'desktop', confidence: 'high', running: false, padReady: true, hook: 'missing', light: 'unknown' },
        claude: { presence: 'cli', confidence: 'high', running: false, padReady: true, hook: 'missing', light: 'unknown' },
        minimax: { presence: 'desktop', confidence: 'high', running: false, padReady: true, hook: 'missing', light: 'unknown' },
        workbuddy: { presence: 'desktop', confidence: 'low', running: false, padReady: false, hook: 'missing', light: 'unknown' },
        trae: { presence: 'none', confidence: 'low', running: false, padReady: false, hook: 'missing', light: 'unknown' },
        qoder: { presence: 'none', confidence: 'low', running: false, padReady: false, hook: 'missing', light: 'unknown' },
        gemini: { presence: 'cli', confidence: 'high', running: false, padReady: false, hook: 'missing', light: 'unknown' }
      }
    },
    empty: {
      id: 'empty',
      label: '本机几乎没装',
      scannedAt: '刚刚',
      onetoneToday: { voice: 0, keys: 0, softPad: 0, camera: 0 },
      rows: {
        cursor: { presence: 'none', confidence: 'low', running: false, padReady: false, hook: 'missing', light: 'unknown' },
        codex: { presence: 'none', confidence: 'low', running: false, padReady: false, hook: 'missing', light: 'unknown' },
        claude: { presence: 'none', confidence: 'low', running: false, padReady: false, hook: 'missing', light: 'unknown' },
        minimax: { presence: 'none', confidence: 'low', running: false, padReady: false, hook: 'missing', light: 'unknown' },
        workbuddy: { presence: 'none', confidence: 'low', running: false, padReady: false, hook: 'missing', light: 'unknown' },
        trae: { presence: 'none', confidence: 'low', running: false, padReady: false, hook: 'missing', light: 'unknown' },
        qoder: { presence: 'none', confidence: 'low', running: false, padReady: false, hook: 'missing', light: 'unknown' },
        gemini: { presence: 'none', confidence: 'low', running: false, padReady: false, hook: 'missing', light: 'unknown' }
      }
    }
  };

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function usageFor(kind, scene) {
    if (kind === 'cursor' && scene.cursorUsage === 'consent') return clone(USAGE_CURSOR_CONSENT);
    return clone(USAGE[kind] || USAGE.trae);
  }

  function buildSnapshot(sceneId) {
    var scene = SCENES[sceneId] || SCENES.mixed;
    var agents = AGENTS.map(function (meta) {
      var row = scene.rows[meta.kind] || {
        presence: 'none',
        confidence: 'low',
        running: false,
        padReady: false,
        hook: 'missing',
        light: 'unknown'
      };
      return Object.assign({}, meta, row, { usage: usageFor(meta.kind, scene) });
    });
    return {
      sceneId: scene.id,
      sceneLabel: scene.label,
      scannedAt: scene.scannedAt,
      onetoneToday: clone(scene.onetoneToday),
      agents: agents
    };
  }

  global.AgentDetectFixtures = {
    sceneIds: Object.keys(SCENES),
    labels: Object.keys(SCENES).reduce(function (acc, id) {
      acc[id] = SCENES[id].label;
      return acc;
    }, {}),
    getSnapshot: buildSnapshot,
    USAGE: USAGE
  };
})(typeof window !== 'undefined' ? window : globalThis);
