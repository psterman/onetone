import {
  AbsoluteFill,
  Img,
  Video,
  staticFile,
  interpolate,
  useCurrentFrame,
  Sequence,
} from "remotion";

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

// ============================================================
// 统一组件（PPT式：分层 / 快入 / 安全区 / 第一人称）
// ============================================================

// 大标题（"我"的独白）—— 底部安全区
const BigTitle = ({ text, startFrame, delay = 20, size = 50 }: {
  text: string;
  startFrame: number;
  delay?: number;
  size?: number;
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [startFrame, startFrame + delay], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut,
  });
  const y = interpolate(p, [0, 1], [24, 0]);
  const breathe = frame > startFrame + delay ? 1 + Math.sin(frame * 0.03) * 0.008 : 1;
  return (
    <div style={{
      position: "absolute", left: "50%", bottom: "11%",
      transform: `translateX(-50%) translateY(${y}px) scale(${breathe})`,
      opacity: p, textAlign: "center", width: "86%", zIndex: 30,
    }}>
      <div style={{
        fontSize: size, fontWeight: 600, color: "#fff",
        fontFamily: "Segoe UI, PingFang SC, sans-serif",
        letterSpacing: 3, lineHeight: 1.45,
        textShadow: "0 4px 40px rgba(0,0,0,0.8)",
      }}>{text}</div>
    </div>
  );
};

// 副文字
const SubTitle = ({ text, startFrame, delay = 20 }: { text: string; startFrame: number; delay?: number }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [startFrame, startFrame + delay], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut,
  });
  const y = interpolate(p, [0, 1], [14, 0]);
  return (
    <div style={{
      position: "absolute", left: "50%", bottom: "6.5%",
      transform: `translateX(-50%) translateY(${y}px)`,
      opacity: p, textAlign: "center", width: "86%", zIndex: 30,
    }}>
      <div style={{
        fontSize: 18, fontWeight: 400, color: "rgba(255,255,255,0.6)",
        fontFamily: "Segoe UI, PingFang SC, sans-serif", letterSpacing: 2,
      }}>{text}</div>
    </div>
  );
};

// 角落时钟
const CornerClock = ({ text, startFrame, delay = 30 }: { text: string; startFrame: number; delay?: number }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [startFrame, startFrame + delay], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut,
  });
  const scale = interpolate(p, [0, 1], [1.35, 1]);
  return (
    <div style={{
      position: "absolute", right: "8%", top: "16%",
      opacity: p, transform: `scale(${scale})`, textAlign: "right", zIndex: 20,
    }}>
      <div style={{
        fontSize: 100, fontWeight: 200, color: "#fff",
        fontFamily: "Segoe UI, sans-serif", letterSpacing: 4, lineHeight: 1,
        textShadow: "0 6px 50px rgba(0,0,0,0.7)",
      }}>{text}</div>
    </div>
  );
};

// 第一人称视角标签（画面顶部 - 模拟"我在看"）
const POVTag = ({ text, startFrame, delay = 18 }: { text: string; startFrame: number; delay?: number }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [startFrame, startFrame + delay], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut,
  });
  const y = interpolate(p, [0, 1], [-12, 0]);
  return (
    <div style={{
      position: "absolute", left: "50%", top: "7%",
      transform: `translateX(-50%) translateY(${y}px)`,
      opacity: p, zIndex: 30, pointerEvents: "none",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        background: "rgba(10,14,24,0.6)",
        backdropFilter: "blur(8px)",
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: 999,
        padding: "8px 18px",
        fontFamily: "Segoe UI, PingFang SC, sans-serif",
        boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
      }}>
        <span style={{ fontSize: 16 }}>👁️</span>
        <span style={{ fontSize: 15, color: "rgba(255,255,255,0.85)", letterSpacing: 1 }}>{text}</span>
      </div>
    </div>
  );
};

// 底部渐暗遮罩
const BottomShade = ({ intensity = 0.55 }: { intensity?: number }) => (
  <div style={{
    position: "absolute", left: 0, right: 0, bottom: 0, height: "34%",
    background: `linear-gradient(180deg, transparent 0%, rgba(0,0,0,${intensity}) 100%)`,
    zIndex: 15, pointerEvents: "none",
  }} />
);

// 顶部微暗（保证 POV 标签可读）
const TopShade = () => (
  <div style={{
    position: "absolute", left: 0, right: 0, top: 0, height: "16%",
    background: "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, transparent 100%)",
    zIndex: 14, pointerEvents: "none",
  }} />
);

// 场景淡入淡出（相对帧 0-89，每场景3秒）
const useSceneFade = (fade = 12) => {
  const frame = useCurrentFrame();
  const from = interpolate(frame, [0, fade], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const to = interpolate(frame, [90 - fade, 90], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return Math.min(from, to);
};

// ============================================================
// 场景① 深夜独白 (0-5s) — 视频：城市夜景
// ============================================================
const Scene1CityNight = () => {
  const frame = useCurrentFrame();
  const opacity = useSceneFade();
  // 固定缩放（无逐帧插值，彻底消除亚像素抖动）
  const zoom = 1.05;

  return (
    <AbsoluteFill style={{ opacity }}>
      {/* 城市夜景视频背景 */}
      <div style={{ position: "absolute", inset: "-6%", transform: `scale(${zoom})` }}>
        <Video
          muted
          loop
          src={staticFile("videos/city-night.mp4")}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(180deg, rgba(5,8,20,0.2) 0%, rgba(5,8,20,0.55) 100%)",
      }} />
      <TopShade />
      <BottomShade intensity={0.55} />

      {/* 第一人称：我在深夜加班，望向窗外 */}
      <POVTag text="我的深夜 · 第3天加班" startFrame={10} />
      <CornerClock text="23:47" startFrame={22} />
      <BigTitle text="晚上11:47，办公室只剩我一个" startFrame={42} size={46} />
      <SubTitle text="城市还没睡，我也还没走" startFrame={62} />
    </AbsoluteFill>
  );
};

// ============================================================
// 场景② 键盘战场 (5-10s) — 视频：键盘打字
// ============================================================
const Scene2Keyboard = () => {
  const frame = useCurrentFrame();
  const opacity = useSceneFade();
  // 固定缩放（无逐帧插值，彻底消除亚像素抖动）
  const zoom = 1.03;

  // 通知卡弹入（真实 IM 弹窗感）
  const np = interpolate(frame, [28, 48], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
  const ny = interpolate(np, [0, 1], [40, 0]);
  const shake = np > 0 && frame < 66 ? Math.sin((frame - 28) * 0.7) * (1 - np) * 9 : 0;

  // 光标脉冲（第一人称光标感）
  const cursorPulse = frame > 20 ? Math.sin(frame * 0.15) * 0.4 + 0.6 : 0;

  return (
    <AbsoluteFill style={{ opacity }}>
      {/* 键盘打字视频背景 */}
      <div style={{ position: "absolute", inset: "-6%", transform: `scale(${zoom})` }}>
        <Video
          muted
          loop
          src={staticFile("videos/typing-1781.mp4")}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(200deg, rgba(30,60,140,0.15) 0%, rgba(5,10,25,0.5) 100%)",
      }} />
      <TopShade />
      <BottomShade intensity={0.5} />

      {/* 第一人称：光标正在输入 */}
      <POVTag text="我 · 正在赶工" startFrame={8} />

      {/* 实时消息弹窗（真实 IM 风） */}
      <div
        style={{
          position: "absolute",
          right: "7%",
          top: "16%",
          width: 400,
          background: "rgba(32,35,42,0.95)",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.14)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          opacity: np,
          transform: `translateY(${ny}px) translateX(${shake}px)`,
          padding: "18px 20px",
          fontFamily: "Segoe UI, PingFang SC, sans-serif",
          zIndex: 25,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: "50%", background: "#f04747",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
          }}>🔴</div>
          <div>
            <div style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>产品研发群</div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>@我 · 23:41</div>
          </div>
          <div style={{
            marginLeft: "auto", background: "#f04747", borderRadius: 10,
            padding: "2px 9px", color: "#fff", fontSize: 12, fontWeight: 700,
          }}>紧急</div>
        </div>
        <div style={{ color: "#e8eaed", fontSize: 15, lineHeight: 1.6 }}>
          这个 bug 今晚必须修，明天上线！
        </div>
      </div>

      <BigTitle text="手上的活还没干完，群里又炸了" startFrame={44} size={46} />
      <SubTitle text="消息、Bug、需求……一起涌来" startFrame={62} />
    </AbsoluteFill>
  );
};

// ============================================================
// 场景③ 软件海 (10-15s) — 视频：办公桌 + 真实平台图标
// ============================================================
const Scene3MultiTask = () => {
  const frame = useCurrentFrame();
  const opacity = useSceneFade();

  // 软件轮播（真实图标 + 品牌色）
  // 真实品牌图标 + 更慢的轮播（每个停留2秒，观众看清）
  const apps = [
    { name: "微信", act: "回消息", icon: "icons/apps/wechat.svg", color: "#07C160" },
    { name: "钉钉", act: "看通知", icon: "icons/apps/dingtalk.svg", color: "#0089FF" },
    { name: "浏览器", act: "查资料", icon: "icons/apps/googlechrome.svg", color: "#4285F4" },
    { name: "WPS 表格", act: "填数据", icon: "icons/apps/wps.svg", color: "#E8332E" },
  ];
  // 慢速轮播：微信2秒(0-60帧)→钉钉1秒(60-90帧)
  const idx = frame < 60 ? 0 : 1;
  const nextApp = frame >= 60 && frame < 90;
  const flash = nextApp ? interpolate(frame, [60, 62], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  const showSw = interpolate(frame, [12, 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ opacity }}>
      {/* 办公视频背景 */}
      <div style={{ position: "absolute", inset: "-6%" }}>
        <Video
          muted
          loop
          src={staticFile("videos/office-4809.mp4")}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(180deg, rgba(10,15,30,0.3) 0%, rgba(5,8,18,0.55) 100%)",
      }} />
      <TopShade />
      <BottomShade intensity={0.5} />

      {/* 第一人称：我在来回切换 */}
      <POVTag text="我 · 同时应付所有群" startFrame={7} />

      {/* 中央：软件切换轮播（真实图标） */}
      <div
        style={{
          position: "absolute", left: "50%", top: "32%",
          transform: "translateX(-50%)", textAlign: "center",
          opacity: showSw, zIndex: 25,
        }}
      >
        <div style={{
          position: "absolute", left: "50%", top: "50%", width: 360, height: 360,
          transform: "translate(-50%, -50%)",
          background: `radial-gradient(circle, rgba(255,255,255,${0.16 * flash}) 0%, transparent 70%)`,
        }} />
        {/* 真实图标 */}
        <Img
          src={staticFile(apps[idx].icon)}
          style={{
            width: 92, height: 92, margin: "0 auto 14px",
            objectFit: "contain",
            filter: `drop-shadow(0 8px 24px ${apps[idx].color}66)`,
          }}
        />
        <div style={{
          fontSize: 54, fontWeight: 700, color: "#fff",
          fontFamily: "Segoe UI, PingFang SC, sans-serif",
          textShadow: "0 8px 50px rgba(0,0,0,0.8)",
        }}>{apps[idx].name}</div>
        <div style={{
          fontSize: 18, color: "rgba(255,255,255,0.65)", marginTop: 8,
          fontFamily: "Segoe UI, PingFang SC, sans-serif",
        }}>{apps[idx].act}</div>
      </div>

      <BigTitle text="微信、钉钉、浏览器，来回切了一晚" startFrame={24} size={42} />
      <SubTitle text="Alt+Tab 按到手抽筋" startFrame={44} />
    </AbsoluteFill>
  );
};

// ============================================================
// 场景④ 找不到入口 (9-12s) — 英雄场景：20个应用窗口乱入堆叠
// ============================================================

// 应用窗口数据（真实办公全场景 + 真实品牌图标）
const chaosApps = [
  { name: "微信", color: "#07C160", icon: "icons/apps/wechat.svg", left: "3%", top: "8%", rot: -7 },
  { name: "钉钉", color: "#0089FF", icon: "icons/apps/dingtalk.svg", left: "58%", top: "5%", rot: 6 },
  { name: "WPS", color: "#E8332E", icon: "icons/apps/wps.svg", left: "25%", top: "3%", rot: -4 },
  { name: "飞书", color: "#3370FF", icon: "icons/apps/feishu.svg", left: "76%", top: "12%", rot: 8 },
  { name: "企业微信", color: "#0F7BFF", icon: "icons/apps/wecom.svg", left: "11%", top: "33%", rot: 5 },
  { name: "QQ", color: "#12B7F5", icon: "icons/apps/tencentqq.svg", left: "68%", top: "38%", rot: -6 },
  { name: "腾讯文档", color: "#0066FF", icon: "icons/apps/tencentdocs.svg", left: "42%", top: "27%", rot: 4 },
  { name: "腾讯会议", color: "#0F5AE8", icon: "icons/apps/tencentmeeting.svg", left: "84%", top: "62%", rot: -8 },
  { name: "浏览器", color: "#4285F4", icon: "icons/apps/googlechrome.svg", left: "5%", top: "60%", rot: 7 },
  { name: "Word", color: "#2B579A", icon: "icons/apps/microsoftword.svg", left: "37%", top: "55%", rot: -5 },
  { name: "Excel", color: "#217346", icon: "icons/apps/microsoftexcel.svg", left: "57%", top: "70%", rot: 9 },
  { name: "PPT", color: "#B7472A", icon: "icons/apps/microsoftpowerpoint.svg", left: "21%", top: "74%", rot: -9 },
  { name: "剪映", color: "#1A1A1A", icon: "icons/apps/capcut.svg", left: "87%", top: "28%", rot: 10 },
  { name: "Photoshop", color: "#31A8FF", icon: "icons/apps/adobephotoshop.svg", left: "48%", top: "82%", rot: -3 },
  { name: "Notion", color: "#000000", icon: "icons/apps/notion.svg", left: "73%", top: "82%", rot: 3 },
  { name: "Obsidian", color: "#7C3AED", icon: "icons/apps/obsidian.svg", left: "32%", top: "86%", rot: -10 },
  { name: "Cursor", color: "#0A0A0A", icon: "icons/apps/cursor.svg", left: "13%", top: "84%", rot: 6 },
  { name: "DeepSeek", color: "#4D6BFE", icon: "icons/apps/deepseek.svg", left: "85%", top: "84%", rot: -5 },
  { name: "压缩包", color: "#F7B500", icon: "icons/apps/zip.svg", left: "54%", top: "15%", rot: 11 },
  { name: "TRAE", color: "#3B82F6", icon: "icons/apps/ttrae.svg", left: "39%", top: "39%", rot: -7 },
];

// 单个应用窗口（品牌图标 + 名称，高辨识度）
const ChaosAppWindow = ({ app, delay }: { app: (typeof chaosApps)[number]; delay: number }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [delay, delay + 9], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
  // 快速飞入：从远处缩放+旋转
  const scale = interpolate(p, [0, 1], [0.5, 1]);
  const rotate = interpolate(p, [0, 1], [app.rot + 25, app.rot]);
  // 出现时震动
  const shake = p > 0 && frame < delay + 18 ? Math.sin((frame - delay) * 1.3) * (1 - p) * 7 : 0;
  // 持续轻微晃动（烦躁感）
  const idleShake = frame > delay + 18 ? Math.sin(frame * 0.22 + delay * 0.7) * 1.6 : 0;
  // 内容线条
  const lines = [72, 88, 60];

  return (
    <div style={{
      position: "absolute",
      left: app.left,
      top: app.top,
      width: 205,
      height: 128,
      background: "rgba(24,27,34,0.94)",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.18)",
      boxShadow: "0 12px 32px rgba(0,0,0,0.55)",
      opacity: p,
      transform: `scale(${scale}) rotate(${rotate}deg) translateX(${shake + idleShake}px) translateY(${idleShake * 0.6}px)`,
      fontFamily: "Segoe UI, PingFang SC, sans-serif",
      overflow: "hidden",
      zIndex: 10 + Math.round(app.rot),
    }}>
      {/* 标题栏：品牌图标（白底圆垫）+ 应用名 */}
      <div style={{
        height: 38, background: app.color,
        display: "flex", alignItems: "center", gap: 8,
        padding: "0 10px",
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: 6,
          background: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <Img src={staticFile(app.icon)} style={{ width: 18, height: 18, objectFit: "contain" }} />
        </div>
        <span style={{
          fontSize: 14, fontWeight: 700, color: "#fff",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{app.name}</span>
        {/* 红点 */}
        <span style={{
          marginLeft: "auto", width: 9, height: 9, borderRadius: "50%",
          background: Math.sin(frame * 0.3 + delay) > 0 ? "#f5222d" : "transparent",
          flexShrink: 0,
        }} />
      </div>
      {/* 内容区：乱线条模拟界面 */}
      <div style={{ padding: "10px 11px" }}>
        <div style={{ width: "90%", height: 8, background: "rgba(255,255,255,0.2)", borderRadius: 3, marginBottom: 8 }} />
        {lines.map((w, i) => (
          <div key={i} style={{ width: `${w}%`, height: 7, background: "rgba(255,255,255,0.12)", borderRadius: 3, marginBottom: 6 }} />
        ))}
      </div>
    </div>
  );
};

const Scene4NoButton = () => {
  const frame = useCurrentFrame();
  const opacity = useSceneFade();
  const zoom = 1.04;
  const pulse = frame > 62 ? 1 + Math.sin(frame * 0.09) * 0.03 : 0.97;

  return (
    <AbsoluteFill style={{ opacity }}>
      {/* 人物办公视频背景（用已验证稳定的素材） */}
      <div style={{ position: "absolute", inset: "-6%", transform: `scale(${zoom})` }}>
        <Video
          muted
          loop
          src={staticFile("videos/screen-50748.mp4")}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
      <div style={{ position: "absolute", inset: 0, background: "rgba(5,8,18,0.6)" }} />
      <TopShade />
      <BottomShade intensity={0.6} />

      {/* 第一人称：所有软件一起涌来 */}
      <POVTag text="我 · 所有软件同时炸了" startFrame={4} />

      {/* 英雄场景：20个应用窗口快速乱入堆叠（每2帧弹入一个） */}
      {chaosApps.map((app, i) => (
        <ChaosAppWindow key={app.name} app={app} delay={4 + i * 2} />
      ))}

      {/* 中心焦点：好乱，找不到语音入口 */}
      <div style={{
        position: "absolute", left: "50%", top: "36%",
        transform: `translateX(-50%) scale(${pulse})`,
        opacity: interpolate(frame, [64, 78], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        textAlign: "center", zIndex: 30, width: "100%",
      }}>
        <div style={{
          fontSize: 52, fontWeight: 800, color: "#fff",
          fontFamily: "Segoe UI, PingFang SC, sans-serif",
          letterSpacing: 3, textShadow: "0 8px 60px rgba(0,0,0,0.95)",
          background: "rgba(10,14,24,0.72)",
          padding: "12px 44px", borderRadius: 999, display: "inline-block",
          border: "2px solid rgba(255,255,255,0.18)",
        }}>好乱…语音按钮到底在哪？</div>
      </div>

      {/* 底部解释 */}
      <div style={{
        position: "absolute", left: "50%", bottom: "11%",
        transform: "translateX(-50%)",
        opacity: interpolate(frame, [72, 84], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        textAlign: "center", zIndex: 30, width: "88%",
      }}>
        <div style={{
          fontSize: 17, color: "rgba(255,255,255,0.8)",
          fontFamily: "Segoe UI, PingFang SC, sans-serif", letterSpacing: 1,
          textShadow: "0 3px 20px rgba(0,0,0,0.9)",
        }}>20 个软件，语音入口被埋在每个角落</div>
      </div>
    </AbsoluteFill>
  );
};

// ============================================================
// 场景⑤ 灵魂提问 (12-15s) — 全新素材：电脑屏幕沉思
// ============================================================
const Scene5Ending = () => {
  const frame = useCurrentFrame();
  const opacity = useSceneFade();
  // 固定缩放（无逐帧插值，彻底消除亚像素抖动）
  const zoom = 1.03;

  const l1 = interpolate(frame, [12, 34], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
  const l1y = interpolate(l1, [0, 1], [20, 0]);
  const l2 = interpolate(frame, [36, 58], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
  const l2y = interpolate(l2, [0, 1], [20, 0]);
  const l3 = interpolate(frame, [58, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const dark = interpolate(frame, [66, 90], [0, 0.92], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ opacity }}>
      {/* 全新素材：城市夜景（呼应开头，结尾沉思收束） */}
      <div style={{ position: "absolute", inset: "-6%", transform: `scale(${zoom})` }}>
        <Video
          muted
          loop
          src={staticFile("videos/city-night.mp4")}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(180deg, rgba(5,10,25,0.4) 0%, rgba(3,6,15,0.8) 100%)",
      }} />
      <TopShade />

      {/* 第一人称：最后的自问 */}
      <POVTag text="深夜 · 我放下工作想了想" startFrame={8} />

      {/* 主文案 */}
      <div style={{
        position: "absolute", left: "50%", top: "34%",
        transform: "translateX(-50%)", textAlign: "center", width: "92%", zIndex: 30,
        fontFamily: "Segoe UI, PingFang SC, sans-serif",
      }}>
        <div style={{
          fontSize: 58, fontWeight: 600, color: "#fff",
          opacity: l1, transform: `translateY(${l1y}px)`,
          letterSpacing: 4, textShadow: "0 8px 60px rgba(0,0,0,0.8)",
        }}>为什么开始说话</div>
        <div style={{
          fontSize: 58, fontWeight: 600,
          color: "rgba(255,255,255,0.72)",
          opacity: l2, transform: `translateY(${l2y}px)`,
          letterSpacing: 4, marginTop: 16, textShadow: "0 8px 60px rgba(0,0,0,0.8)",
        }}>总要先找按钮？</div>
        <div style={{
          fontSize: 18, color: "rgba(255,255,255,0.4)", marginTop: 28,
          opacity: l3, letterSpacing: 3,
        }}>— 敬请期待 —</div>
      </div>

      {/* 结尾渐暗 */}
      <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${dark})` }} />
    </AbsoluteFill>
  );
};

// ============================================================
// 主场景：15秒第一人称故事（5个场景 × 3秒）
// ============================================================
export const VibeCodingScene = () => {
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Sequence from={0} durationInFrames={90}><Scene1CityNight /></Sequence>
      <Sequence from={90} durationInFrames={90}><Scene2Keyboard /></Sequence>
      <Sequence from={180} durationInFrames={90}><Scene3MultiTask /></Sequence>
      <Sequence from={270} durationInFrames={90}><Scene4NoButton /></Sequence>
      <Sequence from={360} durationInFrames={90}><Scene5Ending /></Sequence>
    </AbsoluteFill>
  );
};
