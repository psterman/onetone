(function(global){
  'use strict';

  var editorTriggerKey='';
  var editorTargetKey='';
  var pendingNewDraftId=null;
  var expandedAdvIds=new Set();
  var triggerPeripheralGuardUntil=0;
  var localCaptureGuardUntil=0;

  function getEditorTriggerKey(){ return editorTriggerKey; }
  function setEditorTriggerKey(v){ editorTriggerKey=String(v||''); }
  function getEditorTargetKey(){ return editorTargetKey; }
  function setEditorTargetKey(v){ editorTargetKey=String(v||''); }
  function getPendingNewDraftId(){ return pendingNewDraftId; }
  function setPendingNewDraftId(v){ pendingNewDraftId=v||null; }

  function syncFromMapping(m){
    if(!m){
      setEditorTriggerKey('');
      setEditorTargetKey('');
      return;
    }
    setEditorTriggerKey(m.triggerKey||'');
    setEditorTargetKey(m.targetKey||'');
  }

  function armTriggerPeripheralGuard(ms){
    triggerPeripheralGuardUntil=Date.now()+(ms||0);
  }

  function triggerPeripheralGuardUntilFn(){
    return triggerPeripheralGuardUntil;
  }

  function armLocalCaptureGuard(){
    localCaptureGuardUntil=Date.now()+1500;
  }

  function localCaptureGuardUntilFn(){
    return localCaptureGuardUntil;
  }

  global.OneToneMappingEditorState={
    getEditorTriggerKey:getEditorTriggerKey,
    setEditorTriggerKey:setEditorTriggerKey,
    getEditorTargetKey:getEditorTargetKey,
    setEditorTargetKey:setEditorTargetKey,
    getPendingNewDraftId:getPendingNewDraftId,
    setPendingNewDraftId:setPendingNewDraftId,
    expandedAdvIds:expandedAdvIds,
    syncFromMapping:syncFromMapping,
    armTriggerPeripheralGuard:armTriggerPeripheralGuard,
    triggerPeripheralGuardUntil:triggerPeripheralGuardUntilFn,
    armLocalCaptureGuard:armLocalCaptureGuard,
    localCaptureGuardUntil:localCaptureGuardUntilFn
  };
})((typeof window!=='undefined')?window:globalThis);
