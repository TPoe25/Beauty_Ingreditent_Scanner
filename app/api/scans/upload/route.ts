import vision from "@google-cloud/vision";
import { extractIngredientCandidates } from "@/lib/parseIngredients";
import { matchIngredients } from "@/lib/matchIngredients";

export const runtime = "nodejs";

function createVisionClient() {
  const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!keyFilename) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS is not configured.");
  }

  return new vision.ImageAnnotatorClient({ keyFilename });
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
    return Response.json(
      { error: "OCR scan failed. Please verify your Google Vision credentials." },
      { status: 500 }
    );
  }
}
