# Conventions

## JavaScript

- ES modules are used throughout the PWA.
- `app.js` uses function declarations grouped by responsibility rather than classes.
- DOM rendering is done with template literals and `innerHTML`.
- Event delegation is centralized on `#view` with `data-action` attributes.
- IDs are generated client-side with `createId(prefix)`.

## State and Rendering

- Mutate the global `state` object, then call `render()`.
- View switching is controlled by `state.view`.
- Practice state uses `queue`, `queueIndex`, `selected`, `submitted`, and `lastResult`.

## Data Format

Excel import expects:

- A column: question stem
- B column: correct answer
- C column: analysis
- D-J columns: options A-G

Question types are inferred from answer and option shape in `detectQuestionType`.

## Error Handling

- User-facing failures usually call `showToast(...)`.
- Cloud failures are caught near UI workflows and logged with `console.error`.
- `cloud.js` throws errors with response status and Supabase message details.

## Local Development

- Keep production app dependency-free.
- Put maintenance-only scripts under `tools/`.
- Keep generated logs, screenshots, and fixtures out of git.
