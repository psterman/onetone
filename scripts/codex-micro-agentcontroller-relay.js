#!/usr/bin/env node
'use strict';

/**
 * Codex Micro status relay: AgentController READ_OUTPUT (stdout/jsonl) → OneTone loopback.
 * Does not forward v.oai.hid / v.oai.rad.
 */

var fs = require('fs');
var http = require('http');
var https = require('https');
var readline = require('readline');
var { URL } = require('url');
var lib = require('./codex-micro-relay-lib');

function postJson(urlStr, body) {
  return new Promise(function (resolve, reject) {
    var u = new URL(urlStr);
    var client = u.protocol === 'https:' ? https : http;
    var raw = Buffer.from(body, 'utf8');
    var req = client.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': raw.length
        },
        timeout: 5000
      },
      function (res) {
        var chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () {
          resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString('utf8') });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', function () {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.write(raw);
    req.end();
  });
}

async function handleLine(line, url) {
  var t = String(line || '').trim();
  if (!t || t[0] === '#') return;
  var obj;
  try {
    obj = JSON.parse(t);
  } catch (_) {
    console.error('[relay] skip invalid json');
    return;
  }
  var method = lib.extractMethod(obj);
  if (lib.ACTION_METHODS[method]) {
    console.error('[relay] skip method=' + method + ' (action, not forwarded)');
    return;
  }
  if (!lib.ALLOWED[method]) {
    console.error('[relay] skip method=' + (method || '?'));
    return;
  }
  var normalized = lib.normalizeCodexRpc(obj);
  try {
    var res = await postJson(url, JSON.stringify(normalized));
    var parsed = null;
    try { parsed = JSON.parse(res.text); } catch (_) {}
    var snap = parsed && parsed.snapshot;
    var s = lib.summarize(snap);
    var ok = !!(parsed && parsed.ok);
    console.error(
      '[relay] POST ' + res.status +
      ' method=' + method +
      ' connectionState=' + s.connectionState +
      ' nativeAg=' + s.nativeAg +
      ' rgb=' + s.hasRgb
    );
    console.log(JSON.stringify({
      ok: ok,
      http: res.status,
      method: method,
      connectionState: s.connectionState,
      nativeAg: s.nativeAg,
      rgb: s.hasRgb
    }));
  } catch (e) {
    console.error('[relay] post failed: ' + (e && e.message ? e.message : e));
  }
}

function tailFile(filePath, url) {
  var offset = 0;
  var pending = false;
  var queue = Promise.resolve();

  function pump() {
    if (pending) return;
    pending = true;
    fs.stat(filePath, function (err, st) {
      pending = false;
      if (err) {
        console.error('[relay] file stat failed: ' + err.message);
        return;
      }
      if (st.size < offset) offset = 0;
      if (st.size === offset) return;
      var stream = fs.createReadStream(filePath, { start: offset, end: st.size - 1, encoding: 'utf8' });
      var buf = '';
      stream.on('data', function (chunk) { buf += chunk; });
      stream.on('end', function () {
        offset = st.size;
        buf.split(/\r?\n/).forEach(function (line) {
          if (!line.trim()) return;
          queue = queue.then(function () { return handleLine(line, url); });
        });
      });
      stream.on('error', function (e) {
        console.error('[relay] read failed: ' + e.message);
      });
    });
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '', { encoding: 'utf8' });
  }
  offset = fs.statSync(filePath).size;
  console.error('[relay] tail file ' + filePath);
  pump();
  fs.watch(filePath, { persistent: true }, pump);
  setInterval(pump, 500);
}

async function main() {
  var opts = lib.parseArgs(process.argv);
  console.error('[relay] Labs/验收 → ' + opts.url);
  console.error('[relay] status methods only; hid/rad ignored');

  if (opts.file) {
    tailFile(opts.file, opts.url);
    return;
  }

  var rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (var line of rl) {
    await handleLine(line, opts.url);
  }
}

if (require.main === module) {
  main().catch(function (e) {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { handleLine: handleLine, postJson: postJson };
