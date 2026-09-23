// P10: SoftPad status bar island — status pill only (enable toggle removed from chrome).
// Scope switch lives in .settings-context-chrome (habit-channel-edit-banner + settings-scope-switch).

import * as React from 'react';
import { useIslandRefresh } from '../island-runtime';

interface SoftPadStatusProps {
  brandTitle: string;
  name: string;
  status: string;
  statusCls?: string;
  agent: string;
  keys: string;
  restorePoint: string;
  padEnabled: boolean;
  hasMapping: boolean;
  canToggle?: boolean;
}

function w() {
  return window as unknown as {
    __otSoftPadStatusRead?: () => SoftPadStatusProps;
    __otSoftPadStatusSync?: (props: SoftPadStatusProps) => void;
    __otSoftPadStatusMounted?: boolean;
  };
}

const EMPTY: SoftPadStatusProps = {
  brandTitle: '虚拟键盘',
  name: '—',
  status: '—',
  statusCls: '',
  agent: '—',
  keys: '—',
  restorePoint: '即将接入',
  padEnabled: false,
  hasMapping: false,
  canToggle: false,
};

function readProps(): SoftPadStatusProps {
  return { ...EMPTY, ...(w().__otSoftPadStatusRead?.() ?? {}) };
}

export function SoftPadStatusIsland(): JSX.Element {
  return <SoftPadStatusBarIsland />;
}

export function SoftPadStatusBarIsland(): JSX.Element {
  const [props, setProps] = React.useState<SoftPadStatusProps>(readProps);

  React.useEffect(() => {
    const win = w();
    win.__otSoftPadStatusSync = (next: SoftPadStatusProps) => setProps({ ...EMPTY, ...next });
    win.__otSoftPadStatusMounted = true;
    setProps(readProps());
    return () => {
      win.__otSoftPadStatusSync = undefined;
      win.__otSoftPadStatusMounted = false;
    };
  }, []);

  useIslandRefresh(() => {
    setProps(readProps());
  });

  const { brandTitle, name, status, statusCls } = props;

  return (
    <div className="page-status-bar-main keys-scheme-status-main soft-pad-status-hero">
      <span className="sr-only soft-pad-page-brand-title" id="softPadPageBrandTitle">
        {brandTitle}
      </span>
      <span className="sr-only" id="softPadSummaryName">
        {name}
      </span>
      {/* agent / keys / tm summary ids live in scene actions / elsewhere — do not duplicate here */}
      <span
        className={['keys-scheme-summary-pill', statusCls].filter(Boolean).join(' ')}
        id="softPadSummaryStatus"
      >
        {status}
      </span>
    </div>
  );
}
