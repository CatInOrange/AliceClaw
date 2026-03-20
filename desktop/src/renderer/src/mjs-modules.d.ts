declare module "@/local-storage-utils.mjs" {
  export function resolveStorageValue<T>(
    currentValue: T,
    nextValue: T | ((currentValue: T) => T),
    filter?: ((value: T) => T) | undefined,
  ): {
    valueToStore: T;
    filteredValue: T;
  };
}

declare module "@/live2d-config-utils.mjs" {
  export interface MinimalModelInfo {
    url?: string;
    kScale?: number;
    pointerInteractive?: boolean;
    scrollToResize?: boolean;
  }

  export function buildStoredModelInfo<T extends MinimalModelInfo>(
    previousModelInfo: T | undefined,
    info: T | undefined,
  ): T | undefined;
}
