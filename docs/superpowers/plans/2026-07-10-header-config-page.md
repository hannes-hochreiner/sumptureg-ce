# Header and Configuration Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent app header and a `/config` page with a Synchronization section (notify-on-auto-sync toggle + manual sync button) to sumptureg-ce, adapted from the travel-manager project.

**Architecture:** A new `sumptureg-header` web component wraps `sumptureg-notification` and is embedded in every page; a new `sumptureg-config` page stores/retrieves a config doc in PouchDB and controls whether auto-sync triggers toast notifications. Each piece is a self-contained custom element following the existing patterns in this repo.

**Tech Stack:** Vanilla JS custom elements (Shadow DOM), PouchDB (via CDN ESM), BroadcastChannel API, Node.js `assert` for unit tests.

## Global Constraints

- No build step — all files are plain ES modules loaded directly by the browser.
- CDN imports must use the `+esm` variant already established in `repo.js` (`https://cdn.jsdelivr.net/npm/pouchdb/+esm`).
- Follow the custom element pattern: define shadow root in `constructor()`, put async work in `connectedCallback()`, call `customElements.define()` at the bottom of each component file.
- CSS uses existing CSS variables: `--primary`, `--primary-light`, `--primary-dark`, `--secondary`, `--secondary-light`, `--secondary-dark`, `--tertiary`, `--tertiary-light`, `--tertiary-dark`, `--background`.
- Tests use Node.js `node:assert` module, run via `node test/<file>.js`. No test runner installed.
- All commits use imperative subject lines.

---

## File Map

| Status | Path | Responsibility |
|--------|------|----------------|
| Create | `objects/config.js` | `Config.default()` factory |
| Create | `test/config.test.js` | Unit test for `Config.default()` |
| Modify | `repo.js` | Add `getConfig()`, `setConfig()`, `getInfo()`, `setInfo()` |
| Create | `components/sumptureg-notification.js` | Toast notification component via `"notification"` BroadcastChannel |
| Create | `components/sumptureg-header.js` | App header with title + config link; embeds `sumptureg-notification` |
| Modify | `pages/sumptureg-entry.js` | Add `<sumptureg-header>` |
| Modify | `pages/sumptureg-summary.js` | Add `<sumptureg-header>` |
| Modify | `pages/sumptureg-categories.js` | Add `<sumptureg-header>` |
| Modify | `pages/sumptureg-conflicts.js` | Add `<sumptureg-header>` |
| Create | `pages/sumptureg-config.js` | Config page with Synchronization section |
| Modify | `components/sumptureg-router.js` | Add `/config` route |
| Modify | `objects/sync.js` | Post to `"notification"` channel when `notifyOnAutoSync` is true |

---

## Task 1: Config object

**Files:**
- Create: `objects/config.js`
- Create: `test/config.test.js`

**Interfaces:**
- Produces: `Config.default()` → `{ _id: "config", notifyOnAutoSync: false }`

- [ ] **Step 1: Write the failing test**

Create `test/config.test.js`:

```js
import assert from "node:assert";
import { Config } from "../objects/config.js";

const cfg = Config.default();
assert.strictEqual(cfg._id, "config");
assert.strictEqual(cfg.notifyOnAutoSync, false);

console.log("config.test.js: all assertions passed");
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node test/config.test.js
```

Expected: error — `Cannot find module '../objects/config.js'`

- [ ] **Step 3: Write implementation**

Create `objects/config.js`:

```js
export class Config {
  static default() {
    return {
      _id: "config",
      notifyOnAutoSync: false,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node test/config.test.js
```

Expected output: `config.test.js: all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add objects/config.js test/config.test.js
git commit -m "feat: add Config object with notifyOnAutoSync default"
```

---

## Task 2: Repo config and info methods

**Files:**
- Modify: `repo.js` (add 4 methods after `resolveConflict`)

**Interfaces:**
- Consumes: existing `this.#db` (PouchDB instance) from `repo.js`
- Produces:
  - `repo.getConfig()` → `Promise<{ _id: "config", notifyOnAutoSync: boolean, _rev: string }>`
  - `repo.setConfig(config)` → `Promise<void>`
  - `repo.getInfo()` → `Promise<{ _id: "info", lastSync: string|null, _rev: string }>`
  - `repo.setInfo(info)` → `Promise<void>`

Note: `getConfig()` and `getInfo()` throw a PouchDB `404` error if the doc does not exist yet — callers must catch and supply a default (see Tasks 5 and 6).

- [ ] **Step 1: Add the four methods to `repo.js`**

Open `repo.js`. After the closing brace of `resolveConflict` (currently the last method, ending around line 84), add:

```js
  async getConfig() {
    return await this.#db.get("config");
  }

  async setConfig(config) {
    await this.#db.put(config);
  }

  async getInfo() {
    return await this.#db.get("info");
  }

  async setInfo(info) {
    await this.#db.put(info);
  }
```

The complete bottom of `repo.js` should now look like:

```js
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

  async getConfig() {
    return await this.#db.get("config");
  }

  async setConfig(config) {
    await this.#db.put(config);
  }

  async getInfo() {
    return await this.#db.get("info");
  }

  async setInfo(info) {
    await this.#db.put(info);
  }
}
```

- [ ] **Step 2: Manual verification**

Open the browser dev console on the running app and run:

```js
const { Repo } = await import("/repo.js");
const repo = await new Repo();
// Should not throw — methods exist:
console.log(typeof repo.getConfig);   // "function"
console.log(typeof repo.setConfig);   // "function"
console.log(typeof repo.getInfo);     // "function"
console.log(typeof repo.setInfo);     // "function"
// Confirm 404 on empty DB:
try { await repo.getConfig(); } catch (e) { console.log(e.status); } // 404
```

- [ ] **Step 3: Commit**

```bash
git add repo.js
git commit -m "feat: add getConfig, setConfig, getInfo, setInfo to Repo"
```

---

## Task 3: Notification component

**Files:**
- Create: `components/sumptureg-notification.js`

**Interfaces:**
- Consumes: `BroadcastChannel("notification")` messages of shape `{ title: string, message: string, type: "info"|"error" }`
- Produces: custom element `<sumptureg-notification>` — a fixed-position toast at bottom-center of the viewport. Info toasts auto-dismiss after 2 s; error toasts stay until the user clicks ✕.

- [ ] **Step 1: Create the file**

```js
export class SumpturegNotification extends HTMLElement {
  #notifications = [];
  #timeout = null;

  constructor() {
    super();

    const shadowRoot = this.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = /*html*/ `
      <style>
        #content {
          display: flex;
          flex-direction: column;
          border: 1px solid;
          background-color: var(--secondary-light);
          color: var(--secondary-dark);
          border-radius: 15px;
          position: fixed;
          bottom: 1rem;
          left: 50%;
          transform: translateX(-50%);
          z-index: 9999;
          transition: all 0.5s ease-in-out;
        }
        #content.hidden {
          transform: translate(-50%, 150%);
        }
        #content.error {
          background-color: var(--tertiary-light);
          color: var(--tertiary-dark);
        }
        header {
          background: linear-gradient(45deg, var(--secondary), var(--secondary-light));
          padding: 0.5rem;
          font-size: 1.2rem;
          font-weight: 700;
          border-radius: 15px 15px 0 0;
          display: flex;
          flex-direction: row;
          justify-content: space-between;
        }
        #content.error header {
          background: linear-gradient(45deg, var(--tertiary), var(--tertiary-light));
          color: var(--tertiary-dark);
        }
        #content.error main {
          background-color: var(--tertiary-light);
          color: var(--tertiary-dark);
          border-radius: 0 0 15px 15px;
        }
        button.action {
          background: none;
          border: none;
          cursor: pointer;
        }
        main {
          padding: 0.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
      </style>
      <div id="content" class="hidden">
        <header>
          <div id="title"></div>
          <button id="button_close" class="action">
            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
          </button>
        </header>
        <main>
          <div id="message"></div>
        </main>
      </div>
    `;

    this.shadowRoot.querySelector("#button_close")
      .addEventListener("click", () => this.#showNext());

    const bc = new BroadcastChannel("notification");
    bc.onmessage = (event) => {
      this.#notifications.push(event.data);
      if (this.shadowRoot.querySelector("#content").classList.contains("hidden")) {
        this.#showNext();
      }
    };
  }

  #showNext() {
    this.shadowRoot.querySelector("#content").classList.add("hidden");
    if (this.#timeout) {
      clearTimeout(this.#timeout);
      this.#timeout = null;
    }
    if (this.#notifications.length > 0) {
      const notification = this.#notifications.shift();
      this.shadowRoot.querySelector("#title").innerHTML = notification.title;
      this.shadowRoot.querySelector("#message").innerHTML = notification.message;
      const content = this.shadowRoot.querySelector("#content");
      if (notification.type === "error") {
        content.classList.add("error");
      } else {
        content.classList.remove("error");
        this.#timeout = setTimeout(() => this.#showNext(), 2000);
      }
      content.classList.remove("hidden");
    }
  }
}

customElements.define("sumptureg-notification", SumpturegNotification);
```

- [ ] **Step 2: Manual verification (deferred — will be visible once the header is wired in Task 4)**

After Task 4 is done, open the app, open the browser console and run:

```js
const bc = new BroadcastChannel("notification");
bc.postMessage({ title: "Test", message: "Hello from console", type: "info" });
```

Expected: a green toast appears at the bottom of the screen and auto-dismisses after 2 s.

Then:

```js
bc.postMessage({ title: "Error", message: "Something went wrong", type: "error" });
```

Expected: a pink/red toast appears and stays until clicked ✕.

- [ ] **Step 3: Commit**

```bash
git add components/sumptureg-notification.js
git commit -m "feat: add sumptureg-notification toast component"
```

---

## Task 4: Header component and wire into all pages

**Files:**
- Create: `components/sumptureg-header.js`
- Modify: `pages/sumptureg-entry.js`
- Modify: `pages/sumptureg-summary.js`
- Modify: `pages/sumptureg-categories.js`
- Modify: `pages/sumptureg-conflicts.js`

**Interfaces:**
- Consumes: `components/sumptureg-notification.js` (imported, auto-registered)
- Produces: custom element `<sumptureg-header>` — gradient header bar with "Sumptureg" title (links to `/`) and a ⚙ gear icon (links to `/config`). Embeds `<sumptureg-notification>` so all host pages get toasts without separate wiring.

- [ ] **Step 1: Create `components/sumptureg-header.js`**

```js
import "./sumptureg-notification.js";

export class SumpturegHeader extends HTMLElement {
  constructor() {
    super();

    const shadowRoot = this.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = /*html*/ `
      <style>
        header {
          background: linear-gradient(45deg, var(--primary-light), var(--primary));
          display: flex;
          flex-direction: row;
          justify-content: space-between;
          align-items: center;
          padding: 0 1rem;
          color: var(--primary-dark);
        }
        a {
          text-decoration: none;
          color: var(--primary-dark);
        }
        a:hover {
          opacity: 0.8;
        }
        h1 {
          margin: 0.5rem 0;
        }
        #config-link {
          font-size: 1.5rem;
          padding: 0.25rem;
        }
      </style>
      <header>
        <a href="/"><h1>Sumptureg</h1></a>
        <a href="/config" id="config-link">⚙</a>
      </header>
      <sumptureg-notification></sumptureg-notification>
    `;
  }
}

customElements.define("sumptureg-header", SumpturegHeader);
```

- [ ] **Step 2: Update `pages/sumptureg-entry.js`**

Add the import at the top and `<sumptureg-header>` as the first element:

```js
import "../components/sumptureg-header.js";
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
      <sumptureg-header></sumptureg-header>
      <sumptureg-nav></sumptureg-nav>
      <h1>Log Expense</h1>
      <expense-form></expense-form>
      <p><a href="/categories">+ New category</a></p>
    `;
  }
}

customElements.define("sumptureg-entry", SumpturegEntry);
```

- [ ] **Step 3: Update `pages/sumptureg-summary.js`**

Add import and `<sumptureg-header>` as the first element in the shadow root template. The existing file starts:

```js
import "../components/sumptureg-nav.js";
```

Change the top imports and the shadow root HTML:

```js
import "../components/sumptureg-header.js";
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
      <sumptureg-header></sumptureg-header>
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

- [ ] **Step 4: Update `pages/sumptureg-categories.js`**

Replace the entire file:

```js
import "../components/sumptureg-header.js";
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
      <sumptureg-header></sumptureg-header>
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

- [ ] **Step 5: Update `pages/sumptureg-conflicts.js`**

Replace the entire file:

```js
import "../components/sumptureg-header.js";
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
      <sumptureg-header></sumptureg-header>
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

- [ ] **Step 6: Manual verification**

Navigate to `http://localhost` (or wherever the app is served). Verify:
- A gradient header bar appears at the top of every page showing "Sumptureg" on the left and a ⚙ gear on the right
- Clicking "Sumptureg" navigates to `/`
- Clicking ⚙ navigates to `/config` (will show a blank page until Task 5)
- The notification toast test from Task 3 Step 2 now works

- [ ] **Step 7: Commit**

```bash
git add components/sumptureg-header.js pages/sumptureg-entry.js pages/sumptureg-summary.js pages/sumptureg-categories.js pages/sumptureg-conflicts.js
git commit -m "feat: add sumptureg-header and wire into all pages"
```

---

## Task 5: Config page and router route

**Files:**
- Create: `pages/sumptureg-config.js`
- Modify: `components/sumptureg-router.js`

**Interfaces:**
- Consumes:
  - `components/sumptureg-header.js` — `<sumptureg-header>`
  - `repo.getConfig()` → `Promise<{ _id, notifyOnAutoSync, _rev }>` (throws 404 if absent)
  - `repo.setConfig(config)` → `Promise<void>`
  - `repo.getInfo()` → `Promise<{ _id, lastSync, _rev }>` (throws 404 if absent)
  - `repo.setInfo(info)` → `Promise<void>`
  - `Config.default()` → `{ _id: "config", notifyOnAutoSync: false }`
  - `BroadcastChannel("notification")` for posting success/error toasts
- Produces:
  - Custom element `<sumptureg-config>` rendered at route `/config`
  - Public methods: `toggleNotifyOnAutoSync()`, `sync()` (called from inline `onclick` handlers)

- [ ] **Step 1: Create `pages/sumptureg-config.js`**

```js
import "../components/sumptureg-header.js";
import { Repo } from "../repo.js";
import { Config } from "../objects/config.js";

export class SumpturegConfig extends HTMLElement {
  #bc = null;
  #config = null;
  #info = null;

  constructor() {
    super();
    this.#bc = new BroadcastChannel("notification");
  }

  async connectedCallback() {
    const shadowRoot = this.attachShadow({ mode: "open" });
    const repo = await new Repo();

    try {
      this.#config = await repo.getConfig();
    } catch {
      this.#config = Config.default();
    }

    try {
      this.#info = await repo.getInfo();
    } catch {
      this.#info = { _id: "info", lastSync: null };
    }

    shadowRoot.innerHTML = /*html*/ `
      <style>
        div.content {
          display: flex;
          flex-direction: column;
        }
        main {
          margin: 1rem;
          display: grid;
          gap: 1rem;
          grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
        }
        .breadcrumb {
          background: linear-gradient(45deg, var(--secondary), var(--secondary-light));
          display: flex;
          flex-direction: row;
          justify-content: space-between;
          align-items: baseline;
          padding: 0 1rem;
          color: var(--secondary-dark);
        }
        .breadcrumb h2 {
          margin: 0.5rem 0;
        }
        article header {
          font-weight: 700;
          font-size: 1.2rem;
        }
        button {
          display: flex;
          flex-direction: row;
          justify-content: center;
          align-items: center;
          cursor: pointer;
          padding: 0.5rem;
          gap: 0.5rem;
        }
      </style>
      <div class="content">
        <sumptureg-header></sumptureg-header>
        <div class="breadcrumb">
          <h2>Configuration</h2>
        </div>
        <main>
          <article id="synchronization">
            ${this.#renderSynchronization()}
          </article>
        </main>
      </div>
    `;
  }

  #renderSynchronization() {
    return /*html*/ `
      <header>Synchronization</header>
      <main>
        Last synchronization: ${this.#formatDate(this.#info.lastSync)}
        <button onclick="this.getRootNode().host.toggleNotifyOnAutoSync()">
          ${this.#config.notifyOnAutoSync
            ? '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f"><path d="M80-560q0-100 44.5-183.5T244-882l47 64q-60 44-95.5 111T160-560H80Zm720 0q0-80-35.5-147T669-818l47-64q75 55 119.5 138.5T880-560h-80ZM160-200v-80h80v-280q0-83 50-147.5T420-792v-28q0-25 17.5-42.5T480-880q25 0 42.5 17.5T540-820v28q80 20 130 84.5T720-560v280h80v80H160Zm320-300Zm0 420q-33 0-56.5-23.5T400-160h160q0 33-23.5 56.5T480-80ZM320-280h320v-280q0-66-47-113t-113-47q-66 0-113 47t-47 113v280Z"/></svg> synchronization notifications on'
            : '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f"><path d="M160-200v-80h80v-280q0-33 8.5-65t25.5-61l60 60q-7 16-10.5 32.5T320-560v280h248L56-792l56-56 736 736-56 56-146-144H160Zm560-154-80-80v-126q0-66-47-113t-113-47q-26 0-50 8t-44 24l-58-58q20-16 43-28t49-18v-28q0-25 17.5-42.5T480-880q25 0 42.5 17.5T540-820v28q80 20 130 84.5T720-560v206Zm-276-50Zm36 324q-33 0-56.5-23.5T400-160h160q0 33-23.5 56.5T480-80Zm33-481Z"/></svg> synchronization notifications off'
          }
        </button>
        <button onclick="this.getRootNode().host.sync()">
          <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f"><path d="M160-160v-80h110l-16-14q-52-46-73-105t-21-119q0-111 66.5-197.5T400-790v84q-72 26-116 88.5T240-478q0 45 17 87.5t53 78.5l10 10v-98h80v240H160Zm400-10v-84q72-26 116-88.5T720-482q0-45-17-87.5T650-648l-10-10v98h-80v-240h240v80H690l16 14q49 49 71.5 106.5T800-482q0 111-66.5 197.5T560-170Z"/></svg> synchronize
        </button>
      </main>
    `;
  }

  async toggleNotifyOnAutoSync() {
    try {
      const repo = await new Repo();
      const fresh = await repo.getConfig();
      fresh.notifyOnAutoSync = !fresh.notifyOnAutoSync;
      await repo.setConfig(fresh);
      this.#config = await repo.getConfig();
      this.shadowRoot.querySelector("#synchronization").innerHTML = this.#renderSynchronization();
      this.#bc.postMessage({
        title: "Notification",
        message: this.#config.notifyOnAutoSync
          ? "Automatic synchronization notification enabled"
          : "Automatic synchronization notification disabled",
        type: "info",
      });
    } catch (error) {
      console.error(error);
      this.#bc.postMessage({ title: "Notification Error", message: error.message, type: "error" });
    }
  }

  async sync() {
    try {
      const repo = await new Repo();
      await repo.sync();

      let info;
      try {
        info = await repo.getInfo();
      } catch {
        info = { _id: "info", lastSync: null };
      }
      info.lastSync = new Date();
      await repo.setInfo(info);
      this.#info = await repo.getInfo();
      this.shadowRoot.querySelector("#synchronization").innerHTML = this.#renderSynchronization();
      this.#bc.postMessage({ title: "Sync", message: "Synchronization successful", type: "info" });
    } catch (err) {
      console.error(err);
      this.#bc.postMessage({ title: "Sync Error", message: err.message, type: "error" });
    }
  }

  #formatDate(date) {
    if (!date) return "unknown";
    date = new Date(date);
    return `${date.getFullYear()}-${this.#pad(date.getMonth() + 1)}-${this.#pad(date.getDate())} ${this.#pad(date.getHours())}:${this.#pad(date.getMinutes())}`;
  }

  #pad(num) {
    return String(num).padStart(2, "0");
  }
}

customElements.define("sumptureg-config", SumpturegConfig);
```

- [ ] **Step 2: Update `components/sumptureg-router.js`**

Add the `/config` route and its import. The complete updated file:

```js
import { SumpturegEntry } from "../pages/sumptureg-entry.js";
import { SumpturegSummary } from "../pages/sumptureg-summary.js";
import { SumpturegCategories } from "../pages/sumptureg-categories.js";
import { SumpturegConflicts } from "../pages/sumptureg-conflicts.js";
import { SumpturegConfig } from "../pages/sumptureg-config.js";

export class SumpturegRouter extends HTMLElement {
  #slotContent = null;
  #routes = [
    { route: /^\/config$/, class: SumpturegConfig },
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

- [ ] **Step 3: Manual verification**

Navigate to `/config`. Verify:
- The header appears with "Sumptureg" and ⚙
- A green "Configuration" breadcrumb bar appears below the header
- The Synchronization article is visible with "Last synchronization: unknown"
- The notify toggle button is present (bell icon with "off")
- The synchronize button is present

Click the notify toggle: a toast should appear saying "Automatic synchronization notification enabled", and the button should switch to the "on" icon.

Click the synchronize button: a "Synchronization successful" toast should appear (or a sync error if the backend is unavailable), and "Last synchronization" should update to the current time.

Click ⚙ from another page to confirm navigation works.

- [ ] **Step 4: Commit**

```bash
git add pages/sumptureg-config.js components/sumptureg-router.js
git commit -m "feat: add config page with synchronization section and /config route"
```

---

## Task 6: Conditional notifications on auto-sync

**Files:**
- Modify: `objects/sync.js`

**Interfaces:**
- Consumes:
  - `Repo` from `repo.js` — `new Repo()`, `repo.getConfig()`
  - `Config.default()` from `objects/config.js`
  - `BroadcastChannel("sync-status")` — existing channel, unchanged
  - `BroadcastChannel("notification")` — new: conditionally post here
- Produces: `triggerSync()` — unchanged signature; now additionally posts to `"notification"` if `config.notifyOnAutoSync` is true

- [ ] **Step 1: Update `objects/sync.js`**

Replace the entire file:

```js
import { Repo } from "../repo.js";
import { Config } from "./config.js";

const channel = new BroadcastChannel("sync-status");

export async function triggerSync() {
  channel.postMessage({ type: "syncing" });

  try {
    const repo = await new Repo();

    let config;
    try {
      config = await repo.getConfig();
    } catch {
      config = Config.default();
    }

    try {
      await repo.sync();
      channel.postMessage({ type: "synced" });
      if (config.notifyOnAutoSync) {
        const nc = new BroadcastChannel("notification");
        nc.postMessage({ title: "Sync", message: "Synchronization successful", type: "info" });
        nc.close();
      }
    } catch (error) {
      channel.postMessage({ type: "error", message: error.message });
      if (config.notifyOnAutoSync) {
        const nc = new BroadcastChannel("notification");
        nc.postMessage({ title: "Sync Error", message: error.message, type: "error" });
        nc.close();
      }
    }
  } catch (error) {
    channel.postMessage({ type: "error", message: error.message });
  }
}
```

- [ ] **Step 2: Manual verification**

1. Go to `/config` and enable "synchronization notifications on".
2. Navigate to `/` (the entry page).
3. Wait up to 60 seconds for the worker to trigger an auto-sync (or go online/offline to trigger `triggerSync()` from `index.html`).
4. A toast notification should appear: "Sync" / "Synchronization successful" (or a sync error toast if no backend).
5. Go back to `/config` and disable notifications. Repeat step 3 — no toast should appear.

- [ ] **Step 3: Commit**

```bash
git add objects/sync.js
git commit -m "feat: post notification on auto-sync when notifyOnAutoSync is enabled"
```
