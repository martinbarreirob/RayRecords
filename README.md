# RayRecords

A personal web app to keep a day-to-day life in one place: notes on a free-form canvas, lists (with a Kanban board), a calendar, bank expenses and accounts. It is built for a single user and runs on a small self-hosted server.

The UI is in Spanish. Quick capture uses Spanish prefixes (`hoy:` for today, `mañana:` for tomorrow) and the default expense categories are Spanish too.

## Features

- **Quick capture.** One input parses a line such as `compra: Cafetera @hogar 89€ https://...` into a list item with category, price and link, or `mañana: llamar al dentista` into a dated task. Anything it does not recognize becomes a note card, so capturing never fails. A preview shows where the text will go, and one click undoes it.
- **Notes canvas.** Notes are cards you can place, group and mark as done. Done cards disappear after 24 hours but stay in the database.
- **Lists.** Each list defines its own fields (text, number, money, select, rating, date, URL, checkbox). A list can be a table or a board with columns and drag and drop.
- **Calendar.** Month grid and agenda for every item that has a date, with an overdue marker.
- **Expenses.** Import bank CSV statements with a preview, automatic de-duplication, rule-based categorization and a keyboard-driven review screen for what is left. Monthly summaries by category.
- **Accounts.** Balances are computed from the opening balance plus transactions, so they cannot drift.
- **Command palette** (`Ctrl+K`), light and dark theme, and a responsive layout.

## Stack

| Part     | Technology                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------- |
| Web      | Angular (standalone components, signals, no zone.js), PrimeNG for complex widgets, plain CSS tokens for the rest |
| API      | Fastify 5, MongoDB native driver, Zod validation, cookie sessions with scrypt password hashes                    |
| Shared   | TypeScript package with the Zod schemas, types, list presets and the quick-capture parser, used by both apps     |
| Tests    | Vitest in all three packages; the API integration tests run against a real MongoDB                               |
| Delivery | pnpm monorepo, Docker, nginx, GitHub Actions, Cloudflare Tunnel                                                  |

## Repository layout

```
apps/web         Angular app, one folder per feature in src/app/features
apps/api         Fastify API, one plugin per module in src/modules
packages/shared  Schemas, types, presets and the capture parser
deploy/          Production and development Docker Compose files, nginx config
docs/            Architecture, API, design system, development guide, roadmap
```

## Running it locally

You need Node 22.12 or newer, pnpm 10 and Docker (for MongoDB).

```bash
pnpm bootstrap   # first time: install dependencies, start MongoDB, load sample data
pnpm dev         # every day: MongoDB, API and web in one terminal
```

The web app is served at http://localhost:4300 and the API at http://localhost:3000. The seeder creates a development user; its credentials are in `apps/api/src/seed/user.ts`.

Step by step, and the other commands (`pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm format`), are in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Deployment

The app runs as three small containers on a 4 GB VPS: nginx with the built Angular files, the API, and a Cloudflare Tunnel connector. The server opens no inbound port; Cloudflare terminates HTTPS. MongoDB is an existing instance with its own database and a user limited to it.

On every push to `main`, GitHub Actions runs the checks, builds the two images, publishes them to GitHub Container Registry and deploys them over SSH. The server only pulls images; it never builds anything. Details, memory limits and first-install steps are in [deploy/README.md](deploy/README.md).

## Documentation

| Document                                     | Contents                                                           |
| -------------------------------------------- | ------------------------------------------------------------------ |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Overview, collections and indexes, decisions and rejected options  |
| [docs/API.md](docs/API.md)                   | Endpoints                                                          |
| [docs/DESIGN.md](docs/DESIGN.md)             | Design tokens and UI conventions                                   |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)   | Versions, commands, code structure, how to extend it, known issues |
| [docs/ROADMAP.md](docs/ROADMAP.md)           | What is done, what is pending, technical debt                      |
| [deploy/README.md](deploy/README.md)         | Server deployment                                                  |
