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

  function voiceRows(m){
    var list=(m&&m.agentBindings)||[];
    return list.filter(function(b){
      return b&&b.triggerType==='voice'&&String(b.triggerBinding||'').trim()&&b.enabled!==false;
    });
  }

  function padReady(m){
    var keys=m&&m.codexMicroPad&&m.codexMicroPad.keys;
    return !!(keys&&keys.length);
  }

  function padKeys(m){
    return ((m&&m.codexMicroPad&&m.codexMicroPad.keys)||[]).filter(function(k){
      return k&&k.enabled!==false&&k.slotId;
    });
  }

  function voiceForSlot(m,slotId){
    var sid=String(slotId||'');
    return voiceRows(m).find(function(b){
      return String(b.slotId||b.actionId||'')===sid;
    })||null;
  }

  function linkedPadVoice(m){
    if(!padReady(m)) return [];
    return padKeys(m).map(function(k){
      return voiceForSlot(m,k.slotId);
    }).filter(Boolean);
  }

  var pickSlotId='';
  var pickMicroKeyId='';

  function setScope(m){
    var pill=$('voiceSpScopePill');
    var hint=$('voiceSpScopeHint');
    var name=(m&&(m.name||m.appTargetId))||'—';
    if(pill) pill.textContent=padReady(m)?name:'未准备';
    if(hint){
      var n=linkedPadVoice(m).length;
      hint.textContent=!padReady(m)
        ?'先准备 Soft Pad'
        :(n?'改口令 · 与 Soft Pad 同一习惯':'键盘在 Soft Pad · 点键加口令');
    }
  }

  function ensureVoiceRow(m,padKey,phrase){
    if(!m||!padKey) return null;
    var slot=String(padKey.slotId||'');
    var existing=voiceForSlot(m,slot);
    if(existing){
      if(phrase!=null) existing.triggerBinding=phrase;
      existing.enabled=true;
      return existing;
    }
    if(!m.agentBindings) m.agentBindings=[];
    var row={
      triggerType:'voice',
      triggerBinding:phrase||'',
      slotId:slot,
      actionId:padKey.actionId||slot,
      enabled:true
    };
    m.agentBindings.push(row);
    return row;
  }

  function persist(source){
    if(global.OneToneConfigPersist&&global.OneToneConfigPersist.saveAsync){
      global.OneToneConfigPersist.saveAsync({source:source||'voice-bridge-softpad'});
    }else if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save){
      global.OneToneConfigPersist.save({source:source||'voice-bridge-softpad'});
    }
    try{
      var scene=global.OneToneKeysSceneActionsPanel;
      if(scene&&typeof scene.refresh==='function') scene.refresh();
      else if(scene&&typeof scene.render==='function') scene.render(currentMapping());
    }catch(_){}
  }

  function renderCap(m){
    var keys=padKeys(m);
    if(!keys.length) return;
    var padKey=keys.find(function(k){ return String(k.microKeyId||'')===pickMicroKeyId; })
      ||keys.find(function(k){ return String(k.slotId||'')===pickSlotId; })
      ||keys[0];
    pickSlotId=String(padKey.slotId||'');
    pickMicroKeyId=String(padKey.microKeyId||'');
    var row=voiceForSlot(m,pickSlotId);
    var phrase=row?String(row.triggerBinding||'').trim():'';
    var label=String(padKey.label||padKey.actionId||padKey.slotId||'键').trim();
    var title=$('voiceSpCapTitle');
    if(title) title.textContent=label;
    var when=$('voiceSpCapWhen');
    if(when) when.textContent=phrase
      ?('说出来 = 点左边的「'+label+'」')
      :('还没有口令 · 点大字给「'+label+'」加一句');
    var cap=$('voiceSpPhraseCap');
    if(cap){
      cap.textContent=phrase?('「'+phrase+'」'):'「加口令」';
      if(!cap._spPhraseBound){
        cap._spPhraseBound=true;
        function editSpPhrase(){
          var cur=currentMapping();
          var pk=padKeys(cur).find(function(k){ return String(k.slotId||'')===pickSlotId; });
          if(!pk) return;
          var curRow=voiceForSlot(cur,pickSlotId);
          var next=global.prompt('改成你想说的话',curRow?String(curRow.triggerBinding||''):'');
          if(next==null) return;
          next=String(next).trim();
          if(!next) return;
          ensureVoiceRow(cur,pk,next);
          persist('voice-bridge-softpad');
          render();
        }
        cap.addEventListener('click',editSpPhrase);
        var editLink=$('btnVoiceSpPhraseEdit');
        if(editLink&&!editLink._spPhraseBound){
          editLink._spPhraseBound=true;
          editLink.addEventListener('click',function(e){ e.preventDefault(); editSpPhrase(); });
        }
      }
    }
    var say=$('voiceSpSayable');
    if(say){
      var on=row?row.enabled!==false:false;
      say.classList.toggle('is-on',on);
      say.setAttribute('aria-checked',on?'true':'false');
      if(!say._spSayBound){
        say._spSayBound=true;
        say.addEventListener('click',function(){
          var cur=currentMapping();
          var pk=padKeys(cur).find(function(k){ return String(k.slotId||'')===pickSlotId; });
          var r=voiceForSlot(cur,pickSlotId);
          if(!r){
            if(!pk) return;
            r=ensureVoiceRow(cur,pk,String(pk.label||'口令'));
          }else{
            r.enabled=r.enabled===false;
          }
          persist('voice-bridge-softpad');
          render();
        });
      }
    }
  }

  function render(){
    var m=currentMapping();
    var PadUi=global.OneToneCodexMicroPadUi;
    /* Heal existing pad layout in-memory; do not seed a brand-new pad (Q43 未准备). */
    if(m&&m.codexMicroPad&&PadUi&&PadUi.ensurePad){
      try{ PadUi.ensurePad(m,{persist:false}); }catch(_e){}
    }
    var need=$('voiceSpNeedPrepare');
    var off=$('voiceSpBridgeOff');
    var on=$('voiceSpPrepared');
    var empty=!padReady(m);
    /* Framework = Soft Pad keys; voice phrases overlay. Don't blank the pad when phrases=0. */
    if(need) need.hidden=!empty;
    if(off) off.hidden=true;
    if(on) on.hidden=empty;
    setScope(m);
    if(empty) return;
    var host=$('voiceSpPreviewHost');
    if(host&&PadUi&&PadUi.renderSoftPadPreview){
      try{ PadUi.renderSoftPadPreview(host,m,{forceFull:true}); }catch(_e2){}
      applyVoiceOverlay(host,m);
      if(!host._spPickBound){
        host._spPickBound=true;
        host.addEventListener('click',function(e){
          var key=e.target.closest&&e.target.closest('.micro-hw__key[data-micro-key]');
          if(!key) return;
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
        });
      }
    }
    if(!pickSlotId){
      var linked=linkedPadVoice(m);
      if(linked[0]) pickSlotId=String(linked[0].slotId||linked[0].actionId||'');
      else if(padKeys(m)[0]) pickSlotId=String(padKeys(m)[0].slotId||'');
    }
    renderCap(m);
    var hear=$('voiceSpHearInput');
    var status=$('voiceSpHearStatus');
    var tryBtn=$('btnVoiceSpTry');
    function matchHeard(){
      var heard=String(hear&&hear.value||'').trim();
      if(!status) return;
      if(!heard){ status.textContent='点左边键，或在上边试说'; status.className='voice-bridge-result'; return; }
      var hit=linkedPadVoice(currentMapping()).find(function(b){
        return String(b.triggerBinding||'').trim()===heard;
      });
      if(hit){
        status.textContent='对了 · 匹配「'+hit.triggerBinding+'」';
        status.className='voice-bridge-result is-ok';
        pickSlotId=String(hit.slotId||hit.actionId||'');
        render();
      }else{
        status.textContent='没对上 · 试试大字那句';
        status.className='voice-bridge-result is-miss';
      }
    }
    if(hear&&!hear._spHearBound){
      hear._spHearBound=true;
      hear.addEventListener('input',matchHeard);
    }
    if(tryBtn&&!tryBtn._spTryBound){
      tryBtn._spTryBound=true;
      tryBtn.addEventListener('click',function(e){ e.preventDefault(); matchHeard(); });
    }
  }

  function applyVoiceOverlay(host,m){
    if(!host) return;
    host.querySelectorAll('.micro-hw__key[data-micro-key]').forEach(function(el){
      var mid=String(el.getAttribute('data-micro-key')||'');
      var pk=padKeys(m).find(function(k){ return String(k.microKeyId||'')===mid; });
      var voice=pk?voiceForSlot(m,pk.slotId):null;
      var focused=!!(pk&&String(pk.slotId||'')===pickSlotId);
      el.classList.toggle('is-focused',focused);
      el.classList.toggle('is-voice-off',!!(pk&&!voice));
      var chip=el.querySelector('.sp-voice-ph');
      if(voice&&String(voice.triggerBinding||'').trim()){
        if(!chip){
          chip=document.createElement('span');
          chip.className='sp-voice-ph';
          el.appendChild(chip);
        }
        chip.textContent='「'+String(voice.triggerBinding).trim()+'」';
      }else if(chip){
        chip.remove();
      }
    });
  }

  function addPhrase(){
    var m=currentMapping();
    if(!padReady(m)) return false;
    var pk=padKeys(m).find(function(k){ return String(k.slotId||'')===pickSlotId; })
      ||padKeys(m).find(function(k){ return !voiceForSlot(m,k.slotId); })
      ||padKeys(m)[0];
    if(!pk) return false;
    pickSlotId=String(pk.slotId||'');
    pickMicroKeyId=String(pk.microKeyId||'');
    var cur=voiceForSlot(m,pickSlotId);
    var next=global.prompt('给这颗键写一句口令',cur?String(cur.triggerBinding||''):(pk.label||''));
    if(next==null) return true;
    next=String(next).trim();
    if(!next) return true;
    ensureVoiceRow(m,pk,next);
    persist('voice-bridge-softpad');
    render();
    return true;
  }

  global.OneToneVoiceBridgeSoftPad={ render:render, addPhrase:addPhrase };
})((typeof window!=='undefined')?window:globalThis);
