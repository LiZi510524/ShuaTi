# Magic Link Login and Public Bank Sharing Design

## Objective

Complete the account and public bank workflow for ShuaTi without adding password handling.

The app should support:

- Email magic link login through Supabase Auth.
- Public username and display name as uploader identity.
- Guest search, viewing, and local saving of public question banks.
- Authenticated publishing of local banks to the public library.

## Confirmed Product Boundary

Login identity and public identity are separate.

Login identity:

- Uses Supabase Auth email magic links.
- Does not use passwords.
- Does not store passwords in the app, GitHub Pages, or app-owned database tables.
- Stores only the Supabase session token in the user's browser local storage.

Public identity:

- Requires `username` and `display_name` before publishing.
- May include optional `bio` and `avatar_url`.
- Is publicly readable.
- Does not expose the user's email address.

Guest users can:

- Search public question banks.
- View public question banks.
- Save public question banks into local IndexedDB.

Only logged-in users with complete public identity can:

- Publish a local question bank.
- Update a previously published question bank they own.
- Sync practice progress.

## Data Model

Supabase Auth stores the user email and authentication state. Password fields are not used.

`profiles` stores public user identity:

- `id`: Supabase Auth user ID.
- `username`: unique public handle.
- `display_name`: public display name.
- `avatar_url`: optional.
- `bio`: optional.

`question_banks` stores public bank metadata:

- `id`
- `owner_id`
- `owner_username`
- `name`
- `course`
- `chapter`
- `tags`
- `visibility`
- `question_count`
- `counts`
- `save_count`
- timestamps

`questions` stores public question content for public banks:

- question stem
- answer
- analysis
- type
- options
- order

`question_progress` stores private user progress and remains scoped to the authenticated user.

## Privacy Rules

Public:

- `profiles.username`
- `profiles.display_name`
- `profiles.bio`
- public bank metadata
- public bank question stems, answers, analyses, and options

Private:

- email address
- session token
- local IndexedDB banks unless explicitly published
- wrong answers
- favorites
- practice progress

The UI must clearly warn before publishing that question content, correct answers, and analyses will become public.

## Access Control

Existing Row Level Security remains the primary security boundary:

- Profiles are public readable.
- Users can manage only their own profile.
- Public banks are readable by everyone.
- Bank owners can manage only their own banks.
- Public bank questions are readable by everyone.
- Question owners can manage only their own questions.
- Progress rows are readable/writable only by their owner.

The frontend should still perform early checks for better UX:

- Not logged in: redirect to Account view and show a login prompt before publishing.
- Logged in without complete profile: redirect to Account view and show the profile form.
- Publishing public content: require confirmation before sending data to Supabase.

## User Flow

### Account View

Unauthenticated:

- Show email input and "send login link" action.
- Explain that login uses email links and no password is set.
- Explain that email is not shown publicly.

Authenticated without public identity:

- Show profile form.
- Require `username` and `display_name`.
- Explain that these values are shown on published banks.

Authenticated with public identity:

- Show profile summary.
- Allow editing profile.
- Show sign out action.
- Show progress sync entry point.

### Discover View

Available to guests and logged-in users.

Search supports:

- bank ID
- username
- bank name
- course
- chapter

Result cards show:

- bank name
- course and chapter
- tags
- question count
- type counts
- uploader username or display name
- updated time
- save action

Saving a public bank copies bank and question rows into local IndexedDB. Saved rows should keep source metadata such as `cloudId` so the app can avoid duplicate saves or show origin later.

### Publish Flow

From a local bank card:

1. User clicks "public publish" or "update publish".
2. App checks login state.
3. App checks public profile completeness.
4. App shows a confirmation that questions, answers, and analyses will be public.
5. App sends bank metadata and questions through `cloud.publishBank`.
6. App stores the returned `cloudId` on the local bank.
7. The card changes future action text to update publish.

## Implementation Approach

Use the existing static PWA and Supabase REST adapter. Do not add a custom backend or password table.

Recommended changes:

- Add small auth/profile helper functions in `app.js` or a focused module if extracting is low-risk.
- Centralize publish readiness checks.
- Improve Account view copy for magic link login and public identity.
- Improve Discover save behavior for guests.
- Add publish confirmation before public upload.
- Keep `cloud.js` as the Supabase boundary.

Do not introduce Supabase JS SDK in this phase. The existing REST wrapper is sufficient and keeps the app dependency-light.

## Error Handling

Expected user-facing errors:

- Email link failed to send.
- Login session expired.
- Username is invalid or already taken.
- Profile incomplete when publishing.
- Public bank no longer exists.
- Save failed because local IndexedDB failed.
- Publish failed because Supabase rejected the request.

Error behavior:

- Show concise toast messages.
- Keep local data intact.
- Do not clear local banks on login/logout.
- Log technical details to console only when useful for debugging.

## Testing

Automated:

- Keep `npm test` smoke coverage for guest import and practice.
- Add targeted tests or small test harness coverage for:
  - publish readiness state calculation
  - public bank to local bank mapping
  - duplicate public bank save handling

Manual UAT:

- Guest can search public banks.
- Guest can save and practice a public bank locally.
- Guest cannot publish and is routed to login.
- Logged-in user without profile cannot publish and is routed to profile setup.
- Logged-in user with profile can publish.
- Published bank does not expose email.
- Other users can find and save the published bank.

## Out of Scope

- Password login.
- Password storage.
- Apple login.
- Admin moderation tooling.
- Paid/private sharing.
- Server-side search ranking.
- Full Supabase JS SDK migration.

## Open Implementation Notes

- The current app already has much of the required backend boundary in `cloud.js`.
- `app.js` is large, so implementation should keep changes localized and avoid unrelated refactors.
- If helper extraction is needed, extract only stable auth/profile/public-bank helpers that reduce risk in this feature.
