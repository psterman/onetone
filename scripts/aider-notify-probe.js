#!/usr/bin/env node
'use strict';

/**
 * Aider notifications-command probe — done-only Soft Pad light.
 * Always POST Stop (ignore stdin/argv text — no prompt leak).
 * source: aider_hook. Fail-open, exit 0. Logs: logs/aider-hook-probe.jsonl
 */
var path = require('path');
var shared = require(path.join(__dirname, 'agent-shell-hook-probe.js'));

async function run(opts) {
  opts = opts || {};
  if (!opts.source) opts.source = 'aider';
  var result = await shared.run(opts);
  if (result && result.fields) {
    result.fields.hook_event_name = 'Stop';
  }
  if (result && result.body) {
    result.body.event = 'Stop';
  }
  return result;
}

function main() {
  var args = process.argv.slice(2);
  var hasSource = args.some(function (a) {
    return a === '--source' || a.indexOf('--source=') === 0;
  });
  if (!hasSource) {
    process.argv.splice(2, 0, '--source', 'aider');
  }
  run({})
    .catch(function () {})
    .finally(function () {
      process.exit(0);
    });
}

if (require.main === module) {
  main();
}

module.exports = { run: run, buildPostBody: shared.buildPostBody };
