# 首页 ATR 第一期：看得见 + 撤得回 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户在批准 ATR 写入前看到行级 diff，并能把已经写入的文件撤销回来。

**Architecture:** 后端在构建待批准补丁时额外算一份**仅用于展示**的行级 diff，随 `TaskDto.pending_patch` 投影到前端，审批卡内联渲染。每次成功写盘时把写入前的文件内容记进新建的 `agent_task_undo` 表；撤销命令按 path 分组做漂移预检，全部通过后把每个 path 恢复成该任务写入前的原状。批准语义从"一次批准后本任务不再询问"改为 scope 驱动，默认「批准这一次」。

**Tech Stack:** Rust（rusqlite / serde / tauri commands）、原生 JS（ES5 风格 IIFE，无框架）、CSS 自定义属性、Node `vm` 沙箱测试脚本。

**Spec:** `docs/superpowers/specs/2026-11-03-atr-review-undo-design.md`（第一期章节 §3）

**执行顺序**：Task 1 → 2 → 3 → **5** → **4** → 6 → 7 → 8 → 9

> Task 5（加 `scope` 字段）必须排在 Task 4（写用到 `scope: None` 的撤销测试）之前 —— 否则测试代码引用了还不存在的字段。

## Global Constraints

以下约束对**每个** Task 生效，不得偏离：

- **`patch_hash` 计算路径一行都不许改**。`tools::unified_replace_preview`（`src-tauri/src/agent_task_runtime/tools.rs:187-189`）必须保持原样，因为它把全文塞进 preview 从而能检测任意磁盘漂移。新增的 diff 是**独立字段**，只用于展示。
- **不引第三方 crate**。行级 diff 自己实现，Rust 侧依赖面不变。
- **不碰首页其他部分**。改动限定在 `src-tauri/src/agent_task_runtime/`、`src-tauri/src/ipc/commands/shell/agent_task_runtime_cmd.rs`、`src-tauri/src/lib.rs`（仅注册新命令）、`src/js/features/now/home-agent-task.js`、`src/js/features/now/home-agent-v2-store.js`、`src/js/features/now/home-agent-v2.js`（仅 ATR 相关段）、`src/css/home-agent-v2.css`。
- **不重构 `home-agent-v2.js`**。该文件已 13067 行；本轮只在 ATR 相关位置追加代码，不做拆分、不调整既有函数结构。事件委托选择器串（`home-agent-v2.js:11953`）只**追加**属性，不重排。
- **文案用 `t(key, fallback)` + `esc()`**。所有插入 DOM 的动态内容必须过 `esc()`。新文案 key 前缀 `ha2Atr`。
- **CSS 只用现有变量**：`--ha2-ink` / `--ha2-muted` / `--ha2-line` / `--ha2-accent` / `--ha2-ok` / `--ha2-err` / `--ha2-warn`。不引入新色值。
- **Rust 错误码用 snake_case 字符串**，与现有 `patch_context_mismatch` / `baseline_dirty_requires_approval` 风格一致。
- **每个 Task 结束必须 commit**，commit message 用中文正文 + `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- **每步必须先写失败测试、跑到失败、再写实现、跑到通过**。测试命令见各 Task。
- **所有 `cargo test` 必须带 `-- --test-threads=1`**。`mod.rs` 的 `tmp_db()` 用 `atr_mod_{pid}_{毫秒时间戳}.sqlite3` 命名测试库 —— 并行执行时同一毫秒启动的两个测试会**共用同一个 SQLite 文件**，互相污染事件流（已实测：`apply_without_read_auto_reads_then_waits` 并行跑假失败、串行跑必过）。项目自己在 `check_registry.rs:47` 就用了 `--test-threads=1`。**不带这个参数的测试结果一律不可信。**

---

## File Structure

| 文件 | 责任 | 本轮改动 |
|---|---|---|
| `src-tauri/src/agent_task_runtime/tools.rs` | 工具执行器 + diff 算法 + 待批准补丁构造 | 新增 `DiffStats` / `unified_line_diff`；`PendingPatch` 扩字段；`build_pending_patch` 收 rationale/risk 并算 diff；`apply_pending_patch` 返回写入前内容 |
| `src-tauri/src/agent_task_runtime/contracts.rs` | 对外契约 | `TaskDto.pending_patch`；新增 `PendingPatchView`；`ApprovePatchRequest.scope` |
| `src-tauri/src/agent_task_runtime/store.rs` | SQLite 持久化 | 迁移 v4 建 `agent_task_undo`；undo 记录读写；`to_dto` 投影 pending_patch |
| `src-tauri/src/agent_task_runtime/engine.rs` | 工具循环 / 审批 / 撤销 | 两条写路径落 undo 行；新增 `undo_task_writes`；`approve_patch` 按 scope 决定是否升级为 autonomous |
| `src-tauri/src/agent_task_runtime/mod.rs` | 对外 API | `api_undo`；`api_approve` 传 scope |
| `src-tauri/src/ipc/commands/shell/agent_task_runtime_cmd.rs` | IPC 绑定 | 新增 `cmd_agent_task_undo` |
| `src-tauri/src/lib.rs` | 命令注册 | 注册 `cmd_agent_task_undo` |
| `src/js/features/now/home-agent-task.js` | ATR IPC 客户端 | `undo()`；`approvePatch()` 支持 scope |
| `src/js/features/now/home-agent-v2-store.js` | ATR 前端状态 | `undoAgentWrite()`；批准透传 scope |
| `src/js/features/now/home-agent-v2.js` | ATR 渲染 | `atrPendingDiffHtml()`；审批卡接入；撤销按钮；scope 按钮 |
| `src/css/home-agent-v2.css` | 样式 | `.ha2-atr-diff*` 系列 |
| `scripts/test-atr-diff-undo.mjs` | 前端测试 | 新建 |

---

### Task 1: 行级 diff 算法（纯函数，无副作用）

**Files:**
- Modify: `src-tauri/src/agent_task_runtime/tools.rs`（在 `unified_replace_preview` 之后追加）
- Test: `src-tauri/src/agent_task_runtime/tools.rs` 内 `mod tests`

**Interfaces:**
- Consumes: 无
- Produces:
  - `pub struct DiffStats { pub added: usize, pub removed: usize }`（`Copy + Default + PartialEq + Eq + Debug + Clone`）
  - `pub fn unified_line_diff(old: &str, new: &str) -> (String, DiffStats)`
    - 返回 `(diff_text, stats)`。`diff_text` 为 unified diff 文本，hunk 头形如 `@@ -14,7 +14,8 @@`；无变化时返回 `("", DiffStats{0,0})`；超限时返回降级文本 `@@ full-file replace @@` 且 `stats.removed = 旧行数` / `stats.added = 新行数`。
    - 每行以 `+` / `-` / ` ` 前缀标记；hunk 头行以 `@@` 开头。

- [ ] **Step 1: 写失败测试**

在 `src-tauri/src/agent_task_runtime/tools.rs` 的 `mod tests` 内追加：

```rust
    #[test]
    fn line_diff_marks_added_removed_context() {
        let old = "a\nb\nc\nd\ne\n";
        let new = "a\nb\nC\nd\ne\n";
        let (diff, stats) = unified_line_diff(old, new);
        assert_eq!(stats.added, 1);
        assert_eq!(stats.removed, 1);
        assert!(diff.contains("@@"), "diff={diff}");
        assert!(diff.contains("-c"), "diff={diff}");
        assert!(diff.contains("+C"), "diff={diff}");
        assert!(diff.contains(" a"), "context line missing: {diff}");
    }

    #[test]
    fn line_diff_no_change_is_empty() {
        let (diff, stats) = unified_line_diff("x\ny\n", "x\ny\n");
        assert_eq!(diff, "");
        assert_eq!(stats.added, 0);
        assert_eq!(stats.removed, 0);
    }

    #[test]
    fn line_diff_new_file_has_only_additions() {
        let (diff, stats) = unified_line_diff("", "n1\nn2\n");
        assert_eq!(stats.added, 2);
        assert_eq!(stats.removed, 0);
        assert!(diff.contains("+n1"), "diff={diff}");
        assert!(!diff.contains("-n"), "diff={diff}");
    }

    #[test]
    fn line_diff_deletes_lines() {
        let (diff, stats) = unified_line_diff("a\nb\nc\n", "a\nc\n");
        assert_eq!(stats.removed, 1);
        assert_eq!(stats.added, 0);
        assert!(diff.contains("-b"), "diff={diff}");
    }

    #[test]
    fn line_diff_trims_common_prefix_and_suffix() {
        // 3000 identical lines around one change must NOT degrade.
        let mut old = String::new();
        let mut new = String::new();
        for i in 0..3000 {
            old.push_str(&format!("line{i}\n"));
            new.push_str(&format!("line{i}\n"));
        }
        old.push_str("old_tail\n");
        new.push_str("new_tail\n");
        let (diff, stats) = unified_line_diff(&old, &new);
        assert_eq!(stats.added, 1);
        assert_eq!(stats.removed, 1);
        assert!(!diff.contains("full-file replace"), "degraded: {diff}");
        assert!(diff.len() < 2000, "diff too long: {}", diff.len());
    }

    #[test]
    fn line_diff_degrades_on_huge_middle_block() {
        let old: String = (0..4000).map(|i| format!("o{i}\n")).collect();
        let new: String = (0..4000).map(|i| format!("n{i}\n")).collect();
        let (diff, stats) = unified_line_diff(&old, &new);
        assert!(diff.contains("full-file replace"), "diff={diff}");
        assert_eq!(stats.removed, 4000);
        assert_eq!(stats.added, 4000);
    }

    #[test]
    fn line_diff_never_panics_on_empty_inputs() {
        let (diff, stats) = unified_line_diff("", "");
        assert_eq!(stats.added, 0);
        assert_eq!(stats.removed, 0);
        assert_eq!(diff, "");
    }
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib agent_task_runtime::tools::tests::line_diff -- --test-threads=1 --nocapture`
Expected: 编译失败，提示 `cannot find function unified_line_diff in this scope`

- [ ] **Step 3: 实现 diff 算法**

在 `src-tauri/src/agent_task_runtime/tools.rs` 的 `unified_replace_preview` 函数**之后**插入（不要动 `unified_replace_preview` 本身）：

```rust
/// Line-level diff stats. Display only — never feeds patch_hash.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct DiffStats {
    pub added: usize,
    pub removed: usize,
}

/// Max lines in the *trimmed middle* block before we give up on an LCS diff.
/// The common prefix/suffix are trimmed first, so a 3000-line file with one
/// changed line still diffs cheaply.
const MAX_DIFF_MID_LINES: usize = 1200;
/// Context lines kept around each hunk.
const DIFF_CONTEXT: usize = 3;

#[derive(Debug, Clone, PartialEq, Eq)]
enum DiffOp {
    Ctx,
    Del,
    Add,
}

/// Line-level unified diff between two file contents.
///
/// Display only. The approval/drift path keeps using `patch_hash`, which is
/// bound to the FULL old+new content — this function must never be used for
/// verification.
pub fn unified_line_diff(old: &str, new: &str) -> (String, DiffStats) {
    let old_lines: Vec<&str> = old.lines().collect();
    let new_lines: Vec<&str> = new.lines().collect();

    // Trim the common prefix.
    let mut pre = 0usize;
    while pre < old_lines.len() && pre < new_lines.len() && old_lines[pre] == new_lines[pre] {
        pre += 1;
    }
    // Trim the common suffix (never overlapping the prefix).
    let mut suf = 0usize;
    while suf < (old_lines.len() - pre)
        && suf < (new_lines.len() - pre)
        && old_lines[old_lines.len() - 1 - suf] == new_lines[new_lines.len() - 1 - suf]
    {
        suf += 1;
    }

    let old_mid = &old_lines[pre..old_lines.len() - suf];
    let new_mid = &new_lines[pre..new_lines.len() - suf];

    if old_mid.len() > MAX_DIFF_MID_LINES || new_mid.len() > MAX_DIFF_MID_LINES {
        return (
            format!(
                "@@ full-file replace @@\n-{} lines\n+{} lines\n",
                old_mid.len(),
                new_mid.len()
            ),
            DiffStats {
                added: new_mid.len(),
                removed: old_mid.len(),
            },
        );
    }

    let mid_ops = lcs_ops(old_mid, new_mid);

    // Walk prefix + middle + suffix in ONE pass, filling text and line numbers.
    let mut rows: Vec<(DiffOp, &str, u32, u32)> = Vec::new();
    for i in 0..pre {
        rows.push((DiffOp::Ctx, old_lines[i], (i + 1) as u32, (i + 1) as u32));
    }
    let mut old_ln = pre as u32;
    let mut new_ln = pre as u32;
    let mut oi = 0usize;
    let mut ni = 0usize;
    for op in mid_ops {
        match op {
            DiffOp::Ctx => {
                old_ln += 1;
                new_ln += 1;
                rows.push((DiffOp::Ctx, old_mid[oi], old_ln, new_ln));
                oi += 1;
                ni += 1;
            }
            DiffOp::Del => {
                old_ln += 1;
                rows.push((DiffOp::Del, old_mid[oi], old_ln, new_ln));
                oi += 1;
            }
            DiffOp::Add => {
                new_ln += 1;
                rows.push((DiffOp::Add, new_mid[ni], old_ln, new_ln));
                ni += 1;
            }
        }
    }
    for i in 0..suf {
        let o_idx = old_lines.len() - suf + i;
        let n_idx = new_lines.len() - suf + i;
        rows.push((
            DiffOp::Ctx,
            old_lines[o_idx],
            (o_idx + 1) as u32,
            (n_idx + 1) as u32,
        ));
    }

    let mut stats = DiffStats::default();
    for r in &rows {
        match r.0 {
            DiffOp::Add => stats.added += 1,
            DiffOp::Del => stats.removed += 1,
            DiffOp::Ctx => {}
        }
    }
    if stats.added == 0 && stats.removed == 0 {
        return (String::new(), stats);
    }

    // Group changed rows into hunks.
    let changed: Vec<usize> = rows
        .iter()
        .enumerate()
        .filter(|(_, r)| r.0 != DiffOp::Ctx)
        .map(|(i, _)| i)
        .collect();
    if changed.is_empty() {
        return (String::new(), stats);
    }
    let mut hunks: Vec<(usize, usize)> = Vec::new();
    let mut h_start = changed[0];
    let mut h_end = changed[0];
    for &c in changed.iter().skip(1) {
        if c <= h_end + 1 + 2 * DIFF_CONTEXT {
            h_end = c;
        } else {
            hunks.push((h_start, h_end));
            h_start = c;
            h_end = c;
        }
    }
    hunks.push((h_start, h_end));

    let mut out = String::new();
    for (s, e) in hunks {
        let s = s.saturating_sub(DIFF_CONTEXT);
        let e = (e + DIFF_CONTEXT).min(rows.len() - 1);
        let old_start = rows[s].2;
        let new_start = rows[s].3;
        let old_count = rows[s..=e]
            .iter()
            .filter(|r| r.0 != DiffOp::Add)
            .count();
        let new_count = rows[s..=e]
            .iter()
            .filter(|r| r.0 != DiffOp::Del)
            .count();
        out.push_str(&format!(
            "@@ -{},{} +{},{} @@\n",
            old_start, old_count, new_start, new_count
        ));
        for r in &rows[s..=e] {
            let prefix = match r.0 {
                DiffOp::Ctx => ' ',
                DiffOp::Del => '-',
                DiffOp::Add => '+',
            };
            out.push(prefix);
            out.push_str(r.1);
            out.push('\n');
        }
    }
    (out, stats)
}

/// Classic LCS over two line slices. Returns the op sequence for the middle block.
fn lcs_ops(a: &[&str], b: &[&str]) -> Vec<DiffOp> {
    let n = a.len();
    let m = b.len();
    if n == 0 {
        return b.iter().map(|_| DiffOp::Add).collect();
    }
    if m == 0 {
        return a.iter().map(|_| DiffOp::Del).collect();
    }
    let w = m + 1;
    let mut dp = vec![0u32; (n + 1) * (m + 1)];
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            dp[i * w + j] = if a[i] == b[j] {
                dp[(i + 1) * w + j + 1] + 1
            } else {
                dp[(i + 1) * w + j].max(dp[i * w + j + 1])
            };
        }
    }
    let mut ops = Vec::new();
    let (mut i, mut j) = (0usize, 0usize);
    while i < n && j < m {
        if a[i] == b[j] {
            ops.push(DiffOp::Ctx);
            i += 1;
            j += 1;
        } else if dp[(i + 1) * w + j] >= dp[i * w + j + 1] {
            ops.push(DiffOp::Del);
            i += 1;
        } else {
            ops.push(DiffOp::Add);
            j += 1;
        }
    }
    while i < n {
        ops.push(DiffOp::Del);
        i += 1;
    }
    while j < m {
        ops.push(DiffOp::Add);
        j += 1;
    }
    ops
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib agent_task_runtime::tools::tests -- --test-threads=1 --nocapture`
Expected: 全部 PASS（含既有 `inspect_dirty_samples_long_lists` / `inspect_diff_falls_back_to_baseline_dirty`）

- [ ] **Step 5: 跑 golden test 确认 patch_hash 未被影响**

在同一个 `mod tests` 内追加：

```rust
    #[test]
    fn patch_hash_is_stable_across_diff_feature() {
        // Golden: the patch_hash input MUST stay byte-identical to the
        // pre-diff implementation. unified_replace_preview is unchanged.
        let old = "line1\nline2\nline3\n";
        let new = "line1\nCHANGED\nline3\n";
        let preview = unified_replace_preview("a.txt", old, new);
        let expected = format!("{:x}", Sha256::digest(preview.as_bytes()));
        let path = std::env::temp_dir().join(format!("atr_golden_{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        fs::write(path.join("a.txt"), old).unwrap();
        let scope = WorkspaceScope {
            root: path.clone(),
            baseline_dirty: vec![],
        };
        let pending = build_pending_patch(
            "t_golden",
            &scope,
            "a.txt",
            new,
            1,
            false,
            Some(&file_hash(&path.join("a.txt")).unwrap()),
        )
        .unwrap();
        assert_eq!(pending.patch_hash, expected);
        let _ = fs::remove_dir_all(&path);
    }
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib agent_task_runtime::tools::tests::patch_hash_is_stable -- --test-threads=1 --nocapture`
Expected: PASS

> 若此测试失败，说明 `unified_replace_preview` 被改动了 —— **立即停止**，那是本计划的硬红线。

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/agent_task_runtime/tools.rs
git commit -m "feat(atr): 行级 diff 算法（仅展示，不动 patch_hash）

新增 tools::unified_line_diff + DiffStats：
- 先裁剪公共前后缀，再对中间块做 LCS 行级 diff，3 行上下文
- 中间块超 1200 行降级为「整文件替换」提示
- golden test 锁死 patch_hash 与改动前逐字节一致

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: PendingPatch 扩展 + DTO 投影

**Files:**
- Modify: `src-tauri/src/agent_task_runtime/tools.rs`（`PendingPatch` 结构体 + `build_pending_patch`）
- Modify: `src-tauri/src/agent_task_runtime/contracts.rs`（`TaskDto.pending_patch` + 新增 `PendingPatchView`）
- Modify: `src-tauri/src/agent_task_runtime/store.rs`（`to_dto` 投影）
- Modify: `src-tauri/src/agent_task_runtime/engine.rs`（`apply_patch` 分支传 rationale/risk）
- Test: `src-tauri/src/agent_task_runtime/tools.rs` / `store.rs` 内 `mod tests`

**Interfaces:**
- Consumes: Task 1 的 `unified_line_diff` / `DiffStats`
- Produces:
  - `PendingPatch` 新字段（全部 `#[serde(default)]`，保证旧库 JSON 仍可解析）：
    `rationale: String`、`risk: String`、`diff: String`、`added: u32`、`removed: u32`
  - `PendingPatch::to_view(&self) -> PendingPatchView`
  - `contracts::PendingPatchView { path, diff, rationale, risk, added, removed, is_new_file, patch_version, patch_hash, target_file_hash }`
  - `TaskDto.pending_patch: Option<PendingPatchView>`
  - `build_pending_patch(task_id, scope, path, new_content, patch_version, allow_dirty, last_file_hash, rationale, risk)` —— **签名新增两个 `&str` 参数**

- [ ] **Step 1: 写失败测试**

在 `src-tauri/src/agent_task_runtime/tools.rs` 的 `mod tests` 内追加：

```rust
    #[test]
    fn pending_patch_carries_diff_and_reason() {
        let dir = std::env::temp_dir().join(format!("atr_pending_{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("a.txt"), "one\ntwo\nthree\n").unwrap();
        let scope = WorkspaceScope {
            root: dir.clone(),
            baseline_dirty: vec![],
        };
        let hash = file_hash(&dir.join("a.txt")).unwrap();
        let pending = build_pending_patch(
            "t1",
            &scope,
            "a.txt",
            "one\nTWO\nthree\n",
            1,
            false,
            Some(&hash),
            "修正大小写",
            "low",
        )
        .unwrap();
        assert_eq!(pending.rationale, "修正大小写");
        assert_eq!(pending.risk, "low");
        assert_eq!(pending.added, 1);
        assert_eq!(pending.removed, 1);
        assert!(pending.diff.contains("-two"), "diff={}", pending.diff);
        assert!(pending.diff.contains("+TWO"), "diff={}", pending.diff);
        let view = pending.to_view();
        assert_eq!(view.path, "a.txt");
        assert_eq!(view.added, 1);
        assert!(!view.is_new_file);
        let _ = fs::remove_dir_all(&dir);
    }
```

在 `src-tauri/src/agent_task_runtime/store.rs` 的 `mod tests` 内追加：

```rust
    #[test]
    fn task_dto_projects_pending_patch_without_new_content() {
        let mut row = TaskRow {
            task_id: "t1".into(),
            goal: "g".into(),
            workspace_root: "/tmp".into(),
            permission_mode: "write_with_approval".into(),
            status: "waiting".into(),
            waiting_reason: Some("approval".into()),
            current_turn: 1,
            tool_call_count: 1,
            changed_files_json: "[]".into(),
            baseline_dirty_json: "[]".into(),
            pending_approval_token: Some("tok".into()),
            pending_patch_json: Some(
                r#"{"path":"a.txt","new_content":"SECRET-NEW-CONTENT","patch_hash":"h",
                    "target_file_hash":"t","patchVersion":1,"approvalToken":"tok",
                    "allowDirty":false,"rationale":"why","risk":"low",
                    "diff":"@@ -1 +1 @@\n-a\n+b","added":1,"removed":1}"#
                    .into(),
            ),
            fingerprints_json: "{}".into(),
            checkpoint_id: None,
            last_error: None,
            repair_count: 0,
            format_retry_count: 0,
            applied_tokens_json: "[]".into(),
            created_at_ms: 0,
            updated_at_ms: 0,
            provider_id: None,
            model_id: None,
            config_fp: None,
            driver_kind: "unknown".into(),
            verify_intent: false,
            sandbox_id: None,
            expected_rel_path: None,
            expected_content: None,
        };
        let dto = row.to_dto();
        let pp = dto.pending_patch.expect("pending_patch missing");
        assert_eq!(pp.path, "a.txt");
        assert_eq!(pp.rationale, "why");
        assert_eq!(pp.added, 1);
        assert_eq!(pp.removed, 1);
        assert!(!pp.is_new_file);
        let json = serde_json::to_string(&dto).unwrap();
        assert!(!json.contains("SECRET-NEW-CONTENT"), "new_content leaked");
    }
```

> 若 `TaskRow` 的实际字段与上面不一致，先读 `src-tauri/src/agent_task_runtime/store.rs` 的 `TaskRow` 定义（`pub struct TaskRow`）逐字段对齐后再写。

- [ ] **Step 2: 跑测试确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib agent_task_runtime -- --test-threads=1 --nocapture 2>&1 | Select-String -Pattern "pending_patch_carries_diff|task_dto_projects_pending_patch|error\[|^error"`
Expected: 编译失败，`build_pending_patch` 参数不匹配 / `PendingPatch` 无 `rationale` 字段 / `TaskDto` 无 `pending_patch` 字段

- [ ] **Step 3: 扩展 PendingPatch 与 build_pending_patch**

在 `src-tauri/src/agent_task_runtime/tools.rs` 替换 `PendingPatch` 结构体定义：

```rust
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingPatch {
    pub path: String,
    pub new_content: String,
    pub patch_hash: String,
    pub target_file_hash: String,
    pub patch_version: u32,
    pub approval_token: String,
    pub allow_dirty: bool,
    /// Why the model proposes this change — shown in the approval card.
    #[serde(default)]
    pub rationale: String,
    /// Model-declared risk label — shown in the approval card.
    #[serde(default)]
    pub risk: String,
    /// Display-only line diff. NEVER feeds patch_hash.
    #[serde(default)]
    pub diff: String,
    /// Display-only stats. NEVER feeds patch_hash.
    #[serde(default)]
    pub added: u32,
    #[serde(default)]
    pub removed: u32,
}

impl PendingPatch {
    /// Frontend-facing view. Deliberately omits `new_content` (can be large).
    pub fn to_view(&self) -> super::contracts::PendingPatchView {
        super::contracts::PendingPatchView {
            path: self.path.clone(),
            diff: self.diff.clone(),
            rationale: self.rationale.clone(),
            risk: self.risk.clone(),
            added: self.added,
            removed: self.removed,
            is_new_file: self.target_file_hash == NEW_FILE_HASH,
            patch_version: self.patch_version,
            patch_hash: self.patch_hash.clone(),
            target_file_hash: self.target_file_hash.clone(),
        }
    }
}
```

把 `build_pending_patch` 的签名与两个 `Ok(...)` 返回分支改为：

```rust
pub fn build_pending_patch(
    task_id: &str,
    scope: &WorkspaceScope,
    path: &str,
    new_content: &str,
    patch_version: u32,
    allow_dirty: bool,
    last_file_hash: Option<&str>,
    rationale: &str,
    risk: &str,
) -> Result<PendingPatch, String> {
```

在**两个**分支里构造 `PendingPatch` 之前，加上 diff 计算：

```rust
    let (diff, dstats) = unified_line_diff(&old, new_content);
```

（新建文件分支用 `unified_line_diff("", new_content)`。）并把两个 `PendingPatch { ... }` 字面量补上：

```rust
        rationale: rationale.to_string(),
        risk: risk.to_string(),
        diff,
        added: dstats.added as u32,
        removed: dstats.removed as u32,
```

- [ ] **Step 4: 新增 PendingPatchView 并挂到 TaskDto**

在 `src-tauri/src/agent_task_runtime/contracts.rs` 的 `TaskDto` 之前插入：

```rust
/// Frontend-facing projection of a pending patch.
/// Deliberately omits `new_content` — the line diff is what the user reviews.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PendingPatchView {
    pub path: String,
    pub diff: String,
    pub rationale: String,
    pub risk: String,
    pub added: u32,
    pub removed: u32,
    pub is_new_file: bool,
    pub patch_version: u32,
    pub patch_hash: String,
    pub target_file_hash: String,
}
```

在 `TaskDto` 末尾（`live_thinking` 字段之后）追加：

```rust
    /// Pending patch awaiting approval — includes the display-only line diff.
    #[serde(default)]
    pub pending_patch: Option<PendingPatchView>,
```

- [ ] **Step 5: store.rs 投影**

在 `src-tauri/src/agent_task_runtime/store.rs` 的 `to_dto` 里，`live_thinking: None,` 之后追加：

```rust
            pending_patch: self
                .pending_patch_json
                .as_deref()
                .and_then(|raw| serde_json::from_str::<super::tools::PendingPatch>(raw).ok())
                .map(|p| p.to_view()),
```

并在文件顶部确认 `use` 能解析 `super::tools::PendingPatch`（`store.rs` 与 `tools.rs` 同属 `agent_task_runtime` 模块，无循环依赖：`tools.rs` 只依赖 `check_registry` / `contracts` / `scope`）。

- [ ] **Step 6: engine.rs 调用点适配**

`src-tauri/src/agent_task_runtime/engine.rs` 的 `apply_patch` 分支（当前在 `engine.rs:496` 附近调用 `tools::build_pending_patch`）改为传入 rationale 与 risk：

```rust
            let rationale = args
                .get("rationale")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let risk = args.get("risk").and_then(|v| v.as_str()).unwrap_or("low");
```

（`rationale` / `risk` 若已在该分支中定义，去掉重复定义，保留一份。）

调用改为：

```rust
            let pending = tools::build_pending_patch(
                &task.task_id,
                &scope,
                path,
                new_content,
                version,
                allow_dirty_eff,
                last_hash.as_deref(),
                rationale,
                risk,
            )?;
```

- [ ] **Step 7: 跑测试确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib agent_task_runtime -- --test-threads=1 --nocapture`
Expected: 全部 PASS

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/agent_task_runtime/tools.rs src-tauri/src/agent_task_runtime/contracts.rs src-tauri/src/agent_task_runtime/store.rs src-tauri/src/agent_task_runtime/engine.rs
git commit -m "feat(atr): PendingPatch 携带 diff/理由/风险，DTO 投影 pending_patch

- PendingPatch 扩 5 字段（全部 serde default，旧库 JSON 仍可解析）
- build_pending_patch 收 rationale/risk，内部算 unified_line_diff
- 新增 PendingPatchView（不含 new_content），挂到 TaskDto.pending_patch
- store.to_dto 解析 pending_patch_json 投影

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 撤销存储（迁移 v4 + 写入快照）

**Files:**
- Modify: `src-tauri/src/agent_task_runtime/store.rs`（迁移 v4 + undo 记录读写函数）
- Modify: `src-tauri/src/agent_task_runtime/tools.rs`（`apply_pending_patch` 返回写入前内容）
- Modify: `src-tauri/src/agent_task_runtime/engine.rs`（两条写路径落 undo 行）
- Test: `src-tauri/src/agent_task_runtime/store.rs` 内 `mod tests`

**Interfaces:**
- Consumes: Task 2 的 `PendingPatch`
- Produces:
  - 表 `agent_task_undo(id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, path TEXT, prev_content TEXT, prev_hash TEXT, new_hash TEXT, undone_at_ms INTEGER, created_at_ms INTEGER)`
  - `store::UndoRecord { id: i64, task_id: String, path: String, prev_content: Option<String>, prev_hash: String, new_hash: String, undone_at_ms: Option<i64>, created_at_ms: i64 }`
  - `store::record_undo(conn: &mut Connection, task_id: &str, path: &str, prev_content: Option<String>, prev_hash: &str, new_hash: &str) -> Result<(), String>`
  - `store::list_undo(conn: &Connection, task_id: &str) -> Result<Vec<UndoRecord>, String>` —— **`ORDER BY id DESC`**
  - `store::count_pending_undo(conn: &Connection, task_id: &str) -> Result<u64, String>`
  - `store::mark_paths_undone(conn: &mut Connection, paths: &[String]) -> Result<(), String>`
  - `tools::apply_pending_patch` 返回的 JSON 增加 `prevContent` 字段（写入前全文，新建文件为 `null`）

- [ ] **Step 1: 写失败测试**

在 `src-tauri/src/agent_task_runtime/store.rs` 的 `mod tests` 内追加（**沿用该文件既有的 `with_conn_at(&path, |conn| {...})` 模式**，见 `store.rs:757` 起的 `events_are_append_only_insert`）：

```rust
    #[test]
    fn undo_records_order_by_id_not_timestamp() {
        let path = std::env::temp_dir().join(format!(
            "atr_undo_order_{}.sqlite3",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&path);
        with_conn_at(&path, |conn| {
            record_undo(conn, "t1", "a.txt", Some("v1".into()), "h1", "h2").unwrap();
            record_undo(conn, "t1", "a.txt", Some("v2".into()), "h2", "h3").unwrap();
            let list = list_undo(conn, "t1").unwrap();
            assert_eq!(list.len(), 2);
            // id DESC → newest first
            assert_eq!(list[0].prev_content.as_deref(), Some("v2"));
            assert_eq!(list[1].prev_content.as_deref(), Some("v1"));
            assert!(list[0].id > list[1].id);
            assert_eq!(count_pending_undo(conn, "t1").unwrap(), 2);
        });
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn undo_records_persist_across_connections() {
        let path = std::env::temp_dir().join(format!(
            "atr_undo_persist_{}.sqlite3",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&path);
        with_conn_at(&path, |conn| {
            record_undo(conn, "t9", "x.txt", None, "new", "h1").unwrap();
        });
        with_conn_at(&path, |conn| {
            let list = list_undo(conn, "t9").unwrap();
            assert_eq!(list.len(), 1);
            assert_eq!(list[0].prev_hash, "new");
            assert!(list[0].prev_content.is_none());
        });
        let _ = std::fs::remove_file(&path);
    }
```

> `with_conn_at` 是 `store.rs` 内的既有 helper（`mod tests` 已用它）。若签名是 `with_conn_at(&path, |conn| -> R)`，照抄上面的闭包写法即可；若它返回 `Result`，把 `unwrap()` 补到闭包末尾。**先读 `store.rs:757-790` 的既有用例确认签名。**

- [ ] **Step 2: 跑测试确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib agent_task_runtime::store::tests::undo_records -- --test-threads=1 --nocapture`
Expected: 编译失败，`cannot find function record_undo in this scope`

- [ ] **Step 3: 迁移 v4 建表**

在 `src-tauri/src/agent_task_runtime/store.rs` 的 `migrate` 函数里，`v3` 块之后、`Ok(())` 之前追加：

```rust
    let v4: i64 = conn
        .query_row(
            "SELECT COUNT(1) FROM atr_schema_migrations WHERE version = 4",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if v4 == 0 {
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS agent_task_undo (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              task_id TEXT NOT NULL,
              path TEXT NOT NULL,
              prev_content TEXT,
              prev_hash TEXT NOT NULL,
              new_hash TEXT NOT NULL,
              undone_at_ms INTEGER,
              created_at_ms INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_atr_undo_task ON agent_task_undo(task_id);
            CREATE INDEX IF NOT EXISTS idx_atr_undo_path ON agent_task_undo(task_id, path);
            "#,
        )
        .map_err(|e| format!("atr migrate v4: {e}"))?;
        conn.execute(
            "INSERT INTO atr_schema_migrations(version, applied_at_ms) VALUES (4, ?1)",
            [now_ms() as i64],
        )
        .map_err(|e| format!("atr migrate v4 record: {e}"))?;
    }
```

- [ ] **Step 4: undo 记录读写函数**

在 `src-tauri/src/agent_task_runtime/store.rs` 追加：

```rust
#[derive(Debug, Clone)]
pub struct UndoRecord {
    pub id: i64,
    pub task_id: String,
    pub path: String,
    pub prev_content: Option<String>,
    pub prev_hash: String,
    pub new_hash: String,
    pub undone_at_ms: Option<i64>,
    pub created_at_ms: i64,
}

/// Record one successful write so it can be undone later.
/// `prev_content` is None when the file did not exist before the write.
pub fn record_undo(
    conn: &mut Connection,
    task_id: &str,
    path: &str,
    prev_content: Option<String>,
    prev_hash: &str,
    new_hash: &str,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO agent_task_undo(task_id, path, prev_content, prev_hash, new_hash, created_at_ms)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            task_id,
            path,
            prev_content,
            prev_hash,
            new_hash,
            now_ms() as i64
        ],
    )
    .map_err(|e| format!("atr undo insert: {e}"))?;
    Ok(())
}

/// Undo records for a task, newest first.
/// ORDER BY id — `id` is AUTOINCREMENT so it is the strict insertion order.
/// `created_at_ms` is millisecond-resolution and CANNOT order same-ms writes.
pub fn list_undo(conn: &Connection, task_id: &str) -> Result<Vec<UndoRecord>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, task_id, path, prev_content, prev_hash, new_hash, undone_at_ms, created_at_ms
             FROM agent_task_undo
             WHERE task_id = ?1 AND undone_at_ms IS NULL
             ORDER BY id DESC",
        )
        .map_err(|e| format!("atr undo select: {e}"))?;
    let rows = stmt
        .query_map(params![task_id], |r| {
            Ok(UndoRecord {
                id: r.get(0)?,
                task_id: r.get(1)?,
                path: r.get(2)?,
                prev_content: r.get(3)?,
                prev_hash: r.get(4)?,
                new_hash: r.get(5)?,
                undone_at_ms: r.get(6)?,
                created_at_ms: r.get(7)?,
            })
        })
        .map_err(|e| format!("atr undo query: {e}"))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("atr undo row: {e}"))?);
    }
    Ok(out)
}

pub fn count_pending_undo(conn: &Connection, task_id: &str) -> Result<u64, String> {
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(1) FROM agent_task_undo WHERE task_id = ?1 AND undone_at_ms IS NULL",
            params![task_id],
            [],
            |r| r.get(0),
        )
        .map_err(|e| format!("atr undo count: {e}"))?;
    Ok(n as u64)
}

/// Mark every pending undo record for these paths as done.
/// Covers records from other tasks too: after the restore the file no longer
/// holds the state those records described, so keeping them would surface a
/// misleading drift error later.
pub fn mark_paths_undone(conn: &mut Connection, paths: &[String]) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }
    let now = now_ms() as i64;
    for p in paths {
        conn.execute(
            "UPDATE agent_task_undo SET undone_at_ms = ?1 WHERE path = ?2 AND undone_at_ms IS NULL",
            params![now, p],
        )
        .map_err(|e| format!("atr undo mark: {e}"))?;
    }
    Ok(())
}
```

（`params!` 宏需 `use rusqlite::params;` —— 若 `store.rs` 顶部已有则不重复加。`now_ms()` 沿用 `store.rs` 内已有的函数。）

- [ ] **Step 5: apply_pending_patch 返回写入前内容**

在 `src-tauri/src/agent_task_runtime/tools.rs` 的 `apply_pending_patch` 里：

**新建文件分支**（当前 `tools.rs:289-294`）改为：

```rust
        fs::write(&abs, &pending.new_content).map_err(|e| format!("write: {e}"))?;
        return Ok(json!({
            "path": pending.path,
            "ok": true,
            "created": true,
            "newFileHash": file_hash(&abs)?,
            "prevContent": Value::Null,
            "prevHash": NEW_FILE_HASH,
        }));
```

**已有文件分支**（当前 `tools.rs:311-315`）改为：

```rust
    fs::write(&abs, &pending.new_content).map_err(|e| format!("write: {e}"))?;
    Ok(json!({
        "path": pending.path,
        "ok": true,
        "newFileHash": file_hash(&abs)?,
        "prevContent": old,
        "prevHash": pending.target_file_hash.clone(),
    }))
```

（`old` 在该函数中已是写入前读出的全文，直接复用。）

- [ ] **Step 6: 两条写路径落 undo 行**

在 `src-tauri/src/agent_task_runtime/engine.rs`：

**自主写分支**（`engine.rs:529-551`，`let result = tools::apply_pending_patch(&scope, &pending)?;` 之后）追加：

```rust
            // Snapshot the pre-write content so this write can be undone.
            if let (Ok(new_hash), Some(path)) = (
                result.get("newFileHash").and_then(|v| v.as_str()),
                result.get("path").and_then(|v| v.as_str()),
            ) {
                let prev_content = result
                    .get("prevContent")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let prev_hash = result
                    .get("prevHash")
                    .and_then(|v| v.as_str())
                    .unwrap_or(tools::NEW_FILE_HASH)
                    .to_string();
                store::record_undo(
                    conn,
                    &task.task_id,
                    path,
                    prev_content,
                    &prev_hash,
                    new_hash,
                )?;
            }
```

**批准写分支**（`engine.rs:756-789`，`let result = match tools::apply_pending_patch(&scope, &pending) {...}` 之后、`push_changed` 之前）追加同样的代码块。

> 两处都要加。漏掉自主写路径会导致「同意所有」之后的写入撤不回来。

- [ ] **Step 7: 跑测试确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib agent_task_runtime -- --test-threads=1 --nocapture`
Expected: 全部 PASS

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/agent_task_runtime/store.rs src-tauri/src/agent_task_runtime/tools.rs src-tauri/src/agent_task_runtime/engine.rs
git commit -m "feat(atr): 撤销存储 —— 迁移 v4 建 agent_task_undo 表，每次写入记快照

- agent_task_undo 按 id 自增排序（created_at_ms 毫秒分辨率无法定序）
- apply_pending_patch 返回 prevContent/prevHash
- 自主写与批准写两条路径都落 undo 行
- mark_paths_undone 覆盖同 path 的其他任务记录，避免后续误报漂移

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 撤销命令（漂移保护 + 原子性）

**Files:**
- Modify: `src-tauri/src/agent_task_runtime/engine.rs`（新增 `undo_task_writes`）
- Modify: `src-tauri/src/agent_task_runtime/mod.rs`（新增 `api_undo`；**测试写在本文件的 `mod tests` 里**）
- Modify: `src-tauri/src/ipc/commands/shell/agent_task_runtime_cmd.rs`（新增 `cmd_agent_task_undo`）
- Modify: `src-tauri/src/lib.rs`（注册命令）
- Test: `src-tauri/src/agent_task_runtime/mod.rs` 内 `mod tests`

**Interfaces:**
- Consumes: Task 3 的 `store::list_undo` / `record_undo` / `mark_paths_undone`、`tools::NEW_FILE_HASH`、`scope::resolve_in_root`
- Produces:
  - `engine::undo_task_writes(conn: &mut Connection, task_id: &str) -> Result<TaskRow, String>`
    - 成功 → 返回更新后的 `TaskRow`
    - 无可撤销记录 → `Err("nothing_to_undo")`
    - 漂移 → `Err("file_changed_since_atr:<path1>,<path2>")`（**零写入**）
    - 写回校验失败 → `Err("undo_verify_failed")`
  - `mod::api_undo(task_id: &str) -> Result<TaskDto, String>`
  - IPC `cmd_agent_task_undo`，入参 `{ taskId }`

- [ ] **Step 1: 写失败测试**

放在 **`src-tauri/src/agent_task_runtime/mod.rs` 的 `mod tests`** 里（该模块已有 `tmp_db()` / `prep_ws()` / `git_commit_all()` 三个 helper，且 `api_*` 函数可直接调用）。**沿用 `mod.rs:962-993` 的 `repair_after_check_fail_reaches_done` 模式**：

```rust
    #[test]
    fn undo_restores_pre_task_content() {
        let db = tmp_db();
        store::set_test_db_path(Some(db.clone()));
        let (root, rel) = prep_ws();
        git_commit_all(&root);
        let dto = api_start(StartTaskRequest {
            goal: "undo single".into(),
            workspace_root: root.display().to_string(),
            permission_mode: Some("write_with_approval".into()),
            materials_summary: None,
            use_fake_driver: true,
            ..Default::default()
        })
        .unwrap();
        let mut driver = happy_path_fake_steps(&rel, "changed\n");
        let waiting = api_drive_fake(&dto.task_id, &mut driver).unwrap();
        assert_eq!(waiting.status, "waiting");
        let token = waiting.pending_approval_token.clone().unwrap();
        api_approve(ApprovePatchRequest {
            task_id: dto.task_id.clone(),
            approval_token: token,
            persist_autonomous: false,
            scope: None,
        })
        .unwrap();
        assert_eq!(fs::read_to_string(root.join(&rel)).unwrap(), "changed\n");

        // Undo → back to the pre-task content.
        let after = api_undo(&dto.task_id).unwrap();
        assert_eq!(fs::read_to_string(root.join(&rel)).unwrap(), "hello\n");
        // Undo does not invent a lifecycle transition — status is unchanged.
        assert_eq!(after.status, "verifying");
        let events = api_events(&dto.task_id).unwrap();
        assert!(
            events.iter().any(|e| e.kind == "undo_applied"),
            "undo_applied event missing"
        );
        store::set_test_db_path(None);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&db);
    }

    #[test]
    fn undo_same_file_twice_restores_first_write_state() {
        let db = tmp_db();
        store::set_test_db_path(Some(db.clone()));
        let (root, rel) = prep_ws();
        git_commit_all(&root);
        let dto = api_start(StartTaskRequest {
            goal: "undo twice".into(),
            workspace_root: root.display().to_string(),
            permission_mode: Some("write_with_approval".into()),
            materials_summary: None,
            use_fake_driver: true,
            ..Default::default()
        })
        .unwrap();
        // write #1 → waiting → approve
        let mut d1 = happy_path_fake_steps(&rel, "v1\n");
        let waiting = api_drive_fake(&dto.task_id, &mut d1).unwrap();
        assert_eq!(waiting.status, "waiting");
        let token = waiting.pending_approval_token.clone().unwrap();
        api_approve(ApprovePatchRequest {
            task_id: dto.task_id.clone(),
            approval_token: token,
            persist_autonomous: false,
            scope: None,
        })
        .unwrap();
        assert_eq!(fs::read_to_string(root.join(&rel)).unwrap(), "v1\n");
        // write #2 → task is autonomous now, so it writes without asking
        let mut d2 = happy_path_fake_steps(&rel, "v2\n");
        api_drive_fake(&dto.task_id, &mut d2).unwrap();
        assert_eq!(fs::read_to_string(root.join(&rel)).unwrap(), "v2\n");

        // Undo must restore the state BEFORE write #1 ("hello\n"),
        // NOT the intermediate "v1\n".
        api_undo(&dto.task_id).unwrap();
        assert_eq!(fs::read_to_string(root.join(&rel)).unwrap(), "hello\n");
        store::set_test_db_path(None);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&db);
    }

    #[test]
    fn undo_refuses_on_drift_and_writes_nothing() {
        let db = tmp_db();
        store::set_test_db_path(Some(db.clone()));
        let (root, rel) = prep_ws();
        git_commit_all(&root);
        let dto = api_start(StartTaskRequest {
            goal: "undo drift".into(),
            workspace_root: root.display().to_string(),
            permission_mode: Some("write_with_approval".into()),
            materials_summary: None,
            use_fake_driver: true,
            ..Default::default()
        })
        .unwrap();
        let mut driver = happy_path_fake_steps(&rel, "changed\n");
        let waiting = api_drive_fake(&dto.task_id, &mut driver).unwrap();
        let token = waiting.pending_approval_token.clone().unwrap();
        api_approve(ApprovePatchRequest {
            task_id: dto.task_id.clone(),
            approval_token: token,
            persist_autonomous: false,
            scope: None,
        })
        .unwrap();
        // User edits the file after ATR wrote it → hash no longer matches.
        fs::write(root.join(&rel), "user-edited\n").unwrap();

        let err = api_undo(&dto.task_id).unwrap_err();
        assert!(
            err.starts_with("file_changed_since_atr"),
            "err={err}"
        );
        // Must NOT have overwritten the user's edit.
        assert_eq!(fs::read_to_string(root.join(&rel)).unwrap(), "user-edited\n");
        store::set_test_db_path(None);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&db);
    }

    #[test]
    fn undo_without_writes_reports_nothing_to_undo() {
        let db = tmp_db();
        store::set_test_db_path(Some(db.clone()));
        let (root, _rel) = prep_ws();
        git_commit_all(&root);
        let dto = api_start(StartTaskRequest {
            goal: "no writes".into(),
            workspace_root: root.display().to_string(),
            permission_mode: Some("write_with_approval".into()),
            materials_summary: None,
            use_fake_driver: true,
            ..Default::default()
        })
        .unwrap();
        let err = api_undo(&dto.task_id).unwrap_err();
        assert_eq!(err, "nothing_to_undo");
        store::set_test_db_path(None);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&db);
    }
```

> `happy_path_fake_steps` 是 `engine.rs` 的 `pub fn`（`engine.rs:959`），`mod.rs` 的 `mod tests` 已 `use super::*` 能直接拿到。
> `prep_ws()` 造的工作区里 `hello.txt` 内容是 `"hello\n"`（`mod.rs:306-318`）—— 撤销后的期望值就是 `"hello\n"`。
> `ApprovePatchRequest` 在 Task 5 会加 `scope` 字段。**若 Task 4 先于 Task 5 执行，此处先写 `scope: None` 会编译失败** —— 两种顺序都可以：把 Task 5 提到 Task 4 之前执行，或在 Task 4 里先用 `..Default::default()` 之外的方式处理。**推荐执行顺序：Task 1 → 2 → 3 → 5 → 4 → 6 → 7 → 8 → 9**（先加字段再写用到它的测试）。

- [ ] **Step 2: 跑测试确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib agent_task_runtime::tests::undo -- --test-threads=1 --nocapture`
Expected: 编译失败，`cannot find function api_undo in this scope`

- [ ] **Step 3: 实现 undo_task_writes**

在 `src-tauri/src/agent_task_runtime/engine.rs` 的 `reject_patch` 函数之后追加：

```rust
/// Undo every write this task made.
///
/// Atomic: the drift pre-check covers ALL paths first. If any file changed
/// since ATR wrote it, nothing is written at all and the drifted paths are
/// reported. Restore is per-path: the OLDEST undo record for a path holds the
/// content from before this task first touched it — writing it back once
/// avoids leaving an intermediate state on disk.
pub fn undo_task_writes(conn: &mut Connection, task_id: &str) -> Result<TaskRow, String> {
    let mut task = get_task(conn, task_id)?.ok_or("task_not_found")?;
    let records = store::list_undo(conn, task_id)?;
    if records.is_empty() {
        return Err("nothing_to_undo".into());
    }
    let scope = load_scope(&task)?;

    // Group by path. `records` is id DESC → records[0] is the newest write.
    let mut groups: Vec<(String, Vec<store::UndoRecord>)> = Vec::new();
    for r in records {
        match groups.iter_mut().find(|(p, _)| *p == r.path) {
            Some((_, v)) => v.push(r),
            None => groups.push((r.path.clone(), vec![r])),
        }
    }

    // Drift pre-check — ALL paths, before ANY write.
    let mut drifted: Vec<String> = Vec::new();
    for (path, recs) in &groups {
        let newest = &recs[0];
        let abs = scope::resolve_in_root(&scope.root, path).map_err(|e| e.as_str().to_string())?;
        let current = if abs.is_file() {
            scope::file_hash(&abs)?
        } else {
            tools::NEW_FILE_HASH.to_string()
        };
        if current != newest.new_hash {
            drifted.push(path.clone());
        }
    }
    if !drifted.is_empty() {
        return Err(format!("file_changed_since_atr:{}", drifted.join(",")));
    }

    // Restore — oldest record per path holds the pre-task content.
    let mut restored: Vec<String> = Vec::new();
    let mut removed: Vec<String> = Vec::new();
    for (path, recs) in &groups {
        let oldest = recs.last().expect("group not empty");
        let abs = scope::resolve_in_root(&scope.root, path).map_err(|e| e.as_str().to_string())?;
        if oldest.prev_hash == tools::NEW_FILE_HASH {
            if abs.is_file() {
                std::fs::remove_file(&abs).map_err(|e| format!("undo_remove: {e}"))?;
            }
            removed.push(path.clone());
        } else {
            let content = oldest.prev_content.clone().ok_or("undo_missing_prev")?;
            if let Some(parent) = abs.parent() {
                if !parent.exists() {
                    std::fs::create_dir_all(parent).map_err(|e| format!("undo_mkdir: {e}"))?;
                }
            }
            std::fs::write(&abs, content).map_err(|e| format!("undo_write: {e}"))?;
            if scope::file_hash(&abs)? != oldest.prev_hash {
                return Err("undo_verify_failed".into());
            }
        }
        restored.push(path.clone());
    }

    store::mark_paths_undone(conn, &restored)?;
    // Clear the changed-files list: the task no longer owns those writes.
    // Status is deliberately NOT changed — undo is a user action, not a
    // lifecycle transition; inventing a new state would confuse the timeline.
    task.changed_files_json = "[]".into();
    commit_event(
        conn,
        &task,
        "undo_applied",
        Some("undo_task"),
        json!({
            "paths": restored,
            "removed": removed,
            "restoredCount": restored.len(),
        }),
    )
}
```

- [ ] **Step 4: 暴露 api_undo 与 IPC**

`src-tauri/src/agent_task_runtime/mod.rs`：

```rust
pub fn api_undo(task_id: &str) -> Result<TaskDto, String> {
    with_write(|conn| {
        engine::undo_task_writes(conn, task_id).map(|t| t.to_dto())
    })
}
```

（`engine` 在 `mod.rs` 中的别名以现有 import 为准 —— 若已是 `use engine::{...}` 形式，则写 `engine::undo_task_writes(...)`；若已把函数直接 re-export，则写 `undo_task_writes(...)`。**先读 `mod.rs` 顶部的 import 段。**）

`src-tauri/src/ipc/commands/shell/agent_task_runtime_cmd.rs`：

```rust
#[tauri::command]
pub fn cmd_agent_task_undo(args: TaskIdRequest) -> Result<TaskDto, String> {
    agent_task_runtime::api_undo(&args.task_id)
}
```

`src-tauri/src/lib.rs`：在 `ipc::cmd_agent_task_approve_patch,` 那一行后面追加：

```rust
            ipc::cmd_agent_task_undo,
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib agent_task_runtime -- --test-threads=1 --nocapture`
Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/agent_task_runtime/engine.rs src-tauri/src/agent_task_runtime/mod.rs src-tauri/src/ipc/commands/shell/agent_task_runtime_cmd.rs src-tauri/src/lib.rs
git commit -m "feat(atr): 任务级撤销命令 —— 全有或全无的漂移保护

- undo_task_writes：按 path 分组，取该 path 最早一条的 pre-image 单次写回
- 漂移预检覆盖全部 path，任一漂移则零写入并返回 file_changed_since_atr:<paths>
- 写回后校验 hash，不符则 undo_verify_failed
- 新增 IPC cmd_agent_task_undo

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 批准 scope 语义

**Files:**
- Modify: `src-tauri/src/agent_task_runtime/contracts.rs`（`ApprovePatchRequest.scope`）
- Modify: `src-tauri/src/agent_task_runtime/engine.rs`（`approve_patch` 按 scope 决定是否升级）
- Modify: `src-tauri/src/agent_task_runtime/mod.rs`（`api_approve` 透传 scope；**既有 `ApprovePatchRequest` 字面量补 `scope: None`**）
- Test: `src-tauri/src/agent_task_runtime/mod.rs` 内 `mod tests`

**Interfaces:**
- Consumes: 无
- Produces:
  - `ApprovePatchRequest.scope: Option<String>` —— `"one"` / `"task"` / `"global"`；`None` 走旧行为（升级为 autonomous）
  - `engine::approve_patch(conn, task_id, token, persist_autonomous, scope)` —— **`scope` 参数签名变化**

- [ ] **Step 1: 写失败测试**

在 `src-tauri/src/agent_task_runtime/mod.rs` 的 `mod tests` 内追加（沿用同文件 `repair_after_check_fail_reaches_done` 的模式）：

```rust
    #[test]
    fn approve_scope_one_keeps_task_in_approval_mode() {
        let db = tmp_db();
        store::set_test_db_path(Some(db.clone()));
        let (root, rel) = prep_ws();
        git_commit_all(&root);
        let dto = api_start(StartTaskRequest {
            goal: "scope one".into(),
            workspace_root: root.display().to_string(),
            permission_mode: Some("write_with_approval".into()),
            materials_summary: None,
            use_fake_driver: true,
            ..Default::default()
        })
        .unwrap();
        let mut driver = happy_path_fake_steps(&rel, "changed\n");
        let waiting = api_drive_fake(&dto.task_id, &mut driver).unwrap();
        assert_eq!(waiting.status, "waiting");
        let token = waiting.pending_approval_token.clone().unwrap();
        let after = api_approve(ApprovePatchRequest {
            task_id: dto.task_id.clone(),
            approval_token: token,
            persist_autonomous: false,
            scope: Some("one".into()),
        })
        .unwrap();
        assert_eq!(after.status, "verifying");
        // scope=one → the task must STAY in approval mode
        assert_eq!(after.permission_mode, "write_with_approval");
        store::set_test_db_path(None);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&db);
    }

    #[test]
    fn approve_scope_global_escalates_task_to_autonomous() {
        let db = tmp_db();
        store::set_test_db_path(Some(db.clone()));
        let (root, rel) = prep_ws();
        git_commit_all(&root);
        let dto = api_start(StartTaskRequest {
            goal: "scope global".into(),
            workspace_root: root.display().to_string(),
            permission_mode: Some("write_with_approval".into()),
            materials_summary: None,
            use_fake_driver: true,
            ..Default::default()
        })
        .unwrap();
        let mut driver = happy_path_fake_steps(&rel, "changed\n");
        let waiting = api_drive_fake(&dto.task_id, &mut driver).unwrap();
        let token = waiting.pending_approval_token.clone().unwrap();
        let after = api_approve(ApprovePatchRequest {
            task_id: dto.task_id.clone(),
            approval_token: token,
            persist_autonomous: true,
            scope: Some("global".into()),
        })
        .unwrap();
        assert_eq!(after.permission_mode, "write_autonomous");
        store::set_test_db_path(None);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&db);
    }

    #[test]
    fn approve_without_scope_keeps_legacy_escalation() {
        let db = tmp_db();
        store::set_test_db_path(Some(db.clone()));
        let (root, rel) = prep_ws();
        git_commit_all(&root);
        let dto = api_start(StartTaskRequest {
            goal: "scope legacy".into(),
            workspace_root: root.display().to_string(),
            permission_mode: Some("write_with_approval".into()),
            materials_summary: None,
            use_fake_driver: true,
            ..Default::default()
        })
        .unwrap();
        let mut driver = happy_path_fake_steps(&rel, "changed\n");
        let waiting = api_drive_fake(&dto.task_id, &mut driver).unwrap();
        let token = waiting.pending_approval_token.clone().unwrap();
        // scope omitted entirely → legacy behaviour (task becomes autonomous).
        let after = api_approve(ApprovePatchRequest {
            task_id: dto.task_id.clone(),
            approval_token: token,
            persist_autonomous: false,
            scope: None,
        })
        .unwrap();
        assert_eq!(after.permission_mode, "write_autonomous");
        store::set_test_db_path(None);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&db);
    }
```

> ⚠️ **既有字面量必须同步补字段**：`ApprovePatchRequest` 加了 `scope` 之后，`mod.rs` 里既有的两处 `ApprovePatchRequest { ... }` 字面量（`mod.rs:947` 与 `mod.rs:982` 附近）**没有 `..Default::default()`**，会编译失败。必须给它们补 `scope: None,`。
> 用 `grep -n "ApprovePatchRequest {" src-tauri/src/agent_task_runtime/` 把所有构造点找齐，逐个补 `scope: None,`（既有语义 = 旧行为 = 升级为 autonomous，与改前一致）。

- [ ] **Step 2: 跑测试确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib agent_task_runtime::tests::approve_scope -- --test-threads=1 --nocapture`
Expected: 编译失败，`ApprovePatchRequest` 没有 `scope` 字段

- [ ] **Step 3: 改 contracts.rs**

```rust
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ApprovePatchRequest {
    pub task_id: String,
    pub approval_token: String,
    /// Persist write_autonomous on this task (and callers persist for future starts).
    #[serde(default)]
    pub persist_autonomous: bool,
    /// "one"  → approve this single write; the task stays in write_with_approval.
    /// "task" → approve the rest of this task; the task becomes write_autonomous.
    /// "global"→ approve the rest of this task AND future tasks.
    /// `None` keeps the legacy behavior (task always becomes write_autonomous).
    #[serde(default)]
    pub scope: Option<String>,
}
```

- [ ] **Step 4: 改 engine.rs**

`approve_patch` 当前签名：

```rust
pub fn approve_patch(
    conn: &mut Connection,
    task_id: &str,
    token: &str,
    persist_autonomous: bool,
) -> Result<TaskRow, String> {
```

改为：

```rust
pub fn approve_patch(
    conn: &mut Connection,
    task_id: &str,
    token: &str,
    persist_autonomous: bool,
    scope: &str,
) -> Result<TaskRow, String> {
```

把当前的这两行：

```rust
    let _ = persist_autonomous;
    task.permission_mode = PermissionMode::WriteAutonomous.as_str().into();
```

替换为：

```rust
    let _ = persist_autonomous;
    // Escalate only when the caller asks for it. Default "one" keeps the task
    // in write_with_approval so the NEXT write also shows its diff.
    let escalate = match scope {
        "one" => false,
        "task" | "global" => true,
        // Unknown / legacy clients keep the old behavior.
        _ => true,
    };
    if escalate {
        task.permission_mode = PermissionMode::WriteAutonomous.as_str().into();
    }
```

- [ ] **Step 5: 改 mod.rs**

```rust
pub fn api_approve(req: ApprovePatchRequest) -> Result<TaskDto, String> {
    with_write(|conn| {
        eng_approve(
            conn,
            &req.task_id,
            &req.approval_token,
            req.persist_autonomous,
            req.scope.as_deref().unwrap_or(""),
        )
        .map(|t| t.to_dto())
    })
}
```

- [ ] **Step 6: 跑测试确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib agent_task_runtime -- --test-threads=1 --nocapture`
Expected: 全部 PASS

> 注意：既有测试若有依赖「批准后任务变 autonomous」的断言，需按新语义调整（默认 `scope` 为空 → 仍升级，行为不变）。

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/agent_task_runtime/contracts.rs src-tauri/src/agent_task_runtime/engine.rs src-tauri/src/agent_task_runtime/mod.rs
git commit -m "feat(atr): 批准语义加 scope —— 默认只批准这一次

approve_patch 新增 scope 参数：
- one（默认）→ 当前任务保持 write_with_approval，下一次写入仍出审批卡+diff
- task/global → 升级为 write_autonomous
- scope 缺省时保持旧行为，旧客户端不受影响

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 前端客户端与 store

**Files:**
- Modify: `src/js/features/now/home-agent-task.js`
- Modify: `src/js/features/now/home-agent-v2-store.js`
- Test: `scripts/test-atr-diff-undo.mjs`（新建，本 Task 先建骨架）

**Interfaces:**
- Consumes: Task 4 的 `cmd_agent_task_undo`、Task 5 的 scope
- Produces:
  - `OneToneHomeAgentTask.undo(taskId)` → `Promise<TaskDto>`
  - `OneToneHomeAgentTask.approvePatch(taskId, approvalToken, opts)` —— `opts.scope` 透传；`opts.scope` 缺省时按 `opts.persistAutonomous` 推导（true → `'global'`，false → `'one'`）
  - `store.undoAgentWrite()` → `Promise<TaskDto>`

- [ ] **Step 1: 写失败测试**

新建 `scripts/test-atr-diff-undo.mjs`：

```javascript
/**
 * ATR 第一期：diff 预览 + 任务级撤销 的前端契约。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function load(name) {
  return fs.readFileSync(path.join(root, 'src/js/features/now', name), 'utf8');
}

const sandbox = {
  console,
  localStorage: {
    store: {},
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null;
    },
    setItem(k, v) {
      this.store[k] = String(v);
    },
    removeItem(k) {
      delete this.store[k];
    }
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(load('home-agent-task.js'), sandbox);

const Task = sandbox.OneToneHomeAgentTask;
assert.ok(Task, 'OneToneHomeAgentTask missing');
assert.equal(typeof Task.undo, 'function');

// undo() must hit cmd_agent_task_undo with taskId
const calls = [];
sandbox.OneToneIpc = {
  invoke(cmd, payload) {
    calls.push({ cmd, payload });
    if (cmd === 'cmd_agent_task_undo') {
      return Promise.resolve({ taskId: 't1', status: 'review' });
    }
    return Promise.reject(new Error('unexpected:' + cmd));
  }
};
const dto = await Task.undo('t1');
assert.equal(dto.taskId, 't1');
assert.deepEqual(calls[0].cmd, 'cmd_agent_task_undo');
assert.equal(calls[0].payload.args.taskId, 't1');

// approvePatch must forward scope
calls.length = 0;
sandbox.OneToneIpc = {
  invoke(cmd, payload) {
    calls.push({ cmd, payload });
    return Promise.resolve({ taskId: 't1', status: 'verifying' });
  }
};
await Task.approvePatch('t1', 'tok', {});
assert.equal(calls[0].payload.args.scope, 'one');
calls.length = 0;
await Task.approvePatch('t1', 'tok', { persistAutonomous: true });
assert.equal(calls[0].payload.args.scope, 'global');
calls.length = 0;
await Task.approvePatch('t1', 'tok', { scope: 'one' });
assert.equal(calls[0].payload.args.scope, 'one');

// store must expose undoAgentWrite
const storeSrc = load('home-agent-v2-store.js');
assert.match(storeSrc, /undoAgentWrite/);
assert.match(storeSrc, /cmd_agent_task_undo|\.undo\(/);

console.log('test-atr-diff-undo: ok');
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node scripts/test-atr-diff-undo.mjs`
Expected: 失败，提示 `OneToneHomeAgentTask.undo is not a function`

- [ ] **Step 3: home-agent-task.js 加 undo 与 scope**

在 `src/js/features/now/home-agent-task.js` 的 `approvePatch` 函数处替换为：

```javascript
  /**
   * Approve the pending patch.
   * scope: 'one' (default) keeps the task in write_with_approval so the NEXT
   * write also shows its diff; 'global' escalates the task to autonomous.
   */
  function approvePatch(taskId, approvalToken, opts) {
    opts = opts || {};
    var scope = opts.scope || (opts.persistAutonomous ? 'global' : 'one');
    return invoke('cmd_agent_task_approve_patch', {
      taskId: String(taskId || ''),
      approvalToken: String(approvalToken || ''),
      persistAutonomous: !!opts.persistAutonomous,
      scope: String(scope)
    });
  }
```

并在 `rejectPatch` 之后追加：

```javascript
  /** Undo every write this task made. Atomic — all paths or none. */
  function undo(taskId) {
    return invoke('cmd_agent_task_undo', {
      taskId: String(taskId || '')
    });
  }
```

并在导出对象里加 `undo: undo,`（导出对象在 `home-agent-task.js` 末尾的 `global.OneToneHomeAgentTask = { ... }`）。

- [ ] **Step 4: store 加 undoAgentWrite**

在 `src/js/features/now/home-agent-v2-store.js` 的 `approveAgentPatch` 函数之后追加：

```javascript
  /** Undo all writes of the active task. Atomic — backend refuses on drift. */
  function undoAgentWrite() {
    var A = atrApi();
    var t = state.agentTask;
    if (!A || !t || !t.taskId) {
      return Promise.reject(new Error('no_active_task'));
    }
    return A.undo(t.taskId).then(function (dto) {
      state.agentTask = dto;
      if (state.agentTaskEvents && typeof A.events === 'function') {
        return A.events(t.taskId).then(function (evs) {
          state.agentTaskEvents = evs || [];
          return dto;
        });
      }
      return dto;
    });
  }
```

并在 store 的导出对象里加 `undoAgentWrite: undoAgentWrite,`。

- [ ] **Step 5: 跑测试确认通过**

Run: `node scripts/test-atr-diff-undo.mjs`
Expected: 输出 `test-atr-diff-undo: ok`

- [ ] **Step 6: Commit**

```bash
git add src/js/features/now/home-agent-task.js src/js/features/now/home-agent-v2-store.js scripts/test-atr-diff-undo.mjs
git commit -m "feat(atr): 前端客户端加 undo() 与 approve scope 透传

- home-agent-task.undo(taskId) → cmd_agent_task_undo
- approvePatch 支持 scope，缺省按 persistAutonomous 推导（one / global）
- store.undoAgentWrite() 撤销后刷新任务与事件
- 新增 scripts/test-atr-diff-undo.mjs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 审批卡内联 diff 渲染

**Files:**
- Modify: `src/js/features/now/home-agent-v2.js`（新增 `atrPendingDiffHtml` + 接入 `atrMainGateHtml`）
- Modify: `src/css/home-agent-v2.css`（新增 `.ha2-atr-diff*`）
- Test: `scripts/test-atr-diff-undo.mjs`

**Interfaces:**
- Consumes: Task 2 的 `TaskDto.pending_patch`
- Produces: `atrPendingDiffHtml(snap)` → HTML 字符串；命中选择器 `[data-ha2-atr-diff]`

- [ ] **Step 1: 写失败测试**

在 `scripts/test-atr-diff-undo.mjs` 末尾（`console.log` 之前）追加：

```javascript
// ---- approval card renders the pending diff ----
const uiSrc = load('home-agent-v2.js');
assert.match(uiSrc, /function atrPendingDiffHtml/);
assert.match(uiSrc, /data-ha2-atr-diff/);
assert.match(uiSrc, /pendingPatch/);
assert.match(uiSrc, /atrPendingDiffHtml\(snap\)/);

const cssSrc = fs.readFileSync(path.join(root, 'src/css/home-agent-v2.css'), 'utf8');
assert.match(cssSrc, /\.ha2-atr-diff\b/);
assert.match(cssSrc, /\.ha2-atr-diff-row\.is-add/);
assert.match(cssSrc, /\.ha2-atr-diff-row\.is-del/);
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node scripts/test-atr-diff-undo.mjs`
Expected: 失败，`cannot find function atrPendingDiffHtml`

- [ ] **Step 3: 实现 atrPendingDiffHtml**

在 `src/js/features/now/home-agent-v2.js` 的 `atrStagesHtml` 函数之后插入：

```javascript
  /**
   * Approval card diff — shows WHAT changes before the user approves.
   * Reads TaskDto.pending_patch (display-only line diff).
   * Renders at most MAX_DIFF_ROWS rows; beyond that we say so instead of
   * dumping thousands of lines into the DOM.
   */
  var ATR_DIFF_MAX_ROWS = 500;

  function atrPendingDiffHtml(snap) {
    var task = snap && snap.agentTask;
    var pp = task && (task.pendingPatch || task.pending_patch);
    if (!pp) return '';
    var path = String(pp.path || '');
    var diff = String(pp.diff || '');
    var added = Number(pp.added || 0);
    var removed = Number(pp.removed || 0);
    var risk = String(pp.risk || '');
    var rationale = String(pp.rationale || '');
    var isNew = !!pp.isNewFile;
    if (!path && !diff) return '';

    var stat = isNew
      ? t('ha2AtrDiffNewFile', '新建文件') + ' · +' + added + ' 行'
      : '+' + added + ' −' + removed + ' 行';
    var meta = [];
    if (risk) meta.push(t('ha2AtrDiffRisk', '风险') + ' ' + risk);
    if (rationale) meta.push(rationale);

    var rows = '';
    if (diff) {
      var lines = diff.split('\n');
      var shown = lines.slice(0, ATR_DIFF_MAX_ROWS);
      for (var i = 0; i < shown.length; i++) {
        var ln = shown[i];
        if (!ln && i === shown.length - 1) continue;
        var cls = 'ha2-atr-diff-row';
        if (ln.indexOf('@@') === 0) cls += ' is-hunk';
        else if (ln.charAt(0) === '+') cls += ' is-add';
        else if (ln.charAt(0) === '-') cls += ' is-del';
        else cls += ' is-ctx';
        rows += '<div class="' + cls + '">' + esc(ln) + '</div>';
      }
      if (lines.length > ATR_DIFF_MAX_ROWS) {
        rows +=
          '<div class="ha2-atr-diff-more">' +
          esc(
            t(
              'ha2AtrDiffTruncated',
              '改动过大，仅显示前 ' + ATR_DIFF_MAX_ROWS + ' 行（完整内容见导出日志）'
            )
          ) +
          '</div>';
      }
    }

    return (
      '<details class="ha2-atr-diff" data-ha2-atr-diff>' +
      '<summary class="ha2-atr-diff-sum">' +
      esc(path) +
      ' · ' +
      esc(stat) +
      (meta.length ? ' · ' + esc(meta.join(' · ')) : '') +
      '</summary>' +
      (rows ? '<div class="ha2-atr-diff-body">' + rows + '</div>' : '') +
      '</details>'
    );
  }
```

- [ ] **Step 4: 接入审批卡**

在 `src/js/features/now/home-agent-v2.js` 的 `atrMainGateHtml` 中，把：

```javascript
      atrStagesHtml(snap) +
```

改为：

```javascript
      atrStagesHtml(snap) +
      atrPendingDiffHtml(snap) +
```

（该 `atrStagesHtml(snap) +` 只在 `atrMainGateHtml` 里出现一次；若出现多次，只改 `atrMainGateHtml` 内的那一处。）

- [ ] **Step 5: 加 CSS**

在 `src/css/home-agent-v2.css` 的 `.ha2-atr-stage-note` 那条规则之后插入：

```css
/* Approval diff — line-level, collapsed by default */
.ha2-atr-diff{
  width:100%;margin-top:8px;padding:6px 0 0;border-top:1px solid var(--ha2-line);
}
.ha2-atr-diff-sum{
  cursor:pointer;user-select:none;font-size:11.5px;line-height:1.4;color:var(--ha2-muted);
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}
.ha2-atr-diff-sum::before{content:'▸';font-size:10px;color:var(--ha2-accent);margin-right:6px}
.ha2-atr-diff[open]>.ha2-atr-diff-sum::before{content:'▾'}
.ha2-atr-diff-body{
  margin-top:6px;padding:6px 8px;border-radius:8px;
  border:1px solid var(--ha2-line);
  background:color-mix(in srgb, var(--ha2-muted) 8%, var(--ha2-surface));
  max-height:320px;overflow:auto;
}
.ha2-atr-diff-row{
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  font-size:11px;line-height:1.55;white-space:pre-wrap;word-break:break-word;
  color:var(--ha2-muted);
}
.ha2-atr-diff-row.is-add{color:var(--ha2-ok)}
.ha2-atr-diff-row.is-del{color:var(--ha2-err)}
.ha2-atr-diff-row.is-hunk{color:var(--ha2-muted);opacity:.75}
.ha2-atr-diff-more{font-size:11px;color:var(--ha2-muted);margin-top:4px}
```

- [ ] **Step 6: 跑测试确认通过**

Run: `node scripts/test-atr-diff-undo.mjs`
Expected: 输出 `test-atr-diff-undo: ok`

- [ ] **Step 7: Commit**

```bash
git add src/js/features/now/home-agent-v2.js src/css/home-agent-v2.css scripts/test-atr-diff-undo.mjs
git commit -m "feat(atr): 审批卡内联折叠行级 diff

- atrPendingDiffHtml(snap) 读 TaskDto.pending_patch
- summary 常驻显示 路径 · +N −M 行 · 风险 · 理由
- 展开显示行级 +/-，最多 500 行，超出给截断提示
- 新增 .ha2-atr-diff 系列样式，沿用现有 CSS 变量

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 撤销入口 + 批准按钮 scope

**Files:**
- Modify: `src/js/features/now/home-agent-v2.js`（按钮文案与 scope、`atrLogCardHtml` 加撤销按钮、事件委托）
- Test: `scripts/test-atr-diff-undo.mjs`

**Interfaces:**
- Consumes: Task 6 的 `store.undoAgentWrite`
- Produces: 命中选择器 `[data-ha2-atr-undo]`；审批按钮 `data-ha2-atr-approve` 传 scope `'one'`、`data-ha2-atr-approve-all` 传 scope `'global'`

- [ ] **Step 1: 写失败测试**

在 `scripts/test-atr-diff-undo.mjs` 末尾追加：

```javascript
// ---- approve button scopes + undo entry ----
assert.match(uiSrc, /data-ha2-atr-undo/);
assert.match(uiSrc, /ha2AtrApproveOnce|批准这一次/);
assert.match(uiSrc, /ha2AtrApproveAll|以后都不问/);
assert.match(uiSrc, /undoAgentWrite/);
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node scripts/test-atr-diff-undo.mjs`
Expected: 失败，`data-ha2-atr-undo` 未匹配

- [ ] **Step 3: 改审批按钮**

在 `src/js/features/now/home-agent-v2.js` 的 `atrActsHtml` 中，把 waiting 分支的三个按钮改为：

```javascript
      if (atrNeedsApproval(snap) && atrPendingApprovalToken(snap)) {
        acts.push(
          '<button type="button" class="ha2-btn primary" data-ha2-atr-approve>' +
            esc(t('ha2AtrApproveOnce', '批准这一次')) +
            '</button>'
        );
        acts.push(
          '<button type="button" class="ha2-btn" data-ha2-atr-approve-all>' +
            esc(t('ha2AtrApproveAll', '以后都不问')) +
            '</button>'
        );
        acts.push(
          '<button type="button" class="ha2-btn" data-ha2-atr-reject>' +
            esc(t('ha2AtrRejectPlan', '拒绝方案')) +
            '</button>'
        );
      }
```

> 保持 `data-ha2-atr-approve` / `data-ha2-atr-approve-all` 这两个属性名不变 —— 事件委托与既有测试脚本（`test-atr-send-conflict.mjs` 等）依赖它们。只改文案与传参。

在 `home-agent-v2.js` 的事件委托里，`data-ha2-atr-approve` 分支（约 `home-agent-v2.js:12212`）改为传 scope：

```javascript
    if (tEl.hasAttribute('data-ha2-atr-approve')) {
      if (S && S.approveAgentPatch) {
        S.approveAgentPatch({ scope: 'one' });
      }
      return;
    }
```

`data-ha2-atr-approve-all` 分支（约 `home-agent-v2.js:12199`）改为：

```javascript
    if (tEl.hasAttribute('data-ha2-atr-approve-all')) {
      if (S && S.approveAgentPatch) {
        S.approveAgentPatch({ scope: 'global', persistAutonomous: true });
      }
      return;
    }
```

并在 `src/js/features/now/home-agent-v2-store.js` 的 `approveAgentPatch` 里把 scope 透传给 `A.approvePatch`：

```javascript
    return A.approvePatch(t.taskId, token, {
      persistAutonomous: !!opts.persistAutonomous,
      scope: opts.scope || (opts.persistAutonomous ? 'global' : 'one')
    }).then(function (dto) {
```

- [ ] **Step 4: 加撤销按钮**

在 `src/js/features/now/home-agent-v2.js` 的 `atrLogCardHtml` 中，找到渲染「已写入文件」的位置，在该区域追加一个按钮：

```javascript
        '<div class="ha2-atr-undo-row">' +
          '<button type="button" class="ha2-btn" data-ha2-atr-undo>' +
          esc(t('ha2AtrUndoTask', '撤销本任务的所有写入')) +
          '</button></div>' +
```

> 若该任务没有任何未撤销的写入记录（老任务 / 已撤销过），不渲染这个按钮。
> `atrLogCardHtml` 当前拿到的是 `item`（含 `task` 与 `events`）。判断条件用 `task.changedFiles && task.changedFiles.length` —— 撤销后后端会把 `changed_files` 清空，所以这个条件天然成立"有写入才可撤"。

在 `home-agent-v2.js` 的事件委托选择器串（`home-agent-v2.js:11953`）里**追加** `data-ha2-atr-undo`（只追加，不重排该串）：

```
[data-ha2-atr-undo]
```

并加处理分支：

```javascript
    if (tEl.hasAttribute('data-ha2-atr-undo')) {
      // Same guard shape the project already uses (composer-history-panel.js:456,
      // home-agent-v2.js:8364): a missing confirm() must not block the action.
      var okUndo = global.confirm
        ? global.confirm(t('ha2AtrUndoConfirm', '撤销本任务写入的所有文件？此操作不可再次撤销。'))
        : true;
      if (!okUndo) {
        return;
      }
      if (S && S.undoAgentWrite) {
        S.undoAgentWrite().then(
          function () {
            if (S && S.refresh) S.refresh('local');
          },
          function (err) {
            var msg = String((err && err.message) || err || '');
            if (msg.indexOf('file_changed_since_atr') === 0) {
              var paths = msg.slice('file_changed_since_atr:'.length).split(',').filter(Boolean);
              if (S && S.setValidationNotice) {
                S.setValidationNotice({
                  kind: 'atr_undo_drift',
                  code: 'file_changed_since_atr',
                  message: t(
                    'ha2AtrUndoDrift',
                    '以下文件在写入后又被改动，未撤销：' + paths.join('、')
                  )
                });
              }
            } else if (msg === 'nothing_to_undo') {
              if (S && S.setValidationNotice) {
                S.setValidationNotice({
                  kind: 'atr_undo_empty',
                  code: 'nothing_to_undo',
                  message: t('ha2AtrUndoNothing', '这个任务没有可撤销的写入。')
                });
              }
            } else if (S && S.setValidationNotice) {
              S.setValidationNotice({
                kind: 'atr_undo_failed',
                code: 'undo_failed',
                message: t('ha2AtrUndoFailed', '撤销失败：' + msg)
              });
            }
          }
        );
      }
      return;
    }
```

- [ ] **Step 5: 跑测试确认通过**

Run: `node scripts/test-atr-diff-undo.mjs`
Expected: 输出 `test-atr-diff-undo: ok`

- [ ] **Step 6: Commit**

```bash
git add src/js/features/now/home-agent-v2.js src/js/features/now/home-agent-v2-store.js scripts/test-atr-diff-undo.mjs
git commit -m "feat(atr): 批准按钮 scope 化 + 任务级撤销入口

- 「批准这一次」scope=one，「以后都不问」scope=global
- 任务日志卡加「撤销本任务的所有写入」，带确认与漂移/空记录提示
- 撤销按钮仅在任务有写入时出现

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 全量回归 + 文档更新

**Files:**
- Modify: `docs/home-agent-capability-matrix.md`
- Modify: `package.json`（加 `test:atr-diff-undo` 脚本）

**Interfaces:**
- Consumes: 全部前序 Task
- Produces: npm 脚本 `test:atr-diff-undo`；能力矩阵更新

- [ ] **Step 1: 加 npm 脚本**

在 `package.json` 的 `scripts` 里，`"test:home-agent-v2": ...` 那行附近追加：

```json
    "test:atr-diff-undo": "node scripts/test-atr-diff-undo.mjs",
```

- [ ] **Step 2: 跑 Rust 全量**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib agent_task_runtime -- --test-threads=1 --nocapture`
Expected: 全部 PASS，无 FAIL

- [ ] **Step 3: 跑 ATR 前端脚本全量**

Run:

```powershell
node scripts/test-atr-diff-undo.mjs
node scripts/test-atr-home-edit-loop.mjs
node scripts/test-atr-provider-switch.mjs
node scripts/test-atr-send-conflict.mjs
node scripts/test-atr-phase-e-flag.mjs
node scripts/test-atr-phase-f-export.mjs
node scripts/test-work-atr-gate7.mjs
node scripts/test-home-resume-honesty.mjs
node scripts/test-controller-ownership.mjs
node scripts/test-runtime-gates.mjs
node scripts/test-run-contracts.mjs
```

Expected: 每个都输出 `ok` 且退出码 0

- [ ] **Step 4: 跑首页相关脚本**

Run:

```powershell
node scripts/test-home-agent-v2.mjs
node scripts/test-home-assist-ownership.mjs
node scripts/test-home-assist-ipc-contract.mjs
node scripts/test-home-project-context.mjs
```

Expected: 全部 PASS

- [ ] **Step 5: 更新能力矩阵**

在 `docs/home-agent-capability-matrix.md` 的「Agent Task Runtime」小节追加：

```markdown
### 第一期：看得见 + 撤得回

```text
pending_patch 投影: implemented（TaskDto.pending_patch；不含 new_content）
审批卡行级 diff: implemented（默认折叠；+N −M 行；风险；理由；最多 500 行）
edit_file 行级工具: not_wired（第二期）
任务级撤销: implemented（全有或全无；漂移即拒绝并列出漂移文件）
文件级撤销: not_wired（第二期；数据模型已支持）
撤销排序: id 自增主键（非 created_at_ms）
批准 scope: one（默认，只批准这一次）/ task / global
```

- **排序依据**：`id` 自增主键。`created_at_ms` 毫秒分辨率无法为同毫秒的多次写入定序。
- **撤销原子性**：漂移预检覆盖全部 path，任一漂移则零写入。
- **patch_hash 不变**：`unified_replace_preview` 未改动；diff 为独立字段，仅用于展示。
```

- [ ] **Step 6: Commit**

```bash
git add package.json docs/home-agent-capability-matrix.md
git commit -m "docs(atr): 能力矩阵补第一期状态 + 加 test:atr-diff-undo 脚本

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec 覆盖**

| Spec §3 条目 | Task |
|---|---|
| 3.1.1 真行级 diff + 不动 patch_hash | Task 1 |
| 3.1.2 PendingPatch 扩展 + DTO 投影 | Task 2 |
| 3.1.3 撤销存储（迁移 v4） | Task 3 |
| 3.1.4 撤销命令（排序 / 恢复算法 / 跨任务） | Task 3（存储）+ Task 4（算法） |
| 3.1.5 漂移保护与冲突提示 | Task 4（后端）+ Task 8（前端提示） |
| 3.1.6 undo_applied 事件 | Task 4 |
| 3.2 批准 scope 语义 | Task 5（后端）+ Task 8（前端按钮） |
| 3.3.1 审批卡内联 diff | Task 7 |
| 3.3.2 撤销入口 | Task 8 |
| 3.3.3 接线 | Task 6（客户端/store）+ Task 8（委托） |
| 3.4 数据流 | Task 2/3/4/5/8 组合实现 |
| 3.5 错误处理 | Task 4（后端码）+ Task 8（前端提示） |
| 3.6 测试 | Task 1/2/3/4/5/6/7/8 各自含测试 + Task 9 回归 |
| 3.7 观测数据 | diff 的 added/removed 随 Task 2 落进事件流 ✓ |

**未覆盖的 spec 条目**：无。第二期内容（`edit_file`、文件级撤销、观测判据）不在本计划范围。

**类型一致性**

- `unified_line_diff(old: &str, new: &str) -> (String, DiffStats)` —— Task 1 定义，Task 2 调用，签名一致。
- `DiffStats { added: usize, removed: usize }` —— Task 1 定义；Task 2 转 `u32` 存入 `PendingPatch.added/removed`；Task 7 从 DTO 读回。✓
- `PendingPatch` 5 个新字段 —— Task 2 定义，Task 3 依赖 `prev_content`/`prev_hash`（来自 Task 3 的 apply 返回值，不是 PendingPatch 字段）。✓
- `PendingPatchView` 10 个字段 —— Task 2 定义，`TaskDto.pending_patch` 引用，Task 7 通过 `pp.added` / `pp.removed` / `pp.risk` / `pp.rationale` / `pp.diff` / `pp.path` / `pp.isNewFile` 读取。Task 2 的 `to_view` 产出 `is_new_file` → serde camelCase → JS 读 `isNewFile`。✓
- `store::UndoRecord` 字段 —— Task 3 定义，Task 4 用 `path` / `prev_content` / `prev_hash` / `new_hash` / `id`。✓
- `cmd_agent_task_undo` —— Task 4 定义 IPC，Task 6 FE 调用。✓
- `ApprovePatchRequest.scope: Option<String>` —— Task 5 定义，Task 6 FE 发送 `scope: 'one' | 'global'`。✓
- `engine::approve_patch(conn, task_id, token, persist_autonomous, scope)` —— Task 5 定义；`mod.rs::api_approve` 调用。✓

**已知需在实现时对齐的既有代码点**（计划中已标注"先读 X"）：

- `mod.rs` 的 `mod tests` 里既有的三个 helper：`tmp_db()`（`mod.rs:292`）、`prep_ws()`（`mod.rs:306`，工作区里 `hello.txt` = `"hello\n"`）、`git_commit_all()`（`mod.rs:320`）。Task 4 / Task 5 的测试全部用这套模式。
- `engine.rs::happy_path_fake_steps(rel, content)`（`engine.rs:959`）—— inspect → read → propose → apply 的脚本步。Task 4 的"同文件写两次"测试直接复用它驱动两次。
- `store.rs` 的 `with_conn_at(&path, |conn| {...})` 测试模式（`store.rs:757` 起）。Task 3 的 store 测试照抄。
- `mod.rs` 里既有的 `ApprovePatchRequest { ... }` 字面量（`mod.rs:947`、`mod.rs:982` 附近）**没有 `..Default::default()`** —— Task 5 加字段后必须逐个补 `scope: None,`。
- `mod.rs` 顶部的 `engine` import 形式（Task 4 Step 4）。`api_approve` 现用 `eng_approve(...)` 别名，撤销函数若不在 `use` 列表里需补 `use engine::undo_task_writes;` 或写全路径。
- `atrActsHtml` 里 `data-ha2-atr-approve` 出现**两次**（冲突分支 + 普通分支）—— Task 8 Step 3 两处都要改。
- `atrLogCardHtml` 中「已写入文件」区域的确切位置（Task 8 Step 4）。
- `home-agent-v2-store.js` 的 `approveAgentPatch` 现有实参（Task 8 Step 3 改传 scope）。
- CSS 变量全集见 `home-agent-v2.css:2-13`：`--ha2-bg` / `--ha2-surface` / `--ha2-ink` / `--ha2-muted` / `--ha2-line` / `--ha2-accent` / `--ha2-ok` / `--ha2-err` / `--ha2-warn`。背景一律用 `var(--ha2-surface)` 或 `color-mix(in srgb, var(--ha2-X) N%, var(--ha2-surface))`，**不要把 `--ha2-line` 当背景色用**（它是半透明描边色）。
- **用户可见错误提示走 `S.setValidationNotice({ kind, code, message })`**（store 侧 `home-agent-v2-store.js:3200`，渲染侧 `validationNoticeHtml`，`home-agent-v2.js:5565`）。**本项目全库不使用 `global.alert`** —— 不要引入。
- **确认弹窗用 `global.confirm ? global.confirm(...) : true` 守卫**（既有写法：`composer-history-panel.js:456`、`home-agent-v2.js:8364`、`home-agent-v2.js:11167`）。
