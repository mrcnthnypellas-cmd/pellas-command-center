# Deployment status

**Live at: https://pellas-command-centre.vercel.app**

- **Hosting:** Vercel (project `pellas1/pellas-command-centre`)
- **Source:** https://github.com/mrcnthnypellas-cmd/pellas-command-center (`main` branch)
- **Database:** Neon Postgres (`ep-flat-snow-b3wfcudz`, `ap-southeast-1`), already
  migrated and seeded. (Previously Supabase — migrated off it; that project can be
  deleted once you're confident Neon is stable.)
- **File storage:** `STORAGE_DRIVER=s3`, backed by Supabase Storage's S3-compatible
  API (bucket `pellas-storage`, project `vswgxprxnesoodbcrxkt`) — fixed and verified
  persistent (see below for how this was broken, and how it got fixed).

Demo logins (same as local — see `prisma/seed.ts`): `superadmin` / `12345`,
`admina` / `12345`, `hra`, `ita`, `employee.aa`, `client.aa` (all `/12345`), plus a
`b`-suffixed set for Company B. **Change these before any real use.**

## File storage — fixed (previously a known gap)

Vercel's serverless functions don't keep a persistent local disk between requests, so
`STORAGE_DRIVER=local` used to mean uploaded documents, generated payslip PDFs, and
Super-Admin-uploaded announcement images (and the login background) didn't persist —
they wrote to a location that either didn't exist (`ENOENT`, crashing the request) or
vanished on the next cold start.

Fixed by switching production to `STORAGE_DRIVER=s3`, pointed at Supabase Storage's
S3-compatible API (no new signup — reuses the Supabase project from the earlier DB
migration). Env vars: `S3_BUCKET=pellas-storage`,
`S3_ENDPOINT=https://vswgxprxnesoodbcrxkt.storage.supabase.co/storage/v1/s3`,
`S3_REGION=ap-southeast-1`, plus `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` (a
Storage → S3 Connection access key from that project's dashboard).

Two real bugs surfaced and got fixed along the way, worth knowing about if this ever
needs debugging again:
- `src/lib/storage/s3.ts` was missing `forcePathStyle: true` on the `S3Client`. AWS's
  SDK defaults to virtual-hosted-style addressing (`<bucket>.<endpoint>`), which
  doesn't exist for S3-compatible providers (R2, Supabase Storage, MinIO, B2, ...) —
  every upload failed with a TLS handshake error until this was added.
- Passing env var values with a leading `/` (e.g. `/tmp/storage`) through
  `vercel env add --value` from Git Bash on Windows gets silently mangled by MSYS
  path auto-conversion into a Windows-style path. Prefix the command with
  `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*"` to stop that.

Local dev is unaffected — it still runs `STORAGE_DRIVER=local` against
`./storage/uploads`, which is fine on a real filesystem.

## Connection pooler gotcha (already fixed, documented for reference)

`DATABASE_URL` **must** include `?pgbouncer=true` when pointed at a PgBouncer-style
transaction-mode pooler (Neon's pooled endpoint, Supabase's port 6543, etc.) —
without it, Prisma's prepared-statement caching collides with the pooler and every
second request fails with `prepared statement "s0" already exists`. `DIRECT_URL`
(the non-pooled endpoint) does not need this flag and is used only for
`prisma migrate`/`db push`.

## Redeploying after code changes

```bash
git add -A && git commit -m "..." && git push
npx vercel deploy --prod --token=<VERCEL_TOKEN> --yes
```

(No GitHub→Vercel auto-deploy webhook is connected yet — that requires linking GitHub
as a Login Connection in the Vercel dashboard, which needs your browser interaction.
Until then, deploys are manual via the command above.)

## Managing environment variables

```bash
npx vercel env ls --token=<VERCEL_TOKEN>
npx vercel env add <NAME> production --value "<value>" --token=<VERCEL_TOKEN> --yes
npx vercel env rm <NAME> production --token=<VERCEL_TOKEN> --yes
```

Changes to env vars require a redeploy to take effect.
