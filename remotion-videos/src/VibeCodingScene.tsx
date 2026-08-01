import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

// 浮动UI元素 - 浏览器标签
const BrowserTab = ({ x, y, width, height, opacity, rotation = 0 }: {
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  rotation?: number;
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width,
      height,
      background: "linear-gradient(135deg, rgba(40,44,52,0.8) 0%, rgba(30,34,42,0.9) 100%)",
      borderRadius: 6,
      border: "1px solid rgba(255,255,255,0.08)",
      opacity,
      transform: `rotate(${rotation}deg)`,
      boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
      display: "flex",
      alignItems: "center",
      paddingLeft: 12,
    }}
  >
    <div style={{ width: 12, height: 12, borderRadius: "50%", background: "rgba(255,107,107,0.7)" }} />
    <div style={{ marginLeft: 8, width: 8, height: 8, borderRadius: "50%", background: "rgba(255,217,107,0.7)" }} />
    <div style={{ marginLeft: 6, width: 8, height: 8, borderRadius: "50%", background: "rgba(107,255,161,0.7)" }} />
    <div style={{ marginLeft: 15, width: width * 0.5, height: 8, background: "rgba(255,255,255,0.1)", borderRadius: 2 }} />
  </div>
);

// 代码片段组件
const CodeSnippet = ({ x, y, width, opacity, rotation = 0 }: {
  x: number;
  y: number;
  width: number;
  opacity: number;
  rotation?: number;
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width,
      background: "rgba(22,25,32,0.9)",
      borderRadius: 8,
      border: "1px solid rgba(255,255,255,0.06)",
      padding: "14px 18px",
      opacity,
      transform: `rotate(${rotation}deg)`,
      fontFamily: "'Fira Code', monospace",
      fontSize: 11,
      lineHeight: 1.8,
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    }}
  >
    <div style={{ color: "rgba(255,180,100,0.7)" }}>const handleSubmit = async () => {"{"}</div>
    <div style={{ color: "rgba(100,200,255,0.7)" }}>  try {"{"}</div>
    <div style={{ color: "rgba(200,150,255,0.7)" }}>    await new Promise(...)</div>
    <div style={{ color: "rgba(255,100,100,0.6)" }}>    // FIXME: broken!</div>
    <div style={{ color: "rgba(255,255,255,0.3)" }}>{"}"} catch (e) {"{"}...</div>
  </div>
);

// 错误消息气泡
const ErrorBubble = ({ x, y, opacity, scale }: {
  x: number;
  y: number;
  opacity: number;
  scale?: number;
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      padding: "10px 16px",
      background: "linear-gradient(135deg, rgba(255,80,80,0.15) 0%, rgba(255,60,60,0.1) 100%)",
      borderRadius: 8,
      border: "1px solid rgba(255,100,100,0.4)",
      opacity,
      transform: `scale(${scale ?? 1})`,
      boxShadow: "0 0 20px rgba(255,100,100,0.2)",
    }}
  >
    <span style={{ color: "rgba(255,150,150,0.9)", fontSize: 13 }}>
      ⚠️ Cannot read property 'undefined' of null
    </span>
  </div>
);

// 便利贴组件
const StickyNote = ({ x, y, rotation, text, opacity }: {
  x: number;
  y: number;
  rotation: number;
  text: string;
  opacity: number;
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: 110,
      padding: "12px 14px",
      background: "linear-gradient(145deg, rgba(255,230,150,0.95) 0%, rgba(255,210,120,0.9) 100%)",
      borderRadius: 2,
      transform: `rotate(${rotation}deg)`,
      opacity,
      boxShadow: "3px 6px 20px rgba(0,0,0,0.3)",
      fontFamily: "'Caveat', cursive",
      fontSize: 16,
      color: "#4a3000",
      lineHeight: 1.4,
    }}
  >
    {text}
  </div>
);

// 咖啡杯组件
const CoffeeCup = ({ x, y, opacity, scale = 1 }: {
  x: number;
  y: number;
  opacity: number;
  scale?: number;
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      opacity,
      transform: `scale(${scale})`,
    }}
  >
    {/* 杯子蒸汽 */}
    <div style={{ display: "flex", gap: 6, paddingLeft: 16, marginBottom: -5 }}>
      {[0, 1, 2].map(i => (
        <div
          key={i}
          style={{
            width: 4,
            height: 18 + i * 6,
            background: "linear-gradient(to top, rgba(255,255,255,0.3), transparent)",
            borderRadius: 4,
            animationDelay: `${i * 0.3}s,
          }}
        />
      ))}
    </div>
    {/* 杯子 */}
    <div
      style={{
        width: 44,
        height: 32,
        background: "linear-gradient(180deg, rgba(80,50,30,0.95) 0%, rgba(60,35,20,0.98) 100%)",
        borderRadius: "0 0 8px 8px",
        position: "relative",
      }}
    />
    {/* 杯柄 */}
    <div
      style={{
        position: "absolute",
        right: -10,
        top: 6,
        width: 14,
        height: 20,
        border: "3px solid rgba(100,70,50,0.9)",
        borderRadius: "0 10px 10px 0",
        borderLeft: "none",
      }}
    />
  </div>
);

// 线缆组件
const Cable = ({ startX, startY, endX, endY, opacity }: {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  opacity: number;
}) => (
  <svg
    style={{
      position: "absolute",
      left: 0,
      top: 0,
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      opacity,
    }}
  >
    <path
      d={`M ${startX} ${startY} Q ${(startX + endX) / 2} ${(startY + endY) / 2 + 40} T ${endX} ${endY}`
      stroke="rgba(40,44,52,0.8)"
      strokeWidth="6"
      fill="none"
      strokeLinecap="round"
    />
  </svg>
);

// 人物轮廓 (使用纯CSS创建开发者剪影
const DeveloperSilhouette = () => {
  const frame = useCurrentFrame();
  const headBob = Math.sin(frame * 0.05) * 2;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 120,
        right: 180,
        transform: `translateY(${headBob}px)`,
      }}
    >
      {/* 头部剪影 */}
      <div
        style={{
          width: 70,
          height: 80,
          background: "rgba(10,10,15,0.9)",
          borderRadius: "35px 35px 20px 20px",
          marginLeft: 25,
        }}
      />
      {/* 身体/肩膀 */}
      <div
        style={{
          width: 140,
          height: 100,
          marginTop: -10,
          background: "linear-gradient(180deg, rgba(15,15,20,0.95) 0%, rgba(8,8,12,0.98) 100%)",
          borderRadius: "60px 60px 0 0",
        }}
      />
    </div>
  );
};

// 笔记本电脑发光屏幕
const LaptopScreen = () => {
  const frame = useCurrentFrame();
  const flicker = 0.95 + Math.sin(frame * 0.1) * 0.05;
  const glitchOffset = Math.sin(frame * 0.03) * 2;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 80,
        right: 100,
        width: 420,
        height: 260,
        background: "linear-gradient(180deg, #1a1d23 0%, #0f1116 100%)",
        borderRadius: "8px 8px 0 0",
        border: "3px solid #2a2d35",
        borderBottom: "none",
        boxShadow: `0 0 ${80 * flicker}px rgba(100,180,255,${0.15 * flicker})`,
        overflow: "hidden",
      }}
    >
      {/* 屏幕内容 - 混乱的代码和界面 */}
      <div style={{ padding: 20, opacity: flicker }}>
        {/* 代码行 */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
          <div
            key={i}
            style={{
              height: 16,
              marginBottom: 6,
              background: i % 3 === 0
                ? "linear-gradient(90deg, rgba(100,180,255,0.25) 0%, transparent 70%)"
                : i % 3 === 1
                  ? "linear-gradient(90deg, rgba(255,180,100,0.2) 0%, transparent 60%)"
                  : "linear-gradient(90deg, rgba(200,150,255,0.15) 0%, transparent 50%)",
              borderRadius: 2,
              transform: `translateX(${glitchOffset * (i % 2 === 0 ? 1 : -1}px)`,
            }}
          />
        ))}

        {/* 浮动的红点 */}
        <div style={{ display: "flex", gap: 8, marginTop: 15, }}
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "rgba(255,80,80,0.8)",
              boxShadow: "0 0 8px rgba(255,80,80,0.5)",
            }}
          />
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "rgba(100,255,150,0.8)",
              boxShadow: "0 0 8px rgba(100,255,150,0.5)",
            }}
          />
        </div>
      </div>

      {/* 屏幕反光效果 */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 50%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
};

// 主场景组件
export const VibeCodingScene = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // 动画进度 - 相机缓慢推进
  const cameraProgress = interpolate(frame, [0, 150], [0, 1], {
    extrapolateRight: "clamp",
  });
  const cameraZoom = 1 + cameraProgress * 0.08;
  const cameraY = cameraProgress * -15;

  // 元素淡入时序
  const bgOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const elementsOpacity = interpolate(frame, [15, 45], [0, 1], { extrapolateRight: "clamp" });
  const devOpacity = interpolate(frame, [30, 60], [0, 1], { extrapolateRight: "clamp" });
  const textOpacity = interpolate(frame, [60, 100], [0, 1], { extrapolateRight: "clamp" });

  // 浮动元素轻微飘动
  const floatOffset1 = Math.sin(frame * 0.04) * 4;
  const floatOffset2 = Math.sin(frame * 0.03 + 1) * 3;
  const floatOffset3 = Math.sin(frame * 0.035 + 2) * 5;

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {/* 背景渐变 - 蓝橙对比色调 */}
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "radial-gradient(ellipse at 70% 30%, rgba(255,140,80,0.12) 0%, transparent 50%), radial-gradient(ellipse at 20% 80%, rgba(80,140,255,0.08) 0%, transparent 45%), linear-gradient(180deg, #0a0c12 0%, #0d1018 50%, #080a10 100%)",
          opacity: bgOpacity,
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
        {/* 桌面 */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "55%",
            background: "linear-gradient(180deg, #1a1d24 0%, #14171e 100%)",
            opacity: elementsOpacity,
          }}
        />

        {/* 线缆 */}
        <Cable startX={80} startY={600} endX={300} endY={500} opacity={elementsOpacity * 0.6} />
        <Cable startX={width - 100} startY={580} endX={width - 280} endY={480} opacity={elementsOpacity * 0.5} />

        {/* 笔记本电脑屏幕 */}
        <LaptopScreen />

        {/* 开发者剪影 */}
        <div style={{ opacity: devOpacity }}>
          <DeveloperSilhouette />
        </div>

        {/* 咖啡杯 */}
        <CoffeeCup
          x={80}
          y={420 + floatOffset1}
          opacity={elementsOpacity}
          scale={0.9}
        />

        {/* 便利贴 */}
        <StickyNote
          x={50}
          y={180 + floatOffset2}
          rotation={-5}
          text="Fix bug!"
          opacity={elementsOpacity * 0.9}
        />
        <StickyNote
          x={130}
          y={140 + floatOffset3}
          rotation={3}
          text="TODO: refactor"
          opacity={elementsOpacity * 0.85}
        />
        <StickyNote
          x={width - 180}
          y={160}
          rotation={-2}
          text="WIP..."
          opacity={elementsOpacity * 0.8}
        />

        {/* 浏览器标签 */}
        <BrowserTab
          x={120 + floatOffset1}
          y={280}
          width={180}
          height={36}
          opacity={elementsOpacity * 0.75}
          rotation={-3}
        />
        <BrowserTab
          x={160 + floatOffset2}
          y={320}
          width={160}
          height={36}
          opacity={elementsOpacity * 0.7}
          rotation={2}
        />
        <BrowserTab
          x={width - 320 + floatOffset3}
          y={200}
          width={200}
          height={36}
          opacity={elementsOpacity * 0.8}
          rotation={1}
        />

        {/* 代码片段 */}
        <CodeSnippet
          x={width - 400 + floatOffset2}
          y={340}
          width={280}
          opacity={elementsOpacity * 0.85}
          rotation={-1}
        />
        <CodeSnippet
          x={100 + floatOffset1}
          y={380}
          width={220}
          opacity={elementsOpacity * 0.75}
          rotation={2}
        />

        {/* 错误消息 */}
        <ErrorBubble
          x={width - 380}
          y={290 + floatOffset3}
          opacity={elementsOpacity * 0.9}
          scale={1 + Math.sin(frame * 0.08) * 0.05}
        />
        <ErrorBubble
          x={width - 420}
          y={420}
          opacity={elementsOpacity * 0.7}
          scale={0.9}
        />
      </div>

      {/* 前景文字层 - 问题抛出 */}
      <div
        style={{
          position: "absolute",
          bottom: 80,
          left: 80,
          opacity: textOpacity,
          maxWidth: 520,
        }}
      >
        <p
          style={{
            fontSize: 44,
            fontWeight: 600,
            color: "#ffffff",
            margin: 0,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
            letterSpacing: 1.5,
            lineHeight: 1.3,
            textShadow: "0 4px 40px rgba(0,0,0,0.5)",
          }}
        >
          为什么开始说话
        </p>
        <p
          style={{
            fontSize: 44,
            fontWeight: 600,
            color: "rgba(255,255,255,0.7)",
            margin: "12px 0 0 0",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
            letterSpacing: 1.5,
            lineHeight: 1.3,
            textShadow: "0 4px 40px rgba(0,0,0,0.5)",
          }}
        >
          总要先找按钮？
        </p>
      </div>

      {/* 侧光/轮廓光效果层 */}
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: "40%",
          background: "linear-gradient(90deg, transparent 0%, rgba(255,180,100,0.04) 100%)",
          pointerEvents: "none",
          opacity: textOpacity,
        }}
      />
    </AbsoluteFill>
  );
};
