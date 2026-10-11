# Nexora

Nexora is a gamified EUEE study platform for Ethiopian secondary-school students, with student and teacher workspaces, an AI tutor, and timed tournaments.

## Run & Operate

- Start the managed `artifacts/api-server: API Server` and `artifacts/nexora: web` workflows together to run the app.
- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/nexora run dev` — run the web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Required secrets: `MONGODB_URI`, `JWT_SECRET` (32+ characters), `AI_API_KEY`
- Optional email secrets: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`
- Optional CORS allowlist: `NEXORA_CORS_ORIGINS`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Nexora data: MongoDB + Mongoose
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- Web app: `artifacts/nexora/`
- Express API, Mongo models, seed data, auth and feature routes: `artifacts/api-server/src/`
- REST contract and generated React hooks / Zod schemas: `lib/api-spec/openapi.yaml`, `lib/api-client-react/`, and `lib/api-zod/`
- The shared workspace includes a PostgreSQL/Drizzle scaffold for other artifacts; Nexora's data is stored in MongoDB and must not be migrated to that scaffold.

## Architecture decisions

- The app uses same-origin `/api` routes and httpOnly cookie sessions; do not store session tokens in browser storage.
- Development startup connects to MongoDB and seeds demo records. Production startup does not seed.
- Tournament collection is a mock provider only; no real ETB is collected or paid out.

## Product

- Student onboarding, server-scored five-question dungeons, anti-cheat run resets, XP/rank progression, AI tutor, leaderboards, and a one-time Two Doors branch.
- Three-round timed tournaments, teacher class codes and assignments, student performance views, and tier selection with mock billing.
- Development seed: three demo roles and 15 sample prompts per subject across all six ranks. Question content must be replaced with educator-vetted EUEE material before public use.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Set `JWT_SECRET` to a random value at least 32 characters long or the API will not start.
- Tournament prize pools and email messages are demo-only until real payment and SMTP providers are deliberately configured.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
