/**
 * Chat composer attachment handling (image uploads, paste, drag-drop, Tauri drop events)
 * and preview rendering.
 *
 * This module is UI-only and operates via injected DOM refs + an injected
 * attachmentManager from `api.js`.
 */

/**
 * @typedef {Object} ComposerAttachmentsDeps
 * @property {any} attachmentManager
 * @property {HTMLElement|null} attachmentPreviewEl
 * @property {HTMLElement|null} desktopAttachmentPreviewEl
 * @property {HTMLInputElement|null} imageUploadInputEl
 * @property {HTMLInputElement|null} desktopImageUploadInputEl
 * @property {HTMLElement|null} dragOverlayEl
 * @property {HTMLElement|null} chatPanelEl
 * @property {HTMLElement|null} desktopPetPanelEl
 * @property {HTMLElement|null} desktopPetDockEl
 * @property {HTMLInputElement|HTMLTextAreaElement|null} chatInputEl
 * @property {HTMLInputElement|HTMLTextAreaElement|null} desktopChatInputEl
 */

/**
 * @param {ComposerAttachmentsDeps} deps
 */
export function createComposerAttachments(deps) {
  const {
    attachmentManager,
    attachmentPreviewEl,
    desktopAttachmentPreviewEl,
    imageUploadInputEl,
    desktopImageUploadInputEl,
    dragOverlayEl,
    chatPanelEl,
    desktopPetPanelEl,
    desktopPetDockEl,
    chatInputEl,
    desktopChatInputEl,
  } = deps || {};

  /**
   * Render attachment preview UI.
   */
  function renderAttachmentPreview() {
    const containers = [attachmentPreviewEl, desktopAttachmentPreviewEl].filter(Boolean);
    if (!containers.length) return;
    const attachments = attachmentManager.getAttachments();
    for (const container of containers) {
      container.innerHTML = '';
      for (const att of attachments) {
        const item = document.createElement('div');
        item.className = 'attachment-item';
        item.dataset.id = att.id;

        const img = document.createElement('img');
        if (att.preview) {
          img.src = att.preview;
        } else if (att.type === 'url') {
          img.src = att.data;
        } else if (att.type === 'base64') {
          img.src = `data:${att.mediaType || 'image/png'};base64,${att.data}`;
        }

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = '×';
        removeBtn.type = 'button';
        removeBtn.addEventListener('click', () => {
          attachmentManager.removeAttachment(att.id);
          renderAttachmentPreview();
        });

        item.appendChild(img);
        item.appendChild(removeBtn);
        container.appendChild(item);
      }
    }
  }

  /**
   * Handle file selection via input.
   * @param {Event} event
   */
  async function handleFileSelect(event) {
    const files = event.target?.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      try {
        await attachmentManager.addImageFile(file);
      } catch (e) {
        console.warn('Failed to add image:', e);
      }
    }
    renderAttachmentPreview();
    if (event.target) event.target.value = '';
  }

  /**
   * Handle file drop.
   * @param {DragEvent} event
   */
  async function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    if (dragOverlayEl) dragOverlayEl.classList.remove('active');

    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;

    let added = 0;
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      try {
        await attachmentManager.addImageFile(file);
        added++;
      } catch (e) {
        console.warn('Failed to add image:', e);
      }
    }
    if (added > 0) renderAttachmentPreview();
  }

  /**
   * API for external image sources (camera, screenshot).
   * @param {string} dataUrl - Base64 data URL
   */
  function addImageFromDataUrl(dataUrl) {
    try {
      attachmentManager.addImageBase64(dataUrl);
      renderAttachmentPreview();
    } catch (e) {
      console.warn('Failed to add image from data URL:', e);
    }
  }

  /**
   * API for external image URLs.
   * @param {string} url - Image URL
   */
  function addImageFromUrl(url) {
    attachmentManager.addImageUrl(url);
    renderAttachmentPreview();
  }

  /**
   * Set up attachment handlers.
   */
  function setupAttachmentHandlers() {
    imageUploadInputEl?.addEventListener('change', handleFileSelect);
    desktopImageUploadInputEl?.addEventListener('change', handleFileSelect);

    // Tauri native drag-drop events (for pet mode where web drag events may be blocked)
    const tauriListen = window.__TAURI__?.event?.listen;
    if (tauriListen) {
      tauriListen('openclaw://dropped-image-hover', (event) => {
        const isHovering = !!event.payload;
        if (dragOverlayEl) dragOverlayEl.classList.toggle('active', isHovering);
      });
      tauriListen('openclaw://dropped-image', async (event) => {
        const payload = event.payload;
        if (!payload) return;
        // payload can be a single object or array
        const items = Array.isArray(payload) ? payload : [payload];
        let added = 0;
        for (const item of items) {
          if (!item.data_url) continue;
          try {
            attachmentManager.addImageBase64(item.data_url);
            added++;
          } catch (e) {
            console.warn('Failed to add dropped image:', e);
          }
        }
        if (added > 0) renderAttachmentPreview();
        if (dragOverlayEl) dragOverlayEl.classList.remove('active');
      });
    }

    const bindPasteHandler = (inputEl) => {
      inputEl?.addEventListener('paste', async (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              try {
                await attachmentManager.addImageFile(file);
                renderAttachmentPreview();
              } catch (err) {
                console.warn('Failed to add pasted image:', err);
              }
            }
          }
        }
      });
    };

    bindPasteHandler(chatInputEl);
    bindPasteHandler(desktopChatInputEl);

    const dropTargets = [chatPanelEl, desktopPetPanelEl, desktopPetDockEl].filter(Boolean);
    for (const dropTarget of dropTargets) {
      dropTarget.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (dragOverlayEl) dragOverlayEl.classList.add('active');
      });

      dropTarget.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      dropTarget.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.relatedTarget && !dropTarget.contains(e.relatedTarget)) {
          if (dragOverlayEl) dragOverlayEl.classList.remove('active');
        }
      });

      dropTarget.addEventListener('drop', handleDrop);
    }
  }

  return {
    renderAttachmentPreview,
    setupAttachmentHandlers,
    addImageFromDataUrl,
    addImageFromUrl,
  };
}
