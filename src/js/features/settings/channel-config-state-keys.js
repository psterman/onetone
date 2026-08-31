(function (global) {
  'use strict';

  var GENERATED_KEYS = global.__CHANNEL_CONFIG_GENERATED_KEYS__ || [];

  /** @type {Set<string>} */
  var CHANNEL_CONFIG_STATE_KEYS = new Set(GENERATED_KEYS);

  function assertKeyAllowed(key) {
    if (!key || !CHANNEL_CONFIG_STATE_KEYS.has(key)) {
      throw new Error('channel-config: state key not in whitelist: ' + key);
    }
  }

  global.OneToneChannelConfigStateKeys = {
    keys: CHANNEL_CONFIG_STATE_KEYS,
    assertKeyAllowed: assertKeyAllowed,
    isAllowed: function (key) { return CHANNEL_CONFIG_STATE_KEYS.has(key); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
