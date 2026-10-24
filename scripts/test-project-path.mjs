/**
 * Table-driven tests for OneToneProjectPath.normalizeAbsolutePath.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'src/js/core/project-path.js'), 'utf8');
const sandbox = { console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(src, sandbox);
const PP = sandbox.OneToneProjectPath;
assert.ok(PP && typeof PP.normalizeAbsolutePath === 'function');

const cases = [
  { name: 'windows drive backslash', in: 'C:\\repo', out: 'C:\\repo' },
  { name: 'windows drive slash', in: 'C:/repo', out: 'C:/repo' },
  { name: 'unc backslash', in: '\\\\server\\share\\proj', out: '\\\\server\\share\\proj' },
  { name: 'unc slash', in: '//server/share/proj', out: '//server/share/proj' },
  {
    name: 'extended drive',
    in: '\\\\?\\C:\\repo',
    out: 'C:\\repo'
  },
  {
    name: 'extended unc',
    in: '\\\\?\\UNC\\server\\share',
    out: '\\\\server\\share'
  },
  { name: 'posix absolute', in: '/workspace/repo', out: '/workspace/repo' },
  { name: 'display token', in: 'voice-pilot', out: null },
  { name: 'relative', in: 'foo/bar', out: null },
  { name: 'relative backslash', in: 'foo\\bar', out: null },
  { name: 'blank', in: '   ', out: null },
  { name: 'empty', in: '', out: null },
  { name: 'null', in: null, out: null },
  { name: 'trailing slash stripped', in: 'C:\\repo\\', out: 'C:\\repo' },
  {
    name: 'legacy bug: extended unc must not become UNC\\…',
    in: '\\\\?\\UNC\\server\\share\\x',
    out: '\\\\server\\share\\x'
  }
];

for (const c of cases) {
  const got = PP.normalizeAbsolutePath(c.in);
  assert.equal(got, c.out, c.name + ': expected ' + JSON.stringify(c.out) + ' got ' + JSON.stringify(got));
}

assert.equal(PP.pathsEqual('C:\\Repo', 'c:/repo'), true);
assert.equal(PP.pathsEqual('C:\\a', 'C:\\b'), false);
assert.equal(PP.pathsEqual('foo', 'C:\\foo'), false);
assert.equal(PP.pathLeaf('C:\\work\\voice-pilot'), 'voice-pilot');
assert.equal(PP.pathLeaf('voice-pilot'), '');

console.log('test-project-path: ok (' + cases.length + ' normalize cases)');
