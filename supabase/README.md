# Supabase migrations

This project keeps Supabase database changes in `supabase/migrations`.

## Sprint 1 security hardening

Migration:

```txt
supabase/migrations/022_security_hardening_sprint1.sql
```

What it changes:

- Pins `search_path` for functions reported by Supabase Security Advisor.
- Removes anonymous execute access from sensitive RPC/helper functions.
- Converts `get_suppliers_for_material(uuid)` to `SECURITY INVOKER`.
- Sets defensive limits on the private `rfq-attachments` storage bucket.
- Replaces RFQ attachment storage policies with sales/admin role checks.
- Adds missing supplier foreign-key indexes for RFQ comments and quotes.

## Apply to the linked Supabase project

Use one of these paths.

### Option A — Supabase CLI

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push --dry-run
supabase db push
```

For non-interactive environments, set the required Supabase access token and database password through the shell/CI secret store, then run:

```bash
supabase link --project-ref <project-ref> --password "$SUPABASE_DB_PASSWORD"
supabase db push --dry-run --password "$SUPABASE_DB_PASSWORD"
supabase db push --password "$SUPABASE_DB_PASSWORD"
```

### Option B — Supabase Dashboard SQL Editor

1. Open Supabase Dashboard.
2. Go to SQL Editor.
3. Paste the full contents of `supabase/migrations/022_security_hardening_sprint1.sql`.
4. Run it once.
5. Save the migration in Git as the source of truth.

## Verify after applying

Run the read-only verification script:

```txt
supabase/verification/022_security_hardening_sprint1.sql
```

Expected result after the migration:

- `get_user_role` has a fixed `search_path` and no direct `anon` execute grant.
- `get_suppliers_for_material` is `SECURITY INVOKER`, has fixed `search_path`, and no `anon` execute grant.
- `update_updated_at_column` has fixed `search_path`.
- `rfq-attachments` has `public = false`, `file_size_limit = 26214400`, and a MIME allowlist.
- RFQ attachment policies include `public.get_user_role() in ('sales', 'admin')`.
- `idx_rfq_comments_supplier` and `idx_rfq_quotes_supplier` exist.

Also re-run Supabase Security Advisor and enable leaked password protection in Supabase Dashboard:

```txt
Authentication → Security → Leaked password protection → Enable
```
