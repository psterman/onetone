// P10: SoftPad status bar island — L2 row (pill + toggle) under unified settingsContextBar.

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



type SoftPadHubApi = {

  toggleSelectedEnable?: () => void;

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



  const handleToggle = React.useCallback(() => {

    w().OneToneSoftPadHub?.toggleSelectedEnable?.();

  }, []);



  const { brandTitle, name, status, statusCls, agent, keys, restorePoint, padEnabled, canToggle } = props;

  const toggleDisabled = !(canToggle ?? props.hasMapping);



  return (

    <>

      <div className="page-status-bar-main keys-scheme-status-main soft-pad-status-hero">

        <span className="sr-only soft-pad-page-brand-title" id="softPadPageBrandTitle">

          {brandTitle}

        </span>

        <span className="sr-only" id="softPadSummaryName">

          {name}

        </span>

        <span className="sr-only" id="softPadSummaryAgent">

          {agent}

        </span>

        <span className="sr-only" id="softPadSummaryKeys">

          {keys || '—'}

        </span>

        <span className="sr-only" id="softPadSummaryTm">

          {restorePoint || '—'}

        </span>

        <span

          className={['keys-scheme-summary-pill', statusCls].filter(Boolean).join(' ')}

          id="softPadSummaryStatus"

        >

          {status}

        </span>

      </div>

      <div className="page-status-bar-actions keys-scheme-status-actions">

        <button

          type="button"

          className={['toggle-switch', 'keys-summary-enable', 'page-status-toggle', padEnabled ? 'is-on' : '']

            .filter(Boolean)

            .join(' ')}

          id="softPadSummaryEnable"

          role="switch"

          aria-checked={padEnabled ? 'true' : 'false'}

          aria-labelledby="softPadSummaryStatus"

          disabled={toggleDisabled}

          onClick={handleToggle}

        />

      </div>

    </>

  );

}


