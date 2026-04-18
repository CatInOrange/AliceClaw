import { clamp } from './ui.js';

// Background storage key
const BG_STORAGE_KEY = 'live2d-custom-background';

export function createLive2DController({ refs, layout, saveLayout, setStatus }) {
  window.PIXI = PIXI;
  console.log('[LIVE2D] createLive2DController called');
  const { canvas, controls, bgImageInputEl, clearBgBtnEl, resetBgBtnEl } = refs;

  // Track last pointer position (in client coordinates) so that changing focusCenter
  // can take effect immediately even if the user doesn't move the mouse.
  let lastCanvasPointerClient = null;

  // Focus-center runtime state (head-centric gaze calibration)
  let focusCenter = {
    headRatio: 0.25, // 0..1, relative to model height above model center (anchor=0.5)
    enabled: true,
  };

  function normalizeFocusCenter(next = {}) {
    const headRatio = clamp(Number(next.headRatio ?? focusCenter.headRatio ?? 0.25), 0, 1);
    const enabled = next.enabled === undefined ? !!focusCenter.enabled : !!next.enabled;
    focusCenter = { ...focusCenter, ...next, headRatio, enabled };
    return focusCenter;
  }

  function setFocusCenter(next, { announce = true } = {}) {
    const normalized = normalizeFocusCenter(next || {});
    if (announce && typeof setStatus === 'function') {
      setStatus(`注视中心已更新：headRatio=${normalized.headRatio.toFixed(2)}`);
    }

    // Apply immediately using the last known pointer position.
    // This makes the slider feel responsive (otherwise it only changes on next pointermove).
    try {
      refreshFocusFromLastPointer(true);
    } catch {}
  }

  function getFocusCenter() {
    return { ...focusCenter };
  }

  function computeFocusBiasY() {
    try {
      if (!focusCenter.enabled || !app?.renderer || typeof model?.height !== 'number' || typeof model?.y !== 'number') return 0;
      // With anchor at (0.5, 0.5), model.y is the visual center.
      const headY = model.y - model.height * Number(focusCenter.headRatio);
      const viewCenterY = app.renderer.height * 0.5;
      let biasY = viewCenterY - headY;
      const maxBias = app.renderer.height * 0.35;
      biasY = clamp(biasY, -maxBias, maxBias);
      return biasY;
    } catch {
      return 0;
    }
  }

  function applyFocusAtLocal(localX, localY, instant = false) {
    if (!model || dragging || typeof model.focus !== 'function') return;
    const biasY = computeFocusBiasY();
    model.focus(localX, localY + biasY, instant);
  }

  function refreshFocusFromLastPointer(instant = false) {
    if (!canvas || !model || dragging || typeof model.focus !== 'function') return;
    const rect = canvas.getBoundingClientRect?.();
    if (!rect) return;

    // Prefer global pointer tracking (updated in app.js), fall back to canvas-local tracking.
    const lastGlobal = window.__OPENCLAW_LAST_POINTER__;
    const clientX = typeof lastGlobal?.x === 'number' ? lastGlobal.x : lastCanvasPointerClient?.x;
    const clientY = typeof lastGlobal?.y === 'number' ? lastGlobal.y : lastCanvasPointerClient?.y;
    if (typeof clientX !== 'number' || typeof clientY !== 'number') return;

    const localX = clamp(clientX - rect.left, 0, rect.width);
    const localY = clamp(clientY - rect.top, 0, rect.height);
    applyFocusAtLocal(localX, localY, instant);
  }

  // Expose internal objects for debug tooling (optional).
  // NOTE: do not rely on this for core logic.
  window.__live2dApp = null;

  function isDesktopPetMode() {
    return !!window.__TAURI__ && document.body.classList.contains('desktop-mode-pet');
  }

  async function startDesktopWindowDrag() {
    const winApi = window.__TAURI__?.window;
    const win = winApi?.getCurrentWindow?.() || winApi?.appWindow || null;
    try {
      if (win?.startDragging) {
        await win.startDragging();
        return;
      }
      if (win?.startDrag) {
        await win.startDrag();
        return;
      }
    } catch (error) {
      console.warn('startDesktopWindowDrag failed:', error);
    }
  }
  let app, model, appMeta, modelMeta, baseScale = 1, dragging = false, dragMoved = false;
  let dragStart = { x: 0, y: 0, offsetX: 0, offsetY: 0 };
  let persistentExpressionMap = {};
  let persistentState = {};
  let persistentExpressionTickerBound = false;
  let lipSyncParamId = 'ParamMouthOpenY';
  let lipSyncAudioContext = null;
  let lipSyncAnimationFrame = 0;
  let lipSyncCleanup = null;
  let lipSyncSmoothedValue = 0;
  let backgroundSprite = null;

  // Load saved background
  function loadSavedBackground() {
    try {
      const saved = localStorage.getItem(BG_STORAGE_KEY);
      if (saved) {
        setBackground(saved);
      }
    } catch (e) {
      console.warn('Failed to load saved background:', e);
    }
  }

  // Set background image
  async function setBackground(imageUrl) {
    if (!app) return;
    try {
      // Remove existing background
      if (backgroundSprite) {
        app.stage.removeChild(backgroundSprite);
        backgroundSprite.destroy();
        backgroundSprite = null;
      }

      if (!imageUrl) {
        // Restore default gradient
        canvas.style.background = '';
        localStorage.removeItem(BG_STORAGE_KEY);
        return;
      }

      // Create background sprite
      const texture = await PIXI.Texture.fromURL(imageUrl);
      backgroundSprite = new PIXI.Sprite(texture);
      backgroundSprite.zIndex = -1;

      // Resize to cover canvas while maintaining aspect ratio
      const resizeBg = () => {
        if (!backgroundSprite || !app) return;
        const canvasWidth = app.renderer.width;
        const canvasHeight = app.renderer.height;
        const textureWidth = texture.width;
        const textureHeight = texture.height;

        const scale = Math.max(canvasWidth / textureWidth, canvasHeight / textureHeight);
        backgroundSprite.scale.set(scale);
        backgroundSprite.x = (canvasWidth - textureWidth * scale) / 2;
        backgroundSprite.y = (canvasHeight - textureHeight * scale) / 2;
      };

      resizeBg();
      app.stage.addChildAt(backgroundSprite, 0);

      // Clear canvas CSS background to show PIXI background
      canvas.style.background = 'transparent';

      // Save to localStorage
      localStorage.setItem(BG_STORAGE_KEY, imageUrl);

      // Re-apply on resize
      window.addEventListener('resize', resizeBg);
    } catch (error) {
      console.error('Failed to set background:', error);
      setStatus('背景设置失败：' + (error.message || error), true);
    }
  }

  // Handle background file upload
  function handleBackgroundUpload(file) {
    if (!file || !file.type.startsWith('image/')) {
      setStatus('请选择图片文件', true);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setBackground(e.target.result);
      setStatus('背景已更新');
    };
    reader.onerror = () => {
      setStatus('读取图片失败', true);
    };
    reader.readAsDataURL(file);
  }

  // Bind background controls
  function bindBackgroundControls() {
    bgImageInputEl?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handleBackgroundUpload(file);
      // Reset input so same file can be selected again
      e.target.value = '';
    });

    clearBgBtnEl?.addEventListener('click', () => {
      setBackground(null);
      setStatus('已恢复默认背景');
    });

    resetBgBtnEl?.addEventListener('click', () => {
      setBackground(null);
      setStatus('已恢复默认背景');
    });
  }

  function getDefaultFocusPoint() { if (!app) return { x: window.innerWidth / 2, y: window.innerHeight / 2 }; return { x: app.renderer.width * 0.5, y: app.renderer.height * 0.5 }; }
  function getMaxToggleSpeed() { const speeds = Object.values(persistentExpressionMap).map((v) => Number(v.speed || 0.08)); return Math.max(0.08, ...speeds); }
  function getMaxResetWeight() { const weights = Object.values(persistentExpressionMap).map((v) => Number(v.resetWeight || 0.12)); return Math.max(0.12, ...weights); }
  function resetPersistentState() { persistentExpressionMap = modelMeta?.persistentToggles || {}; persistentState = {}; Object.values(persistentExpressionMap).forEach((config) => { persistentState[config.key] = false; }); }
  function getPersistentStateSummary() { const labels = []; Object.entries(persistentExpressionMap).forEach(([name, config]) => { if (persistentState[config.key]) labels.push(name); }); return labels.length ? `（${labels.join('，')}）` : ''; }

  function getCoreModel() {
    const coreModel = model?.internalModel?.coreModel;
    if (!coreModel || typeof coreModel.getParameterValueById !== 'function' || typeof coreModel.setParameterValueById !== 'function') return null;
    return coreModel;
  }

  function setLipSyncValue(value) {
    const coreModel = getCoreModel();
    if (!coreModel || !lipSyncParamId) return;
    const next = clamp(Number(value) || 0, 0, 1.2);
    coreModel.setParameterValueById(lipSyncParamId, next);
  }

  function stopLipSync() {
    if (lipSyncAnimationFrame) {
      cancelAnimationFrame(lipSyncAnimationFrame);
      lipSyncAnimationFrame = 0;
    }
    if (typeof lipSyncCleanup === 'function') {
      lipSyncCleanup();
      lipSyncCleanup = null;
    }
    lipSyncSmoothedValue = 0;
    setLipSyncValue(0);
  }

  async function startLipSync(audio) {
    stopLipSync();
    if (!audio) return;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    lipSyncAudioContext = lipSyncAudioContext || new AudioContextCtor();
    if (lipSyncAudioContext.state === 'suspended') {
      try { await lipSyncAudioContext.resume(); } catch { }
    }
    const analyser = lipSyncAudioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.55;
    const source = lipSyncAudioContext.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(lipSyncAudioContext.destination);
    const data = new Uint8Array(analyser.frequencyBinCount);
    lipSyncCleanup = () => {
      try { source.disconnect(); } catch { }
      try { analyser.disconnect(); } catch { }
    };
    const tick = () => {
      if (!audio || audio.paused || audio.ended) {
        setLipSyncValue(0);
        lipSyncAnimationFrame = 0;
        return;
      }
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const normalized = (data[i] - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / data.length);
      const boosted = clamp(rms * 6.5, 0, 1);
      lipSyncSmoothedValue += (boosted - lipSyncSmoothedValue) * 0.45;
      setLipSyncValue(lipSyncSmoothedValue);
      lipSyncAnimationFrame = requestAnimationFrame(tick);
    };
    lipSyncAnimationFrame = requestAnimationFrame(tick);
  }

  function applyPersistentExpressionState(weight = 0.08) {
    const coreModel = getCoreModel();
    if (!coreModel) return;
    const fallbackWeight = clamp(Number(weight), 0, 1);
    Object.values(persistentExpressionMap).forEach((config) => {
      const target = persistentState[config.key] ? Number(config.onValue ?? 1) : Number(config.offValue ?? 0);
      const current = Number(coreModel.getParameterValueById(config.paramId) ?? 0);
      const w = clamp(Number(weight ?? config.speed ?? 0.08), 0, 1) || fallbackWeight;
      const next = w >= 1 ? target : current + (target - current) * w;
      coreModel.setParameterValueById(config.paramId, next);
    });
  }

  function resetFocus(instant = false) {
    if (!model || typeof model.focus !== 'function') return;
    const p = getDefaultFocusPoint();
    model.focus(p.x, p.y, instant);
    applyPersistentExpressionState(instant ? 1 : getMaxResetWeight());
  }

  function getLayoutBounds() {
    if (isDesktopPetMode()) {
      return {
        scaleMin: 0.45,
        scaleMax: 3.2,
        offsetXMin: -45,
        offsetXMax: 45,
        // Desktop-pet mode previously clamped Y too tightly, which made the model
        // unable to be dragged further towards the top of the screen.
        // Widen the vertical range so users can freely place the model.
        offsetYMin: -65,
        offsetYMax: 40,
      };
    }
    return {
      scaleMin: 0.4,
      scaleMax: 2.4,
      offsetXMin: -40,
      offsetXMax: 40,
      offsetYMin: -40,
      offsetYMax: 40,
    };
  }

  function syncControlBounds() {
    if (!controls?.scale || !controls?.offsetX || !controls?.offsetY) return;
    const bounds = getLayoutBounds();
    controls.scale.min = String(bounds.scaleMin);
    controls.scale.max = String(bounds.scaleMax);
    controls.offsetX.min = String(bounds.offsetXMin);
    controls.offsetX.max = String(bounds.offsetXMax);
    controls.offsetY.min = String(bounds.offsetYMin);
    controls.offsetY.max = String(bounds.offsetYMax);
  }

  function syncControlLabels() { controls.scaleValue.textContent = `${Number(layout.scale).toFixed(2)}x`; controls.xValue.textContent = `${Math.round(layout.offsetX)}%`; controls.yValue.textContent = `${Math.round(layout.offsetY)}%`; }
  function syncControlsFromLayout() {
    syncControlBounds();
    controls.scale.value = String(layout.scale);
    controls.offsetX.value = String(layout.offsetX);
    controls.offsetY.value = String(layout.offsetY);
    syncControlLabels();
  }

  function emitPetModelBounds() {
    if (!app || !model) return;
    const width = model.width;
    const height = model.height;
    const anchorX = typeof model.anchor?.x === 'number' ? model.anchor.x : 0.5;
    const anchorY = typeof model.anchor?.y === 'number' ? model.anchor.y : 0.5;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? rect.width / app.renderer.width : 1;
    const scaleY = rect.height > 0 ? rect.height / app.renderer.height : 1;
    const left = rect.left + (model.x - width * anchorX) * scaleX;
    const right = rect.left + (model.x + width * (1 - anchorX)) * scaleX;
    const top = rect.top + (model.y - height * anchorY) * scaleY;
    const bottom = rect.top + (model.y + height * (1 - anchorY)) * scaleY;
    const detail = {
      left,
      right,
      top,
      bottom,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
      centerX: rect.left + model.x * scaleX,
      centerY: rect.top + model.y * scaleY,
    };
    window.dispatchEvent(new CustomEvent('openclaw:pet-model-bounds', { detail }));
  }

  function applyModelLayout({ emitBounds = true } = {}) {
    if (!app || !model) return;
    const effectiveScale = Math.max(baseScale * Number(layout.scale), 0.05);
    model.scale.set(effectiveScale, effectiveScale);
    model.anchor.set(0.5, 0.5);
    model.x = app.renderer.width * (0.5 + Number(layout.offsetX) / 100);
    const petBaseY = isDesktopPetMode() ? 0.61 : 0.5;
    const offsetYPercent = Number(layout.offsetY);
    const offsetYPixels = app.renderer.height * (offsetYPercent / 100);
    const finalY = app.renderer.height * petBaseY + offsetYPixels - 200;
    console.log('[DEBUG] petBaseY=', petBaseY, 'layout.offsetY=', offsetYPercent, 'offsetYPixels=', offsetYPixels, 'finalY=', finalY, 'renderer.height=', app.renderer.height);
    model.y = finalY;
    if (emitBounds) emitPetModelBounds();
  }
  function resizeModel() {
    if (!app || !model) return;
    const wrap = canvas.parentElement;
    app.renderer.resize(wrap.clientWidth, wrap.clientHeight);
    const isPet = isDesktopPetMode();
    const padding = isPet ? 28 : 40;
    const fitWidth = isPet ? Math.min(app.renderer.width * 0.48, 700) : app.renderer.width;
    const fitHeight = isPet ? Math.min(app.renderer.height * 0.78, 860) : app.renderer.height;
    const naturalWidth = model.width / (model.scale.x || 1);
    const naturalHeight = model.height / (model.scale.y || 1);
    baseScale = Math.max(Math.min((fitWidth - padding * 2) / naturalWidth, (fitHeight - padding * 2) / naturalHeight), 0.1);
    applyModelLayout();
  }
  function normalizeLayoutState() {
    const bounds = getLayoutBounds();
    layout.scale = clamp(Number(layout.scale), bounds.scaleMin, bounds.scaleMax);
    layout.offsetX = clamp(Number(layout.offsetX), bounds.offsetXMin, bounds.offsetXMax);
    layout.offsetY = clamp(Number(layout.offsetY), bounds.offsetYMin, bounds.offsetYMax);
  }

  function updateLayout(patch, { persist = true, emitBounds = true } = {}) {
    Object.assign(layout, patch);
    normalizeLayoutState();
    syncControlsFromLayout();
    if (persist) saveLayout(layout);
    applyModelLayout({ emitBounds });
  }

  function setLayoutSnapshot(nextLayout = {}, { persist = true, emitBounds = true } = {}) {
    Object.assign(layout, nextLayout || {});
    normalizeLayoutState();
    syncControlsFromLayout();
    if (persist) saveLayout(layout);
    applyModelLayout({ emitBounds });
  }

  function getLayoutSnapshot() {
    return {
      scale: Number(layout.scale),
      offsetX: Number(layout.offsetX),
      offsetY: Number(layout.offsetY),
    };
  }
  function triggerMotion(group, index = 0, label = '') {
    try { model.motion(group, index); setStatus(`已触发动作：${label || `${group}[${index}]`}`); } catch (error) { console.error(error); setStatus(`动作触发失败：${error?.message || error}`, true); }
  }
  function triggerExpression(name) {
    try {
      const persistentConfig = persistentExpressionMap[name];
      if (persistentConfig) {
        persistentState[persistentConfig.key] = !persistentState[persistentConfig.key];
        applyPersistentExpressionState(Number(persistentConfig.triggerWeight ?? persistentConfig.speed ?? 0.08));
        setStatus(persistentState[persistentConfig.key] ? persistentConfig.onLabel : persistentConfig.offLabel);
        return;
      }
      model.expression(name);
      applyPersistentExpressionState(getMaxToggleSpeed());
      setStatus(`已切换表情：${name}${getPersistentStateSummary()}`);
    } catch (error) {
      console.error(error);
      setStatus(`表情切换失败：${error?.message || error}`, true);
    }
  }
  function bindPersistentExpressionTicker() { if (persistentExpressionTickerBound || !app?.ticker) return; app.ticker.add(() => applyPersistentExpressionState(getMaxToggleSpeed())); persistentExpressionTickerBound = true; }
  function bindLayoutControls(layoutDefaults) {
    if (!controls) { console.warn('bindLayoutControls: controls is undefined'); return; }
    syncControlsFromLayout();
    if (controls.scale) controls.scale.addEventListener('input', (e) => updateLayout({ scale: Number(e.target.value) }));
    if (controls.offsetX) controls.offsetX.addEventListener('input', (e) => updateLayout({ offsetX: Number(e.target.value) }));
    if (controls.offsetY) controls.offsetY.addEventListener('input', (e) => updateLayout({ offsetY: Number(e.target.value) }));
    if (controls.resetBtn) controls.resetBtn.addEventListener('click', () => {
      const defaults = typeof layoutDefaults === 'function' ? layoutDefaults() : layoutDefaults;
      Object.assign(layout, defaults || {});
      normalizeLayoutState();
      syncControlsFromLayout();
      saveLayout(layout);
      applyModelLayout();
      setStatus(isDesktopPetMode() ? '已重置桌宠位置和缩放' : '已重置模型位置和缩放');
    });
  }
  function bindMouseControls() {
    const resetIfPointerLeavesViewport = (event) => { if (event.relatedTarget === null) resetFocus(); };
    canvas.addEventListener('wheel', (event) => { event.preventDefault(); const delta = event.deltaY < 0 ? 0.05 : -0.05; updateLayout({ scale: Number(layout.scale) + delta }); setStatus(`已通过滚轮调整缩放：${Number(layout.scale).toFixed(2)}x`); }, { passive: false });
    canvas.addEventListener('pointermove', (event) => {
      if (!model || dragging || typeof model.focus !== 'function') return;

      // Remember last pointer position so focus-center changes can apply immediately.
      lastCanvasPointerClient = { x: event.clientX, y: event.clientY, at: Date.now() };

      // Visually, users expect "neutral" to be around the model's head rather than
      // the model's center. We apply a configurable Y bias so that placing the cursor
      // at the head keeps the gaze forward.
      const rect = canvas.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;

      //applyFocusAtLocal(localX, localY);
    });
    canvas.addEventListener('pointerleave', () => resetFocus());
    window.addEventListener('mouseout', resetIfPointerLeavesViewport);
    window.addEventListener('blur', () => resetFocus());
    document.addEventListener('visibilitychange', () => { if (document.hidden) resetFocus(); });

    // Throttled resize handler to avoid heavy redraw storms.
    let resizeQueued = false;
    const requestResize = () => {
      if (resizeQueued) return;
      resizeQueued = true;
      requestAnimationFrame(() => {
        resizeQueued = false;
        try {
          resizeModel();
          resetFocus(true);
        } catch (e) {
          console.warn('resizeModel failed', e);
        }
      });
    };
    window.addEventListener('resize', requestResize);
  }

  async function loadSelectedModel(modelJsonUrl, onLoaded) {
    appMeta = modelJsonUrl.appMeta;
    modelMeta = modelJsonUrl.modelMeta;
    // Apply defaults from backend config / manifest (if present)
    try {
      const defaults = modelJsonUrl.appMeta?.live2d?.focusCenter || modelMeta?.live2d?.focusCenter || null;
      if (defaults && typeof defaults === 'object') {
        setFocusCenter(defaults, { announce: false });
      }
    } catch {}
    lipSyncParamId = modelMeta?.lipSyncParamId || 'ParamMouthOpenY';
    stopLipSync();
    resetPersistentState();
    if (!app) app = new PIXI.Application({ view: canvas, autoStart: true, backgroundAlpha: 0, antialias: true });
    window.__live2dApp = app;
    if (model) { model.removeAllListeners(); app.stage.removeChild(model); model.destroy(); }
    model = await PIXI.live2d.Live2DModel.from(modelMeta.modelJson);
    window.__live2dModel = model; window.__live2dMeta = modelMeta;
    app.stage.addChild(model); model.interactive = true; model.buttonMode = true;
    model.on('pointerdown', (event) => {
      dragging = true;
      dragMoved = false;
      dragStart = { x: event.data.global.x, y: event.data.global.y, offsetX: Number(layout.offsetX), offsetY: Number(layout.offsetY) };
      window.dispatchEvent(new CustomEvent('openclaw:model-dragging', { detail: { active: true } }));
      setStatus(isDesktopPetMode() ? '拖拽桌宠中：正在移动模型位置' : '拖拽中：可直接移动模型');
    });
    model.on('pointermove', (event) => {
      if (!dragging) return;
      const dx = event.data.global.x - dragStart.x;
      const dy = event.data.global.y - dragStart.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true;
      updateLayout(
        {
          offsetX: dragStart.offsetX + (dx / app.renderer.width) * 100,
          offsetY: dragStart.offsetY + (dy / app.renderer.height) * 100,
        },
        {
          // Dragging is the hottest path in pet mode. Keep it visual-only and
          // defer persistence / shell-boundary updates until pointerup.
          persist: false,
          emitBounds: !isDesktopPetMode(),
        },
      );
    });
    const stopDragging = () => {
      if (!dragging) return;
      dragging = false;
      window.dispatchEvent(new CustomEvent('openclaw:model-dragging', { detail: { active: false } }));
      if (dragMoved) {
        saveLayout(layout);
        if (isDesktopPetMode()) emitPetModelBounds();
      }
      if (dragMoved) setStatus(isDesktopPetMode() ? '已更新桌宠位置' : '已更新模型位置');
      resetFocus();
    };
    model.on('pointerup', stopDragging); model.on('pointerupoutside', stopDragging);
    model.on('pointertap', () => { if (dragMoved) return; const firstMotion = modelMeta?.motions?.[0]; if (firstMotion) triggerMotion(firstMotion.group, firstMotion.index, firstMotion.file || firstMotion.label); });
    resizeModel(); bindPersistentExpressionTicker(); applyPersistentExpressionState(1); resetFocus(true);
    // Apply a one-time upward offset after model loads to fix position
    try {
        console.error('[URGENT DEBUG] live2d.js model load code reached! yOffset will be set to -1000!');
        const yOffset = -1000;
        const modelJsonUrl = modelMeta?.modelJson || 'unknown';
        const modelYVal = Number(model.y) || 0;
        const debugInfo = {
            modelUrl: modelJsonUrl,
            modelY_before: modelYVal,
            yOffset: yOffset,
            modelY_after: modelYVal + yOffset,
            modelType: typeof model.y,
            timestamp: new Date().toISOString()
        };
        // Show debug info on screen for 10 seconds
        const debugDiv = document.createElement('div');
        debugDiv.style.cssText = 'position:fixed;top:10px;left:10px;background:rgba(255,0,0,0.9);color:white;padding:10px;z-index:999999;font-size:12px;max-width:300px;word-break:break-all;';
        debugDiv.innerHTML = '<b>DEBUG MODEL POSITION</b><br>' + JSON.stringify(debugInfo, null, 2).replace(/\n/g, '<br>');
        document.body.appendChild(debugDiv);
        setTimeout(() => { debugDiv.remove(); }, 10000);
        console.log('[DEBUG] model position offset:', JSON.stringify(debugInfo));
        fetch('/api/debug/model', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(debugInfo) }).catch(e => { console.error('Fetch failed:', e); });
        requestAnimationFrame(() => { model.y += yOffset; });
    } catch (err) {
        console.error('[DEBUG ERROR]', err);
    }
    // Load saved background after app is created
    loadSavedBackground();
    bindBackgroundControls();
    if (typeof onLoaded === 'function') onLoaded({ appMeta, modelMeta, triggerMotion, triggerExpression });
    return { appMeta, modelMeta };
  }

  return {
    bindLayoutControls,
    bindMouseControls,
    loadSelectedModel,
    resizeModel,
    resetFocus,
    triggerMotion,
    triggerExpression,
    startLipSync,
    stopLipSync,
    setBackground,
    setLayoutSnapshot,
    getLayoutSnapshot,
    refreshLayoutControls: syncControlsFromLayout,
    getModelMeta: () => modelMeta,
    getAppMeta: () => appMeta,

    // Focus-center API (used by settings UI / debug tools)
    setFocusCenter,
    getFocusCenter,
  };
}
