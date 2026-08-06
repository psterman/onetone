// P10: SoftPad status bar island — replaces legacy DOM writes in updateStatusBar.
// Scope: #softPadStatusBar only. Everything below (hub, subpages, aside) stays legacy.
// Pattern: legacy pushes state via window.__otSoftPadStatusSync; island reads initial
// state via window.__otSoftPadStatusRead on mount/refresh. Toggle delegates back to
// window.OneToneSoftPadHub.toggleSelectedEnable (preserves IPC + saveAsync path).
// Hero chrome matches Keys/Voice page-status-bar (name + pill + meta + page-status-btn).
// Two meta rows: (状态灯 / 键位 / 恢复点) + (账号 / 额度 / 重置).
// Pad-centric: 「绑定 · App」dropdown lives here (replaces horizontal APP directory).

import * as React from 'react';
import { useIslandRefresh } from '../island-runtime';

// P10 island marker — kept as data attribute in rendered output for smoke tests

interface SoftPadBindScope {
  id: string;
  title: string;
  active: boolean;
  padEnabled?: boolean;
  canPrepare?: boolean;
}

interface SoftPadStatusProps {
  name: string;
  status: string;
  statusCls?: string;
  presentation: string;
  kind: string;
  agent: string;
  keys: string;
  /** Time Machine hero label (未保护 / 已保护 / 自动 · 15m). */
  restorePoint: string;
  account: string;
  plan: string;
  usageSummary: string;
  resetCountdown: string;
  usageState: string;
  padEnabled: boolean;
  hasMapping: boolean;
  activeScope?: string;
  bindLabel?: string;
  scopes?: SoftPadBindScope[];
}

type SoftPadHubApi = {
  toggleSelectedEnable?: () => void;
  handleStatusAction?: (action: string) => void;
  selectScope?: (scopeId: string, opts?: { fromUser?: boolean; resetView?: boolean }) => void;
};

function w() {
  return window as unknown as {
    __otSoftPadStatusRead?: () => SoftPadStatusProps;
    __otSoftPadStatusSync?: (props: SoftPadStatusProps) => void;
    __otSoftPadStatusMounted?: boolean;
    OneToneSoftPadHub?: SoftPadHubApi;
  };
}

const EMPTY: SoftPadStatusProps = {
  name: '—',
  status: '—',
  statusCls: '',
  presentation: '—',
  kind: '—',
  agent: '—',
  keys: '—',
  restorePoint: '即将接入',
  account: '',
  plan: '',
  usageSummary: '—',
  resetCountdown: '—',
  usageState: 'unavailable',
  padEnabled: false,
  hasMapping: false,
  activeScope: 'codex',
  bindLabel: '绑定 · —',
  scopes: [],
};

function readProps(): SoftPadStatusProps {
  return { ...EMPTY, ...(w().__otSoftPadStatusRead?.() ?? {}) };
}

function runAction(action: string) {
  const hub = w().OneToneSoftPadHub;
  if (hub?.handleStatusAction) hub.handleStatusAction(action);
}

function accountLine(account: string, plan: string): string {
  const a = String(account || '').trim();
  const p = String(plan || '').trim();
  if (a && p) return `${a} · ${p}`;
  if (a) return a;
  if (p) return p;
  return '—';
}

export function SoftPadStatusIsland(): JSX.Element {
  return <SoftPadStatusBarIsland />;
}

export function SoftPadStatusBarIsland(): JSX.Element {
  const [props, setProps] = React.useState<SoftPadStatusProps>(readProps);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const bindRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const win = w();
    win.__otSoftPadStatusSync = (next: SoftPadStatusProps) => setProps({ ...EMPTY, ...next });
    win.__otSoftPadStatusMounted = true;
    return () => {
      win.__otSoftPadStatusSync = undefined;
      win.__otSoftPadStatusMounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (ev: MouseEvent) => {
      const t = ev.target as Node | null;
      if (bindRef.current && t && bindRef.current.contains(t)) return;
      setMenuOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [menuOpen]);

  useIslandRefresh(() => {
    setProps(readProps());
  });

  const handleToggle = React.useCallback(() => {
    const hub = w().OneToneSoftPadHub;
    if (hub?.toggleSelectedEnable) hub.toggleSelectedEnable();
  }, []);

  const selectScope = React.useCallback((scopeId: string) => {
    const hub = w().OneToneSoftPadHub;
    if (hub?.selectScope) hub.selectScope(scopeId, { fromUser: true, resetView: false });
    setMenuOpen(false);
  }, []);

  const {
    name,
    status,
    statusCls,
    agent,
    keys,
    restorePoint,
    account,
    plan,
    usageSummary,
    resetCountdown,
    padEnabled,
    hasMapping,
    bindLabel,
    scopes,
  } = props;

  return (
    <>
      <div className="page-status-bar-main keys-scheme-status-main">
        <div className="keys-scheme-summary-title-row">
          <span className="keys-scheme-summary-name" id="softPadSummaryName">
            {name}
          </span>
          <span
            className={['keys-scheme-summary-pill', statusCls].filter(Boolean).join(' ')}
            id="softPadSummaryStatus"
          >
            {status}
          </span>
          <div className="soft-pad-bind-app" id="softPadBindApp" ref={bindRef}>
            <button
              type="button"
              className="soft-pad-bind-app__btn"
              id="softPadBindAppBtn"
              aria-haspopup="listbox"
              aria-expanded={menuOpen ? 'true' : 'false'}
              aria-controls="softPadBindAppMenu"
              onClick={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                setMenuOpen((v) => !v);
              }}
            >
              <span className="soft-pad-bind-app__lbl" id="softPadBindAppLbl">
                {bindLabel || '绑定 · —'}
              </span>
              <span className="soft-pad-bind-app__chev" aria-hidden="true">
                ▾
              </span>
            </button>
            <div
              className="soft-pad-bind-app__menu"
              id="softPadBindAppMenu"
              role="listbox"
              hidden={!menuOpen}
            >
              {(scopes || []).map((scope) => (
                <button
                  key={scope.id}
                  type="button"
                  className={['soft-pad-bind-app__opt', scope.active ? 'is-active' : '']
                    .filter(Boolean)
                    .join(' ')}
                  role="option"
                  data-scope={scope.id}
                  aria-selected={scope.active ? 'true' : 'false'}
                  onClick={(ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    selectScope(scope.id);
                  }}
                >
                  {scope.title}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="keys-scheme-summary-meta">
          <span className="keys-scheme-summary-item">
            <span className="keys-scheme-summary-lbl" id="softPadSummaryAgentLbl">
              状态灯
            </span>
            <span className="keys-scheme-summary-val" id="softPadSummaryAgent">
              {agent}
            </span>
          </span>
          <span className="keys-scheme-summary-divider" aria-hidden="true" />
          <span className="keys-scheme-summary-item">
            <span className="keys-scheme-summary-lbl" id="softPadSummaryKeysLbl">
              键位
            </span>
            <span className="keys-scheme-summary-val" id="softPadSummaryKeys">
              {keys || '—'}
            </span>
          </span>
          <span className="keys-scheme-summary-divider" aria-hidden="true" />
          <span className="keys-scheme-summary-item">
            <span className="keys-scheme-summary-lbl" id="softPadSummaryTmLbl">
              恢复点
            </span>
            <span className="keys-scheme-summary-val" id="softPadSummaryTm">
              {restorePoint || '—'}
            </span>
          </span>
        </div>
        <div className="keys-scheme-summary-meta soft-pad-status-usage-meta">
          <span className="keys-scheme-summary-item">
            <span className="keys-scheme-summary-lbl" id="softPadSummaryAccountLbl">
              账号
            </span>
            <span className="keys-scheme-summary-val" id="softPadSummaryAccount">
              {accountLine(account, plan)}
            </span>
          </span>
          <span className="keys-scheme-summary-divider" aria-hidden="true" />
          <span className="keys-scheme-summary-item">
            <span className="keys-scheme-summary-lbl" id="softPadSummaryUsageLbl">
              额度
            </span>
            <span className="keys-scheme-summary-val" id="softPadSummaryUsage">
              {usageSummary || '—'}
            </span>
          </span>
          <span className="keys-scheme-summary-divider" aria-hidden="true" />
          <span className="keys-scheme-summary-item">
            <span className="keys-scheme-summary-lbl" id="softPadSummaryResetLbl">
              重置
            </span>
            <span className="keys-scheme-summary-val" id="softPadSummaryReset">
              {resetCountdown || '—'}
            </span>
          </span>
        </div>
      </div>
      <div className="page-status-bar-actions keys-scheme-status-actions">
        <button
          type="button"
          className="page-status-btn"
          id="btnSoftPadTestFg"
          disabled={!hasMapping}
          onClick={() => runAction('test-fg')}
        >
          测试前台
        </button>
        <button
          type="button"
          className="page-status-btn"
          id="btnSoftPadEditKeys"
          disabled={!hasMapping}
          onClick={() => runAction('edit-keys')}
        >
          编辑键位
        </button>
        <button
          type="button"
          className="page-status-btn"
          id="btnSoftPadTimeline"
          onClick={() => runAction('open-timeline')}
        >
          打开时间线
        </button>
        <button
          type="button"
          className={['toggle-switch', 'keys-summary-enable', 'page-status-toggle', padEnabled ? 'is-on' : ''].filter(Boolean).join(' ')}
          id="softPadSummaryEnable"
          role="switch"
          aria-checked={padEnabled ? 'true' : 'false'}
          aria-labelledby="settingsPanelSoftPadTitle"
          disabled={!hasMapping}
          onClick={handleToggle}
        />
      </div>
    </>
  );
}
