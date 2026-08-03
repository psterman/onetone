/**
 * 视觉感知 + Agent 智能脚本推荐系统 入口
 * 
 * 功能:
 * 1. WebView 网页内容捕获
 * 2. 视觉上下文管道处理
 * 3. 智能脚本推荐引擎
 * 4. 脚本执行沙箱
 * 
 * 使用方法:
 * ```javascript
 * import { initVisualAgent, openWebView, getRecommendations } from './features/visual-agent';
 * 
 * // 初始化系统
 * initVisualAgent();
 * 
 * // 打开预览并捕获网页
 * await openWebView('https://example.com');
 * 
 * // 获取脚本推荐
 * const scripts = await getRecommendations();
 * ```
 */

// 导出核心组件
export * from './visual-context-pipe';
export * from './script-recommender';
export * from './webview-preview';
export { default as ScriptRecommendationPanel } from './script-recommendation-panel.jsx';

import { getVisualContextPipe } from './visual-context-pipe';
import { getScriptRecommender } from './script-recommender';
import { openWebViewPreview, navigateTo, triggerScriptRecommendation } from './webview-preview';

// 全局状态
let isInitialized = false;
let currentContext = null;

/**
 * 初始化视觉 Agent 系统
 */
export function initVisualAgent(options = {}) {
  if (isInitialized) {
    console.warn('[VisualAgent] 已经初始化，跳过');
    return;
  }

  console.log('[VisualAgent] 初始化智能脚本推荐系统...');

  // 初始化单例
  getVisualContextPipe();
  getScriptRecommender();

  // 设置事件监听（如果是浏览器环境）
  if (typeof window !== 'undefined') {
    setupEventListeners();
  }

  isInitialized = true;
  console.log('[VisualAgent] ✅ 初始化完成');
}

/**
 * 打开网页预览并捕获内容
 */
export async function openWebView(url) {
  try {
    console.log(`[VisualAgent] 打开网页预览: ${url}`);
    await openWebViewPreview(url);
    
    // 等待内容提取完成（实际项目中应该通过事件回调）
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return true;
  } catch (error) {
    console.error('[VisualAgent] 打开网页失败:', error);
    throw error;
  }
}

/**
 * 获取当前页面的脚本推荐
 */
export async function getRecommendations() {
  const context = getVisualContextPipe().getRecentContext();
  
  if (!context) {
    throw new Error('没有可用的页面上下文，请先打开网页预览');
  }

  console.log('[VisualAgent] 基于上下文生成脚本推荐...');
  const recommendations = await getScriptRecommender().recommend(context);
  
  console.log(`[VisualAgent] 生成了 ${recommendations.length} 个脚本推荐`);
  return recommendations;
}

/**
 * 执行指定的脚本
 */
export async function executeScript(scriptCode) {
  console.log('[VisualAgent] 执行脚本...');
  
  try {
    // 使用沙箱执行
    const result = executeScriptInSandbox(scriptCode);
    
    if (result.success) {
      console.log('[VisualAgent] ✅ 脚本执行成功');
    } else {
      console.error('[VisualAgent] ❌ 脚本执行失败:', result.error);
    }
    
    return result;
  } catch (error) {
    console.error('[VisualAgent] ❌ 脚本执行异常:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 设置全局事件监听
 */
function setupEventListeners() {
  // 监听页面内容提取完成事件
  window.addEventListener('page-content-extracted', (event) => {
    console.log('[VisualAgent] 📥 收到页面内容:', event.detail);
    currentContext = event.detail;
  });

  // 快捷键触发 (Ctrl+Shift+A 打开推荐面板)
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'A') {
      console.log('[VisualAgent] 快捷键触发: 打开智能推荐面板');
      // 这里可以触发面板显示逻辑
    }
  });
}

/**
 * 脚本沙箱执行函数（与组件内相同，提供统一调用入口）
 */
function executeScriptInSandbox(scriptCode) {
  try {
    const sandbox = {
      console: console,
      document: document,
      window: window,
      navigator: navigator,
      setTimeout: setTimeout,
      setInterval: setInterval,
      localStorage: localStorage,
      alert: alert,
      confirm: confirm,
      prompt: prompt,
      URL: URL,
      Blob: Blob
    };

    const executor = new Function(...Object.keys(sandbox), `
      "use strict";
      try {
        ${scriptCode}
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    `);

    const result = executor(...Object.values(sandbox));
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 获取当前状态信息
 */
export function getVisualAgentStatus() {
  const pipe = getVisualContextPipe();
  const recentContext = pipe.getRecentContext();
  
  return {
    initialized: isInitialized,
    hasContext: !!recentContext,
    currentUrl: recentContext?.url,
    currentDomain: recentContext?.domain,
    contentType: recentContext?.contentType,
    contextHistory: pipe.recentContexts?.length || 0
  };
}

// 默认导出初始化函数
export default {
  init: initVisualAgent,
  openWebView,
  getRecommendations,
  executeScript,
  getStatus: getVisualAgentStatus
};
