// @ts-nocheck
export function resolveAssistantDisplayName({
  configName,
  manifestName,
  fallbackName = "OpenClaw",
} = {}) {
  const resolvedConfigName = String(configName || "").trim();
  if (resolvedConfigName) {
    return resolvedConfigName;
  }

  const resolvedManifestName = String(manifestName || "").trim();
  if (resolvedManifestName) {
    return resolvedManifestName;
  }

  return String(fallbackName || "OpenClaw").trim() || "OpenClaw";
}
