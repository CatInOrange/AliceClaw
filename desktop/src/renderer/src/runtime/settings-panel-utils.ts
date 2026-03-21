const SUPPORTED_LANGUAGES = new Set(["en", "zh"]);

function splitFieldKey(key) {
  return String(key || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function toTitleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export function normalizeSupportedLanguage(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0];

  if (SUPPORTED_LANGUAGES.has(normalized)) {
    return normalized;
  }

  return "en";
}

export function resolveProviderFieldLabel(field) {
  const explicitLabel = String(field?.label || "").trim();
  if (explicitLabel) {
    return explicitLabel;
  }

  const words = splitFieldKey(field?.key);
  if (!words.length) {
    return "Field";
  }

  return words.map(toTitleCase).join(" ");
}

export function resolveProviderFieldPlaceholder(field) {
  const explicitPlaceholder = String(field?.placeholder || "").trim();
  if (explicitPlaceholder) {
    return explicitPlaceholder;
  }

  return resolveProviderFieldLabel(field);
}
