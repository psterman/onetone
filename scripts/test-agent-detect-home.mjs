import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'prototypes', 'agent-detect-home');

for (const name of [
  'index.html',
  'styles.css',
  'fixtures.js',
  'board-dto.js',
  'data-board.js',
  'app.js',
  'README.md'
]) {
  assert.ok(fs.existsSync(path.join(dir, name)), `missing ${name}`);
}

const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
assert.match(html, /board-dto\.js/);
assert.match(html, /data-board\.js/);
assert.match(html, /Agent 检测首页/);
assert.doesNotMatch(html, /Lorem ipsum/);

function loadScripts() {
  const sandbox = {
    window: {},
    globalThis: {},
    module: { exports: {} },
    exports: {}
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  const fixturesSrc = fs.readFileSync(path.join(dir, 'fixtures.js'), 'utf8');
  const dtoSrc = fs.readFileSync(path.join(dir, 'board-dto.js'), 'utf8');
  vm.runInNewContext(fixturesSrc, sandbox);
  vm.runInNewContext(dtoSrc, sandbox);
  return {
    F: sandbox.AgentDetectFixtures || sandbox.window.AgentDetectFixtures,
    Dto: sandbox.AgentBoardDto || sandbox.window.AgentBoardDto || sandbox.module.exports
  };
}

const { F, Dto } = loadScripts();
assert.ok(F, 'fixtures missing');
assert.ok(Dto && Dto.projectBoardDto, 'board dto missing');

const mixed = F.getSnapshot('mixed');
assert.equal(mixed.agents.length, 8);
assert.ok(mixed.agents.every((a) => a.usage && !('stats' in a)));
assert.equal(mixed.agents.find((a) => a.kind === 'cursor').usage.localTodayRequests, 86);

const dto = Dto.projectBoardDto(mixed, { focusId: 'cursor' });
assert.equal(dto.focusId, 'cursor');
const cursor = dto.agents.find((a) => a.id === 'cursor');
assert.ok(cursor);
assert.equal(cursor.eff, 50.6);
assert.equal(cursor.turns, 86);
assert.ok(cursor.activeMin > 0);

const claude = dto.agents.find((a) => a.id === 'claude');
assert.equal(claude.costBasis, 'estimate');
assert.equal(claude.usdBooked, null);
assert.equal(claude.usd, 1.2);

const qoder = dto.agents.find((a) => a.id === 'qoder');
assert.equal(qoder.costBasis, 'official');
assert.equal(qoder.usdBooked, 0.85);

const booked = Dto.ledgerBookedSum(dto.agents);
assert.equal(booked, 0.85);
assert.equal(Dto.ledgerBookedSum([claude]), null);

const cost = Dto.projectCost({
  estimatedCostUsd: 2,
  costIsEstimate: true
});
assert.equal(cost.costBasis, 'estimate');
assert.equal(cost.usdBooked, null);

const official = Dto.projectCost({ totalCostUsd: 3.5 });
assert.equal(official.usdBooked, 3.5);

assert.equal(Dto.canonicalId('trae_code'), 'traeCode');
assert.equal(Dto.canonicalId('TraeCode'), 'traeCode');

const filtered = Dto.filterAgents(dto.agents, 'activity');
assert.ok(filtered.every((a) => a.group === 'active'));

const app = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
assert.match(app, /mountDataBoard|dataBoardHost|AgentDataBoard/);
assert.match(app, /open-data-deep[\s\S]*setLayout\('ledger'\)|setLayout\('ledger'\)/);
assert.doesNotMatch(app, /打开完整数据目录（外链/);
assert.doesNotMatch(app, /stats\.eff|selected\.stats/);
assert.match(app, /boardInstance\.setFocus/);

const board = fs.readFileSync(path.join(dir, 'data-board.js'), 'utf8');
assert.match(board, /setFocus|setLens|setFilter|setLayout|destroy/);
assert.match(board, /db-lenses|db-ledger|db-preview|db-strip/);
assert.match(board, /目前只有今日/);
assert.doesNotMatch(board, /postMessage|ot-agent-data/);

const css = fs.readFileSync(path.join(dir, 'styles.css'), 'utf8');
for (const cls of ['.db-board', '.db-lenses', '.db-preview', '.db-ledger', '.data-board-host', '.split-dock']) {
  assert.ok(css.includes(cls), `missing css ${cls}`);
}
assert.doesNotMatch(css, /--lens:\s*148px|--preview:\s*300px/);

console.log('agent-detect-home: board DTO + data board merge checks ok');
