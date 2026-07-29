import { OneToneIslands } from './island-runtime';
import { OneToneUi } from './shared/ui-bridge';
import { ToastIsland } from './islands/toast-island';
import { ConfirmIsland } from './islands/confirm-island';
import { BasicSettingsIsland } from './islands/basic-settings-island';
import { VoiceConfigIsland } from './islands/voice-config-island';
import { MappingListIsland } from './islands/mapping-list-island';
import { WbCommandIsland } from './islands/wb-command-island';
import { SoftPadStatusBarIsland } from './islands/soft-pad-status-island';
import { KeysStatusBarIsland } from './islands/keys-status-island';
import { HabitHubListIsland } from './islands/habit-hub-list-island';
import {
  HabitHubEmptyIsland,
  HabitHubGuideIsland,
  HabitHubSortIsland,
  registerHabitHubChromeSync,
} from './islands/habit-hub-chrome-island';
import { KeysWorkflowTabsIsland } from './islands/keys-workflow-island';
import {
  SoftPadAppSwitcherIsland,
  SoftPadSchemeListIsland,
  registerSoftPadWorkflowSync,
} from './islands/soft-pad-workflow-island';
import { toastPortal, dialogPortal } from './shared/portal-roots';
// ?inline 让 CSS 直接内联进 bundle，产物为单文件 main.js，便于 Tauri 静态加载
import islandCss from './globals.css?inline';

// 自包含注入 scoped 样式（仅作用于 .ot-island）
const style = document.createElement('style');
style.setAttribute('data-ot-island', '');
style.textContent = islandCss;
document.head.appendChild(style);

// P4：挂载共享交互岛到各自 portal 根（均位于 .ot-island 作用域内）。
// Toast 岛保留挂载但默认无数据（OneToneUi.toast → legacy OneToneAppToast）；
// P9a：Command 产品入口 = inline #wbCommandSearch 岛（见 mountWbCommandIsland）。
OneToneIslands.mountIsland(toastPortal.id, ToastIsland);
OneToneIslands.mountIsland(dialogPortal.id, ConfirmIsland);

// P5：挂载基础设置岛到 #settingsPanelBasic（替换 legacy 内联 HTML，独占其子树）
function mountBasicIsland(): void {
  const host = document.getElementById('settingsPanelBasic');
  if (!host) return;
  OneToneIslands.mountIsland('settingsPanelBasic', BasicSettingsIsland, {}, {
    // mvp_init / cmd_ready / config reload 后重新拉取最新状态
    onRefresh: () => ({}) as Record<string, unknown>,
  });
}
// 模块脚本位于 body 末尾，DOM 已就绪；若异常则保留 legacy HTML（主线不停）
try {
  mountBasicIsland();
} catch (err) {
  console.error('[islands] basic settings mount failed, keeping legacy DOM', err);
}

// P6：挂载语音配置岛到 #voiceConfigIsland（替换 legacy 文本短语编辑器，独占其子树）
function mountVoiceConfigIsland(): void {
  const host = document.getElementById('voiceConfigIsland');
  if (!host) return;
  OneToneIslands.mountIsland('voiceConfig', VoiceConfigIsland, {}, {
    onRefresh: () => ({}) as Record<string, unknown>,
  });
}
try {
  mountVoiceConfigIsland();
} catch (err) {
  console.error('[islands] voice config mount failed, keeping legacy DOM', err);
}

// P7：挂载映射列表岛到 #mappingList（接管行渲染 keyed diff；交互仍走 legacy 容器级事件委托）
function mountMappingListIsland(): void {
  const host = document.getElementById('mappingList');
  if (!host) return;
  // legacy 可能已在模块加载前 innerHTML 渲染过一版 —— 接管前清空，React root 只挂空容器
  host.innerHTML = '';
  OneToneIslands.mountIsland('mappingList', MappingListIsland, {}, {
    onRefresh: () => ({}) as Record<string, unknown>,
  });
}
try {
  mountMappingListIsland();
} catch (err) {
  console.error('[islands] mapping list mount failed, keeping legacy DOM', err);
}

// P9a：挂载首页命令搜索岛到 #wbCommandSearch（inline combobox；失败则保留 legacy cmdk）
function mountWbCommandIsland(): void {
  const host = document.getElementById('wbCommandSearch');
  if (!host) return;
  host.innerHTML = '';
  OneToneIslands.mountIsland('wbCommandSearch', WbCommandIsland, {}, {
    onRefresh: () => ({}) as Record<string, unknown>,
  });
}
try {
  mountWbCommandIsland();
} catch (err) {
  console.error('[islands] wb command mount failed, keeping legacy cmdk', err);
}

// P10：挂载 SoftPad 状态栏岛（延迟到面板首次 render，避免 boot 清空 hidden DOM）
function mountSoftPadStatusIsland(): void {
  const host = document.getElementById('softPadStatusBar');
  if (!host) return;
  if (OneToneIslands.isMounted('softPadStatus')) return;
  host.innerHTML = '';
  OneToneIslands.mountIsland('softPadStatus', SoftPadStatusBarIsland, {}, {
    onRefresh: () => ({}) as Record<string, unknown>,
  });
}
(window as unknown as { __otMountSoftPadStatusIsland?: () => void }).__otMountSoftPadStatusIsland =
  mountSoftPadStatusIsland;

// P11：挂载 Keys 状态栏岛（延迟到按键面板首次打开；保留 sr-only 辅助节点）
function mountKeysStatusIsland(): void {
  const bar = document.getElementById('keysWorkflowTabsBar');
  if (!bar || OneToneIslands.isMounted('keysStatus')) return;

  bar.querySelector('.page-status-bar-main')?.remove();
  bar.querySelector('.page-status-bar-actions')?.remove();

  let host = document.getElementById('keysStatus');
  if (!host) {
    host = document.createElement('div');
    host.id = 'keysStatus';
    host.className = 'ot-island keys-status-island-host';
    bar.insertBefore(host, bar.firstChild);
  }

  OneToneIslands.mountIsland('keysStatus', KeysStatusBarIsland, {}, {
    onRefresh: () => ({}) as Record<string, unknown>,
  });
}
(window as unknown as { __otMountKeysStatusIsland?: () => void }).__otMountKeysStatusIsland =
  mountKeysStatusIsland;

// P12：挂载习惯列表岛（延迟到习惯面板首次打开；避免 boot 清空 hidden DOM）
function mountHabitHubListIsland(): void {
  const host = document.getElementById('habitHubList');
  if (!host || OneToneIslands.isMounted('habitHubList')) return;
  host.innerHTML = '';
  OneToneIslands.mountIsland('habitHubList', HabitHubListIsland, {}, {
    onRefresh: () => ({}) as Record<string, unknown>,
  });
}
(window as unknown as { __otMountHabitHubListIsland?: () => void }).__otMountHabitHubListIsland =
  mountHabitHubListIsland;

// P13：挂载习惯 Hub 壳层岛（guide / empty / sort；延迟到习惯面板首次打开）
function mountHabitHubChromeIsland(): void {
  if ((window as unknown as { __otHabitHubChromeMounted?: boolean }).__otHabitHubChromeMounted) return;

  const guideHost = document.getElementById('habitHubGuideSteps');
  const emptyHost = document.getElementById('habitHubEmpty');
  const sortEl = document.getElementById('habitHubSort');
  if (!guideHost || !emptyHost) return;

  let sortHost = document.getElementById('habitHubSortHost');
  if (sortEl && !sortHost) {
    sortHost = document.createElement('div');
    sortHost.id = 'habitHubSortHost';
    sortHost.className = 'ot-island habit-hub-sort-host';
    sortEl.replaceWith(sortHost);
  }

  guideHost.innerHTML = '';
  emptyHost.innerHTML = '';

  OneToneIslands.mountIsland('habitHubGuideSteps', HabitHubGuideIsland, {}, {
    onRefresh: () => ({}) as Record<string, unknown>,
  });
  OneToneIslands.mountIsland('habitHubEmpty', HabitHubEmptyIsland, {}, {
    onRefresh: () => ({}) as Record<string, unknown>,
  });
  if (sortHost) {
    OneToneIslands.mountIsland('habitHubSortHost', HabitHubSortIsland, {}, {
      onRefresh: () => ({}) as Record<string, unknown>,
    });
  }

  registerHabitHubChromeSync();
}
(window as unknown as { __otMountHabitHubChromeIsland?: () => void }).__otMountHabitHubChromeIsland =
  mountHabitHubChromeIsland;

// P14a：挂载 Keys 工作流 tabs 岛（延迟到按键面板首次打开）
function mountKeysWorkflowIsland(): void {
  const host = document.getElementById('keysWorkflowTabs');
  if (!host || OneToneIslands.isMounted('keysWorkflowTabs')) return;
  host.innerHTML = '';
  OneToneIslands.mountIsland('keysWorkflowTabs', KeysWorkflowTabsIsland, {}, {
    onRefresh: () => ({}) as Record<string, unknown>,
  });
}
(window as unknown as { __otMountKeysWorkflowIsland?: () => void }).__otMountKeysWorkflowIsland =
  mountKeysWorkflowIsland;

// P14b：挂载 SoftPad 工作流壳岛（app switcher + scheme list；延迟到 SoftPad 首次 render）
function mountSoftPadWorkflowIsland(): void {
  if ((window as unknown as { __otSoftPadWorkflowMounted?: boolean }).__otSoftPadWorkflowMounted) return;

  const switcherHost = document.getElementById('softPadAppSwitcher');
  const listHost = document.getElementById('softPadSchemeList');
  if (!switcherHost || !listHost) return;

  switcherHost.innerHTML = '';
  listHost.innerHTML = '';

  OneToneIslands.mountIsland('softPadAppSwitcher', SoftPadAppSwitcherIsland, {}, {
    onRefresh: () => ({}) as Record<string, unknown>,
  });
  OneToneIslands.mountIsland('softPadSchemeList', SoftPadSchemeListIsland, {}, {
    onRefresh: () => ({}) as Record<string, unknown>,
  });

  registerSoftPadWorkflowSync();
}
(window as unknown as { __otMountSoftPadWorkflowIsland?: () => void }).__otMountSoftPadWorkflowIsland =
  mountSoftPadWorkflowIsland;

// 暴露宿主桥，供 legacy 与后续阶段调用
(window as unknown as { OneToneIslands: typeof OneToneIslands }).OneToneIslands = OneToneIslands;
(window as unknown as { OneToneUi: typeof OneToneUi }).OneToneUi = OneToneUi;

// Expose jumpAndHighlight for legacy registration script
import { jumpAndHighlight } from './domain/commandPalette';
(window as unknown as { __otJumpAndHighlight: typeof jumpAndHighlight }).__otJumpAndHighlight = jumpAndHighlight;

// legacy 在 applyMvpInit / render 后调用，触发所有岛刷新（避免 React 与 OneToneState 分叉）
(window as unknown as { OneToneIslandsRefresh: () => void }).OneToneIslandsRefresh = () =>
  OneToneIslands.dispatchRefresh();

// 信号：岛桥就绪。Toast 走 legacy 主路径（OneToneUi.toast 反向代理）；Confirm 走 React。
(window as unknown as { OneToneUiReady: boolean }).OneToneUiReady = true;
(window as unknown as { OneToneIslandsReady: boolean }).OneToneIslandsReady = true;
