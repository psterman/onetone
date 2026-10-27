/**
 * Smoke: left-nav composer history (send journal) wiring.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const panel = fs.readFileSync('src/js/features/now/composer-history-panel.js', 'utf8');
const dock = fs.readFileSync('src/js/features/now/home-agent-v2-dock.js', 'utf8');
const prep = fs.readFileSync('src/js/features/now/home-prompt-prep.js', 'utf8');
const html = fs.readFileSync('src/index.html', 'utf8');
const drawer = fs.readFileSync('src/js/features/settings/settings-drawer.js', 'utf8');
const shell = fs.readFileSync('src/js/features/now/home-agent-v2.js', 'utf8');
const ia = fs.readFileSync('src/js/shared/shell-ia-convergence.js', 'utf8');
const wb = fs.readFileSync('src/js/features/home/home-workbench.js', 'utf8');
const css = fs.readFileSync('src/css/composer-history-panel.css', 'utf8');

assert.match(html, /id="wbNavComposerHistory"/);
assert.match(html, /data-wb-nav="composerHistory"/);
assert.match(html, /id="settingsPanelComposerHistory"/);
assert.match(html, /composer-history-panel\.css/);
assert.match(html, /composer-history-panel\.js/);
assert.match(ia, /composerHistory:\s*\{\s*panel:\s*'composerHistory'/);
assert.match(wb, /composerHistory:'composerHistory'/);
assert.match(drawer, /composerHistory:'settingsPanelComposerHistory'/);
assert.match(drawer, /panel==='composerHistory'/);
assert.match(drawer, /OneToneComposerHistoryPanel/);
assert.match(panel, /OneToneComposerHistoryPanel/);
assert.match(panel, /restoreComposerHistory|listComposerHistory/);
assert.match(panel, /data-composer-hist-act="restore"/);
assert.match(panel, /clearHandoffs/);
assert.match(dock, /listComposerHistory|restoreComposerHistory|removeComposerHistory/);
assert.match(prep, /archiveHandoff|removeHandoff|clearHandoffs/);
assert.doesNotMatch(shell, /histMenuOpen|data-ha2-hist|histMenuHtml/);
assert.match(css, /\.composer-hist-row|\.composer-hist-list/);

console.log('test-composer-history-panel: ok');
