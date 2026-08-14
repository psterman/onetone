#!/usr/bin/env node
'use strict';

/**
 * Gemini CLI Hook probe — thin wrapper around agent-shell-hook-probe.
 * Normalizes BeforeTool/AfterTool/AfterAgent → Claude-like Soft Pad events.
 * source: gemini_hook. Fail-open, exit 0. Logs: logs/gemini-hook-probe.jsonl
 *
 * CLI path only. IDE mid-session: see docs/gemini-hook-onetone-setup.md
 * (实测 IDE 模式 hook 不触发时文档会写明).
 */
var path = require('path');
var shared = require(path.join(__dirname, 'agent-shell-hook-probe.js'));

function main() {
  var args = process.argv.slice(2);
  var hasSource = args.some(function (a) {
    return a === '--source' || a.indexOf('--source=') === 0;
  });
  if (!hasSource) {
    process.argv.splice(2, 0, '--source', 'gemini');
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
