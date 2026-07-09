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
