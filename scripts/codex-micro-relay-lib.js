#!/usr/bin/env node
'use strict';

/**
 * Shared relay helpers — keep color table in sync with codex_micro_vendor.rs.
 */

var ALLOWED = {
  'v.oai.thstatus': true,
  'v.oai.rgbcfg': true,
  'lights.preview': true,
  'device.status': true,
  'sys.version': true
};

var ACTION_METHODS = {
  'v.oai.hid': true,
  'v.oai.rad': true
};

/** Official Codex slot colors → semantic state (AG00–AG05). */
function mapThstatusColorToState(c) {
  var n = Number(c);
  if (!Number.isFinite(n)) return 'idle';
  switch (n) {
    case 0:
    case 16777215:
      return 'idle';
    case 3166206:
      return 'running';
    case 65356:
      return 'done';
    case 16739584:
      return 'needs_input';
    case 16711731:
      return 'failed';
    default:
      return 'idle';
  }
}

function extractMethod(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '';
  return String(obj.m || obj.method || '').trim();
}

function slotIndex(item) {
  if (!item || typeof item !== 'object') return -1;
  if (Number.isInteger(item.id)) return item.id;
  if (Number.isInteger(item.i)) return item.i;
  if (Number.isInteger(item.index)) return item.index;
  if (Number.isInteger(item.slot)) return item.slot;
  var s = String(item.i || item.index || item.slot || '').trim();
  if (/^AG0(\d)$/i.test(s)) return parseInt(s.slice(3), 10);
  var n = parseInt(s, 10);
  return Number.isFinite(n) ? n : -1;
}

function slotStateFromItem(item) {
  var raw = item.s || item.status || item.state;
  if (typeof raw === 'string' && raw.trim()) {
    var s = raw.trim().toLowerCase();
    if (s === 'running' || s === 'busy' || s === 'working' || s === 'thinking') return 'running';
    if (s === 'needs_input' || s === 'waiting' || s === 'approval' || s === 'listening') return 'needs_input';
    if (s === 'done' || s === 'success' || s === 'complete') return 'done';
    if (s === 'failed' || s === 'error' || s === 'fail') return 'failed';
    if (s === 'idle' || s === 'ready' || s === 'ok') return 'idle';
  }
  if (item.c !== undefined && item.c !== null) {
    return mapThstatusColorToState(item.c);
  }
  return 'idle';
}

/**
 * Normalize Codex Desktop RPC into OneTone-friendly shape when needed.
 * Raw Codex thstatus passthrough also works once Rust parses native params[].
 */
function normalizeCodexRpc(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  var method = extractMethod(obj);
  if (method !== 'v.oai.thstatus') return obj;
  if (!Array.isArray(obj.params)) return obj;

  var slots = [];
  for (var i = 0; i < obj.params.length; i++) {
    var item = obj.params[i];
    if (!item || typeof item !== 'object') continue;
    var idx = slotIndex(item);
    if (idx < 0 || idx > 5) continue;
    slots.push({
      i: idx,
      s: slotStateFromItem(item),
      raw: item
    });
  }
  return {
    m: 'v.oai.thstatus',
    p: { slots: slots }
  };
}

function parseArgs(argv) {
  var url = 'http://127.0.0.1:8796/api/codex-micro/protocol';
  var file = '';
  for (var i = 2; i < argv.length; i++) {
    if (argv[i] === '--url' && argv[i + 1]) {
      url = argv[++i];
    } else if (argv[i] === '--file' && argv[i + 1]) {
      file = argv[++i];
    }
  }
  return { url: url, file: file };
}

function summarize(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return { connectionState: '?', nativeAg: 0, hasRgb: false };
  }
  var cells = Array.isArray(snapshot.cells) ? snapshot.cells : [];
  var nativeAg = 0;
  for (var j = 0; j < cells.length; j++) {
    var c = cells[j];
    var id = c && (c.microKeyId || c.micro_key_id);
    var src = c && (c.statusSource || c.status_source);
    if (id && String(id).indexOf('AG') === 0 && src === 'native') nativeAg++;
  }
  return {
    connectionState: snapshot.connectionState || snapshot.connection_state || '?',
    nativeAg: nativeAg,
    hasRgb: !!snapshot.rgb
  };
}

module.exports = {
  ALLOWED: ALLOWED,
  ACTION_METHODS: ACTION_METHODS,
  mapThstatusColorToState: mapThstatusColorToState,
  extractMethod: extractMethod,
  normalizeCodexRpc: normalizeCodexRpc,
  parseArgs: parseArgs,
  summarize: summarize
};
