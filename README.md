# Nexora

Nexora is a mobile-first, gamified EUEE preparation platform for Ethiopian secondary-school students. It combines focused question runs, an AI study guide, school classes, and timed tournaments in an obsidian-and-gold interface.

## Start the app

The Replit workspace has managed workflows for both services:

- **Nexora web** — `artifacts/nexora: web`
- **API Server** — `artifacts/api-server: API Server`

Start both workflows in Replit to run the full app. In a local shell, run them in separate terminals:

```sh
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/nexora run dev
```

The web app calls the API through `/api`. Use the shared workspace preview rather than opening the API or Vite service on its own.

## Required environment variables

Configure these as Replit Secrets (or in a private local environment):

- `MONGODB_URI` — MongoDB connection string for Nexora's Mongoose models.
- `JWT_SECRET` — a random signing secret of at least 32 characters.
- `AI_API_KEY` — server-side OpenAI API key used by the tutor.

Optional email configuration:

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`

For cross-origin web/API setups, optionally set `NEXORA_CORS_ORIGINS` to a comma-separated list of allowed origins. Same-origin preview requests work without it.

## Demo accounts

The development seed creates these demo accounts:

| Role | Email | Password |
| --- | --- | --- |
| Student | `student@nexora.demo` | `NexoraDemo!2026` |
| Teacher | `teacher@nexora.demo` | `NexoraDemo!2026` |
| Admin | `admin@nexora.demo` | `NexoraDemo!2026` |

Demo accounts are inserted only when missing. Do not use these credentials in production.

## Included flows

- Email/password registration and sign-in, bcrypt password hashes, seven-day JWT sessions in httpOnly cookies, and role-restricted student/teacher/admin routes.
- Subject onboarding and a student dashboard with XP, level, hunter rank, streak, mastery, daily free-run allowance, and recent runs.
- Server-selected questions and server-authoritative dungeon scoring. Each run has five questions, HP loss, per-question enemies, a final boss, XP and rank progression. Leaving the tab or window abandons the active run.
- A one-time Two Doors branch saved to MongoDB, plus a timed detective-mode prototype.
- AI tutor calls made server-side, with per-user rate limits and a smaller daily allowance on the Free tier.
- Free and paid tournaments with three timed rounds (E, C, then A rank), server-measured answer speed, server-scored points, standings, ETB entry pools, and the requested payout splits.
- Teacher classes and join codes, student subject-mastery rosters, due-dated assignments, and a nodemailer-ready email service.
- Free, Arena Pass (150 ETB/month), and Institution plan selection with mock billing.

## Seed questions and demo limitations

Development seeding provides 15 distinct sample question prompts for each of the six subjects (Math, Physics, Chemistry, Biology, English, and Aptitude), available at all six dungeon ranks. These are illustrative placeholders, not vetted EUEE exam content; replace and review them with qualified Ethiopian educators before real exam preparation.

Payments are mock-only: the demo provider records approved test transactions but never collects or transfers money. ETB tournament pools and payout breakdowns are projections from those mock entries. Email delivery is a logging stub until SMTP settings are configured. The detective event is a prototype screen rather than a complete investigation campaign.

The API server connects to MongoDB before accepting requests and seeds demo data outside production. Its health check is available at `/api/health`.

## Useful commands

```sh
pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/nexora run typecheck
pnpm --filter @workspace/nexora run build
```
