'use strict';

/**
 * OpenCode → OneTone Soft Pad lifecycle plugin.
 * POST source: opencode_hook to 127.0.0.1:8796. Fail-open.
 */
var fs = require('fs');
var http = require('http');
var path = require('path');

var DEFAULT_URL = 'http://127.0.0.1:8796/api/codex-app/state';
var POST_TIMEOUT_MS = 1500;
var LOG_DIR = path.join(path.resolve(__dirname, '..', '..'), 'logs');
var HOOK_ID = 'opencode-onetone-v1';

function readIntegrationToken() {
  try {
    if (process.env.ONETONE_SOFT_PAD_TOKEN) return String(process.env.ONETONE_SOFT_PAD_TOKEN).trim();
    var appdata = process.env.APPDATA || '';
    var candidates = [];
    if (appdata) {
      candidates.push(path.join(appdata, 'onetone', 'app', 'config', 'soft-pad-integration.token'));
      candidates.push(path.join(appdata, 'com.onetone', 'app', 'config', 'soft-pad-integration.token'));
      candidates.push(path.join(appdata, 'com.onetone.app', 'config', 'soft-pad-integration.token'));
    }
    for (var i = 0; i < candidates.length; i++) {
      if (fs.existsSync(candidates[i])) {
        return String(fs.readFileSync(candidates[i], 'utf8') || '').trim();
      }
    }
  } catch (_) {}
  return '';
}

function postState(event, fields) {
  fields = fields || {};
  return new Promise(function (resolve) {
    try {
      var urlStr = process.env.ONETONE_CODEX_APP_STATE_URL || DEFAULT_URL;
      var url = new URL(urlStr);
      var body = {
        source: 'opencode_hook',
        event: String(event || ''),
        sessionId: String(fields.sessionId || fields.sessionID || ''),
        turnId: String(fields.turnId || fields.callID || ''),
        cwd: String(fields.cwd || fields.directory || ''),
        model: String(fields.model || ''),
        toolName: String(fields.toolName || fields.tool || ''),
        agentId: String(fields.agentId || ''),
        agentType: String(fields.agentType || fields.agent || ''),
        ts: Date.now()
      };
      var bytes = Buffer.from(JSON.stringify(body), 'utf8');
      var headers = {
        'Content-Type': 'application/json',
        'Content-Length': bytes.length
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
          timeout: POST_TIMEOUT_MS
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

function debugLog(message) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(
      path.join(LOG_DIR, 'opencode-onetone-plugin.debug.log'),
      new Date().toISOString() + ' ' + String(message) + '\n',
      'utf8'
    );
  } catch (_) {}
}

async function emit(event, fields) {
  try {
    var res = await postState(event, fields);
    if (!res || !res.ok) await postState(event, fields);
  } catch (err) {
    debugLog('post failed: ' + (err && err.message));
  }
}

async function plugin(ctx) {
  return {
    'tool.execute.before': async function (input) {
      await emit('PreToolUse', {
        sessionID: input && input.sessionID,
        tool: input && input.tool,
        callID: input && input.callID,
        directory: ctx && ctx.directory
      });
    },
    'tool.execute.after': async function (input) {
      await emit('PostToolUse', {
        sessionID: input && input.sessionID,
        tool: input && input.tool,
        callID: input && input.callID,
        directory: ctx && ctx.directory
      });
    },
    'permission.ask': async function () {
      await emit('PermissionRequest', { directory: ctx && ctx.directory });
    },
    event: async function (input) {
      var type = input && input.event && input.event.type;
      if (type === 'session.idle') {
        await emit('Stop', {
          sessionID: input && input.event && input.event.properties && input.event.properties.sessionID,
          directory: ctx && ctx.directory
        });
      } else if (type === 'session.error') {
        await emit('StopFailure', { directory: ctx && ctx.directory });
      }
    }
  };
}

module.exports = plugin;
module.exports.default = plugin;
module.exports.HOOK_ID = HOOK_ID;
