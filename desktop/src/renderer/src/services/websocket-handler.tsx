import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import {
  LunariaManifest,
  LunariaMessage,
  LunariaProvider,
  ChatAttachmentInput,
  buildBackendUrl,
  createSession,
  fetchManifest,
  fetchMessages,
  fetchSessions,
  normalizeBaseUrl,
  openEventsStream,
  selectSession,
  streamChat,
} from '@/services/openclaw-api';
import {
  WebSocketContext,
  HistoryInfo,
  defaultBaseUrl,
} from '@/context/websocket-context';
import { DesktopRuntimeContext } from '@/context/desktop-runtime-context';
import { ModelInfo, useLive2DConfig } from '@/context/live2d-config-context';
import { useSubtitle } from '@/context/subtitle-context';
import { audioTaskQueue } from '@/utils/task-queue';
import { useAudioTask } from '@/components/canvas/live2d';
import { useBgUrl } from '@/context/bgurl-context';
import { useConfig } from '@/context/character-config-context';
import { useChatHistory } from '@/context/chat-history-context';
import { toaster } from '@/components/ui/toaster';
import { useAiState, AiStateEnum } from '@/context/ai-state-context';
import { useLocalStorage } from '@/hooks/utils/use-local-storage';
import { Message } from '@/services/websocket-service';
import { createPluginRuntime } from '@/runtime/plugin-runtime';
import { applyPersistentToggleState, playExpression, playMotion } from '@/runtime/live2d-bridge';
import { resolveProviderFieldState } from '@/runtime/provider-field-state.mjs';
import {
  getQuickActionLabel,
  useAppStore,
} from '@/runtime/app-store';

function mapManifestToModelInfo(
  manifest: LunariaManifest,
  backendUrl: string,
): ModelInfo {
  const expressions = manifest.model.expressions || [];
  const defaultEmotion = expressions.find((expression) => {
    const name = String(expression.name || '').trim().toLowerCase();
    return ['default', 'normal', 'neutral', 'idle', 'base', 'standard'].includes(name);
  })?.name;

  return {
    name: manifest.model.name,
    url: buildBackendUrl(backendUrl, manifest.model.modelJson),
    kScale: 0.5,
    initialXshift: 0,
    initialYshift: 0,
    idleMotionGroupName: 'Idle',
    defaultEmotion,
    emotionMap: Object.fromEntries(
      expressions.map((expression) => [expression.name, expression.name]),
    ),
    lipSyncParamId: manifest.model.lipSyncParamId || 'ParamMouthOpenY',
    pointerInteractive: true,
    scrollToResize: true,
  };
}

function mapSessionToHistory(session: {
  id: string;
  updatedAt: number;
}, latestMessage?: LunariaMessage | null): HistoryInfo {
  const latestMessageTimestamp = latestMessage?.createdAt
    ? new Date(latestMessage.createdAt * 1000).toISOString()
    : null;
  const latestMessageRole = latestMessage?.role === 'assistant' ? 'ai' : 'human';

  return {
    uid: session.id,
    latest_message: latestMessage
      ? {
        role: latestMessageRole,
        timestamp: latestMessageTimestamp || new Date(session.updatedAt * 1000).toISOString(),
        content: latestMessage.text || '',
      }
      : null,
    timestamp: latestMessageTimestamp || new Date(session.updatedAt * 1000).toISOString(),
  };
}

function mapBackendMessageToUi(message: LunariaMessage): Message {
  return {
    id: message.id,
    content: message.text || '',
    role: message.role === 'assistant' ? 'ai' : 'human',
    timestamp: new Date((message.createdAt || Date.now()) * 1000).toISOString(),
    name: message.role === 'assistant' ? message.meta || 'Assistant' : 'Me',
    attachments: message.attachments || [],
    type: 'text',
  };
}

function getProviderFieldPayload(
  provider: LunariaProvider | null,
  values: Record<string, string>,
): Record<string, string> {
  if (!provider) {
    return {};
  }

  const payload: Record<string, string> = {};
  for (const field of provider.fields || []) {
    const value = values[`${provider.id}.${field.key}`];
    if (value !== undefined) {
      payload[field.key] = value;
    }
  }
  return payload;
}

function getPlayableAudioSource(
  backendUrl: string,
  message: LunariaMessage,
): { audioUrl?: string; audioBase64?: string; audioMimeType?: string } | null {
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const audioAttachment = attachments.find((attachment) => {
    const kind = String(attachment.kind || '').toLowerCase();
    const mimeType = String(attachment.mimeType || '');
    return kind === 'audio' || mimeType.startsWith('audio/');
  });

  if (!audioAttachment) {
    return null;
  }

  if (audioAttachment.url) {
    return {
      audioUrl: buildBackendUrl(backendUrl, audioAttachment.url),
      audioMimeType: audioAttachment.mimeType || 'audio/mpeg',
    };
  }

  if (audioAttachment.data) {
    return {
      audioBase64: audioAttachment.data,
      audioMimeType: audioAttachment.mimeType || 'audio/mpeg',
    };
  }

  return null;
}

function WebSocketHandler({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [wsState, setWsState] = useState<string>('CLOSED');
  const [backendUrl, setBackendUrl] = useLocalStorage<string>(
    'openclawBackendUrl',
    defaultBaseUrl,
  );
  const [manifest, setManifest] = useState<LunariaManifest | null>(null);
  const [currentProviderId, setCurrentProviderIdState] = useLocalStorage<string>(
    'openclawProviderId',
    '',
  );
  const [providerFieldValues, setProviderFieldValues] = useLocalStorage<Record<string, string>>(
    'openclawProviderFieldValues',
    {},
  );
  const [providerFieldManifestValues, setProviderFieldManifestValues] = useLocalStorage<Record<string, string>>(
    'openclawProviderManifestFieldValues',
    {},
  );
  const [ttsEnabled, setTtsEnabled] = useLocalStorage<boolean>(
    'openclawTtsEnabled',
    true,
  );
  const [ttsProvider, setTtsProviderState] = useLocalStorage<string>(
    'openclawTtsProvider',
    '',
  );
  const { setAiState } = useAiState();
  const { setModelInfo } = useLive2DConfig();
  const { setSubtitleText } = useSubtitle();
  const { addAudioTask, stopCurrentAudioAndLipSync } = useAudioTask();
  const bgUrlContext = useBgUrl();
  const { setConfName, setConfUid, setConfigFiles } = useConfig();
  const {
    appendAIMessage,
    appendHumanMessage,
    appendResponse,
    clearResponse,
    currentHistoryUid,
    messages,
    setCurrentHistoryUid,
    setHistoryList,
    setMessages,
    updateHistoryList,
  } = useChatHistory();
  const {
    syncBackendUrl,
    hydrateManifest,
    setPlugins,
    setPluginLoadState,
    appendPluginLog,
  } = useAppStore(useShallow((state) => ({
    syncBackendUrl: state.setBackendUrl,
    hydrateManifest: state.hydrateManifest,
    setPlugins: state.setPlugins,
    setPluginLoadState: state.setPluginLoadState,
    appendPluginLog: state.appendPluginLog,
  })));

  const currentHistoryUidRef = useRef<string | null>(currentHistoryUid);
  const messagesRef = useRef(messages);
  const eventStreamCleanupRef = useRef<(() => void) | null>(null);
  const currentChatAbortRef = useRef<AbortController | null>(null);
  const streamingVisibleTextRef = useRef('');
  const streamingSessionIdRef = useRef<string | null>(null);
  const backendUrlRef = useRef(normalizeBaseUrl(backendUrl));
  const sendChatRef = useRef<(payload: {
    text: string;
    attachments?: ChatAttachmentInput[];
  }) => Promise<void>>(async () => {});
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const pluginRuntimeRef = useRef<ReturnType<typeof createPluginRuntime> | null>(null);

  useEffect(() => {
    currentHistoryUidRef.current = currentHistoryUid;
  }, [currentHistoryUid]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    backendUrlRef.current = normalizeBaseUrl(backendUrl);
  }, [backendUrl]);

  useEffect(() => {
    let cancelled = false;

    const applyConfiguredBackendUrl = async () => {
      const configuredBackendUrl = await (window as any)?.api?.getConfiguredBackendUrl?.();
      if (cancelled || !configuredBackendUrl) {
        return;
      }

      const normalizedConfiguredBackendUrl = normalizeBaseUrl(configuredBackendUrl);
      if (normalizedConfiguredBackendUrl !== normalizeBaseUrl(backendUrlRef.current)) {
        setBackendUrl(normalizedConfiguredBackendUrl);
      }
    };

    void applyConfiguredBackendUrl();

    return () => {
      cancelled = true;
    };
  }, [setBackendUrl]);

  useEffect(() => {
    syncBackendUrl(backendUrl);
  }, [backendUrl, syncBackendUrl]);

  const setCurrentProviderId = useCallback((providerId: string) => {
    setCurrentProviderIdState(providerId);
  }, [setCurrentProviderIdState]);

  const setProviderFieldValue = useCallback((
    providerId: string,
    fieldKey: string,
    value: string,
  ) => {
    setProviderFieldValues((prev) => ({
      ...prev,
      [`${providerId}.${fieldKey}`]: value,
    }));
  }, [setProviderFieldValues]);

  const currentProvider = useMemo(() => (
    manifest?.model.chat.providers.find((provider) => provider.id === currentProviderId)
    || manifest?.model.chat.providers[0]
    || null
  ), [manifest, currentProviderId]);

  const applyManifest = useCallback((nextManifest: LunariaManifest) => {
    setManifest(nextManifest);
    hydrateManifest(nextManifest);
    setConfUid(nextManifest.selectedModelId);
    setConfName(nextManifest.model.name);
    setConfigFiles(
      (nextManifest.models || []).map((model) => ({
        filename: model.id,
        name: model.name,
      })),
    );
    setModelInfo(mapManifestToModelInfo(nextManifest, backendUrlRef.current));
    setProviderFieldValues((prev) => {
      const nextProviderFieldState = resolveProviderFieldState({
        manifest: nextManifest,
        previousValues: prev,
        previousManifestValues: providerFieldManifestValues,
      });
      setProviderFieldManifestValues(nextProviderFieldState.manifestValues);
      return nextProviderFieldState.values;
    });

    const preferredProviderId = (currentProviderId
      && nextManifest.model.chat.providers.some((provider) => provider.id === currentProviderId))
      ? currentProviderId
      : nextManifest.model.chat.defaultProviderId;

    setCurrentProviderIdState(preferredProviderId);
    if (!ttsProvider) {
      setTtsProviderState(nextManifest.model.chat.tts.provider || '');
    }
  }, [
    currentProviderId,
    hydrateManifest,
    setConfName,
    setConfUid,
    setConfigFiles,
    setCurrentProviderIdState,
    setModelInfo,
    setProviderFieldValues,
    setTtsProviderState,
    ttsProvider,
  ]);

  const loadHistory = useCallback(async (historyId: string) => {
    if (!historyId) {
      return;
    }
    await selectSession(backendUrlRef.current, historyId);
    const nextMessages = await fetchMessages(backendUrlRef.current, historyId);
    setCurrentHistoryUid(historyId);
    setMessages(nextMessages.map(mapBackendMessageToUi));
  }, [setCurrentHistoryUid, setMessages]);

  const refreshHistories = useCallback(async (preferredHistoryId?: string) => {
    const response = await fetchSessions(backendUrlRef.current);
    const histories = await Promise.all(
      (response.sessions || []).map(async (session) => {
        try {
          const sessionMessages = await fetchMessages(backendUrlRef.current, session.id);
          const latestMessage = sessionMessages[sessionMessages.length - 1] || null;
          return mapSessionToHistory(session, latestMessage);
        } catch (error) {
          console.warn(`Failed to load session preview for ${session.id}:`, error);
          return mapSessionToHistory(session);
        }
      }),
    );
    setHistoryList(histories);

    const targetHistoryId = preferredHistoryId
      || response.currentId
      || response.sessions?.[0]?.id
      || null;

    if (!targetHistoryId) {
      setCurrentHistoryUid(null);
      setMessages([]);
      return;
    }

    await loadHistory(targetHistoryId);
  }, [loadHistory, setCurrentHistoryUid, setHistoryList, setMessages]);

  const createHistory = useCallback(async () => {
    if (currentHistoryUidRef.current && messagesRef.current.length > 0) {
      const latestMessage = messagesRef.current[messagesRef.current.length - 1];
      updateHistoryList(currentHistoryUidRef.current, latestMessage);
    }
    const session = await createSession(backendUrlRef.current);
    await refreshHistories(session.id);
    clearResponse();
    setSubtitleText('');
    setAiState(AiStateEnum.IDLE);
  }, [clearResponse, refreshHistories, setAiState, setSubtitleText, updateHistoryList]);

  const interrupt = useCallback(() => {
    currentChatAbortRef.current?.abort();
    currentChatAbortRef.current = null;
    streamingVisibleTextRef.current = '';
    streamingSessionIdRef.current = null;
    stopCurrentAudioAndLipSync();
    if (musicAudioRef.current) {
      try {
        musicAudioRef.current.pause();
        musicAudioRef.current.currentTime = 0;
      } catch {}
      musicAudioRef.current = null;
    }
    audioTaskQueue.clearQueue();
    clearResponse();
    if (currentHistoryUidRef.current) {
      void refreshHistories(currentHistoryUidRef.current);
    }
    setAiState(AiStateEnum.INTERRUPTED);
  }, [
    clearResponse,
    refreshHistories,
    setAiState,
    stopCurrentAudioAndLipSync,
  ]);

  const stopMusic = useCallback(async () => {
    if (!musicAudioRef.current) {
      return;
    }
    try {
      musicAudioRef.current.pause();
      musicAudioRef.current.currentTime = 0;
      musicAudioRef.current.src = '';
    } catch {}
    musicAudioRef.current = null;
  }, []);

  const playMusic = useCallback(async (payload?: { url?: string; trackId?: string }) => {
    const nextUrl = String(payload?.url || payload?.trackId || '').trim();
    if (!nextUrl) {
      return;
    }

    await stopMusic();
    const audio = new Audio(nextUrl);
    audio.preload = 'auto';
    audio.loop = true;
    audio.volume = 0.35;
    await audio.play();
    musicAudioRef.current = audio;
  }, [stopMusic]);

  const sendToUser = useCallback((text: string, attachments?: Array<{
    kind?: string;
    mimeType?: string;
    url?: string;
    data?: string;
    filename?: string;
  }>) => {
    const nextMessage: Message = {
      id: `plugin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content: String(text || ''),
      role: 'ai',
      timestamp: new Date().toISOString(),
      name: manifest?.model.name || 'Assistant',
      attachments: attachments || [],
      type: 'text',
    };

    setMessages([
      ...messagesRef.current,
      nextMessage,
    ]);
    setSubtitleText(String(text || ''));
  }, [manifest?.model.name, setMessages, setSubtitleText]);

  const executeActions = useCallback(async (actions: unknown[]) => {
    if (!pluginRuntimeRef.current) {
      return;
    }
    await pluginRuntimeRef.current.dispatchActions(actions, {
      playMusic,
      stopMusic,
    });
  }, [playMusic, stopMusic]);

  const triggerQuickAction = useCallback(async (action: Record<string, unknown>) => {
    const type = String(action.type || '').trim().toLowerCase();
    if (type === 'motion') {
      playMotion(String(action.group || ''), Number(action.index || 0) || 0);
      return;
    }

    if (type === 'expression') {
      playExpression(String(action.name || ''));
      return;
    }

    if (type === 'play_music') {
      await playMusic({
        url: action.url ? String(action.url) : undefined,
        trackId: action.trackId ? String(action.trackId) : undefined,
      });
      return;
    }

    if (type === 'stop_music') {
      await stopMusic();
      return;
    }

    if (type === 'call' || type === 'plugin.call' || action.tool || action.name) {
      await executeActions([{
        ...action,
        type: type || 'call',
      }]);
      return;
    }

    appendPluginLog(`Ignored quick action: ${getQuickActionLabel(action)}`);
  }, [appendPluginLog, executeActions, playMusic, stopMusic]);

  const sendChat = useCallback(async (payload: {
    text: string;
    attachments?: ChatAttachmentInput[];
  }) => {
    const text = String(payload.text || '').trim();
    const attachments = payload.attachments || [];
    if (!text && attachments.length === 0) {
      return;
    }

    if (!manifest) {
      toaster.create({
        title: t('error.characterConfigNotFound'),
        type: 'error',
        duration: 2000,
      });
      return;
    }

    let sessionId = currentHistoryUidRef.current;
    if (!sessionId) {
      const session = await createSession(backendUrlRef.current);
      sessionId = session.id;
      await refreshHistories(sessionId);
    }

    if (!sessionId) {
      return;
    }

    await selectSession(backendUrlRef.current, sessionId);

    if (text) {
      appendHumanMessage(text);
    }
    clearResponse();
    setAiState(AiStateEnum.THINKING_SPEAKING);
    setSubtitleText(text ? 'Thinking...' : '');
    streamingVisibleTextRef.current = '';
    streamingSessionIdRef.current = sessionId;

    const controller = new AbortController();
    currentChatAbortRef.current = controller;

    const provider = currentProvider
      || manifest.model.chat.providers.find(
        (item) => item.id === manifest.model.chat.defaultProviderId,
      )
      || null;

    try {
      await streamChat(
        backendUrlRef.current,
        {
          sessionId,
          modelId: manifest.selectedModelId,
          providerId: provider?.id || manifest.model.chat.defaultProviderId,
          text,
          historyText: text,
          attachments,
          ttsEnabled,
          ttsProvider,
          assistantMeta: manifest.model.name,
          messageSource: 'chat',
          ...getProviderFieldPayload(provider, providerFieldValues),
        },
        {
          signal: controller.signal,
          onEvent: (event) => {
            if (event.event === 'start') {
              setAiState(AiStateEnum.THINKING_SPEAKING);
              return;
            }

            if (event.event === 'chunk') {
              const nextVisibleText = event.data.visibleText || '';
              const previousVisibleText = streamingVisibleTextRef.current;
              const deltaText = nextVisibleText.startsWith(previousVisibleText)
                ? nextVisibleText.slice(previousVisibleText.length)
                : nextVisibleText;

              if (deltaText) {
                appendResponse(deltaText);
                appendAIMessage(deltaText, manifest.model.name);
              }

              streamingVisibleTextRef.current = nextVisibleText;
              setSubtitleText(nextVisibleText);
              return;
            }

            if (event.event === 'timeline') {
              const unit = event.data.unit;
              addAudioTask({
                audioUrl: unit.audioUrl
                  ? buildBackendUrl(backendUrlRef.current, unit.audioUrl)
                  : '',
                audioMimeType: unit.contentType || '',
                displayText: unit.text
                  ? {
                    text: unit.text,
                    name: manifest.model.name,
                    avatar: '',
                  }
                  : null,
                directives: (unit.directives || []) as Array<Record<string, unknown>>,
                skipTranscriptAppend: true,
              });
              return;
            }

            if (event.event === 'action') {
              const actions = Array.isArray(event.data.actions)
                ? event.data.actions
                : [];
              if (actions.length > 0) {
                void executeActions(actions);
              }
              return;
            }

            if (event.event === 'error') {
              throw new Error(event.data.error || 'stream error');
            }
          },
        },
      );

      await audioTaskQueue.waitForCompletion();
      await refreshHistories(sessionId);
      setSubtitleText(streamingVisibleTextRef.current);
      setAiState(AiStateEnum.IDLE);
    } catch (error) {
      if (controller.signal.aborted) {
        setAiState(AiStateEnum.IDLE);
        return;
      }

      console.error('Chat stream failed:', error);
      toaster.create({
        title: `${t('error.messageSendFailed')}: ${error}`,
        type: 'error',
        duration: 2500,
      });
      setAiState(AiStateEnum.IDLE);
    } finally {
      currentChatAbortRef.current = null;
      streamingVisibleTextRef.current = '';
      streamingSessionIdRef.current = null;
    }
  }, [
    addAudioTask,
    appendAIMessage,
    appendHumanMessage,
    appendResponse,
    clearResponse,
    currentProvider,
    executeActions,
    manifest,
    providerFieldValues,
    refreshHistories,
    setAiState,
    setSubtitleText,
    t,
    ttsEnabled,
    ttsProvider,
  ]);

  useEffect(() => {
    sendChatRef.current = sendChat;
  }, [sendChat]);

  useEffect(() => {
    pluginRuntimeRef.current = createPluginRuntime({
      listPlugins: async () => window.api?.listPlugins?.() || { items: [] },
      sendToAI: async (payload) => {
        await sendChatRef.current({
          text: payload.text,
          attachments: payload.attachments,
        });
      },
      sendToUser,
      capturePrimaryScreen: async () => window.api?.capturePrimaryScreen?.() || null,
      onLog: appendPluginLog,
    });
  }, [appendPluginLog, sendToUser]);

  useEffect(() => {
    let frameId = 0;
    const tick = () => {
      const state = useAppStore.getState();
      applyPersistentToggleState(state.persistentToggleState, state.persistentToggles);
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  const switchModel = useCallback(async (modelId: string) => {
    setAiState(AiStateEnum.LOADING);
    interrupt();
    const nextManifest = await fetchManifest(backendUrlRef.current, modelId);
    applyManifest(nextManifest);
    await createHistory();
    setAiState(AiStateEnum.IDLE);
    setSubtitleText(t('notification.characterLoaded'));
  }, [applyManifest, createHistory, interrupt, setAiState, setSubtitleText, t]);

  const reconnect = useCallback(async () => {
    eventStreamCleanupRef.current?.();
    eventStreamCleanupRef.current = null;

    try {
      setWsState('CONNECTING');
      setPluginLoadState('loading');
      const nextManifest = await fetchManifest(backendUrlRef.current);
      applyManifest(nextManifest);
      await refreshHistories();
      const pluginItems = await pluginRuntimeRef.current?.refreshCatalog?.() || [];
      setPlugins(pluginItems as any);
      setPluginLoadState('ready');
      bgUrlContext?.setBackgroundFiles([]);

      eventStreamCleanupRef.current = openEventsStream(backendUrlRef.current, {
        since: 0,
        onOpen: () => {
          setWsState('OPEN');
        },
        onError: () => {
          setWsState('CLOSED');
        },
        onEvent: (event) => {
          if (event.type !== 'message.created') {
            return;
          }

          const payload = event.payload as { message?: LunariaMessage };
          const message = payload.message;
          if (!message?.sessionId) {
            return;
          }

          if (streamingSessionIdRef.current === message.sessionId) {
            return;
          }

          if (message.sessionId === currentHistoryUidRef.current) {
            const exists = messagesRef.current.some((item) => item.id === message.id);
            if (!exists) {
              const nextUiMessage = mapBackendMessageToUi(message);
              setMessages([
                ...messagesRef.current,
                nextUiMessage,
              ]);

              const playbackSource = getPlayableAudioSource(backendUrlRef.current, message);
              if (message.role === 'assistant' && playbackSource) {
                addAudioTask({
                  ...playbackSource,
                  displayText: message.text
                    ? {
                      text: message.text,
                      name: message.meta || manifest?.model.name || 'Assistant',
                      avatar: '',
                    }
                    : null,
                  skipTranscriptAppend: true,
                });
              }
            }
          }

          void refreshHistories(currentHistoryUidRef.current || undefined);
        },
      });

      if (!bgUrlContext?.backgroundUrl) {
        bgUrlContext?.setBackgroundUrl('');
      }
    } catch (error) {
      console.error('Failed to initialize desktop frontend:', error);
      setWsState('CLOSED');
      setPluginLoadState('error');
      toaster.create({
        title: `${t('error.websocketConnectionFailed')}: ${error}`,
        type: 'error',
        duration: 2500,
      });
    }
  }, [
    addAudioTask,
    applyManifest,
    bgUrlContext,
    manifest?.model.name,
    refreshHistories,
    setMessages,
    setPluginLoadState,
    setPlugins,
    t,
  ]);

  useEffect(() => {
    void reconnect();
    return () => {
      eventStreamCleanupRef.current?.();
      currentChatAbortRef.current?.abort();
    };
  }, [backendUrl]);

  const webSocketContextValue = useMemo(() => ({
    wsState,
    reconnect,
    backendUrl,
    setBackendUrl,
    baseUrl: backendUrl,
    setBaseUrl: setBackendUrl,
    manifest,
    currentProvider,
    currentProviderId,
    setCurrentProviderId,
    providerFieldValues,
    setProviderFieldValue,
    ttsEnabled,
    setTtsEnabled,
    ttsProvider,
    setTtsProvider: setTtsProviderState,
    createHistory,
    loadHistory,
    sendChat,
    switchModel,
    interrupt,
  }), [
    backendUrl,
    createHistory,
    currentProvider,
    currentProviderId,
    interrupt,
    loadHistory,
    manifest,
    providerFieldValues,
    reconnect,
    sendChat,
    setBackendUrl,
    setCurrentProviderId,
    setProviderFieldValue,
    switchModel,
    ttsEnabled,
    ttsProvider,
  ]);

  return (
    <WebSocketContext.Provider value={webSocketContextValue}>
      <DesktopRuntimeContext.Provider
        value={{
          executeActions,
          triggerQuickAction: async (action) => {
            await triggerQuickAction(action as Record<string, unknown>);
          },
          playMusic,
          stopMusic,
        }}
      >
        {children}
      </DesktopRuntimeContext.Provider>
    </WebSocketContext.Provider>
  );
}

export default WebSocketHandler;
