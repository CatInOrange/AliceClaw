function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function applyLive2DFocus({
  config,
  pointer,
  canvasRect,
  model,
  manager,
  view,
  devicePixelRatio = 1,
}) {
  if (
    config?.enabled === false
    || !pointer
    || !canvasRect
    || !Number.isFinite(Number(canvasRect.width))
    || !Number.isFinite(Number(canvasRect.height))
    || Number(canvasRect.width) <= 0
    || Number(canvasRect.height) <= 0
  ) {
    return false;
  }

  const width = Number(canvasRect.width);
  const height = Number(canvasRect.height);
  // In pet mode, pointer.x is in screen/renderer coordinates (0 to renderer width),
  // while canvasRect.width is the canvas width. We need to scale pointer.x from
  // renderer coordinates to canvas coordinates.
  const rendererWidth = typeof window !== 'undefined' ? window.innerWidth : width;
  const localX = clamp(
    ((Number(pointer.x) - Number(canvasRect.left || 0)) * width) / rendererWidth,
    0,
    width
  );
  const localY = clamp(Number(pointer.y) - Number(canvasRect.top || 0), 0, height);
  const headRatio = clamp(Number(config?.headRatio ?? 0.25), 0, 1);
  const headY = Number(model?.y || height * 0.5) - Number(model?.height || height) * headRatio;
  const viewCenterY = height * 0.5;
  const biasY = clamp(viewCenterY - headY, -height * 0.35, height * 0.35);
  const focusedY = localY + biasY;

  if (typeof model?.focus === "function") {
    model.focus(localX, focusedY, false);
    return true;
  }

  // Only apply drag (gaze tracking) when left mouse button is pressed (bit 0)
  const leftButtonPressed = pointer && (Number(pointer.buttons) & 1) !== 0;

  if (
    leftButtonPressed
    && typeof manager?.onDrag === "function"
    && typeof view?.transformViewX === "function"
    && typeof view?.transformViewY === "function"
  ) {
    const scaledX = localX * Number(devicePixelRatio || 1);
    const scaledY = focusedY * Number(devicePixelRatio || 1);
    const dragX = view.transformViewX(scaledX);
    const dragY = view.transformViewY(scaledY);

    // DEBUG: Send dragY info to backend instead of console.log
    const debugData: Record<string, number> = {
      localY,
      headY,
      biasY,
      focusedY,
      scaledY,
      dragY,
      dragX,
      pointerX: pointer.x,
      pointerY: pointer.y,
      canvasWidth: width,
      canvasHeight: height
    };
    // Add matrix values for debugging
    if (view._deviceToScreen) {
      debugData['_deviceToScreen_tr0'] = view._deviceToScreen._tr[0];  // X scale
      debugData['_deviceToScreen_tr5'] = view._deviceToScreen._tr[5];  // Y scale
      debugData['_deviceToScreen_tr12'] = view._deviceToScreen._tr[12]; // X translation
      debugData['_deviceToScreen_tr13'] = view._deviceToScreen._tr[13]; // Y translation
    }
    if (view._viewMatrix) {
      debugData['_viewMatrix_tr0'] = view._viewMatrix._tr[0];  // X scale
      debugData['_viewMatrix_tr5'] = view._viewMatrix._tr[5];  // Y scale
      debugData['_viewMatrix_tr12'] = view._viewMatrix._tr[12]; // X translation
      debugData['_viewMatrix_tr13'] = view._viewMatrix._tr[13]; // Y translation
    }
    // Try multiple backends - localhost:18080 (desktop) and :8080 (web version via nginx)
    const urls = [
      'http://localhost:18080/api/debug/webgl',
      '/api/debug/webgl'  // fallback for nginx on 8080
    ];
    for (const url of urls) {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'dragY', ...debugData })
      }).catch(() => {});
    }

    if (Number.isFinite(Number(dragX)) && Number.isFinite(Number(dragY))) {
      manager.onDrag(dragX, dragY);
      return true;
    }
  }

  return false;
}
