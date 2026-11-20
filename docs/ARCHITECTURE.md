# Architecture

The browser is a static React application. HashRouter supports deep links and refreshes on GitHub Pages. Vite derives base from GITHUB_REPOSITORY. Domain modules are in src/features; shared Supabase operations, validation, statistics and interchange are in src/lib. Heavy spreadsheets, PDF and charts are lazy-loaded.

Supabase supplies PostgreSQL, Auth, Storage and Realtime. There is no additional server. Auth callbacks are exchanged before HashRouter mounts. PKCE email links must be opened in the originating browser. Recovery uses a query flag outside the hash; the callback removes the flag and authorization code before rendering the reset screen. Research data is never persisted to browser storage. Supabase manages auth sessions; localStorage contains only a theme preference in addition to SDK-managed auth tokens. React Query caches are cleared on identity changes.

Projects have exactly one immutable owner. Additional project_members are editor or viewer. This intentionally avoids a last-owner demotion race; ownership transfer is not currently exposed. System roles are separate from editable profiles. Teacher privilege never implies membership in private projects.

Cells reference rows and parameters through composite foreign keys including experiment_id and project_id. save_cell locks a hash of the cell's unique key before checking its expected version, protecting first-write races as well as updates. update_record uses a row lock, a whitelist of fields and a version comparison for projects, experiments, tasks and opportunities. Imports append all rows inside one transaction; type validation uses the same save_cell function.

Project narrative supports safe text headings, paragraphs and lists. It never injects HTML. Public publications are explicit snapshots, not public policies on private project tables. Reports take real authored sections and data; no conclusions are generated.

Client subscriptions are scoped to the active project and cleaned up on unmount. Presence uses a private channel with server-side membership authorization. PostgreSQL insert/update events are filtered by RLS. Deletions also emit a private metadata-only broadcast so another participant can invalidate cached rows without exposing deleted scientific values. Notifications are database rows emitted by actual membership/task/application triggers. Removing a member clears task and experiment assignments in the same transaction.

Editors capture a version when opening a narrative block or task form. A realtime refresh never silently advances that form's expected version or replaces its draft. Conflicts require accepting the server fields or deliberately reapplying the local input.

File uploads use UUID paths in a private bucket. Metadata is written only after upload; failed metadata creation attempts object cleanup. Original names are metadata, not storage paths. Deletion removes the object before metadata; if the second step fails, retry removes stale metadata. A project with file metadata cannot be deleted until files are removed.
