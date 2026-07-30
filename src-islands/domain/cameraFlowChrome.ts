// Camera flow nodes chrome。
// 单一来源：legacy OneToneCameraWorkflow.buildCameraFlowChromeModel。
// MediaPipe / 预览业务不进岛。

export interface CameraFlowChromeModel {
  activeTab: string;
  locked: boolean;
  triggerHint: string;
  actionHint: string;
  proHint: string;
  sig: string;
}

interface LegacyWorkflow {
  buildCameraFlowChromeModel?: () => CameraFlowChromeModel;
}

const EMPTY: CameraFlowChromeModel = {
  activeTab: 'trigger',
  locked: false,
  triggerHint: '',
  actionHint: '',
  proHint: '',
  sig: 'empty',
};

const TABS = ['trigger', 'action', 'pro'] as const;

function legacy(): LegacyWorkflow {
  return (
    (window as unknown as { OneToneCameraWorkflow?: LegacyWorkflow }).OneToneCameraWorkflow ?? {}
  );
}

export function cameraFlowChromeReady(): boolean {
  return typeof legacy().buildCameraFlowChromeModel === 'function';
}

export function buildCameraFlowChromeModel(): CameraFlowChromeModel {
  const api = legacy();
  if (!api.buildCameraFlowChromeModel) return EMPTY;
  try {
    return api.buildCameraFlowChromeModel();
  } catch (err) {
    console.error('[islands] buildCameraFlowChromeModel failed', err);
    return EMPTY;
  }
}

export function cameraFlowChromeSignature(model: CameraFlowChromeModel): string {
  return model.sig || `${model.activeTab}\0${model.locked}`;
}

export function applyCameraFlowChromeHosts(model: CameraFlowChromeModel): void {
  TABS.forEach((tab) => {
    const btn = document.getElementById(
      'cameraFlowNode' + tab.charAt(0).toUpperCase() + tab.slice(1),
    );
    if (!btn) return;
    const on = tab === model.activeTab;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
    (btn as HTMLButtonElement).disabled = !!model.locked;
    btn.setAttribute('aria-disabled', model.locked ? 'true' : 'false');
    btn.classList.toggle('is-locked', !!model.locked);
    // #cameraFlowNodeTriggerHint 由 React 渲染；其余 hint 仍由 apply 写
    if (tab === 'trigger') return;
    const hint = document.getElementById(
      'cameraFlowNode' + tab.charAt(0).toUpperCase() + tab.slice(1) + 'Hint',
    );
    if (hint) {
      const key = `${tab}Hint` as 'actionHint' | 'proHint';
      hint.textContent = model[key] || '';
    }
  });
  const lockHint = document.getElementById('cameraCalibLockHint');
  if (lockHint) lockHint.hidden = !model.locked;
}
