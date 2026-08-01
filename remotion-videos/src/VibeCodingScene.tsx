import { AbsoluteFill, interpolate, spring, useCurrentFrame } from "remotion";

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// ==========================================
// 玻璃反射 - 女性焦虑面容倒影
// ==========================================
const ScreenReflection = () => {
  const frame = useCurrentFrame();
  const flickerSpeed = frame * 0.08;

  // 倒影慢慢浮现
  const reflectionOpacity = interpolate(frame, [30, 80], [0, 0.6], {
    extrapolateRight: "clamp",
  });

  // 眼睛眨动效果
  const blinkCycle = Math.floor(frame / 60) % 3;
  const blinkProgress = (frame % 60) / 60;
  const eyeOpen = blinkCycle === 1 && blinkProgress > 0.1 && blinkProgress < 0.15 ? 0.1 : 1;

  // 呼吸感起伏
  const breathing = Math.sin(frame * 0.05) * 0.15;

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: 800,
        height: 480,
        borderRadius: 12,
        opacity: reflectionOpacity,
        overflow: "hidden",
        pointerEvents: "none",
        mixBlendMode: "overlay",
      }}
    >
      {/* 玻璃反光层 */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 30%, rgba(80,140,255,0.03) 100%)",
        }}
      />

      {/* 女性面部倒影 - 模糊但有情绪 */}
      <div
        style={{
          position: "absolute",
          top: "18%",
          left: "50%",
          transform: "translateX(-50%) translateY(0%) scaleY(0.7)",
          filter: "blur(3px)",
          opacity: 0.8,
        }}
      >
        {/* 脸部基色 - 受屏幕蓝光影响 */}
        <div
          style={{
            width: 120,
            height: 140,
            borderRadius: "60px 60px 50px 50px",
            background: "radial-gradient(ellipse at 50% 40%, rgba(180,160,200,0.4) 0%, rgba(120,100,150,0.3) 60%, rgba(80,60,120,0.2) 100%)",
          }}
        />

        {/* 眼睛 - 焦虑的眼神 */}
        <div style={{ position: "absolute", top: 35, left: 22, display: "flex", gap: 25 }}>
          {/* 左眼 */}
          <div style={{ position: "relative" }}>
            <div
              style={{
                width: 22,
                height: 10 * eyeOpen + 2,
                borderRadius: "50%",
                background: "rgba(200,220,255,0.6)",
                boxShadow: "0 0 8px rgba(100,150,255,0.5)",
                transition: "height 0.1s ease",
              }}
            />
            {/* 眼袋/疲惫感 */}
            <div
              style={{
                position: "absolute",
                bottom: -8,
                left: -3,
                width: 28,
                height: 6,
                borderRadius: "50%",
                background: "rgba(100,80,150,0.3)",
                filter: "blur(2px)",
              }}
            />
          </div>
          {/* 右眼 */}
          <div style={{ position: "relative" }}>
            <div
              style={{
                width: 22,
                height: 10 * eyeOpen + 2,
                borderRadius: "50%",
                background: "rgba(200,220,255,0.6)",
                boxShadow: "0 0 8px rgba(100,150,255,0.5)",
                transition: "height 0.1s ease",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: -8,
                right: -3,
                width: 28,
                height: 6,
                borderRadius: "50%",
                background: "rgba(100,80,150,0.3)",
                filter: "blur(2px)",
              }}
            />
          </div>
        </div>

        {/* 微蹙的眉头 - 焦虑感 */}
        <div style={{ position: "absolute", top: 28, left: 15, display: "flex", gap: 30 }}>
          <div style={{ width: 28, height: 2, background: "rgba(150,130,180,0.5)", borderRadius: 2, transform: "rotate(8deg)" }} />
          <div style={{ width: 28, height: 2, background: "rgba(150,130,180,0.5)", borderRadius: 2, transform: "rotate(-8deg)" }} />
        </div>

        {/* 紧抿的嘴唇 */}
        <div
          style={{
            position: "absolute",
            bottom: 25,
            left: "50%",
            transform: "translateX(-50%)",
            width: 35,
            height: 4,
            borderRadius: 2,
            background: "rgba(180,140,160,0.4)",
          }}
        />
      </div>

      {/* 肩膀轮廓 */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: 300,
          height: 80,
          background: "linear-gradient(0deg, rgba(60,50,80,0.2) 0%, transparent 100%)",
          borderRadius: "100px 100px 0 0",
        }}
      />

      {/* 顶部环境光反光条 */}
      <div
        style={{
          position: "absolute",
          top: 15,
          left: "10%",
          right: "10%",
          height: 1,
          background: "linear-gradient(90deg, transparent, rgba(200,180,255,0.3), transparent)",
        }}
      />
    </div>
  );
};

// ==========================================
// 手指敲击桌面特写
// ==========================================
const TappingFinger = () => {
  const frame = useCurrentFrame();
  const appearFrame = 60;

  // 出现动画
  const opacity = interpolate(frame, [appearFrame, appearFrame + 40], [0, 0.7], {
    extrapolateRight: "clamp",
  });

  // 敲击动画 - 烦躁地不规则敲击
  const tapPhase = (frame - appearFrame) % 25;
  const tapHeight = tapPhase < 5 ? 0 : interpolate(tapPhase, [5, 12, 20], [-4, 0, -2], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        bottom: 60,
        right: 380,
        opacity,
        transform: `translateY(${tapHeight}px)`,
        filter: "blur(1px)",
      }}
    >
      {/* 手指剪影 - 食指 */}
      <div
        style={{
          width: 18,
          height: 60,
          background: "linear-gradient(180deg, rgba(80,70,90,0.6) 0%, rgba(60,50,70,0.4) 100%)",
          borderRadius: "9px 9px 6px 6px",
        }}
      />
      {/* 指尖高光 */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: 14,
          height: 8,
          background: "rgba(150,140,170,0.3)",
          borderRadius: "50%",
        }}
      />
    </div>
  );
};

// ==========================================
// VS Code编辑器窗口
// ==========================================
const EditorWindow = () => {
  const frame = useCurrentFrame();
  const flicker = 0.97 + Math.sin(frame * 0.08) * 0.03;

  // 光标闪烁
  const blinkPhase = Math.sin(frame * 0.15);
  const cursorOpacity = interpolate(blinkPhase, [-1, 0, 1], [0.3, 1, 0.3]);

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: 800,
        height: 480,
        background: "#1e1e1e",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: `0 20px 80px rgba(0,0,0,0.6), 0 0 ${50 * flicker}px rgba(100,180,255,${0.1 * flicker})`,
        overflow: "hidden",
      }}
    >
      {/* 标题栏 */}
      <div
        style={{
          height: 32,
          background: "#323233",
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          gap: 8,
        }}
      >
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57" }} />
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ffbd2e" }} />
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#28ca42" }} />
        <span style={{
          marginLeft: 16,
          color: "rgba(255,255,255,0.5)",
          fontSize: 11,
          fontFamily: "Segoe UI, system-ui, sans-serif",
        }}>
          project-report.md - Visual Studio Code
        </span>
      </div>

      {/* 左侧边栏图标 */}
      <div style={{
        position: "absolute",
        left: 0,
        top: 32,
        bottom: 0,
        width: 48,
        background: "#333333",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 16,
        gap: 20,
      }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div
            key={i}
            style={{
              width: 24,
              height: 24,
              background: i === 0 ? "rgba(100,180,255,0.6)" : "rgba(255,255,255,0.3)",
              borderRadius: 2,
            }}
          />
        ))}
      </div>

      {/* 代码编辑区 */}
      <div style={{
        position: "absolute",
        left: 60,
        top: 40,
        right: 0,
        bottom: 0,
        padding: "16px 20px",
        fontFamily: "Consolas, monospace",
        fontSize: 15,
        lineHeight: 1.8,
      }}>
        {/* 行号 */}
        <div style={{
          position: "absolute",
          left: 0,
          top: 16,
          bottom: 0,
          width: 40,
          color: "rgba(255,255,255,0.25)",
          textAlign: "right",
          paddingRight: 12,
        }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(i => (
            <div key={i} style={{ height: 27 }}>{i}</div>
          ))}
        </div>

        {/* 代码内容 */}
        <div style={{ marginLeft: 30 }}>
          <div>
            <span style={{ color: "#569cd6" }}>#</span>
            <span style={{ color: "#dcdcaa" }}> 项目周报</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <span style={{ color: "#6a9955" }}>// 待完成：补充本周工作内容和下周计划...</span>
          </div>
          <div style={{ marginTop: 16 }}>
            <span style={{ color: "#569cd6" }}>##</span>
            <span style={{ color: "#dcdcaa" }}> 工作进展</span>
          </div>
          <div style={{ marginTop: 8, display: "flex", alignItems: "center" }}>
            <span style={{ color: "#c586c0" }}>-</span>
            <span style={{ color: "#d4d4d4", marginLeft: 6 }}> 完成了核心功能开发</span>
            <span style={{ color: "#9cdcfe" }}> TODO:</span>
          </div>
          <div style={{ marginTop: 4, display: "flex", alignItems: "center" }}>
            <span style={{ color: "#c586c0" }}>-</span>
            <span style={{ color: "#d4d4d4", marginLeft: 6 }}> 修复了性能问题</span>
          </div>
          <div style={{ marginTop: 4, display: "flex", alignItems: "center" }}>
            <span style={{ color: "#c586c0" }}>-</span>
            <span style={{ color: "#d4d4d4", marginLeft: 6 }}> 代码审查中...</span>
          </div>
          <div style={{ marginTop: 20 }}>
            <span style={{ color: "#569cd6" }}>##</span>
            <span style={{ color: "#dcdcaa" }}> 下周计划</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <span style={{ color: "#d4d4d4" }}>  </span>
            {/* 光标 */}
            <div
              style={{
                display: "inline-block",
                width: 3,
                height: 20,
                background: "#aeafad",
                verticalAlign: "middle",
                opacity: cursorOpacity,
                boxShadow: `0 0 ${6 * cursorOpacity}px rgba(174,175,173,${cursorOpacity * 0.5})`,
              }}
            />
          </div>
        </div>
      </div>

      {/* 底部状态栏 */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: 22,
        background: "#007acc",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 12px",
      }}>
        <span style={{ color: "#fff", fontSize: 11 }}>
          <span style={{ marginRight: 16 }}>main*</span>
          <span>Markdown</span>
        </span>
        <span style={{ color: "#fff", fontSize: 11 }}>Ln 12, Col 1</span>
      </div>
    </div>
  );
};

// ==========================================
// 聊天窗口 - Slack/微信风格
// ==========================================
const ChatWindow = () => {
  const frame = useCurrentFrame();
  const appearFrame = 40;

  return (
    <div
      style={{
        position: "absolute",
        top: 50,
        right: 80,
        width: 280,
        height: 200,
        background: "#2b2d30",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        opacity: interpolate(frame, [appearFrame, appearFrame + 35], [0, 0.9], { extrapolateRight: "clamp" }),
        transform: `translateY(${interpolate(frame, [appearFrame, appearFrame + 35], [15, 0], { extrapolateRight: "clamp" })}px)`,
      }}
    >
      {/* 聊天标题 */}
      <div style={{
        height: 36,
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        alignItems: "center",
        padding: "0 14px",
      }}>
        <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#5865f2", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "white", fontSize: 10, fontWeight: "bold" }}>团队</span>
        </div>
        <span style={{ color: "#fff", fontSize: 12, marginLeft: 10 }}>产品研发讨论组</span>
        <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.3)", fontSize: 11 }}>3条新消息</span>
      </div>

      {/* 消息列表 */}
      <div style={{ padding: "10px 14px" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#3ba55c", flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 10, color: "#3ba55c" }}>张小明</div>
            <div style={{ marginTop: 2, fontSize: 11, color: "#dcddde", background: "rgba(255,255,255,0.1)", padding: "5px 8px", borderRadius: 5, display: "inline-block" }}>
              周末前能发版吗？
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#faa61a", flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 10, color: "#faa61a" }}>李小红</div>
            <div style={{ marginTop: 2, fontSize: 11, color: "#dcddde", background: "rgba(255,255,255,0.1)", padding: "5px 8px", borderRadius: 5, display: "inline-block" }}>
              周报写完了吗？
            </div>
          </div>
        </div>
      </div>

      {/* 输入框 */}
      <div style={{
        position: "absolute",
        bottom: 10,
        left: 14,
        right: 14,
        height: 28,
        background: "#40444b",
        borderRadius: 5,
        display: "flex",
        alignItems: "center",
        paddingLeft: 10,
      }}>
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>回复消息...</span>
      </div>
    </div>
  );
};

// ==========================================
// 浏览器窗口 - Google搜索页
// ==========================================
const BrowserWindow = () => {
  const frame = useCurrentFrame();
  const appearFrame = 55;

  return (
    <div
      style={{
        position: "absolute",
        top: 80,
        left: 100,
        width: 320,
        height: 180,
        background: "#202124",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        opacity: interpolate(frame, [appearFrame, appearFrame + 35], [0, 0.85], { extrapolateRight: "clamp" }),
        transform: `translateY(${interpolate(frame, [appearFrame, appearFrame + 35], [10, 0], { extrapolateRight: "clamp" })}px)`,
      }}
    >
      {/* 浏览器标签栏 */}
      <div style={{
        height: 28,
        background: "#35363a",
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        display: "flex",
        alignItems: "flex-end",
        paddingLeft: 8,
      }}>
        <div style={{
          width: 100,
          height: 21,
          background: "#202124",
          borderTopLeftRadius: 5,
          borderTopRightRadius: 5,
          display: "flex",
          alignItems: "center",
          paddingLeft: 8,
        }}>
          <span style={{ color: "#e8eaed", fontSize: 10 }}>下周一出差机票...</span>
        </div>
      </div>

      {/* 搜索页面 */}
      <div style={{ padding: "12px 16px" }}>
        <div style={{
          fontSize: 20,
          color: "#fff",
          fontWeight: 500,
          marginBottom: 12,
          letterSpacing: 1.5,
          textAlign: "center",
        }}>
          <span style={{ color: "#4285f4" }}>G</span>
          <span style={{ color: "#ea4335" }}>o</span>
          <span style={{ color: "#fbbc05" }}>o</span>
          <span style={{ color: "#4285f4" }}>g</span>
          <span style={{ color: "#34a853" }}>l</span>
          <span style={{ color: "#ea4335" }}>e</span>
        </div>
        <div style={{
          width: "100%",
          height: 30,
          background: "#303134",
          borderRadius: 15,
          border: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          alignItems: "center",
          paddingLeft: 14,
        }}>
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>下周一北京到上海的机票...</span>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 咖啡杯 + 时钟特写
// ==========================================
const DeskDetails = () => {
  const frame = useCurrentFrame();
  const appearFrame = 25;
  const steamFlicker = Math.sin(frame * 0.06) * 0.3 + 0.7;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 80,
        left: 80,
        opacity: interpolate(frame, [appearFrame, appearFrame + 35], [0, 0.85], { extrapolateRight: "clamp" }),
      }}
    >
      {/* 咖啡杯 */}
      <div style={{ position: "relative" }}>
        {/* 蒸汽 */}
        <div style={{ display: "flex", gap: 5, paddingLeft: 18, marginBottom: -3, opacity: steamFlicker }}>
          {[0, 1, 2].map(i => (
            <div
              key={i}
              style={{
                width: 4,
                height: 22 + i * 6,
                background: "linear-gradient(to top, rgba(255,255,255,0.25), transparent)",
                borderRadius: 4,
              }}
            />
          ))}
        </div>

        {/* 杯子 */}
        <div style={{
          width: 50,
          height: 38,
          background: "linear-gradient(180deg, rgba(90,60,40,0.9) 0%, rgba(70,45,25,0.95) 100%)",
          borderRadius: "0 0 10px 10px",
          position: "relative",
        }} />

        {/* 杯柄 */}
        <div
          style={{
            position: "absolute",
            right: -12,
            top: 6,
            width: 16,
            height: 24,
            border: "3px solid rgba(100,70,50,0.85)",
            borderRadius: "0 10px 10px 0",
            borderLeft: "none",
          }}
        />
      </div>

      {/* 时间显示 - 深夜 */}
      <div style={{
        marginTop: 25,
        textAlign: "center",
      }}>
        <div style={{
          fontSize: 36,
          fontWeight: 300,
          color: "rgba(255,255,255,0.65)",
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
          letterSpacing: 3,
        }}>
          23:47
        </div>
        <div style={{
          fontSize: 12,
          color: "rgba(255,255,255,0.3)",
          marginTop: 4,
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
          letterSpacing: 1,
        }}>
          星期四
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 麦克风按钮放大高亮 - 痛点聚焦
// ==========================================
const MicButtonHighlight = () => {
  const frame = useCurrentFrame();
  const appearFrame = 70;
  const pulse = Math.sin((frame - appearFrame) * 0.07) * 0.3 + 0.7;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 90,
        right: 350,
        opacity: interpolate(frame, [appearFrame, appearFrame + 30], [0, 1], { extrapolateRight: "clamp" }),
      }}
    >
      {/* 聚光灯 */}
      <div
        style={{
          position: "absolute",
          top: -40,
          left: -40,
          width: 130,
          height: 130,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(100,180,255,${0.12 * pulse}) 0%, transparent 70%)`,
        }}
      />

      {/* 麦克风按钮 */}
      <div
        style={{
          width: 50,
          height: 50,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #0078d4 0%, #005a9e 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 0 ${25 * pulse}px rgba(0,120,212,${0.35 * pulse})`,
          border: "2px solid rgba(255,255,255,0.15)",
        }}
      >
        <span style={{ fontSize: 22 }}>🎤</span>
      </div>

      {/* 指向箭头和文字 */}
      <div style={{
        position: "absolute",
        top: 58,
        left: "50%",
        transform: "translateX(-50%)",
        textAlign: "center",
      }}>
        <div style={{
          fontSize: 14,
          color: "rgba(255,255,255,0.45)",
          marginBottom: 3,
        }}>↓</div>
        <div style={{
          fontSize: 10.5,
          color: "rgba(255,255,255,0.28)",
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
          whiteSpace: "nowrap",
        }}>
          每次说话都要找的按钮
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 主场景 - 深夜焦虑工作场景（5秒）
// ==========================================
export const VibeCodingScene = () => {
  const frame = useCurrentFrame();

  // 相机缓慢推进 - 5秒内完成
  const cameraProgress = interpolate(frame, [0, 150], [0, 1], {
    easing: easeInOut,
    extrapolateRight: "clamp",
  });
  const cameraZoom = 1 + cameraProgress * 0.08;
  const cameraY = cameraProgress * -12;

  // 5秒完整场景：0-150帧
  // 文本出现在第90帧左右
  const textProgress = interpolate(frame, [90, 130], [0, 1], { extrapolateRight: "clamp" });
  const textY = interpolate(textProgress, [0, 1], [20, 0]);

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {/* 背景渐变 - 深夜办公室氛围：蓝橙对比 */}
      <div
        style={{
          width: "100%",
          height: "100%",
          background: `
            radial-gradient(ellipse at 85% 10%, rgba(255,140,80,0.09) 0%, transparent 55%),
            radial-gradient(ellipse at 15% 85%, rgba(80,140,255,0.07) 0%, transparent 45%),
            linear-gradient(180deg, #080a0f 0%, #0b0e14 50%, #07090d 100%)
          `,
        }}
      />

      {/* 相机容器 */}
      <div
        style={{
          width: "100%",
          height: "100%",
          transform: `scale(${cameraZoom}) translateY(${cameraY}px)`,
          transformOrigin: "center center",
        }}
      >
        {/* 核心：VS Code编辑器窗口 */}
        <EditorWindow />

        {/* 玻璃反射 - 女性焦虑面容 */}
        <ScreenReflection />

        {/* 聊天窗口 */}
        <ChatWindow />

        {/* 浏览器窗口 */}
        <BrowserWindow />

        {/* 桌面细节：咖啡杯 + 时钟 */}
        <DeskDetails />

        {/* 焦躁敲击的手指 */}
        <TappingFinger />

        {/* 麦克风按钮聚焦 - 痛点 */}
        <MicButtonHighlight />
      </div>

      {/* 痛点抛出文字 - 在3秒左右出现 */}
      <div
        style={{
          position: "absolute",
          bottom: 70,
          left: "50%",
          transform: `translateX(-50%) translateY(${textY}px)`,
          opacity: textProgress,
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontSize: 38,
            fontWeight: 500,
            color: "#ffffff",
            margin: 0,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif",
            letterSpacing: 2,
            lineHeight: 1.4,
            textShadow: "0 4px 40px rgba(0,0,0,0.6)",
          }}
        >
          为什么开始说话
        </p>
        <p
          style={{
            fontSize: 38,
            fontWeight: 500,
            color: "rgba(255,255,255,0.6)",
            margin: "6px 0 0 0",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif",
            letterSpacing: 2,
            lineHeight: 1.4,
            textShadow: "0 4px 40px rgba(0,0,0,0.6)",
          }}
        >
          总要先找按钮？
        </p>
      </div>

      {/* 环境光层 - 右侧暖光、左侧冷光 */}
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: "35%",
          background: "linear-gradient(90deg, transparent 0%, rgba(255,180,100,0.035) 100%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: "25%",
          background: "linear-gradient(-90deg, transparent 0%, rgba(80,140,255,0.025) 100%)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
