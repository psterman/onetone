(function (runtime) {
  'use strict';

  function attentionFor(model) {
    return ({
      idle: { count: '0', tone: 'quiet', title: '没有待处理事项', copy: '当前 Agent 已就绪。' },
      resume: { count: '1', tone: 'resume', title: '有工作可以继续', copy: '恢复点来自今天 14:32。' },
      running: { count: '0', tone: 'running', title: '暂时不需要你介入', copy: 'Agent 有新请求时会出现在这里。' },
      waiting: { count: '1', tone: 'attention', title: '等待你的批准', copy: '导航结构将发生调整。' },
      dictating: { count: '1', tone: 'listening', title: '听写尚未发送', copy: '检查后发送，或取消本轮。' },
      degraded: { count: '2', tone: 'degraded', title: '两项数据依据缺失', copy: '项目识别与 Agent 状态不可用。' }
    })[model.state];
  }

  runtime.registerVariant({
    id: 'split-cockpit',
    name: '双栏驾驶舱',
    axis: '当前工作与注意事项并列的高密度监控布局',
    render: function (model) {
      var icon = runtime.icon;
      var attention = attentionFor(model);
      var body = `
        <div class="cockpit-page">
          <section class="cockpit-summary">
            <div><span class="eyebrow">当前工作面</span><h1>${runtime.esc(runtime.statusCopy(model).long)}</h1></div>
            <div class="summary-metrics">
              <span><small>Agent</small><b>${runtime.esc(model.provider.name)}</b></span>
              <span><small>项目</small><b>${runtime.esc(model.project.name)}</b></span>
              <span><small>数据</small><b>${runtime.esc(runtime.qualityLabel(model.source.quality))}</b></span>
            </div>
          </section>

          <div class="cockpit-grid">
            <section class="cockpit-card work-panel tone-${runtime.esc(model.status.tone)}">
              <header><div><span class="panel-icon">${icon('agent')}</span><span><small>进行中的工作</small><b>${runtime.esc(model.provider.name)}</b></span></div><span class="work-state"><i></i>${runtime.esc(model.status.label)}</span></header>
              <h2>${runtime.esc(model.work.title)}</h2>
              <p>${runtime.esc(model.work.summary)}</p>
              <div class="work-facts">
                <span>${icon('clock')} ${runtime.esc(model.work.checkpoint || '没有恢复点')}</span>
                <span>${icon('branch')} ${runtime.esc(model.project.branch || '分支未知')}</span>
              </div>
              <div class="mini-progress"><i style="--progress:${model.state === 'running' ? '68%' : model.state === 'resume' ? '46%' : model.state === 'waiting' ? '82%' : '24%'}"></i></div>
              <div class="panel-actions"><button type="button" class="button button--primary" data-primary-action data-action="primary">${runtime.esc(model.primary.label)} ${icon('arrow')}</button><button type="button" class="icon-button" data-open="context" aria-label="打开项目上下文">${icon('layers')}</button></div>
            </section>

            <section class="cockpit-card attention-panel attention-${runtime.esc(attention.tone)}">
              <header><div><span class="panel-icon">${icon(attention.count === '0' ? 'check' : 'warning')}</span><span><small>需要我处理</small><b>${runtime.esc(attention.title)}</b></span></div><strong class="attention-count">${attention.count}</strong></header>
              <p>${runtime.esc(attention.copy)}</p>
              ${model.state === 'waiting' ? '<div class="decision-preview"><b>是否采用新的首页导航？</b><small>Claude Code · 刚刚</small></div>' : ''}
              ${model.state === 'degraded' ? '<div class="decision-preview is-warning"><b>本地读取已关闭</b><small>不会展示猜测数据</small></div>' : ''}
              <button type="button" class="panel-link" data-toast="已聚焦当前待办">${attention.count === '0' ? '保持后台监控' : '查看需要处理的事项'} ${icon('chevron')}</button>
            </section>

            <section class="cockpit-card activity-panel">
              <header><div><span class="panel-icon">${icon('activity')}</span><span><small>实时脉络</small><b>最近活动</b></span></div><button type="button" data-open="activity">全部</button></header>
              <ol class="live-events">
                <li class="is-current"><i></i><span><b>${model.state === 'running' ? '正在整理信息架构' : model.status.label}</b><small>${runtime.esc(model.provider.name)} · ${runtime.esc(model.source.freshness)}</small></span></li>
                <li><i></i><span><b>完成通道能力盘点</b><small>OneTone · 14:32</small></span></li>
                <li><i></i><span><b>创建首页比较恢复点</b><small>本地 · 14:30</small></span></li>
              </ol>
            </section>

            <section class="cockpit-card context-panel">
              <header><div><span class="panel-icon">${icon('folder')}</span><span><small>当前依据</small><b>项目与来源</b></span></div><button type="button" data-open="sources">详情</button></header>
              <div class="context-rows">
                <div><span>${icon('folder')} 项目</span><b>${runtime.esc(model.project.name)}</b></div>
                <div><span>${icon('window')} 前台</span><b>${runtime.esc(model.app.name)}</b></div>
                <div><span>${icon('link')} 来源</span><b>${runtime.esc(runtime.qualityLabel(model.source.quality))}</b></div>
              </div>
              <button type="button" class="panel-link" data-open="context">打开上下文抽屉 ${icon('chevron')}</button>
            </section>
          </div>
        </div>`;
      return runtime.frame({ model: model, id: 'split-cockpit', name: '双栏驾驶舱', axis: '同时看工作、阻塞、活动与依据', body: body });
    }
  });
})(window.OneToneHomePrototype);
