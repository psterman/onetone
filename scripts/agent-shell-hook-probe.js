#!/usr/bin/env node
'use strict';

/**
 * Shared Soft Pad probe for WorkBuddy / Trae / Qoder shell hooks.
 * Fail-open, stdout empty. No Claude approval polling.
 *
 * Usage: node agent-shell-hook-probe.js --source workbuddy|trae_code|qoder|copilot_cli|gemini|cline|aider [--event …] [--onetone-hook-id …]
 */

var fs = require('fs');
var path = require('path');
var http = require('http');

var REPO_ROOT = path.resolve(__dirname, '..');
var LOG_DIR = path.join(REPO_ROOT, 'logs');
var DEFAULT_URL = 'http://127.0.0.1:8796/api/codex-app/state';
var POST_TIMEOUT_MS = 1500;
var ALLOWED = {
  workbuddy: true,
  trae_code: true,
  trae: true, // legacy alias → posts trae_hook
  qoder: true,
  copilot_cli: true,
  gemini: true,
  cline: true,
  aider: true
};

function parseArgs(argv) {
  var out = { source: '', hookId: '', event: '' };
  for (var i = 2; i < argv.length; i++) {
    var a = argv[i];
    if (a === '--source' && argv[i + 1]) {
      out.source = String(argv[++i]).trim().toLowerCase();
    } else if (a.indexOf('--source=') === 0) {
      out.source = a.slice('--source='.length).trim().toLowerCase();
    } else if (a.indexOf('--onetone-source=') === 0) {
      out.source = a.slice('--onetone-source='.length).trim().toLowerCase();
    } else if (a === '--onetone-hook-id' && argv[i + 1]) {
      out.hookId = String(argv[++i]).trim();
    } else if (a.indexOf('--onetone-hook-id=') === 0) {
      out.hookId = a.slice('--onetone-hook-id='.length).trim();
    } else if (a === '--event' && argv[i + 1]) {
      out.event = String(argv[++i]).trim();
    } else if (a.indexOf('--event=') === 0) {
      out.event = a.slice('--event='.length).trim();
    }
  }
  return out;
}

function resolveSource(opts) {
  var s = String((opts && opts.source) || '').trim().toLowerCase();
  if (ALLOWED[s]) return s;
  var fromArgs = parseArgs(process.argv).source;
  if (ALLOWED[fromArgs]) return fromArgs;
  return '';
}

function logPaths(kind) {
  return {
    jsonl: path.join(LOG_DIR, kind + '-hook-probe.jsonl'),
    debug: path.join(LOG_DIR, kind + '-hook-probe.debug.log')
  };
}

function debugLog(kind, message) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    var p = logPaths(kind).debug;
    fs.appendFileSync(p, new Date().toISOString() + ' ' + String(message) + '\n', 'utf8');
  } catch (_) {}
}

function firstScalar(obj, keys) {
  for (var i = 0; i < keys.length; i++) {
    var value = obj[keys[i]];
    if (value !== undefined && value !== null && typeof value !== 'object') return String(value);
  }
  return '';
}

/**
 * Normalize client events to Claude-like names for Soft Pad ingest.
 * Notification + permission_prompt → PermissionRequest.
 * Gemini: BeforeTool/AfterTool/AfterAgent → PreToolUse/PostToolUse/Stop.
 * Cline: TaskComplete/TaskCancel/TaskError → Stop/StopFailure.
 */
function normalizeEvent(raw) {
  var obj = raw && typeof raw === 'object' ? raw : {};
  var event = firstScalar(obj, ['hook_event_name', 'hookEventName', 'event']);
  var ntype = firstScalar(obj, ['notification_type', 'notificationType']);
  if (
    (event === 'Notification' || event.toLowerCase() === 'notification') &&
    (ntype === 'permission_prompt' ||
      ntype === 'permission_prompt' ||
      /permission/i.test(ntype) ||
      /permission/i.test(firstScalar(obj, ['message'])))
  ) {
    return 'PermissionRequest';
  }
  if (event === 'hookEventName') return firstScalar(obj, ['hook_event_name']);
  if (event === 'BeforeTool') return 'PreToolUse';
  if (event === 'BeforeAgent') return 'UserPromptSubmit';
  if (event === 'AfterTool') return 'PostToolUse';
  if (event === 'AfterAgent') return 'Stop';
  if (event === 'TaskComplete') return 'Stop';
  if (event === 'TaskCancel' || event === 'TaskError') return 'StopFailure';
  return event;
}

function eventFromArgv() {
  var args = parseArgs(process.argv);
  if (args.event) return args.event;
  return '';
}

function extractSafeFields(raw) {
  var obj = raw && typeof raw === 'object' ? raw : {};
  return {
    ts: Date.now(),
    hook_event_name: normalizeEvent(obj),
    session_id: firstScalar(obj, ['session_id', 'sessionId']),
    turn_id: firstScalar(obj, ['turn_id', 'turnId', 'task_id', 'taskId']),
    cwd: firstScalar(obj, ['cwd']),
    model: firstScalar(obj, ['model']),
    tool_name: firstScalar(obj, ['tool_name', 'toolName']),
    agent_id: firstScalar(obj, ['agent_id', 'agentId']),
    agent_type: firstScalar(obj, ['agent_type', 'agentType'])
  };
}

function buildPostBody(kind, fields) {
  // Trae Code prefers trae_code_hook; legacy --source trae still posts trae_hook.
  var source =
    kind === 'trae_code'
      ? 'trae_code_hook'
      : kind === 'trae'
        ? 'trae_hook'
        : kind + '_hook';
  return {
    source: source,
    event: fields.hook_event_name || '',
    sessionId: fields.session_id || '',
    turnId: fields.turn_id || '',
    cwd: fields.cwd || '',
    model: fields.model || '',
    toolName: fields.tool_name || '',
    agentId: fields.agent_id || '',
    agentType: fields.agent_type || '',
    ts: fields.ts || Date.now()
  };
}

function appendJsonl(record, target) {
  var file = target;
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

function readStdinSync() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (_) {
    return '';
  }
}

async function run(opts) {
  opts = opts || {};
  var kind = resolveSource(opts);
  if (!kind) {
    try {
      debugLog('unknown', 'missing or invalid --source');
    } catch (_) {}
    return { ok: false, kind: '', body: null };
  }
  var paths = logPaths(kind);
  var jsonlPath = opts.jsonlPath || paths.jsonl;
  var url = opts.url || process.env.ONETONE_CODEX_APP_STATE_URL || DEFAULT_URL;
  var stdinText = opts.stdinText != null ? opts.stdinText : readStdinSync();

  var parsed = {};
  try {
    var trimmed = String(stdinText || '').trim();
    if (trimmed) parsed = JSON.parse(trimmed);
  } catch (err) {
    debugLog(kind, 'json parse failed: ' + (err && err.message));
    parsed = {};
  }

  var fields = extractSafeFields(parsed);
  if (!fields.hook_event_name) {
    var evArg = eventFromArgv();
    if (evArg) fields.hook_event_name = normalizeEvent({ hook_event_name: evArg });
  }
  try {
    appendJsonl(Object.assign({ source_kind: kind }, fields), jsonlPath);
  } catch (err) {
    debugLog(kind, 'jsonl append failed: ' + (err && err.message));
  }

  var body = buildPostBody(kind, fields);
  if (!opts.skipPost) {
    try {
      var res = await postState(url, body, POST_TIMEOUT_MS);
      if (!res || !res.ok) res = await postState(url, body, POST_TIMEOUT_MS);
      if (!res || !res.ok) debugLog(kind, 'post failed event=' + (fields.hook_event_name || ''));
    } catch (err) {
      debugLog(kind, 'post failed: ' + (err && err.message));
    }
  }
  return { ok: true, kind: kind, body: body, fields: fields };
}

function main() {
  run({})
    .catch(function (err) {
      try {
        debugLog('unknown', 'fatal: ' + (err && err.message));
      } catch (_) {}
    })
    .finally(function () {
      process.exit(0);
    });
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs: parseArgs,
  resolveSource: resolveSource,
  normalizeEvent: normalizeEvent,
  extractSafeFields: extractSafeFields,
  buildPostBody: buildPostBody,
  appendJsonl: appendJsonl,
  postState: postState,
  run: run,
  ALLOWED: ALLOWED,
  DEFAULT_URL: DEFAULT_URL,
  POST_TIMEOUT_MS: POST_TIMEOUT_MS
};
