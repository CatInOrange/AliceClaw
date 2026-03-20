export function createSessionState() {
  let currentSessionId = '';

  function getCurrentSessionId() {
    return currentSessionId;
  }

  function setCurrentSessionId(sessionId) {
    currentSessionId = String(sessionId || '').trim();
    return currentSessionId;
  }

  return {
    getCurrentSessionId,
    setCurrentSessionId,
  };
}
