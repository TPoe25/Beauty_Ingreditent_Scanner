export type IngredientResult = {
  name: string;
  riskLevel: string;
  riskScore: number;
};

export type ProductScore = {
  score: number;
  color: "green" | "yellow" | "red";
  breakdown: IngredientResult[];
};

export function calculateScore(
  ingredients: IngredientResult[]
): ProductScore {
  let score = 100;

  for (const ing of ingredients) {
    score -= ing.riskScore;
  }

  score = Math.max(score, 0);

  let color: ProductScore["color"] = "green";

  if (score < 50) color = "red";
  else if (score < 80) color = "yellow";

  return {
    score,
    color,
    breakdown: ingredients,
  };
}
