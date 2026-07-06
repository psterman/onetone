(function(global){
  'use strict';

  var editorTriggerKey='';
  var editorTargetKey='';
  var editorAppTargetId='';
  var editorActiveAppContextId='';
  var keysExpandedAppId='';
  var pendingNewDraftId=null;
  var expandedAdvIds=new Set();
  var triggerPeripheralGuardUntil=0;
  var localCaptureGuardUntil=0;

  function getEditorTriggerKey(){ return editorTriggerKey; }
  function setEditorTriggerKey(v){ editorTriggerKey=String(v||''); }
  function getEditorTargetKey(){ return editorTargetKey; }
  function setEditorTargetKey(v){ editorTargetKey=String(v||''); }
  function getEditorAppTargetId(){ return editorAppTargetId; }
  function setEditorAppTargetId(v){ editorAppTargetId=String(v||''); }
  function getEditorActiveAppContextId(){ return editorActiveAppContextId; }
  function setEditorActiveAppContextId(v){ editorActiveAppContextId=String(v||''); }
  function getKeysExpandedAppId(){ return keysExpandedAppId; }
  function setKeysExpandedAppId(v){ keysExpandedAppId=String(v||''); }
  function getPendingNewDraftId(){ return pendingNewDraftId; }
  function setPendingNewDraftId(v){ pendingNewDraftId=v||null; }

  function syncFromMapping(m){
    if(!m){
      setEditorTriggerKey('');
      setEditorTargetKey('');
      setEditorAppTargetId('');
      setEditorActiveAppContextId('');
      setKeysExpandedAppId('');
      return;
    }
    setEditorTriggerKey(m.triggerKey||'');
    setEditorTargetKey(m.targetKey||'');
    var appId=String(m.appTargetId||'').trim();
    setEditorAppTargetId(appId);
    setEditorActiveAppContextId('');
    setKeysExpandedAppId(appId);
    if(global.OneToneAppBehaviorRules){
      if(global.OneToneAppBehaviorRules.setKeysExpandedAppId) global.OneToneAppBehaviorRules.setKeysExpandedAppId(appId);
      if(global.OneToneAppBehaviorRules.setActiveAppContextId) global.OneToneAppBehaviorRules.setActiveAppContextId('');
    }
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
    getEditorAppTargetId:getEditorAppTargetId,
    setEditorAppTargetId:setEditorAppTargetId,
    getEditorActiveAppContextId:getEditorActiveAppContextId,
    setEditorActiveAppContextId:setEditorActiveAppContextId,
    getKeysExpandedAppId:getKeysExpandedAppId,
    setKeysExpandedAppId:setKeysExpandedAppId,
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
