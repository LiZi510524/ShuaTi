# Structure

## Root

- `README.md` - project overview and workflow.
- `知识点生成流程.md` - process note for turning Excel question banks into knowledge-point PDFs.
- `package.json` - local maintenance scripts and test dependency.
- `docs/LOCAL_DEV.md` - local setup and collaboration notes.
- `tools/` - local development utilities.

## App

- `wo-ai-shuati-pro/index.html` - PWA shell.
- `wo-ai-shuati-pro/app.js` - main app logic, rendering, IndexedDB, XLSX parsing, practice behavior.
- `wo-ai-shuati-pro/cloud.js` - Supabase Auth and REST adapter.
- `wo-ai-shuati-pro/styles.css` - app styling.
- `wo-ai-shuati-pro/sw.js` - service worker.
- `wo-ai-shuati-pro/manifest.webmanifest` - PWA manifest.
- `wo-ai-shuati-pro/icons/` - PWA icons.
- `wo-ai-shuati-pro/supabase/schema.sql` - cloud database and RLS setup.

## Export Script

- `expert_script/chaoxing-source-export.user.js` - Tampermonkey export script.
- `expert_script/导题模板.xlsx` - expected spreadsheet template.

## Tests and Fixtures

- `wo-ai-shuati-pro/smoke-test.mjs` - Playwright smoke test.
- `tools/create-smoke-fixture.mjs` - generates a minimal XLSX fixture.
- `test-fixtures/` - generated local fixture output, ignored by git.
