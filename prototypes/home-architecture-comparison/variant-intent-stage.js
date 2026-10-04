(function (runtime) {
  'use strict';

  function copyFor(model) {
    return ({
      idle: ['说出你想完成的事', '不用先找功能或配置入口。'],
      resume: ['接着做，或者换个目标', 'OneTone 已经找回你的项目和恢复点。'],
      running: ['随时补充一句', '新指令会带着当前项目上下文交给 Agent。'],
      waiting: ['直接说你的决定', '批准、拒绝，或者补充一个条件。'],
      dictating: ['我在听', '自然说完即可，不必记命令。'],
      degraded: ['先告诉我项目在哪里', '自动识别没有可靠依据，你也可以手动指定。']
    })[model.state];
  }

  function placeholderFor(model) {
    return ({
      idle: '例如：帮我把首页改成更适合 vibe coding 的续作台',
      resume: '例如：继续比较这四版首页，先看信息层级',
      running: '补充条件或交代下一步…',
      waiting: '例如：批准，但先保留旧导航作为回退',
      dictating: '把首页改成更适合 vibe coding 的…',
      degraded: '输入项目路径，或描述你刚才在做什么…'
    })[model.state];
  }

  function suggestionsFor(model) {
    if (model.state === 'waiting') return ['批准，继续执行', '拒绝这一步', '先解释会改哪些地方'];
    if (model.state === 'degraded') return ['选择 E:\\voice-pilot', '重新读取 Cursor', '先新建一个任务'];
    if (model.state === 'running') return ['完成后跑一下测试', '先别改生产代码', '告诉我现在做到哪了'];
    return ['继续上次工作', '检查当前 Agent 状态', '开始一个新任务'];
  }

  runtime.registerVariant({
    id: 'intent-stage',
    name: '一句话',
    axis: '以语音和自然语言意图为中心的输入舞台',
    render: function (model) {
      var icon = runtime.icon;
      var copy = copyFor(model);
      var suggestions = suggestionsFor(model);
      var body = `
        <div class="intent-page">
          <section class="intent-stage tone-${runtime.esc(model.status.tone)}">
            <div class="intent-orbit" aria-hidden="true"><span></span><span></span><span></span></div>
            <div class="intent-title">
              <span class="eyebrow">${runtime.esc(model.status.label)}</span>
              <h1>${runtime.esc(copy[0])}</h1>
              <p>${runtime.esc(copy[1])}</p>
            </div>

            <form class="command-composer" data-command-form>
              <label for="intentCommand">给当前 Agent 的话</label>
              <div class="command-field ${model.state === 'dictating' ? 'is-listening' : ''}">
                <span class="command-leading">${icon(model.state === 'dictating' ? 'mic' : 'spark')}</span>
                <input id="intentCommand" data-command-input autocomplete="off" value="${model.state === 'dictating' ? runtime.esc(model.work.title) : ''}" placeholder="${runtime.esc(placeholderFor(model))}" />
                <button type="button" class="mic-button" data-set-state="dictating" aria-label="开始语音输入">${icon('mic')}</button>
              </div>
              ${model.state === 'dictating' ? '<div class="voice-meter" aria-label="语音输入电平"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><span>00:08</span></div>' : ''}
              <div class="composer-footer">
                <span>${icon('link')} 自动附带当前项目上下文</span>
                <button type="button" class="button button--primary" data-primary-action data-action="primary">${runtime.esc(model.primary.label)} ${icon('arrow')}</button>
              </div>
            </form>

            <div class="suggestion-row" aria-label="常用表达">
              ${suggestions.map(function (item) { return '<button type="button" data-suggestion="' + runtime.esc(item) + '">' + runtime.esc(item) + '</button>'; }).join('')}
            </div>
          </section>

          <section class="context-ribbon">
            <div class="context-ribbon-main"><span class="context-app">${runtime.esc(model.app.name.charAt(0))}</span><span><small>当前上下文</small><b>${runtime.esc(model.work.title)}</b></span></div>
            <div class="ribbon-meta"><span>${icon('folder')} ${runtime.esc(model.project.name)}</span><span>${icon('agent')} ${runtime.esc(model.provider.name)}</span></div>
            <button type="button" class="quiet-link" data-open="context">检查上下文 ${icon('chevron')}</button>
          </section>

          <div class="intent-footnote"><span>${icon('eye')}</span><p><b>你始终能看见依据。</b> ${runtime.esc(model.source.label)} · ${runtime.esc(model.source.freshness)}</p><button type="button" data-open="sources">为什么这样判断？</button></div>
        </div>`;
      return runtime.frame({ model: model, id: 'intent-stage', name: '一句话', axis: '先表达意图，再让系统选择合适动作', body: body });
    }
  });
})(window.OneToneHomePrototype);
