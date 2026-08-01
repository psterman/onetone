import {Composition} from "remotion";
import {FirstVideo} from "./FirstVideo";

export const RemotionRoot = () => {
  return (
    <Composition
      id="FirstVideo"
      component={FirstVideo}
      durationInFrames={180}
      fps={30}
      width={1920}
      height={432}
    />
  );
};
