import "dotenv/config";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

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

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const DATA_PATH = path.join(process.cwd(), "data", "ingredients.final.json");

function normalizeIngredientName(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadSeedData(): SeedIngredient[] {
  const fileContents = fs.readFileSync(DATA_PATH, "utf-8");
  const parsed = JSON.parse(fileContents) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("Seed data must be an array of ingredients.");
  }

  return parsed
    .filter((item): item is SeedIngredient => {
      if (!item || typeof item !== "object") return false;

      const candidate = item as Record<string, unknown>;
      return (
        typeof candidate.name === "string" &&
        typeof candidate.riskLevel === "string" &&
        typeof candidate.riskScore === "number" &&
        typeof candidate.reviewBucket === "string"
      );
    })
    .map((item) => ({
      name: item.name.trim(),
      normalizedName:
        typeof item.normalizedName === "string" && item.normalizedName.trim().length > 0
          ? normalizeIngredientName(item.normalizedName)
          : normalizeIngredientName(item.name),
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
    }))
    .filter((item) => item.name.length > 0);
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

async function main() {
  const data = loadSeedData();

  console.log(`Seeding ${data.length} ingredients from ${DATA_PATH}...`);

  for (const item of data) {
    await seedIngredient(item);
  }

  await seedStarterData();

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
