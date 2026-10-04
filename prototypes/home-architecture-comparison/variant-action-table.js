(function (runtime) {
  'use strict';

  function actionCard(action) {
    var channels = action.channels.map(function (channel) {
      return runtime.channelButton(channel[0], channel[1], false);
    }).join('');
    var riskLabel = action.risk === 'confirm' ? '需要确认' : '直接执行';
    var mainControl = action.recommended
      ? '<button type="button" class="button button--primary action-run" data-primary-action data-action="primary">执行建议动作 ' + runtime.icon('arrow') + '</button>'
      : '<button type="button" class="button button--quiet action-run" data-toast="已选择动作：' + runtime.esc(action.label) + '">查看与执行</button>';
    return `
      <article class="semantic-card ${action.recommended ? 'is-recommended' : ''}" data-action-id="${runtime.esc(action.id)}" data-action-label="${runtime.esc(action.label)}">
        <div class="semantic-head">
          <span class="semantic-icon">${runtime.icon(action.recommended ? 'spark' : 'actions')}</span>
          <span class="risk-tag risk-tag--${runtime.esc(action.risk)}">${riskLabel}</span>
        </div>
        <h2>${runtime.esc(action.label)}</h2>
        <p>${runtime.esc(action.copy)}</p>
        <div class="channel-stack"><small>可用入口</small>${channels}</div>
        ${action.id === 'agent.approve' ? '<div class="camera-rule">摄像头仅发起请求，批准必须由另一通道确认。</div>' : ''}
        ${mainControl}
      </article>`;
  }

  runtime.registerVariant({
    id: 'action-table',
    name: '动作牌桌',
    axis: '以语义动作和四通道绑定为中心的可组合牌桌',
    render: function (model) {
      var icon = runtime.icon;
      var actions = runtime.actionSet(model);
      var recommended = actions.find(function (action) { return action.recommended; }) || actions[0];
      var body = `
        <div class="action-page">
          <section class="action-context-bar">
            <div><span class="eyebrow">系统建议</span><h1>${runtime.esc(recommended.label)}</h1><p>${runtime.esc(model.work.title)}</p></div>
            <div class="semantic-chain" aria-label="动作触发结构">
              <span><i>${icon('spark')}</i><small>当前需要</small><b>${runtime.esc(recommended.label)}</b></span>
              <em>${icon('arrow')}</em>
              <span><i>${icon('actions')}</i><small>语义动作</small><b>${runtime.esc(recommended.id)}</b></span>
              <em>${icon('arrow')}</em>
              <span><i>${icon('layers')}</i><small>可选入口</small><b>${recommended.channels.length} 个</b></span>
            </div>
          </section>

          <div class="action-board-head"><div><h2>现在可以做</h2><p>动作是主体；按键、语音、Soft Pad 与摄像头只是入口。</p></div><button type="button" class="button button--quiet" data-open="allActions">全部动作</button></div>
          <section class="semantic-grid">
            ${actions.map(actionCard).join('')}
          </section>

          <footer class="action-board-foot">
            <button type="button" data-open="actions">${icon('layers')} 管理动作与入口</button>
            <span>${icon('check')} 当前 Provider 只展示已验证能力</span>
            <button type="button" data-open="sources">${runtime.esc(model.source.label)} · ${runtime.esc(model.source.freshness)}</button>
          </footer>
        </div>`;
      return runtime.frame({ model: model, id: 'action-table', name: '动作牌桌', axis: '把“做什么”与“怎么触发”分开呈现', body: body });
    }
  });
})(window.OneToneHomePrototype);
