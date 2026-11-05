# Development guide

## Requirements and versions

| Tool             | Version                                  | Note                                                              |
| ---------------- | ---------------------------------------- | ----------------------------------------------------------------- |
| Node.js          | ≥ 22.12 (tested with 22.23)              | `engines` in the root `package.json`                              |
| pnpm             | 10.34.9                                  | Pinned in `packageManager`                                        |
| Docker           | 29.x                                     | For the development Mongo and for building images                 |
| Angular          | 22.2                                     | Standalone, signals, no zone.js, tests with Vitest                |
| TypeScript       | 7.0 in `shared` and `api`; ~6.0 in `web` | Angular requires TS 6; `shared` code must compile with both       |
| Fastify          | 5.12                                     | With `fastify-type-provider-zod` 7                                |
| MongoDB (driver) | 7.8                                      | `mongo:8` image in development                                    |
| Zod              | 4.6                                      |                                                                   |
| Vitest           | 5                                        | In all three packages                                             |

## Getting started

Shortcut: `pnpm bootstrap` (install + Mongo + seed) the first time and `pnpm dev` (Mongo + API + web) every day. Step by step:

```bash
pnpm install
pnpm dev:db      # MongoDB in Docker
pnpm seed        # sample data in rayrecords_dev and a development user (see seed/user.ts)
pnpm --filter @rayrecords/api create-user <username>   # create the single user (prompts for the password)
pnpm --filter @rayrecords/api migrate-notes           # old daily notes → cards (does not repeat if cards already exist; --force skips the check)
pnpm dev:api     # http://localhost:3000
pnpm dev:web     # http://localhost:4300
```

To change the API configuration, copy `apps/api/.env.example` to `apps/api/.env` (not versioned; `tsx` loads it automatically if it exists).

### API environment variables

| Variable          | Default                     | Notes                                                                          |
| ----------------- | --------------------------- | ------------------------------------------------------------------------------ |
| `NODE_ENV`        | `development`               | In `development` logs are printed with `pino-pretty`                           |
| `PORT`            | `3000`                      |                                                                                |
| `HOST`            | `0.0.0.0`                   |                                                                                |
| `MONGO_URI`       | `mongodb://127.0.0.1:27017` | **Required in production**                                                     |
| `MONGO_DB`        | `rayrecords_dev`            | **Required in production**. The seeder requires it to end in `_dev` or `_demo` |
| `ALLOWED_ORIGINS` | empty                       | Extra origins (comma-separated) accepted on requests that modify data          |
| `LOG_LEVEL`       | `info`                      |                                                                                |

### Deployment variables

See `deploy/.env.example`: `GHCR_OWNER`, `TAG`, `BIND_ADDR`, `WEB_PORT`, `MONGO_URI`, `MONGO_DB`, `COMPOSE_FILE` and `MONGO_NETWORK`.

## Commands

From the root:

| Command          | What it does                                                          |
| ---------------- | --------------------------------------------------------------------- |
| `pnpm dev`       | Mongo + API + web at once (`Ctrl+C` stops both processes)             |
| `pnpm bootstrap` | First time: `install` + Mongo + `seed` (the seed wipes the database)  |
| `pnpm dev:db`    | Starts the development Mongo and waits for the healthcheck            |
| `pnpm seed`      | Wipes and refills `rayrecords_dev`                                    |
| `pnpm dev:api`   | API with reload (`tsx watch`)                                         |
| `pnpm dev:web`   | Angular with `/api` proxied to `localhost:3000`                       |
| `pnpm test`      | Tests of the three packages                                           |
| `pnpm typecheck` | `tsc --noEmit` in `shared` and `api` (`web` is checked by `ng build`) |
| `pnpm build`     | API bundle (esbuild) and Angular production build                     |
| `pnpm format`    | Prettier over the whole repo                                          |

For a single package: `pnpm --filter @rayrecords/api test`, `pnpm --filter @rayrecords/shared typecheck`, etc.

To delete the development data: `docker compose -f deploy/compose.dev.yml down -v` (the volume is `rayrecords-dev_mongo-data`).

## Code structure

```
apps/api/src/
  server.ts            Startup: config → Mongo → indexes → app → listen, with graceful shutdown
  app.ts               Builds Fastify: Zod validators, `app.db`, modules under /api
  config.ts            Validated environment variables
  http/                Uniform error format and Origin check
  cli/                 create-user and migrate-notes (also compiled to dist/cli/)
  db/
    client.ts          Connection (pool of 5) and typed collections
    documents.ts       Mongo document types, derived from shared
    indexes.ts         ensureIndexes, idempotent, on every startup
  modules/
    health/            GET /api/health
    auth/              login/logout/me, global guard, sessions, scrypt, user creation
    lists/             routes.ts + mapper.ts (module template)
    expenses/          normalize, categorize, hash, prepare (pure logic, with tests)
  seed/                Seeder: catalog, generated transactions, seeded RNG

apps/web/src/app/
  app.ts · app.html    Shell: navigation, command palette and router-outlet
  app.config.ts        Router with parameter binding to input(), API providers
  app.routes.ts        One lazy route per module
  core/api/            ApiClient (contract), HttpApiClient (implementation), provideApi()
  core/auth/           AuthStore (user in a signal), authGuard and 401 interceptor
  features/
    auth/              Login screen
    capture/           Capture preview and prefixes (used by the "/" mode of the palette)
    lists/             Shared lists store, list and detail
    notes/ calendar/ expenses/ accounts/   Skeleton screens with their own routes

packages/shared/src/
  schemas/             Zod: common, list, item, daily-note, account, transaction, category
  presets/             LIST_PRESETS, DEFAULT_CATEGORIES, DEFAULT_RULES
  capture/             parse.ts, price.ts, types.ts (+ tests)
  dates.ts · slug.ts   Utilities for "calendar" dates and slugs
```

## How to…

### Add a module to the API

1. Create `apps/api/src/modules/<name>/` with `routes.ts` (a `FastifyPluginAsyncZod`) and, if needed, `mapper.ts` (Mongo document → DTO).
2. Declare the input and output schemas using those from `@rayrecords/shared` in `schema: { body, querystring, response }`: they are then validated and serialized automatically.
3. Register the plugin inside the `/api`-prefixed block in `app.ts`.
4. If it uses a new collection: add its type in `db/documents.ts`, its accessor in `db/client.ts` and its indexes in `db/indexes.ts`.

### Add a screen or module to the web

1. Create `features/<name>/` with `<name>.routes.ts` (a constant of type `Routes`) and the page.
2. Add the route with `loadChildren` in `app.routes.ts` and the link in `app.html`.
3. Data is requested through `ApiClient`: add the method to the abstract class and to `HttpApiClient`. Screens **never** inject `HttpClient` directly, so the implementation can be swapped (in-memory demo data, tests).

### Change the data model

Make the change in this order: Zod schema in `shared` → document type in `api/db/documents.ts` → mapper → indexes if needed → seeder → tests. Since document types are derived from the schemas with `Omit`, the compiler flags whatever is missing.

### Add a list type

It requires no code: it is data. Add an entry to `LIST_PRESETS` (if it should be offered as a template) or create the list with its `fieldDefs`. `money` fields are stored in cents inside `item.extra`.

### Add a capture prefix

List aliases are not coded: they are each list's `captureAlias` and are passed to the parser. Only `hoy` ("today") and `mañana` ("tomorrow") are in the code (`DATE_PREFIXES` in `capture/parse.ts`). A new date prefix (for example `pasado`, "the day after tomorrow") is added there with its offset in days and a test.

## The seeder

`pnpm seed` runs `apps/api/src/seed/index.ts`. It **wipes the entire database** and refills it deterministically (seed 42), with dates relative to today so the calendar always has data:

| What                 | Amount                                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Categories / rules   | 9 / 18                                                                                                                                          |
| Lists                | 6: Películas (movies), Series (shows), Compras (shopping), Tareas (tasks), Portfolio web (board), Ideas                                         |
| Items                | 47                                                                                                                                              |
| Notes                | 10 cards: one group of 3, one done 3 h ago, another 22 h ago (hidden soon) and another 30 h ago (already hidden; shows in "Terminadas" / done) |
| Accounts             | 2 (checking and savings)                                                                                                                        |
| Transactions         | 130 over 6 months, with one manual correction, several uncategorized and two identical coffees on the same day to exercise deduplication        |

The seeder keeps `credentials` but **replaces the user and closes the sessions**: it creates the development user defined in `apps/api/src/seed/user.ts` (default credentials are there; they can be changed with `SEED_USERNAME` and `SEED_PASSWORD`). For a real DB use `create-user`.

Guards: it refuses to run with `NODE_ENV=production` or if `MONGO_DB` does not end in `_dev` or `_demo`.

## Tests

- `shared`: capture parser, amounts, dates and slugs (90 tests). The parser is the piece with the most edge cases.
- `api`: categorization, deduplication hash, `prepareTransactions`, seeder generator, passwords, origin check and **authentication integration tests** (53 tests). The integration tests use a real Mongo (`MONGO_URI`, by default the one from `pnpm dev:db`) with a temporary `rayrecords_test_*` database that is dropped at the end; **if no Mongo is reachable they are skipped** (`describe.skipIf`). In CI a Mongo service is started.
- `web`: shell, capture preview, guard, interceptor and login (16 tests). `ng test --no-watch` for a single run.

## Conventions

- **Money**: integer cents, always. Expenses are negative.
- **Calendar dates**: `YYYY-MM-DD` as a string; instants as `Date`/ISO. Never use `Date` for anything that is not an instant.
- **Language**: documentation in English; UI text in Spanish; code and data identifiers in Spanish without accents when they are keys (`anio`, `puntuacion`, `porHacer`) and in English for infrastructure.
- **Layers**: business logic goes in pure functions with tests (such as `categorize` or `prepareTransactions`); routes and components only orchestrate.
- **Formatting**: prettier (`pnpm format`), LF in all files (`.gitattributes`).
- **Comments**: they explain the why (a constraint, a decision), they do not repeat the code.

## Known issues and tips

- **Moving or renaming the repo folder on Windows breaks `node_modules`**: pnpm uses links with absolute paths. Reinstall with `CI=true pnpm install` (in PowerShell: `$env:CI='true'; pnpm install`), because without a terminal pnpm refuses to purge the directory.
- **`shared` is consumed as TypeScript source**, uncompiled. The API resolves it through `exports` (`./src/index.ts`) and Angular through `paths` in `apps/web/tsconfig.json`. If another entry point is added it must be declared in both places.
- **`"sideEffects": false` in `shared` is what keeps Zod out of the web bundle.** Do not add code with import-time side effects. If the web ever imports a Zod schema (for example to validate forms), the initial bundle will grow by about 435 kB: consider `zod/mini`.
- **If a web test imports `shared` code that uses a package that is only a dependency of `shared`** (such as `zod`), the test builder cannot find it: add it as a dependency of `web`. It is not needed today because it is dropped at compile time.
- **Angular inline templates**: do not write backticks inside them, not even in HTML comments; they close the template literal.
- **`pnpm deploy` needs `--legacy`** in the API Dockerfile (pnpm 10 requires it if the workspace does not inject packages).
- **The API is bundled with esbuild**, leaving `dependencies` external and bundling `@rayrecords/shared` inside (which is why it is a `devDependency`). A new runtime dependency must go in `dependencies`.
- **Both Dockerfiles copy the `package.json` of every workspace package** so that `--frozen-lockfile` works. A new workspace package needs its `COPY` line in both.
- **`ng new` fails with `pnpm dlx` inside a workspace**: use `npx @angular/cli@latest`.
- **The seeder wipes all data collections** (not the access ones): do not change the guards.
- **`Secure` cookie and development**: the cookie is only marked `Secure` if the request arrived over HTTPS. On `http://localhost` it is not, so the session works without a certificate.
- **nginx passes `Host` with the port** (`$http_host`): the API compares the browser's `Origin` with that host; with `$host`, logins on `127.0.0.1:8080` would fail.
- **Passwords use scrypt** (`node:crypto`) instead of argon2: it avoids a native dependency in the Alpine image. The stored format carries the parameters, so the algorithm can be changed later.

## Personal GitHub account

The repo lives in a **personal** account; the machine also has a work account authenticated in `gh`, which is the active one. To avoid mixing them:

- Use the personal token only for the command that needs it, without changing the active account:

  ```powershell
  $env:GH_TOKEN = (gh auth token --user martinbarreirob)
  # … gh command …
  Remove-Item Env:GH_TOKEN
  ```

- Set the repo's **local** identity (the global one is the work one): `git config user.name` and `git config user.email` with the personal account's GitHub `noreply` email.
- Push without touching the credential manager:

  ```powershell
  $env:GH_TOKEN = (gh auth token --user martinbarreirob)
  git -c credential.helper= -c "credential.helper=!gh auth git-credential" push
  Remove-Item Env:GH_TOKEN
  ```

- **Pushing workflow files.** The personal OAuth token lacks the `workflow` scope, so an HTTPS push that touches `.github/workflows/*` is rejected. Push over SSH instead, with the `github-personal` host from `~/.ssh/config`: `git push git@github-personal:martinbarreirob/RayRecords.git main`.

## CI

`.github/workflows/ci.yml` defines three jobs:

1. `check`: `pnpm install --frozen-lockfile`, `typecheck`, `test` and `build`, on every push to `main` and every pull request.
2. `images`: only on push to `main`, builds `rayrecords-api` and `rayrecords-web` and publishes them to GHCR tagged `latest` and with the commit SHA.
3. `deploy`: after `images`, connects to the server over SSH (`environment: production`), copies the compose files to `~/rayrecords/deploy` and runs `TAG=<sha> docker compose pull && up -d`. Secrets required in GitHub: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` (dedicated key, no passphrase) and `DEPLOY_KNOWN_HOSTS` (`ssh-keyscan <host>`). `~/rayrecords/deploy/.env` must exist on the server.

**Git flow:** trunk directly on `main`. Commits follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`); every push to `main` goes through CI and, if it passes, deploys automatically. To roll back: `TAG=<previous-sha> docker compose up -d` on the server. Dependabot opens weekly dependency PRs.

Images are always built in CI (or locally for testing): the 4 GB server never runs `pnpm install` or `ng build`. The app is served through a Cloudflare Tunnel (`cloudflared` container) at https://rayrecords.nonchoperdas.com.

## Bank statement and expense catalog

- Real format confirmed (`Data,Concepto,Saldo,Importe,Data operación,Data valor`, `dd-mm-yyyy` dates, amounts like `-5.77 €` with floating-point noise). **"Data operación"** is used as the movement date and amounts are rounded to cents. If the bank gets the year wrong on some rows (late December with the following year) it is corrected and a warning is shown.
- `pnpm --filter @rayrecords/api sync-catalog` (in Docker: `node dist/cli/sync-catalog.js`) adds the categories and rules from the real statement (`BANK_RULES`), computes `merchantKey` for earlier movements and applies the rules to those that had no category. It is idempotent and only adds. **Run it once against the real database.**
- Doubtful rules (`despacho`, `mes`, `bk1-3`) are deliberately left out: they are decided in the "Revisar" (review) tab.
- Review is keyboard-driven: `1`–`9` and `0` pick a category (always the same one per number; `0` is Otros, "Other"), `Intro` (Enter) accepts the suggested one, `C` searches for another category (Enter confirms the first), `S` skips, `Z` or `Ctrl+Z` undoes, `R` toggles remembering the decision.
