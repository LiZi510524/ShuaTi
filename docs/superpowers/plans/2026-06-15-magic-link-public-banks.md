# Magic Link Public Banks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the magic-link account and public-bank sharing workflow without adding password handling.

**Architecture:** Keep `cloud.js` as the Supabase boundary and keep the PWA static. Add a small browser-safe pure domain module for auth/profile readiness and public-bank mapping so core rules can be tested outside the large `app.js`.

**Tech Stack:** Static HTML/CSS/JS ES modules, IndexedDB, Supabase REST/Auth, Node built-in test runner, Playwright smoke test.

---

## Files

- Create: `wo-ai-shuati-pro/public-bank-domain.js`
  - Pure helpers for profile completeness, publish readiness, public-bank mapping, and duplicate detection.
- Create: `wo-ai-shuati-pro/public-bank-domain.test.mjs`
  - Node tests for the pure helpers.
- Modify: `wo-ai-shuati-pro/app.js`
  - Import the helper module.
  - Use readiness checks before publishing.
  - Use mapping helper when saving public banks.
  - Improve magic-link and profile UI copy.
  - Add publish confirmation that explicitly mentions questions, answers, and analyses become public.
- Modify: `package.json`
  - Add `test:unit`.
  - Make `npm test` run unit tests before smoke tests.
- Modify: `docs/LOCAL_DEV.md`
  - Document `npm run test:unit`.

## Task 1: Domain Helpers and Unit Tests

**Files:**
- Create: `wo-ai-shuati-pro/public-bank-domain.js`
- Create: `wo-ai-shuati-pro/public-bank-domain.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write tests first**

Create `wo-ai-shuati-pro/public-bank-domain.test.mjs`:

```js
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
```

- [ ] **Step 2: Add test script**

Update `package.json` scripts to include:

```json
{
  "scripts": {
    "dev": "node tools/dev-server.mjs",
    "fixture:smoke": "node tools/create-smoke-fixture.mjs",
    "test": "npm run test:unit && npm run fixture:smoke && npm run test:smoke",
    "test:unit": "node --test wo-ai-shuati-pro/*.test.mjs",
    "test:app": "node wo-ai-shuati-pro/smoke-test.mjs",
    "test:smoke": "node tools/run-smoke-test.mjs"
  }
}
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```powershell
npm run test:unit
```

Expected: FAIL because `public-bank-domain.js` does not exist or exports are missing.

- [ ] **Step 4: Implement pure helpers**

Create `wo-ai-shuati-pro/public-bank-domain.js`:

```js
export function isProfileComplete(profile) {
  return Boolean(String(profile?.username || "").trim() && String(profile?.display_name || "").trim());
}

export function getPublishBlocker({ cloudConfigured, cloudUser, cloudProfile }) {
  if (!cloudConfigured) return "请先配置 Supabase";
  if (!cloudUser) return "请先用邮箱登录";
  if (!isProfileComplete(cloudProfile)) return "请先设置公开用户名和昵称";
  return "";
}

export function findSavedPublicBank(banks, cloudId) {
  return banks.find((bank) => bank.cloudId === cloudId) || null;
}

export function mapPublicBankToLocal({
  payload,
  localBankId,
  now,
  createQuestionId,
  buildBankName,
  countQuestionTypes,
}) {
  const localQuestions = payload.questions.map((question, index) => ({
    id: createQuestionId(),
    cloudQuestionId: question.id,
    bankId: localBankId,
    order: question.order_no || index + 1,
    stem: question.stem,
    answer: question.answer,
    analysis: question.analysis || "",
    type: question.type,
    options: question.options || [],
    createdAt: now,
  }));
  const localCourse = String(payload.bank.course || payload.bank.name || "公开题库").trim();
  const localChapter = String(payload.bank.chapter || "").trim();
  const localBank = {
    id: localBankId,
    cloudId: payload.bank.id,
    sourceOwnerUsername: payload.bank.owner_username,
    name: buildBankName(localCourse, localChapter, payload.bank.name),
    course: localCourse,
    chapter: localChapter,
    tags: payload.bank.tags || [],
    questionCount: localQuestions.length,
    counts: payload.bank.counts || countQuestionTypes(localQuestions),
    visibility: "saved-public",
    createdAt: now,
    updatedAt: now,
    lastStudiedAt: "",
  };
  return { localBank, localQuestions };
}
```

- [ ] **Step 5: Verify unit tests pass**

Run:

```powershell
npm run test:unit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json wo-ai-shuati-pro/public-bank-domain.js wo-ai-shuati-pro/public-bank-domain.test.mjs
git commit -m "test(auth): cover public bank domain rules"
```

## Task 2: Publish Readiness and Account Copy

**Files:**
- Modify: `wo-ai-shuati-pro/app.js`
- Test: `wo-ai-shuati-pro/public-bank-domain.test.mjs`

- [ ] **Step 1: Import helpers**

At the top of `wo-ai-shuati-pro/app.js`, add:

```js
import { findSavedPublicBank, getPublishBlocker, isProfileComplete, mapPublicBankToLocal } from "./public-bank-domain.js";
```

- [ ] **Step 2: Add routing helper for publish blockers**

Add this near `publishLocalBank`:

```js
function routeToAccountWithMessage(message) {
  state.view = "account";
  showToast(message);
  render();
}
```

- [ ] **Step 3: Replace publish readiness checks**

In `publishLocalBank`, replace the config/login/profile checks with:

```js
const blocker = getPublishBlocker({
  cloudConfigured: state.cloudConfigured,
  cloudUser: state.cloudUser,
  cloudProfile: state.cloudProfile,
});
if (blocker) {
  routeToAccountWithMessage(blocker);
  return;
}
```

- [ ] **Step 4: Strengthen publish confirmation**

Replace the existing confirm text with:

```js
const message = `确定公开发布“${getBankTitle(bank)}”吗？\n\n公开后，题目、正确答案和解析都会被其他人搜索、查看和保存。你的邮箱不会公开展示，公开署名为 @${state.cloudProfile.username}。`;
if (!confirm(message)) return;
```

- [ ] **Step 5: Require display name when saving profile**

In `saveProfile`, replace profile construction with:

```js
const displayName = cleanText(document.querySelector("#profileDisplay")?.value || "");
if (!displayName) throw new Error("昵称不能为空");
const profile = {
  id: state.cloudUser.id,
  username,
  display_name: displayName,
  bio: cleanText(document.querySelector("#profileBio")?.value || ""),
};
```

- [ ] **Step 6: Improve account panel copy**

In `renderEmailAccountPanel`, unauthenticated copy should say:

```html
<p class="subtle">输入邮箱后会发送登录链接。本项目不设置密码，也不会公开展示你的邮箱。</p>
```

In `renderProfileForm`, add copy before fields:

```html
<p class="subtle">发布题库前需要设置公开用户名和昵称。公开题库会展示这些署名信息，但不会展示邮箱。</p>
```

- [ ] **Step 7: Verify**

Run:

```powershell
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add wo-ai-shuati-pro/app.js
git commit -m "feat(auth): gate publishing behind magic link profile"
```

## Task 3: Guest Public Bank Save Improvements

**Files:**
- Modify: `wo-ai-shuati-pro/app.js`
- Test: `wo-ai-shuati-pro/public-bank-domain.test.mjs`

- [ ] **Step 1: Use duplicate detection before saving**

In `usePublicBank`, after loading payload, add:

```js
const existing = findSavedPublicBank(state.banks, payload.bank.id);
if (existing) {
  state.currentBankId = existing.id;
  localStorage.setItem(CURRENT_BANK_KEY, existing.id);
  await loadCurrentBank();
  resetPracticeQueue();
  state.view = "practice";
  showToast("这个公开题库已经保存过，已打开本地副本");
  render();
  return;
}
```

- [ ] **Step 2: Replace manual mapping with helper**

Replace the local question and local bank construction block in `usePublicBank` with:

```js
const localBankId = createId("bank");
const now = new Date().toISOString();
const { localBank, localQuestions } = mapPublicBankToLocal({
  payload,
  localBankId,
  now,
  createQuestionId: () => createId("q"),
  buildBankName,
  countQuestionTypes,
});
```

- [ ] **Step 3: Improve public bank cards**

In `renderPublicBankCard`, add duplicate-aware button text:

```js
const saved = findSavedPublicBank(state.banks, bank.id);
const saveLabel = saved ? "打开本地副本" : "保存到我的题库";
```

Use `saveLabel` in the save button:

```html
<button class="button" type="button" data-action="use-public-bank" data-id="${bank.id}">${saveLabel}</button>
```

- [ ] **Step 4: Verify**

Run:

```powershell
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add wo-ai-shuati-pro/app.js
git commit -m "feat(discover): improve guest public bank saves"
```

## Task 4: Documentation and Final Verification

**Files:**
- Modify: `docs/LOCAL_DEV.md`
- Modify: `docs/superpowers/specs/2026-06-15-magic-link-public-banks-design.md` only if implementation decisions differ from the approved design.

- [ ] **Step 1: Document unit test command**

Add under common commands in `docs/LOCAL_DEV.md`:

    ```powershell
    npm run test:unit
    ```

    Runs the pure JavaScript domain tests for account/profile/public-bank rules.

- [ ] **Step 2: Run full verification**

Run:

```powershell
npm test
```

Expected: PASS with unit test output and smoke JSON containing `"logs": []`.

- [ ] **Step 3: Check git status**

Run:

```powershell
git status --short --branch
```

Expected: only intended docs changes remain before commit.

- [ ] **Step 4: Commit**

```powershell
git add docs/LOCAL_DEV.md
git commit -m "docs(dev): document public bank test workflow"
```

## Final Review

- [ ] Confirm no password login or password storage was added.
- [ ] Confirm guest search/save remains available.
- [ ] Confirm publish requires configured Supabase, logged-in user, and complete public profile.
- [ ] Confirm publish confirmation mentions public questions, answers, and analyses.
- [ ] Confirm email is not shown in public bank cards.
- [ ] Confirm `npm test` passes.
