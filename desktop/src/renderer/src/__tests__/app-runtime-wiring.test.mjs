import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(currentDir, "../App.tsx"), "utf8");

test("App uses the lunaria runtime without mounting the legacy websocket handler", () => {
  assert.match(appSource, /LunariaRuntimeProvider/);
  assert.doesNotMatch(appSource, /WebSocketHandler/);
});
