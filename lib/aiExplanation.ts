import OpenAI from "openai";
import { z } from "zod";
import { env } from "@/lib/env";

export type ExplanationIngredient = {
  name: string;
  riskLevel: string;
  riskScore: number;
  category?: string | null;
  source?: string | null;
  description?: string | null;
  reviewBucket?: string | null;
  concerns?: string[];
};

export type ExplanationFocus =
  | "sensitive_skin"
  | "acne_prone"
  | "pregnancy_safe"
  | "fragrance_free";

export type ExplanationProfile = {
  skinType?: string | null;
  preferences?: string[];
  allergies?: string[];
};

export type ExplanationInput = {
  productName?: string;
  score?: number | null;
  color?: "green" | "yellow" | "red" | null;
  ingredients: ExplanationIngredient[];
  profile?: ExplanationProfile | null;
};

const explanationSchema = z.object({
  summary: z.string().min(1),
  scoreContext: z.string().min(1),
  reasons: z.array(z.string().min(1)).max(5),
  tradeoffs: z.array(z.string().min(1)).max(4),
  flaggedIngredients: z
    .array(
      z.object({
        name: z.string().min(1),
        reason: z.string().min(1),
        cautionLevel: z.enum(["low", "moderate", "high"]),
      })
    )
    .max(5),
  recommendation: z.string().min(1),
  confidenceNote: z.string().min(1),
  personalizationNote: z.string().nullable(),
  allergyAlerts: z.array(z.string()).max(5),
  audienceNotes: z
    .array(
      z.object({
        focus: z.enum([
          "sensitive_skin",
          "acne_prone",
          "pregnancy_safe",
          "fragrance_free",
        ]),
        label: z.string().min(1),
        summary: z.string().min(1),
      })
    )
    .max(4),
});

export type ProductExplanation = z.infer<typeof explanationSchema> & {
  source: "ai" | "fallback";
};

const openai = env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    })
  : null;

function normalizeConcernList(concerns: string[] | undefined) {
  return Array.isArray(concerns)
    ? concerns.map((concern) => concern.trim()).filter(Boolean).slice(0, 4)
    : [];
}

function getCautionLevel(riskLevel: string, riskScore: number): "low" | "moderate" | "high" {
  const normalizedRiskLevel = riskLevel.toLowerCase();

  if (normalizedRiskLevel === "high" || riskScore >= 8) {
    return "high";
  }

  if (normalizedRiskLevel === "moderate" || riskScore >= 4) {
    return "moderate";
  }

  return "low";
}

function ingredientText(ingredient: ExplanationIngredient) {
  return [
    ingredient.name,
    ingredient.category ?? "",
    ingredient.description ?? "",
    ...normalizeConcernList(ingredient.concerns),
  ]
    .join(" ")
    .toLowerCase();
}

function getFocusLabel(focus: ExplanationFocus) {
  switch (focus) {
    case "sensitive_skin":
      return "Sensitive Skin";
    case "acne_prone":
      return "Acne-Prone Skin";
    case "pregnancy_safe":
      return "Pregnancy-Safe";
    case "fragrance_free":
      return "Fragrance-Free";
  }
}

function normalizeProfileList(values: string[] | undefined) {
  return Array.isArray(values)
    ? values.map((value) => value.trim()).filter(Boolean)
    : [];
}

function inferProfileFocuses(profile: ExplanationProfile | null | undefined): ExplanationFocus[] {
  if (!profile) {
    return ["sensitive_skin", "acne_prone", "pregnancy_safe", "fragrance_free"];
  }

  const preferences = normalizeProfileList(profile.preferences).map((value) => value.toLowerCase());
  const skinType = (profile.skinType ?? "").toLowerCase();
  const focuses: ExplanationFocus[] = [];

  if (skinType.includes("sensitive")) {
    focuses.push("sensitive_skin");
  }

  if (skinType.includes("acne")) {
    focuses.push("acne_prone");
  }

  if (
    preferences.some((value) => value.includes("fragrance-free") || value.includes("fragrance free"))
  ) {
    focuses.push("fragrance_free");
  }

  if (
    preferences.some(
      (value) =>
        value.includes("pregnancy-safe") ||
        value.includes("pregnancy safe") ||
        value.includes("pregnancy")
    )
  ) {
    focuses.push("pregnancy_safe");
  }

  if (focuses.length === 0) {
    return ["sensitive_skin", "acne_prone"];
  }

  return [...new Set(focuses)];
}

function buildAudienceNotes(input: ExplanationInput) {
  const ingredients = input.ingredients.map((ingredient) => ({
    ingredient,
    text: ingredientText(ingredient),
  }));
  const requestedFocuses = inferProfileFocuses(input.profile);

  const sensitiveFlags = ingredients
    .filter(
      ({ text }) =>
        text.includes("irrit") ||
        text.includes("allergen") ||
        text.includes("sensitive skin") ||
        text.includes("fragrance")
    )
    .map(({ ingredient }) => ingredient.name);

  const acneSupport = ingredients
    .filter(
      ({ text }) =>
        text.includes("acne") ||
        text.includes("bha") ||
        text.includes("salicylic") ||
        text.includes("exfoliant")
    )
    .map(({ ingredient }) => ingredient.name);

  const acneFlags = ingredients
    .filter(({ text }) => text.includes("dryness") || text.includes("irrit"))
    .map(({ ingredient }) => ingredient.name);

  const pregnancyFlags = ingredients
    .filter(
      ({ text }) =>
        text.includes("retino") ||
        text.includes("retinal") ||
        text.includes("retinol") ||
        text.includes("vitamin a derivative") ||
        text.includes("tretinoin") ||
        text.includes("adapalene")
    )
    .map(({ ingredient }) => ingredient.name);

  const fragranceFlags = ingredients
    .filter(
      ({ text }) =>
        text.includes("fragrance") || text.includes("parfum") || text.includes("perfume")
    )
    .map(({ ingredient }) => ingredient.name);

  const notes = [
    {
      focus: "sensitive_skin" as const,
      label: getFocusLabel("sensitive_skin"),
      summary:
        sensitiveFlags.length > 0
          ? `For sensitive skin, the main watch-outs are ${[...new Set(sensitiveFlags)].slice(0, 3).join(", ")} because the matched data mentions irritation, allergen, fragrance, or sensitivity concerns.`
          : "For sensitive skin, this formula does not show obvious irritation-focused flags in the current dataset, although personal triggers can still vary.",
    },
    {
      focus: "acne_prone" as const,
      label: getFocusLabel("acne_prone"),
      summary:
        acneSupport.length > 0
          ? `For acne-prone skin, ${[...new Set(acneSupport)].slice(0, 3).join(", ")} may be relevant because the matched records connect them to exfoliation or acne-focused use.${acneFlags.length > 0 ? ` Still, ${[...new Set(acneFlags)].slice(0, 2).join(", ")} may also be worth monitoring for dryness or irritation.` : ""}`
          : "For acne-prone skin, the current dataset does not show clear acne-targeted actives in this formula, so the explanation here is limited.",
    },
    {
      focus: "pregnancy_safe" as const,
      label: getFocusLabel("pregnancy_safe"),
      summary:
        pregnancyFlags.length > 0
          ? `For pregnancy-safe screening, ${[...new Set(pregnancyFlags)].slice(0, 3).join(", ")} deserve extra review because the matched text suggests retinoid or vitamin A derivative language.`
          : "For pregnancy-safe screening, confidence is limited because this dataset is not a dedicated pregnancy-safety database, so this should be treated as a cautious first pass only.",
    },
    {
      focus: "fragrance_free" as const,
      label: getFocusLabel("fragrance_free"),
      summary:
        fragranceFlags.length > 0
          ? `This does not appear fragrance-free in the strict sense because ${[...new Set(fragranceFlags)].slice(0, 3).join(", ")} were matched as fragrance-related ingredients.`
          : "This may be compatible with a fragrance-free preference based on the matched records, but that depends on whether the ingredient list was captured completely.",
    },
  ];

  return notes.filter((note) => requestedFocuses.includes(note.focus));
}

function buildAllergyAlerts(input: ExplanationInput) {
  const allergies = normalizeProfileList(input.profile?.allergies).map((value) => value.toLowerCase());

  if (allergies.length === 0) {
    return [];
  }

  const alerts = input.ingredients.flatMap((ingredient) => {
    const normalizedName = ingredient.name.toLowerCase();
    const normalizedConcerns = normalizeConcernList(ingredient.concerns).map((concern) =>
      concern.toLowerCase()
    );

    const matches = allergies.filter(
      (allergy) =>
        normalizedName.includes(allergy) ||
        allergy.includes(normalizedName) ||
        normalizedConcerns.some((concern) => concern.includes(allergy) || allergy.includes(concern))
    );

    if (matches.length === 0) {
      return [];
    }

    return `${ingredient.name} may be relevant to your profile because it matched: ${[
      ...new Set(matches),
    ].join(", ")}.`;
  });

  return [...new Set(alerts)].slice(0, 5);
}

function buildPersonalizationNote(input: ExplanationInput) {
  if (!input.profile) {
    return null;
  }

  const parts = [];

  if (input.profile.skinType) {
    parts.push(`skin type: ${input.profile.skinType}`);
  }

  const preferences = normalizeProfileList(input.profile.preferences);
  if (preferences.length > 0) {
    parts.push(`preferences: ${preferences.join(", ")}`);
  }

  const allergies = normalizeProfileList(input.profile.allergies);
  if (allergies.length > 0) {
    parts.push(`allergies: ${allergies.join(", ")}`);
  }

  if (parts.length === 0) {
    return null;
  }

  return `Personalized using your profile (${parts.join(" • ")}).`;
}

function buildReasoningFacts(input: ExplanationInput) {
  const flagged = input.ingredients
    .filter((ingredient) => {
      const riskLevel = ingredient.riskLevel.toLowerCase();
      return riskLevel === "high" || riskLevel === "moderate";
    })
    .sort((a, b) => b.riskScore - a.riskScore);

  const fragranceFlags = input.ingredients.filter((ingredient) =>
    /fragrance|parfum|perfume/i.test(
      `${ingredient.name} ${ingredient.category ?? ""} ${normalizeConcernList(ingredient.concerns).join(" ")}`
    )
  );

  const barrierSupport = input.ingredients.filter((ingredient) =>
    /ceramide|glycerin|hyaluronic|panthenol|niacinamide|squalane|cholesterol|betaine/i.test(
      `${ingredient.name} ${ingredient.category ?? ""}`
    )
  );

  const exfoliants = input.ingredients.filter((ingredient) =>
    /salicy|glycolic|lactic|mandelic|acid|bha|aha/i.test(
      `${ingredient.name} ${ingredient.category ?? ""}`
    )
  );

  const retinoids = input.ingredients.filter((ingredient) =>
    /retinol|retinal|retinyl|adapalene|tretinoin/i.test(ingredient.name)
  );

  const preservatives = input.ingredients.filter((ingredient) =>
    /phenoxyethanol|paraben|benzoate|sorbate|preservative/i.test(
      `${ingredient.name} ${ingredient.category ?? ""}`
    )
  );

  const unknownCount = input.ingredients.filter(
    (ingredient) => ingredient.riskLevel.toLowerCase() === "unknown"
  ).length;

  return {
    flagged,
    fragranceFlags,
    barrierSupport,
    exfoliants,
    retinoids,
    preservatives,
    unknownCount,
  };
}

function buildFallbackExplanation(input: ExplanationInput): ProductExplanation {
  const facts = buildReasoningFacts(input);
  const flaggedIngredients = facts.flagged.slice(0, 5);

  const summaryParts = [];

  if (typeof input.score === "number") {
    if (input.color === "green") {
      summaryParts.push(
        `This ingredient list scores ${input.score}, which suggests lower overall concern based on the matched database entries.`
      );
    } else if (input.color === "yellow") {
      summaryParts.push(
        `This ingredient list scores ${input.score}, which suggests a mixed profile with some ingredients worth a closer look.`
      );
    } else {
      summaryParts.push(
        `This ingredient list scores ${input.score}, which suggests several ingredients in higher-concern buckets.`
      );
    }
  } else {
    summaryParts.push(
      "This explanation is based on the matched ingredient records that were available for the scan."
    );
  }

  if (flaggedIngredients.length === 0) {
    summaryParts.push(
      "No moderate- or high-risk ingredients were identified in the current dataset."
    );
  } else {
    summaryParts.push(
      `The main watch-outs are ${flaggedIngredients.map((ingredient) => ingredient.name).join(", ")}.`
    );
  }

  if (facts.barrierSupport.length > 0) {
    summaryParts.push(
      `Supportive ingredients like ${facts.barrierSupport
        .slice(0, 3)
        .map((ingredient) => ingredient.name)
        .join(", ")} help explain the formula's stronger hydration or barrier-support profile.`
    );
  }

  const scoreContext =
    typeof input.score === "number"
      ? "The score reflects the sum of stored ingredient risk scores, so flagged ingredients, fragrance-related signals, and stronger actives pull the score down more quickly."
      : "A product score was not available, so this explanation relies only on the ingredient-level risk data.";

  const recommendation =
    input.color === "red"
      ? "Treat this formula cautiously. The key question is whether the flagged ingredients are acceptable for your own sensitivities and whether the formula's benefits justify those tradeoffs."
      : input.color === "yellow"
        ? "This formula sits in the middle. It may still work for some users, but the caution signals are worth checking before you decide."
        : "Based on the current dataset, this formula looks relatively lower concern overall and may be the easier choice if you want fewer obvious risk signals.";

  const confidenceNote =
    facts.unknownCount > 0
      ? `Confidence is limited because ${facts.unknownCount} ingredient${facts.unknownCount === 1 ? "" : "s"} could not be matched confidently in the database, so some OCR or dataset context may still be missing.`
      : "Confidence is stronger here because the explanation is grounded in the matched ingredient records rather than OCR text alone.";
  const personalizationNote = buildPersonalizationNote(input);
  const allergyAlerts = buildAllergyAlerts(input);
  const reasons = [
    flaggedIngredients.length > 0
      ? `The main score drivers are ${flaggedIngredients
          .slice(0, 3)
          .map((ingredient) => ingredient.name)
          .join(", ")}, which carry the strongest caution signals in the matched data.`
      : "No major flagged ingredients were found in the current dataset, which helps keep the formula in a lower-concern range.",
    facts.fragranceFlags.length > 0
      ? `Fragrance-related signals show up in ${facts.fragranceFlags
          .slice(0, 3)
          .map((ingredient) => ingredient.name)
          .join(", ")}, which matters most for sensitive or allergy-prone users.`
      : "The matched list does not show obvious fragrance-related signals, which may make the formula easier for fragrance-sensitive users.",
    facts.barrierSupport.length > 0
      ? `Supportive ingredients such as ${facts.barrierSupport
          .slice(0, 3)
          .map((ingredient) => ingredient.name)
          .join(", ")} strengthen the hydration or barrier-support side of the formula.`
      : "The matched records do not show many classic hydration or barrier-support ingredients, so the explanation is driven more by caution signals than support ingredients.",
  ];
  const tradeoffs = [
    facts.exfoliants.length > 0
      ? `It includes exfoliant-style ingredients like ${facts.exfoliants
          .slice(0, 2)
          .map((ingredient) => ingredient.name)
          .join(", ")}, which may help some goals but can raise dryness or irritation risk.`
      : null,
    facts.retinoids.length > 0
      ? `Retinoid-style ingredients such as ${facts.retinoids
          .slice(0, 2)
          .map((ingredient) => ingredient.name)
          .join(", ")} increase the need for extra caution, especially in pregnancy-focused screening.`
      : null,
    facts.preservatives.length > 0
      ? `Preservatives like ${facts.preservatives
          .slice(0, 2)
          .map((ingredient) => ingredient.name)
          .join(", ")} are common and useful for stability, but they can still matter for highly reactive users.`
      : null,
  ].filter((value): value is string => Boolean(value));

  return {
    summary: summaryParts.join(" "),
    scoreContext,
    reasons: reasons.slice(0, 5),
    tradeoffs: tradeoffs.slice(0, 4),
    flaggedIngredients: flaggedIngredients.map((ingredient) => ({
      name: ingredient.name,
      reason:
        normalizeConcernList(ingredient.concerns).join(", ") ||
        ingredient.description ||
        ingredient.category ||
        "This ingredient is in a flagged risk bucket in the current database.",
      cautionLevel: getCautionLevel(ingredient.riskLevel, ingredient.riskScore),
    })),
    recommendation,
    confidenceNote,
    personalizationNote,
    allergyAlerts,
    audienceNotes: buildAudienceNotes(input),
    source: "fallback",
  };
}

function extractJsonObject(raw: string) {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model response did not contain a JSON object.");
  }

  return raw.slice(start, end + 1);
}

export async function generateProductExplanation(
  input: ExplanationInput
): Promise<ProductExplanation> {
  const fallback = buildFallbackExplanation(input);
  const facts = buildReasoningFacts(input);

  if (!openai || input.ingredients.length === 0) {
    return fallback;
  }

  const payload = {
    productName: input.productName ?? "This product",
    score: input.score ?? null,
    color: input.color ?? null,
    profile: {
      skinType: input.profile?.skinType ?? null,
      preferences: normalizeProfileList(input.profile?.preferences),
      allergies: normalizeProfileList(input.profile?.allergies),
      prioritizedFocuses: inferProfileFocuses(input.profile),
    },
    ingredients: input.ingredients.map((ingredient) => ({
      name: ingredient.name,
      riskLevel: ingredient.riskLevel,
      riskScore: ingredient.riskScore,
      category: ingredient.category ?? null,
      source: ingredient.source ?? null,
      reviewBucket: ingredient.reviewBucket ?? null,
      concerns: normalizeConcernList(ingredient.concerns),
      description: ingredient.description ?? null,
    })),
    reasoningFacts: {
      flaggedCount: facts.flagged.length,
      fragranceCount: facts.fragranceFlags.length,
      barrierSupportCount: facts.barrierSupport.length,
      exfoliantCount: facts.exfoliants.length,
      retinoidCount: facts.retinoids.length,
      preservativeCount: facts.preservatives.length,
      unknownCount: facts.unknownCount,
      topFlagged: facts.flagged.slice(0, 5).map((ingredient) => ingredient.name),
      topBarrierSupport: facts.barrierSupport.slice(0, 5).map((ingredient) => ingredient.name),
    },
  };

  const prompt = [
    "You are generating a cosmetic ingredient explanation for a consumer app.",
    "Base every claim only on the structured data provided.",
    "Do not invent toxicology, medical effects, or regulatory claims that are not explicitly present.",
    "If the data is limited, say so plainly.",
    "Prefer clear consumer-friendly language.",
    "Explain what is driving the score, what the main tradeoffs are, and who the formula may suit.",
    "Return JSON only with keys: summary, scoreContext, reasons, tradeoffs, flaggedIngredients, recommendation, confidenceNote, personalizationNote, allergyAlerts, audienceNotes.",
    "reasons must be short, concrete statements about what is driving the result.",
    "tradeoffs must be short, concrete statements about downsides, uncertainty, or why some users may still want to review the formula closely.",
    "flaggedIngredients must contain at most 5 items, and each item must have name, reason, and cautionLevel.",
    "Use only the prioritizedFocuses from profile when building audienceNotes. Do not add extra focus values.",
    "For pregnancy_safe, be conservative and explicitly note when the data is insufficient.",
    "If allergies are provided, populate allergyAlerts only when there is a direct text-based match to an ingredient name or concern.",
    "",
    JSON.stringify(payload, null, 2),
  ].join("\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.choices[0]?.message?.content ?? "";
    const parsed = explanationSchema.parse(JSON.parse(extractJsonObject(content)));

    return {
      ...parsed,
      source: "ai",
    };
  } catch (error) {
    console.error("generateProductExplanation failed, using fallback", error);
    return fallback;
  }
}
