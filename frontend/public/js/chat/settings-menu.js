/**
 * Settings menu binder.
 */

/**
 * @param {{
 *   settingsMenuEl?: HTMLElement|null,
 *   settingsOverlayEl?: HTMLElement|null,
 *   btnSettingsEl?: HTMLElement|null,
 *   settingsCloseBtn?: HTMLElement|null,
 *   document?: Document,
 *   onEscape?: () => void,
 * }} opts
 */
export function createSettingsMenu(opts = {}) {
  const {
    settingsMenuEl,
    settingsOverlayEl,
    btnSettingsEl,
    settingsCloseBtn,
    document: doc = document,
    onEscape,
  } = opts;

  function openSettings() {
    settingsMenuEl?.classList.add('expanded');
    settingsOverlayEl?.classList.add('expanded');
  }

  function closeSettings() {
    settingsMenuEl?.classList.remove('expanded');
    settingsOverlayEl?.classList.remove('expanded');
  }

  function isOpen() {
    return !!settingsMenuEl?.classList.contains('expanded');
  }

  function bind() {
    btnSettingsEl?.addEventListener('click', openSettings);

    settingsCloseBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeSettings();
    });

    settingsOverlayEl?.addEventListener('click', closeSettings);

    // Close on Escape key
    doc.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (typeof onEscape === 'function') onEscape();
        closeSettings();
      }
    });
  }

  return {
    bind,
    openSettings,
    closeSettings,
    isOpen,
  };
}
