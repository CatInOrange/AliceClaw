/* eslint-disable react/jsx-no-constructed-context-values */
import React, { useContext } from 'react';
import {
  ChatAttachmentInput,
  LunariaManifest,
  LunariaProvider,
} from '@/services/openclaw-api';

export interface HistoryInfo {
  uid: string;
  latest_message: {
    role: 'human' | 'ai' | 'system';
    timestamp: string;
    content: string;
  } | null;
  timestamp: string | null;
}

interface WebSocketContextProps {
  wsState: string;
  reconnect: () => Promise<void>;
  backendUrl: string;
  setBackendUrl: (url: string) => void;
  baseUrl: string;
  setBaseUrl: (url: string) => void;
  manifest: LunariaManifest | null;
  currentProvider: LunariaProvider | null;
  currentProviderId: string;
  setCurrentProviderId: (providerId: string) => void;
  providerFieldValues: Record<string, string>;
  setProviderFieldValue: (
    providerId: string,
    fieldKey: string,
    value: string,
  ) => void;
  ttsEnabled: boolean;
  setTtsEnabled: (enabled: boolean) => void;
  ttsProvider: string;
  setTtsProvider: (providerId: string) => void;
  createHistory: () => Promise<void>;
  loadHistory: (historyId: string) => Promise<void>;
  sendChat: (payload: {
    text: string;
    attachments?: ChatAttachmentInput[];
  }) => Promise<void>;
  switchModel: (modelId: string) => Promise<void>;
  interrupt: () => void;
}

export const WebSocketContext = React.createContext<WebSocketContextProps>({
  wsState: 'CLOSED',
  reconnect: async () => { },
  backendUrl: 'http://127.0.0.1:18080',
  setBackendUrl: () => { },
  baseUrl: 'http://127.0.0.1:18080',
  setBaseUrl: () => { },
  manifest: null,
  currentProvider: null,
  currentProviderId: '',
  setCurrentProviderId: () => { },
  providerFieldValues: {},
  setProviderFieldValue: () => { },
  ttsEnabled: true,
  setTtsEnabled: () => { },
  ttsProvider: '',
  setTtsProvider: () => { },
  createHistory: async () => { },
  loadHistory: async () => { },
  sendChat: async () => { },
  switchModel: async () => { },
  interrupt: () => { },
});

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}

export const defaultBaseUrl = 'http://127.0.0.1:18080';
