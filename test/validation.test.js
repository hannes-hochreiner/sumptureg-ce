import assert from "node:assert";
import { validateAmount, validateCategorySelected, validateCategoryName } from "../objects/validation.js";

// validateAmount
assert.deepStrictEqual(validateAmount("12.50"), { valid: true, value: 12.5 });
assert.strictEqual(validateAmount("0").valid, false);
assert.strictEqual(validateAmount("0").error, "Enter a valid positive amount.");
assert.strictEqual(validateAmount("-5").valid, false);
assert.strictEqual(validateAmount("abc").valid, false);
assert.strictEqual(validateAmount("").valid, false);

// validateCategorySelected
assert.strictEqual(validateCategorySelected("").valid, false);
assert.strictEqual(validateCategorySelected("").error, "Select a category.");
assert.strictEqual(validateCategorySelected("some-id").valid, true);

// validateCategoryName
assert.deepStrictEqual(validateCategoryName("  Books  "), { valid: true, value: "Books" });
assert.strictEqual(validateCategoryName("   ").valid, false);
assert.strictEqual(validateCategoryName("   ").error, "Name cannot be empty.");
assert.strictEqual(validateCategoryName("").valid, false);

console.log("validation.test.js: all assertions passed");
