# Database migration status

The destination schema and a private import utility are prepared. The application
still uses Supabase. This is not a completed backend migration, and deploying the
schema alone does not change account login or course storage.

The new `mfp` schema holds relational tables for profiles, roles, subjects,
courses, lessons, enrollment, quizzes, results, settings, media references, and
custom formulas. Existing record IDs and relationships are retained. The
`accounts` table retains legacy account IDs and server-side email addresses for
future verified linking to Netlify Identity. It does not import password hashes,
sessions, or make those accounts usable through Netlify Identity yet. There are
no public grants or browser-facing database endpoints.

## Source access

Configure `SUPABASE_SERVICE_ROLE_KEY` securely in Netlify for the **source**
project. Never put it in a `VITE_` variable, source control, a command argument,
or chat. `MIGRATION_SOURCE_URL` can override `SUPABASE_URL` when the source
project differs from the runtime backend. Use a Netlify environment with access
to both the source credentials and the destination database. Source access must
allow account administration and all application tables; public read access
cannot export private user data.

## Readiness and import

Netlify automatically applies the new SQL migration on deployment. Do not apply
it manually. In a configured Netlify execution environment, run:

```sh
node scripts/database/import-supabase.mjs
```

This only checks administrator access and counts source rows; it makes no changes.
It logs counts and fixed error messages, never rows, emails, or credentials.
Before applying, put the source application in a maintenance window and pause
all writers, including admin edits and payment webhooks. Keep writes paused
through the import and verification. An import uses multiple source requests;
only a write pause provides a consistent source snapshot.

```sh
node scripts/database/import-supabase.mjs --apply --source-paused
```

The destination must be empty. One destination transaction imports all records
and checks row counts. A failure rolls back the structured import. An advisory
lock prevents concurrent imports. New source columns cause a failure instead of
silently losing fields. A completed import cannot be rerun over existing data.
The utility never deletes, updates, or sends email to source users. Do not run
it from a browser or expose it as an unauthenticated HTTP endpoint.

## Required before switching the application

1. Verify imported IDs, ownership, counts, course content, and result histories
   against a frozen source. Compare the source schema with the destination;
   any source fields absent from the migration require a new SQL migration.
2. Migrate the private media bucket to Netlify Blobs, including files referenced
   inside lesson blocks and site settings. Preserve object paths and enforce
   private access through authenticated server routes. This import copies media
   references only; it does not copy media files.
3. Implement and test Netlify Identity account migration/linking, username login
   with server-only email resolution, recovery, and the existing administrator
   authorization rules. Existing passwords are not transferable through the
   account-list API; establish the supported account activation/recovery flow
   before disconnecting source authentication. Do not merge accounts by an
   unverified email supplied by a client.
4. Replace Supabase database, storage, server-admin, payment, and realtime calls
   with authenticated Netlify APIs. Enforce ownership and administrator checks
   for every operation, including proctoring and quiz grading. Credentials in
   settings and payment configuration must remain server-only.
5. Test the complete user and administrator flows in a preview, and prepare a
   verified backup and rollback path before switching production. Reconcile
   incoming payments before resuming writes on the new backend.

Keep the source backend and its data intact until all these checks pass. No
cutover toggle is provided because switching the current application directly
to this schema would break existing flows. Netlify hosting, database, storage,
authentication, and AI usage remain subject to platform limits and billing; a
new database does not guarantee zero cost.
