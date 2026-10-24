import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, '..', 'docs', 'prototypes', 'onetone-windows-home-landing.html');
const html = readFileSync(target, 'utf8');

const requiredStates = ['start', 'resume', 'running', 'attention', 'failed'];
for (const state of requiredStates) {
  assert.match(html, new RegExp(`\\b${state}\\b`), `missing ${state} home state`);
}

const requiredCommands = [
  'cmd_home_focus_snapshot',
  'cmd_agent_home_snapshot',
  'cmd_agent_center_snapshot',
  'cmd_agent_center_action',
  'cmd_window_minimize',
  'cmd_window_maximize',
  'cmd_window_close',
];
for (const command of requiredCommands) {
  assert.match(html, new RegExp(`['\"]${command}['\"]`), `missing real IPC command ${command}`);
}

const forbiddenPrototypeCommands = [
  'set_target',
  'dispatch_prompt',
  'resolve_approval',
  'request_permission',
  'toggle_capability',
  'window_control',
];
for (const command of forbiddenPrototypeCommands) {
  assert.doesNotMatch(html, new RegExp(`OneToneIPC\\.send\\(['\"]${command}['\"]`), `kept prototype-only IPC ${command}`);
}

assert.match(html, /<main\b[^>]*id="mainContent"/, 'missing semantic main content');
assert.match(html, /<label\b[^>]*for="homePrompt"/, 'prompt needs a visible label');
assert.match(html, /id="homePrompt"[^>]*name="prompt"/, 'prompt needs a stable form name');
assert.match(html, /id="homePrompt"[^>]*autocomplete="off"/, 'prompt must opt out of password-manager autocomplete');
assert.match(html, /id="primaryAction"/, 'home must reuse one primary action');
assert.match(html, /id="mobileNavToggle"[^>]*aria-expanded="false"/, 'narrow navigation needs an accessible toggle');
assert.match(html, /role="dialog"[^>]*aria-labelledby="detailDialogTitle"/, 'dialog needs an accessible name');
assert.match(html, /id="liveRegion"[^>]*aria-live="polite"/, 'async feedback needs a live region');
assert.match(html, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, 'reduced motion support is required');
assert.match(html, /@media\s*\(forced-colors:\s*active\)/, 'Windows high contrast support is required');
assert.doesNotMatch(html, /transition\s*:\s*all\b/, 'transition: all is forbidden');
assert.doesNotMatch(html, /role="application"/, 'do not force screen readers into application mode');
assert.doesNotMatch(html, /class="(?:[^"]*\s)?titlebar(?:\s[^"]*)?"/, 'prototype must not simulate a second titlebar');
assert.match(html, /data-capability="soft-pad"[^>]*hidden/, 'Soft Pad must be disclosed conditionally');
assert.match(html, /data-capability="camera"[^>]*hidden/, 'camera must be disclosed conditionally');

console.log('onetone windows home landing contract: ok');
