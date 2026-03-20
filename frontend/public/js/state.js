export const layoutStorageKey = 'openclaw-live2d-layout-v4';
export const uiStorageKey = 'openclaw-live2d-ui-config-v4';
export const layoutDefaults = { scale: 1, offsetX: 0, offsetY: 0 };
export const petLayoutDefaults = { scale: 1, offsetX: 0, offsetY: 0 };

export function getLayoutDefaults(mode = 'window') {
  return mode === 'pet' ? petLayoutDefaults : layoutDefaults;
}

function getLayoutStorageKey(mode = 'window') {
  return mode === 'pet' ? `${layoutStorageKey}:pet` : `${layoutStorageKey}:window`;
}

export function loadLayout(mode = 'window') {
  try {
    const legacyWindowRaw = localStorage.getItem('openclaw-live2d-layout-v3:window') || localStorage.getItem('openclaw-live2d-layout-v2:window') || localStorage.getItem('openclaw-live2d-layout-v1');
    const legacyPetRaw = localStorage.getItem('openclaw-live2d-layout-v3:pet');
    const fallbackRaw = mode === 'pet' ? legacyPetRaw : legacyWindowRaw;
    const raw = localStorage.getItem(getLayoutStorageKey(mode)) || fallbackRaw;
    return raw ? { ...getLayoutDefaults(mode), ...JSON.parse(raw) } : { ...getLayoutDefaults(mode) };
  } catch {
    return { ...getLayoutDefaults(mode) };
  }
}

export function saveLayout(layout, mode = 'window') {
  localStorage.setItem(getLayoutStorageKey(mode), JSON.stringify(layout));
}

function getDefaultUiConfig() {
  return {
    modelId: '',
    providerId: '',
    providerState: {},
    backendBaseUrl: '',
    ttsEnabled: true,
    ttsProvider: '',
    pushTtsProvider: '',
    automation: null,
    focusCenterByModel: {},
    focusCenter: null,
  };
}

export function loadUiConfig() {
  try {
    const raw = localStorage.getItem(uiStorageKey);
    return raw ? { ...getDefaultUiConfig(), ...JSON.parse(raw) } : getDefaultUiConfig();
  } catch {
    return getDefaultUiConfig();
  }
}

function readProviderFieldsFromDom(providerFieldsEl) {
  const state = {};
  providerFieldsEl?.querySelectorAll('input[data-field-key]').forEach((inputEl) => {
    const key = inputEl.dataset.fieldKey;
    if (!key) return;
    state[key] = inputEl.value?.trim?.() || '';
  });
  return state;
}

export function saveUiConfig(uiConfig, elements) {
  const { settingsModelSelectEl, providerSelectEl, ttsEnabledInputEl, ttsProviderSelectEl, pushTtsProviderSelectEl, backendBaseUrlInputEl, providerForm, providerFieldsEl } = elements;
  uiConfig.modelId = settingsModelSelectEl?.value || '';
  uiConfig.providerId = providerSelectEl.value;
  uiConfig.backendBaseUrl = backendBaseUrlInputEl?.value?.trim?.() || '';
  uiConfig.ttsEnabled = !!ttsEnabledInputEl.checked;
  if (ttsProviderSelectEl) uiConfig.ttsProvider = ttsProviderSelectEl.value;
  if (pushTtsProviderSelectEl) uiConfig.pushTtsProvider = pushTtsProviderSelectEl.value;
  uiConfig.providerState = uiConfig.providerState || {};
  const providerId = String(providerSelectEl.value || '').trim();
  uiConfig.providerState[providerId] = providerForm?.readCurrentFieldState?.() || readProviderFieldsFromDom(providerFieldsEl);
  localStorage.setItem(uiStorageKey, JSON.stringify(uiConfig));
}

export function getProviderState(uiConfig, providerId) {
  const state = uiConfig.providerState?.[providerId] || {};
  return { ...state };
}
