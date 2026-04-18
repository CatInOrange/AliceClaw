import { getDomRefs } from './js/dom.js';
import { createUiController } from './js/ui.js';
import { loadLayout, loadUiConfig, saveLayout, getLayoutDefaults } from './js/state.js';
import { createLive2DController } from './js/live2d.js';
import { createTtsEngine } from './js/tts.js';
import { createChatController } from './js/chat.js';
import { createProviderFormController } from './js/provider-form.js';
import { createDesktopShellController } from './js/desktop-shell.js';
import { createAutomationController } from './js/automation.js';
import { createPluginHost } from './js/plugin-host.js';
import { getBackendBaseUrl, setBackendBaseUrl } from './js/backend-url.js';

async function appendPetDebugLog(entry) {
  try {
    const invoke = window.__TAURI__?.core?.invoke;
    if (typeof invoke !== 'function') return;
    const payload = JSON.stringify({
      at: new Date().toISOString(),
      kind: 'frontend-debug',
      ...entry,
    });
    await invoke('append_pet_debug_log', { payload });
  } catch (error) {
    console.warn('append frontend debug log failed', error);
  }
}

window.addEventListener('error', (event) => {
  appendPetDebugLog({
    event: 'window.error',
    message: event?.message || '',
    filename: event?.filename || '',
    lineno: Number(event?.lineno || 0),
    colno: Number(event?.colno || 0),
    error: event?.error?.stack || String(event?.error || ''),
  });
});

window.addEventListener('unhandledrejection', (event) => {
  appendPetDebugLog({
    event: 'window.unhandledrejection',
    reason: event?.reason?.stack || String(event?.reason || ''),
  });
});

window.addEventListener('beforeunload', () => {
  appendPetDebugLog({
    event: 'window.beforeunload',
    visibilityState: document.visibilityState,
  });
});

window.addEventListener('pagehide', () => {
  appendPetDebugLog({
    event: 'window.pagehide',
    visibilityState: document.visibilityState,
  });
});

document.addEventListener('visibilitychange', () => {
  appendPetDebugLog({
    event: 'document.visibilitychange',
    visibilityState: document.visibilityState,
  });
});

const refs = getDomRefs();
const layout = loadLayout('window');
const uiConfig = loadUiConfig();
const ui = createUiController(refs);
let desktopShell = null;
let automation = null;

const live2d = createLive2DController({
  refs,
  layout,
  saveLayout: (nextLayout) => saveLayout(nextLayout || layout, desktopShell?.getState?.().mode === 'pet' ? 'pet' : 'window'),
  setStatus: ui.setStatus,
});
const providerForm = createProviderFormController({ refs, uiConfig, updateProviderUI: ui.updateProviderUI, getModelMeta: () => chat.getModelMeta?.(), getAppMeta: () => chat.getAppMeta?.() });
const ttsEngine = createTtsEngine({
  isEnabled: () => !!refs.ttsEnabledInputEl?.checked,
  onError: (error) => ui.setStatus(`语音播放失败：${error?.message || error}`, true),
  playExpression: live2d.triggerExpression,
  playMotion: live2d.triggerMotion,
  startLipSync: live2d.startLipSync,
  stopLipSync: live2d.stopLipSync,
  shouldUseLipSync: () => !(window.__TAURI__ && document.body.classList.contains('desktop-mode-pet')),
  getSoftBreakThreshold: () => Math.max(1, Number(chat.getModelMeta?.()?.chat?.tts?.softBreakMaxChars || 20)),
  hasPendingBacklog: () => false,
  getTtsProvider: () => providerForm.getTtsProviderId?.(),
  getMinSegmentChars: () => Math.max(1, Number(chat.getModelMeta?.()?.chat?.tts?.minSegmentChars || 1)),
});
const pluginHost = createPluginHost({ chat: null, desktopShell: null, ui, live2d, storage: null });
const chat = createChatController({ refs, uiConfig, ui, ttsEngine, live2d, providerForm, pluginHost });

// Unlock audio playback on first user gesture (required for proactive push TTS in many WebViews).
const unlockOnce = () => { try { ttsEngine.unlock?.(); } catch {} };
window.addEventListener('pointerdown', unlockOnce, { once: true, capture: true });
window.addEventListener('keydown', unlockOnce, { once: true, capture: true });

desktopShell = createDesktopShellController({
  refs,
  ui,
  openSettings: () => {
    refs.settingsMenuEl?.classList.add('expanded');
    refs.settingsOverlayEl?.classList.add('expanded');
  },
  closeSettings: () => {
    refs.settingsMenuEl?.classList.remove('expanded');
    refs.settingsOverlayEl?.classList.remove('expanded');
  },
  onModeChange: (mode) => {
    const nextLayout = loadLayout(mode === 'pet' ? 'pet' : 'window');
    live2d.setLayoutSnapshot(nextLayout, { persist: false });
    live2d.refreshLayoutControls?.();
    live2d.resizeModel();
    live2d.resetFocus(true);
  },
});

async function boot() {
  console.error('[APP.JS] boot() function started!');
  // Send test to backend to verify app.js is loaded
  fetch('/api/debug/model', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({test: 'app.js boot() started', timestamp: new Date().toISOString()}) }).catch(e => console.error('Fetch failed:', e));
  automation = createAutomationController({ refs, uiConfig, ui, chat, desktopShell });
  pluginHost.api.chat = chat;
  pluginHost.api.desktop = desktopShell;
  await pluginHost.loadBuiltins();
  live2d.bindLayoutControls(() => getLayoutDefaults(desktopShell?.getState?.().mode === 'pet' ? 'pet' : 'window'));
  live2d.bindMouseControls();
  chat.bindChat();
  desktopShell.bind();
  automation.bind();

  if (refs.ttsEnabledInputEl) {
    refs.ttsEnabledInputEl.checked = uiConfig.ttsEnabled !== false;
  }
  if (refs.backendBaseUrlInputEl) {
    const initialBackendBaseUrl = uiConfig.backendBaseUrl || getBackendBaseUrl();
    refs.backendBaseUrlInputEl.value = initialBackendBaseUrl;
    setBackendBaseUrl(initialBackendBaseUrl);
    refs.backendBaseUrlInputEl.addEventListener('change', () => {
      const next = refs.backendBaseUrlInputEl.value.trim();
      setBackendBaseUrl(next);
      uiConfig.backendBaseUrl = next;
      localStorage.setItem('openclaw-live2d-ui-config-v4', JSON.stringify(uiConfig));
      window.location.reload();
    });
  }

  const initialMode = desktopShell?.getState?.().mode === 'pet' ? 'pet' : 'window';
  live2d.setLayoutSnapshot(loadLayout(initialMode), { persist: false });

  await chat.loadSelectedModel(uiConfig.modelId || '');
  await chat.refreshSessionsUi?.();

  // Resize handling is throttled inside live2d.bindMouseControls

  if (initialMode !== 'pet') {
    ui.addMessage('assistant', '点击 ⚙️ 设置按钮配置 AI 服务和外观。点击"展开全部"查看所有表情和动作。', 'system');
  }
}

boot().catch((error) => {
  console.error(error);
  appendPetDebugLog({
    event: 'boot.catch',
    reason: error?.stack || String(error || ''),
  });
  ui.setStatus(`模型加载失败：${error?.message || error}`, true);
});
