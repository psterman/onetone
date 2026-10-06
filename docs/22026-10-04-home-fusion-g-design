# OneTone 首页融合 G：情境拼装设计

日期：2026-10-04  
状态：待用户审阅（A 底座已收敛为编码启动页）  
原型：[`prototypes/home-fusion-beginner/index.html`](../../prototypes/home-fusion-beginner/index.html)（`?v=a` / `?v=g&sit=quiet`）  
约束：本阶段定义架构与验收；**不**直接改生产 `#homeWorkbench`，除非另开实施计划

## 1. 定位

默认软件首页采用 **G：按情境拼装**；其中 **安静态以 A 为底座**。

### 1.1 A 底座（已收敛）

A 不是「能力探索首页」，而是 **当前编码工作启动页**：

1. 我在哪个编码上下文？（前台 App / 项目）
2. 怎么马上开工？（开始听写 / 按键）
3. 想问一句发到哪？（单一提问 → 当前编码目标）

**通道披露规则：**

| 通道       | 默认     | 出现条件                                 |
| -------- | ------ | ------------------------------------ |
| 语音       | 显示     | 编码主路径                                |
| 按键       | 显示     | 编码主路径                                |
| Soft Pad | **隐藏** | 用户点「探索…」**或**检测到适用场景（如 Agent 会话进行中）  |
| 摄像头      | **隐藏** | 用户主动探索 **或** 检测到适用场景（如设备可用且需要第二确认通道） |

禁止把 Soft Pad / 摄像头做成首屏四宫格或常驻能力墙。

### 1.2 G 整体仍回答

1. 现在怎么样？
2. 下一步点哪里？（至多一个主 CTA）
3. 想开口时往哪问？（单一提问）
4. 编码主通道是否就绪？（语音 + 按键）

与 [Agent 工作记录首页](./2026-10-03-agent-home-work-history-design.md) 的边界：

| 面                     | 负责                            |
| --------------------- | ----------------------------- |
| 软件默认首页（本规格 G，A 为安静底座） | 编码启动、起跑线、情境、主通道、单一提问、修复       |
| 左侧 Agent 入口           | 工作记录、五信号、帮过你时间线、checkpoint 详情 |

## 2. 配方来源（A–F → G）

| 情境   | 取自          | 首屏结构                                |
| ---- | ----------- | ----------------------------------- |
| 冷启动  | B 起跑线       | 验证能说话；不先摊四通道                        |
| 可继续  | E + A       | checkpoint 主 CTA + 单提问 + 语音/按键      |
| 安静   | **A 编码启动页** | 当前工作 + 开始听写 + 单提问；Soft Pad/摄像头按披露规则 |
| 要你处理 | F           | 一个主 CTA 接管；信号精简；提问次级                |
| 需修复  | A 修复        | 修复替换主 CTA；标出缺口主通道（通常语音/按键）          |

明确不整页采用：能力探索墙、四通道并列主区、Codex|Claude 双提问框、D 的 Soft Pad 常驻巨锚。

## 3. 裁决顺序

高优先先匹配，同时只亮一种情境：

```text
1. attention   Agent 明确等待用户
2. repair      阻断主路径的配置缺口（如麦克风缺失且用户依赖语音）
3. cold        起跑线未通过
4. resume      存在可恢复 checkpoint，且用户非刚处理完 attention
5. quiet       默认 → 渲染 A 编码启动页
```

稳定性：前台抖动或单帧摄像头信号不得频繁切换情境；**不得**因单帧摄像头信号就把摄像头通道常驻展开（仅允许「检测到适用场景」横幅/入口，可关闭）。

## 4. 数据契约

```text
HomeFusionSnapshot
├─ situation: cold | resume | quiet | attention | repair
├─ updatedAt
├─ context { app, project, habit, provider? }
├─ headline
├─ assistance
├─ primaryAction? { id, label, kind }   // 至多一个；quiet 下常为「开始听写」
├─ secondaryAction?
├─ ask { enabled, defaultTarget, targets[] }
├─ startline { passed, checks[] }
├─ checkpoint? { title, nextAction, sessionId }
├─ attention? { summary, agent }
├─ repair? { reason, channel, fixAction }
├─ channels[] { id, label, status, detail, visibility }
│    // visibility: core | explore | detected | hidden
└─ channelDisclosure { exploreOpen, detectedSoftPad?, detectedCamera? }
```

`visibility` 规则：`voice`/`keys` → `core`；`softPad`/`camera` 默认 `hidden`，仅在 `exploreOpen` 或对应 `detected*` 时为 `explore` / `detected`。

映射建议（复用现有，不新造平行源）：

| 字段                               | 优先来源                                     |
| -------------------------------- | ---------------------------------------- |
| context / checkpoint / attention | `cmd_agent_home_snapshot` + pulse        |
| channels core                    | 正在使用习惯的 voice/keys projection            |
| detectedSoftPad                  | Agent 会话活跃 / Soft Pad host reason（诚实）    |
| detectedCamera                   | 设备可用 + 需要第二确认通道的场景（诚实）                   |
| startline                        | 工作台 readiness / 语音+按键探针                  |
| ask                              | 单一入口；target ∈ 当前前台 | Codex | Claude；禁止双框 |
| repair                           | protocol.repair / 麦克风与 Hook 缺口           |

禁止：假进度、假额度、无来源智能建议主按钮、把隐藏通道伪装成已配置完成。

## 5. 交互规则

1. **至多一个主 CTA**；安静态主 CTA 优先「开始听写」（或等价开工动作），不是「逛能力」。
2. **提问只有一个输入框**；默认当前编码前台。
3. **默认只展示语音 + 按键**；Soft Pad / 摄像头经探索链接或场景横幅出现。
4. 点通道 → 打开该通道配置（B2 路由），不在首页内嵌完整设置。
5. `resume` 主按钮绑定真实 checkpoint resume。
6. `attention` 主按钮进入真实待决面。
7. 摄像头可贡献证据，不能单独完成高风险批准。

## 6. 与现生产面的关系

| 现状                          | 落地后                            |
| --------------------------- | ------------------------------ |
| `#homeWorkbench` 能力向五问 + 四卡 | 安静态改为编码启动；howto 仅 core 两通道默认可见 |
| Codex / Claude 双 smoke 框    | 单一提问 + target select           |
| Soft Pad / 摄像头首页入口          | 默认隐藏；探索或 detected 才露           |
| Agent 工作记录规格                | 仍为 Agent 导航权威                  |

## 7. 验收标准

1. 安静态首屏 **不出现** Soft Pad / 摄像头卡，除非探索开启或 detected。
2. 首屏文案是「当前编码工作」，不是能力目录。
3. 五种 G 情境均可在 `640×680` 操作。
4. 任意时刻 ≤1 个主 CTA。
5. 无 Codex/Claude 并排双框。
6. `repair` 优先标语音/按键缺口，不借机展开能力墙。
7. detected 横幅可关闭；关闭后通道回到隐藏（除非用户已点探索）。
8. 键盘可达主 CTA、提问、core 通道；可见焦点；`prefers-reduced-motion`。

## 8. 实施阶段（建议）

1. **P0**：原型定稿（A 编码启动 + G 五态）— 本轮。
2. **P1**：`HomeFusionSnapshot` 投影（含 `visibility` / `channelDisclosure`）。
3. **P2**：生产首页换壳：双提问→单提问；安静态换编码启动。
4. **P3**：Soft Pad/摄像头默认隐藏 + detected 规则。
5. **P4**：与 Agent 工作记录摘要/深链对齐。

选型前不改生产默认面。
