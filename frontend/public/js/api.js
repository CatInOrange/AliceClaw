import { absolutizeBackendAssetUrl, backendUrl } from './backend-url.js';

function absolutizeManifest(manifest) {
  const next = manifest ? JSON.parse(JSON.stringify(manifest)) : manifest;
  if (next?.model?.modelJson) {
    next.model.modelJson = absolutizeBackendAssetUrl(next.model.modelJson);
  }
  if (next?.model?.url) {
    next.model.url = absolutizeBackendAssetUrl(next.model.url);
  }
  if (Array.isArray(next?.models)) {
    for (const item of next.models) {
      if (item?.modelJson) item.modelJson = absolutizeBackendAssetUrl(item.modelJson);
      if (item?.url) item.url = absolutizeBackendAssetUrl(item.url);
    }
  }
  return next;
}

export async function fetchModelManifest(modelId) {
  const response = await fetch(backendUrl(`/api/model?model=${encodeURIComponent(modelId || '')}`));
  return absolutizeManifest(await response.json());
}

/**
 * Stream chat with support for text and image attachments.
 *
 * @param {Object} payload - Chat payload
 * @param {string} payload.text - User message text
 * @param {string} payload.modelId - Model ID
 * @param {string} payload.providerId - Provider ID
 * @param {Array} [payload.attachments] - Array of attachment objects (for sending images)
 * @param {Function} onEvent - Event callback
 */
export async function streamChat(payload, onEvent) {
  const response = await fetch(backendUrl('/api/chat/stream'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!response.ok || !response.body) {
    let message = `HTTP ${response.status}`;
    try { const data = await response.json(); message = data.error || message; } catch {}
    throw new Error(message);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let shouldStop = false;
  while (!shouldStop) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (!rawEvent.trim()) continue;
      const lines = rawEvent.split('\n');
      let eventName = 'message';
      const dataLines = [];
      for (const line of lines) {
        if (line.startsWith(':')) continue;
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) continue;
      let data;
      try { data = JSON.parse(dataLines.join('\n')); } catch { continue; }
      if (typeof onEvent === 'function') onEvent({ event: eventName, data });
      if (eventName === 'final' || eventName === 'error') {
        shouldStop = true;
        try { await reader.cancel(); } catch {}
        break;
      }
    }
  }
}

export async function requestTts(text, ttsProvider, mode) {
  const payload = { text: String(text || '').trim() };
  if (ttsProvider) payload.provider = ttsProvider;
  if (mode) payload.mode = String(mode);
  console.info('[TTS] request /api/tts', {
    mode: payload.mode || 'chat',
    provider: payload.provider || '',
    textLen: payload.text.length,
  });
  const response = await fetch(backendUrl('/api/tts'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try { const data = await response.json(); message = data.error || message; } catch {}
    console.error('[TTS] request failed', {
      mode: payload.mode || 'chat',
      provider: payload.provider || '',
      status: response.status,
      error: message,
    });
    throw new Error(message);
  }
  const blob = await response.blob();
  console.info('[TTS] response ok', {
    mode: payload.mode || 'chat',
    provider: payload.provider || '',
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    bytes: blob.size,
  });
  return blob;
}

export async function fetchSessions() {
  const response = await fetch(backendUrl('/api/sessions'));
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try { const data = await response.json(); message = data.error || message; } catch {}
    throw new Error(message);
  }
  return response.json();
}

export async function fetchSessionMessages(sessionId) {
  if (!sessionId) throw new Error('missing session id');
  const response = await fetch(backendUrl(`/api/sessions/${encodeURIComponent(sessionId)}/messages`));
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = await response.json();
      message = data.error || data.detail || message;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}

export async function createSession(name) {
  const response = await fetch(backendUrl('/api/sessions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try { const data = await response.json(); message = data.error || message; } catch {}
    throw new Error(message);
  }
  return response.json();
}

export async function selectSession(sessionId) {
  if (!sessionId) throw new Error('missing session id');
  const response = await fetch(backendUrl(`/api/sessions/${encodeURIComponent(sessionId)}/select`), {
    method: 'POST',
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = await response.json();
      message = data.error || data.detail || message;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}

export async function createSessionMessage(sessionId, payload) {
  if (!sessionId) throw new Error('missing session id');
  const response = await fetch(backendUrl(`/api/sessions/${encodeURIComponent(sessionId)}/messages`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = await response.json();
      message = data.error || data.detail || message;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}

export function openEventsStream({ onEvent, onOpen, onError } = {}) {
  const since = Number(localStorage.getItem('openclaw.eventSeq') || 0) || 0;
  const es = new EventSource(backendUrl(`/api/events/stream?since=${encodeURIComponent(since)}`));
  es.onopen = () => {
    if (typeof onOpen === 'function') onOpen();
  };
  es.onerror = (error) => {
    if (typeof onError === 'function') onError(error);
  };
  es.onmessage = (event) => {
    if (!event?.data) return;
    try {
      const data = JSON.parse(event.data);
      if (event?.lastEventId) localStorage.setItem('openclaw.eventSeq', String(event.lastEventId));
      if (typeof onEvent === 'function') onEvent({ event: event.type || 'message', data });
    } catch {}
  };
  ['stream.ready', 'file.created', 'message.created'].forEach((eventName) => {
    es.addEventListener(eventName, (event) => {
      if (!event?.data) return;
      try {
        const data = JSON.parse(event.data);
        if (event?.lastEventId) localStorage.setItem('openclaw.eventSeq', String(event.lastEventId));
        if (typeof onEvent === 'function') onEvent({ event: eventName, data });
      } catch {}
    });
  });
  return es;
}

/**
 * Image attachment utilities for the chat composer.
 */
export function createAttachmentManager() {
  const attachments = [];

  /**
   * Add an image from a URL.
   * @param {string} url - Image URL
   * @returns {Object} Attachment object
   */
  function addImageUrl(url) {
    const att = { type: 'url', data: url, id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
    attachments.push(att);
    return att;
  }

  /**
   * Add an image from a base64 data URL.
   * @param {string} dataUrl - Data URL (data:image/xxx;base64,...)
   * @returns {Object} Attachment object
   */
  function addImageBase64(dataUrl) {
    // Extract media type and base64 data from data URL
    const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!match) throw new Error('Invalid image data URL');
    const att = { type: 'base64', data: match[2], mediaType: match[1], id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, preview: dataUrl };
    attachments.push(att);
    return att;
  }

  /**
   * Add an image from a File object.
   * @param {File} file - Image file
   * @returns {Promise<Object>} Attachment object
   */
  function addImageFile(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        reject(new Error('File is not an image'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const att = addImageBase64(reader.result);
          resolve(att);
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Remove an attachment by ID.
   * @param {string} id - Attachment ID
   */
  function removeAttachment(id) {
    const idx = attachments.findIndex((a) => a.id === id);
    if (idx !== -1) attachments.splice(idx, 1);
  }

  /**
   * Clear all attachments.
   */
  function clearAttachments() {
    attachments.length = 0;
  }

  /**
   * Get all attachments.
   * @returns {Array} Array of attachment objects
   */
  function getAttachments() {
    return [...attachments];
  }

  /**
   * Check if there are any attachments.
   * @returns {boolean}
   */
  function hasAttachments() {
    return attachments.length > 0;
  }

  /**
   * Get attachments in the format expected by the backend.
   * @returns {Array}
   */
  function toBackendFormat() {
    return attachments.map((att) => ({
      type: att.type,
      data: att.data,
      mediaType: att.mediaType,
    }));
  }

  return {
    addImageUrl,
    addImageBase64,
    addImageFile,
    removeAttachment,
    clearAttachments,
    getAttachments,
    hasAttachments,
    toBackendFormat,
  };
}
