function cleanIngredientToken(token: string) {
  return token
    .replace(/\s+/g, " ")
    .replace(/^[,;:.()\-[\]]+|[,;:.()\-[\]]+$/g, "")
    .trim();
}

export function extractIngredientCandidates(text: string) {
  const normalizedText = text.replace(/\r/g, "\n");
  const ingredientSectionMatch = normalizedText.match(
    /ingredients?\s*[:\-]?\s*([\s\S]+)/i
  );

  const sourceText = ingredientSectionMatch?.[1] ?? normalizedText;

  const flattened = sourceText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(", ");

  const candidates = flattened
    .split(/[,•·|]/)
    .map(cleanIngredientToken)
    .filter(Boolean)
    .filter((token) => /[a-zA-Z]/.test(token));

  return [...new Set(candidates)];
}
