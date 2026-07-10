import "./sumptureg-notification.js";

export class SumpturegHeader extends HTMLElement {
  constructor() {
    super();

    const shadowRoot = this.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = /*html*/ `
      <style>
        header {
          background: linear-gradient(45deg, var(--primary-light), var(--primary));
          display: flex;
          flex-direction: row;
          justify-content: space-between;
          align-items: center;
          padding: 0 1rem;
          color: var(--primary-dark);
        }
        a {
          text-decoration: none;
          color: var(--primary-dark);
        }
        a:hover {
          opacity: 0.8;
        }
        h1 {
          margin: 0.5rem 0;
        }
        #config-link {
          font-size: 1.5rem;
          padding: 0.25rem;
        }
      </style>
      <header>
        <a href="/"><h1>Sumptureg</h1></a>
        <a href="/config" id="config-link">⚙</a>
      </header>
      <sumptureg-notification></sumptureg-notification>
    `;
  }
}

customElements.define("sumptureg-header", SumpturegHeader);
