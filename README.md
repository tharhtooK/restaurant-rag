This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Local development with Docker

`docker compose up` starts two services:

- `web` — the Next.js dev server on [http://localhost:3000](http://localhost:3000), with hot reload (bind-mounted source, `WATCHPACK_POLLING=true`).
- `db` — Postgres 16, exposed on `localhost:5432`, persisted in the `pgdata` named volume. `web` won't start until `db` passes its `pg_isready` healthcheck.

**Database URL and hostnames**: `DATABASE_URL` in `.env` points at `db:5432` — that hostname only resolves *inside* the Compose network. From your host machine (e.g. a local psql client, or a GUI tool like TablePlus), connect using `localhost:5432` instead, since `db` is a container-only DNS name assigned by Docker Compose. The `web` container talks to Postgres over the internal network as `db`; your host talks to the same Postgres instance via the `5432:5432` port mapping as `localhost`.

Prisma commands run inside the `web` container, since that's the only place `db:5432` resolves:

```bash
docker compose exec web npx prisma migrate dev --name <migration_name>
docker compose exec web npx prisma generate
docker compose exec web npx prisma studio
```

Prisma 7 no longer auto-generates the client after `migrate dev` — run `prisma generate` explicitly after schema changes if you're not immediately running a migration.

## Deployment

Production: **https://restaurant-dgzsm6qei-thar5.vercel.app/**

This repo is connected to Vercel with the default Next.js build settings (`next build`, no custom install/output overrides). Every push to `main` deploys to production, and every pull request gets its own preview URL posted automatically.

Vercel builds this project natively from source — it does not use the `Dockerfile` or `compose.yaml` in this repo. Those two files are for local development only (e.g. `docker compose up`); do not try to configure Vercel to build from the Dockerfile.
