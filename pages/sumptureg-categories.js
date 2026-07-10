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
