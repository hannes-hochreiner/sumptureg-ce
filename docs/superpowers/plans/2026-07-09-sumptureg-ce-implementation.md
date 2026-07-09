# Sumptureg-CE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild sumptureg (an offline-first PWA for logging shared personal expenses) as a vanilla Web Components + PouchDB/CouchDB app, matching travel-manager's architecture, toolchain, and visual design.

**Architecture:** A single-page app with one PouchDB database (`sumptureg`) holding `expense` and `category` documents (discriminated by `type`), continuously synced to CouchDB via `/api`. No framework, no bundler — plain ES modules with Shadow DOM custom elements, following travel-manager's flat `objects/`/`components`/`pages` convention exactly.

**Tech Stack:** Vanilla JavaScript (ES modules), Web Components (Shadow DOM), PouchDB + PouchDB-Find (via CDN ESM imports), CouchDB 3.4, nginx, Docker Compose, Nix flake + Nushell build scripts, Bun (for running standalone test files only).

**Reference spec:** [`docs/superpowers/specs/2026-07-09-sumptureg-ce-design.md`](../specs/2026-07-09-sumptureg-ce-design.md)

## Global Constraints

- No bundler, no TypeScript, no npm — all third-party imports are ESM from `https://cdn.jsdelivr.net/npm/<pkg>/+esm`.
- Every custom element uses Shadow DOM (`this.attachShadow({ mode: "open" })`) and private class fields (`#field`) for internal state.
- CSS custom properties are defined once on `body` in `index.html` and inherited through shadow roots — never redefined per-component.
- Currency options are fixed to exactly: `EUR` (default), `USD`, `GBP`, `CHF`, `JPY` — not free text, not derived from data.
- Validation copy is verbatim: `"Enter a valid positive amount."`, `"Select a category."`, `"Name cannot be empty."`.
- No creator/user identity of any kind is stored on documents or shown in the UI.
- One PouchDB database named `sumptureg`; documents are discriminated by a `type` field (`"expense"` | `"category"`); one PouchDB-Find index: `{ fields: ["type"] }`.
- No sync windowing — `db.sync()` is always full and unfiltered.

---

### Task 1: Toolchain, deployment plumbing, and placeholder app shell

**Files:**
- Create: `flake.nix`
- Create: `docker-compose.yml`
- Create: `nginx.conf`
- Create: `couchdb.ini`
- Create: `mod.nu`
- Create: `builder.nu`
- Create: `sw.js.tera`
- Create: `index.html`
- Create: `manifest.json`
- Create: `icon.svg`
- Create: `components/.gitkeep`, `pages/.gitkeep`, `objects/.gitkeep`, `test/.gitkeep`

**Interfaces:**
- Produces: the CSS custom properties (`--primary`, `--primary-light`, `--primary-dark`, `--secondary*`, `--tertiary*`, `--background`) defined in `index.html`'s `body` style block — every later component's CSS relies on these exact names.
- Produces: the Nix/Docker build pipeline that later tasks' manual browser verification depends on.

This task has no unit tests (it's infrastructure) — verification is a full build/deploy smoke test at the end.

- [ ] **Step 1: Create the directory skeleton**

```bash
mkdir -p components pages objects test
touch components/.gitkeep pages/.gitkeep objects/.gitkeep test/.gitkeep
```

- [ ] **Step 2: Create `flake.nix`**

```nix
{
  description = "Sumptureg CE";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-25.11";
    nixpkgs-us.url = "github:nixos/nixpkgs?ref=nixos-unstable";
  };

  outputs = { self, nixpkgs, nixpkgs-us }:
  let
    system = "x86_64-linux";
    pkgs = import nixpkgs {
      inherit system;
    };
    pkgs-us = import nixpkgs-us {
      inherit system;
    };
    sumptureg-ce = derivation {
      inherit system;
      name = "sumptureg-ce-${self.shortRev or "dev"}";
      builder = "${pkgs.nushell}/bin/nu";
      buildInputs = with pkgs; [
        uutils-coreutils-noprefix
        tera-cli
      ];
      args = [ ./builder.nu "build" ./. ];
    };
  in {
    packages.${system}.default = sumptureg-ce;

    devShells.${system}.default = pkgs.mkShell {
      name = "sumptureg-ce";
      shellHook = ''
        exec nu
      '';
      buildInputs = with pkgs; [
        pkgs-us.bun
        nushell
        tera-cli
      ];
    };
  };
}
```

- [ ] **Step 3: Create `builder.nu`**

```nu
#!/usr/bin/env -S nu --stdin
use std/log

def main [] {}

def "main build" [
  src: string
] {
  augment_path

  let out = $env.out
  let tmp = $env.tmp
  let var_html = $"($out)/var/html"

  mkdir $tmp
  cd $src

  log info "copying repo"
  cp repo.js $tmp
  log info "copying index.html"
  cp index.html $tmp
  log info "copying manifest.json"
  cp manifest.json $tmp
  log info "copying icon.svg"
  cp icon.svg $tmp
  log info "copying worker.js"
  ^cp worker.js $tmp
  log info "copying components"
  ^cp -r components $tmp
  log info "copying pages"
  ^cp -r pages $tmp
  log info "copying objects"
  ^cp -r objects $tmp
  log info "creating service worker"
  create_service_worker $src $tmp

  mkdir $var_html
  ^cp -r $"($tmp)/." $var_html

  log info "build complete"
}

def --env augment_path [] {
  $env.PATH = [
    ...$env.PATH
    ...($env.buildInputs | split row -r '\s+' | each {|item| $"($item)/bin"})
  ]
}

def create_service_worker [
  source_path: string
  output_path: string
] {
  {
    version: (random uuid),
    project_artifacts: [
      './',
      './index.html',
      './manifest.json',
      './icon.svg',
      './repo.js',
      './worker.js',
      ...(ls -la $"($source_path)/pages" | get name | each {|x| $"./($x | path relative-to $source_path)"}),
      ...(ls -la $"($source_path)/components" | get name | each {|x| $"./($x | path relative-to $source_path)"}),
      ...(ls -la $"($source_path)/objects" | get name | each {|x| $"./($x | path relative-to $source_path)"}),
    ]
  } | to json | tera -t $"($source_path)/sw.js.tera" -s | save $"($output_path)/sw.js"
}
```

Note: `repo.js` and `worker.js` don't exist until Task 4/5 — `main build` will fail until then. That's expected; this task's own verification (Step 9) only checks `nix flake check`-level plumbing, not a full build. The full build is verified in Task 13.

- [ ] **Step 4: Create `sw.js.tera`**

```
const version = '{{ version }}';
const projectArtifacts = [
  {% for url in project_artifacts -%}
    '{{url}}',
  {% endfor -%}
];
const externalLibraries = [
  'https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,100..900;1,100..900&display=swap',
  'https://cdn.jsdelivr.net/npm/pouchdb/+esm',
  'https://cdn.jsdelivr.net/npm/pouchdb-find/+esm',
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(version).then(function(cache) {
      return cache.addAll([
        ...projectArtifacts,
        ...externalLibraries]);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('fetch', function(event) {
  let url = new URL(event.request.url);

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
    );
    return;
  }

  event.respondWith(
    caches.open(version).then(function(cache) {
      return cache.match(event.request).then(function(response) {
        return response || fetch(event.request).then(function(response) {
          cache.put(event.request, response.clone());
          return response;
        });
      });
    })
  );
});

self.addEventListener('activate', function activator(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys
        .filter(function(key) {
            return key.indexOf(version) !== 0;
        })
        .map(function(key) {
            return caches.delete(key);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});
```

- [ ] **Step 5: Create `mod.nu`**

```nu
use std/log
export-env {
    use std/log []
}

export def rebuild [] {
  nix-build
  docker compose up -d --force-recreate server
}

export def build [] {
}

export def start [] {
  docker compose up -d
}

export def stop [] {
  docker compose down
}

export def init_db [] {
  http put http://admin:password@localhost:5984/sumptureg ""
}

export def seed_categories [] {
  let categories = [
    ["id", "name"];
    ["c0000000-0000-0000-0000-000000000001", "Books"],
    ["c0000000-0000-0000-0000-000000000002", "Cafeteria"],
    ["c0000000-0000-0000-0000-000000000003", "Cereal"],
    ["c0000000-0000-0000-0000-000000000004", "Cleaning supplies"],
    ["c0000000-0000-0000-0000-000000000005", "Clothing"],
    ["c0000000-0000-0000-0000-000000000006", "Courses"],
    ["c0000000-0000-0000-0000-000000000007", "Dry cleaning"],
    ["c0000000-0000-0000-0000-000000000008", "Eating out"],
    ["c0000000-0000-0000-0000-000000000009", "Entertainment"],
    ["c0000000-0000-0000-0000-00000000000a", "Fruit"],
    ["c0000000-0000-0000-0000-00000000000b", "Gifts"],
    ["c0000000-0000-0000-0000-00000000000c", "Health"],
    ["c0000000-0000-0000-0000-00000000000d", "Home improvement"],
    ["c0000000-0000-0000-0000-00000000000e", "Meat"],
    ["c0000000-0000-0000-0000-00000000000f", "Personal care"],
    ["c0000000-0000-0000-0000-000000000010", "Postage"],
    ["c0000000-0000-0000-0000-000000000011", "Restaurants"],
    ["c0000000-0000-0000-0000-000000000012", "Sports"],
    ["c0000000-0000-0000-0000-000000000013", "Stationary"],
    ["c0000000-0000-0000-0000-000000000014", "Transport"],
    ["c0000000-0000-0000-0000-000000000015", "Vegetables"],
    ["c0000000-0000-0000-0000-000000000016", "Yoghurt"],
  ]

  for category in $categories {
    http put $"http://admin:password@localhost:5984/sumptureg/($category.id)" {
      type: "category",
      name: $category.name,
    }
  }
}

export def nix-build [] {
  nix build
}

export def nix-log [] {
  nix log
}
```

These fixed UUIDs are ported verbatim from sumptureg's original seed migration (`sumptureg/crates/sumptureg-server/migrations/004_seed_categories.sql`).

- [ ] **Step 6: Create `docker-compose.yml`**

```yaml
services:
  couchdb:
    image: couchdb:3.4.1
    container_name: sumptureg-couchdb
    ports:
      - "5984:5984"
    environment:
      COUCHDB_USER: "admin"
      COUCHDB_PASSWORD: "password"
    networks:
      - sumptureg

  server:
    image: nginx:alpine
    container_name: sumptureg-server
    depends_on:
      - couchdb
    ports:
      - "8080:80"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./result/var/html:/usr/share/nginx/html:ro
    networks:
      - sumptureg

networks:
  sumptureg:
    driver: bridge
```

- [ ] **Step 7: Create `nginx.conf`**

```nginx
server {
    listen       80;
    server_name  localhost;

    location / {
        root   /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
        expires -1;
        add_header Cache-Control "no-store, no-cache, must-revalidate";
    }

    location /api {
        # Restrict CouchDB sync access to the private VPN range; adjust to your actual VPN subnet.
        allow 10.0.0.0/8;
        deny all;

        proxy_pass http://sumptureg-couchdb:5984/sumptureg;
        proxy_redirect off;
        proxy_buffering off;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    error_page   500 502 503 504  /50x.html;
    location = /50x.html {
        root   /usr/share/nginx/html;
    }
}
```

- [ ] **Step 8: Create `couchdb.ini`** (documentation of the container's config; not volume-mounted, matching travel-manager)

```ini
[admins]
admin = password

[chttpd_auth]
timeout = 2592000

[couchdb]
single_node = true
```

- [ ] **Step 9: Create the placeholder `index.html`**

```html
<!DOCTYPE html>
<html>

<head>
  <title>Sumptureg</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,100..900;1,100..900&display=swap"
    rel="stylesheet">
  <link rel="manifest" href="/manifest.json" />
  <link rel="icon" type="image/svg+xml" href="/icon.svg">
</head>

<body>
  <style>
    body {
      margin: 0;
      --primary: hsl(220, 60%, 50%);
      --primary-light: hsl(220, 60%, 80%);
      --primary-dark: hsl(220, 60%, 20%);
      --secondary: hsl(140, 60%, 50%);
      --secondary-light: hsl(140, 60%, 80%);
      --secondary-dark: hsl(140, 60%, 20%);
      --tertiary: hsl(318, 60%, 50%);
      --tertiary-light: hsl(318, 60%, 80%);
      --tertiary-dark: hsl(318, 60%, 20%);
      --background: hsl(60, 100%, 98%);

      background-color: var(--background);

      font-family: "Noto Sans", sans-serif;
      font-optical-sizing: auto;
      font-weight: 400;
      font-style: normal;
      font-variation-settings: "width" 100;
    }
  </style>
  <h1 style="margin: 1rem; color: var(--primary-dark);">Sumptureg</h1>
</body>

</html>
```

This placeholder body is replaced with the real router/service-worker/sync wiring in Task 12.

- [ ] **Step 10: Create `manifest.json`**

```json
{
  "name": "Sumptureg",
  "start_url": "/",
  "icons": [
    { "src": "icon.svg", "sizes": "680x680", "type": "image/svg+xml" },
    { "src": "icon.svg", "sizes": "any", "type": "image/svg+xml" }
  ],
  "display": "standalone",
  "theme_color": "#3366cc",
  "background_color": "#fffff5"
}
```

- [ ] **Step 11: Create `icon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 680">
  <rect width="680" height="680" rx="120" fill="#3366cc"/>
  <text x="340" y="420" font-family="Noto Sans, sans-serif" font-size="360" font-weight="700"
    fill="#fffff5" text-anchor="middle">S</text>
</svg>
```

- [ ] **Step 12: Verify the placeholder shell serves correctly**

```bash
python3 -m http.server 8000
```

Visit `http://localhost:8000/index.html` in a browser. Expected: a page with a light warm background and a blue "Sumptureg" heading. Stop the server (Ctrl-C) once confirmed.

- [ ] **Step 13: Commit**

```bash
git add flake.nix docker-compose.yml nginx.conf couchdb.ini mod.nu builder.nu sw.js.tera index.html manifest.json icon.svg components pages objects test
git commit -m "Add build/deploy toolchain and placeholder app shell"
```

---

### Task 2: Domain objects and validation logic

**Files:**
- Create: `objects/expense.js`
- Create: `objects/category.js`
- Create: `objects/validation.js`
- Test: `test/validation.test.js`

**Interfaces:**
- Produces: `Expense.default()` → `{ _id, type: "expense", amount: 0, currency: "EUR", date: "YYYY-MM-DD", category_id: "" }`
- Produces: `Category.default()` → `{ _id, type: "category", name: "" }`
- Produces: `validateAmount(input: string) → { valid: true, value: number } | { valid: false, error: string }`
- Produces: `validateCategorySelected(categoryId: string) → { valid: true } | { valid: false, error: string }`
- Produces: `validateCategoryName(input: string) → { valid: true, value: string } | { valid: false, error: string }`
- Consumes: nothing (pure logic, no dependencies).

- [ ] **Step 1: Write the failing test**

Create `test/validation.test.js`:

```js
import assert from "node:assert";
import { validateAmount, validateCategorySelected, validateCategoryName } from "../objects/validation.js";

// validateAmount
assert.deepStrictEqual(validateAmount("12.50"), { valid: true, value: 12.5 });
assert.strictEqual(validateAmount("0").valid, false);
assert.strictEqual(validateAmount("0").error, "Enter a valid positive amount.");
assert.strictEqual(validateAmount("-5").valid, false);
assert.strictEqual(validateAmount("abc").valid, false);
assert.strictEqual(validateAmount("").valid, false);

// validateCategorySelected
assert.strictEqual(validateCategorySelected("").valid, false);
assert.strictEqual(validateCategorySelected("").error, "Select a category.");
assert.strictEqual(validateCategorySelected("some-id").valid, true);

// validateCategoryName
assert.deepStrictEqual(validateCategoryName("  Books  "), { valid: true, value: "Books" });
assert.strictEqual(validateCategoryName("   ").valid, false);
assert.strictEqual(validateCategoryName("   ").error, "Name cannot be empty.");
assert.strictEqual(validateCategoryName("").valid, false);

console.log("validation.test.js: all assertions passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test/validation.test.js`
Expected: FAIL — error resolving module `../objects/validation.js` (file does not exist yet).

- [ ] **Step 3: Write `objects/expense.js`**

```js
export class Expense {
  static default() {
    return {
      _id: crypto.randomUUID(),
      type: "expense",
      amount: 0,
      currency: "EUR",
      date: new Date().toISOString().slice(0, 10),
      category_id: "",
    };
  }
}
```

- [ ] **Step 4: Write `objects/category.js`**

```js
export class Category {
  static default() {
    return {
      _id: crypto.randomUUID(),
      type: "category",
      name: "",
    };
  }
}
```

- [ ] **Step 5: Write `objects/validation.js`**

```js
export function validateAmount(input) {
  const value = parseFloat(input);

  if (Number.isNaN(value) || value <= 0) {
    return { valid: false, error: "Enter a valid positive amount." };
  }

  return { valid: true, value };
}

export function validateCategorySelected(categoryId) {
  if (!categoryId) {
    return { valid: false, error: "Select a category." };
  }

  return { valid: true };
}

export function validateCategoryName(input) {
  const value = input.trim();

  if (value === "") {
    return { valid: false, error: "Name cannot be empty." };
  }

  return { valid: true, value };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bun test/validation.test.js`
Expected: `validation.test.js: all assertions passed` printed, exit code 0.

- [ ] **Step 7: Commit**

```bash
git add objects/expense.js objects/category.js objects/validation.js test/validation.test.js
git commit -m "Add expense/category domain objects and validation logic"
```

---

### Task 3: Summary aggregation and month date-math logic

**Files:**
- Create: `objects/summary.js`
- Test: `test/summary.test.js`

**Interfaces:**
- Produces: `monthStart(year: number, month: number) → "YYYY-MM-01"`
- Produces: `monthEnd(year: number, month: number) → "YYYY-MM-DD"` (last calendar day of that month, leap-year aware)
- Produces: `groupExpensesByCurrencyAndCategory(expenses: Array<{currency, category_id, amount}>, categoriesById: Map<string,string>) → Array<{ currency: string, rows: Array<{category: string, amount: number}>, total: number }>` — currencies sorted alphabetically, rows within a currency sorted by amount descending.
- Consumes: nothing (pure logic).

- [ ] **Step 1: Write the failing test**

Create `test/summary.test.js`:

```js
import assert from "node:assert";
import { monthStart, monthEnd, groupExpensesByCurrencyAndCategory } from "../objects/summary.js";

assert.strictEqual(monthStart(2026, 7), "2026-07-01");
assert.strictEqual(monthStart(2026, 12), "2026-12-01");

assert.strictEqual(monthEnd(2026, 1), "2026-01-31");
assert.strictEqual(monthEnd(2026, 2), "2026-02-28");
assert.strictEqual(monthEnd(2024, 2), "2024-02-29");
assert.strictEqual(monthEnd(2026, 12), "2026-12-31");

const categoriesById = new Map([
  ["cat-1", "Books"],
  ["cat-2", "Cafeteria"],
]);
const expenses = [
  { currency: "EUR", category_id: "cat-1", amount: 10 },
  { currency: "EUR", category_id: "cat-1", amount: 5 },
  { currency: "EUR", category_id: "cat-2", amount: 20 },
  { currency: "USD", category_id: "unknown-id", amount: 3 },
];
const grouped = groupExpensesByCurrencyAndCategory(expenses, categoriesById);

assert.strictEqual(grouped.length, 2);
assert.strictEqual(grouped[0].currency, "EUR");
assert.deepStrictEqual(grouped[0].rows, [
  { category: "Cafeteria", amount: 20 },
  { category: "Books", amount: 15 },
]);
assert.strictEqual(grouped[0].total, 35);
assert.strictEqual(grouped[1].currency, "USD");
assert.deepStrictEqual(grouped[1].rows, [{ category: "unknown-id", amount: 3 }]);
assert.strictEqual(grouped[1].total, 3);

console.log("summary.test.js: all assertions passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test/summary.test.js`
Expected: FAIL — error resolving module `../objects/summary.js` (file does not exist yet).

- [ ] **Step 3: Write `objects/summary.js`**

```js
export function monthStart(year, month) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function monthEnd(year, month) {
  // JS Date months are 0-indexed, so passing the 1-based `month` directly
  // as the month argument already points at the *next* calendar month.
  const nextMonthStart = month === 12
    ? new Date(Date.UTC(year + 1, 0, 1))
    : new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(nextMonthStart.getTime() - 24 * 60 * 60 * 1000);

  return lastDay.toISOString().slice(0, 10);
}

export function groupExpensesByCurrencyAndCategory(expenses, categoriesById) {
  const byCurrency = new Map();

  for (const expense of expenses) {
    const categoryName = categoriesById.get(expense.category_id) ?? expense.category_id;

    if (!byCurrency.has(expense.currency)) {
      byCurrency.set(expense.currency, new Map());
    }

    const byCategory = byCurrency.get(expense.currency);
    byCategory.set(categoryName, (byCategory.get(categoryName) ?? 0) + expense.amount);
  }

  const currencies = [...byCurrency.keys()].sort();

  return currencies.map((currency) => {
    const byCategory = byCurrency.get(currency);
    const rows = [...byCategory.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
    const total = rows.reduce((sum, row) => sum + row.amount, 0);

    return { currency, rows, total };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test/summary.test.js`
Expected: `summary.test.js: all assertions passed` printed, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add objects/summary.js test/summary.test.js
git commit -m "Add summary aggregation and month date-math logic"
```

---

### Task 4: `objects/utils.js` and `repo.js` (PouchDB data layer)

**Files:**
- Create: `objects/utils.js`
- Create: `repo.js`

**Interfaces:**
- Consumes: `monthStart`, `monthEnd` from `objects/summary.js` (Task 3).
- Produces: `escapeHtml(unsafe: string) → string`
- Produces: `new Repo()` → `Promise<Repo>` (singleton)
- Produces: `Repo#addDoc(doc)`, `Repo#getDoc(id)`, `Repo#getAllCategories() → Promise<Array<doc>>`, `Repo#getExpensesForMonth(year, month) → Promise<Array<doc>>`, `Repo#sync() → Promise<result>`, `Repo#getConflictedDocs() → Promise<Array<{id, type, versions: Array<doc>}>>`, `Repo#resolveConflict(docId, chosenContent, allVersions) → Promise<void>` — every later component that touches data goes through these exact method names.

This task has no automated test (it requires a browser's IndexedDB, which PouchDB uses — matches the spec's decision that only pure logic gets unit tests). It's verified manually via browser devtools in Step 3.

- [ ] **Step 1: Write `objects/utils.js`**

```js
export function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
```

- [ ] **Step 2: Write `repo.js`**

```js
import { default as PouchDb } from "https://cdn.jsdelivr.net/npm/pouchdb/+esm";
import { default as PouchDbFind } from "https://cdn.jsdelivr.net/npm/pouchdb-find/+esm";
import { monthStart, monthEnd } from "./objects/summary.js";

export class Repo {
  static #instance = null;
  #db = null;

  constructor() {
    return new Promise((resolve, reject) => {
      if (!Repo.#instance) {
        Repo.#instance = this;

        PouchDb.plugin(PouchDbFind);
        this.#db = new PouchDb("sumptureg");

        this.#db.createIndex({ index: { fields: ["type"] } })
          .then(() => resolve(Repo.#instance))
          .catch(reject);
      } else {
        resolve(Repo.#instance);
      }
    });
  }

  async addDoc(doc) {
    await this.#db.put(doc);
  }

  async getDoc(id) {
    return await this.#db.get(id);
  }

  async getAllCategories() {
    const { docs } = await this.#db.find({ selector: { type: "category" } });
    return docs;
  }

  async getExpensesForMonth(year, month) {
    const start = monthStart(year, month);
    const end = monthEnd(year, month);
    const { docs } = await this.#db.find({
      selector: { type: "expense", date: { $gte: start, $lte: end } },
    });
    return docs;
  }

  async sync() {
    const origin = typeof window === "undefined" ? self.location.origin : window.location.origin;
    return await this.#db.sync(new PouchDb(`${origin}/api`));
  }

  async getConflictedDocs() {
    const { rows } = await this.#db.allDocs({ include_docs: true, conflicts: true });
    const conflicted = [];

    for (const row of rows) {
      const doc = row.doc;
      if (doc && doc._conflicts && doc._conflicts.length > 0) {
        const versions = [doc];
        for (const rev of doc._conflicts) {
          versions.push(await this.#db.get(doc._id, { rev }));
        }
        conflicted.push({ id: doc._id, type: doc.type, versions });
      }
    }

    return conflicted;
  }

  async resolveConflict(docId, chosenContent, allVersions) {
    const winning = await this.#db.get(docId);
    const toRemove = allVersions.filter((version) => version._rev !== winning._rev);

    if (chosenContent._deleted) {
      await this.#db.remove(docId, winning._rev);
    } else {
      await this.#db.put({ ...chosenContent, _id: docId, _rev: winning._rev });
    }

    for (const version of toRemove) {
      await this.#db.remove(docId, version._rev);
    }
  }
}
```

Note: a doc whose *winning* revision is itself the deleted branch of a conflict will not appear in `allDocs` (a known CouchDB/PouchDB limitation, also present in travel-manager) — this is an accepted edge case, called out again in Task 13's verification.

- [ ] **Step 3: Verify manually in a browser**

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000` and, in the devtools console, run:

```js
const { Repo } = await import("/repo.js");
const repo = await new Repo();
await repo.addDoc({ _id: crypto.randomUUID(), type: "category", name: "Test" });
console.log(await repo.getAllCategories());
```

Expected: an array containing one object with `name: "Test"`. Stop the server once confirmed.

- [ ] **Step 4: Commit**

```bash
git add objects/utils.js repo.js
git commit -m "Add PouchDB data layer (Repo singleton)"
```

---

### Task 5: Sync trigger helper and background sync worker

**Files:**
- Create: `objects/sync.js`
- Create: `worker.js`

**Interfaces:**
- Consumes: `Repo` from `repo.js` (Task 4).
- Produces: `triggerSync() → Promise<void>` — broadcasts `{type: "syncing"}`, then `{type: "synced"}` or `{type: "error", message}` on the `BroadcastChannel("sync-status")` channel. Every later component that triggers a sync (worker, page save handlers, `index.html`'s boot script) calls this function instead of calling `repo.sync()` directly, so status reporting stays centralized.

No automated test — this depends on a live BroadcastChannel/PouchDB environment, verified manually.

- [ ] **Step 1: Write `objects/sync.js`**

```js
import { Repo } from "../repo.js";

const channel = new BroadcastChannel("sync-status");

export async function triggerSync() {
  channel.postMessage({ type: "syncing" });

  try {
    const repo = await new Repo();
    await repo.sync();
    channel.postMessage({ type: "synced" });
  } catch (error) {
    channel.postMessage({ type: "error", message: error.message });
  }
}
```

- [ ] **Step 2: Write `worker.js`**

```js
import { triggerSync } from "./objects/sync.js";

let intervalId = null;

onmessage = (event) => {
  if (event.data.type === "init") {
    intervalId = setInterval(() => {
      triggerSync();
    }, 1000 * 60);
  } else if (event.data.type === "stop") {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }
};
```

- [ ] **Step 3: Verify manually in a browser**

```bash
python3 -m http.server 8000
```

In the devtools console at `http://localhost:8000`:

```js
const bc = new BroadcastChannel("sync-status");
bc.onmessage = (e) => console.log(e.data);
const { triggerSync } = await import("/objects/sync.js");
await triggerSync();
```

Expected: logs `{type: "syncing"}` followed by either `{type: "synced"}` (if `/api` exists) or `{type: "error", message: ...}` (expected at this point, since nginx/CouchDB aren't running yet — confirms the error path broadcasts correctly). Stop the server once confirmed.

- [ ] **Step 4: Commit**

```bash
git add objects/sync.js worker.js
git commit -m "Add centralized sync trigger and background sync worker"
```

---

### Task 6: `sumptureg-nav` component (bottom nav + sync/conflict status)

**Files:**
- Create: `components/sumptureg-nav.js`

**Interfaces:**
- Consumes: `Repo` (Task 4), the `"sync-status"` BroadcastChannel messages (Task 5).
- Produces: the `<sumptureg-nav>` custom element, embedded by every page component in later tasks.

No automated test (UI component) — verified manually once pages exist (Task 13 covers the full nav in context). This task's own verification renders it standalone.

- [ ] **Step 1: Write `components/sumptureg-nav.js`**

```js
import { Repo } from "../repo.js";

export class SumpturegNav extends HTMLElement {
  #channel = null;

  constructor() {
    super();

    const shadowRoot = this.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = /*html*/ `
      <style>
        div#status {
          text-align: center;
          font-size: 0.8rem;
          padding: 0.25rem;
          color: var(--primary-dark);
        }
        nav {
          display: flex;
          flex-direction: row;
          justify-content: space-around;
          align-items: center;
          background: linear-gradient(45deg, var(--primary-light), var(--primary));
          padding: 0.75rem 0;
        }
        a {
          color: var(--primary-dark);
          text-decoration: none;
          font-weight: 700;
        }
        .badge {
          background: var(--tertiary);
          color: white;
          border-radius: 999px;
          padding: 0 0.4rem;
          margin-left: 0.25rem;
          font-size: 0.7rem;
        }
      </style>
      <div id="status">Synced</div>
      <nav>
        <a href="/">Entry</a>
        <a href="/summary">Summary</a>
        <a href="/categories">Categories</a>
        <a href="/conflicts">Conflicts<span id="badge"></span></a>
      </nav>
    `;
  }

  async connectedCallback() {
    this.#channel = new BroadcastChannel("sync-status");
    this.#channel.onmessage = (event) => this.#onSyncStatus(event.data);
    await this.#refreshConflictBadge();
  }

  disconnectedCallback() {
    this.#channel?.close();
  }

  #onSyncStatus(data) {
    const statusEl = this.shadowRoot.querySelector("#status");

    if (data.type === "syncing") {
      statusEl.textContent = "Syncing...";
    } else if (data.type === "synced") {
      statusEl.textContent = "Synced";
      this.#refreshConflictBadge();
    } else if (data.type === "error") {
      statusEl.textContent = `Error: ${data.message}`;
    }
  }

  async #refreshConflictBadge() {
    const repo = await new Repo();
    const conflicts = await repo.getConflictedDocs();
    const badge = this.shadowRoot.querySelector("#badge");

    badge.textContent = conflicts.length > 0 ? conflicts.length : "";
    badge.className = conflicts.length > 0 ? "badge" : "";
  }
}

customElements.define("sumptureg-nav", SumpturegNav);
```

- [ ] **Step 2: Verify manually in a browser**

Create a temporary `test.html` at the project root:

```html
<!DOCTYPE html>
<html>
<body>
  <script type="module">
    import "/components/sumptureg-nav.js";
  </script>
  <sumptureg-nav></sumptureg-nav>
</body>
</html>
```

Run `python3 -m http.server 8000`, visit `http://localhost:8000/test.html`. Expected: a blue gradient nav bar with Entry/Summary/Categories/Conflicts links and a "Synced" status line above it. Delete `test.html` and stop the server once confirmed.

- [ ] **Step 3: Commit**

```bash
git add components/sumptureg-nav.js
git commit -m "Add sumptureg-nav component with sync status and conflict badge"
```

---

### Task 7: Entry page (expense logging)

**Files:**
- Create: `components/expense-form.js`
- Create: `pages/sumptureg-entry.js`

**Interfaces:**
- Consumes: `Expense.default()` (Task 2), `validateAmount`/`validateCategorySelected` (Task 2), `Repo` (Task 4), `triggerSync` (Task 5), `<sumptureg-nav>` (Task 6).
- Produces: `<expense-form>` and `<sumptureg-entry>` custom elements.

No automated test (UI component) — verified manually.

- [ ] **Step 1: Write `components/expense-form.js`**

```js
import { Expense } from "../objects/expense.js";
import { validateAmount, validateCategorySelected } from "../objects/validation.js";
import { Repo } from "../repo.js";
import { triggerSync } from "../objects/sync.js";

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "JPY"];

export class ExpenseForm extends HTMLElement {
  constructor() {
    super();

    const shadowRoot = this.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = /*html*/ `
      <style>
        form { display: flex; flex-direction: column; gap: 0.75rem; margin: 1rem; max-width: 24rem; }
        label { display: flex; flex-direction: column; gap: 0.25rem; font-weight: 700; }
        input, select { font: inherit; padding: 0.5rem; border: 1px solid var(--primary-dark); }
        button {
          background: linear-gradient(45deg, var(--primary-light), var(--primary));
          color: var(--primary-dark);
          border: none;
          padding: 0.75rem;
          font-weight: 700;
          cursor: pointer;
        }
        p.error { color: var(--tertiary-dark); }
        p.saved { color: var(--secondary-dark); }
        p.notice { color: var(--primary-dark); }
      </style>
      <p id="error" class="error" hidden></p>
      <p id="saved" class="saved" hidden>Saved!</p>
      <p id="notice" class="notice" hidden>Sync required to load categories.</p>
      <form id="form">
        <label>Amount
          <input id="amount" type="number" step="0.01" min="0.01" placeholder="0.00" required />
        </label>
        <label>Currency
          <select id="currency">
            ${CURRENCIES.map((currency) => `<option value="${currency}">${currency}</option>`).join("")}
          </select>
        </label>
        <label>Date
          <input id="date" type="date" required />
        </label>
        <label>Category
          <select id="category" required></select>
        </label>
        <button type="submit">Save</button>
      </form>
    `;

    shadowRoot.querySelector("#date").value = new Date().toISOString().slice(0, 10);
    shadowRoot.querySelector("#form").addEventListener("submit", (event) => this.#onSubmit(event));
  }

  async connectedCallback() {
    await this.#loadCategories();
  }

  async #loadCategories() {
    const repo = await new Repo();
    const categories = await repo.getAllCategories();
    const select = this.shadowRoot.querySelector("#category");
    const notice = this.shadowRoot.querySelector("#notice");

    if (categories.length === 0) {
      notice.hidden = false;
      select.innerHTML = "";
      return;
    }

    notice.hidden = true;
    const sorted = categories.slice().sort((a, b) => a.name.localeCompare(b.name));
    select.innerHTML = [
      '<option value="">— select —</option>',
      ...sorted.map((category) => `<option value="${category._id}">${category.name}</option>`),
    ].join("");
  }

  async #onSubmit(event) {
    event.preventDefault();

    const errorEl = this.shadowRoot.querySelector("#error");
    const savedEl = this.shadowRoot.querySelector("#saved");
    const amountInput = this.shadowRoot.querySelector("#amount");
    const categorySelect = this.shadowRoot.querySelector("#category");

    const amountResult = validateAmount(amountInput.value);
    if (!amountResult.valid) {
      errorEl.textContent = amountResult.error;
      errorEl.hidden = false;
      return;
    }

    const categoryResult = validateCategorySelected(categorySelect.value);
    if (!categoryResult.valid) {
      errorEl.textContent = categoryResult.error;
      errorEl.hidden = false;
      return;
    }

    errorEl.hidden = true;

    const expense = {
      ...Expense.default(),
      amount: amountResult.value,
      currency: this.shadowRoot.querySelector("#currency").value,
      date: this.shadowRoot.querySelector("#date").value,
      category_id: categorySelect.value,
    };

    const repo = await new Repo();
    await repo.addDoc(expense);
    triggerSync();

    amountInput.value = "";
    categorySelect.value = "";
    savedEl.hidden = false;
    setTimeout(() => { savedEl.hidden = true; }, 1500);
  }
}

customElements.define("expense-form", ExpenseForm);
```

- [ ] **Step 2: Write `pages/sumptureg-entry.js`**

```js
import "../components/sumptureg-nav.js";
import "../components/expense-form.js";

export class SumpturegEntry extends HTMLElement {
  constructor() {
    super();

    const shadowRoot = this.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = /*html*/ `
      <style>
        h1 { margin: 1rem; color: var(--primary-dark); }
        a { margin: 0 1rem; color: var(--primary-dark); }
      </style>
      <sumptureg-nav></sumptureg-nav>
      <h1>Log Expense</h1>
      <expense-form></expense-form>
      <p><a href="/categories">+ New category</a></p>
    `;
  }
}

customElements.define("sumptureg-entry", SumpturegEntry);
```

- [ ] **Step 3: Verify manually in a browser**

Create a temporary `test.html` at the project root:

```html
<!DOCTYPE html>
<html>
<body>
  <script type="module">
    import "/pages/sumptureg-entry.js";
  </script>
  <sumptureg-entry></sumptureg-entry>
</body>
</html>
```

Run `python3 -m http.server 8000`, visit `http://localhost:8000/test.html`. Expected: nav bar, "Log Expense" heading, form. Because no categories exist yet, the category field should show "Sync required to load categories." Try submitting with an empty amount — expect "Enter a valid positive amount." Delete `test.html` and stop the server once confirmed.

- [ ] **Step 4: Commit**

```bash
git add components/expense-form.js pages/sumptureg-entry.js
git commit -m "Add expense entry page"
```

---

### Task 8: Summary page (monthly totals)

**Files:**
- Create: `components/summary-table.js`
- Create: `pages/sumptureg-summary.js`

**Interfaces:**
- Consumes: `escapeHtml` (Task 4), `Repo#getExpensesForMonth`/`Repo#getAllCategories` (Task 4), `groupExpensesByCurrencyAndCategory` (Task 3), `<sumptureg-nav>` (Task 6).
- Produces: `<summary-table>` (property setter `section = { currency, rows, total }`) and `<sumptureg-summary>` custom elements.

No automated test (UI component) — verified manually.

- [ ] **Step 1: Write `components/summary-table.js`**

```js
import { escapeHtml } from "../objects/utils.js";

export class SummaryTable extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  set section(section) {
    this.shadowRoot.innerHTML = /*html*/ `
      <style>
        section { margin-bottom: 1.5rem; }
        h3 { color: var(--secondary-dark); }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 0.25rem 0; }
        td.amount { text-align: right; }
        tr.total { font-weight: 700; border-top: 2px solid var(--secondary-dark); }
      </style>
      <section>
        <h3>${escapeHtml(section.currency)}</h3>
        <table>
          ${section.rows.map((row) => /*html*/ `
            <tr>
              <td>${escapeHtml(row.category)}</td>
              <td class="amount">${row.amount.toFixed(2)} ${escapeHtml(section.currency)}</td>
            </tr>
          `).join("")}
          <tr class="total">
            <td>Total</td>
            <td class="amount">${section.total.toFixed(2)} ${escapeHtml(section.currency)}</td>
          </tr>
        </table>
      </section>
    `;
  }
}

customElements.define("summary-table", SummaryTable);
```

- [ ] **Step 2: Write `pages/sumptureg-summary.js`**

```js
import "../components/sumptureg-nav.js";
import "../components/summary-table.js";
import { Repo } from "../repo.js";
import { groupExpensesByCurrencyAndCategory } from "../objects/summary.js";

export class SumpturegSummary extends HTMLElement {
  #year;
  #month;

  constructor() {
    super();

    const today = new Date();
    this.#year = today.getUTCFullYear();
    this.#month = today.getUTCMonth() + 1;

    const shadowRoot = this.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = /*html*/ `
      <style>
        .month-nav { display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin: 1rem; }
        main { margin: 0 1rem; }
        p.empty { color: var(--secondary-dark); }
      </style>
      <sumptureg-nav></sumptureg-nav>
      <div class="month-nav">
        <button id="prev">◀</button>
        <h2 id="label"></h2>
        <button id="next">▶</button>
      </div>
      <main id="main"></main>
    `;

    shadowRoot.querySelector("#prev").addEventListener("click", () => this.#shiftMonth(-1));
    shadowRoot.querySelector("#next").addEventListener("click", () => this.#shiftMonth(1));
  }

  async connectedCallback() {
    await this.#render();
  }

  #shiftMonth(delta) {
    this.#month += delta;
    if (this.#month < 1) { this.#month = 12; this.#year -= 1; }
    if (this.#month > 12) { this.#month = 1; this.#year += 1; }
    this.#render();
  }

  async #render() {
    this.shadowRoot.querySelector("#label").textContent =
      `${this.#year}-${String(this.#month).padStart(2, "0")}`;

    const repo = await new Repo();
    const [expenses, categories] = await Promise.all([
      repo.getExpensesForMonth(this.#year, this.#month),
      repo.getAllCategories(),
    ]);
    const categoriesById = new Map(categories.map((category) => [category._id, category.name]));
    const sections = groupExpensesByCurrencyAndCategory(expenses, categoriesById);

    const main = this.shadowRoot.querySelector("#main");

    if (sections.length === 0) {
      main.innerHTML = `<p class="empty">No expenses this month.</p>`;
      return;
    }

    main.innerHTML = "";
    for (const section of sections) {
      const table = document.createElement("summary-table");
      table.section = section;
      main.appendChild(table);
    }
  }
}

customElements.define("sumptureg-summary", SumpturegSummary);
```

- [ ] **Step 3: Verify manually in a browser**

Reuse the browser session from Task 7 (or start a fresh one: `python3 -m http.server 8000` with a temporary `test.html` importing `/pages/sumptureg-summary.js` and rendering `<sumptureg-summary></sumptureg-summary>`). With no expenses saved yet, expect "No expenses this month." After saving an expense via the Entry page (Task 7) in the same browser (same PouchDB database), reload the Summary page and confirm it now shows a currency section with that expense's category and amount, and a matching Total row.

- [ ] **Step 4: Commit**

```bash
git add components/summary-table.js pages/sumptureg-summary.js
git commit -m "Add monthly summary page"
```

---

### Task 9: Categories page (list + add)

**Files:**
- Create: `components/category-form.js`
- Create: `components/category-list.js`
- Create: `pages/sumptureg-categories.js`

**Interfaces:**
- Consumes: `Category.default()` (Task 2), `validateCategoryName` (Task 2), `Repo` (Task 4), `triggerSync` (Task 5), `escapeHtml` (Task 4), `<sumptureg-nav>` (Task 6).
- Produces: `<category-form>` (dispatches a bubbling, composed `"category-added"` CustomEvent on save), `<category-list>` (property setter `categories = Array<{_id, name}>`), `<sumptureg-categories>`.

No automated test (UI component) — verified manually.

- [ ] **Step 1: Write `components/category-form.js`**

```js
import { Category } from "../objects/category.js";
import { validateCategoryName } from "../objects/validation.js";
import { Repo } from "../repo.js";
import { triggerSync } from "../objects/sync.js";

export class CategoryForm extends HTMLElement {
  constructor() {
    super();

    const shadowRoot = this.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = /*html*/ `
      <style>
        form { display: flex; flex-direction: row; gap: 0.5rem; margin: 1rem; max-width: 24rem; }
        input { flex: 1; font: inherit; padding: 0.5rem; border: 1px solid var(--secondary-dark); }
        button {
          background: linear-gradient(45deg, var(--secondary-light), var(--secondary));
          color: var(--secondary-dark);
          border: none;
          padding: 0.5rem 1rem;
          font-weight: 700;
          cursor: pointer;
        }
        p.error { color: var(--tertiary-dark); margin: 0 1rem; }
      </style>
      <p id="error" class="error" hidden></p>
      <form id="form">
        <input id="name" type="text" placeholder="Category name" required />
        <button type="submit">Save</button>
      </form>
    `;

    shadowRoot.querySelector("#form").addEventListener("submit", (event) => this.#onSubmit(event));
  }

  async #onSubmit(event) {
    event.preventDefault();

    const errorEl = this.shadowRoot.querySelector("#error");
    const nameInput = this.shadowRoot.querySelector("#name");

    const result = validateCategoryName(nameInput.value);
    if (!result.valid) {
      errorEl.textContent = result.error;
      errorEl.hidden = false;
      return;
    }

    errorEl.hidden = true;

    const category = { ...Category.default(), name: result.value };
    const repo = await new Repo();
    await repo.addDoc(category);
    triggerSync();

    nameInput.value = "";
    this.dispatchEvent(new CustomEvent("category-added", { bubbles: true, composed: true }));
  }
}

customElements.define("category-form", CategoryForm);
```

- [ ] **Step 2: Write `components/category-list.js`**

```js
import { escapeHtml } from "../objects/utils.js";

export class CategoryList extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  set categories(categories) {
    if (categories.length === 0) {
      this.shadowRoot.innerHTML = /*html*/ `
        <style>p.empty { color: var(--secondary-dark); margin: 1rem; }</style>
        <p class="empty">No categories yet.</p>
      `;
      return;
    }

    const sorted = categories.slice().sort((a, b) => a.name.localeCompare(b.name));
    this.shadowRoot.innerHTML = /*html*/ `
      <style>ul { margin: 0 1rem; padding-left: 1.25rem; }</style>
      <ul>
        ${sorted.map((category) => `<li>${escapeHtml(category.name)}</li>`).join("")}
      </ul>
    `;
  }
}

customElements.define("category-list", CategoryList);
```

- [ ] **Step 3: Write `pages/sumptureg-categories.js`**

```js
import "../components/sumptureg-nav.js";
import "../components/category-form.js";
import "../components/category-list.js";
import { Repo } from "../repo.js";

export class SumpturegCategories extends HTMLElement {
  constructor() {
    super();

    const shadowRoot = this.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = /*html*/ `
      <style>h1 { margin: 1rem; color: var(--secondary-dark); }</style>
      <sumptureg-nav></sumptureg-nav>
      <h1>Categories</h1>
      <category-form id="form"></category-form>
      <category-list id="list"></category-list>
    `;

    shadowRoot.addEventListener("category-added", () => this.#loadCategories());
  }

  async connectedCallback() {
    await this.#loadCategories();
  }

  async #loadCategories() {
    const repo = await new Repo();
    const categories = await repo.getAllCategories();
    this.shadowRoot.querySelector("#list").categories = categories;
  }
}

customElements.define("sumptureg-categories", SumpturegCategories);
```

- [ ] **Step 4: Verify manually in a browser**

Using the same running server/browser session as prior tasks, load a `test.html` importing `/pages/sumptureg-categories.js` and rendering `<sumptureg-categories></sumptureg-categories>`. Confirm: existing categories (if any saved earlier) appear alphabetically; typing a name and clicking Save adds it to the list without a page reload; submitting an empty/whitespace-only name shows "Name cannot be empty."

- [ ] **Step 5: Commit**

```bash
git add components/category-form.js components/category-list.js pages/sumptureg-categories.js
git commit -m "Add categories page"
```

---

### Task 10: Conflicts page (manual conflict resolution)

**Files:**
- Create: `components/conflict-item.js`
- Create: `pages/sumptureg-conflicts.js`

**Interfaces:**
- Consumes: `escapeHtml` (Task 4), `Repo#getConflictedDocs`/`Repo#resolveConflict` (Task 4), `<sumptureg-nav>` (Task 6).
- Produces: `<conflict-item>` (property setter `conflict = { id, type, versions }`, dispatches a bubbling, composed `"conflict-resolved"` CustomEvent), `<sumptureg-conflicts>`.

No automated test (UI component) — verified manually, including a real two-device conflict simulation.

- [ ] **Step 1: Write `components/conflict-item.js`**

```js
import { escapeHtml } from "../objects/utils.js";
import { Repo } from "../repo.js";

function describeVersion(type, doc) {
  if (doc._deleted) {
    return "(deleted)";
  }
  if (type === "expense") {
    return `${doc.amount} ${escapeHtml(doc.currency)} — ${escapeHtml(doc.date)} — ${escapeHtml(doc.category_id)}`;
  }
  return `"${escapeHtml(doc.name)}"`;
}

export class ConflictItem extends HTMLElement {
  #conflict = null;
  #chosenIndex = 0;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  set conflict(conflict) {
    this.#conflict = conflict;
    this.#chosenIndex = 0;
    this.#render();
  }

  #render() {
    const { id, type, versions } = this.#conflict;

    this.shadowRoot.innerHTML = /*html*/ `
      <style>
        div.item { border: 1px solid var(--tertiary-dark); margin: 1rem; padding: 1rem; }
        h3 { color: var(--tertiary-dark); margin-top: 0; }
        label { display: block; margin: 0.25rem 0; }
        button {
          background: linear-gradient(45deg, var(--tertiary-light), var(--tertiary));
          color: var(--tertiary-dark);
          border: none;
          padding: 0.5rem 1rem;
          font-weight: 700;
          cursor: pointer;
        }
      </style>
      <div class="item">
        <h3>${type === "expense" ? "Expense" : "Category"} conflict (${escapeHtml(id)})</h3>
        ${versions.map((version, index) => /*html*/ `
          <label>
            <input type="radio" name="${escapeHtml(id)}" value="${index}" ${index === this.#chosenIndex ? "checked" : ""} />
            ${describeVersion(type, version)}
          </label>
        `).join("")}
        <button id="resolve">Resolve with chosen version</button>
      </div>
    `;

    this.shadowRoot.querySelectorAll(`input[name="${id}"]`).forEach((input) => {
      input.addEventListener("change", (event) => {
        this.#chosenIndex = Number(event.target.value);
      });
    });
    this.shadowRoot.querySelector("#resolve").addEventListener("click", () => this.#resolve());
  }

  async #resolve() {
    const { id, versions } = this.#conflict;
    const chosen = versions[this.#chosenIndex];
    // The winning doc (versions[0]) carries a `_conflicts` array from the
    // {conflicts: true} query — CouchDB rejects PUTs containing it, so it
    // must be stripped along with `_rev`/`_revisions` regardless of which
    // version was chosen.
    const { _rev, _revisions, _conflicts, ...content } = chosen;

    const repo = await new Repo();
    await repo.resolveConflict(id, content, versions);
    this.dispatchEvent(new CustomEvent("conflict-resolved", { bubbles: true, composed: true }));
  }
}

customElements.define("conflict-item", ConflictItem);
```

- [ ] **Step 2: Write `pages/sumptureg-conflicts.js`**

```js
import "../components/sumptureg-nav.js";
import "../components/conflict-item.js";
import { Repo } from "../repo.js";

export class SumpturegConflicts extends HTMLElement {
  constructor() {
    super();

    const shadowRoot = this.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = /*html*/ `
      <style>
        h1 { margin: 1rem; color: var(--tertiary-dark); }
        p.empty { margin: 1rem; color: var(--secondary-dark); }
      </style>
      <sumptureg-nav></sumptureg-nav>
      <h1>Conflicts</h1>
      <div id="list"></div>
    `;

    shadowRoot.addEventListener("conflict-resolved", () => this.#load());
  }

  async connectedCallback() {
    await this.#load();
  }

  async #load() {
    const repo = await new Repo();
    const conflicts = await repo.getConflictedDocs();
    const list = this.shadowRoot.querySelector("#list");

    if (conflicts.length === 0) {
      list.innerHTML = `<p class="empty">No conflicts.</p>`;
      return;
    }

    list.innerHTML = "";
    for (const conflict of conflicts) {
      const item = document.createElement("conflict-item");
      item.conflict = conflict;
      list.appendChild(item);
    }
  }
}

customElements.define("sumptureg-conflicts", SumpturegConflicts);
```

- [ ] **Step 3: Verify manually in a browser**

Using the same session, load a `test.html` importing `/pages/sumptureg-conflicts.js` and rendering `<sumptureg-conflicts></sumptureg-conflicts>`. With no conflicting docs, expect "No conflicts." A full conflict-simulation walkthrough (creating an actual conflicting revision pair) is covered end-to-end in Task 13, once CouchDB sync is live.

- [ ] **Step 4: Commit**

```bash
git add components/conflict-item.js pages/sumptureg-conflicts.js
git commit -m "Add conflicts page"
```

---

### Task 11: Router

**Files:**
- Create: `components/sumptureg-router.js`

**Interfaces:**
- Consumes: `SumpturegEntry` (Task 7), `SumpturegSummary` (Task 8), `SumpturegCategories` (Task 9), `SumpturegConflicts` (Task 10).
- Produces: the `<sumptureg-router>` custom element (registered by `index.html` in Task 12, not self-registered, matching travel-manager's `travel-router` convention).

No automated test (depends on the Navigation API / browser routing) — verified manually.

- [ ] **Step 1: Write `components/sumptureg-router.js`**

```js
import { SumpturegEntry } from "../pages/sumptureg-entry.js";
import { SumpturegSummary } from "../pages/sumptureg-summary.js";
import { SumpturegCategories } from "../pages/sumptureg-categories.js";
import { SumpturegConflicts } from "../pages/sumptureg-conflicts.js";

export class SumpturegRouter extends HTMLElement {
  #slotContent = null;
  #routes = [
    { route: /^\/summary$/, class: SumpturegSummary },
    { route: /^\/categories$/, class: SumpturegCategories },
    { route: /^\/conflicts$/, class: SumpturegConflicts },
    { route: /[\s\S]*/, class: SumpturegEntry },
  ];

  constructor() {
    super();

    const shadowRoot = this.attachShadow({ mode: "open", slotAssignment: "manual" });
    shadowRoot.innerHTML = /*html*/ `
      <style></style>
      <slot><div id="default">Loading Sumptureg...</div></slot>
    `;
  }

  #navigate(event) {
    if (!event.canIntercept) {
      return;
    }

    const url = new URL(event.destination.url);

    for (const item of this.#routes) {
      const result = item.route.exec(url.pathname);
      if (result) {
        event.intercept({
          handler: async () => this.#updateView(item.class, result.groups),
        });
        break;
      }
    }
  }

  #updateView(type, groups) {
    if (this.#slotContent) {
      this.#slotContent.remove();
      this.#slotContent = null;
    }

    this.#slotContent = new type(groups);
    this.appendChild(this.#slotContent);
    this.shadowRoot.querySelector("slot").assign(this.#slotContent);
  }

  connectedCallback() {
    navigation.addEventListener("navigate", this.#navigate.bind(this));

    for (const item of this.#routes) {
      const result = item.route.exec(window.location.pathname);
      if (result) {
        this.#updateView(item.class, result.groups);
        break;
      }
    }
  }
}
```

Note: unlike other components, `SumpturegRouter` is exported but **not** self-registered with `customElements.define` here — `index.html` (Task 12) registers it, matching travel-manager's `travel-router` convention exactly (the router is the one component whose registration lives in the HTML shell).

- [ ] **Step 2: Verify it loads without errors**

```bash
python3 -m http.server 8000
```

In the devtools console at `http://localhost:8000`, run:

```js
const { SumpturegRouter } = await import("/components/sumptureg-router.js");
console.log(SumpturegRouter);
```

Expected: logs the class with no import errors (confirms all four page imports resolve correctly). Full navigation behavior is verified in Task 12 once it's wired into `index.html`. Stop the server once confirmed.

- [ ] **Step 3: Commit**

```bash
git add components/sumptureg-router.js
git commit -m "Add sumptureg-router"
```

---

### Task 12: Wire `index.html` to the router, service worker, and sync

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `SumpturegRouter` (Task 11), `triggerSync` (Task 5).

No automated test — verified manually as a full single-page app.

- [ ] **Step 1: Replace the placeholder body in `index.html`**

Replace the `<h1>` placeholder line with:

```html
  <script type="module">
    import { SumpturegRouter } from "/components/sumptureg-router.js";
    import { triggerSync } from "/objects/sync.js";

    customElements.define("sumptureg-router", SumpturegRouter);

    (async () => {
      if ("serviceWorker" in navigator) {
        try {
          const registration = await navigator.serviceWorker.register("/sw.js", {
            scope: "/", type: "module",
          });

          if (registration.installing) {
            console.log("Service worker installing");
          } else if (registration.waiting) {
            console.log("Service worker installed");
          } else if (registration.active) {
            console.log("Service worker active");
          }
        } catch (error) {
          console.error(`Registration failed with ${error}`);
        }
      }
    })();

    if (window.Worker) {
      const worker = new Worker("/worker.js", { type: "module" });
      worker.postMessage({ type: "init" });
    }

    window.addEventListener("online", () => triggerSync());
    triggerSync();
  </script>
  <sumptureg-router></sumptureg-router>
```

The full `<body>` should now read:

```html
<body>
  <style>
    body {
      margin: 0;
      --primary: hsl(220, 60%, 50%);
      --primary-light: hsl(220, 60%, 80%);
      --primary-dark: hsl(220, 60%, 20%);
      --secondary: hsl(140, 60%, 50%);
      --secondary-light: hsl(140, 60%, 80%);
      --secondary-dark: hsl(140, 60%, 20%);
      --tertiary: hsl(318, 60%, 50%);
      --tertiary-light: hsl(318, 60%, 80%);
      --tertiary-dark: hsl(318, 60%, 20%);
      --background: hsl(60, 100%, 98%);

      background-color: var(--background);

      font-family: "Noto Sans", sans-serif;
      font-optical-sizing: auto;
      font-weight: 400;
      font-style: normal;
      font-variation-settings: "width" 100;
    }
  </style>
  <script type="module">
    import { SumpturegRouter } from "/components/sumptureg-router.js";
    import { triggerSync } from "/objects/sync.js";

    customElements.define("sumptureg-router", SumpturegRouter);

    (async () => {
      if ("serviceWorker" in navigator) {
        try {
          const registration = await navigator.serviceWorker.register("/sw.js", {
            scope: "/", type: "module",
          });

          if (registration.installing) {
            console.log("Service worker installing");
          } else if (registration.waiting) {
            console.log("Service worker installed");
          } else if (registration.active) {
            console.log("Service worker active");
          }
        } catch (error) {
          console.error(`Registration failed with ${error}`);
        }
      }
    })();

    if (window.Worker) {
      const worker = new Worker("/worker.js", { type: "module" });
      worker.postMessage({ type: "init" });
    }

    window.addEventListener("online", () => triggerSync());
    triggerSync();
  </script>
  <sumptureg-router></sumptureg-router>
</body>
```

- [ ] **Step 2: Verify the full app shell manually**

```bash
python3 -m http.server 8000
```

Visit `http://localhost:8000`. Expected: the Entry page renders (nav bar, "Log Expense" form). Click "Summary", "Categories", "Conflicts" nav links — confirm each renders its page without a full page reload (check the Network tab shows no navigation-triggered document reload). Add a category, then an expense using it, then check Summary shows it. Stop the server once confirmed.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Wire index.html to the router, service worker, and sync"
```

---

### Task 13: Category seeding and full end-to-end verification

**Files:**
- No new files — this task exercises the full stack built in Tasks 1–12 plus the `seed_categories` task from Task 1.

**Interfaces:** none (integration/verification task).

- [ ] **Step 1: Build and start the full stack**

```bash
nix build
docker compose up -d
```

Expected: `./result/var/html` contains the built app; `docker compose ps` shows `sumptureg-couchdb` and `sumptureg-server` both `Up`.

- [ ] **Step 2: Initialize and seed the database**

```bash
nix develop
use mod.nu *
init_db
seed_categories
```

Expected: `init_db` creates the `sumptureg` CouchDB database (check via `curl http://admin:password@localhost:5984/sumptureg`, expect a JSON object with `"db_name":"sumptureg"`); `seed_categories` PUTs 22 documents without error.

- [ ] **Step 3: Verify the app shell is served**

```bash
curl -s http://localhost:8080/ | grep -o '<title>.*</title>'
```

Expected: `<title>Sumptureg</title>`.

- [ ] **Step 4: Golden-path walkthrough in a browser**

Visit `http://localhost:8080`. Confirm:
1. The Entry page's category dropdown is empty and shows "Sync required to load categories." until a sync completes (the boot script calls `triggerSync()` automatically — reload if needed).
2. After sync, all 22 seeded categories (Books, Cafeteria, Cereal, ... Yoghurt) appear in the category dropdown.
3. Log an expense (e.g. 12.50 EUR, today's date, "Books"). See "Saved!" flash, and the form clears the amount/category but keeps date/currency.
4. Go to Summary for the current month — confirm the expense appears under "EUR" → "Books" with the correct total.
5. Go to Categories, add a new category (e.g. "Hobbies"), confirm it appears in the alphabetical list and immediately becomes selectable back on the Entry page.
6. Go to Conflicts — confirm "No conflicts."

- [ ] **Step 5: Conflict simulation walkthrough**

1. In one browser profile/tab, go offline (devtools Network tab → "Offline"), edit... actually PouchDB has no in-app edit UI for existing expenses (matches the original — expenses are only ever created, not edited, through the UI). Instead, simulate a conflict directly via devtools console on two separate browser profiles (or two incognito windows) both pointed at `http://localhost:8080`, each locally offline:

```js
const { Repo } = await import("/repo.js");
const repo = await new Repo();
// Run on profile A:
await repo.addDoc({ _id: "conflict-test", type: "category", name: "From A" });
// Run on profile B (before either has synced):
await repo.addDoc({ _id: "conflict-test", type: "category", name: "From B" });
```

2. Bring both profiles online and trigger sync on each (`await (await new Repo()).sync()`, or just wait up to 60s for the background worker).
3. Visit `/conflicts` on either profile. Expected: one conflict listed, showing `"From A"` and `"From B"` as radio options.
4. Choose one, click "Resolve with chosen version". Expected: the conflict disappears from the list, and `(await (await new Repo()).getDoc("conflict-test")).name` returns the chosen value on both profiles after their next sync.

- [ ] **Step 6: Run the standalone unit tests**

```bash
bun test/validation.test.js
bun test/summary.test.js
```

Expected: both print their `"all assertions passed"` line and exit 0.

- [ ] **Step 7: Tear down**

```bash
docker compose down
```

- [ ] **Step 8: Commit** (only if Steps 1–6 required any fixes to already-committed files)

```bash
git add -A
git commit -m "Fix issues found during end-to-end verification"
```

If no fixes were needed, skip this step — there's nothing new to commit.
