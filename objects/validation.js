export function validateAmount(input) {
  const value = parseFloat(input);

  if (Number.isNaN(value) || value <= 0) {
    return { valid: false, error: "Enter a valid positive amount." };
  }

  return { valid: true, value };
}

export function validateCategorySelected(categoryId) {
  if (!categoryId) {
    return { valid: false, error: "Select a category." };
  }

  return { valid: true };
}

export function validateCategoryName(input) {
  const value = input.trim();

  if (value === "") {
    return { valid: false, error: "Name cannot be empty." };
  }

  return { valid: true, value };
}
