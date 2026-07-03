(function(global){
  'use strict';

  var conflictRows=[];

  function rows(){ return conflictRows; }

  function setConflictRows(rowsIn){
    conflictRows=Array.isArray(rowsIn)?rowsIn:[];
  }

  global.OneToneMappingConflictState={
    rows:rows,
    setConflictRows:setConflictRows
  };
})((typeof window!=='undefined')?window:globalThis);
