import vision from "@google-cloud/vision";
import { extractIngredientCandidates } from "@/lib/parseIngredients";
import { env } from "@/lib/env";
import { matchIngredients } from "@/lib/matchIngredients";

export const runtime = "nodejs";

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

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "Image file is required." }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const client = createVisionClient();
    const [result] = await client.textDetection({
      image: { content: bytes },
    });

    const text = result.fullTextAnnotation?.text || result.textAnnotations?.[0]?.description || "";

    if (!text.trim()) {
      return Response.json({
        text: "",
        parsedIngredients: [],
        matchedIngredients: [],
        source: "google-vision",
      });
    }

    const parsedIngredients = extractIngredientCandidates(text);
    const matchedIngredients = await matchIngredients(parsedIngredients);

    return Response.json({
      text,
      parsedIngredients,
      matchedIngredients,
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
