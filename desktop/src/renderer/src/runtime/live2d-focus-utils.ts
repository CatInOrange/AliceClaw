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
  const localX = clamp(Number(pointer.x) - Number(canvasRect.left || 0), 0, width);
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

  if (
    typeof manager?.onDrag === "function"
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
