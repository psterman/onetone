(function (runtime) {
  'use strict';

  function secondaryLabel(model) {
    if (model.state === 'waiting') return '拒绝这一步';
    if (model.state === 'dictating') return '取消听写';
    if (model.state === 'degraded') return '手动选择项目';
    if (model.state === 'running') return '查看正在做什么';
    return '开始新任务';
  }

  function nextStep(model) {
    return ({
      idle: ['说出目标', 'OneTone 会把意图交给当前 Agent，并保留项目上下文。'],
      resume: ['比较四版首页原型', '从今天 14:32 的恢复点继续，不重建上下文。'],
      running: ['等待 Agent 下一次状态更新', '有需要你处理的事项时，这里会自动提升优先级。'],
      waiting: ['做出一个决定', '批准会继续执行；拒绝不会丢失当前恢复点。'],
      dictating: ['检查并发送这句话', '你仍可取消本轮，未发送文字不会进入 Agent。'],
      degraded: ['先恢复可靠依据', '首页不会拿旧数据或猜测填满空白。']
    })[model.state];
  }

  runtime.registerVariant({
    id: 'resume-desk',
    name: '续作台',
    axis: '以可恢复工作为中心的纵向单任务流',
    render: function (model) {
      var icon = runtime.icon;
      var step = nextStep(model);
      var actionCount = runtime.actionSet(model)[0].channels.length;
      var body = `
        <div class="resume-page">
          <section class="resume-focus-card tone-${runtime.esc(model.status.tone)}">
            <div class="resume-card-head">
              <span class="eyebrow"><i class="live-pin"></i>${runtime.esc(model.status.label)}</span>
              <button type="button" class="quiet-link" data-open="context">项目上下文 ${icon('chevron')}</button>
            </div>
            <div class="resume-project-line">
              <span>${icon('folder')} ${runtime.esc(model.project.name)}</span>
              ${model.project.branch ? `<span>${icon('branch')} ${runtime.esc(model.project.branch)}</span>` : ''}
              ${model.work.checkpoint ? `<span>${icon('clock')} ${runtime.esc(model.work.checkpoint)}</span>` : ''}
            </div>
            <h1>${runtime.esc(model.work.title)}</h1>
            <p class="focus-summary">${runtime.esc(model.work.summary)}</p>
            ${model.state === 'dictating' ? '<div class="inline-wave" aria-label="正在听写"><i></i><i></i><i></i><i></i><i></i><i></i><span>正在整理你的话…</span></div>' : ''}
            ${model.state === 'degraded' ? `<div class="honesty-note">${icon('warning')}<span><b>这里没有内容不是因为页面没做完</b><small>当前数据源不可用，因此不展示虚构的进度、会话或项目记忆。</small></span></div>` : ''}
            <div class="focus-actions">
              <button type="button" class="button button--primary" data-primary-action data-action="primary">${runtime.esc(model.primary.label)} ${icon('arrow')}</button>
              <button type="button" class="button button--quiet" data-toast="${runtime.esc(secondaryLabel(model))}">${runtime.esc(secondaryLabel(model))}</button>
            </div>
            <div class="entry-hint"><span>${icon('layers')} 同一个动作</span><b>${actionCount} 个入口可触发</b><button type="button" data-open="actions">查看绑定</button></div>
          </section>

          <section class="next-step-card">
            <div class="section-heading"><div><span class="section-kicker">接下来</span><h2>${runtime.esc(step[0])}</h2></div><span class="step-index">01</span></div>
            <p>${runtime.esc(step[1])}</p>
            <div class="step-track"><span class="is-done"></span><span class="is-current"></span><span></span><span></span></div>
          </section>

          <section class="resume-utilities" aria-label="首页辅助信息">
            <button type="button" class="utility-card" data-open="activity"><span class="utility-icon">${icon('clock')}</span><span><b>最近动作</b><small>3 条 OneTone 实际操作</small></span>${icon('chevron')}</button>
            <button type="button" class="utility-card" data-open="context"><span class="utility-icon">${icon('folder')}</span><span><b>项目与记忆</b><small>${model.project.known ? '3 条上下文可用' : '等待确认项目'}</small></span>${icon('chevron')}</button>
          </section>
        </div>`;
      return runtime.frame({ model: model, id: 'resume-desk', name: '续作台', axis: '先回答“我能从哪里接着做”', body: body });
    }
  });
})(window.OneToneHomePrototype);
