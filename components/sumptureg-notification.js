export class SumpturegNotification extends HTMLElement {
  #notifications = [];
  #timeout = null;

  constructor() {
    super();

    const shadowRoot = this.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = /*html*/ `
      <style>
        #content {
          display: flex;
          flex-direction: column;
          border: 1px solid var(--secondary-dark);
          background-color: var(--secondary-light);
          color: var(--secondary-dark);
          border-radius: 15px;
          position: fixed;
          bottom: 1rem;
          left: 50%;
          transform: translateX(-50%);
          z-index: 9999;
          transition: all 0.5s ease-in-out;
        }
        #content.hidden {
          transform: translate(-50%, 150%);
        }
        #content.error {
          background-color: var(--tertiary-light);
          color: var(--tertiary-dark);
        }
        header {
          background: linear-gradient(45deg, var(--secondary), var(--secondary-light));
          padding: 0.5rem;
          font-size: 1.2rem;
          font-weight: 700;
          border-radius: 15px 15px 0 0;
          display: flex;
          flex-direction: row;
          justify-content: space-between;
        }
        #content.error header {
          background: linear-gradient(45deg, var(--tertiary), var(--tertiary-light));
          color: var(--tertiary-dark);
        }
        #content.error main {
          background-color: var(--tertiary-light);
          color: var(--tertiary-dark);
          border-radius: 0 0 15px 15px;
        }
        button.action {
          background: none;
          border: none;
          cursor: pointer;
        }
        main {
          padding: 0.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
      </style>
      <div id="content" class="hidden">
        <header>
          <div id="title"></div>
          <button id="button_close" class="action">
            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
          </button>
        </header>
        <main>
          <div id="message"></div>
        </main>
      </div>
    `;

    this.shadowRoot.querySelector("#button_close")
      .addEventListener("click", () => this.#showNext());

    const bc = new BroadcastChannel("notification");
    bc.onmessage = (event) => {
      this.#notifications.push(event.data);
      if (this.shadowRoot.querySelector("#content").classList.contains("hidden")) {
        this.#showNext();
      }
    };
  }

  #showNext() {
    this.shadowRoot.querySelector("#content").classList.add("hidden");
    if (this.#timeout) {
      clearTimeout(this.#timeout);
      this.#timeout = null;
    }
    if (this.#notifications.length > 0) {
      const notification = this.#notifications.shift();
      this.shadowRoot.querySelector("#title").textContent = notification.title;
      this.shadowRoot.querySelector("#message").textContent = notification.message;
      const content = this.shadowRoot.querySelector("#content");
      if (notification.type === "error") {
        content.classList.add("error");
      } else {
        content.classList.remove("error");
        this.#timeout = setTimeout(() => this.#showNext(), 2000);
      }
      content.classList.remove("hidden");
    }
  }
}

customElements.define("sumptureg-notification", SumpturegNotification);
