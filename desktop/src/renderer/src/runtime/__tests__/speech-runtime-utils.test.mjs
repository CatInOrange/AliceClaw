import test from "node:test";
import assert from "node:assert/strict";

import {
  createNextPlaybackVersion,
  isPlaybackVersionCurrent,
  shouldSpeakRealtimeMessage,
} from "../speech-runtime-utils.mjs";

test("shouldSpeakRealtimeMessage ignores current-session assistant messages that are not push", () => {
  assert.equal(
    shouldSpeakRealtimeMessage(
      {
        id: "msg_1",
        sessionId: "session_active",
        role: "assistant",
        source: "chat",
      },
      "session_active",
    ),
    false,
  );
});

test("shouldSpeakRealtimeMessage still allows current-session push messages", () => {
  assert.equal(
    shouldSpeakRealtimeMessage(
      {
        id: "msg_2",
        sessionId: "session_active",
        role: "assistant",
        source: "push",
      },
      "session_active",
    ),
    true,
  );
});

test("isPlaybackVersionCurrent invalidates older queued playback work after an interrupt bump", () => {
  const initialVersion = 1;
  const activeVersion = createNextPlaybackVersion(initialVersion);

  assert.equal(isPlaybackVersionCurrent(initialVersion, activeVersion), false);
  assert.equal(isPlaybackVersionCurrent(activeVersion, activeVersion), true);
});
