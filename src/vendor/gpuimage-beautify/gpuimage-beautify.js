/**
 * GPUImageBeautify WebGL port (local vendor).
 *
 * Algorithm adapted from Guikunzhi/BeautifyFaceDemo (MIT):
 *   https://github.com/Guikunzhi/BeautifyFaceDemo
 * Pipeline: bilateral-ish smooth → edge map → skin-aware combine → log whitening → HSB.
 *
 * Slim/rosy extras are optional overlays; core beauty is Guikunzhi combination.
 */
(function(global){
  'use strict';

  var VS=[
    'attribute vec2 a_pos;',
    'varying vec2 v_uv;',
    'void main(){',
    // y=0 at top to match HTMLVideo texImage2D (no UNPACK_FLIP_Y) + MediaPipe landmarks.
    '  v_uv=vec2(a_pos.x*0.5+0.5,0.5-a_pos.y*0.5);',
    '  gl_Position=vec4(a_pos,0.0,1.0);',
    '}'
  ].join('\n');

  // Approx bilateral (range + spatial). Common WebGL substitute for GPUImageBilateralFilter.
  var FS_BILATERAL=[
    'precision mediump float;',
    'uniform sampler2D u_tex;',
    'uniform vec2 u_texel;',
    'uniform float u_distanceNormalizationFactor;',
    'varying vec2 v_uv;',
    'void main(){',
    '  vec3 center=texture2D(u_tex,v_uv).rgb;',
    '  float sumW=0.0;',
    '  vec3 sum=vec3(0.0);',
    '  for(int y=-2;y<=2;y++){',
    '    for(int x=-2;x<=2;x++){',
    '      vec2 o=vec2(float(x),float(y));',
    '      vec3 s=texture2D(u_tex,v_uv+o*u_texel*1.15).rgb;',
    '      float sp=exp(-dot(o,o)*0.22);',
    '      float rd=distance(s,center)*u_distanceNormalizationFactor;',
    '      float rw=exp(-rd*rd);',
    '      float w=sp*rw;',
    '      sum+=s*w;',
    '      sumW+=w;',
    '    }',
    '  }',
    '  gl_FragColor=vec4(sum/max(sumW,0.0001),1.0);',
    '}'
  ].join('\n');

  // Sobel edge magnitude (lightweight stand-in for GPUImageCannyEdgeDetectionFilter).
  var FS_SOBEL=[
    'precision mediump float;',
    'uniform sampler2D u_tex;',
    'uniform vec2 u_texel;',
    'varying vec2 v_uv;',
    'float lum(vec3 c){ return dot(c,vec3(0.299,0.587,0.114)); }',
    'void main(){',
    '  float tl=lum(texture2D(u_tex,v_uv+vec2(-u_texel.x,u_texel.y)).rgb);',
    '  float t =lum(texture2D(u_tex,v_uv+vec2(0.0,u_texel.y)).rgb);',
    '  float tr=lum(texture2D(u_tex,v_uv+vec2(u_texel.x,u_texel.y)).rgb);',
    '  float l =lum(texture2D(u_tex,v_uv+vec2(-u_texel.x,0.0)).rgb);',
    '  float r =lum(texture2D(u_tex,v_uv+vec2(u_texel.x,0.0)).rgb);',
    '  float bl=lum(texture2D(u_tex,v_uv+vec2(-u_texel.x,-u_texel.y)).rgb);',
    '  float b =lum(texture2D(u_tex,v_uv+vec2(0.0,-u_texel.y)).rgb);',
    '  float br=lum(texture2D(u_tex,v_uv+vec2(u_texel.x,-u_texel.y)).rgb);',
    '  float gx=-tl-2.0*l-bl+tr+2.0*r+br;',
    '  float gy=tl+2.0*t+tr-bl-2.0*b-br;',
    '  float e=clamp(length(vec2(gx,gy))*2.4,0.0,1.0);',
    '  gl_FragColor=vec4(e,e,e,1.0);',
    '}'
  ].join('\n');

  // Guikunzhi combination. FBO texels are Y-flipped vs HTMLVideo — sample with fboUv().
  var FS_COMBINE=[
    'precision mediump float;',
    'uniform sampler2D u_bilateral;',
    'uniform sampler2D u_edge;',
    'uniform sampler2D u_origin;',
    'uniform float u_smoothDegree;',
    'uniform float u_bright;',
    'uniform float u_sat;',
    'uniform float u_rosy;',
    'uniform float u_slim;',
    'uniform float u_doSlim;',
    'uniform float u_hasFace;',
    'uniform vec2 u_faceC;',
    'uniform vec2 u_cheekL;',
    'uniform vec2 u_cheekR;',
    'varying vec2 v_uv;',
    'vec2 fboUv(vec2 uv){ return vec2(uv.x,1.0-uv.y); }',
    'float faceMask(vec2 uv){',
    '  vec2 d=(uv-u_faceC)/vec2(0.20,0.26);',
    '  return smoothstep(1.15,0.22,dot(d,d));',
    '}',
    'float cheekMask(vec2 uv,vec2 c){',
    '  vec2 d=(uv-c)/vec2(0.08,0.06);',
    '  return smoothstep(1.0,0.15,dot(d,d));',
    '}',
    'vec2 slimUv(vec2 uv){',
    '  if(u_doSlim<0.5||u_slim<0.001) return uv;',
    '  float m=faceMask(uv); m*=m;',
    '  vec2 d=uv-u_faceC;',
    '  uv.x=u_faceC.x+d.x*(1.0+u_slim*0.45*m);',
    '  float dy=max(0.0,d.y);',
    '  uv.y=uv.y+dy*u_slim*0.10*m;',
    '  return clamp(uv,0.0,1.0);',
    '}',
    'void main(){',
    '  vec2 uv=slimUv(v_uv);',
    '  vec2 buv=fboUv(uv);',
    '  vec4 bilateral=texture2D(u_bilateral,buv);',
    '  vec4 canny=texture2D(u_edge,buv);',
    '  vec4 origin=texture2D(u_origin,uv);',
    '  float face=faceMask(uv);',
    '  float region=u_hasFace>0.5?face:smoothstep(1.2,0.35,dot((uv-vec2(0.5,0.40))/vec2(0.22,0.28),(uv-vec2(0.5,0.40))/vec2(0.22,0.28)));',
    '  float r=origin.r;',
    '  float g=origin.g;',
    '  float b=origin.b;',
    '  float skin=0.0;',
    '  if(canny.r<0.2 && r>0.3725 && g>0.1568 && b>0.0784 && r>b',
    '     && (max(max(r,g),b)-min(min(r,g),b))>0.0588 && abs(r-g)>0.0588){',
    '    skin=1.0;',
    '  }',
    '  float redCloth=smoothstep(0.28,0.55,r-g)*smoothstep(0.25,0.55,r-b);',
    '  skin*=(1.0-redCloth);',
    '  float apply=skin*region;',
    '  vec4 smoothC=mix(origin,bilateral,clamp(u_smoothDegree*apply,0.0,0.72));',
    '  vec3 wh=vec3(',
    '    log(1.0+0.2*smoothC.r)/log(1.2),',
    '    log(1.0+0.2*smoothC.g)/log(1.2),',
    '    log(1.0+0.2*smoothC.b)/log(1.2));',
    '  smoothC.rgb=mix(smoothC.rgb,wh,region);',
    '  vec3 boosted=smoothC.rgb*u_bright;',
    '  float l=dot(boosted,vec3(0.299,0.587,0.114));',
    '  boosted=mix(vec3(l),boosted,u_sat);',
    '  smoothC.rgb=mix(smoothC.rgb,boosted,region);',
    '  float ch=max(cheekMask(uv,u_cheekL),cheekMask(uv,u_cheekR))*face;',
    '  vec3 peach=vec3(0.94,0.55,0.52);',
    '  smoothC.rgb=mix(smoothC.rgb,peach,ch*u_rosy*0.22);',
    '  gl_FragColor=vec4(clamp(smoothC.rgb,0.0,1.0),1.0);',
    '}'
  ].join('\n');

  function compile(gl,type,src){
    var sh=gl.createShader(type);
    gl.shaderSource(sh,src);
    gl.compileShader(sh);
    if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){
      try{ gl.deleteShader(sh); }catch(_){}
      return null;
    }
    return sh;
  }

  function link(gl,vsSrc,fsSrc){
    var vs=compile(gl,gl.VERTEX_SHADER,vsSrc);
    var fs=compile(gl,gl.FRAGMENT_SHADER,fsSrc);
    if(!vs||!fs) return null;
    var p=gl.createProgram();
    gl.attachShader(p,vs);
    gl.attachShader(p,fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS)){
      try{ gl.deleteProgram(p); }catch(_){}
      return null;
    }
    return p;
  }

  function createTarget(gl,w,h){
    var tex=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    var fbo=gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    return {tex:tex,fbo:fbo,w:w,h:h};
  }

  function GpuBeautify(){
    this.gl=null;
    this.canvas=null;
    this.quad=null;
    this.videoTex=null;
    this.progBilateral=null;
    this.progSobel=null;
    this.progCombine=null;
    this.loc={};
    this.fboA=null;
    this.fboB=null;
    this.w=0;
    this.h=0;
  }

  GpuBeautify.prototype.init=function(canvas){
    this.destroy();
    this.canvas=canvas;
    var gl=null;
    try{
      gl=canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:false,premultipliedAlpha:false})
        ||canvas.getContext('experimental-webgl',{alpha:false,antialias:false});
    }catch(_){ gl=null; }
    if(!gl) return false;
    this.gl=gl;
    this.progBilateral=link(gl,VS,FS_BILATERAL);
    this.progSobel=link(gl,VS,FS_SOBEL);
    this.progCombine=link(gl,VS,FS_COMBINE);
    if(!this.progBilateral||!this.progSobel||!this.progCombine){
      this.destroy();
      return false;
    }
    this.quad=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([
      -1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1
    ]),gl.STATIC_DRAW);
    this.videoTex=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,this.videoTex);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);

    function locs(prog){
      return {
        aPos:gl.getAttribLocation(prog,'a_pos'),
        uTex:gl.getUniformLocation(prog,'u_tex'),
        uTexel:gl.getUniformLocation(prog,'u_texel'),
        uDist:gl.getUniformLocation(prog,'u_distanceNormalizationFactor'),
        uBilateral:gl.getUniformLocation(prog,'u_bilateral'),
        uEdge:gl.getUniformLocation(prog,'u_edge'),
        uOrigin:gl.getUniformLocation(prog,'u_origin'),
        uSmooth:gl.getUniformLocation(prog,'u_smoothDegree'),
        uBright:gl.getUniformLocation(prog,'u_bright'),
        uSat:gl.getUniformLocation(prog,'u_sat'),
        uRosy:gl.getUniformLocation(prog,'u_rosy'),
        uSlim:gl.getUniformLocation(prog,'u_slim'),
        uDoSlim:gl.getUniformLocation(prog,'u_doSlim'),
        uHasFace:gl.getUniformLocation(prog,'u_hasFace'),
        uFaceC:gl.getUniformLocation(prog,'u_faceC'),
        uCheekL:gl.getUniformLocation(prog,'u_cheekL'),
        uCheekR:gl.getUniformLocation(prog,'u_cheekR')
      };
    }
    this.loc.bilateral=locs(this.progBilateral);
    this.loc.sobel=locs(this.progSobel);
    this.loc.combine=locs(this.progCombine);
    return true;
  };

  GpuBeautify.prototype._ensureSize=function(w,h){
    if(this.w===w&&this.h===h&&this.fboA&&this.fboB) return;
    var gl=this.gl;
    function del(t){
      if(!t) return;
      try{ gl.deleteTexture(t.tex); }catch(_){}
      try{ gl.deleteFramebuffer(t.fbo); }catch(_){}
    }
    del(this.fboA); del(this.fboB);
    this.fboA=createTarget(gl,w,h);
    this.fboB=createTarget(gl,w,h);
    this.w=w; this.h=h;
  };

  GpuBeautify.prototype._draw=function(prog,loc,fbo){
    var gl=this.gl;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);
    gl.enableVertexAttribArray(loc.aPos);
    gl.vertexAttribPointer(loc.aPos,2,gl.FLOAT,false,0,0);
    if(fbo){
      gl.bindFramebuffer(gl.FRAMEBUFFER,fbo.fbo);
      gl.viewport(0,0,fbo.w,fbo.h);
    }else{
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      gl.viewport(0,0,this.canvas.width,this.canvas.height);
    }
    gl.drawArrays(gl.TRIANGLES,0,6);
  };

  /**
   * @param {HTMLVideoElement} video
   * @param {object} opts smoothDegree 0-1, bright ~1.05-1.2, sat ~1.05-1.2,
   *   rosy 0-1, slim 0-1, doSlim 0|1, faceC/cheekL/cheekR {x,y}
   */
  GpuBeautify.prototype.process=function(video,opts){
    if(!this.gl||!video||video.readyState<2) return false;
    opts=opts||{};
    var w=video.videoWidth|0;
    var h=video.videoHeight|0;
    if(w<=0||h<=0) return false;
    if(this.canvas.width!==w||this.canvas.height!==h){
      this.canvas.width=w;
      this.canvas.height=h;
    }
    this._ensureSize(w,h);
    var gl=this.gl;
    var texel=[1/w,1/h];

    // Upload video
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,this.videoTex);
    try{
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,video);
    }catch(_){ return false; }

    // Pass 1: bilateral → fboA
    gl.useProgram(this.progBilateral);
    gl.uniform1i(this.loc.bilateral.uTex,0);
    gl.uniform2f(this.loc.bilateral.uTexel,texel[0],texel[1]);
    gl.uniform1f(this.loc.bilateral.uDist,opts.distanceNormalizationFactor!=null?opts.distanceNormalizationFactor:4.0);
    this._draw(this.progBilateral,this.loc.bilateral,this.fboA);

    // Pass 2: sobel on origin → fboB
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,this.videoTex);
    gl.useProgram(this.progSobel);
    gl.uniform1i(this.loc.sobel.uTex,0);
    gl.uniform2f(this.loc.sobel.uTexel,texel[0],texel[1]);
    this._draw(this.progSobel,this.loc.sobel,this.fboB);

    // Pass 3: combine → screen
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,this.fboA.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D,this.fboB.tex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D,this.videoTex);
    var lc=this.loc.combine;
    gl.useProgram(this.progCombine);
    gl.uniform1i(lc.uBilateral,0);
    gl.uniform1i(lc.uEdge,1);
    gl.uniform1i(lc.uOrigin,2);
    gl.uniform1f(lc.uSmooth,opts.smoothDegree!=null?opts.smoothDegree:0.55);
    gl.uniform1f(lc.uBright,opts.bright!=null?opts.bright:1.1);
    gl.uniform1f(lc.uSat,opts.sat!=null?opts.sat:1.1);
    gl.uniform1f(lc.uRosy,opts.rosy!=null?opts.rosy:0);
    gl.uniform1f(lc.uSlim,opts.slim!=null?opts.slim:0);
    gl.uniform1f(lc.uDoSlim,opts.doSlim?1:0);
    gl.uniform1f(lc.uHasFace,opts.hasFace?1:0);
    var fc=opts.faceC||{x:0.5,y:0.42};
    var cl=opts.cheekL||{x:0.35,y:0.48};
    var cr=opts.cheekR||{x:0.65,y:0.48};
    gl.uniform2f(lc.uFaceC,fc.x,fc.y);
    gl.uniform2f(lc.uCheekL,cl.x,cl.y);
    gl.uniform2f(lc.uCheekR,cr.x,cr.y);
    this._draw(this.progCombine,lc,null);
    return true;
  };

  GpuBeautify.prototype.destroy=function(){
    var gl=this.gl;
    if(!gl){ this.canvas=null; return; }
    function delTex(t){ if(t) try{ gl.deleteTexture(t); }catch(_){} }
    function delFbo(t){ if(t) try{ gl.deleteFramebuffer(t); }catch(_){} }
    function delProg(p){ if(p) try{ gl.deleteProgram(p); }catch(_){} }
    if(this.fboA){ delTex(this.fboA.tex); delFbo(this.fboA.fbo); }
    if(this.fboB){ delTex(this.fboB.tex); delFbo(this.fboB.fbo); }
    delTex(this.videoTex);
    if(this.quad) try{ gl.deleteBuffer(this.quad); }catch(_){}
    delProg(this.progBilateral);
    delProg(this.progSobel);
    delProg(this.progCombine);
    this.gl=null;
    this.canvas=null;
    this.fboA=this.fboB=null;
    this.w=this.h=0;
  };

  global.OneToneGpuBeautify={
    create:function(){ return new GpuBeautify(); },
    /** Map Look level 0-3 → Guikunzhi smoothDegree (upstream default 0.5). */
    smoothDegreeFromLevel:function(lv){
      lv=Math.max(0,Math.min(3,lv|0));
      return [0,0.35,0.50,0.58][lv];
    },
    brightFromWhiten:function(lv){
      lv=Math.max(0,Math.min(3,lv|0));
      // Upstream HSB brightness 1.1
      return [1.0,1.04,1.08,1.12][lv];
    },
    satFromWhiten:function(lv){
      lv=Math.max(0,Math.min(3,lv|0));
      return [1.0,1.03,1.06,1.10][lv];
    },
    SOURCE:'Guikunzhi/BeautifyFaceDemo (MIT) GPUImageBeautifyFilter'
  };
})((typeof window!=='undefined')?window:globalThis);
