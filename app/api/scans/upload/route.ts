// app/api/scans/upload/route.ts

// This function handles the POST request to upload an image and extract the ingredients using OCR. It takes the uploaded image file as input and returns the extracted text.
export async function POST(req: Request) {
  const formData = await req.formData()
  const file = formData.get("file")

  // 🔥 Replace with OCR later
  const fakeExtractedText = "Water, Glycerin, Fragrance"

  // In a real implementation, you would use an OCR library to extract the text from the uploaded image file. For example, you could use Tesseract.js or a similar library to perform OCR on the image and extract the ingredients list.
  return Response.json({
    text: fakeExtractedText
  })
}
