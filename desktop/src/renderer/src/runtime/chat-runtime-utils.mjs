export function getConnectionStateAfterChatError(error) {
  return error?.name === "AbortError" ? "idle" : "error";
}
