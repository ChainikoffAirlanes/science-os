# Security model and test boundaries

Every private user-data table has RLS. Anonymous visitors can select only public publication snapshots. A project owner/editor/viewer can read permitted records; only owner/editor can mutate research records. Only the immutable owner can manage membership or publish. Direct writes to cell data, membership and invitations are not granted. Mutation RPCs check auth.uid() and never accept a caller-controlled actor ID.

Invitations store SHA-256 hashes of 244-bit random tokens from two cryptographically generated UUIDs. The plaintext token is returned once, expires after seven days, has a limited use count and can be revoked. Acceptance locks the invite row, checks expiry and usage, and never elevates an existing project role.

Storage uses a private bucket, a 10 MiB server-side cap, a MIME allowlist, UUID paths and RLS on the project prefix. In-app links require authentication; a generated preview URL is a bearer URL valid for 60 seconds. Avoid sharing signed URLs. Removing a member invalidates future authorized reads, but an already issued signed URL remains usable until expiry.

Client validation is UX, not authorization. The database enforces role restrictions, cell types, cross-experiment integrity, expected versions, immutable project identities and invitation atomicity. React escapes user strings; no unsafe HTML rendering is used. CSV/XLSX export prefixes formula-like text to mitigate spreadsheet formula execution. Workbooks are parsed as data, with limits on size and imported rows.

Tests execute the actual migrations in PGlite, with Supabase infrastructure schemas represented by small stubs. They test real PostgreSQL RLS and RPC logic but do not prove hosted service behavior. Hosted multi-account, Storage, registration and WebSocket checks are reported separately. Dependency audit status is recorded after installation. Deleted-row notifications contain only the table name and use a private project channel; no deleted scientific values are broadcast.

The owner explicitly chose unverified-email registration. Email ownership must not be used as proof of school identity or authorization. Email recovery is disabled until a mail service is configured. Existing-password changes while signed in still use Supabase Auth.

Known operational boundaries: public registration is not verified school membership; Storage MIME checks do not replace antivirus scanning; text/files should not contain highly sensitive student records. No telemetry or third-party analytics is installed.
