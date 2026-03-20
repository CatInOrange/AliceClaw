/**
 * Sessions panel binder.
 *
 * Encapsulates:
 * - fetching sessions and rendering the list
 * - opening/closing the panel
 * - create session + load session
 *
 * Does not own message rendering; callers provide callbacks.
 */

/**
 * @param {{
 *   refs: any,
 *   ui: any,
 *   fetchSessions: Function,
 *   fetchSessionMessages: Function,
 *   createSession: Function,
 *   selectSession: Function,
 *   getCurrentSessionId: Function,
 *   setCurrentSessionId: Function,
 *   renderRealtimeMessage: Function,
 *   scrollMessagesToBottomRaf: Function,
 *   seenRealtimeMessageIds: Set<any>,
 *   conversationState: { recentConversationEntries: any[] },
 *   messagesEl?: HTMLElement|null,
 *   desktopMessagesEl?: HTMLElement|null,
 * }} opts
 */
export function createSessionsPanel(opts) {
  const {
    refs,
    ui,
    fetchSessions,
    fetchSessionMessages,
    createSession,
    selectSession,
    getCurrentSessionId,
    setCurrentSessionId,
    renderRealtimeMessage,
    scrollMessagesToBottomRaf,
    seenRealtimeMessageIds,
    conversationState,
    messagesEl,
    desktopMessagesEl,
  } = opts;

  const {
    btnSessionsEl,
    sessionsPanelEl,
    sessionsPanelCloseEl,
    sessionsListEl,
    desktopNewSessionBtnEl,
  } = refs;

  function openSessionsPanel() {
    sessionsPanelEl?.classList.add('open');
  }

  function closeSessionsPanel() {
    sessionsPanelEl?.classList.remove('open');
  }

  function createSessionInfo(name, time = '') {
    const infoEl = document.createElement('div');
    infoEl.className = 'session-item-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'session-item-name';
    nameEl.textContent = name || '未命名会话';
    infoEl.appendChild(nameEl);

    if (time) {
      const timeEl = document.createElement('div');
      timeEl.className = 'session-item-time';
      timeEl.textContent = time;
      infoEl.appendChild(timeEl);
    }

    return infoEl;
  }

  function buildNewSessionItem() {
    const item = document.createElement('div');
    item.className = 'session-item';
    item.appendChild(createSessionInfo('新建会话'));

    const badgeEl = document.createElement('span');
    badgeEl.className = 'session-item-new';
    badgeEl.textContent = '+ 新建';
    item.appendChild(badgeEl);
    item.addEventListener('click', () => createNewSession());
    return item;
  }

  function buildSessionItem(session, currentId) {
    const item = document.createElement('div');
    item.className = `session-item${session.id === currentId ? ' active' : ''}`;
    const time = session.updatedAt
      ? new Date(session.updatedAt * 1000).toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
      : '';
    item.appendChild(createSessionInfo(session.name, time));
    item.addEventListener('click', () => {
      loadSession(session.id);
      closeSessionsPanel();
    });
    return item;
  }

  async function loadSession(sessionId) {
    try {
      setCurrentSessionId?.(sessionId);
      await selectSession?.(sessionId);
      const history = await fetchSessionMessages(sessionId);
      if (messagesEl) messagesEl.innerHTML = '';
      if (desktopMessagesEl) desktopMessagesEl.innerHTML = '';
      seenRealtimeMessageIds.clear();
      conversationState.recentConversationEntries = [];
      for (const message of history.messages || []) {
        renderRealtimeMessage(message);
      }
      scrollMessagesToBottomRaf();
    } catch (e) {
      ui.setStatus(`加载会话失败：${e?.message || e}`, true);
    }
  }

  async function refreshSessionsUi() {
    const { sessionsSelectEl } = refs;
    try {
      const data = await fetchSessions();
      const sessions = data.sessions || [];
      const currentId = getCurrentSessionId?.() || data.currentId;
      if (currentId) setCurrentSessionId?.(currentId);

      // Update settings dropdown (legacy)
      if (sessionsSelectEl) {
        sessionsSelectEl.innerHTML = '';
        for (const session of sessions) {
          const opt = document.createElement('option');
          opt.value = session.id;
          opt.textContent = session.name || session.id;
          if (session.id === currentId) opt.selected = true;
          sessionsSelectEl.appendChild(opt);
        }
      }

      // Update sessions panel list (web/window mode)
      if (sessionsListEl) {
        sessionsListEl.innerHTML = '';
        sessionsListEl.appendChild(buildNewSessionItem());

        // Add existing sessions
        for (const session of sessions.slice().reverse()) {
          sessionsListEl.appendChild(buildSessionItem(session, currentId));
        }
      }
    } catch (e) {
      console.warn('Failed to load sessions:', e);
    }
  }

  async function createNewSession() {
    try {
      const created = await createSession();
      await refreshSessionsUi();
      if (created?.session?.id) {
        setCurrentSessionId?.(created.session.id);
        await loadSession(created.session.id);
      }
      closeSessionsPanel();
      // Close the desktop plus menu if open
      refs.desktopPlusMenuEl?.classList.remove('open');
    } catch (e) {
      ui.setStatus(`新建会话失败：${e?.message || e}`, true);
    }
  }

  function bind() {
    // Sessions panel (web/window mode)
    btnSessionsEl?.addEventListener('click', () => {
      if (sessionsPanelEl?.classList.contains('open')) {
        closeSessionsPanel();
      } else {
        openSessionsPanel();
        refreshSessionsUi();
      }
    });
    sessionsPanelCloseEl?.addEventListener('click', closeSessionsPanel);

    // Desktop new session button (in + menu)
    desktopNewSessionBtnEl?.addEventListener('click', () => {
      createNewSession();
    });

    // Sessions UI (web/window)
    refs.sessionsNewBtnEl?.addEventListener('click', async () => {
      try {
        const created = await createSession();
        await refreshSessionsUi();
        if (created?.session?.id) await loadSession(created.session.id);
      } catch (e) {
        ui.setStatus(`新建会话失败：${e?.message || e}`, true);
      }
    });

    refs.sessionsSelectEl?.addEventListener('change', async (e) => {
      const sessionId = e.target.value;
      if (sessionId) await loadSession(sessionId);
    });
  }

  return {
    bind,
    refreshSessionsUi,
    loadSession,
    createNewSession,
    openSessionsPanel,
    closeSessionsPanel,
    isOpen: () => !!sessionsPanelEl?.classList.contains('open'),
  };
}
