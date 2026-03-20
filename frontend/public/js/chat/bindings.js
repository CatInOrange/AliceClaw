/**
 * Chat UI event bindings.
 *
 * Purpose:
 * - Keep `chat.js` focused on composition and high-level flow.
 * - Centralize DOM event wiring in a single module.
 */

/**
 * @param {{
 *   refs: any,
 *   uiConfig: any,
 *   saveUiConfig: Function,
 *   providerForm: any,
 *   sendChat: Function,
 *   loadSelectedModel: Function,
 *   addImageFromDataUrl: Function,
 *   setupAttachmentHandlers: Function,
 *   cameraBind: Function,
 *   bindDraftSync: Function,
 *   realtimeBind: Function,
 *   settingsMenuBind: Function,
 *   sessionsPanelBind: Function,
 *   ui: any,
 * }} deps
 */
export function bindChatUi(deps) {
  const {
    refs,
    uiConfig,
    saveUiConfig,
    providerForm,
    sendChat,
    loadSelectedModel,
    addImageFromDataUrl,
    setupAttachmentHandlers,
    cameraBind,
    bindDraftSync,
    realtimeBind,
    settingsMenuBind,
    sessionsPanelBind,
    ui,
  } = deps;

  const {
    providerSelectEl,
    providerFieldsEl,
    ttsEnabledInputEl,
    chatInputEl,
    desktopChatInputEl,
    sendBtnEl,
    desktopSendBtnEl,
    settingsModelSelectEl,
    desktopModelSelectEl,
  } = refs;

  const save = () => saveUiConfig(uiConfig, { ...refs, providerForm });

  window.addEventListener('openclaw:add-attachment', (event) => {
    const dataUrl = event?.detail;
    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
      addImageFromDataUrl(dataUrl);
    }
  });

  setupAttachmentHandlers();
  cameraBind();
  bindDraftSync();
  realtimeBind().catch(() => {});

  settingsMenuBind();
  sessionsPanelBind();

  providerSelectEl?.addEventListener('change', () => {
    save();
    providerForm.syncProviderConfig();
    save();
  });

  ttsEnabledInputEl?.addEventListener('change', save);
  providerFieldsEl?.addEventListener('change', save);
  providerFieldsEl?.addEventListener('input', save);

  const ttsProviderSelectEl = document.getElementById('tts-provider-select');
  if (ttsProviderSelectEl) {
    ttsProviderSelectEl.addEventListener('change', save);
  }

  const bindSendInput = (inputEl) => {
    inputEl?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendChat();
      }
    });
  };
  sendBtnEl?.addEventListener('click', sendChat);
  desktopSendBtnEl?.addEventListener('click', sendChat);
  bindSendInput(chatInputEl);
  bindSendInput(desktopChatInputEl);

  settingsModelSelectEl?.addEventListener('change', async () => {
    if (desktopModelSelectEl) desktopModelSelectEl.value = settingsModelSelectEl.value;
    save();
    await loadSelectedModel(settingsModelSelectEl.value, true);
  });
  desktopModelSelectEl?.addEventListener('change', async () => {
    if (settingsModelSelectEl) settingsModelSelectEl.value = desktopModelSelectEl.value;
    save();
    await loadSelectedModel(desktopModelSelectEl.value, true);
  });

  refs.toggleExpressionsBtn?.addEventListener('click', ui.toggleExpressionsPanel);
}
