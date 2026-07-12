(function(global){
  'use strict';

  function letterKeys(){
    var out=[];
    for(var i=0;i<26;i++) out.push(String.fromCharCode(65+i));
    return out;
  }

  function digitKeys(){
    var out=[];
    for(var i=0;i<=9;i++) out.push(String(i));
    return out;
  }

  function functionKeys(){
    var out=[];
    for(var i=1;i<=12;i++) out.push('F'+i);
    return out;
  }

  var CATALOG={
    combos:[
      {key:'RAlt'},
      {key:'LAlt'},
      {key:'Ctrl+Space'},
      {key:'Ctrl+Shift+Win'},
      {key:'F2'}
    ],
    modifiers:[
      {key:'LAlt'},{key:'RAlt'},
      {key:'LCtrl'},{key:'RCtrl'},
      {key:'LShift'},{key:'RShift'},
      {key:'LWin'},{key:'RWin'}
    ],
    digits:digitKeys().map(function(k){ return {key:k}; }),
    letters:letterKeys().map(function(k){ return {key:k}; }),
    function:functionKeys().map(function(k){ return {key:k}; }),
    punctuation:[
      {key:'-'},{key:'='},{key:'['},{key:']'},{key:'\\'},
      {key:';'},{key:"'"},{key:','},{key:'.'},{key:'/'}
    ],
    system:[
      {key:'Space'},{key:'Tab'},{key:'Enter'},{key:'Esc'},{key:'Backspace'},
      {key:'Up'},{key:'Down'},{key:'Left'},{key:'Right'},
      {key:'Home'},{key:'End'},{key:'PageUp'},{key:'PageDown'},
      {key:'Insert'},{key:'Delete'},
      {key:'Volume_Down'},{key:'Volume_Up'},{key:'Volume_Mute'},
      {key:'Media_Next'},{key:'Media_Prev'},{key:'Media_Play_Pause'},{key:'Media_Stop'},
      {key:'Browser_Back'},{key:'Browser_Forward'},{key:'Browser_Refresh'},
      {key:'Launch_Mail'},
      {key:'PrintScreen'},{key:'Pause'},{key:'CapsLock'},{key:'AppsKey'}
    ]
  };

  var TAB_ORDER=['modifiers','digits','letters','function','punctuation','system'];

  function tabLabelKey(id){
    return 'targetKeyPickerTab'+id.charAt(0).toUpperCase()+id.slice(1);
  }

  function allEntries(){
    var out=[];
    CATALOG.combos.forEach(function(e){ out.push(e); });
    TAB_ORDER.forEach(function(cat){
      (CATALOG[cat]||[]).forEach(function(e){ out.push(e); });
    });
    return out;
  }

  global.OneToneTargetKeyCatalog={
    catalog:CATALOG,
    tabOrder:TAB_ORDER,
    tabLabelKey:tabLabelKey,
    allEntries:allEntries
  };
})((typeof window!=='undefined')?window:globalThis);
