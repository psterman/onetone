(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };

  var CAM_META={
    shakeHead:{title:'摇头取消',when:'听写或确认时想否定。',effect:'常绑：Esc / 语音取消 · 跟听写「不要了」同结果。',gest:'🙅',gestName:'摇头',phrase:'不要了',badge:'推荐'},
    deliberateBlink:{title:'故意眨眼',when:'想确认一步，或开/停听写。',effect:'刻意闭眼再睁 · 可绑激活听写。',gest:'👁',gestName:'长眨',phrase:'完了',badge:'推荐'},
    onAway:{title:'离席',when:'人离开座位，不想继续听。',effect:'常绑：暂停语音 / 隐私屏。',gest:'🚶',gestName:'人脸消失',phrase:'暂停',badge:'推荐'},
    onReturn:{title:'回席',when:'人回到画面，想继续。',effect:'常绑：恢复语音。',gest:'🙂',gestName:'人脸回来',phrase:'继续听',badge:'推荐'},
    openPalm:{title:'五指张开',when:'想暂停一下、等一等。',effect:'正对摄像头张开五指。',gest:'🖐',gestName:'五指',phrase:'等一下',badge:'实验'},
    okHand:{title:'OK 确认',when:'要肯定当前这一步。',effect:'不能单独发出去。',gest:'👌',gestName:'OK',phrase:'确认',badge:'实验'},
    fist:{title:'握拳取消',when:'用手势否定。',gest:'✊',gestName:'握拳',effect:'常绑取消。',phrase:'取消',badge:'实验'},
    wave:{title:'挥手',when:'招呼一下唤起或切换。',effect:'张开手掌左右摆。',gest:'👋',gestName:'挥手',phrase:'开始说话',badge:'实验'}
  };

  var CAM_GROUPS=[
    {id:'common',title:'常用',slots:['shakeHead','deliberateBlink','onAway','onReturn','okHand','openPalm']},
    {id:'presence',title:'人在不在',slots:['onAway','onReturn']},
    {id:'head',title:'头与脸',slots:['shakeHead','deliberateBlink']},
    {id:'hand',title:'手势',slots:['openPalm','okHand','fist','wave']},
    {id:'privacy',title:'隐私与防误触',slots:['onAway','okHand']}
  ];

  function currentMapping(){
    var hdr=global.OneToneVoicePageHeaderRender;
    if(hdr&&hdr.resolveScopeMapping) return hdr.resolveScopeMapping(null);
    var core=global.OneToneMappingCore;
    var st=global.OneToneState&&global.OneToneState.state?global.OneToneState.state:{};
    var id=String(st.selectedMappingId||(st.config&&st.config.activeSceneId)||'').trim();
    return id&&core&&core.byId?core.byId(id):null;
  }

  function presencePrefs(){
    var Cam=global.OneToneCameraPresenceActions;
    if(Cam&&Cam.prefs){
      try{ return Cam.prefs()||{}; }catch(_e){}
    }
    var st=global.OneToneState&&global.OneToneState.state;
    var cp=st&&st.config&&st.config.cameraPrefs?st.config.cameraPrefs:{};
    return cp.presenceActions||{};
  }

  function actionOn(pa,key){
    var v=pa&&pa[key];
    return !!(v&&String(v)!=='none');
  }

  function voiceByKey(m){
    var map={};
    ((m&&m.agentBindings)||[]).forEach(function(b){
      if(!b||b.triggerType!=='voice') return;
      var sid=String(b.slotId||'');
      if(sid.indexOf('semantic:camera:')!==0) return;
      var key=sid.replace(/^semantic:camera:/,'');
      if(String(b.triggerBinding||'').trim()) map[key]=b;
    });
    return map;
  }

  /* Always expose design catalog (mock Q43 empty only when channel missing entirely). */
  function listCameraRows(){
    var m=currentMapping();
    var pa=presencePrefs();
    var voices=voiceByKey(m);
    return Object.keys(CAM_META).map(function(key){
      var meta=CAM_META[key];
      var voice=voices[key];
      var on=actionOn(pa,key);
      return {
        bindKey:key,
        actionId:voice?(voice.actionId||key):key,
        slotId:'semantic:camera:'+key,
        phrase:voice?String(voice.triggerBinding||'').trim():'',
        enabled:voice?voice.enabled!==false:true,
        title:meta.title||key,
        when:meta.when||'',
        effect:meta.effect||'',
        gest:meta.gest||'📷',
        gestName:meta.gestName||key,
        suggest:meta.phrase||'',
        bound:on,
        badge:on?'已开':(meta.badge||'')
      };
    });
  }

  var pickId='';
  var catId='common';

  function persist(){
    if(global.OneToneConfigPersist&&global.OneToneConfigPersist.saveAsync){
      global.OneToneConfigPersist.saveAsync({source:'voice-bridge-camera'});
    }else if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save){
      global.OneToneConfigPersist.save({source:'voice-bridge-camera'});
    }
  }

  function ensureVoice(m,bindKey,phrase){
    if(!m) return null;
    var slot='semantic:camera:'+bindKey;
    var list=m.agentBindings||(m.agentBindings=[]);
    var ab=list.find(function(b){
      return b&&b.triggerType==='voice'&&String(b.slotId)===slot;
    });
    if(ab){
      ab.triggerBinding=phrase;
      ab.enabled=true;
      return ab;
    }
    ab={triggerType:'voice',triggerBinding:phrase,slotId:slot,actionId:bindKey,enabled:true};
    list.push(ab);
    return ab;
  }

  function rowsInCat(all){
    var g=CAM_GROUPS.find(function(x){ return x.id===catId; })||CAM_GROUPS[0];
    var set={};
    (g.slots||[]).forEach(function(s){ set[s]=true; });
    return all.filter(function(r){ return set[r.bindKey]; });
  }

  function render(){
    var all=listCameraRows();
    var rows=rowsInCat(all);
    var off=$('voiceCamBridgeOff');
    var on=$('voiceCamLinked');
    if(off) off.hidden=all.length>0;
    if(on) on.hidden=!all.length;
    var pill=$('voiceCamScopePill');
    var m=currentMapping();
    if(pill) pill.textContent=(m&&(m.name||m.appTargetId))?'视觉 · '+(m.name||m.appTargetId):'视觉';
    if(!all.length) return;

    var cats=$('voiceCamCats');
    if(cats){
      cats.innerHTML='';
      CAM_GROUPS.forEach(function(g){
        var b=document.createElement('button');
        b.type='button';
        b.className='voice-bridge-cat'+(g.id===catId?' is-on':'');
        b.textContent=g.title;
        b.setAttribute('role','tab');
        b.setAttribute('aria-selected',g.id===catId?'true':'false');
        b.addEventListener('click',function(){ catId=g.id; render(); });
        cats.appendChild(b);
      });
    }

    if(!rows.length){
      var g0=CAM_GROUPS[0];
      catId=g0.id;
      rows=rowsInCat(all);
    }
    if(!pickId||!rows.some(function(r){ return r.bindKey===pickId; })){
      pickId=rows[0]?rows[0].bindKey:(all[0]&&all[0].bindKey)||'';
    }

    var host=$('voiceCamCmdList');
    if(host){
      host.innerHTML='';
      rows.forEach(function(r){
        var btn=document.createElement('button');
        btn.type='button';
        btn.className='voice-bridge-cmd'+(r.bindKey===pickId?' is-on':'');
        btn.setAttribute('role','option');
        var badge=r.badge
          ?('<span class="badge '+(r.badge==='已开'?'is-on':(r.badge==='推荐'?'is-rec':'is-exp'))+'">'+r.badge+'</span>')
          :'';
        var km=r.phrase
          ?(r.gest+' '+r.gestName+' · 「'+r.phrase+'」')
          :(r.gest+' '+r.gestName+(r.suggest?(' · 建议「'+r.suggest+'」'):' · 还没口令'));
        btn.innerHTML='<span class="kn">'+r.title+badge+'</span><span class="km">'+km+'</span>';
        btn.addEventListener('click',function(){ pickId=r.bindKey; render(); });
        host.appendChild(btn);
      });
    }

    var row=all.find(function(r){ return r.bindKey===pickId; })||rows[0]||all[0];
    if(!row) return;
    var title=$('voiceCamCapTitle');
    if(title) title.textContent=row.title;
    var when=$('voiceCamCapWhen');
    if(when) when.textContent=row.when;
    var effect=$('voiceCamCapEffect');
    if(effect) effect.textContent=row.effect;
    var gestIcon=$('voiceCamGestIcon');
    if(gestIcon) gestIcon.textContent=row.gest;
    var gestName=$('voiceCamGestName');
    if(gestName) gestName.textContent=row.gestName+(row.badge?(' · '+row.badge):'');
    var cap=$('voiceCamPhraseCap');
    if(cap){
      cap.textContent=row.phrase?('「'+row.phrase+'」'):(row.suggest?('「'+row.suggest+'」'):'「加口令」');
      if(!cap._camPhraseBound){
        cap._camPhraseBound=true;
        function editCamPhrase(){
          var list=listCameraRows();
          var r=list.find(function(x){ return x.bindKey===pickId; })||list[0];
          if(!r) return;
          var next=global.prompt('改成你想说的话',String(r.phrase||r.suggest||''));
          if(next==null) return;
          next=String(next).trim();
          if(!next) return;
          ensureVoice(currentMapping(),r.bindKey,next);
          persist();
          render();
        }
        cap.addEventListener('click',editCamPhrase);
        var editLink=$('btnVoiceCamPhraseEdit');
        if(editLink&&!editLink._camPhraseBound){
          editLink._camPhraseBound=true;
          editLink.addEventListener('click',function(e){ e.preventDefault(); editCamPhrase(); });
        }
      }
    }
    var say=$('voiceCamSayable');
    if(say){
      say.classList.toggle('is-on',!!row.phrase&&row.enabled!==false);
      say.setAttribute('aria-checked',(!!row.phrase&&row.enabled!==false)?'true':'false');
      if(!say._camSayBound){
        say._camSayBound=true;
        say.addEventListener('click',function(){
          var cur=currentMapping();
          var ab=((cur&&cur.agentBindings)||[]).find(function(b){
            return b.triggerType==='voice'&&String(b.slotId)==='semantic:camera:'+pickId;
          });
          if(!ab){
            var list=listCameraRows();
            var r=list.find(function(x){ return x.bindKey===pickId; });
            var seed=(r&&(r.phrase||r.suggest))||'口令';
            var next=global.prompt('先写一句口令',seed);
            if(next==null||!String(next).trim()) return;
            ensureVoice(cur,pickId,String(next).trim());
          }else{
            ab.enabled=ab.enabled===false;
          }
          persist();
          render();
        });
      }
    }
    var hear=$('voiceCamHearInput');
    var status=$('voiceCamHearStatus');
    var tryBtn=$('btnVoiceCamTry');
    function matchHeard(){
      var heard=String(hear&&hear.value||'').trim();
      if(!status) return;
      if(!heard){ status.textContent='左边选动作，或在上边试说'; status.className='voice-bridge-result'; return; }
      var hit=listCameraRows().find(function(r){ return String(r.phrase||'').trim()===heard; });
      if(hit){
        status.textContent='对了 · 等于做了「'+hit.title+'」';
        status.className='voice-bridge-result is-ok';
        pickId=hit.bindKey;
        render();
      }else{
        status.textContent='没对上 · 试试大字那句';
        status.className='voice-bridge-result is-miss';
      }
    }
    if(hear&&!hear._camHearBound){
      hear._camHearBound=true;
      hear.addEventListener('input',matchHeard);
    }
    if(tryBtn&&!tryBtn._camTryBound){
      tryBtn._camTryBound=true;
      tryBtn.addEventListener('click',function(e){ e.preventDefault(); matchHeard(); });
    }
  }

  function addPhrase(){
    var list=listCameraRows();
    if(!list.length) return false;
    var r=list.find(function(x){ return x.bindKey===pickId; })||list.find(function(x){ return !x.phrase; })||list[0];
    if(!r) return false;
    pickId=r.bindKey;
    var next=global.prompt('给这个动作写一句口令',String(r.phrase||r.suggest||r.title||''));
    if(next==null) return true;
    next=String(next).trim();
    if(!next) return true;
    ensureVoice(currentMapping(),r.bindKey,next);
    persist();
    render();
    return true;
  }

  global.OneToneVoiceBridgeCamera={ render:render, listCameraVoice:listCameraRows, addPhrase:addPhrase };
})((typeof window!=='undefined')?window:globalThis);
