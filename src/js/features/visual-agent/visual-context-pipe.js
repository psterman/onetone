/**
 * 视觉上下文管道
 * 
 * 接收来自 WebView、浏览器扩展或 OCR 的视觉数据
 * 处理后生成 Agent 可用的 Prompt 上下文
 */

// 视觉上下文类型
export const CONTEXT_SOURCE = {
  WEBVIEW: 'webview',
  EXTENSION: 'extension',
  OCR: 'ocr'
};

// 内容类型分类
export const CONTENT_TYPE = {
  ARTICLE: 'article',      // 文章/内容页
  FORM: 'form',            // 表单页面
  VIDEO: 'video',          // 视频页面
  SOCIAL: 'social',        // 社交媒体
  ECOMMERCE: 'ecommerce',  // 电商页面
  SEARCH: 'search',        // 搜索结果页
  DASHBOARD: 'dashboard',  // 仪表盘/后台
  OTHER: 'other'
};

/**
 * 视觉上下文类
 */
export class VisualContext {
  constructor(data = {}) {
    this.source = data.source || CONTEXT_SOURCE.WEBVIEW;
    this.url = data.url || '';
    this.title = data.title || '';
    this.domain = data.domain || '';
    this.contentType = data.contentType || CONTENT_TYPE.OTHER;
    this.textContent = data.textContent || '';
    this.forms = data.forms || [];
    this.buttons = data.buttons || [];
    this.links = data.links || [];
    this.images = data.images || [];
    this.meta = data.meta || {};
    this.timestamp = data.timestamp || Date.now();
    this.keyElements = data.keyElements || [];
    this.confidence = data.confidence || 1.0;
  }

  /**
   * 判断是否为表单页面
   */
  isFormPage() {
    return this.forms.length > 0 || 
           this.contentType === CONTENT_TYPE.FORM ||
           this.textContent.toLowerCase().includes('表单') ||
           this.textContent.toLowerCase().includes('填写') ||
           this.textContent.toLowerCase().includes('submit');
  }

  /**
   * 判断是否为电商页面
   */
  isEcommercePage() {
    const ecommerceKeywords = ['价格', '购物车', '购买', '商品', '订单', '支付', 'price', 'cart', 'buy', 'product'];
    return ecommerceKeywords.some(keyword => 
      this.textContent.toLowerCase().includes(keyword.toLowerCase())
    ) || this.contentType === CONTENT_TYPE.ECOMMERCE;
  }

  /**
   * 判断是否包含视频
   */
  hasVideoContent() {
    return this.contentType === CONTENT_TYPE.VIDEO ||
           this.textContent.toLowerCase().includes('视频') ||
           this.textContent.toLowerCase().includes('video');
  }

  /**
   * 获取页面摘要
   */
  getSummary() {
    return {
      domain: this.domain,
      title: this.title,
      hasForm: this.isFormPage(),
      hasEcommerce: this.isEcommercePage(),
      formCount: this.forms.length,
      buttonCount: this.buttons.length,
      linkCount: this.links.length,
      contentLength: this.textContent.length
    };
  }
}

/**
 * 视觉上下文管道类
 * 负责处理和转换视觉数据为 Agent 可用的格式
 */
export class VisualContextPipe {
  constructor() {
    this.recentContexts = [];
    this.maxHistory = 10;
  }

  /**
   * 接收原始视觉数据并处理
   */
  async ingest(source, rawData) {
    console.log(`[VisualContextPipe] 接收数据: ${source}`);
    
    // 提取结构化上下文
    const context = this.extractContext(source, rawData);
    
    // 保存到历史
    this.recentContexts.unshift(context);
    if (this.recentContexts.length > this.maxHistory) {
      this.recentContexts.pop();
    }
    
    return context;
  }

  /**
   * 从原始数据中提取结构化上下文
   */
  extractContext(source, rawData) {
    // 基础信息
    const context = new VisualContext({
      source,
      url: rawData.url,
      title: rawData.title,
      domain: rawData.domain,
      textContent: rawData.textContent,
      forms: rawData.forms || [],
      buttons: rawData.buttons || [],
      links: rawData.links || [],
      meta: rawData.meta || {},
      timestamp: Date.now()
    });

    // 自动识别内容类型
    context.contentType = this.detectContentType(context);

    // 提取关键元素（可能需要脚本操作的元素）
    context.keyElements = this.extractKeyElements(context);

    return context;
  }

  /**
   * 检测页面内容类型
   */
  detectContentType(context) {
    const text = context.textContent.toLowerCase();
    const domain = context.domain.toLowerCase();

    // 表单页面检测
    if (context.forms.length > 0 || 
        text.includes('login') || 
        text.includes('signin') ||
        text.includes('注册') ||
        text.includes('登录')) {
      return CONTENT_TYPE.FORM;
    }

    // 电商页面检测
    if (domain.includes('amazon') || 
        domain.includes('taobao') ||
        domain.includes('jd.com') ||
        text.includes('价格') ||
        text.includes('购物车')) {
      return CONTENT_TYPE.ECOMMERCE;
    }

    // 视频页面检测
    if (domain.includes('youtube') ||
        domain.includes('bilibili') ||
        domain.includes('tiktok') ||
        text.includes('video') ||
        text.includes('视频')) {
      return CONTENT_TYPE.VIDEO;
    }

    // 社交媒体检测
    if (domain.includes('twitter') ||
        domain.includes('facebook') ||
        domain.includes('weibo') ||
        domain.includes('xiaohongshu')) {
      return CONTENT_TYPE.SOCIAL;
    }

    // 搜索结果页检测
    if (text.includes('搜索结果') ||
        text.includes('search results') ||
        context.links.length > 20) {
      return CONTENT_TYPE.SEARCH;
    }

    return CONTENT_TYPE.OTHER;
  }

  /**
   * 提取关键可操作元素
   */
  extractKeyElements(context) {
    const elements = [];

    // 表单输入框
    context.forms.forEach((form, formIdx) => {
      form.inputs?.forEach((input, inputIdx) => {
        if (input.name || input.id) {
          elements.push({
            type: 'input',
            subtype: input.type,
            name: input.name,
            id: input.id,
            label: input.label,
            placeholder: input.placeholder,
            formId: form.id,
            selector: input.id ? `#${input.id}` : (input.name ? `[name="${input.name}"]` : null)
          });
        }
      });
    });

    // 重要按钮
    const importantBtnTexts = [
      '提交', '确认', '登录', '注册', '搜索', '购买', '支付',
      'submit', 'confirm', 'login', 'register', 'search', 'buy', 'pay'
    ];

    context.buttons.forEach(btn => {
      const btnText = (btn.text || '').toLowerCase();
      if (importantBtnTexts.some(t => btnText.includes(t))) {
        elements.push({
          type: 'button',
          text: btn.text,
          id: btn.id,
          importance: 'high'
        });
      }
    });

    return elements;
  }

  /**
   * 生成 Agent 用的 Prompt 上下文
   * 将视觉数据转换成 AI 能理解的自然语言描述
   */
  generatePrompt(context) {
    const summary = context.getSummary();
    
    // 基础描述部分
    let prompt = `【网页上下文信息】\n`;
    prompt += `网站: ${context.domain}\n`;
    prompt += `标题: ${context.title}\n`;
    prompt += `URL: ${context.url}\n\n`;

    // 页面类型判断
    prompt += `【页面类型分析】\n`;
    if (context.isFormPage()) {
      prompt += `- 检测到表单页面，包含 ${summary.formCount} 个表单\n`;
      if (context.forms.length > 0) {
        prompt += `表单字段:\n`;
        context.forms[0].inputs?.forEach(input => {
          const label = input.label || input.placeholder || input.name || '未命名字段';
          prompt += `  - ${label} (类型: ${input.type})\n`;
        });
      }
    }
    if (context.isEcommercePage()) {
      prompt += `- 检测到电商/购物页面\n`;
    }
    if (context.hasVideoContent()) {
      prompt += `- 检测到视频内容\n`;
    }
    prompt += `\n`;

    // 关键元素部分
    if (context.keyElements.length > 0) {
      prompt += `【可操作元素】\n`;
      context.keyElements.slice(0, 10).forEach(elem => {
        if (elem.type === 'input') {
          prompt += `- 输入框: ${elem.label || elem.name} (${elem.subtype})\n`;
        } else if (elem.type === 'button') {
          prompt += `- 按钮: ${elem.text}\n`;
        }
      });
      if (context.keyElements.length > 10) {
        prompt += `- ...还有 ${context.keyElements.length - 10} 个元素\n`;
      }
      prompt += `\n`;
    }

    // 页面内容摘要
    const contentPreview = context.textContent.substring(0, 500);
    if (contentPreview) {
      prompt += `【页面内容摘要】\n`;
      prompt += `${contentPreview}...\n\n`;
    }

    // 任务引导
    prompt += `【任务】\n`;
    prompt += `基于上述网页上下文，请为用户推荐 3-5 个最合适的自动化脚本。\n`;
    prompt += `每个脚本需要包含：\n`;
    prompt += `1. 脚本名称（简短描述）\n`;
    prompt += `2. 脚本功能说明\n`;
    prompt += `3. 具体的代码实现（JavaScript）\n`;
    prompt += `4. 预估执行时间\n`;
    prompt += `5. 注意事项\n\n`;
    prompt += `请根据页面类型和元素智能推荐最相关的脚本，例如：\n`;
    prompt += `- 表单页面：自动填充、表单数据导出、分步填写助手\n`;
    prompt += `- 电商页面：价格监控、商品信息提取、自动比价\n`;
    prompt += `- 视频页面：自动播放、字幕提取、下载助手\n`;

    return prompt;
  }

  /**
   * 获取最近的上下文
   */
  getRecentContext() {
    return this.recentContexts[0] || null;
  }

  /**
   * 清空历史
   */
  clearHistory() {
    this.recentContexts = [];
  }
}

/**
 * 脚本推荐类
 */
export class ScriptRecommendation {
  constructor(options = {}) {
    this.id = options.id || this.generateId();
    this.title = options.title || '';
    this.description = options.description || '';
    this.confidence = options.confidence || 0.5;
    this.category = options.category || 'custom';
    this.scriptCode = options.scriptCode || '';
    this.estimatedTime = options.estimatedTime || '未知';
    this.prerequisites = options.prerequisites || [];
    this.tags = options.tags || [];
  }

  generateId() {
    return 'script-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      confidence: this.confidence,
      category: this.category,
      scriptCode: this.scriptCode,
      estimatedTime: this.estimatedTime,
      prerequisites: this.prerequisites,
      tags: this.tags
    };
  }
}

// 导出单例
let instance = null;

export function getVisualContextPipe() {
  if (!instance) {
    instance = new VisualContextPipe();
  }
  return instance;
}

export default VisualContextPipe;
