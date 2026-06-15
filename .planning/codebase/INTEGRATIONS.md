# Integrations

## Supabase

Cloud features are implemented in `wo-ai-shuati-pro/cloud.js` using direct HTTP calls to Supabase Auth and PostgREST.

Configured values come from `PRO_CONFIG` in `wo-ai-shuati-pro/config.js`:

- `supabaseUrl`
- `supabaseAnonKey`
- `appUrl`

Database schema and row-level security policies live in `wo-ai-shuati-pro/supabase/schema.sql`.

## Supabase Auth

Supported entry points:

- Magic link email login via `cloud.sendMagicLink(email)`.
- Apple login redirect via `cloud.signInWithApple()`.
- Session tokens are stored in `localStorage` under `wo-ai-shuati-pro-session`.

## Supabase REST Tables

Tables expected by `cloud.js`:

- `profiles`
- `question_banks`
- `questions`
- `question_progress`

## Chaoxing / Learning Platform Export

`expert_script/chaoxing-source-export.user.js` is a Tampermonkey userscript for exporting submitted Chaoxing/Learning platform result pages into the Excel format expected by the PWA.

## External Runtime Dependencies

The production app avoids CDN and npm runtime dependencies. It relies on browser APIs and optional Supabase HTTP endpoints.
