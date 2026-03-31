import { prisma } from "@/lib/prisma";

function normalize(input: string) {
  return input.toLowerCase().trim();
}

export async function matchIngredients(rawIngredients: string[]) {
  const results = [];

  for (const raw of rawIngredients) {
    //const normalized = normalize(raw);

    // 1. direct match
    let ingredient = await prisma.ingredient.findFirst({
      where: {
        name: {
          equals: raw,
          mode: "insensitive",
        },
      },
    });

    // 2. alias match
    if (!ingredient) {
      const alias = await prisma.ingredientAlias.findFirst({
        where: {
          alias: {
            equals: raw,
            mode: "insensitive",
          },
        },
        include: {
          ingredient: true,
        },
      });

      if (alias) ingredient = alias.ingredient;
    }

    // fallback
    if (!ingredient) {
      results.push({
        name: raw,
        riskLevel: "unknown",
        riskScore: 5,
      });
      continue;
    }

    results.push({
      name: ingredient.name,
      riskLevel: ingredient.riskLevel,
      riskScore: ingredient.riskScore,
    });
  }

  return results;
}
