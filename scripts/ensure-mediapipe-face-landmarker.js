#!/usr/bin/env node
'use strict';

/**
 * Ensures local MediaPipe Face Landmarker + Gesture Recognizer assets
 * under src/vendor/mediapipe/. Downloads at prepare time only — runtime must never hit CDN.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'src', 'vendor', 'mediapipe');
const VERSION = '0.10.21';
const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + VERSION;
const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const GESTURE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';

const FILES = [
  { url: CDN + '/vision_bundle.mjs', dest: path.join(OUT, 'vision_bundle.mjs') },
  { url: CDN + '/wasm/vision_wasm_internal.js', dest: path.join(OUT, 'wasm', 'vision_wasm_internal.js') },
  { url: CDN + '/wasm/vision_wasm_internal.wasm', dest: path.join(OUT, 'wasm', 'vision_wasm_internal.wasm') },
  { url: CDN + '/wasm/vision_wasm_nosimd_internal.js', dest: path.join(OUT, 'wasm', 'vision_wasm_nosimd_internal.js') },
  { url: CDN + '/wasm/vision_wasm_nosimd_internal.wasm', dest: path.join(OUT, 'wasm', 'vision_wasm_nosimd_internal.wasm') },
  { url: FACE_MODEL_URL, dest: path.join(OUT, 'face_landmarker.task') },
  { url: GESTURE_MODEL_URL, dest: path.join(OUT, 'gesture_recognizer.task') }
];

const FACE_MARKER = path.join(OUT, 'face_landmarker.task');
const GESTURE_MARKER = path.join(OUT, 'gesture_recognizer.task');
const BUNDLE = path.join(OUT, 'vision_bundle.mjs');
const WASM_JS = path.join(OUT, 'wasm', 'vision_wasm_internal.js');

function log(msg){ console.log('[prepare-mediapipe] ' + msg); }

function fileOk(p, minSize){
  return fs.existsSync(p) && fs.statSync(p).size > (minSize || 1000);
}

function faceReady(){
  return fileOk(FACE_MARKER, 100000) && fileOk(BUNDLE) && fileOk(WASM_JS);
}

function gestureReady(){
  return fileOk(GESTURE_MARKER, 100000) && fileOk(BUNDLE) && fileOk(WASM_JS);
}

function ready(){
  return faceReady() && gestureReady();
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
  log('Downloading MediaPipe Face + Gesture assets (tasks-vision@' + VERSION + ')…');
  for(var i = 0; i < FILES.length; i++){
    var item = FILES[i];
    if(fs.existsSync(item.dest) && fs.statSync(item.dest).size > 1000){
      log('skip existing ' + path.relative(ROOT, item.dest));
      continue;
    }
    await downloadFile(item.url, item.dest);
  }
  if(!ready()) throw new Error('asset install verification failed');
  fs.writeFileSync(
    path.join(OUT, 'README.md'),
    [
      '# MediaPipe (local)',
      '',
      'Run `npm run prepare-mediapipe` to download wasm + models:',
      '',
      '- `face_landmarker.task` — gaze / presence',
      '- `gesture_recognizer.task` — hand gestures (open palm / fist / …)',
      '',
      'Runtime must load only these local files — no CDN.',
      ''
    ].join('\n'),
    'utf8'
  );
  log('Ready: ' + OUT);
  log('face=' + (faceReady() ? 'ok' : 'missing') + ' gesture=' + (gestureReady() ? 'ok' : 'missing'));
}

main().catch(function(err){
  console.error('[prepare-mediapipe] failed:', err && err.message ? err.message : err);
  console.error('[prepare-mediapipe] Retry: npm run prepare-mediapipe');
  process.exit(1);
});
