// P14f: SoftPad 子页 body 宿主。
// 单一来源：legacy OneToneSoftPadHub.buildSoftPadSubpageModel。

export interface SoftPadSubpageModel {
  mappingId: string;
  view: string;
  clear: boolean;
  panel: string;
  mode: string;
  agentLoadToken: string;
  editingKey: boolean;
  sig: string;
}

export interface SoftPadSubpagePaintOpts {
  onChanged?: (mapping: unknown, panel: string | null, changeOpts?: unknown) => void;
  agentLoadToken?: number | string;
}

interface LegacySoftPadHub {
  buildSoftPadSubpageModel?: () => SoftPadSubpageModel;
  getSelectedSoftPadMappingForSubpage?: () => unknown;
  getSoftPadSubpagePaintOpts?: () => SoftPadSubpagePaintOpts;
  writeSoftPadSubpageAgentPick?: (host: HTMLElement) => void;
  writeSoftPadSubpageHint?: (host: HTMLElement, msg: string) => void;
  bindSoftPadAgentPickCta?: (host: HTMLElement) => void;
}

interface LegacyPadUi {
  renderSoftPadLayoutPanel?: (host: HTMLElement, mapping: unknown, opts?: SoftPadSubpagePaintOpts) => void;
  renderSoftPadPresentationPanel?: (host: HTMLElement, mapping: unknown, opts?: SoftPadSubpagePaintOpts) => void;
  renderSoftPadRuntimePanel?: (host: HTMLElement, mapping: unknown, opts?: SoftPadSubpagePaintOpts) => void;
  renderSoftPadAgentPanel?: (host: HTMLElement, mapping: unknown, opts?: SoftPadSubpagePaintOpts) => void;
  resolveSoftPadSubpagePaintHost?: (preferred?: HTMLElement | null) => HTMLElement | null;
}

const EMPTY: SoftPadSubpageModel = {
  mappingId: '',
  view: 'hub',
  clear: true,
  panel: '',
  mode: 'clear',
  agentLoadToken: '',
  editingKey: false,
  sig: 'empty',
};

function legacyHub(): LegacySoftPadHub {
  return (
    (window as unknown as { OneToneSoftPadHub?: LegacySoftPadHub }).OneToneSoftPadHub ?? {}
  );
}

function legacyPad(): LegacyPadUi {
  return (
    (window as unknown as { OneToneCodexMicroPadUi?: LegacyPadUi }).OneToneCodexMicroPadUi ?? {}
  );
}

export function softPadSubpageReady(): boolean {
  return typeof legacyHub().buildSoftPadSubpageModel === 'function';
}

export function buildSoftPadSubpageModel(): SoftPadSubpageModel {
  const api = legacyHub();
  if (!api.buildSoftPadSubpageModel) return EMPTY;
  try {
    return api.buildSoftPadSubpageModel();
  } catch (err) {
    console.error('[islands] buildSoftPadSubpageModel failed', err);
    return EMPTY;
  }
}

export function softPadSubpageSignature(model: SoftPadSubpageModel): string {
  return (
    model.sig ||
    `${model.mappingId}\0${model.view}\0${model.clear}\0${model.panel}\0${model.mode}\0${model.agentLoadToken}`
  );
}

export function getSelectedSoftPadMappingForSubpage(): unknown {
  const api = legacyHub();
  if (typeof api.getSelectedSoftPadMappingForSubpage === 'function') {
    try {
      return api.getSelectedSoftPadMappingForSubpage();
    } catch (err) {
      console.error('[islands] getSelectedSoftPadMappingForSubpage failed', err);
      return null;
    }
  }
  return null;
}

export function getSoftPadSubpagePaintOpts(): SoftPadSubpagePaintOpts {
  const api = legacyHub();
  if (typeof api.getSoftPadSubpagePaintOpts === 'function') {
    try {
      return api.getSoftPadSubpagePaintOpts() || {};
    } catch (err) {
      console.error('[islands] getSoftPadSubpagePaintOpts failed', err);
      return {};
    }
  }
  return {};
}

export function applySoftPadSubpageOuterAttrs(model: SoftPadSubpageModel): void {
  const body = document.getElementById('softPadSubpageBody');
  if (!body) return;
  if (!model || model.clear || !model.panel) {
    body.classList.remove('is-editing-key');
    body.removeAttribute('data-soft-pad-mapping');
    body.removeAttribute('data-soft-pad-panel');
    body.removeAttribute('data-agent-load-token');
    return;
  }
  if (model.mappingId) body.setAttribute('data-soft-pad-mapping', String(model.mappingId));
  else body.removeAttribute('data-soft-pad-mapping');
  body.setAttribute('data-soft-pad-panel', String(model.panel));
  if (model.panel === 'agent' && model.agentLoadToken) {
    body.setAttribute('data-agent-load-token', String(model.agentLoadToken));
  } else {
    body.removeAttribute('data-agent-load-token');
  }
  if (model.panel !== 'layout') body.classList.remove('is-editing-key');
}

export function paintSoftPadSubpageTarget(paintEl: HTMLElement, model: SoftPadSubpageModel): void {
  const hub = legacyHub();
  const pad = legacyPad();
  if (!paintEl) return;

  if (model.clear || model.mode === 'clear' || !model.mappingId) {
    paintEl.replaceChildren();
    paintEl.classList.remove('is-editing-key');
    paintEl.removeAttribute('data-soft-pad-mapping');
    paintEl.removeAttribute('data-soft-pad-panel');
    paintEl.removeAttribute('data-agent-load-token');
    return;
  }

  if (model.mode === 'agent-pick') {
    if (typeof hub.writeSoftPadSubpageAgentPick === 'function') {
      try {
        hub.writeSoftPadSubpageAgentPick(paintEl);
      } catch (err) {
        console.error('[islands] writeSoftPadSubpageAgentPick failed', err);
      }
    }
    return;
  }

  const mapping = getSelectedSoftPadMappingForSubpage();
  if (!mapping) {
    if (typeof hub.writeSoftPadSubpageHint === 'function') {
      try {
        hub.writeSoftPadSubpageHint(paintEl, '—');
      } catch (_) {}
    }
    return;
  }

  const opts = getSoftPadSubpagePaintOpts();
  try {
    if (model.panel === 'layout' && typeof pad.renderSoftPadLayoutPanel === 'function') {
      pad.renderSoftPadLayoutPanel(paintEl, mapping, opts);
    } else if (model.panel === 'presentation' && typeof pad.renderSoftPadPresentationPanel === 'function') {
      pad.renderSoftPadPresentationPanel(paintEl, mapping, opts);
    } else if (model.panel === 'runtime' && typeof pad.renderSoftPadRuntimePanel === 'function') {
      pad.renderSoftPadRuntimePanel(paintEl, mapping, opts);
    } else if (model.panel === 'agent' && typeof pad.renderSoftPadAgentPanel === 'function') {
      pad.renderSoftPadAgentPanel(paintEl, mapping, {
        ...opts,
        agentLoadToken: model.agentLoadToken || opts.agentLoadToken,
      });
    } else if (typeof hub.writeSoftPadSubpageHint === 'function') {
      hub.writeSoftPadSubpageHint(paintEl, '面板暂不可用');
    }
  } catch (err) {
    console.error('[islands] softPadSubpage paint failed', err);
    if (typeof hub.writeSoftPadSubpageHint === 'function') {
      try {
        hub.writeSoftPadSubpageHint(paintEl, '面板加载失败，请返回重试');
      } catch (_) {}
    }
  }
}
