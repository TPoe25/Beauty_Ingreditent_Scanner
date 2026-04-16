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
  /^product description/i,
  /^please be aware/i,
  /^made in/i,
  /^distributed by/i,
  /^manufactured by/i,
  /^natural origin of total$/i,
  /^\d+\s?(ml|oz|g|kg|lb)$/i,
];

const OCR_CORRECTIONS: Array<[RegExp, string]> = [
  [/\bdime\s*thicone\b/gi, "dimethicone"],
  [/\balchohol\b/gi, "alcohol"],
  [/\baoua\b/gi, "aqua"],
  [/\bdipropyleneglycol\b/gi, "dipropylene glycol"],
  [/\boryzasativa\b/gi, "oryza sativa"],
  [/\bretynyl\b/gi, "retinyl"],
  [/\balkirt\b/gi, "alkyl"],
  [/\blimethylammonium\b/gi, "dimethylammonium"],
  [/\bcapryl glycol\b/gi, "caprylyl glycol"],
  [/\bhexylglycerin\b/gi, "ethylhexylglycerin"],
];

const KNOWN_JUNK_PHRASES = [
  "up to date list of ingredients",
  "committed to delivering",
  "bed head by",
  "magnetic eyeliner",
  "eyeshadow palette",
  "ginseng with vitamins",
  "making it radiant",
  "please refer to the ingredient list",
  "product package you receive",
];

function decodeCommonEntities(input: string) {
  return input
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ");
}

function applyOcrCorrections(input: string) {
  return OCR_CORRECTIONS.reduce(
    (value, [pattern, replacement]) => value.replace(pattern, replacement),
    input
  );
}

export function normalizeIngredientName(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanIngredientToken(token: string) {
  return applyOcrCorrections(
    decodeCommonEntities(token)
      .replace(/&lt;\/?br&gt;/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\[\+\/-\s*may contain:[^\]]*\]/gi, "")
      .replace(/may contain\/peut contenir.*$/i, "")
      .replace(/may contain.*$/i, "")
      .replace(/ingredients?\s*[:\-]?\s*/gi, "")
      .replace(/^and\s+/i, "")
      .replace(/^\*+/, "")
      .replace(/^[-*•·+\s]+|[-*•·+\s]+$/g, "")
      .replace(/^[,;:.()[\]/\\]+|[,;:.()[\]/\\]+$/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

export function isNoiseToken(token: string) {
  const normalized = token.trim();

  if (!normalized) return true;
  if (!/[a-zA-Z]/.test(normalized)) return true;
  if (normalized.length <= 1) return true;
  if (NOISE_PATTERNS.some((pattern) => pattern.test(normalized))) return true;

  const lower = normalized.toLowerCase();
  return KNOWN_JUNK_PHRASES.some((phrase) => lower.includes(phrase));
}

export function splitIngredientCandidates(input: string) {
  return input
    .split(/[,•·|]/)
    .flatMap((token) => token.split(/\s*\/\s*|\s*;\s*|\s+\+\s+|\s+and\s+/i))
    .map((token) => cleanIngredientToken(token))
    .filter((token) => !isNoiseToken(token));
}

export function sanitizeIngredientForPubChem(rawName: string) {
  const cleaned = cleanIngredientToken(rawName)
    .replace(/\([^)]*$/g, "")
    .replace(/%+/g, " ")
    .replace(/\borganic\b/gi, "")
    .replace(/\bnatural\b/gi, "")
    .replace(/\bextract\*$/i, "extract")
    .replace(/\b(f\.?\s*i\.?\s*l\.?|ci)\b[^,;]*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (isNoiseToken(cleaned)) {
    return null;
  }

  const split = splitIngredientCandidates(cleaned);
  const preferred =
    split.find((token) => {
      const lower = token.toLowerCase();
      return !lower.includes("water") || split.length === 1;
    }) ?? split[0];

  if (!preferred || isNoiseToken(preferred)) {
    return null;
  }

  const normalized = normalizeIngredientName(preferred);
  if (normalized.length < 3 || normalized.split(" ").length > 8) {
    return null;
  }

  if (/\b(may contain|ingredients|package you receive|up to date)\b/i.test(preferred)) {
    return null;
  }

  return preferred;
}

function getIngredientSection(text: string) {
  const normalizedText = text.replace(/\r/g, "\n");
  const lowerText = normalizedText.toLowerCase();
  const ingredientIndex = lowerText.search(/\bingredients?\b/);

  if (ingredientIndex === -1) {
    return normalizedText;
  }

  const section = normalizedText.slice(ingredientIndex);
  const lowerSection = section.toLowerCase();
  let endIndex = section.length;

  for (const marker of SECTION_END_MARKERS) {
    const markerIndex = lowerSection.indexOf(`\n${marker}`);
    if (markerIndex !== -1 && markerIndex < endIndex) {
      endIndex = markerIndex;
    }
  }

  return section.slice(0, endIndex);
}

export function extractIngredientCandidatesFromText(text: string) {
  const sourceText = getIngredientSection(text);
  const flattened = sourceText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(", ")
    .replace(/\s{2,}/g, " ");

  return [...new Set(splitIngredientCandidates(flattened))];
}
