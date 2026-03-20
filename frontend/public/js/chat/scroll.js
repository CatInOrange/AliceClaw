/**
 * Chat scroll helpers.
 *
 * Keep these small and side-effect free; callers decide when to scroll.
 */

/**
 * @param {{ messagesEl?: HTMLElement|null, desktopMessagesEl?: HTMLElement|null }} refs
 */
export function createScrollHelpers({ messagesEl, desktopMessagesEl } = {}) {
  function scrollMessagesToBottom() {
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
    if (desktopMessagesEl) desktopMessagesEl.scrollTop = desktopMessagesEl.scrollHeight;
  }

  function scrollMessagesToBottomRaf() {
    requestAnimationFrame(() => scrollMessagesToBottom());
  }

  return {
    scrollMessagesToBottom,
    scrollMessagesToBottomRaf,
  };
}
