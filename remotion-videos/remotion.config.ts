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

// 配置静态文件目录，包含整个项目根目录
// 这样可以通过 staticFile('../assets/...') 访问 voice-pilot 根目录的文件
Config.setPublicDir("./public");

// 配置输出目录
Config.setOutputDir("./out");

// 设置浏览器启动参数（用于截图 HTML 设计稿）
Config.setChromiumOptions({
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
  ],
});

// 启用更高的并发渲染（根据机器性能调整）
Config.setConcurrency(4);

// 缓存目录设置，加快重复渲染
Config.setCacheDirectory("./node_modules/.remotion-cache");
