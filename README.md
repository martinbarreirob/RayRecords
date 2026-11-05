# RayRecords

Personal management web app: daily notes, lists (including a Kanban board), calendar, expenses and accounts. Single user, deployed with Docker on my own server and reachable through a Cloudflare Tunnel (https://rayrecords.nonchoperdas.com).

> **Status: phase 1 complete (skeleton).** The architecture, shared contracts, quick-capture parser, deployment and seeder are ready and tested. The functional modules and authentication are still to be implemented: **until login exists, the API must not be exposed beyond `localhost`.** What is done and what is pending is detailed in the [roadmap](docs/ROADMAP.md).

## Structure

```
RayRecords/
├─ apps/
│  ├─ web/        Angular (standalone, signals, no zone.js). One folder per module in src/app/features
│  └─ api/        Fastify + native MongoDB driver. One plugin per module in src/modules
├─ packages/
│  └─ shared/     Zod schemas, types, list presets and quick-capture parser (plain TypeScript)
├─ deploy/        Production and development docker-compose, nginx, deployment guide
└─ docs/          Roadmap, architecture, development guide and API
```

## Getting started

Requirements: Node ≥ 22.12, pnpm 10 and Docker.

```bash
pnpm bootstrap   # first time: install + Mongo + seed
pnpm dev         # day to day: Mongo + API + web in a single terminal
```

Or step by step:

```bash
pnpm install
pnpm dev:db      # MongoDB in Docker (1 GB limit and wiredTigerCacheSizeGB 0.5, as in production)
pnpm seed        # sample data in the rayrecords_dev database
pnpm dev:api     # API at http://localhost:3000
pnpm dev:web     # Angular at http://localhost:4300 (proxies /api to the API)
```

Other commands: `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm format`.

## Current state

- **Done:** pnpm monorepo, schemas for all collections, quick-capture parser (90 tests), MongoDB indexes, deduplication hash and expense categorization, seeder, Docker Compose with memory limits, nginx, and an Angular shell with navigation, quick capture with preview and skeleton screens.
- **Next:** authentication, CRUD for lists, items and notes with capture wired in, bank CSV import, calendar, expense charts, and going to production (the visual design is done; the PrimeNG license still has to be decided).
- **Not yet tested:** CI on GitHub (the workflow is not pushed), the real server and the Cloudflare Tunnel.

## Documentation

| Document                                     | Contents                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [docs/ROADMAP.md](docs/ROADMAP.md)           | What is done, pending phases with tasks, open questions and technical debt                  |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Overview, collections and indexes, decisions and rejected alternatives, quick capture       |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)     | Versions, commands, code structure, how to extend it, known issues                          |
| [docs/API.md](docs/API.md)                   | Implemented endpoints and design of the planned ones                                        |
| [deploy/README.md](deploy/README.md)         | Server deployment: memory, Mongo, Cloudflare Tunnel, updates                                |
