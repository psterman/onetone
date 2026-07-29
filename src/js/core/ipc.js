(function(global){
  'use strict';
  function tauriInternals(){
    return global.__TAURI_INTERNALS__||null;
  }
  function tauriGlobalCore(){
    const tauri=global.__TAURI__;
    return tauri&&tauri.core?tauri.core:null;
  }
  function tauriEventApi(){
    const tauri=global.__TAURI__;
    if(tauri&&tauri.event&&typeof tauri.event.listen==='function') return tauri.event;
    const internals=tauriInternals();
    if(internals&&typeof internals.listen==='function'){
      return {listen:internals.listen.bind(internals)};
    }
    return null;
  }
  function bridgeReady(){
    const internals=tauriInternals();
    if(internals&&typeof internals.invoke==='function') return true;
    const core=tauriGlobalCore();
    return !!(core&&typeof core.invoke==='function');
  }
  function vpInvokeInternal(cmd,args){
    const internals=tauriInternals();
    if(internals&&typeof internals.invoke==='function'){
      return internals.invoke(cmd,args);
    }
    const core=tauriGlobalCore();
    if(core&&typeof core.invoke==='function'){
      return core.invoke(cmd,args);
    }
    return Promise.reject(new Error('tauri invoke unavailable'));
  }
  function tauriListen(event,handler){
    const eventApi=tauriEventApi();
    if(!eventApi||typeof eventApi.listen!=='function'){
      return Promise.reject(new Error('tauri event listen unavailable'));
    }
    return eventApi.listen(event,handler);
  }
  function tauriArgs(args){
    const out=Object.assign({},args||{});
    Object.keys(args||{}).forEach(function(k){
      if(k.indexOf('_')>=0){
        const camel=k.replace(/_([a-z])/g,function(_,c){return c.toUpperCase();});
        if(out[camel]===undefined) out[camel]=args[k];
        return;
      }
      const snake=k.replace(/([A-Z])/g,function(_,c){return '_'+c.toLowerCase();});
      if(snake!==k&&out[snake]===undefined) out[snake]=args[k];
    });
    return out;
  }
  global.__vp_invoke__=vpInvokeInternal;
  global.__vp_tauri_args__=tauriArgs;
  const invoke=global.__vp_invoke__||function(){return Promise.reject(new Error('invoke unavailable'));};
  function vpInvoke(cmd,args){return invoke(cmd,global.__vp_tauri_args__?global.__vp_tauri_args__(args||{}):(args||{}));}
  function vpInvokeTimeout(cmd,args,ms){
    const timeoutMs=ms||4000;
    return new Promise(function(resolve,reject){
      let settled=false;
      const timer=setTimeout(function(){
        if(settled) return;
        settled=true;
        reject(new Error('invoke timeout: '+cmd));
      },timeoutMs);
      vpInvoke(cmd,args).then(function(res){
        if(settled) return;
        settled=true;
        clearTimeout(timer);
        resolve(res);
      }).catch(function(err){
        if(settled) return;
        settled=true;
        clearTimeout(timer);
        reject(err);
      });
    });
  }
  global.OneToneIpc={
    invoke:vpInvoke,
    invokeTimeout:vpInvokeTimeout,
    raw:vpInvokeInternal,
    tauriArgs:tauriArgs,
    bridgeReady:bridgeReady,
    listen:tauriListen,
    eventApi:tauriEventApi
  };
  global.vpInvoke=vpInvoke;
  global.vpInvokeTimeout=vpInvokeTimeout;
})((typeof window!=='undefined')?window:globalThis);
