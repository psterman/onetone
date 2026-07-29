// P10: SoftPad status bar island — replaces legacy DOM writes in updateStatusBar.
// Scope: #softPadStatusBar only. Everything below (hub, subpages, aside) stays legacy.
// Pattern: legacy pushes state via window.__otSoftPadStatusSync; island reads initial
// state via window.__otSoftPadStatusRead on mount/refresh. Toggle delegates back to
// window.OneToneSoftPadHub.toggleSelectedEnable (preserves IPC + saveAsync path).

import * as React from 'react';
import { useIslandRefresh } from '../island-runtime';

// P10 island marker — kept as data attribute in rendered output for smoke tests

interface SoftPadStatusProps {
  name: string;
  status: string;
  statusCls?: string;
  presentation: string;
  kind: string;
  padEnabled: boolean;
  hasMapping: boolean;
}

function w() {
  return window as unknown as {
    __otSoftPadStatusRead?: () => SoftPadStatusProps;
    __otSoftPadStatusSync?: (props: SoftPadStatusProps) => void;
    __otSoftPadStatusMounted?: boolean;
    OneToneSoftPadHub?: { toggleSelectedEnable?: () => void };
  };
}

const EMPTY: SoftPadStatusProps = {
  name: '—',
  status: '—',
  statusCls: '',
  presentation: '—',
  kind: '—',
  padEnabled: false,
  hasMapping: false,
};

function readProps(): SoftPadStatusProps {
  return w().__otSoftPadStatusRead?.() ?? EMPTY;
}

export function SoftPadStatusIsland(): JSX.Element {
  const [props, setProps] = React.useState<SoftPadStatusProps>(readProps);

  // Register sync-push receiver so legacy can push updates reactively
  React.useEffect(() => {
    const win = w();
    win.__otSoftPadStatusSync = (next: SoftPadStatusProps) => setProps(next);
    win.__otSoftPadStatusMounted = true;
    return () => {
      win.__otSoftPadStatusSync = undefined;
      win.__otSoftPadStatusMounted = false;
    };
  }, []);

  // Also re-read on island-wide refresh (mvp_init / config reload)
  useIslandRefresh(() => {
    setProps(readProps());
  });

  const handleToggle = React.useCallback(() => {
    const hub = w().OneToneSoftPadHub;
    if (hub?.toggleSelectedEnable) hub.toggleSelectedEnable();
  }, []);

  const { name, status, statusCls, presentation, kind, padEnabled, hasMapping } = props;

  return (
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
      </div>
      <div className="keys-scheme-summary-meta">
        <span className="keys-scheme-summary-item">
          <span className="keys-scheme-summary-lbl" id="softPadSummaryPresentationLbl">
            显示形态
          </span>
          <span className="keys-scheme-summary-val" id="softPadSummaryPresentation">
            {presentation}
          </span>
        </span>
        <span className="keys-scheme-summary-divider" aria-hidden="true" />
        <span className="keys-scheme-summary-item">
          <span className="keys-scheme-summary-lbl" id="softPadSummaryKindLbl">
            应用
          </span>
          <span className="keys-scheme-summary-val" id="softPadSummaryKind">
            {kind}
          </span>
        </span>
      </div>
    </div>
  );
}

// Render the actions section separately so the container layout is preserved.
// The island mounts into #softPadStatusBar which holds both .page-status-bar-main
// and .page-status-bar-actions; we render both here.
export function SoftPadStatusBarIsland(): JSX.Element {
  const [props, setProps] = React.useState<SoftPadStatusProps>(readProps);

  React.useEffect(() => {
    const win = w();
    win.__otSoftPadStatusSync = (next: SoftPadStatusProps) => setProps(next);
    win.__otSoftPadStatusMounted = true;
    return () => {
      win.__otSoftPadStatusSync = undefined;
      win.__otSoftPadStatusMounted = false;
    };
  }, []);

  useIslandRefresh(() => {
    setProps(readProps());
  });

  const handleToggle = React.useCallback(() => {
    const hub = w().OneToneSoftPadHub;
    if (hub?.toggleSelectedEnable) hub.toggleSelectedEnable();
  }, []);

  const { name, status, statusCls, presentation, kind, padEnabled, hasMapping } = props;

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
        </div>
        <div className="keys-scheme-summary-meta">
          <span className="keys-scheme-summary-item">
            <span className="keys-scheme-summary-lbl" id="softPadSummaryPresentationLbl">
              显示形态
            </span>
            <span className="keys-scheme-summary-val" id="softPadSummaryPresentation">
              {presentation}
            </span>
          </span>
          <span className="keys-scheme-summary-divider" aria-hidden="true" />
          <span className="keys-scheme-summary-item">
            <span className="keys-scheme-summary-lbl" id="softPadSummaryKindLbl">
              应用
            </span>
            <span className="keys-scheme-summary-val" id="softPadSummaryKind">
              {kind}
            </span>
          </span>
        </div>
      </div>
      <div className="page-status-bar-actions keys-scheme-status-actions">
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
