// P11: Keys panel status bar island — replaces legacy DOM writes in renderSchemeSummary.
// Scope: #keysWorkflowTabsBar main + actions only. Habit pills / sr-only assist stay legacy.

import * as React from 'react';
import { useIslandRefresh } from '../island-runtime';

interface KeysStatusProps {
  name: string;
  status: string;
  statusCls?: string;
  mappingEnabled: boolean;
  toggleDisabled: boolean;
}

function w() {
  return window as unknown as {
    __otKeysStatusRead?: () => KeysStatusProps;
    __otKeysStatusSync?: (props: KeysStatusProps) => void;
    __otKeysStatusMounted?: boolean;
    OneToneKeysPanelUi?: {
      toggleMappingEnable?: () => void;
    };
  };
}

const EMPTY: KeysStatusProps = {
  name: '—',
  status: '—',
  statusCls: '',
  mappingEnabled: false,
  toggleDisabled: true,
};

function readProps(): KeysStatusProps {
  const raw = w().__otKeysStatusRead?.();
  if (!raw) return EMPTY;
  return {
    name: raw.name,
    status: raw.status,
    statusCls: raw.statusCls,
    mappingEnabled: raw.mappingEnabled,
    toggleDisabled: raw.toggleDisabled,
  };
}

export function KeysStatusBarIsland(): JSX.Element {
  const [props, setProps] = React.useState<KeysStatusProps>(readProps);

  React.useEffect(() => {
    const win = w();
    win.__otKeysStatusSync = (next: KeysStatusProps) => setProps(readProps());
    win.__otKeysStatusMounted = true;
    return () => {
      win.__otKeysStatusSync = undefined;
      win.__otKeysStatusMounted = false;
    };
  }, []);

  useIslandRefresh(() => {
    setProps(readProps());
  });

  const handleToggle = React.useCallback(() => {
    w().OneToneKeysPanelUi?.toggleMappingEnable?.();
  }, []);

  const { name, status, statusCls, mappingEnabled, toggleDisabled } = props;

  return (
    <>
      <div className="page-status-bar-main keys-scheme-status-main">
        <div className="keys-scheme-summary-title-row">
          <span className="keys-scheme-summary-name" id="keysSummaryName">
            {name}
          </span>
          <span
            className={['keys-scheme-summary-pill', statusCls].filter(Boolean).join(' ')}
            id="keysSummaryStatus"
          >
            {status}
          </span>
        </div>
      </div>
      <div className="page-status-bar-actions keys-scheme-status-actions">
        <button
          type="button"
          className={[
            'toggle-switch',
            'keys-summary-enable',
            'page-status-toggle',
            mappingEnabled ? 'is-on' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          id="btnKeysMappingEnable"
          role="switch"
          aria-checked={mappingEnabled ? 'true' : 'false'}
          aria-labelledby="keysSummaryStatus"
          disabled={toggleDisabled}
          onClick={handleToggle}
        />
      </div>
    </>
  );
}
