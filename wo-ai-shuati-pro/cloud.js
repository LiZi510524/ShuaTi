import { PRO_CONFIG } from "./config.js";

const SESSION_KEY = "wo-ai-shuati-pro-session";
const API_VERSION = "2026-06-14";

export const cloud = {
  config: normalizeConfig(PRO_CONFIG),
  get configured() {
    return Boolean(this.config.supabaseUrl && this.config.supabaseAnonKey);
  },
  get session() {
    return loadSession();
  },
  set session(value) {
    saveSession(value);
  },
  clearSession() {
    localStorage.removeItem(SESSION_KEY);
  },
  handleAuthRedirect() {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const expiresIn = Number(hash.get("expires_in") || 3600);
    if (!accessToken) return false;
    saveSession({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: Date.now() + expiresIn * 1000,
    });
    history.replaceState(null, "", location.pathname + location.search);
    return true;
  },
  async sendMagicLink(email) {
    assertConfigured(this.config);
    return authFetch(this.config, "/otp", {
      method: "POST",
      body: {
        email,
        create_user: true,
        options: { email_redirect_to: redirectUrl(this.config) },
      },
    });
  },
  async getUser() {
    assertConfigured(this.config);
    const session = requireSession();
    const result = await authFetch(this.config, "/user", {
      method: "GET",
      token: session.access_token,
    });
    return result;
  },
  async signOut() {
    if (!this.configured || !this.session?.access_token) {
      this.clearSession();
      return;
    }
    try {
      await authFetch(this.config, "/logout", {
        method: "POST",
        token: this.session.access_token,
      });
    } finally {
      this.clearSession();
    }
  },
  async upsertProfile(profile) {
    const user = requireUser(profile);
    const rows = await restFetch(this.config, "/profiles?on_conflict=id", {
      method: "POST",
      token: this.session.access_token,
      prefer: "resolution=merge-duplicates,return=representation",
      body: [{
        id: user.id,
        username: profile.username,
        display_name: profile.display_name || profile.username,
        avatar_url: profile.avatar_url || null,
        bio: profile.bio || null,
        updated_at: new Date().toISOString(),
      }],
    });
    return rows?.[0] || null;
  },
  async getMyProfile(userId) {
    const rows = await restFetch(this.config, `/profiles?id=eq.${encodeURIComponent(userId)}&select=*`, {
      method: "GET",
      token: this.session?.access_token,
    });
    return rows?.[0] || null;
  },
  async getProfileByUsername(username) {
    const rows = await restFetch(this.config, `/profiles?username=eq.${encodeURIComponent(username)}&select=*`, {
      method: "GET",
      token: this.session?.access_token,
    });
    return rows?.[0] || null;
  },
  async publishBank(bank, questions, profile, visibility = "public") {
    assertConfigured(this.config);
    const user = requireUser(profile);
    const now = new Date().toISOString();
    const cloudId = bank.cloudId || bank.id;
    await restFetch(this.config, "/question_banks?on_conflict=id", {
      method: "POST",
      token: this.session.access_token,
      prefer: "resolution=merge-duplicates,return=representation",
      body: [{
        id: cloudId,
        owner_id: user.id,
        owner_username: profile.username,
        name: bank.name,
        course: bank.course || null,
        chapter: bank.chapter || null,
        tags: bank.tags || [],
        visibility,
        question_count: questions.length,
        counts: bank.counts || {},
        updated_at: now,
      }],
    });

    await restFetch(this.config, `/questions?bank_id=eq.${encodeURIComponent(cloudId)}`, {
      method: "DELETE",
      token: this.session.access_token,
    });

    const rows = questions.map((question) => ({
      id: `${cloudId}_${question.order}`,
      bank_id: cloudId,
      owner_id: user.id,
      order_no: question.order,
      stem: question.stem,
      answer: question.answer,
      analysis: question.analysis || "",
      type: question.type,
      options: question.options || [],
      updated_at: now,
    }));

    await insertChunks(this.config, "/questions", rows, this.session.access_token);
    return cloudId;
  },
  async searchPublicBanks(query = "") {
    assertConfigured(this.config);
    const trimmed = query.trim();
    let path = "/question_banks?visibility=eq.public&select=*&order=updated_at.desc&limit=50";
    if (trimmed) {
      const escaped = encodeURIComponent(`%${trimmed}%`);
      const exact = encodeURIComponent(trimmed);
      path += `&or=(id.eq.${exact},owner_username.ilike.${escaped},name.ilike.${escaped},course.ilike.${escaped},chapter.ilike.${escaped})`;
    }
    return restFetch(this.config, path, {
      method: "GET",
      token: this.session?.access_token,
    });
  },
  async getPublicBank(bankId) {
    assertConfigured(this.config);
    const banks = await restFetch(this.config, `/question_banks?id=eq.${encodeURIComponent(bankId)}&select=*`, {
      method: "GET",
      token: this.session?.access_token,
    });
    const bank = banks?.[0];
    if (!bank) return null;
    if (bank.visibility !== "public") return null;
    const questions = await restFetch(this.config, `/questions?bank_id=eq.${encodeURIComponent(bankId)}&select=*&order=order_no.asc`, {
      method: "GET",
      token: this.session?.access_token,
    });
    return { bank, questions };
  },
  async listUserPublicBanks(username) {
    assertConfigured(this.config);
    return restFetch(this.config, `/question_banks?owner_username=eq.${encodeURIComponent(username)}&visibility=eq.public&select=*&order=updated_at.desc`, {
      method: "GET",
      token: this.session?.access_token,
    });
  },
  async pushProgress(progressRows) {
    if (!progressRows.length) return;
    assertConfigured(this.config);
    const session = requireSession();
    const user = await this.getUser();
    const rows = progressRows.map((item) => ({
      id: `${user.id}_${item.questionId}`,
      user_id: user.id,
      bank_id: item.bankId,
      question_id: item.questionId,
      selected_answer: item.selectedAnswer || "",
      answered: Boolean(item.answered),
      correct: Boolean(item.correct),
      attempts: item.attempts || 0,
      wrong_count: item.wrongCount || 0,
      favorite: Boolean(item.favorite),
      mastered: Boolean(item.mastered),
      last_answered_at: item.lastAnsweredAt || null,
      updated_at: new Date().toISOString(),
    }));
    await insertChunks(this.config, "/question_progress?on_conflict=id", rows, session.access_token, "resolution=merge-duplicates");
  },
};

function normalizeConfig(config) {
  return {
    supabaseUrl: String(config.supabaseUrl || "").replace(/\/$/, ""),
    supabaseAnonKey: String(config.supabaseAnonKey || ""),
    appUrl: String(config.appUrl || "").replace(/\/?$/, "/"),
  };
}

function redirectUrl(config) {
  return config.appUrl || `${location.origin}${location.pathname}`;
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function saveSession(session) {
  if (!session) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function requireSession() {
  const session = loadSession();
  if (!session?.access_token) throw new Error("请先登录");
  return session;
}

function requireUser(profile) {
  if (!profile?.id) throw new Error("请先登录并设置个人资料");
  if (!profile.username) throw new Error("请先设置用户名");
  return profile;
}

function assertConfigured(config) {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error("还没有配置 Supabase，请先填写 config.js");
  }
}

async function authFetch(config, path, options) {
  const headers = {
    apikey: config.supabaseAnonKey,
    "Content-Type": "application/json",
  };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const response = await fetch(`${config.supabaseUrl}/auth/v1${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return readResponse(response);
}

async function restFetch(config, path, options) {
  assertConfigured(config);
  const headers = {
    apikey: config.supabaseAnonKey,
    Authorization: `Bearer ${options.token || config.supabaseAnonKey}`,
    "Content-Type": "application/json",
  };
  if (options.prefer) headers.Prefer = options.prefer;
  const response = await fetch(`${config.supabaseUrl}/rest/v1${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return readResponse(response);
}

async function insertChunks(config, path, rows, token, prefer = "") {
  for (let index = 0; index < rows.length; index += 400) {
    const chunk = rows.slice(index, index + 400);
    await restFetch(config, path, {
      method: "POST",
      token,
      prefer: `${prefer ? `${prefer},` : ""}return=minimal`,
      body: chunk,
    });
  }
}

async function readResponse(response) {
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.msg || data?.message || data?.error_description || data?.hint || response.statusText;
    throw new Error(message);
  }
  return data;
}

export const CLOUD_API_VERSION = API_VERSION;
