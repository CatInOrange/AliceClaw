export function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

export function createUiController(refs) {
  const {
    statusEl,
    desktopStatusEl,
    messagesEl,
    desktopMessagesEl,
    settingsModelSelectEl,
    desktopModelSelectEl,
    quickActionsEl,
    desktopQuickActionsEl,
    debugMotionsEl,
    debugExpressionsEl,
    desktopDebugMotionsEl,
    desktopDebugExpressionsEl,
    providerSelectEl,
    expressionsPanelEl,
    toggleExpressionsBtn,
    desktopExpressionsPanelEl,
  } = refs;

  let expressionsExpanded = false;

  function setStatus(text, isError = false) {
    const nextText = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (statusEl) {
      statusEl.textContent = nextText;
      statusEl.classList.toggle('error', !!isError);
    }
    if (desktopStatusEl) {
      desktopStatusEl.textContent = nextText;
      desktopStatusEl.title = nextText;
      desktopStatusEl.classList.toggle('error', !!isError);
    }
  }

  function createMessageNode(role, text, meta = '') {
    const item = document.createElement('div');
    item.className = `message ${role}`;
    const metaEl = document.createElement('div');
    metaEl.className = 'meta';
    metaEl.textContent = meta || (role === 'user' ? '你' : 'Live2D');
    const bubbleEl = document.createElement('div');
    bubbleEl.className = 'bubble';
    bubbleEl.textContent = text;
    if (role !== 'system') item.appendChild(metaEl);
    item.appendChild(bubbleEl);
    return { item, metaEl, bubbleEl };
  }

  function addMessage(role, text, meta = '') {
    const primary = createMessageNode(role, text, meta);
    let mirror = null;
    if (messagesEl) {
      messagesEl.appendChild(primary.item);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
    if (desktopMessagesEl) {
      mirror = createMessageNode(role, text, meta);
      desktopMessagesEl.appendChild(mirror.item);
      desktopMessagesEl.scrollTop = desktopMessagesEl.scrollHeight;
    }
    return {
      ...primary,
      mirrorItemEl: mirror?.item || null,
      mirrorMetaEl: mirror?.metaEl || null,
      mirrorBubbleEl: mirror?.bubbleEl || null,
    };
  }

  function chooseReactionForReply(text) {
    const lower = text.toLowerCase();
    if (/开心|喜欢|好耶|太棒|可爱|love/.test(text) || /(great|awesome|love)/.test(lower)) return { expression: 'Star', motion: null };
    if (/害羞|不好意思|脸红/.test(text)) return { expression: 'Shy', motion: null };
    return { expression: null, motion: null };
  }

  function fillSelect(selectEl, items, selectedValue) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    for (const item of items || []) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name;
      if (item.id === selectedValue) option.selected = true;
      selectEl.appendChild(option);
    }
    selectEl.value = selectedValue || '';
  }

  function renderModelSelector(appMeta, uiConfig) {
    const selectedValue = appMeta?.selectedModelId || uiConfig.modelId || '';
    fillSelect(settingsModelSelectEl, appMeta?.models || [], selectedValue);
    fillSelect(desktopModelSelectEl, appMeta?.models || [], selectedValue);
  }

  function renderProviderSelector(modelMeta, selectedProviderId) {
    if (!providerSelectEl) return;
    providerSelectEl.innerHTML = '';
    for (const item of modelMeta?.chat?.providers || []) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name;
      if (item.id === selectedProviderId) option.selected = true;
      providerSelectEl.appendChild(option);
    }
  }

  function updateProviderUI(provider) {
    const providerFields = document.getElementById('provider-fields');
    if (providerFields) providerFields.dataset.providerType = provider?.type || '';
  }

  function renderTtsProviderSelector(modelMeta, selectedProviderId, onChange) {
    const ttsProviders = modelMeta?.chat?.tts?.providers || [];
    if (!ttsProviders.length) return;
    const selectEl = document.getElementById('tts-provider-select');
    if (!selectEl) return;
    selectEl.innerHTML = '';
    for (const item of ttsProviders) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name;
      selectEl.appendChild(option);
    }
    selectEl.value = selectedProviderId || (ttsProviders[0]?.id || '');
    if (typeof onChange === 'function') {
      selectEl.addEventListener('change', (e) => onChange(e.target.value));
    }
  }

  function renderPushTtsProviderSelector(modelMeta, selectedProviderId, onChange) {
    const ttsProviders = modelMeta?.chat?.tts?.providers || [];
    if (!ttsProviders.length) return;
    const selectEl = document.getElementById('push-tts-provider-select');
    if (!selectEl) return;
    selectEl.innerHTML = '';
    for (const item of ttsProviders) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name;
      selectEl.appendChild(option);
    }
    selectEl.value = selectedProviderId || (ttsProviders[0]?.id || '');
    if (typeof onChange === 'function') {
      selectEl.addEventListener('change', (e) => onChange(e.target.value));
    }
  }

  function renderQuickActionsInto(container, modelMeta, triggerMotion, triggerExpression) {
    if (!container) return;
    container.innerHTML = '';
    for (const item of modelMeta?.quickActions || []) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = item.label;
      btn.addEventListener('click', () => {
        if (item.type === 'motion' && triggerMotion) triggerMotion(item.group, item.index, item.label);
        else if (item.type === 'expression' && triggerExpression) triggerExpression(item.name);
      });
      container.appendChild(btn);
    }
  }

  function renderQuickActions(modelMeta, triggerMotion, triggerExpression) {
    renderQuickActionsInto(quickActionsEl, modelMeta, triggerMotion, triggerExpression);
    renderQuickActionsInto(desktopQuickActionsEl, modelMeta, triggerMotion, triggerExpression);
  }

  function renderDebugPanel(modelMeta, triggerMotion, triggerExpression) {
    const motionTargets = [debugMotionsEl, desktopDebugMotionsEl].filter(Boolean);
    const expressionTargets = [debugExpressionsEl, desktopDebugExpressionsEl].filter(Boolean);
    if (!motionTargets.length || !expressionTargets.length) return;
    motionTargets.forEach((el) => { el.innerHTML = ''; });
    expressionTargets.forEach((el) => { el.innerHTML = ''; });
    if (!modelMeta) return;

    const renderMotionInto = (container) => {
      for (const item of modelMeta.motions || []) {
        const btn = document.createElement('button');
        btn.type = 'button';
        const label = item.label || `${item.group}[${item.index}]`;
        btn.textContent = label;
        btn.addEventListener('click', () => triggerMotion?.(item.group, item.index, label));
        container.appendChild(btn);
      }
    };

    const renderExpressionInto = (container) => {
      for (const item of modelMeta.expressions || []) {
        const btn = document.createElement('button');
        btn.type = 'button';
        const expressionName = typeof item === 'object' ? (item.name || item.id || JSON.stringify(item)) : item;
        const displayLabel = typeof item === 'object' ? (item.label || item.name || item.id) : item;
        btn.textContent = displayLabel;
        btn.addEventListener('click', () => triggerExpression?.(expressionName));
        container.appendChild(btn);
      }
    };

    motionTargets.forEach(renderMotionInto);
    expressionTargets.forEach(renderExpressionInto);
  }

  function toggleExpressionsPanel() {
    expressionsExpanded = !expressionsExpanded;
    if (expressionsPanelEl) expressionsPanelEl.classList.toggle('expanded', expressionsExpanded);
    if (toggleExpressionsBtn) toggleExpressionsBtn.textContent = expressionsExpanded ? '收起' : '展开全部';
    if (quickActionsEl) quickActionsEl.classList.toggle('expanded', expressionsExpanded);
  }

  return {
    setStatus,
    addMessage,
    chooseReactionForReply,
    renderModelSelector,
    renderProviderSelector,
    updateProviderUI,
    renderTtsProviderSelector,
    renderPushTtsProviderSelector,
    renderQuickActions,
    renderDebugPanel,
    toggleExpressionsPanel,
  };
}
