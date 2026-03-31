export function normalizeIngredientName(input: string) {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}
