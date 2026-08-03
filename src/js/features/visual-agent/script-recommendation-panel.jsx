/**
 * 脚本推荐面板 UI 组件
 * 
 * 显示推荐的自动化脚本列表，支持查看、运行、保存
 */

import { createSignal, createEffect, For } from 'solid-js';
import { getVisualContextPipe } from './visual-context-pipe';
import { getScriptRecommender } from './script-recommender';

// 脚本执行沙箱
function executeScriptInSandbox(scriptCode) {
  // 在独立作用域中执行脚本
  try {
    // 创建一个闭包环境
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

    // 使用 Function 构造函数创建隔离执行环境
    const executor = new Function(...Object.keys(sandbox), `
      "use strict";
      try {
        ${scriptCode}
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    `);

    // 执行脚本
    const result = executor(...Object.values(sandbox));
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 单个脚本卡片组件
 */
function ScriptCard(props) {
  const [isExpanded, setIsExpanded] = createSignal(false);
  const [isExecuting, setIsExecuting] = createSignal(false);
  const [executeResult, setExecuteResult] = createSignal(null);
  const [isSaved, setIsSaved] = createSignal(false);

  // 置信度颜色
  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.8) return 'text-green-500';
    if (confidence >= 0.6) return 'text-yellow-500';
    return 'text-gray-500';
  };

  // 类别图标
  const getCategoryIcon = (category) => {
    const icons = {
      fill_form: '📝',
      extract_data: '📊',
      automate_click: '👆',
      monitor_change: '👁️',
      enhance_ui: '🎨',
      custom: '⚙️'
    };
    return icons[category] || '📄';
  };

  // 运行脚本
  const runScript = async () => {
    setIsExecuting(true);
    setExecuteResult(null);
    
    try {
      // 模拟执行延迟
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const result = executeScriptInSandbox(props.script.scriptCode);
      setExecuteResult(result);
      
      if (result.success) {
        console.log('✅ 脚本执行成功');
      } else {
        console.error('❌ 脚本执行失败:', result.error);
      }
    } catch (error) {
      setExecuteResult({ success: false, error: error.message });
    } finally {
      setIsExecuting(false);
    }
  };

  // 保存到我的脚本库
  const saveToLibrary = () => {
    try {
      const savedScripts = JSON.parse(localStorage.getItem('saved-scripts') || '[]');
      savedScripts.push({
        ...props.script,
        savedAt: new Date().toISOString()
      });
      localStorage.setItem('saved-scripts', JSON.stringify(savedScripts));
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    } catch (error) {
      console.error('保存失败:', error);
    }
  };

  return (
    <div class="bg-white rounded-lg shadow-md p-4 mb-3 border border-gray-100 hover:shadow-lg transition-shadow">
      {/* 头部信息 */}
      <div class="flex items-start justify-between">
        <div class="flex items-center gap-2">
          <span class="text-2xl">{getCategoryIcon(props.script.category)}</span>
          <div>
            <h3 class="font-semibold text-gray-800">{props.script.title}</h3>
            <p class="text-sm text-gray-500">{props.script.description}</p>
          </div>
        </div>
        <div class="text-right">
          <div class={`text-sm font-medium ${getConfidenceColor(props.script.confidence)}`}>
            匹配度: {Math.round(props.script.confidence * 100)}%
          </div>
          <div class="text-xs text-gray-400">
            ⏱️ {props.script.estimatedTime}
          </div>
        </div>
      </div>

      {/* 标签 */}
      <div class="flex flex-wrap gap-1 mt-2">
        <For each={props.script.tags}>
          {(tag) => (
            <span class="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full">
              {tag}
            </span>
          )}
        </For>
      </div>

      {/* 操作按钮 */}
      <div class="flex gap-2 mt-3">
        <button
          onClick={runScript}
          disabled={isExecuting()}
          class="flex-1 px-3 py-1.5 bg-green-500 text-white text-sm rounded-md hover:bg-green-600 disabled:bg-gray-300 transition-colors flex items-center justify-center gap-1"
        >
          {isExecuting() ? (
            <>
              <span class="animate-spin">⏳</span> 执行中...
            </>
          ) : (
            <>▶️ 立即运行</>
          )}
        </button>
        <button
          onClick={saveToLibrary}
          class="px-3 py-1.5 bg-blue-50 text-blue-600 text-sm rounded-md hover:bg-blue-100 transition-colors flex items-center gap-1"
        >
          {isSaved() ? '✅ 已保存' : '💾 保存'}
        </button>
        <button
          onClick={() => setIsExpanded(!isExpanded())}
          class="px-3 py-1.5 bg-gray-100 text-gray-600 text-sm rounded-md hover:bg-gray-200 transition-colors"
        >
          {isExpanded() ? '收起' : '查看代码'}
        </button>
      </div>

      {/* 执行结果 */}
      {executeResult() && (
        <div class={`mt-3 p-3 rounded-md text-sm ${
          executeResult().success 
            ? 'bg-green-50 text-green-700 border border-green-200' 
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {executeResult().success ? (
            <span>✅ 脚本执行成功！</span>
          ) : (
            <span>❌ 执行失败: {executeResult().error}</span>
          )}
        </div>
      )}

      {/* 展开的代码 */}
      {isExpanded() && (
        <div class="mt-3">
          <div class="bg-gray-900 text-gray-100 rounded-md p-3 overflow-x-auto">
            <pre class="text-xs font-mono whitespace-pre-wrap">
              <code>{props.script.scriptCode}</code>
            </pre>
          </div>
          <div class="flex justify-end mt-2 gap-2">
            <button
              onClick={() => navigator.clipboard.writeText(props.script.scriptCode)}
              class="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
            >
              📋 复制代码
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 脚本推荐面板主组件
 */
export function ScriptRecommendationPanel() {
  const [recommendations, setRecommendations] = createSignal([]);
  const [isLoading, setIsLoading] = createSignal(false);
  const [contextInfo, setContextInfo] = createSignal(null);
  const [isPanelOpen, setIsPanelOpen] = createSignal(false);

  const contextPipe = getVisualContextPipe();
  const recommender = getScriptRecommender();

  // 生成推荐
  const generateRecommendations = async () => {
    const context = contextPipe.getRecentContext();
    
    if (!context) {
      alert('请先捕获网页内容');
      return;
    }

    setIsLoading(true);
    try {
      const results = await recommender.recommend(context);
      setRecommendations(results);
      setContextInfo(context.getSummary());
    } catch (error) {
      console.error('生成推荐失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 模拟测试数据（用于开发测试）
  const loadTestData = async () => {
    setIsLoading(true);
    
    // 模拟一个表单页面的上下文
    const testContext = await contextPipe.ingest('webview', {
      url: 'https://example.com/login',
      title: '用户登录 - Example',
      domain: 'example.com',
      textContent: '登录 注册 用户名 密码 记住我 忘记密码 提交 登录到您的账户',
      forms: [{
        id: 'login-form',
        inputs: [
          { type: 'text', name: 'username', label: '用户名', placeholder: '请输入用户名' },
          { type: 'password', name: 'password', label: '密码', placeholder: '请输入密码' },
          { type: 'checkbox', name: 'remember', label: '记住我' }
        ]
      }],
      buttons: [
        { text: '登录', type: 'submit' },
        { text: '注册', type: 'button' }
      ],
      links: [{ text: '忘记密码', href: '#' }]
    });

    const results = await recommender.recommend(testContext);
    setRecommendations(results);
    setContextInfo(testContext.getSummary());
    setIsLoading(false);
  };

  return (
    <div class="fixed bottom-4 right-4 z-50">
      {/* 浮动按钮 */}
      <button
        onClick={() => setIsPanelOpen(!isPanelOpen())}
        class="w-14 h-14 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center text-2xl"
        title="智能脚本推荐"
      >
        🤖
      </button>

      {/* 面板 */}
      {isPanelOpen() && (
        <div class="absolute bottom-16 right-0 w-96 max-h-[70vh] bg-white rounded-xl shadow-2xl overflow-hidden">
          {/* 面板头部 */}
          <div class="bg-gradient-to-r from-purple-500 to-blue-500 text-white p-4">
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-bold flex items-center gap-2">
                🤖 智能脚本推荐
              </h2>
              <button
                onClick={() => setIsPanelOpen(false)}
                class="text-white/80 hover:text-white"
              >
                ✕
              </button>
            </div>
            <p class="text-sm text-white/80 mt-1">
              基于当前页面内容，为您推荐最合适的自动化脚本
            </p>
          </div>

          {/* 上下文信息 */}
          {contextInfo() && (
            <div class="bg-gray-50 px-4 py-2 border-b border-gray-100">
              <div class="text-xs text-gray-500">
                <span class="font-medium">当前页面:</span> {contextInfo().domain}
                {contextInfo().hasForm && <span class="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded">📝 表单</span>}
                {contextInfo().hasEcommerce && <span class="ml-2 px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded">🛒 电商</span>}
              </div>
            </div>
          )}

          {/* 操作栏 */}
          <div class="flex gap-2 p-3 border-b border-gray-100">
            <button
              onClick={generateRecommendations}
              disabled={isLoading()}
              class="flex-1 px-3 py-2 bg-purple-500 text-white text-sm rounded-lg hover:bg-purple-600 disabled:bg-gray-300 transition-colors"
            >
              {isLoading() ? '⏳ 生成中...' : '✨ 生成推荐'}
            </button>
            <button
              onClick={loadTestData}
              class="px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors"
              title="加载测试数据"
            >
              🧪 测试
            </button>
          </div>

          {/* 推荐列表 */}
          <div class="p-3 overflow-y-auto max-h-[45vh]">
            {recommendations().length === 0 ? (
              <div class="text-center py-8 text-gray-400">
                <div class="text-4xl mb-2">💡</div>
                <p>点击上方按钮生成脚本推荐</p>
                <p class="text-xs mt-1">支持表单、电商、视频等多种场景</p>
              </div>
            ) : (
              <For each={recommendations()}>
                {(script) => <ScriptCard script={script} />}
              </For>
            )}
          </div>

          {/* 页脚 */}
          <div class="p-3 bg-gray-50 border-t border-gray-100 text-center">
            <span class="text-xs text-gray-400">
              💡 脚本在本地沙箱中执行，不会上传任何数据
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default ScriptRecommendationPanel;
