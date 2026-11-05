# Roadmap

Status as of November 3, 2026. This document is the source of truth for **what is done, what is missing and what is still to be decided**. The [README](../README.md) only summarizes; the design lives in [ARCHITECTURE.md](ARCHITECTURE.md).

Legend: `[x]` done and verified · `[ ]` pending · **(decision)** something to resolve before or during.

## Summary

| Phase | Content                                                                                | Status                      |
| ----- | -------------------------------------------------------------------------------------- | --------------------------- |
| 1     | Skeleton: monorepo, shared contracts, parser, deployment, seeder, Angular shell        | Done                        |
| 2     | Authentication and API foundation                                                      | Done, CI still to be pushed |
| 3     | Lists, items and notes, with quick capture wired up                                    | Done (UI unstyled)          |
| 3b    | Notes as a free-form canvas: cards, groups, done cards hidden after 24 h               | Done (migration pending)    |
| 4     | Expenses and accounts                                                                  | Done, real CSV pending      |
| 5     | Calendar                                                                               | Done (UI unstyled)          |
| 6     | Aesthetics and token system                                                            | Done (license pending)      |
| 7     | Production rollout and operations                                                      | To do                       |
| —     | Optional (passkeys, public demo, etc.)                                                 | No date                     |

Phases 3, 4 and 5 are implemented end to end (API with integration tests and working screens). What remains of them is **the design and interaction layer** (phase 6: styles, drag and drop, charts, markdown preview) and validating the real bank CSV. Order matters: **phase 2 comes first because the API cannot be exposed beyond `localhost` until login exists**. Phase 6 (aesthetics) is already applied to all screens.

## Repository status

- `main` in `martinbarreirob/RayRecords` (private). The app is served at https://rayrecords.nonchoperdas.com through a Cloudflare Tunnel.
- `.github/workflows/ci.yml` runs the checks on every push, publishes the images to GHCR and deploys them to the server over SSH. It was pushed over SSH, which does not need the `workflow` token scope.
- 666 tests passing (124 `shared`, 162 `api`, 380 `web`), clean typecheck and a successful build.
- Both Docker images were built and run locally with the production compose file: nginx used 12 MiB of 64 and the API 35 MiB of 256.
- Never tested: CI on GitHub, the real server (Hetzner), the Cloudflare Tunnel and the existing Mongo.

## Phase 1 — Skeleton (done)

- [x] pnpm monorepo (`apps/web`, `apps/api`, `packages/shared`), TypeScript, prettier, `.editorconfig`, `.gitattributes`.
- [x] Zod schemas for lists, items, daily notes, accounts, transactions, categories and rules.
- [x] List presets (movies/series, shopping, board, free-form) as data.
- [x] Quick capture parser with 90 tests, including edge cases.
- [x] Fastify API: `/api/health` and `/api/lists`, module template, validated configuration.
- [x] MongoDB indexes and idempotent `ensureIndexes`.
- [x] Expenses: description normalization, deduplication hash with repetition number, rule-based categorization, `prepareTransactions`.
- [x] Deterministic seeder with guards (only `_dev`/`_demo`, never in production).
- [x] Docker: production and development compose files with `mem_limit`, Mongo with `wiredTigerCacheSizeGB 0.5`, nginx, multi-stage Dockerfiles.
- [x] Angular: lazy routes per module, shell, quick capture with preview and shortcut (`Ctrl/Cmd+K` or `/`), abstract `ApiClient`, skeleton screens.
- [x] Initial documentation and deployment guide.

## Phase 2 — Authentication and API foundation

Goal (met except for CI): be able to open the app from my devices with a persistent session, with all of `/api` protected.

- [x] `users`, `sessions` (TTL index on `expiresAt`) and `credentials` (passkeys, empty for now) collections with their indexes.
- [x] Password hashing with scrypt from `node:crypto` (instead of argon2: no native dependency on Alpine; the hash stores its parameters and can be migrated).
- [x] Single-user creation via CLI (`pnpm --filter @rayrecords/api create-user`), no sign-up screen.
- [x] `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- [x] `httpOnly; Secure; SameSite=Strict` cookie, 30 days with sliding renewal, session stored in Mongo (revocable).
- [x] Global hook requiring a session on all of `/api` except `health` and `login`.
- [x] Login attempt limiting (rate limit) and `Origin` check.
- [x] Uniform API error format (code, message, validation details).
- [x] Angular: login screen, route guard and an interceptor that redirects to login on 401.
- [x] API integration tests against a real Mongo (temporary database; skipped if there is no Mongo). Decided: a Mongo service in CI instead of `mongodb-memory-server`, which downloads a ~100 MB binary and is fragile on Windows.
- [x] Push `ci.yml` (done over SSH; it includes a Mongo service for the integration tests).
- [ ] Once CI exists: check that the images are published to GHCR and that the server's compose file pulls them.

## Phase 3 — Lists, items and daily notes (done, with minimal functional UI)

Goal: use the app daily to capture and look things up. The API is complete and tested; the screens are functional and already carry the phase 6 design.

**Lists**

- [x] `POST /api/lists` (from a preset), `PATCH` (rename, fields, columns, aliases —`null` removes it—, archive) and `GET ?archived=`.
- [x] Clear error (`409 alias_in_use`) with the name of the list already using the alias.
- [x] Angular: new list form with template selector and alias; archive.
- [ ] Angular: edit the fields (`fieldDefs`) and columns of an existing list (the API already allows it).

**Items**

- [x] `GET /api/lists/:id/items` (filters `tag`, `q`, `done`), `POST`, `PATCH`, `DELETE` of `/api/items`.
- [x] **Flexible** validation of `extra` against `list.fieldDefs`: correct type on defined fields, free keys allowed, `null` deletes the field.
- [x] Angular: table with the list's fields, whole-row editing, mark done, delete, search and tag filter.
- [x] Board: move between columns and reorder with `POST /api/items/:id/move`. **Decided**: numeric `order` with the midpoint between neighbors and renumbering of the column when the gap runs out (lexorank rejected: with a single user renumbering is cheap and the model does not change). The tests force it with 40 consecutive moves.
- [ ] Angular: drag and drop with CDK on the board and in the table (today they are ↑ ↓ ← → buttons). This is interaction work for the design phase.

**Daily notes (replaced by phase 3b)**

- [x] `GET/PUT /api/notes/:date`, `POST /api/notes/:date/append` and `GET /api/notes?month=` remain in the API as legacy; the web app no longer uses them.

**Phase 3b — Notes as a free-form canvas (done)**

Chosen design: the "Folio" direction (top navigation, capture at the top, cards below). The other two were discarded.

- [x] `note_cards` and `note_groups` collections; `/api/note-cards` and `/api/note-groups` API (see [API.md](API.md)); 16 integration tests.
- [x] Geometry and time as pure functions in `shared` (`nextFreePosition`, coordinate conversion, group under a point, `isVisible`) with tests.
- [x] Desktop canvas: create (double click or `N`), edit, move (position is saved), multi-select with Shift, group with Ctrl+G, move and resize groups, drop inside and outside a group, dissolve, Alt+arrows.
- [x] Mark as done (checkbox or `X`): `doneAt` is stored and **after exactly 24 h** the card stops being shown. It stays in the DB and can be recovered from "Terminadas" (Done).
- [x] Mobile (< 768 px): list ordered by position, with collapsible groups and a "done" checkbox.
- [x] Quick capture: anything that does not fit creates a card in the first free slot; "Deshacer" (Undo) deletes it.
- [x] **Decided**: when a group is dissolved its cards stay loose where they were; a group whose cards are all done stays until it is deleted.
- [ ] **On deploy**: run `migrate-notes` once to convert the old daily notes (one card per note, starting with the date). Not done: it has not been run against the real data.
- [ ] Pending from phase 6: aesthetics, mouse selection marquee, alignment guides, zoom and pan.

**Quick capture wired up**

- [x] `POST /api/capture`: runs `parseQuickCapture` **on the server** with the aliases from the DB (the client only uses it for the preview).
- [x] Mapping: `priceCents` → `extra.precio`, `category` → `extra.categoria`, `url`, `tags`, `dueDate`.
- [x] **Decided**: if the value does not fit the list field's type (e.g. a category outside a `select`'s options) it is dropped with a warning; if the list does not define the field, it is still saved in `extra`.
- [x] **Decided**: if no list with alias `tarea` exists (target of `hoy:` / `mañana:`; "today" / "tomorrow") the capture falls back to a note card **with a warning**. No list is created automatically.
- [x] Angular: the bar sends to the API, confirms and offers **Deshacer** (Undo; deletes the item or the card); open screens reload by themselves.
- [ ] **(decision)** User time zone: still the `Europe/Madrid` constant; consider making it configurable.

## Phase 4 — Expenses and accounts (implemented; pending validation with the real CSV)

Goal: import the bank statement, categorize it and see where the money goes. **Everything works with sample statements; the CSV parser is tolerant because we do not yet have the real sample.**

- [ ] **(partial blocker)** Header and 3–4 anonymized lines of the bank CSV. With them we must check that `HEADER_ALIASES` in `apps/api/src/modules/expenses/csv.ts` recognizes the columns and add a test with that sample. Meanwhile, if the header is not recognized the API responds `400 invalid_csv` with a clear message.
- [x] CSV parser: auto-detected separator (`;`, `,` or tab), header located by column name (supports a preamble), signed amount or separate debit/credit, comma decimals, `dd/mm/yyyy` dates, UTF-8 or Windows-1252 encoding.
- [x] `POST /api/accounts/:id/imports` with the CSV as raw body (`Content-Type: text/csv`, no multipart or new dependency; 5 MB limit). `?dryRun=true` returns the **preview** (new, duplicates, uncategorized, first 20 rows). Duplicates are skipped by comparing hashes and, on a race, by the unique index.
- [x] Undo a whole import (`DELETE /api/imports/:id`) and list previous ones.
- [x] `GET /api/transactions` with filters by account, month, category (or `none`) and text, paginated (`limit`, `offset`).
- [x] Manual category correction (`PATCH /api/transactions/:id/category`, `categorySource: manual`, never overwritten) with an option to create a rule (priority 10).
- [x] Reapply rules to uncategorized transactions (`POST /api/rules/apply`).
- [x] CRUD for rules (validates category and regular expression) and categories (an in-use one cannot be deleted).
- [x] `GET /api/expenses/summary`: aggregation by month and category, expenses or income.
- [x] Accounts: `GET/POST/PATCH /api/accounts` with computed balance (opening + sum of transactions) and transaction count.
- [x] **Decided**: transfers between own accounts are marked with the `traspaso` category (`TRANSFER_CATEGORY`, included by default) and stay **out of the summaries**. It is assigned with a rule or by hand; they are not detected automatically.
- [x] Angular: accounts (create, archive, balances and total), transactions (filters, per-row category, pagination), import with mandatory preview before importing, previous imports with undo, monthly summary as a table and rule and category management.
- [ ] **(decision)** Charting library (ECharts, Chart.js or another): depends on the phase 6 design system. Today the summary is a table.
- [ ] Detect transfers between own accounts automatically (same amount with opposite sign on nearby dates).
- [ ] Support for statement formats other than CSV (if the bank offers them).

## Phase 5 — Calendar (done, with minimal functional UI)

- [x] `GET /api/calendar?from=&to=`: items with `dueDate` in the range (max. 400 days) from non-archived lists, with the name and slug of their list.
- [x] Angular: monthly grid (week starting on Monday), month agenda, quick add of an item on a date (with optional time and list), mark done from the agenda and an **overdue** marker.
- [ ] **(decision)** Multi-day events: today only `dueDate` + `time` exist. If ranges are needed, add `endDate`/`endTime` to the `Item` schema and an index.
- [ ] Week view and reminders (optional).

## Phase 6 — Aesthetics and token system (done; PrimeNG license still to be decided)

Full contract in [DESIGN.md](DESIGN.md). Chosen direction: "Folio" (light top navigation, one typeface, one indigo accent, light and dark theme).

- [x] **Decided**: custom CSS with tokens (`apps/web/src/styles/`) + **PrimeNG 22 only for the complex parts** (`p-table`, `p-select`, `p-datepicker`, `p-dialog`, `p-confirmdialog`, `p-checkbox`, `p-toggleswitch`). PrimeNG is styled with the tokens (`styles/_primeng.scss`) and its configuration is declared **in the lists, expenses and accounts routes** (`core/theme/provide-primeng.ts`), not at bootstrap: initial bundle of 358 kB versus 574 kB.
- [x] Self-hosted Inter typeface, light/dark/system theme (`ThemeService`, no flash on load), responsive design (under 768 px).
- [x] Shell: top bar and command palette (Ctrl+K) with real search, commands, quick capture with "/" (preview of the target list) and Shift+N · L · C · G · U shortcuts (body loaded lazily).
- [x] Screens: notes (canvas), lists and Kanban (drag with CDK and keyboard), calendar (month/agenda), expenses (category chips, table with in-cell editing and bulk actions, summary, import, rules), accounts and sign-in.
- [x] Accessibility: visible focus, labels, 44 px touch targets on mobile, keyboard support for everything important.
- [ ] **(decision, blocks the production release)** **PrimeNG 22 license**: without a key it shows the red "Invalid PrimeUI License" notice on the screens that use it. Options: free Community key (personal use, yearly renewal, requested by the user at primeui.dev and passed in `providePrimeNG({ license })`), PrimeNG 21 (no official support with Angular 22) or remove PrimeNG.
- [ ] Expenses: the design called for "mark as paid", delete and add transactions by hand and edit amount/description; the API does not support it (only the category changes). Decide whether to extend it.
- [ ] Palette search: the server searches by whole word ("re" does not find "Reforma").
- [ ] CSP policy in nginx, **once the UI is finished** (Angular and PrimeNG inject styles, which forces deciding `style-src` and `script-src`).

## Phase 7 — Production rollout and operations

- [ ] Create the `rayrecords` database and its `readWrite` user in Mongo (see [deploy/README.md](../deploy/README.md)).
- [ ] `deploy/.env` on the server, the existing Mongo's network and `docker login ghcr.io`.
- [ ] Open the public URL through the tunnel and check HTTPS, the `Secure` cookie and the `X-Forwarded-Proto` header.
- [ ] **(decision)** Apply `wiredTigerCacheSizeGB 0.5` to the shared Mongo: it also affects the other project.
- [ ] Backups: scheduled `mongodump` of the `rayrecords` database, with retention and a test restore.
- [ ] Docker log rotation (`json-file` with `max-size` and `max-file`) so the disk does not fill up.
- [ ] Measure real memory use with real data and adjust `mem_limit`.
- [ ] Documented and tested update and rollback procedure (`TAG=<sha>`).

## Optional

- [ ] **Passkeys** (WebAuthn with `@simplewebauthn`): `credentials` collection already planned; requires HTTPS.
- [ ] **Public demo for the portfolio**: static build with an in-memory `ApiClient` adapter and the seeder's data, deployed on GitHub Pages. Possible because the screens depend on `ApiClient`, not `HttpClient`.
- [ ] Export and import all data as JSON.
- [ ] ESLint with Angular and TypeScript rules.
- [ ] E2E tests (Playwright) for the capture and import flows.
- [ ] Dependabot or Renovate for dependencies.
- [ ] PWA / capture shortcut on mobile.

## Open questions

| Question                                                                                         | Who  | Blocks                                      |
| ------------------------------------------------------------------------------------------------ | ---- | ------------------------------------------- |
| Anonymized sample of the bank CSV                                                                | User | Validating the phase 4 parser               |
| Does the server's Mongo run in a container (another compose file or network) or on the host?     | User | Phase 7 (decides whether the network override is used) |
| Can `wiredTigerCacheSizeGB 0.5` be applied to the shared Mongo?                                  | User | Phase 7                                     |
| Do you want the public demo with mock data?                                                      | User | Optional                                    |
| Design system and charting library                                                               | User | Phase 6 and the phase 4 charts              |

## Technical debt and known risks

| Item                          | Detail                                                                                                                                                                         | When                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| Integration tests             | Cover auth, lists, items, notes, capture, calendar and expenses against a real Mongo; skipped if there is no Mongo. Each new module adds its own with `test/harness.ts`.       | Every phase                  |
| No ESLint                     | Only prettier and typecheck.                                                                                                                                                   | Optional                     |
| No CSP                        | Basic security headers in nginx, no `Content-Security-Policy`.                                                                                                                 | Phase 6                      |
| Fixed time zone               | `Europe/Madrid` as a constant in `shared`.                                                                                                                                     | If needed                    |
| Fixed currency                | EUR only in the parser and in the presentation.                                                                                                                                | If needed                    |
| TypeScript in two versions    | `shared` and `api` use TS 7; `web` uses TS 6 because the Angular compiler requires it. The `shared` code must compile with both.                                               | Review when upgrading Angular |
| The client does not validate responses | It trusts the `shared` types; the server does validate and serialize. A deliberate decision to keep Zod out of the browser (692 → 257 kB).                             | —                            |
| Shared Mongo                  | A memory failure in the other project can affect this one.                                                                                                                     | Phase 7                      |
