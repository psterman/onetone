import * as React from 'react';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { useIslandRefresh } from '../island-runtime';
import * as vc from '../domain/voiceConfig';

function toast(msg: string): void {
  const ui = (window as unknown as { OneToneUi?: { toast?: (m: string) => void } }).OneToneUi;
  if (ui && typeof ui.toast === 'function') ui.toast(msg);
  else console.log('[voice-config-island]', msg);
}

type TabKey = 'wake' | 'cancel' | 'end';

const STRATEGIES: { key: string; label: string }[] = [
  { key: 'auto', label: '自动' },
  { key: 'resourceSaver', label: '省电' },
  { key: 'enhanced', label: '增强' },
];

function StrategySelector(): JSX.Element {
  const [strategy, setStrategy] = React.useState<string>(() => vc.getListeningStrategy());
  useIslandRefresh(() => setStrategy(vc.getListeningStrategy()));

  const apply = async (key: string): Promise<void> => {
    setStrategy(key);
    try {
      await vc.setListeningStrategy(key);
      const label = STRATEGIES.find((s) => s.key === key)?.label ?? key;
      toast('已保存监听策略：' + label);
    } catch {
      toast('保存失败，请重试');
    }
  };

  return (
    <div className="ot-vc-block">
      <div className="ot-vc-label">监听策略 / 引擎</div>
      <div className="ot-vc-seg" role="group" aria-label="监听策略">
        {STRATEGIES.map((s) => (
          <button
            key={s.key}
            type="button"
            className={cn('ot-vc-seg-btn', strategy === s.key ? 'is-active' : '')}
            aria-pressed={strategy === s.key}
            onClick={() => apply(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface PhraseManagerProps {
  title: string;
  placeholder: string;
  maxLength: number;
  getList: () => string[];
  onAdd: (phrase: string) => Promise<void>;
  onRemove: (phrase: string) => Promise<void>;
  minOne?: boolean;
  hint?: string;
}

function PhraseManager({
  title,
  placeholder,
  maxLength,
  getList,
  onAdd,
  onRemove,
  minOne,
  hint,
}: PhraseManagerProps): JSX.Element {
  const [items, setItems] = React.useState<string[]>(() => getList());
  const [draft, setDraft] = React.useState('');

  const refresh = React.useCallback(() => setItems(getList()), [getList]);
  useIslandRefresh(refresh);

  const doAdd = async (): Promise<void> => {
    const v = draft.trim();
    if (!v) return;
    if (items.some((x) => x.toLowerCase() === v.toLowerCase())) {
      toast('已存在该短语');
      return;
    }
    await onAdd(v);
    setDraft('');
    refresh();
  };

  const doRemove = async (p: string): Promise<void> => {
    if (minOne && items.length <= 1) {
      toast('至少保留一个短语');
      return;
    }
    await onRemove(p);
    refresh();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void doAdd();
    }
  };

  return (
    <div className="ot-phrase-block">
      <div className="ot-phrase-title">{title}</div>
      <div className="ot-phrase-add">
        <input
          className="ot-phrase-input"
          type="text"
          value={draft}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label={title}
        />
        <Button size="sm" onClick={() => void doAdd()}>
          + 添加
        </Button>
      </div>
      {hint ? <p className="ot-phrase-hint">{hint}</p> : null}
      {items.length === 0 ? (
        <p className="ot-phrase-empty">（暂无短语）</p>
      ) : (
        <div className="ot-phrase-tags" role="listbox">
          {items.map((p) => (
            <span className="ot-phrase-tag" key={p}>
              <span className="ot-phrase-tag-text">{p}</span>
              <button
                type="button"
                className="ot-phrase-tag-del"
                aria-label={'删除 ' + p}
                onClick={() => void doRemove(p)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function VoiceConfigIsland(): JSX.Element {
  const [tab, setTab] = React.useState<TabKey>('wake');

  return (
    <div className="ot-voice-config">
      <div className="ot-vc-head">语音配置（React 岛）</div>
      <StrategySelector />
      <div className="ot-vc-divider" />
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList>
          <TabsTrigger value="wake">唤醒词</TabsTrigger>
          <TabsTrigger value="cancel">取消词</TabsTrigger>
          <TabsTrigger value="end">结束词</TabsTrigger>
        </TabsList>

        <TabsContent value="wake">
          <PhraseManager
            title="唤醒词"
            placeholder="例如：嘿，电脑"
            maxLength={20}
            getList={vc.getWakePhrases}
            onAdd={async (p) => {
              await vc.setWakePhrases(vc.getWakePhrases().concat([p]));
            }}
            onRemove={async (p) => {
              await vc.setWakePhrases(vc.getWakePhrases().filter((x) => x !== p));
            }}
            minOne
            hint="说出此口令后开始听写。修改即时生效，切换引擎（SAPI/Vosk/KWS）时按当前引擎保存。"
          />
        </TabsContent>

        <TabsContent value="cancel">
          <PhraseManager
            title="取消词"
            placeholder="例如：不要了"
            maxLength={48}
            getList={vc.getCancelPhraseList}
            onAdd={async (p) => {
              await vc.addCancelPhrase(p);
            }}
            onRemove={async (p) => {
              await vc.removeCancelPhrase(p);
            }}
            hint="说出此词丢弃本轮输入。中/英文短语合并显示。"
          />
        </TabsContent>

        <TabsContent value="end">
          <PhraseManager
            title="结束词"
            placeholder="例如：就这样"
            maxLength={48}
            getList={vc.getEndPhraseList}
            onAdd={async (p) => {
              await vc.addEndPhrase(p);
            }}
            onRemove={async (p) => {
              await vc.removeEndPhrase(p);
            }}
            hint="说出此词停止录音并保留文本。中/英文短语合并显示。"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
