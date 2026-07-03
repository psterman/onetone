(function(global){
  'use strict';
  function vpInvokeInternal(cmd,args){
    const core=global.__TAURI__&&global.__TAURI__.core;
    if(core&&typeof core.invoke==='function'){
      return core.invoke(cmd,args);
    }
    const internals=global.__TAURI_INTERNALS__;
    if(internals&&typeof internals.invoke==='function'){
      return internals.invoke(cmd,args);
    }
    return Promise.reject(new Error('tauri invoke unavailable'));
  }
  function tauriArgs(args){
    const out=Object.assign({},args||{});
    Object.keys(args||{}).forEach(function(k){
      if(k.indexOf('_')<0) return;
      const camel=k.replace(/_([a-z])/g,function(_,c){return c.toUpperCase();});
      if(out[camel]===undefined) out[camel]=args[k];
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
  global.OneToneIpc={invoke:vpInvoke,invokeTimeout:vpInvokeTimeout,raw:vpInvokeInternal,tauriArgs:tauriArgs};
  global.vpInvoke=vpInvoke;
  global.vpInvokeTimeout=vpInvokeTimeout;
})((typeof window!=='undefined')?window:globalThis);
