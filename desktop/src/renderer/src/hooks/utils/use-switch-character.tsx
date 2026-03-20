import { useCallback } from 'react';
import { useConfig } from '@/context/character-config-context';
import { useInterrupt } from '@/components/canvas/live2d';
import { useVAD } from '@/context/vad-context';
import { useSubtitle } from '@/context/subtitle-context';
import { useAiState } from '@/context/ai-state-context';
import { useLive2DConfig } from '@/context/live2d-config-context';
import { useLunariaRuntime } from '@/runtime/lunaria-runtime';

export function useSwitchCharacter() {
  const runtime = useLunariaRuntime();
  const { confName, getFilenameByName } = useConfig();
  const { interrupt } = useInterrupt();
  const { stopMic } = useVAD();
  const { setSubtitleText } = useSubtitle();
  const { setAiState } = useAiState();
  const { setModelInfo } = useLive2DConfig();
  const switchCharacter = useCallback((fileName: string) => {
    const currentFilename = getFilenameByName(confName);

    if (currentFilename === fileName) {
      console.log('Skipping character switch - same configuration file');
      return;
    }

    setSubtitleText('New Character Loading...');
    interrupt();
    stopMic();
    setAiState('loading');
    setModelInfo(undefined);
    void runtime.switchModel(fileName);
    console.log('Switch Character fileName: ', fileName);
  }, [confName, getFilenameByName, runtime, interrupt, stopMic, setSubtitleText, setAiState, setModelInfo]);

  return { switchCharacter };
}
