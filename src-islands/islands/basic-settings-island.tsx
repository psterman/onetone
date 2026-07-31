// P5 — 基础设置 React 岛（挂载于 #settingsPanelBasic）
//
// 设计原则（见 docs/migration-react-islands.md P5）：
//  - 本岛独占 #settingsPanelBasic 子树；legacy 不得再 innerHTML / render 该子树。
//  - 读：theme/fontScale 取自 document 属性；lang 取自 OneToneI18n；autostart 取自
//    typed IPC；startMinimized/coachHud 取自 OneToneState.config；globalListen 取自 runtime.paused。
//  - 写：优先复用既有 persist 流程（OneToneAppThemePrefs.setTheme 等 / typed IPC / OneToneConfigPersist），
//    不重新发明保存逻辑。
//  - 不改动视觉：复用 legacy CSS 类名（basic-block / pref-row / toggle-switch / pref-segmented …），
//    但用 data-ot-* 属性替代 legacy 的 data-theme-pick / data-scale / data-lang-pick，
//    避免被 legacy applyTheme/applyFontScale/bindEvents 的全局选择器误命中。

import { useCallback, useEffect, useState } from 'react';
import { useIslandRefresh } from '../island-runtime';
import {
  autostartGet,
  autostartSet,
  coachHudSetEnabled,
  dataRootOpen,
  dataRootPick,
  dataRootReset,
  dataRootStatus,
  exportLogs,
  openPath,
  setVoiceEndCommitKey,
  type DataRootStatus,
} from '../ipc/typedIpc';
import { cn } from '../lib/utils';

/* eslint-disable @typescript-eslint/no-explicit-any */
const w = window as any;
const OneToneI18n = () => w.OneToneI18n;
const OneToneState = () => w.OneToneState;
const OneToneConfigPersist = () => w.OneToneConfigPersist;
const OneToneAppThemePrefs = () => w.OneToneAppThemePrefs;
const OneToneAppHomeRuntime = () => w.OneToneAppHomeRuntime;
const OneToneDebugAbout = () => w.OneToneDebugAbout;
const OneToneUpdate = () => w.OneToneUpdate;
const OneToneVoiceEnd = () => w.OneToneVoiceEnd;
const bootstrapHooks = () => w.__vp_bootstrap_hooks__ || {};

function t(key: string): string {
  const i18n = OneToneI18n();
  return i18n && typeof i18n.t === 'function' ? i18n.t(key) : key;
}

function toast(msg: string, kind?: string) {
  if (typeof w.__vp_toast__ === 'function') w.__vp_toast__(msg, kind);
  else if (w.OneToneAppToast && typeof w.OneToneAppToast.show === 'function') {
    w.OneToneAppToast.show(msg, kind);
  }
}

type ThemeName = 'light' | 'dark';
type FontScale = 'sm' | 'md' | 'lg' | 'xl';
type Lang = 'zh' | 'en';
type CommitKey = 'Enter' | 'Shift+Enter' | 'Ctrl+Enter';

interface BasicState {
  theme: ThemeName;
  fontScale: FontScale;
  lang: Lang;
  autostart: boolean;
  startMinimized: boolean;
  coachHud: boolean;
  globalListen: boolean;
  commitKey: CommitKey;
}

interface UpdateUi {
  phase: string;
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  error: string;
}

const FONT_SCALE_LABEL_KEY: Record<FontScale, string> = {
  sm: 'fontSizeSmaller',
  md: 'fontSizeStandard',
  lg: 'fontSizeLarger',
  xl: 'fontSizeXL',
};

const COMMIT_KEYS: CommitKey[] = ['Enter', 'Shift+Enter', 'Ctrl+Enter'];

function normalizeCommitKey(raw: unknown): CommitKey {
  const ve = OneToneVoiceEnd();
  if (ve && typeof ve.normalizeCommitKey === 'function') {
    const k = String(ve.normalizeCommitKey(raw) || 'Enter');
    if (k === 'Shift+Enter' || k === 'Ctrl+Enter') return k;
    return 'Enter';
  }
  const key = String(raw || '')
    .trim()
    .replace(/\s+/g, '');
  if (/^ctrl\+enter$/i.test(key) || /^control\+enter$/i.test(key)) return 'Ctrl+Enter';
  if (/^shift\+enter$/i.test(key)) return 'Shift+Enter';
  return 'Enter';
}

function readCommitKey(): CommitKey {
  const st = OneToneState();
  const cfg = st && st.state ? st.state.config : undefined;
  const ve = cfg && cfg.voiceEnd;
  return normalizeCommitKey(ve && (ve.commitKey || ve.commit_key));
}

function readUpdateUi(): UpdateUi {
  const st = OneToneState();
  const u = st && st.state && st.state.update ? st.state.update : {};
  return {
    phase: String(u.phase || 'idle'),
    available: !!u.available,
    currentVersion: String(u.currentVersion || u.current_version || ''),
    latestVersion: String(u.latestVersion || u.latest_version || ''),
    error: String(u.error || ''),
  };
}

function readInitial(): BasicState {
  const doc = document.documentElement;
  const theme: ThemeName = doc.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const fontScale = (doc.getAttribute('data-font-scale') as FontScale) || 'md';
  const i18n = OneToneI18n();
  const lang: Lang = (i18n && i18n.getLang && i18n.getLang()) === 'en' ? 'en' : 'zh';
  const st = OneToneState();
  const cfg = st && st.state ? st.state.config : undefined;
  const runtime = st && st.state ? st.state.runtime : undefined;
  return {
    theme,
    fontScale,
    lang,
    autostart: false,
    startMinimized: !!(cfg && cfg.startMinimizedToTray),
    coachHud: !!(cfg && cfg.coachHudEnabled),
    globalListen: !(runtime && runtime.paused),
    commitKey: readCommitKey(),
  };
}

function emptyDataRoot(): DataRootStatus {
  return {
    effectiveRoot: '',
    defaultRoot: '',
    isCustom: false,
    pointerPath: '',
    configPath: '',
    logsDir: '',
    restartRequired: false,
  };
}

export function BasicSettingsIsland(): JSX.Element {
  const [state, setState] = useState<BasicState>(() => readInitial());
  const [busy, setBusy] = useState(false);
  const [dataRoot, setDataRoot] = useState<DataRootStatus>(emptyDataRoot);
  const [updateUi, setUpdateUi] = useState<UpdateUi>(() => readUpdateUi());
  const [exportBusy, setExportBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    autostartGet()
      .then((v) => {
        if (alive) setState((s) => ({ ...s, autostart: !!v }));
      })
      .catch(() => {
        if (alive) setState((s) => ({ ...s, autostart: false }));
      });
    dataRootStatus()
      .then((s) => {
        if (alive) setDataRoot(s);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const refresh = useCallback(() => {
    setState(readInitial());
    setUpdateUi(readUpdateUi());
    autostartGet()
      .then((v) => setState((s) => ({ ...s, autostart: !!v })))
      .catch(() => {});
    dataRootStatus()
      .then(setDataRoot)
      .catch(() => {});
  }, []);
  useIslandRefresh(refresh);

  useEffect(() => {
    const onUpdate = () => setUpdateUi(readUpdateUi());
    window.addEventListener('mvp_update_state', onUpdate as EventListener);
    const id = window.setInterval(onUpdate, 1500);
    return () => {
      window.removeEventListener('mvp_update_state', onUpdate as EventListener);
      window.clearInterval(id);
    };
  }, []);

  const setTheme = useCallback((next: ThemeName) => {
    setState((s) => ({ ...s, theme: next }));
    const prefs = OneToneAppThemePrefs();
    if (prefs && typeof prefs.setTheme === 'function') prefs.setTheme(next);
  }, []);

  const setFontScale = useCallback((next: FontScale) => {
    setState((s) => ({ ...s, fontScale: next }));
    const prefs = OneToneAppThemePrefs();
    if (prefs && typeof prefs.setFontScale === 'function') prefs.setFontScale(next);
  }, []);

  const setLang = useCallback((next: Lang) => {
    setState((s) => ({ ...s, lang: next }));
    const h = bootstrapHooks();
    if (h.setAppLang) h.setAppLang(next);
    if (h.applyLang) h.applyLang();
  }, []);

  const toggleAutostart = useCallback(async () => {
    const next = !state.autostart;
    setState((s) => ({ ...s, autostart: next }));
    try {
      await autostartSet(next);
    } catch (err) {
      console.error('[basic-island] autostartSet failed', err);
      const cur = await autostartGet().catch(() => next);
      setState((s) => ({ ...s, autostart: !!cur }));
    }
  }, [state.autostart]);

  const toggleStartMinimized = useCallback(async () => {
    const next = !state.startMinimized;
    setState((s) => ({ ...s, startMinimized: next }));
    const st = OneToneState();
    const cfg = st && st.state ? st.state.config : undefined;
    const persist = OneToneConfigPersist();
    if (!cfg || !persist || typeof persist.saveAsync !== 'function') return;
    cfg.startMinimizedToTray = next;
    try {
      await persist.saveAsync();
    } catch (err) {
      console.error('[basic-island] startMinimized save failed', err);
      cfg.startMinimizedToTray = !next;
      setState((s) => ({ ...s, startMinimized: !next }));
    }
  }, [state.startMinimized]);

  const toggleCoachHud = useCallback(async () => {
    const next = !state.coachHud;
    setState((s) => ({ ...s, coachHud: next }));
    const st = OneToneState();
    const cfg = st && st.state ? st.state.config : undefined;
    if (cfg) cfg.coachHudEnabled = next;
    try {
      await coachHudSetEnabled(next);
    } catch (err) {
      console.error('[basic-island] coachHudSetEnabled failed', err);
      if (cfg) cfg.coachHudEnabled = !next;
      setState((s) => ({ ...s, coachHud: !next }));
    }
  }, [state.coachHud]);

  const toggleGlobalListen = useCallback(() => {
    setState((s) => ({ ...s, globalListen: !s.globalListen }));
    const rt = OneToneAppHomeRuntime();
    if (rt && typeof rt.toggleGlobalListen === 'function') rt.toggleGlobalListen();
  }, []);

  const onCommitKey = useCallback(async (key: CommitKey) => {
    setState((s) => ({ ...s, commitKey: key }));
    const ve = OneToneVoiceEnd();
    try {
      if (ve && typeof ve.setCommitKey === 'function') {
        await ve.setCommitKey(key);
      } else {
        await setVoiceEndCommitKey(key);
      }
    } catch (err) {
      console.error('[basic-island] setCommitKey failed', err);
      setState((s) => ({ ...s, commitKey: readCommitKey() }));
    }
  }, []);

  const onDataRootPick = useCallback(async () => {
    setBusy(true);
    try {
      const next = await dataRootPick();
      setDataRoot(next);
      if (next.restartRequired) toast(t('dataRootRestartHint') || '请重启 OneTone 使数据目录生效');
    } catch (err) {
      console.error('[basic-island] dataRootPick failed', err);
      toast(String(err), 'lite');
    } finally {
      setBusy(false);
    }
  }, []);

  const onDataRootOpen = useCallback(async () => {
    try {
      await dataRootOpen();
    } catch (err) {
      toast(String(err), 'lite');
    }
  }, []);

  const onDataRootReset = useCallback(async () => {
    setBusy(true);
    try {
      const next = await dataRootReset();
      setDataRoot(next);
      if (next.restartRequired) toast(t('dataRootRestartHint') || '请重启 OneTone 使数据目录生效');
    } catch (err) {
      toast(String(err), 'lite');
    } finally {
      setBusy(false);
    }
  }, []);

  const onExportDiag = useCallback(async () => {
    setExportBusy(true);
    try {
      const about = OneToneDebugAbout();
      if (about && typeof about.exportDiagnosticLogs === 'function') {
        await about.exportDiagnosticLogs();
        return;
      }
      const lines =
        w.OneToneAppGlobalError && Array.isArray(w.OneToneAppGlobalError.logLines)
          ? w.OneToneAppGlobalError.logLines.slice().reverse()
          : [];
      const res = await exportLogs(lines);
      if (res && res.path) {
        toast((t('exportLogsOk') || '已导出') + ' ' + res.path);
        if (res.dir) await openPath(res.dir).catch(() => {});
      }
    } catch (err) {
      toast((t('exportLogsFail') || '导出失败') + ': ' + String(err), 'lite');
    } finally {
      setExportBusy(false);
    }
  }, []);

  const onUpdateCheck = useCallback(async () => {
    const upd = OneToneUpdate();
    if (upd && typeof upd.check === 'function') {
      await upd.check(true);
      setUpdateUi(readUpdateUi());
      return;
    }
    toast(t('updateCheck') || '检查更新');
  }, []);

  const onUpdateInstall = useCallback(async () => {
    const upd = OneToneUpdate();
    if (upd && typeof upd.install === 'function') {
      await upd.install();
      setUpdateUi(readUpdateUi());
    }
  }, []);

  const launchValue = state.autostart ? t('basicSummaryLaunchAuto') : t('basicSummaryLaunchManual');
  const windowValue = state.startMinimized ? t('basicSummaryWindowTray') : t('basicSummaryWindowNormal');
  const styleValue = state.theme === 'dark' ? t('styleGraphiteName') : t('styleClearName');
  const langName = state.lang === 'en' ? t('langEn') : t('langZh');
  const langValue = `${langName} · ${t(FONT_SCALE_LABEL_KEY[state.fontScale])}`;

  let updateStatusText = t('updateIdle') || '未检查';
  if (updateUi.phase === 'checking') updateStatusText = t('updateChecking') || '正在检查…';
  else if (updateUi.phase === 'available' && updateUi.latestVersion) {
    updateStatusText = (t('updateAvailable') || '有新版本 {ver}').replace(
      '{ver}',
      updateUi.latestVersion,
    );
  } else if (updateUi.phase === 'downloading' || updateUi.phase === 'installing') {
    updateStatusText = t('updateInstalling') || '正在更新…';
  } else if (updateUi.phase === 'error') {
    updateStatusText = updateUi.error || t('updateError') || '检查失败';
  } else if (updateUi.phase === 'idle' && updateUi.currentVersion) {
    updateStatusText = t('updateUpToDate') || '已是最新';
  }

  return (
    <div className="ot-basic-content">
      <header className="pref-page-head basic-page-head">
        <div className="basic-page-head-row">
          <div className="basic-page-head-copy">
            <h3 className="pref-page-title">基础</h3>
            <p className="pref-page-subtitle" id="settingsPanelBasicDesc">
              {t('settingsPanelBasicDesc')}
            </p>
          </div>
          <p className="basic-save-hint" role="status">
            更改立即生效 · 仅保存在本机
          </p>
        </div>
      </header>

      <section className="basic-block basic-global-listen-block" aria-labelledby="basicGlobalListenLabel">
        <div className="basic-list-card">
          <div className="pref-row">
            <div className="pref-row-meta">
              <p className="pref-row-label" id="basicGlobalListenLabel">
                总开关
              </p>
              <p className="pref-row-desc" id="basicGlobalListenDesc">
                关闭后不会响应按键与语音唤起
              </p>
            </div>
            <div className="pref-row-control">
              <button
                type="button"
                className={cn('toggle-switch', state.globalListen && 'is-on')}
                role="switch"
                aria-checked={state.globalListen}
                aria-labelledby="basicGlobalListenLabel"
                onClick={toggleGlobalListen}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="basic-summary-grid" aria-label="基础设置摘要">
        <article className="basic-summary-card">
          <span className="basic-summary-label">启动方式</span>
          <strong className="basic-summary-value">{launchValue}</strong>
        </article>
        <article className="basic-summary-card">
          <span className="basic-summary-label">窗口方式</span>
          <strong className="basic-summary-value">{windowValue}</strong>
        </article>
        <article className="basic-summary-card">
          <span className="basic-summary-label">当前风格</span>
          <strong className="basic-summary-value">{styleValue}</strong>
        </article>
        <article className="basic-summary-card">
          <span className="basic-summary-label">语言与字体</span>
          <strong className="basic-summary-value">{langValue}</strong>
        </article>
      </section>

      <div className="basic-page-stack">
        <section className="basic-block" aria-labelledby="basicCommitKeyTitle">
          <div className="basic-block-head">
            <h4 className="basic-block-title" id="basicCommitKeyTitle">
              {t('basicCommitKeyTitle') || '发送确认键'}
            </h4>
            <p className="basic-block-desc">
              {t('basicCommitKeyDesc') || '仅影响语音结束后的发送确认，不影响习惯自动 Enter'}
            </p>
          </div>
          <div className="basic-list-card">
            <div className="pref-row">
              <div className="pref-row-meta">
                <p className="pref-row-label">{t('basicCommitKeyLabel') || '语音结束发送'}</p>
                <p className="pref-row-desc">
                  {t('basicCommitKeyHint') || '对应常见聊天软件的 Enter / Shift+Enter / Ctrl+Enter'}
                </p>
              </div>
              <div className="pref-row-control">
                <div className="pref-segmented is-wide" role="radiogroup" aria-label="commit key">
                  {COMMIT_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={cn('pref-segmented-btn', state.commitKey === key && 'is-active')}
                      aria-checked={state.commitKey === key}
                      onClick={() => void onCommitKey(key)}
                    >
                      {key}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="basic-block" aria-labelledby="basicDataRootTitle">
          <div className="basic-block-head">
            <h4 className="basic-block-title" id="basicDataRootTitle">
              {t('basicDataRootTitle') || '数据目录'}
            </h4>
            <p className="basic-block-desc">
              {t('basicDataRootDesc') || '配置与日志的存放位置；更改后需重启生效'}
            </p>
          </div>
          <div className="basic-list-card">
            <div className="pref-row" style={{ alignItems: 'flex-start' }}>
              <div className="pref-row-meta">
                <p className="pref-row-label">{t('basicDataRootCurrent') || '当前路径'}</p>
                <p className="pref-row-desc" style={{ wordBreak: 'break-all' }}>
                  {dataRoot.effectiveRoot || '—'}
                  {dataRoot.isCustom ? ` · ${t('basicDataRootCustom') || '自定义'}` : ''}
                  {dataRoot.restartRequired
                    ? ` · ${t('dataRootRestartHint') || '请重启生效'}`
                    : ''}
                </p>
              </div>
            </div>
            <div className="settings-page-actions about-actions" style={{ padding: '8px 12px 12px' }}>
              <button
                type="button"
                className="control-btn"
                disabled={busy}
                onClick={() => void onDataRootPick()}
              >
                {t('basicDataRootChange') || '更改文件夹'}
              </button>
              <button type="button" className="control-btn" onClick={() => void onDataRootOpen()}>
                {t('basicDataRootOpen') || '打开文件夹'}
              </button>
              <button
                type="button"
                className="control-btn"
                disabled={busy || !dataRoot.isCustom}
                onClick={() => void onDataRootReset()}
              >
                {t('basicDataRootReset') || '恢复默认'}
              </button>
            </div>
          </div>
        </section>

        <section className="basic-block" aria-labelledby="basicMaintTitle">
          <div className="basic-block-head">
            <h4 className="basic-block-title" id="basicMaintTitle">
              {t('basicMaintTitle') || '诊断与更新'}
            </h4>
            <p className="basic-block-desc">
              {t('basicMaintDesc') || '导出诊断包、检查程序更新'}
            </p>
          </div>
          <div className="basic-list-card">
            <div className="pref-row">
              <div className="pref-row-meta">
                <p className="pref-row-label">{t('basicExportDiagLabel') || '诊断包'}</p>
                <p className="pref-row-desc">
                  {t('basicExportDiagDesc') || '打包日志与脱敏配置，便于排查问题'}
                </p>
              </div>
              <div className="pref-row-control">
                <button
                  type="button"
                  className="control-btn"
                  disabled={exportBusy}
                  onClick={() => void onExportDiag()}
                >
                  {t('btnDevExportLog') || '导出诊断包'}
                </button>
              </div>
            </div>
            <div className="pref-row">
              <div className="pref-row-meta">
                <p className="pref-row-label">{t('basicUpdateLabel') || '程序更新'}</p>
                <p className="pref-row-desc">
                  {(t('basicUpdateVersion') || '当前 {ver}').replace(
                    '{ver}',
                    updateUi.currentVersion || '—',
                  )}
                  {' · '}
                  {updateStatusText}
                </p>
              </div>
              <div className="pref-row-control" style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="control-btn" onClick={() => void onUpdateCheck()}>
                  {t('btnAboutCheckUpdate') || '检查更新'}
                </button>
                {updateUi.available || updateUi.phase === 'available' ? (
                  <button
                    type="button"
                    className="control-btn"
                    onClick={() => void onUpdateInstall()}
                  >
                    {t('updateInstall') || '安装更新'}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="basic-block" aria-labelledby="basicCommonTitle">
          <div className="basic-block-head">
            <h4 className="basic-block-title">运行</h4>
            <p className="basic-block-desc">开机启动、托盘与按键提示</p>
          </div>
          <div className="basic-list-card">
            <div className="pref-row">
              <div className="pref-row-meta">
                <p className="pref-row-label">开机自启动</p>
                <p className="pref-row-desc">登录 Windows 后自动启动一声</p>
              </div>
              <div className="pref-row-control">
                <button
                  type="button"
                  className={cn('toggle-switch', state.autostart && 'is-on')}
                  role="switch"
                  aria-checked={state.autostart}
                  onClick={() => void toggleAutostart()}
                  disabled={busy}
                />
              </div>
            </div>
            <div className="pref-row">
              <div className="pref-row-meta">
                <p className="pref-row-label">启动后最小化到托盘</p>
                <p className="pref-row-desc">下次启动时隐藏主窗口，仅在托盘运行</p>
              </div>
              <div className="pref-row-control">
                <button
                  type="button"
                  className={cn('toggle-switch', state.startMinimized && 'is-on')}
                  role="switch"
                  aria-checked={state.startMinimized}
                  onClick={() => void toggleStartMinimized()}
                />
              </div>
            </div>
            <div className="pref-row">
              <div className="pref-row-meta">
                <p className="pref-row-label">按键提示条</p>
                <p className="pref-row-desc">
                  在屏幕底部显示当前习惯的按键提示，成功唤起后短暂确认
                </p>
              </div>
              <div className="pref-row-control">
                <button
                  type="button"
                  className={cn('toggle-switch', state.coachHud && 'is-on')}
                  role="switch"
                  aria-checked={state.coachHud}
                  onClick={() => void toggleCoachHud()}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="basic-block" aria-labelledby="prefSectionAppearance">
          <div className="basic-block-head">
            <h4 className="basic-block-title">外观</h4>
            <p className="basic-block-desc">主题色与组件语言保持统一，切换后立即生效</p>
          </div>
          <div className="basic-split-grid">
            <section className="basic-subcard" aria-labelledby="themeLabel">
              <div className="basic-subcard-head">
                <p className="pref-row-label">主题</p>
                <p className="pref-row-desc">仅本机保存，与应用窗口同步</p>
              </div>
              <div className="pref-row-control basic-subcard-control">
                <div className="pref-segmented" role="radiogroup" aria-labelledby="themeLabel">
                  <button
                    type="button"
                    className={cn('pref-segmented-btn', state.theme === 'dark' && 'is-active')}
                    data-ot-theme-pick="dark"
                    aria-checked={state.theme === 'dark'}
                    onClick={() => setTheme('dark')}
                  >
                    深色
                  </button>
                  <button
                    type="button"
                    className={cn('pref-segmented-btn', state.theme === 'light' && 'is-active')}
                    data-ot-theme-pick="light"
                    aria-checked={state.theme === 'light'}
                    onClick={() => setTheme('light')}
                  >
                    浅色
                  </button>
                </div>
              </div>
            </section>
            <section className="basic-subcard" aria-labelledby="styleLabel">
              <div className="basic-subcard-head">
                <p className="pref-row-label">风格</p>
                <p className="pref-row-desc">为界面选择具体视觉配色</p>
              </div>
              <div className="pref-row-control basic-subcard-control">
                <div className="pref-style-grid" role="radiogroup" aria-labelledby="styleLabel">
                  <button
                    type="button"
                    className={cn('pref-style-card', state.theme === 'light' && 'is-active')}
                    data-ot-style-pick="light"
                    aria-checked={state.theme === 'light'}
                    onClick={() => setTheme('light')}
                  >
                    <span className="pref-style-swatches" aria-hidden="true">
                      <span style={{ background: '#f9fbfd' }} />
                      <span style={{ background: '#2a9cc4' }} />
                      <span style={{ background: '#e6f7fc' }} />
                    </span>
                    <span className="pref-style-name">{t('styleClearName')}</span>
                    <span className="pref-style-desc">明亮浅色，青蓝强调色</span>
                  </button>
                  <button
                    type="button"
                    className={cn('pref-style-card', state.theme === 'dark' && 'is-active')}
                    data-ot-style-pick="dark"
                    aria-checked={state.theme === 'dark'}
                    onClick={() => setTheme('dark')}
                  >
                    <span className="pref-style-swatches" aria-hidden="true">
                      <span style={{ background: '#1a2436' }} />
                      <span style={{ background: '#5ec8e8' }} />
                      <span style={{ background: '#0f1419' }} />
                    </span>
                    <span className="pref-style-name">{t('styleGraphiteName')}</span>
                    <span className="pref-style-desc">中性深色，适合夜间使用</span>
                  </button>
                </div>
              </div>
            </section>
          </div>
        </section>

        <section className="basic-block" aria-labelledby="basicTextBlockTitle">
          <div className="basic-block-head">
            <h4 className="basic-block-title">文字与语言</h4>
            <p className="basic-block-desc">按你的阅读习惯调整字号与界面语言</p>
          </div>
          <div className="basic-split-grid">
            <section className="basic-subcard" aria-labelledby="fontSizeTitleText">
              <div className="basic-subcard-head">
                <p className="basic-subcard-kicker">字体</p>
                <p className="pref-row-label">字体大小</p>
                <p className="pref-row-desc">整体缩放，高分屏可选大档</p>
              </div>
              <div className="pref-row-control basic-subcard-control">
                <div
                  className="pref-segmented is-wide"
                  role="radiogroup"
                  aria-labelledby="fontSizeTitleText"
                >
                  {(['sm', 'md', 'lg', 'xl'] as FontScale[]).map((sc) => (
                    <button
                      key={sc}
                      type="button"
                      className={cn('pref-segmented-btn', state.fontScale === sc && 'is-active')}
                      data-ot-scale={sc}
                      aria-checked={state.fontScale === sc}
                      onClick={() => setFontScale(sc)}
                    >
                      {sc === 'sm' ? '更小' : sc === 'md' ? '标准' : sc === 'lg' ? '更大' : '特大'}
                    </button>
                  ))}
                </div>
              </div>
            </section>
            <section className="basic-subcard" aria-labelledby="langLabel">
              <div className="basic-subcard-head">
                <p className="basic-subcard-kicker">语言</p>
                <p className="pref-row-label">语言</p>
                <p className="pref-row-desc">仅影响界面文案，不影响语音识别</p>
              </div>
              <div className="pref-row-control basic-subcard-control">
                <div className="pref-segmented is-wide" role="radiogroup" aria-labelledby="langLabel">
                  <button
                    type="button"
                    className={cn('pref-segmented-btn', state.lang === 'en' && 'is-active')}
                    data-ot-lang-pick="en"
                    aria-checked={state.lang === 'en'}
                    onClick={() => setLang('en')}
                  >
                    English
                  </button>
                  <button
                    type="button"
                    className={cn('pref-segmented-btn', state.lang === 'zh' && 'is-active')}
                    data-ot-lang-pick="zh"
                    aria-checked={state.lang === 'zh'}
                    onClick={() => setLang('zh')}
                  >
                    简体中文
                  </button>
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </div>
  );
}

export default BasicSettingsIsland;
