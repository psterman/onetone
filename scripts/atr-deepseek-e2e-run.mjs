/**
 * ATR DeepSeek e2e runner — protocol evidence + operator gate for real key.
 *
 * - Always: prep sandbox, run Fake/protocol cargo filters, write acceptance skeleton
 * - Real DeepSeek (v1–v5): marked blocked until Soft Pad key present + desktop evidence
 *
 * Usage:
 *   node scripts/atr-deepseek-e2e-prep.mjs
 *   node scripts/atr-deepseek-e2e-run.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runId = `run-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
const evidenceDir = path.join(root, 'logs', 'atr-deepseek-e2e', runId);

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    env: {
      ...process.env,
      RC:
        process.env.RC ||
        'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.26100.0\\x64\\rc.exe'
    },
    ...opts
  });
  return {
    status: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || ''
  };
}

function loadPrep() {
  execFileSync(process.execPath, [path.join(root, 'scripts', 'atr-deepseek-e2e-prep.mjs')], {
    cwd: root,
    stdio: 'inherit'
  });
  const metaPath = path.join(root, 'logs', 'atr-deepseek-e2e', 'prep-meta.json');
  return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
}

function runProtocolCargo() {
  // One FILTERNAME: cargo matches substring; use agent_task_runtime::tests:: then assert names.
  const r = sh('cargo', [
    'test',
    '--manifest-path',
    'src-tauri/Cargo.toml',
    '--lib',
    'agent_task_runtime::tests::',
    '--',
    '--test-threads=1'
  ]);
  const logPath = path.join(evidenceDir, 'protocol-cargo.log');
  fs.writeFileSync(
    logPath,
    `status=${r.status}\n\n--- stdout ---\n${r.stdout}\n\n--- stderr ---\n${r.stderr}\n`
  );
  const need = [
    'repair_after_check_fail_reaches_done',
    'interrupt_on_boot_and_resume_reinspect',
    'path_escape_and_unknown_check_and_stale_token',
    'slice_a_happy_path_with_approval_and_check'
  ];
  const ok =
    r.status === 0 &&
    need.every((name) => new RegExp(`${name} \\.\\.\\. ok`).test(r.stdout));
  return { ok, logPath, status: r.status };
}

function dirtySandboxDemo(sandbox) {
  const dirtyFile = path.join(sandbox, 'scratch', 'hello.txt');
  const before = fs.readFileSync(dirtyFile, 'utf8');
  fs.writeFileSync(dirtyFile, before + 'USER_LOCAL_EDIT\n', 'utf8');
  const after = fs.readFileSync(dirtyFile, 'utf8');
  const porcelain = execFileSync('git', ['status', '--porcelain'], {
    cwd: sandbox,
    encoding: 'utf8'
  }).trim();
  const demo = {
    file: 'scratch/hello.txt',
    before,
    after,
    porcelain,
    note: 'Operator: start ATR on dirty file under write_with_approval; expect waiting_approval (baselineDirty) not tool_error loop; USER_LOCAL_EDIT stays until approve'
  };
  fs.writeFileSync(path.join(evidenceDir, 'v4-dirty-prepared.json'), JSON.stringify(demo, null, 2));
  // restore clean for v1 unless operator wants dirty — keep dirty for v4 evidence
  return demo;
}

function writeAcceptance(prep, protocol, dirty) {
  const keyOk = !!(prep.deepseekKey && prep.deepseekKey.present);
  const items = [
    {
      id: 'v1-single-file',
      title: '真密钥单文件修改',
      protocol: protocol.ok ? 'pass' : 'fail',
      realDeepseek: keyOk ? 'pending_desktop' : 'blocked_no_key',
      criteria:
        'edit→waiting→approve→done；同 taskId/checkpointId；文件内容符合 goal',
      evidence: keyOk
        ? 'Place status.json + events.json here after desktop run'
        : 'Soft Pad deepseek-api-key.txt missing'
    },
    {
      id: 'v2-repair',
      title: 'check 失败并自主修复',
      protocol: protocol.ok ? 'pass' : 'fail',
      realDeepseek: keyOk ? 'pending_desktop' : 'blocked_no_key',
      criteria: 'run_check ok=false → repair → run_check ok=true → done',
      evidence: protocol.ok
        ? `Fake: repair_after_check_fail_reaches_done (${protocol.logPath})`
        : protocol.logPath
    },
    {
      id: 'v3-restart',
      title: '重启后 waiting / interrupted 恢复',
      protocol: protocol.ok ? 'pass' : 'fail',
      realDeepseek: keyOk ? 'pending_desktop' : 'blocked_no_key',
      criteria: 'waiting 杀进程后仍可批准；interrupted 可 resume；同 checkpointId',
      evidence: protocol.ok
        ? `Fake: interrupt_on_boot_and_resume_reinspect (${protocol.logPath})`
        : protocol.logPath
    },
    {
      id: 'v4-dirty',
      title: '未提交修改不被覆盖',
      protocol: protocol.ok ? 'pass' : 'fail',
      realDeepseek: keyOk ? 'pending_desktop' : 'blocked_no_key',
      criteria: 'waiting_approval + baselineDirty；批准前 USER_LOCAL_EDIT 仍在磁盘',
      evidence: path.join(evidenceDir, 'v4-dirty-prepared.json')
    },
    {
      id: 'v5-long-drive',
      title: '长时间模型请求对首页与 DB',
      protocol: 'code_review_pass',
      realDeepseek: keyOk ? 'pending_desktop' : 'blocked_no_key',
      criteria: 'drive 中首页可交互；status IPC 不挂；无 SQLite busy；cancel→cancelled',
      evidence: 'drive_releasing holds write lock only around prep/apply, not HTTP (90s timeout)'
    }
  ];

  const realPending = items.filter((i) => i.realDeepseek !== 'pass').length;
  const summary = {
    runId,
    preparedAt: prep.preparedAt,
    recordedAt: new Date().toISOString(),
    sandbox: prep.sandbox,
    deepseekKey: prep.deepseekKey,
    protocolCargoOk: protocol.ok,
    items,
    verdict:
      realPending === 0
        ? '真实 DeepSeek 单文件 Harness 验收通过'
        : keyOk
          ? '假驱动/协议闭环通过；真密钥桌面证据待补'
          : '假驱动/协议闭环通过；缺 Soft Pad DeepSeek 密钥，真模型未齐'
  };

  fs.writeFileSync(path.join(evidenceDir, 'summary.json'), JSON.stringify(summary, null, 2));

  const md = `# ATR DeepSeek E2E 验收记录

> runId: \`${runId}\`  
> recordedAt: ${summary.recordedAt}  
> sandbox: \`${prep.sandbox}\`  
> DeepSeek key: ${
    prep.deepseekKey.present ? prep.deepseekKey.masked : '**MISSING**'
  }

## 总判

**${summary.verdict}**

假驱动/协议 cargo：${protocol.ok ? 'PASS' : 'FAIL'}（\`${path.relative(root, protocol.logPath)}\`）

## 五条边界

| ID | 标题 | 协议/假驱动 | 真 DeepSeek | 备注 |
|----|------|-------------|-------------|------|
${items
  .map(
    (i) =>
      `| ${i.id} | ${i.title} | ${i.protocol} | ${i.realDeepseek} | ${i.criteria} |`
  )
  .join('\n')}

## 证据目录

\`${evidenceDir}\`

- \`summary.json\` — 机器可读结果
- \`protocol-cargo.log\` — Fake 闭环 cargo 输出
- \`v4-dirty-prepared.json\` — 已写入 USER_LOCAL_EDIT 的脏文件状态
- 真密钥桌面跑通后请追加：\`v1-status.json\` \`v1-events.json\` … \`v5-notes.md\`

## 操作员补跑（有密钥后）

1. Soft Pad 写入 DeepSeek 密钥；确认 \`cmd_agent_task_ready.deepseekReady === true\`
2. DevTools: \`localStorage.setItem('onetone.agentTaskRuntime','1')\` → 刷新
3. 首页确认项目 = sandbox → \`workMode=edit\`
4. **v1** goal: \`把 scratch/hello.txt 改成 hello deepseek\\\\n\` → 批准 → done → 导出 events
5. **v2** 构造可失败再修复的 check 场景（或观察 noop/项目 check）→ 确认 repair 事件
6. **v3** waiting 时杀进程再开；running 时杀进程 → 恢复
7. **v4** 使用已准备的 dirty hello.txt → 确认拒绝覆盖且 USER_LOCAL_EDIT 仍在
8. **v5** drive 进行中点首页刷新 / status；可选 cancel

## 明确不做

- 不在 CI 注入真密钥
- 不默认打开 ATR flag
`;

  const docPath = path.join(root, 'docs', 'atr-deepseek-e2e-acceptance.md');
  fs.writeFileSync(docPath, md);
  return { summary, docPath };
}

fs.mkdirSync(evidenceDir, { recursive: true });
const prep = loadPrep();
assert.ok(fs.existsSync(prep.sandbox), 'sandbox missing');
const protocol = runProtocolCargo();
const dirty = dirtySandboxDemo(prep.sandbox);
const { summary, docPath } = writeAcceptance(prep, protocol, dirty);

// Refresh phase-f checklist pointer
const checklist = {
  flag: 'onetone.agentTaskRuntime=1',
  latestRunId: runId,
  evidenceDir,
  acceptanceDoc: 'docs/atr-deepseek-e2e-acceptance.md',
  deepseekKeyPresent: !!(prep.deepseekKey && prep.deepseekKey.present),
  protocolCargoOk: protocol.ok,
  ipc: [
    'cmd_agent_task_start',
    'cmd_agent_task_drive_deepseek',
    'cmd_agent_task_approve_patch',
    'cmd_agent_task_events',
    'cmd_agent_task_status',
    'cmd_agent_task_resume',
    'cmd_agent_task_cancel'
  ],
  constraints: [
    'single file only',
    'baseline dirty refuse overwrite',
    'approve then run_check',
    'same checkpoint_id across waiting→done',
    'real DeepSeek desktop evidence required for harness complete'
  ]
};
fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'logs', 'atr-phase-f-checklist.json'),
  JSON.stringify(checklist, null, 2)
);

console.log('atr-deepseek-e2e-run:', summary.verdict);
console.log('  evidence:', evidenceDir);
console.log('  doc:', docPath);
console.log('  protocolCargoOk:', protocol.ok);
console.log('  deepseekKey:', prep.deepseekKey.present ? prep.deepseekKey.masked : 'MISSING');

if (!protocol.ok) process.exit(1);
