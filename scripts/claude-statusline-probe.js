#!/usr/bin/env node
'use strict';

/**
 * Claude Code statusLine relay — fail-open, stdout always empty.
 * Reads statusLine JSON from stdin, POSTs only session_id + rate_limits
 * (+ optional model.id) to OneTone /api/claude-statusline.
 */

var fs = require('fs');
var path = require('path');
var http = require('http');

var REPO_ROOT = path.resolve(__dirname, '..');
var LOG_DIR = path.join(REPO_ROOT, 'logs');
var DEBUG_PATH = path.join(LOG_DIR, 'claude-statusline-probe.debug.log');
var DEFAULT_URL = 'http://127.0.0.1:8796/api/claude-statusline';
var POST_TIMEOUT_MS = 1500;
var STATUSLINE_ID = 'onetone-claude-usage-v1';

function debugLog(msg) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(DEBUG_PATH, new Date().toISOString() + ' ' + String(msg) + '\n', 'utf8');
  } catch (_) {}
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

function pickRateWindow(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
  var out = {};
  if (node.used_percentage != null) out.used_percentage = node.used_percentage;
  else if (node.usedPercentage != null) out.used_percentage = node.usedPercentage;
  if (node.resets_at != null) out.resets_at = node.resets_at;
  else if (node.resetsAt != null) out.resets_at = node.resetsAt;
  return Object.keys(out).length ? out : null;
}

/** Keep only session_id + rate_limits (+ optional model.id). */
function extractStatusLineBody(raw) {
  var obj = raw && typeof raw === 'object' ? raw : {};
  var out = {};
  var sid = obj.session_id != null ? obj.session_id : obj.sessionId;
  if (sid != null && sid !== '') out.session_id = String(sid);

  var model = obj.model;
  if (model && typeof model === 'object' && !Array.isArray(model) && model.id != null) {
    out.model = { id: String(model.id) };
  } else if (typeof model === 'string' && model) {
    out.model = { id: model };
  }

  var rl = obj.rate_limits || obj.rateLimits;
  if (rl && typeof rl === 'object' && !Array.isArray(rl)) {
    var limits = {};
    var five = pickRateWindow(rl.five_hour || rl.fiveHour);
    var seven = pickRateWindow(rl.seven_day || rl.sevenDay);
    if (five) limits.five_hour = five;
    if (seven) limits.seven_day = seven;
    out.rate_limits = limits;
  }

  var cw = obj.context_window || obj.contextWindow;
  if (cw && typeof cw === 'object' && !Array.isArray(cw)) {
    var pct = cw.used_percentage != null ? cw.used_percentage : cw.usedPercentage;
    if (pct != null && pct !== '' && isFinite(Number(pct))) {
      out.context_window = { used_percentage: Number(pct) };
    }
  }
  return out;
}

function postJson(urlStr, bodyObj, timeoutMs) {
  return new Promise(function (resolve) {
    try {
      var u = new URL(urlStr);
      var raw = Buffer.from(JSON.stringify(bodyObj), 'utf8');
      var headers = {
        Host: (u.hostname || '127.0.0.1') + (u.port ? ':' + u.port : ''),
        'Content-Type': 'application/json',
        'Content-Length': raw.length
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
          res.on('data', function () {});
          res.on('end', function () {
            resolve({ ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300, status: res.statusCode || 0 });
          });
        }
      );
      req.on('error', function () {
        resolve({ ok: false, status: 0 });
      });
      req.on('timeout', function () {
        try {
          req.destroy();
        } catch (_) {}
        resolve({ ok: false, status: 0 });
      });
      req.write(raw);
      req.end();
    } catch (_) {
      resolve({ ok: false, status: 0 });
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
  var url = opts.url || process.env.ONETONE_CLAUDE_STATUSLINE_URL || DEFAULT_URL;
  var stdinText = opts.stdinText != null ? opts.stdinText : readStdinSync();

  var parsed = null;
  try {
    var trimmed = String(stdinText || '').trim();
    if (trimmed) parsed = JSON.parse(trimmed);
  } catch (err) {
    debugLog('json parse failed: ' + (err && err.message));
    parsed = {};
  }

  var body = extractStatusLineBody(parsed || {});
  try {
    var rl = body.rate_limits || {};
    debugLog(
      'extract session=' +
        (body.session_id || '') +
        ' five=' +
        (rl.five_hour ? 'yes' : 'no') +
        ' seven=' +
        (rl.seven_day ? 'yes' : 'no') +
        ' model=' +
        (body.model && body.model.id ? 'yes' : 'no')
    );
  } catch (_) {}
  if (!skipPost) {
    try {
      var res = await postJson(url, body, opts.timeoutMs != null ? opts.timeoutMs : POST_TIMEOUT_MS);
      if (!res || !res.ok) {
        res = await postJson(url, body, opts.timeoutMs != null ? opts.timeoutMs : POST_TIMEOUT_MS);
      }
      if (!res || !res.ok) {
        debugLog('post failed url=' + url + ' status=' + (res && res.status) + ' token=' + (readIntegrationToken() ? 'yes' : 'no'));
      }
    } catch (err) {
      debugLog('post failed: ' + (err && err.message));
    }
  }
  return { stdout: '', body: body };
}

function main() {
  run({})
    .catch(function (err) {
      debugLog('fatal: ' + (err && err.message));
    })
    .finally(function () {
      process.exitCode = 0;
      process.exit(0);
    });
}

if (require.main === module) {
  main();
}

module.exports = {
  extractStatusLineBody: extractStatusLineBody,
  pickRateWindow: pickRateWindow,
  run: run,
  postJson: postJson,
  DEFAULT_URL: DEFAULT_URL,
  POST_TIMEOUT_MS: POST_TIMEOUT_MS,
  STATUSLINE_ID: STATUSLINE_ID
};
