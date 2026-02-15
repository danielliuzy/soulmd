# CLAUDE.md — OpenSoul Project Context

## Overview

OpenSoul is a platform for sharing and swapping AI agent personality files (SOUL.md). It consists of a CLI tool (`soul`), a registry API, a web marketplace, and a core parser library — all in a pnpm monorepo managed by Turborepo.

## Tech Stack

| Package | Tech | Purpose |
|---------|------|---------|
| `packages/core` | TypeScript, gray-matter | SOUL.md parser and shared types |
| `packages/cli` | Commander, picocolors, @inquirer/prompts | `soul` CLI tool (published to npm) |
| `packages/api` | Hono, LibSQL/Turso, Cloudflare Workers | Registry API with GitHub OAuth |
| `packages/web` | Next.js 15, React 19, Tailwind 4, Framer Motion | Web marketplace |

- **Runtime:** Node 22+
- **Package manager:** pnpm 10.x with workspaces
- **Build:** Turborepo (`turbo run build`)
- **Language:** TypeScript 5.7 (strict, ES2022, NodeNext)

## Monorepo Structure

```
soulmd/
├── packages/
│   ├── core/           # Parser library (@opensoul/core)
│   ├── cli/            # CLI tool (opensoul on npm, `soul` command)
│   ├── api/            # Hono API on Cloudflare Workers
│   └── web/            # Next.js web app
├── fixtures/           # Example SOUL.md files for testing
├── turbo.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Deployment

### API (Cloudflare Workers)
- Deployed via `wrangler deploy` from `packages/api`
- Wrangler bundles directly from `src/worker.ts` (NOT from `dist/`) — TypeScript compilation is only for type-checking
- CI: `.github/workflows/deploy-api.yml` deploys on push to main when api/ or core/ changes
- Uses custom S3 client with AWS Signature V4 signing (no AWS SDK — it breaks in Workers due to missing `DOMParser`)
- Uses direct `fetch` to OpenAI API for soul summarization (no AI SDK — same `DOMParser` issue)

### Web (Vercel)
- Next.js app deployed on Vercel
- Landing page uses ISR with `revalidate: 60` and on-demand revalidation via Server Action after upload
- `NEXT_PUBLIC_API_URL` env var points to the Workers API

### Important: Cloudflare Workers Constraints
- No `DOMParser` in V8 isolates — AWS SDK and some libraries fail at runtime
- Always use `fetch` directly or lightweight alternatives for HTTP calls
- `crypto.subtle` is available for signing

## API Configuration (Secrets)

Set via `wrangler secret put <KEY>`:
- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` — LibSQL/Turso database
- `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (bucket: `soulmd-souls`) — R2 storage
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` — OAuth
- `JWT_SECRET` — Token signing
- `OPENAI_API_KEY` — Soul summarization (gpt-4o-mini)
- `WEB_APP_URL`, `GITHUB_REDIRECT_URI` — URLs

## Database (Turso/LibSQL)

Tables: `users`, `souls`, `soul_ratings`
- Migrations run in `storage/sqlite.ts` on init
- Soul sorting: `top` uses weighted score `(rating_avg * 0.5 + LOG(1 + rating_count) * 0.3 + LOG(1 + downloads_count) * 0.2)`

## CLI Architecture

Config file: `~/.soulrc.yaml`
- `registry_url`: https://opensoul-api.zyliu-daniel.workers.dev
- `soul_path`: ~/.openclaw/workspace/SOUL.md (supports directory paths — auto-appends SOUL.md)
- `skills_path`: ~/.openclaw/skills

Cache: `~/.soul/cache/` with index.json tracking name, label, hash, timestamps
- Souls matched by both `name` and `label`
- Sorted by `lastUsedAt` then `cachedAt`

Commands (in order of importance): possess, exorcise, search, summon, list, banish, status, path, install, uninstall, config

## Common Commands

```bash
# Build everything
pnpm build

# Build a single package
pnpm --filter opensoul run build      # CLI
pnpm --filter @opensoul/api run build  # API
pnpm --filter @opensoul/web run build  # Web

# Dev servers
pnpm dev          # All packages
pnpm dev:web      # Web only (port 3001)

# Tests
pnpm test         # Unit tests (vitest)
pnpm test:e2e     # End-to-end tests

# Deploy API
cd packages/api && pnpm run deploy

# Link CLI locally for testing
cd packages/cli && npm link
```

## Key Patterns

- Soul names come from API metadata (`meta.name`), never parsed from file content headings
- `@opensoul/core` is a workspace dependency shared by CLI and API
- The CLI uses `registryClient.getMeta()` + `registryClient.getContent()` in parallel for summoning
- Swap marker `<!-- opensoul:swapped -->` is prepended to swapped SOUL.md files; backup stored at `~/.soul/backup/SOUL.md.original`
- Web uses server components for the landing page with client component wrappers (`AnimatedSection`, `InstallerWidget`) for interactivity

## Known Gotchas

- Wrangler bundles from `src/worker.ts` directly, so changes to API source don't require `tsc` build for deploy (but do for type-checking)
- After removing/adding packages, run `pnpm install` to sync `pnpm-lock.yaml` or Vercel deploys will fail
- Stale `.next` cache can cause transient build errors (`PageNotFoundError`) — fix with `rm -rf packages/web/.next`
- The web app redirects unauthenticated users from `/upload` to `/login` automatically
