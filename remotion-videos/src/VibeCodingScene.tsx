import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const ScreenReflection = ({ visibleFrame }: { visibleFrame: number }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [visibleFrame, visibleFrame + 80], [0, 0.85], { extrapolateRight: "clamp" });
  const blinkCycle = Math.floor(frame / 45) % 3;
  const blinkProgress = (frame % 45) / 45;
  const eyeOpen = blinkCycle === 1 && blinkProgress > 0.08 && blinkProgress < 0.18 ? 0.05 : 1;
  const breathing = Math.sin(frame * 0.04) * 0.2;

  return (
    <div style={{
      position: "absolute",
      top: "42%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: 700,
      height: 500,
      borderRadius: 16,
      opacity,
      overflow: "hidden",
      pointerEvents: "none",
      zIndex: 50,
    }}>
      <div style={{
        position: "absolute",
        inset: 0,
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
      }} />
      <div style={{
        position: "absolute",
        top: "15%",
        left: "50%",
        transform: `translateX(-50%) translateY(${breathing}%) scaleY(0.65)`,
        filter: "blur(1.5px)",
      }}>
        <div style={{
          width: 160,
          height: 190,
          borderRadius: "80px 80px 60px 60px",
          background: "radial-gradient(ellipse at 50% 35%, rgba(200,180,220,0.5) 0%, rgba(140,120,170,0.4) 50%, rgba(100,80,140,0.3) 100%)",
          boxShadow: "0 0 60px rgba(100,140,255,0.15)",
        }} />
        <div style={{ position: "absolute", top: 55, left: 12, display: "flex", gap: 38 }}>
          <div style={{ position: "relative" }}>
            <div style={{
              width: 26,
              height: 12 * eyeOpen + 3,
              borderRadius: "50%",
              background: "rgba(220,240,255,0.7)",
              boxShadow: "0 0 12px rgba(100,150,255,0.4)",
              transition: "height 0.12s ease",
            }} />
            {eyeOpen > 0.5 && <div style={{
              position: "absolute",
              top: 2,
              left: 9,
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "rgba(80,100,140,0.8)",
            }} />}
            <div style={{
              position: "absolute",
              bottom: -12,
              left: -5,
              width: 36,
              height: 8,
              borderRadius: "50%",
              background: "rgba(120,100,170,0.35)",
              filter: "blur(3px)",
            }} />
          </div>
          <div style={{ position: "relative" }}>
            <div style={{
              width: 26,
              height: 12 * eyeOpen + 3,
              borderRadius: "50%",
              background: "rgba(220,240,255,0.7)",
              boxShadow: "0 0 12px rgba(100,150,255,0.4)",
              transition: "height 0.12s ease",
            }} />
            {eyeOpen > 0.5 && <div style={{
              position: "absolute",
              top: 2,
              left: 9,
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "rgba(80,100,140,0.8)",
            }} />}
            <div style={{
              position: "absolute",
              bottom: -12,
              right: -5,
              width: 36,
              height: 8,
              borderRadius: "50%",
              background: "rgba(120,100,170,0.35)",
              filter: "blur(3px)",
            }} />
          </div>
        </div>
        <div style={{ position: "absolute", top: 42, left: 5, display: "flex", gap: 38 }}>
          <div style={{ width: 34, height: 2.5, background: "rgba(160,140,190,0.55)", borderRadius: 2, transform: "rotate(10deg)" }} />
          <div style={{ width: 34, height: 2.5, background: "rgba(160,140,190,0.55)", borderRadius: 2, transform: "rotate(-10deg)" }} />
        </div>
        <div style={{
          position: "absolute",
          bottom: 32,
          left: "50%",
          transform: "translateX(-50%)",
          width: 44,
          height: 5,
          borderRadius: 3,
          background: "rgba(190,150,170,0.45)",
        }} />
      </div>
      <div style={{
        position: "absolute",
        bottom: 10,
        left: "50%",
        transform: "translateX(-50%)",
        width: 380,
        height: 100,
        background: "linear-gradient(0deg, rgba(70,60,95,0.25) 0%, transparent 100%)",
        borderRadius: "120px 120px 0 0",
      }} />
    </div>
  );
};

const TappingFinger = ({ startFrame }: { startFrame: number }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [startFrame, startFrame + 30], [0, 0.8], { extrapolateRight: "clamp" });
  const progress = Math.max(0, (frame - startFrame) / 150);
  const tapSpeed = interpolate(progress, [0, 1], [25, 12]);
  const tapPhase = ((frame - startFrame) % tapSpeed) / tapSpeed;
  const tapHeight = interpolate(tapPhase, [0, 0.3, 0.6, 1], [0, -8, 0, -3], { extrapolateRight: "clamp" });

  return (
    <div style={{
      position: "absolute",
      bottom: 70,
      right: 420,
      opacity,
      transform: `translateY(${tapHeight}px)`,
      zIndex: 60,
    }}>
      <div style={{ display: "flex", gap: 6 }}>
        <div style={{
          width: 16, height: 55,
          background: "linear-gradient(180deg, rgba(90,80,100,0.65) 0%, rgba(70,60,80,0.45) 100%)",
          borderRadius: "8px 8px 5px 5px",
        }} />
        <div style={{
          width: 16, height: 48,
          background: "linear-gradient(180deg, rgba(85,75,95,0.6) 0%, rgba(65,55,75,0.4) 100%)",
          borderRadius: "8px 8px 5px 5px",
          transform: "translateY(6px)",
        }} />
      </div>
    </div>
  );
};

const EditorWindow = () => {
  const frame = useCurrentFrame();
  const flicker = 0.97 + Math.sin(frame * 0.06) * 0.03;
  const blinkPhase = Math.sin(frame * 0.12);
  const cursorOpacity = interpolate(blinkPhase, [-1, 0, 1], [0.2, 1, 0.2]);
  const scrollOffset = interpolate(frame, [20, 280], [0, 80], { extrapolateRight: "clamp" });

  return (
    <div style={{
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: 780,
      height: 520,
      background: "#1e1e1e",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.12)",
      boxShadow: `0 25px 100px rgba(0,0,0,0.5), 0 0 ${40 * flicker}px rgba(100,180,255,${0.08 * flicker})`,
      overflow: "hidden",
      zIndex: 10,
    }}>
      <div style={{
        height: 35,
        background: "#252526",
        display: "flex",
        alignItems: "center",
        padding: "0 10px",
        gap: 3,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57", marginRight: 4 }} />
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ffbd2e" }} />
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#28ca42" }} />
        <div style={{ marginLeft: 12, display: "flex", gap: 2 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              padding: "4px 12px",
              background: i === 0 ? "#1e1e1e" : "#2d2d30",
              borderRadius: "4px 4px 0 0",
              color: i === 0 ? "#ccc" : "#858585",
              fontSize: 11,
            }}>
              {["project-report.md", "feature.tsx", "config.json"][i]}
            </div>
          ))}
        </div>
      </div>
      <div style={{
        position: "absolute",
        left: 0,
        top: 35,
        bottom: 0,
        width: 52,
        background: "#333333",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 14,
        gap: 18,
      }}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} style={{
            width: 24, height: 24,
            background: i === 0 ? "rgba(100,180,255,0.6)" : "rgba(255,255,255,0.2)",
            borderRadius: 2,
            borderLeft: i === 0 ? "2px solid #007acc" : "none",
          }} />
        ))}
      </div>
      <div style={{
        position: "absolute",
        left: 60,
        top: 40,
        right: 0,
        bottom: 0,
        padding: "16px 20px",
        fontFamily: "Consolas, monospace",
        fontSize: 14.5,
        lineHeight: 1.85,
        transform: `translateY(-${scrollOffset}px)`,
      }}>
        <div style={{
          position: "absolute",
          left: 0,
          top: 16,
          bottom: 0,
          width: 44,
          color: "rgba(255,255,255,0.22)",
          textAlign: "right",
          paddingRight: 10,
        }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(i => (
            <div key={i} style={{ height: 27 }}>{i}</div>
          ))}
        </div>
        <div style={{ marginLeft: 32 }}>
          <div><span style={{ color: "#569cd6" }}>#</span> <span style={{ color: "#dcdcaa" }}>项目周报</span></div>
          <div style={{ marginTop: 6 }}><span style={{ color: "#6a9955" }}>// TODO: 补充本周工作内容</span></div>
          <div style={{ marginTop: 12 }}><span style={{ color: "#569cd6" }}>##</span> <span style={{ color: "#dcdcaa" }}> 工作进展</span></div>
          <div style={{ marginTop: 6 }}>
            <span style={{ color: "#c586c0" }}>-</span>
            <span style={{ color: "#d4d4d4", marginLeft: 6 }}> 完成核心功能开发</span>
            <span style={{ color: "#9cdcfe" }}> // 需要补充细节...</span>
          </div>
          <div style={{ marginTop: 3 }}>
            <span style={{ color: "#c586c0" }}>-</span>
            <span style={{ color: "#d4d4d4", marginLeft: 6 }}> 修复性能问题</span>
            <span style={{ color: "#ffd700" }}> // 还有bug待修复</span>
          </div>
          <div style={{ marginTop: 3 }}>
            <span style={{ color: "#c586c0" }}>-</span>
            <span style={{ color: "#d4d4d4", marginLeft: 6 }}> 代码审查进行中...</span>
          </div>
          <div style={{ marginTop: 3 }}>
            <span style={{ color: "#c586c0" }}>-</span>
            <span style={{ color: "#d4d4d4", marginLeft: 6 }}> 文档未完成</span>
            <span style={{ color: "#f44747" }}> // 紧急！</span>
          </div>
          <div style={{ marginTop: 14 }}><span style={{ color: "#569cd6" }}>##</span> <span style={{ color: "#dcdcaa" }}> 下周计划</span></div>
          <div style={{ marginTop: 6 }}><span style={{ color: "#808080" }}>// 待补充...</span></div>
          <div style={{ marginTop: 3 }}><span style={{ color: "#808080" }}>// 待补充...</span></div>
          <div style={{ marginTop: 6 }}>
            <div style={{
              display: "inline-block",
              width: 3, height: 20,
              background: "#aeafad",
              verticalAlign: "middle",
              opacity: cursorOpacity,
              boxShadow: `0 0 ${6 * cursorOpacity}px rgba(174,175,173,${cursorOpacity * 0.5})`,
            }} />
          </div>
        </div>
      </div>
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
        fontSize: 10.5,
        color: "#fff",
      }}>
        <span>Ln 12, Col 1</span>
        <span>TypeScript</span>
      </div>
    </div>
  );
};

const ChatWindow = ({ startFrame, position = "right" }: { startFrame: number, position?: "left" | "right" }) => {
  const frame = useCurrentFrame();
  const isRight = position === "right";
  const opacity = interpolate(frame, [startFrame, startFrame + 45], [0, 0.92], { extrapolateRight: "clamp" });
  const yOffset = interpolate(frame, [startFrame, startFrame + 45], [25, 0], { extrapolateRight: "clamp" });
  const notificationBlink = Math.sin((frame - startFrame) * 0.15) > 0;
  const hasNewMessage = frame > startFrame + 80 && notificationBlink;

  return (
    <div style={{
      position: "absolute",
      top: isRight ? 45 : 55,
      [isRight ? "right" : "left"]: isRight ? 60 : 60,
      width: 240,
      height: 170,
      background: "#36393f",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.1)",
      boxShadow: "0 10px 40px rgba(0,0,0,0.45)",
      opacity,
      transform: `translateY(${yOffset}px)`,
      zIndex: isRight ? 30 : 28,
    }}>
      <div style={{
        height: 38,
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        background: "#2f3136",
        borderRadius: "10px 10px 0 0",
      }}>
        <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#7289da", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "white", fontSize: 10, fontWeight: "bold" }}>团</span>
        </div>
        <span style={{ color: "#dcddde", fontSize: 11.5, marginLeft: 8 }}>产品研发群</span>
        {hasNewMessage && (
          <div style={{
            marginLeft: "auto",
            width: 18, height: 18,
            borderRadius: "50%",
            background: "#f04747",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: 10,
            fontWeight: "bold",
          }}>3</div>
        )}
      </div>
      <div style={{ padding: "8px 12px" }}>
        {[
          { name: "张小明", msg: "周末前能发版吗？", color: "#43b581" },
          { name: "李小红", msg: "周报写完了吗？", color: "#faa61a" },
          { name: "王经理", msg: "客户又提需求了", color: "#f04747" },
        ].map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 9.5, color: item.color }}>{item.name}</div>
              <div style={{
                marginTop: 1,
                fontSize: 10.5,
                color: "#dcddde",
                background: "rgba(255,255,255,0.08)",
                padding: "4px 7px",
                borderRadius: 5,
                display: "inline-block",
              }}>{item.msg}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{
        position: "absolute",
        bottom: 8,
        left: 10,
        right: 10,
        height: 28,
        background: "#40444b",
        borderRadius: 5,
        display: "flex",
        alignItems: "center",
        paddingLeft: 10,
      }}>
        <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>回复消息...</span>
      </div>
    </div>
  );
};

const BrowserWindow = ({ startFrame }: { startFrame: number }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [startFrame, startFrame + 50], [0, 0.88], { extrapolateRight: "clamp" });
  const yOffset = interpolate(frame, [startFrame, startFrame + 50], [20, 0], { extrapolateRight: "clamp" });

  return (
    <div style={{
      position: "absolute",
      top: 90,
      right: 70,
      width: 290,
      height: 165,
      background: "#202124",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.1)",
      boxShadow: "0 10px 35px rgba(0,0,0,0.45)",
      opacity,
      transform: `translateY(${yOffset}px)`,
      zIndex: 25,
    }}>
      <div style={{
        height: 30,
        background: "#35363a",
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        display: "flex",
        alignItems: "flex-end",
        paddingLeft: 8,
        gap: 2,
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: i === 0 ? 90 : 60,
            height: 20,
            background: "#202124",
            borderTopLeftRadius: 5,
            borderTopRightRadius: 5,
            display: "flex",
            alignItems: "center",
            paddingLeft: 8,
            fontSize: 9.5,
            color: i === 0 ? "#e8eaed" : "#80868b",
          }}>
            {["下周一机票", "Stack Overflow", "GitHub"][i]}
          </div>
        ))}
      </div>
      <div style={{ padding: "10px 14px" }}>
        <div style={{
          fontSize: 18,
          color: "#fff",
          fontWeight: 500,
          marginBottom: 10,
          textAlign: "center",
          letterSpacing: 1,
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
          height: 28,
          background: "#303134",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          alignItems: "center",
          paddingLeft: 12,
        }}>
          <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 10 }}>下周一北京到上海机票...</span>
        </div>
      </div>
    </div>
  );
};

const TerminalWindow = ({ startFrame }: { startFrame: number }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [startFrame, startFrame + 40], [0, 0.85], { extrapolateRight: "clamp" });
  const yOffset = interpolate(frame, [startFrame, startFrame + 40], [15, 0], { extrapolateRight: "clamp" });
  const logLines = Math.min(Math.floor((frame - startFrame - 40) / 8) + 1, 5);

  return (
    <div style={{
      position: "absolute",
      bottom: 80,
      left: 70,
      width: 220,
      height: 130,
      background: "#0d1117",
      borderRadius: 8,
      border: "1px solid rgba(255,255,255,0.12)",
      boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
      opacity,
      transform: `translateY(${yOffset}px)`,
      zIndex: 32,
    }}>
      <div style={{
        height: 28,
        background: "#161b22",
        borderRadius: "8px 8px 0 0",
        display: "flex",
        alignItems: "center",
        padding: "0 10px",
        gap: 6,
      }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ffbd2e" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#28ca42" }} />
        <span style={{ color: "#8b949e", fontSize: 10, marginLeft: 10 }}>Terminal</span>
      </div>
      <div style={{
        padding: "8px 10px",
        fontFamily: "monospace",
        fontSize: 10,
        color: "#c9d1d9",
        lineHeight: 1.5,
      }}>
        <div style={{ color: "#58a6ff" }}>$ npm run build</div>
        {logLines > 0 && <div style={{ color: "#8b949e" }}>Compiling...</div>}
        {logLines > 1 && <div style={{ color: "#d29922" }}>warn: bundle size exceeds limit</div>}
        {logLines > 2 && <div style={{ color: "#8b949e" }}>Processing modules...</div>}
        {logLines > 3 && <div style={{ color: "#f85149" }}>error: type mismatch found!</div>}
        {logLines > 4 && <div style={{ color: "#58a6ff", marginTop: 2 }}>$ █</div>}
      </div>
    </div>
  );
};

const NotificationWindow = ({ startFrame }: { startFrame: number }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [startFrame, startFrame + 35], [0, 0.8], { extrapolateRight: "clamp" });
  const yOffset = interpolate(frame, [startFrame, startFrame + 35], [10, 0], { extrapolateRight: "clamp" });

  return (
    <div style={{
      position: "absolute",
      top: 65,
      left: 80,
      width: 200,
      height: 100,
      background: "linear-gradient(135deg, #5865f2 0%, #7289da 100%)",
      borderRadius: 10,
      boxShadow: "0 8px 25px rgba(88,101,242,0.4)",
      opacity,
      transform: `translateY(${yOffset}px)`,
      zIndex: 35,
    }}>
      <div style={{ padding: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 16 }}>📧</span>
          <span style={{ color: "white", fontSize: 11.5, fontWeight: 600 }}>新邮件通知</span>
        </div>
        <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 10.5, marginBottom: 4 }}>
          王经理 - 紧急任务变更
        </div>
        <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 10 }}>
          "请在今晚之前务必完成..."
        </div>
      </div>
    </div>
  );
};

const CalendarPopup = ({ startFrame }: { startFrame: number }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [startFrame, startFrame + 30], [0, 0.75], { extrapolateRight: "clamp" });
  const yOffset = interpolate(frame, [startFrame, startFrame + 30], [8, 0], { extrapolateRight: "clamp" });

  return (
    <div style={{
      position: "absolute",
      top: 180,
      right: 55,
      width: 180,
      height: 95,
      background: "#1a1a2e",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.1)",
      boxShadow: "0 8px 25px rgba(0,0,0,0.45)",
      opacity,
      transform: `translateY(${yOffset}px)`,
      zIndex: 22,
    }}>
      <div style={{
        height: 28,
        background: "#16213e",
        borderRadius: "10px 10px 0 0",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 12px",
      }}>
        <span style={{ color: "#e94560", fontSize: 11, fontWeight: 600 }}>📅 明天</span>
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}>3个会议</span>
      </div>
      <div style={{ padding: "8px 12px" }}>
        <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 10, marginBottom: 4 }}>
          09:00 项目周会
        </div>
        <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 10, marginBottom: 4 }}>
          14:00 客户演示
        </div>
        <div style={{ color: "#e94560", fontSize: 10 }}>
          18:30 紧急代码审查
        </div>
      </div>
    </div>
  );
};

const DeskDetails = () => {
  const frame = useCurrentFrame();
  const appearFrame = 0;
  const steamFlicker = Math.sin(frame * 0.05) * 0.3 + 0.7;
  const opacity = interpolate(frame, [appearFrame, appearFrame + 25], [0, 0.9], { extrapolateRight: "clamp" });

  return (
    <div style={{
      position: "absolute",
      bottom: 60,
      left: 50,
      opacity,
      zIndex: 40,
    }}>
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", gap: 4, paddingLeft: 15, marginBottom: -2, opacity: steamFlicker }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 5,
              height: 28 + i * 8 + Math.sin(frame * (0.08 + i * 0.02)) * 4,
              background: "linear-gradient(to top, rgba(255,255,255,0.22), transparent)",
              borderRadius: 4,
            }} />
          ))}
        </div>
        <div style={{
          width: 58,
          height: 42,
          background: "linear-gradient(180deg, rgba(100,70,50,0.95) 0%, rgba(80,55,35,0.9) 100%)",
          borderRadius: "0 0 12px 12px",
          position: "relative",
          boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
        }} />
        <div style={{
          position: "absolute",
          right: -14,
          top: 5,
          width: 18,
          height: 28,
          border: "3px solid rgba(110,80,60,0.9)",
          borderRadius: "0 14px 14px 0",
          borderLeft: "none",
        }} />
      </div>
      <div style={{ marginTop: 20, textAlign: "center" }}>
        <div style={{
          fontSize: 40,
          fontWeight: 300,
          color: "rgba(255,255,255,0.75)",
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
          letterSpacing: 3,
          textShadow: "0 2px 20px rgba(0,0,0,0.3)",
        }}>23:47</div>
        <div style={{
          fontSize: 11.5,
          color: "rgba(255,255,255,0.35)",
          marginTop: 3,
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
          letterSpacing: 1,
        }}>星期四</div>
      </div>
    </div>
  );
};

const MicButtonHighlight = ({ startFrame }: { startFrame: number }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [startFrame, startFrame + 35], [0, 1], { extrapolateRight: "clamp" });
  const pulseProgress = interpolate(frame, [startFrame, startFrame + 60], [0, 1], { extrapolateRight: "clamp" });
  const pulseIntensity = 0.5 + pulseProgress * 0.5;
  const pulse = Math.sin((frame - startFrame) * 0.08) * pulseIntensity + 0.5;
  const scale = interpolate(frame, [startFrame, startFrame + 45], [1, 1.25], { extrapolateRight: "clamp" });
  const vignetteOpacity = interpolate(frame, [startFrame, startFrame + 50], [0, 0.35], { extrapolateRight: "clamp" });

  return (
    <>
      <div style={{
        position: "absolute",
        inset: 0,
        background: `radial-gradient(circle 200px at 75% 85%, transparent 0%, rgba(0,0,0,${vignetteOpacity}) 100%)`,
        pointerEvents: "none",
        zIndex: 55,
      }} />
      <div style={{
        position: "absolute",
        bottom: 85,
        right: 380,
        opacity,
        zIndex: 60,
      }}>
        <div style={{
          position: "absolute",
          top: -55,
          left: -55,
          width: 160,
          height: 160,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(100,180,255,${0.18 * pulse}) 0%, transparent 65%)`,
        }} />
        <div style={{
          width: 58,
          height: 58,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #007acc 0%, #005a9e 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 0 ${35 * pulse}px rgba(0,122,204,${0.5 * pulse})`,
          border: "2px solid rgba(255,255,255,0.2)",
          transform: `scale(${scale})`,
        }}>
          <span style={{ fontSize: 26 }}>🎤</span>
        </div>
        <div style={{
          position: "absolute",
          top: 68,
          left: "50%",
          transform: "translateX(-50%)",
          textAlign: "center",
        }}>
          <div style={{
            fontSize: 16,
            color: "rgba(255,255,255,0.5)",
            marginBottom: 2,
          }}>↓</div>
          <div style={{
            fontSize: 11.5,
            color: "rgba(255,255,255,0.35)",
            fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
            whiteSpace: "nowrap",
          }}>每次说话都要找的按钮</div>
        </div>
      </div>
    </>
  );
};

const AmbientLight = () => {
  const frame = useCurrentFrame();
  const pulseSpeed = interpolate(frame, [0, 300], [0.02, 0.05]);
  const screenPulse = Math.sin(frame * pulseSpeed) * 0.2 + 0.8;

  return (
    <>
      <div style={{
        position: "absolute",
        right: 0,
        top: 0,
        bottom: 0,
        width: "50%",
        background: `linear-gradient(90deg, transparent 0%, rgba(255,160,100,${0.06 * screenPulse}) 100%)`,
        pointerEvents: "none",
        zIndex: 1,
      }} />
      <div style={{
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        width: "35%",
        background: `linear-gradient(-90deg, transparent 0%, rgba(80,140,255,${0.05 * screenPulse}) 100%)`,
        pointerEvents: "none",
        zIndex: 1,
      }} />
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: "25%",
        background: `linear-gradient(180deg, rgba(60,80,120,${0.04 * screenPulse}) 0%, transparent 100%)`,
        pointerEvents: "none",
        zIndex: 1,
      }} />
    </>
  );
};

export const VibeCodingScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cameraProgress = interpolate(frame, [0, 300], [0, 1], {
    easing: easeInOut,
    extrapolateRight: "clamp",
  });
  const cameraZoom = 1 + cameraProgress * 0.12;
  const cameraY = cameraProgress * -15;
  const cameraX = cameraProgress * 5;

  const textProgress = interpolate(frame, [255, 285], [0, 1], { extrapolateRight: "clamp" });
  const textY = interpolate(textProgress, [0, 1], [25, 0]);
  const fadeOutProgress = interpolate(frame, [285, 300], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <div style={{
        width: "100%",
        height: "100%",
        background: `
          radial-gradient(ellipse at 85% 15%, rgba(255,130,80,0.1) 0%, transparent 55%),
          radial-gradient(ellipse at 15% 85%, rgba(80,140,255,0.09) 0%, transparent 50%),
          linear-gradient(180deg, #0a0c14 0%, #0d1018 50%, #090b10 100%)
        `,
      }} />
      <AmbientLight />
      <div style={{
        width: "100%",
        height: "100%",
        transform: `scale(${cameraZoom}) translateY(${cameraY}px) translateX(${cameraX}px)`,
        transformOrigin: "center center",
      }}>
        <EditorWindow />
        <ScreenReflection visibleFrame={45} />
        <ChatWindow startFrame={35} position="right" />
        <ChatWindow startFrame={80} position="left" />
        <BrowserWindow startFrame={60} />
        <TerminalWindow startFrame={90} />
        <NotificationWindow startFrame={105} />
        <CalendarPopup startFrame={135} />
        <DeskDetails />
        <TappingFinger startFrame={75} />
        <MicButtonHighlight startFrame={225} />
      </div>
      <div style={{
        position: "absolute",
        bottom: 90,
        left: "50%",
        transform: `translateX(-50%) translateY(${textY}px)`,
        opacity: textProgress,
        textAlign: "center",
        zIndex: 100,
      }}>
        <p style={{
          fontSize: 42,
          fontWeight: 500,
          color: "#ffffff",
          margin: 0,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif",
          letterSpacing: 2.5,
          lineHeight: 1.5,
          textShadow: "0 4px 40px rgba(0,0,0,0.6)",
        }}>为什么开始说话</p>
        <p style={{
          fontSize: 42,
          fontWeight: 500,
          color: "rgba(255,255,255,0.65)",
          margin: "8px 0 0 0",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif",
          letterSpacing: 2.5,
          lineHeight: 1.5,
          textShadow: "0 4px 40px rgba(0,0,0,0.6)",
        }}>总要先找按钮？</p>
      </div>
      {fadeOutProgress > 0 && (
        <div style={{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          background: `rgba(0,0,0,${fadeOutProgress})`,
          pointerEvents: "none",
          zIndex: 200,
        }} />
      )}
    </AbsoluteFill>
  );
};
