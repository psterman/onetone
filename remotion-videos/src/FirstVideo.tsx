import {useCurrentFrame, AbsoluteFill, Easing, Img, interpolate, Sequence, staticFile} from "remotion";
import type {ReactNode} from "react";

const SOURCE_WIDTH = 836;
const SOURCE_HEIGHT = 188;
const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 432;
const SOURCE_SCALE = STAGE_WIDTH / SOURCE_WIDTH;

const source = staticFile("storyboard-shots/shot-01.png");

type Region = {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  left: number;
  top: number;
};

const CroppedRegion = ({
  region,
  opacity = 1,
  children,
}: {
  region: Region;
  opacity?: number;
  children?: ReactNode;
}) => {
  return (
    <div
      style={{
        position: "absolute",
        left: region.left,
        top: region.top,
        width: region.width * SOURCE_SCALE,
        height: region.height * SOURCE_SCALE,
        overflow: "hidden",
        opacity,
      }}
    >
      <Img
        src={source}
        style={{
          position: "absolute",
          left: -region.x * SOURCE_SCALE,
          top: -region.y * SOURCE_SCALE,
          width: STAGE_WIDTH,
          height: SOURCE_HEIGHT * SOURCE_SCALE,
          objectFit: "fill",
          filter: "contrast(1.08) saturate(1.03)",
        }}
      />
      {children}
    </div>
  );
};

const regions = {
  leftPrototype: {name: "Prototype person area", x: 0, y: 18, width: 302, height: 150, left: 58, top: 66},
  centerAction: {name: "Typing hands area", x: 285, y: 24, width: 170, height: 128, left: 555, top: 112},
  monitor: {name: "Monitor area", x: 392, y: 12, width: 410, height: 158, left: 860, top: 48},
  textPanel: {name: "Text area", x: 454, y: 28, width: 290, height: 116, left: 1012, top: 118},
};

const CodeOverlay = () => {
  const frame = useCurrentFrame();
  const lines = ["listening...", "prompt churn detected", "context window full", "preview drift"];

  return (
    <div
      style={{
        position: "absolute",
        left: 82,
        top: 70,
        width: 620,
        fontFamily: "Consolas, 'Courier New', monospace",
        color: "#d7fbff",
        textShadow: "0 0 14px rgba(117, 220, 255, 0.42)",
      }}
    >
      {lines.map((line, index) => {
        const start = 12 + index * 16;
        const reveal = Math.floor(
          interpolate(frame, [start, start + 14], [0, line.length], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        );
        return (
          <div
            key={line}
            style={{
              height: 34,
              display: "flex",
              alignItems: "center",
              gap: 14,
              opacity: interpolate(frame, [start - 4, start], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            <span style={{width: 28, color: "rgba(200,220,240,0.46)", fontSize: 16}}>{index + 1}</span>
            <span style={{fontSize: 21, color: index % 2 === 0 ? "#89ddff" : "#c3e88d"}}>{line.slice(0, reveal)}</span>
            {reveal < line.length ? <span style={{width: 8, height: 22, background: "#e6feff"}} /> : null}
          </div>
        );
      })}
    </div>
  );
};

const PromptBubble = () => {
  const frame = useCurrentFrame();

  return (
    <Sequence from={90} layout="absolute-fill">
      <div
        style={{
          position: "absolute",
          left: 1100,
          top: 34,
          width: 470,
          padding: "20px 24px 18px",
          borderRadius: 22,
          background: "rgba(238, 252, 255, 0.96)",
          color: "#071522",
          fontFamily: "Segoe UI, Microsoft YaHei, sans-serif",
          fontSize: 26,
          fontWeight: 800,
          lineHeight: 1.28,
          boxShadow: "0 26px 72px rgba(0,0,0,0.35), 0 0 44px rgba(124,220,255,0.34)",
          opacity: interpolate(frame, [90, 98], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [90, 101], [0.84, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: `0px ${interpolate(frame, [90, 101], [18, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px`,
        }}
      >
        AI 提示：把这段逻辑封装成一个 action
      </div>
    </Sequence>
  );
};

const TypingMotion = () => {
  const frame = useCurrentFrame();
  const tap = Math.sin(frame * 0.62) * 7;

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 350,
          top: 212,
          width: 155,
          height: 24,
          borderRadius: 20,
          background: "linear-gradient(90deg, rgba(180,230,255,0.35), rgba(56,91,128,0.22))",
          rotate: "-7deg",
          translate: `0px ${tap}px`,
          filter: "blur(0.2px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 420,
          top: 246,
          width: 170,
          height: 22,
          borderRadius: 20,
          background: "linear-gradient(90deg, rgba(180,230,255,0.3), rgba(56,91,128,0.18))",
          rotate: "8deg",
          translate: `0px ${-tap}px`,
        }}
      />
    </>
  );
};

const PainPoints = () => {
  const frame = useCurrentFrame();
  const items = ["提示词一改再改", "上下文一长就丢", "报错解释半天", "想法和成片之间隔着一条河"];

  return (
    <div
      style={{
        position: "absolute",
        left: 92,
        bottom: 42,
        display: "grid",
        gap: 10,
        color: "#effdff",
        fontFamily: "Segoe UI, Microsoft YaHei, sans-serif",
      }}
    >
      {items.map((item, index) => {
        const start = 18 + index * 12;
        const active = interpolate(frame, [start, start + 8], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        });

        return (
          <div
            key={item}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              opacity: active,
              transform: `translateY(${interpolate(frame, [start, start + 8], [16, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              })}px)`,
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: 999,
                background: index % 2 === 0 ? "rgba(124, 220, 255, 0.95)" : "rgba(99, 255, 189, 0.9)",
                boxShadow: "0 0 18px rgba(124,220,255,0.45)",
              }}
            />
            <div
              style={{
                padding: "10px 16px",
                borderRadius: 999,
                background: "rgba(7, 14, 24, 0.62)",
                border: "1px solid rgba(163, 229, 255, 0.22)",
                backdropFilter: "blur(10px)",
                fontSize: 22,
                letterSpacing: "-0.01em",
                boxShadow: "0 10px 26px rgba(0,0,0,0.18)",
              }}
            >
              {item}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const TitleCard = () => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        left: 84,
        top: 34,
        color: "white",
        fontFamily: "Segoe UI, Microsoft YaHei, sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 16,
          letterSpacing: "0.28em",
          textTransform: "uppercase",
          color: "rgba(221, 247, 255, 0.72)",
          marginBottom: 10,
          opacity: interpolate(frame, [0, 12], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          transform: `translateY(${interpolate(frame, [0, 12], [8, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px)`,
        }}
      >
        VIBECODING PAIN POINTS
      </div>
      <div
        style={{
          fontSize: 58,
          fontWeight: 900,
          lineHeight: 1,
          letterSpacing: "-0.05em",
          textShadow: "0 12px 32px rgba(0,0,0,0.42)",
          opacity: interpolate(frame, [4, 18], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          transform: `translateY(${interpolate(frame, [4, 18], [18, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          })}px)`,
        }}
      >
        想法很快
        <br />
        落地很慢
      </div>
    </div>
  );
};

export const FirstVideo = () => {
  const frame = useCurrentFrame();
  const cameraShift = interpolate(frame, [0, 180], [0, -42], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const zoom = interpolate(frame, [0, 180], [1.06, 1.15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(180deg, #05070d 0%, #0a1019 48%, #03050a 100%)",
        overflow: "hidden",
      }}
    >
      <Img
        src={source}
        style={{
          position: "absolute",
          left: -40,
          top: -10,
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          objectFit: "cover",
          opacity: 0.16,
          filter: "blur(10px) brightness(0.68) saturate(1.12)",
          scale: zoom,
          translate: `${cameraShift}px ${interpolate(frame, [0, 180], [0, 2], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px`,
        }}
      />
      <AbsoluteFill
        style={{
          background: [
            "radial-gradient(circle at 64% 34%, rgba(107, 205, 255, 0.22), transparent 28%)",
            "radial-gradient(circle at 18% 62%, rgba(95, 255, 195, 0.1), transparent 20%)",
            "radial-gradient(circle at 70% 72%, rgba(255, 150, 92, 0.06), transparent 18%)",
          ].join(", "),
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          translate: interpolate(frame, [0, 180], ["-20px 4px", "24px -2px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <CroppedRegion region={regions.leftPrototype} opacity={interpolate(frame, [0, 18], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"})} />
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          translate: interpolate(frame, [0, 180], ["20px 0px", "-32px -4px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: interpolate(frame, [0, 180], [0.98, 1.045], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <CroppedRegion region={regions.monitor} opacity={interpolate(frame, [12, 28], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"})}>
          <CodeOverlay />
        </CroppedRegion>
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          translate: interpolate(frame, [0, 180], ["-10px 8px", "28px 2px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <CroppedRegion region={regions.centerAction} opacity={interpolate(frame, [18, 34], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"})} />
      </div>

      <TypingMotion />
      <TitleCard />
      <PainPoints />
      <PromptBubble />

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 160,
          background: "linear-gradient(180deg, rgba(3,5,10,0), rgba(3,5,10,0.98))",
        }}
      />
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          opacity: 0.12,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          translate: `${Math.sin(frame / 12) * 3}px 0px`,
        }}
      />
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background:
            "radial-gradient(circle at center, transparent 58%, rgba(0,0,0,0.52) 100%), linear-gradient(180deg, rgba(255,255,255,0.03), transparent 20%, transparent 80%, rgba(0,0,0,0.12))",
        }}
      />
    </AbsoluteFill>
  );
};
