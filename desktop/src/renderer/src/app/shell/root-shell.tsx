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
import { useMode } from "@/context/mode-context";
import ScreenshotSelectionOverlay from "@/app/shell/screenshot-selection-overlay";
import { SharedComposer as BottomComposer, captureCameraStill } from "@/domains/composer/ui/shared-composer";
import { resolveAssistantDisplayName } from "@/runtime/assistant-display-utils.ts";
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
  const { addFiles, startScreenshotSelection } = useComposerCommands();
  const { setMode, isElectron } = useMode();
  const { t } = useTranslation();
  const { confName } = useConfig();
  const [sidebarPanel, setSidebarPanel] = useState<"sessions" | "settings" | null>(null);
  const [windowPlusOpen, setWindowPlusOpen] = useState(false);
  const [viewportSize, setViewportSize] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1280,
    height: typeof window !== "undefined" ? window.innerHeight : 720,
  });
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
  const isPortraitLayout = !isElectron && viewportSize.height > viewportSize.width;
  const isMobileWeb = !isElectron && viewportSize.width <= 960;

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
      <Flex
        flex="1"
        position="relative"
        overflow="hidden"
        direction={isMobileWeb ? "column" : (isPortraitLayout ? "column" : "row")}
        borderRadius={isElectron ? "26px" : "0"}
        border="1px solid"
        borderColor={lunariaColors.border}
        boxShadow="0 24px 64px rgba(121, 93, 77, 0.14)"
        bg={lunariaColors.appBgSoft}
      >
        {isElectron ? <TitleBar /> : null}

        <Box
          flex={isMobileWeb ? "1.35" : "1"}
          minH={isMobileWeb ? "56dvh" : (isPortraitLayout ? "300px" : "0")}
          maxH={isMobileWeb ? "70dvh" : (isPortraitLayout ? "65vh" : "none")}
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
            <Box position="absolute" inset="0">
              <Live2D />
            </Box>

            <Box position="absolute" top={isPortraitLayout ? "14px" : "24px"} right={isPortraitLayout ? "14px" : "24px"} zIndex="10">
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
                bottom={isPortraitLayout ? "18px" : "54px"}
                transform="translateX(-50%)"
                maxW={isPortraitLayout ? "calc(100vw - 28px)" : "min(62vw, 720px)"}
                px={isPortraitLayout ? "4" : "5"}
                py={isPortraitLayout ? "3" : "4"}
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
          w={isMobileWeb ? "100%" : (isPortraitLayout ? "100%" : { base: "400px", lg: "430px" })}
          minW={isMobileWeb ? "0" : (isPortraitLayout ? "0" : { base: "400px", lg: "430px" })}
          h={isMobileWeb ? "auto" : (isPortraitLayout ? "35vh" : "100%")}
          minH={isMobileWeb ? "30dvh" : undefined}
          px={isMobileWeb ? "3.5" : (isPortraitLayout ? "4" : "5")}
          pt={isElectron ? "42px" : isMobileWeb ? "2.5" : (isPortraitLayout ? "3" : "4")}
          pb={isMobileWeb ? "calc(env(safe-area-inset-bottom, 0px) + 12px)" : (isPortraitLayout ? "3" : "5")}
          bg="linear-gradient(180deg, #fbf7f3 0%, #f4ece4 100%)"
          borderLeft={isPortraitLayout ? "0" : "1px solid"}
          borderTop={isPortraitLayout ? "1px solid" : "0"}
          borderColor={lunariaColors.border}
          position="relative"
          zIndex="5"
        >
          <Flex h="100%" direction="column" gap="0">
            <HStack justify="space-between" align="center" pb={isMobileWeb ? "2" : (isPortraitLayout ? "3" : "4") }>
              <Box>
                <Text fontSize="lg" {...lunariaHeadingStyles}>
                  {assistantDisplayName}
                </Text>
              </Box>
              <HStack gap="2">
                {isMobileWeb ? (
                  <IconButton
                    aria-label={t("shell.toggleSessions")}
                    onClick={() => setSidebarPanel((current) => getNextWindowSidebarPanel(current, "sessions"))}
                    {...lunariaIconButtonStyles}
                    bg={sessionsOpen ? lunariaColors.primarySoft : lunariaIconButtonStyles.bg}
                    color={sessionsOpen ? lunariaColors.primaryStrong : lunariaColors.text}
                  >
                    <FiMessageCircle />
                  </IconButton>
                ) : null}
                <IconButton aria-label={t("shell.newSession")} onClick={() => void createNewSession()} {...lunariaIconButtonStyles}><FiPlus /></IconButton>
                <IconButton aria-label={t("common.reconnect")} onClick={() => void reconnect()} {...lunariaIconButtonStyles}><FiRefreshCcw /></IconButton>
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
              <Box borderTop="1px solid" borderColor={lunariaColors.border} pt="4" pb="3" maxH={isPortraitLayout ? "22vh" : "unset"} overflowY="auto">
                <Text {...lunariaEyebrowStyles}>{t("shell.sessions")}</Text>
                <SessionsPanel />
              </Box>
            ) : null}

            <Box flex="1" minH="0" overflow="hidden">
              {settingsOpen ? (
                <SettingsPanel />
              ) : isMobileWeb ? (
                <Box display="none" />
              ) : (
                <Box
                  h="100%"
                  pt={sessionsOpen ? "1" : "2"}
                  pb={isPortraitLayout ? "2" : "4"}
                  display="flex"
                  flexDirection="column"
                  borderTop="1px solid"
                  borderColor={lunariaColors.border}
                >
                  <HStack justify="space-between" mb="3" pt={isPortraitLayout ? "3" : "4"}>
                    <Box>
                      <Text {...lunariaEyebrowStyles}>{t("shell.conversation")}</Text>
                    </Box>
                    <Text fontSize="12px" color={lunariaColors.textSubtle}>
                      {manifest?.selectedModelId || manifest?.model.id || "model"}
                    </Text>
                  </HStack>
                  <CurrentSessionMessageList
                    hideScrollbar
                    assistantName={assistantDisplayName}
                    emptyState={{
                      title: t("shell.emptyConversationTitle"),
                      hint: t("shell.emptyConversationHint"),
                    }}
                    variant="window"
                  />
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

                {stageActionPanelOpen ? <ActionPanel /> : null}

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
              </Stack>
            ) : null}
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
