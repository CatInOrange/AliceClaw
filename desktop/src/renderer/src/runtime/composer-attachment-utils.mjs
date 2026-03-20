function extractDataUrlParts(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  return {
    data: match[2] || "",
    mediaType: match[1] || "application/octet-stream",
  };
}

function detectAttachmentKind(mimeType = "application/octet-stream") {
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType.startsWith("audio/")) {
    return "audio";
  }
  if (mimeType.startsWith("video/")) {
    return "video";
  }
  return "file";
}

export function createFileComposerAttachment({
  file,
  id,
  previewUrl = "",
} = {}) {
  const mimeType = file?.type || "application/octet-stream";
  return {
    data: "",
    file,
    filename: file?.name || "attachment",
    id,
    kind: detectAttachmentKind(mimeType),
    mimeType,
    previewUrl,
    source: "base64",
  };
}

export function createTempFileComposerAttachment({
  cleanupToken,
  fileUrl,
  filename = "capture.png",
  id,
  kind = "image",
  mimeType = "image/png",
} = {}) {
  return {
    cleanupToken,
    data: "",
    filename,
    id,
    kind,
    mimeType,
    previewUrl: fileUrl,
    source: "base64",
    tempFileUrl: fileUrl,
  };
}

export function resolveComposerAttachmentChatInput({
  attachment,
  resolvedDataUrl,
} = {}) {
  if (attachment?.data) {
    return {
      data: attachment.data,
      mediaType: attachment.mimeType,
      type: attachment.source,
    };
  }

  const resolvedPayload = extractDataUrlParts(resolvedDataUrl);
  if (!resolvedPayload) {
    throw new Error("missing attachment payload");
  }

  return {
    data: resolvedPayload.data,
    mediaType: resolvedPayload.mediaType || attachment?.mimeType,
    type: "base64",
  };
}
