# Architecture

## Overview

```
Device ──HTTPS──► Cloudflare Tunnel (cloudflared) ──► nginx ──► api (Fastify) ──► MongoDB (dedicated DB)
                                                        │
                                                        └─ Angular static files (built in CI)
```

Access is via a Cloudflare Tunnel (`cloudflared` container); the server opens no inbound port.

- **Same origin.** nginx serves the frontend and proxies `/api`: no CORS, and a `SameSite=Strict` cookie.
- **Modular monolith.** Each API module (`health`, `lists`, and whatever comes next) is a Fastify plugin with its own routes, mapper and data access. A new module is a new folder.
- **Shared contracts.** `packages/shared` defines the Zod schemas, from which the TypeScript types are derived. The API validates inputs and serializes outputs with them; Angular imports the types and the parser. It is consumed as source code, with no prior build step.
- **Build off the server.** CI builds two images (`rayrecords-api`, `rayrecords-web`) and publishes them to GHCR. The server only runs `docker compose pull && up -d`.

## Data conventions

| Topic            | Decision                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| Money            | Integer cents (`amountCents`). Never floats. Expenses negative, income positive.                                     |
| Calendar dates   | `YYYY-MM-DD` string (`dueDate`). Avoids time zone drift.                                                             |
| Instants         | `Date` in Mongo, ISO 8601 in the API.                                                                                |
| Transaction date | `Date` at midnight UTC plus a denormalized `month` (`YYYY-MM`) for grouping.                                         |
| Identifiers      | `ObjectId` in Mongo, 24-character hexadecimal string in the API. A category uses its key as `_id`.                   |
| `extra` field    | Only flat scalars with keys `[a-z][a-zA-Z0-9_]*`: no nested objects or `$` keys, so Mongo operators cannot sneak in. |
| Links            | `http(s)` only, so a `javascript:` URL never reaches an `href`.                                                      |

## Collections and indexes

| Collection             | Content                                                                                                                                                                            | Indexes                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `lists`                | Self-describing container: `name`, `slug`, `kind` (source template), `captureAlias`, `fieldDefs[]`, `board.columns[]`, `order`, `archived`                                         | unique `slug` · **partial** unique `captureAlias` (only lists with an alias) · `{archived, order}`                                       |
| `items`                | `listId`, `title`, `text`, `tags[]`, `dueDate`, `time`, `url`, `extra{}`, `column`, `order`, `doneAt`, `source`                                                                    | `{listId, order}` · `{listId, createdAt:-1}` · `tags` (multikey) · **partial** `dueDate` (calendar) · Spanish text index on `title+text` |
| `events`               | An event that lives only in the calendar, with no list: `title`, `date`, `time`, `doneAt`                                                                                          | `{date}`                                                                                                                                 |
| `note_cards`           | A note as a canvas card: `text`, `x`, `y`, `w`, `z`, `groupId` (or `null`), `doneAt` (or `null`). With `groupId`, `x`/`y` are relative to the group                                | `{groupId}` · `{doneAt}`                                                                                                                 |
| `note_groups`          | Titled frame that groups cards: `title`, `x`, `y`, `w`, `h`                                                                                                                        | —                                                                                                                                        |
| `daily_notes`          | **Legacy.** One markdown note per date; kept only to migrate it to cards                                                                                                           | unique `date`                                                                                                                            |
| `accounts`             | `name`, `bank`, `type`, `currency`, `openingBalanceCents`, `openingDate`, `archived`. **The balance is not stored**: it is the opening balance plus the sum of transactions        | `{archived, name}`                                                                                                                       |
| `transactions`         | `accountId`, `date`, `month`, `amountCents`, `description`, `descriptionNorm`, `balanceAfterCents`, `hash`, `category`, `categorySource` (`rule`/`manual`/`none`), `importBatchId` | **unique `{accountId, hash}`** (deduplication) · `{accountId, date:-1}` · `{month, category}` (charts) · partial `importBatchId`         |
| `categories`           | `_id` = key, `name`, `color`, `icon`                                                                                                                                               | —                                                                                                                                        |
| `categorization_rules` | `pattern`, `matchType` (`contains`/`startsWith`/`regex`), `categoryKey`, `priority`, `active`                                                                                      | `{active, priority:-1}`                                                                                                                  |
| `import_batches`       | Trace of each import (`fileName`, `imported`, `skipped`) so it can be undone                                                                                                       | `createdAt:-1`                                                                                                                           |

Access: `users` (unique index on `username`), `sessions` (`_id` = sha256 of the token; TTL index on `expiresAt`) and `credentials` (passkeys, unused for now). The seeder does not touch them.

Indexes are created by `ensureIndexes` on every API start (idempotent). With a single user a migration system is not worth it.

## Decisions and discarded alternatives

| Decision                                                                                      | Discarded                                  | Reason                                                                                                                                     |
| --------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| pnpm workspaces                                                                               | Nx, Turborepo                              | Overengineering for three packages.                                                                                                        |
| Fastify + Zod                                                                                 | Express                                    | Native schema validation, less memory, better typing.                                                                                      |
| Native MongoDB driver                                                                         | Mongoose                                   | The schemaless `extra` field and aggregations fit better without an ODM; saves memory.                                                     |
| Self-describing lists: each stores its own `fieldDefs`; presets are data copied on creation   | A fixed `type` with code per type          | Creating a new list type means creating data, not code. Each list defines its own capture alias.                                           |
| Calendar as a view over `items` with `dueDate`                                                | Separate `events` collection               | Less code and a single model.                                                                                                              |
| Hash `sha256(account, date, amount, normalized description, balance, repetition no.)`         | Hash without the repetition number         | Two identical coffees on the same day are not lost, and an overlapping statement produces the same hashes.                                 |
| Manual correction with `categorySource: manual` that rules never overwrite                    | Always recategorize                        | Respects the user's corrections.                                                                                                           |
| On-the-fly aggregations (`$group` by month and category)                                      | Materialized views                         | It will be a few thousand transactions a year.                                                                                             |
| Session in a cookie (`httpOnly`, `Secure`, `SameSite=Strict`) stored in Mongo, passkeys later | JWT                                        | It can be revoked and there are no tokens on the client.                                                                                   |
| Cloudflare Tunnel (`cloudflared` container) + nginx on `127.0.0.1`                            | Opening a public port with an IP allowlist | Passkeys and `Secure` cookies require HTTPS, and this way no inbound port is exposed to the internet.                                      |
| The client trusts the `shared` types and does not validate responses with Zod                 | Validating on the client                   | Zod added ~435 kB to the initial bundle (692 → 257 kB). The server already validates and serializes with the same schemas.                 |
| Done notes: hidden on read (`doneAt` > now − 24 h) and the card is kept                       | A cron job that deletes or hides them      | No processes that can fail or lag; finished notes can be recovered and the limit is tested with an injectable clock.                       |
| Group card coordinates relative to the group                                                  | Always absolute coordinates                | Moving or resizing a group is a single write and does not touch its cards.                                                                 |
| Dragging with custom Pointer Events and geometry as pure functions in `shared`                | CDK drag-drop                              | We need to detect which group a card is dropped on and convert coordinates; this way it is tested without a DOM and adds no bundle weight. |
| Canvas constants in a dependency-free module (`note-constants.ts`)                            | Keeping them next to the Zod schemas       | If the client imports a module that calls `z.object`, Zod ends up in the initial bundle even if unused.                                    |
| Abstract `ApiClient` between the screens and the data                                         | `HttpClient` directly in each screen       | Allows a demo build with an in-memory adapter, no backend.                                                                                 |

## Quick capture

The parser (`packages/shared/src/capture`) is a pure function: it receives the text, the reference time, the time zone and the list aliases, and returns a typed result. It never throws because of the content.

| Input                                              | Result                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------ |
| `peli: Dune #scifi`                                | Item in the list with alias `peli`, tag `scifi`                          |
| `compra: Cafetera @hogar 89€ https://tienda.com/p` | Item with category `hogar`, price 8900 cents and link                    |
| `hoy: llamar al dentista` / `mañana: …`            | Item in `tarea` with `dueDate` of today or tomorrow (Europe/Madrid zone) |
| No prefix                                          | New note card, in the first free spot on the canvas                      |
| Unknown prefix (`idea: …`)                         | Note card with the full text, without failing                            |
| `peli:` with no title, or blank input              | Nothing to save (`empty`)                                                |

Rules and edge cases covered by the tests:

- The prefix is case- and accent-insensitive (`Mañana:`, `manana:`), tolerates spaces around the colon and decomposed Unicode text.
- A prefix is a short word: `https://…`, `10:30 llamar` or a long phrase before the colon are **not** treated as a prefix.
- Tags are lowercase and deduplicated; `#1`, `C#` and a `#fragment` inside a URL are not tags.
- Amounts `89€`, `89,50€`, `€89`, `89 eur`, `1.299,99€`. They are recognized only with a euro symbol: `Dune 2` is not a price.
- Only the first category, the first amount and the first link count; the rest stays in the title. An email is not a category.
- In dated tasks, `@category` and amounts are not interpreted: they are plain text.
- List aliases are passed as a parameter (the lists' `captureAlias` values), not hardcoded.
- The date is computed in the given time zone, across DST changes, month end, year end and leap years.

## Next phase

The pending phases, with their tasks, open decisions and blockers, are in [ROADMAP.md](ROADMAP.md). The planned endpoints are in [API.md](API.md).
