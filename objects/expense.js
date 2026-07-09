export class Expense {
  static default() {
    return {
      _id: crypto.randomUUID(),
      type: "expense",
      amount: 0,
      currency: "EUR",
      date: new Date().toISOString().slice(0, 10),
      category_id: "",
    };
  }
}
