import assert from "node:assert/strict";
import test from "node:test";

import { getPublishBlocker } from "./public-bank-domain.js";

test("publish blocker asks for a generic login before provider-specific profile setup", () => {
  assert.equal(
    getPublishBlocker({
      cloudConfigured: true,
      cloudUser: null,
      cloudProfile: null,
    }),
    "请先登录",
  );
});
