# Architecture

## Shape

The project is a static PWA plus a browser userscript:

- `expert_script/` exports question banks from Chaoxing pages.
- `wo-ai-shuati-pro/` imports question bank XLSX files and provides local/offline practice.
- Optional cloud features connect the local app to Supabase.

## App Entry Point

`wo-ai-shuati-pro/index.html` loads:

- `styles.css`
- `app.js`
- PWA manifest and icons

`app.js` imports `cloud.js`, initializes cloud session state, loads IndexedDB data, renders the first view, and registers the service worker.

## State Model

`app.js` maintains one global `state` object with:

- active view
- bank list
- current bank and questions
- progress map
- practice queue
- cloud session/profile/search state

Rendering is string-template based. User actions bubble through centralized handlers:

- `handleViewClick`
- `handleViewSubmit`
- `handleViewChange`
- `handleViewInput`

## Persistence

Local persistence is IndexedDB:

- `banks`
- `questions`
- `progress`

Current bank selection and cloud session metadata use `localStorage`.

## Cloud Boundary

`cloud.js` is the boundary for all Supabase operations. `app.js` calls semantic methods such as `publishBank`, `searchPublicBanks`, `saveProgress`, and `upsertProfile` instead of constructing Supabase requests directly.

## Offline Boundary

`sw.js` caches core static files. `config.js` is treated specially so the service worker attempts a network fetch first and falls back to cache.
