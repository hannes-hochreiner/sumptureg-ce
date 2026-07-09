export class Category {
  static default() {
    return {
      _id: crypto.randomUUID(),
      type: "category",
      name: "",
    };
  }
}
