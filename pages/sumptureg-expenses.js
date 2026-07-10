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
