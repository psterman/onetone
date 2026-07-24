# 虚拟键盘方案评估文档

## 1. 现状分析

### 1.1 当前项目结构

项目主要包含以下关键组件：

```
AgentController/
├── Models/
│   ├── AppSettings.cs              // 应用配置
│   └── AgentKeypadPresentation.cs  // Agent键盘展示
├── Services/
│   ├── SettingsService.cs         // 配置服务
│   └── CodexKeybindingService.cs  // Codex键绑定服务
├── Controllers/
│   └── RadialLayerCoordinator.cs  // 层级协调器
├── ViewModels/
│   └── SettingsPageViewModel.cs   // 设置页面视图模型
└── Views/
    ├── AgentKeypadView.xaml       // Agent键盘视图
    ├── ActionMenuView.xaml        // 动作菜单视图
    └── SettingsPageView.xaml      // 设置页面视图
```

### 1.2 当前功能覆盖

| 功能模块 | 完成度 | 说明 |
|---------|--------|------|
| 基础配置管理 | 90% | SettingsService 实现了完整的配置持久化和加载 |
| Codex 键绑定 | 80% | CodexKeybindingService 实现了键绑定写入Codex配置 |
| Agent键盘展示 | 60% | AgentKeypadView和相关模型存在 |
| 启动管理 | 70% | StartWithWindows配置和StartupRegistrationService |
| 快捷键编辑 | 30% | 仅有硬编码的几个快捷键在设置中 |
| 方案/模板管理 | 0% | 无任何方案保存、加载功能 |
| 自动检测应用场景 | 0% | 需要手动配置，没有上下文感知 |

### 1.3 技术债务清单

#### 债务 1：层级概念混乱（高优先级）

**问题描述**：
根据 `VirtualKeyboardHierarchyRedesign.md` 文档分析，当前的 `RadialMenuLayerKind` 概念混杂了多个维度：
- PanelType（面板类型）
- FunctionContext（功能场景）
- InteractionMode（交互模式）

**影响范围**：
- RadialLayerCoordinator
- RadialMenuView
- 所有相关的视图和控制器

**修复成本估算**：2-3周的重构工作

---

#### 债务 2：没有方案/模板管理（高优先级）

**问题描述**：
- 当前所有配置都是单例的 AppSettings
- 无法保存多个键盘布局方案
- 无法在不同场景（编程、写作、设计）之间快速切换
- 无法分享和导入他人的优秀配置

**技术影响**：
- 用户体验差，无法满足不同使用场景的需求
- 限制了产品的扩展性和商业潜力

---

#### 债务 3：快捷键配置UI不完整（中优先级）

**问题描述**：
- SettingsPageViewModel 中暴露的快捷键属性非常有限
- 没有直观的快捷键录制和冲突检测界面
- 没有可视化的键盘布局查看器

**当前支持的快捷键**：
```csharp
ReasoningDownShortcut    // 降低推理程度
ReasoningUpShortcut      // 提高推理程度
ModelPickerShortcut      // 模型选择器
FastToggleShortcut       // 快速切换
ForkShortcut             // 分支对话
DictationShortcut        // 听写
CancelShortcut           // 取消
```

**缺少的功能**：
- 自定义新增快捷键
- 快捷键分组管理
- 导入/导出键绑定配置

---

#### 债务 4：缺少上下文感知和自动配置（中优先级）

**问题描述**：
- 没有检测当前活动应用的逻辑
- 没有根据应用类型自动切换键盘布局
- 缺少智能推荐和学习功能

**影响**：
- 用户需要手动在不同场景间切换
- 易用性和智能化程度低

---

#### 债务 5：文档和示例不足（低优先级）

**问题描述**：
- 缺少用户指南
- 缺少预设方案示例
- 缺少开发者文档

## 2. 功能规划

### 2.1 核心功能模块设计

#### 模块 1：方案管理系统

```
方案管理
├── 方案模型 (KeyboardScheme)
│   ├── 方案ID
│   ├── 方案名称
│   ├── 方案描述
│   ├── 创建时间
│   ├── 最后修改时间
│   ├── 是否默认
│   ├── 键绑定配置
│   ├── 布局配置
│   └── 其他配置
├── 方案管理器 (SchemeManager)
│   ├── 加载所有方案
│   ├── 保存方案
│   ├── 删除方案
│   ├── 复制方案
│   ├── 导出方案
│   ├── 导入方案
│   └── 切换方案
└── 方案存储
    ├── 文件存储 (JSON)
    └── 目录结构管理
```

**数据模型设计**：
```csharp
public sealed record KeyboardScheme
{
    public string Id { get; init; } = Guid.NewGuid().ToString();
    public string Name { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; init; } = DateTimeOffset.UtcNow;
    public bool IsDefault { get; init; }
    
    // 键盘映射
    public KeypadLayout Layout { get; init; } = KeypadLayout.Default;
    
    // 快捷键绑定
    public Dictionary<string, string> Keybindings { get; init; } = [];
    
    // 其他配置
    public SchemeSettings Settings { get; init; } = new();
}

public sealed record KeypadLayout
{
    // 自定义键盘映射
    public Dictionary<string, KeypadKey> Keys { get; init; } = [];
}

public sealed record KeypadKey
{
    public string ActionId { get; init; } = string.Empty;
    public string DisplayName { get; init; } = string.Empty;
    public string? Color { get; init; }
    public bool IsVisible { get; init; } = true;
}

public sealed record SchemeSettings
{
    public bool HapticFeedback { get; init; } = true;
    public bool ShowOverlay { get; init; } = true;
    public string RadialMenuMode { get; init; } = RadialMenuModes.Learning;
}
```

---

#### 模块 2：场景感知系统

```
场景感知系统
├── 场景检测器 (ContextDetector)
│   ├── 检测前台应用
│   ├── 检测活跃进程
│   └── 检测用户当前活动
├── 场景规则引擎 (ContextRuleEngine)
│   ├── 规则定义
│   ├── 规则匹配
│   └── 方案自动切换
└── 场景预设配置
    ├── 编程模式 (Visual Studio/VS Code)
    ├── 文档模式 (Word/Notion)
    ├── 设计模式 (Figma/Photoshop)
    └── 聊天模式 (Discord/Slack)
```

**场景规则设计**：
```csharp
public sealed record ContextRule
{
    public string Id { get; init; } = Guid.NewGuid().ToString();
    public string Name { get; init; } = string.Empty;
    public List<ContextCondition> Conditions { get; init; } = [];
    public string SchemeId { get; init; } = string.Empty;
}

public sealed record ContextCondition
{
    public ContextConditionType Type { get; init; }
    public string Value { get; init; } = string.Empty;
    public bool IsMatch { get; init; }
}

public enum ContextConditionType
{
    ApplicationName,   // 应用程序名称
    ProcessName,       // 进程名称
    WindowTitle,       // 窗口标题
    FileExtension,     // 活动文件扩展名
    TimeOfDay,         // 时间段
}
```

---

#### 模块 3：快捷键编辑器

```
快捷键编辑器
├── 键盘可视化组件 (KeypadVisualizer)
│   ├── 数字键盘视图
│   ├── 快捷键标注
│   └── 状态指示
├── 快捷键录制器 (KeybindingRecorder)
│   ├── 按键监听
│   ├── 冲突检测
│   └── 按键绑定
└── 快捷键分类管理
    ├── Claude相关
    ├── Codex相关
    ├── 系统控制
    └── 自定义命令
```

---

#### 模块 4：启动和自动管理

```
启动和自动管理
├── 启动管理器 (StartupManager)
│   ├── 开机自启配置
│   ├── 启动模式选择
│   └── 延迟启动配置
├── 托盘集成 (TrayIconManager)
│   ├── 快捷菜单
│   ├── 方案快速切换
│   └── 状态指示器
└── 自动更新和检查
    ├── 方案更新
    └── 配置同步
```

### 2.2 配置页面重构设计

#### 新的配置页面结构

```
设置页面
├── 方案管理页
│   ├── 方案列表
│   ├── 新建/复制/删除
│   ├── 导入/导出
│   └── 设为默认
├── 键盘配置页
│   ├── 可视化键盘
│   ├── 按键功能编辑
│   ├── 布局保存
│   └── 方案预览
├── 快捷键配置页
│   ├── 快捷键列表
│   ├── 按键录制器
│   ├── 冲突检测
│   └── 分组管理
├── 场景自动化页
│   ├── 场景规则管理
│   ├── 自动切换配置
│   └── 规则测试
└── 系统设置页
    ├── 启动管理
    ├── 界面设置
    ├── 托盘设置
    └── 关于
```

## 3. 实施路径规划

### 阶段 1：方案管理系统（2周）

**目标**：实现基本的方案保存和切换功能

**任务清单**：
- [ ] 设计并实现 KeyboardScheme 数据模型
- [ ] 实现 SchemeManager 服务类
- [ ] 修改 SettingsService 支持方案集成
- [ ] 在配置页面添加方案管理UI
- [ ] 实现方案切换逻辑
- [ ] 实现方案的导入/导出功能（JSON格式）

**风险点**：
- 现有AppSettings与新的方案系统的兼容性
- 迁移现有配置到新的系统

---

### 阶段 2：键盘配置可视化（2周）

**目标**：提供直观的键盘配置界面

**任务清单**：
- [ ] 创建键盘可视化组件
- [ ] 实现按键编辑功能
- [ ] 添加Agent状态颜色配置
- [ ] 实现布局预览
- [ ] 集成到配置页面

**技术难点**：
- 动态UI生成
- 按键拖拽和编辑的用户体验

---

### 阶段 3：快捷键编辑器增强（2周）

**目标**：完整的快捷键管理系统

**任务清单**：
- [ ] 实现快捷键录制组件
- [ ] 添加快捷键冲突检测
- [ ] 实现快捷键分组管理
- [ ] 扩展AppSettings支持更多自定义快捷键
- [ ] 优化快捷键配置UI/UX

---

### 阶段 4：场景感知系统（2-3周）

**目标**：智能场景检测和自动配置切换

**任务清单**：
- [ ] 实现前台应用检测器
- [ ] 设计并实现场景规则引擎
- [ ] 创建规则配置UI
- [ ] 实现预设场景配置
- [ ] 添加规则测试和调试工具

**技术难点**：
- 跨平台应用检测的兼容性
- 规则引擎性能和准确性

---

### 阶段 5：完善和优化（2周）

**目标**：完善系统、文档和性能优化

**任务清单**：
- [ ] 添加使用教程和帮助文档
- [ ] 创建预设方案库
- [ ] 性能优化
- [ ] Bug修复和稳定性改进
- [ ] 用户体验优化

## 4. 潜在坑点分析

### 坑点 1：配置版本兼容性

**问题**：
- 未来可能需要更改 KeyboardScheme 的数据结构
- 用户已保存的方案需要能够正确迁移

**解决方案**：
- 设计时就考虑版本管理
- 实现方案版本转换器
- 提供导入旧版配置的功能

---

### 坑点 2：键盘钩子冲突

**问题**：
- 全局键盘钩子可能与其他软件冲突
- 在某些环境下可能被安全软件拦截

**解决方案**：
- 提供多种实现方式备选
- 添加冲突检测和提示
- 提供禁用快捷键的安全模式

---

### 坑点 3：跨平台兼容性

**问题**：
- Windows/macOS/Linux的键盘处理不同
- 用户可能在多平台间使用

**解决方案**：
- 抽象键盘处理接口
- 平台特定的实现细节封装
- 配置数据设计为跨平台兼容

---

### 坑点 4：性能和响应性

**问题**：
- 大量的键盘监听可能影响性能
- 场景检测可能造成延迟

**解决方案**：
- 优化检测频率和策略
- 使用缓存避免重复计算
- 提供可配置的性能选项

---

### 坑点 5：用户学习曲线

**问题**：
- 功能越强大，复杂度越高
- 新用户可能望而却步

**解决方案**：
- 提供预设方案库
- 实现渐进式揭示（Progressive Disclosure）
- 优秀的引导和教程
- 直观的可视化交互

## 5. 用户心智模型设计

### 5.1 核心概念

| 概念 | 类比 | 说明 |
|------|------|------|
| 方案 (Scheme) | 服装/设备的一套配置 | 完整的键盘配置集合 |
| 场景 (Context) | 场合/环境 | 何时使用哪个方案的规则 |
| 按键 (Key) | 控制按钮/工具 | 键盘上的单个按钮功能 |
| 绑定 (Binding) | 连接/关联 | 按键与功能的映射关系 |

### 5.2 用户工作流

**场景 A：初次使用**
1. 启动应用
2. 查看预设方案库
3. 选择一个合适的预设（如"开发者模式"）
4. 根据需要微调
5. 开始使用

**场景 B：自定义自己的方案**
1. 从预设复制或新建
2. 在可视化键盘编辑器中调整
3. 配置自己的快捷键
4. 测试效果
5. 保存并使用

**场景 C：多场景切换**
1. 设置场景规则（如"在VS Code中使用开发者模式"）
2. 继续日常工作
3. 应用自动在合适的时候切换方案

## 6. 总结

### 6.1 核心改进点

1. **方案管理系统** - 从单一配置到多方案灵活切换
2. **可视化键盘编辑器** - 直观的配置方式，降低学习曲线
3. **场景感知系统** - 智能化、自动化的用户体验
4. **完整的快捷键管理** - 解决当前配置不完整的问题

### 6.2 优先级排序

**高优先级**：
1. 方案管理系统
2. 解决层级概念混乱的架构债务
3. 可视化键盘编辑器

**中优先级**：
4. 快捷键编辑器增强
5. 场景感知系统

**低优先级**：
6. 文档和教程完善
7. 高级自动化功能

### 6.3 成功指标

- 配置时间从30分钟降到5分钟
- 用户满意度评分提高
- 预设方案使用率 > 60%
- 自动化场景切换功能使用率 > 30%
