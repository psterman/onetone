# 任务:在 voice-pilot 习惯界面新增"小白模式"

> **Prompt for AI coding agent** —— 照着改 `voice-pilot` 真实代码,新增一档"小白模式"渲染,跟现有 table/grid 共存。

---

## 1. 任务总述

在 `voice-pilot` 的习惯(habit)管理界面里,新增**第三档展示模式:小白模式**。当前已有两档:

- `table` —— 表格视图(高密度,中级用户)
- `grid`  —— 卡片网格(轻量,中级用户)

我们要新增:

- `novice` —— **小白模式**(拟物大卡 + 自然语言 + inline 编辑,见 `artifacts/big-mode.html`)

切换方式:在习惯界面顶栏加一个独立的"展示模式"段:`[🌱 小白] [⚡ 快速] [🛠 程序员]`,跟现有的"列表密度"(table/grid)并列,**不冲突**。

---

## 2. 现状必读(改之前先看)

| 文件 | 角色 | 关键符号 |
|---|---|---|
| `src/index.html:1283` | 习惯界面容器 `<div id="habitHubView">` | DOM 入口 |
| `src/js/features/mapping/habit-hub.js:404-422` | 现有 viewMode 切换逻辑 | `normalizeViewMode()`, `[data-habit-view]` |
| `src/js/features/mapping/habit-hub-side-peek.js` | 习惯侧栏预览 | 旁边的小预览面板 |
| `src/js/features/mapping/habit-workspace.js` | 习惯工作区,含 safety/lights 状态 | `HabitWorkspace` |
| `src/js/features/agent/soft-pad-hub-ui.js` | soft pad hub 渲染(白名单 minimax 已修) | `mergeUsageIntoStatusProps` |
| `src/js/core/i18n.js` | 文本资源 | `t()` 函数 |
| `src/css/habit-hub-table.css` | 现有 habit 列表样式 | `.habit-hub-table` / `.habit-hub-card` |
| `artifacts/big-mode.html` | **设计 demo,完整可跑** | 55KB 单文件,所有组件都在里面 |

**`artifacts/big-mode.html` 是这次设计的事实标准**。改之前先 `cd artifacts && node serve.cjs 47291`,浏览器打开 `http://127.0.0.1:47291/big-mode.html`,实际点点看。

---

## 3. 数据 schema 扩展(只能加字段,不能改字段名)

每个 habit 对象加 2 个字段(向后兼容,旧 habit 没这俩字段时 fallback 到默认值):

```js
// 在 HabitWorkspace 里给 habit 加:
{
  ...existingFields,
  dim: 'key',       // 'key' | 'voice' | 'cam' | 'softpad',默认 'key'
  scene: 'begin'    // 'begin' | 'end' | 'cancel' | 'general',默认 'begin'
}
```

`dim` 决定渲染时归到哪个维度 tab,`scene` 决定归到哪个场景 chip。

**不要动** habit 现有的任何字段(`app` / `key` / `action` / `finish` / `status` / `lastMod` / `holdMs` 等)。

---

## 4. UI 设计(对照 big-mode.html 行号)

### 4.1 顶栏新增"展示模式"段

放在 `habit-hub-toolbar` 内部,跟现有的视图切换(`[data-habit-view]`)并列,**不要替换**它。

```html
<div class="habit-hub-display-modes">
  <button data-habit-display="novice" class="is-active">🌱 小白模式</button>
  <button data-habit-display="quick">⚡ 快速设置</button>
  <button data-habit-display="pro">🛠 程序员模式</button>
</div>
```

(具体 DOM 结构对齐 big-mode.html:55-58)

### 4.2 小白模式主区布局

参考 big-mode.html:415-454 渲染逻辑(从 `renderNovice()` 抄过来),关键差异点:

- 左侧 app 列表(`<aside class="app-list">`)—— **新增**,可搜索,带"已启用/已关闭"状态
- 4 维度 tab(`<div class="dim-tabs">`)—— **新增**,从 habit.dim 字段聚合
- 使用场景 chip(`<div class="scene-chips">`)—— **新增**,从 habit.scene 字段聚合
- 主区大卡(`<div class="habits-big">`)—— **新增**,每张是大卡,自然语言 + inline chip
- 卡片右侧 ▶ 试一下 / 🗑 删掉 —— **新增**

### 4.3 快速设置主区(可选,推荐做)

如果时间够,把"快速设置"模式也加上(参考 big-mode.html:458-498 `renderQuick()`)。它是 3 列 IDE 风,跟现有 table 视图**共存**——table 模式按"全部 habit 列出来",快速设置是"按 app × dim × scene 过滤后展示"。

不做也行,先把小白模式做了。

### 4.4 程序员模式(可选,最低优先级)

参考 big-mode.html:502-511 `renderPro()`,就是黑底 JSON 视图。最低优先级,做不做无所谓。

---

## 5. 关键组件(从 big-mode.html 抽出,直接复用)

### 5.1 大卡样式

参考 big-mode.html:118-180(`.h-card` 段),核心 8 行:

```css
.h-card {
  background: var(--card);
  border-radius: 20px;
  padding: 20px 24px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06);
  display: grid; grid-template-columns: 56px 1fr auto; gap: 20px;
  align-items: center;
  transition: all 220ms cubic-bezier(.2,.8,.2,1);
}
.h-card:hover { transform: translateY(-2px); box-shadow: ... }
.h-card.is-paused { background: linear-gradient(180deg, #fff 0%, #fffbeb 100%); }
```

### 5.2 inline chip

参考 big-mode.html:185-210(`.h-info .chip` 段):

```css
.h-info .chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-radius: 6px;
  font-weight: 600; font-size: 13px; margin: 0 2px;
  cursor: pointer; transition: all 150ms;
}
.h-info .chip.app-tag { background: var(--line2); }
.h-info .chip.key { background: #1a1a1a; color: #fff; font: 700 12px/1.3 ui-monospace,monospace; padding: 3px 10px; }
.h-info .chip.action { background: var(--purple-bg); color: var(--purple); }
.h-info .chip.trigger { background: var(--green-bg); color: var(--green); }
.h-info .chip:hover { filter: brightness(0.95); }
```

### 5.3 Popover 系统(关键 JS)

参考 big-mode.html:1667-1702,核心逻辑,直接抄:

```js
function openPopover(html, anchor, w) {
  closePopover();
  const r = anchor.getBoundingClientRect();
  const bg = document.createElement('div');
  bg.className = 'popover-bg';
  bg.onclick = closePopover;
  document.body.appendChild(bg);

  const pop = document.createElement('div');
  pop.className = 'popover';
  pop.style.minWidth = (w || 280) + 'px';
  pop.innerHTML = html;
  pop.onclick = e => e.stopPropagation();
  document.body.appendChild(pop);

  // 定位:优先下方,放不下就上方
  const pr = pop.getBoundingClientRect();
  const pw = pr.width || (w || 280), ph = pr.height || 200;
  let top = r.bottom + 8, left = r.left;
  if (top + ph > window.innerHeight - 10) top = r.top - ph - 8;
  if (left + pw > window.innerWidth - 10) left = window.innerWidth - pw - 10;
  if (left < 10) left = 10;
  pop.style.top = top + 'px';
  pop.style.left = left + 'px';
}
function closePopover() { /* 删 popover + bg, 停录制 */ }
```

### 5.4 试一下 typewriter(全屏演示)

参考 big-mode.html:1790-1827,核心 20 行(用 setTimeout 链式调):

```js
function openDemo(habit) {
  // 1. 全屏覆盖层 fade in
  // 2. 中央放一个 mock 窗口(Chrome 标签栏 + URL + body)
  // 3. 用 setTimeout 链按 habit.demo 步骤渲染
  //    - type 'cursor' → 一个字符一个字符打,带闪烁光标
  //    - type 'fly' → 一次性插入,带 fly-in 动画
  // 4. 底部进度条 4 步
  // 5. 完成后 1.5s 自动关闭
}
```

demo 数据是 `habit.demo: [{type:'cursor', text:'...'}, {type:'fly', text:'...'}]`,没 demo 的 habit 就 show toast "这个习惯没做演示"。

### 5.5 4 步引导(沿用现有)

**4 步滑入面板已经在 voice-pilot 现有习惯界面里有了**,参考 `src/js/features/mapping/habit-workspace.js` 和 `src/css/habit-workspace.css`,**不要重写**。

小白模式下:
- "点 +加一个" → 沿用现有 4 步
- "点 ⋯ 完整改" → 沿用现有 4 步
- "点 🗑 删掉" → 新增,带飞散动画(`.is-deleting` class + max-height 0)
- "点状态点" → 新增,1 步切换 on/paused

---

## 6. 落地点(具体改哪些文件)

**最小改动路径**(只做小白模式,快设置 / 程序员模式先不做):

1. **`src/index.html:1283` 附近** —— 在 `<div id="habitHubView">` 内加"展示模式"段(3 个按钮)
2. **`src/css/habit-hub-table.css` 末尾** —— 加小白模式的 CSS(从 §5.1 §5.2 复制)
3. **`src/js/features/mapping/habit-hub.js`** —— 新增 `renderNovice()` 函数,挂在现有的 `render()` 入口里:`if (displayMode === 'novice') return renderNovice()`
4. **`src/js/features/mapping/habit-hub.js:404` 附近** —— 新增 `normalizeDisplayMode()`,跟现有 `normalizeViewMode()` 平级
5. **`src/js/core/i18n.js`** —— 加 4 段文本:
   - `displayModeNovice`: "🌱 小白模式"
   - `displayModeQuick`: "⚡ 快速设置"
   - `displayModePro`: "🛠 程序员模式"
   - `habitNoDemo`: "这个习惯没做演示"
6. **(可选)`src/js/features/mapping/habit-workspace.js`** —— 给 habit 对象加 `dim` / `scene` 默认值

**代码总量**:800-1200 行(含 CSS、JS、HTML)。如果只做核心 1000 行左右。

---

## 7. 验收标准

- [ ] 顶栏出现 3 个按钮 "🌱 小白模式 / ⚡ 快速设置 / 🛠 程序员模式",默认 "小白模式" 激活
- [ ] 习惯界面切到小白模式后,左出现 app 列表(可搜索,带状态)
- [ ] 顶出现 4 维度 tab(按键 / 语音 / 摄像头 / Soft Pad),带计数
- [ ] 第二行出现使用场景 chip(启动输入 / 结束与取消 / 通用),带计数
- [ ] 主区显示大卡(56px 图标 + 自然语言 + inline chip + ▶ 试一下 / 🗑 删掉)
- [ ] 大卡上的 chip 可点 → 弹 popover 改对应属性,**不走 4 步**
- [ ] 状态点(绿/琥珀)可点切换
- [ ] ▶ 试一下 → 全屏 typewriter 演示
- [ ] 🗑 删掉 → 飞散动画
- [ ] + 加一个 → 4 步引导(沿用现有)
- [ ] ⋯ 完整改 → 4 步引导(沿用现有)
- [ ] 切到快速设置 / 程序员模式,数据不丢,主区换渲染
- [ ] 现有的 table / grid 视图切换**不破坏**(跟 displayMode 是两套正交概念)
- [ ] 已有习惯(没 `dim` / `scene` 字段)fallback 到 `dim='key'` / `scene='begin'`,**不报错**

---

## 8. 不要做

- ❌ 不要重写现有的"快速设置"和"程序员模式"代码(它们如果存在就保留)
- ❌ 不要改 habit 现有字段名(`app` / `key` / `action` / `finish` / `status` 等)
- ❌ 不要动 data schema 兼容(只能加 `dim` / `scene` 两个字段)
- ❌ 不要在这次 PR 里改 minimax 5h 数据 / 白名单(那是另一回事,已经修过了)
- ❌ 不要碰 soft-pad-hub-ui.js 的 `mergeUsageIntoStatusProps` / `requestOverlayUsageForScope`
- ❌ 不要碰 codex-micro-overlay.html 里的 minimax 灯逻辑
- ❌ 不要碰 habit-workspace.js 里的 safety statusLights 计算

---

## 9. 设计 demo 引用

- **完整 demo**:`artifacts/big-mode.html`(55KB,直接 `cd artifacts && node serve.cjs 47291` 起 server 看)
- **截图对照**:
  - `artifacts/demo-v4-1-novice.png` —— 小白模式主区
  - `artifacts/demo-v4-2-quick.png` —— 快速设置主区(3 列 IDE)
  - `artifacts/demo-v4-3-pro.png` —— 程序员模式(JSON)
  - `artifacts/demo-v4-4-novice-voice.png` —— 切维度过滤
  - `artifacts/demo-v4-5-addstep.png` —— 4 步加新 habit
- **决策记录**:`artifacts/big-mode.html` 是 v4 版本(在 v3 基础上加 3 tab 切换),v1-v3 都已废弃,**只看 v4**。

---

## 10. 完事检查

改完后,跑一遍:

```bash
# 编译检查
cd voice-pilot && npx tsc --noEmit

# 单元测试
node scripts/soft-pad-mini-agents.test.js

# 手动验证
cd voice-pilot && npm run tauri:dev
# 打开习惯界面,切 3 个 displayMode,点 5-10 个交互
```

任何报错优先解决,不要"先这样,回头再说"——这次改的 UI 是用户天天用的。
