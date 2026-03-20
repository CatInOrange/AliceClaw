import test from "node:test";
import assert from "node:assert/strict";

import { getConnectionStateAfterChatError } from "../chat-runtime-utils.mjs";

test("getConnectionStateAfterChatError keeps idle for AbortError", () => {
  assert.equal(
    getConnectionStateAfterChatError({ name: "AbortError" }),
    "idle",
  );
});

test("getConnectionStateAfterChatError marks non-abort failures as error", () => {
  assert.equal(
    getConnectionStateAfterChatError(new Error("network failed")),
    "error",
  );
});
