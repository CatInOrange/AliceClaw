/**
 * Draft input synchronization between web and desktop inputs.
 */

/**
 * @typedef {Object} DraftSyncDeps
 * @property {HTMLInputElement|HTMLTextAreaElement|null} chatInputEl
 * @property {HTMLInputElement|HTMLTextAreaElement|null} desktopChatInputEl
 */

/**
 * @param {DraftSyncDeps} deps
 */
export function createDraftSync(deps) {
  const { chatInputEl, desktopChatInputEl } = deps || {};

  function syncDraftValue(nextValue, source = null) {
    if (chatInputEl && chatInputEl !== source && chatInputEl.value !== nextValue) chatInputEl.value = nextValue;
    if (desktopChatInputEl && desktopChatInputEl !== source && desktopChatInputEl.value !== nextValue) desktopChatInputEl.value = nextValue;
  }

  function resizeDesktopInput() {
    if (!desktopChatInputEl) return;
    desktopChatInputEl.style.height = 'auto';
    desktopChatInputEl.style.height = `${Math.min(desktopChatInputEl.scrollHeight, 120)}px`;
  }

  function bindDraftSync() {
    const syncFrom = (sourceEl) => {
      sourceEl?.addEventListener('input', () => {
        syncDraftValue(sourceEl.value, sourceEl);
        if (sourceEl === desktopChatInputEl) resizeDesktopInput();
      });
    };

    syncFrom(chatInputEl);
    syncFrom(desktopChatInputEl);
    resizeDesktopInput();
  }

  function clearDraft() {
    syncDraftValue('', null);
    resizeDesktopInput();
  }

  return {
    syncDraftValue,
    resizeDesktopInput,
    bindDraftSync,
    clearDraft,
  };
}
