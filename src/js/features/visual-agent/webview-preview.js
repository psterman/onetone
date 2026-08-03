/**
 * WebView 网页预览组件
 * 
 * 在 voice-pilot 中嵌入浏览器预览窗口
 * 提取网页内容并传给 Agent 进行智能脚本推荐
 */

import { createSignal, createStore } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

// 预览窗口状态
const [isPreviewOpen, setIsPreviewOpen] = createSignal(false);
const [currentUrl, setCurrentUrl] = createSignal('');
const [isLoading, setIsLoading] = createSignal(false);
const [extractedContent, setExtractedContent] = createStore({
  title: '',
  textContent: '',
  keyElements: [],
  forms: [],
  links: []
});

// 视觉上下文管道
import { VisualContextPipe } from './visual-context-pipe';
const contextPipe = new VisualContextPipe();

/**
 * 打开 WebView 预览窗口
 */
export async function openWebViewPreview(url = '') {
  try {
    setIsLoading(true);
    
    // 创建预览窗口
    await invoke('create_webview_preview', {
      url: url || 'https://www.google.com',
      width: 1024,
      height: 768,
      x: 100,
      y: 100
    });
    
    setIsPreviewOpen(true);
    setCurrentUrl(url);
    
    // 注入内容提取脚本
    await injectContentExtractor();
    
  } catch (error) {
    console.error('打开 WebView 预览失败:', error);
    throw error;
  } finally {
    setIsLoading(false);
  }
}

/**
 * 关闭 WebView 预览窗口
 */
export async function closeWebViewPreview() {
  try {
    await invoke('close_webview_preview');
    setIsPreviewOpen(false);
    setCurrentUrl('');
  } catch (error) {
    console.error('关闭 WebView 预览失败:', error);
  }
}

/**
 * 注入内容提取脚本到 WebView
 */
async function injectContentExtractor() {
  const extractorScript = `
    (function() {
      // 等待页面加载完成
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', extractPageContent);
      } else {
        extractPageContent();
      }
      
      function extractPageContent() {
        // 提取页面基本信息
        const content = {
          url: window.location.href,
          title: document.title,
          domain: window.location.hostname,
          
          // 主要文本内容（限制字数）
          textContent: document.body.innerText.substring(0, 5000),
          
          // 识别表单
          forms: Array.from(document.querySelectorAll('form')).map((form, idx) => ({
            id: form.id || 'form-' + idx,
            action: form.action,
            method: form.method,
            inputs: Array.from(form.querySelectorAll('input, select, textarea')).map(input => ({
              type: input.type,
              name: input.name,
              id: input.id,
              placeholder: input.placeholder,
              label: findLabel(input)
            }))
          })),
          
          // 识别关键按钮
          buttons: Array.from(document.querySelectorAll('button, input[type="submit"]'))
            .filter(btn => btn.offsetParent !== null) // 只取可见的
            .slice(0, 20) // 限制数量
            .map((btn, idx) => ({
              id: btn.id || 'btn-' + idx,
              text: btn.textContent?.trim() || btn.value,
              type: btn.type
            })),
          
          // 识别主要链接
          links: Array.from(document.querySelectorAll('a[href]'))
            .filter(a => a.offsetParent !== null)
            .slice(0, 30)
            .map(a => ({
              text: a.textContent?.trim(),
              href: a.href
            })),
          
          // 页面元数据
          meta: {
            description: document.querySelector('meta[name="description"]')?.content,
            keywords: document.querySelector('meta[name="keywords"]')?.content,
            ogTitle: document.querySelector('meta[property="og:title"]')?.content,
            ogType: document.querySelector('meta[property="og:type"]')?.content
          },
          
          timestamp: Date.now()
        };
        
        // 发送回主窗口
        if (window.__TAURI__) {
          window.__TAURI__.event.emit('page-content-extracted', content);
        }
        
        return content;
      }
      
      function findLabel(element) {
        // 尝试通过 for 属性找到 label
        if (element.id) {
          const label = document.querySelector('label[for="' + element.id + '"]');
          if (label) return label.textContent.trim();
        }
        
        // 尝试找父级 label
        const parentLabel = element.closest('label');
        if (parentLabel) {
          return parentLabel.firstChild?.textContent?.trim() || '';
        }
        
        return '';
      }
    })();
  `;
  
  try {
    await invoke('inject_script_to_webview', { script: extractorScript });
  } catch (error) {
    console.error('注入内容提取脚本失败:', error);
  }
}

/**
 * 导航到指定 URL
 */
export async function navigateTo(url) {
  try {
    setIsLoading(true);
    setCurrentUrl(url);
    await invoke('navigate_webview_to', { url });
    
    // 延迟后重新注入脚本
    setTimeout(injectContentExtractor, 1500);
  } catch (error) {
    console.error('导航失败:', error);
    throw error;
  } finally {
    setTimeout(() => setIsLoading(false), 500);
  }
}

/**
 * 接收页面内容提取结果
 */
export function setupPageContentListener() {
  // 这里应该用 Tauri 的事件监听
  // window.__TAURI__.event.listen('page-content-extracted', handler)
  
  // 模拟实现
  console.log('页面内容监听器已设置');
}

/**
 * 触发智能脚本推荐
 */
export async function triggerScriptRecommendation() {
  try {
    setIsLoading(true);
    
    // 获取当前页面内容
    const content = await getCurrentPageContent();
    
    if (!content) {
      throw new Error('没有可用的页面内容');
    }
    
    // 通过上下文管道处理
    const context = await contextPipe.ingest('webview', content);
    
    // 生成推荐 Prompt
    const prompt = contextPipe.generatePrompt(context);
    
    // 传给 Agent（这里需要集成实际的 Agent 通信）
    console.log('生成的推荐 Prompt:', prompt);
    
    return {
      context,
      prompt
    };
    
  } catch (error) {
    console.error('触发脚本推荐失败:', error);
    throw error;
  } finally {
    setIsLoading(false);
  }
}

/**
 * 获取当前页面内容（模拟）
 */
async function getCurrentPageContent() {
  // 实际应该从 WebView 获取最新内容
  return {
    url: currentUrl(),
    title: extractedContent.title,
    textContent: extractedContent.textContent,
    forms: extractedContent.forms,
    buttons: extractedContent.buttons,
    links: extractedContent.links
  };
}

/**
 * 高亮页面元素（用于调试和用户确认）
 */
export async function highlightElement(selector) {
  const highlightScript = `
    (function() {
      const element = document.querySelector('${selector}');
      if (element) {
        element.style.outline = '3px solid #00ff00';
        element.style.transition = 'outline 0.3s';
        setTimeout(() => {
          element.style.outline = '';
        }, 2000);
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    })();
  `;
  
  await invoke('inject_script_to_webview', { script: highlightScript });
}

// 导出状态和方法
export {
  isPreviewOpen,
  currentUrl,
  isLoading,
  extractedContent
};
