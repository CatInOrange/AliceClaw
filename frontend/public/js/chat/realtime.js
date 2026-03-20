/**
 * Realtime SSE bindings for chat.
 *
 * This module intentionally takes dependencies as arguments so the main
 * controller (`chat.js`) can stay the single place that knows about UI/TTS.
 */

/**
 * @typedef {Object} RealtimeBinderDeps
 * @property {(args: {onEvent?: Function, onOpen?: Function, onError?: Function}) => EventSource} openEventsStream
 * @property {() => Promise<{sessions?: any[], currentId?: string}>} fetchSessions
 * @property {(sessionId?: string) => Promise<{messages?: any[]}>} fetchSessionMessages
 * @property {() => string} [getCurrentSessionId]
 * @property {(sessionId: string) => string} [setCurrentSessionId]
 * @property {(messages: any[]) => any[]} [sortMessages]
 * @property {(message: any) => void} [onHistoryMessage]
 * @property {() => void} [onHistoryLoaded]
 * @property {(args: {event: string, data: any}) => void} [onEvent]
 * @property {(error: any) => void} [onStreamError]
 * @property {number} [initialRetryDelayMs]
 * @property {number} [maxRetryDelayMs]
 */

/**
 * Create a binder that (1) loads initial history and (2) opens the SSE event stream,
 * with simple exponential backoff reconnect on errors.
 *
 * @param {RealtimeBinderDeps} deps
 */
export function createRealtimeBinder(deps) {
  const {
    openEventsStream,
    fetchSessions,
    fetchSessionMessages,
    getCurrentSessionId,
    setCurrentSessionId,
    sortMessages,
    onHistoryMessage,
    onHistoryLoaded,
    onEvent,
    onStreamError,
    initialRetryDelayMs = 1200,
    maxRetryDelayMs = 15000,
  } = deps || {};

  let eventsStream = null;
  let retryTimer = null;
  let retryDelayMs = initialRetryDelayMs;

  function stop() {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    retryDelayMs = initialRetryDelayMs;
    if (eventsStream) {
      try { eventsStream.close(); } catch { }
      eventsStream = null;
    }
  }

  function scheduleReconnect() {
    if (retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      retryDelayMs = Math.min(retryDelayMs * 1.6, maxRetryDelayMs);
      bind().catch(() => { });
    }, retryDelayMs);
  }

  async function loadInitialHistory() {
    try {
      const sessionData = await fetchSessions();
      const sessions = sessionData?.sessions || [];
      const currentSessionId = getCurrentSessionId?.() || sessionData?.currentId || sessions.slice(-1)[0]?.id || '';
      if (currentSessionId) setCurrentSessionId?.(currentSessionId);
      const history = await fetchSessionMessages(currentSessionId);
      const messages = Array.isArray(history?.messages) ? history.messages : [];
      const sorted = typeof sortMessages === 'function' ? sortMessages(messages) : messages;
      for (const message of sorted) {
        onHistoryMessage?.(message);
      }
      onHistoryLoaded?.();
    } catch (error) {
      // Keep the history load best-effort; streaming should still come up.
      console.warn('Failed to load message history:', error);
    }
  }

  async function bind() {
    await loadInitialHistory();

    if (eventsStream) {
      try { eventsStream.close(); } catch { }
    }

    eventsStream = openEventsStream({
      onEvent: ({ event, data }) => {
        onEvent?.({ event, data });
      },
      onError: (error) => {
        onStreamError?.(error);
        scheduleReconnect();
      },
    });

    return eventsStream;
  }

  return {
    bind,
    stop,
    scheduleReconnect,
  };
}
