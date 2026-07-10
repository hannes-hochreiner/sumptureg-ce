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
