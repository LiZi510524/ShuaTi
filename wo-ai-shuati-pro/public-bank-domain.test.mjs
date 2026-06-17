import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSavedBankRelation,
  getPublishBlocker,
  mapCloudProgressToLocal,
  mergeProgressRows,
} from "./public-bank-domain.js";

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

test("saved public bank relation is scoped to the current user", () => {
  assert.deepEqual(
    buildSavedBankRelation({
      userId: "user_a",
      cloudBankId: "bank_public_1",
      localBankId: "bank_local_1",
      now: "2026-06-16T00:00:00.000Z",
    }),
    {
      id: "user_a_bank_public_1",
      user_id: "user_a",
      bank_id: "bank_public_1",
      local_bank_id: "bank_local_1",
      saved_at: "2026-06-16T00:00:00.000Z",
      updated_at: "2026-06-16T00:00:00.000Z",
    },
  );
});

test("cloud progress maps back to the local question id before merging", () => {
  const mapped = mapCloudProgressToLocal({
    cloudRows: [{
      question_id: "cloud_q_1",
      bank_id: "cloud_bank",
      selected_answer: "A",
      answered: true,
      correct: true,
      attempts: 2,
      wrong_count: 1,
      favorite: true,
      mastered: false,
      last_answered_at: "2026-06-16T01:00:00.000Z",
      updated_at: "2026-06-16T01:00:00.000Z",
    }],
    questions: [{
      id: "local_q_1",
      bankId: "local_bank",
      cloudQuestionId: "cloud_q_1",
    }],
  });

  assert.deepEqual(mapped, [{
    id: "local_q_1",
    questionId: "local_q_1",
    bankId: "local_bank",
    selectedAnswer: "A",
    answered: true,
    correct: true,
    attempts: 2,
    wrongCount: 1,
    favorite: true,
    mastered: false,
    lastAnsweredAt: "2026-06-16T01:00:00.000Z",
    cloudUpdatedAt: "2026-06-16T01:00:00.000Z",
  }]);
});

test("progress merge keeps newer answer state while preserving larger counters", () => {
  const merged = mergeProgressRows({
    localRows: [{
      id: "local_q_1",
      questionId: "local_q_1",
      bankId: "local_bank",
      selectedAnswer: "B",
      answered: true,
      correct: false,
      attempts: 4,
      wrongCount: 3,
      favorite: false,
      mastered: false,
      lastAnsweredAt: "2026-06-16T02:00:00.000Z",
    }],
    cloudRows: [{
      id: "local_q_1",
      questionId: "local_q_1",
      bankId: "local_bank",
      selectedAnswer: "A",
      answered: true,
      correct: true,
      attempts: 2,
      wrongCount: 1,
      favorite: true,
      mastered: false,
      lastAnsweredAt: "2026-06-16T01:00:00.000Z",
      cloudUpdatedAt: "2026-06-16T01:00:00.000Z",
    }],
  });

  assert.equal(merged.length, 1);
  assert.equal(merged[0].selectedAnswer, "B");
  assert.equal(merged[0].correct, false);
  assert.equal(merged[0].attempts, 4);
  assert.equal(merged[0].wrongCount, 3);
  assert.equal(merged[0].favorite, true);
});
