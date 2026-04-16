import { prisma } from "@/lib/prisma";
import { getDatabaseErrorMessage } from "@/lib/databaseErrors";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();

    if (!q) {
      return Response.json([]);
    }

    const products = await prisma.product.findMany({
      where: {
        OR: [
          {
            name: {
              contains: q,
              mode: "insensitive",
            },
          },
          {
            brand: {
              contains: q,
              mode: "insensitive",
            },
          },
          {
            ingredients: {
              some: {
                ingredient: {
                  name: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
              },
            },
          },
          {
            ingredients: {
              some: {
                ingredient: {
                  aliases: {
                    some: {
                      alias: {
                        contains: q,
                        mode: "insensitive",
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
      include: {
        ingredients: {
          include: { ingredient: true },
        },
      },
      take: 20,
      distinct: ["id"],
      orderBy: {
        name: "asc",
      },
    });

    return Response.json(
      products.map((product) => ({
        id: product.id,
        name: product.name,
        brand: product.brand,
        category: product.category,
        baseScore: product.baseScore,
        scoreColor: product.scoreColor,
        ingredientCount: product.ingredients.length,
        flaggedIngredientCount: product.ingredients.filter(
          (item) =>
            item.ingredient.riskLevel === "high" ||
            item.ingredient.riskLevel === "moderate"
        ).length,
        ingredientPreview: product.ingredients
          .slice(0, 3)
          .map((item) => item.ingredient.name),
      }))
    );
  } catch (error) {
    console.error("Product search failed", error);
    const databaseMessage = getDatabaseErrorMessage(error);

    if (databaseMessage) {
      return Response.json({ error: databaseMessage }, { status: 503 });
    }

    return Response.json({ error: "Unable to search products." }, { status: 500 });
  }
}
