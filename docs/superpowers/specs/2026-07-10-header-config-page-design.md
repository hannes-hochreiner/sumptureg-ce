# Header and Configuration Page Design

**Date:** 2026-07-10  
**Status:** Approved

## Overview

Add a persistent app header and a configuration page to sumptureg-ce, adapted from the travel-manager project. The header appears on every page. The configuration page provides a Synchronization section with a notify-on-auto-sync toggle and a manual sync button.

## Architecture

### New Files

**`objects/config.js`**  
A plain config object with a static `default()` factory. Initial defaults: `{ _id: "config", notifyOnAutoSync: false }`. Stored as a PouchDB document.

**`components/sumptureg-notification.js`**  
Port of `travel-notification.js`. Listens to the `"notification"` BroadcastChannel and displays a floating toast at the bottom of the screen. Errors stay visible until dismissed; info toasts auto-dismiss after 2 seconds. Included inside `sumptureg-header` so every page gets notifications automatically.

**`components/sumptureg-header.js`**  
Top header bar showing the "Sumptureg" title (linked to `/`) and a gear icon (⚙) that navigates to `/config`. Uses the existing `--primary` / `--primary-dark` / `--primary-light` CSS variables for consistent styling. Embeds `<sumptureg-notification>` so it need only be registered once.

**`pages/sumptureg-config.js`**  
Configuration page. Renders `<sumptureg-header>`, a breadcrumb bar labelled "Configuration", and a `<main>` grid. Contains one article: **Synchronization**.

The Synchronization article shows:
- Last synchronization timestamp (formatted `YYYY-MM-DD HH:MM`, or "unknown")
- A toggle button for `notifyOnAutoSync` (icon + label, same pattern as travel-manager)
- A manual "Synchronize" button that calls `repo.sync()` directly, updates the `info` doc's `lastSync`, re-renders the section, and posts a success/error notification to `"notification"`

### Modified Files

**`repo.js`**  
Add four methods:
- `getConfig()` — `this.#db.get("config")`
- `setConfig(config)` — `this.#db.put(config)`
- `getInfo()` — `this.#db.get("info")`
- `setInfo(info)` — `this.#db.put(info)`

**`objects/sync.js`**  
After a successful sync, instantiate `Repo` and call `getConfig()`. If `config.notifyOnAutoSync` is true, post `{ title: "Sync", message: "Synchronization successful", type: "info" }` to a `new BroadcastChannel("notification")`. On error, similarly check the flag and post an error notification. The `"sync-status"` channel continues to work as before for the nav's status text.

**`components/sumptureg-router.js`**  
Add a `/config` route before the catch-all, mapping to `SumpturegConfig`.

**All four page files** (`sumptureg-entry.js`, `sumptureg-summary.js`, `sumptureg-categories.js`, `sumptureg-conflicts.js`)  
Import and add `<sumptureg-header>` as the first element in each shadow root's HTML, above the existing `<sumptureg-nav>`.

## Data Flow

```
worker.js / index.html
  └─ triggerSync() [objects/sync.js]
       ├─ posts to BroadcastChannel("sync-status")  → sumptureg-nav (status text)
       └─ if config.notifyOnAutoSync:
            posts to BroadcastChannel("notification") → sumptureg-notification (toast)

sumptureg-config.js (manual sync button)
  └─ repo.sync()
       └─ posts to BroadcastChannel("notification")  → sumptureg-notification (toast)
```

## Styling

Follow the existing CSS variable conventions. The header uses the same gradient (`linear-gradient(45deg, var(--primary-light), var(--primary))`) as `sumptureg-nav`. The config page breadcrumb uses `--secondary` / `--secondary-light` / `--secondary-dark` (same as travel-manager). Buttons in the config page are styled consistently with travel-manager (flex row, centered, gap, cursor pointer).

## Out of Scope

- The existing `offline` / connection-toggle concept from `travel-header.js` is not carried over; sumptureg-ce has no offline mode.
- Storage and External Apps sections from travel-manager's config are not included.
- The travel-login component is not relevant here.
