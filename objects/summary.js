export function monthStart(year, month) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function monthEnd(year, month) {
  // JS Date months are 0-indexed, so passing the 1-based `month` directly
  // as the month argument already points at the *next* calendar month.
  const nextMonthStart = month === 12
    ? new Date(Date.UTC(year + 1, 0, 1))
    : new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(nextMonthStart.getTime() - 24 * 60 * 60 * 1000);

  return lastDay.toISOString().slice(0, 10);
}

export function groupExpensesByCurrencyAndCategory(expenses, categoriesById) {
  const byCurrency = new Map();

  for (const expense of expenses) {
    const categoryName = categoriesById.get(expense.category_id) ?? expense.category_id;

    if (!byCurrency.has(expense.currency)) {
      byCurrency.set(expense.currency, new Map());
    }

    const byCategory = byCurrency.get(expense.currency);
    byCategory.set(categoryName, (byCategory.get(categoryName) ?? 0) + expense.amount);
  }

  const currencies = [...byCurrency.keys()].sort();

  return currencies.map((currency) => {
    const byCategory = byCurrency.get(currency);
    const rows = [...byCategory.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
    const total = rows.reduce((sum, row) => sum + row.amount, 0);

    return { currency, rows, total };
  });
}
