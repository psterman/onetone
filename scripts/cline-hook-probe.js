#!/usr/bin/env node
'use strict';

/**
 * Cline file-hook probe — thin wrapper around agent-shell-hook-probe.
 * Normalizes TaskComplete/TaskCancel/TaskError → Claude-like Soft Pad events.
 * source: cline_hook. Fail-open, exit 0. Logs: logs/cline-hook-probe.jsonl
 */
var path = require('path');
var shared = require(path.join(__dirname, 'agent-shell-hook-probe.js'));

function main() {
  var args = process.argv.slice(2);
  var hasSource = args.some(function (a) {
    return a === '--source' || a.indexOf('--source=') === 0;
  });
  if (!hasSource) {
    process.argv.splice(2, 0, '--source', 'cline');
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
