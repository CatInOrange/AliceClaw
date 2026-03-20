const DESKTOP_STORAGE_KEY = 'openclaw-live2d-desktop-shell-v12';

export function createDesktopShellController({ refs, ui, openSettings, closeSettings, onModeChange }) {
  const {
    stageWrapEl,
    chatPanelEl,
    desktopShellEl,
    desktopToggleModeBtnEl,
    desktopToggleChatBtnEl,
    desktopVoiceBtnEl,
    desktopPinBtnEl,
    desktopDragBtnEl,
    desktopSettingsBtnEl,
    desktopContextMenuEl,
    desktopContextMenuItemsEl,
    desktopModeSelectEl,
    desktopAlwaysOnTopInputEl,
    desktopPetUiEl,
    desktopPetAnchorEl,
    desktopPetOrbEl,
    desktopPetSettingsEl,
    desktopPetSettingsCloseBtnEl,
    desktopPetPinToggleBtnEl,
    desktopCopyDebugBtnEl,
    desktopAutoHideSecondsInputEl,
    desktopPetPanelEl,
    desktopPetDockEl,
    desktopPlusBtnEl,
    desktopPlusMenuEl,
    desktopExpressionsPanelEl,
    desktopPlusExpressionsBtnEl,
    desktopPlusCameraBtnEl,
    desktopPlusScreenshotBtnEl,
    desktopCameraPreviewContainerEl,
    desktopCameraCaptureBtnEl,
    desktopCameraCloseBtnEl,
    desktopScreenshotOverlayEl,
    desktopScreenshotSelectionEl,
    desktopScreenshotDimEl,
    desktopTogglePanelBtnEl,
    desktopToggleHideBtnEl,
    desktopOpenSettingsBtnEl,
    desktopToggleExpandBtnEl,
    desktopSwitchWindowBtnEl,
    settingsMenuEl,
    settingsOverlayEl,
    chatHeaderEl,
    windowCloseBtnEl,
  } = refs;

  const headerEl = document.querySelector('header');

  const previewMode = new URLSearchParams(window.location.search).get('desktop');
  const isTauri = !!window.__TAURI__;
  const enabled = isTauri || previewMode === '1' || previewMode === 'true';

  let state = {
    mode: isTauri ? 'pet' : 'normal',
    panelOpen: false,
    settingsOpen: false,
    expanded: false,
    alwaysOnTop: true,
    hideDelayMs: 10000,
  };

  let uiVisible = false;
  let uiHideTimer = null;
  let cursorPollTimer = null;
  let nativeIgnoringCursor = false;
  let lastModelBounds = null;
  let plusMenuOpen = false;
  let screenshotActive = false;
  let screenshotStart = null;
  let screenshotDragging = false;
  let modelDragging = false;
  let lastPassthroughDebugSignature = '';
  let lastPassthroughDebugAt = 0;
  let lastNativeHitSyncSignature = '';
  let nativeHitSyncScheduled = false;
  let nativeHitSyncInFlight = false;
  let nativeHitSyncQueued = false;
  let petDebugLogPath = null;
  let lastCursorHitSignature = '';

  function isElementVisible(el) {
    if (!el) return false;
    if (el.dataset?.cameraActive === 'false') return false;
    if (el.dataset?.cameraActive === 'true') {
      const rect = el.getBoundingClientRect?.();
      return !!rect && rect.width > 0 && rect.height > 0;
    }
    const style = window.getComputedStyle?.(el);
    if (!style) return false;
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect?.();
    return !!rect && rect.width > 0 && rect.height > 0;
  }

  function tauriWindow() {
    const winApi = window.__TAURI__?.window;
    if (!winApi) return null;
    return winApi.getCurrentWindow?.() || winApi.appWindow || null;
  }

  async function setNativeIgnoreCursorEvents(value, reason = '') {
    const next = !!value;
    if (!isTauri) {
      nativeIgnoringCursor = false;
      return;
    }
    if (nativeIgnoringCursor === next) return;

    const win = tauriWindow();
    try {
      if (win?.setIgnoreCursorEvents) {
        await win.setIgnoreCursorEvents(next);
        nativeIgnoringCursor = next;
        debugPassthrough('set-ignore-cursor-events', { value: next, reason });
      }
    } catch (error) {
      console.warn('setIgnoreCursorEvents failed', error);
      debugPassthrough('set-ignore-cursor-events-error', {
        value: next,
        reason,
        error: String(error?.message || error),
      });
    }
  }

  async function forceNormalWindowInput() {
    if (!isTauri) return;
    await setNativeIgnoreCursorEvents(false, 'force-normal-mode');
    const invoke = window.__TAURI__?.core?.invoke;
    try {
      if (typeof invoke === 'function') {
        await invoke('sync_pet_window_input', { enabled: false, regions: [] });
      }
    } catch (error) {
      console.warn('force disable pet window input failed', error);
    }
  }

  function updatePetAnchor(bounds = lastModelBounds) {
    if (!desktopPetAnchorEl || !bounds) return;
    lastModelBounds = bounds;

    const orbSize = 10;
    const compactCardWidth = state.expanded ? 430 : 320;
    const compactCardHeight = state.expanded ? 520 : 360;
    const screenWidth = Math.max(window.innerWidth || 0, 320);
    const screenHeight = Math.max(window.innerHeight || 0, 320);

    const anchorX = Math.round(
      Math.max(8, Math.min(bounds.right + 10, screenWidth - compactCardWidth - 20))
    );

    const anchorY = Math.round(
      bounds.bottom - Math.min(34, bounds.height * 0.08) + 30
    );

    const cardX = 0;

    const orbX = -28;
    const orbY = Math.round(compactCardHeight - orbSize + 6);

    desktopPetAnchorEl.style.setProperty('--pet-anchor-x', `${anchorX}px`);
    desktopPetAnchorEl.style.setProperty('--pet-anchor-y', `${anchorY}px`);
    desktopPetAnchorEl.style.setProperty('--pet-card-x', `${cardX}px`);
    desktopPetAnchorEl.style.setProperty('--pet-orb-x', `${orbX}px`);
    desktopPetAnchorEl.style.setProperty('--pet-orb-y', `${orbY}px`);

    if (!modelDragging) {
      scheduleNativePetWindowInputSync();
    }
  }

  function getHideDelayMs(value = state.hideDelayMs) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 10000;
    return Math.max(1000, Math.min(60000, Math.round(parsed)));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(DESKTOP_STORAGE_KEY);
      if (raw) state = { ...state, ...JSON.parse(raw) };
      delete state.clickThrough;
      state.hideDelayMs = getHideDelayMs(state.hideDelayMs);
      state.settingsOpen = false;
      if (state.mode !== 'pet') state.expanded = false;
    } catch { }
  }

  function saveState() {
    try {
      const { settingsOpen, ...persisted } = state;
      localStorage.setItem(DESKTOP_STORAGE_KEY, JSON.stringify(persisted));
    } catch { }
  }

  async function appendDebugLogToFile(entry) {
    if (!isTauri) return;
    const invoke = window.__TAURI__?.core?.invoke;
    if (typeof invoke !== 'function') return;
    try {
      const path = await invoke('append_pet_debug_log', { payload: JSON.stringify(entry) });
      if (path) {
        petDebugLogPath = path;
        window.__OPENCLAW_PET_DEBUG_LOG_PATH__ = path;
      }
    } catch (error) {
      console.warn('append_pet_debug_log failed', error);
    }
  }

  function debugPassthrough(reason, payload = {}) {
    const snapshot = {
      reason,
      mode: state.mode,
      uiVisible: !!uiVisible,
      panelOpen: !!state.panelOpen,
      settingsOpen: !!state.settingsOpen,
      nativeIgnoringCursor,
      ...payload,
    };
    const signature = JSON.stringify(snapshot);
    const now = Date.now();
    if (signature === lastPassthroughDebugSignature && now - lastPassthroughDebugAt < 1200) return;
    lastPassthroughDebugSignature = signature;
    lastPassthroughDebugAt = now;
    const entry = { at: new Date().toISOString(), ...snapshot };
    try {
      window.__OPENCLAW_PET_DEBUG__ = window.__OPENCLAW_PET_DEBUG__ || [];
      window.__OPENCLAW_PET_DEBUG__.push(entry);
      if (window.__OPENCLAW_PET_DEBUG__.length > 80) window.__OPENCLAW_PET_DEBUG__.shift();
    } catch { }
    appendDebugLogToFile(entry);
    console.info('[pet-passthrough]', snapshot);
  }

  function setPlusMenuOpen(value) {
    plusMenuOpen = !!value;
    desktopPlusMenuEl?.classList.toggle('open', plusMenuOpen);
    scheduleNativePetWindowInputSync();
    scheduleCursorPassthroughCheck();
  }

  function setExpressionsMenuOpen(value) {
    const next = !!value;
    if (desktopExpressionsPanelEl) {
      desktopExpressionsPanelEl.classList.toggle('expanded', next);
    }
    scheduleNativePetWindowInputSync();
    scheduleCursorPassthroughCheck();
  }

  async function setScreenshotMode(active) {
    screenshotActive = !!active;
    if (desktopScreenshotOverlayEl) {
      desktopScreenshotOverlayEl.classList.toggle('active', screenshotActive);
    }
    if (screenshotActive) {
      setPlusMenuOpen(false);
      setExpressionsMenuOpen(false);
      stopCursorPolling();
      await setNativeIgnoreCursorEvents(false, 'screenshot-mode');
      const invoke = window.__TAURI__?.core?.invoke;
      if (typeof invoke === 'function') {
        try {
          await invoke('sync_pet_window_input', { enabled: false, regions: [] });
        } catch (error) {
          console.warn('disable pet input during screenshot failed', error);
        }
      }
    } else if (state.mode === 'pet') {
      startCursorPolling();
      scheduleNativePetWindowInputSync();
      scheduleCursorPassthroughCheck();
    }
  }

  function applyClasses() {
    const isPet = enabled && state.mode === 'pet';
    document.body.classList.toggle('desktop-shell-enabled', enabled);
    document.body.classList.toggle('desktop-mode-pet', isPet);
    document.body.classList.toggle('desktop-panel-open', isPet && !!state.panelOpen);
    document.body.classList.toggle('desktop-settings-open', isPet && !!state.settingsOpen);
    document.body.classList.toggle('desktop-ui-visible', isPet && !!uiVisible);
    document.documentElement.style.background = isPet ? 'transparent' : '';
    document.body.style.background = isPet ? 'transparent' : '';

    desktopToggleModeBtnEl?.classList.toggle('active', state.mode === 'pet');
    desktopToggleChatBtnEl?.classList.toggle('active', !!state.panelOpen);
    desktopPinBtnEl?.classList.toggle('active', !!state.alwaysOnTop);
    if (desktopTogglePanelBtnEl) desktopTogglePanelBtnEl.textContent = state.panelOpen ? '收起' : '聊天';
    if (desktopModeSelectEl) desktopModeSelectEl.value = state.mode;
    if (desktopAlwaysOnTopInputEl) desktopAlwaysOnTopInputEl.checked = !!state.alwaysOnTop;
    if (desktopAutoHideSecondsInputEl) desktopAutoHideSecondsInputEl.value = String(Math.round(getHideDelayMs() / 1000));
    if (desktopPetPanelEl) {
      desktopPetPanelEl.classList.toggle('open', !!state.panelOpen);
      desktopPetPanelEl.classList.toggle('expanded', !!state.expanded);
    }
    if (desktopPetSettingsEl) desktopPetSettingsEl.classList.toggle('open', !!state.settingsOpen);
    if (desktopToggleExpandBtnEl) desktopToggleExpandBtnEl.textContent = state.expanded ? '收起' : '展开';
    if (chatHeaderEl) {
      if (isPet) {
        chatHeaderEl.removeAttribute('data-tauri-drag-region');
      } else {
        chatHeaderEl.setAttribute('data-tauri-drag-region', '');
      }
    }
    if (headerEl) {
      if (isPet) {
        headerEl.removeAttribute('data-tauri-drag-region');
      } else {
        headerEl.setAttribute('data-tauri-drag-region', '');
      }
    }
    updatePetAnchor();
    if (desktopPetPinToggleBtnEl) {
      desktopPetPinToggleBtnEl.classList.toggle('active', !!state.alwaysOnTop);
      desktopPetPinToggleBtnEl.textContent = state.alwaysOnTop ? '已置顶' : '未置顶';
    }
    scheduleNativePetWindowInputSync();
  }

  function getPetWindowMetrics() {
    const screenWidth = Math.max(Number(window.screen?.availWidth) || window.innerWidth || 1280, 960);
    const screenHeight = Math.max(Number(window.screen?.availHeight) || window.innerHeight || 720, 640);
    return {
      width: screenWidth,
      height: screenHeight,
      fullscreen: true,
    };
  }

  async function syncWindowMode() {
    const win = tauriWindow();
    if (!win || !isTauri) return;
    try {
      const dpiApi = window.__TAURI__?.dpi;
      const LogicalSize = dpiApi?.LogicalSize;
      const LogicalPosition = dpiApi?.LogicalPosition;
      const isPet = state.mode === 'pet';

      const safeWinCall = async (fn, label) => {
        try {
          await fn();
        } catch (error) {
          console.warn(`${label} failed`, error);
        }
      };

      // Keep runtime window mutations conservative.
      // On Windows WebView/Tauri, changing transparency/decorations/shadow live can destabilize the window.
      // We only switch size/position/taskbar/input behavior at runtime; visual shell differences come from CSS classes.
      if (win.setResizable) await safeWinCall(() => win.setResizable(!isPet), 'setResizable');
      if (win.setSkipTaskbar) await safeWinCall(() => win.setSkipTaskbar(isPet), 'setSkipTaskbar');
      if (!isPet && win.setIgnoreCursorEvents) {
        await safeWinCall(() => win.setIgnoreCursorEvents(false), 'setIgnoreCursorEvents');
      }

      const petMetrics = isPet ? getPetWindowMetrics() : null;
      if (win.setSize && LogicalSize) {
        if (isPet && petMetrics) {
          await win.setSize(new LogicalSize(petMetrics.width, petMetrics.height));
        } else {
          await win.setSize(new LogicalSize(1440, 900));
        }
      }

      if (isPet && win.setPosition && LogicalPosition) {
        await win.setPosition(new LogicalPosition(window.screen?.availLeft || 0, window.screen?.availTop || 0));
      }
      if (win.center && !isPet) {
        await win.center();
      }
    } catch (error) {
      console.warn('syncWindowMode failed', error);
    }
  }

  async function setAlwaysOnTop(value) {
    state.alwaysOnTop = !!value;
    saveState();
    applyClasses();
    const win = tauriWindow();
    try {
      if (win?.setAlwaysOnTop) await win.setAlwaysOnTop(!!value);
    } catch (error) {
      console.warn('setAlwaysOnTop failed', error);
    }
  }

  async function syncPetInputState() {
    saveState();
    applyClasses();
    await syncNativePetWindowInput();
    await syncPetPointerPassthrough();
  }

  function clearUiHideTimer() {
    if (!uiHideTimer) return;
    clearTimeout(uiHideTimer);
    uiHideTimer = null;
  }

  function setUiVisible(value) {
    uiVisible = !!value;
    if (!uiVisible) setPlusMenuOpen(false);
    applyClasses();
    scheduleNativePetWindowInputSync();
    scheduleCursorPassthroughCheck();
  }

  function scheduleUiHide(delayMs = getHideDelayMs()) {
    clearUiHideTimer();
    if (state.mode !== 'pet') return;
    uiHideTimer = setTimeout(() => {
      const active = document.activeElement;
      const hoveringPetUi = !!desktopPetUiEl?.matches?.(':hover');
      const hoveringSettings = !!desktopPetSettingsEl?.matches?.(':hover');
      const hoveringPlusMenu = !!desktopPlusMenuEl?.matches?.(':hover');
      const hoveringContextMenu = !!desktopContextMenuEl?.matches?.(':hover');
      const hoveringSettingsMenu = !!settingsMenuEl?.matches?.(':hover');
      const hoveringSettingsOverlay = !!settingsOverlayEl?.matches?.(':hover');

      if (active && (desktopPetUiEl?.contains(active) || settingsMenuEl?.contains(active))) {
        scheduleUiHide();
        return;
      }
      if (hoveringPetUi || hoveringSettings || hoveringPlusMenu || hoveringContextMenu || hoveringSettingsMenu || hoveringSettingsOverlay) {
        scheduleUiHide();
        return;
      }
      if (state.settingsOpen || settingsMenuEl?.classList.contains('expanded') || settingsOverlayEl?.classList.contains('expanded')) {
        scheduleUiHide();
        return;
      }
      setUiVisible(false);
    }, delayMs);
  }

  function revealUi(delayMs = getHideDelayMs()) {
    if (state.mode !== 'pet') return;
    setUiVisible(true);
    scheduleUiHide(delayMs);
  }

  function isSettingsOpen() {
    return !!(
      state.settingsOpen ||
      settingsMenuEl?.classList.contains('expanded') ||
      settingsOverlayEl?.classList.contains('expanded') ||
      desktopContextMenuEl?.classList.contains('open')
    );
  }

  function isPointInRect(point, rect, padding = 0) {
    if (!point || !rect) return false;
    return point.x >= rect.left - padding &&
      point.x <= rect.right + padding &&
      point.y >= rect.top - padding &&
      point.y <= rect.bottom + padding;
  }

  function isVisibleRect(rect) {
    if (!rect) return false;
    return rect.width > 1 && rect.height > 1;
  }

  function isElementInteractive(el) {
    if (!el || typeof window.getComputedStyle !== 'function') return false;
    const style = window.getComputedStyle(el);
    if (!style) return false;
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (style.pointerEvents === 'none') return false;
    if (Number(style.opacity || 1) <= 0.01) return false;
    return true;
  }

  function pushInteractionRect(rects, rect, padding, kind) {
    if (!isVisibleRect(rect)) return;
    rects.push({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      padding,
      kind,
    });
  }

  function pushInteractionRectFromEl(rects, el, padding, kind) {
    if (!isElementInteractive(el)) return;
    if (!uiVisible) return;
    if (desktopPetPanelEl && desktopPetPanelEl.contains(el) && !state.panelOpen) return;
    if (desktopPetSettingsEl && desktopPetSettingsEl.contains(el) && !state.settingsOpen) return;
    const rect = el?.getBoundingClientRect?.();
    pushInteractionRect(rects, rect, padding, kind);
  }

  function getPetInteractionRects() {
    const rects = [];

    // Live2D 模型
    if (lastModelBounds) {
      rects.push({ ...lastModelBounds, padding: 28, kind: 'model' });
    }

    // 悬浮球
    pushInteractionRectFromEl(rects, desktopPetOrbEl, 22, 'orb');

    // 右键菜单
    if (desktopContextMenuEl?.classList?.contains('open')) {
      pushInteractionRectFromEl(rects, desktopContextMenuEl, 10, 'context-menu');
    }

    // 加号菜单
    if (plusMenuOpen) {
      pushInteractionRectFromEl(rects, desktopPlusMenuEl, 12, 'plus-menu');
    }
    if (desktopExpressionsPanelEl?.classList?.contains('expanded')) {
      pushInteractionRectFromEl(rects, desktopExpressionsPanelEl, 12, 'expressions-menu');
    }
    pushInteractionRectFromEl(rects, desktopPlusCameraBtnEl, 14, 'camera-btn');
    if (isElementVisible(desktopCameraPreviewContainerEl)) {
      pushInteractionRectFromEl(rects, desktopCameraPreviewContainerEl, 14, 'camera-preview');
      pushInteractionRectFromEl(rects, desktopCameraCaptureBtnEl, 14, 'camera-capture');
      pushInteractionRectFromEl(rects, desktopCameraCloseBtnEl, 14, 'camera-close');
    }

    // 桌宠设置
    if (state.settingsOpen) {
      pushInteractionRectFromEl(rects, desktopPetSettingsEl, 24, 'settings');
      pushInteractionRectFromEl(rects, desktopPetSettingsCloseBtnEl, 16, 'settings-close');
      pushInteractionRectFromEl(rects, desktopPetPinToggleBtnEl, 16, 'settings-pin');
      pushInteractionRectFromEl(rects, desktopCopyDebugBtnEl, 16, 'settings-copy-debug');
      pushInteractionRectFromEl(rects, desktopAutoHideSecondsInputEl, 16, 'settings-autohide-input');
    }

    // 聊天面板打开时：把整个面板 + 所有关键按钮逐个加入热区
    if (state.panelOpen) {
      pushInteractionRectFromEl(rects, desktopPetPanelEl, 24, 'panel');
      pushInteractionRectFromEl(rects, desktopPetDockEl, 18, 'composer');

      // 顶部几个按钮
      pushInteractionRectFromEl(rects, desktopTogglePanelBtnEl, 16, 'panel-toggle');
      pushInteractionRectFromEl(rects, desktopToggleHideBtnEl, 16, 'panel-hide');
      pushInteractionRectFromEl(rects, desktopOpenSettingsBtnEl, 16, 'panel-open-settings');
      pushInteractionRectFromEl(rects, desktopToggleExpandBtnEl, 16, 'panel-expand');
      pushInteractionRectFromEl(rects, desktopSwitchWindowBtnEl, 16, 'panel-switch-window');

      // 其他浮层按钮
      pushInteractionRectFromEl(rects, desktopPlusBtnEl, 16, 'plus-btn');
    } else if (uiVisible) {
      // 面板关闭时，仅在 UI 可见时保留关键按钮
      pushInteractionRectFromEl(rects, desktopPlusBtnEl, 16, 'plus-btn');
      pushInteractionRectFromEl(rects, desktopTogglePanelBtnEl, 16, 'panel-toggle');
      pushInteractionRectFromEl(rects, desktopOpenSettingsBtnEl, 16, 'panel-open-settings');
    }

    return rects;
  }

  function getPetInteractionRectsLight() {
    const rects = [];

    // Live2D 模型
    if (lastModelBounds) rects.push({ ...lastModelBounds, padding: 28, kind: 'model' });

    // 悬浮球
    pushInteractionRectFromEl(rects, desktopPetOrbEl, 22, 'orb');

    // 面板/输入区
    if (state.panelOpen) {
      pushInteractionRectFromEl(rects, desktopPetPanelEl, 24, 'panel');
      pushInteractionRectFromEl(rects, desktopPetDockEl, 18, 'composer');
    }

    // 面板关闭时仅在 UI 可见下保留按钮
    if (!state.panelOpen && uiVisible) {
      pushInteractionRectFromEl(rects, desktopPlusBtnEl, 16, 'plus-btn');
      pushInteractionRectFromEl(rects, desktopTogglePanelBtnEl, 16, 'panel-toggle');
      pushInteractionRectFromEl(rects, desktopOpenSettingsBtnEl, 16, 'panel-open-settings');
    }

    // 设置面板
    if (state.settingsOpen) {
      pushInteractionRectFromEl(rects, desktopPetSettingsEl, 24, 'settings');
    }

    // 右键菜单 / 加号菜单
    if (desktopContextMenuEl?.classList?.contains('open')) {
      pushInteractionRectFromEl(rects, desktopContextMenuEl, 10, 'context-menu');
    }
    if (plusMenuOpen) {
      pushInteractionRectFromEl(rects, desktopPlusMenuEl, 12, 'plus-menu');
    }

    return rects;
  }

  function rectToPhysicalRegion(rect, scale = window.devicePixelRatio || 1) {
    const padding = Number(rect?.padding || 0);
    const left = Number(rect?.left);
    const top = Number(rect?.top);
    const right = Number(rect?.right);
    const bottom = Number(rect?.bottom);
    if (![left, top, right, bottom].every(Number.isFinite)) return null;

    const normalized = {
      left: Math.round((left - padding) * scale),
      top: Math.round((top - padding) * scale),
      right: Math.round((right + padding) * scale),
      bottom: Math.round((bottom + padding) * scale),
      kind: rect?.kind || 'unknown',
    };

    if (normalized.right <= normalized.left || normalized.bottom <= normalized.top) return null;
    return normalized;
  }

  async function syncNativePetWindowInput() {
    if (!enabled || !isTauri || modelDragging) return;
    if (nativeHitSyncInFlight) {
      nativeHitSyncQueued = true;
      return;
    }

    const invoke = window.__TAURI__?.core?.invoke;
    const win = tauriWindow();
    if (typeof invoke !== 'function' || !win?.scaleFactor) return;

    const active = state.mode === 'pet';
    let scale = 1;
    try {
      scale = await win.scaleFactor();
    } catch { }

    const payload = {
      enabled: active,
      regions: active
        ? getPetInteractionRects()
          .map((rect) => rectToPhysicalRegion(rect, scale))
          .filter(Boolean)
        : [],
    };

    const signature = JSON.stringify(payload);
    if (signature === lastNativeHitSyncSignature) return;
    lastNativeHitSyncSignature = signature;

    nativeHitSyncInFlight = true;
    try {
      await invoke('sync_pet_window_input', payload);
      debugPassthrough('native-hit-regions-synced', {
        enabled: active,
        scale,
        regionKinds: payload.regions.map((region) => region.kind),
        regionCount: payload.regions.length,
      });
    } catch (error) {
      console.warn('sync_pet_window_input failed', error);
      debugPassthrough('native-hit-regions-error', { error: String(error?.message || error) });
    } finally {
      nativeHitSyncInFlight = false;
      if (nativeHitSyncQueued) {
        nativeHitSyncQueued = false;
        scheduleNativePetWindowInputSync();
      }
    }
  }

  function scheduleNativePetWindowInputSync() {
    if (!enabled || !isTauri || modelDragging) return;
    if (nativeHitSyncScheduled) {
      nativeHitSyncQueued = true;
      return;
    }
    nativeHitSyncScheduled = true;
    requestAnimationFrame(() => {
      nativeHitSyncScheduled = false;
      syncNativePetWindowInput();
    });
  }

  function shouldForceInteractiveWindow() {
    return !!(
      state.settingsOpen ||
      settingsMenuEl?.classList.contains('expanded') ||
      settingsOverlayEl?.classList.contains('expanded') ||
      plusMenuOpen ||
      desktopContextMenuEl?.classList?.contains('open')
    );
  }

  async function syncPetPointerPassthrough() {
    if (!enabled || !isTauri || state.mode !== 'pet' || screenshotActive || modelDragging) return;

    const uiOpen = !!(
      state.panelOpen ||
      state.settingsOpen ||
      plusMenuOpen ||
      desktopContextMenuEl?.classList?.contains('open') ||
      settingsMenuEl?.classList?.contains('expanded') ||
      settingsOverlayEl?.classList?.contains('expanded')
    );

    const winApi = window.__TAURI__?.window;
    const win = tauriWindow();
    if (!winApi?.cursorPosition || !win?.innerPosition || !win?.scaleFactor) return;

    try {
      // Always do hit-testing, even when settings/plus-menu is open
      // This allows clicking outside the UI to pass through to other apps
      const [cursor, winPos, scale] = await Promise.all([
        winApi.cursorPosition(),
        win.innerPosition(),
        win.scaleFactor(),
      ]);

      const localPoint = {
        x: (cursor.x - winPos.x) / scale,
        y: (cursor.y - winPos.y) / scale,
      };

      const rects = uiOpen ? getPetInteractionRectsLight() : getPetInteractionRects();
      const hitRect = rects.find((rect) => isPointInRect(localPoint, rect, rect.padding || 0));
      const hit = !!hitRect;

      const signature = JSON.stringify({
        x: Math.round(localPoint.x),
        y: Math.round(localPoint.y),
        hit,
        kind: hitRect?.kind || null,
        uiVisible,
        panelOpen: state.panelOpen,
        settingsOpen: state.settingsOpen,
        plusMenuOpen,
      });

      if (signature !== lastCursorHitSignature) {
        lastCursorHitSignature = signature;
        debugPassthrough('cursor-poll', {
          cursor,
          winPos,
          scale,
          localPoint,
          hit,
          hitKind: hitRect?.kind || null,
          regionKinds: rects.map((r) => r.kind),
        });
      }

      await setNativeIgnoreCursorEvents(!hit, hit ? `hover-${hitRect.kind}` : 'transparent-area');

      if (hit && (hitRect.kind === 'model' || hitRect.kind === 'orb')) {
        revealUi();
      }
    } catch (error) {
      console.warn('syncPetPointerPassthrough failed', error);
      debugPassthrough('cursor-poll-error', { error: String(error?.message || error) });
    }
  }

  function scheduleCursorPassthroughCheck() {
    if (!enabled || !isTauri || state.mode !== 'pet' || modelDragging) return;
    requestAnimationFrame(() => {
      syncPetPointerPassthrough();
    });
  }

  function stopCursorPolling() {
    if (!cursorPollTimer) return;
    clearInterval(cursorPollTimer);
    cursorPollTimer = null;
  }

  function startCursorPolling() {
    stopCursorPolling();
    if (modelDragging) return;
    const interval = state.panelOpen || state.settingsOpen ? 120 : 45;
    cursorPollTimer = setInterval(() => {
      syncPetPointerPassthrough();
    }, interval);
  }

  function setMode(nextMode) {
    closeSettings?.();
    state.mode = nextMode === 'pet' ? 'pet' : 'normal';
    state.settingsOpen = false;

    if (state.mode === 'pet') {
      state.panelOpen = false;
      state.settingsOpen = false;
      state.expanded = false;
    }

    if (state.mode !== 'pet') {
      state.expanded = false;
      clearUiHideTimer();
      uiVisible = false;
      stopCursorPolling();
      forceNormalWindowInput();
    }

    saveState();
    applyClasses();

    if (state.mode === 'pet') {
      revealUi();
      startCursorPolling();
      syncWindowMode();
      scheduleNativePetWindowInputSync();
      scheduleCursorPassthroughCheck();
    } else {
      stopCursorPolling();
      forceNormalWindowInput();
      syncWindowMode();
    }

    if (typeof onModeChange === 'function') onModeChange(state.mode);
  }

  function toggleMode() {
    setMode(state.mode === 'pet' ? 'normal' : 'pet');
  }

  function togglePanel(force) {
    state.panelOpen = typeof force === 'boolean' ? !!force : !state.panelOpen;
    if (state.panelOpen) state.settingsOpen = false;
    if (!state.panelOpen) state.expanded = false;

    saveState();
    applyClasses();

    if (state.mode === 'pet') syncWindowMode();

    if (state.panelOpen) {
      setNativeIgnoreCursorEvents(false, 'open-panel');
      revealUi();
    } else {
      scheduleUiHide();
    }

    scheduleNativePetWindowInputSync();
    scheduleCursorPassthroughCheck();
    if (state.mode === 'pet') startCursorPolling();
  }

  function toggleExpanded(force) {
    if (state.mode !== 'pet') return;
    state.expanded = typeof force === 'boolean' ? !!force : !state.expanded;
    if (state.expanded) state.panelOpen = true;
    state.settingsOpen = false;
    saveState();
    applyClasses();
    syncWindowMode();
    setNativeIgnoreCursorEvents(false, 'toggle-expanded');
    revealUi();
    scheduleNativePetWindowInputSync();
    scheduleCursorPassthroughCheck();
  }

  function togglePetSettings(force) {
    if (state.mode !== 'pet') {
      openSettings?.();
      return;
    }
    closeSettings?.();
    state.settingsOpen = typeof force === 'boolean' ? !!force : !state.settingsOpen;
    if (state.settingsOpen) {
      state.panelOpen = false;
      state.expanded = false;
    }
    saveState();
    applyClasses();
    syncWindowMode();

    if (state.settingsOpen) {
      setNativeIgnoreCursorEvents(false, 'open-settings');
      revealUi();
    } else {
      scheduleUiHide();
    }

    scheduleNativePetWindowInputSync();
    scheduleCursorPassthroughCheck();
    if (state.mode === 'pet') startCursorPolling();
  }

  async function startDragging() {
    const win = tauriWindow();
    try {
      if (win?.startDragging) {
        await win.startDragging();
        return;
      }
      if (win?.startDrag) {
        await win.startDrag();
        return;
      }
      ui?.setStatus?.('当前窗口 API 不支持拖动', true);
    } catch (error) {
      console.warn('startDragging failed', error);
      ui?.setStatus?.(`拖动窗口失败：${error?.message || error}`, true);
    }
  }

  function hideContextMenu() {
    desktopContextMenuEl?.classList.remove('open');
    scheduleNativePetWindowInputSync();
    scheduleCursorPassthroughCheck();
  }

  function closeTransientUi() {
    setPlusMenuOpen(false);
    hideContextMenu();
  }

  async function copyDebugInfo() {
    const payload = JSON.stringify({
      logPath: petDebugLogPath || window.__OPENCLAW_PET_DEBUG_LOG_PATH__ || null,
      recent: (window.__OPENCLAW_PET_DEBUG__ || []).slice(-20),
    }, null, 2);
    try {
      await navigator.clipboard.writeText(payload || '{}');
      ui?.setStatus?.(`已复制桌宠调试信息${petDebugLogPath ? `（${petDebugLogPath}）` : ''}`, false);
    } catch (error) {
      console.warn('copy debug info failed', error);
      ui?.setStatus?.(`复制调试信息失败：${error?.message || error}`, true);
    }
  }

  async function quitApp() {
    const invoke = window.__TAURI__?.core?.invoke;
    if (typeof invoke === 'function') {
      try {
        await invoke('exit_app');
        return;
      } catch (error) {
        console.warn('exit_app failed', error);
      }
    }
    const win = tauriWindow();
    try {
      if (win?.hide) {
        await win.hide();
        return;
      }
      if (win?.close) {
        await win.close();
        return;
      }
      if (win?.minimize) {
        await win.minimize();
        return;
      }
      ui?.setStatus?.('当前窗口 API 不支持隐藏程序', true);
    } catch (error) {
      console.warn('quit app failed', error);
      ui?.setStatus?.(`隐藏程序失败：${error?.message || error}`, true);
    }
  }

  function rectFromPoints(start, end) {
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const right = Math.max(start.x, end.x);
    const bottom = Math.max(start.y, end.y);
    return {
      left,
      top,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    };
  }

  function updateScreenshotSelection(rect) {
    if (!desktopScreenshotSelectionEl || !desktopScreenshotDimEl) return;
    desktopScreenshotSelectionEl.style.display = 'block';
    desktopScreenshotSelectionEl.style.left = `${rect.left}px`;
    desktopScreenshotSelectionEl.style.top = `${rect.top}px`;
    desktopScreenshotSelectionEl.style.width = `${rect.width}px`;
    desktopScreenshotSelectionEl.style.height = `${rect.height}px`;
    desktopScreenshotDimEl.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
  }

  function resetScreenshotSelection() {
    if (!desktopScreenshotSelectionEl) return;
    desktopScreenshotSelectionEl.style.display = 'none';
  }

  async function captureScreenshot(rect) {
    if (!rect || rect.width < 4 || rect.height < 4) return;
    const invoke = window.__TAURI__?.core?.invoke;
    const win = tauriWindow();
    if (typeof invoke !== 'function' || !win?.innerPosition || !win?.scaleFactor) return;

    try {
      const [winPos, scale] = await Promise.all([win.innerPosition(), win.scaleFactor()]);
      const x = Math.round(winPos.x + rect.left * scale);
      const y = Math.round(winPos.y + rect.top * scale);
      const width = Math.round(rect.width * scale);
      const height = Math.round(rect.height * scale);
      const dataUrl = await invoke('capture_screen_region', { x, y, width, height });
      if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
        window.dispatchEvent(new CustomEvent('openclaw:add-attachment', { detail: dataUrl }));
      }
    } catch (error) {
      console.warn('capture screenshot failed', error);
      ui?.setStatus?.(`截图失败：${error?.message || error}`, true);
    }
  }

  async function capturePrimaryScreen() {
    const invoke = window.__TAURI__?.core?.invoke;
    if (typeof invoke !== 'function') return null;
    try {
      const dataUrl = await invoke('capture_primary_screen');
      return typeof dataUrl === 'string' && dataUrl.startsWith('data:image/') ? dataUrl : null;
    } catch (error) {
      console.warn('capture primary screen failed', error);
      ui?.setStatus?.(`全屏截图失败：${error?.message || error}`, true);
      return null;
    }
  }

  async function startScreenshotSelection() {
    screenshotStart = null;
    screenshotDragging = false;
    resetScreenshotSelection();
    await setScreenshotMode(true);
  }

  async function finishScreenshotSelection(rect) {
    await captureScreenshot(rect);
    await setScreenshotMode(false);
    resetScreenshotSelection();
  }

  function makeMenuButton(label, action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      hideContextMenu();
      action();
    });
    return btn;
  }

  function openContextMenu(x, y) {
    if (!desktopContextMenuEl || !desktopContextMenuItemsEl) return;
    setPlusMenuOpen(false);
    desktopContextMenuItemsEl.innerHTML = '';
    desktopContextMenuItemsEl.appendChild(makeMenuButton(state.mode === 'pet' ? '切换到窗口模式' : '切换到桌宠模式', toggleMode));
    if (state.mode === 'pet') {
      desktopContextMenuItemsEl.appendChild(makeMenuButton(state.panelOpen ? '隐藏聊天面板' : '显示聊天面板', () => togglePanel()));
      desktopContextMenuItemsEl.appendChild(makeMenuButton(state.expanded ? '收起聊天卡片' : '展开聊天卡片', () => toggleExpanded()));
      desktopContextMenuItemsEl.appendChild(makeMenuButton(state.settingsOpen ? '隐藏桌宠设置' : '显示桌宠设置', () => togglePetSettings()));
    }
    desktopContextMenuItemsEl.appendChild(makeMenuButton(state.alwaysOnTop ? '取消总在最前' : '总在最前', () => setAlwaysOnTop(!state.alwaysOnTop)));
    if (state.mode !== 'pet') {
      desktopContextMenuItemsEl.appendChild(makeMenuButton('打开设置', () => {
        openSettings?.();
      }));
    }
    desktopContextMenuItemsEl.appendChild(makeMenuButton('退出程序', () => { quitApp(); }));

    const menuWidth = 196;
    const menuHeight = 320;
    const clampedX = Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8));
    const clampedY = Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8));
    desktopContextMenuEl.style.left = `${clampedX}px`;
    desktopContextMenuEl.style.top = `${clampedY}px`;
    desktopContextMenuEl.classList.add('open');

    setNativeIgnoreCursorEvents(false, 'open-context-menu');
    scheduleNativePetWindowInputSync();
    scheduleCursorPassthroughCheck();
  }

  function bindContextMenu() {
    const isPetMenuTarget = (target, x, y) => {
      if (target?.closest?.('#desktop-pet-orb, #desktop-pet-settings, #desktop-pet-panel, #desktop-pet-dock, #desktop-plus-menu, #desktop-status-pill, #desktop-context-menu')) return true;
      return !!lastModelBounds && isPointInRect({ x, y }, lastModelBounds, 12);
    };

    document.addEventListener('click', (event) => {
      if (!event.target?.closest?.('#desktop-plus-btn, #desktop-plus-menu')) setPlusMenuOpen(false);
      hideContextMenu();
      if (!event.target?.closest?.('#desktop-plus-expressions-btn, #desktop-expressions-panel')) {
        setExpressionsMenuOpen(false);
      }
    });

    document.addEventListener('contextmenu', (event) => {
      if (!enabled) return;
      if (state.mode === 'pet') {
        if (!isPetMenuTarget(event.target, event.clientX, event.clientY)) return;
      } else if (!stageWrapEl?.contains(event.target) && !chatPanelEl?.contains(event.target) && !desktopShellEl?.contains(event.target)) {
        return;
      }
      event.preventDefault();
      setNativeIgnoreCursorEvents(false, 'before-context-menu');
      openContextMenu(event.clientX, event.clientY);
    });
  }

  function bindNativeStateSync() {
    const win = tauriWindow();
    if (!win) return;
    try {
      if (win.setAlwaysOnTop) win.setAlwaysOnTop(!!state.alwaysOnTop);
      syncWindowMode();
      stopCursorPolling();
      syncNativePetWindowInput();
    } catch (error) {
      console.warn('bindNativeStateSync failed', error);
    }
  }

  function bindHoverReveal() {
    const isUiTarget = (target) =>
      !!target?.closest?.('#desktop-pet-ui, #desktop-plus-menu, #settings-menu, #settings-overlay, .desktop-context-menu');

    const isPointNearOrb = (point) => {
      const orbRect = desktopPetOrbEl?.getBoundingClientRect?.();
      return !!orbRect && isPointInRect(point, orbRect, 10);
    };

    const isPointNearModel = (point) => {
      return !!lastModelBounds && isPointInRect(point, lastModelBounds, 20);
    };

    document.addEventListener('mousemove', (event) => {
      if (!enabled || state.mode !== 'pet') return;

      const point = { x: event.clientX, y: event.clientY };

      if (state.panelOpen || state.settingsOpen || plusMenuOpen || desktopContextMenuEl?.classList?.contains('open')) {
        if (isUiTarget(event.target)) {
          revealUi();
        } else {
          scheduleUiHide();
        }
        return;
      }

      if (isPointNearOrb(point)) {
        if (!state.panelOpen) {
          revealUi();
          togglePanel(true);
        } else {
          revealUi();
        }
        return;
      }

      if (isPointNearModel(point)) {
        revealUi();
        return;
      }

      scheduleUiHide();
    });

    document.addEventListener('focusin', (event) => {
      if (!enabled || state.mode !== 'pet') return;
      if (isUiTarget(event.target)) revealUi();
    });

    desktopPetPanelEl?.addEventListener('mouseenter', () => revealUi());
    desktopPetDockEl?.addEventListener('mouseenter', () => revealUi());

    desktopPetUiEl?.addEventListener('mouseleave', () => {
      if (state.mode !== 'pet') return;
      scheduleUiHide();
    });
  }

  function bind() {
    loadState();
    applyClasses();
    if (!enabled) return;

    document.body.dataset.desktopEnv = isTauri ? 'tauri' : 'preview';
    bindNativeStateSync();
    bindContextMenu();
    bindHoverReveal();

    desktopToggleModeBtnEl?.addEventListener('click', toggleMode);
    desktopToggleChatBtnEl?.addEventListener('click', () => togglePanel());
    desktopPinBtnEl?.addEventListener('click', () => setAlwaysOnTop(!state.alwaysOnTop));

    desktopSettingsBtnEl?.addEventListener('click', () => {
      if (state.mode === 'pet') {
        setNativeIgnoreCursorEvents(false, 'desktop-settings-btn');
        revealUi();
        togglePetSettings();
      } else {
        openSettings?.();
      }
    });

    desktopVoiceBtnEl?.addEventListener('click', () => {
      ui?.setStatus?.('语音输入按钮已预留，后续可接 ASR', false);
    });

    desktopDragBtnEl?.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      setNativeIgnoreCursorEvents(false, 'start-dragging');
      startDragging();
    });

    desktopTogglePanelBtnEl?.addEventListener('mousedown', () => {
      setNativeIgnoreCursorEvents(false, 'panel-toggle-mousedown');
    });
    desktopTogglePanelBtnEl?.addEventListener('click', () => togglePanel());

    desktopToggleHideBtnEl?.addEventListener('mousedown', () => {
      setNativeIgnoreCursorEvents(false, 'panel-hide-mousedown');
    });
    desktopToggleHideBtnEl?.addEventListener('click', () => {
      state.settingsOpen = false;
      togglePanel(false);
      scheduleUiHide(120);
    });

    desktopOpenSettingsBtnEl?.addEventListener('mousedown', () => {
      setNativeIgnoreCursorEvents(false, 'panel-open-settings-mousedown');
    });
    desktopOpenSettingsBtnEl?.addEventListener('click', () => {
      setNativeIgnoreCursorEvents(false, 'open-settings-btn');
      revealUi();
      togglePetSettings();
    });

    desktopToggleExpandBtnEl?.addEventListener('mousedown', () => {
      setNativeIgnoreCursorEvents(false, 'panel-expand-mousedown');
    });
    desktopToggleExpandBtnEl?.addEventListener('click', () => toggleExpanded());

    desktopSwitchWindowBtnEl?.addEventListener('mousedown', () => {
      setNativeIgnoreCursorEvents(false, 'panel-switch-window-mousedown');
    });
    desktopSwitchWindowBtnEl?.addEventListener('click', () => setMode('normal'));

    desktopPlusBtnEl?.addEventListener('mousedown', (event) => {
      event.stopPropagation();
      setNativeIgnoreCursorEvents(false, 'plus-mousedown');
    });
    desktopPlusBtnEl?.addEventListener('click', (event) => {
      event.stopPropagation();
      setNativeIgnoreCursorEvents(false, 'plus-click');
      revealUi();
      setPlusMenuOpen(!plusMenuOpen);
    });

    desktopPlusExpressionsBtnEl?.addEventListener('click', (event) => {
      event.stopPropagation();
      setNativeIgnoreCursorEvents(false, 'plus-expressions-click');
      revealUi();
      const nextOpen = !desktopExpressionsPanelEl?.classList?.contains('expanded');
      setExpressionsMenuOpen(nextOpen);
    });

    desktopPlusScreenshotBtnEl?.addEventListener('click', async (event) => {
      event.stopPropagation();
      setNativeIgnoreCursorEvents(false, 'plus-screenshot-click');
      await startScreenshotSelection();
    });

    desktopPlusMenuEl?.addEventListener('mousedown', (event) => {
      event.stopPropagation();
      setNativeIgnoreCursorEvents(false, 'plus-menu-mousedown');
    });
    desktopPlusMenuEl?.addEventListener('click', (event) => {
      event.stopPropagation();
      if (event.target?.closest?.('.desktop-pet-plus-menu-item')) setPlusMenuOpen(false);
    });

    desktopScreenshotOverlayEl?.addEventListener('mousedown', (event) => {
      if (!screenshotActive) return;
      event.preventDefault();
      screenshotStart = { x: event.clientX, y: event.clientY };
      screenshotDragging = true;
      updateScreenshotSelection({ left: screenshotStart.x, top: screenshotStart.y, width: 0, height: 0 });
    });

    desktopScreenshotOverlayEl?.addEventListener('mousemove', (event) => {
      if (!screenshotActive || !screenshotDragging || !screenshotStart) return;
      event.preventDefault();
      const rect = rectFromPoints(screenshotStart, { x: event.clientX, y: event.clientY });
      updateScreenshotSelection(rect);
    });

    desktopScreenshotOverlayEl?.addEventListener('mouseup', async (event) => {
      if (!screenshotActive || !screenshotDragging || !screenshotStart) return;
      event.preventDefault();
      const rect = rectFromPoints(screenshotStart, { x: event.clientX, y: event.clientY });
      screenshotDragging = false;
      screenshotStart = null;
      await finishScreenshotSelection(rect);
    });

    desktopPetOrbEl?.addEventListener('mousedown', () => {
      setNativeIgnoreCursorEvents(false, 'orb-mousedown');
    });
    desktopPetOrbEl?.addEventListener('click', () => {
      setNativeIgnoreCursorEvents(false, 'orb-click');
      revealUi();
      state.settingsOpen = false;
      togglePanel(true);
    });

    desktopPetSettingsCloseBtnEl?.addEventListener('mousedown', () => {
      setNativeIgnoreCursorEvents(false, 'settings-close-mousedown');
    });
    desktopPetSettingsCloseBtnEl?.addEventListener('click', () => togglePetSettings(false));

    desktopPetPinToggleBtnEl?.addEventListener('mousedown', () => {
      setNativeIgnoreCursorEvents(false, 'settings-pin-mousedown');
    });
    desktopPetPinToggleBtnEl?.addEventListener('click', () => setAlwaysOnTop(!state.alwaysOnTop));

    desktopCopyDebugBtnEl?.addEventListener('mousedown', () => {
      setNativeIgnoreCursorEvents(false, 'copy-debug-mousedown');
    });
    desktopCopyDebugBtnEl?.addEventListener('click', () => copyDebugInfo());

    desktopAutoHideSecondsInputEl?.addEventListener('mousedown', () => {
      setNativeIgnoreCursorEvents(false, 'autohide-input-mousedown');
    });
    desktopAutoHideSecondsInputEl?.addEventListener('focus', () => {
      setNativeIgnoreCursorEvents(false, 'autohide-input-focus');
    });
    desktopAutoHideSecondsInputEl?.addEventListener('change', () => {
      state.hideDelayMs = getHideDelayMs(Number(desktopAutoHideSecondsInputEl.value) * 1000);
      saveState();
      applyClasses();
      if (uiVisible) scheduleUiHide();
      scheduleNativePetWindowInputSync();
      scheduleCursorPassthroughCheck();
    });

    desktopModeSelectEl?.addEventListener('change', () => setMode(desktopModeSelectEl.value));
    desktopAlwaysOnTopInputEl?.addEventListener('change', () => setAlwaysOnTop(!!desktopAlwaysOnTopInputEl.checked));

    chatHeaderEl?.addEventListener('mousedown', (event) => {
      if (!enabled || state.mode === 'pet' || event.button !== 0) return;
      if (event.target?.closest?.('button, input, textarea, select, label, a')) return;
      startDragging();
    });
    headerEl?.addEventListener('mousedown', (event) => {
      if (!enabled || state.mode === 'pet' || event.button !== 0) return;
      if (event.target?.closest?.('button, input, textarea, select, label, a')) return;
      startDragging();
    });

    windowCloseBtnEl?.addEventListener('click', async () => {
      const win = tauriWindow();
      try {
        if (win?.close) await win.close();
      } catch (error) {
        console.warn('close window failed', error);
      }
    });

    window.addEventListener('openclaw:pet-model-bounds', (event) => {
      updatePetAnchor(event.detail);
      scheduleCursorPassthroughCheck();
    });

    window.addEventListener('openclaw:model-dragging', async (event) => {
      modelDragging = !!event?.detail?.active;
      debugPassthrough('model-dragging', { active: modelDragging });
      if (modelDragging) {
        stopCursorPolling();
        await setNativeIgnoreCursorEvents(false, 'model-dragging');
        const invoke = window.__TAURI__?.core?.invoke;
        try {
          if (typeof invoke === 'function') {
            await invoke('sync_pet_window_input', { enabled: false, regions: [] });
          }
        } catch (error) {
          console.warn('disable pet hit regions while dragging failed', error);
        }
        return;
      }

      if (state.mode === 'pet') {
        startCursorPolling();
        scheduleNativePetWindowInputSync();
        scheduleCursorPassthroughCheck();
      }
    });

    window.addEventListener('resize', () => {
      updatePetAnchor();
      scheduleNativePetWindowInputSync();
      scheduleCursorPassthroughCheck();
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (screenshotActive) {
          screenshotDragging = false;
          screenshotStart = null;
          setScreenshotMode(false);
          resetScreenshotSelection();
          return;
        }
        closeTransientUi();
        closeSettings?.();
        if (state.mode === 'pet') {
          state.settingsOpen = false;
          state.expanded = false;
          togglePanel(false);
          applyClasses();
          scheduleNativePetWindowInputSync();
          scheduleCursorPassthroughCheck();
        }
      }
    });

    if (state.mode === 'pet') {
      revealUi();
      startCursorPolling();
      scheduleNativePetWindowInputSync();
      scheduleCursorPassthroughCheck();
    }

    debugPassthrough('bind-complete', {
      note: 'pet debug log writes to %TEMP%\\openclaw-live2d-pet-debug.log',
    });

    if (typeof onModeChange === 'function') onModeChange(state.mode);
  }

  return {
    enabled,
    bind,
    setMode,
    toggleMode,
    togglePanel,
    setAlwaysOnTop,
    syncPetInputState,
    capturePrimaryScreen,
    getState: () => ({ ...state }),
  };
}
