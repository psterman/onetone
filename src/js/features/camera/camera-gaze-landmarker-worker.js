/**
 * MediaPipe Face Landmarker in a Worker — UI thread must never call detectForVideo.
 * Messages: {type:'init', wasmUrl, modelUrl} | {type:'detect', bitmap, ts, id}
 * Replies: {type:'ready'} | {type:'result', id, faces, blendshapes, matrices} | {type:'error', message}
 */
/* eslint-disable no-restricted-globals */
var landmarker = null;
var ready = false;
var lastTs = -1;

function postErr(message, id) {
  self.postMessage({ type: 'error', message: String(message || 'unknown'), id: id || null });
}

self.onmessage = function (ev) {
  var msg = ev.data || {};
  if (msg.type === 'init') {
    ready = false;
    landmarker = null;
    import(msg.bundleUrl)
      .then(function (mod) {
        var FilesetResolver = mod.FilesetResolver;
        var FaceLandmarker = mod.FaceLandmarker;
        if (!FilesetResolver || !FaceLandmarker) {
          throw new Error('vision_bundle missing FaceLandmarker exports');
        }
        return FilesetResolver.forVisionTasks(msg.wasmUrl).then(function (vision) {
          function createWithDelegate(delegate) {
            return FaceLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetPath: msg.modelUrl, delegate: delegate },
              runningMode: 'VIDEO',
              numFaces: 2,
              outputFaceBlendshapes: true,
              outputFacialTransformationMatrixes: true,
              minFaceDetectionConfidence: 0.5,
              minFacePresenceConfidence: 0.5,
              minTrackingConfidence: 0.5
            });
          }
          return createWithDelegate('GPU').catch(function () {
            return createWithDelegate('CPU');
          });
        });
      })
      .then(function (fl) {
        landmarker = fl;
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
    if (!ready || !landmarker) {
      if (bitmap && bitmap.close) try { bitmap.close(); } catch (_) {}
      postErr('landmarker not ready', id);
      return;
    }
    var ts = Number(msg.ts) || 0;
    if (ts <= lastTs) ts = lastTs + 1;
    lastTs = ts;
    try {
      var result = landmarker.detectForVideo(bitmap, ts);
      var faces = result && result.faceLandmarks ? result.faceLandmarks : [];
      var blend = result && result.faceBlendshapes ? result.faceBlendshapes : [];
      var mats = result && result.facialTransformationMatrixes
        ? result.facialTransformationMatrixes
        : [];
      // Structured clone of landmarks (plain objects).
      self.postMessage({
        type: 'result',
        id: id,
        faces: faces,
        blendshapes: blend,
        matrices: mats
      });
    } catch (err) {
      postErr(err && err.message ? err.message : err, id);
    } finally {
      if (bitmap && bitmap.close) try { bitmap.close(); } catch (_) {}
    }
  }
};
