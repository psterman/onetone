# 视觉感知 + Agent 智能脚本推荐系统

## 🔍 设计目标

当用户在 voice-pilot 中点击视频/预览按钮时，系统能够：
1. **"看到"** 当前浏览器窗口的网页内容
2. **理解** 页面上下文（是什么网站、有什么内容）
3. **推荐** 针对性的自动化脚本
4. **执行** 一键运行推荐的脚本

---

## 🏗️ 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    Voice-Pilot 桌面端                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   WebView    │  │   浏览器扩展  │  │  截图/OCR    │  │
│  │   预览窗口   │  │   桥接通信    │  │   视觉识别   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                  │          │
│         └─────────────────┴──────────────────┘          │
│                           │                             │
│              ┌────────────▼────────────┐                │
│              │   视觉上下文管道         │                │
│              │   VisualContextPipe     │                │
│              └────────────┬────────────┘                │
│                           │                             │
│              ┌────────────▼────────────┐                │
│              │   Agent 智能推荐引擎     │                │
│              │   ScriptRecommender     │                │
│              └────────────┬────────────┘                │
│                           │                             │
│              ┌────────────▼────────────┐                │
│              │   脚本推荐 UI 面板       │                │
│              │   ScriptSuggestionPanel │                │
│              └─────────────────────────┘                │
└─────────────────────────────────────────────────────────┘
```

---

## 🎯 三大视觉通道

### 通道 A：WebView 嵌入式预览（推荐）
**优势**：直接访问 DOM，信息最完整

```javascript
// 流程
1. 用户点击"预览网页"
2. 打开内嵌 WebView，加载用户输入的 URL
3. 注入内容脚本提取页面信息
   - 标题、元数据
   - 主要文本内容
   - 可交互元素（按钮、表单）
   - 页面结构分析
4. 将结构化数据传给 Agent
5. Agent 生成针对性脚本
```

### 通道 B：浏览器扩展桥接
**优势**：与用户真实浏览无缝集成

```javascript
// Chrome Extension -> Native Messaging -> Voice-Pilot
1. 用户在任意页面点击扩展图标
2. 扩展捕获当前页面完整 DOM
3. 通过 Native Messaging 发送给本地主机
4. Voice-Pilot 接收并传给 Agent
5. 实时生成适配脚本
```

### 通道 C：屏幕截图 + OCR
**优势**：适用于任何窗口，无侵入

```javascript
// 截图识别流程
1. 用户选择"捕获当前窗口"
2. 截取前台窗口图像
3. OCR 提取文本 + 布局分析
4. 传给 Agent 进行理解
5. 生成通用自动化脚本
```

---

## 📦 核心组件

### 1. VisualContextPipe - 视觉上下文管道

```typescript
interface VisualContext {
  source: 'webview' | 'extension' | 'ocr';
  url?: string;
  title?: string;
  domain?: string;
  contentType: 'article' | 'form' | 'video' | 'social' | 'other';
  textContent: string;
  keyElements: Array<{
    type: 'button' | 'input' | 'link' | 'image';
    selector?: string;
    text?: string;
    boundingBox?: { x: number; y: number; w: number; h: number };
  }>;
  timestamp: number;
}

class VisualContextPipe {
  // 接收原始视觉数据
  ingest(source: string, data: any): Promise<void>;
  
  // 提取关键信息
  extractContext(raw: any): VisualContext;
  
  // 生成 Agent Prompt
  generatePrompt(context: VisualContext): string;
  
  // 缓存最近上下文
  getRecentContext(): VisualContext | null;
}
```

### 2. ScriptRecommender - 智能推荐引擎

```typescript
interface ScriptRecommendation {
  id: string;
  title: string;
  description: string;
  confidence: number; // 0-1
  category: 'fill_form' | 'extract_data' | 'automate_click' | 'custom';
  scriptCode: string;
  estimatedTime: string;
  prerequisites: string[];
}

class ScriptRecommender {
  // 基于上下文推荐脚本
  recommend(context: VisualContext): Promise<ScriptRecommendation[]>;
  
  // 内置脚本模板库
  private templates: ScriptTemplate[];
  
  // 动态生成脚本
  private generateScript(context: VisualContext, template: ScriptTemplate): string;
}
```

### 3. ScriptSuggestionPanel - 推荐面板 UI

```typescript
class ScriptSuggestionPanel {
  // 显示推荐列表
  render(recommendations: ScriptRecommendation[]): void;
  
  // 用户选择脚本
  onSelect(scriptId: string): void;
  
  // 一键运行
  runScript(scriptId: string): Promise<void>;
  
  // 保存到我的脚本库
  saveToLibrary(scriptId: string): void;
}
```

---

## 🎬 用户体验流程

### 场景 1：用户正在填写复杂表单

```
用户操作：
1. 在浏览器中打开某个政府/企业的复杂表单页面
2. 点击 voice-pilot 托盘图标中的"智能推荐"
3. voice-pilot 通过扩展获取页面内容

系统响应：
📋 检测到表单页面 - 识别出 12 个输入字段
✨ 推荐脚本：
   ├─ 「一键填充常用信息」- 自动填入姓名/电话/邮箱等
   ├─ 「表单数据导出」- 提取所有选项供下次复用
   └─ 「分步填写助手」- 引导式填写，智能提示下一项

用户选择「一键填充」→ 自动执行 → 表单填好 ✓
```

### 场景 2：用户正在浏览电商页面

```
用户操作：
1. 在 Amazon/淘宝 商品页面
2. 触发智能推荐

系统响应：
🛒 检测到电商商品页面
✨ 推荐脚本：
   ├─ 「价格历史追踪」- 自动监控价格变动
   ├─ 「商品信息提取」- 导出规格、评价、价格数据
   └─ 「自动比价」- 打开多个平台对比同款价格
```

---

## 🔧 技术实现要点

### WebView 预览组件
- 使用 Tauri 多窗口机制创建预览窗口
- 预注入内容脚本提取 DOM
- 支持用户交互选择需要关注的元素

### 浏览器扩展
- Manifest V3 规范
- Native Messaging 主机通信
- 权限最小化设计

### OCR 能力
- 使用 Tesseract.js 或 Windows OCR
- 本地处理，不上传数据
- 支持区域截图（用户框选）

### Agent 集成
- 利用现有 Agent 通信管道
- 上下文注入到 Prompt
- 脚本代码安全沙箱执行

---

## 🚀 实施路线图

### Phase 1: WebView 预览基础
- [ ] 创建 WebView 预览窗口组件
- [ ] 实现 DOM 内容提取脚本
- [ ] 基础上下文管道

### Phase 2: 脚本推荐引擎
- [ ] 内置常用脚本模板库
- [ ] Agent 集成与 Prompt 设计
- [ ] 推荐结果展示面板

### Phase 3: 浏览器扩展桥接
- [ ] Chrome 扩展开发
- [ ] Native Messaging 主机
- [ ] 无缝集成体验

### Phase 4: OCR 截图能力
- [ ] 窗口截图功能
- [ ] OCR 文本提取
- [ ] 视觉布局分析
