/**
 * MediaPipe GestureRecognizer in a Worker — UI thread must never call recognizeForVideo.
 * Messages: {type:'init', bundleUrl, wasmUrl, modelUrl} | {type:'detect', bitmap, ts, id}
 * Replies: {type:'ready'} | {type:'result', id, gestures, landmarks} | {type:'error', message}
 */
/* eslint-disable no-restricted-globals */
var recognizer = null;
var ready = false;
var lastTs = -1;

function postErr(message, id) {
  self.postMessage({ type: 'error', message: String(message || 'unknown'), id: id || null });
}

self.onmessage = function (ev) {
  var msg = ev.data || {};
  if (msg.type === 'init') {
    ready = false;
    recognizer = null;
    import(msg.bundleUrl)
      .then(function (mod) {
        var FilesetResolver = mod.FilesetResolver;
        var GestureRecognizer = mod.GestureRecognizer;
        if (!FilesetResolver || !GestureRecognizer) {
          throw new Error('vision_bundle missing GestureRecognizer exports');
        }
        return FilesetResolver.forVisionTasks(msg.wasmUrl).then(function (vision) {
          function createWithDelegate(delegate) {
            return GestureRecognizer.createFromOptions(vision, {
              baseOptions: { modelAssetPath: msg.modelUrl, delegate: delegate },
              runningMode: 'VIDEO',
              numHands: 1,
              minHandDetectionConfidence: 0.5,
              minHandPresenceConfidence: 0.5,
              minTrackingConfidence: 0.5
            });
          }
          return createWithDelegate('GPU').catch(function () {
            return createWithDelegate('CPU');
          });
        });
      })
      .then(function (gr) {
        recognizer = gr;
        ready = true;
        self.postMessage({ type: 'ready' });
      })
      .catch(function (err) {
        postErr(err && err.message ? err.message : err);
      });
    return;
  }
  if (msg.type === 'detect') {
    var bitmap = msg.bitmap;
    var id = msg.id;
    if (!ready || !recognizer) {
      if (bitmap && bitmap.close) try { bitmap.close(); } catch (_) {}
      postErr('recognizer not ready', id);
      return;
    }
    var ts = Number(msg.ts) || 0;
    if (ts <= lastTs) ts = lastTs + 1;
    lastTs = ts;
    try {
      var result = recognizer.recognizeForVideo(bitmap, ts);
      var gestures = result && result.gestures ? result.gestures : [];
      var landmarks = result && result.landmarks ? result.landmarks : [];
      self.postMessage({
        type: 'result',
        id: id,
        gestures: gestures,
        landmarks: landmarks
      });
    } catch (err) {
      postErr(err && err.message ? err.message : err, id);
    } finally {
      if (bitmap && bitmap.close) try { bitmap.close(); } catch (_) {}
    }
  }
};
