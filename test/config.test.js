import assert from "node:assert";
import { Config } from "../objects/config.js";

const cfg = Config.default();
assert.strictEqual(cfg._id, "config");
assert.strictEqual(cfg.notifyOnAutoSync, false);

console.log("config.test.js: all assertions passed");
