import assert from "node:assert";
import { monthStart, monthEnd, groupExpensesByCurrencyAndCategory } from "../objects/summary.js";

assert.strictEqual(monthStart(2026, 7), "2026-07-01");
assert.strictEqual(monthStart(2026, 12), "2026-12-01");

assert.strictEqual(monthEnd(2026, 1), "2026-01-31");
assert.strictEqual(monthEnd(2026, 2), "2026-02-28");
assert.strictEqual(monthEnd(2024, 2), "2024-02-29");
assert.strictEqual(monthEnd(2026, 12), "2026-12-31");

const categoriesById = new Map([
  ["cat-1", "Books"],
  ["cat-2", "Cafeteria"],
]);
const expenses = [
  { currency: "EUR", category_id: "cat-1", amount: 10 },
  { currency: "EUR", category_id: "cat-1", amount: 5 },
  { currency: "EUR", category_id: "cat-2", amount: 20 },
  { currency: "USD", category_id: "unknown-id", amount: 3 },
];
const grouped = groupExpensesByCurrencyAndCategory(expenses, categoriesById);

assert.strictEqual(grouped.length, 2);
assert.strictEqual(grouped[0].currency, "EUR");
assert.deepStrictEqual(grouped[0].rows, [
  { category: "Cafeteria", amount: 20 },
  { category: "Books", amount: 15 },
]);
assert.strictEqual(grouped[0].total, 35);
assert.strictEqual(grouped[1].currency, "USD");
assert.deepStrictEqual(grouped[1].rows, [{ category: "unknown-id", amount: 3 }]);
assert.strictEqual(grouped[1].total, 3);

console.log("summary.test.js: all assertions passed");
