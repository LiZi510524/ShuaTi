# Concerns

## Test Browser Dependency

`wo-ai-shuati-pro/smoke-test.mjs` depends on Playwright Chromium. If `npx playwright install chromium` cannot download because of network restrictions, smoke tests cannot run until a browser is installed or a mirror is configured.

Mitigation:

- Try `npx playwright install chromium` on a stable network before feature work.
- If the team uses a proxy or mirror, document the required environment variables in `docs/LOCAL_DEV.md`.
- Keep smoke tests focused so they remain cheap once the browser is available.

## Large Single File

`wo-ai-shuati-pro/app.js` contains rendering, state management, IndexedDB, XLSX parsing, practice logic, and cloud workflow glue in one file. This is workable for the current size, but future feature work should avoid broad edits and consider extracting stable modules only when needed.

Risk:

- Unrelated features can easily conflict in the same file.
- Tests should cover import and practice behavior before larger edits.

## Service Worker Cache During Development

`wo-ai-shuati-pro/sw.js` caches core files. Developers may see stale app code unless they unregister the service worker or clear site data while debugging.

Risk:

- A change can appear broken locally while the old cached file is actually running.
- Cache version bumps should be considered when changing cached assets.

## Config Safety

`wo-ai-shuati-pro/config.js` is tracked and currently contains blank placeholders. If real Supabase values are added locally, they can be committed accidentally. Supabase anon keys are public by design, but project URLs and deployment config should still be reviewed before commit.

Potential improvement:

- Move real local cloud settings to an ignored config variant if the team starts using shared development Supabase projects.

## Browser XLSX Compatibility

The app parses XLSX files directly using browser ZIP/XML APIs and `DecompressionStream`. Older browsers may fail on compressed XLSX files.

Mitigation:

- Keep test fixtures small and representative.
- Add targeted parser tests before changing XLSX handling.

## Cloud Coupling

Supabase REST paths and table schemas are hand-written in `cloud.js`. Schema changes in `supabase/schema.sql` need matching updates in the adapter and smoke/manual tests.

Risk:

- Cloud behavior can regress even when local-only brushing still works.
- Manual Supabase verification is needed for auth, publishing, and progress sync changes.
