import { prisma } from "@/lib/prisma";

function normalize(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function matchIngredients(rawIngredients: string[]) {
  const results = [];

  for (const raw of rawIngredients) {
    const normalized = normalize(raw);

    // 1. direct name match
    let ingredient = await prisma.ingredient.findFirst({
      include: {
        aliases: true,
      },
      where: {
        name: {
          equals: raw,
          mode: "insensitive",
        },
      },
    });

    // 2. normalized canonical match
    if (!ingredient) {
      ingredient = await prisma.ingredient.findUnique({
        include: {
          aliases: true,
        },
        where: {
          normalizedName: normalized,
        },
      });
    }

    // 3. alias match
    if (!ingredient) {
      const alias = await prisma.ingredientAlias.findFirst({
        where: {
          alias: {
            equals: raw,
            mode: "insensitive",
          },
        },
        include: {
          ingredient: {
            include: {
              aliases: true,
            },
          },
        },
      });

      if (alias) ingredient = alias.ingredient;
    }

    // 4. normalized alias match
    if (!ingredient) {
      const aliases = await prisma.ingredientAlias.findMany({
        include: {
          ingredient: {
            include: {
              aliases: true,
            },
          },
        },
      });

      const alias = aliases.find((entry) => normalize(entry.alias) === normalized);
      if (alias) ingredient = alias.ingredient;
    }

    if (!ingredient) {
      results.push({
        name: raw,
        normalizedName: normalized,
        riskLevel: "unknown",
        riskScore: 5,
        category: null,
        source: null,
        concerns: [],
        aliases: [],
      });
      continue;
    }

      results.push({
        name: ingredient.name,
        normalizedName: ingredient.normalizedName,
        riskLevel: ingredient.riskLevel,
        riskScore: ingredient.riskScore,
        category: ingredient.category,
        source: ingredient.source,
        concerns: Array.isArray(ingredient.concerns) ? ingredient.concerns : [],
        aliases: ingredient.aliases.map((alias) => alias.alias),
      });
    }

  return results;
}
