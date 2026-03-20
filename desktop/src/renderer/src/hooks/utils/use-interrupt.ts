import { useAiState } from '@/context/ai-state-context';
import { useSubtitle } from '@/context/subtitle-context';
import { useLunariaRuntime } from '@/runtime/lunaria-runtime';

export const useInterrupt = () => {
  const { aiState, setAiState } = useAiState();
  const runtime = useLunariaRuntime();
  const { subtitleText, setSubtitleText } = useSubtitle();

  const interrupt = (sendSignal = true) => {
    if (aiState !== 'thinking-speaking') return;
    console.log('Interrupting conversation chain');

    setAiState('interrupted');

    if (sendSignal) {
      runtime.interrupt();
    }

    if (subtitleText === 'Thinking...') {
      setSubtitleText('');
    }
    console.log('Interrupted!');
  };

  return { interrupt };
};
