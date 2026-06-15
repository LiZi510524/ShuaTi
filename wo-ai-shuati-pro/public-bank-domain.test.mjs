import test from "node:test";
import assert from "node:assert/strict";
import {
  findSavedPublicBank,
  getPublishBlocker,
  isProfileComplete,
  mapPublicBankToLocal,
} from "./public-bank-domain.js";

test("isProfileComplete requires username and display name", () => {
  assert.equal(isProfileComplete(null), false);
  assert.equal(isProfileComplete({ username: "lizi", display_name: "" }), false);
  assert.equal(isProfileComplete({ username: "", display_name: "李子题库" }), false);
  assert.equal(isProfileComplete({ username: "lizi", display_name: "李子题库" }), true);
});

test("getPublishBlocker returns the first user-facing publish blocker", () => {
  assert.equal(getPublishBlocker({ cloudConfigured: false }), "请先配置 Supabase");
  assert.equal(getPublishBlocker({ cloudConfigured: true, cloudUser: null }), "请先用邮箱登录");
  assert.equal(
    getPublishBlocker({ cloudConfigured: true, cloudUser: { id: "u1" }, cloudProfile: { username: "lizi" } }),
    "请先设置公开用户名和昵称"
  );
  assert.equal(
    getPublishBlocker({
      cloudConfigured: true,
      cloudUser: { id: "u1" },
      cloudProfile: { username: "lizi", display_name: "李子题库" },
    }),
    ""
  );
});

test("mapPublicBankToLocal copies public bank payload into local bank and questions", () => {
  const result = mapPublicBankToLocal({
    payload: {
      bank: {
        id: "bank_cloud",
        owner_username: "lizi",
        name: "毛概 - 第一章",
        course: "毛概",
        chapter: "第一章",
        tags: ["期末"],
        counts: { single: 1 },
      },
      questions: [{
        id: "q_cloud",
        order_no: 1,
        stem: "题干",
        answer: "A",
        analysis: "解析",
        type: "single",
        options: [{ label: "A", text: "选项A", value: "A" }],
      }],
    },
    localBankId: "bank_local",
    now: "2026-06-15T00:00:00.000Z",
    createQuestionId: () => "q_local",
    buildBankName: (course, chapter, fallback) => [course, chapter].filter(Boolean).join(" - ") || fallback,
    countQuestionTypes: () => ({ single: 1, multiple: 0, judge: 0, fill: 0 }),
  });

  assert.equal(result.localBank.id, "bank_local");
  assert.equal(result.localBank.cloudId, "bank_cloud");
  assert.equal(result.localBank.sourceOwnerUsername, "lizi");
  assert.equal(result.localBank.visibility, "saved-public");
  assert.equal(result.localQuestions[0].id, "q_local");
  assert.equal(result.localQuestions[0].cloudQuestionId, "q_cloud");
  assert.equal(result.localQuestions[0].bankId, "bank_local");
});

test("findSavedPublicBank detects already saved public banks by cloudId", () => {
  const saved = findSavedPublicBank([{ id: "local", cloudId: "cloud_1" }], "cloud_1");
  assert.deepEqual(saved, { id: "local", cloudId: "cloud_1" });
  assert.equal(findSavedPublicBank([{ id: "local", cloudId: "cloud_1" }], "cloud_2"), null);
});
