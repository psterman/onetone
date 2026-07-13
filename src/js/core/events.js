(function(global){
  'use strict';
  const listeners={message:[]};
  const pendingToJsQueue=[];
  function flushToJsQueue(){
    if(!pendingToJsQueue.length||!listeners.message||!listeners.message.length) return;
    const queued=pendingToJsQueue.splice(0,pendingToJsQueue.length);
    queued.forEach(dispatchToJsNow);
  }
  function applyMvpInitEarly(payload){
    if(!payload||payload.type!=='mvp_init'&&!payload.config) return;
    const persist=global.OneToneConfigPersist;
    if(persist&&typeof persist.applyMvpInit==='function') persist.applyMvpInit(payload);
  }
  function bridgeInvoke(cmd,args){
    const ipc=global.OneToneIpc;
    const invoke=ipc&&typeof ipc.invoke==='function'?ipc.invoke.bind(ipc):global.__vp_invoke__;
    if(!invoke) return Promise.resolve(null);
    return invoke(cmd,args||{}).catch(function(err){
      console.error('bridge invoke failed',cmd,err);
      return null;
    });
  }
  function afterPersist(cmd,result){
    if(cmd==='cmd_ready'&&result&&global.OneToneConfigPersist){
      if(typeof global.OneToneConfigPersist.applyRawMvpInit==='function'){
        global.OneToneConfigPersist.applyRawMvpInit(result);
      }else{
        global.OneToneConfigPersist.applyMvpInit(result);
      }
    }
  }
  global.chrome=global.chrome||{};
  global.chrome.webview=global.chrome.webview||{};
  global.chrome.webview.postMessage=function(msg){
    const type=msg&&msg.type;
    if(type==='mvp_ready')bridgeInvoke('cmd_ready',{}).then(function(res){ afterPersist('cmd_ready',res); });
    else if(type==='mvp_save')bridgeInvoke('cmd_save',{json:msg.json||'{}'}).then(function(){ afterPersist('cmd_save'); });
    else if(type==='mvp_scheme_select')bridgeInvoke('cmd_scheme_select',{mappingId:msg.mappingId||''});
    else if(type==='mvp_start_recording')bridgeInvoke('cmd_start_recording',{mappingId:msg.mappingId||'',mode:msg.mode||'trigger'});
    else if(type==='mvp_stop_recording')bridgeInvoke('cmd_stop_recording',{});
    else if(type==='mvp_start_trigger_compat_probe')bridgeInvoke('cmd_start_trigger_compat_probe',{mappingId:msg.mappingId||''});
    else if(type==='mvp_stop_trigger_compat_probe')bridgeInvoke('cmd_stop_trigger_compat_probe',{});
    else if(type==='mvp_mapping_toggle')bridgeInvoke('cmd_mapping_toggle',{id:msg.id,enabled:!!msg.enabled});
    else if(type==='mvp_mapping_delete')bridgeInvoke('cmd_mapping_delete',{id:msg.id});
    else if(type==='mvp_mapping_duplicate')bridgeInvoke('cmd_mapping_duplicate',{id:msg.id});
    else if(type==='mvp_mapping_reorder')bridgeInvoke('cmd_mapping_reorder',{orderedIds:msg.orderedIds||[]});
    else if(type==='mvp_mapping_set_group')bridgeInvoke('cmd_mapping_set_group',{id:msg.id,group:msg.group||''});
    else if(type==='mvp_pause')bridgeInvoke('cmd_pause',{});
    else if(type==='mvp_resume')bridgeInvoke('cmd_resume',{});
    else if(type==='mvp_request_runtime')bridgeInvoke('cmd_request_runtime',{});
    else if(type==='mvp_reload_latest')bridgeInvoke('cmd_reload_latest',{});
    else if(type==='mvp_sync_theme_backdrop')bridgeInvoke('cmd_sync_theme_backdrop',{theme:msg.theme||'light'});
    else if(type==='mvp_frontend_keydown')bridgeInvoke('cmd_frontend_keydown',{key:msg.key||'',mappingId:msg.mappingId||'',mode:msg.mode||'trigger'});
    else if(type==='mvp_physical_trigger')bridgeInvoke('cmd_physical_trigger',{key:msg.key||''});
    else if(type==='mvp_test_send')bridgeInvoke('cmd_test_send',{mappingId:msg.mappingId||null,targetKey:msg.targetKey||null});
  };
  global.chrome.webview.addEventListener=function(event,cb){
    if(!listeners[event]) listeners[event]=[];
    listeners[event].push(cb);
    if(event==='message') flushToJsQueue();
  };
  global.__vp_bridge__=function(type,data){ const event={data:Object.assign({type:type},data||{})}; (listeners.message||[]).forEach(function(cb){ try{cb(event);}catch(e){} }); };
  function dispatchToJsNow(payload){
    if(!payload||typeof payload!=='object') return;
    (listeners.message||[]).forEach(function(cb){ try{cb({data:payload});}catch(e){console.error('to_js handler',e);} });
  }
  function dispatchToJs(payload){
    if(!payload||typeof payload!=='object') return;
    if(!listeners.message||!listeners.message.length){
      applyMvpInitEarly(payload);
      pendingToJsQueue.push(payload);
      if(pendingToJsQueue.length>64) pendingToJsQueue.shift();
      return;
    }
    dispatchToJsNow(payload);
  }
  function ensureToJsListener(){
    if(ensureToJsListener.ready) return !!ensureToJsListener.ready;
    const eventApi=global.__TAURI__&&global.__TAURI__.event;
    if(!eventApi||typeof eventApi.listen!=='function') return false;
    ensureToJsListener.ready=true;
    eventApi.listen('to_js',function(event){
      dispatchToJs(event&&event.payload);
    }).then(function(){
      if(typeof global.__vp_on_to_js_ready__==='function') global.__vp_on_to_js_ready__();
    }).catch(function(err){
      console.error('to_js listen',err);
      ensureToJsListener.ready=false;
    });
    return true;
  }
  ensureToJsListener.ready=false;
  global.__vp_ensure_to_js__=ensureToJsListener;
  global.__vp_dispatch_to_js__=dispatchToJs;
  global.OneToneEvents={dispatchToJs:dispatchToJs,bridge:global.__vp_bridge__};
  ensureToJsListener();
  let listenPoll=0;
  listenPoll=setInterval(function(){
    if(ensureToJsListener()) clearInterval(listenPoll);
  },80);
  setTimeout(function(){ clearInterval(listenPoll); },12000);
})((typeof window!=='undefined')?window:globalThis);
