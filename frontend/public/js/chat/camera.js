/**
 * Camera controller for chat composer.
 *
 * Encapsulates getUserMedia lifecycle, preview wiring (web + desktop), and frame capture.
 */

/**
 * @typedef {Object} CameraTarget
 * @property {HTMLElement|null|undefined} previewContainerEl
 * @property {HTMLVideoElement|null|undefined} videoEl
 * @property {HTMLCanvasElement|null|undefined} canvasEl
 * @property {HTMLElement|null|undefined} btnEl
 * @property {HTMLElement|null|undefined} closeBtnEl
 * @property {HTMLElement|null|undefined} captureBtnEl
 */

/**
 * @param {{
 *   web?: CameraTarget,
 *   desktop?: CameraTarget,
 *   onCaptureDataUrl?: (dataUrl: string) => void,
 *   alert?: (message: string) => void,
 *   logger?: Console,
 * }} opts
 */
export function createCameraController(opts = {}) {
  const web = opts.web || {};
  const desktop = opts.desktop || {};
  const onCaptureDataUrl = typeof opts.onCaptureDataUrl === 'function' ? opts.onCaptureDataUrl : () => { };
  const showAlert = typeof opts.alert === 'function' ? opts.alert : () => { };
  const logger = opts.logger || console;

  let cameraStream = null;
  let isCameraActive = false;
  let bound = false;
  /** @type {'web'|'desktop'|null} */
  let activeMode = null;

  function getTarget(mode) {
    return mode === 'desktop' ? desktop : web;
  }

  function setPreviewVisible(mode, visible) {
    const target = getTarget(mode);
    if (target.videoEl) target.videoEl.srcObject = visible ? cameraStream : null;
    if (target.previewContainerEl) {
      target.previewContainerEl.style.display = visible ? 'block' : 'none';
      target.previewContainerEl.dataset.cameraActive = visible ? 'true' : 'false';
    }
  }

  async function start(mode = 'web') {
    if (isCameraActive) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showAlert('您的浏览器不支持摄像头功能，或者页面未在 HTTPS/localhost 环境中运行');
      return;
    }

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      activeMode = mode;
      setPreviewVisible(mode, true);
      isCameraActive = true;
    } catch (err) {
      logger.error?.('Failed to start camera:', err);
      if (err?.name === 'NotAllowedError') {
        showAlert('摄像头权限被拒绝，请在浏览器设置中允许摄像头访问');
      } else if (err?.name === 'NotFoundError') {
        showAlert('未找到摄像头设备');
      } else {
        showAlert('无法打开摄像头：' + (err?.message || '请检查权限设置'));
      }
    }
  }

  function stop() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
    }
    setPreviewVisible('web', false);
    setPreviewVisible('desktop', false);
    isCameraActive = false;
    activeMode = null;
  }

  /**
   * Capture current frame from camera.
   *
   * @returns {string|null} Base64 data URL or null.
   */
  function captureFrameDataUrl() {
    if (!isCameraActive || !cameraStream) return null;

    const target = getTarget(activeMode || 'web');
    const video = target?.videoEl;
    const canvas = target?.canvasEl;
    if (!video || !canvas) return null;

    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
  }

  function bind() {
    if (bound) return;
    bound = true;
    setPreviewVisible('web', false);
    setPreviewVisible('desktop', false);

    web.btnEl?.addEventListener('click', () => {
      if (isCameraActive) stop();
      else start('web');
    });

    desktop.btnEl?.addEventListener('click', () => {
      if (isCameraActive) stop();
      else start('desktop');
    });

    web.closeBtnEl?.addEventListener('click', stop);
    desktop.closeBtnEl?.addEventListener('click', stop);

    desktop.captureBtnEl?.addEventListener('click', () => {
      if (!isCameraActive) {
        start('desktop');
        return;
      }
      const frameDataUrl = captureFrameDataUrl();
      if (frameDataUrl) onCaptureDataUrl(frameDataUrl);
    });
  }

  return {
    bind,
    start,
    stop,
    captureFrameDataUrl,
    isActive: () => isCameraActive,
  };
}
