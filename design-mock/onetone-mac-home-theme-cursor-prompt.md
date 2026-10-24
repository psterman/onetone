# OneTone Mac 首页主题切换 · Cursor Prompt

请在 `design-mock/onetone-mac-home-preview.html` 上实现浅色 / 暗色主题切换。

## 目标

保留当前 `WorkbenchHomeView` 的页面架构、DOM 层级、场景状态和交互功能，只增加主题系统与视觉适配。不要重做首页，不要引入 React、Tailwind 或新的路由。

## 主题规则

### 浅色主题（默认）

```css
--bg: #e9edf3;
--win: #f6f8fb;
--side: #edf1f6;
--paper: #ffffff;
--ink: #16202a;
--ink2: #586778;
--ink3: #667482;
--accent: #006e9f;
--accent-soft: rgba(0, 110, 159, .12);
--ok: #1a9b5f;
--warn: #8a5700;
--fail: #c53d4a;
```

### 暗色主题

```css
--bg: #0f141b;
--win: #171d26;
--side: #121821;
--paper: #1d2630;
--ink: #edf2f7;
--ink2: #a6b3c2;
--ink3: #778595;
--accent: #3aa9e8;
--accent-soft: rgba(58, 169, 232, .14);
--ok: #52d273;
--warn: #ffb15c;
--fail: #ff6f7d;
```

颜色职责必须保持清楚：

- 蓝色只负责 OneTone 主色、选中、链接、焦点和主要动作。
- 绿色只负责 Agent 运行中、成功和已完成。
- 橙色只负责待确认、权限和风险提醒。
- 红色只负责失败或错误。
- 不要用绿色作为整页背景、主按钮或导航选中色。

## 实现要求

1. 在标题栏增加一个小型主题切换按钮，使用现有 Mac 窗口结构，不新增侧栏或页面级卡片。
2. 使用 `body[data-theme="light"]` / `body[data-theme="dark"]` 或同等方式切换 CSS 变量。
3. 默认浅色主题；通过 `localStorage` 保存用户选择，键名使用 `onetone-home-theme`。
4. 切换时只过渡 `background-color`、`border-color`、`color`、`box-shadow`，不要使用 `transition: all`。
5. 保留 `prefers-reduced-motion`，减少动效用户不能看到主题切换动画。
6. 不得重命名或删除现有 ID：`rows`、`draft`、`send`、`plus`、`capPanel`、`themeToggle` 等。
7. 不得引入虚假的进度、ETA、自动判断或新的业务状态。
8. 确保文字在浅色和暗色下都满足基本对比度，按钮、禁用态、焦点态、空态和权限态都可读。

## 验收

- 点击主题按钮可在浅色和暗色之间切换。
- 刷新页面后保留上一次主题选择。
- 场景按钮、Agent 列表、Prompt 输入框、能力开关、快捷目标和发送按钮继续工作。
- 浅色主题不出现大面积绿色。
- 暗色主题不出现绿色主导航或绿色主按钮。
- 不改变现有首页架构和功能文案。
- 使用浏览器打开 HTML 做一次桌面尺寸和窄屏尺寸检查，并运行内联脚本语法检查。
