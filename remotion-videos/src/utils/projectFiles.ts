/**
 * Voice-Pilot 项目文件访问工具
 * 
 * 在 Remotion 视频中方便地访问整个 voice-pilot 项目的文件
 * 支持：图标、设计稿、源代码、文档等
 */

import { staticFile } from "remotion";

/**
 * 获取项目根目录文件的路径
 * 在 Remotion 中使用时需要向上跳出 remotion-videos 目录
 */
export const projectFile = (relativePath: string): string => {
  return staticFile(`../${relativePath}`);
};

/**
 * 图标文件路径快捷方式
 */
export const icons = {
  voicePilot: projectFile("assets/icons/voice-pilot-icon-minimal-refined.png"),
  voicePilotWaveform: projectFile("assets/icons/voice-pilot-scheme-b-waveform.png"),
  voicePilotKeyMic: projectFile("assets/icons/voice-pilot-scheme-a-key-mic.png"),
  voicePilotSpeedTrigger: projectFile("assets/icons/voice-pilot-scheme-c-speed-trigger.png"),
  oneTone: projectFile("assets/icons/onetone-icon-refined-1024.png"),
  oneToneLight: projectFile("assets/icons/onetone-icon-ui-light-1024.png"),
  oneTonePrimary: projectFile("assets/icons/onetone-icon-ui-primary-1024.png"),
  codex: projectFile("assets/icons/codex.png"),
  cursor: projectFile("assets/icons/cursor.png"),
  minimaxCode: projectFile("assets/icons/minimaxcode.png"),
  qianwen: projectFile("assets/icons/qianwen.png"),
  weixin: projectFile("assets/icons/weixin.png"),
  xunfei: projectFile("assets/icons/xunfei.png"),
  zhipu: projectFile("assets/icons/zhipu.png"),
};

/**
 * 设计稿文件路径快捷方式
 */
export const designMocks = {
  homeRedesign: (version: number) => projectFile(`design-mock/home-redesign-v${version}.html`),
  cameraPrototype: projectFile("design-mock/camera-pro-windows-hello-prototype.html"),
  codexMicroJoystick: projectFile("design-mock/codex-micro-joystick.html"),
  codexMicroToggle: projectFile("design-mock/codex-micro-toggle-switch.html"),
  settings: projectFile("design-mock/soft-pad-cockpit-settings-v1.html"),
  quickStartBlueprint: projectFile("design-mock/quick-start-blueprint-preview.html"),
  trayMenu: projectFile("design-mock/tray-menu-A-minimal.html"),
  trayMenuCompare: projectFile("design-mock/tray-menu-compare.html"),
};

/**
 * 声音文件路径
 */
export const sounds = {
  errorSubtle: projectFile("assets/sounds/error-subtle.wav"),
  inputReady: projectFile("assets/sounds/input-ready-soft.wav"),
  sendConfirm: projectFile("assets/sounds/send-confirm-click.wav"),
  tinyTick: projectFile("assets/sounds/tiny-tick.wav"),
  voiceOpenGate: projectFile("assets/sounds/voice-open-gate.wav"),
  voiceOpenSignal: projectFile("assets/sounds/voice-open-signal.wav"),
  voiceOpenSip: projectFile("assets/sounds/voice-open-sip.wav"),
};

/**
 * 已渲染视频输出文件
 */
export const renderedVideos = {
  onetoneIntro: projectFile("remotion-videos/out/onetone-intro.mp4"),
  vibeCodingPain: projectFile("remotion-videos/out/vibecoding-pain.mp4"),
  firstVideo: projectFile("remotion-videos/out/first-video.mp4"),
  vibeCodingOrbit: projectFile("remotion-videos/out/vibecoding-orbit.mp4"),
};

/**
 * 获取设计稿列表（用于文件浏览器）
 */
export const getDesignMockList = () => [
  { name: "Home Redesign (v1-v19)", type: "UI设计", count: 19 },
  { name: "Camera Pro Windows Hello", type: "功能原型", count: 1 },
  { name: "Codex Micro Joystick", type: "控制器设计", count: 1 },
  { name: "Soft Pad Settings", type: "设置界面", count: 1 },
  { name: "Quick Start Blueprint", type: "引导流程", count: 1 },
];

/**
 * 获取源代码文件列表（用于代码展示）
 */
export const getSourceFiles = () => [
  { path: "src/js/features/visual-agent/", name: "Visual Agent", description: "视觉感知系统" },
  { path: "src/js/features/camera/", name: "Camera Features", description: "摄像头与视线追踪" },
  { path: ".agentcontroller-tmp/app/", name: "Agent Controller", description: "控制器应用" },
];

export default {
  projectFile,
  icons,
  designMocks,
  sounds,
  renderedVideos,
  getDesignMockList,
  getSourceFiles,
};
