import { z } from "zod";
import { generateProductExplanation } from "@/lib/aiExplanation";
import { calculateScore } from "@/lib/scoring";

export const runtime = "nodejs";

const ingredientSchema = z.object({
  name: z.string().min(1),
  riskLevel: z.string().default("unknown"),
  riskScore: z.number().int().min(0).max(100).default(5),
  category: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  reviewBucket: z.string().nullable().optional(),
  concerns: z.array(z.string()).optional(),
});

const bodySchema = z.object({
  productName: z.string().min(1).optional(),
  score: z.number().int().min(0).max(100).nullable().optional(),
  color: z.enum(["green", "yellow", "red"]).nullable().optional(),
  ingredients: z.array(z.union([z.string().min(1), ingredientSchema])).min(1).max(100),
});

export async function POST(req: Request) {
  try {
    const parsedBody = bodySchema.safeParse(await req.json());

    if (!parsedBody.success) {
      return Response.json(
        { error: "A valid explanation payload with at least one ingredient is required." },
        { status: 400 }
      );
    }

    const normalizedIngredients = parsedBody.data.ingredients.map((ingredient) =>
      typeof ingredient === "string"
        ? {
            name: ingredient,
            riskLevel: "unknown",
            riskScore: 5,
            category: null,
            source: null,
            description: null,
            reviewBucket: null,
            concerns: [],
          }
        : {
            ...ingredient,
            concerns: ingredient.concerns ?? [],
          }
    );

    const derivedScore =
      typeof parsedBody.data.score === "number"
        ? parsedBody.data.score
        : calculateScore(normalizedIngredients).score;
    const derivedColor =
      parsedBody.data.color ?? calculateScore(normalizedIngredients).color;

    const explanation = await generateProductExplanation({
      productName: parsedBody.data.productName,
      score: derivedScore,
      color: derivedColor,
      ingredients: normalizedIngredients,
    });

    return Response.json({
      explanation,
    });
  } catch (error) {
    console.error("AI explanation failed", error);
    return Response.json(
      { error: "Unable to generate an AI explanation right now." },
      { status: 500 }
    );
  }
}
