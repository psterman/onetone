import {
  AbsoluteFill,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
} from "remotion";
import { VibeCodingScene } from "./VibeCodingScene";

// 工具函数 - 缓动和动画辅助
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

// Scene 2: 多种外设触发展示 - 2x3网格布局
const TriggerScene = () => {
  const frame = useCurrentFrame();

  // 场景淡入
  const fadeIn = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  // 外设列表
  const peripherals = [
    { name: "鼠标侧键", type: "mouse", emoji: "🖱️" },
    { name: "键盘热键", type: "keyboard", emoji: "⌨️" },
    { name: "蓝牙耳机", type: "headset", emoji: "🎧" },
    { name: "游戏手柄", type: "controller", emoji: "🎮" },
    { name: "触控条", type: "touchbar", emoji: "📱" },
    { name: "脚踏板", type: "footpedal", emoji: "🦶" },
  ];

  // 当前激活的外设索引，循环高亮
  const activeIndex = Math.floor(frame / 15) % peripherals.length;

  // 按键按下动画
  const triggerProgress = spring({
    frame: (frame % 15) - 3,
    fps: 30,
    config: { damping: 16, mass: 0.4, stiffness: 300 },
  });

  const glowIntensity = interpolate(triggerProgress, [0, 1], [0, 1]);

  return (
    <AbsoluteFill
      style={{
        background: "radial-gradient(ellipse at center, #1a1a2e 0%, #0a0a14 100%)",
        opacity: fadeIn,
      }}
    >
      {/* 标题 */}
      <div
        style={{
          position: "absolute",
          top: "10%",
          left: "50%",
          transform: "translateX(-50%)",
          textAlign: "center",
        }}
      >
        <p
          style={{
            color: "rgba(255,255,255,0.6)",
            fontSize: 20,
            fontWeight: 500,
            margin: 0,
            fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
            letterSpacing: 4,
          }}
        >
          六种外设 · 一键触发
        </p>
      </div>

      {/* 外设图标网格 2x3 */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gap: "45px 70px",
        }}
      >
        {peripherals.map((peripheral, index) => {
          const isActive = activeIndex === index;
          const baseOpacity = isActive ? 1 : 0.25;
          const scale = isActive ? 1.0 + triggerProgress * 0.15 : 0.85;
          const glow = isActive ? glowIntensity * 0.8 : 0;

          return (
            <div
              key={peripheral.type}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 16,
                opacity: baseOpacity,
                transform: `scale(${scale})`,
                transition: "all 0.15s ease",
              }}
            >
              {/* 图标容器 */}
              <div
                style={{
                  width: 90,
                  height: 90,
                  borderRadius: 22,
                  background: isActive
                    ? "radial-gradient(circle, rgba(0,122,255,0.35) 0%, rgba(0,122,255,0.12) 100%)"
                    : "rgba(255,255,255,0.04)",
                  border: isActive
                    ? "2px solid rgba(0,122,255,0.7)"
                    : "2px solid rgba(255,255,255,0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 42,
                  boxShadow: isActive
                    ? `0 0 ${30 + glow * 60}px rgba(0,122,255,${glow * 0.45})`
                    : "none",
                }}
              >
                {peripheral.emoji}
              </div>

              {/* 名称 */}
              <p
                style={{
                  fontSize: 16,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "#ffffff" : "rgba(255,255,255,0.4)",
                  margin: 0,
                  fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                  letterSpacing: 2,
                }}
              >
                {peripheral.name}
              </p>
            </div>
          );
        })}
      </div>

      {/* 底部提示 */}
      <div
        style={{
          position: "absolute",
          bottom: "15%",
          left: "50%",
          transform: "translateX(-50%)",
          textAlign: "center",
        }}
      >
        <p
          style={{
            color: "rgba(255,255,255,0.35)",
            fontSize: 16,
            fontWeight: 400,
            margin: 0,
            fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
            letterSpacing: 1.5,
          }}
        >
          按一下，即刻开始语音输入
        </p>
      </div>
    </AbsoluteFill>
  );
};

// Scene 3: OneTone 连接 - 品牌登场
const OneToneBridge = () => {
  const frame = useCurrentFrame();

  // 背景淡入
  const bgFade = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Logo 弹性入场
  const logoSpring = spring({
    frame: frame - 10,
    fps: 30,
    config: { damping: 14, mass: 0.6, stiffness: 160 },
  });

  const logoScale = interpolate(logoSpring, [0, 1], [0.4, 1]);
  const logoOpacity = interpolate(logoSpring, [0, 0.3, 1], [0, 0.7, 1]);
  const logoY = interpolate(logoSpring, [0, 1], [40, 0]);

  // 涟漪效果 - 层层向外
  const ripple1 = Math.max(0, frame - 20);
  const ripple2 = Math.max(0, frame - 32);
  const ripple3 = Math.max(0, frame - 44);

  const r1Size = interpolate(ripple1, [0, 40], [100, 600], { extrapolateRight: "clamp" });
  const r1Opacity = interpolate(ripple1, [0, 40], [0.7, 0], { extrapolateRight: "clamp" });

  const r2Size = interpolate(ripple2, [0, 40], [100, 700], { extrapolateRight: "clamp" });
  const r2Opacity = interpolate(ripple2, [0, 40], [0.6, 0], { extrapolateRight: "clamp" });

  const r3Size = interpolate(ripple3, [0, 40], [100, 800], { extrapolateRight: "clamp" });
  const r3Opacity = interpolate(ripple3, [0, 40], [0.5, 0], { extrapolateRight: "clamp" });

  // 状态指示灯 - 呼吸效果
  const pulseGlow = Math.sin((frame - 35) * 0.15) * 0.3 + 0.7;
  const statusOpacity = interpolate(frame, [40, 52], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at center, #0d1117 0%, #010409 100%)`,
        opacity: bgFade,
      }}
    >
      {/* 中心涟漪层 */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: r3Size,
            height: r3Size,
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            borderRadius: "50%",
            border: `2px solid rgba(0,122,255,${r3Opacity})`,
            opacity: r3Opacity,
          }}
        />
        <div
          style={{
            position: "absolute",
            width: r2Size,
            height: r2Size,
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            borderRadius: "50%",
            border: `2px solid rgba(88,86,214,${r2Opacity})`,
            opacity: r2Opacity,
          }}
        />
        <div
          style={{
            position: "absolute",
            width: r1Size,
            height: r1Size,
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            borderRadius: "50%",
            border: `3px solid rgba(0,122,255,${r1Opacity})`,
            boxShadow: `0 0 ${r1Size / 6}px rgba(0,122,255,${r1Opacity * 0.5})`,
            opacity: r1Opacity,
          }}
        />
      </div>

      {/* Logo 中心 */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: `translate(-50%, calc(-50% + ${logoY}px)) scale(${logoScale})`,
          opacity: logoOpacity,
        }}
      >
        {/* 发光晕 */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 320,
            height: 320,
            borderRadius: "50%",
            background: `radial-gradient(circle, rgba(0,122,255,${0.35 * pulseGlow}) 0%, transparent 70%)`,
            filter: "blur(25px)",
          }}
        />

        <img
          src={staticFile("onetone-icon-refined-1024.png")}
          alt="OneTone"
          style={{
            width: 180,
            height: 180,
            objectFit: "contain",
            filter: `drop-shadow(0 0 ${45 + pulseGlow * 15}px rgba(0,122,255,${0.6 + pulseGlow * 0.2}))`,
          }}
        />

        {/* 状态指示器 */}
        <div
          style={{
            position: "absolute",
            bottom: -60,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            opacity: statusOpacity,
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: "#34c759",
              boxShadow: `0 0 ${12 + pulseGlow * 15}px #34c759`,
            }}
          />
          <span
            style={{
              color: "rgba(255,255,255,0.8)",
              fontSize: 18,
              fontWeight: 500,
              fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
              letterSpacing: 3,
            }}
          >
            正在聆听
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 4: 语音输入效果展示 - 真实场景
const VoiceInputScene = () => {
  const frame = useCurrentFrame();

  // 背景淡入
  const bgFade = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  });

  // 输入框出现
  const inputAppear = interpolate(frame, [5, 20], [0, 1], {
    easing: easeOutCubic,
    extrapolateRight: "clamp",
  });

  // 语音波纹动画
  const wavePhase1 = Math.sin((frame - 15) * 0.2) * 0.5 + 0.5;
  const wavePhase2 = Math.sin((frame - 18) * 0.18) * 0.5 + 0.5;
  const wavePhase3 = Math.sin((frame - 22) * 0.22) * 0.5 + 0.5;

  // 真实工作生活场景的语音内容 - 更接地气
  const voiceContents = [
    { text: "帮我写一封会议邀请邮件，发给产品和设计团队", label: "工作场景" },
    { text: "帮我查一下明天从北京到上海的高铁票", label: "生活场景" },
    { text: "帮我写一份项目周报，总结本周的开发进度", label: "工作场景" },
    { text: "帮我推荐几个周末适合带家人去玩的地方", label: "生活场景" },
    { text: "帮我整理一下会议记录，提取重点和待办事项", label: "工作场景" },
  ];

  // 轮换展示不同场景
  const currentSceneIndex = Math.floor(frame / 35) % voiceContents.length;
  const currentContent = voiceContents[currentSceneIndex];

  // 逐字显示效果
  const typeSpeed = 1.8;
  const chars = currentContent.text.split("");
  const visibleChars = Math.min(
    Math.floor(((frame % 35) - 10) / typeSpeed),
    chars.length
  );

  // 场景标签淡入
  const labelOpacity = interpolate(frame, [15, 25], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: "radial-gradient(ellipse at center, #1a1a2e 0%, #0f0f1a 100%)",
        opacity: bgFade,
      }}
    >
      {/* 场景标签 */}
      <div
        style={{
          position: "absolute",
          top: "11%",
          left: "50%",
          transform: "translateX(-50%)",
          textAlign: "center",
        }}
      >
        <p
          style={{
            color: "rgba(255,255,255,0.5)",
            fontSize: 20,
            fontWeight: 500,
            margin: 0,
            fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
            letterSpacing: 3,
          }}
        >
          实时语音转文字
        </p>
      </div>

      {/* 中心输入框 */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: `translate(-50%, -50%) scale(${0.9 + inputAppear * 0.1})`,
          opacity: inputAppear,
          width: 820,
        }}
      >
        <div
          style={{
            background: "rgba(30,30,40,0.95)",
            borderRadius: 20,
            padding: "35px 40px",
            border: "1px solid rgba(0,122,255,0.35)",
            boxShadow:
              "0 20px 60px rgba(0,0,0,0.4), 0 0 40px rgba(0,122,255,0.15)",
          }}
        >
          {/* 语音波纹指示器 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              marginBottom: 28,
              height: 40,
            }}
          >
            <div
              style={{
                width: 4,
                height: 10 + wavePhase1 * 28,
                background: "rgba(52,199,89,0.9)",
                borderRadius: 2,
              }}
            />
            <div
              style={{
                width: 4,
                height: 10 + wavePhase2 * 28,
                background: "rgba(0,122,255,0.95)",
                borderRadius: 2,
              }}
            />
            <div
              style={{
                width: 4,
                height: 10 + wavePhase3 * 28,
                background: "rgba(88,86,214,0.9)",
                borderRadius: 2,
              }}
            />
            <div
              style={{
                width: 4,
                height: 10 + wavePhase2 * 28,
                background: "rgba(0,122,255,0.95)",
                borderRadius: 2,
              }}
            />
            <div
              style={{
                width: 4,
                height: 10 + wavePhase1 * 28,
                background: "rgba(52,199,89,0.9)",
                borderRadius: 2,
              }}
            />
          </div>

          {/* 正在输入的文字 */}
          <div
            style={{
              minHeight: 64,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
            }}
          >
            <span
              style={{
                fontSize: 26,
                fontWeight: 500,
                color: "#ffffff",
                fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif",
                letterSpacing: 0.5,
                lineHeight: 1.6,
              }}
            >
              {chars.slice(0, visibleChars).join("")}
              {/* 光标 */}
              <span
                style={{
                  opacity: Math.sin(frame * 0.3) > 0 ? 1 : 0.3,
                  color: "#007aff",
                  fontWeight: "bold",
                }}
              >
                |
              </span>
            </span>
          </div>

          {/* 场景类型标签 */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginTop: 24,
              opacity: labelOpacity,
            }}
          >
            <span
              style={{
                padding: "8px 20px",
                background: "rgba(0,122,255,0.15)",
                borderRadius: 14,
                color: "rgba(100,180,255,0.9)",
                fontSize: 14,
                fontWeight: 500,
                fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                letterSpacing: 1,
              }}
            >
              {currentContent.label}
            </span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 5: 品牌收尾 - 价值主张
const BrandOutro = () => {
  const frame = useCurrentFrame();

  // 背景淡入
  const bgFade = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Logo 优雅出现
  const logoProgress = interpolate(frame, [8, 28], [0, 1], {
    easing: easeOutCubic,
    extrapolateRight: "clamp",
  });
  const logoScale = interpolate(logoProgress, [0, 1], [0.7, 1]);
  const logoOpacity = logoProgress;

  // 品牌名
  const titleProgress = spring({
    frame: frame - 25,
    fps: 30,
    config: { damping: 16, mass: 0.5, stiffness: 140 },
  });
  const titleY = interpolate(titleProgress, [0, 1], [30, 0]);
  const titleOpacity = interpolate(titleProgress, [0, 0.3, 1], [0, 0.6, 1]);

  // 价值主张主文案
  const slogan1Opacity = interpolate(frame, [45, 62], [0, 1], {
    extrapolateRight: "clamp",
  });
  const slogan1Y = interpolate(frame, [45, 62], [25, 0], {
    extrapolateRight: "clamp",
  });

  // 支持场景
  const featuresOpacity = interpolate(frame, [58, 75], [0, 1], {
    extrapolateRight: "clamp",
  });
  const featuresY = interpolate(frame, [58, 75], [20, 0], {
    extrapolateRight: "clamp",
  });

  // 收尾口号 - 金色渐变
  const taglineOpacity = interpolate(frame, [72, 90], [0, 1], {
    extrapolateRight: "clamp",
  });
  const taglineY = interpolate(frame, [72, 90], [20, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: "radial-gradient(ellipse at center, #0a0a14 0%, #010108 10