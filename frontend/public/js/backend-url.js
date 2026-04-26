const DEFAULT_BROWSER_BACKEND_BASE_URL = '';
const DEFAULT_TAURI_BACKEND_BASE_URL = 'http://127.0.0.1:18080';
const STORAGE_KEY = 'openclaw-live2d-backend-base-url-v1';
const PASSWORD_STORAGE_KEY = 'openclaw-live2d-app-password-v1';

// 显示密码调试信息
(function showPasswordDebug() {
  const fromGlobal = String(window.__ALICECHAT_APP_PASSWORD__ || '').trim();
  const fromQuery = String(new URLSearchParams(window.location.search).get('app_password') || '').trim();
  let fromStorage = '';
  try { fromStorage = String(localStorage.getItem(PASSWORD_STORAGE_KEY) || '').trim(); } catch {}
  
  const msg = `【密码调试】\n` +
    `1. window.__ALICECHAT_APP_PASSWORD__: ${fromGlobal || '(空)'}\n` +
    `2. URL参数 app_password: ${fromQuery || '(空)'}\n` +
    `3. localStorage: ${fromStorage || '(空)'}\n` +
    `最终使用: "${fromGlobal || fromQuery || fromStorage || '(空)'}"`;
  
  // 创建页面上的显示
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;top:10px;right:10px;background:#fff8e1;border:2px solid #ff6b6b;border-radius:8px;padding:16px;z-index:999999;font-size:14px;max-width:350px;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-family:monospace;';
  div.innerHTML = '<b style="color:#ff6b6b;">🔐 密码调试信息</b><br><br>' +
    '<b>window.__ALICECHAT_APP_PASSWORD__:</b> ' + (fromGlobal || '<span style="color:red">(空)</span>') + '<br>' +
    '<b>URL参数 app_password:</b> ' + (fromQuery || '<span style="color:red">(空)</span>') + '<br>' +
    '<b>localStorage:</b> ' + (fromStorage || '<span style="color:red">(空)</span>') + '<br><br>' +
    '<b style="color:#ff6b6b;">最终使用密码:</b> "' + (fromGlobal || fromQuery || fromStorage || '<span style="color:red">(空，会导致认证失败!)</span>') + '"';
  document.body.appendChild(div);
  
  // 同时弹alert
  setTimeout(() => alert(msg), 500);
})();

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

export function getAppPassword() {
  const fromGlobal = String(window.__ALICECHAT_APP_PASSWORD__ || '').trim();
  if (fromGlobal) {
    console.log('[DEBUG getAppPassword] from global window.__ALICECHAT_APP_PASSWORD__:', fromGlobal);
    return fromGlobal;
  }

  const fromQuery = String(new URLSearchParams(window.location.search).get('app_password') || '').trim();
  if (fromQuery) {
    console.log('[DEBUG getAppPassword] from URL app_password:', fromQuery);
    try {
      localStorage.setItem(PASSWORD_STORAGE_KEY, fromQuery);
    } catch {}
    return fromQuery;
  }

  try {
    const fromStorage = String(localStorage.getItem(PASSWORD_STORAGE_KEY) || '').trim();
    console.log('[DEBUG getAppPassword] from localStorage:', fromStorage);
    return fromStorage;
  } catch {
    return '';
  }
}

export function setAppPassword(password) {
  const normalized = String(password || '').trim();
  try {
    if (normalized) localStorage.setItem(PASSWORD_STORAGE_KEY, normalized);
    else localStorage.removeItem(PASSWORD_STORAGE_KEY);
  } catch {}
  return normalized;
}

export function buildAuthHeaders(extraHeaders = {}) {
  const password = getAppPassword();
  const headers = {
    ...extraHeaders,
    ...(password ? {
      'X-AliceChat-Password': password,
      Authorization: `Bearer ${password}`,
    } : {}),
  };
  console.log('[DEBUG buildAuthHeaders] password:', password ? `"${password}"` : '(空)', 'headers:', JSON.stringify(headers));
  return headers;
}

export function appendAuthQuery(path = '') {
  const password = getAppPassword();
  const value = String(path || '');
  console.log('[DEBUG appendAuthQuery] path:', value, 'password:', password ? `"${password}"` : '(空)');
  if (!password || !value) return value;
  const separator = value.includes('?') ? '&' : '?';
  return `${value}${separator}app_password=${encodeURIComponent(password)}`;
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
