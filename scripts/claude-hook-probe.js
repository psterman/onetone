#!/usr/bin/env node
'use strict';

/**
 * Claude Code Hook probe — fail-open, stdout empty (except PermissionRequest decide).
 * Reads hook JSON from stdin, appends safe fields to logs/claude-hook-probe.jsonl,
 * optionally POSTs to OneTone /api/codex-app/state with source=claude_hook.
 *
 * SessionStart: OneTone bumps Soft Pad near-window activity only (no running light).
 * UserPromptSubmit / PermissionRequest / Stop* / Subagent*: status + activity lights.
 *
 * PermissionRequest (C2): after POST, polls GET /api/claude-approval until Soft Pad
 * records allow/deny (ACT12/08), then prints Claude hookSpecificOutput JSON to stdout.
 * Timeout / error → empty stdout (Claude shows its own dialog).
 */

var fs = require('fs');
var path = require('path');
var http = require('http');

var REPO_ROOT = path.resolve(__dirname, '..');
var LOG_DIR = path.join(REPO_ROOT, 'logs');
var JSONL_PATH = path.join(LOG_DIR, 'claude-hook-probe.jsonl');
var DEBUG_PATH = path.join(LOG_DIR, 'claude-hook-probe.debug.log');
var DEFAULT_URL = 'http://127.0.0.1:8796/api/codex-app/state';
var DEFAULT_APPROVAL_URL = 'http://127.0.0.1:8796/api/claude-approval';
var POST_TIMEOUT_MS = 1500;
var APPROVAL_POLL_MS = 500;
var DEFAULT_APPROVAL_WAIT_MS = 12000;
var APPROVAL_GET_FAIL_LIMIT = 3;

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
  if (out.tool_name == null && obj.toolName != null) out.tool_name = obj.toolName;
  if (out.session_id == null && obj.sessionId != null) out.session_id = obj.sessionId;
  if (out.turn_id == null && obj.turnId != null) out.turn_id = obj.turnId;
  if (out.agent_id == null && obj.agentId != null) out.agent_id = obj.agentId;
  if (out.hook_event_name == null && obj.event != null) out.hook_event_name = obj.event;
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
    source: 'claude_hook',
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

function approvalUrlFromStateUrl(stateUrl) {
  try {
    var u = new URL(stateUrl || DEFAULT_URL);
    u.pathname = '/api/claude-approval';
    u.search = '';
    return u.toString();
  } catch (_) {
    return DEFAULT_APPROVAL_URL;
  }
}

function readIntegrationToken() {
  try {
    if (process.env.ONETONE_SOFT_PAD_TOKEN) return String(process.env.ONETONE_SOFT_PAD_TOKEN).trim();
    var appdata = process.env.APPDATA || '';
    var candidates = [];
    if (appdata) {
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

function httpJson(method, urlStr, bodyObj, timeoutMs) {
  return new Promise(function (resolve) {
    try {
      var u = new URL(urlStr);
      var raw = bodyObj != null ? Buffer.from(JSON.stringify(bodyObj), 'utf8') : null;
      var headers = {
        Host: (u.hostname || '127.0.0.1') + (u.port ? ':' + u.port : '')
      };
      if (raw) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = raw.length;
      }
      var needsToken = String(u.pathname || '').indexOf('/api/codex-app/state') >= 0
        || String(u.pathname || '').indexOf('/v1/metrics') >= 0;
      if (needsToken) {
        var token = readIntegrationToken();
        if (token) headers['X-Onetone-Token'] = token;
      }
      var req = http.request(
        {
          hostname: u.hostname,
          port: u.port || 80,
          path: u.pathname + (u.search || ''),
          method: method,
          headers: headers,
          timeout: timeoutMs != null ? timeoutMs : POST_TIMEOUT_MS
        },
        function (res) {
          var chunks = [];
          res.on('data', function (c) {
            chunks.push(c);
          });
          res.on('end', function () {
            var text = Buffer.concat(chunks).toString('utf8');
            var json = null;
            try {
              json = text ? JSON.parse(text) : null;
            } catch (_) {
              json = null;
            }
            resolve({
              ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
              status: res.statusCode || 0,
              json: json,
              text: text
            });
          });
        }
      );
      req.on('error', function () {
        resolve({ ok: false, status: 0, json: null, text: '' });
      });
      req.on('timeout', function () {
        try {
          req.destroy();
        } catch (_) {}
        resolve({ ok: false, status: 0, json: null, text: '' });
      });
      if (raw) req.write(raw);
      req.end();
    } catch (_) {
      resolve({ ok: false, status: 0, json: null, text: '' });
    }
  });
}

function postState(urlStr, body, timeoutMs) {
  return httpJson('POST', urlStr || DEFAULT_URL, body, timeoutMs).then(function (res) {
    return { ok: !!res.ok, status: res.status };
  });
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function permissionDecisionStdout(behavior) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: {
        behavior: behavior,
        message: 'Soft Pad'
      }
    }
  });
}

/**
 * Poll Soft Pad decision. Fail-open: null on timeout / unreachable.
 */
async function waitForApprovalDecision(approvalUrl, waitMs, pollMs) {
  var deadline = Date.now() + (waitMs != null ? waitMs : DEFAULT_APPROVAL_WAIT_MS);
  var interval = pollMs != null ? pollMs : APPROVAL_POLL_MS;
  var failStreak = 0;
  while (Date.now() < deadline) {
    var res = await httpJson('GET', approvalUrl, null, POST_TIMEOUT_MS);
    if (res && res.ok && res.json) {
      failStreak = 0;
      if (res.json.decision) {
        var d = String(res.json.decision).toLowerCase();
        if (d === 'allow' || d === 'deny') return d;
      }
    } else {
      failStreak += 1;
      // OneTone 不可达 → 尽快 fail-open，让 Claude 自己弹窗
      if (failStreak >= APPROVAL_GET_FAIL_LIMIT) return null;
    }
    await sleep(interval);
  }
  return null;
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
  var approvalUrl =
    opts.approvalUrl ||
    process.env.ONETONE_CLAUDE_APPROVAL_URL ||
    approvalUrlFromStateUrl(url);
  var approvalWaitMs = opts.approvalWaitMs;
  if (approvalWaitMs == null) {
    var envWait = parseInt(process.env.ONETONE_CLAUDE_APPROVAL_WAIT_MS || '', 10);
    approvalWaitMs = Number.isFinite(envWait) && envWait > 0 ? envWait : DEFAULT_APPROVAL_WAIT_MS;
  }
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

  var postOk = false;
  if (!skipPost) {
    try {
      var body = buildPostBody(fields);
      var res = await postState(url, body, POST_TIMEOUT_MS);
      if (!res || !res.ok) {
        res = await postState(url, body, POST_TIMEOUT_MS);
      }
      postOk = !!(res && res.ok);
      if (!postOk) {
        debugLog('post failed url=' + url + ' event=' + (fields.hook_event_name || ''));
      }
    } catch (err) {
      debugLog('post failed: ' + (err && err.message));
    }
  } else {
    postOk = true;
  }

  var eventName = String(fields.hook_event_name || '');
  // OneTone 不可达时不要空等审批：立刻 fail-open，避免 Claude CLI 假死数十秒。
  if (eventName === 'PermissionRequest' && !opts.skipApprovalWait && postOk) {
    try {
      var decision = await waitForApprovalDecision(
        approvalUrl,
        approvalWaitMs,
        opts.approvalPollMs
      );
      if (decision) {
        debugLog('approval decision=' + decision);
        return { decision: decision, stdout: permissionDecisionStdout(decision) };
      }
      debugLog('approval wait timeout url=' + approvalUrl);
    } catch (err) {
      debugLog('approval wait failed: ' + (err && err.message));
    }
  } else if (eventName === 'PermissionRequest' && !postOk) {
    debugLog('approval skipped: post failed (fail-open)');
  }

  return { decision: null, stdout: '' };
}

function main() {
  run({})
    .then(function (result) {
      if (result && result.stdout) {
        try {
          process.stdout.write(result.stdout);
        } catch (err) {
          debugLog('stdout write failed: ' + (err && err.message));
        }
      }
    })
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
  httpJson: httpJson,
  waitForApprovalDecision: waitForApprovalDecision,
  permissionDecisionStdout: permissionDecisionStdout,
  approvalUrlFromStateUrl: approvalUrlFromStateUrl,
  run: run,
  SAFE_KEYS: SAFE_KEYS,
  DEFAULT_URL: DEFAULT_URL,
  DEFAULT_APPROVAL_URL: DEFAULT_APPROVAL_URL,
  POST_TIMEOUT_MS: POST_TIMEOUT_MS,
  DEFAULT_APPROVAL_WAIT_MS: DEFAULT_APPROVAL_WAIT_MS,
  JSONL_PATH: JSONL_PATH
};
