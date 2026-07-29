import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  buildSoftPadWorkflowModel,
  softPadWorkflowReady,
  softPadWorkflowSignature,
  type SoftPadWorkflowModel,
} from '../domain/softPadWorkflow';

// P14b: SoftPad 工作流壳岛 — app switcher + scheme list；#softPadHubStage 主区留 legacy。

type WorkflowListener = () => void;
const workflowListeners = new Set<WorkflowListener>();

function notifyWorkflowListeners(): void {
  workflowListeners.forEach((cb) => cb());
}

function registerWorkflowListener(cb: WorkflowListener): () => void {
  workflowListeners.add(cb);
  return () => {
    workflowListeners.delete(cb);
  };
}

function useWorkflowModel(): SoftPadWorkflowModel {
  const [model, setModel] = useState<SoftPadWorkflowModel>(() =>
    softPadWorkflowReady() ? buildSoftPadWorkflowModel() : buildSoftPadWorkflowModel(),
  );
  const lastSigRef = useRef<string>(softPadWorkflowSignature(model));

  const sync = useCallback(() => {
    if (!softPadWorkflowReady()) return;
    const next = buildSoftPadWorkflowModel();
    const sig = softPadWorkflowSignature(next);
    if (sig === lastSigRef.current) return;
    lastSigRef.current = sig;
    setModel(next);
  }, []);

  useEffect(() => registerWorkflowListener(sync), [sync]);
  useIslandRefresh(sync);

  return model;
}

const HtmlBlock = memo(function HtmlBlock({ html }: { html: string }) {
  return (
    <div
      style={{ display: 'contents' }}
      // eslint-disable-next-line react/no-danger -- markup 来自 legacy chip/row view
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}, (prev, next) => prev.html === next.html);

export function SoftPadAppSwitcherIsland(): JSX.Element {
  const model = useWorkflowModel();

  useEffect(() => {
    const host = document.getElementById('softPadAppSwitcher');
    if (host) {
      host.hidden = model.switcherHidden;
      host.setAttribute('aria-label', model.switcherLabel);
    }
  }, [model.switcherHidden, model.switcherLabel]);

  if (model.switcherHidden) return <></>;

  return (
    <>
      {model.switcherChips.map((chip) => (
        <HtmlBlock key={chip.id} html={chip.html} />
      ))}
    </>
  );
}

export function SoftPadSchemeListIsland(): JSX.Element {
  const model = useWorkflowModel();

  useEffect(() => {
    const title = document.getElementById('softPadSchemeTitleLbl');
    const count = document.getElementById('softPadSchemeCount');
    const aside = document.getElementById('softPadSchemeAside');
    if (title) title.textContent = model.schemeTitle;
    if (count) count.textContent = model.schemeCount;
    if (aside) aside.setAttribute('aria-label', model.schemeTitle);
  }, [model.schemeTitle, model.schemeCount]);

  if (model.emptyHtml) {
    return <p className="keys-hub-empty">{model.emptyHtml}</p>;
  }

  return (
    <div className="keys-hub-scheme-group">
      {model.schemeRows.map((row) => (
        <HtmlBlock key={row.id} html={row.html} />
      ))}
    </div>
  );
}

export function registerSoftPadWorkflowSync(): () => void {
  const win = window as unknown as {
    __otSoftPadWorkflowSync?: () => void;
    __otSoftPadWorkflowMounted?: boolean;
  };
  win.__otSoftPadWorkflowSync = () => notifyWorkflowListeners();
  win.__otSoftPadWorkflowMounted = true;
  notifyWorkflowListeners();
  return () => {
    if (win.__otSoftPadWorkflowSync) delete win.__otSoftPadWorkflowSync;
    win.__otSoftPadWorkflowMounted = false;
  };
}
