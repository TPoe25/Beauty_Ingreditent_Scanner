// app/api/scans/upload/route.ts

// API route to handle file uploads and perform text detection using Google Cloud Vision API
import vision from "@google-cloud/vision"

// Create a new Vision client using the Google Cloud Vision API credentials
const client = new vision.ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
})

// API route to handle file uploads and perform text detection using Google Cloud Vision API
export async function POST(req: Request) {
  const formData = await req.formData()
  const file = formData.get("file") as File

  // Read the uploaded file as an array buffer
  const bytes = await file.arrayBuffer()

  // Detect text in the uploaded image using Google Cloud Vision API
  const [result] = await client.textDetection({
    image: { content: Buffer.from(bytes) }
  })

  // Extract the detected text from the response
  const text = result.fullTextAnnotation?.text || ""

  // Return the extracted text as a JSON response
  return Response.json({ text })
}
