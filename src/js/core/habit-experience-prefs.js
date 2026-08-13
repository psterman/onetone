(function(global){
  'use strict';

  var MODE_KEY='vp_habit_experience_mode';
  var INTRO_KEY='vp_habit_programmer_intro_seen';

  function storage(){
    try{ return global.localStorage||null; }catch(_){ return null; }
  }

  function getMode(){
    var s=storage();
    var value='';
    try{ value=s?String(s.getItem(MODE_KEY)||''):''; }catch(_){}
    if(value==='programmer') return 'programmer';
    if(value==='quick') return 'quick';
    if(value==='novice') return 'novice';
    if(!value) return 'novice';
    return 'quick';
  }

  function setMode(mode){
    var next=mode==='programmer'?'programmer':mode==='quick'?'quick':'novice';
    var s=storage();
    try{ if(s) s.setItem(MODE_KEY,next); }catch(_){}
    return next;
  }

  function hasSeenProgrammerIntro(){
    var s=storage();
    try{ return !!(s&&s.getItem(INTRO_KEY)==='1'); }catch(_){ return false; }
  }

  function markProgrammerIntroSeen(){
    var s=storage();
    try{ if(s) s.setItem(INTRO_KEY,'1'); }catch(_){}
    return true;
  }

  global.OneToneHabitExperiencePrefs={
    getMode:getMode,
    setMode:setMode,
    hasSeenProgrammerIntro:hasSeenProgrammerIntro,
    markProgrammerIntroSeen:markProgrammerIntroSeen,
    keys:{mode:MODE_KEY,programmerIntro:INTRO_KEY}
  };
})((typeof window!=='undefined')?window:globalThis);
