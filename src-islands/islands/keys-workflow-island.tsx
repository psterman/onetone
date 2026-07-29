import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  buildKeysWorkflowTabsModel,
  keysWorkflowReady,
  workflowTabsSignature,
  type KeysWorkflowTab,
  type KeysWorkflowTabsModel,
} from '../domain/keysWorkflow';

// P14a: Keys 工作流 tabs 岛 — #keysWorkflowTabs keyed diff；点击仍 legacy 委托。

const TabBlock = memo(function TabBlock({ html }: { html: string }) {
  return (
    <div
      style={{ display: 'contents' }}
      // eslint-disable-next-line react/no-danger -- markup 来自 legacy workflowTabView
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}, (prev, next) => prev.html === next.html);

export function KeysWorkflowTabsIsland(): JSX.Element {
  const [model, setModel] = useState<KeysWorkflowTabsModel>(() =>
    keysWorkflowReady() ? buildKeysWorkflowTabsModel() : { emptyHtml: '', tabs: [] },
  );
  const lastSigRef = useRef<string>(workflowTabsSignature(model));

  const sync = useCallback(() => {
    if (!keysWorkflowReady()) return;
    const next = buildKeysWorkflowTabsModel();
    const sig = workflowTabsSignature(next);
    if (sig === lastSigRef.current) return;
    lastSigRef.current = sig;
    setModel(next);
  }, []);

  useEffect(() => {
    const win = window as unknown as {
      __otKeysWorkflowSync?: () => void;
      __otKeysWorkflowMounted?: boolean;
    };
    win.__otKeysWorkflowSync = sync;
    win.__otKeysWorkflowMounted = true;
    sync();
    return () => {
      if (win.__otKeysWorkflowSync === sync) delete win.__otKeysWorkflowSync;
      win.__otKeysWorkflowMounted = false;
    };
  }, [sync]);

  useIslandRefresh(sync);

  if (model.emptyHtml) {
    return <p className="keys-workflow-tabs-empty">{model.emptyHtml}</p>;
  }

  return (
    <>
      {model.tabs.map((tab: KeysWorkflowTab) => (
        <TabBlock key={tab.id} html={tab.html} />
      ))}
    </>
  );
}
