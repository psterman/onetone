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
    renderChips:renderChips,
    readInput:readInput,
    clearInput:clearInput
  };
})((typeof window!=='undefined')?window:globalThis);
