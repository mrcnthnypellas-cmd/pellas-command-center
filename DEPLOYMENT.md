# Deployment status

**Live at: https://pellas-command-centre.vercel.app**

- **Hosting:** Vercel (project `pellas1/pellas-command-centre`)
- **Source:** https://github.com/mrcnthnypellas-cmd/pellas-command-center (`main` branch)
- **Database:** Supabase Postgres, project `pellas-command-center` (ref `zgptqjkxhoreysjummmi`,
  region `ap-southeast-1`), already migrated and seeded.
- **File storage:** `STORAGE_DRIVER=local` — **not yet production-ready** (see below).

Demo logins (same as local — see `prisma/seed.ts`): `superadmin` / `12345`,
`admina` / `12345`, `hra`, `ita`, `employee.aa`, `client.aa` (all `/12345`), plus a
`b`-suffixed set for Company B. **Change these before any real use.**

## Known gap: file storage

Vercel's serverless functions don't keep a persistent local disk between requests, so
`STORAGE_DRIVER=local` means uploaded documents and generated payslip PDFs **will not
persist** in production — they write successfully to `/tmp` per-invocation but vanish
on the next cold start. Everything else works; this only affects Documents uploads and
Payroll's "Mark Paid & Issue Payslip" PDF step.

To fix: get S3-compatible storage (Cloudflare R2, AWS S3, or Supabase Storage's S3
API) and set `STORAGE_DRIVER=s3` plus `S3_ENDPOINT`/`S3_REGION`/`S3_BUCKET`/
`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` as Vercel env vars, then redeploy. The
storage adapter interface (`src/lib/storage/`) already supports this — it's a config
change, not a code change.

## Supabase pooler gotcha (already fixed, documented for reference)

`DATABASE_URL` **must** include `?pgbouncer=true` when pointed at Supabase's
transaction-mode pooler (port 6543) — without it, Prisma's prepared-statement caching
collides with PgBouncer and every second request fails with
`prepared statement "s0" already exists`. `DIRECT_URL` (port 5432, session mode) does
not need this flag and is used only for `prisma migrate`/`db push`.

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
