import assert from "node:assert/strict";
import test from "node:test";

import { buildOAuthSignInUrl, cloud } from "./cloud.js";

test("builds a Supabase GitHub OAuth authorize URL with the configured production redirect", () => {
  const url = buildOAuthSignInUrl({
    supabaseUrl: "https://example.supabase.co/",
    supabaseAnonKey: "anon",
    appUrl: "https://site.example/app/",
  }, "github", {
    hostname: "site.example",
    origin: "https://site.example",
    pathname: "/app/",
  });

  assert.equal(
    url,
    "https://example.supabase.co/auth/v1/authorize?provider=github&redirect_to=https%3A%2F%2Fsite.example%2Fapp%2F",
  );
});

test("uses the configured final app URL as the OAuth redirect during local development", () => {
  const url = buildOAuthSignInUrl({
    supabaseUrl: "https://example.supabase.co/",
    supabaseAnonKey: "anon",
    appUrl: "https://site.example/app/",
  }, "github", {
    hostname: "127.0.0.1",
    origin: "http://127.0.0.1:4181",
    pathname: "/index.html",
  });

  assert.equal(
    url,
    "https://example.supabase.co/auth/v1/authorize?provider=github&redirect_to=https%3A%2F%2Fsite.example%2Fapp%2F",
  );
});

test("builds an OAuth redirect from the current page when appUrl is empty", () => {
  const url = buildOAuthSignInUrl({
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "anon",
    appUrl: "",
  }, "github", {
    hostname: "127.0.0.1",
    origin: "http://127.0.0.1:4180",
    pathname: "/index.html",
  });

  assert.equal(
    url,
    "https://example.supabase.co/auth/v1/authorize?provider=github&redirect_to=http%3A%2F%2F127.0.0.1%3A4180%2F",
  );
});

test("rejects unsupported OAuth providers", () => {
  assert.throws(
    () => buildOAuthSignInUrl({
      supabaseUrl: "https://example.supabase.co",
      supabaseAnonKey: "anon",
      appUrl: "https://site.example/app/",
    }, "password"),
    /不支持的登录方式/,
  );
});

test("refreshes an expired stored session before fetching the current user", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  const calls = [];
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  cloud.config = {
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "anon",
    appUrl: "https://site.example/app/",
  };
  localStorage.setItem("wo-ai-shuati-pro-session", JSON.stringify({
    access_token: "stale-token",
    refresh_token: "refresh-token",
    expires_at: Date.now() - 1000,
  }));
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/auth/v1/token?grant_type=refresh_token")) {
      assert.equal(JSON.parse(options.body).refresh_token, "refresh-token");
      return new Response(JSON.stringify({
        access_token: "fresh-token",
        refresh_token: "fresh-refresh-token",
        expires_in: 3600,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (String(url).endsWith("/auth/v1/user")) {
      assert.equal(options.headers.Authorization, "Bearer fresh-token");
      return new Response(JSON.stringify({ id: "user-1", email: "u@example.com" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    const user = await cloud.getUser();
    assert.equal(user.id, "user-1");
    assert.deepEqual(calls.map((call) => call.url), [
      "https://example.supabase.co/auth/v1/token?grant_type=refresh_token",
      "https://example.supabase.co/auth/v1/user",
    ]);
    const saved = JSON.parse(localStorage.getItem("wo-ai-shuati-pro-session"));
    assert.equal(saved.access_token, "fresh-token");
    assert.equal(saved.refresh_token, "fresh-refresh-token");
    assert.ok(saved.expires_at > Date.now());
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalLocalStorage;
  }
});
