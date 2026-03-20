import React, { useContext } from "react";
import { LunariaQuickAction } from "@/services/openclaw-api";

interface DesktopRuntimeContextValue {
  executeActions: (actions: unknown[]) => Promise<void>;
  triggerQuickAction: (action: LunariaQuickAction) => Promise<void>;
  playMusic: (payload?: { url?: string; trackId?: string }) => Promise<void>;
  stopMusic: () => Promise<void>;
}

const noopAsync = async () => {};

export const DesktopRuntimeContext = React.createContext<DesktopRuntimeContextValue>({
  executeActions: noopAsync,
  triggerQuickAction: noopAsync,
  playMusic: noopAsync,
  stopMusic: noopAsync,
});

export function useDesktopRuntime() {
  return useContext(DesktopRuntimeContext);
}

