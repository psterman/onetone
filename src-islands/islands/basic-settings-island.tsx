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
import { autostartGet, autostartSet, coachHudSetEnabled } from '../ipc/typedIpc';
import { cn } from '../lib/utils';

/* eslint-disable @typescript-eslint/no-explicit-any */
const w = window as any;
const OneToneI18n = () => w.OneToneI18n;
const OneToneState = () => w.OneToneState;
const OneToneConfigPersist = () => w.OneToneConfigPersist;
const OneToneAppThemePrefs = () => w.OneToneAppThemePrefs;
const OneToneAppAutostart = () => w.OneToneAppAutostart;
const OneToneAppStartMinimized = () => w.OneToneAppStartMinimized;
const OneToneAppCoachHud = () => w.OneToneAppCoachHud;
const OneToneAppHomeRuntime = () => w.OneToneAppHomeRuntime;
const bootstrapHooks = () => w.__vp_bootstrap_hooks__ || {};

function t(key: string): string {
  const i18n = OneToneI18n();
  return i18n && typeof i18n.t === 'function' ? i18n.t(key) : key;
}

type ThemeName = 'light' | 'dark';
type FontScale = 'sm' | 'md' | 'lg' | 'xl';
type Lang = 'zh' | 'en';

interface BasicState {
  theme: ThemeName;
  fontScale: FontScale;
  lang: Lang;
  autostart: boolean;
  startMinimized: boolean;
  coachHud: boolean;
  globalListen: boolean;
}

const FONT_SCALE_LABEL_KEY: Record<FontScale, string> = {
  sm: 'fontSizeSmaller',
  md: 'fontSizeStandard',
  lg: 'fontSizeLarger',
  xl: 'fontSizeXL',
};

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
    autostart: false, // 异步补全（cmd_autostart_get）
    startMinimized: !!(cfg && cfg.startMinimizedToTray),
    coachHud: !!(cfg && cfg.coachHudEnabled),
    globalListen: !(runtime && runtime.paused),
  };
}

export function BasicSettingsIsland(): JSX.Element {
  const [state, setState] = useState<BasicState>(() => readInitial());
  const [busy, setBusy] = useState(false);

  // autostart 是 Rust 端独立状态，需异步拉取初始值
  useEffect(() => {
    let alive = true;
    autostartGet()
      .then((v) => {
        if (alive) setState((s) => ({ ...s, autostart: !!v }));
      })
      .catch(() => {
        if (alive) setState((s) => ({ ...s, autostart: false }));
      });
    return () => {
      alive = false;
    };
  }, []);

  // mvp_init / cmd_ready / config reload 后重新拉取最新状态
  const refresh = useCallback(() => {
    setState(readInitial());
    autostartGet()
      .then((v) => setState((s) => ({ ...s, autostart: !!v })))
      .catch(() => {});
  }, []);
  useIslandRefresh(refresh);

  // ---- 写操作（复用既有 persist 流程）----
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

  // ---- 摘要 ----
  const launchValue = state.autostart ? t('basicSummaryLaunchAuto') : t('basicSummaryLaunchManual');
  const windowValue = state.startMinimized ? t('basicSummaryWindowTray') : t('basicSummaryWindowNormal');
  const styleValue = state.theme === 'dark' ? t('styleGraphiteName') : t('styleClearName');
  const langName = state.lang === 'en' ? t('langEn') : t('langZh');
  const langValue = `${langName} · ${t(FONT_SCALE_LABEL_KEY[state.fontScale])}`;

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
              <p className="pref-row-label" id="basicGlobalListenLabel">总开关</p>
              <p className="pref-row-desc" id="basicGlobalListenDesc">关闭后不会响应按键与语音唤起</p>
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
                <p className="pref-row-desc">在屏幕底部显示当前习惯的按键提示，成功唤起后短暂确认</p>
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
