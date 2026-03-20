/**
 * Chat send orchestration (composer -> attachments -> turn runner).
 */

/**
 * @param {{
 *   getActiveChatInput: Function,
 *   chatInputEl?: HTMLTextAreaElement|HTMLInputElement|null,
 *   desktopChatInputEl?: HTMLTextAreaElement|HTMLInputElement|null,
 *   attachmentManager: any,
 *   renderAttachmentPreview: Function,
 *   camera: { captureFrameDataUrl: Function },
 *   runChatTurn: Function,
 *   getSelectedModelId: Function,
 *   ui: any,
 * }} deps
 */
export function createSendChat(deps) {
  const {
    getActiveChatInput,
    chatInputEl,
    desktopChatInputEl,
    attachmentManager,
    renderAttachmentPreview,
    camera,
    runChatTurn,
    getSelectedModelId,
    ui,
  } = deps;

  async function sendChat() {
    const activeInputEl = getActiveChatInput();
    const text = activeInputEl?.value?.trim?.() || '';
    const hasAttachments = attachmentManager.hasAttachments();
    if (!text && !hasAttachments) return;

    const cameraFrameDataUrl = camera.captureFrameDataUrl();
    if (cameraFrameDataUrl) {
      try {
        attachmentManager.addImageBase64(cameraFrameDataUrl);
        renderAttachmentPreview();
      } catch (e) {
        console.error('Failed to add camera frame:', e);
      }
    }

    const finalHasAttachments = attachmentManager.hasAttachments();
    if (!text && !finalHasAttachments) return;

    const draftAttachments = attachmentManager.getAttachments();
    try {
      await runChatTurn({
        text,
        attachments: draftAttachments,
        showUserBubble: true,
        userMeta: `你 · ${getSelectedModelId()}`,
        clearComposer: true,
        requestMode: 'normal',
        historyText: text,
      });
    } catch (error) {
      console.error(error);
      ui.addMessage('assistant', `出错了：${error?.message || error}`, 'system');
    } finally {
      attachmentManager.clearAttachments();
      renderAttachmentPreview();
      (getActiveChatInput() || chatInputEl || desktopChatInputEl)?.focus?.();
    }
  }

  return { sendChat };
}
