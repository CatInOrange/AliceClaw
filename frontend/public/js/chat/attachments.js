import { absolutizeBackendAssetUrl } from '../backend-url.js';

function kindFromMime(mimeType) {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

export function stripStageDirectives(text) {
  return String(text || '').replace(/\[(?:expr|expression|motion|act|exp):[^\]]+\]/gi, '').trim();
}

export function resolveAttachmentUrl(attachment, mimeType) {
  if (!attachment) return '';
  return attachment.url
    ? absolutizeBackendAssetUrl(attachment.url)
    : attachment.preview
      ? attachment.preview
      : attachment.data
        ? (String(attachment.data).startsWith('data:')
          ? attachment.data
          : `data:${mimeType || 'application/octet-stream'};base64,${attachment.data}`)
        : '';
}

export function appendAttachmentToBubble(bubbleEl, attachment) {
  if (!bubbleEl || !attachment) return;
  const mimeType = attachment.mimeType || attachment.media_type || attachment.mediaType || 'application/octet-stream';
  const kind = attachment.kind || kindFromMime(mimeType);
  const url = resolveAttachmentUrl(attachment, mimeType);
  if (!url) return;

  if (kind === 'image') {
    const imgEl = document.createElement('img');
    imgEl.src = url;
    imgEl.alt = attachment.filename || 'image';
    imgEl.style.maxWidth = '100%';
    imgEl.style.borderRadius = '8px';
    imgEl.style.marginTop = '8px';
    imgEl.style.display = 'block';
    bubbleEl.appendChild(imgEl);
    return;
  }

  if (kind === 'audio') {
    const audioEl = new Audio(url);
    audioEl.preload = 'metadata';
    audioEl.loop = false;
    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.textContent = '▶';
    playBtn.setAttribute('aria-label', '播放音频');
    playBtn.title = '播放/暂停';
    playBtn.style.marginTop = '8px';
    playBtn.style.width = '14px';
    playBtn.style.height = '14px';
    playBtn.style.padding = '0';
    playBtn.style.borderRadius = '999px';
    playBtn.style.border = 'none';
    playBtn.style.background = 'transparent';
    playBtn.style.color = 'rgba(255,255,255,0.9)';
    playBtn.style.fontSize = '10px';
    playBtn.style.lineHeight = '1';
    playBtn.style.opacity = '0.88';
    playBtn.style.cursor = 'pointer';
    playBtn.style.display = 'inline-flex';
    playBtn.style.alignItems = 'center';
    playBtn.style.justifyContent = 'center';

    const setPaused = () => { playBtn.textContent = '▶'; };
    const setPlaying = () => { playBtn.textContent = '⏸'; };

    audioEl.addEventListener('play', setPlaying);
    audioEl.addEventListener('pause', setPaused);
    audioEl.addEventListener('ended', () => {
      audioEl.currentTime = 0;
      setPaused();
    });

    playBtn.addEventListener('click', async () => {
      try {
        if (audioEl.paused) await audioEl.play();
        else audioEl.pause();
      } catch { }
    });
    bubbleEl.appendChild(playBtn);
    return;
  }

  if (kind === 'video') {
    const videoEl = document.createElement('video');
    videoEl.src = url;
    videoEl.controls = true;
    videoEl.style.width = '100%';
    videoEl.style.maxHeight = '320px';
    videoEl.style.borderRadius = '8px';
    videoEl.style.marginTop = '8px';
    bubbleEl.appendChild(videoEl);
    return;
  }

  const linkEl = document.createElement('a');
  linkEl.href = url;
  linkEl.textContent = attachment.filename || '下载文件';
  linkEl.target = '_blank';
  linkEl.rel = 'noopener noreferrer';
  linkEl.style.display = 'inline-block';
  linkEl.style.marginTop = '8px';
  bubbleEl.appendChild(linkEl);
}

export function findFirstAudioAttachmentUrl(message) {
  for (const attachment of message?.attachments || []) {
    const mimeType = attachment?.mimeType || attachment?.media_type || attachment?.mediaType || 'application/octet-stream';
    const kind = attachment?.kind || kindFromMime(mimeType);
    if (String(kind) !== 'audio' && !String(mimeType).startsWith('audio/')) continue;
    const url = resolveAttachmentUrl(attachment, mimeType);
    if (url) return url;
  }
  return '';
}
