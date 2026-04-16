import vision from "@google-cloud/vision";
import { generateProductExplanation } from "@/lib/aiExplanation";
import { extractIngredientCandidates } from "@/lib/parseIngredients";
import { env } from "@/lib/env";
import { getViewerExplanationProfile } from "@/lib/explanationProfile";
import { matchIngredients } from "@/lib/matchIngredients";
import { prisma } from "@/lib/prisma";
import { calculateScore } from "@/lib/scoring";

export const runtime = "nodejs";

type PackagingSignal = {
  status: "match" | "possible_match" | "warning" | "unknown";
  summary: string;
  barcodeCandidates: string[];
  logos: string[];
  matchedProduct: null | {
    id: string;
    name: string;
    brand: string | null;
    category: string | null;
  };
};

function createVisionClient() {
  if (env.GOOGLE_VISION_CREDENTIALS_JSON) {
    let credentials: {
      client_email?: string;
      private_key?: string;
      project_id?: string;
    };

    try {
      credentials = JSON.parse(env.GOOGLE_VISION_CREDENTIALS_JSON) as {
        client_email?: string;
        private_key?: string;
        project_id?: string;
      };
    } catch {
      throw new Error("GOOGLE_VISION_CREDENTIALS_JSON is not valid JSON.");
    }

    if (!credentials.client_email || !credentials.private_key) {
      throw new Error(
        "GOOGLE_VISION_CREDENTIALS_JSON is missing client_email or private_key."
      );
    }

    return new vision.ImageAnnotatorClient({
      credentials: {
        client_email: credentials.client_email,
        private_key: credentials.private_key,
      },
      projectId: credentials.project_id,
    });
  }

  if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    return new vision.ImageAnnotatorClient({
      keyFilename: env.GOOGLE_APPLICATION_CREDENTIALS,
    });
  }

  throw new Error(
    "Configure GOOGLE_VISION_CREDENTIALS_JSON for Vercel or GOOGLE_APPLICATION_CREDENTIALS for local development."
  );
}

function normalizeText(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function extractBarcodeCandidates(text: string) {
  return [...new Set(text.match(/\b\d{8,14}\b/g) ?? [])].slice(0, 5);
}

function extractLabelLines(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^ingredients?/i.test(line))
    .filter((line) => !/^warning|^directions|^how to use/i.test(line))
    .slice(0, 8);
}

async function assessPackagingSignal(
  text: string,
  logos: string[]
): Promise<PackagingSignal> {
  const barcodeCandidates = extractBarcodeCandidates(text);
  const labelLines = extractLabelLines(text);

  if (barcodeCandidates.length > 0) {
    const barcodeMatch = await prisma.product.findFirst({
      where: {
        OR: barcodeCandidates.flatMap((code) => [
          { barcode: `upc:${code}` },
          { barcode: `amazon:${code}` },
        ]),
      },
      select: {
        id: true,
        name: true,
        brand: true,
        category: true,
      },
    });

    if (barcodeMatch) {
      return {
        status: "match",
        summary:
          "Detected a barcode value that matches a product already in your catalog. This is a helpful packaging consistency signal, but not proof of authenticity.",
        barcodeCandidates,
        logos,
        matchedProduct: barcodeMatch,
      };
    }
  }

  const searchTerms = [...logos, ...labelLines]
    .map((term) => term.trim())
    .filter((term) => term.length >= 3)
    .slice(0, 6);

  if (searchTerms.length > 0) {
    const candidates = await prisma.product.findMany({
      where: {
        OR: searchTerms.flatMap((term) => [
          {
            name: {
              contains: term,
              mode: "insensitive",
            },
          },
          {
            brand: {
              contains: term,
              mode: "insensitive",
            },
          },
        ]),
      },
      take: 12,
      select: {
        id: true,
        name: true,
        brand: true,
        category: true,
      },
    });

    const bestCandidate = candidates
      .map((candidate) => {
        const candidateName = normalizeText(candidate.name);
        const candidateBrand = normalizeText(candidate.brand ?? "");

        let score = 0;

        for (const term of searchTerms) {
          const normalizedTerm = normalizeText(term);
          if (!normalizedTerm) continue;

          if (candidateName.includes(normalizedTerm)) score += 2;
          if (candidateBrand && candidateBrand.includes(normalizedTerm)) score += 3;
        }

        for (const logo of logos) {
          const normalizedLogo = normalizeText(logo);
          if (!normalizedLogo) continue;
          if (candidateBrand && candidateBrand.includes(normalizedLogo)) score += 4;
        }

        return { candidate, score };
      })
      .sort((a, b) => b.score - a.score)[0];

    if (bestCandidate && bestCandidate.score >= 4) {
      return {
        status: "possible_match",
        summary:
          "The packaging text or detected logo looks similar to a product in your catalog. This is a soft match only and should be treated as a clue, not a counterfeit verdict.",
        barcodeCandidates,
        logos,
        matchedProduct: bestCandidate.candidate,
      };
    }
  }

  if (barcodeCandidates.length > 0 || logos.length > 0) {
    return {
      status: "warning",
      summary:
        "We found packaging clues like barcode-sized numbers or logos, but could not confidently match them to a catalog product. That may just mean the item is new or missing from your database.",
      barcodeCandidates,
      logos,
      matchedProduct: null,
    };
  }

  return {
    status: "unknown",
    summary:
      "We could not extract enough packaging information to compare this item to your catalog. A clearer front-of-box photo or barcode image would help.",
    barcodeCandidates,
    logos,
    matchedProduct: null,
  };
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const mode = formData.get("mode") === "packaging" ? "packaging" : "ingredients";

    if (!(file instanceof File)) {
      return Response.json({ error: "Image file is required." }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const client = createVisionClient();

    const [[documentResult], [logoResult]] = await Promise.all([
      client.documentTextDetection({
        image: { content: bytes },
      }),
      client.logoDetection({
        image: { content: bytes },
      }),
    ]);

    const text =
      documentResult.fullTextAnnotation?.text ||
      documentResult.textAnnotations?.[0]?.description ||
      "";
    const logos = [...new Set((logoResult.logoAnnotations ?? []).map((logo) => logo.description).filter(Boolean))];

    if (!text.trim()) {
      return Response.json({
        text: "",
        parsedIngredients: [],
        matchedIngredients: [],
        packagingSignal: {
          status: "unknown",
          summary: "No readable text was found in the image.",
          barcodeCandidates: [],
          logos,
          matchedProduct: null,
        },
        source: "google-vision",
      });
    }

    const parsedIngredients = extractIngredientCandidates(text);
    const matchedIngredients = await matchIngredients(parsedIngredients);
    const packagingSignal = await assessPackagingSignal(text, logos);
    const profile = await getViewerExplanationProfile();
    const score =
      mode === "ingredients" && matchedIngredients.length > 0
        ? calculateScore(matchedIngredients)
        : null;
    const explanation =
      mode === "ingredients" && matchedIngredients.length > 0
        ? await generateProductExplanation({
            ingredients: matchedIngredients.map((ingredient) => ({
              name: ingredient.name,
              riskLevel: ingredient.riskLevel,
              riskScore: ingredient.riskScore,
              category: ingredient.category,
              source: ingredient.source,
              concerns: Array.isArray(ingredient.concerns)
                ? ingredient.concerns.filter(
                    (concern): concern is string => typeof concern === "string"
                  )
                : [],
            })),
            score: score?.score ?? null,
            color: score?.color ?? null,
            profile,
          })
        : null;

    return Response.json({
      mode,
      text,
      parsedIngredients: mode === "ingredients" ? parsedIngredients : [],
      matchedIngredients: mode === "ingredients" ? matchedIngredients : [],
      productScore: score,
      explanation,
      packagingSignal,
      source: "google-vision",
      filename: file.name,
    });
  } catch (error) {
    console.error("OCR upload failed", error);

    const message =
      error instanceof Error ? error.message : "Unknown OCR configuration error.";

    return Response.json(
      {
        error:
          env.NODE_ENV === "development"
            ? `OCR scan failed: ${message}`
            : "OCR scan failed. Please verify your Google Vision credentials.",
      },
      { status: 500 }
    );
  }
}
