(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };

  function currentMapping(){
    var hdr=global.OneToneVoicePageHeaderRender;
    if(hdr&&hdr.resolveScopeMapping) return hdr.resolveScopeMapping(null);
    var core=global.OneToneMappingCore;
    var st=global.OneToneState&&global.OneToneState.state?global.OneToneState.state:{};
    var id=String(st.selectedMappingId||(st.config&&st.config.activeSceneId)||'').trim();
    return id&&core&&core.byId?core.byId(id):null;
  }

  function padReady(m){
    var keys=m&&m.codexMicroPad&&m.codexMicroPad.keys;
    return !!(keys&&keys.length);
  }

  /** Soft Pad page armed keys for current app — one row per physical key. */
  function padKeys(m){
    var seen={};
    var out=[];
    ((m&&m.codexMicroPad&&m.codexMicroPad.keys)||[]).forEach(function(k){
      if(!k||k.enabled===false||!String(k.slotId||'').trim()) return;
      var mid=String(k.microKeyId||'');
      if(!mid||seen[mid]) return;
      seen[mid]=true;
      out.push(k);
    });
    return out;
  }

  function keyLabel(m,padKey){
    var slot=String(padKey&&padKey.slotId||'').trim();
    var Keys=global.OneToneVoiceBridgeKeys;
    if(Keys&&Keys.labelForSlot){
      var titled=String(Keys.labelForSlot(slot)||'').trim();
      if(titled) return titled;
    }
    var A=global.OneToneAgentActions;
    if(A&&A.labelForSlotForMapping&&m&&slot){
      var mapped=String(A.labelForSlotForMapping(m,slot)||'').trim();
      if(mapped) return mapped;
    }
    return String(padKey&&(padKey.label||padKey.actionId||padKey.slotId)||'键').trim();
  }

  function keyExplain(m,padKey){
    var slot=String(padKey&&padKey.slotId||'').trim();
    var label=keyLabel(m,padKey);
    var Keys=global.OneToneVoiceBridgeKeys;
    var copy=(Keys&&Keys.explainForSlot)?Keys.explainForSlot(slot,label):null;
    var when=copy&&copy.when?String(copy.when):'';
    var effect=copy&&copy.effect?String(copy.effect):'';
    var PadUi=global.OneToneCodexMicroPadUi;
    if(PadUi&&PadUi.slotEffectTip&&slot){
      var tip=String(PadUi.slotEffectTip(slot,label,m)||'').trim();
      if(tip&&!effect) effect=tip;
    }
    if(!effect) effect='执行「'+label+'」。';
    return {
      title:label,
      when:when||'需要时点 Soft Pad 上这颗键。',
      effect:effect
    };
  }

  var pickSlotId='';
  var pickMicroKeyId='';

  function setScope(m){
    var pill=$('voiceSpScopePill');
    var hint=$('voiceSpScopeHint');
    var name=(m&&(m.name||m.appTargetId))||'—';
    var armed=padKeys(m);
    if(pill) pill.textContent=padReady(m)?('屏幕 · '+name):'未准备';
    if(hint){
      hint.textContent=!padReady(m)
        ?'先去 Soft Pad 准备键盘'
        :(!armed.length
          ?'先去 Soft Pad 打开要认的键'
          :('与 Soft Pad 同一键盘 · 已开 '+armed.length+' 颗'));
    }
  }

  function renderCap(m){
    var keys=padKeys(m);
    if(!keys.length) return;
    var padKey=keys.find(function(k){ return String(k.microKeyId||'')===pickMicroKeyId; })
      ||keys.find(function(k){ return String(k.slotId||'')===pickSlotId; })
      ||keys[0];
    pickSlotId=String(padKey.slotId||'');
    pickMicroKeyId=String(padKey.microKeyId||'');
    var ex=keyExplain(m,padKey);
    var title=$('voiceSpCapTitle');
    if(title) title.textContent=ex.title;
    var when=$('voiceSpCapWhen');
    if(when) when.textContent=ex.when;
    var effect=$('voiceSpCapEffect');
    if(effect) effect.textContent=ex.effect;
  }

  function slimPreviewChrome(host){
    if(!host) return;
    [
      '.codex-micro-pad__head',
      '.soft-pad-preview__hint',
      '.soft-pad-key-caption',
      '.codex-pad-mgr__hint'
    ].forEach(function(sel){
      host.querySelectorAll(sel).forEach(function(el){ el.hidden=true; });
    });
  }

  function applySelectOverlay(host,m){
    if(!host) return;
    var armedByMicro={};
    padKeys(m).forEach(function(k){ armedByMicro[String(k.microKeyId||'')]=k; });
    host.querySelectorAll('.micro-hw__key[data-micro-key]').forEach(function(el){
      var mid=String(el.getAttribute('data-micro-key')||'');
      var pk=armedByMicro[mid]||null;
      var armed=!!pk;
      var focused=armed&&(String(pk.slotId||'')===pickSlotId||mid===pickMicroKeyId);
      el.classList.toggle('is-focused',focused);
      el.classList.toggle('is-voice-armed',armed);
      el.classList.toggle('is-voice-idle',!armed);
      var chip=el.querySelector('.sp-voice-ph');
      if(chip) chip.remove();
    });
  }

  function render(){
    var m=currentMapping();
    var PadUi=global.OneToneCodexMicroPadUi;
    if(m&&m.codexMicroPad&&PadUi&&PadUi.ensurePad){
      try{ PadUi.ensurePad(m,{persist:false}); }catch(_e){}
    }
    var need=$('voiceSpNeedPrepare');
    var off=$('voiceSpBridgeOff');
    var on=$('voiceSpPrepared');
    var noPad=!padReady(m);
    var armed=padKeys(m);
    var noArmed=!noPad&&!armed.length;
    if(need) need.hidden=!noPad;
    if(off) off.hidden=!noArmed;
    if(on) on.hidden=noPad||noArmed;
    setScope(m);
    if(noPad||noArmed) return;

    if(!pickSlotId||!armed.some(function(k){ return String(k.slotId||'')===pickSlotId; })){
      if(armed[0]){
        pickSlotId=String(armed[0].slotId||'');
        pickMicroKeyId=String(armed[0].microKeyId||'');
      }
    }

    var host=$('voiceSpPreviewHost');
    if(host&&PadUi&&PadUi.renderSoftPadPreview){
      try{ PadUi.renderSoftPadPreview(host,m,{forceFull:true}); }catch(_e2){}
      slimPreviewChrome(host);
      applySelectOverlay(host,m);
      if(!host._spPickBound){
        host._spPickBound=true;
        host.addEventListener('click',function(e){
          var key=e.target.closest&&e.target.closest('.micro-hw__key[data-micro-key]');
          if(!key) return;
          e.preventDefault();
          e.stopPropagation();
          var mid=String(key.getAttribute('data-micro-key')||'');
          var cur=currentMapping();
          var padKey=padKeys(cur).find(function(k){ return String(k.microKeyId||'')===mid; });
          if(!padKey) return;
          pickMicroKeyId=mid;
          pickSlotId=String(padKey.slotId||'');
          try{
            var sceneClaim=global.OneToneKeysSceneActionsPanel;
            if(cur&&sceneClaim&&typeof sceneClaim.claimVoiceChannelMatch==='function'){
              sceneClaim.claimVoiceChannelMatch(
                cur,
                'softPad',
                mid,
                String(padKey.slotId||padKey.actionId||'')
              );
            }
          }catch(_c){}
          render();
        },true);
      }
    }

    var goCap=$('btnVoiceSpGoPadFromCap');
    if(goCap&&!goCap._bound){
      goCap._bound=true;
      goCap.addEventListener('click',function(e){
        e.preventDefault();
        var hooks=global.OneToneHooks||{};
        if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.open){
          global.OneToneSettingsDrawer.open({panel:'softPad',section:'softPadLayout'});
          return;
        }
        if(typeof hooks.setSettingsPanel==='function') hooks.setSettingsPanel('softPad');
      });
    }

    renderCap(m);
  }

  /** Kept for bridge-add wiring; Soft Pad face is explain-only — open Soft Pad instead. */
  function addPhrase(){
    var go=$('btnVoiceSpGoPadFromCap')||$('btnVoiceSpGoPad');
    if(go) go.click();
    return true;
  }

  global.OneToneVoiceBridgeSoftPad={ render:render, addPhrase:addPhrase, padKeys:padKeys };
})((typeof window!=='undefined')?window:globalThis);
