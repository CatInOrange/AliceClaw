export function resolveLive2DGlContext(targetCanvas) {
  if (!targetCanvas?.getContext) {
    return null;
  }

  return (
    targetCanvas.getContext("webgl2") ||
    targetCanvas.getContext("webgl") ||
    null
  );
}

export function canInitializeLive2DDelegate({ canvas, gl }) {
  return Boolean(canvas && gl);
}
