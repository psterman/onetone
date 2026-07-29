// P11: Keys panel status bar island — replaces legacy DOM writes in renderSchemeSummary.
// Scope: #keysWorkflowTabsBar main + actions only. Workflow tabs / habit switcher sr-only stay legacy.
// Pattern: legacy pushes state via window.__otKeysStatusSync; island reads via __otKeysStatusRead.
// Button clicks delegate to OneToneKeysPanelUi (preserves save/test/add/toggle paths).

import * as React from 'react';
import { useIslandRefresh } from '../island-runtime';

interface KeysStatusProps {
  name: string;
  status: string;
  statusCls?: string;
  triggerLbl: string;
  triggerVal: string;
  scopeLbl: string;
  scopeVal: string;
  saveLabel: string;
  testLabel: string;
  addLabel: string;
  saveDisabled: boolean;
  saveHidden: boolean;
  testDisabled: boolean;
  mappingEnabled: boolean;
  toggleDisabled: boolean;
  hasMapping: boolean;
}

function w() {
  return window as unknown as {
    __otKeysStatusRead?: () => KeysStatusProps;
    __otKeysStatusSync?: (props: KeysStatusProps) => void;
    __otKeysStatusMounted?: boolean;
    OneToneKeysPanelUi?: {
      saveCurrentScheme?: () => void;
      testOnceTop?: () => void;
      addScheme?: () => void;
      toggleMappingEnable?: () => void;
    };
  };
}

const EMPTY: KeysStatusProps = {
  name: '—',
  status: '—',
  statusCls: '',
  triggerLbl: '',
  triggerVal: '—',
  scopeLbl: '',
  scopeVal: '—',
  saveLabel: '',
  testLabel: '',
  addLabel: '',
  saveDisabled: true,
  saveHidden: false,
  testDisabled: true,
  mappingEnabled: false,
  toggleDisabled: true,
  hasMapping: false,
};

function readProps(): KeysStatusProps {
  return w().__otKeysStatusRead?.() ?? EMPTY;
}

export function KeysStatusBarIsland(): JSX.Element {
  const [props, setProps] = React.useState<KeysStatusProps>(readProps);

  React.useEffect(() => {
    const win = w();
    win.__otKeysStatusSync = (next: KeysStatusProps) => setProps(next);
    win.__otKeysStatusMounted = true;
    return () => {
      win.__otKeysStatusSync = undefined;
      win.__otKeysStatusMounted = false;
    };
  }, []);

  useIslandRefresh(() => {
    setProps(readProps());
  });

  const handleSave = React.useCallback(() => {
    w().OneToneKeysPanelUi?.saveCurrentScheme?.();
  }, []);

  const handleTest = React.useCallback(() => {
    w().OneToneKeysPanelUi?.testOnceTop?.();
  }, []);

  const handleAdd = React.useCallback(() => {
    w().OneToneKeysPanelUi?.addScheme?.();
  }, []);

  const handleToggle = React.useCallback(() => {
    w().OneToneKeysPanelUi?.toggleMappingEnable?.();
  }, []);

  const {
    name,
    status,
    statusCls,
    triggerLbl,
    triggerVal,
    scopeLbl,
    scopeVal,
    saveLabel,
    testLabel,
    addLabel,
    saveDisabled,
    saveHidden,
    testDisabled,
    mappingEnabled,
    toggleDisabled,
  } = props;

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
        <div className="keys-scheme-summary-meta">
          <span className="keys-scheme-summary-item">
            <span className="keys-scheme-summary-lbl" id="keysSummaryTriggerLbl">
              {triggerLbl}
            </span>
            <span className="keys-scheme-summary-val" id="keysSummaryTrigger">
              {triggerVal}
            </span>
          </span>
          <span className="keys-scheme-summary-divider" aria-hidden="true" />
          <span className="keys-scheme-summary-item">
            <span className="keys-scheme-summary-lbl" id="keysSummaryScopeLbl">
              {scopeLbl}
            </span>
            <span className="keys-scheme-summary-val" id="keysSummaryScope">
              {scopeVal}
            </span>
          </span>
        </div>
      </div>
      <div className="page-status-bar-actions keys-scheme-status-actions">
        <button
          type="button"
          className="page-status-btn"
          id="btnKeysTestTop"
          disabled={testDisabled}
          onClick={handleTest}
        >
          {testLabel}
        </button>
        {!saveHidden ? (
          <button
            type="button"
            className="page-status-btn is-primary"
            id="btnKeysSave"
            disabled={saveDisabled}
            onClick={handleSave}
          >
            {saveLabel}
          </button>
        ) : null}
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
        <button type="button" className="page-status-btn" id="btnKeysSchemeAdd" onClick={handleAdd}>
          {addLabel}
        </button>
      </div>
    </>
  );
}
