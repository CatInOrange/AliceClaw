import { saveUiConfig } from './state.js';

const DEFAULT_CONFIG = {
  enabled: false,
  onlyPetMode: true,
  proactive: {
    enabled: false,
    intervalMin: 10,
    prompt: '你现在是桌宠陪伴模式。请结合最近对话，自然地主动搭话一句，不要太像闹钟提醒，也不要重复相同开场白。',
  },
  screenshot: {
    enabled: false,
    intervalMin: 30,
    prompt: '这是刚刚截到的用户屏幕。请根据画面内容自然地搭话，可以从画面的某个细节入手，或是结合最近的对话来引入，避免直接描述画面整体或开场白太生硬。同时，如果你觉得用户可能需要帮助，也可以主动提供一些实用建议。',
  },
  music: {
    allowAiActions: true,
    defaultUrl: '',
    volume: 0.35,
    loop: false,
  },
};

const HEARTBEAT_MS = 15 * 1000;

function cloneDefaultConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

function mergeConfig(raw = {}) {
  return {
    ...cloneDefaultConfig(),
    ...raw,
    proactive: { ...cloneDefaultConfig().proactive, ...(raw?.proactive || {}) },
    screenshot: { ...cloneDefaultConfig().screenshot, ...(raw?.screenshot || {}) },
    music: { ...cloneDefaultConfig().music, ...(raw?.music || {}) },
  };
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function dataUrlToAttachment(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid image data URL');
  return {
    type: 'base64',
    mediaType: match[1],
    data: match[2],
    preview: dataUrl,
    id: `auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
}

export function createAutomationController({ refs, uiConfig, ui, chat, desktopShell }) {
  const {
    desktopAutomationEnabledEl,
    desktopAutomationPetOnlyEl,
    desktopAutomationProactiveEnabledEl,
    desktopAutomationProactiveIntervalEl,
    desktopAutomationProactivePromptEl,
    desktopAutomationProactiveRunBtnEl,
    desktopAutomationScreenshotEnabledEl,
    desktopAutomationScreenshotIntervalEl,
    desktopAutomationScreenshotPromptEl,
    desktopAutomationScreenshotRunBtnEl,
    desktopAutomationMusicActionsEnabledEl,
    desktopAutomationMusicUrlEl,
    desktopAutomationMusicVolumeEl,
    desktopAutomationMusicLoopEl,
    desktopAutomationStopMusicBtnEl,
    desktopAutomationLogEl,
  } = refs;

  let config = mergeConfig(uiConfig.automation);
  let heartbeatTimer = null;
  let ruleState = {
    proactive: { lastRunAt: 0, running: false },
    screenshot: { lastRunAt: 0, running: false },
  };
  let logItems = [];
  let musicAudio = null;

  function isPetModeActive() {
    return desktopShell?.getState?.()?.mode === 'pet';
  }

  function persist() {
    uiConfig.automation = mergeConfig(config);
    saveUiConfig(uiConfig, refs);
  }

  function renderLogs() {
    if (!desktopAutomationLogEl) return;
    desktopAutomationLogEl.innerHTML = '';
    if (!logItems.length) {
      const empty = document.createElement('div');
      empty.className = 'desktop-automation-log-empty';
      empty.textContent = '还没有运行记录';
      desktopAutomationLogEl.appendChild(empty);
      return;
    }
    for (const item of logItems.slice().reverse()) {
      const row = document.createElement('div');
      row.className = 'desktop-automation-log-item';
      const time = document.createElement('span');
      time.className = 'desktop-automation-log-time';
      time.textContent = item.time;
      const text = document.createElement('span');
      text.className = 'desktop-automation-log-text';
      text.textContent = item.text;
      row.appendChild(time);
      row.appendChild(text);
      desktopAutomationLogEl.appendChild(row);
    }
  }

  function addLog(text, status = 'info') {
    const stamp = new Date();
    logItems.push({
      time: stamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      text: String(text || ''),
      status,
    });
    if (logItems.length > 24) logItems = logItems.slice(-24);
    renderLogs();
  }

  async function stopMusic() {
    if (!musicAudio) return;
    try {
      musicAudio.pause();
      musicAudio.currentTime = 0;
      musicAudio.src = '';
    } catch {}
    musicAudio = null;
    addLog('已停止自动化音乐');
  }

  async function playMusic({ url, volume, loop } = {}) {
    const nextUrl = String(url || config.music.defaultUrl || '').trim();
    if (!nextUrl) {
      addLog('AI 请求播放音乐，但未配置音乐 URL', 'warn');
      return;
    }
    try {
      if (musicAudio) {
        try { musicAudio.pause(); } catch {}
      }
      const audio = new Audio(nextUrl);
      audio.preload = 'auto';
      audio.volume = clampNumber(volume, 0, 1, config.music.volume);
      audio.loop = typeof loop === 'boolean' ? loop : !!config.music.loop;
      await audio.play();
      musicAudio = audio;
      addLog(`已播放音乐：${nextUrl}`);
    } catch (error) {
      addLog(`播放音乐失败：${error?.message || error}`, 'error');
      ui?.setStatus?.(`播放音乐失败：${error?.message || error}`, true);
    }
  }

  async function handleAiActions(actions = []) {
    if (!config.music.allowAiActions) return;
    for (const action of Array.isArray(actions) ? actions : []) {
      if (!action || typeof action !== 'object') continue;
      const type = String(action.type || '').trim();
      if (type === 'play_music') {
        await playMusic(action);
      } else if (type === 'stop_music') {
        await stopMusic();
      }
    }
  }

  function buildAutomationPrompt(kind, prompt) {
    // Automation and normal chat now share the same provider session,
    // so we intentionally do NOT inject recent chat logs here.
    // The per-turn JSON/output contract is injected in chat.js (TURN_INSTRUCTION).
    return String(prompt || '').trim();
  }

  async function runProactive(reason = 'scheduled') {
    if (ruleState.proactive.running || chat.isBusy?.()) return;
    ruleState.proactive.running = true;
    try {
      addLog(reason === 'manual' ? '手动触发：主动搭话' : '自动触发：主动搭话');
      const result = await chat.sendAutomationTurn({
        text: buildAutomationPrompt('proactive', config.proactive.prompt),
        sourceLabel: '自动化 · 主动搭话',
        note: '桌宠控制器触发了一次主动搭话。',
        structuredResponse: !!config.music.allowAiActions,
      });
      ruleState.proactive.lastRunAt = Date.now();
      await handleAiActions(result?.actions || []);
      addLog('主动搭话完成');
    } catch (error) {
      addLog(`主动搭话失败：${error?.message || error}`, 'error');
    } finally {
      ruleState.proactive.running = false;
    }
  }

  async function runScreenshot(reason = 'scheduled') {
    if (ruleState.screenshot.running || chat.isBusy?.()) return;
    ruleState.screenshot.running = true;
    try {
      addLog(reason === 'manual' ? '手动触发：截图观察' : '自动触发：截图观察');
      const dataUrl = await desktopShell?.capturePrimaryScreen?.();
      if (!dataUrl) throw new Error('当前环境不支持自动全屏截图');
      const result = await chat.sendAutomationTurn({
        text: buildAutomationPrompt('screenshot', config.screenshot.prompt),
        sourceLabel: '自动化 · 截图观察',
        note: '桌宠控制器捕获了一张屏幕截图并发送给 AI。',
        attachments: [dataUrlToAttachment(dataUrl)],
        structuredResponse: !!config.music.allowAiActions,
      });
      ruleState.screenshot.lastRunAt = Date.now();
      await handleAiActions(result?.actions || []);
      addLog('截图观察完成');
    } catch (error) {
      addLog(`截图观察失败：${error?.message || error}`, 'error');
    } finally {
      ruleState.screenshot.running = false;
    }
  }

  function shouldRunRule(ruleKey, enabled, intervalMin) {
    if (!config.enabled || !enabled) return false;
    if (config.onlyPetMode && !isPetModeActive()) return false;
    const state = ruleState[ruleKey];
    if (!state || state.running) return false;
    const intervalMs = clampNumber(intervalMin, 1, 24 * 60, ruleKey === 'proactive' ? 10 : 30) * 60 * 1000;
    return Date.now() - (state.lastRunAt || 0) >= intervalMs;
  }

  function heartbeat() {
    if (shouldRunRule('proactive', config.proactive.enabled, config.proactive.intervalMin)) {
      runProactive('scheduled');
      return;
    }
    if (shouldRunRule('screenshot', config.screenshot.enabled, config.screenshot.intervalMin)) {
      runScreenshot('scheduled');
    }
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = window.setInterval(heartbeat, HEARTBEAT_MS);
    window.setTimeout(heartbeat, 1200);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  function syncConfigFromInputs() {
    config.enabled = !!desktopAutomationEnabledEl?.checked;
    config.onlyPetMode = !!desktopAutomationPetOnlyEl?.checked;
    config.proactive.enabled = !!desktopAutomationProactiveEnabledEl?.checked;
    config.proactive.intervalMin = clampNumber(desktopAutomationProactiveIntervalEl?.value, 1, 24 * 60, 10);
    config.proactive.prompt = String(desktopAutomationProactivePromptEl?.value || DEFAULT_CONFIG.proactive.prompt).trim() || DEFAULT_CONFIG.proactive.prompt;
    config.screenshot.enabled = !!desktopAutomationScreenshotEnabledEl?.checked;
    config.screenshot.intervalMin = clampNumber(desktopAutomationScreenshotIntervalEl?.value, 1, 24 * 60, 30);
    config.screenshot.prompt = String(desktopAutomationScreenshotPromptEl?.value || DEFAULT_CONFIG.screenshot.prompt).trim() || DEFAULT_CONFIG.screenshot.prompt;
    config.music.allowAiActions = !!desktopAutomationMusicActionsEnabledEl?.checked;
    config.music.defaultUrl = String(desktopAutomationMusicUrlEl?.value || '').trim();
    config.music.volume = clampNumber(desktopAutomationMusicVolumeEl?.value, 0, 1, DEFAULT_CONFIG.music.volume);
    config.music.loop = !!desktopAutomationMusicLoopEl?.checked;
    persist();
  }

  function renderConfig() {
    if (desktopAutomationEnabledEl) desktopAutomationEnabledEl.checked = !!config.enabled;
    if (desktopAutomationPetOnlyEl) desktopAutomationPetOnlyEl.checked = !!config.onlyPetMode;
    if (desktopAutomationProactiveEnabledEl) desktopAutomationProactiveEnabledEl.checked = !!config.proactive.enabled;
    if (desktopAutomationProactiveIntervalEl) desktopAutomationProactiveIntervalEl.value = String(config.proactive.intervalMin);
    if (desktopAutomationProactivePromptEl) desktopAutomationProactivePromptEl.value = config.proactive.prompt;
    if (desktopAutomationScreenshotEnabledEl) desktopAutomationScreenshotEnabledEl.checked = !!config.screenshot.enabled;
    if (desktopAutomationScreenshotIntervalEl) desktopAutomationScreenshotIntervalEl.value = String(config.screenshot.intervalMin);
    if (desktopAutomationScreenshotPromptEl) desktopAutomationScreenshotPromptEl.value = config.screenshot.prompt;
    if (desktopAutomationMusicActionsEnabledEl) desktopAutomationMusicActionsEnabledEl.checked = !!config.music.allowAiActions;
    if (desktopAutomationMusicUrlEl) desktopAutomationMusicUrlEl.value = config.music.defaultUrl || '';
    if (desktopAutomationMusicVolumeEl) desktopAutomationMusicVolumeEl.value = String(config.music.volume ?? DEFAULT_CONFIG.music.volume);
    if (desktopAutomationMusicLoopEl) desktopAutomationMusicLoopEl.checked = !!config.music.loop;
    renderLogs();
  }

  function bindInput(el, eventName = 'change') {
    el?.addEventListener(eventName, syncConfigFromInputs);
  }

  function bind() {
    renderConfig();
    [
      desktopAutomationEnabledEl,
      desktopAutomationPetOnlyEl,
      desktopAutomationProactiveEnabledEl,
      desktopAutomationProactiveIntervalEl,
      desktopAutomationScreenshotEnabledEl,
      desktopAutomationScreenshotIntervalEl,
      desktopAutomationMusicActionsEnabledEl,
      desktopAutomationMusicUrlEl,
      desktopAutomationMusicVolumeEl,
      desktopAutomationMusicLoopEl,
    ].forEach((el) => bindInput(el, 'change'));
    [desktopAutomationProactivePromptEl, desktopAutomationScreenshotPromptEl].forEach((el) => bindInput(el, 'input'));
    desktopAutomationProactiveRunBtnEl?.addEventListener('click', () => runProactive('manual'));
    desktopAutomationScreenshotRunBtnEl?.addEventListener('click', () => runScreenshot('manual'));
    desktopAutomationStopMusicBtnEl?.addEventListener('click', () => stopMusic());
    startHeartbeat();
  }

  return {
    bind,
    stopMusic,
    playMusic,
  };
}
