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
