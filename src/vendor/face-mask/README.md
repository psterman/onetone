# Face Mask (vendor)

Local Canvas 2D **privacy face cover** for OneTone Camera Pro preview.

## Why not a tiny UV sticker?

The first pass used FACE_OVAL + circular UV triangle-fan (Face Mesh PNG-mask demos). That only painted a small central shield — forehead, jaw, glasses temples stayed visible.

## What we use now (open-source ideas)

| Idea | Project | How we apply it |
|------|---------|-----------------|
| Expand face box / pad ROI | [VideoPlayground](https://github.com/LucasTBorges/VideoPlayground) anonymization, [w3pn-anonymizer](https://github.com/web3privacy/w3pn-anonymizer) | Inflate oval + forehead/side/chin padding, fill opaque plate |
| Landmark-aligned features | MediaPipe Face Landmarker | Eyes / nose / mouth drawn at real landmark positions |
| Full 3D GLTF mask | [MaskOn](https://github.com/kishonadiaz/MaskOn), [WebAR.rocks.face](https://github.com/WebAR-rocks/WebAR.rocks.face) (MIT) | Better look; deferred (needs Three.js / extra NN) |

## Pipeline

1. Collect FACE_OVAL + forehead/temple anchors  
2. Inflate from center (~1.48×) + extra forehead/side/chin pad  
3. Convex hull + soft ellipse underlay (closes gaps)  
4. Style fill: `solid` / `emoji` / `animal`

Recognition always uses the raw `<video>` feed.
