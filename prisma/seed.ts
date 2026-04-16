import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma } from "@prisma/client";
import { calculateScore } from "../lib/scoring";
import { extractIngredientCandidates } from "../lib/parseIngredients";

type SeedIngredient = {
  name: string;
  normalizedName?: string | null;
  riskLevel: string;
  riskScore: number;
  description?: string | null;
  reviewBucket: string;
  category?: string | null;
  source?: string | null;
  concerns?: string[] | null;
  aliases?: string[];
};

type ProductDatasetRow = {
  __sourceFile?: string;
  asin?: string | number | null;
  upc?: string | number | null;
  brand_name?: string | null;
  product_name?: string | null;
  name?: string | null;
  title?: string | null;
  category_1?: string | null;
  category_2?: string | null;
  category_3?: string | null;
  category_4?: string | null;
  ingredients?: string | null;
  raw_ingredients?: string | null;
};

type IngredientRecord = {
  id: string;
  name: string;
  normalizedName: string | null;
  riskLevel: string;
  riskScore: number;
  source: string | null;
  aliases: string[];
};

type PubChemResult = {
  cid?: number;
  name?: string;
  synonyms?: string[];
  toxicity_text?: string;
};

const seedDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(seedDir, "..");

dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(repoRoot, ".env.local"), override: true });

const connectionString = process.env.DATABASE_URL;
const seedPubChemEnabled = process.env.SEED_ENABLE_PUBCHEM === "true";
const pubChemServiceUrl = seedPubChemEnabled
  ? process.env.PUBCHEM_SERVICE_URL?.trim()
  : undefined;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const INGREDIENT_DATA_PATHS = [
  path.join(repoRoot, "data", "ingredients.final.json"),
  path.join(repoRoot, "data", "ingredients.generated.json"),
];
const DATA_DIR = path.join(repoRoot, "data");

function normalizeIngredientName(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isJunkIngredientName(name: string) {
  return /CosIng - Cosmetics - GROWTH - European Commission|Substance: Moved or deleted/i.test(
    name
  );
}

function normalizeSeedIngredient(item: SeedIngredient): SeedIngredient | null {
  const name = item.name.trim();
  const normalizedName =
    typeof item.normalizedName === "string" && item.normalizedName.trim().length > 0
      ? normalizeIngredientName(item.normalizedName)
      : normalizeIngredientName(name);

  if (!name || !normalizedName || isJunkIngredientName(name)) {
    return null;
  }

  return {
    name,
    normalizedName,
    riskLevel: item.riskLevel,
    riskScore: item.riskScore,
    description: item.description?.trim() || null,
    reviewBucket: item.reviewBucket,
    category:
      typeof item.category === "string" && item.category.trim().length > 0
        ? item.category.trim()
        : null,
    source:
      typeof item.source === "string" && item.source.trim().length > 0
        ? item.source.trim()
        : null,
    concerns: Array.isArray(item.concerns)
      ? item.concerns
          .filter((concern): concern is string => typeof concern === "string")
          .map((concern) => concern.trim())
          .filter(Boolean)
      : null,
    aliases: (item.aliases ?? [])
      .map((alias) => alias.trim())
      .filter(Boolean),
  };
}

function loadIngredientData(): SeedIngredient[] {
  const merged = new Map<string, SeedIngredient>();

  for (const dataPath of INGREDIENT_DATA_PATHS) {
    if (!fs.existsSync(dataPath)) {
      continue;
    }

    const fileContents = fs.readFileSync(dataPath, "utf-8");
    const parsed = JSON.parse(fileContents) as unknown;

    if (!Array.isArray(parsed)) {
      throw new Error(`Seed data at ${dataPath} must be an array of ingredients.`);
    }

    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;

      const candidate = item as Record<string, unknown>;
      if (
        typeof candidate.name !== "string" ||
        typeof candidate.riskLevel !== "string" ||
        typeof candidate.riskScore !== "number" ||
        typeof candidate.reviewBucket !== "string"
      ) {
        continue;
      }

      const normalized = normalizeSeedIngredient({
        name: candidate.name,
        normalizedName:
          typeof candidate.normalizedName === "string" ? candidate.normalizedName : null,
        riskLevel: candidate.riskLevel,
        riskScore: candidate.riskScore,
        description:
          typeof candidate.description === "string" ? candidate.description : undefined,
        reviewBucket: candidate.reviewBucket,
        category: typeof candidate.category === "string" ? candidate.category : null,
        source: typeof candidate.source === "string" ? candidate.source : null,
        concerns: Array.isArray(candidate.concerns)
          ? candidate.concerns.filter(
              (concern): concern is string => typeof concern === "string"
            )
          : null,
        aliases: Array.isArray(candidate.aliases)
          ? candidate.aliases.filter((alias): alias is string => typeof alias === "string")
          : [],
      });

      if (!normalized) {
        continue;
      }

      merged.set(normalized.normalizedName!, normalized);
    }
  }

  return [...merged.values()];
}

function truncateText(input: string | null | undefined, maxLength: number) {
  if (!input) {
    return null;
  }

  const normalized = input.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function cleanHtml(input: string) {
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseEmbeddedIngredientJson(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return "";

    const collected: string[] = [];

    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const candidate = entry as Record<string, unknown>;
      const ingredients = candidate.ingredients;

      if (Array.isArray(ingredients)) {
        for (const ingredient of ingredients) {
          if (typeof ingredient === "string") {
            collected.push(ingredient);
          }
        }
      } else if (typeof ingredients === "string") {
        collected.push(ingredients);
      }
    }

    return collected.join(", ");
  } catch {
    return value;
  }
}

function sanitizeIngredientText(input: string) {
  return input
    .replace(/^[A-Z0-9/-]+\s*-\s*Ingredients:\s*/i, "")
    .replace(/^Ingredients:\s*/i, "")
    .replace(/\[\+\/-\s*May Contain:[^\]]*\]/gi, "")
    .replace(/May Contain\/Peut Contenir.*$/i, "")
    .replace(/May Contain:.*$/i, "")
    .replace(/\*Active ingredient.*$/i, "")
    .replace(/Fil\s+[A-Z0-9/.-]+$/i, "")
    .trim();
}

function extractProductIngredients(row: ProductDatasetRow) {
  const sources = [
    typeof row.ingredients === "string" ? parseEmbeddedIngredientJson(row.ingredients) : "",
    typeof row.raw_ingredients === "string" ? cleanHtml(row.raw_ingredients) : "",
  ].filter(Boolean);

  const sourceText = sources.sort((a, b) => b.length - a.length)[0] ?? "";
  const cleaned = sanitizeIngredientText(sourceText);
  const parsed = extractIngredientCandidates(cleaned).map((ingredient) => ingredient.trim());

  return [...new Set(parsed.filter(Boolean))];
}

function getProductName(row: ProductDatasetRow) {
  const asin =
    row.asin !== null && row.asin !== undefined ? String(row.asin).trim() : null;

  return (
    row.product_name?.trim() ||
    row.name?.trim() ||
    row.title?.trim() ||
    asin ||
    null
  );
}

function getProductCategory(row: ProductDatasetRow) {
  return (
    row.category_4?.trim() ||
    row.category_3?.trim() ||
    row.category_2?.trim() ||
    row.category_1?.trim() ||
    null
  );
}

function getProductBarcode(row: ProductDatasetRow) {
  if (row.asin !== null && row.asin !== undefined) {
    const asin = String(row.asin).trim();
    if (asin) {
      return `amazon:${asin}`;
    }
  }

  if (row.upc !== null && row.upc !== undefined) {
    const upc = String(row.upc).trim();
    if (upc) return `upc:${upc}`;
  }

  return null;
}

function isProductDatasetFile(fileName: string) {
  if (!fileName.toLowerCase().endsWith(".json")) {
    return false;
  }

  return !new Set(["ingredients.final.json", "ingredients.generated.json"]).has(fileName);
}

function isProductDatasetRow(item: unknown): item is ProductDatasetRow {
  if (!item || typeof item !== "object") {
    return false;
  }

  const candidate = item as Record<string, unknown>;

  return (
    typeof candidate.product_name === "string" ||
    typeof candidate.name === "string" ||
    typeof candidate.title === "string" ||
    typeof candidate.asin === "string" ||
    typeof candidate.ingredients === "string" ||
    typeof candidate.raw_ingredients === "string"
  );
}

function loadProductData() {
  if (!fs.existsSync(DATA_DIR)) {
    return [];
  }

  const productDataFiles = fs
    .readdirSync(DATA_DIR)
    .filter(isProductDatasetFile)
    .sort()
    .map((fileName) => path.join(DATA_DIR, fileName));

  const loadedDatasets: Array<{ filePath: string; rows: ProductDatasetRow[] }> = [];

  for (const filePath of productDataFiles) {
    const fileContents = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(fileContents) as unknown;

    if (!Array.isArray(parsed)) {
      throw new Error(`Product seed data at ${filePath} must be an array.`);
    }

    const rows = parsed
      .filter(isProductDatasetRow)
      .map((row) => ({
        ...row,
        __sourceFile: path.basename(filePath),
      }));

    loadedDatasets.push({ filePath, rows });
  }

  return loadedDatasets;
}

async function seedIngredient(item: SeedIngredient) {
  const existingIngredient =
    (await prisma.ingredient.findFirst({
      where: {
        normalizedName: item.normalizedName!,
      },
    })) ??
    (await prisma.ingredient.findFirst({
      where: {
        name: {
          equals: item.name,
          mode: "insensitive",
        },
      },
    }));

  const ingredient = existingIngredient
    ? await prisma.ingredient.update({
        where: { id: existingIngredient.id },
        data: {
          name: item.name,
          normalizedName: item.normalizedName!,
          riskLevel: item.riskLevel,
          riskScore: item.riskScore,
          description: item.description,
          reviewBucket: item.reviewBucket,
          category: item.category,
          source: item.source,
          concerns: item.concerns ?? undefined,
        },
      })
    : await prisma.ingredient.create({
        data: {
          name: item.name,
          normalizedName: item.normalizedName!,
          riskLevel: item.riskLevel,
          riskScore: item.riskScore,
          description: item.description,
          reviewBucket: item.reviewBucket,
          category: item.category,
          source: item.source,
          concerns: item.concerns ?? undefined,
        },
      });

  for (const alias of new Set(item.aliases ?? [])) {
    await prisma.ingredientAlias.upsert({
      where: { alias },
      update: {
        ingredientId: ingredient.id,
      },
      create: {
        alias,
        ingredientId: ingredient.id,
      },
    });
  }
}

async function loadIngredientLookup() {
  const ingredients = await prisma.ingredient.findMany({
    include: {
      aliases: true,
    },
  });

  const byNormalized = new Map<string, IngredientRecord>();
  const byName = new Map<string, IngredientRecord>();
  const byAlias = new Map<string, IngredientRecord>();

  for (const ingredient of ingredients) {
    const record: IngredientRecord = {
      id: ingredient.id,
      name: ingredient.name,
      normalizedName: ingredient.normalizedName,
      riskLevel: ingredient.riskLevel,
      riskScore: ingredient.riskScore,
      source: ingredient.source,
      aliases: ingredient.aliases.map((alias) => alias.alias),
    };

    if (ingredient.normalizedName) {
      byNormalized.set(ingredient.normalizedName, record);
    }

    byName.set(ingredient.name.toLowerCase(), record);

    for (const alias of record.aliases) {
      byAlias.set(alias.toLowerCase(), record);
      byAlias.set(normalizeIngredientName(alias), record);
    }
  }

  return { byNormalized, byName, byAlias };
}

const pubChemCache = new Map<string, PubChemResult | null>();
const pubChemProcessed = new Set<string>();

async function fetchPubChemEnrichment(rawName: string): Promise<PubChemResult | null> {
  if (!pubChemServiceUrl) {
    return null;
  }

  const normalizedName = normalizeIngredientName(rawName);
  if (!normalizedName) {
    return null;
  }

  if (pubChemCache.has(normalizedName)) {
    return pubChemCache.get(normalizedName) ?? null;
  }

  try {
    const url = new URL("/search", pubChemServiceUrl);
    url.searchParams.set("q", rawName);
    url.searchParams.set("limit", "1");
    url.searchParams.set("max_synonyms", "15");

    const response = await fetch(url.toString());
    if (!response.ok) {
      pubChemCache.set(normalizedName, null);
      return null;
    }

    const payload = (await response.json()) as { results?: PubChemResult[] };
    const result = payload.results?.[0] ?? null;

    pubChemCache.set(normalizedName, result);
    return result;
  } catch {
    pubChemCache.set(normalizedName, null);
    return null;
  }
}

async function applyPubChemEnrichment(
  ingredient: IngredientRecord,
  lookup: Awaited<ReturnType<typeof loadIngredientLookup>>
) {
  if (!pubChemServiceUrl) {
    return ingredient;
  }

  const normalizedName =
    ingredient.normalizedName ?? normalizeIngredientName(ingredient.name);

  if (!normalizedName) {
    return ingredient;
  }

  if (ingredient.source === "PRODUCT_DATASET_IMPORT+PUBCHEM") {
    pubChemProcessed.add(normalizedName);
    return ingredient;
  }

  if (pubChemProcessed.has(normalizedName)) {
    return ingredient;
  }

  const shouldEnrich =
    ingredient.source === "PRODUCT_DATASET_IMPORT" &&
    ingredient.aliases.length === 0;

  if (!shouldEnrich) {
    pubChemProcessed.add(normalizedName);
    return ingredient;
  }

  const pubChemResult = await fetchPubChemEnrichment(ingredient.name);
  if (!pubChemResult) {
    pubChemProcessed.add(normalizedName);
    return ingredient;
  }

  const aliases = [...new Set((pubChemResult.synonyms ?? []).map((alias) => alias.trim()).filter(Boolean))]
    .filter((alias) => normalizeIngredientName(alias) !== normalizeIngredientName(ingredient.name))
    .slice(0, 15);
  const description = truncateText(pubChemResult.toxicity_text, 1200);

  const updated = await prisma.ingredient.update({
    where: { id: ingredient.id },
    data: {
      source: "PRODUCT_DATASET_IMPORT+PUBCHEM",
      description: description ?? undefined,
    },
    include: {
      aliases: true,
    },
  });

  for (const alias of aliases) {
    await prisma.ingredientAlias.upsert({
      where: { alias },
      update: {
        ingredientId: updated.id,
      },
      create: {
        alias,
        ingredientId: updated.id,
      },
    });
  }

  const enriched: IngredientRecord = {
    id: updated.id,
    name: updated.name,
    normalizedName: updated.normalizedName,
    riskLevel: updated.riskLevel,
    riskScore: updated.riskScore,
    source: updated.source,
    aliases: [...new Set([...updated.aliases.map((alias) => alias.alias), ...aliases])],
  };

  pubChemProcessed.add(normalizedName);

  if (updated.normalizedName) {
    lookup.byNormalized.set(updated.normalizedName, enriched);
  }
  lookup.byName.set(updated.name.toLowerCase(), enriched);
  for (const alias of enriched.aliases) {
    lookup.byAlias.set(alias.toLowerCase(), enriched);
    lookup.byAlias.set(normalizeIngredientName(alias), enriched);
  }

  return enriched;
}

async function findOrCreateIngredient(
  rawName: string,
  lookup: Awaited<ReturnType<typeof loadIngredientLookup>>
) {
  const normalized = normalizeIngredientName(rawName);

  let ingredient =
    lookup.byNormalized.get(normalized) ||
    lookup.byName.get(rawName.toLowerCase()) ||
    lookup.byAlias.get(rawName.toLowerCase()) ||
    lookup.byAlias.get(normalized);

  if (ingredient) {
    if (ingredient.name === rawName || ingredient.normalizedName === normalized) {
      return applyPubChemEnrichment(ingredient, lookup);
    }

    return ingredient;
  }

  const pubChemResult = await fetchPubChemEnrichment(rawName);
  const aliases = [...new Set((pubChemResult?.synonyms ?? []).map((alias) => alias.trim()).filter(Boolean))]
    .filter((alias) => normalizeIngredientName(alias) !== normalized)
    .slice(0, 15);
  const description = truncateText(pubChemResult?.toxicity_text, 1200);

  let created;

  try {
    created = await prisma.ingredient.create({
      data: {
        name: rawName,
        normalizedName: normalized,
        riskLevel: "unknown",
        riskScore: 5,
        reviewBucket: "unknown_review_needed",
        source: pubChemResult ? "PRODUCT_DATASET_IMPORT+PUBCHEM" : "PRODUCT_DATASET_IMPORT",
        description,
        concerns: [],
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.ingredient.findFirst({
        where: {
          OR: [
            { normalizedName: normalized },
            {
              name: {
                equals: rawName,
                mode: "insensitive",
              },
            },
          ],
        },
        include: {
          aliases: true,
        },
      });

      if (existing) {
        const recovered: IngredientRecord = {
          id: existing.id,
          name: existing.name,
          normalizedName: existing.normalizedName,
          riskLevel: existing.riskLevel,
          riskScore: existing.riskScore,
          source: existing.source,
          aliases: existing.aliases.map((alias) => alias.alias),
        };

        if (existing.normalizedName) {
          lookup.byNormalized.set(existing.normalizedName, recovered);
        }
        lookup.byName.set(existing.name.toLowerCase(), recovered);
        for (const alias of recovered.aliases) {
          lookup.byAlias.set(alias.toLowerCase(), recovered);
          lookup.byAlias.set(normalizeIngredientName(alias), recovered);
        }

        return recovered;
      }
    }

    throw error;
  }

  for (const alias of aliases) {
    await prisma.ingredientAlias.upsert({
      where: { alias },
      update: {
        ingredientId: created.id,
      },
      create: {
        alias,
        ingredientId: created.id,
      },
    });
  }

  ingredient = {
    id: created.id,
    name: created.name,
    normalizedName: created.normalizedName,
    riskLevel: created.riskLevel,
    riskScore: created.riskScore,
    source: created.source,
    aliases,
  };

  if (pubChemResult) {
    pubChemProcessed.add(normalized);
  }

  lookup.byNormalized.set(normalized, ingredient);
  lookup.byName.set(created.name.toLowerCase(), ingredient);
  for (const alias of aliases) {
    lookup.byAlias.set(alias.toLowerCase(), ingredient);
    lookup.byAlias.set(normalizeIngredientName(alias), ingredient);
  }

  return ingredient;
}

async function seedStarterData() {
  const passwordHash = await bcrypt.hash("beauty-demo-123", 10);

  const user = await prisma.user.upsert({
    where: { email: "demo@beautyscanner.app" },
    update: {
      password: passwordHash,
    },
    create: {
      email: "demo@beautyscanner.app",
      password: passwordHash,
    },
  });

  await prisma.userProfile.upsert({
    where: { userId: user.id },
    update: {
      skinType: "sensitive",
      preferences: ["fragrance-free", "vegan"],
      allergies: ["linalool", "limonene"],
    },
    create: {
      userId: user.id,
      skinType: "sensitive",
      preferences: ["fragrance-free", "vegan"],
      allergies: ["linalool", "limonene"],
    },
  });

  const starterIngredients = [
    {
      name: "Water",
      normalizedName: "water",
      riskLevel: "low",
      riskScore: 0,
      reviewBucket: "mvp_safe",
      category: "base",
      description: "Primary solvent in cosmetic formulations.",
      source: "MANUAL_CURATED",
      concerns: [],
      aliases: ["Aqua"],
    },
    {
      name: "Glycerin",
      normalizedName: "glycerin",
      riskLevel: "low",
      riskScore: 2,
      reviewBucket: "mvp_safe",
      category: "humectant",
      description: "Humectant used for hydration.",
      source: "MANUAL_CURATED",
      concerns: [],
      aliases: [],
    },
    {
      name: "Fragrance",
      normalizedName: "fragrance",
      riskLevel: "moderate",
      riskScore: 25,
      reviewBucket: "moderate_context",
      category: "fragrance",
      description: "Common fragrance ingredient that may irritate sensitive skin.",
      source: "MANUAL_CURATED",
      concerns: ["allergen", "irritation"],
      aliases: ["Parfum", "Perfume"],
    },
    {
      name: "Niacinamide",
      normalizedName: "niacinamide",
      riskLevel: "low",
      riskScore: 3,
      reviewBucket: "mvp_safe",
      category: "vitamin",
      description: "Vitamin B3 derivative commonly used to support barrier function.",
      source: "MANUAL_CURATED",
      concerns: [],
      aliases: ["Vitamin B3"],
    },
    {
      name: "Hyaluronic Acid",
      normalizedName: "hyaluronic acid",
      riskLevel: "low",
      riskScore: 2,
      reviewBucket: "mvp_safe",
      category: "humectant",
      description: "Hydrating ingredient that helps retain moisture.",
      source: "MANUAL_CURATED",
      concerns: [],
      aliases: ["Sodium Hyaluronate"],
    },
    {
      name: "Salicylic Acid",
      normalizedName: "salicylic acid",
      riskLevel: "moderate",
      riskScore: 12,
      reviewBucket: "moderate_context",
      category: "exfoliant",
      description: "Beta hydroxy acid used for acne-prone skin and exfoliation.",
      source: "MANUAL_CURATED",
      concerns: ["dryness", "irritation"],
      aliases: ["BHA"],
    },
    {
      name: "Phenoxyethanol",
      normalizedName: "phenoxyethanol",
      riskLevel: "moderate",
      riskScore: 10,
      reviewBucket: "moderate_context",
      category: "preservative",
      description: "Common preservative that may bother very sensitive skin.",
      source: "MANUAL_CURATED",
      concerns: ["irritation"],
      aliases: [],
    },
    {
      name: "Cetearyl Alcohol",
      normalizedName: "cetearyl alcohol",
      riskLevel: "low",
      riskScore: 2,
      reviewBucket: "mvp_safe",
      category: "emollient",
      description: "Fatty alcohol used to soften skin and stabilize formulas.",
      source: "MANUAL_CURATED",
      concerns: [],
      aliases: [],
    },
    {
      name: "Dimethicone",
      normalizedName: "dimethicone",
      riskLevel: "low",
      riskScore: 3,
      reviewBucket: "mvp_safe",
      category: "silicone",
      description: "Silicone used for slip, smoothing, and barrier support.",
      source: "MANUAL_CURATED",
      concerns: [],
      aliases: [],
    },
    {
      name: "Citric Acid",
      normalizedName: "citric acid",
      riskLevel: "low",
      riskScore: 3,
      reviewBucket: "mvp_safe",
      category: "pH_adjuster",
      description: "Acid used to balance formula pH.",
      source: "MANUAL_CURATED",
      concerns: [],
      aliases: [],
    },
    {
      name: "Retinol",
      normalizedName: "retinol",
      riskLevel: "moderate",
      riskScore: 15,
      reviewBucket: "moderate_context",
      category: "retinoid",
      description: "Vitamin A derivative that can improve texture but irritate sensitive skin.",
      source: "MANUAL_CURATED",
      concerns: ["dryness", "photosensitivity", "irritation"],
      aliases: ["Vitamin A"],
    },
    {
      name: "Lactic Acid",
      normalizedName: "lactic acid",
      riskLevel: "moderate",
      riskScore: 10,
      reviewBucket: "moderate_context",
      category: "exfoliant",
      description: "Alpha hydroxy acid used for exfoliation and glow.",
      source: "MANUAL_CURATED",
      concerns: ["irritation"],
      aliases: ["AHA"],
    },
  ] as const;

  const ingredientMap = new Map<string, { id: string; name: string }>();

  for (const starterIngredient of starterIngredients) {
  const normalizedName = normalizeIngredientName(
    starterIngredient.normalizedName ?? starterIngredient.name
  );

  const existingIngredient =
    (await prisma.ingredient.findFirst({
      where: {
        normalizedName,
      },
    })) ??
    (await prisma.ingredient.findFirst({
      where: {
        name: {
          equals: starterIngredient.name,
          mode: "insensitive",
        },
      },
    }));

  const ingredient = existingIngredient
    ? await prisma.ingredient.update({
        where: { id: existingIngredient.id },
        data: {
          name: starterIngredient.name,
          normalizedName,
          riskLevel: starterIngredient.riskLevel,
          riskScore: starterIngredient.riskScore,
          description: starterIngredient.description,
          reviewBucket: starterIngredient.reviewBucket,
          category: starterIngredient.category,
          concerns: starterIngredient.concerns,
          source: starterIngredient.source,
        },
      })
    : await prisma.ingredient.create({
        data: {
          name: starterIngredient.name,
          normalizedName,
          riskLevel: starterIngredient.riskLevel,
          riskScore: starterIngredient.riskScore,
          description: starterIngredient.description,
          reviewBucket: starterIngredient.reviewBucket,
          category: starterIngredient.category,
          concerns: starterIngredient.concerns,
          source: starterIngredient.source,
        },
      });

  ingredientMap.set(starterIngredient.name, {
    id: ingredient.id,
    name: ingredient.name,
  });

  for (const alias of starterIngredient.aliases) {
    await prisma.ingredientAlias.upsert({
      where: { alias },
      update: {
        ingredientId: ingredient.id,
      },
      create: {
        alias,
        ingredientId: ingredient.id,
      },
    });
  }
}
  const starterProducts = [
    {
      name: "Hydrating Face Wash",
      brand: "GlowPure",
      category: "cleanser",
      barcode: "111111111111",
      baseScore: 74,
      scoreColor: "yellow",
      ingredients: ["Water", "Glycerin", "Fragrance"],
    },
    {
      name: "Barrier Repair Cream",
      brand: "DermaCalm",
      category: "moisturizer",
      barcode: "111111111112",
      baseScore: 93,
      scoreColor: "green",
      ingredients: ["Water", "Glycerin", "Cetearyl Alcohol", "Dimethicone"],
    },
    {
      name: "Clarifying Blemish Serum",
      brand: "ClearForm",
      category: "serum",
      barcode: "111111111113",
      baseScore: 78,
      scoreColor: "yellow",
      ingredients: ["Water", "Salicylic Acid", "Niacinamide", "Phenoxyethanol"],
    },
    {
      name: "Daily Glow Toner",
      brand: "LumaSkin",
      category: "toner",
      barcode: "111111111114",
      baseScore: 80,
      scoreColor: "green",
      ingredients: ["Water", "Glycerin", "Lactic Acid", "Citric Acid"],
    },
    {
      name: "Overnight Renewal Cream",
      brand: "NightBloom",
      category: "moisturizer",
      barcode: "111111111115",
      baseScore: 70,
      scoreColor: "yellow",
      ingredients: ["Water", "Glycerin", "Retinol", "Phenoxyethanol"],
    },
    {
      name: "Plumping Gel Serum",
      brand: "AquaVeil",
      category: "serum",
      barcode: "111111111116",
      baseScore: 95,
      scoreColor: "green",
      ingredients: ["Water", "Hyaluronic Acid", "Glycerin"],
    },
    {
      name: "Silky Makeup Primer",
      brand: "VelvetBase",
      category: "primer",
      barcode: "111111111117",
      baseScore: 88,
      scoreColor: "green",
      ingredients: ["Dimethicone", "Glycerin", "Water"],
    },
    {
      name: "Perfumed Body Lotion",
      brand: "Bloom Ritual",
      category: "body_lotion",
      barcode: "111111111118",
      baseScore: 63,
      scoreColor: "yellow",
      ingredients: ["Water", "Glycerin", "Fragrance", "Phenoxyethanol", "Cetearyl Alcohol"],
    },
  ] as const;

  for (const starterProduct of starterProducts) {
    const product = await prisma.product.upsert({
      where: { barcode: starterProduct.barcode },
      update: {
        name: starterProduct.name,
        brand: starterProduct.brand,
        category: starterProduct.category,
        baseScore: starterProduct.baseScore,
        scoreColor: starterProduct.scoreColor,
      },
      create: {
        name: starterProduct.name,
        brand: starterProduct.brand,
        category: starterProduct.category,
        barcode: starterProduct.barcode,
        baseScore: starterProduct.baseScore,
        scoreColor: starterProduct.scoreColor,
      },
    });

    for (const ingredientName of starterProduct.ingredients) {
      const ingredient = ingredientMap.get(ingredientName);
      if (!ingredient) continue;

      await prisma.productIngredient.upsert({
        where: {
          productId_ingredientId: {
            productId: product.id,
            ingredientId: ingredient.id,
          },
        },
        update: {},
        create: {
          productId: product.id,
          ingredientId: ingredient.id,
        },
      });
    }
  }
}

async function seedImportedProducts() {
  const datasets = loadProductData();
  const rows = datasets.flatMap((dataset) => dataset.rows);

  if (rows.length === 0) {
    console.log("No product import files found. Skipping dataset product seed.");
    return;
  }

  console.log(
    `Importing ${rows.length} product rows from ${datasets.length} JSON files: ${datasets
      .map((dataset) => path.basename(dataset.filePath))
      .join(", ")}`
  );

  if (pubChemServiceUrl) {
    console.log(`PubChem enrichment enabled via ${pubChemServiceUrl}`);
  } else {
    console.log(
      "PubChem enrichment disabled for seed. Set SEED_ENABLE_PUBCHEM=true or run the separate PubChem enrichment step."
    );
  }

  const lookup = await loadIngredientLookup();
  let imported = 0;
  let importedUnscored = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = getProductName(row);
    const barcode = getProductBarcode(row);

    if (!name || !barcode) {
      skipped += 1;
      continue;
    }

    const parsedIngredients = extractProductIngredients(row);
    if (parsedIngredients.length === 0) {
      await prisma.product.upsert({
        where: { barcode },
        update: {
          name,
          brand: row.brand_name?.trim() || null,
          category: getProductCategory(row),
        },
        create: {
          name,
          brand: row.brand_name?.trim() || null,
          category: getProductCategory(row),
          barcode,
          baseScore: null,
          scoreColor: null,
        },
      });

      imported += 1;
      importedUnscored += 1;
      continue;
    }

    const ingredients = [];

    for (const rawIngredient of parsedIngredients) {
      const ingredient = await findOrCreateIngredient(rawIngredient, lookup);
      ingredients.push(ingredient);
    }

    const uniqueIngredients = [...new Map(ingredients.map((item) => [item.id, item])).values()];
    const score = calculateScore(
      uniqueIngredients.map((ingredient) => ({
        name: ingredient.name,
        riskLevel: ingredient.riskLevel,
        riskScore: ingredient.riskScore,
      }))
    );

    const product = await prisma.product.upsert({
      where: { barcode },
      update: {
        name,
        brand: row.brand_name?.trim() || null,
        category: getProductCategory(row),
        baseScore: score.score,
        scoreColor: score.color,
      },
      create: {
        name,
        brand: row.brand_name?.trim() || null,
        category: getProductCategory(row),
        barcode,
        baseScore: score.score,
        scoreColor: score.color,
      },
    });

    await prisma.productIngredient.deleteMany({
      where: { productId: product.id },
    });

    await prisma.productIngredient.createMany({
      data: uniqueIngredients.map((ingredient) => ({
        productId: product.id,
        ingredientId: ingredient.id,
      })),
      skipDuplicates: true,
    });

    imported += 1;

    if (imported % 100 === 0) {
      console.log(`Imported ${imported}/${rows.length} dataset products...`);
    }
  }

  console.log(
    `Imported ${imported} dataset products (${importedUnscored} without score, ${skipped} skipped).`
  );
}

async function main() {
  const ingredientData = loadIngredientData();

  console.log(
    `Seeding ${ingredientData.length} merged ingredients from ${INGREDIENT_DATA_PATHS.join(", ")}...`
  );

  for (const item of ingredientData) {
    await seedIngredient(item);
  }

  await seedStarterData();
  await seedImportedProducts();

  console.log("Seed complete");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Seed failed", error);
    await prisma.$disconnect();
    process.exit(1);
  });
