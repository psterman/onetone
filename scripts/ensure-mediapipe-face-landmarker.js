#!/usr/bin/env node
'use strict';

/**
 * Ensures local MediaPipe Face Landmarker assets under src/vendor/mediapipe/.
 * Downloads at prepare time only — runtime must never hit CDN.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'src', 'vendor', 'mediapipe');
const VERSION = '0.10.21';
const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + VERSION;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const FILES = [
  { url: CDN + '/vision_bundle.mjs', dest: path.join(OUT, 'vision_bundle.mjs') },
  { url: CDN + '/wasm/vision_wasm_internal.js', dest: path.join(OUT, 'wasm', 'vision_wasm_internal.js') },
  { url: CDN + '/wasm/vision_wasm_internal.wasm', dest: path.join(OUT, 'wasm', 'vision_wasm_internal.wasm') },
  { url: CDN + '/wasm/vision_wasm_nosimd_internal.js', dest: path.join(OUT, 'wasm', 'vision_wasm_nosimd_internal.js') },
  { url: CDN + '/wasm/vision_wasm_nosimd_internal.wasm', dest: path.join(OUT, 'wasm', 'vision_wasm_nosimd_internal.wasm') },
  { url: MODEL_URL, dest: path.join(OUT, 'face_landmarker.task') }
];

const MARKER = path.join(OUT, 'face_landmarker.task');
const BUNDLE = path.join(OUT, 'vision_bundle.mjs');
const WASM_JS = path.join(OUT, 'wasm', 'vision_wasm_internal.js');

function log(msg){ console.log('[prepare-mediapipe] ' + msg); }

function ready(){
  return fs.existsSync(MARKER) && fs.existsSync(BUNDLE) && fs.existsSync(WASM_JS)
    && fs.statSync(MARKER).size > 100000;
}

function downloadFile(url, dest){
  return new Promise(function(resolve, reject){
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const file = fs.createWriteStream(dest);
    const req = https.get(url, function(res){
      if(res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location){
        file.close();
        try{ fs.unlinkSync(dest); }catch(_){}
        return downloadFile(res.headers.location, dest).then(resolve, reject);
      }
      if(res.statusCode !== 200){
        file.close();
        try{ fs.unlinkSync(dest); }catch(_){}
        reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
        return;
      }
      var total = Number(res.headers['content-length'] || 0);
      var done = 0;
      var label = path.basename(dest);
      res.on('data', function(chunk){
        done += chunk.length;
        if(total > 0 && done % (512 * 1024) < chunk.length){
          var pct = Math.min(100, Math.round((done * 100) / total));
          process.stdout.write('\r[prepare-mediapipe] ' + label + '… ' + pct + '%   ');
        }
      });
      res.pipe(file);
      file.on('finish', function(){
        file.close(function(){
          process.stdout.write('\r[prepare-mediapipe] ' + label + '… done          \n');
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

async function main(){
  if(ready()){
    log('assets already present at ' + OUT);
    return;
  }
  log('Downloading MediaPipe Face Landmarker assets (tasks-vision@' + VERSION + ')…');
  for(var i = 0; i < FILES.length; i++){
    var item = FILES[i];
    if(fs.existsSync(item.dest) && fs.statSync(item.dest).size > 1000){
      log('skip existing ' + path.relative(ROOT, item.dest));
      continue;
    }
    await downloadFile(item.url, item.dest);
  }
  if(!ready()) throw new Error('asset install verification failed');
  // Tiny readme so the directory is discoverable when gitignored files are missing.
  fs.writeFileSync(
    path.join(OUT, 'README.md'),
    '# MediaPipe Face Landmarker (local)\n\nRun `npm run prepare-mediapipe` to download wasm + face_landmarker.task.\nRuntime must load only these local files — no CDN.\n',
    'utf8'
  );
  log('Ready: ' + OUT);
}

main().catch(function(err){
  console.error('[prepare-mediapipe] failed:', err && err.message ? err.message : err);
  console.error('[prepare-mediapipe] Retry: npm run prepare-mediapipe');
  process.exit(1);
});
