/**
 * Privacy face-mask overlay (Canvas 2D) — full-cover plate.
 *
 * Coverage strategy follows browser anonymizer / face-cover demos
 * (e.g. LucasTBorges/VideoPlayground anonymization, w3pn-anonymizer ideas):
 *   expand MediaPipe FACE_OVAL + forehead padding → opaque plate → landmark features.
 *
 * Earlier UV triangle-fan stickers only covered a small central shield; that was too small
 * for privacy. 3D GLTF masks (MaskOn / WebAR.rocks.face) look better but need Three.js;
 * this keeps local MediaPipe + Canvas only.
 *
 * Landmark indices: MediaPipe Face Landmarker / Face Mesh.
 * Preview-only — never used for recognition.
 */
(function(global){
  'use strict';

  // MediaPipe FACE_OVAL ring (canonical order around the face silhouette).
  var FACE_OVAL=[
    10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,
    152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109
  ];

  // Extra forehead / temple / chin anchors to grow coverage beyond the tight oval.
  var COVER_EXTRA=[9,8,168,6,197,195,5,4,1,10,67,109,338,297,103,54,21,162,127,234,454,323,152,175,199,200];

  var STYLES=['off','solid','emoji','animal'];

  // How far to inflate the hull past the landmark silhouette (anonymizer-style padding).
  var EXPAND=1.48;
  var FOREHEAD_EXTRA=0.22; // extra upward push as fraction of face height
  var SIDE_EXTRA=0.10;
  var CHIN_EXTRA=0.08;

  function normalizeStyle(v){
    v=String(v||'off').toLowerCase();
    if(STYLES.indexOf(v)>=0) return v;
    return 'off';
  }

  function lm(lms,i){
    if(!lms||i<0||i>=lms.length) return null;
    var p=lms[i];
    if(!p) return null;
    return {x:Number(p.x)||0,y:Number(p.y)||0,z:Number(p.z)||0};
  }

  function px(p,w,h){
    return {x:p.x*w,y:p.y*h};
  }

  /** Convex hull (Andrew's monotone chain) for cover polygon. */
  function convexHull(points){
    var pts=points.slice().sort(function(a,b){
      return a.x===b.x?a.y-b.y:a.x-b.x;
    });
    if(pts.length<=2) return pts;
    function cross(o,a,b){ return (a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x); }
    var lower=[];
    var i;
    for(i=0;i<pts.length;i++){
      while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],pts[i])<=0) lower.pop();
      lower.push(pts[i]);
    }
    var upper=[];
    for(i=pts.length-1;i>=0;i--){
      while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],pts[i])<=0) upper.pop();
      upper.push(pts[i]);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  /**
   * Build an expanded privacy hull:
   * oval + extras → inflate from center → pad forehead/sides/chin (VideoPlayground-style).
   */
  function buildCoverHull(landmarks,w,h){
    var raw=[];
    var seen={};
    function addIdx(idx){
      if(seen[idx]) return;
      var p=lm(landmarks,idx);
      if(!p) return;
      seen[idx]=1;
      raw.push(px(p,w,h));
    }
    var i;
    for(i=0;i<FACE_OVAL.length;i++) addIdx(FACE_OVAL[i]);
    for(i=0;i<COVER_EXTRA.length;i++) addIdx(COVER_EXTRA[i]);
    if(raw.length<6) return null;

    var minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(i=0;i<raw.length;i++){
      if(raw[i].x<minX) minX=raw[i].x;
      if(raw[i].x>maxX) maxX=raw[i].x;
      if(raw[i].y<minY) minY=raw[i].y;
      if(raw[i].y>maxY) maxY=raw[i].y;
    }
    var cx=(minX+maxX)*0.5;
    var cy=(minY+maxY)*0.5;
    var faceW=Math.max(8,maxX-minX);
    var faceH=Math.max(8,maxY-minY);

    var expanded=[];
    for(i=0;i<raw.length;i++){
      var dx=raw[i].x-cx;
      var dy=raw[i].y-cy;
      var x=cx+dx*EXPAND;
      var y=cy+dy*EXPAND;
      // Prefer growing toward forehead / temples / chin for privacy.
      if(dy<0) y-=faceH*FOREHEAD_EXTRA*(1-Math.min(1,Math.abs(dy)/(faceH*0.5)));
      if(dx>0) x+=faceW*SIDE_EXTRA;
      if(dx<0) x-=faceW*SIDE_EXTRA;
      if(dy>0) y+=faceH*CHIN_EXTRA*(Math.min(1,dy/(faceH*0.5)));
      expanded.push({
        x:Math.max(-w*0.05,Math.min(w*1.05,x)),
        y:Math.max(-h*0.05,Math.min(h*1.05,y))
      });
    }

    var hull=convexHull(expanded);
    if(hull.length<5) hull=expanded;
    return {
      hull:hull,
      cx:cx,
      cy:cy,
      faceW:faceW,
      faceH:faceH,
      // Axis-aligned padded box (anonymizer fallback / soft fill)
      box:{
        x:cx-faceW*EXPAND*0.58-faceW*SIDE_EXTRA,
        y:cy-faceH*EXPAND*0.58-faceH*FOREHEAD_EXTRA,
        w:faceW*EXPAND*1.16+faceW*SIDE_EXTRA*2,
        h:faceH*EXPAND*1.16+faceH*(FOREHEAD_EXTRA+CHIN_EXTRA)
      }
    };
  }

  function pathHull(ctx,hull){
    if(!hull||!hull.length) return;
    ctx.moveTo(hull[0].x,hull[0].y);
    var i;
    for(i=1;i<hull.length;i++) ctx.lineTo(hull[i].x,hull[i].y);
    ctx.closePath();
  }

  function fillCoverBase(ctx,cover,fillStyle){
    ctx.fillStyle=fillStyle;
    ctx.beginPath();
    ctx.ellipse(
      cover.box.x+cover.box.w*0.5,
      cover.box.y+cover.box.h*0.52,
      cover.box.w*0.52,
      cover.box.h*0.52,
      0,0,Math.PI*2
    );
    ctx.fill();
    ctx.beginPath();
    pathHull(ctx,cover.hull);
    ctx.fill();
  }

  function drawBlush(ctx,L,R,eyeDist){
    var br=eyeDist*0.38;
    ctx.fillStyle='rgba(255,140,170,0.38)';
    ctx.beginPath();
    ctx.ellipse(L.x-eyeDist*0.05,L.y+eyeDist*0.55,br*1.15,br*0.72,0,0,Math.PI*2);
    ctx.ellipse(R.x+eyeDist*0.05,R.y+eyeDist*0.55,br*1.15,br*0.72,0,0,Math.PI*2);
    ctx.fill();
  }

  function drawKawaiiEye(ctx,x,y,rx,ry){
    // Soft white sclera
    ctx.fillStyle='#fffaf5';
    ctx.beginPath();
    ctx.ellipse(x,y,rx*1.05,ry*1.12,0,0,Math.PI*2);
    ctx.fill();
    // Soft iris
    var ig=ctx.createRadialGradient(x-rx*0.15,y-ry*0.2,rx*0.1,x,y,rx);
    ig.addColorStop(0,'#6b4a3a');
    ig.addColorStop(0.55,'#3a241c');
    ig.addColorStop(1,'#1a100c');
    ctx.fillStyle=ig;
    ctx.beginPath();
    ctx.ellipse(x,y+ry*0.06,rx*0.78,ry*0.88,0,0,Math.PI*2);
    ctx.fill();
    // Highlights
    ctx.fillStyle='rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.ellipse(x-rx*0.28,y-ry*0.32,rx*0.28,ry*0.22, -0.35,0,Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x+rx*0.22,y+ry*0.08,rx*0.12,ry*0.10,0,0,Math.PI*2);
    ctx.fill();
  }

  /** Soft mist privacy plate — pastel, not charcoal. */
  function drawSolidPlate(ctx,cover){
    var cx=cover.box.x+cover.box.w*0.5;
    var cy=cover.box.y+cover.box.h*0.5;
    var g=ctx.createRadialGradient(
      cx,cy-cover.faceH*0.12,cover.faceW*0.06,
      cx,cy,Math.max(cover.faceW,cover.faceH)*0.9
    );
    g.addColorStop(0,'#f7e6ef');
    g.addColorStop(0.45,'#e8cfe0');
    g.addColorStop(1,'#c9a8c4');
    fillCoverBase(ctx,cover,g);

    // Soft sheen
    ctx.fillStyle='rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.ellipse(cx,cy-cover.faceH*0.22,cover.faceW*0.32,cover.faceH*0.14,0,0,Math.PI*2);
    ctx.fill();

    // Tiny sparkles
    ctx.fillStyle='rgba(255,255,255,0.75)';
    var sparks=[
      [cx-cover.faceW*0.28,cy-cover.faceH*0.18,3],
      [cx+cover.faceW*0.22,cy-cover.faceH*0.28,2.2],
      [cx+cover.faceW*0.32,cy+cover.faceH*0.05,2.6]
    ];
    var i;
    for(i=0;i<sparks.length;i++){
      ctx.beginPath();
      ctx.arc(sparks[i][0],sparks[i][1],sparks[i][2],0,Math.PI*2);
      ctx.fill();
    }
  }

  /** Soft kawaii face — peach skin, blush, shiny eyes. */
  function drawEmojiFeatures(ctx,landmarks,w,h,cover){
    var le=lm(landmarks,33)||lm(landmarks,133);
    var re=lm(landmarks,263)||lm(landmarks,362);
    var nose=lm(landmarks,1)||lm(landmarks,4);
    var mouth=lm(landmarks,13)||lm(landmarks,14);
    if(!le||!re||!nose) return;

    var L=px(le,w,h), R=px(re,w,h), N=px(nose,w,h);
    var M=mouth?px(mouth,w,h):{x:N.x,y:N.y+cover.faceH*0.18};
    var eyeDist=Math.max(12,Math.hypot(R.x-L.x,R.y-L.y));
    var eyeR=eyeDist*0.30;

    var skin=ctx.createRadialGradient(
      cover.cx,cover.cy-cover.faceH*0.1,cover.faceW*0.08,
      cover.cx,cover.cy,Math.max(cover.faceW,cover.faceH)*0.85
    );
    skin.addColorStop(0,'#ffe8d6');
    skin.addColorStop(0.55,'#ffd2bc');
    skin.addColorStop(1,'#f0b49a');
    fillCoverBase(ctx,cover,skin);

    drawBlush(ctx,L,R,eyeDist);
    drawKawaiiEye(ctx,L.x,L.y,eyeR,eyeR*1.12);
    drawKawaiiEye(ctx,R.x,R.y,eyeR,eyeR*1.12);

    // Soft brows
    ctx.strokeStyle='rgba(120,78,62,0.45)';
    ctx.lineWidth=Math.max(2,eyeDist*0.06);
    ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(L.x-eyeR*0.9,L.y-eyeR*1.35);
    ctx.quadraticCurveTo(L.x,L.y-eyeR*1.55,L.x+eyeR*0.85,L.y-eyeR*1.25);
    ctx.moveTo(R.x+eyeR*0.9,R.y-eyeR*1.35);
    ctx.quadraticCurveTo(R.x,R.y-eyeR*1.55,R.x-eyeR*0.85,R.y-eyeR*1.25);
    ctx.stroke();

    // Tiny nose hint
    ctx.strokeStyle='rgba(210,120,110,0.55)';
    ctx.lineWidth=Math.max(1.5,eyeDist*0.04);
    ctx.beginPath();
    ctx.moveTo(N.x-eyeDist*0.04,N.y+eyeDist*0.02);
    ctx.quadraticCurveTo(N.x,N.y+eyeDist*0.08,N.x+eyeDist*0.04,N.y+eyeDist*0.02);
    ctx.stroke();

    // Soft smile
    ctx.strokeStyle='#d4787a';
    ctx.lineWidth=Math.max(2.5,eyeDist*0.07);
    ctx.lineCap='round';
    ctx.beginPath();
    var smileY=(L.y+R.y)*0.5+eyeDist*0.42;
    ctx.arc(M.x,smileY,eyeDist*0.42,0.12*Math.PI,0.88*Math.PI);
    ctx.stroke();
  }

  /** Soft pink bunny-cat — rounded ears, glitter eyes, no angry brows. */
  function drawAnimalFeatures(ctx,landmarks,w,h,cover){
    var le=lm(landmarks,33)||lm(landmarks,133);
    var re=lm(landmarks,263)||lm(landmarks,362);
    var nose=lm(landmarks,1)||lm(landmarks,4);
    var mouth=lm(landmarks,13)||lm(landmarks,14);
    var top=lm(landmarks,10)||lm(landmarks,9);
    if(!le||!re||!nose) return;

    var L=px(le,w,h), R=px(re,w,h), N=px(nose,w,h);
    var M=mouth?px(mouth,w,h):{x:N.x,y:N.y+cover.faceH*0.16};
    var T=top?px(top,w,h):{x:cover.cx,y:cover.box.y+cover.box.h*0.12};
    var eyeDist=Math.max(12,Math.hypot(R.x-L.x,R.y-L.y));
    var eyeR=eyeDist*0.28;

    var fur=ctx.createRadialGradient(
      cover.cx,cover.cy-cover.faceH*0.08,cover.faceW*0.1,
      cover.cx,cover.cy,Math.max(cover.faceW,cover.faceH)*0.88
    );
    fur.addColorStop(0,'#fff0f5');
    fur.addColorStop(0.5,'#ffd6e7');
    fur.addColorStop(1,'#f5b6d0');
    fillCoverBase(ctx,cover,fur);

    // Soft rounded ears
    var earH=cover.faceH*0.38;
    function ear(side){
      var sx=side<0?-1:1;
      var baseX=cover.cx+sx*cover.faceW*0.18;
      var tipX=cover.cx+sx*cover.faceW*0.42;
      var baseY=T.y+cover.faceH*0.06;
      var tipY=T.y-earH*0.45;
      var midX=cover.cx+sx*cover.faceW*0.02;
      ctx.fillStyle='#ffc2d9';
      ctx.beginPath();
      ctx.moveTo(baseX,baseY);
      ctx.quadraticCurveTo(tipX,tipY+earH*0.1,tipX*0.65+midX*0.35,tipY);
      ctx.quadraticCurveTo(midX,baseY-earH*0.1,baseX-sx*cover.faceW*0.12,baseY);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle='#ff9ec0';
      ctx.beginPath();
      ctx.moveTo(baseX-sx*cover.faceW*0.02,baseY-earH*0.02);
      ctx.quadraticCurveTo(tipX*0.85,tipY+earH*0.22,midX+sx*cover.faceW*0.04,baseY-earH*0.08);
      ctx.closePath();
      ctx.fill();
    }
    ear(-1);
    ear(1);

    drawBlush(ctx,L,R,eyeDist);
    drawKawaiiEye(ctx,L.x,L.y,eyeR,eyeR*1.15);
    drawKawaiiEye(ctx,R.x,R.y,eyeR,eyeR*1.15);

    // Soft heart nose
    ctx.fillStyle='#ff7aa2';
    ctx.beginPath();
    var nr=eyeDist*0.11;
    ctx.moveTo(N.x,N.y+nr*0.9);
    ctx.bezierCurveTo(N.x-nr*1.4,N.y-nr*0.2,N.x-nr*0.6,N.y-nr*1.2,N.x,N.y-nr*0.35);
    ctx.bezierCurveTo(N.x+nr*0.6,N.y-nr*1.2,N.x+nr*1.4,N.y-nr*0.2,N.x,N.y+nr*0.9);
    ctx.fill();

    // Soft W mouth
    ctx.strokeStyle='#e56b8f';
    ctx.lineWidth=Math.max(2,eyeDist*0.055);
    ctx.lineCap='round';
    ctx.lineJoin='round';
    ctx.beginPath();
    ctx.moveTo(N.x-eyeDist*0.28,M.y);
    ctx.quadraticCurveTo(N.x-eyeDist*0.14,M.y+eyeDist*0.16,N.x,M.y+eyeDist*0.02);
    ctx.quadraticCurveTo(N.x+eyeDist*0.14,M.y+eyeDist*0.16,N.x+eyeDist*0.28,M.y);
    ctx.stroke();

    // Soft whiskers
    ctx.strokeStyle='rgba(230,120,150,0.45)';
    ctx.lineWidth=Math.max(1.2,eyeDist*0.035);
    ctx.beginPath();
    ctx.moveTo(N.x-eyeDist*0.2,N.y+eyeDist*0.08); ctx.lineTo(N.x-eyeDist*0.95,N.y-eyeDist*0.02);
    ctx.moveTo(N.x-eyeDist*0.2,N.y+eyeDist*0.18); ctx.lineTo(N.x-eyeDist*0.9,N.y+eyeDist*0.22);
    ctx.moveTo(N.x+eyeDist*0.2,N.y+eyeDist*0.08); ctx.lineTo(N.x+eyeDist*0.95,N.y-eyeDist*0.02);
    ctx.moveTo(N.x+eyeDist*0.2,N.y+eyeDist*0.18); ctx.lineTo(N.x+eyeDist*0.9,N.y+eyeDist*0.22);
    ctx.stroke();
  }

  function FaceMask(){
    this.style='off';
  }

  FaceMask.prototype.setStyle=function(style){
    this.style=normalizeStyle(style);
  };

  /**
   * Draw privacy mask onto a transparent overlay canvas.
   */
  FaceMask.prototype.draw=function(ctx,w,h,landmarks,style){
    style=normalizeStyle(style);
    if(style==='off'||!ctx||!landmarks||!landmarks.length||w<=0||h<=0) return false;
    var cover=buildCoverHull(landmarks,w,h);
    if(!cover||!cover.hull||cover.hull.length<5) return false;

    ctx.save();
    ctx.clearRect(0,0,w,h);

    if(style==='solid'){
      drawSolidPlate(ctx,cover);
    }else if(style==='animal'){
      drawAnimalFeatures(ctx,landmarks,w,h,cover);
    }else{
      drawEmojiFeatures(ctx,landmarks,w,h,cover);
    }

    ctx.restore();
    return true;
  };

  FaceMask.prototype.clear=function(ctx,w,h){
    if(!ctx) return;
    ctx.clearRect(0,0,w||0,h||0);
  };

  global.OneToneFaceMask={
    create:function(){ return new FaceMask(); },
    normalizeStyle:normalizeStyle,
    styles:STYLES.slice(),
    FACE_OVAL:FACE_OVAL.slice(),
    SOURCE:'Expanded MediaPipe oval + anonymizer-style padding (Canvas 2D)'
  };
})((typeof window!=='undefined')?window:globalThis);
