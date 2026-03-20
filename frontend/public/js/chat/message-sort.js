/**
 * Message ordering helpers.
 */

/**
 * Sort messages so that upload image messages are placed after the next assistant reply.
 *
 * Rule:
 * - If an upload message follows a user message (common for `/api/upload` image push),
 *   keep it pending until we hit an assistant message, then insert it after that reply.
 * - Any remaining uploads are appended at the end.
 *
 * @param {Array<any>} messages
 * @returns {Array<any>}
 */
export function sortMessagesWithUploads(messages) {
  if (!messages || messages.length <= 1) return messages;

  const result = [];
  const pendingUploads = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg?.source === 'upload' && (msg?.attachments?.length || 0) > 0) {
      pendingUploads.push(msg);
      continue;
    }

    result.push(msg);

    if (msg?.role === 'assistant' && pendingUploads.length > 0) {
      result.push(...pendingUploads);
      pendingUploads.length = 0;
    }
  }

  if (pendingUploads.length > 0) {
    result.push(...pendingUploads);
  }

  return result;
}
