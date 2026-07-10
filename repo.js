import { default as PouchDb } from "https://cdn.jsdelivr.net/npm/pouchdb/+esm";
import { default as PouchDbFind } from "https://cdn.jsdelivr.net/npm/pouchdb-find/+esm";
import { monthStart, monthEnd } from "./objects/summary.js";

export class Repo {
  static #instance = null;
  #db = null;

  constructor() {
    return new Promise((resolve, reject) => {
      if (!Repo.#instance) {
        Repo.#instance = this;

        PouchDb.plugin(PouchDbFind);
        this.#db = new PouchDb("sumptureg");

        this.#db.createIndex({ index: { fields: ["type"] } })
          .then(() => resolve(Repo.#instance))
          .catch(reject);
      } else {
        resolve(Repo.#instance);
      }
    });
  }

  async addDoc(doc) {
    await this.#db.put(doc);
  }

  async getDoc(id) {
    return await this.#db.get(id);
  }

  async deleteDoc(id, rev) {
    await this.#db.remove(id, rev);
  }

  async getAllCategories() {
    const { docs } = await this.#db.find({ selector: { type: "category" } });
    return docs;
  }

  async getExpensesForMonth(year, month) {
    const start = monthStart(year, month);
    const end = monthEnd(year, month);
    const { docs } = await this.#db.find({
      selector: { type: "expense", date: { $gte: start, $lte: end } },
    });
    return docs;
  }

  async sync() {
    const origin = typeof window === "undefined" ? self.location.origin : window.location.origin;
    return await this.#db.sync(new PouchDb(`${origin}/api`));
  }

  async getConflictedDocs() {
    const { rows } = await this.#db.allDocs({ include_docs: true, conflicts: true });
    const conflicted = [];

    for (const row of rows) {
      const doc = row.doc;
      if (doc && doc._conflicts && doc._conflicts.length > 0) {
        const versions = [doc];
        for (const rev of doc._conflicts) {
          versions.push(await this.#db.get(doc._id, { rev }));
        }
        conflicted.push({ id: doc._id, type: doc.type, versions });
      }
    }

    return conflicted;
  }

  async resolveConflict(docId, chosenContent, allVersions) {
    const winning = await this.#db.get(docId);
    const toRemove = allVersions.filter((version) => version._rev !== winning._rev);

    if (chosenContent._deleted) {
      await this.#db.remove(docId, winning._rev);
    } else {
      await this.#db.put({ ...chosenContent, _id: docId, _rev: winning._rev });
    }

    for (const version of toRemove) {
      await this.#db.remove(docId, version._rev);
    }
  }

  async getConfig() {
    return await this.#db.get("config");
  }

  async setConfig(config) {
    await this.#db.put(config);
  }

  async getInfo() {
    return await this.#db.get("info");
  }

  async setInfo(info) {
    await this.#db.put(info);
  }
}
