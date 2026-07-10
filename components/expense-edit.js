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
