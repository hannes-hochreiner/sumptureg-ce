import "../components/sumptureg-header.js";
import { Repo } from "../repo.js";
import { Config } from "../objects/config.js";

export class SumpturegConfig extends HTMLElement {
  #bc = null;
  #config = null;
  #info = null;

  constructor() {
    super();
    this.#bc = new BroadcastChannel("notification");
  }

  async connectedCallback() {
    const shadowRoot = this.attachShadow({ mode: "open" });
    const repo = await new Repo();

    try {
      this.#config = await repo.getConfig();
    } catch {
      this.#config = Config.default();
    }

    try {
      this.#info = await repo.getInfo();
    } catch {
      this.#info = { _id: "info", lastSync: null };
    }

    shadowRoot.innerHTML = /*html*/ `
      <style>
        div.content {
          display: flex;
          flex-direction: column;
        }
        main {
          margin: 1rem;
          display: grid;
          gap: 1rem;
          grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
        }
        .breadcrumb {
          background: linear-gradient(45deg, var(--secondary), var(--secondary-light));
          display: flex;
          flex-direction: row;
          justify-content: space-between;
          align-items: baseline;
          padding: 0 1rem;
          color: var(--secondary-dark);
        }
        .breadcrumb h2 {
          margin: 0.5rem 0;
        }
        article header {
          font-weight: 700;
          font-size: 1.2rem;
        }
        button {
          display: flex;
          flex-direction: row;
          justify-content: center;
          align-items: center;
          cursor: pointer;
          padding: 0.5rem;
          gap: 0.5rem;
        }
      </style>
      <div class="content">
        <sumptureg-header></sumptureg-header>
        <div class="breadcrumb">
          <h2>Configuration</h2>
        </div>
        <main>
          <article id="synchronization">
            ${this.#renderSynchronization()}
          </article>
        </main>
      </div>
    `;
  }

  #renderSynchronization() {
    return /*html*/ `
      <header>Synchronization</header>
      <main>
        Last synchronization: ${this.#formatDate(this.#info.lastSync)}
        <button onclick="this.getRootNode().host.toggleNotifyOnAutoSync()">
          ${this.#config.notifyOnAutoSync
            ? '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f"><path d="M80-560q0-100 44.5-183.5T244-882l47 64q-60 44-95.5 111T160-560H80Zm720 0q0-80-35.5-147T669-818l47-64q75 55 119.5 138.5T880-560h-80ZM160-200v-80h80v-280q0-83 50-147.5T420-792v-28q0-25 17.5-42.5T480-880q25 0 42.5 17.5T540-820v28q80 20 130 84.5T720-560v280h80v80H160Zm320-300Zm0 420q-33 0-56.5-23.5T400-160h160q0 33-23.5 56.5T480-80ZM320-280h320v-280q0-66-47-113t-113-47q-66 0-113 47t-47 113v280Z"/></svg> synchronization notifications on'
            : '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f"><path d="M160-200v-80h80v-280q0-33 8.5-65t25.5-61l60 60q-7 16-10.5 32.5T320-560v280h248L56-792l56-56 736 736-56 56-146-144H160Zm560-154-80-80v-126q0-66-47-113t-113-47q-26 0-50 8t-44 24l-58-58q20-16 43-28t49-18v-28q0-25 17.5-42.5T480-880q25 0 42.5 17.5T540-820v28q80 20 130 84.5T720-560v206Zm-276-50Zm36 324q-33 0-56.5-23.5T400-160h160q0 33-23.5 56.5T480-80Zm33-481Z"/></svg> synchronization notifications off'
          }
        </button>
        <button onclick="this.getRootNode().host.sync()">
          <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f"><path d="M160-160v-80h110l-16-14q-52-46-73-105t-21-119q0-111 66.5-197.5T400-790v84q-72 26-116 88.5T240-478q0 45 17 87.5t53 78.5l10 10v-98h80v240H160Zm400-10v-84q72-26 116-88.5T720-482q0-45-17-87.5T650-648l-10-10v98h-80v-240h240v80H690l16 14q49 49 71.5 106.5T800-482q0 111-66.5 197.5T560-170Z"/></svg> synchronize
        </button>
      </main>
    `;
  }

  async toggleNotifyOnAutoSync() {
    try {
      const repo = await new Repo();
      const fresh = await repo.getConfig();
      fresh.notifyOnAutoSync = !fresh.notifyOnAutoSync;
      await repo.setConfig(fresh);
      this.#config = await repo.getConfig();
      this.shadowRoot.querySelector("#synchronization").innerHTML = this.#renderSynchronization();
      this.#bc.postMessage({
        title: "Notification",
        message: this.#config.notifyOnAutoSync
          ? "Automatic synchronization notification enabled"
          : "Automatic synchronization notification disabled",
        type: "info",
      });
    } catch (error) {
      console.error(error);
      this.#bc.postMessage({ title: "Notification Error", message: error.message, type: "error" });
    }
  }

  async sync() {
    try {
      const repo = await new Repo();
      await repo.sync();

      let info;
      try {
        info = await repo.getInfo();
      } catch {
        info = { _id: "info", lastSync: null };
      }
      info.lastSync = new Date();
      await repo.setInfo(info);
      this.#info = await repo.getInfo();
      this.shadowRoot.querySelector("#synchronization").innerHTML = this.#renderSynchronization();
      this.#bc.postMessage({ title: "Sync", message: "Synchronization successful", type: "info" });
    } catch (err) {
      console.error(err);
      this.#bc.postMessage({ title: "Sync Error", message: err.message, type: "error" });
    }
  }

  #formatDate(date) {
    if (!date) return "unknown";
    date = new Date(date);
    return `${date.getFullYear()}-${this.#pad(date.getMonth() + 1)}-${this.#pad(date.getDate())} ${this.#pad(date.getHours())}:${this.#pad(date.getMinutes())}`;
  }

  #pad(num) {
    return String(num).padStart(2, "0");
  }
}

customElements.define("sumptureg-config", SumpturegConfig);
