#!/usr/bin/env node
'use strict';

/**
 * Ensures bundled Vosk light models (CN + EN) exist before `tauri build`.
 * Skips quietly when already present; downloads + extracts on first release build.
 *
 * Kept filename `ensure-vosk-cn-model.js` for existing npm scripts; ensures both languages.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const VOSK_DIR = path.join(ROOT, 'src-tauri', 'resources', 'vosk');
const DOWNLOAD_DIR = path.join(VOSK_DIR, 'downloads');

/** @type {{ id: string, dirName: string, zipName: string, urls: string[], approx: string }[]} */
const MODELS = [
  {
    id: 'cn-light',
    dirName: 'vosk-model-small-cn-0.22',
    zipName: 'vosk-model-small-cn-0.22.zip',
    // China-friendly first (hf-mirror), then HF / alphacephei / archive.org.
    urls: [
      'https://hf-mirror.com/rhasspy/vosk-models/resolve/main/zh/vosk-model-small-cn-0.22.zip',
      'https://huggingface.co/rhasspy/vosk-models/resolve/main/zh/vosk-model-small-cn-0.22.zip',
      'https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip',
      'https://archive.org/download/vosk-models-small/vosk-model-small-cn-0.22.zip',
    ],
    approx: '~42 MB',
  },
  {
    id: 'en-light',
    dirName: 'vosk-model-small-en-us-0.15',
    zipName: 'vosk-model-small-en-us-0.15.zip',
    urls: [
      'https://hf-mirror.com/rhasspy/vosk-models/resolve/main/en/vosk-model-small-en-us-0.15.zip',
      'https://huggingface.co/rhasspy/vosk-models/resolve/main/en/vosk-model-small-en-us-0.15.zip',
      'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip',
      'https://archive.org/download/vosk-models-small/vosk-model-small-en-us-0.15.zip',
    ],
    approx: '~40 MB',
  },
];

function log(msg) {
  console.log('[prepare-vosk] ' + msg);
}

function modelDir(m) {
  return path.join(VOSK_DIR, m.dirName);
}

function markerPath(m) {
  return path.join(modelDir(m), 'conf', 'model.conf');
}

function modelReady(m) {
  return fs.existsSync(markerPath(m));
}

function downloadFile(url, dest) {
  return new Promise(function (resolve, reject) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const file = fs.createWriteStream(dest);
    const req = https.get(url, function (res) {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        try {
          fs.unlinkSync(dest);
        } catch (_) {}
        reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
        return;
      }
      var total = Number(res.headers['content-length'] || 0);
      var done = 0;
      res.on('data', function (chunk) {
        done += chunk.length;
        if (total > 0 && done % (1024 * 1024) < chunk.length) {
          var pct = Math.min(100, Math.round((done * 100) / total));
          process.stdout.write('\r[prepare-vosk] downloading… ' + pct + '%');
        }
      });
      res.pipe(file);
      file.on('finish', function () {
        file.close(function () {
          process.stdout.write('\n');
          resolve();
        });
      });
    });
    req.on('error', function (err) {
      file.close();
      try {
        fs.unlinkSync(dest);
      } catch (_) {}
      reject(err);
    });
  });
}

function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  if (process.platform === 'win32') {
    execSync(
      "powershell -NoProfile -Command \"Expand-Archive -LiteralPath '" +
        zipPath.replace(/'/g, "''") +
        "' -DestinationPath '" +
        destDir.replace(/'/g, "''") +
        "' -Force\"",
      { stdio: 'inherit' }
    );
    return;
  }
  execSync('unzip -o -q ' + JSON.stringify(zipPath) + ' -d ' + JSON.stringify(destDir), {
    stdio: 'inherit',
  });
}

function findModelRoot(extractDir, dirName) {
  const direct = path.join(extractDir, dirName);
  if (fs.existsSync(path.join(direct, 'conf', 'model.conf'))) return direct;
  if (fs.existsSync(path.join(extractDir, 'conf', 'model.conf'))) return extractDir;
  const entries = fs.readdirSync(extractDir, { withFileTypes: true });
  for (var i = 0; i < entries.length; i++) {
    if (!entries[i].isDirectory()) continue;
    const p = path.join(extractDir, entries[i].name);
    if (fs.existsSync(path.join(p, 'conf', 'model.conf'))) return p;
  }
  throw new Error('model.conf not found after extract (' + dirName + ')');
}

function installModel(m, zipPath) {
  const dest = modelDir(m);
  const temp = path.join(DOWNLOAD_DIR, '_extract_' + m.id);
  if (fs.existsSync(temp)) fs.rmSync(temp, { recursive: true, force: true });
  extractZip(zipPath, temp);
  const root = findModelRoot(temp, m.dirName);
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(root, dest);
  fs.rmSync(temp, { recursive: true, force: true });
  try {
    fs.unlinkSync(zipPath);
  } catch (_) {}
}

async function ensureModel(m) {
  if (modelReady(m)) {
    log(m.id + ' already present at ' + modelDir(m));
    return;
  }
  const zipPath = path.join(DOWNLOAD_DIR, m.zipName);
  const urls = Array.isArray(m.urls) && m.urls.length ? m.urls : m.url ? [m.url] : [];
  if (!urls.length) throw new Error(m.id + ' has no download urls');
  log('Downloading ' + m.dirName + ' (' + m.approx + ')…');
  var lastErr = null;
  for (var i = 0; i < urls.length; i++) {
    try {
      log('try mirror[' + i + '] ' + urls[i]);
      await downloadFile(urls[i], zipPath);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      try {
        fs.unlinkSync(zipPath);
      } catch (_) {}
      log('mirror[' + i + '] failed: ' + (err && err.message ? err.message : err));
    }
  }
  if (lastErr) throw lastErr;
  log('Extracting ' + m.dirName + '…');
  installModel(m, zipPath);
  if (!modelReady(m)) throw new Error(m.id + ' install verification failed');
  log('Ready: ' + modelDir(m));
}

async function main() {
  for (var i = 0; i < MODELS.length; i++) {
    await ensureModel(MODELS[i]);
  }
  log('CN + EN light models ready for bundling');
}

module.exports = { MODELS, modelReady, modelDir, markerPath };

if (require.main === module) {
  main().catch(function (err) {
    console.error('[prepare-vosk] failed:', err && err.message ? err.message : err);
    console.error(
      '[prepare-vosk] Release builds need both CN and EN models. Retry: npm run prepare-vosk'
    );
    process.exit(1);
  });
}
