#!/usr/bin/env node
'use strict';

/**
 * Ensures the bundled Chinese Vosk model exists before `tauri build`.
 * Skips quietly when already present; downloads + extracts on first release build.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const VOSK_DIR = path.join(ROOT, 'src-tauri', 'resources', 'vosk');
const MODEL_DIR = path.join(VOSK_DIR, 'vosk-model-small-cn-0.22');
const MARKER = path.join(MODEL_DIR, 'conf', 'model.conf');
const DOWNLOAD_DIR = path.join(VOSK_DIR, 'downloads');
const ZIP_PATH = path.join(DOWNLOAD_DIR, 'vosk-model-small-cn-0.22.zip');
const URL = 'https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip';

function log(msg){ console.log('[prepare-vosk] ' + msg); }

function modelReady(){
  return fs.existsSync(MARKER);
}

function downloadFile(url, dest){
  return new Promise(function(resolve, reject){
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const file = fs.createWriteStream(dest);
    const req = https.get(url, function(res){
      if(res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location){
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(res.headers.location, dest).then(resolve, reject);
      }
      if(res.statusCode !== 200){
        file.close();
        try{ fs.unlinkSync(dest); }catch(_){}
        reject(new Error('HTTP ' + res.statusCode));
        return;
      }
      var total = Number(res.headers['content-length'] || 0);
      var done = 0;
      res.on('data', function(chunk){
        done += chunk.length;
        if(total > 0 && done % (1024 * 1024) < chunk.length){
          var pct = Math.min(100, Math.round((done * 100) / total));
          process.stdout.write('\r[prepare-vosk] downloading… ' + pct + '%');
        }
      });
      res.pipe(file);
      file.on('finish', function(){
        file.close(function(){
          process.stdout.write('\n');
          resolve();
        });
      });
    });
    req.on('error', function(err){
      file.close();
      try{ fs.unlinkSync(dest); }catch(_){}
      reject(err);
    });
  });
}

function extractZip(zipPath, destDir){
  fs.mkdirSync(destDir, { recursive: true });
  if(process.platform === 'win32'){
    execSync(
      'powershell -NoProfile -Command "Expand-Archive -LiteralPath \'' + zipPath.replace(/'/g, "''") + '\' -DestinationPath \'' + destDir.replace(/'/g, "''") + '\' -Force"',
      { stdio: 'inherit' }
    );
    return;
  }
  execSync('unzip -o -q ' + JSON.stringify(zipPath) + ' -d ' + JSON.stringify(destDir), { stdio: 'inherit' });
}

function findModelRoot(extractDir){
  const direct = path.join(extractDir, 'vosk-model-small-cn-0.22');
  if(fs.existsSync(path.join(direct, 'conf', 'model.conf'))) return direct;
  if(fs.existsSync(path.join(extractDir, 'conf', 'model.conf'))) return extractDir;
  const entries = fs.readdirSync(extractDir, { withFileTypes: true });
  for(var i = 0; i < entries.length; i++){
    if(!entries[i].isDirectory()) continue;
    const p = path.join(extractDir, entries[i].name);
    if(fs.existsSync(path.join(p, 'conf', 'model.conf'))) return p;
  }
  throw new Error('model.conf not found after extract');
}

function installModel(){
  const temp = path.join(DOWNLOAD_DIR, '_extract_cn');
  if(fs.existsSync(temp)) fs.rmSync(temp, { recursive: true, force: true });
  extractZip(ZIP_PATH, temp);
  const root = findModelRoot(temp);
  if(fs.existsSync(MODEL_DIR)) fs.rmSync(MODEL_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(MODEL_DIR), { recursive: true });
  fs.renameSync(root, MODEL_DIR);
  fs.rmSync(temp, { recursive: true, force: true });
  try{ fs.unlinkSync(ZIP_PATH); }catch(_){}
}

async function main(){
  if(modelReady()){
    log('Chinese model already present at ' + MODEL_DIR);
    return;
  }
  log('Downloading vosk-model-small-cn-0.22 (~42 MB)…');
  await downloadFile(URL, ZIP_PATH);
  log('Extracting…');
  installModel();
  if(!modelReady()) throw new Error('model install verification failed');
  log('Ready: ' + MODEL_DIR);
}

main().catch(function(err){
  console.error('[prepare-vosk] failed:', err && err.message ? err.message : err);
  console.error('[prepare-vosk] Release builds need the CN model. Retry: npm run prepare-vosk');
  process.exit(1);
});
