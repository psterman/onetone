/**
 * 脚本推荐引擎
 * 
 * 基于视觉上下文智能推荐合适的自动化脚本
 * 支持内置模板和动态生成两种方式
 */

import { VisualContext, CONTENT_TYPE, ScriptRecommendation } from './visual-context-pipe';

// 脚本模板类别
const SCRIPT_CATEGORY = {
  FILL_FORM: 'fill_form',
  EXTRACT_DATA: 'extract_data',
  AUTOMATE_CLICK: 'automate_click',
  MONITOR_CHANGE: 'monitor_change',
  ENHANCE_UI: 'enhance_ui',
  CUSTOM: 'custom'
};

/**
 * 内置脚本模板库
 */
const scriptTemplates = [
  // 表单相关模板
  {
    id: 'template-auto-fill-form',
    category: SCRIPT_CATEGORY.FILL_FORM,
    title: '一键填充常用信息',
    description: '自动填写表单中的常用字段（姓名、邮箱、电话等）',
    applicableTypes: [CONTENT_TYPE.FORM, CONTENT_TYPE.OTHER],
    confidenceBase: 0.9,
    generateScript: (context) => {
      const inputs = context.keyElements.filter(e => e.type === 'input');
      const inputFields = inputs.slice(0, 8).map(i => 
        `  // ${i.label || i.name || '字段'}\n  const ${i.name || 'input'} = document.querySelector('${i.selector || '[name="' + i.name + '"]'}');\n  // if (${i.name || 'input'}) ${i.name || 'input'}.value = '你的${i.label || '信息'}';`
      ).join('\n');
      
      return `// 自动填充表单
(function() {
  // 用户常用信息（可以从配置中读取）
  const userInfo = {
    name: '你的姓名',
    email: 'your@email.com',
    phone: '13800138000',
    address: '你的地址'
  };

  // 自动识别并填充字段
${inputFields}

  console.log('✅ 表单自动填充完成');
})();`;
    }
  },
  {
    id: 'template-export-form-data',
    category: SCRIPT_CATEGORY.EXTRACT_DATA,
    title: '表单数据导出',
    description: '提取当前表单的所有字段和选项，保存为模板供下次使用',
    applicableTypes: [CONTENT_TYPE.FORM],
    confidenceBase: 0.85,
    generateScript: (context) => `// 导出表单数据
(function() {
  const formData = [];
  
  document.querySelectorAll('form input, form select, form textarea').forEach(el => {
    formData.push({
      type: el.type,
      name: el.name,
      id: el.id,
      value: el.value,
      placeholder: el.placeholder
    });
  });

  // 下载为 JSON 文件
  const blob = new Blob([JSON.stringify(formData, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'form-template.json';
  a.click();
  
  console.log('✅ 表单数据已导出');
})();`
  },

  // 数据提取模板
  {
    id: 'template-extract-product-info',
    category: SCRIPT_CATEGORY.EXTRACT_DATA,
    title: '商品信息提取',
    description: '提取电商页面的商品名称、价格、规格等信息',
    applicableTypes: [CONTENT_TYPE.ECOMMERCE, CONTENT_TYPE.OTHER],
    confidenceBase: 0.8,
    generateScript: (context) => `// 提取商品信息
(function() {
  const product = {
    title: document.querySelector('h1')?.textContent?.trim() || '',
    price: document.querySelector('.price, [class*="price"]')?.textContent?.trim() || '',
    url: window.location.href,
    timestamp: new Date().toISOString()
  };

  // 复制到剪贴板
  navigator.clipboard.writeText(JSON.stringify(product, null, 2));
  console.log('✅ 商品信息已复制到剪贴板', product);
})();`
  },

  // 自动化点击模板
  {
    id: 'template-auto-click-buttons',
    category: SCRIPT_CATEGORY.AUTOMATE_CLICK,
    title: '批量点击按钮',
    description: '自动点击页面上特定类型的按钮（如"同意"、"确认"等）',
    applicableTypes: [CONTENT_TYPE.OTHER, CONTENT_TYPE.FORM],
    confidenceBase: 0.7,
    generateScript: (context) => `// 自动点击按钮
(function() {
  const targetTexts = ['同意', '确认', '接受', '提交', '下一步', 'agree', 'confirm', 'accept'];
  
  document.querySelectorAll('button, input[type="button"], input[type="submit"]').forEach(btn => {
    const text = btn.textContent?.toLowerCase() || btn.value?.toLowerCase() || '';
    if (targetTexts.some(t => text.includes(t.toLowerCase()))) {
      console.log('🎯 自动点击:', btn.textContent || btn.value);
      btn.click();
    }
  });
})();`
  },

  // 监控变化模板
  {
    id: 'template-monitor-price',
    category: SCRIPT_CATEGORY.MONITOR_CHANGE,
    title: '价格变动监控',
    description: '监控商品价格变化，降价时自动提醒',
    applicableTypes: [CONTENT_TYPE.ECOMMERCE],
    confidenceBase: 0.75,
    generateScript: (context) => `// 价格变动监控
(function() {
  const initialPrice = document.querySelector('.price, [class*="price"]')?.textContent;
  
  setInterval(() => {
    const currentPrice = document.querySelector('.price, [class*="price"]')?.textContent;
    if (currentPrice !== initialPrice) {
      // 价格变化提醒
      document.title = '🔔 价格变动! ' + document.title.replace(/^🔔 /, '');
      alert('价格变化了! 原价:' + initialPrice + ', 现价:' + currentPrice);
    }
  }, 30000); // 每 30 秒检查一次
  
  console.log('✅ 价格监控已启动，初始价格:', initialPrice);
})();`
  },

  // UI 增强模板
  {
    id: 'template-enhance-form',
    category: SCRIPT_CATEGORY.ENHANCE_UI,
    title: '表单填写助手',
    description: '高亮必填字段、添加快捷键、保存填写进度',
    applicableTypes: [CONTENT_TYPE.FORM],
    confidenceBase: 0.7,
    generateScript: (context) => `// 表单填写助手
(function() {
  // 高亮必填字段
  document.querySelectorAll('[required], *[aria-required="true"]').forEach(el => {
    el.style.border = '2px solid #ff6b6b';
    el.style.backgroundColor = '#fff5f5';
  });

  // Ctrl+S 保存进度到 localStorage
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      const formData = {};
      document.querySelectorAll('form input, form select, form textarea').forEach(el => {
        if (el.name) formData[el.name] = el.value;
      });
      localStorage.setItem('form-draft', JSON.stringify(formData));
      console.log('✅ 表单草稿已保存');
    }
  });

  console.log('✅ 表单助手已启动 (Ctrl+S 保存草稿)');
})();`
  },

  // 视频页面专用
  {
    id: 'template-video-auto-play',
    category: SCRIPT_CATEGORY.AUTOMATE_CLICK,
    title: '视频自动播放/画质调整',
    description: '自动播放视频、跳过广告、设置最高画质',
    applicableTypes: [CONTENT_TYPE.VIDEO],
    confidenceBase: 0.85,
    generateScript: (context) => `// 视频自动化助手
(function() {
  // 尝试自动播放
  const video = document.querySelector('video');
  if (video) {
    video.muted = true; // 静音才能自动播放
    video.play().catch(() => console.log('需要用户交互才能播放'));
    
    // 设置最高画质（如果有选项）
    setTimeout(() => {
      const qualityBtns = document.querySelectorAll('[class*="quality"], [class*="清晰度"]');
      if (qualityBtns.length > 0) {
        qualityBtns[qualityBtns.length - 1].click(); // 点击最高画质
        console.log('✅ 已设置最高画质');
      }
    }, 2000);
  }

  // 尝试跳过广告
  const skipAd = () => {
    const skipBtn = document.querySelector('[class*="skip"], [class*="跳过"]');
    if (skipBtn && !skipBtn.disabled) {
      skipBtn.click();
      console.log('✅ 已跳过广告');
    }
  };
  setInterval(skipAd, 1000);

  console.log('✅ 视频助手已启动');
})();`
  }
];

/**
 * 脚本推荐引擎类
 */
export class ScriptRecommender {
  constructor() {
    this.templates = scriptTemplates;
    this.customRules = [];
  }

  /**
   * 基于上下文推荐脚本
   */
  async recommend(context) {
    console.log('[ScriptRecommender] 开始推荐脚本...');
    
    const recommendations = [];

    // 1. 匹配内置模板
    const templateRecommendations = this.matchTemplates(context);
    recommendations.push(...templateRecommendations);

    // 2. 基于特定元素生成定制脚本
    const customRecommendations = this.generateCustomRecommendations(context);
    recommendations.push(...customRecommendations);

    // 3. 按置信度排序
    recommendations.sort((a, b) => b.confidence - a.confidence);

    // 4. 限制返回数量（最多5个）
    return recommendations.slice(0, 5);
  }

  /**
   * 匹配内置模板
   */
  matchTemplates(context) {
    const recommendations = [];

    this.templates.forEach(template => {
      // 计算匹配度
      let confidence = template.confidenceBase;

      // 页面类型匹配加分
      if (template.applicableTypes.includes(context.contentType)) {
        confidence += 0.1;
      }

      // 表单页面 + 表单模板 额外加分
      if (context.isFormPage() && template.category === SCRIPT_CATEGORY.FILL_FORM) {
        confidence += 0.15;
      }

      // 电商页面 + 价格/商品模板 额外加分
      if (context.isEcommercePage() && 
          (template.category === SCRIPT_CATEGORY.MONITOR_CHANGE ||
           template.id.includes('product'))) {
        confidence += 0.15;
      }

      // 视频页面 + 视频模板 额外加分
      if (context.hasVideoContent() && template.id.includes('video')) {
        confidence += 0.2;
      }

      // 生成脚本代码
      const scriptCode = template.generateScript(context);

      recommendations.push(new ScriptRecommendation({
        title: template.title,
        description: template.description,
        confidence: Math.min(confidence, 1.0),
        category: template.category,
        scriptCode: scriptCode,
        estimatedTime: this.estimateTime(template.category),
        tags: this.generateTags(template, context)
      }));
    });

    return recommendations;
  }

  /**
   * 生成定制化推荐
   */
  generateCustomRecommendations(context) {
    const recommendations = [];

    // 检测到大量输入框时推荐表单填充
    if (context.keyElements.filter(e => e.type === 'input').length >= 3) {
      const inputNames = context.keyElements
        .filter(e => e.type === 'input')
        .slice(0, 5)
        .map(e => e.label || e.name)
        .filter(Boolean);

      recommendations.push(new ScriptRecommendation({
        title: `智能填充 ${inputNames.length} 个字段`,
        description: `自动填写: ${inputNames.join('、')} 等字段`,
        confidence: 0.78,
        category: SCRIPT_CATEGORY.FILL_FORM,
        scriptCode: this.generateFillScript(context),
        estimatedTime: '2-3 秒',
        tags: ['智能填充', '表单']
      }));
    }

    return recommendations;
  }

  /**
   * 生成字段填充脚本
   */
  generateFillScript(context) {
    const inputs = context.keyElements.filter(e => e.type === 'input');
    
    const fillLines = inputs.slice(0, 8).map(input => {
      const selector = input.selector || (input.name ? `[name="${input.name}"]` : null);
      if (!selector) return '';
      
      const fieldName = input.label || input.name || '字段';
      return `  // ${fieldName}\n  const el_${input.name || input.id} = document.querySelector('${selector}');\n  // if (el_${input.name || input.id}) el_${input.name || input.id}.value = '你的${fieldName}';`;
    }).filter(Boolean).join('\n');

    return `// 智能字段填充
(function() {
${fillLines}
  console.log('✅ 字段填充完成');
})();`;
  }

  /**
   * 估算执行时间
   */
  estimateTime(category) {
    const timeMap = {
      [SCRIPT_CATEGORY.FILL_FORM]: '1-3 秒',
      [SCRIPT_CATEGORY.EXTRACT_DATA]: '2-5 秒',
      [SCRIPT_CATEGORY.AUTOMATE_CLICK]: '1-2 秒',
      [SCRIPT_CATEGORY.MONITOR_CHANGE]: '持续运行',
      [SCRIPT_CATEGORY.ENHANCE_UI]: '立即生效',
      [SCRIPT_CATEGORY.CUSTOM]: '取决于脚本'
    };
    return timeMap[category] || '未知';
  }

  /**
   * 生成标签
   */
  generateTags(template, context) {
    const tags = [];
    
    if (context.isFormPage()) tags.push('表单');
    if (context.isEcommercePage()) tags.push('电商');
    if (context.hasVideoContent()) tags.push('视频');
    
    if (template.category === SCRIPT_CATEGORY.FILL_FORM) tags.push('自动填充');
    if (template.category === SCRIPT_CATEGORY.EXTRACT_DATA) tags.push('数据提取');
    if (template.category === SCRIPT_CATEGORY.AUTOMATE_CLICK) tags.push('自动化');
    
    return tags;
  }

  /**
   * 添加自定义模板
   */
  addCustomTemplate(template) {
    this.templates.push(template);
  }
}

// 导出单例
let instance = null;

export function getScriptRecommender() {
  if (!instance) {
    instance = new ScriptRecommender();
  }
  return instance;
}

export default ScriptRecommender;
