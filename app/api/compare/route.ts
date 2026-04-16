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

type SerializedIngredient = {
  name: string;
  riskLevel: string;
  riskScore: number;
  category: string | null;
  source: string | null;
  reviewBucket: string;
  description: string | null;
  concerns: string[];
  aliases: string[];
};

type ComparisonProductInput = {
  name: string;
  brand?: string | null;
  ingredients: {
    name: string;
    riskLevel?: string | null;
    riskScore?: number | null;
    category?: string | null;
    source?: string | null;
    reviewBucket?: string | null;
    description?: string | null;
    concerns?: unknown;
    aliases?: unknown;
  }[];
};

type ComparisonProductResponse = {
  id: string | null;
  name: string;
  brand: string | null;
  score: number;
  color: string;
  flaggedIngredients: SerializedIngredient[];
  ingredientCount: number;
  standoutBenefits: string[];
  standoutConcerns: string[];
  source: "catalog" | "scan";
  lens: ProductLens;
};

function normalizeCustomIngredient(
  ingredient: ComparisonProductInput["ingredients"][number]
): IngredientLike {
  return {
    name: ingredient.name,
    riskLevel: ingredient.riskLevel ?? "unknown",
    riskScore: typeof ingredient.riskScore === "number" ? ingredient.riskScore : 5,
    category: ingredient.category ?? null,
    source: ingredient.source ?? "OCR_SCAN",
    reviewBucket: ingredient.reviewBucket ?? "ocr_scan",
    description: ingredient.description ?? null,
    concerns: Array.isArray(ingredient.concerns) ? ingredient.concerns : [],
    aliases: Array.isArray(ingredient.aliases)
      ? ingredient.aliases
          .filter((alias): alias is string => typeof alias === "string")
          .map((alias) => ({ alias }))
      : [],
  };
}

async function loadComparisonProduct(
  productId: string | undefined,
  customInput: ComparisonProductInput | undefined,
  fallbackLabel: string
): Promise<ComparisonProductResponse | null> {
  if (customInput) {
    const ingredients = customInput.ingredients
      .filter((ingredient) => typeof ingredient.name === "string" && ingredient.name.trim().length > 0)
      .map(normalizeCustomIngredient);

    if (!ingredients.length) {
      return null;
    }

    const score = calculateScore(ingredients);
    const lens = buildProductLens(ingredients);

    return {
      id: null,
      name: customInput.name?.trim() || fallbackLabel,
      brand: customInput.brand?.trim() || null,
      score: score.score,
      color: score.color,
      flaggedIngredients: lens.flaggedIngredients,
      ingredientCount: lens.ingredientCount,
      standoutBenefits: lens.standoutBenefits,
      standoutConcerns: lens.standoutConcerns,
      source: "scan",
      lens,
    };
  }

  if (!productId) {
    return null;
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
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
  });

  if (!product) {
    return null;
  }

  const ingredients = product.ingredients.map((item) => item.ingredient);
  const score = calculateScore(ingredients);
  const lens = buildProductLens(ingredients);

  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    score: score.score,
    color: score.color,
    flaggedIngredients: lens.flaggedIngredients,
    ingredientCount: lens.ingredientCount,
    standoutBenefits: lens.standoutBenefits,
    standoutConcerns: lens.standoutConcerns,
    source: "catalog",
    lens,
  };
}

type ProductLens = {
  flaggedIngredients: SerializedIngredient[];
  ingredientCount: number;
  highRiskCount: number;
  moderateRiskCount: number;
  totalRiskPoints: number;
  fragranceCount: number;
  preservativeCount: number;
  allergenConcernCount: number;
  exfoliantCount: number;
  retinoidCount: number;
  barrierSupportCount: number;
  hydratingCount: number;
  standoutConcerns: string[];
  standoutBenefits: string[];
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

function countMatches(ingredients: IngredientLike[], matcher: (ingredient: IngredientLike) => boolean) {
  return ingredients.filter(matcher).length;
}

function uniqueTopValues(values: string[], limit: number) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, limit);
}

function buildProductLens(ingredients: IngredientLike[]): ProductLens {
  const flaggedIngredients = getFlaggedIngredients(ingredients);
  const concernValues = ingredients.flatMap((ingredient) =>
    Array.isArray(ingredient.concerns) ? ingredient.concerns.filter((value): value is string => typeof value === "string") : []
  );

  const benefitNames = ingredients
    .filter((ingredient) => {
      const lowerName = ingredient.name.toLowerCase();
      const lowerCategory = (ingredient.category ?? "").toLowerCase();
      return (
        lowerName.includes("ceramide") ||
        lowerName.includes("glycerin") ||
        lowerName.includes("hyaluronic") ||
        lowerName.includes("panthenol") ||
        lowerName.includes("niacinamide") ||
        lowerCategory.includes("humectant") ||
        lowerCategory.includes("emollient")
      );
    })
    .map((ingredient) => ingredient.name);

  return {
    flaggedIngredients,
    ingredientCount: ingredients.length,
    highRiskCount: countMatches(ingredients, (ingredient) => ingredient.riskLevel === "high"),
    moderateRiskCount: countMatches(
      ingredients,
      (ingredient) => ingredient.riskLevel === "moderate"
    ),
    totalRiskPoints: ingredients.reduce((sum, ingredient) => sum + ingredient.riskScore, 0),
    fragranceCount: countMatches(ingredients, (ingredient) => {
      const haystack = `${ingredient.name} ${ingredient.category ?? ""} ${ingredient.reviewBucket}`.toLowerCase();
      const concerns = Array.isArray(ingredient.concerns)
        ? ingredient.concerns.join(" ").toLowerCase()
        : "";
      return (
        haystack.includes("fragrance") ||
        haystack.includes("parfum") ||
        haystack.includes("perfume") ||
        concerns.includes("fragrance") ||
        concerns.includes("allergen")
      );
    }),
    preservativeCount: countMatches(ingredients, (ingredient) => {
      const haystack = `${ingredient.name} ${ingredient.category ?? ""}`.toLowerCase();
      return (
        haystack.includes("preservative") ||
        haystack.includes("phenoxyethanol") ||
        haystack.includes("paraben") ||
        haystack.includes("benzoate") ||
        haystack.includes("sorbate")
      );
    }),
    allergenConcernCount: countMatches(ingredients, (ingredient) =>
      Array.isArray(ingredient.concerns)
        ? ingredient.concerns.some(
            (concern) =>
              typeof concern === "string" &&
              /allergen|sensitiz|irrit/i.test(concern)
          )
        : false
    ),
    exfoliantCount: countMatches(ingredients, (ingredient) => {
      const haystack = `${ingredient.name} ${ingredient.category ?? ""}`.toLowerCase();
      return (
        haystack.includes("acid") ||
        haystack.includes("bha") ||
        haystack.includes("aha") ||
        haystack.includes("salicy") ||
        haystack.includes("lactic") ||
        haystack.includes("glycolic")
      );
    }),
    retinoidCount: countMatches(ingredients, (ingredient) =>
      /retinol|retinal|retinyl|adapalene|tretinoin/i.test(ingredient.name)
    ),
    barrierSupportCount: countMatches(ingredients, (ingredient) =>
      /ceramide|cholesterol|fatty acid|panthenol|niacinamide|squalane/i.test(
        `${ingredient.name} ${ingredient.category ?? ""}`
      )
    ),
    hydratingCount: countMatches(ingredients, (ingredient) =>
      /glycerin|hyaluronic|sodium pca|urea|aloe|panthenol|betaine/i.test(ingredient.name)
    ),
    standoutConcerns: uniqueTopValues(concernValues, 4),
    standoutBenefits: uniqueTopValues(benefitNames, 4),
  };
}

function compareCountLabel(
  aValue: number,
  bValue: number,
  lowerIsBetter: boolean,
  singularLabel: string,
  pluralLabel: string
) {
  if (aValue === bValue) return null;
  const winner = lowerIsBetter ? (aValue < bValue ? "A" : "B") : aValue > bValue ? "A" : "B";
  const winnerValue = winner === "A" ? aValue : bValue;
  const loserValue = winner === "A" ? bValue : aValue;
  const label = loserValue - winnerValue === 1 ? singularLabel : pluralLabel;

  return {
    winner,
    summary: `Product ${winner} has ${Math.abs(aValue - bValue)} fewer ${label}.`,
  };
}

function buildAudienceNotes(
  lensA: ProductLens,
  lensB: ProductLens
): { label: string; winner: "A" | "B" | "Tie"; summary: string }[] {
  const sensitiveWinner =
    lensA.fragranceCount + lensA.allergenConcernCount + lensA.highRiskCount <
    lensB.fragranceCount + lensB.allergenConcernCount + lensB.highRiskCount
      ? "A"
      : lensB.fragranceCount + lensB.allergenConcernCount + lensB.highRiskCount <
          lensA.fragranceCount + lensA.allergenConcernCount + lensA.highRiskCount
        ? "B"
        : "Tie";

  const acneWinner =
    lensA.exfoliantCount + lensA.highRiskCount < lensB.exfoliantCount + lensB.highRiskCount
      ? "A"
      : lensB.exfoliantCount + lensB.highRiskCount < lensA.exfoliantCount + lensA.highRiskCount
        ? "B"
        : "Tie";

  const pregnancyWinner =
    lensA.retinoidCount < lensB.retinoidCount
      ? "A"
      : lensB.retinoidCount < lensA.retinoidCount
        ? "B"
        : "Tie";

  return [
    {
      label: "Sensitive skin",
      winner: sensitiveWinner,
      summary:
        sensitiveWinner === "Tie"
          ? "Both products look similarly cautious for sensitive skin based on fragrance, allergen, and high-risk flags."
          : `Product ${sensitiveWinner} looks gentler for sensitive skin because it carries fewer fragrance, allergen, and high-risk flags.`,
    },
    {
      label: "Acne-prone skin",
      winner: acneWinner,
      summary:
        acneWinner === "Tie"
          ? "Neither product clearly wins for acne-prone skin from the current dataset."
          : `Product ${acneWinner} looks easier to tolerate for acne-prone routines because it has fewer strong exfoliant or higher-risk flags.`,
    },
    {
      label: "Pregnancy caution",
      winner: pregnancyWinner,
      summary:
        pregnancyWinner === "Tie"
          ? "Neither formula clearly stands out under the current pregnancy-caution rules."
          : `Product ${pregnancyWinner} is the more conservative choice here because it shows fewer retinoid-style ingredients.`,
    },
  ];
}

function buildComparisonSummary(
  productAName: string,
  productBName: string,
  scoreA: number,
  scoreB: number,
  lensA: ProductLens,
  lensB: ProductLens
) {
  const better: "A" | "B" | "Tie" =
    scoreA === scoreB ? "Tie" : scoreA > scoreB ? "A" : "B";

  const winnerName = better === "A" ? productAName : productBName;
  const loserName = better === "A" ? productBName : productAName;
  const winnerLens = better === "A" ? lensA : lensB;
  const loserLens = better === "A" ? lensB : lensA;

  const reasons: string[] = [];
  const tradeoffs: string[] = [];

  const flaggedDiff = compareCountLabel(
    lensA.highRiskCount + lensA.moderateRiskCount,
    lensB.highRiskCount + lensB.moderateRiskCount,
    true,
    "flagged ingredient",
    "flagged ingredients"
  );
  if (flaggedDiff && flaggedDiff.winner === better) reasons.push(flaggedDiff.summary);

  const fragranceDiff = compareCountLabel(
    lensA.fragranceCount,
    lensB.fragranceCount,
    true,
    "fragrance-related flag",
    "fragrance-related flags"
  );
  if (fragranceDiff && fragranceDiff.winner === better) reasons.push(fragranceDiff.summary);

  const riskPointDiff = compareCountLabel(
    lensA.totalRiskPoints,
    lensB.totalRiskPoints,
    true,
    "total risk point",
    "total risk points"
  );
  if (riskPointDiff && riskPointDiff.winner === better) reasons.push(riskPointDiff.summary);

  const barrierDiff = compareCountLabel(
    lensA.barrierSupportCount + lensA.hydratingCount,
    lensB.barrierSupportCount + lensB.hydratingCount,
    false,
    "supportive hydration or barrier ingredient",
    "supportive hydration or barrier ingredients"
  );
  if (barrierDiff && barrierDiff.winner === better) reasons.push(barrierDiff.summary);

  if (loserLens.barrierSupportCount + loserLens.hydratingCount > winnerLens.barrierSupportCount + winnerLens.hydratingCount) {
    tradeoffs.push(
      `${loserName} may still appeal if you want more classic hydration or barrier-support ingredients in the formula.`
    );
  }

  if (loserLens.exfoliantCount > winnerLens.exfoliantCount) {
    tradeoffs.push(
      `${loserName} includes more exfoliant-style ingredients, which may suit users specifically looking for resurfacing rather than gentleness.`
    );
  }

  if (!tradeoffs.length && loserLens.standoutBenefits.length) {
    tradeoffs.push(
      `${loserName} still has a few positives, especially ${loserLens.standoutBenefits.slice(0, 2).join(" and ")}.`
    );
  }

  if (better === "Tie") {
    return {
      better,
      summary:
        "These products are closely matched overall. The score difference is small, so the better choice depends more on your sensitivity, fragrance tolerance, and preferred ingredient profile.",
      reasons: [
        "Their overall ingredient risk scores land in a similar range.",
        "Neither formula shows a decisive advantage across the main risk signals used here.",
      ],
      tradeoffs,
      audienceNotes: buildAudienceNotes(lensA, lensB),
    };
  }

  return {
    better,
    summary: `${winnerName} looks like the better pick overall because it carries fewer risk signals than ${loserName} in this ingredient-by-ingredient comparison.`,
    reasons: reasons.length
      ? reasons
      : [
          `${winnerName} posts the stronger overall score in this comparison.`,
          `Its ingredient list triggers fewer caution signals than ${loserName}.`,
        ],
    tradeoffs,
    audienceNotes: buildAudienceNotes(lensA, lensB),
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { productAId, productBId, productAInput, productBInput } = body;

    if ((!productAId && !productAInput) || (!productBId && !productBInput)) {
      return Response.json(
        { error: "Each side needs either a selected product or a scanned ingredient panel." },
        { status: 400 }
      );
    }

    const [productA, productB] = await Promise.all([
      loadComparisonProduct(productAId, productAInput, "Scanned Product A"),
      loadComparisonProduct(productBId, productBInput, "Scanned Product B"),
    ]);

    if (!productA || !productB) {
      return Response.json(
        { error: "One or both products could not be found." },
        { status: 404 }
      );
    }

    const comparison = buildComparisonSummary(
      productA.name,
      productB.name,
      productA.score,
      productB.score,
      productA.lens,
      productB.lens
    );

    return Response.json({
      productA: {
        id: productA.id,
        name: productA.name,
        brand: productA.brand,
        score: productA.score,
        color: productA.color,
        flaggedIngredients: productA.flaggedIngredients,
        ingredientCount: productA.ingredientCount,
        standoutBenefits: productA.standoutBenefits,
        standoutConcerns: productA.standoutConcerns,
        source: productA.source,
      },
      productB: {
        id: productB.id,
        name: productB.name,
        brand: productB.brand,
        score: productB.score,
        color: productB.color,
        flaggedIngredients: productB.flaggedIngredients,
        ingredientCount: productB.ingredientCount,
        standoutBenefits: productB.standoutBenefits,
        standoutConcerns: productB.standoutConcerns,
        source: productB.source,
      },
      better: comparison.better,
      summary: comparison.summary,
      reasons: comparison.reasons,
      tradeoffs: comparison.tradeoffs,
      audienceNotes: comparison.audienceNotes,
    });
  } catch (error) {
    console.error("COMPARE_ROUTE_ERROR", error);

    return Response.json(
      { error: "Something went wrong while comparing products." },
      { status: 500 }
    );
  }
}
