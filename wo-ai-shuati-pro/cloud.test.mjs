import test from "node:test";
import assert from "node:assert/strict";
import { getMagicLinkRedirectUrl } from "./cloud.js";

test("getMagicLinkRedirectUrl uses configured production appUrl", () => {
  const redirectUrl = getMagicLinkRedirectUrl(
    { appUrl: "https://lizi510524.github.io/ShuaTi/wo-ai-shuati-pro/" },
    { origin: "https://example.test", pathname: "/preview/" },
  );

  assert.equal(redirectUrl, "https://lizi510524.github.io/ShuaTi/wo-ai-shuati-pro/");
});

test("getMagicLinkRedirectUrl falls back to current path when appUrl is empty", () => {
  const redirectUrl = getMagicLinkRedirectUrl(
    { appUrl: "" },
    { origin: "https://example.test", pathname: "/preview/" },
  );

  assert.equal(redirectUrl, "https://example.test/preview/");
});
