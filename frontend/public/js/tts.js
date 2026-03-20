import { requestTts } from './api.js';

export function createTtsEngine({ isEnabled, onError, playExpression, playMotion, startLipSync, stopLipSync, getSoftBreakThreshold, hasPendingBacklog, getTtsProvider, getMinSegmentChars, shouldUseLipSync }) {
  let playbackQueue = Promise.resolve();
  let pendingPlaybackCount = 0;

  // Some environments (notably WebView) block audio unless unlocked by a user gesture.
  // Streaming chat replies usually happen after a user click, but proactive pushes may not.
  // We expose unlock() and also await it before playing.
  let unlocked = false;
  let unlockResolve = null;
  const unlockPromise = new Promise((resolve) => { unlockResolve = resolve; });
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    try { unlockResolve?.(); } catch {}
  }

  function shouldAllowSoftBreak() {
    return !hasPendingBacklog() && pendingPlaybackCount === 0;
  }

  function getSegmentationOptions() {
    return {
      allowSoftBreak: shouldAllowSoftBreak(),
      softBreakThreshold: getSoftBreakThreshold(),
      minSegmentChars: typeof getMinSegmentChars === 'function' ? getMinSegmentChars() : 1,
    };
  }

  function sanitizeTtsText(raw) {
    let value = String(raw || '');
    // Remove emoji / pictographs and variation selectors
    try {
      value = value.replace(/[\uFE0E\uFE0F]/g, '');
      value = value.replace(/\p{Extended_Pictographic}/gu, '');
    } catch {
      // Fallback for older JS engines: remove common emoji ranges
      value = value.replace(/[\uD83C-\uDBFF\uDC00-\uDFFF]+/g, '');
    }
    // Collapse whitespace and punctuation-only fragments
    value = value.replace(/\s+/g, ' ').trim();
    value = value.replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, '').trim();
    return value;
  }

  async function synthesizeTts(text, overrides = {}) {
    const cleaned = sanitizeTtsText(text);
    if (!cleaned || !isEnabled()) return null;
    const configuredProvider = typeof getTtsProvider === 'function' ? getTtsProvider() : undefined;
    const providerOverride = Object.prototype.hasOwnProperty.call(overrides || {}, 'provider') ? overrides.provider : configuredProvider;
    const mode = overrides?.mode;
    console.info('[TTS] submit', {
      mode: mode || 'chat',
      provider: providerOverride || '',
      textLen: cleaned.length,
    });
    const blob = await requestTts(cleaned, providerOverride || undefined, mode);
    return URL.createObjectURL(blob);
  }

  function applyDirectives(directives = []) {
    for (const directive of directives || []) {
      if (directive.type === 'expression' && directive.name) playExpression(directive.name);
      if (directive.type === 'motion' && directive.group != null) {
        const group = String(directive.group || '');
        const index = Number(directive.index || 0) || 0;
        playMotion(group, index, group ? `${group}[${index}]` : `[${index}]`);
      }
    }
  }

  async function playPreparedAudio(url) {
    if (!url || !isEnabled()) return;
    if (!unlocked) {
      // Wait until user gesture unlocks audio.
      await unlockPromise;
    }
    let audio = null;
    try {
      audio = new Audio(url);
      audio.preload = 'auto';
      await audio.play();
      const enableLipSync = typeof shouldUseLipSync === 'function' ? !!shouldUseLipSync() : true;
      if (enableLipSync && typeof startLipSync === 'function') {
        try { await startLipSync(audio); } catch (error) { console.warn('lip sync start failed', error); }
      }
      await new Promise((resolve) => {
        audio.onended = resolve;
        audio.onerror = resolve;
      });
    } finally {
      if (typeof stopLipSync === 'function') {
        try { stopLipSync(); } catch {}
      }
      try {
        if (audio && String(url).startsWith('blob:')) {
          audio.src = '';
        }
      } catch {}
      if (String(url).startsWith('blob:')) {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    }
  }

  function enqueueSpeechUnit(unit, overrides = {}) {
    const text = String(unit?.text || '').trim();
    const directives = unit?.directives || [];
    if ((!text && !directives.length) || !isEnabled()) return;
    pendingPlaybackCount += 1;
    const synthesis = text ? synthesizeTts(text, overrides) : Promise.resolve(null);
    playbackQueue = playbackQueue
      .then(async () => {
        // Directive-only units: apply directives immediately without TTS.
        if (!text && directives.length) {
          applyDirectives(directives);
          return;
        }

        const url = await synthesis;

        // Always apply directives even if TTS synthesis fails (so expressions/motions still trigger).
        if (directives.length) applyDirectives(directives);

        if (!url) return;
        await playPreparedAudio(url);
      })
      .catch((error) => {
        console.error(error);
        onError(error);
      })
      .finally(() => {
        pendingPlaybackCount = Math.max(0, pendingPlaybackCount - 1);
      });
  }

  function enqueuePreparedAudio(url, directives = []) {
    const targetUrl = String(url || '').trim();
    if (!targetUrl || !isEnabled()) return;
    pendingPlaybackCount += 1;
    playbackQueue = playbackQueue
      .then(async () => {
        if (directives.length) applyDirectives(directives);
        await playPreparedAudio(targetUrl);
      })
      .catch((error) => {
        console.error(error);
        onError(error);
      })
      .finally(() => {
        pendingPlaybackCount = Math.max(0, pendingPlaybackCount - 1);
      });
  }

  return {
    unlock,
    enqueueSpeechUnit,
    enqueuePreparedAudio,
    getSegmentationOptions,
    hasPendingBacklog: () => pendingPlaybackCount > 0,
  };
}
