# 视觉感知 + Agent 智能脚本推荐系统

## 🎯 项目背景

在 voice-pilot 中点击视频的目的是让 AI "看到" 用户正在浏览的网页内容，从而针对性地编写自动化脚本。

本系统实现了一个完整的视觉感知流程：
1. **捕获** - WebView 嵌入式浏览器捕获网页内容
2. **理解** - 分析页面类型、表单、按钮等可操作元素
3. **推荐** - 基于上下文智能推荐自动化脚本
4. **执行** - 安全沙箱中运行脚本

---

## 📁 文件结构

```
visual-agent/
├── index.js                          # 模块入口，对外 API
├── visual-context-pipe.js           # 视觉上下文管道
├── script-recommender.js            # 脚本推荐引擎
├── webview-preview.js               # WebView 预览组件
├── script-recommendation-panel.jsx  # 推荐面板 UI 组件
└── README.md                         # 本文件
```

---

## 🚀 快速开始

### 1. 初始化系统

```javascript
import { initVisualAgent, openWebView, getRecommendations, executeScript } from './features/visual-agent';

// 初始化
initVisualAgent();
```

### 2. 捕获网页内容

```javascript
// 打开网页预览
await openWebView('https://example.com/login');

// 或导航到新页面
import { navigateTo } from './features/visual-agent';
await navigateTo('https://another-page.com');
```

### 3. 获取脚本推荐

```javascript
// 获取智能推荐的脚本
const recommendations = await getRecommendations();

console.log(`为您推荐了 ${recommendations.length} 个脚本:`);
recommendations.forEach(script => {
  console.log(`- ${script.title} (匹配度: ${Math.round(script.confidence * 100)}%)`);
  console.log(`  ${script.description}`);
});
```

### 4. 运行脚本

```javascript
// 执行第一个推荐的脚本
if (recommendations.length > 0) {
  const result = await executeScript(recommendations[0].scriptCode);
  if (result.success) {
    console.log('✅ 脚本执行成功!');
  } else {
    console.log('❌ 执行失败:', result.error);
  }
}
```

---

## 🧩 核心组件

### 1. VisualContextPipe - 视觉上下文管道

负责处理和转换原始视觉数据为结构化上下文。

```javascript
import { VisualContextPipe, getVisualContextPipe } from './visual-context-pipe';

const pipe = getVisualContextPipe();

// 接收原始数据（支持多种来源）
await pipe.ingest('webview', {
  url: 'https://...',
  title: '页面标题',
  forms: [...],
  buttons: [...],
  textContent: '...'
});

// 生成 Agent 可用的 Prompt
const prompt = pipe.generatePrompt(context);

// 获取最近的上下文
const recent = pipe.getRecentContext();
```

**功能特性:**
- ✅ 自动检测页面类型（表单/电商/视频/社交）
- ✅ 提取关键可操作元素（输入框、按钮）
- ✅ 计算元素重要性权重
- ✅ 维护上下文历史

---

### 2. ScriptRecommender - 智能推荐引擎

基于视觉上下文，智能匹配和生成自动化脚本。

```javascript
import { ScriptRecommender, getScriptRecommender } from './script-recommender';

const recommender = getScriptRecommender();

// 内置 7+ 种脚本模板:
// - 一键填充表单字段
// - 表单数据导出
// - 商品信息提取
// - 批量点击按钮
// - 价格变动监控
// - 表单 UI 增强助手
// - 视频自动播放/画质调整

// 添加自定义模板
recommender.addCustomTemplate({
  id: 'my-custom-script',
  category: 'custom',
  title: '我的自定义脚本',
  description: '这是一个自定义脚本模板',
  applicableTypes: ['form', 'other'],
  confidenceBase: 0.8,
  generateScript: (context) => `// 你的脚本代码...`
});
```

**推荐算法:**
1. **基础匹配** - 页面类型 vs 模板适用类型
2. **特征加权** - 表单字段数量、按钮类型等额外加分
3. **置信度计算** - 综合得分归一化到 0-1
4. **排序输出** - 按匹配度降序排列

---

### 3. WebView Preview - 网页预览组件

嵌入式浏览器窗口，用于实时捕获网页内容。

```javascript
import { openWebViewPreview, closeWebViewPreview, navigateTo } from './webview-preview';

// 打开预览
await openWebViewPreview('https://example.com');

// 注入内容提取脚本（自动执行）
// - 提取页面标题和 URL
// - 识别表单和输入字段
// - 收集按钮和链接
// - 抓取页面文本内容

// 导航
await navigateTo('https://new-url.com');

// 关闭
await closeWebViewPreview();
```

---

### 4. ScriptRecommendationPanel - 推荐面板 UI

浮动式推荐面板，提供完整的用户交互界面。

```jsx
import ScriptRecommendationPanel from './script-recommendation-panel.jsx';

// 在应用中渲染
<ScriptRecommendationPanel />

// 功能:
// - 浮动按钮 (🤖) 一键打开
// - 脚本卡片展示（图标、标题、描述、匹配度）
// - 一键运行脚本
// - 查看/复制代码
// - 保存到我的脚本库
// - 执行结果反馈
```

**UI 特性:**
- 🎨 渐变色设计，现代化风格
- 📱 响应式布局
- ⚡ 平滑动画效果
- 🔒 本地沙箱执行，安全可靠

---

## 📋 脚本模板库

### 表单相关

| 模板 | 适用场景 | 功能 |
|------|---------|------|
| 一键填充常用信息 | 登录/注册表单 | 自动填写用户名、邮箱、电话等 |
| 表单数据导出 | 复杂表单 | 提取所有字段结构保存为 JSON |
| 表单填写助手 | 长表单 | 高亮必填项、Ctrl+S 保存草稿 |

### 电商相关

| 模板 | 适用场景 | 功能 |
|------|---------|------|
| 商品信息提取 | 商品详情页 | 提取价格、规格、描述到剪贴板 |
| 价格变动监控 | 关注的商品 | 定时检查价格，变动时提醒 |

### 通用

| 模板 | 适用场景 | 功能 |
|------|---------|------|
| 批量点击按钮 | 同意/确认页面 | 自动点击页面上的按钮 |
| 视频自动播放 | 视频网站 | 自动播放、跳过广告、调整画质 |

---

## 🔒 安全机制

### 脚本执行沙箱

所有脚本都在隔离的沙箱环境中执行：

```javascript
// 允许的 API 白名单
const sandbox = {
  console,        // 日志输出
  document,       // DOM 操作
  window,         // 浏览器窗口
  navigator,      // 浏览器信息
  setTimeout,     // 定时器
  setInterval,
  localStorage,   // 本地存储
  alert,          // 用户通知
  confirm,
  prompt,
  URL,            // URL 处理
  Blob            // 文件处理
};

// 严格模式执行
"use strict";
```

**安全原则:**
1. ✅ 所有代码在本地执行，不上传任何数据
2. ✅ 只读访问 DOM，不修改原始页面
3. ✅ 执行前显示完整代码，用户可审查
4. ✅ 沙箱隔离，防止全局污染

---

## 🎬 使用场景示例

### 场景 1: 登录页面自动化

**用户操作:**
1. 访问 https://example.com/login
2. 点击 voice-pilot 的智能推荐按钮

**系统响应:**
```
📋 检测到表单页面 - 识别出 3 个输入字段
✨ 推荐脚本:
   ┌─────────────────────────────────────┐
   │ 📝 一键填充常用信息  [匹配度: 95%]   │
   │ 自动填写表单中的常用字段             │
   │ ⏱️ 预计耗时: 1-3 秒                 │
   │ [▶️ 立即运行] [💾 保存] [查看代码]   │
   └─────────────────────────────────────┘
   ┌─────────────────────────────────────┐
   │ 📊 表单数据导出 [匹配度: 85%]        │
   │ 提取所有字段结构，保存为模板         │
   └─────────────────────────────────────┘
```

**生成的脚本:**
```javascript
(function() {
  const userInfo = {
    username: 'your_username',
    password: '********',
    remember: true
  };
  
  // 用户名
  const el_username = document.querySelector('[name="username"]');
  if (el_username) el_username.value = userInfo.username;
  
  // 密码
  const el_password = document.querySelector('[name="password"]');
  if (el_password) el_password.value = userInfo.password;
  
  console.log('✅ 表单自动填充完成');
})();
```

---

### 场景 2: 电商商品页

**用户操作:**
1. 在 Amazon/淘宝浏览商品
2. 触发智能推荐

**系统响应:**
```
🛒 检测到电商商品页面
✨ 推荐脚本:
   ┌─────────────────────────────────────┐
   │ 📊 商品信息提取  [匹配度: 90%]       │
   │ 提取价格、规格、描述到剪贴板         │
   └─────────────────────────────────────┘
   ┌─────────────────────────────────────┐
   │ 👁️ 价格变动监控 [匹配度: 80%]        │
   │ 每 30 秒检查，降价时自动提醒         │
   └─────────────────────────────────────┘
```

---

## 🔧 开发指南

### 添加新的脚本模板

```javascript
import { getScriptRecommender } from './script-recommender';

const recommender = getScriptRecommender();

recommender.addCustomTemplate({
  // 唯一标识
  id: 'my-awesome-template',
  
  // 类别 (决定图标和标签)
  category: 'fill_form',  // 或 'extract_data', 'automate_click', etc.
  
  // 显示信息
  title: '我的超棒脚本',
  description: '这个脚本做了很厉害的事情',
  
  // 适用的页面类型 (空数组表示所有类型)
  applicableTypes: ['form', 'other'],
  
  // 基础置信度 (0-1)
  confidenceBase: 0.85,
  
  // 动态生成脚本代码的函数
  generateScript: (context) => {
    // context 包含完整的页面上下文信息
    // 可以根据页面元素动态生成代码
    
    return `
// 我的超棒脚本
(function() {
  // 在这里编写脚本逻辑
  console.log('Hello from template!');
  console.log('当前页面:', '${context.domain}');
})();
    `;
  }
});
```

### 扩展上下文管道

```javascript
import { VisualContextPipe } from './visual-context-pipe';

class MyCustomPipe extends VisualContextPipe {
  // 自定义内容检测逻辑
  detectContentType(context) {
    // 添加自定义页面类型检测
    if (context.textContent.includes('dashboard')) {
      return 'dashboard';
    }
    return super.detectContentType(context);
  }
  
  // 自定义元素提取
  extractKeyElements(context) {
    const elements = super.extractKeyElements(context);
    // 添加自定义元素识别...
    return elements;
  }
}
```

---

## 📊 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         Voice-Pilot 应用                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐   ┌──────────────────┐   ┌─────────────────┐  │
│  │ WebView 预览 │──▶│  视觉上下文管道   │──▶│  脚本推荐引擎   │  │
│  │   浏览器     │   │ VisualContextPipe │   │ ScriptRecommender││
│  └──────────────┘   └──────────────────┘   └────────┬────────┘  │
│         ▲                                               │          │
│         │ 用户浏览                                      ▼          │
│  ┌──────────────┐                           ┌─────────────────┐  │
│  │  浏览器扩展  │                           │  脚本执行沙箱   │  │
│  │  Native Msg  │                           │ Script Sandbox  │  │
│  └──────────────┘                           └────────┬────────┘  │
│                                                              │      │
│  ┌──────────────┐                                           ▼      │
│  │  截图 + OCR  │                                  ┌────────────┐  │
│  │  视觉识别    │                                  │  推荐面板  │  │
│  │ (Tesseract)  │                                  │     UI     │  │
│  └──────────────┘                                  └────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚧 后续计划

### Phase 1: 基础功能 (当前)
- ✅ 视觉上下文管道
- ✅ 内置脚本模板库
- ✅ 推荐引擎算法
- ✅ WebView 预览组件
- ✅ 推荐面板 UI
- ✅ 脚本执行沙箱

### Phase 2: 浏览器扩展集成
- [ ] Chrome 扩展开发
- [ ] Native Messaging 主机实现
- [ ] 无缝捕获当前标签页内容

### Phase 3: OCR 截图能力
- [ ] 集成 Tesseract.js OCR
- [ ] 窗口/区域截图功能
- [ ] 视觉布局分析

### Phase 4: AI 深度集成
- [ ] 接入 GPT-4/ Claude API
- [ ] 动态脚本生成（非模板）
- [ ] 脚本智能调试和优化
- [ ] 用户使用习惯学习

---

## 🤝 贡献指南

欢迎提交 Issue 和 PR！

**代码规范:**
- 使用 ES6+ 语法
- 组件使用 Solid.js (JSX)
- 遵循现有代码风格
- 添加必要的注释和 JSDoc

---

## 📄 License

与 voice-pilot 项目保持一致

---

## ❓ FAQ

**Q: 脚本会上传我的数据吗？**
A: 不会！所有脚本都在本地沙箱中执行，没有任何网络请求发送数据。

**Q: 支持哪些浏览器？**
A: WebView 预览基于系统浏览器，扩展版支持 Chrome/Edge。

**Q: 可以添加自己的脚本模板吗？**
A: 可以！参考上面的"添加新的脚本模板"章节。

**Q: 为什么叫"视觉感知"？**
A: 系统通过"看到"网页内容（DOM 结构/OCR）来理解上下文，就像人眼看到一样。

---

**Enjoy automating! 🚀**
