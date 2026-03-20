import { fetchModelManifest, streamChat, createAttachmentManager, openEventsStream, fetchSessions, fetchSessionMessages, createSession, selectSession } from './api.js';
import { saveUiConfig } from './state.js';
import { appendAttachmentToBubble, findFirstAudioAttachmentUrl, stripStageDirectives } from './chat/attachments.js';
import { rememberConversationEntry, getRecentConversationContext as _getRecentConversationContext } from './chat/conversation.js';
import { createRealtimeBinder } from './chat/realtime.js';
import { maybeEnqueuePushTtsForMessage } from './chat/push-tts.js';
import { createRealtimeRenderer } from './chat/realtime-render.js';
import { createComposerAttachments } from './chat/composer-attachments.js';
import { createDraftSync } from './chat/draft-sync.js';
import { createTurnRunner } from './chat/turn.js';
import { createScrollHelpers } from './chat/scroll.js';
import { createCameraController } from './chat/camera.js';
import { createSettingsMenu } from './chat/settings-menu.js';
import { createSessionsPanel } from './chat/sessions-panel.js';
import { sortMessagesWithUploads } from './chat/message-sort.js';
import { applyDirectivesDirectly, parseSpeechForDisplay } from './chat/speech-directives.js';
import { createSpeechStreamState, consumeSpeechStreamChunk, finalizeSpeechStreamState } from './directives.js';
import { bindChatUi } from './chat/bindings.js';
import { createModelLoader } from './chat/model-loader.js';
import { createSendChat } from './chat/send-chat.js';
import { createSessionState } from './chat/session-state.js';

export function createChatController({ refs, uiConfig, ui, ttsEngine, live2d, providerForm, pluginHost }) {
  const toolRunMap = {
    tool: 'tool',
    automation: 'automation',
  };

  async function sendToAI({ text, attachments = [], mode = 'tool', historyText = '' } = {}) {
    return runChatTurn({
      text,
      attachments,
      showUserBubble: false,
      showAssistantBubble: false,
      persistAssistantMessage: false,
      structuredResponse: mode === 'automation',
      rememberConversation: false,
      requestMode: toolRunMap[mode] || 'normal',
      historyText,
    });
  }

  async function sendToUser(text, attachments = []) {
    const message = ui.addMessage('assistant', String(text || ''), '工具结果');
    for (const att of attachments || []) {
      appendAttachmentToBubble(message.bubbleEl, att);
      appendAttachmentToBubble(message.mirrorBubbleEl, att);
    }
  }

  const { messagesEl, desktopMessagesEl, chatInputEl, sendBtnEl, providerSelectEl, ttsEnabledInputEl, attachmentPreviewEl, imageUploadInputEl, cameraBtnEl, cameraPreviewContainerEl, cameraVideoEl, cameraCanvasEl, cameraCloseBtnEl, desktopPlusCameraBtnEl, desktopCameraPreviewContainerEl, desktopCameraVideoEl, desktopCameraCanvasEl, desktopCameraCloseBtnEl, desktopCameraCaptureBtnEl, settingsMenuEl, settingsOverlayEl, btnSettingsEl, settingsCloseBtn, settingsModelSelectEl, desktopModelSelectEl, desktopChatInputEl, desktopSendBtnEl, desktopImageUploadInputEl, desktopAttachmentPreviewEl, desktopPetPanelEl, desktopPetDockEl, chatPanelEl, dragOverlayEl, btnSessionsEl, sessionsPanelEl, sessionsPanelCloseEl, sessionsListEl, desktopNewSessionBtnEl } = refs;
  let chatBusy = false;
  let appMeta = null;
  let modelMeta = null;
  const sessionState = createSessionState();
  const seenRealtimeMessageIds = new Set();
  const conversationState = { recentConversationEntries: [] };

  const realtimeRenderer = createRealtimeRenderer({
    ui,
    conversationState,
    seenRealtimeMessageIds,
    appendAttachmentToBubble,
    rememberConversationEntry,
    stripStageDirectives,
  });
  const renderRealtimeMessage = realtimeRenderer.renderRealtimeMessage;

  const realtime = createRealtimeBinder({
    openEventsStream,
    fetchSessions,
    fetchSessionMessages,
    getCurrentSessionId: sessionState.getCurrentSessionId,
    setCurrentSessionId: sessionState.setCurrentSessionId,
    sortMessages: sortMessagesWithUploads,
    onHistoryMessage: (message) => {
      renderRealtimeMessage(message);
    },
    onHistoryLoaded: () => {
      // Initial load complete: scroll once.
      scrollMessagesToBottomRaf();
    },
    onEvent: ({ event, data }) => {
      if (event === 'message.created') handleMessageCreatedEvent(data);
    },
    onStreamError: (error) => {
      console.warn('Realtime event stream error:', error);
    },
  });

  const scroll = createScrollHelpers({ messagesEl, desktopMessagesEl });
  const { scrollMessagesToBottom, scrollMessagesToBottomRaf } = scroll;

  // Attachment manager for image uploads
  const attachmentManager = createAttachmentManager();

  const composerAttachments = createComposerAttachments({
    attachmentManager,
    attachmentPreviewEl,
    desktopAttachmentPreviewEl,
    imageUploadInputEl,
    desktopImageUploadInputEl,
    dragOverlayEl,
    chatPanelEl,
    desktopPetPanelEl,
    desktopPetDockEl,
    chatInputEl,
    desktopChatInputEl,
  });

  // Expose composer attachment helpers as local functions to minimize the churn
  // in the rest of this controller.
  const {
    renderAttachmentPreview,
    setupAttachmentHandlers,
    addImageFromDataUrl,
    addImageFromUrl,
  } = composerAttachments;

  const draftSync = createDraftSync({ chatInputEl, desktopChatInputEl });
  const {
    syncDraftValue,
    resizeDesktopInput,
    bindDraftSync,
    clearDraft,
  } = draftSync;

  // Adapt extracted directive/speech helpers (which are designed to be reusable
  // and dependency-injected) back into the legacy local function signatures
  // expected by the rest of the chat controller code.
  const applyDirectives = (directives = []) => applyDirectivesDirectly(live2d, directives);
  const parseSpeech = (speechText) => parseSpeechForDisplay(speechText, {
    createSpeechStreamState,
    consumeSpeechStreamChunk,
    finalizeSpeechStreamState,
    getSegmentationOptions,
  });

  const turnRunner = createTurnRunner({
    refs,
    ui,
    uiConfig,
    live2d,
    ttsEngine,
    providerForm,
    pluginHost,
    saveUiConfig,
    getSelectedProvider,
    getSelectedModelId,
    streamChat,
    rememberConversationEntry,
    conversationState,
    parseSpeechForDisplay: parseSpeech,
    getSegmentationOptions,
    getCurrentSessionId: sessionState.getCurrentSessionId,
    appendAttachmentsToBubble: (message, attachments = []) => {
      for (const attachment of attachments || []) {
        appendAttachmentToBubble(message.bubbleEl, attachment);
        appendAttachmentToBubble(message.mirrorBubbleEl, attachment);
      }
    },
    clearDraft,
    scrollMessagesToBottom,
    renderRealtimeMessage,
    markRealtimeMessageSeen: (messageId) => {
      if (!messageId) return;
      seenRealtimeMessageIds.add(String(messageId));
    },
    applyBusyState,
    isBusy: () => chatBusy,
  });

  const modelLoader = createModelLoader({
    fetchModelManifest,
    saveUiConfig,
    ui,
    providerForm,
    live2d,
    getUiConfig: () => uiConfig,
    getRefs: () => refs,
    setAppMeta: (m) => { appMeta = m; },
    setModelMeta: (m) => { modelMeta = m; },
    getModelMeta: () => modelMeta,
  });

  function getSelectedModelId() { return providerForm.getSelectedModelId(); }
  function getSelectedProvider() { return providerForm.getSelectedProvider(); }
  function getTtsSoftBreakThreshold() { return Math.max(1, Number(modelMeta?.chat?.tts?.softBreakMaxChars || 20)); }
  function getSegmentationOptions() { return { ...ttsEngine.getSegmentationOptions(), softBreakThreshold: getTtsSoftBreakThreshold() }; }
  function isDesktopPetMode() { return document.body.classList.contains('desktop-mode-pet'); }
  function getActiveChatInput() { return isDesktopPetMode() && desktopChatInputEl ? desktopChatInputEl : chatInputEl; }

  // composer attachment helpers are in ./chat/composer-attachments.js
  // draft sync helpers are in ./chat/draft-sync.js

  // ── Camera functionality ─────────────────────────

  const camera = createCameraController({
    web: {
      btnEl: cameraBtnEl,
      previewContainerEl: cameraPreviewContainerEl,
      videoEl: cameraVideoEl,
      canvasEl: cameraCanvasEl,
      closeBtnEl: cameraCloseBtnEl,
    },
    desktop: {
      btnEl: desktopPlusCameraBtnEl,
      previewContainerEl: desktopCameraPreviewContainerEl,
      videoEl: desktopCameraVideoEl,
      canvasEl: desktopCameraCanvasEl,
      closeBtnEl: desktopCameraCloseBtnEl,
      captureBtnEl: desktopCameraCaptureBtnEl,
    },
    onCaptureDataUrl: (dataUrl) => {
      if (dataUrl) addImageFromDataUrl(dataUrl);
    },
    alert: (msg) => alert(msg),
    logger: console,
  });

  // addImageFromUrl is provided by composerAttachments

  // scroll helpers are in ./chat/scroll.js

  // attachment helpers are in ./chat/attachments.js
  // directive helpers are in ./chat/speech-directives.js
  // speech stream utilities are in ./directives.js

  function getRecentConversationContext(options = {}) {
    return _getRecentConversationContext(conversationState, options);
  }

  const handleMessageCreatedEvent = realtimeRenderer.createMessageCreatedHandler({
    ttsEnabledInputEl,
    scrollMessagesToBottomRaf,
    maybeEnqueuePushTtsForMessage,
    ttsEngine,
    uiConfig,
    getModelMeta: () => modelMeta,
    parseSpeechForDisplay: parseSpeech,
    stripStageDirectives,
    findFirstAudioAttachmentUrl,
    applyDirectivesDirectly: applyDirectives,
    getCurrentSessionId: sessionState.getCurrentSessionId,
    logger: console,
  });

  // sortMessagesWithUploads is imported from ./chat/message-sort.js

  const sessionsPanel = createSessionsPanel({
    refs,
    ui,
    fetchSessions,
    fetchSessionMessages,
    createSession,
    selectSession,
    getCurrentSessionId: sessionState.getCurrentSessionId,
    setCurrentSessionId: sessionState.setCurrentSessionId,
    renderRealtimeMessage,
    scrollMessagesToBottomRaf,
    seenRealtimeMessageIds,
    conversationState,
    messagesEl,
    desktopMessagesEl,
  });
  const {
    refreshSessionsUi,
    loadSession,
    createNewSession,
    closeSessionsPanel,
  } = sessionsPanel;

  const loadSelectedModel = modelLoader.loadSelectedModel;

  function applyBusyState(busy) {
    chatBusy = !!busy;
    if (sendBtnEl) sendBtnEl.disabled = !!busy;
    if (desktopSendBtnEl) desktopSendBtnEl.disabled = !!busy;
    if (chatInputEl) chatInputEl.disabled = !!busy;
    if (desktopChatInputEl) desktopChatInputEl.disabled = !!busy;
  }

  const runChatTurn = turnRunner.runChatTurn;

  const sendChat = createSendChat({
    getActiveChatInput,
    chatInputEl,
    desktopChatInputEl,
    attachmentManager,
    renderAttachmentPreview,
    camera,
    runChatTurn,
    getSelectedModelId,
    ui,
  }).sendChat;

  const settingsMenu = createSettingsMenu({
    settingsMenuEl,
    settingsOverlayEl,
    btnSettingsEl,
    settingsCloseBtn,
    onEscape: () => {
      // Keep legacy behavior: Escape closes both overlays.
      closeSessionsPanel();
    },
  });

  function bindChat() {
    bindChatUi({
      refs,
      uiConfig,
      saveUiConfig,
      providerForm,
      sendChat,
      loadSelectedModel,
      addImageFromDataUrl,
      setupAttachmentHandlers,
      cameraBind: () => camera.bind(),
      bindDraftSync,
      realtimeBind: () => realtime.bind(),
      settingsMenuBind: () => settingsMenu.bind(),
      sessionsPanelBind: () => sessionsPanel.bind(),
      ui,
    });
  }

  return {
    bindChat,
    loadSelectedModel,
    getSelectedProvider,
    getSelectedModelId,
    getModelMeta: () => modelMeta,
    getAppMeta: () => appMeta,
    addImageFromDataUrl,
    addImageFromUrl,
    refreshSessionsUi,
    getCurrentSessionId: sessionState.getCurrentSessionId,
    sendToAI,
    sendToUser,
    clearAttachments: () => {
      attachmentManager.clearAttachments();
      renderAttachmentPreview();
    },
    getAttachments: () => attachmentManager.getAttachments(),
    sendAutomationTurn: ({ text, attachments = [], sourceLabel = '自动化', note = '', structuredResponse = false } = {}) => runChatTurn({
      text,
      attachments,
      showUserBubble: false,
      showAssistantBubble: true,
      persistAssistantMessage: true,
      assistantMeta: sourceLabel,
      systemNote: note || `${sourceLabel} 已触发`,
      pendingMeta: `${sourceLabel} · streaming…`,
      structuredResponse,
      rememberConversation: false,
      requestMode: 'automation',
      historyText: '',
    }),
    isBusy: () => chatBusy,
    getRecentConversationContext,
  };
}
