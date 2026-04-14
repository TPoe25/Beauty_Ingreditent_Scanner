import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

type PubChemResult = {
  cid?: number;
  name?: string;
  synonyms?: string[];
  toxicity_text?: string;
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(repoRoot, ".env.local"), override: true });

const connectionString = process.env.DATABASE_URL;
const pubChemServiceUrl = process.env.PUBCHEM_SERVICE_URL?.trim();

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

if (!pubChemServiceUrl) {
  throw new Error("PUBCHEM_SERVICE_URL is not set");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

function normalizeIngredientName(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

const pubChemCache = new Map<string, PubChemResult | null>();

async function fetchPubChemEnrichment(rawName: string): Promise<PubChemResult | null> {
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

async function main() {
  const ingredients = await prisma.ingredient.findMany({
    where: {
      source: "PRODUCT_DATASET_IMPORT",
      aliases: {
        none: {},
      },
    },
    take: 5000,
    include: {
      aliases: true,
    },
  });

  console.log(`Enriching up to ${ingredients.length} imported ingredients via PubChem...`);

  let enriched = 0;
  let skipped = 0;

  for (const ingredient of ingredients) {
    const result = await fetchPubChemEnrichment(ingredient.name);

    if (!result) {
      skipped += 1;
      continue;
    }

    const aliases = [...new Set((result.synonyms ?? []).map((alias) => alias.trim()).filter(Boolean))]
      .filter(
        (alias) =>
          normalizeIngredientName(alias) !== normalizeIngredientName(ingredient.name)
      )
      .slice(0, 15);

    const description = truncateText(result.toxicity_text, 1200);

    await prisma.ingredient.update({
      where: { id: ingredient.id },
      data: {
        source: "PRODUCT_DATASET_IMPORT+PUBCHEM",
        description: description ?? ingredient.description,
      },
    });

    for (const alias of aliases) {
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

    enriched += 1;

    if (enriched % 100 === 0) {
      console.log(`Enriched ${enriched}/${ingredients.length} ingredients...`);
    }
  }

  console.log(`PubChem enrichment complete: ${enriched} enriched, ${skipped} skipped.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("PubChem enrichment failed", error);
    await prisma.$disconnect();
    process.exit(1);
  });
