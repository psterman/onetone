import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from "remotion";

const ease = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
  easing: Easing.bezier(0.16, 1, 0.3, 1),
};

const pulse = (frame: number, speed: number, amount: number) => Math.sin(frame / speed) * amount;

const Monitor = ({frame, side}: {frame: number; side: "left" | "right"}) => {
  const stress = interpolate(frame, [16, 70, 118], [0, 1, 0.72], ease);
  const shake = stress * Math.sin(frame * 0.95) * (side === "left" ? 3 : 5);
  const glow = side === "left" ? "rgba(91, 204, 255, 0.36)" : "rgba(255, 91, 91, 0.42)";

  return (
    <div
      style={{
        position: "absolute",
        left: side === "left" ? 660 : 1040,
        top: side === "left" ? 72 : 54,
        width: side === "left" ? 430 : 520,
        height: side === "left" ? 250 : 292,
        borderRadius: 18,
        background: "linear-gradient(145deg, rgba(10,16,28,0.98), rgba(3,7,14,0.98))",
        border: "1px solid rgba(197,231,255,0.14)",
        boxShadow: `0 24px 80px rgba(0,0,0,0.48), 0 0 ${36 + stress * 36}px ${glow}`,
        overflow: "hidden",
        transform: `perspective(900px) rotateY(${side === "left" ? -10 : -17}deg) rotateX(3deg) translate(${shake}px, ${pulse(frame, 18, 2)}px)`,
        zIndex: side === "left" ? 7 : 8,
      }}
    >
      <div
        style={{
          height: 30,
          background: "rgba(255,255,255,0.06)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      />
      {[0, 1, 2, 3, 4].map((row) => (
        <div
          key={row}
          style={{
            position: "absolute",
            left: 28,
            top: 52 + row * 34,
            width: row % 2 === 0 ? "64%" : "46%",
            height: 9,
            borderRadius: 8,
            background: row === 2 && side === "right" ? "rgba(255,91,91,0.9)" : "rgba(118,214,255,0.72)",
            opacity: interpolate(frame, [row * 8, row * 8 + 12], [0.2, 0.86], ease),
            translate: `${pulse(frame + row * 11, 11, side === "right" ? 10 : 4)}px 0px`,
            boxShadow: row === 2 && side === "right" ? "0 0 22px rgba(255,91,91,0.6)" : "none",
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          right: 28,
          bottom: 34,
          width: 198,
          height: 70,
          borderRadius: 12,
          background: side === "right" ? "rgba(114,16,22,0.78)" : "rgba(19,42,58,0.7)",
          border: "1px solid rgba(255,255,255,0.12)",
          opacity: interpolate(frame, [30, 44], [0, 1], ease),
          translate: `${pulse(frame, 9, 4)}px ${pulse(frame, 13, 2)}px`,
        }}
      >
        <div style={{padding: "14px 16px", color: "white", fontFamily: "Consolas, monospace", fontSize: 18}}>
          {side === "right" ? "Build failed" : "context drifting"}
        </div>
      </div>
    </div>
  );
};

const Character = ({frame}: {frame: number}) => {
  const slump = interpolate(frame, [0, 70, 120], [0, 30, 24], ease);
  const headTilt = interpolate(frame, [0, 62, 120], [-3, 10, 7], ease) + pulse(frame, 24, 1.2);
  const browPain = interpolate(frame, [18, 72], [0, 1], ease);
  const handRise = interpolate(frame, [28, 74], [135, 0], ease);
  const breathe = pulse(frame, 16, 3);

  return (
    <div
      style={{
        position: "absolute",
        left: 360,
        top: 84 + slump,
        width: 360,
        height: 340,
        zIndex: 18,
        translate: `${pulse(frame, 36, 5)}px ${breathe}px`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 96,
          top: 150,
          width: 220,
          height: 180,
          borderRadius: "70px 78px 28px 28px",
          background: "linear-gradient(150deg, #1a2637, #07101f 72%)",
          boxShadow: "0 26px 70px rgba(0,0,0,0.42)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 126,
          top: 78,
          width: 150,
          height: 154,
          borderRadius: "44% 44% 48% 48%",
          background: "linear-gradient(140deg, #c58c65, #805039 78%)",
          boxShadow: "inset -18px -12px 34px rgba(44,18,12,0.3), 0 16px 50px rgba(0,0,0,0.32)",
          rotate: `${headTilt}deg`,
          transformOrigin: "52% 88%",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: -6,
            top: -16,
            width: 166,
            height: 58,
            borderRadius: "70% 50% 30% 30%",
            background: "linear-gradient(160deg, #161a20, #07090e)",
            rotate: "-5deg",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 36,
            top: 72,
            width: 28,
            height: 7,
            borderRadius: 999,
            background: "#1b1210",
            rotate: `${-18 - browPain * 18}deg`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 92,
            top: 72,
            width: 30,
            height: 7,
            borderRadius: 999,
            background: "#1b1210",
            rotate: `${18 + browPain * 18}deg`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 43,
            top: 88,
            width: 18,
            height: 6 + browPain * 2,
            borderRadius: 999,
            background: "#130d0b",
            opacity: 0.86,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 98,
            top: 88,
            width: 18,
            height: 6 + browPain * 2,
            borderRadius: 999,
            background: "#130d0b",
            opacity: 0.86,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 70,
            top: 112,
            width: 38,
            height: 12,
            borderRadius: "0 0 999px 999px",
            borderBottom: `${3 + browPain * 2}px solid #251210`,
            rotate: `${browPain * 5}deg`,
            opacity: 0.92,
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 22,
            top: 98,
            width: 8,
            height: 22,
            borderRadius: 999,
            background: "rgba(125,220,255,0.75)",
            opacity: interpolate(frame, [56, 78], [0, 1], ease),
            translate: `0px ${interpolate(frame, [78, 120], [0, 18], ease)}px`,
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: 40,
          top: 170,
          width: 150,
          height: 34,
          borderRadius: 999,
          background: "linear-gradient(90deg, #1f3147, #0a1423)",
          rotate: `${-24 - handRise * 0.06}deg`,
          translate: `${handRise * 0.42}px ${handRise * 0.58}px`,
          transformOrigin: "100% 50%",
          boxShadow: "0 16px 34px rgba(0,0,0,0.25)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 118,
          top: 106,
          width: 58,
          height: 38,
          borderRadius: "60% 42% 55% 45%",
          background: "linear-gradient(140deg, #c58c65, #8a573c)",
          rotate: `${-18 + pulse(frame, 11, 2)}deg`,
          translate: `${handRise * 0.48}px ${handRise * 0.62}px`,
          boxShadow: "0 8px 22px rgba(0,0,0,0.24)",
        }}
      />
    </div>
  );
};

const Desk = ({frame}: {frame: number}) => (
  <>
    <div
      style={{
        position: "absolute",
        left: 240,
        right: 120,
        bottom: -70,
        height: 150,
        background: "linear-gradient(180deg, #3b241d, #160d0c)",
        borderRadius: "60% 60% 0 0",
        boxShadow: "0 -18px 70px rgba(0,0,0,0.34)",
        zIndex: 20,
        translate: `${pulse(frame, 34, 5)}px 0px`,
      }}
    />
    <div
      style={{
        position: "absolute",
        left: 805,
        top: 342,
        width: 290,
        height: 22,
        borderRadius: 999,
        background: "rgba(93, 220, 255, 0.24)",
        filter: "blur(1px)",
        zIndex: 21,
        translate: `${pulse(frame, 8, 18)}px 0px`,
      }}
    />
  </>
);

const CameraOverlay = ({frame}: {frame: number}) => (
  <>
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "linear-gradient(90deg, rgba(5,7,13,0.88) 0%, rgba(5,7,13,0.36) 24%, rgba(5,7,13,0.08) 58%, rgba(5,7,13,0.66) 100%)",
        zIndex: 24,
        pointerEvents: "none",
      }}
    />
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(circle at 58% 38%, transparent 44%, rgba(0,0,0,0.56) 100%), linear-gradient(180deg, rgba(255,255,255,0.04), transparent 18%, transparent 80%, rgba(0,0,0,0.28))",
        opacity: 0.95,
        zIndex: 50,
        pointerEvents: "none",
      }}
    />
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: 0.08,
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.13) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
        translate: `${pulse(frame, 10, 3)}px 0px`,
        zIndex: 52,
        pointerEvents: "none",
      }}
    />
  </>
);

export const FirstVideo = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        background:
          "radial-gradient(circle at 68% 20%, rgba(76, 178, 220, 0.18), transparent 28%), radial-gradient(circle at 40% 78%, rgba(207, 98, 65, 0.14), transparent 28%), linear-gradient(180deg, #05070d 0%, #101420 52%, #08070a 100%)",
        fontFamily: "Segoe UI, Microsoft YaHei, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          perspective: 900,
          transform: `translateX(${interpolate(frame, [0, 120], [-46, 34], ease)}px) rotateY(${interpolate(frame, [0, 120], [8, -7], ease)}deg) scale(${interpolate(frame, [0, 120], [1.02, 1.05], ease)})`,
          transformOrigin: "55% 50%",
        }}
      >
        <Monitor frame={frame} side="left" />
        <Monitor frame={frame} side="right" />
        <Character frame={frame} />
        <Desk frame={frame} />
      </div>

      <div
        style={{
          position: "absolute",
          left: 84,
          top: 42,
          color: "white",
          textShadow: "0 12px 32px rgba(0,0,0,0.5)",
          zIndex: 42,
          opacity: interpolate(frame, [0, 12, 92, 120], [0, 1, 1, 0.7], ease),
          translate: `0px ${interpolate(frame, [0, 14], [18, 0], ease)}px`,
        }}
      >
        <div style={{fontSize: 15, letterSpacing: 0, textTransform: "uppercase", color: "rgba(224, 246, 255, 0.72)", marginBottom: 12}}>
          Acting Beat / Vibecoding Pain
        </div>
        <div style={{fontSize: 58, lineHeight: 0.96, fontWeight: 900, letterSpacing: 0}}>想法很快</div>
        <div style={{fontSize: 58, lineHeight: 0.96, fontWeight: 900, letterSpacing: 0}}>落地很慢</div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 84,
          top: 214,
          width: 580,
          color: "rgba(244, 251, 255, 0.92)",
          fontSize: 24,
          lineHeight: 1.35,
          zIndex: 42,
          opacity: interpolate(frame, [16, 28], [0, 1], ease),
          translate: `0px ${interpolate(frame, [16, 28], [18, 0], ease)}px`,
        }}
      >
        报错闪烁、窗口逼近，手慢慢扶上额头，
        <br />
        情绪从克制变成明显的痛苦和苦恼。
      </div>

      <CameraOverlay frame={frame} />
    </AbsoluteFill>
  );
};
