(function(global){
  'use strict';

  /**
   * Region-level gaze target hint for vibecoding ("look where, say where").
   * Stub: elementFromPoint + overlay filtering. Editor/terminal regions later.
   */

  var OVERLAY_IDS={
    cameraGazeOverlay:true,
    cameraGazeWindowLayer:true,
    cameraGazeCalibrationOverlay:true,
    cameraGazeOrb:true,
    cameraGazeWindowOrb:true,
    cameraGazeHud:true,
    cameraGazeCoach:true,
    cameraGazeCalibrationTarget:true,
    cameraGazeCalibrationDim:true
  };

  function emptyResult(){
    return {
      element:null,
      tagName:null,
      id:null,
      className:null,
      role:null,
      codeRegion:null,
      errorBlock:null
    };
  }

  function hasCameraGazeClass(el){
    if(!el||!el.classList) return false;
    var list=el.classList;
    for(var i=0;i<list.length;i++){
      if(String(list[i]||'').indexOf('camera-gaze-')===0) return true;
    }
    return false;
  }

  function isGazeDebugOverlay(el){
    if(!el||el.nodeType!==1) return true;
    var id=el.id?String(el.id):'';
    if(id&&OVERLAY_IDS[id]) return true;
    if(hasCameraGazeClass(el)) return true;
    if(el.getAttribute&&el.getAttribute('aria-hidden')==='true') return true;
    if(el.hidden) return true;
    try{
      var pe=global.getComputedStyle?getComputedStyle(el).pointerEvents:'';
      if(pe==='none') return true;
    }catch(_){}
    return false;
  }

  function isMeaningful(el){
    if(!el||el.nodeType!==1) return false;
    if(isGazeDebugOverlay(el)) return false;
    var tag=(el.tagName||'').toLowerCase();
    if(tag==='html'||tag==='body') return false;
    if(el.id||(el.className&&String(el.className).trim())||el.getAttribute('role')) return true;
    if(tag==='button'||tag==='a'||tag==='input'||tag==='textarea'||tag==='select'||tag==='label') return true;
    if(el.isContentEditable) return true;
    return false;
  }

  function walkUp(el){
    var cur=el;
    while(cur&&cur.nodeType===1){
      if(!isGazeDebugOverlay(cur)&&isMeaningful(cur)) return cur;
      if(!isGazeDebugOverlay(cur)){
        // Prefer first non-overlay element even without id/class (e.g. plain <p>).
        var tag=(cur.tagName||'').toLowerCase();
        if(tag!=='html'&&tag!=='body') return cur;
      }
      cur=cur.parentElement;
    }
    return null;
  }

  function pickFromPoint(clientX,clientY){
    var doc=global.document;
    if(!doc) return null;
    var x=Number(clientX);
    var y=Number(clientY);
    if(!isFinite(x)||!isFinite(y)) return null;
    var stack=null;
    try{
      if(typeof doc.elementsFromPoint==='function'){
        stack=doc.elementsFromPoint(x,y);
      }
    }catch(_){ stack=null; }
    if(stack&&stack.length){
      for(var i=0;i<stack.length;i++){
        var hit=walkUp(stack[i]);
        if(hit) return hit;
      }
      return null;
    }
    var top=null;
    try{
      top=doc.elementFromPoint(x,y);
    }catch(_){ top=null; }
    return walkUp(top);
  }

  function describe(el){
    if(!el) return emptyResult();
    return {
      element:el,
      tagName:(el.tagName||'').toLowerCase()||null,
      id:el.id?String(el.id):null,
      className:el.className!=null?String(el.className):null,
      role:el.getAttribute?el.getAttribute('role'):null,
      codeRegion:null,
      errorBlock:null
    };
  }

  function resolve(input){
    var src=input&&typeof input==='object'?input:{};
    var el=pickFromPoint(src.clientX,src.clientY);
    return describe(el);
  }

  global.OneToneGazeContextResolver={
    resolve:resolve,
    isGazeDebugOverlay:isGazeDebugOverlay
  };
})((typeof window!=='undefined')?window:globalThis);
