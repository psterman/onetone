(function (global) {
  'use strict';
  var ipc = global.OneToneIpc;
  var invoke = function (cmd, args) {
    return ipc.invoke(cmd, { args: args || {} });
  };
  var list = function () { return document.getElementById('modelProviderList'); };
  var status = function () { return document.getElementById('modelProviderStatus'); };

  function render(items) {
    var root = list();
    if (!root) return;
    items = Array.isArray(items) ? items : [];
    root.innerHTML = items.length ? items.map(function (p) {
      return '<div class="model-provider-row">' +
        '<strong>' + escapeHtml(p.name || p.id) + '</strong>' +
        '<span>' + escapeHtml(p.model || '') + '</span>' +
        '<span class="model-provider-state">' + (p.configured ? '已配置' : '未配置') + '</span>' +
        '<button type="button" data-provider-remove="' + escapeHtml(p.id) + '">移除</button>' +
        '</div>';
    }).join('') : '<p>暂无自定义 Provider。Soft Pad 与 WorkBuddy 会在实际调用时自动显示。</p>';
    root.querySelectorAll('[data-provider-remove]').forEach(function (button) {
      button.addEventListener('click', function () {
        invoke('cmd_model_provider_remove', { providerId: button.dataset.providerRemove })
          .then(render)
          .catch(function (e) { if (status()) status().textContent = String(e.message || e); });
      });
    });
    renderRoutes(items);
  }

  function renderRoutes(customItems) {
    var gateway = global.OneToneModelGateway;
    var builtins = gateway && gateway.providers ? gateway.providers() : [];
    var all = builtins.concat((customItems || []).map(function (p) {
      if (gateway && gateway.registerProvider) gateway.registerProvider({ id: p.id, label: p.name || p.id });
      return { id: p.id, label: p.name || p.id };
    }));
    document.querySelectorAll('[data-model-route]').forEach(function (select) {
      var purpose = select.dataset.modelRoute;
      var current = gateway && gateway.resolveProvider ? gateway.resolveProvider(purpose).id : '';
      select.innerHTML = all.map(function (p) {
        return '<option value="' + escapeHtml(p.id) + '"' + (p.id === current ? ' selected' : '') + '>' +
          escapeHtml(p.label || p.name || p.id) + '</option>';
      }).join('');
      select.onchange = function () {
        if (gateway && gateway.setRoute) gateway.setRoute(purpose, select.value);
      };
    });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function refresh() {
    var gateway = global.OneToneModelGateway;
    var health = gateway && gateway.refreshStatus ? gateway.refreshStatus() : Promise.resolve(null);
    return Promise.all([invoke('cmd_model_provider_snapshot'), health]).then(function (results) {
      render(results[0]);
      var soft = results[1] && results[1].softpad;
      if (status() && soft) {
        status().textContent = soft.taskOrganize && soft.taskOrganize.readyFreeOnly
          ? 'Soft Pad freemodel：可用'
          : 'Soft Pad freemodel：暂不可用，将回落 WorkBuddy';
      }
    });
  }

  function init() {
    var nav = document.getElementById('settingsNavModels');
    var form = document.getElementById('modelProviderForm');
    var test = document.getElementById('modelProviderTest');
    document.querySelectorAll('[data-open-model-providers]').forEach(function (button) {
      button.addEventListener('click', function () {
        var hook = global.__vp_bootstrap_hooks__ || {};
        if (hook.setSettingsPanel) hook.setSettingsPanel('models');
        else if (nav) nav.click();
      });
    });
    if (nav) nav.addEventListener('click', refresh);
    if (form) form.addEventListener('submit', function (event) {
      event.preventDefault();
      var data = new FormData(form);
      var config = {
        id: String(data.get('id') || '').trim(),
        name: String(data.get('name') || '').trim(),
        protocol: 'openai_compatible',
        baseUrl: String(data.get('baseUrl') || '').trim(),
        model: String(data.get('model') || '').trim(),
        enabled: true,
        supportsJson: true,
        supportsStreaming: false,
        supportsTools: false
      };
      var key = String(data.get('apiKey') || '').trim();
      if (status()) status().textContent = '正在保存…';
      invoke('cmd_model_provider_upsert', config)
        .then(function (items) {
          return key ? invoke('cmd_model_provider_set_key', { providerId: config.id, apiKey: key }).then(function () { return items; }) : items;
        })
        .then(function (items) {
          render(items);
          form.reset();
          if (status()) status().textContent = '已保存。可点击“测试连接”验证。';
        })
        .catch(function (e) { if (status()) status().textContent = '保存失败：' + String(e.message || e); });
    });
    if (test) test.addEventListener('click', function () {
      var data = new FormData(form);
      var providerId = String(data.get('id') || '').trim();
      if (!providerId) { if (status()) status().textContent = '请先填写 Provider ID。'; return; }
      if (status()) status().textContent = '正在测试连接…';
      var config = {
        id: providerId,
        name: String(data.get('name') || '').trim(),
        protocol: 'openai_compatible',
        baseUrl: String(data.get('baseUrl') || '').trim(),
        model: String(data.get('model') || '').trim(),
        enabled: true,
        supportsJson: true,
        supportsStreaming: false,
        supportsTools: false
      };
      invoke('cmd_model_provider_upsert', config)
        .then(function () {
          var key = String(data.get('apiKey') || '').trim();
          return key ? invoke('cmd_model_provider_set_key', { providerId: providerId, apiKey: key }) : null;
        })
        .then(function () {
          return invoke('cmd_model_provider_chat', {
            providerId: providerId,
            messages: [{ role: 'user', content: '请只回复：连接成功' }],
            maxTokens: 32,
            temperature: 0
          });
        }).then(function () {
        if (status()) status().textContent = '连接成功。';
      }).catch(function (e) {
        if (status()) status().textContent = '连接失败：' + String(e.message || e);
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
