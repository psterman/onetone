# 语音设置页 · 现网核对 + 实现 plan

> **架构/UI/页面策略定稿**：[voice-settings-page-proto-spec.md](voice-settings-page-proto-spec.md)（Q1–Q38）  
> 本文只保留对照与 Batch plan；实现以定稿为准。  
> 审计：2026-09-07 · 复审补洞：侧链按键 / toast / §A≠§B  
> 终态三区：[../../design-mock/voice-ui-3hero-switch-final.html](../../design-mock/voice-ui-3hero-switch-final.html)

---

# §10. 现网实现对照（2026-09-07）

**对照方法**：`src/index.html` + `src/js/features/voice/*` + `voice-runtime.js` + `voice-wake.js`。

## 10.1 UI 层

| # | 项 | 定稿要求 | 现网 | 对齐？ |
|---|-----|----------|------|--------|
| 1 | 因果条 | 只「进入听写」 | `voiceWakeActionBar` = 切目标 → 进入听写 | ❌ |
| 2 | 高级拉起 | **应用情景**折叠区默认关；**全局听写**隐藏 | 无配置键 | ❌ |
| 3 | 打开应用 | 语音内第二面 `voiceFace=openApp`（不进左栏） | 01 内 `voiceWakeOpenAppEntry` | ❌ |
| 4 | 试说 | dock「试麦克风」ghost；Cursor → SoftPad Agent 面 | 01 内本地+Cursor 试说 | ❌ |
| 5 | 侧链 | **相关：按键 · 摄像头 · SoftPad**（Q23′）；应用另有改目标 CTA | 仅摄像头+SoftPad | ❌ |
| 6 | **方案卡** | §A 全局听写 \| 应用情景（Q24·Q38）；只读旁注升级铬；禁止「无目标」 | 缺 | ❌ |
| 7 | 错前台提示 | **状态行常驻 + 说了才 toast**（Q15）；仅听写面+应用情景 | 缺 | ❌ |
| 8 | 壳层 | 顶栏+face 轨上+三步+setup banner | 部分（缺 face / Q20） | ❌ |

## 10.2 运行时

| 规则 | 状态 |
|------|------|
| R1 状态机语境 | ✅ |
| R2 grammar 互斥 | ⚠️ 需再核 voice-wake.js |
| R3 情景优先 | ⚠️ 需再核 |
| R4 activeSceneId | ✅ |
| R5 只抗切换 | ✅ |
| R6 执行记录 | ❌ 缺 |
| R7 全局听写跟光标+命令仍有效 | ❌ 规则未显式落地 |
| Q11 / Q15 toast | ❌ 缺 |

---

# §11. 用户判定（含 Grill 续）

| # | 判定 | 定稿落点 |
|---|------|----------|
| 1–2 | 因果条只进入听写；高级拉起默认关 | A1 / A2 |
| 3 | 打开应用 → **Q12=A** 语音内第二面 | A3 |
| 4 | 拆 CTA → dock 试麦克风；Cursor→SoftPad Agent | A4 |
| 5 | 侧链含**按键** | **Q23′**（曾漏，已补） |
| 6 | 目标只读旁注 | 方案卡 = 旁注升级铬（只读名 + 链） |
| 7 | 双提示状态行 + toast | **Q15**（原型曾漏 toast，已补演示） |
| 全局 | Q17/Q18/Q24；**Q38**=§A≠§B | A6 |

---

# §12. 实现 plan

## 12.1 Batch A · UI

| 序 | 改动 | 要点（以定稿为准） |
|----|------|-------------------|
| A1 | 因果条 | 删切目标步骤；只留进入听写 |
| A2 | 高级拉起 | `voiceAllowBringUpTarget` 默认 false；**仅应用情景**显示 |
| A3 | 打开应用第二面 | `voiceFace=openApp`；删 01 次入口；openApp 整轨隐藏（Q19） |
| A4 | 试说拆分 | 删 Cursor 试说；本地→dock「试麦克风」ghost |
| A5 | face + **相关三链** | Q20 face；**按键 · 摄像头 · SoftPad**；应用另有改目标 CTA（Q32） |
| A6 | **方案卡** | 空目标→「全局听写」(§A)；非空→「应用情景」；禁止「无目标」；≠ dock 引擎底座(§B) |
| A7 | 反馈 | **状态行 + 事件 toast**；全局听写不挂；openApp 面不挂状态行 |

## 12.2 Batch B · 运行时

| 序 | 改动 |
|----|------|
| B1 | R6 `voiceExecutionLog` |
| B2 | wake：应用情景+高级关+听写词→拒 + **toast**（A7） |
| B3 | R2/R3 收口；R7 全局听写分支 |

## 12.3 验收补丁

- [ ] 相关含按键；改目标 CTA 与相关·按键职责不混  
- [ ] 错前台：状态行 + 说了才 toast  
- [ ] 全局听写 = §A；引擎策略 = §B（dock）  
- [ ] 试麦克风在 dock；打开应用仅第二面  

---

# §13. 溯源

| 决策 | 来源 |
|------|------|
| Q1–Q11 | 首轮 grill |
| §11 #1–#7 | 现网核对批 |
| Q12–Q18 | 续 grill |
| Q19–Q37 | UI 框架 + 终态 mock |
| Q23′ / Q38 | 复审：侧链按键 + 契约 §A/§B |
