# Deploying Pellas Command Center online

This app is built to run either locally or fully in the cloud. For "accessible online
like a real website," the target stack is:

- **Hosting:** [Vercel](https://vercel.com) — native Next.js support, free tier, gives
  you a real `https://your-app.vercel.app` URL.
- **Database:** [Neon](https://neon.tech) — serverless PostgreSQL, free tier, built
  for exactly this (pairs natively with Vercel).
- **File storage:** [Cloudflare R2](https://developers.cloudflare.com/r2/) —
  S3-compatible object storage, free tier, no egress fees. Required in production
  because Vercel's serverless functions don't keep a persistent local disk between
  requests — the `STORAGE_DRIVER=local` adapter only works for single-machine dev.

None of these steps can be done by Claude directly — account creation and payment
setup are things only you can do. This doc is the checklist to follow.

## 1. Create a Neon database

1. Go to https://neon.tech and sign up (free tier is enough to start).
2. Create a new project, e.g. "pellas-command-center".
3. In the Neon dashboard, open **Connection Details** and copy two connection strings:
   - The **pooled** connection string (host contains `-pooler`) → this becomes `DATABASE_URL`.
   - The **direct** connection string (no `-pooler`) → this becomes `DIRECT_URL`.

## 2. Create a Cloudflare R2 bucket

1. Go to https://dash.cloudflare.com, sign up, open **R2** in the sidebar.
2. Create a bucket, e.g. `pellas-command-center-uploads`.
3. Under **Manage R2 API Tokens**, create an API token with read/write access to
   that bucket. Copy the Access Key ID, Secret Access Key, and Account ID.
4. Your `S3_ENDPOINT` is `https://<account-id>.r2.cloudflarestorage.com`, `S3_REGION`
   is `auto`, `S3_BUCKET` is the bucket name.

## 3. Push this repo to GitHub

```bash
git add -A
git commit -m "Initial commit"
```

Then create a new (private, recommended) GitHub repository and push to it — Vercel's
easiest deploy path connects directly to a GitHub repo.

## 4. Create the Vercel project

1. Go to https://vercel.com, sign up, click **Add New → Project**, and import the
   GitHub repo from step 3.
2. Before the first deploy, add these Environment Variables in the Vercel project
   settings (Production, and Preview if you want preview deploys to work too):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Neon pooled connection string |
   | `DIRECT_URL` | Neon direct connection string |
   | `NEXTAUTH_URL` | your Vercel production URL, e.g. `https://pellas-command-center.vercel.app` |
   | `NEXTAUTH_SECRET` | output of `openssl rand -base64 32` |
   | `STORAGE_DRIVER` | `s3` |
   | `S3_ENDPOINT` | from step 2 |
   | `S3_REGION` | `auto` |
   | `S3_BUCKET` | from step 2 |
   | `S3_ACCESS_KEY_ID` | from step 2 |
   | `S3_SECRET_ACCESS_KEY` | from step 2 |
   | `EMAIL_DRIVER` | `console` (or `resend` once you have a Resend account + `RESEND_API_KEY`) |

3. Deploy. Vercel builds with `npm run build` automatically.

## 5. Run migrations + seed against Neon

From your local machine, with `DATABASE_URL`/`DIRECT_URL` in `.env` pointed at Neon:

```bash
npm run prisma:migrate
npm run prisma:seed
```

This applies the schema to the live Neon database and creates the demo accounts
listed in `prisma/seed.ts` (super admin, company admins, HR/IT admins, employees,
clients — two full companies for testing cross-company RBAC denial).

## 6. Verify

Open the Vercel URL, sign in with `superadmin@pellas.local` / `Password123!`
(from the seed script — **change or remove this account before any real use**), and
confirm the dashboard loads. Then sign in as an Employee/Client account and confirm
you cannot reach another company's or another user's data by guessing/editing a URL.
