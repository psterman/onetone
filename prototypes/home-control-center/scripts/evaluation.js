(function (global) {
  const KEY = 'onetone-home-prototype-evaluation-v1';
  function createStore(storage) {
    let memory = {};
    function load() {
      try { memory = JSON.parse(storage.getItem(KEY) || '{}') || {}; } catch (_) {}
      return JSON.parse(JSON.stringify(memory));
    }
    function persist() { try { storage.setItem(KEY, JSON.stringify(memory)); } catch (_) {} }
    function saveVariant(id, value) { load(); memory[id] = value; persist(); return load(); }
    function summary() { return Object.entries(load()).map(([id, value]) => ({ id, ...value })); }
    load();
    return { load, saveVariant, summary };
  }
  global.HomePrototypeEvaluation = { createStore };
})(window);
