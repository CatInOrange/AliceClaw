"use strict";
const electron = require("electron");
const utils = require("@electron-toolkit/utils");
const node_fs = require("node:fs");
const node_path = require("node:path");
const node_url = require("node:url");
const path = require("path");
function normalizePositiveNumber(value, fallback = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return numeric;
}
function getCaptureResizeTarget({
  width,
  height,
  maxWidth,
  maxPixels
} = {}) {
  const sourceWidth = normalizePositiveNumber(width);
  const sourceHeight = normalizePositiveNumber(height);
  const safeMaxWidth = normalizePositiveNumber(maxWidth, sourceWidth);
  const safeMaxPixels = normalizePositiveNumber(maxPixels, sourceWidth * sourceHeight);
  let scale = 1;
  if (sourceWidth > safeMaxWidth) {
    scale = Math.min(scale, safeMaxWidth / sourceWidth);
  }
  const totalPixels = sourceWidth * sourceHeight;
  if (totalPixels > safeMaxPixels) {
    scale = Math.min(scale, Math.sqrt(safeMaxPixels / totalPixels));
  }
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale))
  };
}
function getPetModeAlwaysOnTopLevel() {
  return "floating";
}
function getScreenshotCaptureOutputConfig({ purpose = "attachment" } = {}) {
  if (purpose === "selection") {
    return {
      filename: "screen-capture.jpg",
      jpegQuality: 92,
      maxPixels: 1920 * 1080,
      maxWidth: 1920,
      mimeType: "image/jpeg"
    };
  }
  if (purpose === "selection-attachment") {
    return {
      filename: "screen-capture.jpg",
      jpegQuality: 92,
      maxPixels: 1920 * 1080,
      maxWidth: 1920,
      mimeType: "image/jpeg"
    };
  }
  return {
    filename: "screen-capture.jpg",
    jpegQuality: 98,
    mimeType: "image/jpeg"
  };
}
function getScreenshotCapturePlan({
  displaySize,
  purpose = "attachment",
  scaleFactor = 1
} = {}) {
  const normalizedScaleFactor = Math.max(1, Math.ceil(normalizePositiveNumber(scaleFactor, 1)));
  const sourceSize = {
    width: Math.max(1, Math.floor(normalizePositiveNumber(displaySize?.width) * normalizedScaleFactor)),
    height: Math.max(1, Math.floor(normalizePositiveNumber(displaySize?.height) * normalizedScaleFactor))
  };
  const outputConfig = getScreenshotCaptureOutputConfig({ purpose });
  return {
    captureSize: getCaptureResizeTarget({
      width: sourceSize.width,
      height: sourceSize.height,
      maxWidth: outputConfig.maxWidth,
      maxPixels: outputConfig.maxPixels
    }),
    outputConfig,
    sourceSize
  };
}
function getAspectRatio(size = {}) {
  const width = normalizePositiveNumber(size.width, 0);
  const height = normalizePositiveNumber(size.height, 0);
  if (!width || !height) {
    return 0;
  }
  return width / height;
}
function getArea(size = {}) {
  const width = normalizePositiveNumber(size.width, 0);
  const height = normalizePositiveNumber(size.height, 0);
  return width * height;
}
function getSourceThumbnailSize(source) {
  const size = source?.thumbnail?.getSize?.() || {};
  return {
    width: normalizePositiveNumber(size.width, 0),
    height: normalizePositiveNumber(size.height, 0)
  };
}
function getCaptureSourceForDisplay({
  sources = [],
  targetDisplay,
  targetSize
} = {}) {
  const targetDisplayId = String(targetDisplay?.id ?? "");
  const exactDisplayMatch = sources.find((source) => {
    const displayId = String(source?.display_id || "");
    return displayId && displayId === targetDisplayId;
  });
  if (exactDisplayMatch) {
    return exactDisplayMatch;
  }
  const fallbackTargetSize = {
    width: normalizePositiveNumber(targetSize?.width, targetDisplay?.size?.width ?? 0),
    height: normalizePositiveNumber(targetSize?.height, targetDisplay?.size?.height ?? 0)
  };
  const targetAspectRatio = getAspectRatio(fallbackTargetSize);
  const targetArea = Math.max(1, getArea(fallbackTargetSize));
  let bestSource = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const source of sources) {
    const sourceSize = getSourceThumbnailSize(source);
    const sourceAspectRatio = getAspectRatio(sourceSize);
    const sourceArea = getArea(sourceSize);
    if (!sourceAspectRatio || !sourceArea) {
      continue;
    }
    const aspectPenalty = Math.abs(sourceAspectRatio - targetAspectRatio);
    const areaPenalty = Math.abs(sourceArea - targetArea) / targetArea;
    const widthPenalty = Math.abs(sourceSize.width - fallbackTargetSize.width) / Math.max(1, fallbackTargetSize.width);
    const heightPenalty = Math.abs(sourceSize.height - fallbackTargetSize.height) / Math.max(1, fallbackTargetSize.height);
    const score = aspectPenalty * 10 + areaPenalty + widthPenalty + heightPenalty;
    if (score < bestScore) {
      bestScore = score;
      bestSource = source;
    }
  }
  return bestSource || sources[0] || null;
}
function getDisplayForScreenshotSession({
  displays = [],
  cursorPoint
} = {}) {
  const pointX = Number(cursorPoint?.x);
  const pointY = Number(cursorPoint?.y);
  const containingDisplay = displays.find((display) => {
    const bounds = display?.bounds || {};
    const left = Number(bounds.x || 0);
    const top = Number(bounds.y || 0);
    const right = left + Number(bounds.width || 0);
    const bottom = top + Number(bounds.height || 0);
    return Number.isFinite(pointX) && Number.isFinite(pointY) && pointX >= left && pointX < right && pointY >= top && pointY < bottom;
  });
  if (containingDisplay) {
    return containingDisplay;
  }
  let bestDisplay = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const display of displays) {
    const bounds = display?.bounds || {};
    const left = Number(bounds.x || 0);
    const top = Number(bounds.y || 0);
    const right = left + Number(bounds.width || 0);
    const bottom = top + Number(bounds.height || 0);
    const nearestX = Math.min(Math.max(pointX, left), right);
    const nearestY = Math.min(Math.max(pointY, top), bottom);
    const distance = (pointX - nearestX) ** 2 + (pointY - nearestY) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestDisplay = display;
    }
  }
  return bestDisplay || displays[0] || null;
}
function getScreenshotSelectionBounds(displayBounds = {}) {
  return {
    x: Number(displayBounds.x || 0),
    y: Number(displayBounds.y || 0),
    width: Math.max(1, Math.round(Number(displayBounds.width || 0))),
    height: Math.max(1, Math.round(Number(displayBounds.height || 0)))
  };
}
function getScreenshotRestoreWindowConfig({
  mode = "window",
  forceIgnoreMouse = false,
  hoveringComponentCount = 0
} = {}) {
  if (mode === "pet") {
    const ignoreMouseEvents = forceIgnoreMouse || Number(hoveringComponentCount || 0) === 0;
    return {
      alwaysOnTop: true,
      alwaysOnTopLevel: getPetModeAlwaysOnTopLevel(),
      focusable: !ignoreMouseEvents,
      ignoreMouseEvents,
      moveTopAfterShow: true,
      resizable: false,
      skipTaskbar: true
    };
  }
  return {
    alwaysOnTop: false,
    alwaysOnTopLevel: void 0,
    focusable: true,
    ignoreMouseEvents: false,
    moveTopAfterShow: false,
    resizable: true,
    skipTaskbar: false
  };
}
const isMac = process.platform === "darwin";
class WindowManager {
  constructor() {
    this.window = null;
    this.windowedBounds = null;
    this.hoveringComponents = /* @__PURE__ */ new Set();
    this.currentMode = "window";
    this.forceIgnoreMouse = false;
    this.screenshotRestoreState = null;
    electron.ipcMain.on("renderer-ready-for-mode-change", (_event, newMode) => {
      if (newMode === "pet") {
        setTimeout(() => {
          this.continueSetWindowModePet();
        }, 500);
      } else {
        setTimeout(() => {
          this.continueSetWindowModeWindow();
        }, 500);
      }
    });
    electron.ipcMain.on("mode-change-rendered", () => {
      this.window?.setOpacity(1);
    });
    electron.ipcMain.on("window-unfullscreen", () => {
      const window = this.getWindow();
      if (window && window.isFullScreen()) {
        window.setFullScreen(false);
      }
    });
    electron.ipcMain.on("toggle-force-ignore-mouse", () => {
      this.toggleForceIgnoreMouse();
    });
  }
  createWindow(options) {
    this.window = new electron.BrowserWindow({
      width: 900,
      height: 670,
      show: false,
      transparent: true,
      backgroundColor: "#00000000",
      autoHideMenuBar: true,
      frame: false,
      icon: process.platform === "win32" ? path.join(__dirname, "../../resources/icon.ico") : path.join(__dirname, "../../resources/icon.png"),
      ...isMac ? { titleBarStyle: "hiddenInset" } : {},
      webPreferences: {
        preload: path.join(__dirname, "../preload/index.js"),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: true,
        webSecurity: false
      },
      hasShadow: false,
      paintWhenInitiallyHidden: true,
      ...options
    });
    this.setupWindowEvents();
    this.loadContent();
    this.window.on("enter-full-screen", () => {
      this.window?.webContents.send("window-fullscreen-change", true);
    });
    this.window.on("leave-full-screen", () => {
      this.window?.webContents.send("window-fullscreen-change", false);
    });
    return this.window;
  }
  setupWindowEvents() {
    if (!this.window) return;
    this.window.on("ready-to-show", () => {
      this.window?.show();
      this.window?.webContents.send(
        "window-maximized-change",
        this.window.isMaximized()
      );
    });
    this.window.on("maximize", () => {
      this.window?.webContents.send("window-maximized-change", true);
    });
    this.window.on("unmaximize", () => {
      this.window?.webContents.send("window-maximized-change", false);
    });
    this.window.on("resize", () => {
      const window = this.getWindow();
      if (window) {
        const bounds = window.getBounds();
        const { width, height } = electron.screen.getPrimaryDisplay().workArea;
        const isMaximized = bounds.width >= width && bounds.height >= height;
        window.webContents.send("window-maximized-change", isMaximized);
      }
    });
    this.window.webContents.setWindowOpenHandler((details) => {
      electron.shell.openExternal(details.url);
      return { action: "deny" };
    });
  }
  loadContent() {
    if (!this.window) return;
    if (utils.is.dev && process.env.ELECTRON_RENDERER_URL) {
      this.window.loadURL(process.env.ELECTRON_RENDERER_URL);
    } else {
      this.window.loadFile(path.join(__dirname, "../renderer/index.html"));
    }
  }
  setWindowMode(mode) {
    if (!this.window) return;
    this.currentMode = mode;
    this.window.setOpacity(0);
    if (mode === "window") {
      this.setWindowModeWindow();
    } else {
      this.setWindowModePet();
    }
  }
  setWindowModeWindow() {
    if (!this.window) return;
    this.window.setAlwaysOnTop(false);
    this.window.setIgnoreMouseEvents(false);
    this.window.setSkipTaskbar(false);
    this.window.setResizable(true);
    this.window.setFocusable(true);
    this.window.setAlwaysOnTop(false);
    this.window.setBackgroundColor("#00000000");
    this.window.webContents.send("pre-mode-changed", "window");
  }
  continueSetWindowModeWindow() {
    if (!this.window) return;
    if (this.windowedBounds) {
      this.window.setBounds(this.windowedBounds);
    } else {
      this.window.setSize(900, 670);
      this.window.center();
    }
    if (isMac) {
      this.window.setWindowButtonVisibility(true);
      this.window.setVisibleOnAllWorkspaces(false, {
        visibleOnFullScreen: false
      });
    }
    this.window?.setIgnoreMouseEvents(false, { forward: true });
    this.window.webContents.send("mode-changed", "window");
  }
  setWindowModePet() {
    if (!this.window) return;
    this.windowedBounds = this.window.getBounds();
    if (this.window.isFullScreen()) {
      this.window.setFullScreen(false);
    }
    this.window.setBackgroundColor("#00000000");
    this.window.setAlwaysOnTop(true, getPetModeAlwaysOnTopLevel());
    this.window.setPosition(0, 0);
    this.window.webContents.send("pre-mode-changed", "pet");
  }
  continueSetWindowModePet() {
    if (!this.window) return;
    const displays = electron.screen.getAllDisplays();
    const minX = Math.min(...displays.map((d) => d.bounds.x));
    const minY = Math.min(...displays.map((d) => d.bounds.y));
    const maxX = Math.max(...displays.map((d) => d.bounds.x + d.bounds.width));
    const maxY = Math.max(...displays.map((d) => d.bounds.y + d.bounds.height));
    const combinedWidth = maxX - minX;
    const combinedHeight = maxY - minY;
    this.window.setBounds({
      x: minX,
      y: minY,
      width: combinedWidth,
      height: combinedHeight
    });
    if (isMac) this.window.setWindowButtonVisibility(false);
    this.window.setResizable(false);
    this.window.setSkipTaskbar(true);
    this.window.setFocusable(false);
    if (isMac) {
      this.window.setIgnoreMouseEvents(true);
      this.window.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true
      });
    } else {
      this.window.setIgnoreMouseEvents(true, { forward: true });
    }
    this.window.webContents.send("mode-changed", "pet");
  }
  applyMouseIgnoreState(ignore) {
    if (!this.window) {
      return;
    }
    if (isMac) {
      this.window.setIgnoreMouseEvents(ignore);
    } else {
      this.window.setIgnoreMouseEvents(ignore, { forward: true });
    }
  }
  beginWindowScreenshotSelection(displayBounds) {
    if (!this.window || this.screenshotRestoreState) {
      return null;
    }
    this.screenshotRestoreState = {
      mode: this.currentMode,
      bounds: this.window.getBounds(),
      isFullScreen: this.window.isFullScreen()
    };
    if (this.window.isFullScreen()) {
      this.window.setFullScreen(false);
    }
    this.window.hide();
    return getScreenshotSelectionBounds(displayBounds || electron.screen.getPrimaryDisplay().bounds);
  }
  armWindowScreenshotSelection(bounds) {
    if (!this.window || !this.screenshotRestoreState) {
      return;
    }
    if (isMac) {
      this.window.setWindowButtonVisibility(false);
      this.window.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true
      });
    }
    this.window.setAlwaysOnTop(true, getPetModeAlwaysOnTopLevel());
    this.window.setIgnoreMouseEvents(false);
    this.window.setSkipTaskbar(true);
    this.window.setResizable(false);
    this.window.setFocusable(true);
    this.window.setOpacity(0);
    this.window.setBounds(bounds);
    this.window.show();
    this.window.moveTop();
    this.window.focus();
  }
  showWindowScreenshotSelection() {
    if (!this.window || !this.screenshotRestoreState) {
      return;
    }
    this.window.setOpacity(1);
    this.window.focus();
  }
  finishWindowScreenshotSelection() {
    if (!this.window || !this.screenshotRestoreState) {
      return;
    }
    const restoreState = this.screenshotRestoreState;
    this.screenshotRestoreState = null;
    const restoreConfig = getScreenshotRestoreWindowConfig({
      mode: restoreState.mode,
      forceIgnoreMouse: this.forceIgnoreMouse,
      hoveringComponentCount: this.hoveringComponents.size
    });
    if (restoreConfig.alwaysOnTopLevel) {
      this.window.setAlwaysOnTop(restoreConfig.alwaysOnTop, restoreConfig.alwaysOnTopLevel);
    } else {
      this.window.setAlwaysOnTop(restoreConfig.alwaysOnTop);
    }
    this.applyMouseIgnoreState(restoreConfig.ignoreMouseEvents);
    this.window.setSkipTaskbar(restoreConfig.skipTaskbar);
    this.window.setResizable(restoreConfig.resizable);
    this.window.setFocusable(restoreConfig.focusable);
    this.window.setBackgroundColor("#00000000");
    if (isMac) {
      this.window.setWindowButtonVisibility(restoreState.mode === "window");
      this.window.setVisibleOnAllWorkspaces(restoreState.mode === "pet", {
        visibleOnFullScreen: restoreState.mode === "pet"
      });
    }
    this.window.setBounds(restoreState.bounds);
    this.window.show();
    this.window.setOpacity(1);
    if (restoreConfig.moveTopAfterShow) {
      this.window.moveTop();
    }
    if (restoreState.isFullScreen) {
      this.window.setFullScreen(true);
    }
  }
  getWindow() {
    return this.window;
  }
  setIgnoreMouseEvents(ignore) {
    if (!this.window) return;
    if (isMac) {
      this.window.setIgnoreMouseEvents(ignore);
    } else {
      this.window.setIgnoreMouseEvents(ignore, { forward: true });
    }
  }
  maximizeWindow() {
    if (!this.window) return;
    if (this.isWindowMaximized()) {
      if (this.windowedBounds) {
        this.window.setBounds(this.windowedBounds);
        this.windowedBounds = null;
        this.window.webContents.send("window-maximized-change", false);
      }
    } else {
      this.windowedBounds = this.window.getBounds();
      const { width, height } = electron.screen.getPrimaryDisplay().workArea;
      this.window.setBounds({
        x: 0,
        y: 0,
        width,
        height
      });
      this.window.webContents.send("window-maximized-change", true);
    }
  }
  isWindowMaximized() {
    if (!this.window) return false;
    const bounds = this.window.getBounds();
    const { width, height } = electron.screen.getPrimaryDisplay().workArea;
    return bounds.width >= width && bounds.height >= height;
  }
  updateComponentHover(componentId, isHovering) {
    if (this.currentMode === "window") return;
    if (this.forceIgnoreMouse) return;
    if (isHovering) {
      this.hoveringComponents.add(componentId);
    } else {
      this.hoveringComponents.delete(componentId);
    }
    if (this.window) {
      const shouldIgnore = this.hoveringComponents.size === 0;
      if (isMac) {
        this.window.setIgnoreMouseEvents(shouldIgnore);
      } else {
        this.window.setIgnoreMouseEvents(shouldIgnore, { forward: true });
      }
      if (!shouldIgnore) {
        this.window.setFocusable(true);
      }
    }
  }
  // Toggle force ignore mouse events
  toggleForceIgnoreMouse() {
    this.forceIgnoreMouse = !this.forceIgnoreMouse;
    if (this.forceIgnoreMouse) {
      if (isMac) {
        this.window?.setIgnoreMouseEvents(true);
      } else {
        this.window?.setIgnoreMouseEvents(true, { forward: true });
      }
    } else {
      const shouldIgnore = this.hoveringComponents.size === 0;
      if (isMac) {
        this.window?.setIgnoreMouseEvents(shouldIgnore);
      } else {
        this.window?.setIgnoreMouseEvents(shouldIgnore, { forward: true });
      }
    }
    this.window?.webContents.send("force-ignore-mouse-changed", this.forceIgnoreMouse);
  }
  // Get current force ignore state
  isForceIgnoreMouse() {
    return this.forceIgnoreMouse;
  }
  // Get current mode
  getCurrentMode() {
    return this.currentMode;
  }
}
const trayIcon = path.join(__dirname, "../../resources/icon.png");
class MenuManager {
  constructor(onModeChange) {
    this.onModeChange = onModeChange;
    this.tray = null;
    this.currentMode = "window";
    this.configFiles = [];
    this.setupContextMenu();
  }
  createTray() {
    const icon = electron.nativeImage.createFromPath(trayIcon);
    const trayIconResized = icon.resize({
      width: process.platform === "win32" ? 16 : 18,
      height: process.platform === "win32" ? 16 : 18
    });
    this.tray = new electron.Tray(trayIconResized);
    this.updateTrayMenu();
  }
  getModeMenuItems() {
    return [
      {
        label: "窗口模式",
        type: "radio",
        checked: this.currentMode === "window",
        click: () => {
          this.setMode("window");
        }
      },
      {
        label: "桌宠模式",
        type: "radio",
        checked: this.currentMode === "pet",
        click: () => {
          this.setMode("pet");
        }
      }
    ];
  }
  // TODO: 菜单的中英文切换？目前硬编码了中文
  updateTrayMenu() {
    if (!this.tray) return;
    const contextMenu = electron.Menu.buildFromTemplate([
      ...this.getModeMenuItems(),
      { type: "separator" },
      // Only show toggle mouse ignore in pet mode
      ...this.currentMode === "pet" ? [
        {
          label: "切换鼠标穿透",
          click: () => {
            const windows = electron.BrowserWindow.getAllWindows();
            windows.forEach((window) => {
              window.webContents.send("toggle-force-ignore-mouse");
            });
          }
        },
        { type: "separator" }
      ] : [],
      {
        label: "显示窗口",
        click: () => {
          const windows = electron.BrowserWindow.getAllWindows();
          windows.forEach((window) => {
            window.show();
          });
        }
      },
      {
        label: "隐藏窗口",
        click: () => {
          const windows = electron.BrowserWindow.getAllWindows();
          windows.forEach((window) => {
            window.hide();
          });
        }
      },
      {
        label: "退出",
        click: () => {
          electron.app.quit();
        }
      }
    ]);
    this.tray.setToolTip("OpenClaw Lunaria");
    this.tray.setContextMenu(contextMenu);
  }
  getContextMenuItems(event) {
    const template = [
      {
        label: "切换麦克风",
        click: () => {
          event.sender.send("mic-toggle");
        }
      },
      {
        label: "打断回复",
        click: () => {
          event.sender.send("interrupt");
        }
      },
      { type: "separator" },
      // Only show in pet mode
      ...this.currentMode === "pet" ? [
        {
          label: "切换鼠标穿透",
          click: () => {
            event.sender.send("toggle-force-ignore-mouse");
          }
        }
      ] : [],
      {
        label: "切换滚轮缩放",
        click: () => {
          event.sender.send("toggle-scroll-to-resize");
        }
      },
      { type: "separator" },
      ...this.getModeMenuItems(),
      { type: "separator" },
      {
        label: "切换角色",
        visible: this.currentMode === "pet",
        submenu: this.configFiles.map((config) => ({
          label: config.name,
          click: () => {
            event.sender.send("switch-character", config.filename);
          }
        }))
      },
      { type: "separator" },
      {
        label: "隐藏窗口",
        click: () => {
          const windows = electron.BrowserWindow.getAllWindows();
          windows.forEach((window) => {
            window.hide();
          });
        }
      },
      {
        label: "退出",
        click: () => {
          electron.app.quit();
        }
      }
    ];
    return template;
  }
  setupContextMenu() {
    electron.ipcMain.on("show-context-menu", (event) => {
      const win = electron.BrowserWindow.fromWebContents(event.sender);
      if (win) {
        const screenPoint = electron.screen.getCursorScreenPoint();
        const menu = electron.Menu.buildFromTemplate(this.getContextMenuItems(event));
        menu.popup({
          window: win,
          x: Math.round(screenPoint.x),
          y: Math.round(screenPoint.y)
        });
      }
    });
  }
  setMode(mode) {
    this.currentMode = mode;
    this.updateTrayMenu();
    this.onModeChange(mode);
  }
  destroy() {
    this.tray?.destroy();
    this.tray = null;
  }
  updateConfigFiles(files) {
    this.configFiles = files;
  }
  getConfigFiles() {
    return [...this.configFiles];
  }
}
let windowManager;
let menuManager;
let isQuitting = false;
const sessionDataPath = node_path.join(electron.app.getPath("userData"), "session-data");
const diskCachePath = node_path.join(sessionDataPath, "cache");
node_fs.mkdirSync(diskCachePath, { recursive: true });
electron.app.setPath("sessionData", sessionDataPath);
electron.app.commandLine.appendSwitch("disk-cache-dir", diskCachePath);
electron.app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
function mergeConfigObjects(base, override) {
  const next = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = next[key];
    if (current && value && typeof current === "object" && typeof value === "object" && !Array.isArray(current) && !Array.isArray(value)) {
      next[key] = mergeConfigObjects(
        current,
        value
      );
      continue;
    }
    next[key] = value;
  }
  return next;
}
function getLunariaConfigPaths(fileName) {
  const cwd = process.cwd();
  const appPath = electron.app.getAppPath();
  const exeDir = node_path.dirname(electron.app.getPath("exe"));
  return [
    node_path.resolve(cwd, fileName),
    node_path.resolve(cwd, "..", fileName),
    node_path.resolve(appPath, fileName),
    node_path.resolve(appPath, "..", fileName),
    node_path.resolve(appPath, "..", "..", fileName),
    node_path.resolve(process.resourcesPath, fileName),
    node_path.resolve(process.resourcesPath, "app", fileName),
    node_path.resolve(exeDir, fileName)
  ];
}
function loadLunariaDesktopConfig() {
  const basePaths = getLunariaConfigPaths("config.json");
  const localPaths = getLunariaConfigPaths("config.local.json");
  let merged = {};
  for (const filePath of [...basePaths, ...localPaths]) {
    if (!node_fs.existsSync(filePath)) {
      continue;
    }
    try {
      const parsed = JSON.parse(node_fs.readFileSync(filePath, "utf8"));
      merged = mergeConfigObjects(merged, parsed);
    } catch (error) {
      console.warn(`Failed to read lunaria config from ${filePath}:`, error);
    }
  }
  return merged;
}
function getConfiguredBackendUrl() {
  const backendUrl = String(loadLunariaDesktopConfig().desktop?.backendUrl || "").trim();
  return backendUrl || null;
}
function getBuiltinPluginRoots() {
  return [
    node_path.resolve(electron.app.getAppPath(), "..", "frontend", "public", "plugins"),
    node_path.join(process.resourcesPath, "plugins"),
    node_path.join(process.resourcesPath, "resources", "plugins"),
    node_path.join(electron.app.getAppPath(), "resources", "plugins")
  ];
}
function getLocalPluginRoot() {
  const pluginRoot = node_path.join(electron.app.getPath("userData"), "plugins");
  node_fs.mkdirSync(pluginRoot, { recursive: true });
  return pluginRoot;
}
function discoverPluginsInRoot(rootPath, source) {
  if (!node_fs.existsSync(rootPath)) {
    return [];
  }
  return node_fs.readdirSync(rootPath, { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((entry) => {
    const pluginDir = node_path.join(rootPath, entry.name);
    const manifestPath = node_path.join(pluginDir, "manifest.json");
    if (!node_fs.existsSync(manifestPath)) {
      return [];
    }
    try {
      const manifest = JSON.parse(node_fs.readFileSync(manifestPath, "utf8"));
      const configuredEntry = String(manifest.entry || "index.js");
      const entryPath = node_path.join(pluginDir, configuredEntry);
      if (!node_fs.existsSync(entryPath)) {
        return [];
      }
      return [{
        id: String(manifest.id || entry.name),
        source,
        rootPath: pluginDir,
        entryUrl: node_url.pathToFileURL(entryPath).toString(),
        manifest
      }];
    } catch (error) {
      console.warn(`Failed to discover plugin in ${pluginDir}:`, error);
      return [];
    }
  });
}
function discoverPlugins() {
  const builtins = getBuiltinPluginRoots().flatMap((rootPath) => discoverPluginsInRoot(rootPath, "builtin"));
  const localPlugins = discoverPluginsInRoot(getLocalPluginRoot(), "local");
  const deduped = /* @__PURE__ */ new Map();
  for (const item of [...builtins, ...localPlugins]) {
    deduped.set(item.id, item);
  }
  return Array.from(deduped.values());
}
function delay(ms) {
  return new Promise((resolve2) => {
    setTimeout(resolve2, ms);
  });
}
async function captureDisplayResult(targetDisplay, purpose = "attachment") {
  const {
    captureSize,
    outputConfig,
    sourceSize
  } = getScreenshotCapturePlan({
    displaySize: targetDisplay.size,
    purpose,
    scaleFactor: targetDisplay.scaleFactor
  });
  const sources = await electron.desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: captureSize
  });
  const chosen = getCaptureSourceForDisplay({
    sources,
    targetDisplay,
    targetSize: sourceSize
  });
  if (!chosen) {
    return null;
  }
  const chosenSize = chosen.thumbnail?.getSize?.() || {};
  const thumbnail = Number(chosenSize.width || 0) > captureSize.width || Number(chosenSize.height || 0) > captureSize.height ? chosen.thumbnail.resize(captureSize) : chosen.thumbnail;
  const buffer = outputConfig.mimeType === "image/png" ? thumbnail.toPNG() : thumbnail.toJPEG(outputConfig.jpegQuality ?? 98);
  if (!buffer?.length) {
    return null;
  }
  return {
    buffer,
    filename: outputConfig.filename,
    mimeType: outputConfig.mimeType
  };
}
async function captureDisplay(targetDisplay, purpose = "attachment") {
  const result = await captureDisplayResult(targetDisplay, purpose);
  if (!result) {
    return null;
  }
  return `data:${result.mimeType};base64,${result.buffer.toString("base64")}`;
}
function createTempScreenshotFile({
  buffer,
  mimeType
}) {
  if (!buffer?.length) {
    return null;
  }
  const normalizedMimeType = mimeType === "image/png" ? "image/png" : "image/jpeg";
  const extension = normalizedMimeType === "image/png" ? ".png" : ".jpg";
  const cleanupToken = `shot_${Date.now()}_${Math.random().toString(36).slice(2, 10)}${extension}`;
  const filePath = node_path.join(sessionDataPath, cleanupToken);
  node_fs.writeFileSync(filePath, buffer);
  return {
    cleanupToken,
    fileUrl: node_url.pathToFileURL(filePath).toString(),
    mimeType: normalizedMimeType
  };
}
function resolveTempScreenshotFilePath(fileUrl) {
  try {
    const filePath = node_url.fileURLToPath(fileUrl);
    const normalizedPath = node_path.resolve(filePath);
    const normalizedRoot = `${node_path.resolve(sessionDataPath)}${node_path.sep}`;
    if (!normalizedPath.startsWith(normalizedRoot)) {
      return null;
    }
    if (!node_fs.existsSync(normalizedPath)) {
      return null;
    }
    return normalizedPath;
  } catch (error) {
    console.warn("Failed to resolve temp screenshot file:", error);
    return null;
  }
}
function readTempScreenshotFile(fileUrl) {
  try {
    const filePath = resolveTempScreenshotFilePath(fileUrl);
    if (!filePath) {
      return null;
    }
    const buffer = node_fs.readFileSync(filePath);
    const extension = filePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    return `data:${extension};base64,${buffer.toString("base64")}`;
  } catch (error) {
    console.warn("Failed to read temp screenshot file:", error);
    return null;
  }
}
function cropTempScreenshotFile(payload) {
  try {
    const filePath = resolveTempScreenshotFilePath(payload.fileUrl);
    if (!filePath) {
      return null;
    }
    const image = electron.nativeImage.createFromPath(filePath);
    if (image.isEmpty()) {
      return null;
    }
    const imageSize = image.getSize();
    const displayWidth = Math.max(1, Math.round(Number(payload.displaySize?.width || 0)));
    const displayHeight = Math.max(1, Math.round(Number(payload.displaySize?.height || 0)));
    const scaleX = imageSize.width / displayWidth;
    const scaleY = imageSize.height / displayHeight;
    const rawX = Math.max(0, Math.round(Number(payload.selection?.x || 0) * scaleX));
    const rawY = Math.max(0, Math.round(Number(payload.selection?.y || 0) * scaleY));
    const x = Math.min(Math.max(0, imageSize.width - 1), rawX);
    const y = Math.min(Math.max(0, imageSize.height - 1), rawY);
    const rawWidth = Math.max(1, Math.round(Number(payload.selection?.width || 0) * scaleX));
    const rawHeight = Math.max(1, Math.round(Number(payload.selection?.height || 0) * scaleY));
    const width = Math.max(1, Math.min(imageSize.width - x, rawWidth));
    const height = Math.max(1, Math.min(imageSize.height - y, rawHeight));
    const cropped = image.crop({ x, y, width, height });
    if (cropped.isEmpty()) {
      return null;
    }
    return createTempScreenshotFile({
      buffer: cropped.toPNG(),
      mimeType: "image/png"
    });
  } catch (error) {
    console.warn("Failed to crop temp screenshot file:", error);
    return null;
  }
}
function deleteTempScreenshotFile(cleanupToken) {
  const safeToken = String(cleanupToken || "").trim();
  if (!safeToken || safeToken.includes("/") || safeToken.includes("\\") || safeToken.includes("..")) {
    return;
  }
  const filePath = node_path.join(sessionDataPath, safeToken);
  if (!node_fs.existsSync(filePath)) {
    return;
  }
  try {
    node_fs.unlinkSync(filePath);
  } catch (error) {
    console.warn("Failed to delete temp screenshot file:", error);
  }
}
async function capturePrimaryScreen() {
  return captureDisplay(electron.screen.getPrimaryDisplay(), "attachment");
}
function setupIPC() {
  electron.ipcMain.handle("get-platform", () => process.platform);
  electron.ipcMain.on("set-ignore-mouse-events", (_event, ignore) => {
    const window = windowManager.getWindow();
    if (window) {
      windowManager.setIgnoreMouseEvents(ignore);
    }
  });
  electron.ipcMain.on("get-current-mode", (event) => {
    event.returnValue = windowManager.getCurrentMode();
  });
  electron.ipcMain.on("pre-mode-changed", (_event, newMode) => {
    if (newMode === "window" || newMode === "pet") {
      menuManager.setMode(newMode);
    }
  });
  electron.ipcMain.on("window-minimize", () => {
    windowManager.getWindow()?.minimize();
  });
  electron.ipcMain.on("window-maximize", () => {
    const window = windowManager.getWindow();
    if (window) {
      windowManager.maximizeWindow();
    }
  });
  electron.ipcMain.on("window-close", () => {
    const window = windowManager.getWindow();
    if (window) {
      if (process.platform === "darwin") {
        window.hide();
      } else {
        window.close();
      }
    }
  });
  electron.ipcMain.on(
    "update-component-hover",
    (_event, componentId, isHovering) => {
      windowManager.updateComponentHover(componentId, isHovering);
    }
  );
  electron.ipcMain.handle("get-config-files", () => {
    const configFiles = menuManager.getConfigFiles();
    menuManager.updateConfigFiles(configFiles);
    return configFiles;
  });
  electron.ipcMain.handle("get-configured-backend-url", () => {
    return getConfiguredBackendUrl();
  });
  electron.ipcMain.on("update-config-files", (_event, files) => {
    menuManager.updateConfigFiles(files);
  });
  electron.ipcMain.handle("get-screen-capture", async () => {
    const sources = await electron.desktopCapturer.getSources({ types: ["screen"] });
    return sources[0].id;
  });
  electron.ipcMain.handle("get-pet-overlay-bounds", () => {
    const displays = electron.screen.getAllDisplays();
    const point = electron.screen.getCursorScreenPoint();
    const activeDisplay = electron.screen.getDisplayNearestPoint(point);
    const minX = Math.min(...displays.map((display) => display.bounds.x));
    const minY = Math.min(...displays.map((display) => display.bounds.y));
    const maxX = Math.max(...displays.map((display) => display.bounds.x + display.bounds.width));
    const maxY = Math.max(...displays.map((display) => display.bounds.y + display.bounds.height));
    return {
      workArea: activeDisplay.workArea,
      virtualBounds: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
      }
    };
  });
  electron.ipcMain.handle("get-cursor-screen-point", () => {
    const point = electron.screen.getCursorScreenPoint();
    return {
      x: point.x,
      y: point.y
    };
  });
  const emitPetOverlayBoundsChanged = () => {
    const window = windowManager.getWindow();
    window?.webContents.send("pet-overlay-bounds-changed");
  };
  electron.screen.on("display-added", emitPetOverlayBoundsChanged);
  electron.screen.on("display-removed", emitPetOverlayBoundsChanged);
  electron.screen.on("display-metrics-changed", emitPetOverlayBoundsChanged);
  electron.ipcMain.handle("capture-primary-screen", async () => {
    return capturePrimaryScreen();
  });
  electron.ipcMain.handle("start-screenshot-selection", async () => {
    const cursorPoint = electron.screen.getCursorScreenPoint();
    const targetDisplay = getDisplayForScreenshotSession({
      displays: electron.screen.getAllDisplays(),
      cursorPoint
    }) || electron.screen.getPrimaryDisplay();
    const selectionBounds = windowManager.beginWindowScreenshotSelection(targetDisplay.bounds);
    if (!selectionBounds) {
      return null;
    }
    await delay(80);
    const capture = await captureDisplayResult(targetDisplay, "selection");
    if (!capture) {
      windowManager.finishWindowScreenshotSelection();
      return null;
    }
    const tempFile = createTempScreenshotFile(capture);
    if (!tempFile) {
      windowManager.finishWindowScreenshotSelection();
      return null;
    }
    windowManager.armWindowScreenshotSelection(selectionBounds);
    return {
      fileUrl: tempFile.fileUrl,
      cleanupToken: tempFile.cleanupToken,
      filename: capture.filename
    };
  });
  electron.ipcMain.handle("show-screenshot-selection", () => {
    windowManager.showWindowScreenshotSelection();
  });
  electron.ipcMain.handle("finish-screenshot-selection", () => {
    windowManager.finishWindowScreenshotSelection();
  });
  electron.ipcMain.handle("delete-temp-screenshot-file", (_event, cleanupToken) => {
    deleteTempScreenshotFile(cleanupToken);
  });
  electron.ipcMain.handle("read-temp-screenshot-file", (_event, fileUrl) => {
    return readTempScreenshotFile(fileUrl);
  });
  electron.ipcMain.handle("crop-temp-screenshot-file", (_event, payload) => {
    return cropTempScreenshotFile(payload);
  });
  electron.ipcMain.handle("list-plugins", () => {
    return {
      builtinRoots: getBuiltinPluginRoots().filter((rootPath) => node_fs.existsSync(rootPath)),
      localRoot: getLocalPluginRoot(),
      items: discoverPlugins()
    };
  });
}
electron.app.whenReady().then(() => {
  utils.electronApp.setAppUserModelId("ai.lunaria.desktop");
  windowManager = new WindowManager();
  menuManager = new MenuManager((mode) => windowManager.setWindowMode(mode));
  const window = windowManager.createWindow({
    titleBarOverlay: {
      color: "#111111",
      symbolColor: "#FFFFFF",
      height: 30
    }
  });
  menuManager.createTray();
  window.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      window.hide();
    }
    return false;
  });
  setupIPC();
  electron.app.on("activate", () => {
    const window2 = windowManager.getWindow();
    if (window2) {
      window2.show();
    }
  });
  electron.app.on("browser-window-created", (_, window2) => {
    utils.optimizer.watchWindowShortcuts(window2);
  });
  electron.app.on("web-contents-created", (_, contents) => {
    contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === "media") {
        callback(true);
      } else {
        callback(false);
      }
    });
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("before-quit", () => {
  isQuitting = true;
  menuManager.destroy();
  electron.globalShortcut.unregisterAll();
});
