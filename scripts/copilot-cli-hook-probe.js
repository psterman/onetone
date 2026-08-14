#!/usr/bin/env node
'use strict';

/**
 * Copilot CLI Hook probe — thin wrapper around agent-shell-hook-probe.
 * source: copilot_cli_hook → Soft Pad CopilotCli chip.
 * Fail-open, exit 0. Logs: logs/copilot_cli-hook-probe.jsonl
 */
var path = require('path');
var shared = require(path.join(__dirname, 'agent-shell-hook-probe.js'));

function main() {
  var args = process.argv.slice(2);
  var hasSource = args.some(function (a) {
    return a === '--source' || a.indexOf('--source=') === 0;
  });
  if (!hasSource) {
    process.argv.splice(2, 0, '--source', 'copilot_cli');
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

module.exports = { run: shared.run, buildPostBody: shared.buildPostBody };
