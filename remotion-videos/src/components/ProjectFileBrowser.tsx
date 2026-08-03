/**
 * 项目文件浏览器组件
 * 
 * 在视频中展示 voice-pilot 项目的文件结构
 * 用于演示项目结构、代码浏览等场景
 */

import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, spring } from "remotion";
import { icons } from "../utils/projectFiles";

const getDesignMockList = () => [
  { name: "Home Redesign", type: "UI设计", count: 19 },
  { name: "Camera Pro", type: "功能原型", count: 1 },
];

const getSourceFiles = () => [
  { path: "src/js/features/", name: "Visual Agent", description: "视觉感知系统" },
];

interface FileCardProps {
  name: string;
  description: string;
  icon: string;
  delay?: number;
}

const FileCard: React.FC<FileCardProps> = ({ name, description, icon, delay = 0 }) => {
  const frame = useCurrentFrame();
  const opacity = spring({
    fps: 30,
    frame: Math.max(0, frame - delay),
    config: { damping: 12, stiffness: 100 },
  });
  const yOffset = interpolate(opacity, [0, 1], [30, 0]);

  return (
    <div
      className="bg-gray-800 rounded-xl p-6 hover:bg-gray-700 transition-colors border border-gray-700"
      style={{
        opacity,
        transform: `translateY(${yOffset}px)`,
      }}
    >
      <span className="text-5xl block mb-4">{icon}</span>
      <h3 className="text-xl font-bold text-white mb-2">{name}</h3>
      <p className="text-gray-400 text-sm">{description}</p>
    </div>
  );
};

interface CodeFileProps {
  filePath: string;
  language: string;
  delay?: number;
}

const CodeFileCard: React.FC<CodeFileProps> = ({ filePath, language, delay = 0 }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(Math.max(0, frame - delay), [0, 60], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden border border-gray-700">
      <div className="bg-gray-800 px-4 py-2 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <div className="w-3 h-3 rounded-full bg-green-500" />
        </div>
        <span className="text-gray-400 text-sm font-mono">{filePath}</span>
        <span className="text-gray-500 text-xs">{language.toUpperCase()}</span>
      </div>
      <div className="p-4 overflow-hidden">
        <div
          className="font-mono text-sm text-gray-300"
          style={{
            height: `${Math.min(progress * 100, 100)}%`,
            opacity: progress,
          }}
        >
          {/* 代码内容会在这里显示 */}
        </div>
      </div>
    </div>
  );
};

/**
 * 项目文件浏览器主组件
 */
export const ProjectFileBrowser: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

  const designMocks = getDesignMockList();
  const sourceFiles = getSourceFiles();

  return (
    <AbsoluteFill className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8">
      <div style={{ opacity: fadeIn }} className="h-full flex flex-col">
        {/* 标题 */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
            <span>📁</span> Voice-Pilot 项目文件
          </h1>
          <p className="text-gray-400 text-lg">
            探索项目中的源代码、设计稿、资源文件
          </p>
        </div>

        {/* 资源文件网格 */}
        <h2 className="text-2xl font-semibold text-white mb-4">🎨 图标资源 (assets/icons/)</h2>
        <div className="grid grid-cols-5 gap-4 mb-8">
          {Object.entries(icons).slice(0, 10).map(([name, path], i) => (
            <div
              key={name}
              className="bg-gray-800 rounded-lg p-4 flex flex-col items-center justify-center border border-gray-700"
              style={{
                opacity: spring({
                  fps: 30,
                  frame: Math.max(0, frame - 30 - i * 3),
                  config: { damping: 12, stiffness: 100 },
                }),
                transform: `translateY(${interpolate(spring({
                  fps: 30,
                  frame: Math.max(0, frame - 30 - i * 3),
                  config: { damping: 12, stiffness: 100 },
                }), [0, 1], [20, 0])}px)`,
              }}
            >
              <img
                src={path}
                alt={name}
                className="w-12 h-12 object-contain mb-2"
              />
              <span className="text-xs text-gray-400 text-center truncate w-full">
                {name}
              </span>
            </div>
          ))}
        </div>

        {/* 设计稿网格 */}
        <h2 className="text-2xl font-semibold text-white mb-4">🖼️ 设计原型 (design-mock/)</h2>
        <div className="grid grid-cols-3 gap-4 mb-8">
          {designMocks.map((mock, i) => (
            <FileCard
              key={mock.name}
              icon="🖼️"
              name={mock.name}
              description={`${mock.type} (${mock.count} 个文件)`}
              delay={60 + i * 8}
            />
          ))}
        </div>

        {/* 源代码网格 */}
        <h2 className="text-2xl font-semibold text-white mb-4">💻 源代码 (src/)</h2>
        <div className="grid grid-cols-3 gap-4">
          {sourceFiles.map((file, i) => (
            <FileCard
              key={file.name}
              icon="📄"
              name={file.name}
              description={file.description}
              delay={100 + i * 8}
            />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/**
 * 功能介绍卡片组件
 */
export const FeatureIntroCard: React.FC<{
  icon: string;
  title: string;
  description: string;
  delay?: number;
}> = ({ icon, title, description, delay = 0 }) => {
  const frame = useCurrentFrame();
  const opacity = spring({
    fps: 30,
    frame: Math.max(0, frame - delay),
    config: { damping: 12, stiffness: 100 },
  });
  const scale = interpolate(opacity, [0, 1], [0.9, 1]);

  return (
    <div
      className="bg-gradient-to-br from-purple-900/50 to-blue-900/50 rounded-2xl p-8 border border-purple-500/30 backdrop-blur"
      style={{ opacity, transform: `scale(${scale})` }}
    >
      <span className="text-7xl block mb-6">{icon}</span>
      <h3 className="text-3xl font-bold text-white mb-4">{title}</h3>
      <p className="text-gray-300 text-xl leading-relaxed">{description}</p>
    </div>
  );
};

export default ProjectFileBrowser;
