const ALLOWED_OVERRIDE_KEYS = new Set([
  "wsUrl",
  "bridgeUrl",
  "baseUrl",
  "model",
  "agent",
  "session",
  "apiKey",
  "token",
]);

export function getProviderOverridesPayload(provider, values) {
  if (!provider || !values) {
    return {};
  }

  const payload = {};
  for (const field of provider.fields || []) {
    const fieldKey = String(field?.key || "");
    if (!ALLOWED_OVERRIDE_KEYS.has(fieldKey)) {
      continue;
    }

    const value = String(values?.[`${provider.id}.${fieldKey}`] || "").trim();
    if (!value) {
      continue;
    }
    payload[fieldKey] = value;
  }

  return payload;
}
