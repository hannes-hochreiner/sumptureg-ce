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
