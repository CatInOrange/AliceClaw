import {
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  FiLayers,
  FiMessageCircle,
  FiPlus,
  FiRefreshCcw,
  FiSettings,
} from "react-icons/fi";
import {
  LuCamera,
  LuImage,
  LuMessageSquarePlus,
  LuSmile,
  LuUpload,
} from "react-icons/lu";
import { selectCurrentSessionMessages } from "@/runtime/app-store-selectors.mjs";
import { getPetShellBackgroundStyle } from "@/runtime/pet-overlay-utils.mjs";
import {
  getLunariaDocumentBackground,
  getNextWindowSidebarPanel,
  shouldShowWindowSidebarSection,
} from "@/runtime/window-shell-utils.mjs";
import {
  getLunariaScrollbarStyles,
  shouldAutoScrollMessageList,
} from "@/runtime/chat-shell-utils.mjs";
import {
  formatChatMessageMeta,
  formatChatMessageTimestamp,
} from "@/runtime/chat-time-utils.mjs";
import { resolveAutomationNoteKind } from "@/runtime/chat-surface-utils.mjs";
import { Live2D } from "@/components/canvas/live2d";
import TitleBar from "@/components/electron/title-bar";
import { useConfig } from "@/context/character-config-context";
import { useMode } from "@/context/mode-context";
import ScreenshotSelectionOverlay from "@/features/screenshot-selection-overlay";
import { SharedComposer as BottomComposer, captureCameraStill } from "@/features/composer/shared-composer";
import { useAppStore, getQuickActionLabel } from "@/runtime/app-store";
import { resolveAssistantDisplayName } from "@/runtime/assistant-display-utils.mjs";
import { useLunariaRuntime } from "@/runtime/lunaria-runtime";
import { PetShell as LunariaPetShell } from "@/features/pet/pet-shell";
import { SettingsPanel } from "@/features/settings/settings-panel";
import {
  lunariaBackgroundImage,
  lunariaCompactPillButtonStyles,
  lunariaColors,
  lunariaEyebrowStyles,
  lunariaHeadingStyles,
  lunariaIconButtonStyles,
  lunariaMutedCardStyles,
  lunariaPanelStyles,
  lunariaSecondaryButtonStyles,
  getLunariaIntentStyles,
} from "@/theme/lunaria-theme";

function resolveConnectionIntent(connectionState: string): "success" | "info" | "danger" | "warning" {
  const normalized = String(connectionState || "").toLowerCase();
  if (normalized.includes("connected") || normalized.includes("open")) {
    return "success";
  }
  if (normalized.includes("connecting")) {
    return "info";
  }
  if (normalized.includes("error") || normalized.includes("closed")) {
    return "danger";
  }
  return "warning";
}

const lunariaScrollbarStyles = getLunariaScrollbarStyles();
const hiddenScrollbarStyles = getLunariaScrollbarStyles({ hidden: true });

function attachmentHref(url: string, backendUrl: string): string {
  if (!url) {
    return "";
  }
  return /^https?:\/\//i.test(url) || url.startsWith("data:")
    ? url
    : `${backendUrl.replace(/\/+$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;
}

function MessageAttachments({
  attachments,
  backendUrl,
}: {
  attachments: Array<{
    kind?: string;
    mimeType?: string;
    url?: string;
    data?: string;
    filename?: string;
  }>;
  backendUrl: string;
}) {
  const { t } = useTranslation();

  if (!attachments.length) {
    return null;
  }

  return (
    <Stack gap="2.5" mt="3">
      {attachments.map((attachment, index) => {
        const href = attachment.url
          ? attachmentHref(attachment.url, backendUrl)
          : attachment.data
            ? `data:${attachment.mimeType || "application/octet-stream"};base64,${attachment.data}`
            : "";
        if (!href) {
          return null;
        }

        const mimeType = String(attachment.mimeType || "").toLowerCase();
        const kind = String(attachment.kind || "").toLowerCase();
        if (mimeType.startsWith("image/") || kind === "image") {
          return (
            <img
              key={`${attachment.filename || "attachment"}_${index}`}
              src={href}
              alt={attachment.filename || t("chat.attachment")}
              style={{
                width: "100%",
                maxHeight: "220px",
                objectFit: "cover",
                borderRadius: 18,
                display: "block",
                border: `1px solid ${lunariaColors.border}`,
              }}
            />
          );
        }

        if (mimeType.startsWith("audio/") || kind === "audio") {
          return <audio key={`${attachment.filename || "attachment"}_${index}`} src={href} controls style={{ width: "100%" }} />;
        }

        if (mimeType.startsWith("video/") || kind === "video") {
          return <video key={`${attachment.filename || "attachment"}_${index}`} src={href} controls style={{ width: "100%", borderRadius: 18 }} />;
        }

        return (
          <a
            key={`${attachment.filename || "attachment"}_${index}`}
            href={href}
            target="_blank"
            rel="noreferrer"
            style={{ color: lunariaColors.primaryStrong, wordBreak: "break-all", fontWeight: 600 }}
          >
            {attachment.filename || t("shell.downloadAttachment")}
          </a>
        );
      })}
    </Stack>
  );
}

function MessageList({
  compact = false,
  hideScrollbar = false,
  assistantName,
}: {
  compact?: boolean;
  hideScrollbar?: boolean;
  assistantName?: string;
}) {
  const { t } = useTranslation();
  const backendUrl = useAppStore((state) => state.backendUrl);
  const currentSessionId = useAppStore((state) => state.currentSessionId);
  const messages = useAppStore(selectCurrentSessionMessages);
  const streaming = useAppStore((state) => state.streamingMessage);
  const listRef = useRef<HTMLDivElement | null>(null);
  const previousSnapshotRef = useRef({
    sessionId: null as string | null,
    messageCount: 0,
    streamingText: "",
  });

  useEffect(() => {
    const nextSnapshot = {
      sessionId: currentSessionId,
      messageCount: messages.length,
      streamingText: streaming?.sessionId === currentSessionId ? (streaming.text || "") : "",
    };

    if (shouldAutoScrollMessageList({
      previousSessionId: previousSnapshotRef.current.sessionId,
      nextSessionId: nextSnapshot.sessionId,
      previousMessageCount: previousSnapshotRef.current.messageCount,
      nextMessageCount: nextSnapshot.messageCount,
      previousStreamingText: previousSnapshotRef.current.streamingText,
      nextStreamingText: nextSnapshot.streamingText,
    })) {
      const listElement = listRef.current;
      if (listElement) {
        listElement.scrollTop = listElement.scrollHeight;
      }
    }

    previousSnapshotRef.current = nextSnapshot;
  }, [currentSessionId, messages.length, streaming?.sessionId, streaming?.text]);

  if (!messages.length && !(streaming && streaming.sessionId === currentSessionId)) {
    return (
      <Flex
        ref={listRef}
        flex="1"
        minH="0"
        align="center"
        justify="center"
        px="5"
        css={hideScrollbar ? hiddenScrollbarStyles : lunariaScrollbarStyles}
      >
        <Stack gap="2" textAlign="center" align="center">
          <Text {...lunariaEyebrowStyles}>{t("shell.emptyConversationTitle")}</Text>
          <Text fontSize="sm" color={lunariaColors.textMuted}>
            {t("shell.emptyConversationHint")}
          </Text>
        </Stack>
      </Flex>
    );
  }

  return (
    <Stack
      ref={listRef}
      gap="4"
      flex="1"
      overflowY="auto"
      pr="1"
      minH="0"
      css={hideScrollbar ? hiddenScrollbarStyles : lunariaScrollbarStyles}
    >
      {messages.map((message) => {
        const isAssistant = message.role === "assistant";
        const isSystem = message.role === "system";
        const automationKind = resolveAutomationNoteKind(message);
        const bubbleTone = isSystem
          ? getLunariaIntentStyles("neutral")
          : isAssistant
            ? {
              bg: lunariaColors.cardStrong,
              color: lunariaColors.text,
              borderColor: lunariaColors.border,
            }
            : getLunariaIntentStyles("primary");

        if (automationKind || isSystem) {
          const noteText = automationKind
            ? t(
              automationKind === "screenshot"
                ? "shell.automationTriggeredScreenshot"
                : "shell.automationTriggeredProactive",
            )
            : message.text;

          return (
            <Flex key={message.id} justify="center">
              <Box
                px="3"
                py="1.5"
                borderRadius="999px"
                bg="rgba(148, 163, 184, 0.14)"
                border="1px solid"
                borderColor="rgba(148, 163, 184, 0.26)"
              >
                <Text fontSize="xs" color={lunariaColors.textMuted}>
                  {noteText}
                </Text>
              </Box>
            </Flex>
          );
        }

        return (
          <Box
            key={message.id}
            alignSelf={isAssistant ? "flex-start" : "flex-end"}
            maxW={compact ? "94%" : "88%"}
            bg={bubbleTone.bg}
            border="1px solid"
            borderColor={bubbleTone.borderColor}
            borderRadius="22px"
            px="4"
            py="3.5"
            color={bubbleTone.color}
            boxShadow="0 10px 24px rgba(121, 93, 77, 0.08)"
          >
            <Text fontSize="11px" color={lunariaColors.textSubtle} mb="1.5" fontWeight="600">
              {formatChatMessageMeta({
                speaker: isAssistant
                  ? ((message.source === "automation" ? "" : message.meta) || assistantName || t("shell.speakerAssistant"))
                  : t("shell.speakerYou"),
                timestamp: message.createdAt,
              })}
            </Text>
            {message.text ? (
              <Text whiteSpace="pre-wrap" fontSize={compact ? "sm" : "md"} lineHeight="1.75">
                {message.text}
              </Text>
            ) : null}
            <MessageAttachments attachments={message.attachments || []} backendUrl={backendUrl} />
          </Box>
        );
      })}

      {streaming && streaming.sessionId === currentSessionId ? (
        <Box
          alignSelf="flex-start"
          maxW={compact ? "94%" : "88%"}
          bg={lunariaColors.cardStrong}
          border="1px solid"
          borderColor={lunariaColors.border}
          borderRadius="22px"
          px="4"
          py="3.5"
          color={lunariaColors.text}
          boxShadow="0 10px 24px rgba(121, 93, 77, 0.08)"
        >
          <Text fontSize="11px" color={lunariaColors.textSubtle} mb="1.5" fontWeight="600">
            {assistantName || t("shell.speakerAssistant")} · {t("shell.streaming")}
          </Text>
          <Text whiteSpace="pre-wrap" fontSize={compact ? "sm" : "md"} lineHeight="1.75">
            {streaming.text || "..."}
          </Text>
        </Box>
      ) : null}
    </Stack>
  );
}

function ActionPanel({
  pet = false,
}: {
  pet?: boolean;
}) {
  const runtime = useLunariaRuntime();
  const { t } = useTranslation();
  const quickActions = useAppStore((state) => state.quickActions);
  const motions = useAppStore((state) => state.motions);
  const expressions = useAppStore((state) => state.expressions);
  const persistentToggles = useAppStore((state) => state.persistentToggles);
  const persistentToggleState = useAppStore((state) => state.persistentToggleState);
  const togglePersistent = useAppStore((state) => state.togglePersistentToggle);

  const sectionTitle = (label: string) => (
    <Text {...lunariaEyebrowStyles}>
      {label}
    </Text>
  );

  const actionButton = (label: string, onClick: () => void, key: string, active = false) => (
    <Button
      key={key}
      size="xs"
      {...lunariaCompactPillButtonStyles}
      bg={active ? lunariaColors.primarySoft : lunariaSecondaryButtonStyles.bg}
      color={active ? lunariaColors.primaryStrong : lunariaColors.text}
      borderColor={active ? "rgba(220, 141, 121, 0.3)" : lunariaColors.border}
      onClick={onClick}
    >
      {label}
    </Button>
  );

  return (
    <Stack
      gap="3.5"
      py={pet ? "3" : "2"}
      maxH={pet ? "42vh" : "34vh"}
      overflowY="auto"
      css={lunariaScrollbarStyles}
    >
      <Box>
        {sectionTitle(t("stageActions.quickActions"))}
        <Flex wrap="wrap" gap="2" mt="2.5">
          {quickActions.map((action, index) => actionButton(
            getQuickActionLabel(action),
            () => void runtime.executeQuickAction(action as never),
            `quick_${index}`,
          ))}
        </Flex>
      </Box>

      {Object.keys(persistentToggles).length ? (
        <Box>
          {sectionTitle(t("stageActions.persistent"))}
          <Flex wrap="wrap" gap="2" mt="2.5">
            {Object.entries(persistentToggles).map(([key, config]) => actionButton(
              persistentToggleState[key]
                ? (config.onLabel || key)
                : (config.offLabel || key),
              () => togglePersistent(key),
              `toggle_${key}`,
              !!persistentToggleState[key],
            ))}
          </Flex>
        </Box>
      ) : null}

      <Box>
        {sectionTitle(t("stageActions.motions"))}
        <Flex wrap="wrap" gap="2" mt="2.5">
          {motions.map((motion, index) => actionButton(
            motion.label || `${motion.group}:${motion.index}`,
            () => void runtime.executeMotion(motion.group, motion.index),
            `motion_${index}`,
          ))}
        </Flex>
      </Box>

      <Box>
        {sectionTitle(t("stageActions.expressions"))}
        <Flex wrap="wrap" gap="2" mt="2.5">
          {expressions.map((expression, index) => actionButton(
            expression.name,
            () => void runtime.executeExpression(expression.name),
            `expression_${index}`,
          ))}
        </Flex>
      </Box>
    </Stack>
  );
}

function SessionsPanel() {
  const sessions = useAppStore((state) => state.sessions);
  const currentSessionId = useAppStore((state) => state.currentSessionId);
  const runtime = useLunariaRuntime();

  return (
    <Stack gap="2.5" maxH="200px" overflowY="auto" css={lunariaScrollbarStyles} pt="2">
      {sessions.map((session) => {
        const selected = session.id === currentSessionId;
        return (
          <Button
            key={session.id}
            justifyContent="space-between"
            h="42px"
            {...lunariaSecondaryButtonStyles}
            bg={selected ? "rgba(246, 216, 207, 0.48)" : "transparent"}
            color={selected ? lunariaColors.primaryStrong : lunariaColors.text}
            borderColor={selected ? "rgba(220, 141, 121, 0.26)" : "transparent"}
            onClick={() => void runtime.loadSession(session.id)}
          >
            <Text whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis" maxW="220px">
              {session.name || session.id}
            </Text>
            <Text fontSize="11px" color={lunariaColors.textSubtle}>
              {formatChatMessageTimestamp(session.updatedAt)}
            </Text>
          </Button>
        );
      })}
    </Stack>
  );
}

function WindowShell() {
  const runtime = useLunariaRuntime();
  const { setMode, isElectron } = useMode();
  const { t } = useTranslation();
  const { confName } = useConfig();
  const [sidebarPanel, setSidebarPanel] = useState<"sessions" | "settings" | null>(null);
  const [windowPlusOpen, setWindowPlusOpen] = useState(false);
  const windowFileInputRef = useRef<HTMLInputElement>(null);
  const manifest = useAppStore((state) => state.manifest);
  const stageActionPanelOpen = useAppStore((state) => state.stageActionPanelOpen);
  const setStageActionPanelOpen = useAppStore((state) => state.setStageActionPanelOpen);
  const connectionState = useAppStore((state) => state.connectionState);
  const subtitle = useAppStore((state) => state.subtitle);
  const background = useAppStore((state) => state.backgroundByMode.window);
  const sessionsOpen = shouldShowWindowSidebarSection(sidebarPanel, "sessions");
  const settingsOpen = shouldShowWindowSidebarSection(sidebarPanel, "settings");
  const connectionTone = getLunariaIntentStyles(resolveConnectionIntent(connectionState));
  const assistantDisplayName = resolveAssistantDisplayName({
    configName: confName,
    manifestName: manifest?.model.name,
  });

  const handleWindowUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files?.length) {
      void runtime.addFiles(files);
    }
    event.target.value = "";
    setWindowPlusOpen(false);
  };

  const handleWindowCamera = async () => {
    const file = await captureCameraStill();
    if (file) {
      await runtime.addFiles([file]);
    }
    setWindowPlusOpen(false);
  };

  const handleWindowScreenshot = async () => {
    await runtime.startScreenshotSelection();
    setWindowPlusOpen(false);
  };

  return (
    <Flex h="100vh" w="100vw" bg="transparent" overflow="hidden" position="relative">
      <Flex
        flex="1"
        position="relative"
        overflow="hidden"
        borderRadius={isElectron ? "26px" : "0"}
        border="1px solid"
        borderColor={lunariaColors.border}
        boxShadow="0 24px 64px rgba(121, 93, 77, 0.14)"
        bg={lunariaColors.appBgSoft}
      >
        {isElectron ? <TitleBar /> : null}

        <Box flex="1" position="relative" overflow="hidden">
          <Box
            position="absolute"
            inset={isElectron ? "30px 0 0 0" : "0"}
            backgroundImage={background ? `url(${background})` : lunariaBackgroundImage}
            backgroundSize="cover"
            backgroundPosition="center"
          >
            <Box position="absolute" inset="0">
              <Live2D />
            </Box>

            <Box position="absolute" top="24px" right="24px" zIndex="10">
              <Text
                px="3.5"
                py="2"
                borderRadius="999px"
                bg={connectionTone.bg}
                color={connectionTone.color}
                border="1px solid"
                borderColor={connectionTone.borderColor}
                fontSize="12px"
                fontWeight="700"
              >
                {connectionState}
              </Text>
            </Box>

            {subtitle ? (
              <Box
                position="absolute"
                left="50%"
                bottom="54px"
                transform="translateX(-50%)"
                maxW="min(62vw, 720px)"
                px="5"
                py="4"
                {...lunariaPanelStyles}
                zIndex="10"
              >
                <Text textAlign="center" color={lunariaColors.text} fontWeight="500" lineHeight="1.8">
                  {subtitle}
                </Text>
              </Box>
            ) : null}
          </Box>
        </Box>

        <Box
          w={{ base: "400px", lg: "430px" }}
          minW={{ base: "400px", lg: "430px" }}
          h="100%"
          px="5"
          pt={isElectron ? "42px" : "4"}
          pb="5"
          bg="linear-gradient(180deg, #fbf7f3 0%, #f4ece4 100%)"
          borderLeft="1px solid"
          borderColor={lunariaColors.border}
          position="relative"
          zIndex="5"
        >
          <Flex h="100%" direction="column" gap="0">
            <HStack justify="space-between" align="center" pb="4">
              <Box>
                <Text fontSize="lg" {...lunariaHeadingStyles}>
                  {assistantDisplayName}
                </Text>
              </Box>
              <HStack gap="2">
                <IconButton aria-label={t("shell.newSession")} onClick={() => void runtime.createNewSession()} {...lunariaIconButtonStyles}><FiPlus /></IconButton>
                <IconButton aria-label={t("common.reconnect")} onClick={() => void runtime.reconnect()} {...lunariaIconButtonStyles}><FiRefreshCcw /></IconButton>
                <IconButton
                  aria-label={t("shell.toggleSessions")}
                  onClick={() => setSidebarPanel((current) => getNextWindowSidebarPanel(current, "sessions"))}
                  {...lunariaIconButtonStyles}
                  bg={sessionsOpen ? lunariaColors.primarySoft : lunariaIconButtonStyles.bg}
                  color={sessionsOpen ? lunariaColors.primaryStrong : lunariaColors.text}
                >
                  <FiMessageCircle />
                </IconButton>
                <IconButton
                  aria-label={t("shell.toggleSettings")}
                  onClick={() => setSidebarPanel((current) => getNextWindowSidebarPanel(current, "settings"))}
                  {...lunariaIconButtonStyles}
                  bg={settingsOpen ? lunariaColors.primarySoft : lunariaIconButtonStyles.bg}
                  color={settingsOpen ? lunariaColors.primaryStrong : lunariaColors.text}
                >
                  <FiSettings />
                </IconButton>
                {isElectron ? (
                  <IconButton aria-label={t("shell.petMode")} onClick={() => setMode("pet")} {...lunariaIconButtonStyles}><FiLayers /></IconButton>
                ) : null}
              </HStack>
            </HStack>

            {sessionsOpen && !settingsOpen ? (
              <Box borderTop="1px solid" borderColor={lunariaColors.border} pt="4" pb="3">
                <Text {...lunariaEyebrowStyles}>{t("shell.sessions")}</Text>
                <SessionsPanel />
              </Box>
            ) : null}

            <Box flex="1" minH="0" overflow="hidden">
              {settingsOpen ? (
                <SettingsPanel />
              ) : (
                <Box
                  h="100%"
                  pt={sessionsOpen ? "1" : "2"}
                  pb="4"
                  display="flex"
                  flexDirection="column"
                  borderTop="1px solid"
                  borderColor={lunariaColors.border}
                >
                  <HStack justify="space-between" mb="3" pt="4">
                    <Box>
                      <Text {...lunariaEyebrowStyles}>{t("shell.conversation")}</Text>
                    </Box>
                    <Text fontSize="12px" color={lunariaColors.textSubtle}>
                      {manifest?.selectedModelId || manifest?.model.id || "model"}
                    </Text>
                  </HStack>
                  <MessageList hideScrollbar assistantName={assistantDisplayName} />
                </Box>
              )}
            </Box>

            {!settingsOpen ? (
              <Stack gap="2" pt="2">
                <input
                  ref={windowFileInputRef}
                  type="file"
                  hidden
                  multiple
                  accept="image/*,audio/*,video/*,*/*"
                  onChange={handleWindowUpload}
                />

                {windowPlusOpen ? (
                  <Flex
                    wrap="wrap"
                    gap="3"
                    p="3"
                    justify="center"
                    {...lunariaMutedCardStyles}
                  >
                    <IconButton
                      aria-label={t("shell.newSession")}
                      size="md"
                      {...lunariaIconButtonStyles}
                      onClick={() => {
                        void runtime.createNewSession();
                        setWindowPlusOpen(false);
                      }}
                    >
                      <LuMessageSquarePlus />
                    </IconButton>
                    <IconButton
                      aria-label={t("shell.upload")}
                      size="md"
                      {...lunariaIconButtonStyles}
                      onClick={() => windowFileInputRef.current?.click()}
                    >
                      <LuUpload />
                    </IconButton>
                    <IconButton
                      aria-label={t("shell.camera")}
                      size="md"
                      {...lunariaIconButtonStyles}
                      onClick={() => void handleWindowCamera()}
                    >
                      <LuCamera />
                    </IconButton>
                    <IconButton
                      aria-label={t("shell.screenshot")}
                      size="md"
                      {...lunariaIconButtonStyles}
                      onClick={() => void handleWindowScreenshot()}
                    >
                      <LuImage />
                    </IconButton>
                    <IconButton
                      aria-label={t("shell.actions")}
                      size="md"
                      {...lunariaIconButtonStyles}
                      onClick={() => {
                        setStageActionPanelOpen(!stageActionPanelOpen);
                        setWindowPlusOpen(false);
                      }}
                    >
                      <LuSmile />
                    </IconButton>
                  </Flex>
                ) : null}

                {stageActionPanelOpen ? <ActionPanel /> : null}

                <BottomComposer
                  showPlusButton
                  onPlusClick={() => {
                    setStageActionPanelOpen(false);
                    setWindowPlusOpen((current) => !current);
                  }}
                />
              </Stack>
            ) : null}
          </Flex>
        </Box>
      </Flex>
    </Flex>
  );
}

function PetShell() {
  const runtime = useLunariaRuntime();
  const background = useAppStore((state) => state.backgroundByMode.pet);
  const petBackgroundStyle = getPetShellBackgroundStyle(background);

  return (
    <Box
      position="fixed"
      inset="0"
      overflow="hidden"
      {...petBackgroundStyle}
    >
      <Box position="absolute" inset="0">
        <Live2D />
      </Box>

      <LunariaPetShell onRequestScreenshot={() => runtime.startScreenshotSelection()} />
    </Box>
  );
}

export default function LunariaShell(): JSX.Element {
  const { mode, isElectron } = useMode();
  const runtime = useLunariaRuntime();
  const background = useAppStore((state) => state.backgroundByMode[mode]);
  const screenshotOverlay = useAppStore((state) => state.screenshotOverlay);

  useEffect(() => {
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.documentElement.style.height = "100%";
    document.body.style.height = "100%";
    const documentBackground = getLunariaDocumentBackground({
      mode,
      hasBackground: Boolean(background),
      transparentWindow: isElectron && mode === "window",
    });
    document.documentElement.style.background = documentBackground;
    document.body.style.background = documentBackground;
  }, [background, isElectron, mode]);

  useEffect(() => {
    if (!window.electron?.ipcRenderer) {
      return undefined;
    }

    const handleToggleForceIgnoreMouse = () => {
      window.api?.toggleForceIgnoreMouse?.();
    };

    window.electron.ipcRenderer.on("toggle-force-ignore-mouse", handleToggleForceIgnoreMouse);

    return () => {
      window.electron?.ipcRenderer.removeListener("toggle-force-ignore-mouse", handleToggleForceIgnoreMouse);
    };
  }, []);

  return (
    <>
      {mode === "pet" ? <PetShell /> : <WindowShell />}
      {screenshotOverlay ? (
        <ScreenshotSelectionOverlay
          fileUrl={screenshotOverlay.fileUrl}
          cleanupToken={screenshotOverlay.cleanupToken}
          filename={screenshotOverlay.filename}
          onCancel={runtime.closeScreenshotSelection}
          onCreateCapture={(filename) => runtime.createPendingCaptureAttachment(filename)}
          onResolveCapture={(attachmentId, dataUrl, filename) => runtime.resolvePendingCaptureAttachment(attachmentId, dataUrl, filename)}
          onFailCapture={(attachmentId) => runtime.failPendingCaptureAttachment(attachmentId)}
        />
      ) : null}
    </>
  );
}
