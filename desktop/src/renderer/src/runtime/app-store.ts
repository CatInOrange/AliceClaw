import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  createFileComposerAttachment,
  resolveComposerAttachmentChatInput,
} from "@/runtime/composer-attachment-utils.mjs";
import { normalizeAutomationConfig } from "@/runtime/automation-utils.mjs";
import { getManifestHydrationState } from "@/runtime/manifest-hydration-utils.mjs";
import {
  ChatAttachmentInput,
  LunariaExpression,
  LunariaManifest,
  LunariaMessage,
  LunariaMotion,
  LunariaQuickAction,
  LunariaSession,
} from "@/services/openclaw-api";

export type PetSurface = "hidden" | "chat" | "settings" | "plus";
export type PetPlusView = "root" | "actions";
export type ConnectionState = "idle" | "connecting" | "open" | "error";
export type AttachmentKind = "image" | "audio" | "video" | "file";

export interface ComposerAttachment {
  id: string;
  kind: AttachmentKind;
  filename: string;
  mimeType: string;
  previewUrl: string;
  source: "base64" | "url";
  data: string;
  file?: File;
  tempFileUrl?: string;
  cleanupToken?: string;
  previewState?: "pending" | "ready" | "error";
}

export interface PersistentToggleConfig {
  key?: string;
  paramId?: string;
  onValue?: number;
  offValue?: number;
  speed?: number;
  triggerWeight?: number;
  resetWeight?: number;
  onLabel?: string;
  offLabel?: string;
}

export interface PluginCatalogItem {
  id: string;
  source: "builtin" | "local";
  rootPath: string;
  entryUrl: string;
  manifest: Record<string, unknown>;
}

export interface FocusCenterConfig {
  enabled?: boolean;
  headRatio?: number;
}

export interface RuntimeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface ScreenshotOverlayState {
  fileUrl: string;
  cleanupToken: string;
  filename: string;
}

export interface AutomationRuleConfig {
  enabled: boolean;
  intervalMin: number;
  prompt: string;
}

export interface AutomationMusicConfig {
  allowAiActions: boolean;
  defaultUrl: string;
  volume: number;
  loop: boolean;
}

export interface AutomationConfig {
  enabled: boolean;
  onlyPetMode: boolean;
  proactive: AutomationRuleConfig;
  screenshot: AutomationRuleConfig;
  music: AutomationMusicConfig;
}

export interface AutomationRuleState {
  lastRunAt: number;
  running: boolean;
}

export interface AutomationLogItem {
  id: string;
  timestamp: number;
  timeLabel: string;
  text: string;
  status: "info" | "warn" | "error";
}

export interface StreamingMessage {
  id: string;
  sessionId: string;
  text: string;
  rawText: string;
}

interface AppStoreState {
  backendUrl: string;
  manifest: LunariaManifest | null;
  sessions: LunariaSession[];
  currentSessionId: string | null;
  messagesBySession: Record<string, LunariaMessage[]>;
  streamingMessage: StreamingMessage | null;
  connectionState: ConnectionState;
  lastEventSeq: number;
  currentProviderId: string;
  providerFieldValues: Record<string, string>;
  providerFieldManifestValues: Record<string, string>;
  ttsEnabled: boolean;
  ttsProvider: string;
  subtitle: string;
  composerDraft: string;
  composerAttachments: ComposerAttachment[];
  stageActionPanelOpen: boolean;
  quickActions: LunariaQuickAction[];
  motions: LunariaMotion[];
  expressions: LunariaExpression[];
  persistentToggles: Record<string, PersistentToggleConfig>;
  persistentToggleState: Record<string, boolean>;
  focusCenterByModel: Record<string, FocusCenterConfig>;
  backgroundByMode: Record<"window" | "pet", string>;
  currentModelBounds: RuntimeRect | null;
  petSurface: PetSurface;
  petPlusView: PetPlusView;
  petExpanded: boolean;
  petAutoHideSeconds: number;
  petAnchor: { x: number; y: number };
  petAnchorLocked: boolean;
  screenshotOverlay: ScreenshotOverlayState | null;
  automation: AutomationConfig;
  automationRuleState: Record<"proactive" | "screenshot", AutomationRuleState>;
  automationLogs: AutomationLogItem[];
  plugins: PluginCatalogItem[];
  pluginLoadState: "idle" | "loading" | "ready" | "error";
  pluginLogs: string[];
  setBackendUrl: (value: string) => void;
  setManifest: (value: LunariaManifest | null) => void;
  hydrateManifest: (manifest: LunariaManifest | null) => void;
  setSessions: (sessions: LunariaSession[]) => void;
  setCurrentSessionId: (sessionId: string | null) => void;
  setMessagesForSession: (sessionId: string, messages: LunariaMessage[]) => void;
  appendMessageForSession: (sessionId: string, message: LunariaMessage) => void;
  upsertMessageForSession: (sessionId: string, message: LunariaMessage) => void;
  setStreamingMessage: (message: StreamingMessage | null) => void;
  setConnectionState: (value: ConnectionState) => void;
  setLastEventSeq: (value: number) => void;
  setCurrentProviderId: (value: string) => void;
  setProviderFieldValue: (providerId: string, fieldKey: string, value: string) => void;
  setProviderFieldValues: (value: Record<string, string>) => void;
  setProviderFieldManifestValues: (value: Record<string, string>) => void;
  setTtsEnabled: (value: boolean) => void;
  setTtsProvider: (value: string) => void;
  setSubtitle: (value: string) => void;
  setComposerDraft: (value: string) => void;
  addComposerAttachment: (attachment: ComposerAttachment) => void;
  updateComposerAttachment: (attachmentId: string, value: Partial<ComposerAttachment>) => void;
  removeComposerAttachment: (attachmentId: string) => void;
  clearComposerAttachments: () => void;
  clearComposer: () => void;
  setStageActionPanelOpen: (value: boolean) => void;
  togglePersistentToggle: (key: string) => void;
  setPersistentToggle: (key: string, value: boolean) => void;
  setFocusCenterForModel: (modelId: string, value: FocusCenterConfig) => void;
  setBackgroundForMode: (mode: "window" | "pet", value: string) => void;
  setCurrentModelBounds: (value: RuntimeRect | null) => void;
  setPetSurface: (value: PetSurface) => void;
  setPetPlusView: (value: PetPlusView) => void;
  setPetExpanded: (value: boolean) => void;
  setPetAutoHideSeconds: (value: number) => void;
  setPetAnchor: (value: { x: number; y: number }) => void;
  setPetAnchorLocked: (value: boolean) => void;
  setScreenshotOverlay: (value: ScreenshotOverlayState | null) => void;
  clearScreenshotOverlay: () => void;
  setAutomationConfig: (value: Partial<AutomationConfig>) => void;
  setAutomationRuleConfig: (
    rule: "proactive" | "screenshot",
    value: Partial<AutomationRuleConfig>,
  ) => void;
  setAutomationMusicConfig: (value: Partial<AutomationMusicConfig>) => void;
  setAutomationRuleState: (
    rule: "proactive" | "screenshot",
    value: Partial<AutomationRuleState>,
  ) => void;
  appendAutomationLog: (
    text: string,
    status?: AutomationLogItem["status"],
    timestamp?: number,
  ) => void;
  clearAutomationLogs: () => void;
  resetPetPanels: () => void;
  setPlugins: (items: PluginCatalogItem[]) => void;
  setPluginLoadState: (value: AppStoreState["pluginLoadState"]) => void;
  appendPluginLog: (value: string) => void;
  clearPluginLogs: () => void;
}

export function createComposerAttachmentId(): string {
  return `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function detectAttachmentKind(mimeType: string): AttachmentKind {
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType.startsWith("audio/")) {
    return "audio";
  }
  if (mimeType.startsWith("video/")) {
    return "video";
  }
  return "file";
}

export async function fileToComposerAttachment(file: File): Promise<ComposerAttachment> {
  const kind = detectAttachmentKind(file.type || "application/octet-stream");
  const attachment = createFileComposerAttachment({
    file,
    id: createComposerAttachmentId(),
    previewUrl: kind === "image" ? URL.createObjectURL(file) : "",
  });
  return {
    ...attachment,
    id: attachment.id || createComposerAttachmentId(),
  };
}

export function dataUrlToComposerAttachment(
  dataUrl: string,
  filename = "capture.png",
): ComposerAttachment {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = match?.[1] || "image/png";
  return {
    id: createComposerAttachmentId(),
    kind: detectAttachmentKind(mimeType),
    filename,
    mimeType,
    previewUrl: dataUrl,
    source: "base64",
    data: match?.[2] || "",
  };
}

export async function dataUrlToFile(
  dataUrl: string,
  filename = "attachment",
): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], filename, {
    type: blob.type || "application/octet-stream",
  });
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function attachmentToChatInput(
  attachment: ComposerAttachment,
): Promise<ChatAttachmentInput> {
  if (attachment.data) {
    return resolveComposerAttachmentChatInput({ attachment });
  }

  if (attachment.file) {
    const resolvedDataUrl = await readFileAsDataUrl(attachment.file);
    return resolveComposerAttachmentChatInput({
      attachment,
      resolvedDataUrl,
    });
  }

  if (attachment.tempFileUrl) {
    const resolvedDataUrl = await window.api?.readTempScreenshotFile?.(attachment.tempFileUrl);
    if (!resolvedDataUrl) {
      throw new Error(`failed to read temp attachment file: ${attachment.filename}`);
    }
    return resolveComposerAttachmentChatInput({
      attachment,
      resolvedDataUrl,
    });
  }

  return resolveComposerAttachmentChatInput({
    attachment: {
      ...attachment,
      data: "",
    },
    resolvedDataUrl: attachment.previewUrl,
  });
}

function releaseComposerAttachmentResources(attachments: ComposerAttachment | ComposerAttachment[] | null | undefined): void {
  for (const attachment of Array.isArray(attachments) ? attachments : attachments ? [attachments] : []) {
    if (attachment.cleanupToken) {
      void window.api?.deleteTempScreenshotFile?.(attachment.cleanupToken);
    }
    if (attachment.previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
  }
}

function upsertMessage(
  existing: LunariaMessage[],
  nextMessage: LunariaMessage,
): LunariaMessage[] {
  const index = existing.findIndex((item) => item.id === nextMessage.id);
  if (index === -1) {
    return [...existing, nextMessage];
  }

  const clone = [...existing];
  clone[index] = nextMessage;
  return clone;
}

function updateComposerAttachment(
  existing: ComposerAttachment[],
  attachmentId: string,
  value: Partial<ComposerAttachment>,
): ComposerAttachment[] {
  const index = existing.findIndex((item) => item.id === attachmentId);
  if (index === -1) {
    return existing;
  }

  const clone = [...existing];
  clone[index] = {
    ...clone[index],
    ...value,
  };
  return clone;
}

export const useAppStore = create<AppStoreState>()(
  persist(
    (set, get) => ({
      backendUrl: "http://127.0.0.1:18080",
      manifest: null,
      sessions: [],
      currentSessionId: null,
      messagesBySession: {},
      streamingMessage: null,
      connectionState: "idle",
      lastEventSeq: 0,
      currentProviderId: "",
      providerFieldValues: {},
      providerFieldManifestValues: {},
      ttsEnabled: true,
      ttsProvider: "",
      subtitle: "",
      composerDraft: "",
      composerAttachments: [],
      stageActionPanelOpen: false,
      quickActions: [],
      motions: [],
      expressions: [],
      persistentToggles: {},
      persistentToggleState: {},
      focusCenterByModel: {},
      backgroundByMode: {
        window: "",
        pet: "",
      },
      currentModelBounds: null,
      petSurface: "chat",
      petPlusView: "root",
      petExpanded: false,
      petAutoHideSeconds: 10,
      petAnchor: { x: 0, y: 0 },
      petAnchorLocked: false,
      screenshotOverlay: null,
      automation: normalizeAutomationConfig({}) as AutomationConfig,
      automationRuleState: {
        proactive: { lastRunAt: 0, running: false },
        screenshot: { lastRunAt: 0, running: false },
      },
      automationLogs: [],
      plugins: [],
      pluginLoadState: "idle",
      pluginLogs: [],
      setBackendUrl: (value) => set({ backendUrl: value }),
      setManifest: (value) => set({ manifest: value }),
      hydrateManifest: (manifest) => set((state) => getManifestHydrationState({
        state,
        manifest,
      }) as Partial<AppStoreState>),
      setSessions: (sessions) => set({ sessions }),
      setCurrentSessionId: (sessionId) => set({ currentSessionId: sessionId }),
      setMessagesForSession: (sessionId, messages) => set((state) => ({
        messagesBySession: {
          ...state.messagesBySession,
          [sessionId]: messages,
        },
      })),
      appendMessageForSession: (sessionId, message) => set((state) => ({
        messagesBySession: {
          ...state.messagesBySession,
          [sessionId]: [...(state.messagesBySession[sessionId] || []), message],
        },
      })),
      upsertMessageForSession: (sessionId, message) => set((state) => ({
        messagesBySession: {
          ...state.messagesBySession,
          [sessionId]: upsertMessage(state.messagesBySession[sessionId] || [], message),
        },
      })),
      setStreamingMessage: (message) => set({ streamingMessage: message }),
      setConnectionState: (value) => set({ connectionState: value }),
      setLastEventSeq: (value) => set({ lastEventSeq: value }),
      setCurrentProviderId: (value) => set({ currentProviderId: value }),
      setProviderFieldValue: (providerId, fieldKey, value) => set((state) => ({
        providerFieldValues: {
          ...state.providerFieldValues,
          [`${providerId}.${fieldKey}`]: value,
        },
      })),
      setProviderFieldValues: (value) => set({ providerFieldValues: value }),
      setProviderFieldManifestValues: (value) => set({ providerFieldManifestValues: value }),
      setTtsEnabled: (value) => set({ ttsEnabled: value }),
      setTtsProvider: (value) => set({ ttsProvider: value }),
      setSubtitle: (value) => set({ subtitle: value }),
      setComposerDraft: (value) => set({ composerDraft: value }),
      addComposerAttachment: (attachment) => set((state) => ({
        composerAttachments: [...state.composerAttachments, attachment],
      })),
      updateComposerAttachment: (attachmentId, value) => set((state) => ({
        composerAttachments: updateComposerAttachment(state.composerAttachments, attachmentId, value),
      })),
      removeComposerAttachment: (attachmentId) => {
        const removedAttachment = get().composerAttachments.find((item) => item.id === attachmentId);
        releaseComposerAttachmentResources(removedAttachment);
        set((state) => ({
          composerAttachments: state.composerAttachments.filter((item) => item.id !== attachmentId),
        }));
      },
      clearComposerAttachments: () => {
        releaseComposerAttachmentResources(get().composerAttachments);
        set({ composerAttachments: [] });
      },
      clearComposer: () => {
        releaseComposerAttachmentResources(get().composerAttachments);
        set({ composerDraft: "", composerAttachments: [] });
      },
      setStageActionPanelOpen: (value) => set({ stageActionPanelOpen: value }),
      togglePersistentToggle: (key) => set((state) => ({
        persistentToggleState: {
          ...state.persistentToggleState,
          [key]: !state.persistentToggleState[key],
        },
      })),
      setPersistentToggle: (key, value) => set((state) => ({
        persistentToggleState: {
          ...state.persistentToggleState,
          [key]: value,
        },
      })),
      setFocusCenterForModel: (modelId, value) => set((state) => ({
        focusCenterByModel: {
          ...state.focusCenterByModel,
          [modelId]: {
            ...state.focusCenterByModel[modelId],
            ...value,
          },
        },
      })),
      setBackgroundForMode: (mode, value) => set((state) => ({
        backgroundByMode: {
          ...state.backgroundByMode,
          [mode]: value,
        },
      })),
      setCurrentModelBounds: (value) => set({ currentModelBounds: value }),
      setPetSurface: (value) => set({ petSurface: value }),
      setPetPlusView: (value) => set({ petPlusView: value }),
      setPetExpanded: (value) => set({ petExpanded: value }),
      setPetAutoHideSeconds: (value) => set({
        petAutoHideSeconds: Math.max(0, Math.min(120, Math.round(value || 0))),
      }),
      setPetAnchor: (value) => set({ petAnchor: value }),
      setPetAnchorLocked: (value) => set({ petAnchorLocked: value }),
      setScreenshotOverlay: (value) => set({ screenshotOverlay: value }),
      clearScreenshotOverlay: () => set({ screenshotOverlay: null }),
      setAutomationConfig: (value) => set((state) => ({
        automation: normalizeAutomationConfig({
          ...state.automation,
          ...value,
        }) as AutomationConfig,
      })),
      setAutomationRuleConfig: (rule, value) => set((state) => ({
        automation: normalizeAutomationConfig({
          ...state.automation,
          [rule]: {
            ...state.automation[rule],
            ...value,
          },
        }) as AutomationConfig,
      })),
      setAutomationMusicConfig: (value) => set((state) => ({
        automation: normalizeAutomationConfig({
          ...state.automation,
          music: {
            ...state.automation.music,
            ...value,
          },
        }) as AutomationConfig,
      })),
      setAutomationRuleState: (rule, value) => set((state) => ({
        automationRuleState: {
          ...state.automationRuleState,
          [rule]: {
            ...state.automationRuleState[rule],
            ...value,
          },
        },
      })),
      appendAutomationLog: (text, status = "info", timestamp = Date.now()) => set((state) => ({
        automationLogs: [
          ...state.automationLogs.slice(-23),
          {
            id: `auto_log_${timestamp}_${Math.random().toString(36).slice(2, 8)}`,
            timestamp,
            timeLabel: new Date(timestamp).toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
            text: String(text || ""),
            status,
          },
        ],
      })),
      clearAutomationLogs: () => set({ automationLogs: [] }),
      resetPetPanels: () => set({ petSurface: "chat", petPlusView: "root" }),
      setPlugins: (items) => set({ plugins: items }),
      setPluginLoadState: (value) => set({ pluginLoadState: value }),
      appendPluginLog: (value) => set((state) => ({
        pluginLogs: [...state.pluginLogs.slice(-79), value],
      })),
      clearPluginLogs: () => set({ pluginLogs: [] }),
    }),
    {
      name: "openclaw-electron-app-store-v2",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        backendUrl: state.backendUrl,
        currentProviderId: state.currentProviderId,
        providerFieldValues: state.providerFieldValues,
        providerFieldManifestValues: state.providerFieldManifestValues,
        ttsEnabled: state.ttsEnabled,
        ttsProvider: state.ttsProvider,
        persistentToggleState: state.persistentToggleState,
        focusCenterByModel: state.focusCenterByModel,
        backgroundByMode: state.backgroundByMode,
        petExpanded: state.petExpanded,
        petAutoHideSeconds: state.petAutoHideSeconds,
        automation: state.automation,
      }),
    },
  ),
);

export function getQuickActionLabel(action: LunariaQuickAction): string {
  return String(action.label || action.id || action.type || "Action");
}
