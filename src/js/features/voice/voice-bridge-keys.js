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

  function mappingId(){
    var m=currentMapping();
    return m&&m.id?String(m.id):'';
  }

  function padSlotSet(m){
    var set={};
    var keys=m&&m.codexMicroPad&&m.codexMicroPad.keys;
    if(!keys) return set;
    keys.forEach(function(k){
      if(k&&k.slotId) set[String(k.slotId)]=true;
    });
    return set;
  }

  function isSoftPadVoice(b,padSlots){
    var sid=String(b.slotId||'');
    if(sid.indexOf('semantic:softPad:')===0) return true;
    return !!(padSlots[sid]||padSlots[String(b.actionId||'')]);
  }

  function isCameraVoice(b){
    return String(b.slotId||'').indexOf('semantic:camera:')===0;
  }

  function pickCopy(actionId,name){
    var id=String(actionId||'');
    var nm=String(name||'');
    if(id==='app.open'||id.indexOf('app.open')===0){
      return {when:'人在其他软件里，要回到正用的应用继续干。',effect:'打开或切到该应用。'};
    }
    if(id==='app.shortcut'){
      return {when:'想用说话触发这个快捷键。',effect:'等于按下该组合键。'};
    }
    if(/continue/i.test(id)||/继续/.test(nm)){
      return {when:'AI 停住等你，或你要它接着干下一步。',effect:'告诉当前 AI：继续。'};
    }
    if(/newThread|new.?chat|新会话|新建/i.test(id+' '+nm)){
      return {when:'当前对话太乱，想重新开一局干净的。',effect:'新开一条对话。'};
    }
    if(/cancel|取消|Disarm/i.test(id+' '+nm)){
      return {when:'说到一半说错了，或这轮不想要了。',effect:'马上停掉，这轮内容不当真发出去。'};
    }
    if(/Arm|小助手/i.test(id+' '+nm)){
      return {when:'想打开小助手帮忙。',effect:'启动助手相关动作。'};
    }
    if(/pasteAndSend|粘贴发送/i.test(id+' '+nm)){
      return {when:'剪贴板内容要贴进去并发走。',effect:'粘贴并发送。'};
    }
    if(/send|发送|发出去|commit/i.test(id+' '+nm)){
      return {when:'输入框里写好了，要交给 AI。',effect:'在输入框里发送（一般是回车）。'};
    }
    return {when:'想用说话触发这件事。',effect:'执行「'+(nm||'该动作')+'」。'};
  }

  var FRIENDLY={
    'agent.continue':'让 AI 继续',
    'cursorBeginnerDisarm':'取消',
    'cursorBeginnerArm':'小助手',
    pasteAndSend:'粘贴发送',
    'app.shortcut':'快捷键',
    'app.open':'打开应用',
    'input.start':'开始语音打字',
    'input.cancel':'取消',
    'input.commit':'发出去',
    'input.send':'发出去'
  };

  function bindingTitle(b,chord){
    var custom=String(b.title||b.label||'').trim();
    if(custom) return custom;
    var aid=String(b.actionId||'').trim();
    if(aid==='app.shortcut'&&chord) return '快捷键 '+chord;
    if(FRIENDLY[aid]) return FRIENDLY[aid];
    return aid||String(b.slotId||'动作');
  }

  function rowIdentity(b){
    var inst=String(b.actionInstanceId||'').trim();
    var sid=String(b.slotId||'').trim();
    var aid=String(b.actionId||'').trim();
    if(inst) return aid+'#'+inst;
    if(sid) return sid;
    if(b.triggerType==='key') return aid+'|key|'+String(b.triggerBinding||'');
    return aid||'';
  }

  /* One row per key instance; voice attaches by slotId / actionInstanceId. */
  function listRows(phraseOnly){
    var m=currentMapping();
    if(!m) return [];
    var padSlots=padSlotSet(m);
    var byId={};
    var order=[];

    function ensureFromKey(b){
      if(isSoftPadVoice(b,padSlots)) return null;
      var id=rowIdentity(b);
      if(!id) return null;
      if(!byId[id]){
        var chord=String(b.triggerBinding||'').trim();
        var title=bindingTitle(b,chord);
        var copy=pickCopy(b.actionId||b.slotId,title);
        byId[id]={
          id:id,
          actionId:b.actionId||b.slotId,
          slotId:b.slotId||b.actionId,
          actionInstanceId:b.actionInstanceId||'',
          phrase:'',
          chord:chord,
          enabled:true,
          title:title,
          when:copy.when,
          effect:copy.effect
        };
        order.push(id);
      }
      return byId[id];
    }

    ((m.agentBindings)||[]).forEach(function(b){
      if(!b||b.triggerType!=='key') return;
      if(!String(b.triggerBinding||'').trim()) return;
      ensureFromKey(b);
    });

    ((m.agentBindings)||[]).forEach(function(b){
      if(!b||b.triggerType!=='voice') return;
      if(isCameraVoice(b)) return;
      if(isSoftPadVoice(b,padSlots)) return;
      var phrase=String(b.triggerBinding||b.phrase||'').trim();
      if(!phrase) return;
      var inst=String(b.actionInstanceId||'').trim();
      var sid=String(b.slotId||'').trim();
      var aid=String(b.actionId||'').trim();
      var hit=null;
      if(inst&&byId[aid+'#'+inst]) hit=byId[aid+'#'+inst];
      if(!hit&&sid&&byId[sid]) hit=byId[sid];
      if(!hit){
        hit=order.map(function(id){ return byId[id]; }).find(function(r){
          return String(r.actionId)===aid&&!r.phrase;
        })||null;
      }
      if(!hit){
        var id=rowIdentity(b)||('voice:'+aid+':'+phrase);
        var title=bindingTitle(b,'');
        var copy=pickCopy(aid,title);
        hit={
          id:id,
          actionId:aid||sid,
          slotId:sid||aid,
          actionInstanceId:inst,
          phrase:'',
          chord:'',
          enabled:true,
          title:title,
          when:copy.when,
          effect:copy.effect
        };
        byId[id]=hit;
        order.push(id);
      }
      hit.phrase=phrase;
      hit.enabled=b.enabled!==false;
      if(b.title||b.label) hit.title=bindingTitle(b,hit.chord);
      if(b.when) hit.when=b.when;
      if(b.effect) hit.effect=b.effect;
    });

    return order.map(function(id){ return byId[id]; }).filter(function(r){
      if(!r) return false;
      if(phraseOnly) return !!r.phrase;
      return !!(r.chord||r.phrase);
    });
  }

  var pickId='';

  function persist(){
    if(global.OneToneConfigPersist&&global.OneToneConfigPersist.saveAsync){
      global.OneToneConfigPersist.saveAsync({source:'voice-bridge-keys'});
    }else if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save){
      global.OneToneConfigPersist.save({source:'voice-bridge-keys'});
    }
  }

  function ensureVoiceBinding(m,row,phrase){
    if(!m||!row) return null;
    var list=m.agentBindings||(m.agentBindings=[]);
    var sid=String(row.slotId||row.actionId||'');
    var inst=String(row.actionInstanceId||'').trim();
    var ab=list.find(function(b){
      if(!b||b.triggerType!=='voice') return false;
      if(inst&&String(b.actionInstanceId||'')===inst) return true;
      return String(b.slotId||b.actionId)===sid;
    });
    if(ab){
      ab.triggerBinding=phrase;
      ab.enabled=true;
      if(inst) ab.actionInstanceId=inst;
      return ab;
    }
    ab={
      triggerType:'voice',
      triggerBinding:phrase,
      slotId:row.slotId||row.actionId,
      actionId:row.actionId||row.slotId,
      enabled:true
    };
    if(inst) ab.actionInstanceId=inst;
    list.push(ab);
    return ab;
  }

  function phraseOnlyOn(){
    var el=$('voiceKeysPhraseOnly');
    return !!(el&&el.checked);
  }

  function render(){
    var all=listRows(false);
    var rows=listRows(phraseOnlyOn());
    var off=$('voiceKeysBridgeOff');
    var on=$('voiceKeysLinked');
    if(off) off.hidden=all.length>0;
    if(on) on.hidden=!all.length;
    var pill=$('voiceKeysScopePill');
    var m=currentMapping();
    if(pill) pill.textContent=(m&&(m.name||m.appTargetId))||'—';
    if(!all.length) return;

    var filter=$('voiceKeysPhraseOnly');
    if(filter&&!filter._keysFilterBound){
      filter._keysFilterBound=true;
      filter.addEventListener('change',function(){ render(); });
    }

    if(!pickId||!rows.some(function(r){ return r.id===pickId; })){
      pickId=rows[0]?rows[0].id:(all[0]&&all[0].id)||'';
    }
    var host=$('voiceKeysCmdList');
    if(host){
      host.innerHTML='';
      if(!rows.length){
        host.innerHTML='<p class="voice-bridge-note" style="padding:8px">这一类还没有口令 · 取消勾选看全部键位，或点「加口令」</p>';
      }
      rows.forEach(function(r){
        var btn=document.createElement('button');
        btn.type='button';
        btn.className='voice-bridge-cmd'+(r.id===pickId?' is-on':'');
        btn.setAttribute('role','option');
        var km=r.phrase
          ?('说「'+r.phrase+'」'+(r.chord?(' · <span class="kb">'+r.chord+'</span>'):''))
          :(r.chord?('键 <span class="kb">'+r.chord+'</span> · 还没口令'):'还没口令');
        btn.innerHTML='<span class="kn">'+(r.title||r.actionId)+'</span><span class="km">'+km+'</span>';
        btn.addEventListener('click',function(){ pickId=r.id; render(); });
        host.appendChild(btn);
      });
    }
    var row=rows.find(function(r){ return r.id===pickId; })
      ||all.find(function(r){ return r.id===pickId; })
      ||rows[0]
      ||all[0];
    if(!row) return;
    pickId=row.id;
    var phrase=String(row.phrase||'').trim();
    var title=$('voiceKeysCapTitle');
    if(title) title.textContent=row.title||row.actionId;
    var when=$('voiceKeysCapWhen');
    if(when) when.textContent=row.when||'说出来 = 做这件事';
    var effect=$('voiceKeysCapEffect');
    if(effect) effect.textContent=row.effect||'';
    var chord=$('voiceKeysChord');
    var keyLine=$('voiceKeysKeyLine');
    if(chord) chord.textContent=row.chord||'—';
    if(keyLine) keyLine.hidden=!row.chord;
    var cap=$('voiceKeysPhraseCap');
    if(cap){
      cap.textContent=phrase?('「'+phrase+'」'):'「加口令」';
      if(!cap._keysPhraseBound){
        cap._keysPhraseBound=true;
        function editKeysPhrase(){
          var list=listRows(false);
          var r=list.find(function(x){ return x.id===pickId; })||list[0];
          if(!r) return;
          var next=global.prompt('改成你想说的话',String(r.phrase||''));
          if(next==null) return;
          next=String(next).trim();
          if(!next) return;
          var Adapters=global.OneToneActionBindingAdapters;
          var mid=mappingId();
          if(Adapters&&Adapters.voice&&Adapters.voice.upsert&&mid){
            Adapters.voice.upsert(mid,r.actionId||r.slotId,next,{
              bindingRef:r.slotId||r.actionId,
              actionInstanceId:r.actionInstanceId||''
            });
          }else{
            ensureVoiceBinding(currentMapping(),r,next);
            persist();
          }
          render();
        }
        cap.addEventListener('click',editKeysPhrase);
        var editLink=$('btnVoiceKeysPhraseEdit');
        if(editLink&&!editLink._keysPhraseBound){
          editLink._keysPhraseBound=true;
          editLink.addEventListener('click',function(e){ e.preventDefault(); editKeysPhrase(); });
        }
      }
    }
    var say=$('voiceKeysSayable');
    if(say){
      var enabled=!!phrase&&row.enabled!==false;
      say.classList.toggle('is-on',enabled);
      say.setAttribute('aria-checked',enabled?'true':'false');
      if(!say._keysSayBound){
        say._keysSayBound=true;
        say.addEventListener('click',function(){
          var cur=currentMapping();
          var list=listRows(false);
          var r=list.find(function(x){ return x.id===pickId; });
          if(!r) return;
          var ab=((cur&&cur.agentBindings)||[]).find(function(b){
            if(!b||b.triggerType!=='voice') return false;
            if(r.actionInstanceId&&String(b.actionInstanceId||'')===String(r.actionInstanceId)) return true;
            return String(b.slotId||b.actionId)===String(r.slotId||r.actionId);
          });
          if(!ab){
            var next=global.prompt('先写一句口令',r.title||'');
            if(next==null||!String(next).trim()) return;
            ensureVoiceBinding(cur,r,String(next).trim());
          }else{
            ab.enabled=ab.enabled===false;
          }
          persist();
          render();
        });
      }
    }
    var hear=$('voiceKeysHearInput');
    var status=$('voiceKeysHearStatus');
    var tryBtn=$('btnVoiceKeysTry');
    function matchHeard(){
      var heard=String(hear&&hear.value||'').trim();
      if(!status) return;
      if(!heard){ status.textContent='左边选一件事，或在上边试说'; status.className='voice-bridge-result'; return; }
      var hit=listRows(false).find(function(r){ return String(r.phrase||'').trim()===heard; });
      if(hit){
        status.textContent='对了 · 等于做了「'+(hit.title||hit.actionId)+'」';
        status.className='voice-bridge-result is-ok';
        pickId=hit.id;
        render();
      }else{
        status.textContent='没对上 · 试试大字那句';
        status.className='voice-bridge-result is-miss';
      }
    }
    if(hear&&!hear._keysHearBound){
      hear._keysHearBound=true;
      hear.addEventListener('input',matchHeard);
    }
    if(tryBtn&&!tryBtn._keysTryBound){
      tryBtn._keysTryBound=true;
      tryBtn.addEventListener('click',function(e){ e.preventDefault(); matchHeard(); });
    }
  }

  global.OneToneVoiceBridgeKeys={ render:render };
})((typeof window!=='undefined')?window:globalThis);
