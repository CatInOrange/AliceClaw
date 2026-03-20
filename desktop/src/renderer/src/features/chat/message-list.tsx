import {
  Box,
  Flex,
  Icon,
  Image,
  Link,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { FaCheck, FaPaperclip, FaTimes, FaTools } from "react-icons/fa";
import { Message } from "@/services/websocket-service";
import { formatChatMessageMeta } from "@/runtime/chat-time-utils.mjs";
import {
  lunariaCardStyles,
  lunariaColors,
  getLunariaIntentStyles,
} from "@/theme/lunaria-theme";

function resolveAttachmentSource(
  backendUrl: string,
  attachment: {
    url?: string;
    data?: string;
    mimeType?: string;
  },
): string {
  if (attachment.url) {
    return attachment.url.startsWith("http")
      ? attachment.url
      : `${backendUrl}${attachment.url}`;
  }

  if (attachment.data) {
    return `data:${attachment.mimeType || "application/octet-stream"};base64,${attachment.data}`;
  }

  return "";
}

function renderAttachment(
  messageId: string,
  attachment: {
    kind?: string;
    filename?: string;
    mimeType?: string;
    url?: string;
    data?: string;
  },
  index: number,
  backendUrl: string,
  attachmentLabel: string,
) {
  const source = resolveAttachmentSource(backendUrl, attachment);
  if (!source) {
    return null;
  }

  const kind = String(attachment.kind || "").toLowerCase();
  const mimeType = String(attachment.mimeType || "");
  const effectiveKind = kind
    || (mimeType.startsWith("image/")
      ? "image"
      : mimeType.startsWith("audio/")
        ? "audio"
        : mimeType.startsWith("video/")
          ? "video"
          : "file");

  if (effectiveKind === "image") {
    return (
      <Image
        key={`${messageId}-attachment-${index}`}
        src={source}
        alt={attachment.filename || attachmentLabel}
        maxH="220px"
        maxW="320px"
        borderRadius="14px"
        objectFit="cover"
      />
    );
  }

  if (effectiveKind === "audio") {
    return (
      <Box
        key={`${messageId}-attachment-${index}`}
        {...lunariaCardStyles}
        borderRadius="14px"
        p="2"
      >
        <audio controls src={source} style={{ width: "100%" }} />
      </Box>
    );
  }

  if (effectiveKind === "video") {
    return (
      <Box
        key={`${messageId}-attachment-${index}`}
        {...lunariaCardStyles}
        borderRadius="14px"
        p="2"
      >
        <video controls src={source} style={{ width: "100%", maxWidth: "320px", borderRadius: 12 }} />
      </Box>
    );
  }

  return (
    <Flex
      key={`${messageId}-attachment-${index}`}
      align="center"
      gap="2"
      {...lunariaCardStyles}
      borderRadius="14px"
      px="3"
      py="2"
    >
      <Icon as={FaPaperclip} color={lunariaColors.textSubtle} />
      <Link href={source} target="_blank" rel="noreferrer" color={lunariaColors.primaryStrong}>
        {attachment.filename || attachmentLabel}
      </Link>
    </Flex>
  );
}

export function MessageList({
  messages,
  backendUrl,
  assistantName,
  userName,
  compact = false,
}: {
  messages: Message[];
  backendUrl: string;
  assistantName?: string;
  userName?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const resolvedUserName = userName || t("shell.speakerYou");
  const validMessages = messages.filter((msg) => msg.content
    || (msg.attachments && msg.attachments.length > 0)
    || msg.type === "tool_call_status"
    || msg.type === "automation_note"
    || msg.role === "system");

  if (validMessages.length === 0) {
    return (
      <Flex align="center" justify="center" h="100%" color={lunariaColors.textMuted}>
        {t("chat.empty")}
      </Flex>
    );
  }

  return (
    <Stack gap={compact ? 2 : 3} overflowY="auto" pr="1">
      {validMessages.map((msg) => {
        if (msg.type === "tool_call_status") {
          return (
            <Flex
              key={msg.id}
              align="center"
              gap="2"
              px="3"
              py="2"
              {...lunariaCardStyles}
              borderRadius="14px"
              color={lunariaColors.text}
            >
              <Icon as={FaTools} />
              <Text fontSize="sm" flex="1">
                {msg.status === "running"
                  ? t("chat.toolRunning", { name: msg.name || assistantName || "Assistant", tool: msg.tool_name })
                  : t("chat.toolCompleted", { name: msg.name || assistantName || "Assistant", tool: msg.tool_name })}
              </Text>
              {msg.status === "completed" && <Icon as={FaCheck} color="green.300" />}
              {msg.status === "error" && <Icon as={FaTimes} color="red.300" />}
            </Flex>
          );
        }

        if (msg.type === "automation_note" || msg.role === "system") {
          const noteText = msg.type === "automation_note"
            ? t(
              msg.automationKind === "screenshot"
                ? "shell.automationTriggeredScreenshot"
                : "shell.automationTriggeredProactive",
            )
            : msg.content;
          return (
            <Flex key={msg.id} justify="center">
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

        const incoming = msg.role === "ai";
        return (
          <Flex
            key={msg.id}
            justify={incoming ? "flex-start" : "flex-end"}
          >
            <VStack
              align={incoming ? "start" : "end"}
              maxW={compact ? "100%" : "88%"}
              gap="2"
            >
              <Text fontSize="xs" color={lunariaColors.textSubtle}>
                {formatChatMessageMeta({
                  speaker: incoming
                    ? ((msg.source === "automation" ? "" : msg.name) || assistantName || "Assistant")
                    : resolvedUserName,
                  timestamp: msg.timestamp,
                })}
              </Text>
              <Box
                px="3"
                py="2"
                borderRadius="16px"
                bg={incoming ? "rgba(255,255,255,0.9)" : getLunariaIntentStyles("primary").bg}
                color={incoming ? lunariaColors.text : getLunariaIntentStyles("primary").color}
                border="1px solid"
                borderColor={incoming ? lunariaColors.border : getLunariaIntentStyles("primary").borderColor}
                minW={compact ? "unset" : "120px"}
              >
                {msg.content && (
                  <Text whiteSpace="pre-wrap" fontSize={compact ? "sm" : "md"}>
                    {msg.content}
                  </Text>
                )}
                {(msg.attachments || []).length > 0 && (
                  <Stack mt={msg.content ? 3 : 0} gap="2">
                    {(msg.attachments || []).map((attachment, index) => renderAttachment(
                      msg.id,
                      attachment,
                      index,
                      backendUrl,
                      t("chat.attachment"),
                    ))}
                  </Stack>
                )}
              </Box>
            </VStack>
          </Flex>
        );
      })}
    </Stack>
  );
}
