import { getProviderState } from './state.js';
import { createProviderFieldsController } from './provider-fields.js';

export function createProviderFormController({ refs, uiConfig, updateProviderUI, getModelMeta, getAppMeta }) {
  const { providerSelectEl, providerFieldsEl, desktopModelSelectEl, settingsModelSelectEl } = refs;
  const fields = createProviderFieldsController(providerFieldsEl);

  function getSelectedModelId() {
    const modelId = desktopModelSelectEl?.value || settingsModelSelectEl?.value;
    return modelId || uiConfig.modelId || getAppMeta?.()?.selectedModelId || '';
  }

  function getSelectedProvider() {
    const modelMeta = getModelMeta?.();
    const providerId = providerSelectEl?.value;
    return (modelMeta?.chat?.providers || []).find((item) => item.id === providerId) || (modelMeta?.chat?.providers || [])[0] || null;
  }

  function syncProviderConfig() {
    const modelMeta = getModelMeta?.();
    const defaultProviderId = uiConfig.providerId || modelMeta?.chat?.defaultProviderId || (modelMeta?.chat?.providers || [])[0]?.id || '';
    if (providerSelectEl) providerSelectEl.value = defaultProviderId;
    const provider = getSelectedProvider();
    if (!provider) {
      fields.clear();
      return;
    }
    const providerState = getProviderState(uiConfig, provider.id);
    fields.render(provider.fields || [], providerState);
    if (typeof updateProviderUI === 'function') {
      updateProviderUI(provider, modelMeta);
    }
  }

  function buildChatPayload(text) {
    const provider = getSelectedProvider();
    const modelId = getSelectedModelId();
    const payload = { modelId, providerId: provider?.id, text };
    const values = fields.readValues();
    for (const field of provider?.fields || []) {
      const key = String(field?.key || '').trim();
      if (!key) continue;
      payload[key] = values[key] ?? '';
    }
    return { provider, modelId, payload };
  }

  function readCurrentFieldState() {
    return fields.readValues();
  }

  function getTtsProviderId() {
    const selectEl = document.getElementById('tts-provider-select');
    return selectEl?.value || 'edge-tts';
  }

  return {
    getSelectedModelId,
    getSelectedProvider,
    syncProviderConfig,
    buildChatPayload,
    getTtsProviderId,
    readCurrentFieldState,
    getInputElements: fields.getInputElements,
  };
}
