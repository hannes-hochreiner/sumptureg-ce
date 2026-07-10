import { Repo } from "../repo.js";

export class SumpturegNav extends HTMLElement {
  #channel = null;

  constructor() {
    super();

    const shadowRoot = this.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = /*html*/ `
      <style>
        nav {
          display: flex;
          flex-direction: row;
          justify-content: space-around;
          align-items: center;
          background: linear-gradient(45deg, var(--primary-light), var(--primary));
          padding: 0.75rem 0;
        }
        a {
          color: var(--primary-dark);
          text-decoration: none;
          font-weight: 700;
        }
        .badge {
          background: var(--tertiary);
          color: white;
          border-radius: 999px;
          padding: 0 0.4rem;
          margin-left: 0.25rem;
          font-size: 0.7rem;
        }
      </style>
      <nav>
        <a href="/">Entry</a>
        <a href="/expenses">Expenses</a>
        <a href="/summary">Summary</a>
        <a href="/categories">Categories</a>
        <a href="/conflicts">Conflicts<span id="badge"></span></a>
      </nav>
    `;
  }

  async connectedCallback() {
    this.#channel = new BroadcastChannel("sync-status");
    this.#channel.onmessage = (event) => {
      if (event.data.type === "synced") this.#refreshConflictBadge();
    };
    await this.#refreshConflictBadge();
  }

  disconnectedCallback() {
    this.#channel?.close();
  }

  async #refreshConflictBadge() {
    const repo = await new Repo();
    const conflicts = await repo.getConflictedDocs();
    const badge = this.shadowRoot.querySelector("#badge");

    badge.textContent = conflicts.length > 0 ? conflicts.length : "";
    badge.className = conflicts.length > 0 ? "badge" : "";
  }
}

customElements.define("sumptureg-nav", SumpturegNav);
