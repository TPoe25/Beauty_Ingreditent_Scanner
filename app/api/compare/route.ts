import { prisma } from "@/lib/prisma";
import { calculateScore } from "@/lib/scoring";

type IngredientLike = {
  name: string;
  category: string | null;
  source: string | null;
  reviewBucket: string;
  description: string | null;
  concerns: unknown;
  aliases: { alias: string }[];
  riskLevel: string;
  riskScore: number;
};

function getFlaggedIngredients(ingredients: IngredientLike[]) {
  return ingredients
    .filter(
      (ingredient) =>
        ingredient.riskLevel === "high" || ingredient.riskLevel === "moderate"
    )
    .map((ingredient) => ({
      name: ingredient.name,
      riskLevel: ingredient.riskLevel,
      riskScore: ingredient.riskScore,
      category: ingredient.category,
      source: ingredient.source,
      reviewBucket: ingredient.reviewBucket,
      description: ingredient.description,
      concerns: Array.isArray(ingredient.concerns) ? ingredient.concerns : [],
      aliases: ingredient.aliases.map((alias) => alias.alias),
    }));
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { productAId, productBId } = body;

    if (!productAId || !productBId) {
      return Response.json(
        { error: "Both product IDs are required." },
        { status: 400 }
      );
    }

    const [productA, productB] = await Promise.all([
      prisma.product.findUnique({
        where: { id: productAId },
        include: {
          ingredients: {
            include: {
              ingredient: {
                include: {
                  aliases: true,
                },
              },
            },
          },
        },
      }),
      prisma.product.findUnique({
        where: { id: productBId },
        include: {
          ingredients: {
            include: {
              ingredient: {
                include: {
                  aliases: true,
                },
              },
            },
          },
        },
      }),
    ]);

    if (!productA || !productB) {
      return Response.json(
        { error: "One or both products could not be found." },
        { status: 404 }
      );
    }

    const ingredientsA = productA.ingredients.map((item) => item.ingredient);
    const ingredientsB = productB.ingredients.map((item) => item.ingredient);

    const scoreA = calculateScore(ingredientsA);
    const scoreB = calculateScore(ingredientsB);

    const flaggedA = getFlaggedIngredients(ingredientsA);
    const flaggedB = getFlaggedIngredients(ingredientsB);

    let better: "A" | "B" | "Tie" = "Tie";
    let summary =
      "Both products are currently scored very similarly based on the available ingredient data.";

    if (scoreA.score > scoreB.score) {
      better = "A";
      summary = `${productA.name} scored higher than ${productB.name}, which suggests fewer or lower-risk flagged ingredients in this comparison.`;
    } else if (scoreB.score > scoreA.score) {
      better = "B";
      summary = `${productB.name} scored higher than ${productA.name}, which suggests fewer or lower-risk flagged ingredients in this comparison.`;
    }

    return Response.json({
      productA: {
        id: productA.id,
        name: productA.name,
        brand: productA.brand,
        score: scoreA.score,
        color: scoreA.color,
        flaggedIngredients: flaggedA,
      },
      productB: {
        id: productB.id,
        name: productB.name,
        brand: productB.brand,
        score: scoreB.score,
        color: scoreB.color,
        flaggedIngredients: flaggedB,
      },
      better,
      summary,
    });
  } catch (error) {
    console.error("COMPARE_ROUTE_ERROR", error);

    return Response.json(
      { error: "Something went wrong while comparing products." },
      { status: 500 }
    );
  }
}
