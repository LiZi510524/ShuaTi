import { cloud, CLOUD_API_VERSION } from "./cloud.js";
import { findSavedPublicBank, getPublishBlocker, isProfileComplete, mapPublicBankToLocal } from "./public-bank-domain.js";

const DB_NAME = "wo-ai-shuati-pro-db";
const DB_VERSION = 1;
const STORE_BANKS = "banks";
const STORE_QUESTIONS = "questions";
const STORE_PROGRESS = "progress";
const CURRENT_BANK_KEY = "wo-ai-shuati-pro-current-bank";
const PRACTICE_SESSION_KEY = "wo-ai-shuati-pro-practice-session";

const state = {
  view: "banks",
  banks: [],
  allProgress: [],
  currentBankId: localStorage.getItem(CURRENT_BANK_KEY) || "",
  questions: [],
  progress: new Map(),
  practiceMode: "sequential",
  queue: [],
  queueIndex: 0,
  selected: new Set(),
  submitted: false,
  lastResult: null,
  bankFilter: "",
  cloudConfigured: cloud.configured,
  cloudUser: null,
  cloudProfile: null,
  cloudReady: false,
  publicBanks: [],
  discoverQuery: "",
  discoverProfile: null,
  discoverLoading: false,
  syncStatus: "",
  editingBankId: "",
  questionPickerOpen: false,
};

const view = document.querySelector("#view");
const toast = document.querySelector("#toast");
let dbPromise = null;
let toastTimer = null;

boot();

async function boot() {
  bindGlobalEvents();
  await initCloud();
  await refreshBanks();
  if (state.currentBankId && state.banks.some((bank) => bank.id === state.currentBankId)) {
    await loadCurrentBank();
  } else if (state.banks[0]) {
    setCurrentBank(state.banks[0].id, false);
    await loadCurrentBank();
  }
  const sharedQuery = readSharedQuery();
  if (sharedQuery) {
    state.view = "discover";
    state.discoverQuery = sharedQuery;
    if (state.cloudConfigured) await searchPublicBanks();
  }
  render();
  registerServiceWorker();
}

function readSharedQuery() {
  const params = new URLSearchParams(location.search);
  return params.get("u") || params.get("user") || params.get("bank") || params.get("q") || "";
}

async function initCloud() {
  if (!state.cloudConfigured) return;
  cloud.handleAuthRedirect();
  if (!cloud.session?.access_token) {
    state.cloudReady = true;
    return;
  }
  try {
    const user = await cloud.getUser();
    state.cloudUser = user;
    state.cloudProfile = await cloud.getMyProfile(user.id);
  } catch (error) {
    console.warn("云端会话失效", error);
    cloud.clearSession();
    state.cloudUser = null;
    state.cloudProfile = null;
  } finally {
    state.cloudReady = true;
  }
}

function bindGlobalEvents() {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", async () => {
      state.editingBankId = "";
      state.questionPickerOpen = false;
      state.view = button.dataset.view;
      if (state.view === "practice" && state.currentBankId && state.questions.length === 0) {
        await loadCurrentBank();
      }
      render();
    });
  });

  view.addEventListener("click", handleViewClick);
  view.addEventListener("submit", handleViewSubmit);
  view.addEventListener("change", handleViewChange);
  view.addEventListener("input", handleViewInput);
}

async function handleViewClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  const id = target.dataset.id;

  if (action === "select-bank") {
    await selectBank(id, "practice");
  }
  if (action === "open-bank") {
    await selectBank(id, "banks");
  }
  if (action === "delete-bank") {
    await deleteBank(id);
  }
  if (action === "publish-bank") {
    await publishLocalBank(id);
  }
  if (action === "copy-bank-id") {
    await copyText(id);
  }
  if (action === "edit-bank") {
    openBankEditor(id);
  }
  if (action === "close-edit-bank") {
    closeBankEditor();
  }
  if (action === "toggle-question-picker") {
    toggleQuestionPicker();
  }
  if (action === "close-question-picker") {
    closeQuestionPicker();
  }
  if (action === "jump-question") {
    jumpToQuestion(Number(target.dataset.index));
  }
  if (action === "set-mode") {
    state.practiceMode = target.dataset.mode;
    state.questionPickerOpen = false;
    resetPracticeQueue();
    render();
  }
  if (action === "start-practice") {
    startPractice();
  }
  if (action === "resume-practice") {
    resumePractice();
  }
  if (action === "choose-option") {
    chooseOption(target.dataset.value);
  }
  if (action === "submit-answer") {
    await submitAnswer();
  }
  if (action === "next-question") {
    nextQuestion();
  }
  if (action === "toggle-favorite") {
    await toggleFavorite(target.dataset.questionId);
  }
  if (action === "add-wrong") {
    await addToWrongBook(target.dataset.questionId);
  }
  if (action === "practice-wrong") {
    state.view = "practice";
    state.practiceMode = "wrong";
    state.questionPickerOpen = false;
    startPractice();
  }
  if (action === "master-question") {
    await markMastered(target.dataset.questionId);
  }
  if (action === "export-backup") {
    await exportBackup();
  }
  if (action === "clear-all") {
    await clearAllData();
  }
  if (action === "send-login-link") {
    await sendLoginLink();
  }
  if (action === "sign-out") {
    await signOutCloud();
  }
  if (action === "save-profile") {
    await saveProfile();
  }
  if (action === "search-public") {
    await searchPublicBanks();
  }
  if (action === "use-public-bank") {
    await usePublicBank(id);
  }
  if (action === "open-owner") {
    await openOwnerProfile(target.dataset.username);
  }
  if (action === "sync-progress") {
    await syncProgress();
  }
}

async function handleViewSubmit(event) {
  if (event.target.matches("#importForm")) {
    event.preventDefault();
    await importQuestionBank(new FormData(event.target));
  }
  if (event.target.matches("#bankEditForm")) {
    event.preventDefault();
    await saveBankEdit(new FormData(event.target));
  }
}

async function handleViewChange(event) {
  if (event.target.matches("#restoreFile")) {
    const file = event.target.files?.[0];
    if (file) await importBackup(file);
  }
}

function handleViewInput(event) {
  if (event.target.matches("#bankSearch")) {
    state.bankFilter = event.target.value.trim();
    renderBankList();
  }
  if (event.target.matches("#discoverSearch")) {
    state.discoverQuery = event.target.value.trim();
  }
  if (event.target.matches("#fillAnswer")) {
    const fillValue = cleanText(event.target.value || "");
    state.selected = fillValue ? new Set([fillValue]) : new Set();
    persistPracticeSession();
  }
}

function render() {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === state.view);
  });

  if (state.view === "banks") renderBanks();
  if (state.view === "practice") renderPractice();
  if (state.view === "discover") renderDiscover();
  if (state.view === "wrong") renderWrong();
  if (state.view === "stats") renderStats();
  if (state.view === "settings") renderSettings();
  if (state.view === "account") renderAccount();
}

function renderBanks() {
  const banks = getFilteredBanks();
  const totalQuestions = state.banks.reduce((sum, bank) => sum + bank.questionCount, 0);
  const totalWrong = state.allProgress.filter((item) => item.wrongCount > 0).length;

  view.innerHTML = `
    <section class="desktop-columns">
      <form id="importForm" class="panel form-grid" autocomplete="off">
        <h2>导入题库</h2>
        <div class="form-grid two">
          <div class="field">
            <label for="courseName">课程</label>
            <input id="courseName" name="course" type="text" placeholder="毛概" required />
          </div>
          <div class="field">
            <label for="chapterName">章节</label>
            <input id="chapterName" name="chapter" type="text" placeholder="导论" />
          </div>
        </div>
        <div class="field">
          <label for="bankTags">标签</label>
          <input id="bankTags" name="tags" type="text" placeholder="期末, 重点, 老师题库" />
        </div>
        <div class="field">
          <label for="xlsxFile">Excel 文件</label>
          <input id="xlsxFile" name="file" type="file" accept=".xlsx" required />
        </div>
        <button class="button" type="submit">导入为新题库</button>
      </form>

      <section class="panel bank-library-panel">
        <div class="bank-head">
          <div>
            <h2>我的题库</h2>
          </div>
        </div>
        <section class="metric-row bank-library-metrics">
          <div class="metric"><strong>${state.banks.length}</strong><span>题库</span></div>
          <div class="metric"><strong>${totalQuestions}</strong><span>总题数</span></div>
          <div class="metric"><strong>${totalWrong}</strong><span>错题</span></div>
        </section>
        <div class="field">
          <label for="bankSearch">搜索题库/标签</label>
          <input id="bankSearch" type="search" value="${escapeAttr(state.bankFilter)}" placeholder="输入课程、章节或标签" />
        </div>
        <div class="bank-list" data-bank-list>${renderBankListContent(banks)}</div>
      </section>
    </section>
    ${renderBankEditSheet()}
  `;
}

function renderBankList() {
  const list = view.querySelector("[data-bank-list]");
  if (!list) return;
  list.innerHTML = renderBankListContent(getFilteredBanks());
}

function renderBankListContent(banks) {
  return banks.length
    ? banks.map(renderBankCard).join("")
    : renderEmpty("还没有题库", "先导入一个 Excel 题库，就能开始刷题。");
}

function renderBankCard(bank) {
  const progress = getBankProgress(bank.id);
  const accuracy = progress.done ? Math.round((progress.correct / progress.done) * 100) : 0;
  const tags = [...(bank.tags || [])].filter(Boolean);
  const course = getBankTitle(bank);
  const chapter = cleanText(bank.chapter);
  return `
    <article class="bank-card">
      <div class="bank-head bank-card-head">
        <div class="bank-title-wrap">
          <h3 class="bank-title">
            <span class="bank-course">${escapeHtml(course)}</span>
            ${chapter ? `<span class="bank-chapter">${escapeHtml(chapter)}</span>` : ""}
          </h3>
          <p class="bank-meta">${bank.questionCount} 题 · 单选 ${bank.counts.single || 0} · 多选 ${bank.counts.multiple || 0} · 判断 ${bank.counts.judge || 0}</p>
        </div>
        <div class="bank-head-actions">
          ${bank.id === state.currentBankId ? `<span class="type-pill good">当前</span>` : ""}
          <button class="ghost-button edit-inline-button" type="button" data-action="edit-bank" data-id="${bank.id}">编辑</button>
        </div>
      </div>
      ${tags.length ? `<div class="tag-row">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      <div class="progress-track" aria-label="完成进度">
        <div class="progress-fill" style="width:${progress.rate}%"></div>
      </div>
      <p class="bank-meta">已做 ${progress.done}/${bank.questionCount} · 正确率 ${accuracy}% · 错题 ${progress.wrong}</p>
      <div class="actions bank-actions">
        <button class="button" type="button" data-action="select-bank" data-id="${bank.id}">开始刷题</button>
        <button class="ghost-button" type="button" data-action="open-bank" data-id="${bank.id}">设为当前</button>
        <button class="ghost-button" type="button" data-action="publish-bank" data-id="${bank.id}">${bank.cloudId ? "更新发布" : "公开发布"}</button>
        ${bank.cloudId ? `<button class="ghost-button" type="button" data-action="copy-bank-id" data-id="${bank.cloudId}">复制ID</button>` : ""}
        <button class="danger-button" type="button" data-action="delete-bank" data-id="${bank.id}">删除</button>
      </div>
    </article>
  `;
}

function renderBankEditSheet() {
  if (!state.editingBankId) return "";
  const bank = state.banks.find((item) => item.id === state.editingBankId);
  if (!bank) return "";
  return `
    <div class="sheet-backdrop" data-action="close-edit-bank"></div>
    <section class="edit-sheet" role="dialog" aria-modal="true" aria-labelledby="bankEditTitle">
      <form id="bankEditForm" class="panel form-grid" autocomplete="off">
        <div class="bank-head">
          <div>
            <h2 id="bankEditTitle">编辑题库</h2>
            <p class="subtle">课程、章节和标签会一起保存。</p>
          </div>
          <button class="icon-button" type="button" data-action="close-edit-bank" aria-label="关闭">×</button>
        </div>
        <input type="hidden" name="id" value="${escapeAttr(bank.id)}" />
        <div class="form-grid three">
          <div class="field">
            <label for="editCourseName">课程</label>
            <input id="editCourseName" name="course" type="text" value="${escapeAttr(bank.course || getBankTitle(bank))}" required />
          </div>
          <div class="field">
            <label for="editChapterName">章节</label>
            <input id="editChapterName" name="chapter" type="text" value="${escapeAttr(bank.chapter || "")}" />
          </div>
          <div class="field">
            <label for="editBankTags">标签</label>
            <input id="editBankTags" name="tags" type="text" value="${escapeAttr((bank.tags || []).join(", "))}" />
          </div>
        </div>
        <div class="actions edit-sheet-actions">
          <button class="ghost-button" type="button" data-action="close-edit-bank">取消</button>
          <button class="button" type="submit">保存</button>
        </div>
      </form>
    </section>
  `;
}

function renderDiscover() {
  const configNote = state.cloudConfigured
    ? "搜索用户名、课程、章节、标签或题库 ID。公开题库可以直接保存到本地刷。"
    : "还没有配置 Supabase，发现页会在配置后启用。";
  view.innerHTML = `
    <section class="panel discover-panel">
      <h2>发现题库</h2>
      <p class="subtle">${configNote}</p>
      <div class="field">
        <label for="discoverSearch">用户名 / 题库 ID / 课程标签</label>
        <input id="discoverSearch" type="search" value="${escapeAttr(state.discoverQuery)}" placeholder="maogai、bank_xxx、毛概" />
      </div>
      <div class="actions discover-actions">
        <button class="button" type="button" data-action="search-public" ${state.cloudConfigured ? "" : "disabled"}>搜索公开题库</button>
      </div>
    </section>
    ${state.discoverProfile ? renderProfilePreview(state.discoverProfile) : ""}
    <section class="bank-list">
      ${state.discoverLoading ? renderEmpty("正在搜索", "稍等一下。") : ""}
      ${!state.discoverLoading && state.publicBanks.length ? state.publicBanks.map(renderPublicBankCard).join("") : ""}
      ${!state.discoverLoading && !state.publicBanks.length ? renderEmpty("暂无结果", state.cloudConfigured ? "输入用户名或题库 ID 后搜索。" : "先在 config.js 配置 Supabase。") : ""}
    </section>
  `;
}

function renderProfilePreview(profile) {
  return `
    <section class="panel">
      <div class="bank-head">
        <div>
          <h2>@${escapeHtml(profile.username)}</h2>
          <p class="subtle">${escapeHtml(profile.display_name || profile.username)} · ${escapeHtml(profile.bio || "这个人还没有写简介")}</p>
        </div>
      </div>
    </section>
  `;
}

function renderPublicBankCard(bank) {
  const tags = [bank.course, bank.chapter, ...(bank.tags || [])].filter(Boolean);
  const saved = findSavedPublicBank(state.banks, bank.id);
  const saveLabel = saved ? "打开本地副本" : "保存到我的题库";
  return `
    <article class="bank-card">
      <div class="bank-head">
        <div>
          <h3 class="bank-title">${escapeHtml(getBankTitle(bank))}</h3>
          <p class="bank-meta">${bank.question_count || 0} 题 · 作者 @${escapeHtml(bank.owner_username || "unknown")} · ID ${escapeHtml(bank.id)}</p>
        </div>
        <span class="type-pill good">公开</span>
      </div>
      ${tags.length ? `<div class="tag-row">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      <div class="actions">
        <button class="button" type="button" data-action="use-public-bank" data-id="${bank.id}">${saveLabel}</button>
        <button class="ghost-button" type="button" data-action="open-owner" data-username="${escapeAttr(bank.owner_username || "")}">看主页</button>
        <button class="ghost-button" type="button" data-action="copy-bank-id" data-id="${bank.id}">复制ID</button>
      </div>
    </article>
  `;
}

function renderAccount() {
  const bank = getCurrentBank();
  const summary = bank ? getCurrentSummary() : null;
  view.innerHTML = `
    ${renderAccountHero()}
    ${renderEmailAccountPanel()}
    ${renderProfileForm()}
    ${bank ? `
      <section class="panel account-section">
        <h2>当前题库统计</h2>
        <p class="subtle">${escapeHtml(getBankTitle(bank))}</p>
        <div class="metric-row">
          <div class="metric"><strong>${summary.done}</strong><span>已做</span></div>
          <div class="metric"><strong>${summary.accuracy}%</strong><span>正确率</span></div>
          <div class="metric"><strong>${summary.wrong}</strong><span>错题</span></div>
        </div>
        <div class="actions" style="margin-top:12px;">
          <button class="ghost-button" type="button" data-action="sync-progress" ${state.cloudUser ? "" : "disabled"}>同步练习记录</button>
        </div>
      </section>
    ` : ""}
    ${renderSettingsContent()}
  `;
}

function renderAccountHero() {
  const label = state.cloudUser ? (state.cloudProfile?.display_name || state.cloudProfile?.username || state.cloudUser.email || "已登录") : "本地学习";
  const subtitle = state.cloudUser
    ? state.cloudUser.email || "邮箱账号已连接"
    : state.cloudConfigured
      ? "邮箱登录后可发布题库和同步记录"
      : "当前为本地模式，题库和练习记录保存在本机";
  const badge = state.cloudUser ? "已登录" : state.cloudConfigured ? "可登录" : "本地";
  return `
    <section class="panel account-hero">
      <div class="account-main">
        <div class="account-avatar">${escapeHtml(getAvatarText(label))}</div>
        <div>
          <h2>${escapeHtml(label)}</h2>
          <p class="subtle">${escapeHtml(subtitle)}</p>
        </div>
      </div>
      <span class="type-pill ${state.cloudUser ? "good" : ""}">${escapeHtml(badge)}</span>
    </section>
  `;
}

function renderEmailAccountPanel() {
  if (!state.cloudConfigured) {
    return `
      <section class="panel account-section">
        <h2>账号</h2>
        <div class="setting-list">
          <div class="setting-row">
            <div>
              <strong>本地模式</strong>
              <p class="subtle">云端尚未配置。填写 <code>config.js</code> 后可启用邮箱登录、云同步和题库广场。</p>
            </div>
          </div>
        </div>
      </section>
    `;
  }
  if (!state.cloudUser) {
    return `
      <section class="panel account-section form-grid">
        <h2>邮箱登录</h2>
        <p class="subtle">输入邮箱后会发送登录链接。本项目不设置密码，也不会公开展示你的邮箱。</p>
        <div class="field">
          <label for="loginEmail">邮箱</label>
          <input id="loginEmail" type="email" placeholder="you@example.com" />
        </div>
        <div class="actions account-actions">
          <button class="button" type="button" data-action="send-login-link">发送登录链接</button>
        </div>
      </section>
    `;
  }
  return `
    <section class="panel account-section">
      <h2>账号</h2>
      <div class="setting-list">
        <div class="setting-row">
          <div>
            <strong>邮箱</strong>
            <p class="subtle">${escapeHtml(state.cloudUser.email || state.cloudUser.id)}</p>
          </div>
        </div>
        <div class="setting-row">
          <div>
            <strong>云端接口</strong>
            <p class="subtle">版本 ${escapeHtml(CLOUD_API_VERSION)}</p>
          </div>
          <button class="danger-button" type="button" data-action="sign-out">退出登录</button>
        </div>
      </div>
    </section>
  `;
}

function renderProfileForm() {
  if (!state.cloudConfigured || !state.cloudUser) return "";
  const profile = state.cloudProfile || {};
  return `
    <section class="panel form-grid account-section">
      <h2>个人主页</h2>
      <p class="subtle">发布题库前需要设置公开用户名和昵称。公开题库会展示这些署名信息，但不会展示邮箱。</p>
      <div class="form-grid two">
        <div class="field">
          <label for="profileUsername">用户名</label>
          <input id="profileUsername" type="text" value="${escapeAttr(profile.username || "")}" placeholder="只建议英文、数字、下划线" />
        </div>
        <div class="field">
          <label for="profileDisplay">昵称</label>
          <input id="profileDisplay" type="text" value="${escapeAttr(profile.display_name || "")}" placeholder="小李爱刷题" />
        </div>
      </div>
      <div class="field">
        <label for="profileBio">简介</label>
        <input id="profileBio" type="text" value="${escapeAttr(profile.bio || "")}" placeholder="毛概/马原题库整理中" />
      </div>
      <div class="actions">
        <button class="button" type="button" data-action="save-profile">保存主页资料</button>
        ${profile.username ? `<button class="ghost-button" type="button" data-action="open-owner" data-username="${escapeAttr(profile.username)}">查看我的公开主页</button>` : ""}
      </div>
    </section>
  `;
}

function renderPractice() {
  const bank = getCurrentBank();
  if (!bank) {
    view.innerHTML = renderEmpty("还没有选择题库", "请先在题库页导入或选择一个题库。");
    return;
  }

  const summary = getCurrentSummary();
  const current = state.queue[state.queueIndex];
  const savedSession = current ? null : getValidPracticeSession();
  const startButtonLabel = current || savedSession ? "重新开始" : "开始练习";
  const modes = [
    ["sequential", "顺序"],
    ["random", "随机"],
    ["wrong", "错题"],
    ["favorite", "收藏"],
    ["unanswered", "未做"],
  ];

  view.innerHTML = `
    <section class="panel">
      <div class="bank-head">
        <div>
          <h2>${escapeHtml(getBankTitle(bank))}</h2>
          <p class="subtle">已做 ${summary.done}/${state.questions.length} · 正确率 ${summary.accuracy}% · 错题 ${summary.wrong}</p>
        </div>
        <span class="type-pill">${escapeHtml(modeName(state.practiceMode))}</span>
      </div>
      <div class="chip-row">
        ${modes.map(([mode, label]) => `<button class="mode-chip ${state.practiceMode === mode ? "is-active" : ""}" type="button" data-action="set-mode" data-mode="${mode}">${label}</button>`).join("")}
      </div>
      <div class="actions practice-actions">
        <button class="ghost-button" type="button" data-action="start-practice">${startButtonLabel}</button>
      </div>
    </section>
    ${current ? renderQuestionCard(current) : renderQueueEmpty(savedSession)}
  `;
}

function renderQueueEmpty(savedSession = getValidPracticeSession()) {
  const count = buildQueue(state.practiceMode).length;
  const hasResume = Boolean(savedSession);
  const resumeText = hasResume
    ? `${modeName(savedSession.mode)} · 第 ${savedSession.queueIndex + 1}/${savedSession.queueIds.length} 题`
    : "";
  return `
    <section class="empty-state practice-start">
      <h2>${hasResume ? "继续上次练习" : count ? "准备开始" : "这个模式暂无题目"}</h2>
      <p>${hasResume ? `已保存上次进度：${resumeText}。` : count ? `当前模式有 ${count} 道题。` : "可以换一个模式，或者先完成一些题目。 "}</p>
      <div class="actions question-actions">
        ${hasResume && count ? `<button class="ghost-button" type="button" data-action="start-practice">重新开始</button>` : ""}
        ${hasResume ? `<button class="button primary-action" type="button" data-action="resume-practice">继续上次</button>` : count ? `<button class="button primary-action" type="button" data-action="start-practice">开始练习</button>` : ""}
      </div>
    </section>
  `;
}

function renderQuestionCard(question) {
  const progress = getProgress(question.id);
  const progressText = `${state.queueIndex + 1}/${state.queue.length}`;
  const percent = state.queue.length ? Math.round(((state.queueIndex + 1) / state.queue.length) * 100) : 0;
  const result = state.lastResult;
  return `
    <article class="question-card">
      <div class="question-toolbar">
        <div class="chip-row">
          <span class="type-pill">${typeLabel(question.type)}</span>
          <button class="progress-trigger" type="button" data-action="toggle-question-picker" aria-expanded="${state.questionPickerOpen ? "true" : "false"}" aria-haspopup="dialog">
            <span>${progressText}</span>
            <span class="progress-caret">${state.questionPickerOpen ? "▴" : "▾"}</span>
          </button>
        </div>
        <button class="icon-button" type="button" data-action="toggle-favorite" data-question-id="${question.id}" title="收藏">
          ${progress.favorite ? "★" : "☆"}
        </button>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
      <p class="stem">${escapeHtml(question.stem)}</p>
      ${question.type === "fill" ? renderFillInput() : `<div class="option-list">${question.options.map((option) => renderOption(question, option)).join("")}</div>`}
      <div class="actions question-actions">
        <button class="ghost-button" type="button" data-action="start-practice">重新开始</button>
        ${state.submitted ? `<button class="button primary-action" type="button" data-action="next-question">${state.queueIndex + 1 >= state.queue.length ? "完成本组" : "下一题"}</button>` : `<button class="button primary-action" type="button" data-action="submit-answer">提交答案</button>`}
      </div>
      ${state.submitted && result ? renderResult(question, result) : ""}
    </article>
    ${renderQuestionPicker()}
  `;
}

function renderQuestionPicker() {
  if (!state.questionPickerOpen || !state.queue.length) return "";
  const groups = groupQueueByType();
  return `
    <div class="sheet-backdrop" data-action="close-question-picker"></div>
    <section class="question-picker-sheet" role="dialog" aria-modal="true" aria-labelledby="questionPickerTitle">
      <div class="panel question-picker-panel">
        <div class="bank-head">
          <div>
            <h2 id="questionPickerTitle">题目目录</h2>
            <p class="subtle">按题型快速跳转，当前题会高亮显示。</p>
          </div>
          <button class="icon-button" type="button" data-action="close-question-picker" aria-label="关闭">×</button>
        </div>
        <div class="question-picker-groups">
          ${groups.map((group) => `
            <section class="question-picker-group">
              <div class="question-picker-head">
                <strong>${escapeHtml(typeLabel(group.type))}</strong>
                <span class="subtle">${group.items.length} 题</span>
              </div>
              <div class="question-picker-grid">
                ${group.items.map(({ question, index }) => renderQuestionJumpButton(question, index)).join("")}
              </div>
            </section>
          `).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderQuestionJumpButton(question, index) {
  const progress = getProgress(question.id);
  const className = [
    "question-jump-button",
    index === state.queueIndex ? "is-current" : "",
    progress.answered ? (progress.correct ? "is-done" : "is-wrong") : "",
  ].filter(Boolean).join(" ");
  return `
    <button class="${className}" type="button" data-action="jump-question" data-index="${index}">
      ${question.order}
    </button>
  `;
}

function groupQueueByType() {
  const groups = new Map();
  state.queue.forEach((question, index) => {
    const key = question.type;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ question, index });
  });
  return ["single", "multiple", "judge", "fill"]
    .filter((type) => groups.has(type))
    .map((type) => ({ type, items: groups.get(type) }));
}

function renderOption(question, option) {
  const value = option.value || option.label;
  const selected = state.selected.has(value);
  const shouldMark = state.submitted;
  const correct = isOptionCorrect(question, option);
  const wrongSelected = shouldMark && selected && !correct;
  const className = [
    "option-button",
    selected ? "is-selected" : "",
    shouldMark && correct ? "is-correct" : "",
    wrongSelected ? "is-wrong" : "",
  ].filter(Boolean).join(" ");
  return `
    <button class="${className}" type="button" data-action="choose-option" data-value="${escapeAttr(value)}">
      <span class="option-label">${escapeHtml(option.label)}</span>
      <span class="option-text">${escapeHtml(option.text)}</span>
    </button>
  `;
}

function renderFillInput() {
  const value = [...state.selected][0] || "";
  return `
    <div class="field">
      <label for="fillAnswer">填写答案</label>
      <input id="fillAnswer" type="text" value="${escapeAttr(value)}" placeholder="输入后提交" ${state.submitted ? "disabled" : ""} />
    </div>
  `;
}

function renderResult(question, result) {
  const answerText = getAnswerDisplay(question);
  const progress = getProgress(question.id);
  const wrongAction = result.correct
    ? ""
    : `<div class="actions result-actions">${
        progress.wrongCount > 0
          ? `<button class="ghost-button" type="button" disabled>已在错题本</button>`
          : `<button class="ghost-button" type="button" data-action="add-wrong" data-question-id="${question.id}">加入错题本</button>`
      }</div>`;
  return `
    <section class="result-box ${result.correct ? "good" : "bad"}">
      <div>正确答案：${escapeHtml(answerText)}</div>
      <div class="explanation">${escapeHtml(question.analysis || "暂无解析。")}</div>
      ${wrongAction}
    </section>
  `;
}

function renderWrong() {
  const bank = getCurrentBank();
  if (!bank) {
    view.innerHTML = renderEmpty("还没有选择题库", "请先选择一个题库。");
    return;
  }
  const wrongQuestions = state.questions.filter((question) => getProgress(question.id).wrongCount > 0);
  view.innerHTML = `
    <section class="panel">
      <h2>错题本</h2>
      <p class="subtle">${escapeHtml(getBankTitle(bank))} · ${wrongQuestions.length} 道错题</p>
      <div class="actions">
        <button class="button" type="button" data-action="practice-wrong">重练错题</button>
      </div>
    </section>
    <section class="question-list">
      ${wrongQuestions.length ? wrongQuestions.map(renderWrongItem).join("") : renderEmpty("暂时没有错题", "手动加入错题本的题会出现在这里。")}
    </section>
  `;
}

function renderWrongItem(question) {
  const progress = getProgress(question.id);
  return `
    <article class="list-item">
      <div class="chip-row">
        <span class="type-pill">${typeLabel(question.type)}</span>
        <span class="type-pill warn">错 ${progress.wrongCount} 次</span>
      </div>
      <p>${escapeHtml(question.stem)}</p>
      <p class="subtle">正确答案：${escapeHtml(getAnswerDisplay(question))}</p>
      <div class="actions">
        <button class="ghost-button" type="button" data-action="master-question" data-question-id="${question.id}">标记掌握</button>
      </div>
    </article>
  `;
}

function renderStats() {
  const bank = getCurrentBank();
  if (!bank) {
    view.innerHTML = renderEmpty("暂无统计", "选择题库后可以查看刷题统计。");
    return;
  }
  const summary = getCurrentSummary();
  const typeRows = ["single", "multiple", "judge", "fill"].map((type) => {
    const items = state.questions.filter((question) => question.type === type);
    const progressItems = items.map((question) => getProgress(question.id));
    const done = progressItems.filter((item) => item.answered).length;
    const correct = progressItems.filter((item) => item.correct).length;
    const rate = done ? Math.round((correct / done) * 100) : 0;
    return { type, total: items.length, done, rate };
  }).filter((row) => row.total > 0);

  view.innerHTML = `
    <section class="panel">
      <h2>统计</h2>
      <p class="subtle">${escapeHtml(getBankTitle(bank))}</p>
      <div class="metric-row">
        <div class="metric"><strong>${summary.done}</strong><span>已做</span></div>
        <div class="metric"><strong>${summary.accuracy}%</strong><span>正确率</span></div>
        <div class="metric"><strong>${summary.wrong}</strong><span>错题</span></div>
      </div>
    </section>
    <section class="panel">
      <h2>题型表现</h2>
      <div class="bank-list">
        ${typeRows.map((row) => `
          <div class="list-item">
            <div class="bank-head">
              <strong>${typeLabel(row.type)}</strong>
              <span class="subtle">${row.done}/${row.total} · ${row.rate}%</span>
            </div>
            <div class="progress-track"><div class="progress-fill" style="width:${row.total ? Math.round((row.done / row.total) * 100) : 0}%"></div></div>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderSettings() {
  view.innerHTML = `
    ${renderSettingsContent()}
  `;
}

function renderSettingsContent() {
  return `
    <section class="panel account-section">
      <h2>设置与备份</h2>
      <p class="subtle">题库和练习记录保存在本机 IndexedDB。建议定期导出备份，避免清理 Safari 数据后丢失。</p>
      <div class="grid">
        <button class="button" type="button" data-action="export-backup">导出全部备份</button>
        <div class="field">
          <label for="restoreFile">导入备份 JSON</label>
          <input id="restoreFile" type="file" accept=".json,application/json" />
        </div>
        <button class="danger-button" type="button" data-action="clear-all">清空所有数据</button>
      </div>
    </section>
  `;
}

async function importQuestionBank(formData) {
  const file = formData.get("file");
  const course = cleanText(formData.get("course"));
  const chapter = cleanText(formData.get("chapter"));
  const tags = splitTags(formData.get("tags"));
  if (!file || !file.name) {
    showToast("请选择 Excel 文件");
    return;
  }
  if (!course) {
    showToast("请先填写课程");
    return;
  }

  try {
    showToast("正在解析 Excel...");
    const rawRows = await readXlsxRows(file);
    const questions = normalizeRows(rawRows);
    if (!questions.length) throw new Error("没有识别到有效题目");

    const bankId = createId("bank");
    const now = new Date().toISOString();
    const bank = {
      id: bankId,
      name: buildBankName(course, chapter, file.name),
      course,
      chapter,
      tags,
      questionCount: questions.length,
      counts: countQuestionTypes(questions),
      createdAt: now,
      updatedAt: now,
      lastStudiedAt: "",
    };
    const storedQuestions = questions.map((question, index) => ({
      ...question,
      id: createId("q"),
      bankId,
      order: index + 1,
      createdAt: now,
    }));

    await saveBankWithQuestions(bank, storedQuestions);
    state.currentBankId = bankId;
    localStorage.setItem(CURRENT_BANK_KEY, bankId);
    await refreshBanks();
    await loadCurrentBank();
    resetPracticeQueue();
    state.view = "practice";
    showToast(`已导入 ${questions.length} 道题`);
    render();
  } catch (error) {
    console.error(error);
    showToast(`导入失败：${error.message || error}`);
  }
}

function routeToAccountWithMessage(message) {
  state.view = "account";
  showToast(message);
  render();
}

async function publishLocalBank(bankId) {
  try {
    const blocker = getPublishBlocker({
      cloudConfigured: state.cloudConfigured,
      cloudUser: state.cloudUser,
      cloudProfile: state.cloudProfile,
    });
    if (blocker) {
      routeToAccountWithMessage(blocker);
      return;
    }
    const bank = state.banks.find((item) => item.id === bankId);
    if (!bank) throw new Error("找不到题库");
    const questions = await getByIndex(STORE_QUESTIONS, "bankId", bankId);
    if (!questions.length) throw new Error("题库里没有题目");
    const message = `确定公开发布“${getBankTitle(bank)}”吗？\n\n公开后，题目、正确答案和解析都会被其他人搜索、查看和保存。你的邮箱不会公开展示，公开署名为 @${state.cloudProfile.username}。`;
    if (!confirm(message)) return;
    showToast("正在发布题库...");
    const cloudId = await cloud.publishBank(bank, questions.sort((a, b) => a.order - b.order), state.cloudProfile, "public");
    const updated = {
      ...bank,
      cloudId,
      visibility: "public",
      ownerUsername: state.cloudProfile.username,
      updatedAt: new Date().toISOString(),
    };
    await putRecord(STORE_BANKS, updated);
    await refreshBanks();
    showToast(`已公开发布，题库 ID：${cloudId}`);
    render();
  } catch (error) {
    console.error(error);
    showToast(`发布失败：${error.message || error}`);
  }
}

async function sendLoginLink() {
  try {
    const email = cleanText(document.querySelector("#loginEmail")?.value || "");
    if (!email) throw new Error("请输入邮箱");
    await cloud.sendMagicLink(email);
    showToast("登录链接已发送，请去邮箱点击");
  } catch (error) {
    console.error(error);
    showToast(`发送失败：${error.message || error}`);
  }
}

async function signOutCloud() {
  await cloud.signOut();
  state.cloudUser = null;
  state.cloudProfile = null;
  showToast("已退出登录");
  render();
}

async function saveProfile() {
  try {
    if (!state.cloudUser) throw new Error("请先登录");
    const username = normalizeUsername(document.querySelector("#profileUsername")?.value || "");
    if (!username) throw new Error("用户名不能为空");
    const displayName = cleanText(document.querySelector("#profileDisplay")?.value || "");
    if (!displayName) throw new Error("昵称不能为空");
    const profile = {
      id: state.cloudUser.id,
      username,
      display_name: displayName,
      bio: cleanText(document.querySelector("#profileBio")?.value || ""),
    };
    state.cloudProfile = await cloud.upsertProfile(profile);
    showToast("主页资料已保存");
    render();
  } catch (error) {
    console.error(error);
    showToast(`保存失败：${error.message || error}`);
  }
}

async function searchPublicBanks() {
  if (!state.cloudConfigured) {
    showToast("请先配置 Supabase");
    return;
  }
  state.discoverLoading = true;
  state.publicBanks = [];
  state.discoverProfile = null;
  render();
  try {
    const query = state.discoverQuery;
    const [banks, profile] = await Promise.all([
      cloud.searchPublicBanks(query),
      query ? cloud.getProfileByUsername(query).catch(() => null) : Promise.resolve(null),
    ]);
    state.publicBanks = banks || [];
    state.discoverProfile = profile;
    if (profile) {
      const userBanks = await cloud.listUserPublicBanks(profile.username);
      const byId = new Map([...state.publicBanks, ...userBanks].map((bank) => [bank.id, bank]));
      state.publicBanks = [...byId.values()];
    }
    showToast(`找到 ${state.publicBanks.length} 个公开题库`);
  } catch (error) {
    console.error(error);
    showToast(`搜索失败：${error.message || error}`);
  } finally {
    state.discoverLoading = false;
    render();
  }
}

async function openOwnerProfile(username) {
  if (!username) return;
  state.view = "discover";
  state.discoverQuery = username;
  await searchPublicBanks();
}

async function usePublicBank(bankId) {
  try {
    showToast("正在保存公开题库...");
    const payload = await cloud.getPublicBank(bankId);
    if (!payload) throw new Error("找不到公开题库");
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
    await saveBankWithQuestions(localBank, localQuestions);
    state.currentBankId = localBankId;
    localStorage.setItem(CURRENT_BANK_KEY, localBankId);
    await refreshBanks();
    await loadCurrentBank();
    resetPracticeQueue();
    state.view = "practice";
    showToast(`已保存 ${localQuestions.length} 道题`);
    render();
  } catch (error) {
    console.error(error);
    showToast(`保存失败：${error.message || error}`);
  }
}

async function syncProgress() {
  try {
    if (!state.cloudUser) throw new Error("请先登录");
    const bank = getCurrentBank();
    if (!bank?.cloudId) throw new Error("当前题库还没有云端 ID，请先发布或保存公开题库");
    const translated = [...state.progress.values()].map((item) => {
      const question = state.questions.find((q) => q.id === item.questionId);
      return {
        ...item,
        bankId: bank.cloudId,
        questionId: question?.cloudQuestionId || `${bank.cloudId}_${question?.order || item.questionId}`,
      };
    });
    await cloud.pushProgress(translated);
    showToast(`已同步 ${translated.length} 条记录`);
  } catch (error) {
    console.error(error);
    showToast(`同步失败：${error.message || error}`);
  }
}

function normalizeRows(rows) {
  const questions = [];
  for (const row of rows) {
    const stem = cleanText(row[0]);
    const answer = normalizeAnswerText(row[1]);
    const analysis = cleanText(row[2]);
    if (!stem || !answer) continue;
    if (/说明|第一列放题干|导入模板/.test(stem)) continue;
    if (/题干/.test(stem) && /答案/.test(answer)) continue;

    const optionCells = row.slice(3, 10).map(cleanText);
    const type = detectQuestionType(stem, answer, optionCells);
    const options = buildOptions(type, optionCells);
    questions.push({ stem, answer: normalizeStoredAnswer(answer, type), analysis, type, options });
  }
  return questions;
}

function detectQuestionType(stem, answer, optionCells) {
  const compact = answer.toUpperCase().replace(/\s+/g, "");
  if (isJudgementAnswer(compact)) return "judge";
  if (/^[A-G]+$/.test(compact) && optionCells.some(Boolean)) {
    return compact.length > 1 ? "multiple" : "single";
  }
  if (/\{[^}]+\}/.test(stem) || !optionCells.some(Boolean)) return "fill";
  return "single";
}

function buildOptions(type, optionCells) {
  if (type === "judge") {
    return [
      { label: "正确", text: "正确", value: "正确" },
      { label: "错误", text: "错误", value: "错误" },
    ];
  }
  const labels = ["A", "B", "C", "D", "E", "F", "G"];
  return optionCells
    .map((text, index) => text ? { label: labels[index], text, value: labels[index] } : null)
    .filter(Boolean);
}

function normalizeStoredAnswer(answer, type) {
  if (type === "judge") return normalizeJudgement(answer);
  if (type === "single" || type === "multiple") return sortLetters(answer);
  return answer;
}

function startPractice() {
  state.queue = buildQueue(state.practiceMode);
  state.queueIndex = 0;
  state.selected = new Set();
  state.submitted = false;
  state.lastResult = null;
  state.questionPickerOpen = false;
  if (!state.queue.length) {
    showToast("当前模式暂无题目");
  } else {
    persistPracticeSession();
  }
  render();
}

function resumePractice() {
  const session = getValidPracticeSession();
  if (!session) {
    showToast("没有可继续的练习");
    return;
  }
  const byId = new Map(state.questions.map((question) => [question.id, question]));
  state.practiceMode = session.mode;
  state.queue = session.queueIds.map((id) => byId.get(id)).filter(Boolean);
  state.queueIndex = Math.min(session.queueIndex, Math.max(state.queue.length - 1, 0));
  state.selected = new Set(session.selected || []);
  state.submitted = Boolean(session.submitted);
  state.lastResult = session.lastResult || null;
  state.questionPickerOpen = false;
  persistPracticeSession();
  render();
}

function buildQueue(mode) {
  let items = [...state.questions].sort((a, b) => a.order - b.order);
  if (mode === "wrong") items = items.filter((question) => getProgress(question.id).wrongCount > 0);
  if (mode === "favorite") items = items.filter((question) => getProgress(question.id).favorite);
  if (mode === "unanswered") items = items.filter((question) => !getProgress(question.id).answered);
  if (mode === "random") items = shuffle(items);
  return items;
}

function resetPracticeQueue() {
  state.queue = [];
  state.queueIndex = 0;
  state.selected = new Set();
  state.submitted = false;
  state.lastResult = null;
  state.questionPickerOpen = false;
}

function chooseOption(value) {
  if (state.submitted) return;
  const question = state.queue[state.queueIndex];
  if (!question) return;
  if (question.type === "multiple") {
    if (state.selected.has(value)) state.selected.delete(value);
    else state.selected.add(value);
  } else {
    state.selected = new Set([value]);
  }
  persistPracticeSession();
  render();
}

async function submitAnswer() {
  const question = state.queue[state.queueIndex];
  if (!question) return;
  if (question.type === "fill") {
    const fillValue = cleanText(document.querySelector("#fillAnswer")?.value || "");
    state.selected = fillValue ? new Set([fillValue]) : new Set();
  }
  if (!state.selected.size) {
    showToast("先选一个答案");
    return;
  }

  const selectedAnswer = buildSelectedAnswer(question);
  const correct = isAnswerCorrect(question, selectedAnswer);
  const previous = getProgress(question.id);
  const next = {
    ...previous,
    id: question.id,
    bankId: question.bankId,
    questionId: question.id,
    selectedAnswer,
    answered: true,
    correct,
    attempts: previous.attempts + 1,
    wrongCount: previous.wrongCount || 0,
    lastAnsweredAt: new Date().toISOString(),
  };
  state.progress.set(question.id, next);
  state.lastResult = { correct, selectedAnswer };
  state.submitted = true;
  await putRecord(STORE_PROGRESS, next);
  await updateBankLastStudied(question.bankId);
  await refreshBanks();
  persistPracticeSession();
  if (!correct) vibrateWrongFeedback();
  render();
}

function nextQuestion() {
  if (state.queueIndex + 1 >= state.queue.length) {
    clearPracticeSession(state.currentBankId);
    resetPracticeQueue();
    showToast("这一组完成了");
    render();
    return;
  }
  state.queueIndex += 1;
  state.selected = new Set();
  state.submitted = false;
  state.lastResult = null;
  state.questionPickerOpen = false;
  persistPracticeSession();
  render();
}

function persistPracticeSession() {
  if (!state.currentBankId || !state.queue.length) return;
  const payload = {
    bankId: state.currentBankId,
    mode: state.practiceMode,
    queueIds: state.queue.map((question) => question.id),
    queueIndex: state.queueIndex,
    selected: [...state.selected],
    submitted: state.submitted,
    lastResult: state.lastResult,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(PRACTICE_SESSION_KEY, JSON.stringify(payload));
}

function readPracticeSession() {
  try {
    return JSON.parse(localStorage.getItem(PRACTICE_SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function getValidPracticeSession() {
  const session = readPracticeSession();
  if (!session || session.bankId !== state.currentBankId || !Array.isArray(session.queueIds)) return null;
  const knownIds = new Set(state.questions.map((question) => question.id));
  const queueIds = session.queueIds.filter((id) => knownIds.has(id));
  if (!queueIds.length) return null;
  return {
    ...session,
    mode: session.mode || "sequential",
    queueIds,
    queueIndex: Math.min(Math.max(Number(session.queueIndex) || 0, 0), queueIds.length - 1),
    selected: Array.isArray(session.selected) ? session.selected : [],
  };
}

function clearPracticeSession(bankId = "") {
  const session = readPracticeSession();
  if (!bankId || !session || session.bankId === bankId) {
    localStorage.removeItem(PRACTICE_SESSION_KEY);
  }
}

function buildSelectedAnswer(question) {
  const values = [...state.selected];
  if (question.type === "judge") return normalizeJudgement(values[0]);
  if (question.type === "multiple") return sortLetters(values.join(""));
  if (question.type === "fill") return values[0] || "";
  return values[0] || "";
}

function isAnswerCorrect(question, selectedAnswer) {
  if (question.type === "judge") return normalizeJudgement(selectedAnswer) === normalizeJudgement(question.answer);
  if (question.type === "multiple") return sortLetters(selectedAnswer) === sortLetters(question.answer);
  if (question.type === "single") return selectedAnswer === question.answer;
  return cleanText(selectedAnswer) === cleanText(question.answer);
}

function isOptionCorrect(question, option) {
  if (question.type === "judge") return normalizeJudgement(option.value) === normalizeJudgement(question.answer);
  return question.answer.includes(option.label);
}

async function toggleFavorite(questionId) {
  const current = getProgress(questionId);
  const question = state.questions.find((item) => item.id === questionId);
  const next = {
    ...current,
    id: questionId,
    questionId,
    bankId: question?.bankId || state.currentBankId,
    favorite: !current.favorite,
  };
  state.progress.set(questionId, next);
  await putRecord(STORE_PROGRESS, next);
  render();
}

async function addToWrongBook(questionId) {
  const current = getProgress(questionId);
  const question = state.questions.find((item) => item.id === questionId);
  const next = {
    ...current,
    id: questionId,
    questionId,
    bankId: question?.bankId || state.currentBankId,
    wrongCount: Math.max(1, current.wrongCount || 0),
    mastered: false,
  };
  state.progress.set(questionId, next);
  await putRecord(STORE_PROGRESS, next);
  await refreshBanks();
  showToast("已加入错题本");
  render();
}

async function markMastered(questionId) {
  const current = getProgress(questionId);
  const next = { ...current, wrongCount: 0, mastered: true };
  state.progress.set(questionId, next);
  await putRecord(STORE_PROGRESS, next);
  showToast("已移出错题本");
  render();
}

async function selectBank(id, nextView) {
  state.editingBankId = "";
  state.questionPickerOpen = false;
  setCurrentBank(id, true);
  await loadCurrentBank();
  resetPracticeQueue();
  state.view = nextView;
  render();
}

function setCurrentBank(id, persist) {
  state.currentBankId = id;
  if (persist) localStorage.setItem(CURRENT_BANK_KEY, id);
}

function toggleQuestionPicker() {
  if (!state.queue.length) return;
  state.questionPickerOpen = !state.questionPickerOpen;
  render();
}

function closeQuestionPicker() {
  if (!state.questionPickerOpen) return;
  state.questionPickerOpen = false;
  render();
}

function jumpToQuestion(index) {
  if (!Number.isInteger(index) || index < 0 || index >= state.queue.length) return;
  state.queueIndex = index;
  state.selected = new Set();
  state.submitted = false;
  state.lastResult = null;
  state.questionPickerOpen = false;
  persistPracticeSession();
  render();
}

async function editBank(id) {
  openBankEditor(id);
}

function openBankEditor(id) {
  const bank = state.banks.find((item) => item.id === id);
  if (!bank) return;
  state.editingBankId = id;
  render();
}

function closeBankEditor() {
  if (!state.editingBankId) return;
  state.editingBankId = "";
  render();
}

async function saveBankEdit(formData) {
  const id = cleanText(formData.get("id"));
  const bank = state.banks.find((item) => item.id === id);
  if (!bank) return;
  const course = cleanText(formData.get("course"));
  const chapter = cleanText(formData.get("chapter"));
  const tags = splitTags(formData.get("tags"));
  if (!course) {
    showToast("课程不能为空");
    return;
  }
  const updated = {
    ...bank,
    name: buildBankName(course, chapter, bank.name),
    course,
    chapter,
    tags,
    updatedAt: new Date().toISOString(),
  };
  await putRecord(STORE_BANKS, updated);
  state.editingBankId = "";
  await refreshBanks();
  render();
}

async function deleteBank(id) {
  const bank = state.banks.find((item) => item.id === id);
  if (!bank) return;
  if (!confirm(`确定删除“${getBankTitle(bank)}”吗？相关练习记录也会删除。`)) return;
  await deleteBankCascade(id);
  clearPracticeSession(id);
  if (state.currentBankId === id) {
    state.currentBankId = "";
    localStorage.removeItem(CURRENT_BANK_KEY);
    state.questions = [];
    state.progress = new Map();
  }
  if (state.editingBankId === id) {
    state.editingBankId = "";
  }
  await refreshBanks();
  if (!state.currentBankId && state.banks[0]) {
    setCurrentBank(state.banks[0].id, true);
    await loadCurrentBank();
  }
  render();
}

async function exportBackup() {
  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    banks: await getAll(STORE_BANKS),
    questions: await getAll(STORE_QUESTIONS),
    progress: await getAll(STORE_PROGRESS),
  };
  downloadBlob(`我爱刷题备份-${dateStamp()}.json`, new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" }));
  showToast("备份已导出");
}

async function importBackup(file) {
  try {
    const text = await file.text();
    const backup = JSON.parse(text);
    if (!Array.isArray(backup.banks) || !Array.isArray(backup.questions)) {
      throw new Error("备份格式不正确");
    }
    if (!confirm("导入备份会覆盖当前本地数据，确定继续吗？")) return;
    await clearStores();
    clearPracticeSession();
    await putMany(STORE_BANKS, backup.banks);
    await putMany(STORE_QUESTIONS, backup.questions);
    await putMany(STORE_PROGRESS, backup.progress || []);
    await refreshBanks();
    state.currentBankId = state.banks[0]?.id || "";
    if (state.currentBankId) localStorage.setItem(CURRENT_BANK_KEY, state.currentBankId);
    await loadCurrentBank();
    showToast("备份已恢复");
    state.view = "banks";
    render();
  } catch (error) {
    console.error(error);
    showToast(`恢复失败：${error.message || error}`);
  }
}

async function clearAllData() {
  if (!confirm("确定清空所有题库和练习记录吗？")) return;
  await clearStores();
  state.banks = [];
  state.allProgress = [];
  state.questions = [];
  state.progress = new Map();
  state.currentBankId = "";
  localStorage.removeItem(CURRENT_BANK_KEY);
  clearPracticeSession();
  resetPracticeQueue();
  showToast("已清空");
  render();
}

async function readXlsxRows(file) {
  const buffer = await file.arrayBuffer();
  const entries = await unzip(buffer);
  const workbookXml = getTextEntry(entries, "xl/workbook.xml");
  const relsXml = getTextEntry(entries, "xl/_rels/workbook.xml.rels");
  const parser = new DOMParser();
  const workbook = parser.parseFromString(workbookXml, "application/xml");
  const rels = parser.parseFromString(relsXml, "application/xml");
  const sheets = getXmlElements(workbook, "sheet");
  const relMap = new Map(getXmlElements(rels, "Relationship").map((rel) => [rel.getAttribute("Id"), rel.getAttribute("Target")]));
  const selectedSheet = sheets.find((sheet) => /任选|导入|题/.test(sheet.getAttribute("name") || "")) || sheets[0];
  if (!selectedSheet) throw new Error("Excel 中没有工作表");
  const relId = selectedSheet.getAttribute("r:id") || selectedSheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
  const target = relMap.get(relId);
  if (!target) throw new Error("无法定位工作表内容");
  const sheetPath = normalizeXlsxPath(target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  const sheetXml = getTextEntry(entries, sheetPath);
  const sharedStrings = parseSharedStrings(entries);
  return parseSheetRows(sheetXml, sharedStrings);
}

function parseSharedStrings(entries) {
  if (!entries.has("xl/sharedStrings.xml")) return [];
  const xml = getTextEntry(entries, "xl/sharedStrings.xml");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return getXmlElements(doc, "si").map((item) => {
    return getXmlElements(item, "t").map((text) => text.textContent || "").join("");
  });
}

function parseSheetRows(sheetXml, sharedStrings) {
  const doc = new DOMParser().parseFromString(sheetXml, "application/xml");
  return getXmlElements(doc, "row").map((row) => {
    const values = [];
    getXmlElements(row, "c").forEach((cell, fallbackIndex) => {
      const ref = cell.getAttribute("r");
      const index = ref ? columnIndex(ref) : fallbackIndex;
      values[index] = parseCell(cell, sharedStrings);
    });
    return values.map((value) => value || "");
  });
}

function parseCell(cell, sharedStrings) {
  const type = cell.getAttribute("t");
  if (type === "inlineStr") {
    return getXmlElements(cell, "t").map((item) => item.textContent || "").join("");
  }
  const value = getXmlElements(cell, "v")[0]?.textContent || "";
  if (type === "s") return sharedStrings[Number(value)] || "";
  return value;
}

function getXmlElements(parent, localName) {
  return [...parent.getElementsByTagName("*")].filter((element) => element.localName === localName || element.nodeName.split(":").pop() === localName);
}

async function unzip(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const eocdOffset = findEndOfCentralDirectory(view);
  if (eocdOffset < 0) throw new Error("不是有效的 xlsx 文件");
  const entriesCount = view.getUint16(eocdOffset + 10, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);
  const entries = new Map();
  let ptr = centralOffset;
  const decoder = new TextDecoder();

  for (let i = 0; i < entriesCount; i += 1) {
    if (view.getUint32(ptr, true) !== 0x02014b50) throw new Error("xlsx 压缩目录损坏");
    const method = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const nameLength = view.getUint16(ptr + 28, true);
    const extraLength = view.getUint16(ptr + 30, true);
    const commentLength = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const name = decoder.decode(bytes.slice(ptr + 46, ptr + 46 + nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    const data = method === 0 ? compressed : await inflateRaw(compressed, method);
    entries.set(normalizeXlsxPath(name), data);
    ptr += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

async function inflateRaw(data, method) {
  if (method !== 8) throw new Error(`不支持的 Excel 压缩方式：${method}`);
  if (!("DecompressionStream" in window)) {
    throw new Error("当前浏览器不支持解压标准 xlsx，请使用新版 Safari/Chrome，或先用本应用导出的备份恢复。");
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function findEndOfCentralDirectory(view) {
  const min = Math.max(0, view.byteLength - 66000);
  for (let offset = view.byteLength - 22; offset >= min; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  return -1;
}

function getTextEntry(entries, path) {
  const key = normalizeXlsxPath(path);
  const data = entries.get(key);
  if (!data) throw new Error(`Excel 缺少 ${key}`);
  return new TextDecoder().decode(data);
}

function normalizeXlsxPath(path) {
  const parts = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function columnIndex(ref) {
  const letters = ref.match(/[A-Z]+/i)?.[0] || "A";
  let value = 0;
  for (const letter of letters.toUpperCase()) value = value * 26 + letter.charCodeAt(0) - 64;
  return value - 1;
}

async function refreshBanks() {
  state.banks = (await getAll(STORE_BANKS)).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  state.allProgress = await getAll(STORE_PROGRESS);
}

async function loadCurrentBank() {
  if (!state.currentBankId) return;
  state.questions = (await getByIndex(STORE_QUESTIONS, "bankId", state.currentBankId)).sort((a, b) => a.order - b.order);
  const progressRows = await getByIndex(STORE_PROGRESS, "bankId", state.currentBankId);
  state.progress = new Map(progressRows.map((item) => [item.questionId, item]));
}

async function saveBankWithQuestions(bank, questions) {
  const db = await openDB();
  await txDone(db, [STORE_BANKS, STORE_QUESTIONS], "readwrite", (tx) => {
    tx.objectStore(STORE_BANKS).put(bank);
    const questionStore = tx.objectStore(STORE_QUESTIONS);
    questions.forEach((question) => questionStore.put(question));
  });
}

async function deleteBankCascade(bankId) {
  const questions = await getByIndex(STORE_QUESTIONS, "bankId", bankId);
  const progress = await getByIndex(STORE_PROGRESS, "bankId", bankId);
  const db = await openDB();
  await txDone(db, [STORE_BANKS, STORE_QUESTIONS, STORE_PROGRESS], "readwrite", (tx) => {
    tx.objectStore(STORE_BANKS).delete(bankId);
    questions.forEach((question) => tx.objectStore(STORE_QUESTIONS).delete(question.id));
    progress.forEach((item) => tx.objectStore(STORE_PROGRESS).delete(item.id));
  });
}

async function updateBankLastStudied(bankId) {
  const bank = state.banks.find((item) => item.id === bankId);
  if (!bank) return;
  await putRecord(STORE_BANKS, { ...bank, lastStudiedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
}

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_BANKS)) db.createObjectStore(STORE_BANKS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_QUESTIONS)) {
        const store = db.createObjectStore(STORE_QUESTIONS, { keyPath: "id" });
        store.createIndex("bankId", "bankId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_PROGRESS)) {
        const store = db.createObjectStore(STORE_PROGRESS, { keyPath: "id" });
        store.createIndex("bankId", "bankId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function getAll(storeName) {
  const db = await openDB();
  return requestPromise(db.transaction(storeName, "readonly").objectStore(storeName).getAll());
}

async function getByIndex(storeName, indexName, value) {
  const db = await openDB();
  return requestPromise(db.transaction(storeName, "readonly").objectStore(storeName).index(indexName).getAll(value));
}

async function putRecord(storeName, record) {
  const db = await openDB();
  await requestPromise(db.transaction(storeName, "readwrite").objectStore(storeName).put(record));
}

async function putMany(storeName, records) {
  const db = await openDB();
  await txDone(db, storeName, "readwrite", (tx) => {
    const store = tx.objectStore(storeName);
    records.forEach((record) => store.put(record));
  });
}

async function clearStores() {
  const db = await openDB();
  await txDone(db, [STORE_BANKS, STORE_QUESTIONS, STORE_PROGRESS], "readwrite", (tx) => {
    tx.objectStore(STORE_BANKS).clear();
    tx.objectStore(STORE_QUESTIONS).clear();
    tx.objectStore(STORE_PROGRESS).clear();
  });
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(db, stores, mode, work) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    work(tx);
  });
}

function getCurrentBank() {
  return state.banks.find((bank) => bank.id === state.currentBankId);
}

function getProgress(questionId) {
  return state.progress.get(questionId) || {
    id: questionId,
    questionId,
    bankId: state.currentBankId,
    selectedAnswer: "",
    answered: false,
    correct: false,
    attempts: 0,
    wrongCount: 0,
    favorite: false,
    mastered: false,
    lastAnsweredAt: "",
  };
}

function getBankProgress(bankId) {
  const bank = state.banks.find((item) => item.id === bankId);
  const rows = state.allProgress.filter((item) => item.bankId === bankId);
  const done = rows.filter((item) => item.answered).length;
  const correct = rows.filter((item) => item.correct).length;
  const wrong = rows.filter((item) => item.wrongCount > 0).length;
  return {
    done,
    correct,
    wrong,
    rate: bank?.questionCount ? Math.round((done / bank.questionCount) * 100) : 0,
  };
}

function getCurrentSummary() {
  const rows = [...state.progress.values()];
  const done = rows.filter((item) => item.answered).length;
  const correct = rows.filter((item) => item.correct).length;
  const wrong = rows.filter((item) => item.wrongCount > 0).length;
  return { done, correct, wrong, accuracy: done ? Math.round((correct / done) * 100) : 0 };
}

function getFilteredBanks() {
  const keyword = state.bankFilter.toLowerCase();
  if (!keyword) return state.banks;
  return state.banks.filter((bank) => {
    const text = [getBankTitle(bank), bank.course, bank.chapter, ...(bank.tags || [])].join(" ").toLowerCase();
    return text.includes(keyword);
  });
}

function getBankTitle(bank) {
  return cleanText(bank?.course) || cleanText(bank?.name) || "未命名课程";
}

function buildBankName(course, chapter, fallback = "") {
  return [cleanText(course), cleanText(chapter)].filter(Boolean).join(" - ") || cleanText(String(fallback).replace(/\.[^.]+$/, "")) || "未命名题库";
}

function getAvatarText(value) {
  const text = cleanText(value);
  return text ? text.slice(0, 1).toUpperCase() : "我";
}

function vibrateWrongFeedback() {
  try {
    if ("vibrate" in navigator) navigator.vibrate([35, 25, 35]);
  } catch {
    // Some browsers, especially iOS Safari, do not support vibration.
  }
}

function countQuestionTypes(questions) {
  return questions.reduce((acc, question) => {
    acc[question.type] = (acc[question.type] || 0) + 1;
    return acc;
  }, {});
}

function getAnswerDisplay(question) {
  if (question.type === "judge" || question.type === "fill") return question.answer;
  const selected = question.options.filter((option) => question.answer.includes(option.label));
  return selected.map((option) => `${option.label}. ${option.text}`).join("；") || question.answer;
}

function typeLabel(type) {
  return ({ single: "单选", multiple: "多选", judge: "判断", fill: "填空" })[type] || "题目";
}

function modeName(mode) {
  return ({ sequential: "顺序", random: "随机", wrong: "错题", favorite: "收藏", unanswered: "未做" })[mode] || "练习";
}

function isJudgementAnswer(answer) {
  return /^(正确|错误|对|错|√|×|Y|N|YES|NO|TRUE|FALSE)$/i.test(answer);
}

function normalizeJudgement(answer) {
  const value = cleanText(answer).toUpperCase();
  if (/^(正确|对|√|Y|YES|TRUE)$/.test(value)) return "正确";
  if (/^(错误|错|×|X|N|NO|FALSE)$/.test(value)) return "错误";
  return cleanText(answer);
}

function normalizeAnswerText(answer) {
  return cleanText(answer).replace(/[，、,;；\s]+/g, "");
}

function sortLetters(value) {
  return [...new Set(String(value).toUpperCase().replace(/[^A-G]/g, "").split(""))].sort().join("");
}

function splitTags(value) {
  return cleanText(value).split(/[，,、\s]+/).map(cleanText).filter(Boolean);
}

function normalizeUsername(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function cleanText(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function renderEmpty(title, text) {
  return `<section class="empty-state"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p></section>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function dateStamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("已复制");
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    showToast("已复制");
  }
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch((error) => {
    console.warn("Service worker registration failed", error);
  });
}
