import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const moduleUrl = pathToFileURL(path.resolve("frontend/public/js/chat/turn.js")).href;
const { createTurnRunner } = await import(`${moduleUrl}?test=turn-runner`);

function createUiMessage() {
  return {
    bubbleEl: { textContent: "" },
    mirrorBubbleEl: { textContent: "" },
    metaEl: { textContent: "" },
    mirrorMetaEl: { textContent: "" },
  };
}

function createDeps({ onStreamChat } = {}) {
  return {
    refs: {
      ttsEnabledInputEl: { checked: false },
    },
    ui: {
      addMessage: () => createUiMessage(),
      chooseReactionForReply: () => ({}),
    },
    uiConfig: {},
    live2d: {
      triggerExpression: () => {},
      triggerMotion: () => {},
    },
    ttsEngine: {
      unlock: () => {},
      enqueueSpeechUnit: () => {},
      enqueuePreparedAudio: () => {},
    },
    providerForm: {
      buildChatPayload: () => ({ payload: {} }),
      getTtsProviderId: () => "",
    },
    pluginHost: null,
    saveUiConfig: () => {},
    getSelectedProvider: () => ({ id: "provider-id", name: "Provider Name" }),
    getSelectedModelId: () => "mao_pro",
    streamChat: async (payload, onEvent) => {
      onStreamChat?.(payload);
      onEvent({
        event: "final",
        data: {
          provider: "provider-id",
          providerLabel: "Provider Name",
          model: "mao_pro",
          sessionKey: "session-key",
          images: [],
        },
      });
    },
    rememberConversationEntry: () => {},
    conversationState: { recentConversationEntries: [] },
    parseSpeechForDisplay: (text) => ({ visibleText: text, units: [] }),
    getSegmentationOptions: () => ({
      allowSoftBreak: true,
      softBreakThreshold: 20,
      minSegmentChars: 1,
    }),
    getCurrentSessionId: () => "session-id",
    appendAttachmentsToBubble: () => {},
    clearDraft: () => {},
    scrollMessagesToBottom: () => {},
    renderRealtimeMessage: () => {},
    markRealtimeMessageSeen: () => {},
    applyBusyState: () => {},
    isBusy: () => false,
  };
}

test("normal chat turns send messageSource=chat so realtime replay is ignored locally", async () => {
  let capturedPayload = null;
  const runner = createTurnRunner(createDeps({
    onStreamChat: (payload) => {
      capturedPayload = payload;
    },
  }));

  await runner.runChatTurn({
    text: "hello",
    showAssistantBubble: false,
    requestMode: "normal",
  });

  assert.equal(capturedPayload?.messageSource, "chat");
});

test("automation turns keep messageSource=automation", async () => {
  let capturedPayload = null;
  const runner = createTurnRunner(createDeps({
    onStreamChat: (payload) => {
      capturedPayload = payload;
    },
  }));

  await runner.runChatTurn({
    text: "hello",
    showAssistantBubble: false,
    requestMode: "automation",
  });

  assert.equal(capturedPayload?.messageSource, "automation");
});
