(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var vpInvoke=global.OneToneIpc.invoke;
  function t(key){ return global.OneToneI18n.t(key); }
  function toast(msg,kind){ return global.OneToneAppToast.show(msg,kind); }

  var GITHUB_REPO_URL='https://github.com/psterman/onetone';

  function renderAboutPanel(){
    var el=$('aboutVersionValue');
    if(!el) return;
    var st=global.OneToneState.state;
    var ver=st.update&&st.update.currentVersion;
    el.textContent=ver||'鈥?;
  }

  function exportDiagnosticLogs(){
    var lines=global.OneToneAppGlobalError.logLines.slice().reverse();
    return vpInvoke('cmd_export_logs',{frontend_lines:lines}).then(function(res){
      if(res&&res.path){
        toast(t('exportLogsOk')+' '+res.path);
        global.OneToneAppGlobalError.pushLog('[export] '+res.path);
      }
    }).catch(function(err){
      console.error('export logs',err);
      toast(t('exportLogsFail')+': '+err,'lite');
    });
  }

  function openExternalUrl(url){
    return vpInvoke('cmd_open_url',{url:url}).catch(function(err){
      console.error('open url',err);
      toast(String(err),'lite');
    });
  }

  global.OneToneDebugAbout={
    githubRepoUrl:function(){ return GITHUB_REPO_URL; },
    renderAboutPanel:renderAboutPanel,
    exportDiagnosticLogs:exportDiagnosticLogs,
    openExternalUrl:openExternalUrl
  };
})((typeof window!=='undefined')?window:globalThis);
