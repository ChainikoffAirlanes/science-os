# Science OS — progress

Updated 2026-11-20. Status: **Deployed with Known Limitations**. Implementation, production verification and owner handoff are complete.

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
| Admin search and role grants | Implemented, applied | PostgreSQL last-admin/permission tests and hosted non-admin denial pass; owner bootstrap, hosted admin search and actual role RPC verified in Chrome |
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

## Completed owner handoff and cleanup
The owner signed into their own application account. After explicit confirmation, that exact account was assigned administrator. The real Settings screen shows the role; authenticated admin search and a successful idempotent role grant were verified through the published UI. No owner email or personal record is committed.

After explicit permission, all twelve exact disposable QA Auth identities were deleted using the guarded UUID list and test-email checks. SQL returned zero QA identities and confirmed the owner account remains. All three former fixture logins are denied. QA projects, opportunities, publications, files and avatars are cleared, and local generated credential files are removed.

No required owner actions remain. Agreed email limitations and supported data limits are documented in RELEASE_REPORT.md. The original specification remains unchanged.
