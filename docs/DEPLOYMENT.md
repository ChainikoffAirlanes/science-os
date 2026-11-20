# Deployment

1. Create one free Supabase project. Keep the database password in the owner's password manager.
2. Run all numbered SQL migrations in filename order in SQL Editor. The SQL enables RLS on every user table; the Dashboard parser may not detect its DO block, so select **Run and enable RLS** if prompted. Apply each migration once.
3. Confirm `select count(*), count(*) filter(where rowsecurity) from pg_tables where schemaname='public';` returns equal counts (19 initially).
4. Use only the project's publishable key and URL in client configuration. Never use a service_role or secret key in VITE_ variables.
5. Authenticate the official GitHub CLI (`gh auth login --web`). Create the public science-os repository in the authenticated account. Check any existing repository before reuse.
6. Set repository **Actions variables** VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. These are public client values; they are intentionally embedded in the frontend.
7. Enable GitHub Pages with GitHub Actions as its source. The workflows verify, build and deploy only dist/.
8. Set Supabase Auth **Site URL** to the actual successful Pages URL. Add the exact deployed root and its `?recovery=1` form to redirect URLs. For local development add `http://127.0.0.1:5173/` and `http://127.0.0.1:5173/?recovery=1`. Do not include a HashRouter route in the Auth callback URL.
9. The owner explicitly approved immediate email/password registration without email confirmation on 2026-11-20. Confirm email is disabled in this installation; VITE_EMAIL_DELIVERY_ENABLED defaults to false, and the recovery page clearly says that email recovery is unavailable. Verify immediate registration, sign-in and persistence in a real browser. For a future mail-enabled installation, configure custom SMTP, enable email confirmation and set VITE_EMAIL_DELIVERY_ENABLED=true before testing email links.
10. Test two different user accounts, viewer permissions, file download isolation and realtime conflicts. Local PostgreSQL tests do not verify hosted Auth, WebSockets, email delivery or Storage service behavior.

## First administrator

Register the owner's application account first and identify that account using the owner's explicit confirmation. In the trusted SQL Editor run the following after replacing the placeholder with the checked owner's email:

```sql
update public.user_roles
set role = 'administrator'
where user_id = (select id from auth.users where email = 'OWNER_VERIFIED_EMAIL');
```

Never expose this operation as a public RPC. After this one-time bootstrap, the administrator can grant teacher privileges in Settings by searching the checked user's name or email and confirming the new role. School membership is not inferred from self-registration; authenticated publication visibility means all registered accounts.

## Migrations and rollback

The initial migration is intended for a fresh database, not repeated execution. Subsequent changes must be new numbered migrations. Keep backups before data-changing releases. A failed Pages deployment can be rolled back by redeploying a previously verified Git commit; do not reset production data as part of a frontend rollback.
