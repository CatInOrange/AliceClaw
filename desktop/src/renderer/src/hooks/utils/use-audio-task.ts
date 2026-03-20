/* eslint-disable func-names */
/* eslint-disable no-underscore-dangle */
/* eslint-disable @typescript-eslint/ban-ts-comment */
import { useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAiState } from '@/context/ai-state-context';
import { useSubtitle } from '@/context/subtitle-context';
import { useChatHistory } from '@/context/chat-history-context';
import { audioTaskQueue } from '@/utils/task-queue';
import { audioManager } from '@/utils/audio-manager';
import { toaster } from '@/components/ui/toaster';
import { DisplayText } from '@/services/websocket-service';
import { useLive2DExpression } from '@/hooks/canvas/use-live2d-expression';
import * as LAppDefine from '../../../WebSDK/src/lappdefine';

interface StageDirective {
  type?: string;
  name?: string;
  group?: string;
  index?: number;
}

const parseStageDirectiveString = (value: string): StageDirective | null => {
  const trimmed = String(value || '').trim().replace(/^\[|\]$/g, '');
  if (!trimmed) {
    return null;
  }

  const parts = trimmed
    .split(':')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  const head = String(parts[0] || '').toLowerCase();
  if (['expression', 'expr', 'exp'].includes(head) && parts[1]) {
    return {
      type: 'expression',
      name: parts.slice(1).join(':'),
    };
  }

  if (['motion', 'act'].includes(head)) {
    if (parts.length === 2) {
      const maybeIndex = Number(parts[1]);
      if (Number.isFinite(maybeIndex)) {
        return { type: 'motion', group: '', index: maybeIndex };
      }
      return { type: 'motion', group: parts[1], index: 0 };
    }

    return {
      type: 'motion',
      group: parts[1] || '',
      index: Number(parts[2] || 0) || 0,
    };
  }

  return null;
};

const normalizeStageDirective = (value: unknown): StageDirective | null => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return parseStageDirectiveString(value);
  }

  if (typeof value !== 'object') {
    return null;
  }

  const item = value as Record<string, unknown>;
  const type = String(item.type || item.kind || item.action || '').trim().toLowerCase();
  const expressionName = item.name || item.expression || item.expr || item.value;
  const motionGroup = item.group || item.motionGroup || item.motion || '';
  const motionIndex = item.index ?? item.motionIndex ?? item.no ?? 0;

  if (
    (type === 'expression' || type === 'expr' || type === 'exp'
      || (!type && typeof expressionName === 'string' && !('group' in item)))
    && typeof expressionName === 'string'
  ) {
    return parseStageDirectiveString(expressionName) || {
      type: 'expression',
      name: expressionName,
    };
  }

  if (type === 'motion' || type === 'act' || 'group' in item || 'motion' in item || 'motionGroup' in item) {
    if (typeof motionGroup === 'string' && /^(motion|act):/i.test(motionGroup)) {
      return parseStageDirectiveString(motionGroup);
    }

    return {
      type: 'motion',
      group: String(motionGroup || ''),
      index: Number(motionIndex || 0) || 0,
    };
  }

  return null;
};

interface AudioTaskOptions {
  audioBase64?: string;
  audioUrl?: string;
  audioMimeType?: string;
  displayText?: DisplayText | null;
  directives?: StageDirective[] | null;
  skipTranscriptAppend?: boolean;
}

export const useAudioTask = () => {
  const { t } = useTranslation();
  const { aiState } = useAiState();
  const { setSubtitleText } = useSubtitle();
  const { appendResponse, appendAIMessage } = useChatHistory();
  const { setExpression } = useLive2DExpression();

  const stateRef = useRef({
    aiState,
    setSubtitleText,
    appendResponse,
    appendAIMessage,
  });

  stateRef.current = {
    aiState,
    setSubtitleText,
    appendResponse,
    appendAIMessage,
  };

  const stopCurrentAudioAndLipSync = useCallback(() => {
    audioManager.stopCurrentAudioAndLipSync();
  }, []);

  const createRealtimeLipSyncCleanup = useCallback((audio: HTMLAudioElement, model: any) => {
    const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor || !model) {
      return null;
    }

    try {
      const audioContext = new AudioContextCtor();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.65;
      const captureStream = (audio as any).captureStream?.bind(audio)
        || (audio as any).mozCaptureStream?.bind(audio);
      const stream = captureStream ? captureStream() : null;
      if (!stream) {
        void audioContext.close().catch(() => {});
        return null;
      }

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const data = new Uint8Array(analyser.fftSize);
      let frameId = 0;
      let disposed = false;

      const update = () => {
        if (disposed) {
          return;
        }

        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const normalized = (data[i] - 128) / 128;
          sum += normalized * normalized;
        }

        const rms = Math.sqrt(sum / data.length);
        model._externalLipSyncValue = Math.min(1, rms * 6);

        if (!audio.ended) {
          frameId = requestAnimationFrame(update);
        }
      };

      void audioContext.resume().catch(() => {});
      frameId = requestAnimationFrame(update);

      return () => {
        disposed = true;
        if (frameId) {
          cancelAnimationFrame(frameId);
        }
        model._externalLipSyncValue = null;
        source.disconnect();
        void audioContext.close().catch(() => {});
      };
    } catch (error) {
      console.warn('Failed to initialize realtime lip sync:', error);
      return null;
    }
  }, []);

  const applyStageDirectives = useCallback((directives: StageDirective[] | null | undefined) => {
    if (!directives || directives.length === 0) {
      return;
    }

    const lappAdapter = (window as any).getLAppAdapter?.();
    const model = lappAdapter?.getModel?.() || (window as any).getLive2DManager?.()?.getModel?.(0);

    directives
      .map(normalizeStageDirective)
      .filter((directive): directive is StageDirective => Boolean(directive))
      .forEach((directive) => {
        if (!directive?.type) {
          return;
        }

        if ((directive.type === 'expression' || directive.type === 'expr' || directive.type === 'exp') && directive.name && lappAdapter) {
          setExpression(directive.name, lappAdapter);
          return;
        }

        if ((directive.type === 'motion' || directive.type === 'act') && model) {
          const priority = LAppDefine?.PriorityNormal ?? 3;
          const group = String(directive.group || '');
          const index = Number(directive.index || 0) || 0;
          try {
            if (lappAdapter?.startMotion) {
              lappAdapter.startMotion(group, index, priority);
            } else {
              model.startMotion(group, index, priority);
            }
          } catch (error) {
            console.warn('Failed to start motion:', error);
          }
        }
      });
  }, [setExpression]);

  const handleAudioPlayback = (options: AudioTaskOptions): Promise<void> => new Promise((resolve) => {
    const {
      aiState: currentAiState,
      setSubtitleText: updateSubtitle,
      appendResponse: appendText,
      appendAIMessage: appendAI,
    } = stateRef.current;

    if (currentAiState === 'interrupted') {
      resolve();
      return;
    }

    const {
      audioBase64,
      audioUrl,
      audioMimeType,
      displayText,
      directives,
      skipTranscriptAppend,
    } = options;

    if (displayText) {
      if (!skipTranscriptAppend) {
        appendText(displayText.text);
        appendAI(displayText.text, displayText.name, displayText.avatar);
      }
      updateSubtitle(displayText.text);
    }

    applyStageDirectives(directives);

    const audioSource = audioUrl || (audioBase64 ? `data:${audioMimeType || 'audio/wav'};base64,${audioBase64}` : '');
    if (!audioSource) {
      resolve();
      return;
    }

    try {
      const lappAdapter = (window as any).getLAppAdapter?.();
      const model = lappAdapter?.getModel?.() || (window as any).getLive2DManager?.()?.getModel?.(0);
      if (!model) {
        resolve();
        return;
      }

      const audio = new Audio(audioSource);
      audio.crossOrigin = 'anonymous';
      let lipSyncCleanup: (() => void) | null = null;

      let isFinished = false;
      const cleanup = () => {
        audioManager.clearCurrentAudio(audio);
        if (!isFinished) {
          isFinished = true;
          resolve();
        }
      };

      const lipSyncScale = 2.0;
      audio.addEventListener('canplaythrough', () => {
        if (stateRef.current.aiState === 'interrupted' || !audioManager.hasCurrentAudio()) {
          cleanup();
          return;
        }

        const canUseWavLipSync = (audioMimeType || '').includes('wav')
          || /^data:audio\/(?:x-)?wav/i.test(audioSource)
          || /\.wav(?:[?#].*)?$/i.test(audioSource);
        audio.play()
          .then(() => {
            if (stateRef.current.aiState === 'interrupted' || !audioManager.hasCurrentAudio()) {
              cleanup();
              return;
            }

            if (model._wavFileHandler && canUseWavLipSync) {
              if (!model._wavFileHandler._initialized) {
                model._wavFileHandler._initialized = true;
                const originalUpdate = model._wavFileHandler.update.bind(model._wavFileHandler);
                model._wavFileHandler.update = function (deltaTimeSeconds: number) {
                  const result = originalUpdate(deltaTimeSeconds);
                  // @ts-ignore
                  this._lastRms = Math.min(2.0, this._lastRms * lipSyncScale);
                  return result;
                };
              }
              if (audioManager.hasCurrentAudio()) {
                model._wavFileHandler.start(audioSource);
              }
            } else {
              lipSyncCleanup = createRealtimeLipSyncCleanup(audio, model);
            }

            if (
              LAppDefine?.PriorityNormal
              && !(directives || [])
                .map(normalizeStageDirective)
                .some((directive) => directive?.type === 'motion' || directive?.type === 'act')
            ) {
              model.startRandomMotion('Talk', LAppDefine.PriorityNormal);
            }
          })
          .catch((err) => {
            console.error('Audio play error:', err);
            cleanup();
          });
      });

      audioManager.setCurrentAudio(audio, model, () => {
        if (lipSyncCleanup) {
          lipSyncCleanup();
          lipSyncCleanup = null;
        }
        model._externalLipSyncValue = null;
      });

      audio.addEventListener('ended', cleanup);
      audio.addEventListener('error', cleanup);
      audio.load();
    } catch (error) {
      console.error('Audio playback setup error:', error);
      toaster.create({
        title: `${t('error.audioPlayback')}: ${error}`,
        type: 'error',
        duration: 2000,
      });
      resolve();
    }
  });

  const addAudioTask = async (options: AudioTaskOptions) => {
    const { aiState: currentState } = stateRef.current;
    if (currentState === 'interrupted') {
      return;
    }
    audioTaskQueue.addTask(() => handleAudioPlayback(options));
  };

  return {
    addAudioTask,
    stopCurrentAudioAndLipSync,
  };
};
