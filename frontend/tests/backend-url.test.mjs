import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("tauri frontend defaults to localhost backend url", async () => {
  globalThis.window = {
    __TAURI__: true,
    location: { search: "" },
  };
  globalThis.localStorage = createStorage();

  const moduleUrl = pathToFileURL(path.resolve("frontend/public/js/backend-url.js")).href;
  const { getBackendBaseUrl, backendUrl } = await import(`${moduleUrl}?case=tauri-default`);

  assert.equal(getBackendBaseUrl(), "http://127.0.0.1:18080");
  assert.equal(backendUrl("/api/model"), "http://127.0.0.1:18080/api/model");
});
