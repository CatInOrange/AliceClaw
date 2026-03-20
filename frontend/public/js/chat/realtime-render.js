/**
 * Realtime message rendering and message.created event handling.
 */

/**
 * @param {{
 *   ui: any,
 *   conversationState: { recentConversationEntries: any[] },
 *   seenRealtimeMessageIds: Set<any>,
 *   appendAttachmentToBubble: Function,
 *   rememberConversationEntry: Function,
 *   stripStageDirectives: Function,
 * }} deps
 */
export function createRealtimeRenderer(deps) {
  const {
    ui,
    conversationState,
    seenRealtimeMessageIds,
    appendAttachmentToBubble,
    rememberConversationEntry,
    stripStageDirectives,
  } = deps;

  function renderRealtimeMessage(message) {
    if (!message || !message.id || seenRealtimeMessageIds.has(message.id)) return;
    seenRealtimeMessageIds.add(message.id);

    const role = message.role || 'assistant';
    const text = stripStageDirectives(message.text || '');
    const meta = message.meta || (role === 'assistant' ? 'OpenClaw Agent' : role === 'user' ? '你' : 'Live2D');
    const rendered = ui.addMessage(role, text, meta);
    rememberConversationEntry(conversationState, role, text);
    for (const attachment of message.attachments || []) {
      appendAttachmentToBubble(rendered.bubbleEl, attachment);
      appendAttachmentToBubble(rendered.mirrorBubbleEl, attachment);
    }
  }

  /**
   * Create handler for SSE event: message.created
   *
   * @param {{
   *   ttsEnabledInputEl?: HTMLInputElement|null,
   *   scrollMessagesToBottomRaf: Function,
   *   maybeEnqueuePushTtsForMessage: Function,
   *   ttsEngine: any,
   *   uiConfig: any,
   *   getModelMeta: () => any,
   *   parseSpeechForDisplay: Function,
   *   stripStageDirectives: Function,
   *   findFirstAudioAttachmentUrl: Function,
   *   applyDirectivesDirectly: Function,
   *   getCurrentSessionId?: Function,
   *   logger?: Console,
   * }} opts
   */
  function createMessageCreatedHandler(opts) {
    const logger = opts.logger || console;
    return (data) => {
      try {
        const msg = data?.message || data?.payload?.message;
        const currentSessionId = opts.getCurrentSessionId?.() || '';
        const source = String(msg?.source || '').trim().toLowerCase();
        logger.info?.('[PushTTS] message.created received', {
          id: msg?.id || '',
          sessionId: msg?.sessionId || '',
          currentSessionId,
          role: msg?.role || '',
          source,
          textLen: String(msg?.text || '').trim().length,
          attachments: Array.isArray(msg?.attachments) ? msg.attachments.length : 0,
          ttsEnabled: !!opts.ttsEnabledInputEl?.checked,
        });

        if (currentSessionId && msg?.sessionId && msg.sessionId !== currentSessionId) {
          return;
        }

        // Locally initiated assistant chat turns are already rendered and voiced by the turn runner.
        // Ignore the live event to avoid duplicate bubbles / duplicate TTS in the same client.
        if (msg?.id && source === 'chat' && String(msg?.role || '').trim().toLowerCase() === 'assistant') {
          seenRealtimeMessageIds.add(msg.id);
          return;
        }

        // Automation replies are already rendered locally by the active turn runner.
        // Keep the event marked as seen so reconnect/replay does not duplicate it.
        if (source === 'automation' && msg?.id) {
          seenRealtimeMessageIds.add(msg.id);
          return;
        }

        renderRealtimeMessage(msg);
        opts.scrollMessagesToBottomRaf();

        opts.maybeEnqueuePushTtsForMessage({
          message: msg,
          ttsEnabled: !!opts.ttsEnabledInputEl?.checked,
          ttsEngine: opts.ttsEngine,
          uiConfig: opts.uiConfig,
          modelMeta: opts.getModelMeta(),
          parseSpeechForDisplay: opts.parseSpeechForDisplay,
          stripStageDirectives: opts.stripStageDirectives,
          findFirstAudioAttachmentUrl: opts.findFirstAudioAttachmentUrl,
          applyDirectivesDirectly: opts.applyDirectivesDirectly,
          logger,
        });
      } catch (error) {
        logger.error?.('message.created handling failed:', error);
      }
    };
  }

  return {
    renderRealtimeMessage,
    createMessageCreatedHandler,
  };
}
