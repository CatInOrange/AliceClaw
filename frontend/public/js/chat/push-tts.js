/**
 * Push / realtime TTS orchestration.
 *
 * Kept as a pure helper module: all side effects (TTS enqueue, directives apply)
 * are performed through injected dependencies.
 */

/**
 * @typedef {Object} MaybeEnqueuePushTtsDeps
 * @property {any} message
 * @property {boolean} ttsEnabled
 * @property {any} ttsEngine
 * @property {{ttsProvider?: string, pushTtsProvider?: string}} uiConfig
 * @property {any} modelMeta
 * @property {(text: string) => {visibleText: string, units: Array<{text: string, directives?: any[]}>}} parseSpeechForDisplay
 * @property {(message: any) => string} findFirstAudioAttachmentUrl
 * @property {(directives: any[]) => void} applyDirectivesDirectly
 * @property {{info?: Function, warn?: Function}} [logger]
 */

/**
 * For a realtime-created message, decide whether to play attachment audio, synthesize text,
 * or only apply directives.
 *
 * @param {MaybeEnqueuePushTtsDeps} deps
 */
export function maybeEnqueuePushTtsForMessage(deps) {
  const {
    message,
    ttsEnabled,
    ttsEngine,
    uiConfig,
    modelMeta,
    parseSpeechForDisplay,
    findFirstAudioAttachmentUrl,
    applyDirectivesDirectly,
    logger = console,
  } = deps || {};

  const msg = message;
  if (!msg) return;

  // Source=push should always be eligible, regardless of role values from different channel implementations.
  const role = String(msg?.role || '').trim().toLowerCase();
  const source = String(msg?.source || '').trim().toLowerCase();
  const isPush = source === 'push';
  const isAssistantLikeRole = ['assistant', 'agent', 'bot', 'ai'].includes(role);
  const messageText = String(msg?.text || '').trim();

  const pushAudioUrl = isPush ? findFirstAudioAttachmentUrl(msg) : '';
  const backendPushProvider = modelMeta?.chat?.tts?.pushProvider || modelMeta?.chat?.tts?.provider || '';
  const preferClientPushTts = isPush && !!uiConfig?.pushTtsProvider && uiConfig.pushTtsProvider !== backendPushProvider;

  let pushUnits = [];
  if (messageText) {
    const parsed = parseSpeechForDisplay(messageText);
    pushUnits = parsed?.units || [];
  }
  const pushDirectives = pushUnits.flatMap((unit) => unit?.directives || []);

  // Prefer client-side push TTS when user-selected provider differs from backend default.
  if (ttsEnabled && pushAudioUrl && !preferClientPushTts) {
    logger?.info?.('[PushTTS] attachment audio enqueue', { messageId: msg?.id || '', hasAudioUrl: true });
    ttsEngine?.enqueuePreparedAudio?.(pushAudioUrl, pushDirectives);
  }

  const shouldSynthesizeText = !pushAudioUrl || preferClientPushTts;
  if (ttsEnabled && messageText && (isPush || isAssistantLikeRole)) {
    if (!shouldSynthesizeText) {
      logger?.info?.('[PushTTS] synthesize skipped', {
        messageId: msg?.id || '',
        reason: 'attachment_audio_preferred',
        preferClientPushTts,
      });
      return;
    }

    const providerOverride = isPush ? uiConfig?.pushTtsProvider : uiConfig?.ttsProvider;
    logger?.info?.('[PushTTS] synthesize enqueue', {
      messageId: msg?.id || '',
      mode: isPush ? 'push' : 'chat',
      providerOverride: providerOverride || '',
      textLen: messageText.length,
    });

    // Reuse the same directive/segmentation pipeline as streaming replies.
    logger?.info?.('[PushTTS] segmented units', {
      messageId: msg?.id || '',
      units: pushUnits.length,
    });
    for (const unit of pushUnits) {
      ttsEngine?.enqueueSpeechUnit?.(unit, {
        provider: providerOverride,
        mode: isPush ? 'push' : 'chat',
      });
    }
    return;
  }

  if (pushDirectives.length) {
    // TTS disabled or no synthesis: still apply directives to Live2D.
    applyDirectivesDirectly(pushDirectives);
  } else {
    logger?.info?.('[PushTTS] synthesize skipped', {
      messageId: msg?.id || '',
      reason: !ttsEnabled
        ? 'tts_disabled'
        : !messageText
          ? 'empty_text'
          : 'role_not_assistant_like_and_not_push',
      role,
      source,
    });
  }

  if (ttsEnabled && isPush && !pushAudioUrl && !messageText) {
    logger?.info?.('[PushTTS] attachment audio not found', { messageId: msg?.id || '' });
  }
}
