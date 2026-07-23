#!/usr/bin/env node
'use strict';

/**
 * Codex application-layer state → OneTone loopback (Phase 5 PoC).
 * Source: session_index.jsonl + rollout-*.jsonl lifecycle events.
 * NOT hardware thstatus — stderr always labels source=codex_app.
 */

var fs = require('fs');
var path = require('path');
var http = require('http');
var https = require('https');
var { URL } = require('url');
var lib = require('./codex-micro-relay-lib');

var CODEX_HOME = process.env.CODEX_HOME ||
  path.join(process.env.USERPROFILE || process.env.HOME || '', '.codex');
var SESSION_INDEX = path.join(CODEX_HOME, 'session_index.jsonl');
var SESSIONS_DIR = path.join(CODEX_HOME, 'sessions');
var DEFAULT_URL = 'http://127.0.0.1:8796/api/codex-micro/protocol';
var POLL_MS = 2000;

function parseArgs(argv) {
  var url = DEFAULT_URL;
  var once = false;
  for (var i = 2; i < argv.length; i++) {
    if (argv[i] === '--url' && argv[i + 1]) url = argv[++i];
    else if (argv[i] === '--once') once = true;
    else if (argv[i] === '--codex-home' && argv[i + 1]) {
      CODEX_HOME = argv[++i];
      SESSION_INDEX = path.join(CODEX_HOME, 'session_index.jsonl');
      SESSIONS_DIR = path.join(CODEX_HOME, 'sessions');
    }
  }
  return { url: url, once: once };
}

function readSessionIndex() {
  if (!fs.existsSync(SESSION_INDEX)) return [];
  var raw = fs.readFileSync(SESSION_INDEX, 'utf8');
  var items = [];
  raw.split('\n').forEach(function (line) {
    line = line.trim();
    if (!line) return;
    try {
      var o = JSON.parse(line);
      if (o && o.id) {
        items.push({
          id: String(o.id),
          title: o.thread_name || o.title || '',
          updatedAt: o.updated_at || o.updatedAt || ''
        });
      }
    } catch (_) {}
  });
  items.sort(function (a, b) {
    return String(b.updatedAt).localeCompare(String(a.updatedAt));
  });
  return items.slice(0, 6);
}

function findRolloutPath(threadId) {
  if (!fs.existsSync(SESSIONS_DIR)) return null;
  var needle = threadId.toLowerCase();
  var stack = [SESSIONS_DIR];
  var best = null;
  while (stack.length) {
    var dir = stack.pop();
    var entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { continue; }
    for (var i = 0; i < entries.length; i++) {
      var ent = entries[i];
      var full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        stack.push(full);
      } else if (ent.isFile() && ent.name.indexOf('rollout-') === 0 && ent.name.indexOf('.jsonl') > 0) {
        if (ent.name.toLowerCase().indexOf(needle) >= 0) {
          var stat = fs.statSync(full);
          if (!best || stat.mtimeMs > best.mtimeMs) {
            best = { path: full, mtimeMs: stat.mtimeMs };
          }
        }
      }
    }
  }
  return best ? best.path : null;
}

/** Mirrors CodexRolloutStatusReader lifecycle mapping. */
function readRolloutStatus(rolloutPath, cursor) {
  if (!rolloutPath || !fs.existsSync(rolloutPath)) {
    return { status: 'idle', cursor: cursor || { offset: 0, partial: '', status: 'idle' } };
  }
  var c = cursor || { offset: 0, partial: '', status: 'idle' };
  var stat = fs.statSync(rolloutPath);
  if (stat.size < c.offset) {
    c = { offset: 0, partial: '', status: 'idle' };
  }
  if (stat.size === c.offset) {
    return { status: c.status, cursor: c };
  }
  var fd = fs.openSync(rolloutPath, 'r');
  var len = stat.size - c.offset;
  var buf = Buffer.alloc(Math.min(len, 256 * 1024));
  fs.readSync(fd, buf, 0, buf.length, c.offset);
  fs.closeSync(fd);
  c.offset += buf.length;
  var text = c.partial + buf.toString('utf8');
  var lines = text.split('\n');
  c.partial = lines.pop() || '';
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    if (
      line.indexOf('task_started') < 0 &&
      line.indexOf('task_complete') < 0 &&
      line.indexOf('turn_aborted') < 0 &&
      line.indexOf('stream_error') < 0 &&
      line.indexOf('"type":"error"') < 0
    ) {
      continue;
    }
    try {
      var ev = JSON.parse(line);
      if (ev.type !== 'event_msg' || !ev.payload || !ev.payload.type) continue;
      var t = ev.payload.type;
      if (t === 'task_started') c.status = 'running';
      else if (t === 'task_complete' || t === 'turn_aborted') c.status = 'done';
      else if (t === 'error' || t === 'stream_error') c.status = 'failed';
    } catch (_) {}
  }
  return { status: c.status, cursor: c };
}

var rolloutCursors = {};

function buildSnapshot() {
  var sessions = readSessionIndex();
  var slots = [];
  for (var i = 0; i < sessions.length; i++) {
    var s = sessions[i];
    var rollout = findRolloutPath(s.id);
    var cur = rolloutCursors[s.id];
    var ro = readRolloutStatus(rollout, cur);
    rolloutCursors[s.id] = ro.cursor;
    var state = ro.status;
    if (state === 'idle' && rollout) state = 'done';
    if (state === 'idle' && !rollout) state = 'idle';
    slots.push({ i: i, s: state, threadId: s.id, title: s.title });
  }
  return {
    source: 'codex_app',
    truth: 'app_state',
    agentSlots: slots,
    padStatus: slots.some(function (x) { return x.s === 'running'; }) ? 'running' :
      slots.some(function (x) { return x.s === 'failed'; }) ? 'failed' : 'idle'
  };
}

function toThstatusPayload(snapshot) {
  return {
    m: 'v.oai.thstatus',
    p: {
      slots: snapshot.agentSlots.map(function (slot) {
        return { i: slot.i, s: slot.s };
      })
    },
    id: Date.now()
  };
}

function postJson(urlStr, body) {
  return new Promise(function (resolve, reject) {
    var u = new URL(urlStr);
    var client = u.protocol === 'https:' ? https : http;
    var raw = Buffer.from(body, 'utf8');
    var req = client.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': raw.length
      },
      timeout: 10000
    }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString('utf8') });
      });
    });
    req.on('error', reject);
    req.on('timeout', function () { req.destroy(); reject(new Error('timeout')); });
    req.write(raw);
    req.end();
  });
}

var lastFingerprint = '';

async function tick(url) {
  var snapshot = buildSnapshot();
  var fp = JSON.stringify(snapshot.agentSlots.map(function (s) { return s.i + ':' + s.s; }));
  if (fp === lastFingerprint) return;
  lastFingerprint = fp;

  var payload = toThstatusPayload(snapshot);
  try {
    var res = await postJson(url, JSON.stringify(payload));
    var parsed = null;
    try { parsed = JSON.parse(res.text); } catch (_) {}
    var snap = parsed && parsed.snapshot;
    var summary = lib.summarize(snap);
    console.error(
      '[app-state-relay] source=codex_app truth=app_state POST ' + res.status +
      ' slots=' + snapshot.agentSlots.map(function (s) { return s.i + ':' + s.s; }).join(',') +
      ' connectionState=' + summary.connectionState +
      ' nativeAg=' + summary.nativeAg
    );
  } catch (err) {
    console.error('[app-state-relay] source=codex_app POST fail: ' + err.message);
  }
}

async function main() {
  var opts = parseArgs(process.argv);
  console.error('[app-state-relay] watching ' + SESSION_INDEX + ' → ' + opts.url);
  console.error('[app-state-relay] NOT hardware thstatus — application-layer PoC only');
  if (opts.once) {
    await tick(opts.url);
    return;
  }
  await tick(opts.url);
  setInterval(function () { tick(opts.url).catch(function () {}); }, POLL_MS);
}

if (require.main === module) {
  main().catch(function (err) {
    console.error('[app-state-relay] fatal: ' + err.message);
    process.exit(1);
  });
}

module.exports = {
  buildSnapshot: buildSnapshot,
  toThstatusPayload: toThstatusPayload,
  readRolloutStatus: readRolloutStatus,
  readSessionIndex: readSessionIndex
};
