/**
 * Voice-Pilot Remotion 视频系统配置
 * 
 * 配置允许访问整个 voice-pilot 项目的文件：
 * - assets/      - 图标、图片资源
 * - design-mock/ - 设计原型 HTML
 * - src/         - 源代码
 * - docs/        - 文档
 */

import { Config } from "@remotion/cli/config";
import { enableTailwind } from '@remotion/tailwind-v4';

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.overrideBundlerConfig(enableTailwind);
