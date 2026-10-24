(function(global){
  'use strict';

  var MODE_KEY='vp_habit_experience_mode';
  var INTRO_KEY='vp_habit_programmer_intro_seen';

  function storage(){
    try{ return global.localStorage||null; }catch(_){ return null; }
  }

  function getMode(){
    return 'locator';
  }

  function setMode(){
    var s=storage();
    try{ if(s) s.setItem(MODE_KEY,'locator'); }catch(_){}
    return 'locator';
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
