# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Read this before doing anything in this repository. It encodes the rules the operator works under and the workflow conventions established in earlier sessions.

## What this projekct is - What is Kener?

Kener is an open-source status page application built with **SvelteKit 2.x (Svelte 5)** and **Node.js/Express**. It is a **TypeScript-first** codebase providing real-time monitoring, uptime tracking, incident management, and customizable dashboards with an integrated user management with granular permission settings. This project in particular is a fork of "Kener" (https://kener.ing/) but with major improvements and additional features.

## Safety rules - non-negotiable

1. **No secrets in code or commits.** `.env` and `.docker-compose.yml` are gitignored and stay that way. `.env.example` is the canonical template for `.env`, `docker-compose.example.yml` is the canonical template for `docker-compose.yml`.
2. **Always ensure update is possible**  When updating the database design make always sure that old deployments can automatically an properly migrate to the latest version.
3. **Never use example data in production** Whenever an old installation is updated make sure, that you don't inject example data into the production database. For instance you are not allowed to change passwords, secrets etc. in production if it's not mandatory.

## Style

- **Communication:** German, concise, technical. No marketing tone, no filler.
- **Code, commits, comments, doc bodies:** English.
- **Comments in code:** only when the *why* is non-obvious. No what-comments. No multi-paragraph docstrings. All comments must be english, if they are not in english currently, translate them into english.
- **Brief is good, silent is not.** Short progress updates between tool calls; one-line end-of-turn summary.

## Key locations

| Path                                                | Purpose                                                                                |
|-----------------------------------------------------|----------------------------------------------------------------------------------------|
| `docs/NEXT_SESSION.md`                              | **Read first** — where we left off, how to unblock the live run, next steps            |
| `README.md`                                         | Project pitch, long-form rules, layout                                                 |
| `docs/strategy/01-product-roadmap.md`               | Product decisions, open questions, backlog, phasing                                    |
| `docs/architecture/01-overview.md`                  | Components and end-to-end flow                                                         |
| `docs/runbooks/04-m1-verification.md`               | M1 11-point verification, what's gated, how to unblock                                 |
| `.env.example`                                      | Example .env with all available and usable env vars (no secrets)                       |
| `.env`                                              | All env vars with secrets, this one is gitignored!                                     |
| `docker-compose.example.yml`                        | Example docker-compose.yml with all available and usable vars and options (no secrets) |
| `docker-compose.yml`                                | All available and usable vars and options, this one is gitignored!                     |

## Build instructions for Docker image

1. **Always build multiarch** The docker image must always be multiarch
2. **Propper tagging** The latest image must always have the `kener-wobcom:latest` tag, additionally there will be a second tag `kener-wobcom:<version-number>`, the version number is the same as the version number of the project itself.
3. **Always have latest image locally** After a new image build you must always pull the latest image to the local Docker daemon.
4. **Always push latest image to remote registry** After a new image build you must always push the latest image with both tags (mentioned in 2.) to `harbor.service.wobcom.de/wobcom/kener-wobcom:latest` and `harbor.service.wobcom.de/wobcom/kener-wobcom:<version-number>`

## Development Commands

```bash
npm run dev          # Start dev server (SvelteKit + cron scheduler in parallel)
npm run build        # Production build (SvelteKit then esbuild server bundle)
npm run start        # Run production build (node build/main.js)
npm run check        # Svelte + TypeScript type checking
npm run prettify     # Format all files with Prettier
npm run migrate      # Run database migrations via Knex
npm run seed         # Run database seeds (migrations run automatically first)
```

## Architecture

### Dual Process Model

In development, `npm run dev` runs two parallel processes:

1. **SvelteKit dev server** (`vite dev`) - serves the frontend
2. **Cron scheduler** (`vite-node src/lib/server/startup.ts`) - runs monitor checks, maintenance scheduler, daily cleanup

In production, `scripts/main.ts` is the single entry point: Express server + SvelteKit handler + migrations + seeds + scheduler startup.

### SvelteKit Route Groups

- **`(kener)/`** - Public status page
- **`(manage)/`** - Admin dashboard (authenticated)
- **`(embed)/`** - Embeddable widgets
- **`(docs)/`** - Documentation pages
- **`(api)/`** - SvelteKit API routes; also `src/lib/server/api-server/` for Express-side API handlers (file-based routing: `./action/method.ts`)
- **`(account)/`** - Account/auth pages
- **`(ext)/`** - External integrations
- **`(assets)/`** - Asset serving

### Database

- **Knex.js** for query building and migrations. Supports SQLite (default), PostgreSQL, MySQL
- Connection configured via `DATABASE_URL` env var: `sqlite://./path`, `postgresql://...`, `mysql://...`
- Migrations in `/migrations/`, seeds in `/seeds/`
- Always use the db singleton: `import db from "$lib/server/db/db"`

### Monitor Services

Each monitor type has a dedicated implementation in `src/lib/server/services/`:

- Types: API, Ping, TCP, DNS, SSL, SQL, Heartbeat, GameDig, Group, gRPC, None
- Scheduled via `src/lib/server/schedulers/` using `croner`
- Job queues managed with **BullMQ** + **Redis** (`src/lib/server/queues/`)

### Build System

`npm run build` is a two-step process:

1. `scripts/build-sveltekit.js` - Vite build of SvelteKit app (optionally with `--with-docs`)
2. `scripts/build-server.js` - esbuild bundles `scripts/main.ts` into `build/main.js`

## Key Conventions

### Svelte 5 + TypeScript

- Use **TypeScript** for new/modified code
- Use **Svelte 5 runes** (`$state`, `$derived`, `$effect`, `$props()`) in new components
- Use generated `$types` for SvelteKit route typing (`import type { PageServerLoad } from './$types'`)
- Use `import type { ... }` for type imports

### UI Components

- **shadcn-svelte** components in `src/lib/components/ui/`
- Import: `import { Button } from "$lib/components/ui/button"`
- Styling: **Tailwind CSS v4** with HSL CSS variables for theming

### Timestamps

All timestamps are **UTC seconds** (not milliseconds). Use helpers from `src/lib/server/tool.ts`.

### Status Constants

Constants are exported as a **default export** from `src/lib/global-constants.ts`:

```typescript
// In Svelte/client code or SvelteKit routes:
import GC from "$lib/global-constants"
// Usage: GC.UP, GC.DOWN, GC.DEGRADED, GC.MAINTENANCE, GC.NO_DATA

// In server code (use relative path):
import GC from "../../global-constants.js"
// Usage: GC.UP, GC.DOWN, etc.
```

### API Authentication

APIs use Bearer token auth: `import { VerifyAPIKey } from "$lib/server/controllers/apiController"`

### Types Location

- `src/lib/types/` - Shared types (client + server)
- `src/lib/server/types/` - Server-only types
- `src/lib/client/types/` - Client-only types

### i18n

Locale files in `src/lib/locales/`. Add translations by creating `{code}.json` and updating `locales.json`.

## Environment Variables

Required: `KENER_SECRET_KEY`, `ORIGIN`, `REDIS_URL`
Optional: `DATABASE_URL` (defaults to SQLite), `KENER_BASE_PATH`, `PORT` (default 3000), `RESEND_API_KEY`, `RESEND_SENDER_EMAIL`

## Skills

Read `.claude/skills/` for specialized instructions on:

- **svelte-code-writer** - Svelte component creation/editing
- **documentation-writer** - Editing docs in `src/routes/(docs)/docs/content/`
- **tailwindcss** - Tailwind CSS v4 patterns
