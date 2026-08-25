import { useCallback, useEffect, useRef, useState } from 'react';
import { useIslandRefresh } from '../island-runtime';
import { invoke } from '../ipc/typedIpc';

export interface ActionHistoryEntry {
  id: number;
  tsMs: number;
  channel: string;
  kind: string;
  actionId?: string | null;
  mappingId?: string | null;
  providerId?: string | null;
  slotId?: string | null;
  status: string;
  summary: string;
  detail?: string | null;
}

interface ListResult {
  entries: ActionHistoryEntry[];
  hasMore: boolean;
}

interface AnalyzeResult {
  ok: boolean;
  text?: string | null;
  reason?: string | null;
  detail?: string | null;
}

type ChannelFilter = '' | 'key' | 'voice' | 'softPad' | 'camera';
type ChatMsg = { role: 'user' | 'assistant'; text: string };

export type ActionHistoryIslandProps = {
  mappingId?: string;
  compact?: boolean;
  hours?: number;
};

const CHANNELS: { id: ChannelFilter; labelKey: string; fallback: string }[] = [
  { id: '', labelKey: 'actionHistoryFilterAll', fallback: '全部' },
  { id: 'key', labelKey: 'actionHistoryFilterKey', fallback: '按键' },
  { id: 'voice', labelKey: 'actionHistoryFilterVoice', fallback: '语音' },
  { id: 'softPad', labelKey: 'actionHistoryFilterSoftPad', fallback: 'SoftPad' },
  { id: 'camera', labelKey: 'actionHistoryFilterCamera', fallback: '摄像头' },
];

function t(key: string, fallback?: string): string {
  const i18n = (window as unknown as { OneToneI18n?: { t?: (k: string) => string } }).OneToneI18n;
  if (i18n && typeof i18n.t === 'function') {
    const v = i18n.t(key);
    if (v && v !== key) return v;
  }
  return fallback ?? key;
}

function formatTime(tsMs: number): string {
  if (!(tsMs > 0)) return '—';
  const d = new Date(tsMs);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  return `${d.toLocaleDateString([], { month: 'numeric', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function statusLabel(status: string): string {
  return statusOk(status)
    ? t('actionHistoryStatusOk', '成功')
    : t('actionHistoryStatusFail', '失败');
}

function statusOk(status: string): boolean {
  const s = String(status || '').toLowerCase();
  return s === 'executed' || s === 'ok' || s === 'success';
}

function mergeEntries(prev: ActionHistoryEntry[], incoming: ActionHistoryEntry[]): ActionHistoryEntry[] {
  const map = new Map<number, ActionHistoryEntry>();
  for (const e of [...prev, ...incoming]) map.set(e.id, e);
  return Array.from(map.values()).sort((a, b) => b.tsMs - a.tsMs || b.id - a.id);
}

async function fetchList(
  channel: ChannelFilter,
  mappingId: string | undefined,
  hours: number | undefined,
  beforeTs?: number,
  limit = 50,
): Promise<ListResult> {
  const raw = await invoke<ListResult>('cmd_action_history_list', {
    limit,
    channel: channel || undefined,
    mappingId: mappingId || undefined,
    beforeTs,
    hours: hours && hours > 0 ? hours : undefined,
  });
  return raw && typeof raw === 'object'
    ? { entries: Array.isArray(raw.entries) ? raw.entries : [], hasMore: !!raw.hasMore }
    : { entries: [], hasMore: false };
}

export function ActionHistoryIsland(props: ActionHistoryIslandProps = {}): JSX.Element {
  const mappingId = String(props.mappingId || '').trim() || undefined;
  const compact = !!props.compact;
  const hours = props.hours && props.hours > 0 ? props.hours : undefined;
  const [channel, setChannel] = useState<ChannelFilter>('');
  const [entries, setEntries] = useState<ActionHistoryEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analyzeText, setAnalyzeText] = useState('');
  const [analyzeBusy, setAnalyzeBusy] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatLog, setChatLog] = useState<ChatMsg[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (opts?: { append?: boolean; beforeTs?: number }) => {
      setLoading(true);
      try {
        const res = await fetchList(channel, mappingId, hours, opts?.beforeTs, compact ? 30 : 50);
        setEntries((prev) =>
          opts?.append ? mergeEntries(prev, res.entries) : mergeEntries([], res.entries),
        );
        setHasMore(res.hasMore);
      } finally {
        setLoading(false);
      }
    },
    [channel, mappingId, compact, hours],
  );

  useIslandRefresh(() => {
    void load();
  });

  useEffect(() => {
    setEntries([]);
    setAnalyzeText('');
    setChatLog([]);
    void load();
  }, [load]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const msg = e?.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type !== 'mvp_action_history_event') return;
      const entry = msg.entry as ActionHistoryEntry | undefined;
      if (!entry || typeof entry.id !== 'number') return;
      if (channel && entry.channel !== channel) return;
      if (mappingId && String(entry.mappingId || '') !== mappingId) return;
      if (hours) {
        const cutoff = Date.now() - hours * 3_600_000;
        if (!(entry.tsMs >= cutoff)) return;
      }
      setEntries((prev) => mergeEntries([entry], prev));
    };
    window.chrome?.webview?.addEventListener?.('message', onMsg);
    return () => window.chrome?.webview?.removeEventListener?.('message', onMsg);
  }, [channel, mappingId, hours]);

  const onAnalyze = async (mode: 'summary' | 'optimization') => {
    setAnalyzeBusy(true);
    try {
      const cmd =
        mode === 'summary'
          ? 'cmd_action_history_analyze_summary'
          : 'cmd_action_history_analyze_optimization';
      const res = await invoke<AnalyzeResult>(cmd, {
        hours: 24,
        limit: 200,
        mappingId: mappingId || undefined,
      });
      if (res?.ok && res.text) {
        setAnalyzeText(res.text);
      } else {
        const reason = res?.reason || 'failed';
        const detail = res?.detail || '';
        setAnalyzeText(
          t('actionHistoryAnalyzeFailed', '分析失败') +
            `: ${reason}${detail ? ` — ${detail}` : ''}`,
        );
      }
    } finally {
      setAnalyzeBusy(false);
    }
  };

  const onChatSend = async () => {
    const q = chatInput.trim();
    if (!q || analyzeBusy) return;
    setChatInput('');
    setChatLog((prev) => [...prev, { role: 'user', text: q }]);
    setAnalyzeBusy(true);
    try {
      const res = await invoke<AnalyzeResult>('cmd_action_history_analyze_chat', {
        question: q,
        hours: 24,
        limit: 200,
        mappingId: mappingId || undefined,
      });
      const text =
        res?.ok && res.text
          ? res.text
          : t('actionHistoryAnalyzeFailed', '分析失败') +
            `: ${res?.reason || 'failed'}${res?.detail ? ` — ${res.detail}` : ''}`;
      setChatLog((prev) => [...prev, { role: 'assistant', text }]);
    } finally {
      setAnalyzeBusy(false);
    }
  };

  const loadMore = () => {
    if (!hasMore || loading || !entries.length) return;
    const last = entries[entries.length - 1];
    void load({ append: true, beforeTs: last.tsMs });
  };

  return (
    <div className={`ot-action-history ot-island${compact ? ' is-compact' : ''}`}>
      <div className="ot-action-history-toolbar">
        <div className="ot-action-history-filters" role="tablist">
          {CHANNELS.map((c) => (
            <button
              key={c.id || 'all'}
              type="button"
              role="tab"
              className={`ot-action-history-filter${channel === c.id ? ' is-active' : ''}`}
              aria-selected={channel === c.id}
              onClick={() => setChannel(c.id)}
            >
              {t(c.labelKey, c.fallback)}
            </button>
          ))}
        </div>
        <div className="ot-action-history-actions">
          <button type="button" className="voice-mode-meta-link" disabled={loading} onClick={() => void load()}>
            {t('actionHistoryRefresh', '刷新')}
          </button>
        </div>
      </div>

      <div className="ot-action-history-list" ref={listRef} role="log" aria-live="polite">
        {!entries.length && !loading ? (
          <p className="help ot-action-history-empty">
            {t('habitUsageEmpty', '还没有真正用过。按一下热键或说一句指令后，会出现在这里。')}
          </p>
        ) : null}
        {entries.map((row) => (
          <div key={row.id} className="ot-action-history-row">
            <span className="ot-action-history-time">{formatTime(row.tsMs)}</span>
            <span className="ot-action-history-summary" title={row.detail || undefined}>
              {row.summary}
            </span>
            <span
              className={`ot-action-history-status${statusOk(row.status) ? ' is-ok' : ' is-fail'}`}
              aria-label={statusLabel(row.status)}
            >
              {statusOk(row.status) ? '✓' : '×'}
            </span>
          </div>
        ))}
        {hasMore ? (
          <button
            type="button"
            className="ot-action-history-load-more"
            disabled={loading}
            onClick={loadMore}
          >
            {loading ? t('actionHistoryLoading', '加载中…') : t('actionHistoryLoadMore', '加载更多')}
          </button>
        ) : null}
      </div>

      {!compact ? (
        <section className="ot-action-history-ai" aria-label={t('actionHistoryAiTitle', 'AI 分析')}>
          <h4 className="pref-page-subtitle">{t('actionHistoryAiTitle', 'AI 分析')}</h4>
          <p className="help ot-action-history-ai-hint">
            {t(
              'actionHistoryAiHint',
              '需要 DeepSeek API（Claude Code settings）。未配置时请直接看上方使用记录。',
            )}
          </p>
          <div className="ot-action-history-ai-btns">
            <button
              type="button"
              className="wb-trigger-btn wb-trigger-btn-filled"
              disabled={analyzeBusy}
              onClick={() => void onAnalyze('summary')}
            >
              {t('actionHistoryAnalyzeSummary', '说说最近怎么用的')}
            </button>
            <button
              type="button"
              className="wb-trigger-btn"
              disabled={analyzeBusy}
              onClick={() => void onAnalyze('optimization')}
            >
              {t('actionHistoryAnalyzeOptimize', '有没有更好用法')}
            </button>
          </div>
          {analyzeText ? <pre className="ot-action-history-analyze-out">{analyzeText}</pre> : null}
          <div className="ot-action-history-chat">
            {chatLog.map((m, i) => (
              <div key={`${i}-${m.role}`} className={`ot-action-history-chat-msg is-${m.role}`}>
                {m.text}
              </div>
            ))}
          </div>
          <div className="ot-action-history-chat-input">
            <input
              type="text"
              value={chatInput}
              placeholder={t('actionHistoryChatPlaceholder', '问我：今天语音用了几次？哪个习惯最常用？')}
              disabled={analyzeBusy}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onChatSend();
              }}
            />
            <button
              type="button"
              className="wb-trigger-btn wb-trigger-btn-filled"
              disabled={analyzeBusy || !chatInput.trim()}
              onClick={() => void onChatSend()}
            >
              {t('actionHistoryChatSend', '发送')}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
