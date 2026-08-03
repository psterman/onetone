/**
 * Voice-Pilot Remotion 视频根组件
 * 
 * 在这里注册所有可用的视频 Composition
 */

import { Composition } from "remotion";
import { OneToneIntro } from "./Composition";
import { ProjectFileBrowser } from "./components/ProjectFileBrowser";
import { VibeCodingScene } from "./VibeCodingScene";

export const RemotionRoot = () => {
  return (
    <>
      {/* ========== 品牌宣传视频 ========== */}
      <Composition
        id="OneToneIntro"
        component={OneToneIntro}
        durationInFrames={330} // 11秒 @ 30fps
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />

      {/* ========== 项目文件预览 ========== */}
      <Composition
        id="ProjectFileBrowser"
        component={ProjectFileBrowser}
        durationInFrames={180} // 6秒 @ 30fps
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />

      {/* ========== VibeCoding 场景 ========== */}
      <Composition
        id="VibeCodingScene"
        component={VibeCodingScene}
        durationInFrames={300} // 10秒 @ 30fps
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
    </>
  );
};
