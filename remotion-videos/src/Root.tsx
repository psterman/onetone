import { Composition } from "remotion";
import { OneToneIntro } from "./Composition";

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="OneToneIntro"
        component={OneToneIntro}
        durationInFrames={330} // 11秒 @ 30fps
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
