# Deployment status

**Live at:** https://attendance-system-pellas1.vercel.app

- **Hosting:** Vercel (team `pellas1`, project `attendance-system`)
- **Backend:** Supabase project `attendance-system` (ref `yefojawpqejiuqhezdqd`, region `ap-southeast-1`)
  - Postgres 17 with Row Level Security on every table
  - Supabase Auth (email/password under the hood — see "Username login" below)
  - Edge Function `admin-users` for privileged user management (holds the
    service-role key server-side only, never shipped to the browser)
  - Realtime enabled on `attendance`, `attendance_corrections`, `notifications`
- **Source:** this repo, `web/` directory, branch `claude/cloud-attendance-system-1d076n`

## Demo accounts (change before real use)

| Username | Password | Role |
|---|---|---|
| `admin1` | `Admin@123` | Admin |
| `hr1` | `Hr@12345` | HR |
| `employee1` | `Employee@123` | Employee (IT dept) |
| `employee2` | `Employee@123` | Employee (Sales dept) |

## Username-based login

Supabase Auth is email/password. To support plain usernames, each account's
auth email is a synthetic `<username>@employee.local` address that is never
delivered anywhere — `src/lib/supabase.ts`'s `usernameToEmail()` builds it
deterministically from the username the user types, so no lookup call is
needed before sign-in.

## Database

Schema, RLS policies, and the `clock_in` / `clock_out` / `review_correction`
SECURITY DEFINER functions live in Supabase migrations (applied via the
Supabase MCP tools during development — no local migration files are checked
into this repo; use `supabase db pull` against the project if you need them
locally). Key tables: `companies`, `company_settings`, `departments`,
`work_schedules`, `profiles`, `attendance`, `attendance_corrections`,
`leave_records`, `audit_logs`, `notifications`.

Server-side timestamp authority: `clock_in`/`clock_out` use Postgres `now()`
internally — the client only supplies GPS coordinates and device info, never
a time value, so a manipulated device clock can't affect recorded times.

## Environment variables

`web/.env.production` is committed intentionally — it contains only the
Supabase **anon** key and project URL, which are meant to be public (Supabase's
whole security model is enforced by RLS policies + the anon key, not by
keeping the anon key secret). The service-role key is never in this repo; it
lives only as a Supabase Edge Function secret for `admin-users`.

## Redeploying after code changes

This project isn't yet linked to GitHub for auto-deploy (Vercel account has
no GitHub Login Connection configured — that requires browser interaction in
the Vercel dashboard: Settings → Login Connections). Until then, deploy
manually:

```bash
cd web
npm install
npm run build   # sanity check locally first
```

Then use the Vercel MCP `deploy_to_vercel` tool (or `npx vercel --prod` with
a `VERCEL_TOKEN`) targeting project `attendance-system`, team `pellas1`.

## What wasn't verified end-to-end

This session's sandbox has no outbound network access to arbitrary internet
hosts (only specific allowlisted tool traffic), so a live in-browser
click-through of the deployed app could not be run here. Instead:

- The Postgres RPC engine (`clock_in`, `clock_out`, `review_correction`) and
  every RLS policy were verified directly against the live database via SQL
  (impersonating each role), covering: duplicate Time In/Out prevention,
  Time Out without Time In, geofence accept/reject, employee data isolation,
  admin/HR full visibility, and correction approval updating attendance.
- The frontend build was verified locally (`npm run build`, zero TypeScript
  errors) and the exact same source was confirmed live and serving correctly
  post-deploy.
- The `admin-users` Edge Function (create/reset password/activate/deactivate/
  delete) was deployed but its runtime behavior was **not** exercised in this
  session — please smoke-test creating one user as Admin before relying on it.
