import { escapeHtml } from "../objects/utils.js";
import { Repo } from "../repo.js";

function describeVersion(type, doc) {
  if (doc._deleted) {
    return "(deleted)";
  }
  if (type === "expense") {
    return `${escapeHtml(String(doc.amount))} ${escapeHtml(doc.currency)} — ${escapeHtml(doc.date)} — ${escapeHtml(doc.category_id)}`;
  }
  return `"${escapeHtml(doc.name)}"`;
}

export class ConflictItem extends HTMLElement {
  #conflict = null;
  #chosenIndex = 0;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  set conflict(conflict) {
    this.#conflict = conflict;
    this.#chosenIndex = 0;
    this.#render();
  }

  #render() {
    const { id, type, versions } = this.#conflict;

    this.shadowRoot.innerHTML = /*html*/ `
      <style>
        div.item { border: 1px solid var(--tertiary-dark); margin: 1rem; padding: 1rem; }
        h3 { color: var(--tertiary-dark); margin-top: 0; }
        label { display: block; margin: 0.25rem 0; }
        button {
          background: linear-gradient(45deg, var(--tertiary-light), var(--tertiary));
          color: var(--tertiary-dark);
          border: none;
          padding: 0.5rem 1rem;
          font-weight: 700;
          cursor: pointer;
        }
      </style>
      <div class="item">
        <h3>${type === "expense" ? "Expense" : "Category"} conflict (${escapeHtml(id)})</h3>
        ${versions.map((version, index) => /*html*/ `
          <label>
            <input type="radio" name="${escapeHtml(id)}" value="${index}" ${index === this.#chosenIndex ? "checked" : ""} />
            ${describeVersion(type, version)}
          </label>
        `).join("")}
        <button id="resolve">Resolve with chosen version</button>
      </div>
    `;

    this.shadowRoot.querySelectorAll(`input[name="${id}"]`).forEach((input) => {
      input.addEventListener("change", (event) => {
        this.#chosenIndex = Number(event.target.value);
      });
    });
    this.shadowRoot.querySelector("#resolve").addEventListener("click", () => this.#resolve());
  }

  async #resolve() {
    const { id, versions } = this.#conflict;
    const chosen = versions[this.#chosenIndex];
    // The winning doc (versions[0]) carries a `_conflicts` array from the
    // {conflicts: true} query — CouchDB rejects PUTs containing it, so it
    // must be stripped along with `_rev`/`_revisions` regardless of which
    // version was chosen.
    const { _rev, _revisions, _conflicts, ...content } = chosen;

    const repo = await new Repo();
    await repo.resolveConflict(id, content, versions);
    this.dispatchEvent(new CustomEvent("conflict-resolved", { bubbles: true, composed: true }));
  }
}

customElements.define("conflict-item", ConflictItem);
