import * as React from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  buildCommandItems,
  filterCommands,
  mergeCommandItems,
  CORE_COMMAND_IDS,
} from '../domain/commandPalette';
import { getCommands, subscribeCommand, type CommandItem } from '../shared/ui-store';

export interface CommandPaletteApi {
  openPalette: () => void;
  isOpen: () => boolean;
  close: () => void;
}

function t(key: string): string {
  const i18n = (window as unknown as { OneToneI18n?: { t?: (k: string) => string } }).OneToneI18n;
  if (i18n && typeof i18n.t === 'function') return i18n.t(key);
  return key;
}

function buildAllItems(): CommandItem[] {
  const core = buildCommandItems(t);
  const extras = getCommands().filter((c) => !CORE_COMMAND_IDS.has(c.id));
  return mergeCommandItems(core, extras);
}

/** P9a: inline command palette — replaces legacy #wbCommandSearchInput + #wbCmdkPanel. */
export function WbCommandIsland(): JSX.Element {
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [items, setItems] = React.useState<CommandItem[]>(() => buildAllItems());
  const inputRef = React.useRef<HTMLInputElement>(null);

  const refreshItems = React.useCallback(() => {
    setItems(buildAllItems());
  }, []);

  useIslandRefresh(refreshItems);

  React.useEffect(() => subscribeCommand(refreshItems), [refreshItems]);

  const visible = React.useMemo(() => filterCommands(items, query), [items, query]);

  React.useEffect(() => {
    if (!visible.length) {
      setActiveIndex(-1);
    } else if (activeIndex < 0 || activeIndex >= visible.length) {
      setActiveIndex(0);
    }
  }, [visible, activeIndex]);

  const close = React.useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const openPalette = React.useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
    setOpen(true);
  }, []);

  const runItem = React.useCallback(
    (item: CommandItem | undefined) => {
      if (!item) return;
      close();
      inputRef.current?.blur();
      item.run();
    },
    [close],
  );

  React.useEffect(() => {
    const api: CommandPaletteApi = {
      openPalette,
      isOpen: () => open,
      close,
    };
    const w = window as unknown as {
      __otCommandPalette?: CommandPaletteApi;
      __otCommandPaletteMounted?: boolean;
    };
    w.__otCommandPalette = api;
    w.__otCommandPaletteMounted = true;
    return () => {
      if (w.__otCommandPalette === api) delete w.__otCommandPalette;
      w.__otCommandPaletteMounted = false;
    };
  }, [openPalette, close, open]);

  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!open) return;
      const wrap = document.getElementById('wbCommandSearch');
      if (wrap && e.target instanceof Node && wrap.contains(e.target)) return;
      close();
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open, close]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      close();
      inputRef.current?.blur();
      e.preventDefault();
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') {
      if (!visible.length) return;
      setActiveIndex((i) => (i + 1) % visible.length);
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowUp') {
      if (!visible.length) return;
      setActiveIndex((i) => (i - 1 + visible.length) % visible.length);
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      if (activeIndex >= 0 && visible[activeIndex]) {
        runItem(visible[activeIndex]);
        e.preventDefault();
      }
    }
  };

  const placeholder = t('homeWbCmdSearchPlaceholder');
  const ariaLabel = t('homeWbCommandSearchAria');
  const emptyLabel = t('homeWbCmdkEmpty');

  return (
    <>
      <svg
        className="wb-command-search-ico"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        id="wbCommandSearchInput"
        placeholder={placeholder}
        autoComplete="off"
        aria-label={ariaLabel}
        aria-controls="wbCmdkPanel"
        aria-expanded={open ? 'true' : 'false'}
        aria-autocomplete="list"
        role="combobox"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      <kbd>Ctrl K</kbd>
      <div
        className="wb-cmdk-panel"
        id="wbCmdkPanel"
        role="listbox"
        hidden={!open}
        onMouseDown={(e) => e.preventDefault()}
      >
        {!visible.length ? (
          <div className="wb-cmdk-empty">{emptyLabel}</div>
        ) : (
          visible.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              className={'wb-cmdk-item' + (idx === activeIndex ? ' is-active' : '')}
              role="option"
              data-cmdk-id={item.id}
              aria-selected={idx === activeIndex ? 'true' : 'false'}
              onClick={() => runItem(item)}
            >
              <span>{item.title}</span>
              {item.group ? <span className="wb-cmdk-item-hint">{item.group}</span> : null}
            </button>
          ))
        )}
      </div>
    </>
  );
}
