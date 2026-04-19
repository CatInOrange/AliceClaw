import {
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
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
import { useAppStore, getQuickActionLabel } from "@/domains/renderer-store";
import { CurrentSessionMessageList } from "@/domains/chat/ui/chat-message-list";
import { getPetShellBackgroundStyle } from "@/runtime/pet-overlay-utils.ts";
import {
  getLunariaDocumentBackground,
  getNextWindowSidebarPanel,
  shouldShowWindowSidebarSection,
} from "@/runtime/window-shell-utils.ts";
import { getLunariaScrollbarStyles } from "@/runtime/chat-shell-utils.ts";
import { formatChatMessageTimestamp } from "@/runtime/chat-time-utils.ts";
import { Live2D } from "@/platform/live2d/ui/live2d-canvas";
import TitleBar from "@/platform/electron/ui/title-bar";
import { useConfig } from "@/context/character-config-context";
import { resolveAssistantDisplayName } from "@/runtime/assistant-display-utils.ts";
import { useMode } from "@/context/mode-context";
import ScreenshotSelectionOverlay from "@/app/shell/screenshot-selection-overlay";
import { SharedComposer as BottomComposer, captureCameraStill } from "@/domains/composer/ui/shared-composer";
import {
  useAutomationCommands,
  useChatCommands,
  useComposerCommands,
  useModelCommands,
  usePetCommands,
  useSessionCommands,
} from "@/app/providers/command-provider";
import { PetShell as LunariaPetShell } from "@/domains/pet/ui/pet-shell";
import { SettingsPanel } from "@/domains/settings/ui/settings-panel";
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

function ActionPanel({
  pet = false,
}: {
  pet?: boolean;
}) {
  const {
    executeQuickAction,
    executeMotion,
    executeExpression,
  } = useModelCommands();
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
            () => void executeQuickAction(action as never),
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
            () => void executeMotion(motion.group, motion.index),
            `motion_${index}`,
          ))}
        </Flex>
      </Box>

      <Box>
        {sectionTitle(t("stageActions.expressions"))}
        <Flex wrap="wrap" gap="2" mt="2.5">
          {expressions.map((expression, index) => actionButton(
            expression.name,
            () => void executeExpression(expression.name),
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
  const { loadSession } = useSessionCommands();

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
            onClick={() => void loadSession(session.id)}
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
  const { reconnect, createNewSession } = useSessionCommands();
  const { confName } = useConfig();
  const { addFiles, startScreenshotSelection } = useComposerCommands();
  const { setMode, isElectron } = useMode();
  const { t } = useTranslation();
  const [sidebarPanel, setSidebarPanel] = useState<"sessions" | "settings" | null>(null);
  const [windowPlusOpen, setWindowPlusOpen] = useState(false);
  const [viewportSize, setViewportSize] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1280,
    height: typeof window !== "undefined" ? window.innerHeight : 720,
  });
  const windowFileInputRef = useRef<HTMLInputElement>(null);
  const manifest = useAppStore((state) => state.manifest);
  const currentSessionId = useAppStore((state) => state.currentSessionId);
  const messages = useAppStore(selectCurrentSessionMessages);
  const stageActionPanelOpen = useAppStore((state) => state.stageActionPanelOpen);
  const setStageActionPanelOpen = useAppStore((state) => state.setStageActionPanelOpen);
  const subtitle = useAppStore((state) => state.subtitle);
  const background = useAppStore((state) => state.backgroundByMode.window);
  const connectionState = useAppStore((state) => state.connectionState);
  const sessionsOpen = shouldShowWindowSidebarSection(sidebarPanel, "sessions");
  const settingsOpen = shouldShowWindowSidebarSection(sidebarPanel, "settings");
  const isPortraitLayout = !isElectron && viewportSize.height > viewportSize.width;
  const isMobileWeb = !isElectron && viewportSize.width <= 960;
  const connectionTone = getLunariaIntentStyles(resolveConnectionIntent(connectionState));
  const assistantDisplayName = resolveAssistantDisplayName({
    configName: confName,
    manifestName: manifest?.model.name,
  });

  const latestUserMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === "user" && message.text?.trim()),
    [messages],
  );
  const latestAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant" && message.text?.trim()),
    [messages],
  );

  useEffect(() => {
    const handleResize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleWindowUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files?.length) {
      void addFiles(files);
    }
    event.target.value = "";
    setWindowPlusOpen(false);
  };

  const handleWindowCamera = async () => {
    const file = await captureCameraStill();
    if (file) {
      await addFiles([file]);
    }
    setWindowPlusOpen(false);
  };

  const handleWindowScreenshot = async () => {
    await startScreenshotSelection();
    setWindowPlusOpen(false);
  };

  return (
    <Flex h="100dvh" w="100vw" bg="transparent" overflow="hidden" position="relative">
      <Box position="fixed" top={isPortraitLayout ? "14px" : "24px"} right={isPortraitLayout ? "14px" : "24px"} zIndex="30" pointerEvents="none">
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

      <Flex
        flex="1"
        position="relative"
        overflow="hidden"
        direction="column"
        borderRadius={isElectron ? "26px" : "0"}
        border="1px solid"
        borderColor={lunariaColors.border}
        boxShadow="0 24px 64px rgba(121, 93, 77, 0.14)"
        bg={lunariaColors.appBgSoft}
      >
        {isElectron ? <TitleBar /> : null}

        <Box
          flex="1"
          minH="0"
          h="100%"
          position="relative"
          overflow="hidden"
        >
          <Box
            position="absolute"
            inset={isElectron ? "30px 0 0 0" : "0"}
            backgroundImage={background ? `url(${background})` : lunariaBackgroundImage}
            backgroundSize="cover"
            backgroundPosition="center"
          >
            <Box
              position="absolute"
              inset="0"
              display="flex"
              alignItems="stretch"
              justifyContent={isMobileWeb ? "center" : "flex-start"}
              pr={isMobileWeb ? "0" : "300px"}
            >
              <Box flex="1" minW="0" h="100%">
                <Live2D />
              </Box>
            </Box>

          </Box>
        </Box>

        {!settingsOpen ? (
          <>
            {latestUserMessage?.text ? (
              <Box
                position="absolute"
                left={isMobileWeb ? "10px" : "18px"}
                bottom={isMobileWeb ? "108px" : "96px"}
                maxW={isMobileWeb ? "46vw" : "280px"}
                px="4"
                py="3"
                borderRadius="22px"
                bg="rgba(255, 245, 240, 0.92)"
                border="1px solid"
                borderColor="rgba(220, 141, 121, 0.28)"
                boxShadow="0 14px 36px rgba(121, 93, 77, 0.14)"
                backdropFilter="blur(12px)"
                zIndex="18"
              >
                <Text fontSize="11px" color={lunariaColors.textSubtle} mb="1" fontWeight="700">你刚刚说</Text>
                <Text noOfLines={3} whiteSpace="pre-wrap" fontSize="sm" color={lunariaColors.text}>{latestUserMessage.text}</Text>
              </Box>
            ) : null}

            {latestAssistantMessage?.text ? (
              <Box
                position="absolute"
                right={isMobileWeb ? "10px" : "18px"}
                bottom={isMobileWeb ? "164px" : "152px"}
                maxW={isMobileWeb ? "50vw" : "300px"}
                px="4"
                py="3"
                borderRadius="22px"
                bg="rgba(248, 241, 236, 0.9)"
                border="1px solid"
                borderColor="rgba(176, 144, 122, 0.24)"
                boxShadow="0 14px 36px rgba(121, 93, 77, 0.14)"
                backdropFilter="blur(12px)"
                zIndex="18"
              >
                <Text fontSize="11px" color={lunariaColors.textSubtle} mb="1" fontWeight="700">{assistantDisplayName || "她"}刚刚回你</Text>
                <Text noOfLines={4} whiteSpace="pre-wrap" fontSize="sm" color={lunariaColors.text}>{latestAssistantMessage.text}</Text>
              </Box>
            ) : null}
          </>
        ) : null}

        <Box
          position="absolute"
          left={isMobileWeb ? "10px" : "16px"}
          right={isMobileWeb ? "10px" : "16px"}
          bottom={isMobileWeb ? "10px" : "16px"}
          zIndex="20"
        >
          <Flex
            direction="column"
            gap="2"
            px={isMobileWeb ? "3" : "4"}
            py={isMobileWeb ? "3" : "4"}
            borderRadius={isMobileWeb ? "22px" : "24px"}
            bg="linear-gradient(180deg, rgba(251,247,243,0.78) 0%, rgba(244,236,228,0.86) 100%)"
            border="1px solid"
            borderColor="rgba(176, 144, 122, 0.24)"
            boxShadow="0 18px 48px rgba(88, 60, 46, 0.16)"
            backdropFilter="blur(20px)"
          >
            <HStack justify="flex-end" align="center" spacing="2">
              <IconButton aria-label={t("shell.newSession")} onClick={() => void createNewSession()} {...lunariaIconButtonStyles}><FiPlus /></IconButton>
              <IconButton aria-label={t("common.reconnect")} onClick={() => void reconnect()} {...lunariaIconButtonStyles}><FiRefreshCcw /></IconButton>
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

            {subtitle && !settingsOpen ? (
              <Box px="3.5" py="2.5" {...lunariaPanelStyles}>
                <Text textAlign="left" color={lunariaColors.text} fontWeight="500" lineHeight="1.7" fontSize={isMobileWeb ? "sm" : "md"}>
                  {subtitle}
                </Text>
              </Box>
            ) : null}

            <input
              ref={windowFileInputRef}
              type="file"
              hidden
              multiple
              accept="image/*,audio/*,video/*,*/*"
              onChange={handleWindowUpload}
            />

            {!settingsOpen && windowPlusOpen ? (
              <Flex wrap="wrap" gap="3" p="3" justify="center" {...lunariaMutedCardStyles}>
                <IconButton
                  aria-label={t("shell.newSession")}
                  size="md"
                  {...lunariaIconButtonStyles}
                  onClick={() => {
                    void createNewSession();
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

            {!settingsOpen && stageActionPanelOpen ? <ActionPanel /> : null}

            {settingsOpen ? (
              <Box maxH={isMobileWeb ? "42dvh" : "50dvh"} overflow="auto" borderRadius="18px" bg="rgba(255,255,255,0.45)">
                <SettingsPanel />
              </Box>
            ) : (
              <BottomComposer
                compact={isMobileWeb || isPortraitLayout}
                showPlusButton={isMobileWeb}
                showWindowTools={!isMobileWeb}
                onPlusClick={() => {
                  setStageActionPanelOpen(false);
                  setWindowPlusOpen((current) => !current);
                }}
                onScreenshotClick={() => void handleWindowScreenshot()}
              />
            )}
          </Flex>
        </Box>
      </Flex>
    </Flex>
  );
}

function PetShell() {
  const { startScreenshotSelection } = usePetCommands();
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

      <LunariaPetShell onRequestScreenshot={() => startScreenshotSelection()} />
    </Box>
  );
}

export default function LunariaShell(): JSX.Element {
  const { mode, isElectron } = useMode();
  const {
    closeScreenshotSelection,
    createPendingCaptureAttachment,
    resolvePendingCaptureAttachment,
    failPendingCaptureAttachment,
  } = useComposerCommands();
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
          onCancel={closeScreenshotSelection}
          onCreateCapture={(filename) => createPendingCaptureAttachment(filename)}
          onResolveCapture={(attachmentId, dataUrl, filename) => resolvePendingCaptureAttachment(attachmentId, dataUrl, filename)}
          onFailCapture={(attachmentId) => failPendingCaptureAttachment(attachmentId)}
        />
      ) : null}
    </>
  );
}
