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
