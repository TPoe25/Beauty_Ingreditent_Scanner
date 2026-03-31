import "dotenv/config";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

type SeedIngredient = {
  name: string;
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

const DATA_PATH = path.join(process.cwd(), "data", "ingredients.generated.json");

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
  const ingredient = await prisma.ingredient.upsert({
    where: { name: item.name },
    update: {
      riskLevel: item.riskLevel,
      riskScore: item.riskScore,
      description: item.description,
      reviewBucket: item.reviewBucket,
      category: item.category,
      source: item.source,
      concerns: item.concerns ?? undefined,
    },
    create: {
      name: item.name,
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

  const fragrance = await prisma.ingredient.upsert({
    where: { name: "Fragrance" },
    update: {
      riskLevel: "moderate",
      riskScore: 25,
      description: "Common fragrance ingredient that may irritate sensitive skin.",
      reviewBucket: "moderate_context",
      category: "fragrance",
      concerns: ["allergen", "irritation"],
    },
    create: {
      name: "Fragrance",
      riskLevel: "moderate",
      riskScore: 25,
      description: "Common fragrance ingredient that may irritate sensitive skin.",
      reviewBucket: "moderate_context",
      category: "fragrance",
      concerns: ["allergen", "irritation"],
    },
  });

  const glycerin = await prisma.ingredient.upsert({
    where: { name: "Glycerin" },
    update: {
      riskLevel: "low",
      riskScore: 2,
      description: "Humectant used for hydration.",
      reviewBucket: "mvp_safe",
      category: "humectant",
      concerns: [],
    },
    create: {
      name: "Glycerin",
      riskLevel: "low",
      riskScore: 2,
      description: "Humectant used for hydration.",
      reviewBucket: "mvp_safe",
      category: "humectant",
      concerns: [],
    },
  });

  const product = await prisma.product.upsert({
    where: { barcode: "111111111111" },
    update: {
      name: "Hydrating Face Wash",
      brand: "GlowPure",
      category: "cleanser",
      baseScore: 74,
      scoreColor: "yellow",
    },
    create: {
      name: "Hydrating Face Wash",
      brand: "GlowPure",
      category: "cleanser",
      barcode: "111111111111",
      baseScore: 74,
      scoreColor: "yellow",
    },
  });

  await prisma.productIngredient.upsert({
    where: {
      productId_ingredientId: {
        productId: product.id,
        ingredientId: fragrance.id,
      },
    },
    update: {},
    create: {
      productId: product.id,
      ingredientId: fragrance.id,
    },
  });

  await prisma.productIngredient.upsert({
    where: {
      productId_ingredientId: {
        productId: product.id,
        ingredientId: glycerin.id,
      },
    },
    update: {},
    create: {
      productId: product.id,
      ingredientId: glycerin.id,
    },
  });
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
