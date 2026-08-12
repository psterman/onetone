// P11: Keys panel status bar island — replaces legacy DOM writes in renderSchemeSummary.
// Scope: #keysWorkflowTabsBar main + actions only. Workflow tabs / habit switcher sr-only stay legacy.
// Pattern: legacy pushes state via window.__otKeysStatusSync; island reads via __otKeysStatusRead.
// Button clicks delegate to OneToneKeysPanelUi (preserves save/test/add/toggle paths).

import * as React from 'react';
import { useIslandRefresh } from '../island-runtime';

interface ScopeApp {
  id?: string;
  name: string;
  icon?: string;
}

interface KeysStatusProps {
  name: string;
  status: string;
  statusCls?: string;
  triggerLbl: string;
  triggerVal: string;
  scopeLbl: string;
  scopeVal: string;
  scopeApps?: ScopeApp[];
  scopeIcons?: boolean;
  scopeHidden?: boolean;
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
  scopeApps: [],
  scopeIcons: false,
  scopeHidden: false,
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

function ScopeIcons({
  apps,
  fallback,
}: {
  apps: ScopeApp[];
  fallback: string;
}): JSX.Element {
  if (!apps.length) {
    return <span className="keys-scope-icon-chip keys-scope-icon-chip--none">{fallback}</span>;
  }
  const more = apps.length > 3;
  const show = more ? apps.slice(0, 3) : apps;
  return (
    <>
      {show.map((app, i) => (
        <React.Fragment key={(app.id || app.name || 'app') + String(i)}>
          {i > 0 ? (
            <span className="keys-scope-sep" aria-hidden="true">
              /
            </span>
          ) : null}
          <span className="keys-scope-icon-chip" title={app.name}>
            {app.icon ? (
              <img className="keys-scope-icon" src={app.icon} alt="" decoding="async" />
            ) : (
              <span className="keys-scope-icon keys-scope-icon--fallback" aria-hidden="true">
                {(app.name || '?').charAt(0)}
              </span>
            )}
            <span className="keys-scope-icon-name">{app.name}</span>
          </span>
        </React.Fragment>
      ))}
      {more ? (
        <span className="keys-scope-more" aria-hidden="true">
          …
        </span>
      ) : null}
    </>
  );
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
    scopeApps,
    scopeIcons,
    scopeHidden,
    saveLabel,
    testLabel,
    addLabel,
    saveDisabled,
    saveHidden,
    testDisabled,
    mappingEnabled,
    toggleDisabled,
  } = props;

  const apps = Array.isArray(scopeApps) ? scopeApps : [];
  const showIcons = !!scopeIcons;
  const showScope = !scopeHidden;

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
          {showScope ? (
            <>
              <span className="keys-scheme-summary-divider" aria-hidden="true" />
              <span className="keys-scheme-summary-item keys-summary-scope-item" id="keysSummaryScopeItem">
                <span className="keys-scheme-summary-lbl" id="keysSummaryScopeLbl">
                  {scopeLbl}
                </span>
                <span
                  className={['keys-scheme-summary-val', showIcons ? 'has-icons' : '']
                    .filter(Boolean)
                    .join(' ')}
                  id="keysSummaryScope"
                >
                  {showIcons ? <ScopeIcons apps={apps} fallback={scopeVal || '—'} /> : scopeVal}
                </span>
              </span>
            </>
          ) : null}
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
