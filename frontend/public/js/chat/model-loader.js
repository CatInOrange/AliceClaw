/**
 * Model loading orchestration.
 *
 * Keeps `chat.js` slim by packaging the model-manifest fetch + UI wiring + Live2D reload.
 */

/**
 * @param {{
 *   fetchModelManifest: Function,
 *   saveUiConfig: Function,
 *   ui: any,
 *   providerForm: any,
 *   live2d: any,
 *   getUiConfig: () => any,
 *   getRefs: () => any,
 *   setAppMeta: (m: any) => void,
 *   setModelMeta: (m: any) => void,
 *   getModelMeta: () => any,
 * }} deps
 */
export function createModelLoader(deps) {
  const {
    fetchModelManifest,
    saveUiConfig,
    ui,
    providerForm,
    live2d,
    getUiConfig,
    getRefs,
    setAppMeta,
    setModelMeta,
  } = deps;

  async function loadSelectedModel(modelId, announce = false) {
    const refs = getRefs();
    const uiConfig = getUiConfig();

    const appMeta = await fetchModelManifest(modelId || '');
    const modelMeta = appMeta.model;

    setAppMeta(appMeta);
    setModelMeta(modelMeta);

    // Default TTS providers come from backend config (manifest).
    if (!uiConfig.ttsProvider) uiConfig.ttsProvider = modelMeta?.chat?.tts?.provider || 'edge-tts';
    if (!uiConfig.pushTtsProvider) uiConfig.pushTtsProvider = modelMeta?.chat?.tts?.pushProvider || modelMeta?.chat?.tts?.provider || 'edge-tts';

    ui.renderModelSelector(appMeta, uiConfig);
    ui.renderProviderSelector(modelMeta);

    ui.renderTtsProviderSelector(modelMeta, uiConfig.ttsProvider, (providerId) => {
      uiConfig.ttsProvider = providerId;
      saveUiConfig(uiConfig, refs);
    });
    ui.renderPushTtsProviderSelector(modelMeta, uiConfig.pushTtsProvider, (providerId) => {
      uiConfig.pushTtsProvider = providerId;
      saveUiConfig(uiConfig, refs);
    });

    providerForm.syncProviderConfig();

    await live2d.loadSelectedModel({ appMeta, modelMeta }, () => {
      ui.renderQuickActions(modelMeta, live2d.triggerMotion, live2d.triggerExpression);
      ui.renderDebugPanel(modelMeta, live2d.triggerMotion, live2d.triggerExpression);
    });

    ui.setStatus(`模型加载成功：${modelMeta.name}`);
    if (announce) ui.addMessage('assistant', `已切换到模型：${modelMeta.name}`, 'system');

    return { appMeta, modelMeta };
  }

  return {
    loadSelectedModel,
  };
}
