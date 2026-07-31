import './index.css';
import { Composition } from 'remotion';
import { OneToneIntro } from './Composition';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id='OneToneIntroMale'
        component={OneToneIntro}
        defaultProps={{ persona: 'male' }}
        durationInFrames={450}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id='OneToneIntroFemale'
        component={OneToneIntro}
        defaultProps={{ persona: 'female' }}
        durationInFrames={450}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
