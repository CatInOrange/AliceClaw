/**
 * One chat "turn" runner: build request text, stream the reply, parse actions,
 * update UI, and optionally persist assistant messages.
 *
 * This module is intentionally dependency-injected to keep it reusable and to
 * keep `chat.js` as orchestration only.
 */

import { createSpeechStreamState, consumeSpeechStreamChunk, finalizeSpeechStreamState } from '../directives.js';
import { parseActionJson, normalizeActions, dispatchActions } from '../action-dispatcher.js';
import { absolutizeBackendAssetUrl } from '../backend-url.js';

/**
 * @param {string} text
 */
export function parseStructuredAutomationReply(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const candidates = [raw];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  const jsonMatch = raw.match(/\{[\s\S]*\}$/);
  if (jsonMatch?.[0]) candidates.push(jsonMatch[0].trim());
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (!parsed || typeof parsed !== 'object') continue;
      const speech = typeof parsed.speech === 'string' ? parsed.speech.trim() : '';
      const actions = Array.isArray(parsed.actions) ? parsed.actions.filter((item) => item && typeof item === 'object') : [];
      return { speech: speech || '……', actions };
    } catch { }
  }
  return null;
}

/**
 * @param {Object} args
 * @param {'normal'|'automation'|'tool'} args.mode
 * @param {string} args.visibleText
 * @param {string} [args.toolsPayload]
 */
export function buildTurnRequestText({ mode, visibleText, toolsPayload = '' }) {
  const text = String(visibleText || '').trim();

  const normalPrefix = [
    '[[TURN_INSTRUCTION]]',
    'You MUST reply with a single JSON object, no markdown.',
    'Schema: {"speech":"Text shown to the user","actions":[{"type":"call","tool":"tool.name","args":{}}]}',
    'If no tool call is needed, return {"speech":"...","actions":[]} only.',
    toolsPayload ? `Available tools: ${toolsPayload}` : '',
    'User message:',
    '[[USER_MESSAGE]]',
  ].filter(Boolean).join('\n');

  const automationPrefix = [
    '[[TURN_INSTRUCTION]]',
    'The following block is a one-turn automation rule, NOT normal user chat.',
    'You MUST reply with a single JSON object, no markdown.',
    'Schema: {"speech":"Text shown to the user","actions":[{"type":"call","tool":"tool.name","args":{}}]}',
    'If no tool call is needed, return {"speech":"...","actions":[]} only.',
    toolsPayload ? `Available tools: ${toolsPayload}` : '',
    'Automation message:',
    '[[AUTOMATION_MESSAGE]]',
  ].filter(Boolean).join('\n');

  const prefix = mode === 'automation' ? automationPrefix : normalPrefix;
  const fallback = mode === 'automation'
    ? '(No automation text provided. If there are images, respond based on the images.)'
    : '(No user text provided. If there are images, respond based on the images.)';

  return `${prefix}\n${text || fallback}`;
}

/**
 * @typedef {Object} RunChatTurnArgs
 * @property {string} text
 * @property {any[]} [attachments]
 * @property {boolean} [showUserBubble]
 * @property {boolean} [showAssistantBubble]
 * @property {boolean} [persistAssistantMessage]
 * @property {string} [assistantMeta]
 * @property {string} [userMeta]
 * @property {string} [systemNote]
 * @property {string} [pendingMeta]
 * @property {boolean} [structuredResponse]
 * @property {boolean} [clearComposer]
 * @property {boolean} [rememberConversation]
 * @property {'normal'|'automation'|'tool'} [requestMode]
 * @property {string|undefined} [historyText]
 */

/**
 * @typedef {Object} RunChatTurnDeps
 * @property {any} refs
 * @property {any} ui
 * @property {any} uiConfig
 * @property {any} live2d
 * @property {any} ttsEngine
 * @property {any} providerForm
 * @property {any} pluginHost
 * @property {(uiConfig: any, refs: any) => void} saveUiConfig
 * @property {() => any} getSelectedProvider
 * @property {() => string} getSelectedModelId
 * @property {(payload: any, onEvent: Function) => Promise<void>} streamChat
 * @property {(role: string, text: string) => void} rememberConversationEntry
 * @property {any} conversationState
 * @property {(text: string) => {visibleText: string, units: any[]}} parseSpeechForDisplay
 * @property {(options?: any) => any} getSegmentationOptions
 * @property {() => string} getCurrentSessionId
 * @property {(attachments: any[]) => void} [appendAttachmentsToBubble]
 * @property {() => void} clearDraft
 * @property {() => void} scrollMessagesToBottom
 * @property {(message: any) => void} renderRealtimeMessage
 * @property {(messageId: string) => void} [markRealtimeMessageSeen]
 * @property {(busy: boolean) => void} applyBusyState
 * @property {() => boolean} isBusy
 */

/**
 * @param {RunChatTurnDeps} deps
 */
export function createTurnRunner(deps) {
  const {
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
    parseSpeechForDisplay,
    getSegmentationOptions,
    getCurrentSessionId,
    appendAttachmentsToBubble,
    clearDraft,
    scrollMessagesToBottom,
    renderRealtimeMessage,
    markRealtimeMessageSeen,
    applyBusyState,
    isBusy,
  } = deps || {};

  let toolsCatalogSent = false;

  function applySpeechUnits(units = []) {
    for (const unit of units) {
      if (refs?.ttsEnabledInputEl?.checked) {
        ttsEngine.enqueueSpeechUnit(unit);
      } else {
        for (const directive of unit.directives || []) {
          if (directive.type === 'expression' && directive.name) live2d.triggerExpression(directive.name);
          if (directive.type === 'motion') {
            const group = String(directive.group || '');
            const index = Number(directive.index || 0) || 0;
            live2d.triggerMotion(group, index, group ? `${group}[${index}]` : `[${index}]`);
          }
        }
      }
    }
  }

  /**
   * @param {RunChatTurnArgs} args
   */
  async function runChatTurn(args = {}) {
    const {
      text,
      attachments = [],
      showUserBubble = true,
      showAssistantBubble = true,
      persistAssistantMessage = false,
      assistantMeta = '',
      userMeta = '',
      systemNote = '',
      pendingMeta = '',
      structuredResponse = false,
      clearComposer = false,
      rememberConversation = true,
      requestMode = 'normal',
      historyText = undefined,
    } = args;

    if (isBusy?.()) throw new Error('chat_busy');
    const trimmedText = String(text || '').trim();
    const normalizedAttachments = Array.isArray(attachments) ? attachments.filter(Boolean) : [];
    if (!trimmedText && !normalizedAttachments.length) return null;

    saveUiConfig(uiConfig, refs);
    try { ttsEngine.unlock?.(); } catch { }

    applyBusyState(true);
    const provider = getSelectedProvider();
    const modelId = getSelectedModelId();
    if (!provider) throw new Error('当前没有可用聊天 provider。');

    if (systemNote) ui.addMessage('system', systemNote, 'system');

    if (showUserBubble) {
      const metaBits = [userMeta || `你 · ${modelId}`, provider.name || provider.id].filter(Boolean);
      const userMessage = ui.addMessage('user', trimmedText || '', metaBits.join(' · '));
      if (rememberConversation) rememberConversationEntry(conversationState, 'user', trimmedText || '');
      if (typeof appendAttachmentsToBubble === 'function') {
        appendAttachmentsToBubble(userMessage, normalizedAttachments);
      }
    }

    if (clearComposer) clearDraft();

    try {
      let toolsPayload = '';
      if (pluginHost?.getToolCatalog && pluginHost?.getToolCatalogDigest) {
        const digest = pluginHost.getToolCatalogDigest();
        if (!toolsCatalogSent) {
          toolsPayload = JSON.stringify(pluginHost.getToolCatalog());
          toolsCatalogSent = true;
        } else if (digest) {
          toolsPayload = JSON.stringify({ digest });
        }
      }

      const requestText = buildTurnRequestText({ mode: requestMode, visibleText: trimmedText, toolsPayload });
      const { payload } = providerForm.buildChatPayload(requestText);
      const sessionId = getCurrentSessionId?.();
      if (!sessionId) throw new Error('当前没有活动会话。');
      // Latest streaming protocol only (no legacy compatibility).
      payload.sessionId = sessionId;
      if (historyText !== undefined) payload.historyText = String(historyText || '');
      if (assistantMeta) payload.assistantMeta = String(assistantMeta);
      if (requestMode) {
        payload.messageSource = requestMode === 'automation' || requestMode === 'tool'
          ? String(requestMode)
          : 'chat';
      }
      payload.ttsEnabled = !!refs?.ttsEnabledInputEl?.checked;
      if (payload.ttsEnabled) {
        // Backend-driven TTS timeline uses this provider.
        payload.ttsProvider = uiConfig?.ttsProvider || providerForm?.getTtsProviderId?.() || '';
      }

      const backendAttachments = normalizedAttachments.map((attachment) => {
        if (attachment?.type === 'base64' && attachment?.data) {
          return { type: 'image', data: attachment.data, mimeType: attachment.mediaType || attachment.mimeType || 'image/png' };
        }
        if (attachment?.type === 'url' && attachment?.data) {
          return { type: 'image', url: attachment.data };
        }
        return attachment;
      }).filter(Boolean);
      if (backendAttachments.length > 0) payload.attachments = backendAttachments;

      const pendingMessage = showAssistantBubble
        ? ui.addMessage('assistant', '', pendingMeta || `${provider.name || provider.id} · streaming…`)
        : null;

      let finalData = null;
      let finalAttachments = [];
      const speechState = createSpeechStreamState();
      const jsonMode = true;

      // v2 chunk state
      let v2VisibleText = '';
      let v2SpeechRaw = '';

      // v2 actions buffer (backend-parsed)
      let v2Actions = [];

      // v2 backend-driven timeline units
      /** @type {Array<{i:number, text:string, directives:any[], audioUrl?:string, audioMs?:number, error?:string}>} */
      let v2TimelineUnits = [];

      await streamChat(payload, ({ event, data }) => {
        if (event === 'start') return;
        if (event === 'chunk') {
          // Backend v2 chunk: already parsed visible text + directives.
          if (data?.kind === 'text') {
            v2VisibleText = String(data?.visibleText || '');

            // Keep a best-effort streaming directive parser locally as fallback.
            // This is needed when:
            // - TTS is disabled, or
            // - backend TTS/timeline fails or is unavailable,
            // so we can still trigger expressions/motions immediately.
            const nextRaw = String(data?.rawText || '');
            let delta = '';
            if (!v2SpeechRaw) {
              delta = nextRaw;
            } else if (nextRaw.startsWith(v2SpeechRaw)) {
              delta = nextRaw.slice(v2SpeechRaw.length);
            } else {
              // Stream desync: reset and re-consume whole raw text.
              speechState.displayText = '';
              speechState.visibleBuffer = '';
              speechState.inDirective = false;
              speechState.directiveBuffer = '';
              speechState.pendingDirectives = [];
              delta = nextRaw;
            }
            v2SpeechRaw = nextRaw;
            if (delta) {
              consumeSpeechStreamChunk(speechState, delta, getSegmentationOptions());
            }

            if (pendingMessage) {
              pendingMessage.bubbleEl.textContent = v2VisibleText;
              if (pendingMessage.mirrorBubbleEl) pendingMessage.mirrorBubbleEl.textContent = v2VisibleText;
              pendingMessage.metaEl.textContent = pendingMeta || `${provider.name || provider.id} · streaming…`;
              if (pendingMessage.mirrorMetaEl) pendingMessage.mirrorMetaEl.textContent = pendingMeta || `${provider.name || provider.id} · streaming…`;
            }
            scrollMessagesToBottom();
          }
          return;
        }
        if (event === 'timeline') {
          // Backend-driven audio+directive timeline units.
          const unit = data?.unit;
          if (unit && typeof unit === 'object') {
            v2TimelineUnits.push(unit);
          }
          return;
        }
        // NOTE: legacy `delta` events removed.
        if (event === 'final') {
          finalData = data;
          finalAttachments = data.images || [];
        }
        if (event === 'action') {
          // Backend v2 structured actions.
          // We just store them; execution happens after streaming completes.
          const actions = Array.isArray(data?.actions) ? data.actions : [];
          if (actions.length) v2Actions = actions;
        }
      });

      if (!finalData) throw new Error('流式响应提前结束，未收到 final 事件');

      const routeMeta = finalData.sessionKey || provider.name || provider.id;
      const finalized = finalizeSpeechStreamState(speechState, getSegmentationOptions());
      // Prefer streamed visible text.
      let finalVisibleReply = (v2VisibleText || finalized.visibleText || pendingMessage?.bubbleEl?.textContent || '……');

      let actions = [];
      let dispatchableActions = v2Actions.length ? normalizeActions({ actions: v2Actions }) : [];
      let speechUnits = finalized.units || [];

      // Protocol v2: backend should already provide actions; keep legacy parsing as fallback.
      const parsedJson = parseActionJson(finalVisibleReply);
      if (!dispatchableActions.length && parsedJson) {
        const parsedSpeech = String(parsedJson.speech || '').trim() || '……';
        const parsed = parseSpeechForDisplay(parsedSpeech);
        finalVisibleReply = parsed.visibleText || '……';
        speechUnits = parsed.units || [];
        actions = Array.isArray(parsedJson.actions) ? parsedJson.actions : [];
        dispatchableActions = normalizeActions(parsedJson);
      } else if (structuredResponse) {
        const parsed = parseStructuredAutomationReply(finalVisibleReply);
        if (parsed) {
          const parsedText = parsed.speech || '……';
          const parsedUnits = parseSpeechForDisplay(parsedText);
          finalVisibleReply = parsedUnits.visibleText || '……';
          speechUnits = parsedUnits.units || [];
          actions = parsed.actions || [];
          dispatchableActions = normalizeActions({ actions });
        }
      }

      if (pendingMessage) {
        pendingMessage.bubbleEl.textContent = finalVisibleReply;
        if (pendingMessage.mirrorBubbleEl) pendingMessage.mirrorBubbleEl.textContent = finalVisibleReply;
        const finalMeta = persistAssistantMessage && assistantMeta
          ? assistantMeta
          : `${finalData.providerLabel || finalData.provider} · ${finalData.model} · ${routeMeta}`;
        pendingMessage.metaEl.textContent = finalMeta;
        if (pendingMessage.mirrorMetaEl) pendingMessage.mirrorMetaEl.textContent = finalMeta;
        if (finalAttachments.length && typeof appendAttachmentsToBubble === 'function') {
          appendAttachmentsToBubble(pendingMessage, finalAttachments);
        }
      }

      if (finalData?.messageId && typeof markRealtimeMessageSeen === 'function') {
        markRealtimeMessageSeen(String(finalData.messageId));
      }

      if (rememberConversation) rememberConversationEntry(conversationState, 'assistant', finalVisibleReply);

      const shouldHandleLocalPlayback = !persistAssistantMessage || !!showAssistantBubble;
      if (shouldHandleLocalPlayback) {
        // If backend provided a timeline, prefer it for TTS + directive timing.
        if (payload.ttsEnabled && v2TimelineUnits.length) {
          // Ensure stable order by index.
          v2TimelineUnits = v2TimelineUnits.slice().sort((a, b) => (Number(a?.i || 0) - Number(b?.i || 0)));
          for (const unit of v2TimelineUnits) {
            const directives = Array.isArray(unit?.directives) ? unit.directives : [];
            const audioUrl = String(unit?.audioUrl || '').trim();
            if (audioUrl) {
              ttsEngine.enqueuePreparedAudio(absolutizeBackendAssetUrl(audioUrl), directives);
            } else if (directives.length) {
              // No audio available: still apply directives (and optionally synthesize text client-side if desired).
              // For now, keep it simple: directive-only applies.
              for (const directive of directives) {
                if (directive.type === 'expression' && directive.name) live2d.triggerExpression(directive.name);
                if (directive.type === 'motion') {
                  const group = String(directive.group || '');
                  const index = Number(directive.index || 0) || 0;
                  live2d.triggerMotion(group, index, group ? `${group}[${index}]` : `[${index}]`);
                }
              }
            }
          }
        } else {
          applySpeechUnits(speechUnits);
        }
        const reaction = ui.chooseReactionForReply(finalVisibleReply);
        if (!refs?.ttsEnabledInputEl?.checked && speechUnits.every((u) => !(u.directives || []).length)) {
          if (reaction.expression) live2d.triggerExpression(reaction.expression);
          if (reaction.motion) live2d.triggerMotion(reaction.motion[0], reaction.motion[1], `${reaction.motion[0]}[${reaction.motion[1]}]`);
        }
      }

      if (dispatchableActions.length && pluginHost) {
        await dispatchActions({
          actions: dispatchableActions,
          pluginHost,
          onResult: async (action, result) => {
            if (action.then === 'send_result_to_ai') {
              await pluginHost.api?.chat?.sendToAI?.({
                text: JSON.stringify({ tool: action.tool, result }),
                attachments: [],
                mode: 'tool',
                historyText: '',
              });
            }
          },
        });
      }

      return { finalData, replyText: finalVisibleReply, actions, attachments: finalAttachments };
    } finally {
      applyBusyState(false);
    }
  }

  return {
    runChatTurn,
  };
}
