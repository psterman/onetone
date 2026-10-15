#!/usr/bin/env node
'use strict';

/**
 * Cursor lifecycle probe — fail-open.
 * Keeps only identity/lifecycle fields and forwards them to OneTone loopback.
 * Always prints schema-valid JSON on stdout (empty stdout breaks subagentStart /
 * beforeSubmitPrompt on current Cursor).
 */

var fs = require('fs');
var path = require('path');
var http = require('http');

var REPO_ROOT = path.resolve(__dirname, '..');
var LOG_DIR = path.join(REPO_ROOT, 'logs');
var JSONL_PATH = path.join(LOG_DIR, 'cursor-hook-probe.jsonl');
var DEBUG_PATH = path.join(LOG_DIR, 'cursor-hook-probe.debug.log');
var DEFAULT_URL = 'http://127.0.0.1:8796/api/codex-app/state';
var POST_TIMEOUT_MS = 1500;

function debugLog(message) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(DEBUG_PATH, new Date().toISOString() + ' ' + String(message) + '\n', 'utf8');
  } catch (_) {}
}

function firstScalar(obj, keys) {
  for (var i = 0; i < keys.length; i++) {
    var value = obj[keys[i]];
    if (value !== undefined && value !== null && typeof value !== 'object') return String(value);
  }
  return '';
}

function extractSafeFields(raw) {
  var obj = raw && typeof raw === 'object' ? raw : {};
  return {
    ts: Date.now(),
    event: firstScalar(obj, ['hook_event_name', 'event']),
    sessionId: firstScalar(obj, [
      'conversation_id',
      'session_id',
      'sessionId',
      'parent_conversation_id'
    ]),
    turnId: firstScalar(obj, ['generation_id', 'turn_id', 'turnId', 'subagent_id']),
    cwd: firstScalar(obj, ['cwd']),
    model: firstScalar(obj, ['model', 'subagent_model'])
  };
}

function buildPostBody(fields) {
  return {
    source: 'cursor_hook',
    event: fields.event,
    sessionId: fields.sessionId,
    turnId: fields.turnId,
    cwd: fields.cwd,
    model: fields.model,
    ts: fields.ts
  };
}

/** stdout response Cursor expects — permission hooks deny on empty/invalid JSON. */
function buildStdoutResponse(event) {
  var e = String(event || '').trim();
  if (e === 'beforeSubmitPrompt') return { continue: true };
  if (e === 'subagentStart') return { permission: 'allow' };
  // Unknown event (parse salvage miss): cover both gate schemas without blocking.
  if (!e) return { continue: true, permission: 'allow' };
  return {};
}

function appendJsonl(record, target) {
  var file = target || JSONL_PATH;
  if (!fs.existsSync(path.dirname(file))) fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(record) + '\n', 'utf8');
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
      var url = new URL(urlStr || DEFAULT_URL);
      var bytes = Buffer.from(JSON.stringify(body), 'utf8');
      var headers = {
        'Content-Type': 'application/json',
        'Content-Length': bytes.length,
        Host: (url.hostname || '127.0.0.1') + (url.port ? ':' + url.port : '')
      };
      var token = readIntegrationToken();
      if (token) headers['X-Onetone-Token'] = token;
      var req = http.request(
        {
          hostname: url.hostname,
          port: url.port || 80,
          path: url.pathname + (url.search || ''),
          method: 'POST',
          headers: headers,
          timeout: timeoutMs || POST_TIMEOUT_MS
        },
        function (res) {
          res.resume();
          res.on('end', function () {
            resolve({ ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300 });
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
      req.write(bytes);
      req.end();
    } catch (_) {
      resolve({ ok: false });
    }
  });
}

/** Slice first balanced `{...}` so trailing junk / multi-object stdin still parses. */
function sliceFirstJsonObject(text) {
  var start = text.indexOf('{');
  if (start < 0) return '';
  var depth = 0;
  var inStr = false;
  var esc = false;
  for (var i = start; i < text.length; i++) {
    var c = text.charAt(i);
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === '\\') {
        esc = true;
        continue;
      }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return '';
}

function parseHookInput(input) {
  var text = String(input || '');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  text = text.trim();
  if (!text) return { ok: true, value: {} };

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    var sliced = sliceFirstJsonObject(text);
    if (sliced) {
      try {
        return { ok: true, value: JSON.parse(sliced) };
      } catch (_) {}
    }
    // Salvage event name only — enough for stdout schema + soft post skip.
    var m = text.match(/"(?:hook_event_name|event)"\s*:\s*"([^"\\]+)"/);
    if (m) {
      return { ok: false, value: { hook_event_name: m[1], event: m[1] }, error: err.message };
    }
    return { ok: false, value: {}, error: err.message };
  }
}

function writeStdout(obj) {
  try {
    process.stdout.write(JSON.stringify(obj || {}) + '\n');
  } catch (_) {
    try {
      process.stdout.write('{}\n');
    } catch (__) {}
  }
}

async function run(opts) {
  opts = opts || {};
  var input = opts.stdinText;
  if (input == null) {
    try {
      input = fs.readFileSync(0, 'utf8');
    } catch (_) {
      input = '';
    }
  }
  var parsed = parseHookInput(input);
  if (!parsed.ok && parsed.error) {
    debugLog(
      'json parse failed: ' +
        parsed.error +
        ' len=' +
        String(input || '').length
    );
  }
  var fields = extractSafeFields(parsed.value);
  try {
    appendJsonl(fields, opts.jsonlPath);
  } catch (err) {
    debugLog('jsonl append failed: ' + err.message);
  }

  // Always emit schema-valid stdout before network I/O so Cursor never waits on 8796.
  if (!opts.skipStdout) {
    writeStdout(buildStdoutResponse(fields.event));
  }

  if (!opts.skipPost && fields.event) {
    var body = buildPostBody(fields);
    var url = opts.url || process.env.ONETONE_CURSOR_STATE_URL || DEFAULT_URL;
    var result = await postState(url, body);
    if (!result.ok) result = await postState(url, body);
    // OneTone off → expected; don't spam identical lines every turn.
    if (!result.ok) debugLog('post failed event=' + fields.event + ' (onetone offline?)');
  }
  return fields;
}

if (require.main === module) {
  run({})
    .catch(function (err) {
      debugLog('fatal: ' + err.message);
      writeStdout({});
    })
    .finally(function () {
      process.exit(0);
    });
}

module.exports = {
  extractSafeFields: extractSafeFields,
  buildPostBody: buildPostBody,
  buildStdoutResponse: buildStdoutResponse,
  parseHookInput: parseHookInput,
  run: run
};
