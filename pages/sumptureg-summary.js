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
