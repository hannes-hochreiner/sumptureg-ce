export class SumpturegConfirmation extends HTMLElement {
  #cb = null;

  constructor() {
    super();

    const shadowRoot = this.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = /*html*/ `
      <style>
        dialog { padding: 0; }
        div.content { display: flex; flex-direction: column; border: 1px solid; }
        header {
          background: linear-gradient(45deg, var(--tertiary-light), var(--tertiary));
          padding: 0.5rem;
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--tertiary-dark);
        }
        main { padding: 0.5rem; }
        footer { display: flex; flex-direction: row; justify-content: space-between; }
        .action { flex-grow: 1; }
      </style>
      <dialog id="dialog">
        <div class="content">
          <header><slot name="title"></slot></header>
          <main><slot name="message"></slot></main>
          <footer>
            <button id="btn-ok" class="action">
              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f"><path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/></svg>
            </button>
            <button id="btn-cancel" class="action">
              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
            </button>
          </footer>
        </div>
      </dialog>
    `;

    shadowRoot.querySelector("#btn-ok").addEventListener("click", () => {
      shadowRoot.querySelector("#dialog").close();
      this.#cb?.();
      this.#cb = null;
    });

    shadowRoot.querySelector("#btn-cancel").addEventListener("click", () => {
      shadowRoot.querySelector("#dialog").close();
      this.#cb = null;
    });
  }

  set confirm(cb) {
    this.#cb = cb;
    this.shadowRoot.querySelector("#dialog").showModal();
  }
}

customElements.define("sumptureg-confirmation", SumpturegConfirmation);
