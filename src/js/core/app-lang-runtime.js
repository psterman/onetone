(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function hooks(){ return global.__vp_app_lang_runtime_hooks__ || {}; }

  function applyRuntimeTexts(d,skipRender){
    var setText=global.OneToneDom.setText;
    setText('logTitle',d.logTitle);
    setText('runtimeTitle',d.runtimeTitle);
    setText('actionLabel',d.actionLabel);
    setText('sendLabel',d.sendLabel);
    setText('btnListenToggle',hooks().runtimePaused()?hooks().t('listenResume'):hooks().t('listenPause'));
    setText('btnRefreshRuntime',hooks().t('refreshRuntime'));
    setText('btnRestartApp',hooks().t('restartApp'));
    setText('sourceTitle',d.sourceTitle);
    var noteTitle=$('noteTitle'); if(noteTitle) noteTitle.textContent=d.noteTitle;
    var noteText=$('noteText'); if(noteText) noteText.textContent=d.noteText;
    setText('btnClearAll',d.clearAll);
    setText('trashTitle',d.trashTitle);
    setText('trashEmpty',d.trashEmpty);
    setText('menuActTest',d.testShort);
    setText('btnTestModalOk',d.testModalOk);
    setText('menuActDup',d.duplicate);
    setText('menuActUp',d.moveUp);
    setText('menuActDown',d.moveDown);
    setText('menuActDel',d.delete);
    hooks().applyTheme();
    hooks().applyFontScale();
    if(hooks().mappingRecordMode()==='none') hooks().setRecording('none');
    if(!skipRender) hooks().render();
    try{ localStorage.setItem('vp_lang',hooks().getAppLang()); }catch(_){ }
  }

  global.OneToneAppLangRuntime={applyRuntimeTexts:applyRuntimeTexts};
})((typeof window!=='undefined')?window:globalThis);
