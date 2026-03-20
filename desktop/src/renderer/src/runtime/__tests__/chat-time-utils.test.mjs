import test from "node:test";
import assert from "node:assert/strict";

import {
  formatChatMessageMeta,
  formatChatMessageTimestamp,
} from "../chat-time-utils.mjs";

test("formatChatMessageTimestamp omits seconds for messages from today", () => {
  const now = new Date(2026, 2, 20, 10, 0, 0);
  const timestamp = new Date(2026, 2, 20, 9, 5, 44).toISOString();

  assert.equal(formatChatMessageTimestamp(timestamp, now), "09:05");
});

test("formatChatMessageTimestamp includes month and day for messages from a different day", () => {
  const now = new Date(2026, 2, 20, 10, 0, 0);
  const timestamp = new Date(2026, 2, 19, 9, 5, 44).toISOString();

  assert.equal(formatChatMessageTimestamp(timestamp, now), "03/19 09:05");
});

test("formatChatMessageTimestamp supports unix-second timestamps from runtime messages", () => {
  const now = new Date(2026, 2, 20, 22, 0, 0);
  const timestamp = Math.floor(new Date(2026, 2, 20, 21, 7, 9).getTime() / 1000);

  assert.equal(formatChatMessageTimestamp(timestamp, now), "21:07");
});

test("formatChatMessageMeta joins speaker and formatted timestamp", () => {
  const now = new Date(2026, 2, 20, 10, 0, 0);
  const timestamp = new Date(2026, 2, 18, 7, 8, 9).toISOString();

  assert.equal(
    formatChatMessageMeta({ speaker: "Miku", timestamp, now }),
    "Miku · 03/18 07:08",
  );
});
