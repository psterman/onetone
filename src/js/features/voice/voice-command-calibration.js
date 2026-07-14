// @legacy-unused — scenario ASR voiceCommands migrated to acousticVoiceCommands; not loaded in index.html
(function(global){
  'use strict';

  var MAX_SAMPLES=3;
  var MAX_ALIASES=3;
  var MIN_CHARS=2;
  var MAX_CHARS=24;
  var AGREE_GOOD=0.88;
  var AGREE_OK=0.72;
  var CONFLICT_SIM=0.82;

  function normalizeTranscript(text){
    return String(text||'')
      .toLowerCase()
      .replace(/[^\u4e00-\u9fffａ-ｚＡ-Ｚa-z0-9\s]/g,'')
      .replace(/[\s\u3000]+/g,'')
      .trim();
  }

  function tokens(text){
    var n=normalizeTranscript(text);
    if(!n) return [];
    // CJK: unigrams; Latin: keep contiguous runs
    if(/[\u4e00-\u9fff]/.test(n)) return n.split('');
    return n.match(/[a-z0-9]+/g)||[];
  }

  function editDistance(a,b){
    a=normalizeTranscript(a);
    b=normalizeTranscript(b);
    if(a===b) return 0;
    var m=a.length,n=b.length;
    if(!m) return n;
    if(!n) return m;
    var prev=new Array(n+1);
    var cur=new Array(n+1);
    var i,j;
    for(j=0;j<=n;j++) prev[j]=j;
    for(i=1;i<=m;i++){
      cur[0]=i;
      for(j=1;j<=n;j++){
        var cost=a.charAt(i-1)===b.charAt(j-1)?0:1;
        cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+cost);
      }
      var tmp=prev; prev=cur; cur=tmp;
    }
    return prev[n];
  }

  function phraseSimilarity(a,b){
    var na=normalizeTranscript(a);
    var nb=normalizeTranscript(b);
    if(!na||!nb) return 0;
    if(na===nb) return 1;
    if(na.indexOf(nb)>=0||nb.indexOf(na)>=0){
      var shorter=Math.min(na.length,nb.length);
      var longer=Math.max(na.length,nb.length);
      return 0.7+0.3*(shorter/longer);
    }
    var dist=editDistance(na,nb);
    var maxLen=Math.max(na.length,nb.length)||1;
    var editSim=1-(dist/maxLen);
    var ta=tokens(na),tb=tokens(nb);
    var setB={};
    tb.forEach(function(t){ setB[t]=true; });
    var inter=0;
    ta.forEach(function(t){ if(setB[t]) inter++; });
    var union=ta.length+tb.length-inter;
    var jaccard=union?inter/union:0;
    return Math.max(0,Math.min(1,0.55*editSim+0.45*jaccard));
  }

  /** Pluggable phonetic similarity; MVP falls back to text similarity. */
  function phoneticSimilarity(a,b,phoneticFn){
    if(typeof phoneticFn==='function'){
      try{
        var pa=phoneticFn(a);
        var pb=phoneticFn(b);
        if(pa&&pb) return phraseSimilarity(pa,pb);
      }catch(_){}
    }
    return phraseSimilarity(a,b);
  }

  function simplePhoneticKey(text){
    return normalizeTranscript(text);
  }

  function scoreSamples(samples){
    samples=(Array.isArray(samples)?samples:[]).filter(function(s){
      return s&&String(s.transcript||'').trim();
    }).slice(0,MAX_SAMPLES);
    if(!samples.length){
      return {agreement:0,quality:'weak',qualitySignals:{hasFinalText:false,micTooLow:false,textLengthOk:false,sampleAgreement:0}};
    }
    var pairs=0,sum=0;
    var i,j;
    for(i=0;i<samples.length;i++){
      for(j=i+1;j<samples.length;j++){
        sum+=phraseSimilarity(samples[i].transcript,samples[j].transcript);
        pairs++;
      }
    }
    var agreement=pairs?sum/pairs:1;
    var micTooLow=samples.some(function(s){ return s.qualitySignals&&s.qualitySignals.micTooLow; });
    var textLengthOk=samples.every(function(s){
      var len=normalizeTranscript(s.transcript).length;
      return len>=MIN_CHARS&&len<=MAX_CHARS;
    });
    var hasFinalText=samples.every(function(s){ return !!normalizeTranscript(s.transcript); });
    var quality='weak';
    if(hasFinalText&&textLengthOk&&!micTooLow&&agreement>=AGREE_GOOD&&samples.length>=2) quality='good';
    else if(hasFinalText&&textLengthOk&&agreement>=AGREE_OK&&samples.length>=2) quality='ok';
    return {
      agreement:agreement,
      quality:quality,
      qualitySignals:{
        hasFinalText:hasFinalText,
        micTooLow:micTooLow,
        textLengthOk:textLengthOk,
        sampleAgreement:agreement
      }
    };
  }

  function recommendThreshold(quality){
    return quality==='ok'?0.86:0.80;
  }

  function recommendMargin(quality){
    return quality==='ok'?0.10:0.06;
  }

  function commandDisplayName(cmd,cfg){
    if(!cmd) return '';
    var sid=String(cmd.scenarioId||'').trim();
    if(cfg&&Array.isArray(cfg.mappings)){
      var m=cfg.mappings.find(function(x){ return x&&x.id===sid; });
      if(m){
        var name=String(m.group||m.label||'').trim();
        if(name) return name;
      }
    }
    return String(cmd.canonicalPhrase||'').trim()||sid;
  }

  function detectCommandConflict(command,allCommands,options){
    options=options||{};
    var currentScenarioId=String(options.currentScenarioId||'').trim();
    var currentCommandId=String(options.currentCommandId||'').trim();
    var phrase=command&&(command.canonicalPhrase||command.transcript)||'';
    var best=null;
    (Array.isArray(allCommands)?allCommands:[]).forEach(function(other){
      if(!other||other.enabled===false) return;
      if(currentCommandId&&String(other.id||'')===currentCommandId) return;
      if(currentScenarioId&&String(other.scenarioId||'')===currentScenarioId) return;
      var candidates=[other.canonicalPhrase].concat(Array.isArray(other.aliases)?other.aliases:[]);
      candidates.forEach(function(c){
        if(!c) return;
        var sim=Math.max(phraseSimilarity(phrase,c),phoneticSimilarity(phrase,c));
        if(sim>=CONFLICT_SIM&&(!best||sim>best.similarity)){
          best={command:other,phrase:c,similarity:sim,name:commandDisplayName(other,options.config)};
        }
      });
    });
    return best;
  }

  function pickCanonical(samples){
    // Prefer last user-confirmed sample (caller should order confirmed samples).
    var list=(Array.isArray(samples)?samples:[]).filter(function(s){
      return s&&normalizeTranscript(s.transcript);
    });
    if(!list.length) return '';
    return String(list[list.length-1].transcript||'').trim();
  }

  function buildAliases(canonical,samples){
    var seen={};
    var out=[];
    var nCanon=normalizeTranscript(canonical);
    seen[nCanon]=true;
    (Array.isArray(samples)?samples:[]).forEach(function(s){
      var t=String(s&&s.transcript||'').trim();
      var n=normalizeTranscript(t);
      if(!n||seen[n]) return;
      if(phraseSimilarity(canonical,t)<0.55) return;
      seen[n]=true;
      out.push(t);
    });
    return out.slice(0,MAX_ALIASES);
  }

  function validateSampleBasics(samples){
    if(!Array.isArray(samples)||!samples.length){
      return {ok:false,reason:'empty',messageKey:'habitVoiceCmdEmpty'};
    }
    var last=samples[samples.length-1];
    var text=normalizeTranscript(last&&last.transcript);
    if(!text){
      return {ok:false,reason:'empty',messageKey:'habitVoiceCmdEmpty'};
    }
    if(text.length<MIN_CHARS){
      return {ok:false,reason:'tooShort',messageKey:'habitVoiceCmdTooShort'};
    }
    if(text.length>MAX_CHARS){
      return {ok:false,reason:'tooLong',messageKey:'habitVoiceCmdTooLong'};
    }
    if(last.qualitySignals&&last.qualitySignals.micTooLow){
      return {ok:false,reason:'micTooLow',messageKey:'habitVoiceCmdMicTooLow'};
    }
    return {ok:true};
  }

  function buildCommandFromSamples(samples,existingCommands,options){
    options=options||{};
    samples=(Array.isArray(samples)?samples:[]).slice(0,MAX_SAMPLES);
    var basic=validateSampleBasics(samples);
    if(!basic.ok) return basic;

    if(samples.length<2){
      return {ok:false,reason:'needMore',messageKey:'habitVoiceCmdNeedMore'};
    }

    var scored=scoreSamples(samples);
    if(scored.quality==='weak'){
      if(samples.length<MAX_SAMPLES){
        return {ok:false,reason:'unstable',messageKey:'habitVoiceCmdUnstable'};
      }
      return {ok:false,reason:'weak',messageKey:'habitVoiceCmdTryClearer'};
    }

    var canonical=pickCanonical(samples);
    var draft={
      canonicalPhrase:canonical,
      aliases:buildAliases(canonical,samples),
      scenarioId:String(options.scenarioId||'').trim()
    };
    var conflict=detectCommandConflict(draft,existingCommands,{
      currentScenarioId:options.currentScenarioId||options.scenarioId,
      currentCommandId:options.currentCommandId,
      config:options.config
    });
    if(conflict){
      return {
        ok:false,
        reason:'conflict',
        messageKey:'habitVoiceCmdConflict',
        meta:{name:conflict.name||conflict.phrase}
      };
    }

    var quality=scored.quality;
    var now=Date.now();
    var newId=typeof options.newId==='function'?options.newId():('cmd_'+now+'_'+Math.floor(Math.random()*100000));
    var locale=String(options.locale||'zh-CN').trim()||'zh-CN';
    var command={
      id:String(options.currentCommandId||newId),
      version:1,
      kind:'scenario-activate',
      engineHint:'asr-text',
      locale:locale,
      scenarioId:String(options.scenarioId||'').trim(),
      canonicalPhrase:canonical,
      aliases:buildAliases(canonical,samples),
      samples:samples.slice(0,MAX_SAMPLES).map(function(s){
        return {
          transcript:String(s.transcript||'').trim(),
          confidence:(s.confidence==null||!isFinite(Number(s.confidence)))?null:Number(s.confidence),
          source:String(s.source||'vosk'),
          qualitySignals:s.qualitySignals||scored.qualitySignals,
          createdAt:Number(s.createdAt)||now
        };
      }),
      phoneticKey:simplePhoneticKey(canonical),
      threshold:recommendThreshold(quality),
      margin:recommendMargin(quality),
      quality:quality,
      activationScope:options.activationScope==='foreground-app'?'foreground-app':'global',
      appBoost:options.appBoost!==false,
      enabled:true,
      createdAt:Number(options.createdAt)||now,
      updatedAt:now
    };

    var warnings=[];
    if(quality==='ok') warnings.push('habitVoiceCmdSuggestMoreSpecific');
    return {ok:true,command:command,warnings:warnings};
  }

  global.OneToneVoiceCommandCalibration={
    normalizeTranscript:normalizeTranscript,
    phraseSimilarity:phraseSimilarity,
    phoneticSimilarity:phoneticSimilarity,
    scoreSamples:scoreSamples,
    detectCommandConflict:detectCommandConflict,
    recommendThreshold:recommendThreshold,
    recommendMargin:recommendMargin,
    buildCommandFromSamples:buildCommandFromSamples,
    simplePhoneticKey:simplePhoneticKey,
    MAX_SAMPLES:MAX_SAMPLES,
    MAX_ALIASES:MAX_ALIASES
  };
})((typeof window!=='undefined')?window:globalThis);
