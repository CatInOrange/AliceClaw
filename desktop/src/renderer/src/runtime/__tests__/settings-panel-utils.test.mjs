import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSupportedLanguage,
  resolveProviderFieldLabel,
  resolveProviderFieldPlaceholder,
} from "../settings-panel-utils.mjs";

test("normalizeSupportedLanguage keeps supported languages and normalizes region variants", () => {
  assert.equal(normalizeSupportedLanguage("en"), "en");
  assert.equal(normalizeSupportedLanguage("en-US"), "en");
  assert.equal(normalizeSupportedLanguage("zh"), "zh");
  assert.equal(normalizeSupportedLanguage("zh-CN"), "zh");
});

test("normalizeSupportedLanguage falls back to english for unsupported input", () => {
  assert.equal(normalizeSupportedLanguage("fr"), "en");
  assert.equal(normalizeSupportedLanguage(""), "en");
  assert.equal(normalizeSupportedLanguage(undefined), "en");
});

test("resolveProviderFieldLabel prefers backend label and falls back to a readable field key", () => {
  assert.equal(resolveProviderFieldLabel({ label: "API Key", key: "apiKey" }), "API Key");
  assert.equal(resolveProviderFieldLabel({ key: "baseUrl" }), "Base Url");
  assert.equal(resolveProviderFieldLabel({ key: "bridge_url" }), "Bridge Url");
});

test("resolveProviderFieldPlaceholder prefers explicit placeholder and otherwise uses the resolved label", () => {
  assert.equal(
    resolveProviderFieldPlaceholder({ placeholder: "sk-...", label: "API Key", key: "apiKey" }),
    "sk-...",
  );
  assert.equal(
    resolveProviderFieldPlaceholder({ label: "Endpoint", key: "baseUrl" }),
    "Endpoint",
  );
  assert.equal(
    resolveProviderFieldPlaceholder({ key: "baseUrl" }),
    "Base Url",
  );
});
