#!/usr/bin/env node
'use strict';

/**
 * Roo file-hook probe � thin wrapper around agent-shell-hook-probe.
 * Normalizes TaskComplete/TaskCancel/TaskError ? Claude-like Soft Pad events.
 * source: roo_hook. Fail-open, exit 0. Logs: logs/roo-hook-probe.jsonl
 */
var path = require('path');
var shared = require(path.join(__dirname, 'agent-shell-hook-probe.js'));

function main() {
  var args = process.argv.slice(2);
  var hasSource = args.some(function (a) {
    return a === '--source' || a.indexOf('--source=') === 0;
  });
  if (!hasSource) {
    process.argv.splice(2, 0, '--source', 'roo');
  }
  shared
    .run({})
    .catch(function () {})
    .finally(function () {
      process.exit(0);
    });
}

if (require.main === module) {
  main();
}

module.exports = {
  run: shared.run,
  normalizeEvent: shared.normalizeEvent,
  buildPostBody: shared.buildPostBody
};
