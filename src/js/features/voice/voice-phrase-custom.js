(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  function t(key){ return global.OneToneI18n.t(key); }

  function esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function presetPhrasesIn(rootSelector){
    var out=[];
    var root=document.querySelector(rootSelector);
    if(!root) return out;
    root.querySelectorAll('[data-phrase]').forEach(function(btn){
      var p=String(btn.getAttribute('data-phrase')||'').trim();
      if(p) out.push(p);
    });
    return out;
  }

  function selectedPhrasesIn(rootSelector){
    var out=[];
    var root=document.querySelector(rootSelector);
    if(!root) return out;
    root.querySelectorAll('[data-phrase].is-selected').forEach(function(btn){
      var p=String(btn.getAttribute('data-phrase')||'').trim();
      if(p) out.push(p);
    });
    return out;
  }

  function customPhrases(activePhrases,presetPhrases){
    var presetSet={};
    (presetPhrases||[]).forEach(function(p){ presetSet[p]=true; });
    var seen={};
    var out=[];
    (activePhrases||[]).forEach(function(raw){
      var p=String(raw||'').trim();
      if(!p||presetSet[p]||seen[p]) return;
      seen[p]=true;
      out.push(p);
    });
    return out;
  }

  function buildPhraseTagModel(catalog,active){
    var activeSet={};
    (active||[]).forEach(function(p){ activeSet[String(p||'').trim()]=true; });
    var seen={};
    var tags=[];
    (catalog||[]).forEach(function(raw){
      var p=String(raw||'').trim();
      if(!p||seen[p]) return;
      seen[p]=true;
      tags.push({phrase:p,active:!!activeSet[p]});
    });
    (active||[]).forEach(function(raw){
      var p=String(raw||'').trim();
      if(!p||seen[p]) return;
      seen[p]=true;
      tags.push({phrase:p,active:true});
    });
    return tags;
  }

  function renderPhraseTags(containerId,model){
    var el=$(containerId);
    if(!el) return;
    // P6 守卫：若容器被 React 语音配置岛接管（位于 .ot-island 内），legacy 不得覆盖其 DOM。
    if(window.OneToneIslands&&typeof window.OneToneIslands.isInsideIsland==='function'&&window.OneToneIslands.isInsideIsland(el)) return;
    if(!model||!model.length){
      el.innerHTML='<span class="voice-phrase-tags-empty">—</span>';
      return;
    }
    var html='';
    model.forEach(function(tag){
      html+='<span class="voice-phrase-tag'+(tag.active?' is-active':'')+'" data-phrase="'+esc(tag.phrase)+'">';
      html+='<button type="button" class="voice-phrase-tag-btn" data-phrase="'+esc(tag.phrase)+'">'+esc(tag.phrase)+'</button>';
      if(tag.active){
        html+='<button type="button" class="voice-phrase-tag-del" data-phrase="'+esc(tag.phrase)+'" aria-label="'+esc(t('delete'))+'">×</button>';
      }
      html+='</span>';
    });
    el.innerHTML=html;
  }

  function bindPhraseTags(containerId,handlers){
    handlers=handlers||{};
    var el=$(containerId);
    if(!el||el.dataset.phraseTagsBound==='1') return;
    el.dataset.phraseTagsBound='1';
    el.addEventListener('click',function(e){
      var delBtn=e.target.closest&&e.target.closest('.voice-phrase-tag-del');
      if(delBtn){
        e.preventDefault();
        e.stopPropagation();
        var delPhrase=delBtn.getAttribute('data-phrase')||'';
        if(delPhrase&&handlers.onRemove) handlers.onRemove(delPhrase);
        return;
      }
      var mainBtn=e.target.closest&&e.target.closest('.voice-phrase-tag-btn');
      if(!mainBtn) return;
      e.preventDefault();
      e.stopPropagation();
      var phrase=mainBtn.getAttribute('data-phrase')||'';
      var tag=mainBtn.closest('.voice-phrase-tag');
      var active=!!(tag&&tag.classList.contains('is-active'));
      if(phrase&&handlers.onToggle) handlers.onToggle(phrase,active);
    });
  }

  function renderChips(containerId,phrases,onRemove){
    var el=$(containerId);
    if(!el) return;
    if(!phrases.length){
      el.innerHTML='';
      el.hidden=true;
      return;
    }
    el.hidden=false;
    var html='';
    phrases.forEach(function(phrase){
      html+='<span class="voice-phrase-custom-chip">';
      html+='<span class="voice-phrase-custom-chip-text">'+esc(phrase)+'</span>';
      html+='<button type="button" class="voice-phrase-custom-chip-del" data-phrase="'+esc(phrase)+'" aria-label="'+esc(t('delete'))+'">×</button>';
      html+='</span>';
    });
    el.innerHTML=html;
    if(onRemove){
      el.querySelectorAll('.voice-phrase-custom-chip-del').forEach(function(btn){
        btn.addEventListener('click',function(e){
          e.preventDefault();
          e.stopPropagation();
          var p=btn.getAttribute('data-phrase')||'';
          if(p) onRemove(p);
        });
      });
    }
  }

  function readInput(inputId){
    var input=$(inputId);
    if(!input) return '';
    return String(input.value||'').trim();
  }

  function clearInput(inputId){
    var input=$(inputId);
    if(input) input.value='';
  }

  global.OneToneVoicePhraseCustom={
    presetPhrasesIn:presetPhrasesIn,
    selectedPhrasesIn:selectedPhrasesIn,
    customPhrases:customPhrases,
    buildPhraseTagModel:buildPhraseTagModel,
    renderPhraseTags:renderPhraseTags,
    bindPhraseTags:bindPhraseTags,
    renderChips:renderChips,
    readInput:readInput,
    clearInput:clearInput
  };
})((typeof window!=='undefined')?window:globalThis);
