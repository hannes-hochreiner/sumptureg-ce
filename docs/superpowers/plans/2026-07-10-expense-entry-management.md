# Expense Entry Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/expenses` page where the user can view, edit, and delete individual expense entries, browsed month by month.

**Architecture:** A new `SumpturegExpenses` page holds month-navigation state and coordinates three new components: `expense-list` (renders the table and fires edit/delete events), `expense-edit` (a `<dialog>`-based edit modal), and `sumptureg-confirmation` (a generic confirm/cancel dialog for deletes). The page also needs a `deleteDoc` method added to `Repo`. No new pure-logic objects are introduced; all components follow the existing Web Component + Shadow DOM pattern.

**Tech Stack:** Vanilla Web Components (custom elements, Shadow DOM), PouchDB via `Repo`, native `<dialog>` element, ES modules, bun (test runner — available inside `nix develop`).

## Global Constraints

- No build step: all source is plain ES modules loaded directly by the browser.
- No test framework: tests use `node:assert` directly and are run with `bun <file>`.
- Tests only exist for pure functions in `objects/`; components are verified manually in the browser.
- Always call `triggerSync()` from `objects/sync.js` after any write (add, update, delete).
- All user-visible strings must be set via `textContent` or `escapeHtml()` — never via raw `innerHTML` interpolation of untrusted data.
- `Repo` is a singleton (constructor returns a Promise); always `await new Repo()`.
- Run all existing tests after every task: `bun test/validation.test.js && bun test/summary.test.js && bun test/config.test.js` (requires `nix develop`).

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `components/sumptureg-confirmation.js` | Generic confirm/cancel `<dialog>` |
| Create | `components/expense-edit.js` | Edit expense `<dialog>` modal |
| Create | `components/expense-list.js` | Month expense table with edit/delete buttons |
| Create | `pages/sumptureg-expenses.js` | Expenses page: month nav, repo calls, event wiring |
| Modify | `repo.js` | Add `deleteDoc(id, rev)` |
| Modify | `components/sumptureg-router.js` | Add `/expenses` route |
| Modify | `components/sumptureg-nav.js` | Add "Expenses" nav link |

---

### Task 1: Add `deleteDoc` to Repo

**Files:**
- Modify: `repo.js`

**Interfaces:**
- Produces: `repo.deleteDoc(id: string, rev: string): Promise<void>`

- [ ] **Step 1: Add the method**

In `repo.js`, after the `getDoc` method (around line 34), add:

```js
async deleteDoc(id, rev) {
  await this.#db.remove(id, rev);
}
```

The full updated method block in context (lines 30–40 approximately):

```js
  async addDoc(doc) {
    await this.#db.put(doc);
  }

  async getDoc(id) {
    return await this.#db.get(id);
  }

  async deleteDoc(id, rev) {
    await this.#db.remove(id, rev);
  }

  async getAllCategories() {
```

- [ ] **Step 2: Run existing tests**

```bash
bun test/validation.test.js && bun test/summary.test.js && bun test/config.test.js
```

Expected output:
```
validation.test.js: all assertions passed
summary.test.js: all assertions passed
config.test.js: all assertions passed
```

- [ ] **Step 3: Commit**

```bash
git add repo.js
git commit -m "feat: add deleteDoc to Repo"
```

---

### Task 2: Create `sumptureg-confirmation.js`

Generic confirm/cancel dialog. Port of `travel-confirmation.js` from the travel-manager project, adapted to sumptureg naming conventions.

**Files:**
- Create: `components/sumptureg-confirmation.js`

**Interfaces:**
- Produces: `SumpturegConfirmation` custom element `<sumptureg-confirmation>`
  - Named slots: `title`, `message`
  - Setter: `set confirm(cb: () => void)` — stores the callback and calls `showModal()`; on confirm click, closes dialog and calls `cb()`; on cancel, closes dialog

- [ ] **Step 1: Create the file**

```js
export class SumpturegConfirmation extends HTMLElement {
  #cb = null;

  constructor() {
    super();

    const shadowRoot = this.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = /*html*/ `
      <style>
        dialog { padding: 0; }
        div.content { display: flex; flex-direction: column; border: 1px solid; }
        header {
          background: linear-gradient(45deg, var(--tertiary-light), var(--tertiary));
          padding: 0.5rem;
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--tertiary-dark);
        }
        main { padding: 0.5rem; }
        footer { display: flex; flex-direction: row; justify-content: space-between; }
        .action { flex-grow: 1; }
      </style>
      <dialog id="dialog">
        <div class="content">
          <header><slot name="title"></slot></header>
          <main><slot name="message"></slot></main>
          <footer>
            <button id="btn-ok" class="action">
              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f"><path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/></svg>
            </button>
            <button id="btn-cancel" class="action">
              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
            </button>
          </footer>
        </div>
      </dialog>
    `;

    shadowRoot.querySelector("#btn-ok").addEventListener("click", () => {
      shadowRoot.querySelector("#dialog").close();
      this.#cb?.();
      this.#cb = null;
    });

    shadowRoot.querySelector("#btn-cancel").addEventListener("click", () => {
      shadowRoot.querySelector("#dialog").close();
      this.#cb = null;
    });
  }

  set confirm(cb) {
    this.#cb = cb;
    this.shadowRoot.querySelector("#dialog").showModal();
  }
}

customElements.define("sumptureg-confirmation", SumpturegConfirmation);
```

- [ ] **Step 2: Run existing tests**

```bash
bun test/validation.test.js && bun test/summary.test.js && bun test/config.test.js
```

Expected: all three lines ending in "all assertions passed".

- [ ] **Step 3: Commit**

```bash
git add components/sumptureg-confirmation.js
git commit -m "feat: add sumptureg-confirmation dialog component"
```

---

### Task 3: Create `expense-edit.js`

Edit modal for an existing expense. Opened via `editExpense(expense, categories, cb)`. Validates before saving. Preserves `_id`, `_rev`, and `type` from the original expense object so PouchDB treats the save as an update.

**Files:**
- Create: `components/expense-edit.js`

**Interfaces:**
- Consumes:
  - `validateAmount(input: string)` from `../objects/validation.js`
  - `validateCategorySelected(categoryId: string)` from `../objects/validation.js`
  - `escapeHtml(str: string)` from `../objects/utils.js`
- Produces: `ExpenseEdit` custom element `<expense-edit>`
  - Method: `editExpense(expense: object, categories: object[], cb: (updatedExpense: object) => void)`
    - `expense` has shape `{ _id, _rev, type, amount, currency, date, category_id }`
    - `categories` is the raw array from `repo.getAllCategories()` — each has `{ _id, name }`
    - `cb` is called with the updated expense object on save; not called on cancel

- [ ] **Step 1: Create the file**

```js
import { validateAmount, validateCategorySelected } from "../objects/validation.js";
import { escapeHtml } from "../objects/utils.js";

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "JPY"];

export class ExpenseEdit extends HTMLElement {
  #expense = null;
  #cb = null;

  constructor() {
    super();

    const shadowRoot = this.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = /*html*/ `
      <style>
        dialog { padding: 0; }
        div.content { display: flex; flex-direction: column; border: 1px solid; }
        header {
          background: linear-gradient(45deg, var(--primary-light), var(--primary));
          padding: 0.5rem;
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--primary-dark);
        }
        main { padding: 0.5rem; display: flex; flex-direction: column; gap: 0.75rem; }
        label { display: flex; flex-direction: column; gap: 0.25rem; font-weight: 700; }
        input, select { font: inherit; padding: 0.5rem; border: 1px solid var(--primary-dark); }
        footer { display: flex; flex-direction: row; justify-content: space-between; }
        .action { flex-grow: 1; }
        p.error { color: var(--tertiary-dark); margin: 0; }
      </style>
      <dialog id="dialog">
        <div class="content">
          <header>Edit Expense</header>
          <main>
            <p id="error" class="error" hidden></p>
            <label>Amount
              <input id="amount" type="number" step="0.01" min="0.01" />
            </label>
            <label>Currency
              <select id="currency">
                ${CURRENCIES.map((c) => `<option value="${c}">${c}</option>`).join("")}
              </select>
            </label>
            <label>Date
              <input id="date" type="date" />
            </label>
            <label>Category
              <select id="category"></select>
            </label>
          </main>
          <footer>
            <button id="btn-save" class="action">
              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f"><path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/></svg>
            </button>
            <button id="btn-cancel" class="action">
              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
            </button>
          </footer>
        </div>
      </dialog>
    `;

    shadowRoot.querySelector("#btn-save").addEventListener("click", () => this.#onSave());
    shadowRoot.querySelector("#btn-cancel").addEventListener("click", () => {
      shadowRoot.querySelector("#dialog").close();
    });
  }

  editExpense(expense, categories, cb) {
    this.#expense = expense;
    this.#cb = cb;
    this.#populate(categories);
    this.shadowRoot.querySelector("#dialog").showModal();
  }

  #populate(categories) {
    const sr = this.shadowRoot;
    sr.querySelector("#amount").value = this.#expense.amount;
    sr.querySelector("#currency").value = this.#expense.currency;
    sr.querySelector("#date").value = this.#expense.date;
    sr.querySelector("#error").hidden = true;

    const sorted = categories.slice().sort((a, b) => a.name.localeCompare(b.name));
    sr.querySelector("#category").innerHTML = [
      '<option value="">— select —</option>',
      ...sorted.map((cat) => `<option value="${escapeHtml(cat._id)}">${escapeHtml(cat.name)}</option>`),
    ].join("");
    sr.querySelector("#category").value = this.#expense.category_id;
  }

  #onSave() {
    const sr = this.shadowRoot;
    const errorEl = sr.querySelector("#error");

    const amountResult = validateAmount(sr.querySelector("#amount").value);
    if (!amountResult.valid) {
      errorEl.textContent = amountResult.error;
      errorEl.hidden = false;
      return;
    }

    const categoryResult = validateCategorySelected(sr.querySelector("#category").value);
    if (!categoryResult.valid) {
      errorEl.textContent = categoryResult.error;
      errorEl.hidden = false;
      return;
    }

    errorEl.hidden = true;

    const updated = {
      ...this.#expense,
      amount: amountResult.value,
      currency: sr.querySelector("#currency").value,
      date: sr.querySelector("#date").value,
      category_id: sr.querySelector("#category").value,
    };

    sr.querySelector("#dialog").close();
    this.#cb(updated);
    this.#expense = null;
    this.#cb = null;
  }
}

customElements.define("expense-edit", ExpenseEdit);
```

- [ ] **Step 2: Run existing tests**

```bash
bun test/validation.test.js && bun test/summary.test.js && bun test/config.test.js
```

Expected: all three lines ending in "all assertions passed".

- [ ] **Step 3: Commit**

```bash
git add components/expense-edit.js
git commit -m "feat: add expense-edit modal component"
```

---

### Task 4: Create `expense-list.js`

Renders a table of expenses for the current month. Each row has edit and delete icon buttons. Dispatches custom events for the page to handle.

**Files:**
- Create: `components/expense-list.js`

**Interfaces:**
- Consumes: `escapeHtml(str: string)` from `../objects/utils.js`
- Produces: `ExpenseList` custom element `<expense-list>`
  - Method: `setExpenses(expenses: object[], categoriesById: Map<string, string>): void`
    - `expenses` — array of expense docs from PouchDB (each has `_id`, `_rev`, `date`, `amount`, `currency`, `category_id`)
    - `categoriesById` — `Map<_id, name>` for display
  - Fires `expense-edit` custom event on edit button click — `event.detail` is the full expense object
  - Fires `expense-delete` custom event on delete button click — `event.detail` is the full expense object
  - Both events are `bubbles: true, composed: true`

- [ ] **Step 1: Create the file**

```js
import { escapeHtml } from "../objects/utils.js";

export class ExpenseList extends HTMLElement {
  #expenses = [];

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  setExpenses(expenses, categoriesById) {
    this.#expenses = expenses;

    if (expenses.length === 0) {
      this.shadowRoot.innerHTML = /*html*/ `
        <style>p.empty { color: var(--secondary-dark); margin: 1rem; }</style>
        <p class="empty">No expenses this month.</p>
      `;
      return;
    }

    const sorted = expenses.slice().sort((a, b) => b.date.localeCompare(a.date));

    this.shadowRoot.innerHTML = /*html*/ `
      <style>
        table { width: 100%; border-collapse: collapse; }
        td { padding: 0.25rem 0.5rem; }
        td.amount { text-align: right; }
        td.actions { white-space: nowrap; text-align: right; }
        button { background: none; border: none; cursor: pointer; padding: 0.25rem; }
        button svg { width: 20px; height: 20px; vertical-align: middle; }
      </style>
      <table>
        ${sorted.map((expense) => /*html*/ `
          <tr data-id="${escapeHtml(expense._id)}">
            <td>${escapeHtml(expense.date)}</td>
            <td>${escapeHtml(categoriesById.get(expense.category_id) ?? expense.category_id)}</td>
            <td class="amount">${expense.amount.toFixed(2)} ${escapeHtml(expense.currency)}</td>
            <td class="actions">
              <button class="btn-edit" title="Edit">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="#1f1f1f"><path d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z"/></svg>
              </button>
              <button class="btn-delete" title="Delete">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="#1f1f1f"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/></svg>
              </button>
            </td>
          </tr>
        `).join("")}
      </table>
    `;

    this.shadowRoot.querySelectorAll(".btn-edit").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.closest("tr").dataset.id;
        const expense = this.#expenses.find((e) => e._id === id);
        this.dispatchEvent(new CustomEvent("expense-edit", { detail: expense, bubbles: true, composed: true }));
      });
    });

    this.shadowRoot.querySelectorAll(".btn-delete").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.closest("tr").dataset.id;
        const expense = this.#expenses.find((e) => e._id === id);
        this.dispatchEvent(new CustomEvent("expense-delete", { detail: expense, bubbles: true, composed: true }));
      });
    });
  }
}

customElements.define("expense-list", ExpenseList);
```

- [ ] **Step 2: Run existing tests**

```bash
bun test/validation.test.js && bun test/summary.test.js && bun test/config.test.js
```

Expected: all three lines ending in "all assertions passed".

- [ ] **Step 3: Commit**

```bash
git add components/expense-list.js
git commit -m "feat: add expense-list component"
```

---

### Task 5: Create `sumptureg-expenses.js` page

The page shell. Manages year/month state, loads data from Repo, and coordinates the list, edit modal, and confirmation dialog.

**Files:**
- Create: `pages/sumptureg-expenses.js`

**Interfaces:**
- Consumes:
  - `repo.getExpensesForMonth(year: number, month: number): Promise<object[]>`
  - `repo.getAllCategories(): Promise<object[]>`
  - `repo.addDoc(doc: object): Promise<void>` — used for updates (doc must include `_rev`)
  - `repo.deleteDoc(id: string, rev: string): Promise<void>` — from Task 1
  - `expenseList.setExpenses(expenses, categoriesById)` — from Task 4
  - `expenseEdit.editExpense(expense, categories, cb)` — from Task 3
  - `confirmation.confirm = cb` — from Task 2
  - `triggerSync()` from `../objects/sync.js`
  - Custom events: `expense-edit` and `expense-delete` from `expense-list`

- [ ] **Step 1: Create the file**

```js
import "../components/sumptureg-header.js";
import "../components/sumptureg-nav.js";
import "../components/expense-list.js";
import "../components/expense-edit.js";
import "../components/sumptureg-confirmation.js";
import { Repo } from "../repo.js";
import { triggerSync } from "../objects/sync.js";

export class SumpturegExpenses extends HTMLElement {
  #year;
  #month;
  #categories = [];

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
      </style>
      <sumptureg-header></sumptureg-header>
      <sumptureg-nav></sumptureg-nav>
      <div class="month-nav">
        <button id="prev">◀</button>
        <h2 id="label"></h2>
        <button id="next">▶</button>
      </div>
      <main>
        <expense-list id="list"></expense-list>
      </main>
      <expense-edit id="edit"></expense-edit>
      <sumptureg-confirmation id="confirm">
        <span slot="title">Delete Expense</span>
        <span slot="message">Delete this expense?</span>
      </sumptureg-confirmation>
    `;

    shadowRoot.querySelector("#prev").addEventListener("click", () => this.#shiftMonth(-1));
    shadowRoot.querySelector("#next").addEventListener("click", () => this.#shiftMonth(1));
    shadowRoot.querySelector("#list").addEventListener("expense-edit", (e) => this.#onEdit(e.detail));
    shadowRoot.querySelector("#list").addEventListener("expense-delete", (e) => this.#onDelete(e.detail));
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

    this.#categories = categories;
    const categoriesById = new Map(categories.map((c) => [c._id, c.name]));
    this.shadowRoot.querySelector("#list").setExpenses(expenses, categoriesById);
  }

  #onEdit(expense) {
    this.shadowRoot.querySelector("#edit").editExpense(expense, this.#categories, async (updated) => {
      const repo = await new Repo();
      await repo.addDoc(updated);
      triggerSync();
      await this.#render();
    });
  }

  #onDelete(expense) {
    this.shadowRoot.querySelector("#confirm").confirm = async () => {
      const repo = await new Repo();
      await repo.deleteDoc(expense._id, expense._rev);
      triggerSync();
      await this.#render();
    };
  }
}

customElements.define("sumptureg-expenses", SumpturegExpenses);
```

- [ ] **Step 2: Run existing tests**

```bash
bun test/validation.test.js && bun test/summary.test.js && bun test/config.test.js
```

Expected: all three lines ending in "all assertions passed".

- [ ] **Step 3: Commit**

```bash
git add pages/sumptureg-expenses.js
git commit -m "feat: add sumptureg-expenses page"
```

---

### Task 6: Wire router and nav

Add the `/expenses` route and the "Expenses" nav link. This task makes the page reachable in the running app.

**Files:**
- Modify: `components/sumptureg-router.js`
- Modify: `components/sumptureg-nav.js`

**Interfaces:**
- Consumes: `SumpturegExpenses` from `../pages/sumptureg-expenses.js`

- [ ] **Step 1: Add the route to `sumptureg-router.js`**

Add the import at the top with the other page imports:

```js
import { SumpturegExpenses } from "../pages/sumptureg-expenses.js";
```

Add the route entry in the `#routes` array, before the `/summary` entry:

```js
#routes = [
  { route: /^\/config$/, class: SumpturegConfig },
  { route: /^\/expenses$/, class: SumpturegExpenses },
  { route: /^\/summary$/, class: SumpturegSummary },
  { route: /^\/categories$/, class: SumpturegCategories },
  { route: /^\/conflicts$/, class: SumpturegConflicts },
  { route: /[\s\S]*/, class: SumpturegEntry },
];
```

- [ ] **Step 2: Add the nav link to `sumptureg-nav.js`**

In the `shadowRoot.innerHTML` template, add the "Expenses" link between "Entry" and "Summary":

```html
<nav>
  <a href="/">Entry</a>
  <a href="/expenses">Expenses</a>
  <a href="/summary">Summary</a>
  <a href="/categories">Categories</a>
  <a href="/conflicts">Conflicts<span id="badge"></span></a>
</nav>
```

- [ ] **Step 3: Run existing tests**

```bash
bun test/validation.test.js && bun test/summary.test.js && bun test/config.test.js
```

Expected: all three lines ending in "all assertions passed".

- [ ] **Step 4: Verify in the browser**

Start the dev server (`nu -c "use mod.nu; start"` or `docker compose up -d`), open the app, and verify:

1. "Expenses" link appears in the nav between "Entry" and "Summary"
2. Clicking "Expenses" navigates to `/expenses`
3. The month label shows the current year-month; ◀/▶ buttons shift the month correctly
4. Expenses for the selected month are listed with date, category, amount/currency
5. Clicking the edit (pencil) button opens the `<dialog>` with the expense pre-populated
6. Changing a field and clicking ✓ saves and the list updates; clicking ✗ closes without saving
7. Invalid save attempts (empty amount, no category) show the validation error message
8. Clicking the delete (trash) button opens the confirm dialog; clicking ✓ removes the expense and re-renders; clicking ✗ does nothing
9. Empty month shows "No expenses this month."

- [ ] **Step 5: Commit**

```bash
git add components/sumptureg-router.js components/sumptureg-nav.js
git commit -m "feat: wire /expenses route and nav link"
```
