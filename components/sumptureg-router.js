import { SumpturegEntry } from "../pages/sumptureg-entry.js";
import { SumpturegSummary } from "../pages/sumptureg-summary.js";
import { SumpturegCategories } from "../pages/sumptureg-categories.js";
import { SumpturegConflicts } from "../pages/sumptureg-conflicts.js";
import { SumpturegConfig } from "../pages/sumptureg-config.js";

export class SumpturegRouter extends HTMLElement {
  #slotContent = null;
  #routes = [
    { route: /^\/config$/, class: SumpturegConfig },
    { route: /^\/summary$/, class: SumpturegSummary },
    { route: /^\/categories$/, class: SumpturegCategories },
    { route: /^\/conflicts$/, class: SumpturegConflicts },
    { route: /[\s\S]*/, class: SumpturegEntry },
  ];

  constructor() {
    super();

    const shadowRoot = this.attachShadow({ mode: "open", slotAssignment: "manual" });
    shadowRoot.innerHTML = /*html*/ `
      <style></style>
      <slot><div id="default">Loading Sumptureg...</div></slot>
    `;
  }

  #navigate(event) {
    if (!event.canIntercept) {
      return;
    }

    const url = new URL(event.destination.url);

    for (const item of this.#routes) {
      const result = item.route.exec(url.pathname);
      if (result) {
        event.intercept({
          handler: async () => this.#updateView(item.class, result.groups),
        });
        break;
      }
    }
  }

  #updateView(type, groups) {
    if (this.#slotContent) {
      this.#slotContent.remove();
      this.#slotContent = null;
    }

    this.#slotContent = new type(groups);
    this.appendChild(this.#slotContent);
    this.shadowRoot.querySelector("slot").assign(this.#slotContent);
  }

  connectedCallback() {
    navigation.addEventListener("navigate", this.#navigate.bind(this));

    for (const item of this.#routes) {
      const result = item.route.exec(window.location.pathname);
      if (result) {
        this.#updateView(item.class, result.groups);
        break;
      }
    }
  }
}
