#!/usr/bin/env node
'use strict';

/**
 * Labs/验收示例：把 AgentController（或任意）stdout 里的 Codex Micro 状态 RPC
 * 逐行 POST 到 OneTone loopback。
 *
 * 不依赖 AgentController 源码；不转发 v.oai.hid / v.oai.rad（动作由 OneTone 本地处理）。
 *
 * 前置：
 *   1) OneTone 已开，且 Labs loopback 已 start
 *      - 环境变量 ONETONE_CODEX_MICRO_PROTOCOL=1（验收用途），或
 *      - IPC cmd_codex_micro_protocol_server_start
 *   2) 默认 URL: http://127.0.0.1:8796/api/codex-micro/protocol
 *
 * 用法：
 *   node scripts/codex-micro-agentcontroller-relay.example.js --url http://127.0.0.1:8796/api/codex-micro/protocol
 *   # 然后从 stdin 喂 JSON 行，或：
 *   echo {"m":"v.oai.thstatus","p":{"slots":[{"i":0,"s":"running"}]}} | node scripts/codex-micro-agentcontroller-relay.example.js
 */

var http = require('http');
var https = require('https');
var readline = require('readline');
var { URL } = require('url');

  var ALLOWED = {
  'v.oai.thstatus': true,
  'v.oai.rgbcfg': true,
  'lights.preview': true,
  'device.status': true,
  'sys.version': true
  // intentionally no v.oai.hid / v.oai.rad — status relay only
};

function parseArgs(argv) {
  var url = 'http://127.0.0.1:8796/api/codex-micro/protocol';
  for (var i = 2; i < argv.length; i++) {
    if (argv[i] === '--url' && argv[i + 1]) {
      url = argv[++i];
    }
  }
  return { url: url };
}

function extractMethod(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '';
  return String(obj.m || obj.method || '').trim();
}

function postJson(urlStr, body) {
  return new Promise(function (resolve, reject) {
    var u = new URL(urlStr);
    var lib = u.protocol === 'https:' ? https : http;
    var raw = Buffer.from(body, 'utf8');
    var req = lib.request(
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
          var text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode || 0, text: text });
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

function summarize(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return { connectionState: '?', nativeAg: 0, hasRgb: false };
  }
  var cells = Array.isArray(snapshot.cells) ? snapshot.cells : [];
  var nativeAg = 0;
  for (var i = 0; i < cells.length; i++) {
    var c = cells[i];
    var id = c && (c.microKeyId || c.micro_key_id);
    var src = c && (c.statusSource || c.status_source);
    if (id && String(id).indexOf('AG') === 0 && src === 'native') nativeAg++;
  }
  return {
    connectionState: snapshot.connectionState || snapshot.connection_state || '?',
    nativeAg: nativeAg,
    hasRgb: !!(snapshot.rgb)
  };
}

async function main() {
  var opts = parseArgs(process.argv);
  console.error('[relay] Labs/验收 → ' + opts.url);
  console.error('[relay] status methods only; hid/rad ignored');

  var rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (var line of rl) {
    var t = String(line || '').trim();
    if (!t || t[0] === '#') continue;
    var obj;
    try {
      obj = JSON.parse(t);
    } catch (e) {
      console.error('[relay] skip invalid json');
      continue;
    }
    var method = extractMethod(obj);
    if (!ALLOWED[method]) {
      console.error('[relay] skip method=' + (method || '?'));
      continue;
    }
    try {
      var res = await postJson(opts.url, JSON.stringify(obj));
      var parsed = null;
      try { parsed = JSON.parse(res.text); } catch (_) {}
      var snap = parsed && parsed.snapshot;
      var s = summarize(snap);
      console.log(
        JSON.stringify({
          ok: !!(parsed && parsed.ok),
          http: res.status,
          method: method,
          connectionState: s.connectionState,
          nativeAg: s.nativeAg,
          rgb: s.hasRgb
        })
      );
    } catch (e) {
      console.error('[relay] post failed: ' + (e && e.message ? e.message : e));
    }
  }
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
