import { LAppDelegate } from "./lappdelegate";
import * as LAppDefine from "./lappdefine";
import { LAppGlManager } from "./lappglmanager";
import { LAppLive2DManager } from "./lapplive2dmanager";

import { Live2DCubismFramework } from "@framework/live2dcubismframework";
const CubismFramework = Live2DCubismFramework.CubismFramework;

import {
  beginLive2DInitializationSession,
  getLive2DInitializationStore,
  isLive2DInitializationSessionCurrent,
} from "../../src/runtime/live2d-init-session-utils.ts";
import { resetLive2DRuntime } from "../../src/runtime/live2d-runtime-reset-utils.ts";

export function initializeLive2D(): void {
  const initStore = getLive2DInitializationStore(window);
  const sessionId = beginLive2DInitializationSession(initStore);

  console.log("=== Starting Live2D R5 Initialization ===");

  // 1. 先彻底清理旧 Framework（升级后必须加）
  if (CubismFramework.isInitialized()) {
    CubismFramework.dispose();
  }

  resetLive2DRuntime({
    releaseDelegate: () => LAppDelegate.releaseInstance(),
    releaseGlManager: () => LAppGlManager.releaseInstance(),
    releaseLive2DManager: () => LAppLive2DManager.releaseInstance(),
  });

  // 2. Framework 初始化（R5 严格顺序）
  CubismFramework.startUp();
  CubismFramework.initialize();   // 可以尝试传参数：CubismFramework.initialize(1024 * 1024 * 32); 如果内存相关问题
  console.log("CubismFramework initialized (R5)");

  // 3. 初始化 Delegate（这步会创建 Canvas）
  const delegate = LAppDelegate.getInstance();
  if (!delegate.initialize()) {
    console.error("LAppDelegate.initialize() failed!");
    return;
  }

  if (!isLive2DInitializationSessionCurrent(sessionId, initStore)) {
    console.warn("Session expired during init");
    return;
  }

  delegate.run();

  // 全局暴露
  (window as any).getLive2DManager = () => LAppLive2DManager.getInstance();
  (window as any).initializeLive2D = initializeLive2D;

  console.log("=== Live2D R5 Initialization Completed ===");
}