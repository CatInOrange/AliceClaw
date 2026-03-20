const DEFAULT_BROWSER_BACKEND_BASE_URL = '';
const DEFAULT_TAURI_BACKEND_BASE_URL = 'http://127.0.0.1:18080';
const STORAGE_KEY = 'openclaw-live2d-backend-base-url-v1';

function getTauriFlag() {
  return !!window.__TAURI__;
}

function normalizeBaseUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  return value.replace(/\/+$/, '');
}

export function getBackendBaseUrl() {
  const fromGlobal = normalizeBaseUrl(window.__LIVE2D_BACKEND_BASE_URL__);
  if (fromGlobal) return fromGlobal;

  const fromQuery = normalizeBaseUrl(new URLSearchParams(window.location.search).get('backend'));
  if (fromQuery) return fromQuery;

  const fromStorage = normalizeBaseUrl(localStorage.getItem(STORAGE_KEY));
  if (fromStorage) return fromStorage;

  return getTauriFlag() ? DEFAULT_TAURI_BACKEND_BASE_URL : DEFAULT_BROWSER_BACKEND_BASE_URL;
}

export function setBackendBaseUrl(url) {
  const normalized = normalizeBaseUrl(url);
  if (normalized) {
    localStorage.setItem(STORAGE_KEY, normalized);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
  return normalized;
}

export function backendUrl(path = '') {
  const base = getBackendBaseUrl();
  const suffix = String(path || '');
  if (!suffix) return base || '';
  if (/^https?:\/\//i.test(suffix)) return suffix;
  if (!base) return suffix;
  return `${base}${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
}

export function absolutizeBackendAssetUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  return backendUrl(value);
}
