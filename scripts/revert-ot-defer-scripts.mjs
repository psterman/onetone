/**
 * Undo data-ot-defer markers in src/index.html (restore sync script tags).
 * Run: node scripts/revert-ot-defer-scripts.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const htmlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
const before = (html.match(/data-ot-defer=/g) || []).length;
html = html.replace(
  /<script type="text\/plain" data-ot-defer="[^"]+" src="([^"]+)"><\/script>/g,
  '<script src="$1"></script>'
);
const after = (html.match(/data-ot-defer=/g) || []).length;
fs.writeFileSync(htmlPath, html);
console.log('deferred before', before, 'after', after);
