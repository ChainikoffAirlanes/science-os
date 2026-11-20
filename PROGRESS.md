# Science OS — delivery progress

Updated 2026-11-20. Status: implementation complete; hosted browser verification and production release in progress.

| Module | Implementation | Observed verification |
|---|---|---|
| React/TypeScript, hash routing, Russian design system | Implemented | Typecheck, lint and production build pass |
| Database, RLS, versioned RPC, private Storage | Implemented, six migrations applied | 19/19 public tables have RLS; PostgreSQL authorization tests pass |
| Immediate registration, login, profile, avatar | Implemented | Real Supabase signup/login pass; avatar browser check pending latest regression |
| Dashboard, project CRUD/copy/archive, scientific sections | Implemented | Hosted creation/reload and duplication tested; latest regression in progress |
| Typed observations, custom parameters, keyboard editor | Implemented | Hosted cell persistence and conflict tests; unit validation passes |
| Invitations, roles, Realtime, Presence | Implemented | Genuine separate-account hosted tests; latest regression in progress |
| Tasks, comments, history, notifications | Implemented | Hosted task/comment/report scenario passed; latest regression in progress |
| Charts, comparison, statistics, image exports | Implemented | CSV/XLSX/chart scenario passed in prior hosted run; regression in progress |
| CSV/XLSX and private files | Implemented | Genuine hosted byte-for-byte roundtrip and unauthorized download checks passed |
| A4 Cyrillic PDF and print | Implemented | Actual PDF generated, extracted and rendered; final visual inspection pending |
| Selective publications and teacher opportunities | Implemented | Prior hosted scenarios passed; latest regression pending |
| Admin role search and verified grant operation | Implemented, migration applied | PostgreSQL restriction/last-admin tests pass; owner account bootstrap pending |
| Responsive layout | Implemented | Public seven widths pass; authenticated seven widths being rechecked |
| GitHub/Actions/Pages | Configured | Repository exists, workflow-based Pages enabled; source push and deploy pending |

## Owner-approved authentication change
The owner explicitly chose immediate email/password registration without email confirmation: “Да, регистрация сразу без письма”. Supabase Confirm email is disabled. Email ownership is unverified. Email recovery is unavailable until SMTP is configured, and the UI explains this. Password change while signed in remains supported. This supersedes original email verification and email recovery requirements.

## Verification boundaries
- `npm test`: 29 passed, including real PostgreSQL RLS/RPC execution in PGlite with Supabase infrastructure stubs.
- Hosted Playwright uses genuine Supabase Auth, PostgREST, Storage and WebSockets with three disposable test identities. No API mocks. Current complete result is recorded after the run finishes.
- CI deliberately skips hosted scenarios without disposable credentials and runs eight public-browser tests. Local credentials and traces are ignored and never published.
- Latest typecheck, lint and production build pass. Large lazy chart/workbook bundles produce a build warning; the build succeeds.
- Do not confuse a configured Pages URL with a verified live deployment.

## Data integrity fixes found during execution
Stable cell editors preserve input across rerenders. Each edit captures a base version; stale cell, narrative and task writes present a conflict instead of overwriting. Accepting a server narrative refreshes the visible cache. Import and export fetch committed data. Private deletion events contain metadata only. Removing members clears assignments transactionally. Role grants are restricted to administrators and cannot demote the last administrator.

## Remaining release work
Finish latest hosted regression, inspect PDF/responsive images, publish reviewed source, wait for successful Actions, run the same real lifecycle against Pages, bootstrap the confirmed owner account, remove disposable QA identities and data, and write the final release report with exact evidence and limits.
