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
  // DEBUG: log values for pet mode gaze debugging
  console.log('[applyLive2DFocus DEBUG]', {
    pointerX: pointer.x,
    pointerY: pointer.y,
    canvasRectLeft: canvasRect.left,
    canvasRectTop: canvasRect.top,
    canvasRectWidth: canvasRect.width,
    canvasRectHeight: canvasRect.height,
    windowInnerWidth: typeof window !== 'undefined' ? window.innerWidth : 'N/A',
    windowInnerHeight: typeof window !== 'undefined' ? window.innerHeight : 'N/A',
  });
  // In pet mode, pointer.x is in screen/renderer coordinates (0 to renderer width),
  // while canvasRect.width is the canvas width. We need to scale pointer.x from
  // renderer coordinates to canvas coordinates.
  const rendererWidth = typeof window !== 'undefined' ? window.innerWidth : width;
  const localX = clamp(
    ((Number(pointer.x) - Number(canvasRect.left || 0)) * width) / rendererWidth,
    0,
    width
  );
  console.log('[applyLive2DFocus DEBUG] localX calculation:', {
    formula: `((pointer.x - canvasRect.left) * width) / rendererWidth`,
    raw: `(${pointer.x} - ${canvasRect.left}) * ${width} / ${rendererWidth}`,
    result: ((Number(pointer.x) - Number(canvasRect.left || 0)) * width) / rendererWidth,
    clamped: localX,
  });
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

    if (Number.isFinite(Number(dragX)) && Number.isFinite(Number(dragY))) {
      manager.onDrag(dragX, dragY);
      return true;
    }
  }

  return false;
}
