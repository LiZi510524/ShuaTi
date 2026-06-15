# Technology Stack

## Runtime

- Static browser app under `wo-ai-shuati-pro/`.
- No production build step. `wo-ai-shuati-pro/index.html` loads `app.js` as an ES module.
- Local development uses Node.js tooling only for scripts and smoke tests.

## Languages

- HTML: `wo-ai-shuati-pro/index.html`
- CSS: `wo-ai-shuati-pro/styles.css`
- JavaScript ES modules: `wo-ai-shuati-pro/app.js`, `wo-ai-shuati-pro/cloud.js`
- SQL: `wo-ai-shuati-pro/supabase/schema.sql`
- Userscript JavaScript: `expert_script/chaoxing-source-export.user.js`

## Local Tooling

- `package.json` defines maintenance scripts:
  - `npm run dev` starts `tools/dev-server.mjs`.
  - `npm run fixture:smoke` generates `test-fixtures/smoke-bank.xlsx`.
  - `npm test` runs fixture generation and `wo-ai-shuati-pro/smoke-test.mjs`.
- `playwright` is the only Node development dependency.
- The app can also be served with `python -m http.server 4174` from `wo-ai-shuati-pro/`.

## Browser APIs

- IndexedDB stores banks, questions, and progress.
- Service Worker caches core PWA assets via `wo-ai-shuati-pro/sw.js`.
- Web App Manifest is `wo-ai-shuati-pro/manifest.webmanifest`.
- XLSX import is parsed in browser without a spreadsheet library.

## Configuration

- `wo-ai-shuati-pro/config.js` exports `PRO_CONFIG`.
- Empty `supabaseUrl` and `supabaseAnonKey` disable cloud features.
- `wo-ai-shuati-pro/config.example.js` documents cloud configuration shape.
