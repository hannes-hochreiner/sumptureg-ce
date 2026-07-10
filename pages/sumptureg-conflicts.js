import "../components/sumptureg-nav.js";
import "../components/conflict-item.js";
import { Repo } from "../repo.js";

export class SumpturegConflicts extends HTMLElement {
  constructor() {
    super();

    const shadowRoot = this.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = /*html*/ `
      <style>
        h1 { margin: 1rem; color: var(--tertiary-dark); }
        p.empty { margin: 1rem; color: var(--secondary-dark); }
      </style>
      <sumptureg-nav></sumptureg-nav>
      <h1>Conflicts</h1>
      <div id="list"></div>
    `;

    shadowRoot.addEventListener("conflict-resolved", () => this.#load());
  }

  async connectedCallback() {
    await this.#load();
  }

  async #load() {
    const repo = await new Repo();
    const conflicts = await repo.getConflictedDocs();
    const list = this.shadowRoot.querySelector("#list");

    if (conflicts.length === 0) {
      list.innerHTML = `<p class="empty">No conflicts.</p>`;
      return;
    }

    list.innerHTML = "";
    for (const conflict of conflicts) {
      const item = document.createElement("conflict-item");
      item.conflict = conflict;
      list.appendChild(item);
    }
  }
}

customElements.define("sumptureg-conflicts", SumpturegConflicts);
