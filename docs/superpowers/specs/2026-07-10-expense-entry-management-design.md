# Expense Entry Management — Design Spec

Date: 2026-07-10

## Overview

Add a dedicated `/expenses` page that lets the user view, edit, and delete individual expense entries, browsed by month. Editing uses a modal dialog; deletion uses a generic confirmation dialog.

## New Files

| File | Purpose |
|------|---------|
| `pages/sumptureg-expenses.js` | Page shell: month navigation state, hosts list + modals, handles repo writes |
| `components/expense-list.js` | Renders a table of expenses for the current month; fires custom events for edit/delete |
| `components/expense-edit.js` | `<dialog>`-based edit modal; opened via `editExpense(expense, categories, cb)` |
| `components/sumptureg-confirmation.js` | Generic confirm/cancel dialog; opened by setting the `confirm` callback property |

## Modified Files

| File | Change |
|------|--------|
| `repo.js` | Add `deleteDoc(id, rev)` method |
| `components/sumptureg-router.js` | Add `/expenses` route before the catch-all |
| `components/sumptureg-nav.js` | Add "Expenses" link between "Entry" and "Summary" |

## Data Flow

1. `SumpturegExpenses` loads expenses + categories for the current month from Repo and passes them to `expense-list`.
2. User clicks edit → `expense-list` fires `expense-edit` custom event with the expense in `event.detail` → page opens `expense-edit` modal.
3. User saves → modal calls back with updated expense → page calls `repo.addDoc(updatedExpense)` (PouchDB `put` with `_rev`) → re-renders list → calls `triggerSync()`.
4. User clicks delete → `expense-list` fires `expense-delete` custom event → page opens `sumptureg-confirmation`.
5. User confirms → page calls `repo.deleteDoc(id, rev)` → re-renders list → calls `triggerSync()`.

## Component Details

### `expense-list.js`

- Receives `expenses` (array) and `categoriesById` (Map) via property setters.
- Renders a table sorted by date descending.
- Each row: date | category name | amount + currency | edit button | delete button.
- Edit and delete buttons fire `expense-edit` and `expense-delete` custom events respectively, with the expense object in `event.detail`.
- Empty state: shows a "No expenses this month." message (same style as summary page).

### `expense-edit.js`

- Uses native `<dialog>` with header / main / footer layout — same structure as `trip-edit.js` in travel-manager.
- Public API: `editExpense(expense, categories, cb)` — populates fields, calls `showModal()`.
- Fields: amount (number input), currency (select, same CURRENCIES list as `expense-form.js`), date (date input), category (select populated from `categories` argument).
- Validation on save: reuses `validateAmount` and `validateCategorySelected` from `objects/validation.js`; shows inline error on failure.
- On save: merges edited values onto the original expense object (preserving `_id`, `_rev`, `type`), calls `cb(updatedExpense)`, closes dialog.
- On cancel: closes dialog, does not call callback.

### `sumptureg-confirmation.js`

- Port of `travel-confirmation.js` from travel-manager.
- `<dialog>` with a message slot, confirm (✓) and cancel (✗) SVG icon buttons.
- Opened by assigning a callback to the `confirm` setter property.
- No domain-specific logic.

### `sumptureg-expenses.js` (page)

- Maintains `#year` / `#month` state, initialized to the current month — same pattern as `SumpturegSummary`.
- Month navigation buttons (◀ / ▶) shift month and trigger re-render.
- On `expense-edit` event: calls `expense-edit` modal's `editExpense()`.
- On `expense-delete` event: opens `sumptureg-confirmation`; on confirm calls `repo.deleteDoc()` and re-renders.
- After any write: calls `triggerSync()`.

## Repo Changes

```js
async deleteDoc(id, rev) {
  await this.#db.remove(id, rev);
}
```

`addDoc` already uses `this.#db.put(doc)`, which handles updates when `_rev` is present — no change needed.

## Navigation

Nav order after change: **Entry | Expenses | Summary | Categories | Conflicts**

Route added to router (before the catch-all):
```js
{ route: /^\/expenses$/, class: SumpturegExpenses }
```
