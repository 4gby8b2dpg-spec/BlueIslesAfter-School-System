# Supabase — database

The blueprint §2 schema lives in `migrations/` as versioned SQL.

## First-time setup

```bash
# 1. install the CLI (one time)
brew install supabase/tap/supabase        # or: npm i -g supabase

# 2. link this repo to your Supabase project
supabase login
supabase link --project-ref YOUR-PROJECT-REF

# 3. push the schema
supabase db push
```

Then copy `.env.local.example` → `.env.local` and fill in the URL + keys from
**Supabase dashboard → Project Settings → API**.

## Notes

- `0001_init.sql` creates every table with `org_id` multi-tenancy, enables RLS on
  all of them, and adds baseline read/write policies (see blueprint §8.2).
- **Follow-ups not yet in the migration:** Viewer-role PII exclusion, Staff limited
  to their own sessions, `audit_log` append-only enforcement, and column encryption
  for `medical_notes`. These are called out inline in the SQL.
- Generate typed models after pushing:
  `supabase gen types typescript --linked > lib/database.types.ts`
