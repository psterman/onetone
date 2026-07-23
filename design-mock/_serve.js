const http = require('http');
const fs = require('fs');
const path = require('path');

const mockRoot = __dirname;
const repoRoot = path.resolve(mockRoot, '..');
const port = 8766;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json; charset=utf-8',
  '.jsonl': 'application/x-ndjson; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

function sendJson(res, status, obj) {
  const body = Buffer.from(JSON.stringify(obj, null, 2), 'utf8');
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:' + port);
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

function readText(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}

function parseHookJsonl(raw) {
  const lines = String(raw || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
  const events = [];
  for (var i = 0; i < lines.length; i++) {
    try {
      var o = JSON.parse(lines[i]);
      if (o && (o.hook_event_name || o.event)) events.push(o);
    } catch (_) {}
  }
  var core = { UserPromptSubmit: 0, PermissionRequest: 0, Stop: 0 };
  events.forEach(function (e) {
    var name = e.hook_event_name || e.event;
    if (core[name] != null) core[name] += 1;
  });
  var coreHit = Object.keys(core).filter(function (k) { return core[k] > 0; });
  var last = events.length ? events[events.length - 1] : null;
  return {
    lineCount: lines.length,
    eventCount: events.length,
    coreCounts: core,
    coreHit: coreHit,
    coreHitCount: coreHit.length,
    lastEvent: last ? (last.hook_event_name || last.event || '') : '',
    lastTs: last && last.ts != null ? last.ts : null,
    tail: events.slice(-12)
  };
}

function handleApi(req, res) {
  const u = req.url.split('?')[0];
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:' + port);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.end('');
    return true;
  }
  if (req.method !== 'GET') return false;

  if (u === '/_onetone/hook-log') {
    const p = path.join(repoRoot, 'logs', 'codex-hook-probe.jsonl');
    const raw = readText(p);
    if (raw == null) {
      sendJson(res, 200, {
        ok: true,
        exists: false,
        path: p,
        summary: parseHookJsonl(''),
        raw: ''
      });
      return true;
    }
    sendJson(res, 200, {
      ok: true,
      exists: true,
      path: p,
      summary: parseHookJsonl(raw),
      raw: raw
    });
    return true;
  }

  if (u === '/_onetone/hook-setup') {
    const probe = path.join(repoRoot, 'scripts', 'codex-hook-probe.js');
    const examplePath = path.join(repoRoot, 'scripts', 'codex-hooks.example.json');
    const hooksHome = path.join(process.env.USERPROFILE || process.env.HOME || '', '.codex', 'hooks.json');
    let example = null;
    try {
      example = JSON.parse(readText(examplePath) || '{}');
      const cmd = 'node "' + probe.replace(/\\/g, '/') + '"';
      if (!example.hooks || typeof example.hooks !== 'object') {
        throw new Error('example missing top-level hooks');
      }
      // Codex 0.142 root allows ONLY "hooks" (no description/_comment).
      const events = example.hooks;
      Object.keys(events).forEach(function (ev) {
        const groups = events[ev];
        if (!Array.isArray(groups)) return;
        groups.forEach(function (g) {
          if (!g || !Array.isArray(g.hooks)) return;
          g.hooks.forEach(function (h) {
            if (h && h.type === 'command') {
              h.command = cmd;
              delete h.statusMessage;
            }
          });
        });
      });
      example = { hooks: events };
    } catch (e) {
      example = { error: String(e.message || e) };
    }
    sendJson(res, 200, {
      ok: true,
      repoRoot: repoRoot,
      probePath: probe,
      hooksJsonPath: hooksHome,
      hooksJsonExists: fs.existsSync(hooksHome),
      appStateUrl: 'http://127.0.0.1:8796/api/codex-app/state',
      readyHooksJson: example,
      docs: 'docs/codex-hook-onetone-setup.md'
    });
    return true;
  }

  return false;
}

const server = http.createServer((req, res) => {
  if (handleApi(req, res)) return;

  let p = req.url.split('?')[0];
  if (p === '/') p = '/codex-onetone-linkage-acceptance.html';
  const full = path.resolve(mockRoot, '.' + (p.startsWith('/') ? p : '/' + p));
  if (!full.startsWith(path.resolve(mockRoot)) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  const ext = path.extname(full).toLowerCase();
  res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
  fs.createReadStream(full).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log('OK on http://127.0.0.1:' + port + '/codex-onetone-linkage-acceptance.html');
  console.log('Hook APIs: /_onetone/hook-log  /_onetone/hook-setup');
});
