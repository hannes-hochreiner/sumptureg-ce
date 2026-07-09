import { Category } from "../objects/category.js";
import { validateCategoryName } from "../objects/validation.js";
import { Repo } from "../repo.js";
import { triggerSync } from "../objects/sync.js";

export class CategoryForm extends HTMLElement {
  constructor() {
    super();

    const shadowRoot = this.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = /*html*/ `
      <style>
        form { display: flex; flex-direction: row; gap: 0.5rem; margin: 1rem; max-width: 24rem; }
        input { flex: 1; font: inherit; padding: 0.5rem; border: 1px solid var(--secondary-dark); }
        button {
          background: linear-gradient(45deg, var(--secondary-light), var(--secondary));
          color: var(--secondary-dark);
          border: none;
          padding: 0.5rem 1rem;
          font-weight: 700;
          cursor: pointer;
        }
        p.error { color: var(--tertiary-dark); margin: 0 1rem; }
      </style>
      <p id="error" class="error" hidden></p>
      <form id="form" novalidate>
        <input id="name" type="text" placeholder="Category name" required />
        <button type="submit">Save</button>
      </form>
    `;

    shadowRoot.querySelector("#form").addEventListener("submit", (event) => this.#onSubmit(event));
  }

  async #onSubmit(event) {
    event.preventDefault();

    const errorEl = this.shadowRoot.querySelector("#error");
    const nameInput = this.shadowRoot.querySelector("#name");

    const result = validateCategoryName(nameInput.value);
    if (!result.valid) {
      errorEl.textContent = result.error;
      errorEl.hidden = false;
      return;
    }

    errorEl.hidden = true;

    const category = { ...Category.default(), name: result.value };
    const repo = await new Repo();
    await repo.addDoc(category);
    triggerSync();

    nameInput.value = "";
    this.dispatchEvent(new CustomEvent("category-added", { bubbles: true, composed: true }));
  }
}

customElements.define("category-form", CategoryForm);
