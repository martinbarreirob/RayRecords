# API

Base: `/api`. In production nginx routes `/api/` to the `api` container (port 3000) and serves the frontend on the same origin. Input and output schemas live in `packages/shared`; the API uses them to validate and serialize.

## Session and errors

- Every `/api` route requires a session except `health` and `login` (routes marked `config: { public: true }`).
- `rr_session` cookie: `httpOnly`, `SameSite=Strict`, `Secure` if the request arrived over HTTPS, 30 days with a sliding renewal (renewed at most once per hour). Mongo stores only the token hash; the `sessions` collection has a TTL index on `expiresAt`.
- On requests other than `GET`/`HEAD`/`OPTIONS`, if an `Origin` header is present its host must match `Host` (or be listed in `ALLOWED_ORIGINS`); otherwise 403 `forbidden_origin`.
- Uniform error format: `{ "error": { "code", "message", "details?" } }`. `details` (`[{ path, message }]`) appears on validation errors (400), including those for an item's `extra`.
- Codes: `unauthorized`, `invalid_credentials`, `forbidden_origin`, `validation_error`, `not_found`, `conflict`, `alias_in_use` (409), `invalid_csv` (400), `too_many_requests`, `internal_error`.

## Conventions

- Identifiers travel as 24-character hexadecimal strings.
- Amounts are integer cents; expenses are negative.
- Calendar dates are `YYYY-MM-DD`; instants are ISO 8601.
- In a `PATCH`, `null` removes an optional value (`dueDate`, `text`, `captureAlias`…); in an item's `extra`, a key set to `null` is deleted.
- `204` responses have no body.

## Health and authentication

| Method | Path               | Response                            | Notes                                                                                                                                                       |
| ------ | ------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/health`      | `{ "status": "ok", "db": boolean }` | Liveness: returns 200 even if Mongo is down (`db: false`), so a database failure does not stop Docker from starting nginx. It is the container healthcheck. |
| `POST` | `/api/auth/login`  | `{ id, username }`                  | Body `{ username, password }`. Creates the session and sets the cookie. Generic 401 if the credentials are invalid; 429 after 10 attempts per IP in 15 min. |
| `POST` | `/api/auth/logout` | 204                                 | Revokes the session on the server and clears the cookie.                                                                                                    |
| `GET`  | `/api/auth/me`     | `{ id, username }`                  | User of the current session (used by the Angular guard).                                                                                                    |

## Lists and items

| Method   | Path                   | Response | Notes                                                                                                                                                                          |
| -------- | ---------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`    | `/api/lists`           | `List[]` | Non-archived by default; `?archived=true` for archived ones. Sorted by `order`.                                                                                                |
| `POST`   | `/api/lists`           | `List`   | `CreateList` (usually copied from a preset). The `slug` is generated from the name and is unique. 409 `alias_in_use` if another list already uses the alias, naming that list. |
| `PATCH`  | `/api/lists/:id`       | `List`   | `UpdateList`: name, fields, columns, alias (`null` removes it), `archived`. Slugs do not change on rename.                                                                     |
| `GET`    | `/api/lists/:id/items` | `Item[]` | Filters `tag`, `q` (text search) and `done=true\|false`. Sorted by `order`.                                                                                                    |
| `POST`   | `/api/items`           | `Item`   | `CreateItem`. Validates `extra` against the list's fields (free-form keys allowed). On a board, without `column` it goes to the first column; always appended at the end.      |
| `PATCH`  | `/api/items/:id`       | `Item`   | `UpdateItem`: includes `done` (sets/clears `doneAt`) and `column` (places it at the end of that column).                                                                       |
| `POST`   | `/api/items/:id/move`  | `Item`   | `{ afterId, column? }`: places it after `afterId` (`null` = at the start) in the given column. The server computes `order` and renumbers the column if there is no gap.        |
| `DELETE` | `/api/items/:id`       | 204      |                                                                                                                                                                                |

## Notes (cards on a canvas)

Each note is a card with a position. Cards can be grouped and marked as done. Coordinates are integers from 0 to 10,000; those of a card inside a group are **relative to the group's corner**.

| Method   | Path                   | Response          | Notes                                                                                                                                                                                                            |
| -------- | ---------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/note-cards`      | `NoteBoard`       | `{ cards, groups }`. **Excludes cards done 24 h ago or more**: the filter is applied on read; no process hides them.                                                                                             |
| `GET`    | `/api/note-cards/done` | `NoteCard[]`      | Those done 24 h ago or more (max 200, most recent first), for the "Terminadas" (done) view.                                                                                                                      |
| `POST`   | `/api/note-cards`      | `NoteCard` (201)  | `CreateNoteCard`. Without `x`/`y` the server picks the first free spot on the canvas (or `16, 56` inside a group).                                                                                               |
| `PATCH`  | `/api/note-cards/:id`  | `NoteCard`        | `UpdateNoteCard`: `text`, `x`, `y`, `w`, `groupId` and `done`. `done: true` sets `doneAt` (only once: repeating it does not move the date); `done: false` clears it. Moving a card brings it to the front (`z`). |
| `PATCH`  | `/api/note-cards`      | `NoteCard[]`      | `{ moves: [{ id, x, y, groupId? }] }`: moves several at once (grouping a selection). All or nothing: if any does not exist, 404 with no changes.                                                                 |
| `DELETE` | `/api/note-cards/:id`  | 204               |                                                                                                                                                                                                                  |
| `POST`   | `/api/note-groups`     | `NoteGroup` (201) | `CreateNoteGroup`: `title`, `x`, `y`, `w`, `h`. Without a position, it looks for a free spot.                                                                                                                    |
| `PATCH`  | `/api/note-groups/:id` | `NoteGroup`       | `UpdateNoteGroup`: title, position and size. Moving the group does not touch its cards' coordinates.                                                                                                             |
| `DELETE` | `/api/note-groups/:id` | `NoteCard[]`      | **Dissolves** the group: its cards are not deleted; they stay loose at the same place on the canvas and are returned already released.                                                                           |

## Daily notes (legacy)

Replaced by cards. The endpoints are still there so old data can be read, but the web app no longer uses them. `pnpm --filter @rayrecords/api migrate-notes` converts each note with text into a card (see [DEVELOPMENT.md](DEVELOPMENT.md)).

| Method | Path                      | Response   | Notes                                                                                                |
| ------ | ------------------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/notes?month=`       | `string[]` | Dates in the month (`YYYY-MM`) that have a note with content.                                        |
| `GET`  | `/api/notes/:date`        | `NoteView` | A date with no note returns `content: ""` and `updatedAt: null` (not 404).                           |
| `PUT`  | `/api/notes/:date`        | `NoteView` | `{ content }`: creates or replaces.                                                                  |
| `POST` | `/api/notes/:date/append` | `NoteView` | `{ text }`: appends a line. A single atomic operation: two simultaneous captures do not lose either. |

## Quick capture

| Method | Path           | Response          | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | -------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/capture` | `CaptureResponse` | `{ "text": "compra: Cafetera @hogar 89€" }`. Parses the text **on the server** with `parseQuickCapture` and the aliases stored in the DB. Results: `item` (with `warning` if some value did not fit the fields and was dropped), `note_card` (the created card, in the first free spot on the canvas; undo is deleting it; with `warning` if the target list was missing) or `empty`. Never fails because of the content. `precio` and `categoria` are stored in `extra` even if the list does not define them. |

## Calendar

| Method | Path                      | Response          | Notes                                                                                                                            |
| ------ | ------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/calendar?from=&to=` | `CalendarEntry[]` | Items with a `dueDate` in the range (both ends inclusive, max 400 days) from non-archived lists, with `listName` and `listSlug`. |

## Accounts

| Method  | Path                | Response           | Notes                                                                                                                           |
| ------- | ------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `GET`   | `/api/accounts`     | `AccountSummary[]` | Non-archived (`?archived=true` for archived ones). With `balanceCents` (opening balance + transactions) and `transactionCount`. |
| `POST`  | `/api/accounts`     | `AccountSummary`   | `CreateAccount`.                                                                                                                |
| `PATCH` | `/api/accounts/:id` | `AccountSummary`   | `UpdateAccount`, including `archived`.                                                                                          |

## Expenses

| Method             | Path                             | Response                     | Notes                                                                                                                                                                                                                  |
| ------------------ | -------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`              | `/api/transactions`              | `{ items, total }`           | Filters `accountId`, `month`, `category` (key or `none`), `q`; paginated with `limit` (≤ 500, 100 by default) and `offset`. Most recent first.                                                                         |
| `PATCH`            | `/api/transactions/:id/category` | `Transaction`                | `{ category, createRule? }`. It becomes `manual` and rules never overwrite it. With `createRule` it saves a `contains` rule (priority 10) using the normalized description.                                            |
| `POST`             | `/api/accounts/:id/imports`      | `ImportResult`               | Raw body with `Content-Type: text/csv` (max 5 MB; no multipart). Query `fileName` and `dryRun=true` for a preview without saving. Duplicates are skipped; re-importing an overlapping statement only adds what is new. |
| `GET`              | `/api/imports`                   | `ImportBatch[]`              | Last 50 imports.                                                                                                                                                                                                       |
| `DELETE`           | `/api/imports/:id`               | `{ deleted }`                | Undoes a whole import: deletes all its transactions.                                                                                                                                                                   |
| `GET`              | `/api/expenses/summary`          | `MonthlyCategoryTotal[]`     | `from`, `to` (`YYYY-MM`), `accountId?`, `type=expense\|income` (expenses by default). Excludes the `traspaso` (transfer) category.                                                                                     |
| `GET` / `POST`     | `/api/categories`                | `Category[]` / `Category`    | The key is the identifier. 409 if it already exists.                                                                                                                                                                   |
| `PATCH` / `DELETE` | `/api/categories/:key`           | `Category` / 204             | A category in use by rules or transactions cannot be deleted (409).                                                                                                                                                    |
| `GET` / `POST`     | `/api/rules`                     | `CategorizationRule[]` / one | Sorted by priority. Validates that the category exists and that the regular expression compiles.                                                                                                                       |
| `PATCH` / `DELETE` | `/api/rules/:id`                 | `CategorizationRule` / 204   |                                                                                                                                                                                                                        |
| `POST`             | `/api/rules/apply`               | `{ updated }`                | Re-applies the rules to uncategorized transactions. Does not touch those corrected by hand.                                                                                                                            |

The CSV parser (`apps/api/src/modules/expenses/csv.ts`) is **lenient** because we do not have the bank's real format yet: it auto-detects the separator, locates the header by column names and accepts either a signed amount or separate debit/credit columns. If it does not recognize the header it responds `400 invalid_csv`.

## Planned

| Method | Path                   | Description                                         |
| ------ | ---------------------- | --------------------------------------------------- |
| —      | `/api/auth/passkeys/*` | WebAuthn registration and sign-in (optional, later) |

## Review of uncategorized transactions

What is pending is whatever has no category (`categorySource: 'none'`); there is no separate state, so it survives between sessions.

| Method and path          | What it does                                                                                                                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/review/queue`  | Pending groups by merchant (`merchantKey`), from highest to lowest absolute amount, with up to 4 suggested categories (history, rule, name, most used), `pendingTransactions` and `pendingGroups`. `?limit=` (1–50). |
| `POST /api/review/apply` | `{ ids, category, merchantKey, createRule }`: categorizes the given pending transactions as `manual` and, if safe, creates the merchant's `contains` rule. Returns `ruleId` or `ruleSkippedReason`.                  |
| `POST /api/review/undo`  | `{ ids, ruleId }`: sets the transactions back to pending and deletes the created rule.                                                                                                                               |

A rule is **not** created if the merchant is not identifiable, the group is a single transaction, the amounts vary by more than 5x (max/min) or the rule already exists.
