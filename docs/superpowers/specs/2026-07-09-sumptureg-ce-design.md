# sumptureg-ce design: rebuilding sumptureg with custom elements + PouchDB

## Context

[sumptureg](../../../../sumptureg) is a small offline-first PWA for a 2-person household to log daily expenses. It's built on Rust/Leptos (WASM frontend) and Axum/Postgres (backend), using a custom sync engine called Rustend — a DAG-based multi-revision object store with server-side conflict detection, conceptually close to CouchDB's own revision-tree model.

This project (`sumptureg-ce`) rebuilds the same application using the architectural style of [travel-manager](../../../../travel-manager) instead: vanilla Web Components (no framework, no build step) with PouchDB/CouchDB for storage and sync, and the same visual design language (CSS custom properties, shadow DOM, flat `objects`/`components`/`pages` folder convention).

Since PouchDB/CouchDB natively provide revision trees, conflict detection (`_conflicts`), and replication, most of Rustend's bespoke machinery (head-tracking table, transaction cursors, DNF filter engine) is dropped in favor of built-in CouchDB replication — while preserving the *behavioral guarantees* sumptureg relies on: server-truth conflict detection, idempotent writes, seed data that's never excluded by a sync window, and explicit user-driven conflict resolution (never silent last-write-wins).

This repository currently contains only a LICENSE file — this is a from-scratch build.

## Key decisions

- **No sync windowing.** Sumptureg's original 3-month auto-sync window plus on-demand historical-month pulls is dropped. All expenses and categories sync continuously and completely — the dataset (a personal expense log for two people) is far too small to justify the added complexity of CouchDB filtered replication.
- **Static IP-based network access, one shared CouchDB account.** No login UI, no per-user CouchDB accounts. All devices allowed onto the private network share a single CouchDB account for `/api` access. This matches the original: sumptureg never actually partitioned data by user — IP-based auth there only tagged *who* made a change, and no UI ever used that.
- **No creator identity on documents.** Expense and category documents carry no `createdBy`/user-name field, and none is shown in the UI. A per-device PouchDB client id may exist purely as internal sync bookkeeping, never as application data.
- **Toolchain matches travel-manager exactly.** No bundler (raw ESM imports from CDN), a Nix flake for build + dev shell, Nushell build/task scripts, Docker Compose (CouchDB + nginx), a Tera-templated service worker.
- **Small ported unit tests.** Sumptureg's original test coverage for validation and summary-grouping logic is ported as standalone assert-style JS files (no test runner), preserving specific regression checks without adopting a test framework.
- **Color palette:** three distinct hues following travel-manager's formula (saturation 60%, lightness steps 20/50/80), chosen freely and documented as easy to change.

## Architecture

A single-page app backed by one PouchDB database (`sumptureg`), holding both `expense` and `category` documents discriminated by a `type` field, continuously synced to CouchDB via same-origin `/api` (nginx-proxied). This mirrors travel-manager's single `travel` database plus `repo.js` singleton pattern. No separate local-only database is needed — unlike travel-manager, there's no per-device config or identity to store locally.

**Data model:**

```js
// category document
{ _id: "<uuid>", type: "category", name: "Books" }

// expense document
{ _id: "<uuid>", type: "expense", amount: 12.5, currency: "EUR", date: "2026-07-09", category_id: "<uuid>" }
```

The 22 original seed categories keep their original fixed UUIDs. They're seeded via a one-time Nushell task that PUTs them directly into CouchDB — there is no Postgres-style migration system, since there's no custom backend at all (nginx + CouchDB is the whole backend, as in travel-manager).

**Index:** one PouchDB-Find index on `type` (mirrors travel-manager's `["type","parent"]` index, simplified since there's no `parent` field here).

**Summary aggregation** happens client-side in JS: fetch a month's expenses via a Mango query, then group/sum/sort in memory. This matches how the original Leptos summary page worked; no CouchDB map-reduce views are needed at this scale.

## File layout

Mirrors travel-manager's flat, convention-driven three-folder layout:

```
sumptureg-ce/
├── index.html                # CSS custom properties, boots router + service worker + sync worker
├── manifest.json
├── icon.svg
├── repo.js                    # Repo singleton — sole PouchDB access point
├── worker.js                  # background sync (60s interval + online event)
├── sw.js.tera                 # service worker template (Tera, rendered at build time)
├── nginx.conf                 # SPA fallback + /api proxy to CouchDB + IP allow-list
├── docker-compose.yml         # couchdb + nginx
├── flake.nix                  # Nix build + dev shell
├── builder.nu / mod.nu        # Nushell build/task scripts (rebuild/start/stop/init_db/seed_categories)
├── objects/
│   ├── expense.js              # static default() factory
│   ├── category.js             # static default() factory
│   └── utils.js                 # escapeHtml, registerCustomElements, shared helpers
├── components/
│   ├── sumptureg-router.js      # Navigation API routing, manual slot assignment
│   ├── sumptureg-nav.js          # bottom nav (Entry/Summary/Categories/Conflicts) + sync status indicator
│   ├── expense-form.js           # entry form incl. validation
│   ├── summary-table.js          # one currency section: category rows + total row
│   ├── category-list.js
│   ├── category-form.js
│   └── conflict-item.js          # one conflicted doc's radio-button chooser + resolve action
├── pages/
│   ├── sumptureg-entry.js         # "/"
│   ├── sumptureg-summary.js       # "/summary"
│   ├── sumptureg-categories.js    # "/categories"
│   └── sumptureg-conflicts.js     # "/conflicts"
└── test/
    ├── validation.test.js         # amount > 0, category/name non-empty
    └── summary.test.js            # grouping/sort + month-end date math (incl. leap years)
```

## Pages and business rules

Ported directly from sumptureg's original four routes:

- **Entry (`/`)** — amount (number input), currency (`<select>`: EUR default, USD, GBP, CHF, JPY), date (defaults to today), category (`<select>`, populated from local category docs). Validation: amount must parse as a number greater than 0 ("Enter a valid positive amount."); category must be selected ("Select a category."). On save: persist the document, flash "Saved!" for 1.5 seconds, reset amount and category but keep date and currency — this preserves the original UX shortcut for logging several same-day expenses in a row. Links to `/categories`.
- **Summary (`/summary`)** — month navigator (◀ `YYYY-MM` ▶). Groups the visible month's expenses by currency, then by category (name resolved from the local category doc, falling back to the raw id if not cached), summing amounts. Rows sort by amount descending within a currency section; currency sections sort alphabetically; each section ends with a bold Total row. Shows "No expenses this month." when empty.
- **Categories (`/categories`)** — text input plus Save (trimmed, non-empty check — "Name cannot be empty.", no duplicate check, matching the original). Alphabetically sorted list of existing categories. Shows "No categories yet." when empty.
- **Conflicts (`/conflicts`)** — lists every document with a `_conflicts` array, found via `db.allDocs({ include_docs: true, conflicts: true })`. For each, fetches every conflicting revision's content (`db.get(id, { rev })`) plus the current winning revision, and shows them as a radio-button list with a human-readable label (`"{amount} {currency} — {date} — {category name/id}"` for expenses, `"{name}"` for categories, `"(deleted)"` for tombstoned branches), with a "Resolve" button.

## Sync and conflict resolution

- `Repo.sync()` calls `db.sync(new PouchDB(`${origin}/api`))`, bidirectional and continuous, with no filters or windowing.
- Triggers: on app load, after every save (expense or category), on the browser's `online` event, and every 60 seconds via `worker.js` — the same trigger list as the original, minus the historical-pull logic.
- `sumptureg-nav`'s status indicator shows Synced / "N pending" / Syncing / Error, matching the original nav badge.
- **Conflict resolution** replaces Rustend's explicit `Lineage::Merge` step with native CouchDB revision-tree semantics: write the user's chosen content as a new revision on top of the current winning `_rev`, then explicitly `db.remove(id, rev)` every other conflicting revision. This produces the same net effect — one surviving revision, an explicit user-driven merge, never silent last-write-wins — without needing to model lineage explicitly, since CouchDB's revision tree already records it.

## Design and style

Reuses travel-manager's palette formula: three hues at saturation 60%, lightness steps 20/50/80, defined as CSS custom properties on `body` and inherited through shadow roots:

- `--primary` (app chrome / Entry): a blue, e.g. `hsl(220, 60%, 50%)`.
- `--secondary` (Summary / Categories content): e.g. `hsl(140, 60%, 50%)` (green) — distinct from travel-manager's yellow-green so the two apps are visually distinguishable at a glance.
- `--tertiary` (destructive / conflict / error): travel-manager's pink, `hsl(318, 60%, 50%)`.
- `--background: hsl(60, 100%, 98%)`, Noto Sans, no border-radius except toasts.

Card, list, and form conventions (gradient headers via `linear-gradient(45deg, var(--x-light), var(--x))`, native `<dialog>` for category-add/conflict flows where a modal treatment is wanted) are ported directly from travel-manager's documented design system. These colors are trivially swappable and not a hard requirement.

## Build, deploy, and testing

- No bundler; raw ESM imports from CDN for PouchDB and PouchDB-Find.
- `flake.nix`: Nix build (Nushell `builder.nu` copies source verbatim and renders `sw.js` from `sw.js.tera`) and dev shell (nu, bun, tera-cli).
- `mod.nu`: `rebuild` / `start` / `stop` / `init_db` (create the CouchDB database) / `seed_categories` (PUT the 22 fixed-UUID category documents).
- `docker-compose.yml`: CouchDB + nginx; nginx proxies `/api` to the CouchDB `sumptureg` database, applies an IP allow-list for network access, provides SPA fallback (`try_files ... /index.html`), and sends no-cache headers (the service worker owns caching).
- PWA shell: `manifest.json`, `sw.js.tera` (cache-first for static assets, network-passthrough for `/api/*`).
- `test/validation.test.js`, `test/summary.test.js`: standalone assert-style tests (no runner) porting sumptureg's original coverage — amount/name validation, summary grouping and sorting, and month-end date math including leap years. The original suite caught a real bug this way (seed categories silently excluded by an overly broad date filter), so a regression test asserting seed data is never excluded by the sync mechanism is included.

## Verification

- `nix develop` drops into the dev shell; `nix build` produces the deployable artifact.
- `docker compose up -d` brings up CouchDB and nginx; running the `init_db` and `seed_categories` nu tasks and then `curl http://localhost:8080/` should serve the app shell, with all 22 categories visible on `/categories`.
- Manually drive the golden path in a browser: log an expense, see it in Summary for the current month, add a category, see it selectable in Entry.
- Simulate a conflict (edit the same document from two browser profiles while offline, then let both sync) and confirm it surfaces on `/conflicts` with both versions selectable, and that resolving leaves exactly one surviving revision.
- Run the two standalone test files and confirm they pass.
