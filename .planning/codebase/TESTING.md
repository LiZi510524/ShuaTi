# Testing

## Current Coverage

The repository has a Playwright smoke test at `wo-ai-shuati-pro/smoke-test.mjs`.

The smoke flow:

- opens the app
- imports an XLSX bank
- fills bank metadata
- starts a practice session
- confirms a question card renders
- opens Discover and Account tabs
- saves a screenshot to `wo-ai-shuati-pro/smoke-pro.png`

## Commands

```powershell
npm run fixture:smoke
npm run test:smoke
npm test
```

`npm test` generates the fixture and runs `tools/run-smoke-test.mjs`, which reuses an existing local server or starts `tools/dev-server.mjs` temporarily.

`npm run test:app` runs `wo-ai-shuati-pro/smoke-test.mjs` directly and expects a local server at `http://127.0.0.1:4174/` or a custom `SMOKE_BASE_URL`.

## Fixtures

`tools/create-smoke-fixture.mjs` creates `test-fixtures/smoke-bank.xlsx` without third-party XLSX libraries.

## Verification Notes

On this setup pass:

- `npm install` completed.
- `npm audit --audit-level=high` reported `found 0 vulnerabilities`.
- `npm run fixture:smoke` generated the smoke XLSX fixture.
- Local HTTP probe against `http://127.0.0.1:4174/` returned 200.
- In-app browser verified title, import form, navigation, and no console errors.
- `npx playwright install chromium` completed after retry.
- `npm test` passed and verified import, practice generation, Discover, and Account navigation.
