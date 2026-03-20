import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(currentDir, "../ai-state-context.tsx"), "utf8");

test("AiStateProvider keeps setAiState stable by using a functional state update", () => {
  assert.match(source, /setAiStateInternal\(\(currentState/);
  assert.doesNotMatch(source, /}, \[aiState\]\);/);
});
