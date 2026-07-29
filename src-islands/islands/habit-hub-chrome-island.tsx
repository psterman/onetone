import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  afterHabitHubChromeCommit,
  buildHabitHubChromeModel,
  chromeSignature,
  habitHubChromeReady,
  type HabitHubChromeModel,
} from '../domain/habitHubChrome';

// P13: 习惯 Hub 壳层岛 — guide / empty / sort 三宿主、一 sync。
// 交互：#habitHubView 事件委托（含 #habitHubSort change）；#btnHabitHubEmptyNew 仍 legacy bind。

type ChromeListener = () => void;
const chromeListeners = new Set<ChromeListener>();

function notifyChromeListeners(): void {
  chromeListeners.forEach((cb) => cb());
}

function registerChromeListener(cb: ChromeListener): () => void {
  chromeListeners.add(cb);
  return () => {
    chromeListeners.delete(cb);
  };
}

function useChromeModel(): HabitHubChromeModel {
  const [model, setModel] = useState<HabitHubChromeModel>(() =>
    habitHubChromeReady() ? buildHabitHubChromeModel() : buildHabitHubChromeModel(),
  );
  const lastSigRef = useRef<string>(chromeSignature(model));

  const sync = useCallback(() => {
    if (!habitHubChromeReady()) return;
    const next = buildHabitHubChromeModel();
    const sig = chromeSignature(next);
    if (sig === lastSigRef.current) return;
    lastSigRef.current = sig;
    setModel(next);
  }, []);

  useEffect(() => registerChromeListener(sync), [sync]);
  useIslandRefresh(sync);

  return model;
}

const GuideBlock = memo(function GuideBlock({ html }: { html: string }) {
  return (
    <div
      style={{ display: 'contents' }}
      // eslint-disable-next-line react/no-danger -- markup 来自 legacy guideView（非用户输入）
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}, (prev, next) => prev.html === next.html);

export function HabitHubGuideIsland(): JSX.Element {
  const model = useChromeModel();

  useEffect(() => {
    afterHabitHubChromeCommit();
  }, [model.guideHtml]);

  return <GuideBlock html={model.guideHtml} />;
}

export function HabitHubEmptyIsland(): JSX.Element {
  const model = useChromeModel();
  const { empty } = model;

  useEffect(() => {
    const host = document.getElementById('habitHubEmpty');
    if (host) host.hidden = empty.hidden;
  }, [empty.hidden]);

  return (
    <>
      <p className="habit-hub-empty-title" id="habitHubEmptyTitle">
        {empty.title}
      </p>
      <p className="habit-hub-empty-desc" id="habitHubEmptyDesc">
        {empty.desc}
      </p>
      <button type="button" className="habit-hub-new-btn is-primary" id="btnHabitHubEmptyNew">
        {empty.newLabel}
      </button>
    </>
  );
}

export function HabitHubSortIsland(): JSX.Element {
  const model = useChromeModel();
  const { sort } = model;

  const handleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const win = window as unknown as {
      OneToneState?: { ui?: Record<string, unknown> };
      OneToneHabitHub?: { scheduleHubPaint?: () => void };
    };
    const ui = win.OneToneState?.ui;
    if (ui) ui.habitHubSort = e.target.value;
    win.OneToneHabitHub?.scheduleHubPaint?.();
  }, []);

  return (
    <select
      className="habit-hub-sort"
      id="habitHubSort"
      aria-labelledby="habitHubSortLabel"
      value={sort.value}
      onChange={handleChange}
    >
      {sort.options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

/** 注册全局 sync；main.tsx mount 时调用一次。 */
export function registerHabitHubChromeSync(): () => void {
  const win = window as unknown as {
    __otHabitHubChromeSync?: () => void;
    __otHabitHubChromeMounted?: boolean;
  };
  win.__otHabitHubChromeSync = () => notifyChromeListeners();
  win.__otHabitHubChromeMounted = true;
  notifyChromeListeners();
  return () => {
    if (win.__otHabitHubChromeSync) delete win.__otHabitHubChromeSync;
    win.__otHabitHubChromeMounted = false;
  };
}
