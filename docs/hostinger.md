# Deploy Ascent on Hostinger Node.js web app hosting

Ascent is an MIT-licensed **Next.js 16 / Node.js 24** application. Its production start command is `next start -H 0.0.0.0`. Next.js reads the `PORT` environment variable supplied by the hosting platform; it falls back to port 3000 if `PORT` is not set. Do **not** hard-code a port or place `PORT` in `.env.local` for production.

## Import from GitHub

In Hostinger hPanel, create a **Web App**, select **Import Git Repository**, and choose `topherchris420/project-ascent` on branch `master`. Use these settings if Hostinger does not detect them automatically:

| Setting | Value |
| --- | --- |
| Framework | Next.js |
| Node version | 24.x |
| Root directory | Repository root |
| Install | `npm ci` |
| Build | `npm run build` |
| Start | `npm start` |

The `dev` script intentionally stays local-only (`127.0.0.1:3040`), while `start` is suitable for the hosting process. Hostinger can provision its own port; Next.js picks it up from the runtime environment.

## Decide what to enable

The **public research pages, recorded-sales explorer and fictional demo** use bundled data and do not need external AI or data-provider keys. You can verify these first at `/`, `/sales` and `/demo`.

**Do not assume that a live website is a production-ready account service.** Persistent accounts and private transaction workspaces require an independently provisioned PostgreSQL database with PostGIS, the repository's migrations, correctly restricted roles, and server-side settings including `DATABASE_URL`, `APP_ORIGIN` (the exact HTTPS origin with no trailing slash), `APP_ENCRYPTION_KEY`, `CRON_SECRET` and database TLS settings. Follow [deployment setup](engineering.md#deployment) and [production readiness](production-readiness.md) before enabling them. A database password, encryption key or provider token must never be stored in source or a `NEXT_PUBLIC_` variable.

## Verify

1. In GitHub, check the latest CI run (types, tests, evaluation and build).
2. In Hostinger, check the completed deployment and server logs. Open the public routes mentioned above.
3. If startup fails, confirm Node 24, `npm run build`, the `npm start` command and the platform's port assignment. Do not replace `start` with `npm run dev`.
4. For private features, run the documented server-side `npm run check:deploy` check in an appropriately configured environment and independently test sign-in, storage and tenant isolation.

This document explains the compatible startup configuration. It does **not** attest to a completed Hostinger deployment, one-click deployment approval, or production security validation. Add a Hostinger partner referral button only after receiving a real partner code.
