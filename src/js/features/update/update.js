(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  var state=function(){ return global.OneToneState.state; };
  var invoke=function(cmd,args){ return global.OneToneIpc.invoke(cmd,args); };

  var updateRequestMode='none';
  var updateDismissedVersion='';

  function toast(msg){
    if(typeof global.__vp_toast__==='function') global.__vp_toast__(msg);
  }

  function isHomeFirstRunFocusMode(){
    if(typeof global.__vp_isHomeFirstRunFocusMode__==='function') return global.__vp_isHomeFirstRunFocusMode__();
    return false;
  }

  function defaultState(){
    return {
      phase:'idle',
      available:false,
      currentVersion:'',
      latestVersion:'',
      notes:'',
      error:'',
      progress:null,
    };
  }

  function normalizeState(raw){
    var base=defaultState();
    if(!raw||typeof raw!=='object') return base;
    var next=Object.assign({},base,raw);
    next.phase=String(next.phase||'idle');
    next.available=!!next.available;
    next.currentVersion=String(next.currentVersion||next.current_version||'');
    next.latestVersion=String(next.latestVersion||next.latest_version||'');
    next.notes=String(next.notes||'');
    next.error=String(next.error||'');
    var progress=raw.progress;
    if(progress&&typeof progress==='object'){
      var downloaded=Number(progress.downloaded||0);
      var total=Number(progress.total||0);
      var percent=Number(progress.percent||((total>0?Math.min(100,Math.floor(downloaded*100/total)):0)));
      next.progress={downloaded:downloaded,total:total,percent:percent};
    }else{
      next.progress=null;
    }
    return next;
  }

  function progressPercent(update){
    if(!update||!update.progress) return 0;
    var p=update.progress;
    if(typeof p.percent==='number'&&isFinite(p.percent)) return Math.max(0,Math.min(100,Math.round(p.percent)));
    if(p.total>0) return Math.max(0,Math.min(100,Math.round((p.downloaded*100)/p.total)));
    return 0;
  }

  function stateLabel(update){
    if(!update) return t('updateCheck');
    if(update.phase==='checking') return t('updateChecking');
    if(update.phase==='available') return t('updateInstall');
    if(update.phase==='downloading') return t('updateDownload').replace('{pct}',String(progressPercent(update)));
    if(update.phase==='installing') return t('updateInstalling');
    if(update.phase==='restarting') return t('updateRestarting');
    if(update.phase==='error') return t('updateCheck');
    return t('updateCheck');
  }

  function bannerVisible(update){
    if(!update) return false;
    if(update.phase==='downloading'||update.phase==='installing'||update.phase==='restarting') return true;
    if(update.phase==='available'&&update.latestVersion&&update.latestVersion!==updateDismissedVersion) return true;
    if(update.phase==='error'&&update.error) return true;
    return false;
  }

  function isAvailable(update){
    return !!(update&&update.phase==='available'&&update.latestVersion&&update.latestVersion!==updateDismissedVersion);
  }

  function renderUi(){
    var st=state();
    var update=st.update||defaultState();
    var maintenanceBtn=$('btnAboutCheckUpdate');
    var navBadge=$('settingsNavGeneralBadge');
    var banner=$('updateBanner');
    var bannerTitle=$('updateBannerTitle');
    var bannerBody=$('updateBannerBody');
    var bannerMeta=$('updateBannerMeta');
    var kicker=$('updateBannerKicker');
    var primaryBtn=$('btnUpdatePrimary');
    var laterBtn=$('btnUpdateLater');
    var progressWrap=$('updateBannerProgress');
    var progressFill=$('updateBannerProgressFill');
    var focusMode=isHomeFirstRunFocusMode();
    var hasUpdate=isAvailable(update);
    var updateBusy=update.phase==='checking'||update.phase==='downloading'||update.phase==='installing'||update.phase==='restarting';

    if(maintenanceBtn){
      maintenanceBtn.textContent=stateLabel(update);
      maintenanceBtn.classList.toggle('is-hot',hasUpdate);
      maintenanceBtn.classList.toggle('is-busy',updateBusy);
      maintenanceBtn.disabled=updateBusy;
    }
    if(navBadge) navBadge.hidden=!hasUpdate;
    if(focusMode){
      if(banner){
        banner.classList.remove('show');
        banner.hidden=true;
      }
      return;
    }

    var showBanner=bannerVisible(update);
    if(banner){
      banner.classList.toggle('show',showBanner);
      banner.hidden=!showBanner;
    }
    if(!showBanner) return;

    var versionLabel=update.latestVersion?('v'+update.latestVersion):'';
    if(kicker) kicker.textContent=t('updateKicker');
    if(bannerTitle){
      bannerTitle.textContent=update.phase==='available'
        ?t('updateTitle').replace('{version}',versionLabel||'')
        :update.phase==='downloading'
          ?t('updateInstalling')
          :update.phase==='installing'
            ?t('updateInstalling')
            :update.phase==='restarting'
              ?t('updateRestarting')
              :t('updateError').replace('{msg}',update.error||'');
    }
    if(bannerBody){
      if(update.phase==='available'){
        bannerBody.textContent=update.notes||t('updateBody');
      }else if(update.phase==='downloading'){
        bannerBody.textContent=t('updateDownload').replace('{pct}',String(progressPercent(update)));
      }else if(update.phase==='installing'){
        bannerBody.textContent=t('updateInstalling');
      }else if(update.phase==='restarting'){
        bannerBody.textContent=t('updateRestarting');
      }else{
        bannerBody.textContent=t('updateError').replace('{msg}',update.error||'');
      }
    }
    if(bannerMeta){
      bannerMeta.textContent=update.phase==='available'
        ?(t('updateMeta')+' · '+(update.currentVersion?('v'+update.currentVersion):''))
        :update.phase==='downloading'
          ?(update.progress ? (String(update.progress.downloaded)+' / '+String(update.progress.total)+' bytes') : '')
          :update.phase==='installing'
            ?t('updateInstalling')
            :update.phase==='restarting'
              ?t('updateRestarting')
              :update.error||'';
    }
    if(primaryBtn){
      primaryBtn.textContent=update.phase==='available' ? t('updateInstall') : (update.phase==='error' ? t('updateCheck') : t('updateInstall'));
      primaryBtn.disabled=update.phase==='checking'||update.phase==='downloading'||update.phase==='installing'||update.phase==='restarting';
    }
    if(laterBtn){
      laterBtn.textContent=t('updateLater');
      laterBtn.disabled=update.phase!=='available';
      laterBtn.hidden=update.phase!=='available';
    }
    if(progressWrap&&progressFill){
      var showProgress=update.phase==='downloading'&&update.progress;
      progressWrap.hidden=!showProgress;
      progressWrap.classList.toggle('show',!!showProgress);
      progressFill.style.width=showProgress ? String(progressPercent(update))+'%' : '0%';
    }
  }

  function setState(raw){
    state().update=normalizeState(raw);
    renderUi();
  }

  function handleCheckResult(result,manual){
    if(result&&typeof result==='object'){
      if(result.update) setState(result.update);
      else setState(result);
    }
    if(manual){
      var update=state().update||defaultState();
      if(update.phase==='available'&&update.latestVersion){
        updateDismissedVersion='';
        try{ localStorage.removeItem('vp_update_dismissed_version'); }catch(_){}
      }
    }
    if(!result||!result.update||result.update.phase!=='checking'){
      updateRequestMode='none';
    }
  }

  function check(manual){
    var st=state();
    if(updateRequestMode!=='none'&&(st.update&&st.update.phase!=='idle')) return Promise.resolve();
    updateRequestMode=manual?'manual':'auto';
    if(manual) toast(t('updateChecking'));
    setState(Object.assign({},st.update||defaultState(),{phase:'checking',error:'',progress:null}));
    return invoke('cmd_update_check',{}).then(function(res){
      handleCheckResult(res,manual);
      if(manual&&state().update&&state().update.phase==='idle'){
        toast(t('updateUpToDate'));
      }
    }).catch(function(err){
      updateRequestMode='none';
      var msg=(err&&err.message)?err.message:String(err||'');
      setState(Object.assign({},st.update||defaultState(),{phase:'error',error:msg,progress:null,available:false}));
      if(manual) toast(t('updateError').replace('{msg}',msg||''));
    });
  }

  function install(){
    var st=state();
    var update=st.update||defaultState();
    if(update.phase==='downloading'||update.phase==='installing'||update.phase==='restarting') return Promise.resolve();
    updateRequestMode='manual';
    setState(Object.assign({},update,{phase:'checking',error:'',progress:null}));
    return invoke('cmd_update_install',{}).catch(function(err){
      updateRequestMode='none';
      var msg=(err&&err.message)?err.message:String(err||'');
      setState(Object.assign({},st.update||defaultState(),{phase:'error',error:msg,progress:null,available:false}));
      toast(t('updateError').replace('{msg}',msg||''));
    });
  }

  function dismiss(){
    var update=state().update||defaultState();
    if(update.latestVersion){
      updateDismissedVersion=update.latestVersion;
      try{ localStorage.setItem('vp_update_dismissed_version',update.latestVersion); }catch(_){}
    }
    renderUi();
  }

  function applyRuntimeMessage(msg){
    if(!msg||!msg.update) return;
    var st=state();
    st.update=normalizeState(msg.update);
    if(updateRequestMode==='manual'&&st.update.phase==='available'){
      try{ updateDismissedVersion=''; localStorage.removeItem('vp_update_dismissed_version'); }catch(_){}
    }
    if(st.update.phase==='idle'&&updateRequestMode==='manual'){
      toast(t('updateUpToDate'));
    }else if(st.update.phase==='error'&&updateRequestMode==='manual'&&st.update.error){
      toast(t('updateError').replace('{msg}',st.update.error));
    }
    if(st.update.phase!=='checking') updateRequestMode='none';
    renderUi();
  }

  function loadDismissedVersion(version){
    updateDismissedVersion=version||'';
  }

  global.OneToneUpdate={
    defaultState:defaultState,
    normalizeState:normalizeState,
    setState:setState,
    renderUi:renderUi,
    check:check,
    install:install,
    dismiss:dismiss,
    handleCheckResult:handleCheckResult,
    applyRuntimeMessage:applyRuntimeMessage,
    loadDismissedVersion:loadDismissedVersion,
    getRequestMode:function(){ return updateRequestMode; },
    setRequestMode:function(mode){ updateRequestMode=mode; }
  };
})((typeof window!=='undefined')?window:globalThis);
