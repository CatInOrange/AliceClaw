import { useCallback } from 'react';
import { toaster } from '@/components/ui/toaster';

export function useTriggerSpeak() {
  const sendTriggerSignal = useCallback(
    async (actualIdleTime: number) => {
      void actualIdleTime;
      toaster.create({
        title: '当前版本暂未接入主动触发说话',
        type: 'warning',
        duration: 2000,
      });
    },
    [],
  );

  return {
    sendTriggerSignal,
  };
}
