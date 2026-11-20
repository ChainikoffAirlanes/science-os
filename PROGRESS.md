# Science OS — progress

Updated 2026-11-20. Status: **Deployed with Known Limitations**. The goal remains active for the owner handoffs below.

## Delivered and verified

| Module | Implementation | Evidence |
|---|---|---|
| Russian React/TypeScript workspace and routing | Implemented | Typecheck, lint, build and public-route refresh pass locally/CI/Pages |
| Supabase database, RLS and versioned RPC | Applied, six migrations | 19/19 public tables protected; 14 PostgreSQL integration tests pass |
| Immediate registration, sessions, profile and avatar | Implemented | Genuine production signup/login and avatar scenario pass |
| Projects, scientific sections, duplication and CRUD | Implemented | Hosted creation, reload, copy and metadata/delete checks pass |
| Typed experiments, parameters and cell editor | Implemented | Hosted persistence, keyboard editing, conflict and unsaved-route guard pass |
| CSV/XLSX import/export | Implemented | Actual workbook/CSV operations, preview, row counts and SQL atomicity pass |
| Four chart types, comparisons and statistics | Implemented | Real two-series comparison, saved configuration and PNG/SVG/PDF exports pass |
| Invitations, roles, Realtime and Presence | Implemented | Genuine independent accounts, WebSocket synchronization, deletion and viewer denial pass |
| Tasks, comments, history and notifications | Implemented | Hosted task/comment lifecycle and concurrent-draft protection pass |
| Private files and folders | Implemented | PDF/XLSX byte-for-byte hosted roundtrip; anonymous/outsider denial pass |
| Reports, A4 PDF and Cyrillic | Implemented | Real four-page PDF from Pages rendered and inspected |
| Selective publications and opportunities | Implemented | Anonymous safe snapshot, teacher opportunity, student application and acceptance pass |
| Admin search and role grants | Implemented, applied | PostgreSQL last-admin/permission tests and hosted non-admin denial pass; first owner bootstrap pending |
| Responsive UI | Implemented | Seven widths, public screens and eight authenticated routes pass; screenshots inspected |
| Read lifetimes and search | Implemented | Genuine request cancellation and save-after-navigation test passes on Pages; project/library/global search is debounced |
| GitHub Actions / Pages | Live | Source 37e284e, successful CI/deployment, public assets HTTP 200 |

## Production evidence
- Website: https://chainikoffairlanes.github.io/science-os/
- Repository: https://github.com/ChainikoffAirlanes/science-os
- Successful CI: https://github.com/ChainikoffAirlanes/science-os/actions/runs/44754115600
- Successful deployment: https://github.com/ChainikoffAirlanes/science-os/actions/runs/44754115688
- `npm test`: 15 unit + 14 genuine PostgreSQL PGlite integration tests, 29 passed.
- Baseline production Playwright: 24 passed, zero failed/skipped, 229 seconds. Actual Supabase Auth, REST, Storage and WebSockets.
- Latest production regression on 37e284e: 24 passed, zero failed/skipped; 23 repeated scenarios plus genuine delayed-read cancellation and save-after-navigation. Signup is covered by the baseline and was not repeated; no additional Auth identity was created. Route handlers add latency only; they do not mock responses.
- CI deliberately runs eight public-browser tests and skips seventeen hosted tests without disposable credentials. It does not claim hosted coverage.
- `npm audit --omit=dev`: zero vulnerabilities.
- Summary: docs/VERIFICATION.json. Full scope, test boundaries and operational limits: RELEASE_REPORT.md.

## Owner-approved authentication change
The owner chose immediate email/password registration without email confirmation: “Да, регистрация сразу без письма”. Confirm email is disabled. Email ownership is unverified. Email recovery is unavailable until SMTP is configured; the UI explains this. Signed-in password changes remain supported. This supersedes the initial email verification/recovery requirements.

## Cleanup and remaining handoff
Test projects, opportunities, publications, private files and avatars have been cleared and verified absent for the dedicated QA identity. Twelve exact disposable Auth identities remain. Guarded SQL is prepared in ignored .tools/; deletion awaits owner permission. No real user's account is selected.

The owner has been asked to register their own app account and confirm its email for first-administrator bootstrap. This requires no password disclosure. The active goal is not marked complete while these handoffs remain.
