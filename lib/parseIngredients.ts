const SECTION_END_MARKERS = [
  "directions",
  "how to use",
  "usage",
  "warning",
  "warnings",
  "caution",
  "cautions",
  "disclaimer",
  "storage",
  "made in",
  "distributed by",
  "manufacturer",
  "product description",
];

const NOISE_PATTERNS = [
  /^ingredients?$/i,
  /^may contain$/i,
  /^for external use only$/i,
  /^warning/i,
  /^directions/i,
  /^how to use/i,
  /^sku[:\s-]/i,
  /^item[:\s-]/i,
  /^shade[:\s-]/i,
  /^color[:\s-]/i,
  /^net wt/i,
  /^\d+\s?(ml|oz|g|kg|lb)$/i,
];

function cleanIngredientToken(token: string) {
  return token
    .replace(/\s+/g, " ")
    .replace(/^[,;:.()\-[\]+/\\]+|[,;:.()\-[\]+/\\]+$/g, "")
    .replace(/^ingredients?\s*[:\-]?\s*/i, "")
    .replace(/^and\s+/i, "")
    .trim();
}

function isNoiseToken(token: string) {
  const normalized = token.trim();

  if (!normalized) {
    return true;
  }

  if (!/[a-zA-Z]/.test(normalized)) {
    return true;
  }

  if (normalized.length <= 1) {
    return true;
  }

  return NOISE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function getIngredientSection(text: string) {
  const normalizedText = text.replace(/\r/g, "\n");
  const lowerText = normalizedText.toLowerCase();
  const ingredientIndex = lowerText.search(/\bingredients?\b/);

  if (ingredientIndex === -1) {
    return normalizedText;
  }

  let section = normalizedText.slice(ingredientIndex);
  const lowerSection = section.toLowerCase();

  let endIndex = section.length;

  for (const marker of SECTION_END_MARKERS) {
    const markerIndex = lowerSection.indexOf(`\n${marker}`);
    if (markerIndex !== -1 && markerIndex < endIndex) {
      endIndex = markerIndex;
    }
  }

  section = section.slice(0, endIndex);
  return section;
}

export function extractIngredientCandidates(text: string) {
  const sourceText = getIngredientSection(text);

  const flattened = sourceText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(", ")
    .replace(/\s{2,}/g, " ");

  const candidates = flattened
    .split(/[,•·|]/)
    .map(cleanIngredientToken)
    .filter((token) => !isNoiseToken(token));

  return [...new Set(candidates)];
}
