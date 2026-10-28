# OneTone Phase2：按任务读取工程上下文 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 当前交付是计划，不代表已授权执行代码修改。执行时先重新核对工作区，保护已有未提交改动。

**Goal:** 用户能将项目名片、指定代码片段、真实 Git 改动和有限搜索结果加入 Phase1 材料，生成有来源的编程任务并交接。

**Architecture:** 增加本地只读 Project Context 服务；读取结果先进入可预览的候选材料，再经现有 Prep、出站快照、Assist 和发送流程。读取授权、远程发送许可和代码 Agent 执行是三个独立边界。Phase2 不新增聊天会话或模型自主工具循环。

**Tech Stack:** Tauri 2、Rust/Tokio、现有原生 JavaScript 页面、serde、sha2、受限 Git 子进程。忽略规则建议引入 Rust `ignore` crate，执行前确认依赖政策；不加入向量库或模型 SDK。

**Spec:** 本文“范围与契约”是 Phase2 设计提案；延续 `docs/home-agent-workbench-prompt.md` 与 `docs/home-agent-capability-matrix.md`，实现前读取两份文档及本计划。下列预算是本计划建议默认值，不是现有产品承诺。

## Global Constraints

- Windows 优先；复用 Phase1 原稿、整理稿、当前 body 发送依据、版本守卫和投递回执。
- 本地文件读取不自动触发远程模型调用；工程材料只有经用户选入后才进入出站快照。
- 本阶段提供工程证据与辅助建议；不修改工程文件，不运行项目脚本、测试或任意用户命令。
- Git 子进程仅执行固定只读操作；不向前端或模型暴露通用命令接口。
- 工程正文、路径、搜索词不进入诊断日志；已有草稿保存策略不随本阶段扩展成全库缓存。
- 不自动开启计量调用。无模型、无网络时，项目名片、片段收集、搜索和交接仍可工作。
- 文档说明、代码与日志均作为材料处理；规则文件不能授予更多权限、改变发送策略或触发执行。
- 主窗口是第一版 Project Context IPC 唯一入口；已有 Soft Pad 继续通过材料流程消费结果。

## Review Focus

1. Windows junction / reparse point / 大小写 / 同名前缀目录 / ADS 导致越界读取：Task 1 覆盖。
2. 项目切换或撤销授权后迟到读取结果混入另一项目：Task 2 覆盖。
3. 片段被旧 400 字符裁剪切掉错误现场，或预览与远程正文不同：Task 2 覆盖。
4. staged、unstaged、已删除文件和历史快照混淆：Task 4 覆盖。
5. 文件修改、撤销材料后旧整理稿仍携带过时或已排除证据：Task 6 覆盖。

## 1. 范围与交付顺序

| 阶段 | 用户可见结果 | 完成边界 |
| --- | --- | --- |
| 2A：工程材料 | 选项目后生成项目名片，预览并加入指定文件片段，再整理和交接 | 可先独立交付；不依赖 Git 或模型在线 |
| 2B：改动证据 | 选择暂存或未暂存改动，加入具体文件的 Diff | 不把 Git 工作区变化归因于某个 Agent |
| 2C：有限补查 | 用报错关键词或符号搜索，选择命中上下文加入材料 | 用户触发，每次有固定预算，无自主循环 |

一期推荐首发 2A；随后依次验收 2B、2C。不等待全库理解，也不为这些能力新增首页模式选择器。

### 现状与必须处理的衔接点

- `home-assist-ownership.js` 已有快照与引用模式，但 excerpt 目前按前 400 字符截取；不能直接用来传指定代码行。
- `home-prompt-prep.js::addMaterial` 只复制固定字段，新 provenance 元数据必须显式接入，否则会丢失。
- `home-assist-client.js` 的 run/cancel/ready 传参需与 `assist_runtime_cmd.rs` 核对：目前前端平铺参数，而 Rust 使用名为 args 的参数；`core/ipc.js` 仅转换字段命名，不增加 args 包装。
- `agent_memory::workspace_evidence` 用于推断项目位置，不是文件读取授权；`cmd_home_confirm_project` 也不代表允许读取。
- `time_machine::DiffSummary` 仅含统计、路径与状态，没有 patch；本阶段不能把它当作真实 Diff 正文。
- 上轮“通过”依据是提供的完成报告；计划前置包含独立联调，不据此假定完整桌面链路已通过。

## 2. 读取范围与材料契约

### 本地读取授权

建议用户动作“读取此项目”调用主窗口的本地目录选择流程，后端创建随机 `scopeId`，绑定调用窗口、`taskScopeId`、规范化根目录和根目录身份。界面已有项目可以作为选择器初始位置，但不能只凭前端路径字符串取得权限。

- 每次读、列目录、搜索、Diff 和验证都以 scope 查后端根目录，不接受任意绝对路径。
- 相对路径拒绝 `..`、绝对路径、盘符、UNC、设备路径、ADS；使用路径组件验证，不能字符串 startsWith。
- 第一版不穿越 symlink/junction/reparse point，不进入嵌套仓库和子模块，不扩大到选定目录的父级仓库。
- 打开文件后核对句柄实际路径及根目录身份再读取，避免“先 canonicalize、后重新按字符串打开”的检查竞态；Windows 使用句柄最终路径检查。异常或无法保证边界时拒绝读取。
- 撤销、窗口销毁或任务切换后 scope 失效；正在执行的操作停止继续读取，已返回材料保留但标注失去实时校验能力。重启不恢复读取授权。
- `.gitignore`、`.ignore` 和可选 `.onetoneignore` 生效；默认排除 `.git`、node_modules、target、dist、build、二进制和敏感文件（.env 系列、私钥、证书、凭据配置）。第一版不提供忽略规则绕过。用户已有手动材料不因此被静默删除。
- 排除策略降低误采集风险，不承诺自动识别所有秘密；发送前仍有准确预览。

### 预算（后端硬上限，调用方只能收紧）

| 操作 | 建议限制 |
| --- | --- |
| 每窗口并发 | 1 个本地上下文操作；新请求返回 busy 或显式取消旧操作 |
| 名片目录概览 | 深度 3、遍历最多 2,000 项、显示最多 150 项、总时限 2 秒 |
| 单文件读取 | 文件上限 1 MiB；单次片段最多 200 行、16 KiB；总时限 3 秒 |
| 项目名片 | 来源最多 8 个；来源正文合计 64 KiB；生成名片最多 4 KiB |
| Git 差异 | 单文件最多 32 KiB patch；列表最多 100 个；总时限 3 秒 |
| 搜索 | 单关键词最多 128 字符；检查最多 500 个合规文件、内容合计 8 MiB；最多 30 个命中；总时限 3 秒 |
| 候选材料加入 | 单次材料包最多 16 KiB 正文；Assist 全请求仍遵守其现有后端有效预算 |

所有上限返回 `truncated`、`limitReason`、实际范围与扫描计数。列目录与搜索可以返回明确标注的部分结果；读取片段截断需用户看到并确认实际范围；模型请求超预算阻止提交并提示减少材料，不静默删正文。长行、UTF-8、BOM 单独处理，首版对不支持编码返回明确原因。

### EvidenceRecord（本地）

```text
schemaVersion: 1
id: string                   // 稳定证据 ID，同版本引用不重分配
scopeId / taskScopeId: string
kind: passport | file_excerpt | git_diff | search_excerpt
label: string
relativePath: string?         // 本地定位；发送是否携带由策略决定
range: { startLine, endLine }? // 一基、闭区间，原文件行号
content: string              // 已选择的精确片段
sourceVersion: string        // 内容 hash + 身份/基线信息；不能仅 mtime
sourceRefs: SourceRef[]       // 名片可引用多个来源
capturedAt: string
truncated: boolean
limitReason: string?
freshness: captured | fresh | changed | missing | unverifiable
git: { mode: staged|unstaged, baseOid?, beforeHash, afterHash }?
```

本地来源与出站引用分开序列化：默认只携带材料 ID、普通显示名和正文；只有用户允许路径时才携带相对路径与行号，绝对根路径默认留在本机。检查 name/source 等字段不能间接泄露被排除的路径。正文自身含路径不作自动语义脱敏，准确显示给用户。

Prep 保存 provenance 与精确 excerpt 字段，加入证据才递增 contentRevision。候选预览不污染草稿或当前材料。搜索命中只是候选；加入前重新读取并核对版本。

## 3. IPC 与模块边界

新增后端 `src-tauri/src/project_context/`：

- `contracts.rs`：请求、结果、固定错误、预算与 EvidenceRecord。
- `scope.rs`：窗口绑定、目录选择、授权与撤销、操作取消。
- `reader.rs`：忽略规则、路径/句柄验证、限量读取、指纹。
- `passport.rs`：确定性提取项目名片，不调用模型。
- `git_evidence.rs`：固定只读 Git 操作、边界与差异快照。
- `search.rs`：有预算的普通字符串搜索，无模型自由工具调用。
- `mod.rs` 与 `tests.rs`：入口、集成与临时工程测试。

新增 `src-tauri/src/ipc/commands/shell/project_context_cmd.rs`。所有命令显式取得 Tauri 调用窗口；统一使用 `{ args: ... }` 参数包装，窗口身份由后端注入。

```text
cmd_project_context_open(args: { taskScopeId, suggestedRoot? })
  -> { scopeId, taskScopeId, displayName, canonicalRoot }
cmd_project_context_close(args: { scopeId }) -> { closed: boolean }
cmd_project_context_query(args: { scopeId, taskScopeId, requestId, query })
  -> { requestId, scopeId, taskScopeId, result, truncated, limitReason?, usage }
cmd_project_context_cancel(args: { scopeId, requestId }) -> { state }
```

`query` 是封闭枚举：`passport`、`list_files { relativeDir }`、`read_excerpt { relativePath,startLine,endLine }`、`git_changes { mode }`、`git_diff { mode,relativePath,expectedVersion }`、`search { literal,relativeDir? }`、`validate { evidenceIds }`。每个分支只有定义的参数，不能传 shell、通用命令或任意 Git ref。错误固定为 `scope_required/scope_revoked/wrong_owner/invalid_path/excluded/not_found/unsupported_encoding/too_large/changed/not_git/git_unavailable/busy/cancelled/timeout/io_error`。

前端新增 `home-project-context.js`：管理临时候选、IPC 请求和选入动作，不另建已采用材料的持久化状态源。接口：

```text
openProject(taskScopeId, suggestedRoot?) -> Promise<Scope>
closeProject(scopeId) -> Promise<void>
queryContext(query) -> Promise<QueryResult>
adoptEvidence(evidenceRecord) -> Material | null
validateIncludedEvidence() -> Promise<ValidationReport>
```

扩展 `Prep.addMaterial` 的 provenance/excerptText；增加 `Prep.refreshEvidenceMaterial(materialId,evidenceRecord)`，保留 included/citeMode/用户说明，更新正文和版本并触发 stale。

## 4. 可执行任务

### Task 0：补齐 Phase1 的真实 IPC 基线

**Files:** `src/js/features/now/home-assist-client.js`、`src-tauri/src/ipc/commands/shell/assist_runtime_cmd.rs`、新增 `scripts/test-home-assist-ipc-contract.mjs`、必要时现有 ownership/prep 测试。

**Interfaces:** 保持 run/cancel/ready/status 业务契约；统一实际 Tauri 入参包装。

- [ ] 写会检查真实 IPC 调用参数的回归测试：run/cancel/ready 的 DTO 在 args 中，status 无参数，不能只 mock 一个无条件返回成功的 invoke。
- [ ] 运行 `node scripts/test-home-assist-ipc-contract.mjs`，先记录当前行为及失败，再最小修复确认存在的接线问题。
- [ ] 复跑该测试和 Phase1 三项前端测试；期望全部通过。
- [ ] 在桌面调用 ready/status，以及不会产生远程请求的非法输入/未知取消请求，确认命令到达 Rust。真实远程成功路径需已有有效配置与费用授权；缺少则单独标未验证。
- [ ] 记录可审查的独立改动；提交仅包含本任务文件，不能混入用户既有改动。

### Task 1：建立有范围的本地读取服务

**Files:** 新增 `project_context/{contracts,scope,reader,mod,tests}.rs`、`project_context_cmd.rs`；修改 `lib.rs`、shell `mod.rs`、`build.rs`；新增专用 `project-context-ipc.toml` 和仅 main 的 capability，按生成规则补命令权限；必要时 Cargo 依赖。

**Interfaces:** 实现 open/close/query(list_files,read_excerpt)/cancel，EvidenceRecord v1。

- [ ] 编写失败测试：越界 `../`、相邻同名前缀目录、Windows ADS/UNC、junction/reparse、错误窗口、撤销 scope、文件读取期间替换、忽略目录、非文本、大文件与长行，均按契约拒绝或限量返回。
- [ ] 执行 `cargo test --manifest-path src-tauri/Cargo.toml --lib project_context`，确认测试暴露缺失行为。
- [ ] 实现句柄验证与预算。取消信号在遍历和每次读取之间检查，不能认为丢弃 spawn_blocking 的 JoinHandle 就停止了后台扫描。
- [ ] 执行同一命令，期望全部通过；Windows reparse 测试使用实际临时 junction，不用路径字符串替代。
- [ ] 完成主窗口 IPC 冒烟；其他窗口调用必须被拒绝。形成独立可审查改动。

### Task 2：工程片段接入 Phase1 材料与出站快照

**Files:** 新增 `src/js/features/now/home-project-context.js`、`scripts/test-home-project-context.mjs`；修改 `home-prompt-prep.js`、`home-assist-ownership.js`、`home-agent-v2.js`、`home-agent-v2-dock.js`、必要 CSS、`src/index.html`、`package.json`。

**Interfaces:** 上述五个前端接口；扩展 addMaterial 与 refreshEvidenceMaterial；材料 ID 与 evidence 引用稳定关联。

- [ ] 编写失败测试：精确 101–160 行超过 400 字符仍完整保留；首次预览未选入不进出站；取消勾选不外发；默认不泄露路径；项目 A 迟到响应不能加入 B；用户编辑 body 不被刷新证据覆盖。
- [ ] 运行 `node scripts/test-home-project-context.mjs` 和 `npm run test:home-assist-ownership`，记录失败。
- [ ] 实现候选预览、选择行范围、加入材料和小型“工程材料”抽屉。新工程 excerpt 使用精确 excerptText；旧素材兼容原有裁剪逻辑，并标明裁剪。
- [ ] 运行上述测试及 `npm run test:home-prompt-prep`、`npm run test:home-agent-v2`，期望全部通过。
- [ ] 页面点通“读取项目→选择文件行→加入→直接发送预览”；实际外部 Agent 发送用专用测试目标，避免误投递用户工作会话。形成独立可审查改动。

### Task 3：确定性项目名片（2A 完成）

**Files:** 新增 `project_context/passport.rs`；扩展 contracts/query 与 `home-project-context.js`、后端及前端测试。

**Interfaces:** query(passport) -> EvidenceRecord(kind=passport) + 来源与扫描覆盖说明。

- [ ] 编写临时工程 fixture 测试：Node scripts、Cargo workspace、pyproject、纯文档项目、嵌套子包、损坏配置、缺失 README；不执行配置，不推断不存在的命令。
- [ ] 跑 project_context 测试确认失败后实现：根目录优先读 README、明确规则文件、package.json/Cargo.toml/pyproject.toml 的合规内容；多包只列发现项与范围，不声称全库分析完成。
- [ ] 输出技术栈线索、有限目录概览、声明的运行/测试命令、规则摘录和未知项。每条事实有 sourceRef；未实际运行的命令标“项目声明”。无 LLM 时同样可生成。
- [ ] 名片采用明确的用户刷新；内存缓存按 scope 和来源指纹失效。持久化仅保存用户采纳的材料，沿用现有草稿生命周期。
- [ ] 后端与前端测试通过；真实页面生成、预览、选入名片，允许用户跳过任何规则或来源。验收 2A。

### Task 4：Git 改动证据（2B）

**Files:** 新增 `project_context/git_evidence.rs`；扩展 contracts/query、前端模块及测试；现有 Time Machine 接口作为参考保持语义不变。

**Interfaces:** query(git_changes{mode}) 返回路径/状态/版本列表；query(git_diff{mode,relativePath,expectedVersion}) 返回 EvidenceRecord(kind=git_diff)。

- [ ] 临时 Git 仓库测试 staged=HEAD→index、unstaged=index→working tree，两者不能混算；覆盖新仓库无 HEAD、删除、重命名、空格与 Unicode 文件名、未跟踪文件、二进制、忽略/敏感路径和切换分支。
- [ ] 测试失败后实现固定参数调用；使用 Command 参数数组、受控 cwd，禁止外部 diff/textconv/fsmonitor 扩展，设置超时并限制 stdout/stderr；超限终止并回收子进程。
- [ ] 检查 Git 根目录与授权根一致，子目录授权不向上扩张；不执行 init、checkout、add、commit、fetch。缺 Git/非仓库只禁用 Diff 功能。
- [ ] 先过滤合规路径再请求单文件 patch；rename 旧新路径都验证，symlink/gitlink 拒绝；untracked 走普通读取路径，不伪造 staged patch；无法稳定复现 before/after 版本时返回 changed。
- [ ] 本地记录明确比较基线及 patch hash；上下文参数固定 3 行，界面显示实际截断。旧提交内容仍遵循敏感路径规则。
- [ ] 跑后端测试与 `node scripts/test-home-project-context.mjs` 全通过，页面确认两种差异不会被合并或标为 Agent 已完成。验收 2B；历史 TM patch 留后续。

### Task 5：有限关键词补查（2C）

**Files:** 新增 `project_context/search.rs`；扩展 contracts/query、前端模块和测试。

**Interfaces:** query(search{literal,relativeDir?}) -> 候选命中（路径、行号、少量上下文、sourceVersion、扫描覆盖）；选入调用 read_excerpt。

- [ ] 编写测试：中文与符号精确搜索、无命中、二进制/忽略目录不搜、超文件数/总字节/时间限制、取消、命中后文件变化、长行；无命中不能表述成“项目不存在此代码”。
- [ ] 测试失败后实现普通字符串搜索；默认大小写敏感，不接收正则、shell 或模型自由工具参数；命中预览上下各 3 行且不超过 2 KiB。
- [ ] 初版由用户粘贴报错关键词或选中符号触发，无后台持续搜索、无自动模型搜索循环。搜索词本地处理。
- [ ] 选中候选重新读取确认版本，再按 Task 2 加入证据。多命中只选实际相关项，不全选整库。
- [ ] 执行后端与前端测试并在 UI 验证“报错关键词→命中→选入→整理或直接发送”。验收 2C。

### Task 6：来源、刷新与阶段验收

**Files:** `project_context/reader.rs` 与 contracts/query；`home-project-context.js`、`home-prompt-prep.js`、`home-assist-ownership.js`、`home-assist-client.js`、`home-agent-capabilities.js`；两份现有 docs；上述测试。

**Interfaces:** query(validate{evidenceIds}) -> 每项 freshness；validateIncludedEvidence 在整理和发送快照冻结前调用，不自动替换内容。

- [ ] 编写失败测试：文件修改/删除/同 mtime 内容变化、Diff 基线变化、scope 失效、名片来源修改、排除旧材料后整理稿仍有相关概述。
- [ ] 实现批量有限校验；超预算或无权限返回 unverifiable，不能标 fresh。哈希来自实际字节；展示已读取版本与时间，不承诺发送瞬间仓库绝对一致。
- [ ] 已变化则提供“刷新证据 / 使用已读取版本 / 移除材料”。刷新递增内容版本并使整理稿 stale；撤销某材料后旧 body 可能仍含其摘要，明确提示重新整理或手动移除，不能只删附录就保证完全排除。
- [ ] 复用同一 snapshot 冻结正文、证据版本、项目和目标，保持编辑后的 body 是发送依据；行号与版本定位显示在材料预览。
- [ ] 能力新增 project_passport/project_evidence/project_search/project_diff，按阶段投影 implemented/ready/scopeGranted。read_project 仅在受限读取确已接通时标注对应范围；不能由它推导通用只读 Agent 模式可用。write/run/approval 与会话 Diff 语义不扩张。
- [ ] 执行窄测试：`cargo test --manifest-path src-tauri/Cargo.toml --lib project_context`、`cargo test --manifest-path src-tauri/Cargo.toml --lib assist_runtime`、新增两个 Node 测试和 Phase1 三项前端回归。涉及前端按项目技能执行 typecheck/test:islands，Rust 完成项目要求检查；不反复扩展与改动无关的测试。
- [ ] 真机至少覆盖文件片段、项目名片、两类 Diff、搜索和项目切换；记录本地无模型闭环与远程整理分别是否验证。只允许在已授权提供商与费用策略下进行真实远程验证。
- [ ] 更新 docs，按实际结果记录通过、模拟验证、未验证，形成最终独立可审查改动。

## 5. 用户效果验收

| 场景 | 预期可交付结果 |
| --- | --- |
| 新手说“启动失败” | 加入报错、项目声明的启动方式、相关配置片段，形成可执行排查任务；不编造根因 |
| 老手说“检查这次修改” | 只加入选中的 staged 或 unstaged patch 与必要约束，带版本和行号交接 |
| 用户规划已有项目功能 | 名片和指定模块片段支持任务整理，明确已读范围和未知依赖 |
| 免费额度不可用 | 本地证据收集、预览和直接交接仍完成；不自动改计量策略 |

以同一组真实任务对照手动材料准备：记录准备耗时、补充材料次数、必要证据保留情况、出站大小和下游返工。真实 token/cost 仅在提供商或目标 Agent 给出 usage 时报告；不以摘要长度承诺节省费用。

## 6. 留给后续

语义索引、完整 repo map、AST/调用图、模型自主补查循环、编辑器未保存缓冲区桥接、历史 Time Machine patch、跨会话记忆、技能导出、代码写入和项目脚本执行。复用 Aider 的预算化工程概览、Continue 的按来源选择材料理念；本阶段不移植其 Agent harness。

## 7. 计划自检

- 范围覆盖：2A 对应 Task 1–3，2B 对应 Task 4，2C 对应 Task 5，版本与回归对应 Task 6。
- 接口一致：所有上下文 IPC 使用 args 包装与后端窗口身份；所有工程材料经 Prep 和 Phase1 快照。
- 五类 Review Focus 均有指定测试任务；远程可用性与本地读取可用性分开。
- 本次仅生成规划文件；未运行产品测试，未独立确认 Phase1 整体验收，未修改产品代码。

## 8. 交付切片与执行顺序

Phase2 不按“后端全部完成后再接首页”推进，而按可独立验收的纵向切片交付：

### Slice 0：真实 IPC 基线（半天）

- 先用真实 Tauri 运行时验证 `ready/status/run/cancel` 的参数形状、错误映射和取消竞态。
- 若发现前端调用与 Rust 命令的 `args` 包装不一致，只修正契约和回归测试，不扩大功能范围。
- 产出：`test-home-assist-ipc-contract.mjs`、一份实际运行记录。

### Slice 1：项目范围 + 单文件片段（1–2 天）

- 打开项目、读取文件列表、读取指定行范围、关闭/撤销范围。
- 首页先只展示“已读取材料”，允许勾选后加入现有材料区。
- 产出：新手可以把报错和相关配置/代码片段组成一份任务并直接交接。

### Slice 2：项目名片（1 天）

- 在 Slice 1 的范围内读取固定候选文件，生成可编辑名片。
- 名片必须显示来源、读取时间和未读取范围；用户可逐项移除。
- 产出：规划任务不再只依赖用户手写项目背景。

### Slice 3：Git 变更证据（1–2 天）

- 先做 staged/unstaged 状态与文件列表，再做用户选定文件的有限 diff。
- 明确“工作树当前变更”语义，不把历史 Time Machine 摘要冒充 patch。
- 产出：老手可把一次修改连同约束和验收标准交给目标 Agent。

### Slice 4：有限搜索 + 新鲜度（1–2 天）

- 仅支持字面搜索、固定目录范围和结果上限；命中项必须再次读取并显示来源。
- 发送前校验材料版本；变化时给出刷新/保留旧版本/移除三选一。
- 产出：减少手动找文件和重复粘贴，同时避免过期证据误导模型。

每个 Slice 都必须通过“本地无模型”验收后，才接入远程 `task_organize`；远程整理失败不得阻塞本地证据和直接交接。

## 9. 最小数据契约

```text
ProjectScope {
  scopeId, taskScopeId, ownerWindowId, root,
  status: active | revoked | closed,
  createdAt, expiresAt
}

EvidenceRecord {
  evidenceId, scopeId, kind,
  path, lineStart?, lineEnd?,
  content, contentHash, sourceVersion,
  source: file | passport | git_staged | git_unstaged | search,
  capturedAt, truncated, freshness,
  gitRef?, gitStatus?
}

ContextQueryResult {
  queryId, scopeId, kind,
  records, warnings[],
  budget: { used, limit },
  cancellable: true
}
```

前端只保存用户主动采用的 `EvidenceRecord`，不把完整扫描结果写入长期工作记录。出站快照中只保留已采用材料的正文、来源和版本；原始工程路径可脱敏显示，绝不进入模型 prompt 的隐式字段。

## 10. 可观测性与产品指标

仅记录结构化事件，不记录 key、完整代码或完整 prompt：

- `context_scope_opened/closed`
- `context_query_started/completed/failed`
- `evidence_adopted/removed/refreshed`
- `evidence_stale_at_send`
- `assist_input_size/output_size`
- `handoff_snapshot_created`

Phase2 的成功标准不是“读了多少文件”，而是：

- 任务准备时间相对手动流程下降；
- 用户补充材料的次数下降；
- 关键证据来源保留率不下降；
- 过期材料被发送的比例为零；
- 无模型/无额度时直接交接成功率不下降；
- 出站正文平均大小下降，但不以摘要长度替代证据完整性。

首版只做本地匿名计数和调试导出，不引入在线遥测；指标无法可靠采集时标记“未测量”，不伪造收益。

## 11. 灰度、回滚与故障策略

- 通过本地 feature flag 控制 `project_context`，默认关闭自动读取，只允许用户显式点击“读取项目”。
- 任一查询失败都回退到现有手动材料流程；不自动重试超过预算，不自动切换到付费模型。
- 新增 IPC 命令保留独立版本字段；契约不兼容时前端隐藏入口并保留直接发送。
- 发生路径越界、重解析点、编码不支持或预算超限时，拒绝该条证据而不是放宽限制。
- 回滚只需关闭 feature flag/移除 capability 投影，不影响 Phase1 草稿、整理和投递。

## 12. Phase2 完成定义

同时满足以下条件才标记完成：

1. Slice 0–4 均有自动测试和至少一条真实桌面路径验证；
2. 本地读取、远程整理、Agent 投递三者的状态和失败原因可分别说明；
3. 任意工程证据都能追溯到路径/行号/版本或明确标注来源未知；
4. 项目切换、窗口关闭、取消、文件变化不会把旧证据写入新任务；
5. 无 key、无免费模型、断网、Git 不可用时，直接发送仍可用；
6. 文档、capabilities 和 UI 文案与实际接通范围一致；
7. 未引入写盘、命令执行、全库索引或自主 Agent 循环。
