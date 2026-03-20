export function getDomRefs() {
  return {
    // Header
    statusEl: document.getElementById('status'),
    desktopStatusEl: document.getElementById('desktop-status-pill'),

    // Stage
    canvas: document.getElementById('stage'),
    stageWrapEl: document.getElementById('stage-wrap'),
    chatPanelEl: document.getElementById('chat-panel'),
    dragOverlayEl: document.getElementById('drag-overlay'),

    // Desktop Shell / Pet UI
    desktopShellEl: document.getElementById('desktop-shell'),
    desktopToggleModeBtnEl: document.getElementById('desktop-toggle-mode'),
    desktopToggleChatBtnEl: document.getElementById('desktop-toggle-chat'),
    desktopVoiceBtnEl: document.getElementById('desktop-voice-btn'),
    desktopPinBtnEl: document.getElementById('desktop-pin-btn'),
    desktopDragBtnEl: document.getElementById('desktop-drag-btn'),
    desktopSettingsBtnEl: document.getElementById('desktop-settings-btn'),
    desktopContextMenuEl: document.getElementById('desktop-context-menu'),
    desktopContextMenuItemsEl: document.getElementById('desktop-context-menu-items'),
    desktopPetUiEl: document.getElementById('desktop-pet-ui'),
    desktopPetAnchorEl: document.getElementById('desktop-pet-anchor'),
    desktopPetOrbEl: document.getElementById('desktop-pet-orb'),
    desktopPetSettingsEl: document.getElementById('desktop-pet-settings'),
    desktopPetSettingsCloseBtnEl: document.getElementById('desktop-pet-settings-close'),
    desktopPetPinToggleBtnEl: document.getElementById('desktop-pet-pin-toggle'),
    desktopCopyDebugBtnEl: document.getElementById('desktop-copy-debug-btn'),
    desktopAutoHideSecondsInputEl: document.getElementById('desktop-auto-hide-seconds-input'),
    desktopPetPanelEl: document.getElementById('desktop-pet-panel'),
    desktopPetDockEl: document.getElementById('desktop-pet-dock'),
    desktopPlusBtnEl: document.getElementById('desktop-plus-btn'),
    desktopPlusMenuEl: document.getElementById('desktop-plus-menu'),
    desktopPlusExpressionsBtnEl: document.getElementById('desktop-plus-expressions-btn'),
    desktopPlusCameraBtnEl: document.getElementById('desktop-plus-camera-btn'),
    desktopPlusScreenshotBtnEl: document.getElementById('desktop-plus-screenshot-btn'),
    desktopTogglePanelBtnEl: document.getElementById('desktop-toggle-panel-btn'),
    desktopToggleHideBtnEl: document.getElementById('desktop-toggle-hide-btn'),
    desktopOpenSettingsBtnEl: document.getElementById('desktop-open-settings-btn'),
    desktopToggleExpandBtnEl: document.getElementById('desktop-toggle-expand-btn'),
    desktopSwitchWindowBtnEl: document.getElementById('desktop-switch-window-btn'),
    desktopModelSelectEl: document.getElementById('desktop-model-select'),
    desktopQuickActionsEl: document.getElementById('desktop-quick-actions'),
    desktopMessagesEl: document.getElementById('desktop-messages'),
    desktopChatInputEl: document.getElementById('desktop-chat-input'),
    desktopSendBtnEl: document.getElementById('desktop-send-btn'),
    desktopImageUploadInputEl: document.getElementById('desktop-image-upload-input'),
    desktopAttachmentPreviewEl: document.getElementById('desktop-attachment-preview'),
    desktopCameraPreviewContainerEl: document.getElementById('desktop-camera-preview-container'),
    desktopCameraVideoEl: document.getElementById('desktop-camera-video'),
    desktopCameraCanvasEl: document.getElementById('desktop-camera-canvas'),
    desktopCameraCloseBtnEl: document.getElementById('desktop-camera-close-btn'),
    desktopCameraCaptureBtnEl: document.getElementById('desktop-camera-capture-btn'),
    desktopScreenshotOverlayEl: document.getElementById('desktop-screenshot-overlay'),
    desktopScreenshotSelectionEl: document.getElementById('desktop-screenshot-selection'),
    desktopScreenshotDimEl: document.getElementById('desktop-screenshot-dim'),
    backendBaseUrlInputEl: document.getElementById('backend-base-url-input'),
    desktopModeSelectEl: document.getElementById('desktop-mode-select'),
    desktopAlwaysOnTopInputEl: document.getElementById('desktop-always-on-top-input'),
    desktopAutomationEnabledEl: document.getElementById('desktop-automation-enabled'),
    desktopAutomationPetOnlyEl: document.getElementById('desktop-automation-pet-only'),
    desktopAutomationProactiveEnabledEl: document.getElementById('desktop-automation-proactive-enabled'),
    desktopAutomationProactiveIntervalEl: document.getElementById('desktop-automation-proactive-interval'),
    desktopAutomationProactivePromptEl: document.getElementById('desktop-automation-proactive-prompt'),
    desktopAutomationProactiveRunBtnEl: document.getElementById('desktop-automation-proactive-run-btn'),
    desktopAutomationScreenshotEnabledEl: document.getElementById('desktop-automation-screenshot-enabled'),
    desktopAutomationScreenshotIntervalEl: document.getElementById('desktop-automation-screenshot-interval'),
    desktopAutomationScreenshotPromptEl: document.getElementById('desktop-automation-screenshot-prompt'),
    desktopAutomationScreenshotRunBtnEl: document.getElementById('desktop-automation-screenshot-run-btn'),
    desktopAutomationMusicActionsEnabledEl: document.getElementById('desktop-automation-music-actions-enabled'),
    desktopAutomationMusicUrlEl: document.getElementById('desktop-automation-music-url'),
    desktopAutomationMusicVolumeEl: document.getElementById('desktop-automation-music-volume'),
    desktopAutomationMusicLoopEl: document.getElementById('desktop-automation-music-loop'),
    desktopAutomationStopMusicBtnEl: document.getElementById('desktop-automation-stop-music-btn'),
    desktopAutomationLogEl: document.getElementById('desktop-automation-log'),

    // Quick Actions
    quickActionsEl: document.getElementById('quick-actions'),
    toggleExpressionsBtn: document.getElementById('toggle-expressions'),
    expressionsPanelEl: document.getElementById('expressions-panel'),
    desktopToggleExpressionsBtn: document.getElementById('desktop-toggle-expressions'),
    desktopExpressionsPanelEl: document.getElementById('desktop-expressions-panel'),

    // Chat Panel
    chatHeaderEl: document.getElementById('chat-header'),
    windowCloseBtnEl: document.getElementById('window-close-btn'),
    messagesEl: document.getElementById('messages'),
    chatInputEl: document.getElementById('chat-input'),
    sendBtnEl: document.getElementById('send-btn'),

    // Chat Toolbar
    imageUploadInputEl: document.getElementById('image-upload-input'),
    cameraBtnEl: document.getElementById('camera-btn'),

    // Camera
    cameraPreviewContainerEl: document.getElementById('camera-preview-container'),
    cameraVideoEl: document.getElementById('camera-video'),
    cameraCanvasEl: document.getElementById('camera-canvas'),
    cameraCloseBtnEl: document.getElementById('camera-close-btn'),

    // Attachments
    attachmentPreviewEl: document.getElementById('attachment-preview'),

    // Settings Menu
    settingsMenuEl: document.getElementById('settings-menu'),
    settingsOverlayEl: document.getElementById('settings-overlay'),
    btnSettingsEl: document.getElementById('btn-settings'),
    settingsCloseBtn: document.getElementById('settings-close'),
    settingsModelSelectEl: document.getElementById('settings-model-select'),
    sessionsSelectEl: document.getElementById('sessions-select'),
    sessionsNewBtnEl: document.getElementById('sessions-new-btn'),

    // Sessions Panel (web/window mode)
    btnSessionsEl: document.getElementById('btn-sessions'),
    sessionsPanelEl: document.getElementById('sessions-panel'),
    sessionsPanelCloseEl: document.getElementById('sessions-panel-close'),
    sessionsListEl: document.getElementById('sessions-list'),
    desktopNewSessionBtnEl: document.getElementById('desktop-new-session-btn'),

    // Provider Config
    providerSelectEl: document.getElementById('provider-select'),
    providerFieldsEl: document.getElementById('provider-fields'),

    // TTS
    ttsEnabledInputEl: document.getElementById('tts-enabled-input'),
    ttsProviderSelectEl: document.getElementById('tts-provider-select'),
    pushTtsProviderSelectEl: document.getElementById('push-tts-provider-select'),

    // Appearance
    toggleAppearanceBtn: document.getElementById('toggle-appearance'),
    appearanceConfigEl: document.getElementById('appearance-config'),
    controls: {
      scale: document.getElementById('scale-range'),
      offsetX: document.getElementById('x-range'),
      offsetY: document.getElementById('y-range'),
      scaleValue: document.getElementById('scale-value'),
      xValue: document.getElementById('x-value'),
      yValue: document.getElementById('y-value'),
      resetBtn: document.getElementById('btn-reset-layout'),
    },
    bgImageInputEl: document.getElementById('bg-image-input'),

    // Debug/Expressions Panel
    debugMotionsEl: document.getElementById('debug-motions'),
    debugExpressionsEl: document.getElementById('debug-expressions'),
    desktopDebugMotionsEl: document.getElementById('desktop-debug-motions'),
    desktopDebugExpressionsEl: document.getElementById('desktop-debug-expressions'),
  };
}
