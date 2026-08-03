#!/usr/bin/env node
'use strict';

/**
 * Codex Hook probe (P0) — fail-open, stdout empty.
 * Reads hook JSON from stdin, appends safe fields to logs/codex-hook-probe.jsonl,
 * optionally POSTs to OneTone /api/codex-app/state (100–150ms timeout).
 */

var fs = require('fs');
var path = require('path');
var http = require('http');

var REPO_ROOT = path.resolve(__dirname, '..');
var LOG_DIR = path.join(REPO_ROOT, 'logs');
var JSONL_PATH = path.join(LOG_DIR, 'codex-hook-probe.jsonl');
var DEBUG_PATH = path.join(LOG_DIR, 'codex-hook-probe.debug.log');
var DEFAULT_URL = 'http://127.0.0.1:8796/api/codex-app/state';
var POST_TIMEOUT_MS = 1500;

var SAFE_KEYS = [
  'hook_event_name',
  'session_id',
  'turn_id',
  'cwd',
  'model',
  'permission_mode',
  'tool_name',
  'agent_id',
  'agent_type',
  'stop_hook_active'
];

function debugLog(msg) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(DEBUG_PATH, new Date().toISOString() + ' ' + String(msg) + '\n', 'utf8');
  } catch (_) {}
}

function extractSafeFields(raw) {
  var obj = raw && typeof raw === 'object' ? raw : {};
  var out = { ts: Date.now() };
  for (var i = 0; i < SAFE_KEYS.length; i++) {
    var k = SAFE_KEYS[i];
    if (obj[k] === undefined || obj[k] === null) continue;
    var v = obj[k];
    if (typeof v === 'object') continue;
    out[k] = v;
  }
  // Common nested aliases (defensive, still no prompt/tool_input bodies)
  if (out.tool_name == null && obj.tool_name == null && obj.toolName != null) {
    out.tool_name = obj.toolName;
  }
  if (out.session_id == null && obj.sessionId != null) out.session_id = obj.sessionId;
  if (out.turn_id == null && obj.turnId != null) out.turn_id = obj.turnId;
  if (out.agent_id == null && obj.agentId != null) out.agent_id = obj.agentId;
  if (out.agent_type == null && obj.agentType != null) out.agent_type = obj.agentType;
  if (out.permission_mode == null && obj.permissionMode != null) {
    out.permission_mode = obj.permissionMode;
  }
  if (out.hook_event_name == null && obj.hook_event_name == null && obj.event != null) {
    out.hook_event_name = obj.event;
  }
  return out;
}

function appendJsonl(record, jsonlPath) {
  var target = jsonlPath || JSONL_PATH;
  var dir = path.dirname(target);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(target, JSON.stringify(record) + '\n', 'utf8');
}

function buildPostBody(fields) {
  return {
    source: 'codex_hook',
    event: fields.hook_event_name || '',
    sessionId: fields.session_id != null ? String(fields.session_id) : '',
    turnId: fields.turn_id != null ? String(fields.turn_id) : '',
    cwd: fields.cwd != null ? String(fields.cwd) : '',
    model: fields.model != null ? String(fields.model) : '',
    permissionMode: fields.permission_mode != null ? String(fields.permission_mode) : '',
    toolName: fields.tool_name != null ? String(fields.tool_name) : '',
    agentId: fields.agent_id != null ? String(fields.agent_id) : '',
    agentType: fields.agent_type != null ? String(fields.agent_type) : '',
    ts: fields.ts || Date.now()
  };
}

function readIntegrationToken() {
  try {
    if (process.env.ONETONE_SOFT_PAD_TOKEN) return String(process.env.ONETONE_SOFT_PAD_TOKEN).trim();
    var appdata = process.env.APPDATA || '';
    var candidates = [];
    if (appdata) {
      candidates.push(path.join(appdata, 'onetone', 'app', 'config', 'soft-pad-integration.token'));
      candidates.push(path.join(appdata, 'com.onetone', 'app', 'config', 'soft-pad-integration.token'));
      candidates.push(path.join(appdata, 'com.onetone.app', 'config', 'soft-pad-integration.token'));
      candidates.push(path.join(appdata, 'com.onetone', 'app', 'soft-pad-integration.token'));
      candidates.push(path.join(appdata, 'onetone', 'app', 'soft-pad-integration.token'));
      candidates.push(path.join(appdata, 'com.onetone.app', 'soft-pad-integration.token'));
    }
    for (var i = 0; i < candidates.length; i++) {
      if (fs.existsSync(candidates[i])) {
        return String(fs.readFileSync(candidates[i], 'utf8') || '').trim();
      }
    }
  } catch (_) {}
  return '';
}

function postState(urlStr, body, timeoutMs) {
  return new Promise(function (resolve) {
    try {
      var u = new URL(urlStr || DEFAULT_URL);
      var raw = Buffer.from(JSON.stringify(body), 'utf8');
      var headers = {
        'Content-Type': 'application/json',
        'Content-Length': raw.length,
        Host: (u.hostname || '127.0.0.1') + (u.port ? ':' + u.port : '')
      };
      var token = readIntegrationToken();
      if (token) headers['X-Onetone-Token'] = token;
      var req = http.request(
        {
          hostname: u.hostname,
          port: u.port || 80,
          path: u.pathname + (u.search || ''),
          method: 'POST',
          headers: headers,
          timeout: timeoutMs != null ? timeoutMs : POST_TIMEOUT_MS
        },
        function (res) {
          res.resume();
          res.on('end', function () {
            resolve({ ok: true, status: res.statusCode || 0 });
          });
        }
      );
      req.on('error', function () {
        resolve({ ok: false });
      });
      req.on('timeout', function () {
        try {
          req.destroy();
        } catch (_) {}
        resolve({ ok: false });
      });
      req.write(raw);
      req.end();
    } catch (_) {
      resolve({ ok: false });
    }
  });
}

function readStdinSync() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (err) {
    debugLog('stdin read failed: ' + (err && err.message));
    return '';
  }
}

async function run(opts) {
  opts = opts || {};
  var skipPost = !!opts.skipPost;
  var jsonlPath = opts.jsonlPath || JSONL_PATH;
  var url = opts.url || process.env.ONETONE_CODEX_APP_STATE_URL || DEFAULT_URL;
  var stdinText = opts.stdinText != null ? opts.stdinText : readStdinSync();

  var parsed = null;
  try {
    var trimmed = String(stdinText || '').trim();
    if (trimmed) parsed = JSON.parse(trimmed);
  } catch (err) {
    debugLog('json parse failed: ' + (err && err.message));
    parsed = {};
  }

  var fields = extractSafeFields(parsed || {});
  try {
    appendJsonl(fields, jsonlPath);
  } catch (err) {
    debugLog('jsonl append failed: ' + (err && err.message));
  }

  if (!skipPost) {
    try {
      var body = buildPostBody(fields);
      var res = await postState(url, body, POST_TIMEOUT_MS);
      if (!res || !res.ok) {
        debugLog('post retry after fail status=' + (res && res.status));
        res = await postState(url, body, POST_TIMEOUT_MS);
      }
      if (!res || !res.ok) {
        debugLog('post failed url=' + url + ' event=' + (fields.hook_event_name || ''));
      }
    } catch (err) {
      debugLog('post failed: ' + (err && err.message));
    }
  }
}

function main() {
  run({})
    .catch(function (err) {
      debugLog('fatal: ' + (err && err.message));
    })
    .finally(function () {
      process.exit(0);
    });
}

if (require.main === module) {
  main();
}

module.exports = {
  extractSafeFields: extractSafeFields,
  appendJsonl: appendJsonl,
  buildPostBody: buildPostBody,
  postState: postState,
  run: run,
  SAFE_KEYS: SAFE_KEYS,
  DEFAULT_URL: DEFAULT_URL,
  POST_TIMEOUT_MS: POST_TIMEOUT_MS,
  JSONL_PATH: JSONL_PATH
};
