# Interface design (phase 6)

Neutral, quiet aesthetic: lots of white space, a "blank sheet of paper" feel, a single typeface (Inter, self-hosted) and a single accent color (indigo). Light and dark themes. Lightweight top navigation, no sidebar. Keyboard first (Ctrl+K opens the command palette). Primarily desktop use, adapted to mobile.

The visual reference is the six screens on the design canvas (`A1` notes, `A2` note states, `A3` Kanban, `A4` expenses, `A5` palette, `A6` mobile).

## When to use PrimeNG and when custom CSS

| Use **PrimeNG** (complex, accessible behavior already solved)        | Use **custom CSS** (what defines the identity or is very specific) |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `p-table`: sorting, filters, row selection, cell editing, pagination | Top bar, navigation, command palette (with capture)                |
| `p-select`, `p-multiselect`, `p-datepicker`: selectors and dates     | Notes canvas (cards, groups, dragging)                             |
| `p-dialog`, `p-confirmdialog`, `p-toast`: modals and notices         | Kanban board and its dragging                                      |
| `p-tooltip`, `p-checkbox`, `p-toggleswitch` when needed              | Calendar grid, cards, chips, simple buttons, simple forms          |

Rule of thumb: if you would have to reimplement keyboard handling, focus, ARIA and edge cases (tables, selectors, dialogs), use PrimeNG. If it is a visual piece of the design, use custom CSS with the tokens. **Do not mix**: a normal button is `.btn`, not `p-button`.

The PrimeNG configuration (`providePrimeNgTheme()` in `core/theme/provide-primeng.ts`) is declared in the `providers` of the **routes** that use it, never in `app.config.ts`: this keeps its theming engine in lazy chunks (the initial bundle goes from 574 to 358 kB). A new screen using PrimeNG adds that provider to its route.

Each component is imported individually (`import { TableModule } from 'primeng/table'`), never a general module. PrimeNG is already styled with the tokens (see `styles/_primeng.scss`), so it changes with the theme alone. PrimeNG colors are not overridden with loose values: adjust the matching `--p-*` variable in `_primeng.scss` or use a token.

## Tokens (`apps/web/src/styles/_tokens.scss`)

Colors: `--bg`, `--surface`, `--surface-2`, `--line`, `--line-strong`, `--text`, `--muted`, `--accent`, `--accent-hover`, `--accent-soft`, `--on-accent`, `--danger`, `--danger-soft`, `--success`, `--success-soft`, `--warning`, `--warning-soft`, `--overlay`.
Shape: `--radius-sm|md|lg|xl|pill`, `--shadow-sm|md|lg`, `--space-1…7` (4–48 px), `--text-xs…3xl`, `--control-height` (36 px), `--touch-target` (44 px), `--page-max`, `--page-gutter`, `--nav-height`.

**No loose colors, ever**: no `#fff`, no `rgb(...)` outside `_tokens.scss`. Everything uses `var(--token)`, so the dark theme works on its own. The theme is applied with `data-theme="light|dark"` on `<html>`; `@media (prefers-color-scheme)` is not used in components.

## Reusable global classes (`styles/_components.scss` and `_base.scss`)

| Class                                                                                | Use                                                                                                                      |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `.page`                                                                              | Page container (max width and margins). Every screen starts with it.                                                     |
| `.page-header`, `.page-eyebrow`, `h1`                                                | Screen header: title on the left, actions on the right.                                                                  |
| `.btn` + `.primary` / `.ghost` / `.danger` / `.sm` / `.icon`                         | Buttons. Only one `.primary` per area.                                                                                   |
| `.input`, `.select`, `.textarea`, `.field`                                           | Form fields (`.field` wraps label + control).                                                                            |
| `.card`, `.chip` (`.accent`), `.badge` (`.accent/.success/.warning/.danger`), `.kbd` | Surfaces and labels.                                                                                                     |
| `.segmented`                                                                         | View switch (Lista · Kanban · Cuadrícula). Children `button`/`a`; the active one has `aria-pressed="true"` or `.active`. |
| `.alert` (`.info/.success`), `.empty`                                                | Notices and empty states (dashed border, text that says what to do).                                                     |
| `.table`                                                                             | Simple table. For complex tables, `p-table`.                                                                             |
| `.muted`, `.num`, `.stack`, `.row`, `.spacer`, `.sr-only`                            | Utilities.                                                                                                               |

If a screen needs a piece that will be reused on another, add it here (and to this table); do not copy it between components.

## Dates, times and other controls

- **Date and time**: `<app-date-field>` and `<app-time-field>` (`core/ui/`). String value `YYYY-MM-DD` / `HH:mm`. On touch devices they use the system's native input; on desktop, `p-datepicker` (date) or a masked field (time). Never a bare `type="date"`. They require `providePrimeNgTheme()` on the route. Declare them with `<label for>` and `inputId`, not wrapped in a `<label>`.
- **Month or range picker**: `p-datepicker` with `[touchUI]` on touch devices.
- **Dropdowns**: `p-select`; **stepped numbers**: `p-inputnumber`; **checkboxes**: `p-checkbox` or the global style.
- **Tables**: `[rowHover]` only with a real pointer (`@media (hover: hover)`); done rows turn neutral gray.
- **Dragging on the canvas**: the card lifts (shadow and minimal scale, no rotation) and leaves a dashed mark in its place; transitions never affect `left`/`top`. Ctrl+Z undoes.
- **Notes: bounded canvas**: header and canvas use the `.page` column (same width and margins as the global header); only the height is kept (it fills what remains of the window) and the canvas has its own horizontal scroll. Box with a subtle border (inner shadow, so the cards' origin does not shift); when dragging something, the dashed outline of the zone is drawn; the shadow of a dragged group is contained (accent outline + `--shadow-md`).
- **Notes: header**: a single row on desktop, in this order: "Nueva nota" (new note) · "Ordenar" (sort; icon and text) · "Terminadas (N)" (done) · lock. Group (Ctrl+G) and mark done/reopen (X) have no header button: they live in the hint bar at the bottom, in the card's action bar and in their shortcuts. On mobile only "Terminadas" remains.
- **Notes: lock and sort**: the header lock (`aria-pressed`, locked by default, remembered in `rayrecords.notes.locked`) prevents moving cards and groups, resizing and the arrow keys; while locked you can still select, edit, group, delete and undo. A drag attempt shows the notice "Disposición bloqueada · Desbloquea para mover" (layout locked · unlock to move). When unlocked, dragging starts at 8 px. "Ordenar" rearranges loose cards and groups into a grid (reading order, no overlaps) as a single undoable operation.
- **Focus and selection on cards**: a single border. Selection is the 2 px accent border; keyboard focus is drawn inside the border (inner double line), never as an outer ring (the global `outline` is cancelled on the host with `:host(:focus-visible)`).
- **Global keyboard**: Shift+N / L / C / G / U go to Notes, Lists, Calendar, Expenses and Accounts (they do nothing with focus in a field, selector or calendar, with a modal open or with Ctrl/Alt/Meta; in notes, a bare "N" creates a card). "/" outside a field opens the palette in "Nueva nota o tarea" (new note or task) mode (also from the palette's top row, for touch): you type there, e.g. compra: leche, with a preview of the target list; Enter saves and Esc clears or exits. Alt+← / Alt+→ cycle through the sections (Notes, Lists, Calendar, Expenses, Accounts), without wrapping around, and replace the browser's back/forward. That is why no screen uses Alt+arrows; in notes, Shift+arrows moves the selection.
- **Loading skeletons**: while data arrives for the first time, `.skeleton` blocks (`.line`, `.title`, `.pill`, `.circle`, `.block`) are drawn with the same dimensions as the real content, so nothing jumps: `app-notes-skeleton` (cards and a ghost group inside the canvas box; rows on mobile) and `app-lists-skeleton` (`grid`, `table` and `board`). The blocks carry `aria-hidden="true"` and a `role="status"` with the `.sr-only` class announces the loading. They appear after a 150 ms delay done with `animation-delay` in CSS (no timers): a fast load never shows them. The empty state is shown only after loading, never as a substitute for the skeleton.
- **Reorderable lists**: drag handle and "Mover antes/después" (move before/after) buttons on each card (on touch, only the buttons); the order is saved in `order`.
- **Header**: the content aligns with the page width; brand on the left, navigation centered, actions on the right. On mobile, two rows with swipeable navigation.

## Component structure and styles

- Semantic HTML template: `button` for actions, `a` for navigation, a `label` linked to every control, a single `h1` per screen. No clickable `div`s.
- Own styles in the component's `styles:` (or a `.scss` next to it), with tokens and the global classes. No `!important`, no inline styles except dynamic values (positions, widths).
- Focus always visible (already defined in `_base.scss`); 44 px touch targets on mobile; sufficient contrast (the tokens already meet it).
- Mobile: below 768 px the screen must remain usable without horizontal page scroll. Wide tables scroll inside their box.
- Keyboard first: everything important is reachable without a mouse.

## How a screen is verified

1. `pnpm --filter @rayrecords/web test` passes.
2. It builds: `pnpm --filter @rayrecords/web exec ng build --output-path <temporary folder outside the repo>`.
3. It is tested in the browser, with a dedicated seeded database (never the user's development one), in light and dark, at desktop and mobile (375 px) widths. No console errors.
4. It is compared with the matching design screen and with its real functionality (what the design shows must be doable).
