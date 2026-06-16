import assert from "node:assert/strict";
import test from "node:test";

import { buildOAuthSignInUrl } from "./cloud.js";

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
