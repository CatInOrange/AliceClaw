declare module "@/runtime/automation-utils.mjs" {
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

  export const DEFAULT_AUTOMATION_CONFIG: AutomationConfig;
  export function clampNumber(value: unknown, min: number, max: number, fallback: number): number;
  export function normalizeAutomationConfig(raw?: Partial<AutomationConfig>): AutomationConfig;
  export function shouldRunAutomationRule(args: {
    config: Partial<AutomationConfig> | AutomationConfig;
    ruleKey: "proactive" | "screenshot";
    mode: "window" | "pet";
    ruleState: AutomationRuleState;
    now?: number;
  }): boolean;
}

declare module "@/runtime/screenshot-utils.mjs" {
  export interface ScreenshotRect {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  export function toPositiveRect(
    start: { x: number; y: number },
    end: { x: number; y: number },
  ): ScreenshotRect;

  export function clampSelectionRect(
    rect: ScreenshotRect,
    bounds: { width: number; height: number },
  ): ScreenshotRect;

  export function createFullScreenSelection(
    bounds: { width: number; height: number },
  ): ScreenshotRect;

  export function selectionCoversBounds(
    rect: ScreenshotRect,
    bounds: { width: number; height: number },
  ): boolean;

  export function hasMeaningfulSelection(rect: ScreenshotRect, minSize?: number): boolean;
}

declare module "@/runtime/composer-attachment-utils.mjs" {
  export function createFileComposerAttachment(args: {
    file?: File;
    id?: string;
    previewUrl?: string;
  }): {
    data: string;
    file?: File;
    filename: string;
    id?: string;
    kind: "image" | "audio" | "video" | "file";
    mimeType: string;
    previewUrl: string;
    source: "base64";
  };

  export function createTempFileComposerAttachment(args: {
    cleanupToken?: string;
    fileUrl?: string;
    filename?: string;
    id?: string;
    kind?: "image" | "audio" | "video" | "file";
    mimeType?: string;
  }): {
    cleanupToken?: string;
    data: string;
    filename: string;
    id?: string;
    kind: "image" | "audio" | "video" | "file";
    mimeType: string;
    previewUrl: string;
    source: "base64";
    tempFileUrl?: string;
  };

  export function resolveComposerAttachmentChatInput(args: {
    attachment?: {
      data?: string;
      mimeType?: string;
      source?: "base64" | "url";
    };
    resolvedDataUrl?: string;
  }): {
    data: string;
    mediaType?: string;
    type: "base64" | "url";
  };
}

declare module "@/runtime/provider-overrides.mjs" {
  export function getProviderOverridesPayload(
    provider: { id: string; fields?: Array<{ key?: string }> } | null,
    values: Record<string, string>,
  ): Record<string, string>;
}

declare module "@/runtime/settings-panel-utils.mjs" {
  export function normalizeSupportedLanguage(value?: string | null): "en" | "zh";
  export function resolveProviderFieldLabel(field?: {
    key?: string;
    label?: string;
  } | null): string;
  export function resolveProviderFieldPlaceholder(field?: {
    key?: string;
    label?: string;
    placeholder?: string;
  } | null): string;
}

declare module "@/runtime/media-capture-preferences.mjs" {
  export const IMAGE_COMPRESSION_QUALITY_KEY: string;
  export const DEFAULT_IMAGE_COMPRESSION_QUALITY: number;
  export const IMAGE_MAX_WIDTH_KEY: string;
  export const DEFAULT_IMAGE_MAX_WIDTH: number;
  export function parseMediaCaptureNumber(
    value: unknown,
    fallback: number,
    constraints?: { min?: number; max?: number },
  ): number;
  export function readMediaCaptureNumber(
    storage: { getItem?: (key: string) => string | null } | null | undefined,
    key: string,
    fallback: number,
    constraints?: { min?: number; max?: number },
  ): number;
}

declare module "@/runtime/provider-field-state.mjs" {
  export function resolveProviderFieldState(args: {
    manifest: {
      model?: {
        chat?: {
          providers?: Array<{
            id?: string;
            fields?: Array<{ key?: string; value?: unknown; defaultValue?: unknown }>;
          }>;
        };
      };
    } | null;
    previousValues?: Record<string, string>;
    previousManifestValues?: Record<string, string>;
  }): {
    values: Record<string, string>;
    manifestValues: Record<string, string>;
  };
}

declare module "@/runtime/chat-runtime-utils.mjs" {
  export function getConnectionStateAfterChatError(
    error: { name?: string } | Error | null | undefined,
  ): "idle" | "error";
}

declare module "@/runtime/chat-time-utils.mjs" {
  export function formatChatMessageTimestamp(
    value?: string | number | Date | null,
    now?: string | number | Date,
  ): string;

  export function formatChatMessageMeta(args: {
    speaker?: string | null;
    timestamp?: string | number | Date | null;
    now?: string | number | Date;
  }): string;
}

declare module "@/runtime/chat-surface-utils.mjs" {
  export function getComposerAction(args: {
    hasContent: boolean;
    isStreaming: boolean;
  }): "noop" | "interrupt" | "send";

  export function resolveAutomationNoteKind(message: {
    role?: string;
    source?: string;
    attachments?: Array<unknown>;
  } | null | undefined): "proactive" | "screenshot" | null;

  export function mapLunariaMessageToDisplayMessage(message: {
    id?: string;
    text?: string;
    role?: string;
    createdAt?: number;
    meta?: string;
    source?: string;
    attachments?: Array<Record<string, unknown>>;
  }): {
    id: string;
    content: string;
    role: "ai" | "human" | "system";
    timestamp: string;
    name: string;
    attachments: Array<Record<string, unknown>>;
    type: "text" | "automation_note";
    source: string;
    automationKind: "proactive" | "screenshot" | null;
  };
}

declare module "@/runtime/assistant-display-utils.mjs" {
  export function resolveAssistantDisplayName(args?: {
    configName?: string | null;
    manifestName?: string | null;
    fallbackName?: string | null;
  }): string;
}

declare module "@/runtime/manifest-hydration-utils.mjs" {
  export function getManifestHydrationState(args: {
    state: {
      currentProviderId?: string;
      ttsEnabled?: boolean;
      ttsProvider?: string;
      focusCenterByModel?: Record<string, { enabled?: boolean; headRatio?: number }>;
    };
    manifest: {
      selectedModelId?: string;
      live2d?: { focusCenter?: Record<string, unknown> };
      model?: {
        id?: string;
        quickActions?: unknown[];
        motions?: unknown[];
        expressions?: unknown[];
        persistentToggles?: Record<string, unknown>;
        live2d?: { focusCenter?: Record<string, unknown> };
        chat?: {
          defaultProviderId?: string;
          providers?: Array<{ id?: string }>;
          tts?: {
            enabled?: boolean;
            provider?: string;
            providers?: Array<{ id?: string }>;
          };
        };
      };
    } | null;
  }): {
    manifest: unknown;
    quickActions: unknown[];
    motions: unknown[];
    expressions: unknown[];
    persistentToggles: Record<string, unknown>;
    currentProviderId: string;
    ttsEnabled: boolean;
    ttsProvider: string;
    focusCenterByModel: Record<string, { enabled?: boolean; headRatio?: number }>;
  };
}

declare module "@/runtime/global-cursor-utils.mjs" {
  export function shouldUseGlobalCursorTracking(args: {
    mode: "window" | "pet";
    focusCenter?: { enabled?: boolean } | null;
  }): boolean;

  export function toRendererPointerFromScreenPoint(args: {
    screenPoint: { x?: number; y?: number } | null;
    virtualBounds?: { x?: number; y?: number; width?: number; height?: number } | null;
  }): { x: number; y: number } | null;
}

declare module "@/runtime/focus-center-utils.mjs" {
  export function resolveFocusCenterConfig(args: {
    manifest?: {
      selectedModelId?: string;
      live2d?: { focusCenter?: Record<string, unknown> };
      model?: {
        id?: string;
        live2d?: { focusCenter?: Record<string, unknown> };
      };
    } | null;
    focusCenterByModel?: Record<string, { enabled?: boolean; headRatio?: number }>;
    modelId?: string | null;
  }): {
    enabled: boolean;
    headRatio: number;
  };
}

declare module "@/runtime/live2d-focus-utils.mjs" {
  export function applyLive2DFocus(args: {
    config?: { enabled?: boolean; headRatio?: number } | null;
    pointer?: { x?: number; y?: number } | null;
    canvasRect?: { left?: number; top?: number; width?: number; height?: number } | null;
    model?: {
      y?: number;
      height?: number;
      focus?: (x: number, y: number, instant: boolean) => void;
    } | null;
    manager?: { onDrag?: (x: number, y: number) => void } | null;
    view?: {
      transformViewX?: (value: number) => number;
      transformViewY?: (value: number) => number;
    } | null;
    devicePixelRatio?: number;
  }): boolean;
}

declare module "@/runtime/pet-shell-display-utils.mjs" {
  export function getPetToggleButtonState(surface: "hidden" | "chat" | "settings" | "plus"): {
    ariaLabel: string;
    showText: boolean;
  };
}

declare module "@/runtime/pet-overlay-utils.mjs" {
  export function getPetOverlayCenter(args: {
    workArea?: { x?: number; y?: number; width?: number; height?: number } | null;
    virtualBounds?: { x?: number; y?: number; width?: number; height?: number } | null;
  }): { x: number; y: number };

  export function getPetShellBackgroundStyle(background?: string | null): {
    backgroundImage?: string;
    backgroundSize?: string;
    backgroundPosition?: string;
  };
}

declare module "@/runtime/pet-shell-interaction-utils.mjs" {
  export function resolvePetShellHoverState(args: {
    petSurface: "hidden" | "chat" | "settings" | "plus";
    isHovering: boolean;
  }): boolean;

  export function resolvePetAnchorUpdate(args: {
    currentAnchor: { x: number; y: number };
    nextAnchor: { x: number; y: number };
    isLocked: boolean;
  }): { x: number; y: number };

  export function shouldUpdatePetAnchor(args: {
    currentAnchor: { x: number; y: number } | null | undefined;
    nextAnchor: { x: number; y: number } | null | undefined;
  }): boolean;

  export function getDraggedPetAnchor(args: {
    startAnchor: { x: number; y: number };
    dragStart: { x: number; y: number };
    pointer: { x: number; y: number };
  }): { x: number; y: number };
}

declare module "@/runtime/plugin-loader-utils.mjs" {
  export function rebuildPluginCatalogState(
    items: Array<{ id: string; manifest: Record<string, unknown> }>,
    loadedPlugins?: Map<string, unknown> | { clear?: () => void } | null,
  ): {
    pluginItems: Map<string, unknown>;
    capabilityIndex: Map<string, { pluginId: string; capability: { name?: string } }>;
  };
}

declare module "@/runtime/speech-runtime-utils.mjs" {
  export function shouldSpeakRealtimeMessage(
    incoming: { sessionId?: string; source?: string } | null | undefined,
    currentSessionId: string | null,
  ): boolean;

  export function createNextPlaybackVersion(currentVersion?: number): number;

  export function isPlaybackVersionCurrent(
    expectedVersion: number,
    activeVersion: number,
  ): boolean;
}

declare module "@/runtime/app-store-selectors.mjs" {
  import { LunariaMessage } from "@/services/openclaw-api";

  export function selectCurrentSessionMessages(state: {
    currentSessionId: string | null;
    messagesBySession: Record<string, LunariaMessage[]>;
  }): LunariaMessage[];
}

declare module "@/runtime/window-shell-utils.mjs" {
  export function getNextWindowSidebarPanel(
    currentPanel: "sessions" | "settings" | null,
    requestedPanel: "sessions" | "settings" | null,
  ): "sessions" | "settings" | null;

  export function shouldShowWindowSidebarSection(
    activePanel: "sessions" | "settings" | null,
    section: "sessions" | "settings",
  ): boolean;

  export function shouldResizeWindowLive2DForSidebar(
    activePanel: "sessions" | "settings" | null,
  ): boolean;

  export function getWindowLive2DFrameStyle(args: {
    isElectron: boolean;
    sidebarWidth: number;
  }): {
    top: string;
    left: string;
    right: string;
    bottom: string;
  };

  export function getLunariaDocumentBackground(args: {
    mode: "window" | "pet";
    hasBackground: boolean;
    transparentWindow?: boolean;
  }): string;
}

declare module "@/runtime/chat-shell-utils.mjs" {
  export function shouldAutoScrollMessageList(args: {
    previousSessionId: string | null;
    nextSessionId: string | null;
    previousMessageCount: number;
    nextMessageCount: number;
    previousStreamingText: string;
    nextStreamingText: string;
  }): boolean;

  export function getLunariaScrollbarStyles(options?: {
    hidden?: boolean;
  }): {
    scrollbarWidth: string;
    scrollbarColor?: string;
    msOverflowStyle?: string;
    "&::-webkit-scrollbar": {
      width?: string;
      display?: string;
    };
    "&::-webkit-scrollbar-track"?: {
      background: string;
    };
    "&::-webkit-scrollbar-thumb"?: {
      background: string;
      borderRadius: string;
    };
    "&::-webkit-scrollbar-thumb:hover"?: {
      background: string;
    };
  };
}

declare module "@/runtime/live2d-resize-utils.mjs" {
  export function shouldResizeLive2DCanvas(args: {
    width: number;
    height: number;
    previousWidth: number;
    previousHeight: number;
    sidebarChanged: boolean;
    hasAppliedInitialScale: boolean;
  }): boolean;
}

declare module "@/runtime/live2d-init-scheduler-utils.mjs" {
  export function scheduleLive2DInitialization(args: {
    currentTimer: ReturnType<typeof setTimeout> | null;
    delayMs?: number;
    clearTimeoutImpl?: (timer: ReturnType<typeof setTimeout>) => void;
    setTimeoutImpl?: (
      callback: () => void,
      delay: number,
    ) => ReturnType<typeof setTimeout>;
    onInitialize: () => void;
  }): ReturnType<typeof setTimeout>;

  export function cancelScheduledLive2DInitialization(args: {
    currentTimer: ReturnType<typeof setTimeout> | null;
    clearTimeoutImpl?: (timer: ReturnType<typeof setTimeout>) => void;
  }): null;
}

declare module "@/runtime/live2d-audio-utils.mjs" {
  export function getLipSyncPlaybackMode(args: {
    audioMimeType?: string;
    audioSource?: string;
  }): "none" | "wav-handler" | "realtime";

  export function getActiveLive2DModel(): any;

  export function createRealtimeLipSyncCleanup(
    audio: HTMLAudioElement,
    model: any,
  ): (() => void) | null;
}

declare module "@/runtime/pet-message-scroll-utils.mjs" {
  export function shouldScrollPetMessagesToBottom(args: {
    previousSurface: "hidden" | "chat" | "settings" | "plus" | null;
    nextSurface: "hidden" | "chat" | "settings" | "plus";
    previousMessageCount: number;
    nextMessageCount: number;
    previousLatestMessageId?: string | null;
    nextLatestMessageId?: string | null;
    previousExpanded: boolean;
    nextExpanded: boolean;
  }): boolean;
}
