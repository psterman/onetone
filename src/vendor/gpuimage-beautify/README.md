# GPUImageBeautify (vendor)

Local WebGL port of the classic realtime beauty pipeline from:

- **Upstream**: [Guikunzhi/BeautifyFaceDemo](https://github.com/Guikunzhi/BeautifyFaceDemo) (MIT)
- **Core filter**: `GPUImageBeautifyFilter` — bilateral smooth + edge gate + **skin-color combine** + log whitening + HSB boost

This folder is vendored for OneTone Camera Pro preview only (no CDN). Recognition still uses the raw `<video>` feed.

## Pipeline

1. Bilateral-range blur (WebGL approx of `GPUImageBilateralFilter`)
2. Sobel edge map (lightweight stand-in for `GPUImageCannyEdgeDetectionFilter`)
3. Guikunzhi combination shader (verbatim skin thresholds + `log` curve)
4. Optional cheek rosy + landmark slim UV (OneTone overlay)
